import type { Metadata } from 'next';
import { BottomNav } from '@/components/nav/bottom-nav';
import { TaskHand } from '@/components/game/task-hand';
import { LiveRefresh } from '@/components/game/live-refresh';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { FinishPoint } from '@/components/game/finish-point';
import { TimeLeft } from '@/components/game/time-left';
import { formatEventMoment } from '@/lib/data/event';
import { questOver, submissionsOpen } from '@/lib/event-status';
import { getTeamHand } from '@/lib/data/tasks';
import { requireTeamSession } from '@/lib/session/require';
import { TASK_CARD_TYPE_TEXT } from '@/lib/messages';
import { TaskTypeIcon } from '@/components/game/task-type-icon';
import { teamColorVars } from '@/lib/team-colors';
import { TASK_CARD_TYPES } from '@/types/database';
import { Icon } from '@/components/ui/icon';

/**
 * Рука команды · Figma 103:47.
 *
 * Шесть карточек: по две загадки, фото-повтора и актива. Список
 * приходит из `get_team_hand` — сервер сам следит за составом и
 * пополняет руку, когда карточка уходит. Всего пула здесь нет и
 * быть не должно: он и есть содержание квеста.
 *
 * Фильтров и сортировки нет намеренно. Шесть карточек глазами
 * охватываются целиком, а панель фильтров над ними была бы
 * интерфейсом ради интерфейса.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Задания' };

export default async function TasksPage() {
  const session = await requireTeamSession();

  // Задания открываются только когда квест запущен.
  //
  // Проверка стоит ДО загрузки, а не после. Отрисовать закрытый
  // список мало: пока формулировки лежат в области видимости
  // компонента, любая будущая правка выше заглушки утащит их в
  // разметку. Не загружено — нечего и утекать.
  const tasksHidden = !['live', 'paused', 'finished'].includes(session.event.status);

  if (tasksHidden) {
    return (
      <div className="page-well with-bottom-nav py-8 md:py-12">
        <p className="signal-label text-label text-signal">Команда «{session.team.name}»</p>
        <h1 className="mt-3 text-headline">Задания</h1>
        <div className="mt-8">
          <EmptyState
            title="Задания ещё закрыты"
            description={
              session.event.status === 'registration'
                ? 'Рука раздаётся в момент старта квеста. Пока можно собрать команду и прочитать правила.'
                : 'Мероприятие сейчас недоступно.'
            }
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  // «Идёт» мало: после срока сервер отправки не принимает, и
  // предлагать кнопку было бы обманом.
  const eventLive = submissionsOpen(session.event);
  const over = questOver(session.event);
  const hand = await getTeamHand(session.event.id, session.teamId, { eventLive });

  const waiting = hand.some((item) => item.state === 'in_review');
  const counts = Object.fromEntries(
    TASK_CARD_TYPES.map((type) => [type, hand.filter((i) => i.task.card_type === type).length]),
  ) as Record<(typeof TASK_CARD_TYPES)[number], number>;

  return (
    <div
      className="page-well with-bottom-nav py-8 md:py-12"
      style={teamColorVars(session.team.color)}
    >
      <p className="signal-label text-label text-signal">Команда «{session.team.name}»</p>
      <h1 className="mt-3 text-headline">Задания</h1>

      <p className="mt-4 text-caption text-muted">
        Карты лежат рубашкой вверх. Нажмите — карта откроется; «Вернуть в колоду» кладёт её обратно.
      </p>

      {/* ═══ Правило руки · Figma 103:51 ══════════════════════ */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-hairline bg-panel px-4 py-4">
        <span className="signal-label text-micro text-ink">Рука {hand.length} / 6</span>

        {/* Сколько осталось — рядом с составом руки, а не
            отдельной полосой: это тот же служебный слой. */}
        {!over && session.event.ends_at && <TimeLeft endsAt={session.event.ends_at} />}
        <ul className="flex items-center gap-4">
          {TASK_CARD_TYPES.map((type) => (
            <li key={type} className="signal-label flex items-center gap-1.5 text-micro">
              <TaskTypeIcon type={type} size={16} className="text-signal" />
              <span className="sr-only">{TASK_CARD_TYPE_TEXT[type].label}:</span>
              <span className="text-muted">{counts[type]}</span>
            </li>
          ))}
        </ul>
      </div>

      {session.event.status === 'paused' && !over && (
        <div className="mt-4">
          <Notice tone="strong" icon="paused">
            Квест приостановлен организатором. Карточки видны, но отправка временно недоступна.
          </Notice>
        </div>
      )}

      {/* ═══ Финиш ═════════════════════════════════════════
          Место сбора выше руки: карточки уже ничего не решают,
          а идти надо сейчас. Сама рука остаётся ниже — посмотреть,
          что было на руках, приятно, и отнимать это незачем. */}
      {over && (
        <div className="mt-6 flex flex-col gap-4">
          <Notice tone="strong" icon="info">
            {session.event.status === 'finished'
              ? 'Квест завершён. Новые отправки закрыты, результаты досматривает организатор.'
              : 'Время вышло — отправки закрыты. Результаты досматривает организатор.'}
          </Notice>

          <FinishPoint
            place={{
              latitude: session.event.finish_latitude,
              longitude: session.event.finish_longitude,
              title: session.event.finish_title,
              address: session.event.finish_address,
              note: session.event.finish_note,
              time: session.event.finish_at
                ? formatEventMoment(session.event, session.event.finish_at)
                : null,
            }}
          />
        </div>
      )}

      <div className="mt-6">
        {hand.length === 0 ? (
          <EmptyState
            title="Свободных заданий не осталось"
            description="Все карточки этого типа уже забраны другими командами или отыграны вами. Загляните в рейтинг — квест на финишной прямой."
          />
        ) : (
          <TaskHand items={hand} />
        )}
      </div>

      {/* ═══ Правило гонки · Figma 103:96 ═════════════════════ */}
      <p className="mt-8 flex flex-col gap-1 border-t border-hairline pt-4">
        <span className="signal-label flex items-center gap-1.5 text-micro text-signal">
          <Icon name="race" size={14} />
          Первая валидная забирает карту
        </span>
        <span className="text-caption text-muted">
          Принято → карточка исчезает у всех команд, а вам приходит новая. Побеждает первая отправка
          по времени сервера.
        </span>
      </p>

      <LiveRefresh active={waiting} />
      <BottomNav />
    </div>
  );
}
