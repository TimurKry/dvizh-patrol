import type { Metadata, Viewport } from 'next';
import { Onest, Unbounded } from 'next/font/google';
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Движ-Патруль — городской фото-квест',
    template: '%s · Движ-Патруль',
  },
  description:
    'Городской фото-квест по центру Лейпцига: команды до четырёх человек, ' +
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
    description: 'Городской фото-квест по центру Лейпцига. 29.08, 14:00, 15 €.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Движ-Патруль — городской фото-квест',
    description: 'Городской фото-квест по центру Лейпцига. 29.08, 14:00, 15 €.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
