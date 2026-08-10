import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Кнопки.
 *
 * Основная — сплошной сигнал с тёмной надписью, как CTA в Figma
 * 79:24. Вторичная — панель с волосяной рамкой и светлой
 * надписью, 79:30. Габариты одинаковые, чтобы пара читалась как
 * единый блок.
 *
 * Пурпурный работает в системе ровно как сигнал: им набрано
 * главное и только главное. Две основные кнопки на экран — это
 * уже на одну больше, чем нужно.
 *
 * Надписи набраны Unbounded в капители. Углы прямые, теней нет.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-signal text-canvas border border-signal ' +
    'hover:bg-signal-deep hover:border-signal-deep active:bg-signal-deep ' +
    'disabled:bg-faint disabled:border-faint disabled:text-canvas',
  secondary:
    'bg-canvas text-ink border border-ink ' +
    'hover:border-signal hover:text-signal active:bg-signal-wash',
  ghost:
    'bg-transparent text-muted border border-transparent ' +
    'hover:bg-ink-wash hover:text-ink active:bg-ink-wash',
  // Разрушающее действие: контур сигналом, заливка — только при
  // наведении. Иначе оно спорило бы с основной кнопкой за внимание.
  danger: 'bg-canvas text-signal border border-signal hover:bg-signal hover:text-canvas',
};

const SIZES: Record<Size, string> = {
  // Ниже 44px опускается только sm, и он не используется как
  // единственная цель нажатия на мобильном — там всегда md и выше.
  sm: 'text-caption px-4 py-2 min-h-[36px] tracking-[0.08em]',
  md: 'text-caption px-6 py-4 min-h-[44px] tracking-[0.06em]',
  lg: 'text-body px-8 py-5 min-h-[52px] tracking-[0.06em]',
};

/**
 * Кнопка чуть приподнимается под курсором и проседает при
 * нажатии. Двигается только transform, поэтому соседние элементы
 * стоят на месте, а браузер не пересчитывает раскладку.
 * Выключенная кнопка не реагирует вовсе, иначе она выглядит
 * нажимаемой.
 */
const BASE =
  'relative inline-flex items-center justify-center gap-2 select-none uppercase ' +
  'font-display font-medium ' +
  'transition-[color,background-color,border-color,transform] duration-200 ease-out ' +
  'hover:-translate-y-[2px] active:translate-y-0 active:scale-[0.985] ' +
  'motion-reduce:transform-none motion-reduce:transition-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'disabled:hover:translate-y-0 disabled:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...rest
}: CommonProps & Omit<ComponentProps<'button'>, 'className' | 'children'>) {
  return (
    <button
      className={cn(
        'group',
        BASE,
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      <span className="relative">{children}</span>
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...rest
}: CommonProps & Omit<ComponentProps<typeof Link>, 'className' | 'children'>) {
  return (
    <Link
      className={cn(
        'group',
        BASE,
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      <span className="relative">{children}</span>
    </Link>
  );
}
