/**
 * Seed script — заполняет базу данных статьями.
 * Запуск: npx ts-node src/seed-posts.ts
 * Нужна переменная окружения CONTENT_API_KEY (совпадает с x-api-key в /posts)
 */
import dotenv from 'dotenv';
dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const API_KEY = process.env.CONTENT_API_KEY;

if (!API_KEY) {
  console.error('❌ CONTENT_API_KEY не задан в .env');
  process.exit(1);
}

const posts = [
  {
    slug: 'stelki-pri-ploskostopii',
    title: 'Стельки при плоскостопии: помогают ли они и какие выбрать',
    excerpt: 'Плоскостопие есть у каждого второго. Разбираем, как работают стельки, когда они реально помогают и на что смотреть при выборе для спорта.',
    category: 'здоровье',
    readTime: 5,
    date: '2026-05-01',
    content: '<p>Плоскостопие — одна из самых распространённых проблем стопы у взрослых.</p>',
  },
  {
    slug: 'stelki-dlya-bega',
    title: 'Стельки для бега: почему индивидуальные лучше стандартных',
    excerpt: 'За год бегун делает миллионы шагов. Разбираем, как стелька влияет на нагрузку на колени.',
    category: 'бег',
    readTime: 4,
    date: '2026-04-28',
    content: '<p>Бегун за год делает миллионы шагов.</p>',
  },
  {
    slug: 'skanirovaniye-stopy-iphone',
    title: 'Как работает сканирование стопы через iPhone за 30 секунд',
    excerpt: 'Раньше для индивидуальных стелек нужна была клиника и гипсовый слепок. FootLub делает то же самое за 30 секунд.',
    category: 'стельки',
    readTime: 3,
    date: '2026-04-20',
    content: '<p>Раньше для изготовления индивидуальных стелек нужно было идти к ортопеду.</p>',
  },
  {
    slug: 'pyatochnaya-shpora-kak-izbavitsya',
    title: 'Пяточная шпора: почему болит и как избавиться без операции',
    excerpt: 'Пяточная шпора встречается у каждого десятого. Разбираем, что это на самом деле и какие методы реально работают.',
    category: 'боль',
    readTime: 6,
    date: '2026-05-05',
    content: '<p>Пяточная шпора — это костный нарост на подошвенной поверхности пяточной кости.</p>',
  },
  {
    slug: 'bolyat-nogi-posle-raboty-stoya',
    title: 'Болят ноги после работы стоя: причины и как помочь себе',
    excerpt: 'Продавцы, учителя, хирурги, повара — все, кто проводит смену на ногах, знают эту боль.',
    category: 'здоровье',
    readTime: 5,
    date: '2026-05-03',
    content: '<p>По данным исследований, более 40% людей, работающих стоя, страдают от хронической боли в ногах.</p>',
  },
  {
    slug: 'kostochka-na-noge-valgus',
    title: 'Косточка на ноге: почему появляется и как замедлить прогрессирование',
    excerpt: 'Вальгусная деформация большого пальца есть у 60% взрослых. Разбираем, почему она растёт и что реально помогает без хирургии.',
    category: 'боль',
    readTime: 5,
    date: '2026-05-07',
    content: '<p>Косточка на большом пальце ноги — это вальгусная деформация первого плюснефалангового сустава.</p>',
  },
  {
    slug: 'podoshvennyy-fasciit',
    title: 'Подошвенный фасциит: почему болит стопа утром и как лечить',
    excerpt: 'Острая боль при первых шагах после сна — классичный симптом подошвенного фасциита.',
    category: 'боль',
    readTime: 5,
    date: '2026-05-09',
    content: '<p>Подошвенный фасциит — воспаление плантарной фасции.</p>',
  },
];

async function seed() {
  console.log(`🌱 Сидирование ${posts.length} статей в ${BACKEND_URL}...\n`);
  let ok = 0;
  let skip = 0;

  for (const post of posts) {
    const res = await fetch(`${BACKEND_URL}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY!,
      },
      body: JSON.stringify(post),
    });

    if (res.status === 409) {
      console.log(`⏭  Пропущено (уже есть): ${post.slug}`);
      skip++;
    } else if (res.ok) {
      console.log(`✅ Добавлено: ${post.slug}`);
      ok++;
    } else {
      const err = await res.json().catch(() => ({}));
      console.error(`❌ Ошибка (${post.slug}):`, err);
    }
  }

  console.log(`\nГотово: добавлено ${ok}, пропущено ${skip}`);
}

seed().catch(console.error);
