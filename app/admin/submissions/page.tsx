import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/admin/action-form';
import { bulkManualReviewAction, requeueStaleAction } from '@/actions/admin';
import { Eyebrow } from '@/components/ui/surface';
import { EmptyState } from '@/components/ui/feedback';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKETS, createSignedUrls } from '@/lib/storage';
import { REVIEW_REASON_TEXT } from '@/lib/messages';
import { cn } from '@/lib/cn';
import type { SubmissionRow, TaskRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Проверка' };

const TABS = [
  { key: 'manual_review', label: 'Ручная проверка' },
  { key: 'pending', label: 'Ожидают' },
  { key: 'checking', label: 'Проверяются' },
  { key: 'duplicates', label: 'Похожие' },
  { key: 'ai_errors', label: 'Ошибки проверки' },
  { key: 'accepted', label: 'Принятые' },
  { key: 'rejected', label: 'Отклонённые' },
  { key: 'all', label: 'Все' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const PAGE_SIZE = 40;

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; team?: string; task?: string; page?: string }>;
}) {
  await requireAdmin();
  const event = await getCurrentEvent();
  const params = await searchParams;

  if (!event) {
    return (
      <div className="page-well py-10">
        <EmptyState title="Мероприятие не найдено" />
      </div>
    );
  }

  const tab = (params.tab ?? 'manual_review') as TabKey;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const db = supabaseAdmin();

  let query = db
    .from('submissions')
    .select('*, tasks:task_id (number, title), teams:team_id (name)', { count: 'exact' })
    .eq('event_id', event.id)
    .not('status', 'in', '("draft","uploading")');

  switch (tab) {
    case 'duplicates':
      query = query.not('duplicate_submission_id', 'is', null);
      break;
    case 'ai_errors':
      query = query.in('review_reason', ['ai_error', 'ai_invalid_response', 'ai_unavailable']);
      break;
    case 'all':
      break;
    default:
      query = query.eq('status', tab);
  }

  if (params.team) query = query.eq('team_id', params.team);
  if (params.task) query = query.eq('task_id', params.task);

  // Постранично: в очереди может быть все 500 отправок.
  const { data, count } = await query
    .order('submitted_at', { ascending: tab === 'manual_review' })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const rows =
    (data as Array<
      SubmissionRow & {
        tasks: Pick<TaskRow, 'number' | 'title'> | null;
        teams: { name: string } | null;
      }
    > | null) ?? [];

  // В списке — только превью: тянуть 500 оригиналов недопустимо.
  const previews = await createSignedUrls(
    BUCKETS.previews,
    rows.map((r) => r.preview_path).filter((p): p is string => Boolean(p)),
  );

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (next: Partial<{ tab: string; page: string }>) => {
    const search = new URLSearchParams();
    search.set('tab', next.tab ?? tab);
    if (params.team) search.set('team', params.team);
    if (params.task) search.set('task', params.task);
    const p = next.page ?? '1';
    if (p !== '1') search.set('page', p);
    return `/admin/submissions?${search.toString()}`;
  };

  return (
    <div className="page-well flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Модерация</Eyebrow>
          <h1 className="mt-2 text-heading">Проверка фотографий</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton action={requeueStaleAction} values={{ eventId: event.id }}>
            Обработать зависшие
          </ActionButton>
          <ActionButton
            action={bulkManualReviewAction}
            values={{ eventId: event.id }}
            variant="danger"
            confirm="Перевести все ожидающие и проверяющиеся отправки в ручную проверку? Используйте, если автоматическая проверка отказала."
          >
            Всё — в ручную проверку
          </ActionButton>
        </div>
      </header>

      {/* ═══ Вкладки ════════════════════════════════════════ */}
      <nav aria-label="Фильтр отправок" className="scroll-x -mx-1 px-1">
        <ul className="flex gap-2">
          {TABS.map((item) => (
            <li key={item.key}>
              <Link
                href={buildHref({ tab: item.key })}
                aria-current={tab === item.key ? 'page' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center rounded-[9999px] border px-4 py-2 text-caption font-medium',
                  tab === item.key
                    ? 'border-ink bg-ink text-paper'
                    : 'border-hairline bg-paper text-sepia hover:border-hairline-strong',
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="text-caption text-sepia">
        Найдено: {total}
        {pages > 1 && ` · страница ${page} из ${pages}`}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="Здесь пусто"
          description={
            tab === 'manual_review'
              ? 'Ни одна фотография не ждёт вашего решения.'
              : 'Под этот фильтр ничего не подошло.'
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const preview = row.preview_path ? previews.get(row.preview_path) : null;
            return (
              <li key={row.id}>
                <Link
                  href={`/admin/submissions/${row.id}`}
                  className="flex h-full flex-col gap-3 rounded-[16px] border border-hairline bg-paper p-3 hover:border-hairline-strong"
                >
                  <div className="overflow-hidden rounded-[12px] bg-ink-wash">
                    {preview ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={preview}
                        alt=""
                        loading="lazy"
                        className="aspect-4/3 w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-4/3 items-center justify-center text-caption text-sand">
                        нет превью
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-body">
                      {row.tasks ? `${row.tasks.number}. ${row.tasks.title}` : 'Задание удалено'}
                    </p>
                    <p className="truncate text-caption text-sepia">{row.teams?.name ?? '—'}</p>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <StatusBadge status={row.status} />
                    {row.duplicate_submission_id && <Tag>похожа</Tag>}
                    {row.ai_confidence !== null && (
                      <Tag>уверенность {Number(row.ai_confidence).toFixed(2)}</Tag>
                    )}
                    {row.review_reason && (
                      <Tag>{REVIEW_REASON_TEXT[row.review_reason] ?? row.review_reason}</Tag>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Страницы" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={buildHref({ page: String(page - 1) })}
              className="text-caption underline underline-offset-2"
            >
              ← Предыдущая
            </Link>
          ) : (
            <span />
          )}
          {page < pages && (
            <Link
              href={buildHref({ page: String(page + 1) })}
              className="text-caption underline underline-offset-2"
            >
              Следующая →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
