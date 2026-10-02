/*
 * Service worker.
 *
 * Задача — пережить плохую связь на улице, а не работать офлайн
 * целиком. Квест по своей природе онлайновый: отправка фотографии
 * требует сети.
 *
 * Что кэшируется:
 *   · оболочка приложения и статика — cache first;
 *   · страницы — network first с откатом на кэш, потом на /offline;
 *   · эталонные изображения — stale-while-revalidate.
 *
 * Что НЕ кэшируется никогда:
 *   · /api/* — отправки, подтверждения, экспорт;
 *   · /admin/* — админка должна показывать только свежие данные;
 *   · запросы к Supabase.
 *
 * Баллы и статусы отправок из кэша не показываются как актуальные:
 * страница со статусом всегда сначала идёт в сеть.
 */

// Версию поднимаем при смене состава SHELL_ASSETS: старый кэш
// держит уже удалённый /icon.svg, и `cache.addAll` на нём падает
// целиком — установка воркера срывается, а вместе с ней офлайн.
const VERSION = 'v2';
const SHELL_CACHE = `dvizh-shell-${VERSION}`;
const PAGE_CACHE = `dvizh-pages-${VERSION}`;
const IMAGE_CACHE = `dvizh-images-${VERSION}`;

const SHELL_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/favicon-48.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheable(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/admin')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!isCacheable(request, url)) return;

  // Статика Next: имена содержат хэш, поэтому cache first безопасен.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Картинки: показываем из кэша сразу, обновляем в фоне.
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
    return;
  }

  // Страницы: сначала сеть — статус отправки не должен быть
  // вчерашним. Кэш и /offline только как запасной путь.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match('/offline');
          return (
            offline ??
            new Response('Нет соединения', {
              status: 503,
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            })
          );
        }),
    );
  }
});

// Освежить кэш по команде страницы.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
