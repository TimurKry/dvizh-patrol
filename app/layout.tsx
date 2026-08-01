import type { Metadata, Viewport } from 'next';
import { Literata } from 'next/font/google';
import './globals.css';

/**
 * Шрифт.
 *
 * DESIGN (1).md называет cosmosOracle, а запасным вариантом —
 * Fraunces. Fraunces не содержит кириллицы, а весь интерфейс
 * русскоязычный, поэтому взята Literata: вариативная, с полным
 * кириллическим набором и осью веса, покрывающей фирменные 350.
 * Подробности и обоснование — в docs/DESIGN_SYSTEM.md.
 */
const literata = Literata({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
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
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Движ-Патруль',
    title: 'Движ-Патруль — городской фото-квест',
    description: 'Городской фото-квест по центру Лейпцига.',
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
  themeColor: '#f7f5f3',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={literata.variable}>
      <body className="min-h-dvh bg-linen-canvas text-ink-black antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[12px] focus:border focus:border-ink-black focus:bg-paper-white focus:px-4 focus:py-2"
        >
          Перейти к содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
