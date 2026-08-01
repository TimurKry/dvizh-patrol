import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

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
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  padded?: boolean;
}) {
  return (
    <Tag
      className={cn(
        'bg-paper-white border border-hairline rounded-[16px]',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Заголовок раздела: маленький, набранный как штамп. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-caption font-medium uppercase tracking-[0.08em] text-stone',
        className,
      )}
    >
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
  return <Tag className={cn('text-heading-sm md:text-heading', className)}>{children}</Tag>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-hairline', className)} />;
}

/** Подпись-метаданные под заголовком или в карточке. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-caption text-stone', className)}>{children}</p>;
}
