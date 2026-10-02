import type { Metadata } from 'next';
import { Card, Eyebrow } from '@/components/ui/surface';
import { DownloadPhotos } from '@/components/admin/download-photos';
import { Notice } from '@/components/ui/feedback';
import { EmptyState } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Экспорт' };

const EXPORTS = [
  { kind: 'teams', title: 'Команды', note: 'Названия, коды, капитаны, контакты, баллы.' },
  { kind: 'members', title: 'Участники', note: 'Состав всех команд.' },
  {
    kind: 'tasks',
    title: 'Задания',
    note: 'В том же формате, что и импорт — файл можно загрузить в следующий квест.',
  },
  {
    kind: 'submissions',
    title: 'Отправки',
    note: 'Все фотографии со статусами, баллами и путями в хранилище.',
  },
  { kind: 'leaderboard', title: 'Рейтинг', note: 'Итоговая таблица.' },
  {
    kind: 'score-transactions',
    title: 'Журнал начислений',
    note: 'Каждое изменение баллов, включая отмены.',
  },
  {
    kind: 'consents',
    title: 'Согласия',
    note: 'Кто разрешил публикацию фотографий в социальных сетях.',
  },
];

export default async function AdminExportPage() {
  await requireAdmin();
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-10">
        <EmptyState title="Мероприятие не найдено" />
      </div>
    );
  }

  return (
    <div className="page-well flex max-w-3xl flex-col gap-6 py-8">
      <header>
        <Eyebrow>Результаты</Eyebrow>
        <h1 className="mt-2 text-headline">Экспорт</h1>
        <p className="mt-2 text-body text-muted">
          Файлы CSV в кодировке UTF-8 с BOM — открываются в Excel и Google Таблицах без настройки.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {EXPORTS.map((item) => (
          <Card key={item.kind} className="flex flex-col gap-3 p-4">
            <div>
              <h2 className="text-body-lg">{item.title}</h2>
              <p className="mt-1 text-caption text-muted">{item.note}</p>
            </div>
            <a
              href={`/api/admin/export/${item.kind}`}
              download
              className="mt-auto inline-flex min-h-[44px] items-center justify-center border border-hairline bg-panel px-4 text-caption font-medium hover:border-hairline-strong"
            >
              Скачать CSV
            </a>
          </Card>
        ))}
      </div>

      <Notice icon="info">
        Ссылки на фотографии в таблицы не попадают: подписанная ссылка живёт час, а файл экспорта
        остаётся надолго. Вместо ссылок выгружается путь в хранилище — по нему фотографию можно
        скачать из панели Supabase в любой момент.
      </Notice>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-body-lg">Фотографии архивом</h2>
          <p className="mt-1 text-body text-muted">
            Все снимки, которые прислали команды, одним ZIP. Внутри — папки по командам, файлы
            названы номером и заданием: <code>Коржики/059 — Ратуша.jpg</code>. Отклонённые и
            повторные попытки помечены прямо в имени.
          </p>
        </div>

        <DownloadPhotos />

        <p className="text-caption text-muted">
          Скачивает и упаковывает сам браузер, поэтому вкладку до конца лучше не закрывать. Сотня
          снимков — это около ста мегабайт: на телефоне может не хватить памяти, с компьютера
          надёжнее.
        </p>
      </Card>
    </div>
  );
}
