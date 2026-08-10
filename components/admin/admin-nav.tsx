'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { adminLogoutAction } from '@/actions/admin';
import { DotCluster } from '@/components/ui/logo';
import { cn } from '@/lib/cn';

/**
 * Боковая навигация организатора · Figma 104:88.
 *
 * Сайдбар, а не верхняя лента: разделов десяток, и в строку они
 * помещаются только прокруткой — на 1440px это выглядит как
 * недоделка, а на ноутбуке половина названий уезжает за край.
 * Слева они все видны сразу и не двигаются при переходах.
 *
 * На узком экране сайдбар превращается в горизонтальную ленту:
 * админка рассчитана на ноутбук, но открыть её с телефона
 * посреди мероприятия организатору приходится регулярно.
 */

const LINKS = [
  { href: '/admin', label: 'Сводка', icon: '▦', exact: true },
  { href: '/admin/submissions', label: 'Очередь', icon: '⁋' },
  { href: '/admin/teams', label: 'Команды', icon: '◉' },
  { href: '/admin/tasks', label: 'Задания', icon: '◇' },
  { href: '/admin/leaderboard', label: 'Рейтинг', icon: '▲' },
  { href: '/admin/event', label: 'Мероприятие', icon: '◍' },
  { href: '/admin/import', label: 'Импорт', icon: '↓' },
  { href: '/admin/export', label: 'Экспорт', icon: '↑' },
  { href: '/admin/audit', label: 'Журнал', icon: '≡' },
  { href: '/admin/settings', label: 'Настройки', icon: '⚙' },
];

export function AdminNav({
  email,
  /** Строка состояния квеста внизу сайдбара · Figma 104:106. */
  state,
}: {
  email: string;
  state?: { status: string; teams: string; queue: string };
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex shrink-0 flex-col border-hairline lg:h-dvh lg:w-[224px] lg:border-r">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4 lg:block lg:border-b-0">
        <Link href="/admin" className="flex items-center gap-2">
          <DotCluster size={18} />
          <span className="font-display text-caption font-semibold uppercase">Движ-Патруль</span>
        </Link>
        <p className="signal-label mt-1 hidden text-micro text-muted lg:block">Организатор</p>

        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => void adminLogoutAction())}
          className="tap-target border border-hairline px-3 text-caption hover:border-signal hover:text-signal lg:hidden"
        >
          {pending ? '…' : 'Выйти'}
        </button>
      </div>

      <nav
        aria-label="Разделы админки"
        className="scroll-x border-b border-hairline lg:mt-6 lg:flex-1 lg:overflow-y-auto lg:border-b-0"
      >
        <ul className="flex lg:flex-col lg:gap-1 lg:px-4">
          {LINKS.map((link) => (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={isActive(link.href, link.exact) ? 'page' : undefined}
                className={cn(
                  'flex min-h-[48px] items-center gap-3 px-4 transition-colors lg:min-h-[52px]',
                  isActive(link.href, link.exact)
                    ? 'bg-signal text-canvas'
                    : 'text-muted hover:bg-ink-wash hover:text-ink',
                )}
              >
                <span aria-hidden="true" className="hidden w-5 text-center lg:inline">
                  {link.icon}
                </span>
                <span className="signal-label text-micro">{link.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="hidden flex-col gap-3 px-5 py-5 lg:flex">
        {state && (
          <dl className="border border-hairline bg-panel px-3 py-3">
            <dt className="signal-label text-micro text-signal">{state.status}</dt>
            <dd className="mt-2 text-caption text-muted">{state.teams}</dd>
            <dd className="text-caption text-muted">{state.queue}</dd>
          </dl>
        )}

        <p className="truncate text-caption text-muted" title={email}>
          {email}
        </p>

        <div className="flex items-center gap-3">
          <Link href="/" className="text-caption text-muted hover:text-ink">
            Сайт
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void adminLogoutAction())}
            className="text-caption text-muted hover:text-signal"
          >
            {pending ? 'Выходим…' : 'Выйти'}
          </button>
        </div>
      </div>
    </div>
  );
}
