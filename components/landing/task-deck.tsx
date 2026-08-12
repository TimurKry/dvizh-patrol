'use client';

import dynamic from 'next/dynamic';
import { CardBack } from '@/components/game/card-back';
import { CardTable, type TableCard } from '@/components/game/card-table';
import { TaskTypeIcon } from '@/components/game/task-type-icon';
import { TaskFace } from '@/components/game/task-face';
import { teamColorVars } from '@/lib/team-colors';
import { TASK_CARD_TYPE_TEXT, TASK_MAP_MODE_TEXT } from '@/lib/messages';
import { ringCenter, type PolygonRing } from '@/lib/geo';
import type { ImageFraming, TaskCardType, TaskMapMode } from '@/types/database';
import { cn } from '@/lib/cn';

/**
 * Колода примеров на лендинге.
 *
 * Четыре карточки лежат рубашкой вверх: сверху золотая, под ней
 * три обычных — по одной на каждый тип. Три, а не любимые три:
 * лендинг обещает игру из загадок, фото-повторов и активов, и
 * показать надо все три, иначе обещание не проверяется.
 *
 * **Что показать, решает организатор.** Три слота проставляются в
 * админке у самих заданий, и карточка на главной собирается из
 * настоящих данных: название, текст, картинка со своей рамкой,
 * точка или контур на карте. Раньше примеры были зашиты сюда, и
 * замена «этот пример невыполним» на другой упиралась в выкладку.
 *
 * Зашитые примеры остались запасным вариантом — на случай, когда
 * слоты не проставлены. Пустая витрина на главной хуже показанного
 * по умолчанию: человек видит дыру там, где обещали пример.
 *
 * Механика раскладки живёт в `CardTable` — она же раздаёт руку
 * команды в бою. Здесь только содержимое сторон.
 *
 * **Карта прямо на карточке.** «Куда идти» — половина того, что
 * обещает квест, и на примере это видно лучше, чем в тексте: у
 * фото-повтора крест, у загадки обведённый квартал, у актива карты
 * нет вовсе. Карта грузится только когда карточку открыли: на
 * рубашках её нет, и лендинг не тянет Leaflet ради четырёх
 * закрытых прямоугольников.
 *
 * Гнездо не пустеет: карточка в колоде остаётся лежать рубашкой.
 * Колода — часть картинки, и дыра в ней читалась бы как поломка,
 * а не как «карту достали».
 */

const QuestMap = dynamic(() => import('@/components/game/quest-map').then((m) => m.QuestMap), {
  loading: () => <div className="h-full w-full animate-pulse bg-[#ebebe6]" />,
});

type Example = {
  id: string;
  type: TaskCardType;
  mapMode: TaskMapMode;
  kicker: string;
  title: string;
  text: string;
  points: string;
  number: string;
  image?: string;
  imageBadge?: string;
  framing?: ImageFraming;
  golden?: boolean;
  /** Крест на карте — у фото-повтора. */
  point?: { latitude: number; longitude: number };
  /** Обведённый квартал — у загадки. */
  ring?: PolygonRing;
};

/**
 * Квартал вокруг Наумбургской площади — примерный район загадки.
 *
 * Контур намеренно приблизительный: это витрина, а не боевые
 * координаты. Настоящие районы организатор рисует в админке.
 */
const RIDDLE_RING: PolygonRing = [
  [12.3722, 51.3389],
  [12.3768, 51.3389],
  [12.3773, 51.3418],
  [12.3719, 51.3418],
  [12.3722, 51.3389],
];

const EXAMPLES: Example[] = [
  {
    id: 'golden',
    type: 'active',
    mapMode: 'none',
    kicker: 'Золотое задание / для всех',
    title: 'Обменяйте стикер',
    text: 'Стикер «Движ Лейпциг» — на что-нибудь ценнее. Потом это — на следующее. Меняйтесь весь вечер: чем дальше уйдёте от стикера, тем больше баллов. Что у кого вышло, узнаем на BBQ.',
    points: '???',
    number: '00',
    golden: true,
  },
  {
    id: 'photo',
    type: 'photo',
    mapMode: 'point',
    kicker: 'Фото-повтор / пример',
    title: 'Повторите сцену',
    text: 'У входа в пассаж стоит бронзовая сцена на двоих: один уговаривает, второй слушает. Дойдите до креста и встаньте в те же позы рядом с фигурами.',
    points: '130',
    number: '27',
    image: '/assets/task-example-1.webp',
    imageBadge: 'Фото-эталон',
    point: { latitude: 51.3399, longitude: 12.3757 },
  },
  {
    id: 'riddle',
    type: 'riddle',
    mapMode: 'area',
    kicker: 'Загадка / пример',
    title: 'Тот, кто вписал город в свою книгу',
    text: 'Он приехал сюда студентом, а уехал писателем. Погреб, где он просиживал вечера, попал в его главную книгу и стал знаменит на весь мир. Теперь он стоит неподалёку — в камне.',
    points: '120',
    number: '04',
    ring: RIDDLE_RING,
  },
  {
    id: 'active',
    type: 'active',
    mapMode: 'none',
    kicker: 'Актив / пример',
    title: 'Повторите дорожного рабочего',
    text: 'Найдите треугольный знак дорожных работ — чёрный человечек с лопатой. Двое из команды повторяют его позу рядом со знаком. Знаки переносные, так что точки на карте нет: смотрите по сторонам.',
    points: '50',
    number: '23',
    image: '/assets/task-example-2.webp',
    imageBadge: 'Так выглядит знак',
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

export interface DeckExample {
  id: string;
  cardType: TaskCardType;
  mapMode: TaskMapMode;
  number: number;
  title: string;
  text: string | null;
  points: number;
  latitude: number | null;
  longitude: number | null;
  ring: PolygonRing | null;
  imageUrl: string | null;
  imageBadge: string | null;
  framing: ImageFraming | null;
}

/** Задание из базы — в ту же форму, что и зашитый пример. */
function fromTask(example: DeckExample): Example {
  return {
    id: example.id,
    type: example.cardType,
    mapMode: example.mapMode,
    kicker: `${TASK_CARD_TYPE_TEXT[example.cardType].label} / пример`,
    title: example.title,
    text: example.text ?? '',
    points: String(example.points),
    number: String(example.number),
    image: example.imageUrl ?? undefined,
    imageBadge: example.imageBadge ?? undefined,
    framing: example.framing ?? undefined,
    point:
      example.mapMode === 'point' && example.latitude != null && example.longitude != null
        ? { latitude: example.latitude, longitude: example.longitude }
        : undefined,
    ring: example.mapMode === 'area' && example.ring ? example.ring : undefined,
  };
}

export function TaskDeck({ examples }: { examples?: DeckExample[] }) {
  const chosen =
    examples && examples.length > 0
      ? [EXAMPLES[0]!, ...examples.map(fromTask)]
      : EXAMPLES;

  const cards: TableCard[] = chosen.map((example) => ({
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
        mapMode={example.mapMode}
        kicker={example.kicker}
        title={example.title}
        points={example.points}
        text={example.text}
        place={TASK_MAP_MODE_TEXT[example.mapMode].place}
        image={
          example.image
            ? { src: example.image, badge: example.imageBadge, framing: example.framing }
            : null
        }
        placeholder={example.number}
        status={{ icon: 'available', text: 'Пример', tone: 'available' }}
        golden={example.golden}
        map={
          example.point || example.ring ? (
            <QuestMap
              className="h-[170px] border border-[#d8d8d2]"
              area={null}
              flat
              showPopups={false}
              showLocateButton={false}
              points={[
                {
                  id: example.id,
                  latitude: example.point?.latitude ?? ringCenter(example.ring!).latitude,
                  longitude: example.point?.longitude ?? ringCenter(example.ring!).longitude,
                  label: example.number,
                  title: example.title,
                  ring: example.ring ?? null,
                  kind: example.ring ? 'zone' : 'cross',
                },
              ]}
            />
          ) : null
        }
      />
    ),
  }));

  return (
    <div className="flex flex-col gap-4" style={teamColorVars('pink')}>
      <p className="signal-label text-micro text-muted">
        Три типа заданий и золотое. Нажмите карточку — она перевернётся.
      </p>

      {/* Золотая занимает всю ширину строкой выше остальных: она
          одна на всех, и в ряду с примерами читалась бы как
          четвёртый пример. */}
      <CardTable
        cards={cards}
        className="grid grid-cols-3 gap-3"
        slotClassName="h-[148px]"
        wideSlotClassName="col-span-3 h-[172px] ring-2 ring-[#c9a227]"
        // Шире прежнего: в карточку добавилась карта, и на 330px
        // она превращалась в марку. Только max-width — ширину
        // задаёт `w-full` внутри CardTable, и две утилиты ширины
        // на одном элементе разрешались бы порядком в CSS, а не
        // порядком в разметке.
        openWidthClassName="max-w-[420px]"
      />
    </div>
  );
}
