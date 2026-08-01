'use client';

import { useEffect, useState } from 'react';

/**
 * Индикатор потери связи.
 *
 * Квест проходят на улице, и мобильный интернет там пропадает
 * регулярно. Важно, чтобы участник понимал: приложение не
 * сломалось, просто сейчас нет сети.
 */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="page-well sticky top-[72px] z-30 pb-2"
    >
      <p className="rounded-[16px] border border-ink bg-paper px-4 py-2 text-caption">
        <span aria-hidden="true">◍ </span>
        Нет соединения. Выбранные фотографии сохранятся и отправятся, когда связь вернётся.
      </p>
    </div>
  );
}
