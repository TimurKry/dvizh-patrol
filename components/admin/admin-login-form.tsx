'use client';

import { useActionState } from 'react';
import { adminLoginAction, emailLinkLoginAction, type AdminActionState } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { ErrorNotice, Notice } from '@/components/ui/feedback';

const INITIAL: AdminActionState = { ok: false };

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(adminLoginAction, INITIAL);
  const fields = state.fields ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.message && <ErrorNotice>{state.message}</ErrorNotice>}

      <Field label="Email" htmlFor="email" required error={fields.email}>
        <TextInput
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          enterKeyHint="next"
          invalid={Boolean(fields.email)}
        />
      </Field>

      <Field label="Пароль" htmlFor="password" required error={fields.password}>
        <TextInput
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          enterKeyHint="done"
          invalid={Boolean(fields.password)}
        />
      </Field>

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? 'Проверяем…' : 'Войти'}
      </Button>
    </form>
  );
}

/** Вход по ссылке на почту — для сотрудников без пароля. */
export function EmailLinkForm() {
  const [state, formAction, pending] = useActionState(emailLinkLoginAction, INITIAL);
  const fields = state.fields ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.message &&
        (state.ok ? (
          <Notice role="status">{state.message}</Notice>
        ) : (
          <ErrorNotice>{state.message}</ErrorNotice>
        ))}

      <Field label="Email" htmlFor="link-email" required error={fields.email}>
        <TextInput
          id="link-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          enterKeyHint="send"
          invalid={Boolean(fields.email)}
        />
      </Field>

      <Button type="submit" variant="secondary" fullWidth disabled={pending}>
        {pending ? 'Отправляем…' : 'Прислать ссылку'}
      </Button>
    </form>
  );
}
