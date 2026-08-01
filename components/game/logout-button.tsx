'use client';

import { useTransition } from 'react';
import { logoutTeamAction } from '@/actions/team';
import { Button } from '@/components/ui/button';

/**
 * Выход из команды.
 *
 * Отзывает сессию на сервере, а не просто удаляет cookie: если
 * телефон потеряли, доступ должен закрываться по-настоящему.
 */
export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => void logoutTeamAction())}
    >
      {pending ? 'Выходим…' : 'Выйти'}
    </Button>
  );
}
