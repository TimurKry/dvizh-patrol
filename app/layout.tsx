import type { Metadata, Viewport } from 'next';
import { Literata, Oswald } from 'next/font/google';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker';
import './globals.css';

/**
 * Шрифты.
 *
 * Постер построен на двух вещах: узком плакатном гротеске в
 * капители («LEIPZIG», «ДВИЖ ПАТРУЛЬ», «ДАТА / СТАРТ / УЧАСТИЕ»)
 * и тёплой кремовой бумаге. Первое воспроизводит Oswald —
 * ближайший свободный узкий гротеск с полной кириллицей.
 *
 * Читаемый текст остаётся серифным: Literata, вариативная,
 * с кириллицей и осью веса, покрывающей фирменные 350.
 * Обоснование обеих замен — в docs/DESIGN_SYSTEM.md.
 */
const oswald = Oswald({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
  fallback: ['PT Sans Narrow', 'Arial Narrow', 'sans-serif'],
});

const literata = Literata({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-literata',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
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
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // Ссылку на квест рассылают в мессенджерах, а не набирают
  // руками. Без картинки превью там показывают пустую карточку —
  // приглашение выглядит как спам. 1200×630 — размер, который
  // одинаково понимают Telegram, WhatsApp и всё остальное.
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Движ-Патруль',
    title: 'Движ-Патруль — городской фото-квест',
    description: 'Городской фото-квест по центру Лейпцига. 15.08, 15:00, 15 €.',
    images: [
      {
        url: '/assets/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Движ-Патруль — городской фото-квест, Лейпциг, 15.08 в 15:00',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Движ-Патруль — городской фото-квест',
    description: 'Городской фото-квест по центру Лейпцига. 15.08, 15:00, 15 €.',
    images: ['/assets/og-image.jpg'],
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
  themeColor: '#f0dbc9',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${literata.variable} ${oswald.variable}`}>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[12px] focus:border focus:border-ink focus:bg-paper focus:px-4 focus:py-2"
        >
          Перейти к содержимому
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
