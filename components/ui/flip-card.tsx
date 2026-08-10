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
 * это анимация раскладки, которой в системе нет. Побочный
 * эффект полезный: высоту задаёт та сторона, которая выше, и
 * ничего не обрезается.
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
 *
 * Стороны можно передать функцией и получить `toggle` внутрь —
 * тогда кнопка переворота встаёт в поток разметки рядом с
 * остальными действиями, а не висит поверх содержимого.
 */

export interface FlipApi {
  flipped: boolean;
  toggle: () => void;
  /** id тела карточки — для `aria-controls` на своей кнопке. */
  controls: string;
}

type Side = ReactNode | ((api: FlipApi) => ReactNode);

const render = (side: Side, api: FlipApi): ReactNode =>
  typeof side === 'function' ? side(api) : side;

export function FlipCard({
  front,
  back,
  /** Что читает скринридер на встроенной кнопке переворота. */
  flipLabel = 'Перевернуть карточку',
  /** Своя кнопка в разметке сторон — встроенную не рисуем. */
  ownTrigger = false,
  className,
  bodyClassName,
}: {
  front: Side;
  back: Side;
  flipLabel?: string;
  ownTrigger?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const bodyId = useId();

  const api: FlipApi = {
    flipped,
    toggle: () => setFlipped((value) => !value),
    controls: bodyId,
  };

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
          api.toggle();
        }}
      >
        <div className="flip-face" aria-hidden={flipped} inert={flipped}>
          {render(front, api)}
        </div>
        <div className="flip-face flip-face-back" aria-hidden={!flipped} inert={!flipped}>
          {render(back, api)}
        </div>
      </div>

      {!ownTrigger && (
        <button
          type="button"
          onClick={api.toggle}
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

/** Кнопка переворота в потоке разметки. Вид задаёт вызывающий. */
export function FlipButton({
  api,
  label,
  className,
}: {
  api: FlipApi;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={api.toggle}
      aria-pressed={api.flipped}
      aria-controls={api.controls}
      className={cn(
        'tap-target flex items-center justify-center',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="text-body">
        ⟲
      </span>
    </button>
  );
}
