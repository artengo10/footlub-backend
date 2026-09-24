import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { uploadObject } from '../lib/s3';

const router = Router();
// Файлы в памяти (не на диск) — STL на одну стопу максимум единицы МБ, это
// проксирующий роут (клиент -> наш сервер -> Yandex Object Storage), не нужен
// стриминг на диск для такого объёма. Лимит с запасом под особо детальные меши.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function getUserId(req: Request): string {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { userId: string };
  return payload.userId;
}

// POST /orders
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const {
      category, insoleType, pairs, shoeSize, insoleSize,
      footLength, heelLift, price,
      contactName, contactPhone, deliveryAddress,
    } = req.body;

    const order = await prisma.order.create({
      data: {
        userId, category, insoleType,
        pairs: Number(pairs) || 1,
        shoeSize, insoleSize, footLength,
        heelLift: Number(heelLift) || 0,
        price: Number(price) || 0,
        contactName, contactPhone, deliveryAddress,
        // V1: оплата ручная, без платёжного шлюза — "нажал оформить — оплачено".
        // Владелец лично проверяет заказы и договаривается об оплате отдельно.
        status: 'CONFIRMED',
      },
    });

    res.json({ order });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    console.error('[orders/create]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    console.error('[orders/list]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /orders/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    res.json({ order });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    console.error('[orders/get]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /orders/:id/scan
// Принимает готовый STL по каждой стопе (строятся НА УСТРОЙСТВЕ, см.
// modules/foot-mesh-viewer в footlab-app) + сырые данные скана целиком (все 8
// шагов) одним запросом. Проксирует в Yandex Object Storage — сервер не
// занимается сборкой меша, только хранением готового файла.
router.post(
  '/:id/scan',
  upload.fields([{ name: 'right', maxCount: 1 }, { name: 'left', maxCount: 1 }]),
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const order = await prisma.order.findFirst({ where: { id: req.params.id, userId } });
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });

      const files = req.files as { right?: Express.Multer.File[]; left?: Express.Multer.File[] } | undefined;
      const raw = req.body?.raw as string | undefined;
      const keys: { rightStlKey?: string; leftStlKey?: string; rawDataKey?: string } = {};

      if (files?.right?.[0]) {
        keys.rightStlKey = `scans/${order.id}/right.stl`;
        await uploadObject(keys.rightStlKey, files.right[0].buffer, 'model/stl');
      }
      if (files?.left?.[0]) {
        keys.leftStlKey = `scans/${order.id}/left.stl`;
        await uploadObject(keys.leftStlKey, files.left[0].buffer, 'model/stl');
      }
      if (raw) {
        keys.rawDataKey = `scans/${order.id}/raw.json`;
        await uploadObject(keys.rawDataKey, Buffer.from(raw, 'utf-8'), 'application/json');
      }

      await prisma.footScan.upsert({
        where: { orderId: order.id },
        update: { ...keys, stlUploadedAt: new Date() },
        create: { userId, orderId: order.id, ...keys, stlUploadedAt: new Date() },
      });

      res.json({ ok: true, ...keys });
    } catch (err: any) {
      if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
      console.error('[orders/scan]', err);
      res.status(500).json({ error: 'Не удалось сохранить скан' });
    }
  }
);

export default router;
