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

export const TEAM_COLORS = ['red', 'green', 'blue', 'yellow', 'orange', 'pink'] as const;

export type TeamColor = (typeof TEAM_COLORS)[number];

type TeamColorSpec = {
  /** Собственно цвет команды. */
  readonly hex: string;
  /**
   * Что писать поверх заливки. Жёлтый и оранжевый настолько
   * светлые, что белый текст на них не проходит даже 3:1, —
   * поэтому пара считается на глаз один раз здесь, а не
   * подбирается в каждом компоненте.
   */
  readonly on: string;
  /** Человеческое название для админки и скринридера. */
  readonly label: string;
};

const SPEC: Record<TeamColor, TeamColorSpec> = {
  red: { hex: '#FF3B30', on: '#060609', label: 'Красная' },
  green: { hex: '#21C55D', on: '#060609', label: 'Зелёная' },
  blue: { hex: '#2F80FF', on: '#F5F5F1', label: 'Синяя' },
  yellow: { hex: '#FFD400', on: '#060609', label: 'Жёлтая' },
  orange: { hex: '#FF7A00', on: '#060609', label: 'Оранжевая' },
  pink: { hex: '#FF00B3', on: '#060609', label: 'Розовая' },
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
