import Link from 'next/link';
import { DotCluster } from '@/components/ui/logo';

const LINKS = [
  { href: '/rules', label: 'Правила' },
  { href: '/privacy', label: 'Конфиденциальность' },
  { href: '/terms', label: 'Условия участия' },
  { href: '/leaderboard', label: 'Рейтинг' },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-hairline">
      <div className="page-well flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <DotCluster size={20} />
          <p className="text-body font-medium">Движ-Патруль</p>
          <p className="max-w-xs text-caption text-stone">
            Городской фото-квест. Лейпциг, Германия.
          </p>
        </div>

        <nav aria-label="Дополнительные ссылки">
          <ul className="flex flex-col gap-2 md:items-end">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-caption text-stone hover:text-ink-black">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="page-well border-t border-hairline py-5">
        <p className="text-caption text-pebble">
          Фотографии участников хранятся в закрытом хранилище и используются только для
          подтверждения заданий. Публикация в социальных сетях — по отдельному согласию.
        </p>
      </div>
    </footer>
  );
}
