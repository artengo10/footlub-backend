import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { sendOtpEmail } from '../services/email';

const router = Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /auth/register
// Создаёт неверифицированного юзера и отправляет OTP.
// В БД попадает только после /auth/verify.
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.verified) {
      return res.status(400).json({ error: 'Email уже зарегистрирован' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (existing) {
      await prisma.user.update({ where: { email }, data: { password: passwordHash } });
    } else {
      await prisma.user.create({ data: { email, password: passwordHash, verified: false } });
    }

    // Удаляем старые неиспользованные коды
    await prisma.otpCode.deleteMany({ where: { email, used: false } });

    const code = generateOtp();
    await prisma.otpCode.create({
      data: { email, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    await sendOtpEmail(email, code);

    res.json({ message: 'Код отправлен на почту' });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /auth/verify
// Подтверждает код — только после этого юзер считается созданным (verified: true).
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body as { email?: string; code?: string };

    if (!email || !code) {
      return res.status(400).json({ error: 'Email и код обязательны' });
    }

    const otp = await prisma.otpCode.findFirst({
      where: { email, used: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Код не найден или уже использован' });
    }
    if (new Date() > otp.expiresAt) {
      return res.status(400).json({ error: 'Код истёк — запроси новый' });
    }
    if (otp.attempts >= 5) {
      return res.status(400).json({ error: 'Слишком много попыток — запроси новый код' });
    }
    if (otp.code !== code) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ error: 'Неверный код' });
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });

    // Только теперь юзер становится активным в БД
    const user = await prisma.user.update({ where: { email }, data: { verified: true } });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('[verify]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.verified) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /auth/resend
router.post('/resend', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Email не найден' });

    await prisma.otpCode.deleteMany({ where: { email, used: false } });

    const code = generateOtp();
    await prisma.otpCode.create({
      data: { email, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    await sendOtpEmail(email, code);
    res.json({ message: 'Код отправлен' });
  } catch (err) {
    console.error('[resend]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.verified) {
      return res.json({ message: 'Если email зарегистрирован, код отправлен' });
    }

    await prisma.otpCode.deleteMany({ where: { email, used: false } });
    const code = generateOtp();
    await prisma.otpCode.create({
      data: { email, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await sendOtpEmail(email, code);

    res.json({ message: 'Если email зарегистрирован, код отправлен' });
  } catch (err) {
    console.error('[forgot-password]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body as {
      email?: string; code?: string; newPassword?: string;
    };

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    }

    const otp = await prisma.otpCode.findFirst({
      where: { email, used: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) return res.status(400).json({ error: 'Код не найден или уже использован' });
    if (new Date() > otp.expiresAt) return res.status(400).json({ error: 'Код истёк — запроси новый' });
    if (otp.attempts >= 5) return res.status(400).json({ error: 'Слишком много попыток' });
    if (otp.code !== code) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ error: 'Неверный код' });
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { email }, data: { password: passwordHash } });

    res.json({ message: 'Пароль изменён' });
  } catch (err) {
    console.error('[reset-password]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /auth/change-password — требует Bearer-токен
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Не авторизован' });
    }

    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { userId: string };
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string; newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль минимум 6 символов' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) return res.status(400).json({ error: 'Неверный текущий пароль' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: passwordHash } });

    res.json({ message: 'Пароль изменён' });
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Недействительный токен' });
    console.error('[change-password]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
