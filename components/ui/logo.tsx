import { cn } from '@/lib/cn';

/**
 * Знак: восемь точек сеткой 3×3 с пустым центром.
 * Читается как цветок или звёздочка. Всегда Ink Black.
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
    [2, 2],
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
        <circle key={`${x}-${y}`} cx={2.5 + x * 6.5} cy={2.5 + y * 6.5} r="2.1" fill="currentColor" />
      ))}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-ink-black', className)}>
      <DotCluster />
      <span className="text-body font-medium tracking-[-0.02em]">Движ-Патруль</span>
    </span>
  );
}
