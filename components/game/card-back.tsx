import { cn } from '@/lib/cn';

/**
 * Рубашка игровой карточки.
 *
 * Figma «__Artwork/CardBack/Pattern» (113:53): сплошная заливка
 * командным цветом и повторяющийся орнамент из фирменного знака.
 *
 * Орнамент — кисточный знак «Dvizh Leipzig», повторяющийся
 * плиткой. Берётся одноцветный силуэт, а не полноцветный знак:
 * рубашка красится в один из шести командных цветов, и мадженте
 * из оригинала на розовой или красной рубашке взяться неоткуда.
 * Чёрный силуэт под низкой непрозрачностью работает одинаково на
 * всех шести.
 *
 * Цвет берётся из `--team-color`, а не из пропсов: одну и ту же
 * рубашку рисуют и серверные, и клиентские компоненты, а
 * переменную ставит корень командного экрана.
 */

export function CardBack({
  /** Крупная надпись поперёк рубашки: тип задания или название команды. */
  caption,
  hint,
  /** Знак вместо надписи — например, тип задания в витрине. */
  mark,
  className,
  children,
}: {
  caption?: string;
  hint?: string;
  mark?: React.ReactNode;
  className?: string;
  /** Действия поверх рубашки — обычно кнопка «вернуть лицом». */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden',
        'rounded-[8px] border border-hairline p-6 text-center',
        className,
      )}
      style={{ backgroundColor: 'var(--team-color)', color: 'var(--team-on-color)' }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'url("/brand/dvizh-leipzig-mono.png")',
          backgroundSize: '88px auto',
        }}
      />
      {mark && <span className="relative">{mark}</span>}

      {caption && (
        <span className="relative font-display text-title font-bold uppercase tracking-[-0.03em]">
          {caption}
        </span>
      )}
      {hint && (
        <span className="signal-label relative max-w-[24ch] text-micro opacity-80">{hint}</span>
      )}
      {children && <div className="relative mt-2">{children}</div>}
    </div>
  );
}
