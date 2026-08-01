'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewSubmissionAction, type AdminActionState } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import type { SubmissionStatus } from '@/types/database';

const INITIAL: AdminActionState = { ok: false };

/**
 * Решение по отправке.
 *
 * После успешного решения панель сама открывает следующую
 * фотографию из очереди: организатор разбирает десятки снимков
 * подряд, и возврат в список каждый раз стоил бы ему минут.
 */
export function ReviewPanel({
  submissionId,
  defaultPoints,
  currentStatus,
  currentComment,
  nextSubmissionId,
  aiAvailable,
}: {
  submissionId: string;
  defaultPoints: number;
  currentStatus: SubmissionStatus;
  currentComment: string | null;
  nextSubmissionId: string | null;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(reviewSubmissionAction, INITIAL);
  const [decision, setDecision] = useState<'accept' | 'reject' | 'request_retake' | 'retry_ai'>(
    'accept',
  );

  useEffect(() => {
    if (!state.ok) return;
    // Небольшая пауза, чтобы организатор увидел результат.
    const timer = window.setTimeout(() => {
      if (nextSubmissionId) router.push(`/admin/submissions/${nextSubmissionId}`);
      else router.push('/admin/submissions');
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state.ok, state.message, nextSubmissionId, router]);

  const alreadyAccepted = currentStatus === 'accepted';

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-subheading">Решение</h2>

      {state.message && (
        <Notice tone={state.ok ? 'neutral' : 'strong'} icon={state.ok ? '✓' : '!'} role="status">
          {state.message}
          {state.ok && nextSubmissionId && ' Открываем следующую…'}
        </Notice>
      )}

      {alreadyAccepted && (
        <Notice icon="•">
          Отправка уже принята. Отклонение снимет начисленные баллы обратной транзакцией —
          журнал сохранится.
        </Notice>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="submissionId" value={submissionId} />
        <input type="hidden" name="decision" value={decision} />

        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'accept', label: 'Принять' },
            { value: 'reject', label: 'Отклонить' },
            { value: 'request_retake', label: 'Переснять' },
            { value: 'retry_ai', label: 'Проверить снова', disabled: !aiAvailable },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => setDecision(option.value as typeof decision)}
              aria-pressed={decision === option.value}
              className={
                'min-h-[44px] rounded-[12px] border px-3 py-2 text-caption font-medium transition-colors ' +
                (decision === option.value
                  ? 'border-ink bg-ink text-paper'
                  : 'border-hairline bg-paper text-sepia hover:border-hairline-strong') +
                (option.disabled ? ' cursor-not-allowed opacity-50' : '')
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {decision === 'accept' && (
          <Field
            label="Баллы"
            htmlFor="points"
            hint="По умолчанию — стоимость задания. Можно изменить."
          >
            <TextInput
              id="points"
              name="points"
              type="number"
              min="0"
              max="1000"
              defaultValue={defaultPoints}
            />
          </Field>
        )}

        {decision !== 'retry_ai' && (
          <Field
            label="Комментарий команде"
            htmlFor="comment"
            hint="Виден участникам на странице отправки."
          >
            <TextArea
              id="comment"
              name="comment"
              rows={3}
              maxLength={500}
              defaultValue={currentComment ?? ''}
              placeholder={
                decision === 'reject'
                  ? 'Например: на фотографии не видно знака'
                  : decision === 'request_retake'
                    ? 'Например: попробуйте снять с другого ракурса'
                    : ''
              }
            />
          </Field>
        )}

        <Button
          type="submit"
          variant={decision === 'accept' ? 'primary' : 'secondary'}
          disabled={pending}
          fullWidth
        >
          {pending
            ? 'Сохраняем…'
            : decision === 'accept'
              ? 'Принять задание'
              : decision === 'reject'
                ? 'Отклонить'
                : decision === 'request_retake'
                  ? 'Вернуть на пересъёмку'
                  : 'Отправить на повторную проверку'}
        </Button>
      </form>

      {nextSubmissionId ? (
        <p className="text-caption text-sepia">
          После решения откроется следующая фотография из очереди.
        </p>
      ) : (
        <p className="text-caption text-sepia">Это последняя фотография в очереди.</p>
      )}
    </Card>
  );
}
