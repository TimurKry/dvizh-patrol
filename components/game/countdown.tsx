'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { EventStatus } from '@/types/database';

/**
 * Обратный отсчёт до старта.
 *
 * Figma 79:11…79:23: четыре крупных числа Unbounded, разделённые
 * точками, подписи в разрядку под ними. Первое число — сигнальное,
 * остальные светлые: так глаз сразу цепляется за самую крупную
 * оставшуюся единицу.
 *
 * Целевое время приходит с сервера в UTC, поэтому переведённые
 * или сбитые часы телефона влияют только на отображаемую
 * длительность, но никогда — на реальные права: можно ли
 * отправлять фотографии, решает сервер.
 *
 * До монтирования компонент держит место фиксированной высотой,
 * иначе разметка сервера и клиента разойдётся, а раскладка
 * дёрнется в момент гидратации.
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

export function Countdown({
  target,
  status,
  className,
}: {
  target: string;
  status: EventStatus;
  className?: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const targetMs = new Date(target).getTime();
    const tick = () => setRemaining(targetMs - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (remaining === null) {
    return <div className={cn('h-[72px]', className)} aria-hidden="true" />;
  }

  if (remaining <= 0) {
    return (
      <p className={cn('signal-label text-label text-signal', className)} role="status">
        {status === 'live' ? 'Квест идёт прямо сейчас' : 'Время старта наступило'}
      </p>
    );
  }

  const { days, hours, minutes, seconds } = split(remaining);

  const units = [
    { value: days, label: 'дней', signal: true },
    { value: hours, label: 'часов', signal: false },
    { value: minutes, label: 'мин', signal: false },
    { value: seconds, label: 'сек', signal: false },
  ];

  return (
    <div
      className={cn('flex items-start justify-center', className)}
      role="timer"
      aria-label={`До старта ${days} дней ${hours} часов ${minutes} минут`}
    >
      {units.map((unit, index) => (
        <div key={unit.label} className="flex items-start">
          {index > 0 && (
            <span
              aria-hidden="true"
              className="display-figure px-1 pt-[6px] text-body-lg text-signal sm:px-2"
            >
              ·
            </span>
          )}
          <div className="flex min-w-[64px] flex-col items-center sm:min-w-[84px]">
            <span
              className={cn(
                'display-figure text-headline sm:text-display',
                unit.signal ? 'text-signal' : 'text-ink',
              )}
            >
              {pad(unit.value)}
            </span>
            <span className="signal-label mt-1 text-micro text-muted">{unit.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
