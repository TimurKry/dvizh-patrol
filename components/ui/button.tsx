import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Кнопки.
 *
 * Основная — кирпичная заливка с постера. Вторичная — тёплая
 * бумага с волосяной рамкой. Габариты одинаковые, чтобы пара
 * читалась как единый блок.
 *
 * Красный здесь работает так же, как на постере: им набрано
 * главное и только главное. Разливать его по всем элементам
 * подряд нельзя — тогда акцент перестаёт быть акцентом.
 *
 * Надписи набраны плакатным шрифтом в капители, как нижняя
 * строка постера («ДАТА», «СТАРТ», «УЧАСТИЕ»).
 *
 * Теней нет. Радиус 16px везде, кроме размера sm — там 12px,
 * потому что 16px на кнопке высотой 36px выглядит как таблетка.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brick text-paper border border-brick ' +
    'hover:bg-brick-deep hover:border-brick-deep active:bg-brick-deep ' +
    'disabled:bg-sand disabled:border-sand',
  secondary:
    'bg-paper text-ink border border-hairline-strong ' +
    'hover:border-brick hover:text-brick active:bg-brick-wash',
  ghost:
    'bg-transparent text-sepia border border-transparent ' +
    'hover:bg-brick-wash hover:text-brick active:bg-brick-wash',
  // Разрушающее действие: контур кирпичом, заливка — только при
  // наведении. Иначе оно спорило бы с основной кнопкой за внимание.
  danger:
    'bg-paper text-brick border border-brick ' +
    'hover:bg-brick hover:text-paper',
};

const SIZES: Record<Size, string> = {
  sm: 'text-caption px-4 py-2 rounded-[12px] min-h-[36px] tracking-[0.08em]',
  md: 'text-body px-6 py-4 rounded-[16px] min-h-[44px] tracking-[0.06em]',
  lg: 'text-subheading px-8 py-5 rounded-[16px] min-h-[52px] tracking-[0.06em]',
};

const BASE =
  'inline-flex items-center justify-center gap-2 select-none uppercase ' +
  'font-poster font-medium transition-colors duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick';

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
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {children}
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
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {children}
    </Link>
  );
}
