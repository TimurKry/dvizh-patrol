'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Переворачивающаяся карточка.
 *
 * Figma «Motion / Card flip» (100:68): 420ms, perspective 900px,
 * только rotateY. Механика переворота живёт в `app/globals.css`
 * (`.flip-scene`, `.flip-body`, `.flip-face`), здесь — состояние
 * и доступность.
 *
 * Три вещи, которые стоит объяснить.
 *
 * **Обе стороны лежат друг на друге** через `grid-area: 1 / 1`.
 * Иначе при перевороте высота карточки прыгала бы под содержимое
 * оборота, и соседние карточки в руке ездили бы вверх-вниз —
 * это анимация раскладки, которой в системе нет.
 *
 * **Невидимая сторона получает `inert`, а не только
 * `aria-hidden`.** `backface-visibility: hidden` прячет её
 * визуально, но ссылка на обороте всё равно ловила бы Tab, и
 * фокус уезжал бы в пустоту. `inert` убирает сторону и из
 * дерева доступности, и из порядка обхода разом.
 *
 * **Переворот доступен и кнопкой, и нажатием на карточку.**
 * Кнопка — обязательный клавиатурный и screen-reader путь;
 * нажатие на саму карточку — то, что человек делает пальцем не
 * задумываясь. Нажатия на ссылки и кнопки внутри карточки
 * переворот не запускают: проверяется `closest`.
 */

export function FlipCard({
  front,
  back,
  /** Что читает скринридер на кнопке переворота. */
  flipLabel = 'Перевернуть карточку',
  className,
  bodyClassName,
  /** Кнопка переворота рисуется поверх карточки в этом углу. */
  trigger,
}: {
  front: ReactNode;
  back: ReactNode;
  flipLabel?: string;
  className?: string;
  bodyClassName?: string;
  trigger?: (props: { flipped: boolean; toggle: () => void; controls: string }) => ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const bodyId = useId();

  const toggle = () => setFlipped((value) => !value);

  return (
    <div className={cn('flip-scene relative', className)}>
      <div
        id={bodyId}
        className={cn('flip-body h-full w-full', bodyClassName)}
        data-flipped={flipped}
        onClick={(event) => {
          // Ссылка или кнопка внутри карточки делает своё дело,
          // а не переворачивает её заодно.
          if ((event.target as HTMLElement).closest('a,button,input,select,textarea')) return;
          toggle();
        }}
      >
        <div className="flip-face" aria-hidden={flipped} inert={flipped}>
          {front}
        </div>
        <div className="flip-face flip-face-back" aria-hidden={!flipped} inert={!flipped}>
          {back}
        </div>
      </div>

      {trigger ? (
        trigger({ flipped, toggle, controls: bodyId })
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={flipped}
          aria-controls={bodyId}
          className={
            'tap-target absolute right-2 bottom-2 z-10 flex items-center justify-center ' +
            'border border-hairline bg-canvas/80 text-ink ' +
            'hover:border-signal hover:text-signal ' +
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'
          }
        >
          <span className="sr-only">{flipLabel}</span>
          <span aria-hidden="true" className="text-body">
            ⟲
          </span>
        </button>
      )}
    </div>
  );
}
