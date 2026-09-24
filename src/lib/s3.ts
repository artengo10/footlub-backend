import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Yandex Object Storage — S3-совместимо, тот же клиент, что и для AWS, просто
// другой endpoint. Креды/бакет придут позже (владелец продукта) — до этого
// вызовы uploadObject() будут падать с понятной ошибкой авторизации, роут
// в orders.ts должен ловить это и не блокировать уже созданный/оплаченный заказ.
const s3 = new S3Client({
  region: process.env.YC_S3_REGION || 'ru-central1',
  endpoint: process.env.YC_S3_ENDPOINT || 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: process.env.YC_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.YC_S3_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true, // рекомендуется для S3-совместимых сторонних эндпоинтов
});

const BUCKET = process.env.YC_S3_BUCKET || '';

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!BUCKET) {
    throw new Error('YC_S3_BUCKET не задан — Object Storage ещё не сконфигурирован');
  }
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}
