import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const requireApiKey = (req: Request, res: Response, next: Function) => {
  const key = req.headers['x-api-key'];
  if (key !== process.env.CONTENT_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

// GET /posts — список статей с поиском, фильтром, сортировкой
router.get('/', async (req: Request, res: Response) => {
  const { search, category, sort = 'newest', limit = '20', offset = '0' } = req.query;

  const where: any = { published: true };
  if (search) where.OR = [
    { title: { contains: String(search), mode: 'insensitive' } },
    { excerpt: { contains: String(search), mode: 'insensitive' } },
  ];
  if (category) where.category = String(category);

  const orderBy = sort === 'oldest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy,
      take: Number(limit),
      skip: Number(offset),
      select: { id: true, slug: true, title: true, excerpt: true, imageUrl: true, category: true, readTime: true, createdAt: true },
    }),
    prisma.post.count({ where }),
  ]);

  res.json({ posts, total });
});

// GET /posts/rss — RSS лента для Яндекс Дзен
router.get('/rss', async (_req: Request, res: Response) => {
  const posts = await prisma.post.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const items = posts.map((p) => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>https://footlub.ru/blog/${p.slug}</link>
      <guid>https://footlub.ru/blog/${p.slug}</guid>
      <description><![CDATA[${p.excerpt}]]></description>
      <content:encoded><![CDATA[${p.content}]]></content:encoded>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      ${p.category ? `<category>${p.category}</category>` : ''}
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>FootLub — Блог о здоровье стоп</title>
    <link>https://footlub.ru/blog</link>
    <description>Советы по выбору стелек, здоровью стоп и спорту</description>
    <language>ru</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.send(xml);
});

// GET /posts/:slug — одна статья
router.get('/:slug', async (req: Request, res: Response) => {
  const post = await prisma.post.findUnique({ where: { slug: req.params.slug } });
  if (!post || !post.published) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(post);
});

// POST /posts — создать статью (только с API ключом)
router.post('/', requireApiKey, async (req: Request, res: Response) => {
  const { slug, title, excerpt, content, imageUrl, category, readTime } = req.body;
  if (!slug || !title || !excerpt || !content) {
    res.status(400).json({ error: 'slug, title, excerpt, content обязательны' });
    return;
  }
  try {
    const post = await prisma.post.create({
      data: { slug, title, excerpt, content, imageUrl, category, readTime: readTime || 5 },
    });
    res.status(201).json(post);
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Статья с таким slug уже существует' });
      return;
    }
    throw err;
  }
});

// DELETE /posts/:slug — удалить статью
router.delete('/:slug', requireApiKey, async (req: Request, res: Response) => {
  await prisma.post.delete({ where: { slug: req.params.slug } });
  res.json({ ok: true });
});

export default router;
