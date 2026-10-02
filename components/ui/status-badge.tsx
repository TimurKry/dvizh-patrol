import { cn } from '@/lib/cn';
import { Icon } from './icon';
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
  solid: 'border-ink text-ink bg-panel',
  dashed: 'border-hairline-strong border-dashed text-muted bg-panel',
  filled: 'border-signal bg-signal text-canvas',
  muted: 'border-hairline text-faint bg-panel',
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
        'inline-flex items-center gap-1.5 border px-2.5 py-1',
        'text-caption font-medium whitespace-nowrap',
        style,
        className,
      )}
      aria-label={`Статус: ${presentation.label}. ${presentation.hint}`}
    >
      {/* Статусы «в работе» пульсируют: по неподвижному значку
          не понять, идёт ли проверка вообще. */}
      {showIcon && (
        <span
          aria-hidden="true"
          className={cn(
            (status === 'checking' || status === 'uploading' || status === 'pending') &&
              'anim-tick',
          )}
        >
          <Icon name={presentation.icon} size={14} />
        </span>
      )}
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
        'inline-flex items-center border px-2.5 py-1 text-caption whitespace-nowrap',
        emphasis ? 'border-signal bg-signal text-canvas font-medium' : 'border-hairline text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}
