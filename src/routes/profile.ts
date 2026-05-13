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

// GET /profile
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, patronymic: true, phone: true, address: true },
    });
    res.json({ profile: user });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    console.error('[profile/get]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /profile
router.put('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { firstName, lastName, patronymic, phone, address } = req.body;

    await prisma.user.update({
      where: { id: userId },
      data: { firstName, lastName, patronymic, phone },
    });

    if (address !== undefined) {
      await prisma.address.upsert({
        where: { userId },
        create: { userId, full: address },
        update: { full: address },
      });
    }

    res.json({ message: 'Профиль сохранён' });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    console.error('[profile/update]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
