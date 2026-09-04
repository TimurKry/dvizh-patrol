import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { pointsWord } from '@/lib/messages';

/**
 * Компактная строка отправки — для списка «Отправки».
 *
 * Не карточка: отправка это уже сделанный ход, а не выбор. Ряд
 * с превью, временем и статусом просматривается сверху вниз за
 * секунду, тогда как шесть карточек в руке — расклад, который
 * смотрят целиком. Разные задачи, разная форма.
 */

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
