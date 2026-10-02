import { describe, expect, it } from 'vitest';
import { canManageTeam, canUseCrm, safeNextPath, staffHome } from '@/lib/studio/staff';

describe('роли', () => {
  it('ведущий не видит заявок и попадает в игру', () => {
    expect(canUseCrm('host')).toBe(false);
    expect(staffHome('host')).toBe('/admin');
  });

  it('менеджер работает в Студии, но не управляет командой', () => {
    expect(canUseCrm('manager')).toBe(true);
    expect(canManageTeam('manager')).toBe(false);
    expect(staffHome('manager')).toBe('/studio');
  });

  it('владелец может всё', () => {
    expect(canUseCrm('owner')).toBe(true);
    expect(canManageTeam('owner')).toBe(true);
  });
});

describe('safeNextPath', () => {
  it('пропускает путь внутри приложения', () => {
    expect(safeNextPath('/studio/leads/1', '/studio')).toBe('/studio/leads/1');
  });

  it('не уводит на чужой сайт', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '', null]) {
      expect(safeNextPath(bad, '/studio')).toBe('/studio');
    }
  });
});
