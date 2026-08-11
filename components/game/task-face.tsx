import type { ReactNode } from 'react';
import { PlaceMark, TaskTypeIcon } from './task-type-icon';
import { Icon, type IconName } from '@/components/ui/icon';
import { framingStyle } from '@/lib/framing';
import type { ImageFraming, TaskCardType, TaskMapMode } from '@/types/database';
import { cn } from '@/lib/cn';

/**
 * Лицевая сторона игровой карточки · Figma 99:50.
 *
 * Вынесена из `TaskCard` отдельным компонентом, чтобы витрина на
 * лендинге показывала ту же карточку, что увидит команда, а не
 * похожую. Раньше на лендинге лежала своя разметка «в общих
 * чертах», и она успела разойтись с боевой по трём мелочам за
 * две недели. Разметка одна, данные разные.
 *
 * Компонент презентационный: принимает готовые строки, ничего не
 * знает ни про базу, ни про состояние отправки. Считать «сколько
 * попыток осталось» — работа того, кто его вызывает.
 */

export type FaceTone = 'available' | 'checking' | 'claimed' | 'dim';

const TONE_FOOTER: Record<FaceTone, string> = {
  available: 'border-[#87877f] text-[#060609]',
  checking: 'border-[#87877f] border-dashed text-[#5c5c63]',
  claimed: 'border-signal bg-signal text-canvas',
  dim: 'border-[#87877f] text-[#66666d]',
};

export function TaskFace({
  type,
  mapMode = 'none',
  kicker,
  title,
  points,
  text,
  place,
  image,
  placeholder,
  attemptsLine,
  status,
  actions,
  golden = false,
  accepted = false,
}: {
  type: TaskCardType;
  /** Что задание обещает про карту. Отдельно от типа — см. 0014. */
  mapMode?: TaskMapMode;
  /** «Загадка / №10» — тип и номер одной строкой. */
  kicker: string;
  title: string;
  /** Уже отформатированные баллы: «180» или «???». */
  points: string;
  text?: string | null;
  place: string;
  /**
   * Картинка карточки. Приходит по подписанной ссылке — не
   * оптимизируем. `framing` решает, как она ложится в кадр 4:3:
   * заполнить с обрезкой или вписать целиком.
   */
  image?: { src: string; badge?: string; framing?: ImageFraming | null } | null;
  /** Что показать вместо фото: обычно номер задания. */
  placeholder?: string;
  attemptsLine?: string | null;
  status: { icon: IconName; text: string; tone: FaceTone };
  /** Кнопки внизу: «Открыть», переворот, «Закрыть» — по месту. */
  actions?: ReactNode;
  golden?: boolean;
  accepted?: boolean;
}) {
  return (
    <article
      className={cn(
        'flex h-full flex-col gap-3 overflow-hidden rounded-[8px] border p-4',
        golden
          ? 'border-[#c9a227] bg-[#f7f2e2] text-[#060609]'
          : cn('bg-[#f5f5f1] text-[#060609]', accepted ? 'border-signal' : 'border-hairline'),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center border',
            golden ? 'border-[#8a6f14] text-[#8a6f14]' : 'border-[#060609]',
          )}
        >
          <TaskTypeIcon type={type} size={24} />
        </span>
        <span
          className={cn(
            'display-figure px-3 py-2 text-title',
            golden ? 'bg-[#8a6f14] text-[#f7f2e2]' : 'bg-[#060609] text-[#f5f5f1]',
          )}
        >
          {points}
          <span aria-hidden="true" className="ml-1 text-micro">
            Б
          </span>
        </span>
      </div>

      <p className={cn('signal-label text-micro', golden ? 'text-[#8a6f14]' : 'text-[#5c5c63]')}>
        {kicker}
      </p>

      <h3 className="font-display text-title font-bold uppercase text-[#060609]">{title}</h3>

      {image ? (
        <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden bg-[#060609]">
          {/* Эталон приходит по подписанной ссылке с ограниченным
              сроком, оптимизатор next/image её кэшировать не должен. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt=""
            loading="lazy"
            className="h-full w-full"
            style={framingStyle(image.framing)}
          />
          {image.badge && (
            <span className="signal-label absolute top-2 left-2 bg-[#060609] px-2 py-1 text-micro text-[#f5f5f1]">
              {image.badge}
            </span>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'flex aspect-4/3 w-full shrink-0 items-center justify-center',
            golden ? 'bg-[#ece3c6]' : 'bg-[#ebebe6]',
          )}
        >
          <span
            className={cn(
              'display-figure text-display',
              golden ? 'text-[#c2ab6b]' : 'text-[#a8a8a3]',
            )}
            aria-hidden="true"
          >
            {placeholder}
          </span>
        </div>
      )}

      {text && <p className="clamp-3 text-caption text-[#5c5c63]">{text}</p>}

      {/* Что тип обещает про место. Строка нужна до того, как
          команда решит брать карточку: «точка на карте» и «где
          угодно» — это разные решения о том, куда идти. */}
      <p className="signal-label flex items-center gap-1.5 text-micro text-[#5c5c63]">
        <PlaceMark mode={mapMode} />
        {place}
      </p>

      <div className="mt-auto flex flex-col gap-2">
        {attemptsLine && <p className="signal-label text-micro text-[#66666d]">{attemptsLine}</p>}

        <p
          className={cn(
            'flex min-h-[44px] items-center justify-center gap-2 border',
            TONE_FOOTER[status.tone],
          )}
        >
          <span className={cn(status.tone === 'checking' && 'anim-tick')}>
            <Icon name={status.icon} size={15} />
          </span>
          <span className="signal-label text-micro">{status.text}</span>
        </p>

        {actions}
      </div>
    </article>
  );
}
