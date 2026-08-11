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
    </div>
  );
}
