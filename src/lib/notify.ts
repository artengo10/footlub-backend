import { Resend } from 'resend';

// Почта, а не Telegram: VPS не достучивается до api.telegram.org.
export async function notifyNewScan(p: { orderId: string; shoeSize?: string | null; lengthMm?: number; widthMm?: number }): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  const adminBase = process.env.ADMIN_ORDER_URL_BASE || 'https://footlub.ru/admin/orders';
  const mm = (v?: number) => (v ? `${Math.round(v)} мм` : '—');
  const text = [
    `Новый заказ с оплатой и загруженным сканом: ${p.orderId}`,
    `Размер обуви: ${p.shoeSize || '—'}`,
    `Стопа: длина ${mm(p.lengthMm)}, ширина ${mm(p.widthMm)}`,
    `Админка: ${adminBase}/${p.orderId}`,
  ].join('\n');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: 'FootLub <noreply@footlub.ru>',
    to,
    subject: `Новый заказ с оплатой и сканом: ${p.orderId}`,
    text,
  });
  if (error) throw new Error(error.message);
}
