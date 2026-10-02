'use client';

import { useActionState, useState } from 'react';
import { inviteStaffAction, staffLoginLinkAction, type StaffLinkState } from '@/actions/staff';
import { Button } from '@/components/ui/button';
import { ErrorNotice, Notice } from '@/components/ui/feedback';
import { FieldErrorsProvider } from '@/components/ui/field-errors';
import { Field, Select, TextInput } from '@/components/ui/field';
import { STAFF_ROLE_HINT, STAFF_ROLE_LABEL } from '@/lib/studio/staff';
import { STAFF_ROLES } from '@/types/database';

const INITIAL: StaffLinkState = { ok: false };

/**
 * Готовая ссылка для входа.
 *
 * Владелец пересылает её сам — чаще всего в Telegram, поэтому
 * кнопка отправки туда стоит первой. Ссылка одноразовая и живёт
 * около часа: это и защита, и причина показать её один раз,
 * а не хранить.
 */
function LinkResult({ link, email }: { link: string; email?: string }) {
  const [copied, setCopied] = useState(false);
  const text = 'Ссылка для входа в Студию DVIZH (одноразовая, действует час):';
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;

  return (
    <div className="flex flex-col gap-3 border border-signal-line bg-panel p-4">
      <p className="text-caption text-muted">
        Ссылка для входа{email ? ` · ${email}` : ''}. Откроется один раз, действует около часа.
      </p>
      <input
        readOnly
        value={link}
        aria-label="Ссылка для входа"
        onFocus={(e) => e.currentTarget.select()}
        className="w-full border border-hairline bg-canvas px-3 py-2 text-caption text-ink"
      />
      <div className="flex flex-wrap gap-2">
        <a
          href={share}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target inline-flex items-center border border-signal bg-signal px-4 text-caption font-medium text-canvas hover:bg-signal-deep"
        >
          Отправить в Telegram
        </a>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="tap-target inline-flex items-center border border-hairline px-4 text-caption hover:border-signal hover:text-signal"
        >
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>
    </div>
  );
}

export function InviteStaffForm() {
  const [state, formAction, pending] = useActionState(inviteStaffAction, INITIAL);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {state.message &&
          (state.ok ? (
            <Notice role="status">{state.message}</Notice>
          ) : (
            <ErrorNotice>{state.message}</ErrorNotice>
          ))}

        <FieldErrorsProvider errors={state.fields ?? {}}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="invite-email" name="email" required>
              <TextInput id="invite-email" name="email" type="email" required maxLength={200} />
            </Field>
            <Field label="Имя" htmlFor="invite-name" name="name">
              <TextInput id="invite-name" name="name" maxLength={80} />
            </Field>
          </div>
          <Field label="Роль" htmlFor="invite-role" name="role">
            <Select id="invite-role" name="role" defaultValue="manager">
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {STAFF_ROLE_LABEL[role]} — {STAFF_ROLE_HINT[role]}
                </option>
              ))}
            </Select>
          </Field>
        </FieldErrorsProvider>

        <Button type="submit" disabled={pending}>
          {pending ? 'Добавляем…' : 'Пригласить'}
        </Button>
      </form>

      {state.link && <LinkResult link={state.link} email={state.linkFor} />}
    </div>
  );
}

export function LoginLinkButton({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(staffLoginLinkAction, INITIAL);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? 'Создаём…' : 'Ссылка для входа'}
        </Button>
      </form>
      {!state.ok && state.message && <ErrorNotice>{state.message}</ErrorNotice>}
      {state.link && <LinkResult link={state.link} />}
    </div>
  );
}
