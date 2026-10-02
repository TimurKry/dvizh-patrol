'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { adminLogoutAction } from '@/actions/admin';
import { DotCluster } from '@/components/ui/logo';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { canManageTeam, canUseCrm } from '@/lib/studio/staff';
import type { StaffRole } from '@/types/database';

/**
 * Навигация Студии — рабочего места команды DVIZH.
 *
 * Устроена так же, как сайдбар организатора (components/admin/
 * admin-nav): слева на ноутбуке, лентой сверху на телефоне.
 * Разделы добавляются по мере готовности и видны по роли:
 * заявки — владельцу и менеджерам, команда — только владельцу. Пустых «скоро будет» здесь нет: в
 * рабочем инструменте они только мешают попасть в нужное.
 */
const LINKS: {
  href: string;
  label: string;
  icon: IconName;
  visible: (role: StaffRole) => boolean;
}[] = [
  { href: '/studio/leads', label: 'Заявки', icon: 'queue', visible: canUseCrm },
  { href: '/studio/team', label: 'Команда', icon: 'teams', visible: canManageTeam },
];

export function StudioNav({ email, role }: { email: string; role: StaffRole }) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const logout = () => startTransition(() => void adminLogoutAction());

  return (
    <div className="flex shrink-0 flex-col border-hairline lg:h-dvh lg:w-[224px] lg:border-r">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4 lg:block lg:border-b-0">
        <Link href="/studio" className="flex items-center gap-2">
          <DotCluster size={18} />
          <span className="font-display text-caption font-semibold uppercase">DVIZH</span>
        </Link>
        <p className="signal-label mt-1 hidden text-micro text-muted lg:block">Студия</p>

        <div className="flex items-center gap-3 lg:hidden">
          <Link href="/admin" className="text-caption text-muted hover:text-ink">
            Игра
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={logout}
            className="tap-target border border-hairline px-3 text-caption hover:border-signal hover:text-signal"
          >
            {pending ? '…' : 'Выйти'}
          </button>
        </div>
      </div>

      <nav
        aria-label="Разделы Студии"
        className="scroll-x border-b border-hairline lg:mt-6 lg:flex-1 lg:overflow-y-auto lg:border-b-0"
      >
        <ul className="flex lg:flex-col lg:gap-1 lg:px-4">
          {LINKS.filter((link) => link.visible(role)).map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href} className="shrink-0">
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[48px] items-center gap-3 px-4 transition-colors lg:min-h-[52px]',
                    active
                      ? 'bg-signal text-canvas'
                      : 'text-muted hover:bg-ink-wash hover:text-ink',
                  )}
                >
                  <span aria-hidden="true" className="hidden w-5 text-center lg:inline">
                    <Icon name={link.icon} size={17} />
                  </span>
                  <span className="signal-label text-micro">{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="hidden flex-col gap-3 px-5 py-5 lg:flex">
        <p className="truncate text-caption text-muted" title={email}>
          {email}
        </p>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-caption text-muted hover:text-ink">
            Игра
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={logout}
            className="text-caption text-muted hover:text-signal"
          >
            {pending ? 'Выходим…' : 'Выйти'}
          </button>
        </div>
      </div>
    </div>
  );
}
