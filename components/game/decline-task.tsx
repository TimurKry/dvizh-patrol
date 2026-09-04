'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ui/feedback';

/**
 * Вернуть карточку в колоду.
 *
 * Команда, которая полчаса ищет улитку и не находит, до сих пор
 * могла только сжечь попытки или носить карту до конца квеста.
 * Здесь она меняет её на другую того же типа.
 *
 * Действие необратимо: отказ навсегда убирает задание из раздач
 * этой команде. Поэтому вся вёрстка вокруг кнопки работает на то,
 * чтобы её не нажали случайно.
 *
 * **Кнопка отделена от блока отправки.** Не «ещё одна в столбик»,
 * а через линию и заметный отступ: соседство с «Выбрать из
 * галереи» — прямой путь к промаху большим пальцем.
 *
 * **Кнопка красная контуром, а не заливкой.** Залитая красная
 * рядом с залитой пурпурной — две кнопки, одинаково зовущие
 * нажать. Здесь нужно ровно обратное: заметно, но не притягивает.
 *
 * **Подтверждение — отдельное окно, а не `confirm()`.** Системное
 * окно выглядит как ошибка браузера и не объясняет последствий, а
 * объяснить надо: карточка не вернётся.
 */
export function DeclineTask({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (busy) return;
    setAsking(false);
  }, [busy]);

  async function decline() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/tasks/decline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      if (!data.ok) {
        setError(data.message ?? 'Не получилось вернуть карточку. Попробуйте ещё раз.');
        setBusy(false);
        setAsking(false);
        return;
      }

      // Задания этой карточки больше нет — на её странице делать
      // нечего. Уходим к руке, где уже лежит новая.
      router.push('/tasks');
      router.refresh();
    } catch {
      setError('Не получилось вернуть карточку. Проверьте связь и попробуйте снова.');
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <div className="mt-10 border-t border-hairline pt-6">
      {error && (
        <div className="mb-4">
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}

      <p className="mb-4 text-caption text-muted">
        Не получается найти или дойти? Верните карточку — вместо неё придёт другая того же типа.
        Эта к вам больше не вернётся.
      </p>

      <Button variant="alert" size="md" fullWidth onClick={() => setAsking(true)}>
        Вернуть карту в колоду
      </Button>

      {asking && (
        <ConfirmDialog
          title="Вернуть карту в колоду?"
          taskTitle={taskTitle}
          busy={busy}
          onCancel={close}
          onConfirm={() => void decline()}
        />
      )}
    </div>
  );
}

/**
 * Окно подтверждения.
 *
 * Фокус уходит на «Отмена», а не на подтверждение: клавиша Enter,
 * нажатая по инерции, не должна отдавать карточку. Esc и нажатие
 * по фону закрывают окно.
 */
function ConfirmDialog({
  title,
  taskTitle,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  taskTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onCancel}
        className="fixed inset-0 bg-canvas/85"
      />

      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-[380px] border border-alert bg-panel p-6">
            <h2 className="font-display text-title text-ink">{title}</h2>

            <p className="mt-4 text-body text-muted">
              «{taskTitle}» уйдёт с руки, и{' '}
              <span className="text-ink">это задание вам больше не выпадет</span>. Вместо него
              придёт другая карточка того же типа.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <Button ref={cancelRef} variant="secondary" size="md" fullWidth onClick={onCancel}>
                Оставить карту
              </Button>
              <Button variant="alert" size="md" fullWidth disabled={busy} onClick={onConfirm}>
                {busy ? 'Возвращаем…' : 'Да, вернуть в колоду'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
