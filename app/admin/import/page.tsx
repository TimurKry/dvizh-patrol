import type { Metadata } from 'next';
import { ImportPanel } from '@/components/admin/import-panel';
import { Card, Eyebrow } from '@/components/ui/surface';
import { EmptyState } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Импорт заданий' };

export default async function AdminImportPage() {
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
        <Eyebrow>Задания</Eyebrow>
        <h1 className="mt-2 text-heading">Импорт</h1>
        <p className="mt-2 text-body text-sepia">
          Загрузите 30–50 заданий одним файлом. Импорт выполняется целиком: если хоть одна
          запись некорректна, не сохраняется ничего.
        </p>
      </header>

      <ImportPanel eventId={event.id} />

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-subheading">Формат</h2>
        <p className="text-body text-sepia">
          Полное описание полей — в <code>docs/TASK_IMPORT_FORMAT.md</code>. Готовые образцы
          лежат в репозитории:
        </p>
        <ul className="flex flex-col gap-2 text-body text-sepia">
          <li>
            <a href="/templates/tasks.example.json" download className="underline underline-offset-2">
              tasks.example.json
            </a>{' '}
            — образец JSON
          </li>
          <li>
            <a href="/templates/tasks.example.csv" download className="underline underline-offset-2">
              tasks.example.csv
            </a>{' '}
            — образец CSV
          </li>
        </ul>
        <p className="text-caption text-sepia">
          Обязательные поля: number, title, description, points, category. Остальные имеют
          значения по умолчанию. Критерии в CSV разделяются символом «|».
        </p>
      </Card>
    </div>
  );
}
