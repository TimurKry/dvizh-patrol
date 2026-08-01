'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Появление блока при прокрутке.
 *
 * IntersectionObserver вместо слушателя скролла: браузер сам
 * решает, когда элемент вошёл в кадр, и не дёргает JavaScript
 * на каждый пиксель. После срабатывания наблюдение снимается —
 * блок появляется один раз, а не мигает при каждом проходе.
 *
 * Начальное состояние живёт в CSS (`.reveal`), поэтому при
 * отключённом JavaScript и при prefers-reduced-motion контент
 * виден сразу, а не остаётся прозрачным навсегда.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Задержка в миллисекундах — для ступенчатого выхода группы. */
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Наблюдателя нет — показываем сразу, ничего не ломаем.
    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible');
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      node.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add('is-visible');
          observer.unobserve(el);
        }
      },
      // Запускаем чуть раньше, чем блок доедет до низа экрана:
      // иначе на быстрой прокрутке анимация не успевает.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Tag ref={ref} className={cn('reveal', className)}>
      {children}
    </Tag>
  );
}
