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
    res.json({ url: await presignDownload(key, 3600), expiresInSec: 3600 });
  } catch (err: any) {
    if (err.status === 401) return res.status(401).json({ error: 'Не авторизован' });
    if (err.status === 403) return res.status(403).json({ error: 'Нет доступа' });
    console.error('[admin/download-url]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
