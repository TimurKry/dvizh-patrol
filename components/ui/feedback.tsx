import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './icon';

/**
 * Сообщения, пустые состояния и скелетоны.
 *
 * Цветовых плашек нет: важность передаётся рамкой и символом.
 * Так система остаётся монохромной, а сообщение остаётся
 * читаемым при любой цветовосприимчивости.
 */

type Tone = 'neutral' | 'strong';

export function Notice({
  children,
  tone = 'neutral',
  icon,
  className,
  role,
}: {
  children: ReactNode;
  tone?: Tone;
  /** Значок слева — имя из общего набора, не произвольный символ. */
  icon?: IconName;
  className?: string;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-3 border px-4 py-3 text-body',
        tone === 'strong' ? 'border-ink bg-panel' : 'border-hairline bg-panel',
        className,
      )}
    >
      {icon && (
        <span className="mt-1 shrink-0">
          <Icon name={icon} size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ErrorNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Notice tone="strong" icon="upload-failed" role="alert" className={className}>
      {children}
    </Notice>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 border border-dashed border-hairline-strong',
        'px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-body-lg">{title}</p>
      {description && <p className="max-w-prose text-body text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

/** Скелетон карточки задания — совпадает по габаритам с реальной. */
export function TaskCardSkeleton() {
  return (
    <div className="overflow-hidden border border-hairline bg-panel p-4">
      <Skeleton className="mb-4 aspect-4/3 w-full" />
      <Skeleton className="mb-2 h-4 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

/**
 * Область, о которой должны узнавать вспомогательные технологии.
 * Используется для смены статуса отправки без перезагрузки.
 */
export function LiveRegion({ children }: { children: ReactNode }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {children}
    </div>
  );
}
