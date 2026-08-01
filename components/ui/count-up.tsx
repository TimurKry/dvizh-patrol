'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Число, набегающее до своего значения при появлении в кадре.
 *
 * Считаем через requestAnimationFrame по времени, а не по кадрам:
 * на 60 и на 120 Гц отсчёт длится одинаково. Анимация стартует
 * один раз — по первому пересечению с областью видимости.
 *
 * Разметка отдаёт финальное значение сразу: сервер рендерит
 * готовое число, и при выключенном JavaScript или при
 * prefers-reduced-motion на экране остаётся оно же. Анимация —
 * добавка, а не условие того, что цифру увидят.
 */
export function CountUp({
  value,
  duration = 1100,
  className,
  suffix = '',
}: {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  /**
   * `null` — «анимация ещё не вмешивалась», на экране финальное
   * значение. Отдельного состояния для «до старта» не нужно, а
   * смена входного значения подхватывается сама: пока анимация
   * не началась, показывается свежий проп.
   */
  const [animated, setAnimated] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let frame = 0;
    let start: number | null = null;

    const step = (now: number) => {
      start ??= now;
      const progress = Math.min((now - start) / duration, 1);
      // Замедление к концу: ease-out cubic.
      const eased = 1 - (1 - progress) ** 3;
      setAnimated(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          frame = requestAnimationFrame(step);
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {animated ?? value}
      {suffix}
    </span>
  );
}
