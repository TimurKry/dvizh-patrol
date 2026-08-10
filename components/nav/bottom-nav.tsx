'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * Нижняя навигация вошедшей команды.
 *
 * Ровно три пункта — это продуктовое решение, а не следствие
 * нехватки места (CLAUDE.md, «Неподвижные продуктовые решения»).
 * Карта, отправки, рейтинг, участники и правила живут в «Ещё»:
 * во время игры к ним обращаются редко, а каждый лишний пункт
 * отнимает ширину у тех трёх, которыми пользуются постоянно.
 *
 * Отправка ответа сюда не выносится вовсе — это действие внутри
 * задания, а не раздел.
 *
 * Панель показывается и на десктопе тоже: командные экраны
 * рассчитаны на телефон, и вторая навигация сверху для них
 * избыточна. Ширина ограничена, чтобы на ноутбуке пункты не
 * растягивались на весь экран.
 */

const ITEMS = [
  {
    href: '/tasks',
    label: 'Задания',
    // Ромб — та же метка «доступно», что и на карточке.
    icon: 'M9 1.5 16.5 9 9 16.5 1.5 9z',
  },
  {
    href: '/team',
    label: 'Команда',
    icon: 'M9 9a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 9zM2.5 16.2a6.5 6.5 0 0 1 13 0',
  },
  {
    href: '/more',
    label: 'Ещё',
    icon: 'M2.5 4.5h13M2.5 9h13M2.5 13.5h13',
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы команды"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-panel"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[68px] flex-col items-center justify-center gap-1.5',
                  active ? 'text-signal' : 'text-muted hover:text-ink',
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
                <span className="signal-label text-micro">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
