import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Текстовые страницы: правила, условия, приватность.
 *
 * Ширина ограничена читаемой мерой, размеры взяты из шкалы
 * дизайн-системы. Body не выходит за 14–18px — за этими границами
 * шрифт системы начинает разваливаться.
 */

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex max-w-[68ch] flex-col gap-6', className)}>{children}</div>;
}

export function ProseSection({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="flex flex-col gap-3">
      <h2 className="text-heading-sm">{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-body text-stone">{children}</p>;
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-body text-stone">
          <span aria-hidden="true" className="text-pebble">
            —
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function NumberedList({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-body text-stone">
          <span aria-hidden="true" className="min-w-6 text-pebble tabular-nums">
            {index + 1}.
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-caption font-medium uppercase tracking-[0.08em] text-stone">{eyebrow}</p>
      <h1 className="text-heading md:text-heading-lg">{title}</h1>
      {lead && <p className="max-w-[60ch] text-subheading text-stone">{lead}</p>}
    </header>
  );
}
