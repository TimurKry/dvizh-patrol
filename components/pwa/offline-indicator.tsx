'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';

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
    <div role="status" aria-live="polite" className="page-well sticky top-[72px] z-30 pb-2">
      <p className=" border border-ink bg-panel px-4 py-2 text-caption">
        <Icon name="offline" size={15} className="mr-2 inline-block align-[-2px]" />
        Нет соединения. Выбранные фотографии сохранятся и отправятся, когда связь вернётся.
      </p>
    </div>
  );
}
