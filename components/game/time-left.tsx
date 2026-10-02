'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * Сколько осталось до конца игры.
 *
 * Не тот отсчёт, что на лендинге: там четыре крупных числа, ради
 * которых человек и пришёл на страницу. Здесь строка над рукой, и
 * она не должна перетягивать внимание с карточек — до последних
 * минут. Поэтому обычная подпись, а сигнальный цвет включается,
 * когда осталось меньше десяти минут.
 *
 * Часы телефона могут врать или стоять в другом поясе. На права
 * это не влияет: принимать фотографию или нет, решает сервер по
 * своему времени. Здесь — только предупредить.
 */

const pad = (n: number) => String(n).padStart(2, '0');

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function TimeLeft({ endsAt, className }: { endsAt: string; className?: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const router = useRouter();

  // Перерисовать страницу ровно один раз, когда время вышло.
  //
  // Иначе команда осталась бы стоять с рукой и нулями на часах:
  // общее живое обновление включается только пока есть отправки
  // на проверке, а в этот момент ждать может быть нечего. Место
  // сбора приходит с сервера, поэтому нужен именно запрос, а не
  // локальное переключение — и один, а не каждую секунду.
  const refreshed = useRef(false);

  useEffect(() => {
    const target = new Date(endsAt).getTime();

    const tick = () => {
      const left = target - Date.now();
      setRemaining(left);

      if (left > 0 || refreshed.current) return;
      refreshed.current = true;
      router.refresh();
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, router]);

  // До гидратации держим высоту строки: иначе рука дёрнется вниз
  // ровно в тот момент, когда её начали разглядывать.
  if (remaining === null) return <span className={cn('inline-block h-[1em]', className)} />;

  if (remaining <= 0) {
    return (
      <span className={cn('signal-label text-micro text-signal', className)} role="status">
        Время вышло
      </span>
    );
  }

  const urgent = remaining < 10 * 60 * 1000;

  return (
    <span
      className={cn('signal-label text-micro', urgent ? 'text-signal' : 'text-muted', className)}
      role="timer"
      // Секунды вслух не читаются: строка обновляется ежесекундно,
      // и озвучивать каждое изменение — пытка.
      aria-label={`До конца игры ${Math.ceil(remaining / 60000)} минут`}
    >
      До конца {format(remaining)}
    </span>
  );
}
