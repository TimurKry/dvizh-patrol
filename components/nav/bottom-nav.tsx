'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icon';
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

/**
 * Ромб на «Заданиях» ничего не значил: он был взят из метки
 * «доступно» на карточке, а в навигации читался как абстрактная
 * фигура. Колода карт говорит прямо — там лежат карточки.
 */
const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: '/tasks', label: 'Задания', icon: 'tasks' },
  { href: '/team', label: 'Команда', icon: 'teams' },
  { href: '/more', label: 'Ещё', icon: 'more' },
];

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
                <Icon name={item.icon} size={20} strokeWidth={active ? 2.2 : 1.7} />
                <span className="signal-label text-micro">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
