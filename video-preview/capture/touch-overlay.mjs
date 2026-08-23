/**
 * Индикатор касания.
 *
 * Ровно то же, что рисует системная запись экрана телефона: кружок
 * под пальцем в момент нажатия. Приложение об этом не знает —
 * скрипт добавляется в страницу только на время записи, слоем
 * поверх всего, и в продакшене его нет.
 */

export const TOUCH_OVERLAY = `
(() => {
  const host = document.createElement('div');
  host.id = '__tap-layer';
  host.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';

  const style = document.createElement('style');
  style.textContent = \`
    @keyframes __tap {
      0%   { transform: translate(-50%, -50%) scale(0.35); opacity: 0; }
      18%  { transform: translate(-50%, -50%) scale(1);    opacity: 0.95; }
      100% { transform: translate(-50%, -50%) scale(1.9);  opacity: 0; }
    }
    .__tap-dot {
      position: absolute;
      width: 76px; height: 76px;
      border-radius: 9999px;
      border: 3px solid #ff00b3;
      background: rgba(255, 0, 179, 0.18);
      animation: __tap 620ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }
  \`;

  const attach = () => {
    if (!document.body) return requestAnimationFrame(attach);
    document.body.appendChild(style);
    document.body.appendChild(host);
  };
  attach();

  window.__tapRipple = (x, y) => {
    const dot = document.createElement('span');
    dot.className = '__tap-dot';
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    host.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  };
})();
`;
