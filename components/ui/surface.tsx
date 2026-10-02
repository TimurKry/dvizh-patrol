import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Классы поверхности отдельно от компонента: изредка карточку
 * нужно нарисовать на чужом элементе — например, когда обёртка
 * уже создана `Reveal`, а лишний div сломал бы разметку
 * списка определений.
 */
export const CARD_SURFACE = 'bg-panel border border-hairline';
export const CARD_INTERACTIVE = 'lift hover:border-signal-line';

/**
 * Поверхность первого уровня: Paper White на Linen Canvas.
 * Глубина в системе передаётся контрастом поверхностей и
 * волосяной рамкой — не тенью.
 */
export function Card({
  children,
  className,
  as: Tag = 'div',
  padded = true,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  padded?: boolean;
  /**
   * Карточка приподнимается под курсором и теплеет рамкой.
   * Включается явно: у неподвижной справки реакция на наведение
   * означала бы, что по ней можно кликнуть.
   */
  interactive?: boolean;
}) {
  return (
    <Tag className={cn(CARD_SURFACE, padded && 'p-4', interactive && CARD_INTERACTIVE, className)}>
      {children}
    </Tag>
  );
}

/** Заголовок раздела: маленький, набранный как штамп. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-caption font-medium uppercase tracking-[0.08em] text-muted', className)}>
      {children}
    </p>
  );
}

export function SectionTitle({
  children,
  className,
  as: Tag = 'h2',
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return <Tag className={cn('text-title md:text-headline', className)}>{children}</Tag>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-hairline', className)} />;
}

/** Подпись-метаданные под заголовком или в карточке. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-caption text-muted', className)}>{children}</p>;
}
