import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const router = Router();

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

export default router;
