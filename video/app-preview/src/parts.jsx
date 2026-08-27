import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT_BODY, FONT_DISPLAY, SRC } from './theme.js';

/**
 * Общие детали кадра.
 *
 * Главное решение здесь — `Detail`. На холсте 1080×1920 телефон
 * целиком занимает около 620 пикселей ширины, то есть экран
 * ужимается вдвое: шестнадцатый кегль приложения превращается в
 * восьмой, и прочитать его нельзя. Поэтому там, где текст надо
 * именно прочитать, кадр не показывает телефон целиком, а
 * вырезает нужный кусок снятого экрана и увеличивает его.
 *
 * Это не подделка интерфейса: пиксели те же самые, меняется
 * только крупность плана — ровно то, что делает продуктовая
 * съёмка, когда переходит с общего на деталь.
 */

// ═══ Фон ═══════════════════════════════════════════════════════

export function Backdrop({ children }) {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 1080], [0, -40]);

  return (
    <AbsoluteFill style={{ background: C.canvas, overflow: 'hidden' }}>
      {/* Техническая сетка: очень тихо, только чтобы плоскость
          не читалась как пустая заливка. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.hairline} 1px, transparent 1px),
                            linear-gradient(90deg, ${C.hairline} 1px, transparent 1px)`,
          backgroundSize: '120px 120px',
          opacity: 0.06,
          transform: `translateY(${drift}px)`,
        }}
      />
      {/* Направленный свет сверху слева. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 70% at 22% 8%, rgba(245,245,241,0.07), transparent 60%)`,
        }}
      />
      {children}
      <Grain />
      <Vignette />
    </AbsoluteFill>
  );
}

function Vignette() {
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(100% 62% at 50% 46%, transparent 42%, rgba(0,0,0,0.72))',
        pointerEvents: 'none',
      }}
    />
  );
}

/** Плёночное зерно: без него градиенты на почти чёрном полосят. */
function Grain() {
  const frame = useCurrentFrame();
  const shift = (frame % 6) * 37;
  return (
    <AbsoluteFill
      style={{
        opacity: 0.055,
        pointerEvents: 'none',
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")",
        backgroundPosition: `${shift}px ${shift * 1.7}px`,
      }}
    />
  );
}

// ═══ Экран приложения ══════════════════════════════════════════

/**
 * Снятый экран внутри корпуса телефона.
 *
 * Корпус нарочно минимальный: рамка, скругление, блик. Он рамка
 * для интерфейса, а не предмет показа.
 */
export function Phone({ src, width = 620, style }) {
  const height = (width * SRC.h) / SRC.w;
  const radius = width * 0.075;

  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: C.canvas,
        border: `2px solid ${C.hairline}`,
        boxShadow: '0 60px 120px rgba(0,0,0,0.65), 0 0 0 10px rgba(18,18,22,0.9)',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      <Img src={staticFile(`screens/${src}.png`)} style={{ width: '100%', display: 'block' }} />
      {/* Мягкий блик по стеклу. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(122deg, rgba(245,245,241,0.13) 0%, transparent 26%, transparent 74%, rgba(245,245,241,0.05) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

/**
 * Крупный план: кусок снятого экрана во всю ширину кадра.
 *
 * crop задаётся в пикселях исходника 1170×2532 — так его можно
 * снять прямо с макета линейкой, не пересчитывая проценты.
 */
export function Detail({ src, crop, width = 900, style, scale = 1 }) {
  const [cx, cy, cw, ch] = crop;
  const k = (width / cw) * scale;

  return (
    <div
      style={{
        width,
        height: ch * (width / cw),
        borderRadius: 22,
        border: `1px solid ${C.hairline}`,
        background: C.panel,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 40px 90px rgba(0,0,0,0.6)',
        ...style,
      }}
    >
      <Img
        src={staticFile(`screens/${src}.png`)}
        style={{
          position: 'absolute',
          width: SRC.w * k,
          left: -cx * k + ((width - cw * k) / 2),
          top: -cy * k + ((ch * (width / cw) - ch * k) / 2),
          display: 'block',
        }}
      />
    </div>
  );
}

// ═══ Подписи ═══════════════════════════════════════════════════

/** Безопасная зона Reels: 190 сверху, 300 снизу. */
export const SAFE = { top: 190, bottom: 300 };

export function Caption({ text, eyebrow, at, y = 'bottom', delay = 0 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - at - delay;

  const enter = spring({ frame: local, fps, config: { damping: 200, mass: 0.6 } });
  const opacity = interpolate(local, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const pos = y === 'bottom' ? { bottom: SAFE.bottom } : { top: SAFE.top };

  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        right: 90,
        ...pos,
        opacity,
        transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
        textAlign: 'center',
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: '0.22em',
            color: C.signal,
            marginBottom: 16,
          }}
        >
          {eyebrow}
        </div>
      )}
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 52,
          lineHeight: 1.08,
          letterSpacing: '-0.01em',
          color: C.ink,
          textWrap: 'balance',
        }}
      >
        {text}
      </div>
    </div>
  );
}

export function Note({ children, at, delay = 0 }) {
  const frame = useCurrentFrame();
  const local = frame - at - delay;
  const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        right: 90,
        bottom: SAFE.bottom - 76,
        opacity,
        textAlign: 'center',
        fontFamily: FONT_BODY,
        fontWeight: 400,
        fontSize: 30,
        color: C.muted,
      }}
    >
      {children}
    </div>
  );
}

// ═══ Маршрут ═══════════════════════════════════════════════════

/**
 * Фирменная пунктирная тропа.
 *
 * Один и тот же путь проходит через весь ролик: в начале
 * прочерчивается, дальше живёт на фоне. Он и есть та ниточка,
 * которая держит склейки вместе.
 */
export function Route({ progress, opacity = 1, stroke = C.signal, width = 5 }) {
  const d = 'M -60 1420 C 220 1300, 250 980, 470 900 S 900 860, 980 640 S 860 300, 1140 190';

  // Прочерк сделан маской, а не dashoffset: у пунктира dashoffset
  // уже занят самим узором, и одно свойство не может отвечать
  // сразу и за рисунок, и за длину. Маска идёт по направлению
  // пути — снизу слева вверх направо.
  const edge = interpolate(progress, [0, 1], [-12, 118]);

  return (
    <svg
      width={1080}
      height={1920}
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        WebkitMaskImage: `linear-gradient(28deg, #000 ${edge - 10}%, transparent ${edge}%)`,
        maskImage: `linear-gradient(28deg, #000 ${edge - 10}%, transparent ${edge}%)`,
      }}
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray="16 26"
        style={{ filter: `drop-shadow(0 0 16px ${C.signal}66)` }}
      />
    </svg>
  );
}

// ═══ Полароид ══════════════════════════════════════════════════

/**
 * Снимок-улика со стиля лендинга.
 *
 * Те же значения, что в `components/landing/polaroid.tsx` и
 * `.polaroid` в `app/globals.css`: подложка #f7f7f5, рамка
 * #38383d, поле 5 px, кадр 106×116. На лендинге снимок лежит
 * чёрно-белым и возвращает цвет при наведении — здесь это
 * превращено в приём монтажа: кадр оживает на акценте.
 */
export function Polaroid({ src, caption, tilt = 0, width = 300, reveal = 0, style }) {
  const photoW = width - 10;
  const photoH = photoW * (116 / 106);

  return (
    <div
      style={{
        width,
        padding: 5,
        paddingBottom: 46,
        background: '#f7f7f5',
        border: '1px solid #38383d',
        transform: `rotate(${tilt}deg)`,
        boxShadow: '0 30px 70px rgba(0,0,0,0.55)',
        ...style,
      }}
    >
      <div style={{ width: photoW, height: photoH, overflow: 'hidden', position: 'relative' }}>
        <Img
          src={staticFile(`photos/${src}`)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            filter: `grayscale(${1 - reveal}) contrast(${1.12 - reveal * 0.12})`,
          }}
        />
      </div>
      {caption && (
        <div
          style={{
            marginTop: 12,
            textAlign: 'center',
            fontFamily: FONT_BODY,
            fontWeight: 500,
            fontSize: Math.round(width * 0.062),
            letterSpacing: '0.04em',
            color: '#2a2a2f',
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
