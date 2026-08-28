import { describe, expect, it } from 'vitest';
import {
  TEAM_ACCESS,
  TEAM_ACCESS_OPTIONS,
  isTeamAccess,
  teamAccess,
  teamAccessSpec,
} from '@/lib/team-access';

/**
 * Режим доступа команды.
 *
 * В базе это пара флагов, наружу — один режим. Расшифровка живёт в
 * одном месте именно затем, чтобы «is_test без full_pool» не начали
 * толковать по-разному на разных экранах, — здесь проверяется, что
 * толкование одно и что невозможная комбинация не превращается в
 * четвёртый режим втихую.
 */

const team = (is_test: boolean, full_pool: boolean) => ({ is_test, full_pool });

describe('режим доступа', () => {
  it('читает пару флагов однозначно', () => {
    expect(teamAccess(team(false, false))).toBe('normal');
    expect(teamAccess(team(true, false))).toBe('alpha');
    expect(teamAccess(team(true, true))).toBe('preview');
  });

  it('невозможную пару считает обычной командой', () => {
    // База такую пару не пропустит — стоит проверочное
    // ограничение. Но если она когда-нибудь возникнет, безопасный
    // ответ один: обычная команда. Обратное означало бы, что
    // сломанная строка открывает участнику весь квест.
    expect(teamAccess(team(false, true))).toBe('normal');
  });

  it('описывает каждый режим и организатору, и участнику', () => {
    for (const access of TEAM_ACCESS) {
      const spec = teamAccessSpec(access);
      expect(spec.label.length, access).toBeGreaterThan(0);
      expect(spec.admin.length, access).toBeGreaterThan(20);
      expect(spec.confirm, access).toMatch(/\?/);
    }
  });

  it('обычной команде плашку не показывает', () => {
    expect(teamAccessSpec('normal').player).toBeNull();
    expect(teamAccessSpec('normal').tag).toBe('');
  });

  it('служебные режимы предупреждают участника и метятся в списках', () => {
    for (const access of ['alpha', 'preview'] as const) {
      const spec = teamAccessSpec(access);
      expect(spec.player, access).not.toBeNull();
      expect(spec.player, access).toMatch(/не забирает|не уходит|не попадает/);
      expect(spec.tag.length, access).toBeGreaterThan(0);
    }
  });

  it('различает метки служебных режимов', () => {
    expect(teamAccessSpec('alpha').tag).not.toBe(teamAccessSpec('preview').tag);
  });

  it('не пропускает выдуманный режим', () => {
    expect(isTeamAccess('alpha')).toBe(true);
    expect(isTeamAccess('бета')).toBe(false);
    expect(isTeamAccess(null)).toBe(false);
  });

  it('отдаёт админке все три варианта по порядку', () => {
    expect(TEAM_ACCESS_OPTIONS.map((option) => option.value)).toEqual([...TEAM_ACCESS]);
  });
});
