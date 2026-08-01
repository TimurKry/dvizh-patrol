import Link from 'next/link';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { TASK_CATEGORY_TEXT, TASK_DIFFICULTY_TEXT, attemptsWord, pointsWord } from '@/lib/messages';
import type { TaskWithState } from '@/lib/data/tasks';
import { cn } from '@/lib/cn';

/**
 * Карточка задания.
 *
 * Изображение — главное, текста минимум. Всё, что нужно решить
 * на ходу: номер, что снимать, сколько стоит, что уже сделано и
 * сколько попыток осталось.
 */

const STATE_LABEL: Record<TaskWithState['state'], { text: string; icon: string }> = {
  available: { text: 'Доступно', icon: '○' },
  in_review: { text: 'На проверке', icon: '◐' },
  accepted: { text: 'Принято', icon: '✓' },
  rejected: { text: 'Отклонено', icon: '×' },
  attempts_exhausted: { text: 'Попытки кончились', icon: '−' },
};

export function TaskCard({ item }: { item: TaskWithState }) {
  const { task, state, attemptsLeft, referenceImageUrl } = item;
  const label = STATE_LABEL[state];

  return (
    <Link
      href={`/tasks/${task.id}`}
      className={cn(
        'group flex flex-col gap-3 rounded-[16px] border bg-paper-white p-4',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
        state === 'accepted' ? 'border-ink-black' : 'border-hairline hover:border-hairline-strong',
      )}
    >
      <div className="relative overflow-hidden rounded-[12px] bg-ink-wash">
        {referenceImageUrl ? (
          /* Эталон приходит по подписанной ссылке с ограниченным
             сроком, оптимизатор next/image её кэшировать не должен. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={referenceImageUrl}
            alt=""
            loading="lazy"
            className="aspect-4/3 w-full object-cover"
          />
        ) : (
          <div className="flex aspect-4/3 w-full items-center justify-center">
            <span className="text-display tracking-[-2.32px] text-pebble" aria-hidden="true">
              {task.number}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-pebble">Задание {task.number}</p>
          <h3 className="mt-1 text-subheading font-normal">{task.title}</h3>
        </div>
        <span className="shrink-0 text-subheading tabular-nums">
          {task.points}
          <span className="ml-1 text-caption text-stone">{pointsWord(task.points)}</span>
        </span>
      </div>

      {task.short_description && (
        <p className="clamp-2 text-body text-stone">{task.short_description}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[12px] border px-2.5 py-1 text-caption font-medium',
            state === 'accepted'
              ? 'border-ink-black bg-ink-black text-paper-white'
              : state === 'in_review'
                ? 'border-hairline-strong border-dashed text-stone'
                : state === 'available'
                  ? 'border-ink-black text-ink-black'
                  : 'border-hairline text-pebble',
          )}
        >
          <span aria-hidden="true">{label.icon}</span>
          {label.text}
        </span>

        <Tag>{TASK_CATEGORY_TEXT[task.category]}</Tag>
        <Tag>{TASK_DIFFICULTY_TEXT[task.difficulty]}</Tag>

        {state !== 'accepted' && attemptsLeft > 0 && (
          <Tag>
            {attemptsLeft} {attemptsWord(attemptsLeft)}
          </Tag>
        )}
      </div>
    </Link>
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
      className="flex items-center gap-4 rounded-[16px] border border-hairline bg-paper-white p-3 hover:border-hairline-strong"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-ink-wash">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-caption text-pebble">
            —
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body">
          {taskNumber !== null && <span className="text-pebble">{taskNumber}. </span>}
          {title}
        </p>
        <p className="mt-1 text-caption text-stone">{time}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={status} />
        {points > 0 && (
          <span className="text-caption tabular-nums text-stone">
            +{points} {pointsWord(points)}
          </span>
        )}
      </div>
    </Link>
  );
}
