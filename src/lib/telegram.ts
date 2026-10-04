// Уведомление владельцу о новом скане. Токен/чат — только из окружения
// (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Подписанные ссылки на файлы в
// сообщение НЕ кладём — файлы скачиваются из админки.
export async function notifyNewScan(p: { orderId: string; shoeSize?: string | null; lengthMm?: number; widthMm?: number }): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const adminBase = process.env.ADMIN_ORDER_URL_BASE || 'https://footlub.ru/admin/orders';
  const mm = (v?: number) => (v ? `${Math.round(v)} мм` : '—');
  const text = [
    `Новый скан, заказ ${p.orderId}`,
    `Размер обуви: ${p.shoeSize || '—'}`,
    `Стопа: длина ${mm(p.lengthMm)}, ширина ${mm(p.widthMm)}`,
    `Админка: ${adminBase}/${p.orderId}`,
  ].join('\n');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}`);
}
