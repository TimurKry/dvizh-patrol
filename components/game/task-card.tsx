'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { FlipButton, FlipCard } from '@/components/ui/flip-card';
import { CardBack } from './card-back';
import { TaskFace, type FaceTone } from './task-face';
import { TASK_CARD_TYPE_TEXT, attemptsWord, pointsWord } from '@/lib/messages';
import type { TaskWithState } from '@/lib/data/tasks';
import { cn } from '@/lib/cn';

/**
 * Игровая карточка задания · Figma 99:50.
 *
 * Три типа (загадка, фото-повтор, актив) × две стороны × три
 * состояния доступности. Лицевая сторона светлая — она читается
 * на солнце, где карточку и будут смотреть. Рубашка красится в
 * цвет команды.
 *
 * Карточка одновременно и ссылка, и переворачивающийся объект.
 * Разведены они так: нажатие на «Открыть» ведёт на страницу
 * задания, нажатие в любое другое место переворачивает. Логика
 * этого разделения живёт в FlipCard, здесь только разметка.
 *
 * Состояние `claimed_by_other` — не ошибка команды, а исход
 * гонки, поэтому оно оформлено приглушённо и без красного:
 * задание просто ушло, ничего чинить не нужно.
 */

const STATE: Record<
  TaskWithState['state'],
  { text: string; icon: string; tone: FaceTone }
> = {
  available: { text: 'Доступно', icon: '◇', tone: 'available' },
  rejected: { text: 'Не принято', icon: '×', tone: 'available' },
  in_review: { text: 'На проверке', icon: '»', tone: 'checking' },
  accepted: { text: 'Забрали', icon: '✓', tone: 'claimed' },
  claimed_by_other: { text: 'Забрала другая', icon: '⊘', tone: 'dim' },
  attempts_exhausted: { text: 'Попытки кончились', icon: '−', tone: 'dim' },
};

export function TaskCard({ item }: { item: TaskWithState }) {
  const { task, state, attemptsLeft, referenceImageUrl } = item;
  const presentation = STATE[state];
  const type = TASK_CARD_TYPE_TEXT[task.card_type];
  const gone = state === 'claimed_by_other';

  return (
    <FlipCard
      // Высоту задаёт содержимое, а не жёсткая пропорция: у
      // длинного названия при aspect-[342/479] обрезалась нижняя
      // кнопка. Пропорция макета остаётся минимумом.
      className={cn('min-h-[479px] w-full', gone && 'opacity-60')}
      ownTrigger
      front={(api) => (
        <TaskFace
          type={task.card_type}
          kicker={`${type.label} / №${task.number}`}
          title={task.title}
          points={String(task.points)}
          text={task.short_description}
          place={type.place}
          image={referenceImageUrl ? { src: referenceImageUrl, badge: 'Фото-эталон' } : null}
          placeholder={String(task.number)}
          attemptsLine={
            state !== 'accepted' && !gone && attemptsLeft > 0
              ? `${attemptsLeft} ${attemptsWord(attemptsLeft)}`
              : null
          }
          status={presentation}
          accepted={state === 'accepted'}
          actions={
            <div className="flex gap-2">
              {!gone && (
                <Link
                  href={`/tasks/${task.id}`}
                  className={cn(
                    'flex min-h-[44px] flex-1 items-center justify-center border border-[#060609]',
                    'bg-[#060609] text-[#f5f5f1] hover:border-signal hover:bg-signal hover:text-canvas',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
                  )}
                >
                  <span className="signal-label text-micro">Открыть</span>
                </Link>
              )}
              <FlipButton
                api={api}
                label={`Показать рубашку карточки «${task.title}»`}
                className={cn(
                  'border border-[#87877f] text-[#060609] hover:border-signal hover:text-signal',
                  gone && 'flex-1',
                )}
              />
            </div>
          }
        />
      )}
      back={(api) => (
        <CardBack caption={type.label} hint={type.hint}>
          <FlipButton
            api={api}
            label={`Вернуть карточку «${task.title}» лицом`}
            className="border border-current"
          />
        </CardBack>
      )}
    />
  );
}

/** Компактная строка отправки — для списка «Отправки». */
export function SubmissionRow({
  href,
  title,
  taskNumber,
  status,
  points,
  previewUrl,
  submittedAt,
  timezone,
}: {
  href: string;
  title: string;
  taskNumber: number | null;
  status: Parameters<typeof StatusBadge>[0]['status'];
  points: number;
  previewUrl: string | null;
  submittedAt: string;
  timezone: string;
}) {
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
  }).format(new Date(submittedAt));

  return (
    <Link
      href={href}
      className="lift flex items-center gap-4 border border-hairline bg-panel p-3 hover:border-signal"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden bg-ink-wash">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-caption text-faint">
            —
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body">
          {taskNumber !== null && <span className="text-faint">{taskNumber}. </span>}
          {title}
        </p>
        <p className="mt-1 text-caption text-muted">{time}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={status} />
        {points > 0 && (
          <span className="text-caption tabular-nums text-muted">
            +{points} {pointsWord(points)}
          </span>
        )}
      </div>
    </Link>
  );
}
