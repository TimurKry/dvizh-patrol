'use client';

import Link from 'next/link';
import { CardBack } from './card-back';
import { CardTable, type TableCard } from './card-table';
import { TaskFace, type FaceTone } from './task-face';
import { TaskTypeIcon } from './task-type-icon';
import { TASK_CARD_TYPE_TEXT, TASK_MAP_MODE_TEXT, attemptsWord } from '@/lib/messages';
import type { IconName } from '@/components/ui/icon';
import type { TaskWithState } from '@/lib/data/tasks';
import { cn } from '@/lib/cn';

/**
 * Рука команды — расклад карт на столе.
 *
 * Шесть карт лежат рубашками вверх, каждая со знаком своего типа.
 * Нажатие вынимает карту: она летит к зрителю, переворачивается и
 * открывается целиком, с фото-эталоном и кнопкой «Открыть».
 *
 * До этого рука была списком развёрнутых карточек в сетке. Всё
 * работало, но читалось как таблица: глаз шёл сверху вниз и брал
 * первую попавшуюся. Рубашками вверх выбор становится выбором —
 * человек видит расклад целиком, а не проглядывает перечень.
 *
 * Знак типа на рубашке оставлен намеренно. Прятать ещё и тип было
 * бы честнее к метафоре, но вреднее для игры: команда должна
 * решать, куда идти, до того как откроет карту, а не открывать
 * всё подряд, чтобы посмотреть.
 */

const STATE: Record<TaskWithState['state'], { text: string; icon: IconName; tone: FaceTone }> = {
  available: { text: 'Доступно', icon: 'available', tone: 'available' },
  rejected: { text: 'Не принято', icon: 'rejected', tone: 'available' },
  in_review: { text: 'На проверке', icon: 'checking', tone: 'checking' },
  accepted: { text: 'Забрали', icon: 'taken', tone: 'claimed' },
  claimed_by_other: { text: 'Забрала другая', icon: 'cancelled', tone: 'dim' },
  attempts_exhausted: { text: 'Попытки кончились', icon: 'exhausted', tone: 'dim' },
};

export function TaskHand({
  items,
  frozen = false,
}: {
  items: TaskWithState[];
  /**
   * Рука альфа-теста: карточки не меняются, отыгранные остаются.
   *
   * Нужно ради одного слова. «Забрали» на настоящей игре значит
   * «это задание теперь наше, у остальных его нет» — там это и
   * есть главное. У альфы задание из пула не уходит, и то же
   * слово стало бы неправдой; ей карточка помечается просто
   * выполненной.
   */
  frozen?: boolean;
}) {
  const cards: TableCard[] = items.map((item) => {
    const { task, state, attemptsLeft, referenceImageUrl, referenceFraming } = item;
    const type = TASK_CARD_TYPE_TEXT[task.card_type];
    const gone = state === 'claimed_by_other';
    const shown =
      frozen && state === 'accepted'
        ? { ...STATE.accepted, text: 'Выполнено' }
        : STATE[state];

    return {
      id: task.id,
      label: `Открыть карточку: ${task.title}`,
      wide: false,
      back: (
        <CardBack
          className={cn('h-full', gone && 'opacity-60')}
          mark={<TaskTypeIcon type={task.card_type} size={38} />}
          hint={state === 'available' ? undefined : shown.text}
        />
      ),
      front: (
        <TaskFace
          type={task.card_type}
          kicker={`${type.label} / №${task.number}`}
          title={task.title}
          points={String(task.points)}
          text={task.short_description}
          mapMode={task.map_mode}
          place={TASK_MAP_MODE_TEXT[task.map_mode].place}
          image={
            referenceImageUrl
              ? {
                  src: referenceImageUrl,
                  badge: task.image_caption ?? undefined,
                  framing: referenceFraming,
                }
              : null
          }
          placeholder={String(task.number)}
          attemptsLine={
            state !== 'accepted' && !gone && attemptsLeft > 0
              ? `${attemptsLeft} ${attemptsWord(attemptsLeft)}`
              : null
          }
          // «Доступно» не пишем: на руке недоступных карточек не
          // бывает, они с неё уходят. Плашка появляется только
          // там, где состояние правда что-то меняет.
          status={state === 'available' ? null : shown}
          accepted={state === 'accepted'}
          actions={
            gone ? null : (
              <Link
                href={`/tasks/${task.id}`}
                className={cn(
                  'flex min-h-[44px] items-center justify-center border border-[#060609]',
                  'bg-[#060609] text-[#f5f5f1] hover:border-signal hover:bg-signal hover:text-canvas',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
                )}
              >
                <span className="signal-label text-micro">Открыть задание</span>
              </Link>
            )
          }
        />
      ),
    };
  });

  return (
    <CardTable
      cards={cards}
      // Три в ряд на телефоне: расклад должен помещаться на экран
      // целиком, иначе это снова список с прокруткой. Пропорция
      // близка к игральной карте.
      className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
      slotClassName="aspect-[3/4]"
      closeLabel="Вернуть в колоду"
    />
  );
}
