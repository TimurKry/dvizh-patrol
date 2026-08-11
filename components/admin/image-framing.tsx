'use client';

import { useActionState, useState } from 'react';
import { updateTaskImageFramingAction, type AdminActionState } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { framingStyle } from '@/lib/framing';
import { IMAGE_FITS, type ImageFit, type ImageFraming } from '@/types/database';

/**
 * Выбор видимой зоны картинки.
 *
 * Кадр карточки — 4:3, а картинки приходят разные. До этого любая
 * обрезалась по центру, и у вертикального рисунка из кадра уезжали
 * головы — ровно то, ради чего его и загружали.
 *
 * Слева картинка целиком с меткой фокуса, справа — кадр карточки,
 * какой увидит команда. Клик по левой картинке ставит точку;
 * правая пересчитывается на лету. Промахнуться сложно: видно и
 * куда ткнул, и что из этого вышло.
 *
 * Файл не трогается вовсе. Обрезать оригинал значило бы терять
 * данные при каждой правке рамки и заводить пересжатие на сервере
 * ради того, что браузер делает двумя свойствами CSS.
 */

const INITIAL: AdminActionState = { ok: false };

const FIT_TEXT: Record<ImageFit, { label: string; hint: string }> = {
  cover: {
    label: 'Заполнить кадр',
    hint: 'Картинка закрывает кадр целиком, лишнее обрезается. Точка говорит, что оставить.',
  },
  contain: {
    label: 'Вписать целиком',
    hint: 'Видно всю картинку, по краям остаются поля. Для рисунка и гравюры обычно лучше.',
  },
};

export function ImageFramingEditor({
  imageId,
  url,
  framing,
}: {
  imageId: string;
  url: string;
  framing: ImageFraming;
}) {
  const [state, formAction, pending] = useActionState(updateTaskImageFramingAction, INITIAL);

  const [fit, setFit] = useState<ImageFit>(framing.fit);
  const [focus, setFocus] = useState({ x: framing.focusX, y: framing.focusY });

  const dirty = fit !== framing.fit || focus.x !== framing.focusX || focus.y !== framing.focusY;

  function pick(event: React.MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setFocus({
      x: round((event.clientX - box.left) / box.width),
      y: round((event.clientY - box.top) / box.height),
    });
  }

  /** Стрелками — по проценту за нажатие: мышью так точно не попасть. */
  function nudge(event: React.KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setFocus((current) => ({
      x: round(Math.min(1, Math.max(0, current.x + move[0]))),
      y: round(Math.min(1, Math.max(0, current.y + move[1]))),
    }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t border-hairline pt-3">
      <input type="hidden" name="imageId" value={imageId} />
      <input type="hidden" name="fit" value={fit} />
      <input type="hidden" name="focusX" value={focus.x} />
      <input type="hidden" name="focusY" value={focus.y} />

      <div className="flex flex-wrap gap-2">
        {IMAGE_FITS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFit(value)}
            aria-pressed={fit === value}
            className={
              'signal-label border px-3 py-2 text-micro ' +
              (fit === value
                ? 'border-signal bg-signal text-canvas'
                : 'border-hairline text-muted hover:border-signal hover:text-signal')
            }
          >
            {FIT_TEXT[value].label}
          </button>
        ))}
      </div>

      <p className="text-caption text-faint">{FIT_TEXT[fit].hint}</p>

      {fit === 'cover' && (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="signal-label text-micro text-muted">Ткните, что оставить</span>
            {/* Кнопка обтягивает картинку, а не растягивается на
                колонку. Иначе клик считается от контейнера: у
                картинки с полями по бокам метка уезжает от того
                места, куда ткнули, тем сильнее, чем шире поля. */}
            <button
              type="button"
              onClick={pick}
              onKeyDown={nudge}
              className="relative block w-fit cursor-crosshair overflow-hidden border border-hairline bg-canvas-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              {/* Картинка целиком, без обрезки: выбирать точку по
                  уже обрезанному кадру — значит не видеть того, что
                  как раз и хочется вернуть. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="block max-h-[240px] w-auto max-w-full" />

              <span
                aria-hidden="true"
                className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas bg-signal"
                style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
              />
              <span className="sr-only">
                Точка фокуса: {Math.round(focus.x * 100)} процентов слева,{' '}
                {Math.round(focus.y * 100)} процентов сверху. Стрелками — точнее.
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="signal-label text-micro text-muted">Так будет на карточке</span>
            <div className="aspect-4/3 w-full overflow-hidden border border-signal bg-canvas-deep">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full"
                style={framingStyle({ fit, focusX: focus.x, focusY: focus.y })}
              />
            </div>
          </div>
        </div>
      )}

      {fit === 'contain' && (
        <div className="flex flex-col gap-1">
          <span className="signal-label text-micro text-muted">Так будет на карточке</span>
          <div className="aspect-4/3 w-full max-w-[240px] overflow-hidden border border-signal bg-canvas-deep">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="h-full w-full"
              style={framingStyle({ fit, focusX: focus.x, focusY: focus.y })}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending || !dirty}>
          {pending ? 'Сохраняем…' : 'Сохранить рамку'}
        </Button>
        {state.message && (
          <span className={state.ok ? 'text-caption text-muted' : 'text-caption text-signal'}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

/** Три знака после запятой: столько же хранит колонка. */
function round(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}
