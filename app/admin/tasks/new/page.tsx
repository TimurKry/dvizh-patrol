import type { Metadata } from 'next';
import Link from 'next/link';
import { TaskForm } from '@/components/admin/task-form';
import { Eyebrow } from '@/components/ui/surface';
import { EmptyState } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { asAreaPolygon } from '@/lib/geo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Новое задание' };

export default async function NewTaskPage() {
  await requireAdmin();
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-10">
        <EmptyState title="Мероприятие не найдено" />
      </div>
    );
  }

  // Следующий свободный номер — чтобы не подбирать вручную.
  const { data } = await supabaseAdmin()
    .from('tasks')
    .select('number')
    .eq('event_id', event.id)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNumber = ((data as { number: number } | null)?.number ?? 0) + 1;
  const guide = asAreaPolygon(event.area_polygon)?.coordinates[0] ?? null;

  return (
    <div className="page-well flex max-w-6xl flex-col gap-6 py-8">
      <div>
        <Link href="/admin/tasks" className="text-caption text-muted hover:text-ink">
          ← Все задания
        </Link>
        <Eyebrow className="mt-4">Создание</Eyebrow>
        <h1 className="mt-2 text-headline">Новое задание</h1>
      </div>

      <TaskForm eventId={event.id} nextNumber={nextNumber} areaGuide={guide} />

      {/* Заглушка вместо блока картинок.
          Файл привязывается к идентификатору задания, а его до
          сохранения не существует — положить картинку раньше
          физически некуда. Но пустое место там, где на странице
          правки стоит загрузка, читается как пропавшая кнопка:
          лучше сказать прямо. */}
      <div className="flex flex-col gap-2 border border-dashed border-hairline-strong p-4">
        <p className="signal-label text-micro text-muted">Картинки</p>
        <p className="text-caption text-muted">
          Появятся сразу после сохранения — вместе с выбором видимой зоны. Файл привязывается к
          заданию, а задания ещё нет.
        </p>
      </div>
    </div>
  );
}
