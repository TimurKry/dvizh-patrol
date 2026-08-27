/**
 * Токены Mono Signal.
 *
 * Значения продублированы из app/globals.css намеренно: Remotion
 * рендерит в отдельном браузере и переменные приложения не видит.
 * Менять их нужно вместе — расхождение будет заметно на стыке
 * снятого экрана и графики вокруг него.
 */
export const C = {
  canvas: '#060609',
  panel: '#121216',
  ink: '#F5F5F1',
  muted: '#A3A3A8',
  hairline: '#404045',
  signal: '#FF00B3',
};

export const FONT_DISPLAY = 'UnboundedVideo, Arial Black, sans-serif';
export const FONT_BODY = 'OnestVideo, system-ui, sans-serif';

/** Исходный кадр экрана: 390×844 при плотности 3. */
export const SRC = { w: 1170, h: 2532 };

export const FPS = 30;
export const DURATION = 36 * FPS;
