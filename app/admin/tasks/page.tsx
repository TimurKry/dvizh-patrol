import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/admin/action-form';
import { toggleTaskAction } from '@/actions/admin';
import { ButtonLink } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/surface';
import { EmptyState } from '@/components/ui/feedback';
import { Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { TASK_CATEGORY_TEXT, TASK_DIFFICULTY_TEXT, tasksWord } from '@/lib/messages';
import type { TaskRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Задания' };

const MODE_LABEL: Record<string, string> = {
  auto: 'авто',
  ai: 'проверка',
  manual: 'вручную',
};

export default async function AdminTasksPage() {
  await requireAdmin();
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-10">
        <EmptyState title="Мероприятие не найдено" />
      </div>
    );
  }

  const db = supabaseAdmin();
  const [tasksResult, submissionsResult] = await Promise.all([
    db
      .from('tasks')
      .select('*')
      .eq('event_id', event.id)
      .order('number', { ascending: true }),
    db.from('submissions').select('task_id, status').eq('event_id', event.id),
  ]);

  const tasks = (tasksResult.data as TaskRow[] | null) ?? [];
  const submissions =
    (submissionsResult.data as Array<{ task_id: string; status: string }> | null) ?? [];

  const stats = new Map<string, { total: number; accepted: number }>();
  for (const row of submissions) {
    const current = stats.get(row.task_id) ?? { total: 0, accepted: 0 };
    current.total += 1;
    if (row.status === 'accepted') current.accepted += 1;
    stats.set(row.task_id, current);
  }

  const active = tasks.filter((t) => t.active).length;

  return (
    <div className="page-well flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Управление</Eyebrow>
          <h1 className="mt-2 text-heading">Задания</h1>
          <p className="mt-1 text-body text-sepia">
            {active} активных из {tasks.length} {tasksWord(tasks.length)}
          </p>
        </div>

        <div className="flex gap-2">
          <ButtonLink href="/admin/import" variant="secondary" size="sm">
            Импорт
          </ButtonLink>
          <ButtonLink href="/admin/tasks/new" size="sm">
            Новое задание
          </ButtonLink>
        </div>
      </header>

      {tasks.length === 0 ? (
        <EmptyState
          title="Заданий пока нет"
          description="Создайте задание вручную или загрузите файл через импорт."
          action={
            <ButtonLink href="/admin/import" size="sm">
              Импортировать
            </ButtonLink>
          }
        />
      ) : (
        <div className="scroll-x">
          <table className="w-full min-w-[860px] border-collapse text-body">
            <caption className="sr-only">Список заданий мероприятия</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-caption text-sepia">
                <th scope="col" className="py-2 pr-3 font-medium">
                  №
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Название
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Категория
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Баллы
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Проверка
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Попытки
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Отправки
                </th>
                <th scope="col" className="py-2 font-medium">
                  Состояние
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const stat = stats.get(task.id) ?? { total: 0, accepted: 0 };
                return (
                  <tr key={task.id} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-3 tabular-nums text-sepia">{task.number}</td>
                    <td className="py-3 pr-3">
                      <Link
                        href={`/admin/tasks/${task.id}`}
                        className="underline underline-offset-2"
                      >
                        {task.title}
                      </Link>
                      {task.require_location && (
                        <span className="ml-2 text-caption text-sepia">геопозиция</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-caption text-sepia">
                      {TASK_CATEGORY_TEXT[task.category]}
                      <span className="ml-1">· {TASK_DIFFICULTY_TEXT[task.difficulty]}</span>
                    </td>
                    <td className="py-3 pr-3 tabular-nums">{task.points}</td>
                    <td className="py-3 pr-3 text-caption">
                      {MODE_LABEL[task.validation_mode] ?? task.validation_mode}
                    </td>
                    <td className="py-3 pr-3 tabular-nums">{task.max_attempts}</td>
                    <td className="py-3 pr-3 tabular-nums text-caption text-sepia">
                      {stat.accepted} / {stat.total}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {task.active ? <Tag emphasis>включено</Tag> : <Tag>выключено</Tag>}
                        <ActionButton
                          action={toggleTaskAction}
                          values={{ taskId: task.id, active: String(!task.active) }}
                          variant="ghost"
                        >
                          {task.active ? 'Выключить' : 'Включить'}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
