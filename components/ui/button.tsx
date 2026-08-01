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

/**
 * Кнопка чуть приподнимается под курсором и проседает при
 * нажатии. Двигается только transform, поэтому соседние элементы
 * стоят на месте, а браузер не пересчитывает раскладку.
 * `disabled:transform-none` — выключенная кнопка не должна
 * реагировать вовсе, иначе она выглядит нажимаемой.
 */
const BASE =
  'relative inline-flex items-center justify-center gap-2 select-none uppercase overflow-hidden ' +
  'font-poster font-medium ' +
  'transition-[color,background-color,border-color,transform] duration-200 ease-out ' +
  'hover:-translate-y-[2px] active:translate-y-0 active:scale-[0.985] ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'disabled:hover:translate-y-0 disabled:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick';

/**
 * Блик по кирпичной заливке. Живёт отдельным слоем, чтобы не
 * трогать текст кнопки; `group-hover` запускает его один раз за
 * наведение, а не по кругу.
 */
function Sheen() {
  return (
    <span
      aria-hidden="true"
      className={
        'pointer-events-none absolute inset-y-0 -left-full w-1/3 ' +
        'bg-[linear-gradient(90deg,transparent,rgb(250_239_229/0.28),transparent)] ' +
        'group-hover:animate-[dp-sheen_0.9s_ease-out] motion-reduce:hidden'
      }
    />
  );
}

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
      className={cn('group', BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {variant === 'primary' && <Sheen />}
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
      className={cn('group', BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {variant === 'primary' && <Sheen />}
      <span className="relative">{children}</span>
    </Link>
  );
}
