import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * Полароид-улика.
 *
 * Figma 77:2…77:14. Чёрно-белый снимок, который возвращает цвет
 * при наведении или фокусе — но только на устройствах с
 * настоящим курсором. Логика фильтра и медиа-запрос живут в
 * `app/globals.css` (`.polaroid-host`, `.polaroid-photo`).
 *
 * Наклон задаётся переменной `--tilt`, чтобы покачивание шло от
 * собственного угла снимка, а не сбрасывало поворот в ноль.
 *
 * Снимки декоративные: подпись под ними — часть оформления, а не
 * содержания, поэтому `alt` пустой, а вся группа скрыта от
 * скринридера на уровне контейнера героя.
 */

export function Polaroid({
  src,
  caption,
  tilt,
  className,
  signal = false,
  priority = false,
  delay = 0,
}: {
  src: string;
  caption: string;
  /** Наклон в градусах: «−9deg», «7deg». */
  tilt: string;
  className?: string;
  /** Один снимок в композиции обведён сигналом — он и подсказывает приём. */
  signal?: boolean;
  priority?: boolean;
  /** Сдвиг фазы покачивания: иначе все четыре качаются в такт. */
  delay?: number;
}) {
  return (
    <div
      className={cn(
        'polaroid-host anim-float group absolute p-[5px]',
        'polaroid',
        signal && 'border-2 border-signal',
        className,
      )}
      style={
        {
          '--tilt': tilt,
          transform: `rotate(${tilt})`,
          animationDelay: `${delay}s`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="relative aspect-[106/116] w-full overflow-hidden">
        <Image
          src={src}
          alt=""
          fill
          sizes="(min-width: 1024px) 190px, 130px"
          priority={priority}
          className="polaroid-photo object-cover"
        />
        {/* Сигнальная плёнка поверх снимка — подсказка «этот
            реагирует». При наведении она уходит вместе с
            обесцвечиванием, иначе цветной кадр остался бы
            залит пурпурным. */}
        {signal && (
          <span className="pointer-events-none absolute inset-0 bg-signal/25 mix-blend-screen transition-opacity duration-[450ms] group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none" />
        )}
      </div>
      <p className="signal-label mt-[6px] text-micro whitespace-nowrap text-[#060609]">{caption}</p>
    </div>
  );
}
