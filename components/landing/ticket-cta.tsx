import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Билетный CTA.
 *
 * Figma 79:24 / 79:30 / 85:11. Прямоугольник с двумя вырезами по
 * бокам читается как оторванный билет. Вырезы рисует утилита
 * `.ticket-notch` двумя псевдоэлементами цвета холста — ни одной
 * картинки, ни одного лишнего запроса.
 *
 * Внешние ссылки (Telegram) уходят в новую вкладку с
 * `rel="noreferrer"`: `t.me` не должен получать ни `opener`, ни
 * реферер с адресом квеста.
 */

export function TicketCta({
  href,
  label,
  sub,
  tone = 'signal',
  external = false,
  className,
}: {
  href: string;
  label: string;
  sub: string;
  tone?: 'signal' | 'outline';
  external?: boolean;
  className?: string;
}) {
  const signal = tone === 'signal';

  return (
    <Link
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={cn(
        'ticket-notch lift group relative flex min-h-[54px] items-center justify-between gap-3',
        'overflow-hidden border px-[17px] py-[9px]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
        signal
          ? 'border-signal bg-signal text-canvas hover:bg-signal-deep hover:border-signal-deep'
          : 'border-ink bg-canvas text-ink hover:border-signal',
        className,
      )}
    >
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="font-display text-caption font-bold uppercase tracking-[-0.03em]">
          {label}
        </span>
        <span
          className={cn(
            'signal-label text-micro',
            signal ? 'text-canvas/80' : 'text-muted group-hover:text-signal',
          )}
        >
          {sub}
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-body-lg font-bold">
        ↗
      </span>
    </Link>
  );
}
