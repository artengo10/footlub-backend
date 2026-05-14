import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(to: string, code: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n📬 OTP for ${to}: \x1b[33m${code}\x1b[0m\n`);
    return;
  }

  const { error } = await resend.emails.send({
    from: 'FootLub <noreply@footlub.ru>',
    to,
    subject: `Твой код подтверждения: ${code}`,
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

  if (error) {
    console.error('[email] Resend error:', error);
    throw new Error(error.message);
  }
}
