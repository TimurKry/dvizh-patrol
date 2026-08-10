'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listDrafts, type SubmissionDraft } from '@/lib/offline/draft-store';
import { photosWord } from '@/lib/messages';

/**
 * Состояние очереди отправок.
 *
 * Черновики лежат в IndexedDB, поэтому очередь переживает не
 * только потерю связи, но и перезапуск браузера: после закрытия
 * вкладки посреди улицы участник открывает приложение и видит,
 * что фотография всё ещё ждёт отправки, а не исчезла.
 *
 * Очередь — состояние, а не раздел: отдельной вкладки под неё в
 * навигации нет и не будет.
 */

export function OfflineQueueStatus() {
  const [drafts, setDrafts] = useState<SubmissionDraft[] | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const list = await listDrafts();
      if (!cancelled) setDrafts(list);
    };

    const updateOnline = () => setOnline(navigator.onLine);

    void refresh();
    updateOnline();

    // Черновики меняет другая вкладка или страница задания, а
    // событий у IndexedDB нет — поэтому короткий опрос. Раз в
    // пять секунд достаточно: очередь редко длиннее одного файла.
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  // До первого чтения хранилища ничего не утверждаем: пустая
  // очередь и «ещё не знаем» — разные вещи, и мигать между ними
  // не нужно.
  if (drafts === null) return null;

  if (drafts.length === 0) {
    return (
      <p className="flex items-center gap-2 border border-hairline bg-panel px-4 py-3">
        <span aria-hidden="true" className={online ? 'text-ink' : 'text-signal'}>
          {online ? '✓' : '◍'}
        </span>
        <span className="signal-label text-micro text-muted">
          {online ? 'Очередь пуста · всё отправлено' : 'Нет связи · очередь пуста'}
        </span>
      </p>
    );
  }

  const failed = drafts.filter((draft) => draft.lastError);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 border border-signal bg-panel px-4 py-4"
    >
      <p className="flex items-center gap-2">
        <span aria-hidden="true" className="anim-tick text-signal">
          ◔
        </span>
        <span className="signal-label text-micro text-ink">
          {online ? 'Отправляем' : 'Связь нестабильна'} · {drafts.length}{' '}
          {photosWord(drafts.length)} в очереди
        </span>
      </p>

      <ul className="flex flex-col gap-2">
        {drafts.map((draft) => (
          <li key={draft.taskId} className="flex items-center justify-between gap-3">
            <Link href={`/tasks/${draft.taskId}`} className="text-caption underline-slide">
              Задание в очереди
            </Link>
            <span className="signal-label text-micro text-muted">
              {draft.attempts > 0 ? `попыток: ${draft.attempts}` : 'ждёт связи'}
            </span>
          </li>
        ))}
      </ul>

      {failed.length > 0 && (
        <p className="text-caption text-muted">
          <span aria-hidden="true">! </span>
          Часть фотографий пока не ушла. Откройте задание и нажмите «Отправить» ещё раз — повтор
          использует тот же ключ и не создаст дубликат.
        </p>
      )}
    </div>
  );
}
