import Link from 'next/link';
import { DotCluster } from '@/components/ui/logo';
import { TELEGRAM_MANAGER, TELEGRAM_MANAGER_URL } from '@/lib/links';

/**
 * Подвал · Figma 85:17…85:25.
 *
 * Знак и контакт менеджера слева, служебные ссылки справа,
 * копирайт отдельной строкой под волосяной линией.
 */

const LINKS = [
  { href: '/rules', label: 'Правила' },
  { href: '/privacy', label: 'Конфиденциальность' },
  { href: '/terms', label: 'Условия участия' },
  { href: '/leaderboard', label: 'Рейтинг' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="page-well flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-3">
          <DotCluster size={32} />
          <p className="font-display text-caption font-semibold uppercase">Движ-Патруль</p>
          <a
            href={TELEGRAM_MANAGER_URL}
            target="_blank"
            rel="noreferrer"
            className="signal-label underline-slide w-fit text-micro text-ink hover:text-signal"
          >
            Менеджер · @{TELEGRAM_MANAGER}
          </a>
          <p className="signal-label text-micro text-muted">Leipzig · Germany</p>
        </div>

        <nav aria-label="Дополнительные ссылки">
          <ul className="flex flex-col gap-3 md:items-end">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-[32px] items-center text-caption text-muted hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="page-well flex flex-col gap-2 border-t border-hairline py-5">
        <p className="text-caption text-faint">
          Фотографии участников хранятся в закрытом хранилище и используются только для
          подтверждения заданий. Публикация в социальных сетях — по отдельному согласию.
        </p>
        <p className="signal-label text-micro text-faint">© Движ Патруль</p>
      </div>
    </footer>
  );
}
