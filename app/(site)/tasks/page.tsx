import type { Metadata } from 'next';
import { BottomNav } from '@/components/nav/bottom-nav';
import { TaskCard } from '@/components/game/task-card';
import { TaskFilters } from '@/components/game/task-filters';
import { LiveRefresh } from '@/components/game/live-refresh';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { Eyebrow } from '@/components/ui/surface';
import { getTasksForTeam, type TaskWithState } from '@/lib/data/tasks';
import { requireTeamSession } from '@/lib/session/require';
import { tasksWord } from '@/lib/messages';
import type { TaskCategory } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Задания' };

type Filter = 'all' | 'available' | 'todo' | 'done' | 'in_review';
type Sort = 'number' | 'points' | 'category' | 'status';

const STATE_ORDER: Record<TaskWithState['state'], number> = {
  available: 0,
  rejected: 1,
  in_review: 2,
  attempts_exhausted: 3,
  accepted: 4,
};

function applyFilter(items: TaskWithState[], filter: Filter, category: string): TaskWithState[] {
  let result = items;

  if (category !== 'all') {
    result = result.filter((i) => i.task.category === category);
  }

  switch (filter) {
    case 'available':
      return result.filter((i) => i.canSubmit);
    case 'todo':
      return result.filter((i) => i.state !== 'accepted');
    case 'done':
      return result.filter((i) => i.state === 'accepted');
    case 'in_review':
      return result.filter((i) => i.state === 'in_review');
    default:
      return result;
  }
}

function applySort(items: TaskWithState[], sort: Sort): TaskWithState[] {
  const sorted = [...items];
  switch (sort) {
    case 'points':
      return sorted.sort((a, b) => b.task.points - a.task.points || a.task.number - b.task.number);
    case 'category':
      return sorted.sort(
        (a, b) =>
          a.task.category.localeCompare(b.task.category) || a.task.number - b.task.number,
      );
    case 'status':
      return sorted.sort(
        (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.task.number - b.task.number,
      );
    default:
      return sorted.sort((a, b) => a.task.sort_order - b.task.sort_order || a.task.number - b.task.number);
  }
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string; category?: string }>;
}) {
  const session = await requireTeamSession();
  const params = await searchParams;

  // Задания открываются только когда квест запущен.
  //
  // Проверка стоит ДО загрузки, а не после. Отрисовать закрытый
  // список мало: пока формулировки лежат в области видимости
  // компонента, любая будущая правка выше заглушки утащит их в
  // разметку. Не загружено — нечего и утекать.
  const tasksHidden = !['live', 'paused', 'finished'].includes(session.event.status);

  if (tasksHidden) {
    return (
      <div className="page-well with-bottom-nav py-8 md:py-12">
        <Eyebrow>Команда «{session.team.name}»</Eyebrow>
        <h1 className="mt-3 text-heading md:text-heading-lg">Задания</h1>
        <div className="mt-8">
          <EmptyState
            title="Задания ещё закрыты"
            description={
              session.event.status === 'registration'
                ? 'Список откроется в момент старта квеста. Пока можно собрать команду и прочитать правила.'
                : 'Мероприятие сейчас недоступно.'
            }
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  const eventLive = session.event.status === 'live';
  const items = await getTasksForTeam(session.event.id, session.teamId, { eventLive });

  const filter = (params.filter ?? 'all') as Filter;
  const sort = (params.sort ?? 'number') as Sort;
  const category = params.category ?? 'all';

  const visible = applySort(applyFilter(items, filter, category), sort);

  const accepted = items.filter((i) => i.state === 'accepted').length;
  const waiting = items.some((i) => i.state === 'in_review');
  const categories = [...new Set(items.map((i) => i.task.category))] as TaskCategory[];

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <Eyebrow>Команда «{session.team.name}»</Eyebrow>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-heading md:text-heading-lg">Задания</h1>
        <p className="text-body text-sepia">
          принято {accepted} из {items.length} {tasksWord(items.length)}
        </p>
      </div>

      {session.event.status === 'paused' && (
        <div className="mt-6">
          <Notice tone="strong" icon="‖">
            Квест приостановлен организатором. Задания видны, но отправка временно
            недоступна.
          </Notice>
        </div>
      )}

      {session.event.status === 'finished' && (
        <div className="mt-6">
          <Notice tone="strong" icon="•">
            Квест завершён. Новые отправки закрыты, результаты досматривает организатор.
          </Notice>
        </div>
      )}

      <div className="mt-6">
        <TaskFilters
          filter={filter}
          sort={sort}
          category={category}
          categories={categories}
        />
      </div>

      <div className="mt-6">
        {visible.length === 0 ? (
          <EmptyState
            title="Ничего не найдено"
            description="Под выбранный фильтр не подошло ни одно задание."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => (
              <TaskCard key={item.task.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <LiveRefresh active={waiting} />
      <BottomNav />
    </div>
  );
}
