import type { Metadata } from 'next';
import { DotCluster } from '@/components/ui/logo';

export const metadata: Metadata = {
  title: 'Нет соединения',
  robots: { index: false, follow: false },
};

/**
 * Страница-заглушка для service worker.
 *
 * Статическая и без обращений к базе: показывается ровно тогда,
 * когда сети нет и запрос к серверу невозможен.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <DotCluster size={28} />

        <h1 className="text-heading">Нет соединения</h1>

        <p className="text-body text-stone">
          Похоже, интернет пропал. Это нормально: в центре города связь местами проседает.
        </p>

        <ul className="flex flex-col gap-2 text-body text-stone">
          <li>Выбранная фотография сохранена и никуда не денется.</li>
          <li>Как только сеть вернётся, отправку можно повторить одной кнопкой.</li>
          <li>Баллы за это время не потеряются.</li>
        </ul>

        <p className="text-caption text-pebble">
          Попробуйте отойти на пару шагов или подождать минуту, затем обновите страницу.
        </p>
      </div>
    </div>
  );
}
