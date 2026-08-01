import type { Metadata } from 'next';
import { EventSettingsForm } from '@/components/admin/event-settings-form';
import { ActionButton } from '@/components/admin/action-form';
import { changeEventStatusAction } from '@/actions/admin';
import { Card, Eyebrow } from '@/components/ui/surface';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent, getRegistrationStats } from '@/lib/data/event';
import { EVENT_STATUS_TEXT } from '@/lib/messages';
import type { EventStatus } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Мероприятие' };

const STATUS_DESCRIPTION: Record<EventStatus, string> = {
  draft: 'Мероприятие готовится. Регистрация закрыта, задания скрыты, сайт показывает заглушку.',
  registration: 'Команды регистрируются. Задания ещё скрыты, на главной идёт обратный отсчёт.',
  live: 'Квест идёт. Задания открыты, отправки принимаются, проверка работает.',
  paused: 'Пауза. Новые отправки блокируются, всё остальное доступно.',
  finished: 'Квест завершён. Отправки закрыты, участники видят результаты.',
  archived: 'Архив. Только просмотр, фотографии могут быть удалены по политике хранения.',
};

const TRANSITIONS: Record<EventStatus, Array<{ status: EventStatus; label: string }>> = {
  draft: [{ status: 'registration', label: 'Открыть регистрацию' }],
  registration: [
    { status: 'live', label: 'Запустить квест' },
    { status: 'draft', label: 'Вернуть в черновик' },
  ],
  live: [
    { status: 'paused', label: 'Приостановить' },
    { status: 'finished', label: 'Завершить' },
  ],
  paused: [
    { status: 'live', label: 'Продолжить' },
    { status: 'finished', label: 'Завершить' },
  ],
  finished: [
    { status: 'live', label: 'Возобновить' },
    { status: 'archived', label: 'В архив' },
  ],
  archived: [],
};

export default async function AdminEventPage() {
  await requireAdmin();
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-10">
        <EmptyState title="Мероприятие не найдено" />
      </div>
    );
  }

  const stats = await getRegistrationStats(event);

  return (
    <div className="page-well flex max-w-3xl flex-col gap-8 py-8">
      <header>
        <Eyebrow>Управление</Eyebrow>
        <h1 className="mt-2 text-heading">Мероприятие</h1>
      </header>

      {/* ═══ Состояние ══════════════════════════════════════ */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-subheading">
            Статус: {EVENT_STATUS_TEXT[event.status] ?? event.status}
          </h2>
          <p className="text-caption text-stone">
            команд {stats.active} / {event.max_teams}, участников {stats.members}
          </p>
        </div>

        <p className="text-body text-stone">{STATUS_DESCRIPTION[event.status]}</p>

        <div className="flex flex-wrap gap-2">
          {TRANSITIONS[event.status].map((transition) => (
            <ActionButton
              key={transition.status}
              action={changeEventStatusAction}
              values={{ eventId: event.id, status: transition.status }}
              variant={transition.status === 'live' ? 'primary' : 'secondary'}
              confirm={
                transition.status === 'live'
                  ? 'Запустить квест? Задания станут видны всем командам.'
                  : transition.status === 'finished'
                    ? 'Завершить квест? Новые отправки будут заблокированы.'
                    : transition.status === 'archived'
                      ? 'Отправить в архив? Вернуть событие обратно будет нельзя.'
                      : undefined
              }
            >
              {transition.label}
            </ActionButton>
          ))}
          {TRANSITIONS[event.status].length === 0 && (
            <p className="text-caption text-stone">Из архива переходов нет.</p>
          )}
        </div>
      </Card>

      {event.status === 'live' && (
        <Notice icon="•">
          Пока квест идёт, менять число заданий и их условия не стоит: команды уже строят
          маршрут. Выключение задания скрывает его у всех немедленно.
        </Notice>
      )}

      {/* ═══ Настройки ══════════════════════════════════════ */}
      <section className="flex flex-col gap-4">
        <h2 className="text-subheading">Настройки</h2>
        <EventSettingsForm event={event} teamsRegistered={stats.active} />
      </section>
    </div>
  );
}
