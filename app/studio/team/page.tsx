import type { Metadata } from 'next';
import { ActionButton, ActionForm } from '@/components/admin/action-form';
import { InviteStaffForm, LoginLinkButton } from '@/components/studio/staff-forms';
import { Card, Eyebrow } from '@/components/ui/surface';
import { Field, Select } from '@/components/ui/field';
import { Tag } from '@/components/ui/status-badge';
import { changeStaffRoleAction, disableStaffAction, enableStaffAction } from '@/actions/staff';
import { requireRole } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { STAFF_ROLE_HINT, STAFF_ROLE_LABEL } from '@/lib/studio/staff';
import { formatLeadDateTime } from '@/lib/studio/leads';
import { STAFF_ROLES, type AdminUserRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Команда' };

/**
 * Состав команды — только для владельца.
 *
 * Людей единицы, поэтому каждый — отдельная карточка со всеми
 * действиями сразу, без перехода на страницу сотрудника.
 */
export default async function StudioTeamPage() {
  const me = await requireRole('owner');

  const db = supabaseAdmin();
  const { data } = await db
    .from('admin_users')
    .select('*')
    .order('disabled_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });
  const staff = (data as AdminUserRow[] | null) ?? [];

  // Когда человек входил последний раз — знает только Supabase Auth.
  const lastSignIn = new Map(
    await Promise.all(
      staff.map(async (member) => {
        const { data: auth } = await db.auth.admin.getUserById(member.user_id);
        return [member.user_id, auth.user?.last_sign_in_at ?? null] as const;
      }),
    ),
  );

  return (
    <div className="page-well flex flex-col gap-6 py-8">
      <header>
        <Eyebrow>Студия</Eyebrow>
        <h1 className="mt-2 text-headline">Команда</h1>
      </header>

      <ul className="flex flex-col gap-3">
        {staff.map((member) => {
          const signedIn = lastSignIn.get(member.user_id);
          const isMe = member.user_id === me.userId;
          const disabled = Boolean(member.disabled_at);

          return (
            <li key={member.user_id}>
              <Card
                className={
                  disabled ? 'flex flex-col gap-4 p-5 opacity-60' : 'flex flex-col gap-4 p-5'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-title-sm break-words">
                      {member.name ?? member.email}
                      {isMe && <span className="text-muted"> · это вы</span>}
                    </p>
                    {member.name && <p className="text-caption text-muted">{member.email}</p>}
                  </div>
                  <Tag emphasis={member.role === 'owner'}>
                    {disabled ? 'Доступ закрыт' : STAFF_ROLE_LABEL[member.role]}
                  </Tag>
                </div>

                <p className="text-caption text-faint">
                  {signedIn
                    ? `Последний вход: ${formatLeadDateTime(signedIn)}`
                    : 'Ещё не входил(а)'}
                </p>

                {!disabled && (
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <ActionForm
                      action={changeStaffRoleAction}
                      submitLabel="Сменить роль"
                      variant="secondary"
                      className="flex flex-col gap-3"
                    >
                      <input type="hidden" name="userId" value={member.user_id} />
                      <Field label="Роль" htmlFor={`role-${member.user_id}`} name="role">
                        <Select
                          id={`role-${member.user_id}`}
                          name="role"
                          defaultValue={member.role}
                        >
                          {STAFF_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {STAFF_ROLE_LABEL[role]} — {STAFF_ROLE_HINT[role]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </ActionForm>
                  </div>
                )}

                <div className="flex flex-wrap items-start gap-3">
                  {!disabled && <LoginLinkButton userId={member.user_id} />}
                  {disabled ? (
                    <ActionButton action={enableStaffAction} values={{ userId: member.user_id }}>
                      Вернуть доступ
                    </ActionButton>
                  ) : (
                    !isMe && (
                      <ActionButton
                        action={disableStaffAction}
                        values={{ userId: member.user_id }}
                        variant="danger"
                        confirm={`Закрыть доступ для ${member.email}?`}
                      >
                        Закрыть доступ
                      </ActionButton>
                    )
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="flex flex-col gap-4 p-5">
        <Eyebrow>Пригласить</Eyebrow>
        <p className="text-body text-muted">
          Человек получит доступ сразу. Ссылку для входа перешлите ему сами — в Telegram или как
          удобно. Потом он сможет входить по ссылке на почту.
        </p>
        <InviteStaffForm />
      </Card>
    </div>
  );
}
