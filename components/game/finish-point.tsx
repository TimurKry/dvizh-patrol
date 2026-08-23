'use client';

import dynamic from 'next/dynamic';
import { Icon } from '@/components/ui/icon';

/**
 * Куда идти, когда игра закончилась.
 *
 * Квест заканчивается не таблицей результатов, а тем, что все
 * встречаются в одном месте и идут дальше вместе. Раньше об этом
 * было написано только на лендинге — то есть там, где участник в
 * конце игры точно не находится: он стоит на улице с телефоном, на
 * котором открыты «Задания», и на них появлялась одна строчка
 * «Квест завершён».
 *
 * Блок закрыт до конца игры. Адрес сбора посреди квеста только
 * отвлекает, а любопытным подсказывает, в какой стороне финиш.
 *
 * Карта грузится отдельным куском: до финиша она никому не нужна,
 * и тянуть Leaflet весь вечер незачем.
 */

const QuestMap = dynamic(() => import('@/components/game/quest-map').then((m) => m.QuestMap), {
  loading: () => <div className="h-[220px] w-full animate-pulse bg-hairline" />,
});

export interface FinishPlace {
  latitude: number | null;
  longitude: number | null;
  title: string | null;
  address: string | null;
  note: string | null;
  /** Уже отформатировано в поясе мероприятия. */
  time: string | null;
}

/** Есть ли что показывать вообще. */
export function hasFinishPlace(place: FinishPlace): boolean {
  return Boolean(
    place.title || place.address || place.note || place.time || place.latitude !== null,
  );
}

export function FinishPoint({ place }: { place: FinishPlace }) {
  if (!hasFinishPlace(place)) return null;

  const hasPoint = place.latitude !== null && place.longitude !== null;

  return (
    <section className="border border-signal bg-panel" aria-labelledby="finish-heading">
      <div className="flex flex-col gap-3 p-5">
        <p className="signal-label flex items-center gap-2 text-micro text-signal">
          <Icon name="finish" size={14} />
          Сбор после игры
        </p>

        <h2 id="finish-heading" className="text-title">
          {place.title ?? 'Встречаемся все вместе'}
        </h2>

        {(place.address || place.time) && (
          <dl className="flex flex-col gap-1 text-body">
            {place.address && (
              <div className="flex gap-2">
                <dt className="sr-only">Адрес</dt>
                <dd className="text-muted">{place.address}</dd>
              </div>
            )}
            {place.time && (
              <div className="flex gap-2">
                <dt className="text-muted">Во сколько:</dt>
                <dd className="text-ink">{place.time}</dd>
              </div>
            )}
          </dl>
        )}

        {place.note && <p className="whitespace-pre-line text-body text-muted">{place.note}</p>}
      </div>

      {hasPoint && (
        <QuestMap
          className="h-[220px] border-t border-hairline"
          area={null}
          flat
          showPopups={false}
          points={[
            {
              id: 'finish',
              latitude: place.latitude!,
              longitude: place.longitude!,
              label: '★',
              title: place.title ?? 'Место сбора',
              kind: 'cross',
            },
          ]}
        />
      )}
    </section>
  );
}
