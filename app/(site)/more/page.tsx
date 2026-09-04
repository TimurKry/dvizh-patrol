import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomNav } from '@/components/nav/bottom-nav';
import { LogoutButton } from '@/components/game/logout-button';
import { OfflineQueueStatus } from '@/components/pwa/offline-queue-status';
import { requireTeamSession } from '@/lib/session/require';
import { formatEventDate, formatEventTime } from '@/lib/data/event';
import { EVENT_STATUS_TEXT } from '@/lib/messages';
import { teamColorHex, teamColorLabel } from '@/lib/team-colors';

/**
 * «Ещё» — всё, к чему во время игры обращаются редко.
 *
 * Раздел существует затем, чтобы нижняя навигация осталась из
 * трёх пунктов. Здесь карта, рейтинг, история отправок, состав
 * команды, правила и выход — то есть ровно то, что раньше
 * занимало место в панели и мешало главному.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ещё' };

const SECTIONS = [
  {
    title: 'Игра',
    links: [
      { href: '/map', label: 'Карта', hint: 'Игровое поле и точки заданий на руке' },
      { href: '/leaderboard', label: 'Рейтинг', hint: 'Кто сколько набрал' },
      { href: '/submissions', label: 'Отправки', hint: 'История ваших фотографий и статусы' },
    ],
  },
  {
    title: 'Команда',
    links: [{ href: '/team/members', label: 'Участники', hint: 'Кто в команде и код для входа' }],
  },
  {
    title: 'Справка',
    links: [
      { href: '/rules', label: 'Правила', hint: 'Как считаются баллы и что запрещено' },
      { href: '/privacy', label: 'Конфиденциальность', hint: 'Что происходит с фотографиями' },
      { href: '/terms', label: 'Условия участия', hint: 'Согласия и ответственность' },
    ],
  },
] as const;

export default async function MorePage() {
  const session = await requireTeamSession();
  const { team, event } = session;

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <p className="signal-label text-label text-signal">Команда «{team.name}»</p>
      <h1 className="mt-3 text-headline">Ещё</h1>

      {/* ═══ Кто мы и где ════════════════════════════════════ */}
      <dl className="mt-6 grid grid-cols-2 border border-hairline bg-panel">
        <div className="flex flex-col gap-1 border-r border-hairline px-4 py-4">
          <dt className="signal-label text-micro text-muted">Цвет команды</dt>
          <dd className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="block h-4 w-4 shrink-0 border border-hairline"
              style={{ backgroundColor: teamColorHex(team.color) }}
            />
            <span className="text-caption">{teamColorLabel(team.color)}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-4 py-4">
          <dt className="signal-label text-micro text-muted">Квест</dt>
          <dd className="text-caption">{EVENT_STATUS_TEXT[event.status] ?? event.status}</dd>
        </div>
        <div className="col-span-2 flex flex-col gap-1 border-t border-hairline px-4 py-4">
          <dt className="signal-label text-micro text-muted">Старт</dt>
          <dd className="text-caption">
            {formatEventDate(event)} · {formatEventTime(event)} · {event.city}
          </dd>
        </div>
      </dl>

      {/* ═══ Очередь отправок ════════════════════════════════
          Не вкладка, а состояние: связь пропадает на минуту, и
          отдельный раздел под это заводить незачем. */}
      <div className="mt-6">
        <OfflineQueueStatus />
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-8">
          <h2 className="signal-label text-label text-muted">{section.title}</h2>
          <ul className="mt-3 border border-hairline bg-panel">
            {section.links.map((link, index) => (
              <li key={link.href} className={index > 0 ? 'border-t border-hairline' : ''}>
                <Link
                  href={link.href}
                  className="flex min-h-[64px] items-center justify-between gap-4 px-4 py-3 hover:bg-panel-high"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body">{link.label}</span>
                    <span className="text-caption text-muted">{link.hint}</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-body text-faint">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-6">
        <p className="text-caption text-muted">
          Выход отзывает сессию на сервере, а не только на этом телефоне.
        </p>
        <LogoutButton />
      </div>

      <BottomNav />
    </div>
  );
}
