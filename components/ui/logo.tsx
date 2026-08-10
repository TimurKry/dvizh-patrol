import { cn } from '@/lib/cn';

/**
 * Знак: восемь точек сеткой 3×3 с пустым центром.
 *
 * Нижняя правая точка набрана сигнальным цветом. Один пурпурный
 * пиксель в чёрно-белом знаке — тот же приём, что и во всей
 * системе: сигнал ровно один, и он всегда в одном месте.
 *
 * Из этого же знака сделаны иконки PWA (public/icon.svg).
 */
export function DotCluster({ size = 18, className }: { size?: number; className?: string }) {
  const positions = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [1, 2],
  ] as const;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      {positions.map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={2.5 + x * 6.5}
          cy={2.5 + y * 6.5}
          r="2.1"
          fill="currentColor"
        />
      ))}
      <circle cx={15.5} cy={15.5} r="2.1" fill="var(--color-signal)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-ink', className)}>
      <DotCluster />
      <span className="font-display text-caption font-semibold uppercase tracking-[-0.01em]">
        Движ-Патруль
      </span>
    </span>
  );
}
