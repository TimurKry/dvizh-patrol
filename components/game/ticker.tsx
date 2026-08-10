import { cn } from '@/lib/cn';

/**
 * Афишная лента.
 *
 * Плакат статичен, но у афиши на улице всегда есть движение —
 * бегущая строка выходных данных. Здесь она держит страницу
 * живой между секциями, ничего при этом не сообщая заново.
 *
 * Содержимое продублировано, а сдвиг идёт ровно на половину
 * ширины: в конце цикла вторая копия оказывается там, где
 * начиналась первая, и стык не виден. Лента декоративная,
 * поэтому целиком скрыта от скринридера — иначе он зачитал бы
 * один и тот же набор слов дважды.
 */
export function Ticker({
  items,
  className,
  tone = 'brick',
}: {
  items: string[];
  className?: string;
  tone?: 'brick' | 'ink';
}) {
  if (items.length === 0) return null;

  const line = [...items, ...items];

  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden border-y border-signal-line bg-canvas-deep py-3',
        className,
      )}
    >
      <div className="anim-marquee flex w-max items-center gap-6 whitespace-nowrap will-change-transform">
        {line.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className={cn(
              'signal-label flex items-center gap-6 text-caption',
              tone === 'brick' ? 'text-signal' : 'text-muted',
            )}
          >
            {item}
            <span className="text-signal-line">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
