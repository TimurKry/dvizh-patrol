'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * Нижняя навигация для вошедшей команды.
 *
 * Появляется только на командных страницах и только на мобильном.
 * Монохромная, пять пунктов, зона нажатия во всю высоту панели —
 * квест проходят одной рукой на ходу. Пять — предел: на узком
 * телефоне шестой пункт ужал бы подписи до нечитаемых.
 */

const ITEMS = [
  { href: '/team', label: 'Главная', icon: 'M2 8l7-6 7 6v8H2z' },
  { href: '/tasks', label: 'Задания', icon: 'M3 3h12v12H3zM6 7h6M6 11h4' },
  { href: '/map', label: 'Карта', icon: 'M2 4l5-2 4 2 5-2v12l-5 2-4-2-5 2zM7 2v12M11 4v12' },
  { href: '/submissions', label: 'Отправки', icon: 'M2 4h14v10H2zM2 9l4-3 4 4 3-2 3 3' },
  { href: '/leaderboard', label: 'Рейтинг', icon: 'M3 15V8M9 15V3M15 15v-5' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы команды"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper md:hidden',
      )}
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1',
                  active ? 'text-ink' : 'text-sand',
                )}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d={item.icon}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={active ? 1.8 : 1.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className={cn('text-[11px]', active && 'font-medium')}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
