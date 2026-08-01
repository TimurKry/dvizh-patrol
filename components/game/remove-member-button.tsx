'use client';

import { useActionState, useState } from 'react';
import { removeMemberAction, type ActionState } from '@/actions/team';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/messages';

const INITIAL: ActionState = { ok: false };

/**
 * Удаление участника капитаном.
 *
 * Подтверждение показывается прямо в строке: модальное окно на
 * мобильном перекрывает список и сбивает контекст.
 */
export function RemoveMemberButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const [state, formAction, pending] = useActionState(removeMemberAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  if (state.error) {
    return (
      <span className="text-caption text-ink" role="alert">
        {errorMessage(state.error)}
      </span>
    );
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Удалить
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <span className="sr-only">Удалить участника {memberName}?</span>
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? 'Удаляем…' : 'Подтвердить'}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Отмена
      </Button>
    </form>
  );
}
