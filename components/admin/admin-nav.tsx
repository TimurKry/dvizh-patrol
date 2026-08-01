'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { adminLogoutAction } from '@/actions/admin';
import { DotCluster } from '@/components/ui/logo';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/admin', label: 'Сводка', exact: true },
  { href: '/admin/event', label: 'Мероприятие' },
  { href: '/admin/teams', label: 'Команды' },
  { href: '/admin/tasks', label: 'Задания' },
  { href: '/admin/submissions', label: 'Проверка' },
  { href: '/admin/leaderboard', label: 'Рейтинг' },
  { href: '/admin/import', label: 'Импорт' },
  { href: '/admin/export', label: 'Экспорт' },
  { href: '/admin/audit', label: 'Журнал' },
  { href: '/admin/settings', label: 'Настройки' },
];

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-b border-hairline bg-paper-white">
      <div className="page-well flex flex-col gap-3 py-3">
        <div className="flex items-center justify-between gap-4">
          <Link href="/admin" className="flex items-center gap-2">
            <DotCluster size={16} />
            <span className="text-body font-medium">Движ-Патруль · админка</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-caption text-stone sm:inline">{email}</span>
            <Link href="/" className="text-caption text-stone hover:text-ink-black">
              Сайт
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => void adminLogoutAction())}
              className="rounded-[12px] border border-hairline px-3 py-1.5 text-caption hover:border-hairline-strong"
            >
              {pending ? 'Выходим…' : 'Выйти'}
            </button>
          </div>
        </div>

        {/* Разделов много — на узком экране лента прокручивается,
            а не переносится в три ряда. */}
        <nav aria-label="Разделы админки" className="scroll-x -mx-1 px-1">
          <ul className="flex gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href, link.exact) ? 'page' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-[12px] px-3 py-2 text-caption transition-colors',
                    isActive(link.href, link.exact)
                      ? 'bg-ink-black text-paper-white font-medium'
                      : 'text-stone hover:bg-ink-wash hover:text-ink-black',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
