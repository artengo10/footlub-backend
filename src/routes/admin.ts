import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { presignDownload } from '../lib/s3';

// Роли в схеме нет — администраторы задаются списком id пользователей в окружении
// ADMIN_USER_IDS (через запятую). Авторизация — тот же JWT, что у приложения.
const router = Router();

function requireAdmin(req: Request): string {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  let userId: string;
  try {
    userId = (jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { userId: string }).userId;
  } catch {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
  const admins = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!admins.includes(userId)) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return userId;
}

// Имя для скачивания: <почта до @>_<что за файл>_<дата>.<расширение>
function downloadName(email: string | null | undefined, file: string, date: Date, key: string): string {
  const who = (email?.split('@')[0] || 'client').replace(/[^A-Za-z0-9._-]/g, '_');
  const day = date.toISOString().slice(0, 10);
  if (file === 'right') return `${who}_правая_стопа_${day}.stl`;
  if (file === 'left') return `${who}_левая_стопа_${day}.stl`;
  if (file === 'raw') return `${who}_данные_скана_${day}.json`;
  const step = file.slice(6) || key.split('/').pop() || 'photo';
  return `${who}_фото_${step}_${day}.jpg`;
}

// GET /admin/scans/:id/download-url?file=right|left|raw|photo:<step>
// Подписанная GET-ссылка на 1 час на файл скана (бакет приватный).
router.get('/scans/:id/download-url', async (req: Request, res: Response) => {
  try {
    requireAdmin(req);
    const scan = await prisma.footScan.findUnique({ where: { id: req.params.id } });
    if (!scan) return res.status(404).json({ error: 'Скан не найден' });
    const file = String(req.query.file || 'right');
    let key: string | null | undefined;
    if (file === 'right') key = scan.rightStlKey;
    else if (file === 'left') key = scan.leftStlKey;
    else if (file === 'raw') key = scan.rawDataKey;
    else if (file.startsWith('photo:')) key = scan.photoKeys.find((k) => k.endsWith(`/photos/${file.slice(6)}.jpg`));
    if (!key) return res.status(404).json({ error: 'Файл не найден' });
    const owner = await prisma.user.findUnique({ where: { id: scan.userId }, select: { email: true } });
    const filename = downloadName(owner?.email, file, scan.stlUploadedAt ?? new Date(), key);
    res.json({ url: await presignDownload(key, 3600, filename), expiresInSec: 3600 });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    if (err.status === 403) return res.status(403).json({ error: 'Нет доступа' });
    console.error('[admin/download-url]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /admin/orders — последние заказы со статусом скана (ссылок на файлы здесь нет).
router.get('/orders', async (req: Request, res: Response) => {
  try {
    requireAdmin(req);
    const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    const scans = await prisma.footScan.findMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(orders.map((o) => o.userId))] } },
      select: { id: true, email: true },
    });
    const emailById = new Map(users.map((u) => [u.id, u.email]));
    const scanByOrder = new Map(scans.map((s) => [s.orderId, s]));
    res.json({
      orders: orders.map((o) => {
        const s = scanByOrder.get(o.id);
        return {
          id: o.id,
          createdAt: o.createdAt,
          status: o.status,
          email: emailById.get(o.userId) ?? null,
          shoeSize: o.shoeSize,
          insoleType: o.insoleType,
          price: o.price,
          scan: s
            ? {
                id: s.id,
                right: !!s.rightStlKey,
                left: !!s.leftStlKey,
                raw: !!s.rawDataKey,
                photos: s.photoKeys.length,
                lengthMm: s.lengthMm,
                widthMm: s.widthMm,
                uploadedAt: s.stlUploadedAt,
              }
            : null,
        };
      }),
    });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    if (err.status === 403) return res.status(403).json({ error: 'Нет доступа' });
    console.error('[admin/orders]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
