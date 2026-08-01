'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';
import { membersWord } from '@/lib/messages';

/**
 * Код приглашения.
 *
 * После старта квеста код скрывается от рядовых участников:
 * состав уже собран, а показывать его на экране посреди города
 * незачем. Капитану он остаётся доступен — вдруг кто-то потерял
 * сессию и должен войти заново.
 */
export function JoinCodeCard({
  joinCode,
  isCaptain,
  started,
  teamSize,
  membersCount,
}: {
  joinCode: string;
  isCaptain: boolean;
  started: boolean;
  teamSize: number;
  membersCount: number;
}) {
  const [revealed, setRevealed] = useState(!started);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const full = membersCount >= teamSize;
  const canSee = !started || isCaptain;

  if (!canSee) return null;

  const inviteLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join?code=${joinCode}`
      : `/join?code=${joinCode}`;

  async function copy(value: string, kind: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Буфер обмена недоступен — код и так виден на экране.
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-subheading">Код команды</h2>
        {full && <span className="text-caption text-sepia">состав собран</span>}
      </div>

      {revealed ? (
        <>
          <p
            className="text-center text-display tracking-[0.15em] tabular-nums"
            aria-label={`Код команды: ${joinCode.split('').join(' ')}`}
          >
            {joinCode}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" size="sm" onClick={() => void copy(joinCode, 'code')}>
              {copied === 'code' ? 'Код скопирован' : 'Скопировать код'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void copy(inviteLink, 'link')}>
              {copied === 'link' ? 'Ссылка скопирована' : 'Скопировать ссылку'}
            </Button>
          </div>

          <p className="text-caption text-sepia">
            {full
              ? `В команде уже ${teamSize} ${membersWord(teamSize)} — больше добавить нельзя.`
              : `Передайте код остальным. Свободных мест: ${teamSize - membersCount}.`}
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body text-sepia">
            Квест идёт — код скрыт, чтобы не мелькал на экране. Показать его может капитан.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setRevealed(true)}>
            Показать код
          </Button>
        </div>
      )}
    </Card>
  );
}
