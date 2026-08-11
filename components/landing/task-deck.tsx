'use client';

import { CardBack } from '@/components/game/card-back';
import { CardTable, type TableCard } from '@/components/game/card-table';
import { TaskTypeIcon } from '@/components/game/task-type-icon';
import { TaskFace } from '@/components/game/task-face';
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
 * Сама механика раскладки живёт в `CardTable`: она же раздаёт руку
 * команды в бою. Здесь остаются только содержимое сторон и
 * раскладка гнёзд. Раньше тот же перелёт был написан здесь второй
 * раз — две копии одного поведения расходятся ровно в тот день,
 * когда одну из них чинят.
 *
 * Гнездо не пустеет: карточка в колоде остаётся лежать рубашкой.
 * Колода — часть картинки, и дыра в ней читалась бы как поломка,
 * а не как «карту достали».
 */

type Example = {
  id: string;
  type: TaskCardType;
  kicker: string;
  title: string;
  text: string;
  place: string;
  points: string;
  number: string;
  image?: string;
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
    number: '00',
    golden: true,
  },
  {
    id: 'riddle',
    type: 'riddle',
    kicker: 'Загадка / пример',
    title: 'Самая старая дата',
    text: 'Найдите самую старую дату, выбитую на здании. Где искать — не сказано, но район на карте обведён.',
    place: 'Примерный район',
    points: '70',
    number: '10',
  },
  {
    id: 'photo',
    type: 'photo',
    kicker: 'Фото-повтор / пример',
    title: 'Повторите скульптуру',
    text: 'Дойдите до креста на карте и повторите позу как можно точнее — всей командой.',
    place: 'Точка на карте',
    points: '180',
    number: '04',
    image: '/assets/task-example-1.webp',
  },
  {
    id: 'active',
    type: 'active',
    kicker: 'Актив / пример',
    title: 'Пять жёлтых',
    text: 'Найдите пять жёлтых предметов и снимите их одним кадром. Ничего покупать не нужно.',
    place: 'Где угодно в поле',
    points: '120',
    number: '07',
    image: '/assets/task-example-2.webp',
  },
];

/** Золотая рубашка золотая, а не командная: назвать карточку
    золотой и покрасить в общий цвет — значит сказать одно, а
    показать другое. Переменные подменяются точечно, палитра
    команд не трогается. */
const GOLD_VARS = {
  '--team-color': '#c9a227',
  '--team-on-color': '#1c1503',
} as React.CSSProperties;

export function TaskDeck() {
  const cards: TableCard[] = EXAMPLES.map((example) => ({
    id: example.id,
    label: `Открыть пример: ${example.title}`,
    title: example.title,
    wide: example.golden,
    back: (
      <span className="block h-full" style={example.golden ? GOLD_VARS : undefined}>
        <CardBack
          caption={example.golden ? 'Золотая' : undefined}
          hint={example.golden ? 'Одна на всех' : undefined}
          mark={example.golden ? undefined : <TaskTypeIcon type={example.type} size={34} />}
          className={cn('h-full', example.golden && 'border-[#8a6f14]')}
        />
      </span>
    ),
    openBack: <CardBack caption="Движ-Патруль" hint="Рубашка красится в цвет команды" />,
    front: (
      <TaskFace
        type={example.type}
        kicker={example.kicker}
        title={example.title}
        points={example.points}
        text={example.text}
        place={example.place}
        image={example.image ? { src: example.image, badge: 'Фото-эталон' } : null}
        placeholder={example.number}
        status={{ icon: 'available', text: 'Пример', tone: 'available' }}
        golden={example.golden}
      />
    ),
  }));

  return (
    <div className="flex flex-col gap-4" style={teamColorVars('pink')}>
      <p className="signal-label text-micro text-muted">
        Четыре примера. Нажмите карточку — она перевернётся.
      </p>

      {/* Золотая занимает всю ширину строкой выше остальных: она
          одна на всех, и в ряду с примерами читалась бы как
          четвёртый пример. */}
      <CardTable
        cards={cards}
        className="grid grid-cols-3 gap-3"
        slotClassName="h-[148px]"
        wideSlotClassName="col-span-3 h-[172px] ring-2 ring-[#c9a227]"
        openWidthClassName="max-w-[330px]"
      />
    </div>
  );
}
