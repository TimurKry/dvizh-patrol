import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/admin/action-form';
import { acceptAllForTaskAction, deleteTaskAction } from '@/actions/admin';
import { TaskForm } from '@/components/admin/task-form';
import { Card, Eyebrow } from '@/components/ui/surface';
import { requireAdmin } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { TaskRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Задание' };

export default async function EditTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  await requireAdmin();
  const { taskId } = await params;

  const db = supabaseAdmin();
  const { data } = await db.from('tasks').select('*').eq('id', taskId).maybeSingle();
  const task = data as TaskRow | null;
  if (!task) notFound();

  const { count } = await db
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId);

  const { count: waiting } = await db
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId)
    .in('status', ['pending', 'checking', 'manual_review']);

  return (
    <div className="page-well flex max-w-3xl flex-col gap-6 py-8">
      <div>
        <Link href="/admin/tasks" className="text-caption text-muted hover:text-ink">
          ← Все задания
        </Link>
        <Eyebrow className="mt-4">Задание {task.number}</Eyebrow>
        <h1 className="mt-2 text-headline">{task.title}</h1>
      </div>

      <TaskForm eventId={task.event_id} task={task} nextNumber={task.number} />

      {/* ═══ Массовые действия ══════════════════════════════ */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-body-lg">Групповые действия</h2>
        <p className="text-body text-muted">
          Отправок по заданию: {count ?? 0}, из них ждут решения: {waiting ?? 0}.
        </p>

        <div className="flex flex-wrap gap-3">
          <ActionButton
            action={acceptAllForTaskAction}
            values={{ taskId: task.id }}
            confirm="Принять все ожидающие отправки по этому заданию? Баллы начислятся всем."
            disabled={(waiting ?? 0) === 0}
          >
            Принять все ожидающие
          </ActionButton>

          <ActionButton
            action={deleteTaskAction}
            values={{ taskId: task.id }}
            variant="danger"
            confirm="Удалить задание? Это возможно, только если по нему нет отправок."
            disabled={(count ?? 0) > 0}
          >
            Удалить задание
          </ActionButton>
        </div>

        {(count ?? 0) > 0 && (
          <p className="text-caption text-muted">
            Задание с отправками удалить нельзя — это разорвало бы историю начислений. Используйте
            выключение.
          </p>
        )}
      </Card>
    </div>
  );
}
