import type { Metadata, Viewport } from 'next';
import {
  formatEventDateShort,
  formatEventTime,
  formatPrice,
  getCurrentEvent,
} from '@/lib/data/event';
import { Onest, Unbounded } from 'next/font/google';
import { appUrl } from '@/lib/env';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker';
import './globals.css';

/**
 * Шрифты V3 Mono Signal.
 *
 * Unbounded — дисплейная пара системы: заголовки, числа отсчёта,
 * метки кнопок. Геометрический гротеск с родной кириллицей, что
 * для русского интерфейса обязательное условие, а не пожелание.
 *
 * Onest — весь остальной интерфейс: абзацы, поля, служебные
 * метки в разрядку. Тоже с родной кириллицей.
 *
 * Веса ограничены тем, что реально используется: тянуть полный
 * набор начертаний ради двух вызовов — лишние сотни килобайт на
 * мобильном интернете посреди города.
 */
const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-unbounded',
  display: 'swap',
  fallback: ['Arial Black', 'sans-serif'],
});

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-onest',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

/**
 * Метаданные считаются на запросе, а не лежат константой.
 *
 * В превью для мессенджеров стоит дата и цена, а они живут в
 * `events` и меняются. Константа тут уже один раз соврала: после
 * переноса на 5 сентября в og:description ещё неделю висело
 * «29.08», и ссылка, разосланная в чат, приглашала не на то
 * число.
 *
 * Если база недоступна, дата из описания просто исчезает — текст
 * без даты честнее текста с неверной датой.
 */
export async function generateMetadata(): Promise<Metadata> {
  const event = await getCurrentEvent().catch(() => null);

  const social = event
    ? `Городской фото-квест по центру Лейпцига. ${formatEventDateShort(event)}, ${formatEventTime(event)}, ${formatPrice(event)}.`
    : 'Городской фото-квест по центру Лейпцига.';

  return {
    metadataBase: new URL(appUrl()),
    title: {
      default: 'Движ-Патруль — городской фото-квест',
      template: '%s · Движ-Патруль',
    },
    // Размер команды берётся из базы по той же причине, что и
    // дата: он уже менялся, и вшитое «до четырёх» пережило бы
    // правку в админке незамеченным.
    description:
      `Городской фото-квест по центру Лейпцига: команды до ${event?.team_size ?? 5} человек, ` +
      'десятки фото-заданий, автоматическая проверка и рейтинг в реальном времени.',
    applicationName: 'Движ-Патруль',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Движ-Патруль',
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      // Только растр: кисточный знак вектором не бывает, а рисовать
      // ради вкладки второй, «упрощённый» логотип — это заводить
      // второй логотип.
      icon: [
        { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
    // Ссылку на квест рассылают в мессенджерах, а не набирают
    // руками. Без картинки превью там показывают пустую карточку —
    // приглашение выглядит как спам.
    //
    // Саму картинку рисует app/opengraph-image.tsx: 1200×630 в
    // Mono Signal, без файла-постера. Next подставляет её в
    // openGraph и twitter автоматически, поэтому здесь только текст.
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: 'Движ-Патруль',
      title: 'Движ-Патруль — городской фото-квест',
      description: social,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Движ-Патруль — городской фото-квест',
      description: social,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Масштабирование не запрещаем: это требование доступности.
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#060609',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${onest.variable} ${unbounded.variable}`}>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus: focus:border focus:border-ink focus:bg-panel focus:px-4 focus:py-2"
        >
          Перейти к содержимому
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
