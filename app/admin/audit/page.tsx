import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/surface';
import { EmptyState } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AdminAuditLogRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Журнал действий' };

const ACTION_LABEL: Record<string, string> = {
  admin_login: 'Вход администратора',
  event_updated: 'Изменены настройки мероприятия',
  event_status_registration: 'Открыта регистрация',
  event_status_live: 'Квест запущен',
  event_status_paused: 'Квест приостановлен',
  event_status_finished: 'Квест завершён',
  event_status_archived: 'Мероприятие в архиве',
  event_status_draft: 'Возврат в черновик',
  leaderboard_mode_changed: 'Изменён режим рейтинга',
  team_confirm_payment: 'Подтверждена оплата команды',
  team_revoke_payment: 'Снято подтверждение оплаты',
  team_cancel: 'Отменена регистрация команды',
  team_restore: 'Команда возвращена',
  team_rename: 'Переименована команда',
  team_regenerate_code: 'Сгенерирован новый код команды',
  team_sessions_reset: 'Сброшены сессии команды',
  team_created_by_admin: 'Команда создана вручную',
  score_adjusted: 'Изменены баллы',
  submission_accept: 'Отправка принята',
  submission_reject: 'Отправка отклонена',
  submission_request_retake: 'Запрошена пересъёмка',
  submission_retry_ai: 'Повторная автоматическая проверка',
  validations_requeued: 'Перезапущены зависшие проверки',
  bulk_manual_review: 'Всё переведено в ручную проверку',
  bulk_accept_task: 'Массовое принятие по заданию',
  task_created: 'Создано задание',
  task_updated: 'Изменено задание',
  task_deleted: 'Удалено задание',
  task_enabled: 'Задание включено',
  task_disabled: 'Задание выключено',
  tasks_imported: 'Импортированы задания',
  photos_purged: 'Удалены фотографии по сроку хранения',
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const [event, params] = await Promise.all([getCurrentEvent(), searchParams]);

  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const pageSize = 60;

  const { data, count } = await supabaseAdmin()
    .from('admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const rows = (data as AdminAuditLogRow[] | null) ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const timezone = event?.timezone ?? 'Europe/Berlin';

  return (
    <div className="page-well flex flex-col gap-6 py-8">
      <header>
        <Eyebrow>Прозрачность</Eyebrow>
        <h1 className="mt-2 text-headline">Журнал действий</h1>
        <p className="mt-2 max-w-prose text-body text-muted">
          Все изменения, влияющие на результат: смена статуса, правки заданий, начисления, решения
          по фотографиям. Записи не удаляются — по ним можно восстановить, почему результат
          получился именно таким.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="Журнал пуст" />
      ) : (
        <div className="scroll-x">
          <table className="w-full min-w-[760px] border-collapse text-body">
            <caption className="sr-only">Журнал административных действий</caption>
            <thead>
              <tr className="border-b border-hairline text-left text-caption text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Время
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Кто
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Действие
                </th>
                <th scope="col" className="py-2 font-medium">
                  Объект
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-hairline last:border-0 align-top">
                  <td className="py-3 pr-4 text-caption tabular-nums text-muted">
                    {new Intl.DateTimeFormat('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      timeZone: timezone,
                    }).format(new Date(row.created_at))}
                  </td>
                  <td className="py-3 pr-4 text-caption text-muted">{row.admin_email ?? '—'}</td>
                  <td className="py-3 pr-4">{ACTION_LABEL[row.action] ?? row.action}</td>
                  <td className="py-3 text-caption text-muted">
                    {row.entity_type}
                    {row.entity_id && (
                      <span className="ml-1 font-mono">{row.entity_id.slice(0, 8)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Страницы журнала" className="flex justify-between text-caption">
          {page > 1 ? (
            <a href={`/admin/audit?page=${page - 1}`} className="underline underline-offset-2">
              ← Новее
            </a>
          ) : (
            <span />
          )}
          <span className="text-muted">
            {page} из {pages}
          </span>
          {page < pages ? (
            <a href={`/admin/audit?page=${page + 1}`} className="underline underline-offset-2">
              Старее →
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
