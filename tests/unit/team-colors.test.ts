import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_COLOR,
  TEAM_COLORS,
  TEAM_COLOR_OPTIONS,
  isTeamColor,
  teamColorHex,
  teamColorLabel,
  teamColorOn,
} from '@/lib/team-colors';

/**
 * Цвета команд.
 *
 * Цвет — это то, по чему команда узнаёт свою рубашку, а
 * организатор различает команды в списке и на карте. Два
 * одинаковых оттенка ломают и то, и другое, поэтому набор
 * проверяется здесь, а не на глаз в вечер квеста.
 */

/** Расстояние между цветами в OKLab — примерно как их видит глаз. */
function distance(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Каналы hex в линейный sRGB. */
function linear(hex: string): [number, number, number] {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}

function oklab(hex: string): [number, number, number] {
  const [r, g, b] = linear(hex);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.629978687 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Контраст по WCAG: нужен для надписи поверх заливки. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b2] = linear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const light = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (light + 0.05) / (dark + 0.05);
}

describe('палитра команд', () => {
  it('хватает на десять команд', () => {
    expect(TEAM_COLORS.length).toBe(10);
  });

  it('не повторяет оттенки', () => {
    const seen = new Set(TEAM_COLORS.map((color) => teamColorHex(color)));
    expect(seen.size).toBe(TEAM_COLORS.length);
  });

  it('держит цвета различимыми на глаз', () => {
    // Порог подобран по самой близкой паре в исходной шестёрке:
    // красный и коралловый. Всё, что ближе, в списке команд
    // читается как один цвет.
    const pairs = TEAM_COLORS.flatMap((a, i) =>
      TEAM_COLORS.slice(i + 1).map((b) => [a, b] as const),
    );

    for (const [a, b] of pairs) {
      const gap = distance(teamColorHex(a), teamColorHex(b));
      expect(gap, `${a} и ${b} слишком похожи`).toBeGreaterThan(0.1);
    }
  });

  it('даёт читаемую надпись поверх каждой заливки', () => {
    for (const color of TEAM_COLORS) {
      const ratio = contrast(teamColorHex(color), teamColorOn(color));
      expect(ratio, `надпись на «${teamColorLabel(color)}» не читается`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('называет каждый цвет по-русски и по-разному', () => {
    const labels = TEAM_COLORS.map((color) => teamColorLabel(color));
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label).toMatch(/^[А-Яа-яЁё]+$/);
  });

  it('подставляет цвет по умолчанию вместо мусора', () => {
    expect(teamColorHex(null)).toBe(teamColorHex(DEFAULT_TEAM_COLOR));
    expect(teamColorHex('крапчатая' as never)).toBe(teamColorHex(DEFAULT_TEAM_COLOR));
    expect(isTeamColor('крапчатая')).toBe(false);
    expect(isTeamColor('purple')).toBe(true);
  });

  it('отдаёт админке полный список', () => {
    expect(TEAM_COLOR_OPTIONS.map((option) => option.value)).toEqual([...TEAM_COLORS]);
  });
});
