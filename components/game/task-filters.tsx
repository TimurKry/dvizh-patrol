'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/cn';
import { TASK_CATEGORY_TEXT } from '@/lib/messages';
import type { TaskCategory } from '@/types/database';

/**
 * Фильтры и сортировка списка заданий.
 *
 * Состояние живёт в адресной строке: ссылку можно переслать
 * напарнику, а возврат «назад» возвращает тот же вид. Отдельного
 * клиентского состояния нет намеренно.
 */

const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'available', label: 'Доступные' },
  { value: 'todo', label: 'Невыполненные' },
  { value: 'in_review', label: 'На проверке' },
  { value: 'done', label: 'Выполненные' },
] as const;

const SORTS = [
  { value: 'number', label: 'по номеру' },
  { value: 'points', label: 'по баллам' },
  { value: 'category', label: 'по категории' },
  { value: 'status', label: 'по статусу' },
] as const;

export function TaskFilters({
  filter,
  sort,
  category,
  categories,
}: {
  filter: string;
  sort: string;
  category: string;
  categories: TaskCategory[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value === 'all' || (key === 'sort' && value === 'number')) next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      router.replace(query ? `/tasks?${query}` : '/tasks', { scroll: false });
    },
    [params, router],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="scroll-x -mx-1 px-1">
        <div role="group" aria-label="Фильтр заданий" className="flex gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setParam('filter', item.value)}
              aria-pressed={filter === item.value}
              className={cn(
                'shrink-0 rounded-[9999px] border px-4 py-2 text-caption font-medium transition-colors',
                filter === item.value
                  ? 'border-ink bg-ink text-canvas'
                  : 'border-hairline bg-panel text-muted hover:border-hairline-strong',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-caption text-muted">
          Сортировка
          <select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            className="min-h-[40px] border border-hairline bg-panel px-3 text-caption"
          >
            {SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {categories.length > 1 && (
          <label className="flex items-center gap-2 text-caption text-muted">
            Категория
            <select
              value={category}
              onChange={(e) => setParam('category', e.target.value)}
              className="min-h-[40px] border border-hairline bg-panel px-3 text-caption"
            >
              <option value="all">все</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {TASK_CATEGORY_TEXT[item]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
