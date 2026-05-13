import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

export async function sendOtpEmail(to: string, code: string) {
  const isDev = process.env.NODE_ENV !== 'production';

  // Always log in dev so you can test without email
  if (isDev) {
    console.log(`\n📬 OTP for ${to}: \x1b[33m${code}\x1b[0m\n`);
  }

  try {
    await transporter.sendMail({
      from: `"FootLub" <${process.env.GMAIL_USER}>`,
      to,
      subject: `Твой код подтверждения: ${code}`,
      text: `Код FootLub: ${code}\n\nДействует 10 минут. Никому не сообщай этот код.`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 420px; margin: 0 auto; padding: 32px;">
          <h2 style="margin: 0 0 8px; color: #0D0D0D; font-size: 28px; font-weight: 800;">FootLub</h2>
          <p style="color: #888; margin: 0 0 32px;">Персональные спортивные стельки</p>
          <p style="color: #333; margin: 0 0 16px;">Твой код подтверждения:</p>
          <div style="background: #0D0D0D; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px; font-weight: 800; color: #C9FF40; letter-spacing: 10px;">${code}</span>
          </div>
          <p style="color: #888; font-size: 13px; margin: 0;">Код действует 10 минут. Никому не сообщай его.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email] Не удалось отправить письмо:', (err as Error).message);
    if (!isDev) throw err; // In production — propagate so we know about it
    // In dev — swallow the error, OTP is already in the console
  }
}
