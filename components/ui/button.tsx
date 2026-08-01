import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Кнопки.
 *
 * Основная — заливка Ink Black, белый текст. Вторичная — Paper
 * White с волосяной рамкой. Габариты у них одинаковые, чтобы
 * пара читалась как единый блок (правило дизайн-системы).
 *
 * Теней нет. Радиус 16px везде, кроме размера sm — там 12px,
 * потому что 16px на кнопке высотой 36px выглядит как таблетка.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-ink-black text-paper-white border border-ink-black ' +
    'hover:bg-[#232323] active:bg-[#000000] disabled:bg-pebble disabled:border-pebble',
  secondary:
    'bg-paper-white text-ink-black border border-hairline ' +
    'hover:border-hairline-strong active:bg-ink-wash',
  ghost:
    'bg-transparent text-ink-black border border-transparent ' +
    'hover:bg-ink-wash active:bg-ink-wash',
  // Разрушающее действие в монохромной системе обозначается
  // рамкой и текстом, а не красным фоном.
  danger:
    'bg-paper-white text-ink-black border border-ink-black ' +
    'hover:bg-ink-black hover:text-paper-white',
};

const SIZES: Record<Size, string> = {
  sm: 'text-caption px-4 py-2 rounded-[12px] min-h-[36px]',
  md: 'text-body px-6 py-4 rounded-[16px] min-h-[44px]',
  lg: 'text-subheading px-8 py-5 rounded-[16px] min-h-[52px]',
};

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium ' +
  'transition-colors duration-150 select-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-black';

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
