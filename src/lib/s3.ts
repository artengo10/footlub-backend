import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost, PresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Yandex Object Storage (S3-совместимо). Бакет ПРИВАТНЫЙ: в БД храним только ключи
// объектов, доступ к файлам — только по подписанным ссылкам с ограниченным сроком.
// Значения переменных окружения задаются на сервере, в репозитории их нет.
const s3 = new S3Client({
  region: process.env.YC_S3_REGION || 'ru-central1',
  endpoint: process.env.YC_S3_ENDPOINT || 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: process.env.YC_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.YC_S3_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true,
});

function bucket(): string {
  const b = process.env.YC_S3_BUCKET;
  if (!b) throw new Error('YC_S3_BUCKET не задан — Object Storage не сконфигурирован');
  return b;
}

/** Подписанный POST (HTML-form upload) с политикой content-length-range — клиент
 * грузит файл напрямую в бакет, минуя сервер (RAM VPS ~1 ГБ, сканы 15–30 МБ).
 * Yandex Object Storage поддерживает POST-загрузку с policy (S3-совместимо). */
export async function presignUpload(key: string, contentType: string, maxBytes: number, expiresSec = 900): Promise<PresignedPost> {
  return createPresignedPost(s3, {
    Bucket: bucket(),
    Key: key,
    Conditions: [['content-length-range', 1, maxBytes], ['eq', '$Content-Type', contentType]],
    Fields: { 'Content-Type': contentType },
    Expires: expiresSec,
  });
}

/** Размер объекта или null, если его нет (HeadObject). */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return r.ContentLength ?? 0;
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return null;
    throw err;
  }
}

/** Подписанная GET-ссылка (по умолчанию 1 час) — только для админа.
 * filename — имя, с которым файл скачается в браузере (сам объект в бакете не переименовывается). */
export async function presignDownload(key: string, expiresSec = 3600, filename?: string): Promise<string> {
  const disposition = filename ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` : undefined;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: expiresSec },
  );
}
