'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * Карты на столе.
 *
 * Раскладка рубашками вверх; нажатие вынимает карту из гнезда —
 * она летит к зрителю и переворачивается лицом. «Закрыть»
 * возвращает её на место.
 *
 * Почему так, а не списком лицом вверх. Шесть развёрнутых карточек
 * подряд читаются как таблица: глаз идёт сверху вниз и берёт
 * первую. Рубашками вверх карта становится выбором — человек
 * смотрит на расклад целиком, а не проглядывает список. Это и есть
 * разница между «списком заданий» и игрой.
 *
 * Механика вынесена сюда, потому что она нужна дважды: витрине на
 * лендинге и настоящей руке команды. Раскладка и содержимое сторон
 * у них разные, поведение — одно.
 *
 * Три решения, которые стоит объяснить.
 *
 * **Карта летит из своего гнезда, а не раздувается на месте.**
 * Приём FLIP: открытая карта рисуется поверх страницы сразу в
 * конечном размере, но первым кадром ей подставляется
 * трансформация, совмещающая её с гнездом. Со следующего кадра
 * трансформация снимается, и браузер сам доводит карту до места.
 * Только `transform` — ни ширина, ни высота не анимируются.
 *
 * **Перелёт и переворот разложены по двум элементам.** Внешний
 * везёт, внутренний крутит `rotateY`. В одной трансформации
 * `scale` и `rotateY` дают перспективу, гуляющую по ходу полёта.
 *
 * **Окно живёт в портале у `body`.** Модальное окно не должно
 * зависеть от стилей предков: `will-change` или `transform` на
 * любой секции выше делает элемент содержащим блоком для
 * `position: fixed`, и «на весь экран» превращается в «на весь
 * блок секции». Один раз уже наступили.
 */

export interface TableCard {
  id: string;
  /** Что видно в раскладке — рубашка. */
  back: ReactNode;
  /** Что открывается по нажатию. */
  front: ReactNode;
  /** Для скринридера на гнезде: «Открыть карточку …». */
  label: string;
  /** Заголовок открытого окна. По умолчанию — `label`. */
  title?: string;
  /** Рубашка на обороте открытой карты — во время переворота. */
  openBack?: ReactNode;
  /** Крупнее остальных: золотая карта в витрине. */
  wide?: boolean;
}

/** Совмещение открытой карты с её гнездом первым кадром. */
function deltaTransform(from: DOMRect, to: DOMRect): string {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = from.width / to.width;
  return `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
}

export function CardTable({
  cards,
  slotClassName,
  wideSlotClassName,
  className,
  openWidthClassName = 'max-w-[340px]',
  closeLabel = 'Закрыть',
}: {
  cards: TableCard[];
  /** Размер гнезда в раскладке. */
  slotClassName: string;
  /** Размер гнезда для `wide`-карты. */
  wideSlotClassName?: string;
  className?: string;
  openWidthClassName?: string;
  closeLabel?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  // Цвет команды для окна: см. `teamVars` ниже.
  const [teamVars, setTeamVars] = useState<CSSProperties>({});

  const slots = useRef(new Map<string, HTMLButtonElement | null>());
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);

  const open = cards.find((c) => c.id === openId) ?? null;

  const close = useCallback(() => {
    setOpenId(null);
    setSettled(false);
    // Фокус возвращается на то гнездо, с которого ушёл: иначе после
    // закрытия он падает в начало страницы, и человек с клавиатуры
    // теряет место в раскладке.
    returnFocus.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;

    const slot = slots.current.get(open.id);
    const node = cardRef.current;

    // Цвет команды снимается с гнезда и переносится в окно.
    //
    // `--team-color` объявлен на секции страницы, а окно живёт в
    // портале у `body` — вне этой секции и потому вне каскада.
    // Рубашка внутри окна брала значение по умолчанию, и во время
    // переворота карта на мгновение меняла цвет. Значение читается
    // с гнезда, а не приходит пропсом: так же работает золотая
    // карта в витрине, у которой цвет свой.
    if (slot) {
      const style = getComputedStyle(slot);
      setTeamVars({
        '--team-color': style.getPropertyValue('--team-color'),
        '--team-on-color': style.getPropertyValue('--team-on-color'),
      } as CSSProperties);
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!slot || reduced) {
      setSettled(true);
      return;
    }

    node.style.transform = deltaTransform(
      slot.getBoundingClientRect(),
      node.getBoundingClientRect(),
    );
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
    <div className={className}>
      {cards.map((card) => (
        <button
          key={card.id}
          ref={(node) => {
            slots.current.set(card.id, node);
          }}
          type="button"
          onClick={(e) => {
            returnFocus.current = e.currentTarget;
            setOpenId(card.id);
          }}
          className={cn(
            'lift relative block w-full overflow-hidden rounded-[8px]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
            card.wide ? (wideSlotClassName ?? slotClassName) : slotClassName,
          )}
        >
          {card.back}
          <span className="sr-only">{card.label}</span>
        </button>
      ))}

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={open.title ?? open.label}
            className="fixed inset-0 z-50"
            style={teamVars}
          >
            <button
              type="button"
              aria-label="Закрыть карточку"
              onClick={close}
              className="fixed inset-0 bg-canvas/85"
            />

            {/* Карточка с фото-эталоном выше экрана телефона.
                Прокручиваемая обёртка с центрированием по
                min-h-full: короткая стоит по центру, длинная
                листается целиком вместе с кнопкой. */}
            <div className="absolute inset-0 overflow-y-auto overscroll-contain">
              <div className="flex min-h-full items-center justify-center p-4">
                <div
                  ref={cardRef}
                  className={cn(
                    'relative w-full origin-center',
                    openWidthClassName,
                    settled &&
                      'transition-transform duration-[420ms] ease-out motion-reduce:transition-none',
                  )}
                >
                  <div className="flip-scene">
                    <div className="flip-body" data-flipped={settled ? 'false' : 'true'}>
                      <div className="flip-face">{open.front}</div>
                      <div className="flip-face flip-face-back" aria-hidden="true">
                        {open.openBack ?? open.back}
                      </div>
                    </div>
                  </div>

                  <button
                    ref={closeRef}
                    type="button"
                    onClick={close}
                    className="lift mt-3 inline-flex min-h-[44px] w-full items-center justify-center border border-ink bg-canvas px-4 text-caption uppercase text-ink hover:border-signal hover:text-signal"
                  >
                    {closeLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
