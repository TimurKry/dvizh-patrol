'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Поля ввода.
 *
 * Радиус 16px, Paper White, волосяная рамка. Размер шрифта 16px
 * обязателен: меньше — и Safari на iPhone зумит страницу при
 * фокусе, что на улице раздражает сильнее всего.
 *
 * Ошибка передаётся текстом и aria-invalid, а не только цветом.
 */

const CONTROL =
  'w-full bg-paper text-ink rounded-[16px] border px-4 py-3 ' +
  'text-body placeholder:text-sand min-h-[48px] ' +
  'transition-colors focus:outline-none focus-visible:border-ink ' +
  'disabled:bg-ink-wash disabled:text-sand disabled:cursor-not-allowed';

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-caption font-medium text-ink">
        {label}
        {required && (
          <span className="text-sepia" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-ink" role="alert">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-sepia">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  invalid,
  ...rest
}: ComponentProps<'input'> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL, invalid ? 'border-ink' : 'border-hairline', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function TextArea({
  className,
  invalid,
  ...rest
}: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(
        CONTROL,
        'min-h-[120px] resize-y py-3',
        invalid ? 'border-ink' : 'border-hairline',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({
  className,
  invalid,
  children,
  ...rest
}: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <select
      className={cn(
        CONTROL,
        'appearance-none bg-[length:12px] bg-[right_16px_center] bg-no-repeat pr-10',
        invalid ? 'border-ink' : 'border-hairline',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%232b1a14' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
      }}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

/**
 * Флажок. Своя отрисовка вместо системной: нужна зона нажатия
 * не меньше 44px и монохромный вид без синего акцента.
 */
export function Checkbox({
  label,
  description,
  className,
  id,
  ...rest
}: ComponentProps<'input'> & { label: ReactNode; description?: ReactNode }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      {/* Галочка — отдельный SVG поверх поля: так она рисуется
          без inline-стилей и одинаково выглядит во всех браузерах. */}
      <span className="relative mt-[2px] inline-flex h-[22px] w-[22px] shrink-0">
        <input
          id={inputId}
          type="checkbox"
          className={cn(
            'peer h-full w-full cursor-pointer appearance-none',
            'rounded-[6px] border border-hairline-strong bg-paper',
            'checked:border-ink checked:bg-ink',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          {...rest}
        />
        <svg
          viewBox="0 0 14 12"
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute left-1/2 top-1/2 h-3 w-3.5',
            '-translate-x-1/2 -translate-y-1/2 opacity-0 peer-checked:opacity-100',
          )}
        >
          <path
            d="M1 6l4 4 8-9"
            stroke="#faefe5"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <label htmlFor={inputId} className="cursor-pointer text-body leading-snug">
        {label}
        {description && <span className="mt-1 block text-caption text-sepia">{description}</span>}
      </label>
    </div>
  );
}
