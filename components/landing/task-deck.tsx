'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CardBack } from '@/components/game/card-back';
import { PlaceMark, TaskTypeIcon } from '@/components/game/task-type-icon';
import { teamColorVars } from '@/lib/team-colors';
import type { TaskCardType } from '@/types/database';
import { cn } from '@/lib/cn';

/**
 * Колода примеров на лендинге.
 *
 * Четыре карточки лежат рубашкой вверх: сверху золотая, под ней
 * три обычных. Нажатие вынимает карточку из колоды — она едет к
 * зрителю и переворачивается лицом; «Закрыть» возвращает её на
 * место.
 *
 * Три вещи, которые стоит объяснить.
 *
 * **Карточка не «раздувается на месте», а летит из своего гнезда.**
 * Приём известный (FLIP): открытая карточка рисуется поверх
 * страницы сразу в конечном размере, но первым кадром ей
 * подставляется трансформация, совмещающая её с исходным
 * гнездом. Со следующего кадра трансформация снимается, и
 * браузер сам доводит карточку до места. Только `transform`,
 * никакой анимации ширины и высоты.
 *
 * **Перелёт и переворот — одно движение.** Внешний слой везёт
 * карточку, внутренний крутит `rotateY`. Разложить их по двум
 * элементам пришлось потому, что смешивать в одной трансформации
 * `scale` и `rotateY` — значит получить перспективу, гуляющую по
 * ходу полёта.
 *
 * **Гнездо не пустеет.** Карточка в колоде остаётся лежать
 * рубашкой: колода — часть картинки, и дыра в ней читалась бы как
 * поломка, а не как «карту достали».
 */

type Example = {
  id: string;
  type: TaskCardType;
  kicker: string;
  title: string;
  text: string;
  place: string;
  points: string;
  golden?: boolean;
};

const EXAMPLES: Example[] = [
  {
    id: 'golden',
    type: 'active',
    kicker: 'Золотое задание / для всех',
    title: 'Обменяйте стикер',
    text: 'Стикер «Движ Лейпциг» — на что-нибудь ценнее. Потом это — на следующее. Меняйтесь весь вечер: чем дальше уйдёте от стикера, тем больше баллов. Что у кого вышло, узнаем на BBQ.',
    place: 'Где угодно в поле',
    points: '???',
    golden: true,
  },
  {
    id: 'riddle',
    type: 'riddle',
    kicker: 'Загадка / пример',
    title: 'Самая старая дата',
    text: 'Найдите самую старую дату, выбитую на здании. Где искать — не сказано, но район на карте обведён.',
    place: 'Примерный район',
    points: '70 Б*',
  },
  {
    id: 'photo',
    type: 'photo',
    kicker: 'Фото-повтор / пример',
    title: 'Повторите скульптуру',
    text: 'Дойдите до креста на карте и повторите позу как можно точнее — всей командой.',
    place: 'Точка на карте',
    points: '180 Б*',
  },
  {
    id: 'active',
    type: 'active',
    kicker: 'Актив / пример',
    title: 'Пять жёлтых',
    text: 'Найдите пять жёлтых предметов и снимите их одним кадром. Ничего покупать не нужно.',
    place: 'Где угодно в поле',
    points: '120 Б*',
  },
];

/** Совмещение открытой карточки с её гнездом первым кадром. */
function deltaTransform(from: DOMRect, to: DOMRect): string {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = from.width / to.width;
  return `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
}

export function TaskDeck() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const slots = useRef(new Map<string, HTMLButtonElement | null>());
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);

  const open = EXAMPLES.find((e) => e.id === openId) ?? null;

  const close = useCallback(() => {
    setOpenId(null);
    setSettled(false);
    // Фокус возвращается на ту карточку, с которой ушёл: иначе
    // после закрытия он падает в начало страницы, и человек с
    // клавиатуры теряет место в колоде.
    returnFocus.current?.focus();
  }, []);

  // Первый кадр открытой карточки — в гнезде, дальше сама доедет.
  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;

    const slot = slots.current.get(open.id);
    const node = cardRef.current;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!slot || reduced) {
      setSettled(true);
      return;
    }

    node.style.transform = deltaTransform(slot.getBoundingClientRect(), node.getBoundingClientRect());
    const id = requestAnimationFrame(() => {
      node.style.transform = '';
      setSettled(true);
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <div className="flex flex-col gap-4" style={teamColorVars('pink')}>
      <p className="signal-label text-micro text-muted">
        Четыре примера. Нажмите карточку — она перевернётся.
      </p>

      {/* ═══ Колода ═══════════════════════════════════════ */}
      <div className="flex flex-col gap-3">
        {EXAMPLES.map((example) =>
          example.golden ? (
            <DeckSlot
              key={example.id}
              example={example}
              tall
              onOpen={(node) => {
                returnFocus.current = node;
                setOpenId(example.id);
              }}
              register={(node) => slots.current.set(example.id, node)}
            />
          ) : null,
        )}

        <div className="grid grid-cols-3 gap-3">
          {EXAMPLES.filter((e) => !e.golden).map((example) => (
            <DeckSlot
              key={example.id}
              example={example}
              onOpen={(node) => {
                returnFocus.current = node;
                setOpenId(example.id);
              }}
              register={(node) => slots.current.set(example.id, node)}
            />
          ))}
        </div>
      </div>

      {/* ═══ Открытая карточка ════════════════════════════ */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Закрыть карточку"
            onClick={close}
            className="absolute inset-0 bg-canvas/85"
          />

          <div
            ref={cardRef}
            className={cn(
              'relative w-full max-w-[330px] origin-center',
              settled && 'transition-transform duration-[420ms] ease-out motion-reduce:transition-none',
            )}
          >
            <div className="flip-scene">
              <div className="flip-body" data-flipped={settled ? 'false' : 'true'}>
                <div className="flip-face">
                  <OpenCard example={open} />
                </div>
                <div className="flip-face flip-face-back" aria-hidden="true">
                  <CardBack caption="Движ-Патруль" hint="Рубашка красится в цвет команды" />
                </div>
              </div>
            </div>

            <button
              ref={closeRef}
              type="button"
              onClick={close}
              className="lift mt-3 inline-flex min-h-[44px] w-full items-center justify-center border border-ink bg-canvas px-4 text-caption uppercase text-ink hover:border-signal hover:text-signal"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Гнездо в колоде: рубашка, по которой нажимают. */
function DeckSlot({
  example,
  tall,
  onOpen,
  register,
}: {
  example: Example;
  tall?: boolean;
  onOpen: (node: HTMLButtonElement) => void;
  register: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={register}
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className={cn(
        'lift relative block w-full overflow-hidden rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
        tall ? 'h-[168px]' : 'h-[132px]',
        example.golden && 'ring-2 ring-[#c9a227]',
      )}
    >
      {/* Рубашка золотой карточки золотая, а не командная: назвать
          её золотой и покрасить в тот же цвет, что и остальные, —
          значит сказать одно, а показать другое. Переменные
          подменяются точечно, палитра команд не трогается. */}
      <span
        className="block h-full"
        style={
          example.golden
            ? ({ '--team-color': '#c9a227', '--team-on-color': '#1c1503' } as React.CSSProperties)
            : undefined
        }
      >
        <CardBack
          caption={example.golden ? 'Золотая' : 'Движ'}
          hint={example.golden ? 'Одна на всех' : undefined}
          className={cn('h-full', example.golden && 'border-[#8a6f14]')}
        />
      </span>
      <span className="sr-only">Открыть пример: {example.title}</span>
    </button>
  );
}

/** Лицевая сторона открытой карточки. */
function OpenCard({ example }: { example: Example }) {
  return (
    <article
      className={cn(
        'flex h-full flex-col gap-3 rounded-[8px] border p-5',
        example.golden
          ? 'border-[#c9a227] bg-[#f7f2e2] text-[#060609]'
          : 'border-hairline bg-[#f5f5f1] text-[#060609]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center border',
            example.golden ? 'border-[#8a6f14] text-[#8a6f14]' : 'border-[#060609]',
          )}
        >
          <TaskTypeIcon type={example.type} size={24} />
        </span>
        <span
          className={cn(
            'display-figure px-3 py-2 text-title',
            example.golden ? 'bg-[#8a6f14] text-[#f7f2e2]' : 'bg-[#060609] text-[#f5f5f1]',
          )}
        >
          {example.points}
        </span>
      </div>

      <p
        className={cn(
          'signal-label text-micro',
          example.golden ? 'text-[#8a6f14]' : 'text-[#5c5c63]',
        )}
      >
        {example.kicker}
      </p>

      <h3 className="font-display text-title font-bold uppercase">{example.title}</h3>

      <p className="text-caption text-[#5c5c63]">{example.text}</p>

      <p className="signal-label mt-auto flex items-center gap-1.5 text-micro text-[#5c5c63]">
        <PlaceMark type={example.type} />
        {example.place}
      </p>
    </article>
  );
}
