'use client';

import { useEffect, useState } from 'react';
import type { EventStatus } from '@/types/database';

/**
 * Обратный отсчёт до старта.
 *
 * Целевое время приходит с сервера в UTC, поэтому переведённые
 * или сбитые часы телефона влияют только на отображаемую
 * длительность, но никогда — на реальные права: можно ли
 * отправлять фотографии, решает сервер.
 *
 * До монтирования компонент ничего не рендерит, иначе разметка
 * сервера и клиента разойдётся.
 */

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ target, status }: { target: string; status: EventStatus }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const targetMs = new Date(target).getTime();
    const tick = () => setRemaining(targetMs - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (remaining === null) {
    return <div className="h-[68px]" aria-hidden="true" />;
  }

  if (remaining <= 0) {
    return (
      <p className="text-body text-stone" role="status">
        {status === 'live' ? 'Квест идёт прямо сейчас.' : 'Время старта наступило.'}
      </p>
    );
  }

  const { days, hours, minutes, seconds } = split(remaining);

  return (
    <div
      className="inline-flex items-end gap-4 rounded-[16px] border border-hairline bg-paper-white px-5 py-3"
      role="timer"
      aria-label={`До старта ${days} дней ${hours} часов ${minutes} минут`}
    >
      {[
        { value: days, label: 'дн' },
        { value: hours, label: 'ч' },
        { value: minutes, label: 'мин' },
        { value: seconds, label: 'сек' },
      ].map((unit) => (
        <div key={unit.label} className="flex flex-col items-center">
          <span className="text-heading-sm tabular-nums tracking-[-0.48px]">{pad(unit.value)}</span>
          <span className="text-caption text-pebble">{unit.label}</span>
        </div>
      ))}
    </div>
  );
}
