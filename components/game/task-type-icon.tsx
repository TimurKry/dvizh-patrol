import { cn } from '@/lib/cn';
import type { TaskCardType } from '@/types/database';

/**
 * Знаки трёх типов заданий.
 *
 * Раньше типы обозначались символами `?`, `□` и `↗`. Знак вопроса
 * читался, остальные два — нет: квадрат ничего не говорит про
 * фотографию, а стрелка вверх-вправо на карточке уже занята
 * значением «открыть». Теперь у каждого типа свой рисунок:
 * вопрос, фотоаппарат, бегущие человечки.
 *
 * Рисунки в одной сетке 24×24 и одной толщине штриха, поэтому
 * стоят в ряд ровно. Цвет наследуется от `currentColor` — один и
 * тот же знак живёт и на светлой лицевой стороне карточки, и на
 * тёмной полосе руки.
 */

export function TaskTypeIcon({
  type,
  size = 24,
  className,
}: {
  type: TaskCardType;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    className: cn('shrink-0', className),
    'aria-hidden': true,
    focusable: false,
  } as const;

  if (type === 'riddle') {
    // Знак вопроса рисунком, а не текстом: в тексте он зависит от
    // шрифта и в Unbounded заметно уезжает вверх от центра.
    return (
      <svg {...common}>
        <path
          d="M8.6 8.4a3.5 3.5 0 1 1 4.9 3.2c-1 .5-1.5 1.2-1.5 2.2v.7"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <circle cx="12" cy="18.4" r="1.35" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'photo') {
    return (
      <svg {...common}>
        <path
          d="M3 8.6h3.4L8 6.2h8l1.6 2.4H21v10.2H3V8.6Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="13.3" r="3.4" stroke="currentColor" strokeWidth="1.9" />
      </svg>
    );
  }

  // active — двое бегущих: задание делают, а не снимают.
  return (
    <svg {...common}>
      <circle cx="15.4" cy="4.9" r="2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M16.6 9.2 12.9 11l1.3 3.4-1.2 5.4M14.2 14.4l3.6 1.4 1.2 3.6M12.9 11l-2.6 2.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 9.4h4.2M2 13.2h3.4M4 17h3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Мелкий значок рядом со строкой о месте: крест, район или ничего.
 *
 * Крест — тот же, что и на карте. Повторение намеренное: человек
 * читает «точка на карте», видит крест и потом находит его же
 * среди тайлов, не гадая, что из значков относится к его заданию.
 */
export function PlaceMark({ type, className }: { type: TaskCardType; className?: string }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 14 14',
    fill: 'none',
    className: cn('shrink-0', className),
    'aria-hidden': true,
    focusable: false,
  } as const;

  if (type === 'photo') {
    return (
      <svg {...common}>
        <path
          d="M2.5 2.5 11.5 11.5M11.5 2.5 2.5 11.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === 'riddle') {
    return (
      <svg {...common}>
        <circle
          cx="7"
          cy="7"
          r="5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeDasharray="2.4 2.6"
        />
      </svg>
    );
  }

  // Актив к месту не привязан — рисовать нечего, но пустое место
  // в ряду сохраняем, чтобы строки не прыгали по вертикали.
  return (
    <svg {...common}>
      <path d="M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
