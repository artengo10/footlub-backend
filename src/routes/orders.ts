import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { presignUpload, objectSize } from '../lib/s3';
import { notifyNewScan } from '../lib/telegram';

const router = Router();

function getUserId(req: Request): string {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  // Просроченный/чужой токен — 401, а не 500 (раньше клиент видел «Ошибка сервера»
  // вместо экрана входа).
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { userId: string };
    return payload.userId;
  } catch {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
}

// Разрешённые файлы скана и их лимиты. Загрузка идёт НАПРЯМУЮ в приватный бакет
// по подписанному POST (сервер не держит файлы в памяти — RAM VPS ~1 ГБ).
const PHOTO_STEPS = ['right-bottom', 'right-inner', 'right-outer', 'left-bottom', 'left-inner', 'left-outer'];
const MB = 1024 * 1024;
function scanFileSpec(orderId: string): Record<string, { key: string; contentType: string; maxBytes: number }> {
  const base = `scans/${orderId}`;
  const spec: Record<string, { key: string; contentType: string; maxBytes: number }> = {
    right: { key: `${base}/right.stl`, contentType: 'model/stl', maxBytes: 20 * MB },
    left: { key: `${base}/left.stl`, contentType: 'model/stl', maxBytes: 20 * MB },
    raw: { key: `${base}/raw.json`, contentType: 'application/json', maxBytes: 60 * MB },
  };
  for (const step of PHOTO_STEPS) {
    spec[`photo:${step}`] = { key: `${base}/photos/${step}.jpg`, contentType: 'image/jpeg', maxBytes: 5 * MB };
  }
  return spec;
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
    if ((err as any)?.status === 401) return res.status(401).json({ error: 'Не авторизован' });
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
    if ((err as any)?.status === 401) return res.status(401).json({ error: 'Не авторизован' });
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
    if ((err as any)?.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /orders/:id/scan/upload-urls
// Подписанные POST-ссылки (~15 мин, content-length-range) на файлы скана этого заказа.
// Тело: { files?: string[] } — подмножество ключей scanFileSpec (по умолчанию все).
router.post('/:id/scan/upload-urls', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId } });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const spec = scanFileSpec(order.id);
    const wanted: string[] = Array.isArray(req.body?.files) ? req.body.files : Object.keys(spec);
    const uploads: Record<string, unknown> = {};
    for (const name of wanted) {
      const f = spec[name];
      if (!f) continue;
      uploads[name] = { key: f.key, maxBytes: f.maxBytes, ...(await presignUpload(f.key, f.contentType, f.maxBytes, 900)) };
    }
    res.json({ expiresInSec: 900, uploads });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    console.error('[orders/scan/upload-urls]', err);
    res.status(500).json({ error: 'Не удалось подготовить загрузку' });
  }
});

// POST /orders/:id/scan/complete
// Тело: { files: string[], measurements?: {...} }. Каждый заявленный файл проверяется
// через HeadObject; в БД пишется ТОЛЬКО то, что реально лежит в бакете.
router.post('/:id/scan/complete', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId } });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const spec = scanFileSpec(order.id);
    const claimed: string[] = Array.isArray(req.body?.files) ? req.body.files : [];
    const present: string[] = [];
    for (const name of claimed) {
      const f = spec[name];
      if (!f) continue;
      const size = await objectSize(f.key);
      if (size !== null && size > 0 && size <= f.maxBytes) present.push(name);
    }
    if (present.length === 0) return res.status(400).json({ error: 'Файлы скана не найдены в хранилище' });

    const m = req.body?.measurements ?? null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const data = {
      rightStlKey: present.includes('right') ? spec.right.key : undefined,
      leftStlKey: present.includes('left') ? spec.left.key : undefined,
      rawDataKey: present.includes('raw') ? spec.raw.key : undefined,
      photoKeys: present.filter((n) => n.startsWith('photo:')).map((n) => spec[n].key),
      lengthMm: num(m?.lengthMM),
      widthMm: num(m?.widthMM),
      archHeightMm: num(m?.archHeightMM),
      measurements: m ?? undefined,
      stlUploadedAt: new Date(),
    };
    const scan = await prisma.footScan.upsert({
      where: { orderId: order.id },
      update: data,
      create: { userId, orderId: order.id, ...data },
    });

    // Уведомление — без подписанных ссылок на файлы; сбой Telegram не ломает ответ.
    notifyNewScan({ orderId: order.id, shoeSize: order.shoeSize, lengthMm: data.lengthMm, widthMm: data.widthMm })
      .catch((e) => console.error('[telegram]', e));

    res.json({ ok: true, scanId: scan.id, stored: present });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    console.error('[orders/scan/complete]', err);
    res.status(500).json({ error: 'Не удалось подтвердить загрузку скана' });
  }
});

export default router;
