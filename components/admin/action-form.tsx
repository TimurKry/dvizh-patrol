'use client';

import { useActionState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/feedback';
import type { AdminActionState } from '@/actions/admin';

const INITIAL: AdminActionState = { ok: false };

type Action = (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;

/**
 * Кнопка, выполняющая серверное действие.
 *
 * Результат показывается рядом с кнопкой, а не всплывающим
 * уведомлением: организатор работает с длинными списками, и
 * важно видеть, к какой именно строке относится ответ.
 */
export function ActionButton({
  action,
  values,
  children,
  variant = 'secondary',
  size = 'sm',
  confirm,
  disabled,
}: {
  action: Action;
  values: Record<string, string>;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  confirm?: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    action,
    INITIAL,
  );

  return (
    <form
      action={formAction}
      className="inline-flex flex-col gap-1"
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <Button type="submit" variant={variant} size={size} disabled={pending || disabled}>
        {pending ? 'Выполняем…' : children}
      </Button>

      {state.message && (
        <span
          role="status"
          className={state.ok ? 'text-caption text-sepia' : 'text-caption text-ink'}
        >
          {state.ok ? '' : '! '}
          {state.message}
        </span>
      )}
    </form>
  );
}

/**
 * Форма с произвольными полями и общим блоком результата.
 * Используется там, где кроме кнопки нужны ещё поля ввода.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  variant = 'primary',
}: {
  action: Action;
  children: (fields: Record<string, string>) => ReactNode;
  submitLabel: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    action,
    INITIAL,
  );

  return (
    <form action={formAction} className={className}>
      {state.message && (
        <Notice tone={state.ok ? 'neutral' : 'strong'} icon={state.ok ? '✓' : '!'} role="status">
          {state.message}
        </Notice>
      )}

      {children(state.fields ?? {})}

      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? 'Сохраняем…' : submitLabel}
      </Button>
    </form>
  );
}
