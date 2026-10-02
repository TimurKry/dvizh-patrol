import { describe, expect, it } from 'vitest';
import { participantReason } from '@/lib/messages';

describe('причина начисления для участника', () => {
  it('прячет машинные коды', () => {
    for (const code of ['ai_validation', 'manual_review', 'bulk_accept', 'task_accepted']) {
      expect(participantReason(code)).toBeNull();
    }
  });

  it('показывает то, что организатор написал руками', () => {
    expect(participantReason('Штраф за опоздание')).toBe('Штраф за опоздание');
  });

  it('пустую причину не показывает', () => {
    expect(participantReason(null)).toBeNull();
    expect(participantReason('')).toBeNull();
  });
});
