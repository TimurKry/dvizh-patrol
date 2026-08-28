/**
 * Цвета команд.
 *
 * Единственное место, где живут hex-значения командных цветов.
 * База хранит только ключ (`teams.color`, enum `team_color`), а
 * визуальное представление берётся отсюда. Так цвет можно
 * перекрасить одной правкой, не трогая ни данных, ни миграций.
 *
 * Интерфейс от этих цветов не зависит: он чёрно-белый с одним
 * пурпурным сигналом. Командный цвет появляется только на
 * рубашке карточки, орнаменте, маркере команды и связанных с
 * командой деталях — так требует V3 Mono Signal.
 */

/**
 * Порядок здесь — это порядок раздачи: `next_team_color` берёт
 * первый свободный ключ по перечислению в базе, а оно заведено в
 * том же порядке. Шесть первых достались командам ещё до того,
 * как понадобились остальные, поэтому новые дописаны в конец, а
 * не расставлены по цветовому кругу: перестановка перекрасила бы
 * уже заведённые команды.
 */
export const TEAM_COLORS = [
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'pink',
  'lime',
  'teal',
  'purple',
  'coral',
] as const;

export type TeamColor = (typeof TEAM_COLORS)[number];

type TeamColorSpec = {
  /** Собственно цвет команды. */
  readonly hex: string;
  /**
   * Что писать поверх заливки.
   *
   * Пара считается один раз здесь, а не подбирается в каждом
   * компоненте. Все десять заливок достаточно светлые, чтобы
   * тёмная надпись читалась на них лучше светлой: у синего с
   * белым выходило 3,4:1 — ниже порога для мелкого текста, — а с
   * тёмным получается 5,3:1. Проверяется тестом, а не на глаз.
   */
  readonly on: string;
  /** Человеческое название для админки и скринридера. */
  readonly label: string;
};

const SPEC: Record<TeamColor, TeamColorSpec> = {
  red: { hex: '#FF3B30', on: '#060609', label: 'Красная' },
  green: { hex: '#21C55D', on: '#060609', label: 'Зелёная' },
  blue: { hex: '#2F80FF', on: '#060609', label: 'Синяя' },
  yellow: { hex: '#FFD400', on: '#060609', label: 'Жёлтая' },
  orange: { hex: '#FF7A00', on: '#060609', label: 'Оранжевая' },
  pink: { hex: '#FF00B3', on: '#060609', label: 'Розовая' },

  // Четыре добавленных цвета выбраны по тону между уже занятыми:
  // лаймовый между жёлтым и зелёным, бирюзовый между зелёным и
  // синим, фиолетовый между синим и розовым, коралловый между
  // розовым и красным. Так десять рубашек различимы, а не
  // распадаются на «примерно красную» и «примерно синюю».
  lime: { hex: '#B4F034', on: '#060609', label: 'Лаймовая' },
  teal: { hex: '#12CFC0', on: '#060609', label: 'Бирюзовая' },
  purple: { hex: '#A855F7', on: '#060609', label: 'Фиолетовая' },
  coral: { hex: '#FF7A8A', on: '#060609', label: 'Коралловая' },
};

/** Цвет по умолчанию, пока организатор не назначил команде свой. */
export const DEFAULT_TEAM_COLOR: TeamColor = 'pink';

export function isTeamColor(value: unknown): value is TeamColor {
  return typeof value === 'string' && (TEAM_COLORS as readonly string[]).includes(value);
}

export function teamColorHex(color: TeamColor | null | undefined): string {
  return SPEC[color && isTeamColor(color) ? color : DEFAULT_TEAM_COLOR].hex;
}

export function teamColorOn(color: TeamColor | null | undefined): string {
  return SPEC[color && isTeamColor(color) ? color : DEFAULT_TEAM_COLOR].on;
}

export function teamColorLabel(color: TeamColor | null | undefined): string {
  return SPEC[color && isTeamColor(color) ? color : DEFAULT_TEAM_COLOR].label;
}

/**
 * CSS-переменные для корня командного экрана.
 *
 * Рубашка карточки, орнамент и маркер читают `--team-color`, а не
 * получают цвет пропсами: иначе значение пришлось бы протаскивать
 * через каждый промежуточный компонент, а серверные компоненты
 * не смогли бы его подставить без клиентского контекста.
 */
export function teamColorVars(color: TeamColor | null | undefined): React.CSSProperties {
  return {
    '--team-color': teamColorHex(color),
    '--team-on-color': teamColorOn(color),
  } as React.CSSProperties;
}

/** Список для селектора в админке. */
export const TEAM_COLOR_OPTIONS = TEAM_COLORS.map((color) => ({
  value: color,
  label: SPEC[color].label,
  hex: SPEC[color].hex,
}));
