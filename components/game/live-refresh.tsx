'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Живое обновление экрана команды.
 *
 * Статус отправки меняется на сервере: проверка занимает
 * секунды, ручная — минуты. Участник не должен обновлять
 * страницу вручную, чтобы узнать результат.
 *
 * Обновляем в трёх случаях:
 *   · по таймеру, пока есть отправки в работе;
 *   · при возврате на вкладку — телефон в кармане таймеры глушит;
 *   · при восстановлении связи.
 *
 * Когда ждать нечего, таймер не заводится вовсе: лишние запросы
 * на мобильном интернете стоят батареи и трафика.
 */
export function LiveRefresh({
  active,
  intervalMs = 20_000,
}: {
  /** Есть ли что ждать: отправки в статусах pending/checking/manual_review. */
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const refresh = () => {
      // Обновлять невидимую вкладку бессмысленно.
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      router.refresh();
    };

    const timer = window.setInterval(refresh, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
  }, [active, intervalMs, router]);

  return null;
}
