import { cn } from '@/lib/cn';
import { SUBMISSION_STATUS_TEXT } from '@/lib/messages';
import type { SubmissionStatus } from '@/types/database';

/**
 * Значок статуса.
 *
 * В системе нет цветовой кодировки, поэтому статус различается
 * тремя независимыми признаками: символом, текстом и стилем
 * рамки. Это же требование доступности — статус не должен
 * читаться только по цвету.
 */

type BorderStyle = 'solid' | 'dashed' | 'filled' | 'muted';

const STYLE_BY_STATUS: Record<SubmissionStatus, BorderStyle> = {
  draft: 'dashed',
  uploading: 'dashed',
  pending: 'solid',
  checking: 'dashed',
  accepted: 'filled',
  manual_review: 'solid',
  rejected: 'muted',
  upload_failed: 'muted',
  cancelled: 'muted',
};

const STYLES: Record<BorderStyle, string> = {
  solid: 'border-ink-black text-ink-black bg-paper-white',
  dashed: 'border-hairline-strong border-dashed text-stone bg-paper-white',
  filled: 'border-ink-black bg-ink-black text-paper-white',
  muted: 'border-hairline text-pebble bg-paper-white',
};

export function StatusBadge({
  status,
  className,
  showIcon = true,
}: {
  status: SubmissionStatus;
  className?: string;
  showIcon?: boolean;
}) {
  const presentation = SUBMISSION_STATUS_TEXT[status];
  const style = STYLES[STYLE_BY_STATUS[status]];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[12px] border px-2.5 py-1',
        'text-caption font-medium whitespace-nowrap',
        style,
        className,
      )}
      aria-label={`Статус: ${presentation.label}. ${presentation.hint}`}
    >
      {showIcon && <span aria-hidden="true">{presentation.icon}</span>}
      {presentation.label}
    </span>
  );
}

/** Нейтральная метка: категория, сложность, баллы. */
export function Tag({
  children,
  className,
  emphasis = false,
}: {
  children: React.ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[12px] border px-2.5 py-1 text-caption whitespace-nowrap',
        emphasis
          ? 'border-ink-black bg-ink-black text-paper-white font-medium'
          : 'border-hairline text-stone',
        className,
      )}
    >
      {children}
    </span>
  );
}
