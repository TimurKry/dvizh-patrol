/**
 * Ролик «Движ-Патруль · как это было».
 *
 * Лента пар «задание → результат»: сверху эталон, который команда
 * повторяла, крупно — то, что у неё вышло. Кадры идут как в ленте
 * телефона: карточка стоит, потом коротким рывком уходит вверх, и
 * на месте прилёта щёлкает затвор.
 *
 * Ритм здесь — единственная настройка, которая правда меняет
 * ощущение. HOLD — доля шага, которую карточка стоит неподвижно;
 * остаток уходит на бросок. Чем ближе HOLD к единице, тем резче
 * листается. 0,72 — это «успел рассмотреть, но не заскучал».
 */

export const FPS = 30;
export const W = 1080;
export const H = 1920;

/** Палитра Mono Signal — та же, что в приложении. */
export const CANVAS = '#060609';
export const PANEL = '#121216';
export const INK = '#F5F5F1';
export const MUTED = '#A3A3A8';
export const FAINT = '#404045';
export const SIGNAL = '#FF00B3';

export const FONT_DISPLAY = 'UnboundedVideo, Arial Black, sans-serif';
export const FONT_TEXT = 'OnestVideo, Helvetica, Arial, sans-serif';

/** Цвета команд — копия `lib/team-colors.ts`, ролик о них знает. */
export const TEAM_COLORS = {
  red: '#FF3B30',
  green: '#21C55D',
  blue: '#2F80FF',
  yellow: '#FFD400',
  orange: '#FF7A00',
  pink: '#FF00B3',
  lime: '#B4F034',
  teal: '#12CFC0',
  purple: '#A855F7',
  coral: '#FF7A8A',
};

export function teamColor(key) {
  return TEAM_COLORS[key] ?? SIGNAL;
}

// ═══ Ритм ══════════════════════════════════════════════════════

/** Кадров на одну карточку: стоит и уходит. */
export const STEP = 54;

/** Доля шага в покое. Остальное — бросок. */
export const HOLD = 0.72;

/** Заставка и финал. */
export const INTRO = 62;
export const OUTRO = 96;

export function totalFrames(count) {
  return INTRO + count * STEP + OUTRO;
}

/** Кадр, на котором карточка встаёт на место. */
export function arrivalOf(index) {
  return INTRO + index * STEP;
}
