import { cn } from '@/lib/cn';

/**
 * Шапка секции лендинга.
 *
 * Figma 81:5…81:7, 83:3…83:5, 84:3…84:5, 85:3…85:5. Индекс в
 * разрядку, двухстрочный дисплейный заголовок, короткий абзац.
 * Заголовок разбивается по строкам вручную через `<br />` в
 * `title`, потому что в макете перенос смысловой: «ЦЕНТР — /
 * НАША ДОСКА», а не там, где кончилась ширина.
 */

export function SectionHead({
  index,
  title,
  intro,
  tone = 'dark',
  className,
}: {
  index: string;
  title: React.ReactNode;
  intro?: string;
  /** Секция «Маршрут вечера» инвертирована: светлая бумага. */
  tone?: 'dark' | 'paper';
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      <p
        className={cn(
          'signal-label text-label',
          tone === 'paper' ? 'text-[#060609]' : 'text-signal',
        )}
      >
        {index}
      </p>
      <h2
        className={cn(
          'text-headline lg:text-display',
          tone === 'paper' ? 'text-[#060609]' : 'text-ink',
        )}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={cn(
            'max-w-[42ch] text-body',
            tone === 'paper' ? 'text-[#5c5c63]' : 'text-muted',
          )}
        >
          {intro}
        </p>
      )}
    </header>
  );
}
