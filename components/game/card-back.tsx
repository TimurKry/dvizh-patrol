import { cn } from '@/lib/cn';

/**
 * Рубашка игровой карточки.
 *
 * Figma «__Artwork/CardBack/Pattern» (113:53): сплошная заливка
 * командным цветом и повторяющийся орнамент из фирменного знака.
 *
 * Орнамент собран из знака проекта — восьми точек сеткой 3×3.
 * Кисточный логотип «Dvizh Leipzig» из макета остался в Figma:
 * его файл лежит на `www.figma.com`, а этот хост закрыт egress-
 * политикой среды, поэтому байты ассета в репозиторий не
 * приезжают. Замена сделана из того, что в системе уже есть, и
 * не выдаёт себя за оригинал; как только ассет станет доступен,
 * заменить нужно ровно один `backgroundImage` ниже.
 *
 * Цвет берётся из `--team-color`, а не из пропсов: одну и ту же
 * рубашку рисуют и серверные, и клиентские компоненты, а
 * переменную ставит корень командного экрана.
 */

/** Плитка орнамента. Знак повторяется со сдвигом через ряд. */
const ORNAMENT = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
    <g fill="#000" opacity="0.14">
      <g transform="translate(9 9)">
        <circle cx="2.5" cy="2.5" r="2.1"/><circle cx="9" cy="2.5" r="2.1"/><circle cx="15.5" cy="2.5" r="2.1"/>
        <circle cx="2.5" cy="9" r="2.1"/><circle cx="15.5" cy="9" r="2.1"/>
        <circle cx="2.5" cy="15.5" r="2.1"/><circle cx="9" cy="15.5" r="2.1"/><circle cx="15.5" cy="15.5" r="2.1"/>
      </g>
      <g transform="translate(45 45)">
        <circle cx="2.5" cy="2.5" r="2.1"/><circle cx="9" cy="2.5" r="2.1"/><circle cx="15.5" cy="2.5" r="2.1"/>
        <circle cx="2.5" cy="9" r="2.1"/><circle cx="15.5" cy="9" r="2.1"/>
        <circle cx="2.5" cy="15.5" r="2.1"/><circle cx="9" cy="15.5" r="2.1"/><circle cx="15.5" cy="15.5" r="2.1"/>
      </g>
    </g>
  </svg>`,
);

export function CardBack({
  /** Крупная надпись поперёк рубашки: тип задания или название команды. */
  caption,
  hint,
  className,
  children,
}: {
  caption: string;
  hint?: string;
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
        className="absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,${ORNAMENT}")`,
          backgroundSize: '72px 72px',
        }}
      />
      <span className="relative font-display text-title font-bold uppercase tracking-[-0.03em]">
        {caption}
      </span>
      {hint && (
        <span className="signal-label relative max-w-[24ch] text-micro opacity-80">{hint}</span>
      )}
      {children && <div className="relative mt-2">{children}</div>}
    </div>
  );
}
