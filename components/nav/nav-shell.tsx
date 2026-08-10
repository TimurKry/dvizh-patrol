'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Wordmark } from '@/components/ui/logo';

/**
 * Плавающая навигация-таблетка.
 *
 * На странице она одна — вторую панель дизайн-система запрещает.
 * На мобильном ссылки сворачиваются в выпадающий лист, который
 * закрывается по Escape, по клику вне и при смене маршрута.
 */

export interface NavLink {
  href: string;
  label: string;
}

export function NavShell({
  links,
  action,
}: {
  links: NavLink[];
  action: { href: string; label: string } | null;
}) {
  const pathname = usePathname();

  // Меню помнит, на каком маршруте его открыли. Как только
  // маршрут меняется, оно закрывается само — без эффекта,
  // который дёргал бы состояние после отрисовки.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null);

  // Escape закрывает меню. Подписка на клавиатуру — это как раз
  // тот случай, для которого эффект и предназначен.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenedOn(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className="sticky top-0 z-40 pt-3 pb-2"
      style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
    >
      <div className="page-well">
        <nav
          aria-label="Основная навигация"
          className={cn(
            'flex items-center gap-2 rounded-[9999px] border border-hairline',
            'bg-panel px-3 py-2',
          )}
        >
          <Link
            href="/"
            className="flex items-center rounded-[9999px] px-2 py-1.5 tap-target"
            aria-label="Движ-Патруль, на главную"
          >
            <Wordmark />
          </Link>

          {/* Ссылки на широком экране */}
          <ul className="ml-2 hidden flex-1 items-center gap-1 md:flex">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center rounded-[9999px] px-3 py-2 text-body transition-colors',
                    isActive(link.href)
                      ? 'bg-signal text-canvas'
                      : 'text-muted hover:bg-ink-wash hover:text-ink',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2">
            {action && (
              <Link
                href={action.href}
                className={cn(
                  'lift hidden items-center rounded-[9999px] border border-ink bg-ink',
                  'px-4 py-2 text-caption font-medium text-canvas sm:inline-flex',
                  'hover:border-signal hover:bg-signal',
                )}
              >
                {action.label}
              </Link>
            )}

            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="nav-mobile-menu"
              className={cn(
                'inline-flex h-11 w-11 items-center justify-center rounded-[9999px] md:hidden',
                'border border-hairline text-ink hover:bg-ink-wash',
              )}
            >
              <span className="sr-only">{open ? 'Закрыть меню' : 'Открыть меню'}</span>
              <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
                {open ? (
                  <path
                    d="M2 2l14 10M16 2L2 12"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M1 2h16M1 7h16M1 12h16"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          </div>
        </nav>

        {/* Выпадающий лист на мобильном */}
        {open && (
          <div
            id="nav-mobile-menu"
            className="anim-rise mt-2 border border-hairline bg-panel p-2 md:hidden"
          >
            <ul className="flex flex-col">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive(link.href) ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[48px] items-center px-4 text-body',
                      isActive(link.href) ? 'bg-ink-wash font-medium' : 'text-muted',
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              {action && (
                <li className="mt-1 border-t border-hairline pt-1">
                  <Link
                    href={action.href}
                    className="flex min-h-[48px] items-center bg-ink px-4 text-body font-medium text-canvas"
                  >
                    {action.label}
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}
