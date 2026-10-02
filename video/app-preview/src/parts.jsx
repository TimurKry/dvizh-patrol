import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { C, CANVAS, FONT_BODY, FONT_DISPLAY, SAFE, SCREEN, SRC } from './theme.js';

/**
 * Детали кадра.
 *
 * Три уровня показа интерфейса, как того требует сценарий.
 *
 * **`Phone`** — первый уровень: приложение как предмет. Телефон
 * целиком, с корпусом и бликом. Появление продукта и финал.
 *
 * **`Screen`** — второй уровень: настоящий экран целиком, во всю
 * доступную высоту безопасной зоны. Ничего не обрезано ни сверху,
 * ни снизу: видны и шапка, и нижняя навигация.
 *
 * **`Zoom`** — третий уровень: камера подъезжает к нужному месту
 * того же экрана. Экран не режется и не подменяется вырезкой —
 * он остаётся целым и виден вокруг, а всё лишнее уходит в тень.
 * Контекст не теряется: зритель всё время понимает, где именно в
 * приложении находится показанное.
 *
 * Ни один кадр не начинается с обрезанного фрагмента: наезд
 * всегда идёт от общего плана.
 */

// ═══ Фон ═══════════════════════════════════════════════════════

export function Backdrop({ children }) {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 1305], [0, -60]);

  return (
    <AbsoluteFill style={{ background: C.canvas, overflow: 'hidden' }}>
      {/* Техническая сетка: очень тихо, только чтобы плоскость
          не читалась как пустая заливка. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.hairline} 1px, transparent 1px),
                            linear-gradient(90deg, ${C.hairline} 1px, transparent 1px)`,
          backgroundSize: '120px 120px',
          opacity: 0.05,
          transform: `translateY(${drift}px)`,
        }}
      />
      {/* Направленный свет сверху слева. */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(120% 70% at 22% 6%, rgba(245,245,241,0.07), transparent 62%)',
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
        background: 'radial-gradient(100% 62% at 50% 46%, transparent 44%, rgba(0,0,0,0.7))',
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
        opacity: 0.05,
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")",
        backgroundPosition: `${shift}px ${shift * 1.7}px`,
      }}
    />
  );
}

// ═══ Уровень 1: телефон ════════════════════════════════════════

/**
 * Снятый экран внутри корпуса.
 *
 * Корпус нарочно минимальный: рамка, скругление, контровой свет.
 * Он рамка для интерфейса, а не предмет показа.
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
        boxShadow:
          '0 60px 130px rgba(0,0,0,0.7), 0 0 0 10px rgba(18,18,22,0.92), 0 0 90px rgba(255,0,179,0.07)',
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
            'linear-gradient(122deg, rgba(245,245,241,0.14) 0%, transparent 26%, transparent 74%, rgba(245,245,241,0.05) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ═══ Уровень 2: экран целиком ══════════════════════════════════

/**
 * Настоящий экран во всю безопасную зону.
 *
 * `scale` и `shift` дают спокойное движение камеры — наезд или
 * снос по вертикали. Экран при этом остаётся целым: обрезать
 * шапку или прятать нижнюю навигацию нельзя.
 */
export function Screen({ src, scale = 1, shift = 0, dx = 0, opacity = 1, dim = 0, children }) {
  const box = screenBox(scale, shift, dx);

  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.w,
        height: box.h,
        opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 26 * scale,
          overflow: 'hidden',
          border: `1px solid ${C.hairline}`,
          boxShadow: '0 50px 110px rgba(0,0,0,0.65)',
          background: C.canvas,
        }}
      >
        <Img src={staticFile(`screens/${src}.png`)} style={{ width: '100%', display: 'block' }} />
        {dim > 0 && (
          <div style={{ position: 'absolute', inset: 0, background: `rgba(6,6,9,${dim})` }} />
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Где сейчас стоит экран.
 *
 * Одна формула на всех: и сам экран, и рамки выделения, и наезд
 * камеры считают положение отсюда. Разойдутся — рамка съедет с
 * элемента, и это будет видно сразу.
 */
export function screenBox(scale = 1, shift = 0, dx = 0) {
  const w = SCREEN.w * scale;
  const h = SCREEN.h * scale;
  return {
    w,
    h,
    left: (CANVAS.w - w) / 2 + dx,
    top: SCREEN.top - (h - SCREEN.h) / 2 + shift,
  };
}

/**
 * Прямоугольник исходника 1170×2532 в координатах кадра.
 *
 * Числа снимаются с настоящего снимка браузером — `getBoundingClientRect`
 * умножается на плотность 3. На глаз такие координаты не ставятся:
 * ошибка в десяток пикселей видна как съехавшая рамка.
 */
export function place(crop, scale = 1, shift = 0, dx = 0) {
  const [x, y, w, h] = crop;
  const k = (SCREEN.w * scale) / SRC.w;
  const box = screenBox(scale, shift, dx);
  return { left: box.left + x * k, top: box.top + y * k, w: w * k, h: h * k };
}

/**
 * Наезд на кусок экрана.
 *
 * Возвращает масштаб и сдвиги, при которых заданный прямоугольник
 * встаёт в середину кадра нужной ширины. Экран при этом остаётся
 * целым и виден вокруг — камера подъезжает, а не вырезает.
 */
export function zoomTo(crop, width = 0.92 * CANVAS.w, targetY = 900) {
  const [, , cw] = crop;
  const scale = width / (cw * (SCREEN.w / SRC.w));

  const at = place(crop, scale);
  const dx = CANVAS.w / 2 - (at.left + at.w / 2);
  const shift = targetY - (at.top + at.h / 2);

  return { scale, dx, shift };
}

// ═══ Уровень 3: приближение ════════════════════════════════════

/**
 * Наезд камеры на кусок экрана.
 *
 * Экран не режется и не подменяется панелью: он тот же самый,
 * просто камера подъезжает. Вокруг увеличенного места остаётся
 * видна остальная страница — зритель не теряет, где находится.
 *
 * `progress` от 0 до 1 ведёт от общего плана к крупному, так что
 * возврат назад делается тем же значением в обратную сторону.
 */
export function Zoom({
  src,
  crop,
  progress = 1,
  width = 0.92 * CANVAS.w,
  targetY = 900,
  dim = 0.5,
  outline = true,
  children,
}) {
  const z = zoomTo(crop, width, targetY);

  const scale = interpolate(progress, [0, 1], [1, z.scale]);
  const dx = interpolate(progress, [0, 1], [0, z.dx]);
  const shift = interpolate(progress, [0, 1], [0, z.shift]);

  const r = place(crop, scale, shift, dx);

  return (
    <>
      <Screen src={src} scale={scale} shift={shift} dx={dx} />
      {/* Маска фокуса: всё, кроме выбранного места, уходит в тень.
          Тень рисуется четырьмя полосами вокруг рамки, а не
          затемнением всего экрана с вырезом: у вырезанного
          прямоугольника край получается жёстким, а полосы можно
          растушевать. */}
      {progress > 0.02 && (
        <>
          <Shade box={r} opacity={dim * progress} />
          {outline && (
            <div
              style={{
                position: 'absolute',
                left: r.left - 8,
                top: r.top - 8,
                width: r.w + 16,
                height: r.h + 16,
                border: `2px solid ${C.signal}`,
                borderRadius: 12,
                opacity: progress,
                boxShadow: `0 0 40px ${C.signal}55`,
              }}
            />
          )}
        </>
      )}
      {/* Всё, что должно ехать вместе с экраном, получает его
          текущее положение — иначе рамка уедет от элемента. */}
      {typeof children === 'function' ? children({ scale, shift, dx }) : children}
    </>
  );
}

/** Тень вокруг прямоугольника — четырьмя полосами с растушёвкой. */
function Shade({ box, opacity }) {
  const bg = `rgba(6,6,9,${opacity})`;
  const blur = 'blur(0px)';
  const bars = [
    { left: 0, top: 0, width: CANVAS.w, height: Math.max(0, box.top) },
    { left: 0, top: box.top + box.h, width: CANVAS.w, height: Math.max(0, CANVAS.h - box.top - box.h) },
    { left: 0, top: box.top, width: Math.max(0, box.left), height: box.h },
    {
      left: box.left + box.w,
      top: box.top,
      width: Math.max(0, CANVAS.w - box.left - box.w),
      height: box.h,
    },
  ];
  return (
    <>
      {bars.map((b, i) => (
        <div key={i} style={{ position: 'absolute', ...b, background: bg, filter: blur }} />
      ))}
    </>
  );
}

/**
 * Рамка-выделение прямо на экране, без выноса.
 *
 * Для случаев, когда элемент и так читается, а показать надо
 * только «вот здесь»: баллы, время, кнопка, строка рейтинга.
 */
export function Mark({ crop, progress = 1, pulse = false, scale = 1, shift = 0, dx = 0 }) {
  const f = useCurrentFrame();
  const r = place(crop, scale, shift, dx);

  const beat = pulse ? 1 + 0.02 * Math.sin((f / 30) * Math.PI * 2) : 1;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: r.left - 8,
          top: r.top - 8,
          width: r.w + 16,
          height: r.h + 16,
          border: `2px solid ${C.signal}`,
          borderRadius: 10,
          opacity: progress,
          transform: `scale(${beat})`,
          boxShadow: `0 0 34px ${C.signal}66, inset 0 0 24px ${C.signal}22`,
        }}
      />
    </>
  );
}

// ═══ Подписи ═══════════════════════════════════════════════════

/**
 * Одна подпись в кадре, 2–5 слов.
 *
 * Живёт в нижней полосе безопасной зоны поверх мягкой затемняющей
 * подложки: экран показан целиком, а буквы всё равно читаются.
 */
export function Caption({ text, eyebrow, at, dur, big = false }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - at;

  const enter = spring({ frame: local, fps, config: { damping: 200, mass: 0.55 } });
  const opacity =
    interpolate(local, [0, 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    (dur ? interpolate(local, [dur - 8, dur], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }) : 1);

  if (opacity <= 0.001) return null;

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: CANVAS.h - SAFE.bottom, opacity }}>
      {/* Подложка: градиент, а не плашка — край не читается. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -300,
          height: 700,
          background:
            'linear-gradient(to top, rgba(6,6,9,0.99) 44%, rgba(6,6,9,0.9) 62%, rgba(6,6,9,0))',
        }}
      />
      <div
        style={{
          position: 'relative',
          padding: '0 80px 6px',
          textAlign: 'center',
          transform: `translateY(${interpolate(enter, [0, 1], [22, 0])}px)`,
        }}
      >
        {eyebrow && (
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: 21,
              letterSpacing: '0.24em',
              color: C.signal,
              marginBottom: 14,
            }}
          >
            {eyebrow}
          </div>
        )}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: big ? 66 : 50,
            lineHeight: 1.06,
            letterSpacing: '-0.012em',
            color: C.ink,
            textWrap: 'balance',
            textShadow: '0 4px 30px rgba(0,0,0,0.8)',
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

/** Пояснение мелким кеглем — там, где одного заголовка мало. */
export function Note({ children, at, dur }) {
  const frame = useCurrentFrame();
  const local = frame - at;
  const opacity =
    interpolate(local, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    (dur ? interpolate(local, [dur - 8, dur], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }) : 1);

  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        right: 90,
        bottom: CANVAS.h - SAFE.bottom + 96,
        opacity,
        textAlign: 'center',
        fontFamily: FONT_BODY,
        fontWeight: 400,
        fontSize: 29,
        color: C.muted,
        textShadow: '0 2px 20px rgba(0,0,0,0.9)',
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
 * прочерчивается, в финале собирает архив. Он и есть та ниточка,
 * которая держит склейки вместе.
 */
export function Route({ progress, opacity = 1, stroke = C.signal, width = 5 }) {
  const d = 'M 112 1560 C 300 1470, 250 1090, 470 1000 S 900 950, 980 700 S 860 320, 1160 190';

  // Прочерк сделан маской, а не dashoffset: у пунктира dashoffset
  // уже занят самим узором, и одно свойство не может отвечать
  // сразу и за рисунок, и за длину.
  const edge = interpolate(progress, [0, 1], [4, 122]);

  return (
    <svg
      width={CANVAS.w}
      height={CANVAS.h}
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
        style={{ filter: `drop-shadow(0 0 18px ${C.signal}66)` }}
      />
    </svg>
  );
}

/** Точка на маршруте — с неё всё начинается. */
export function Dot({ x, y, size = 22, glow = 1 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: C.signal,
        boxShadow: `0 0 ${40 * glow}px ${C.signal}, 0 0 ${110 * glow}px ${C.signal}66`,
      }}
    />
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
export function Polaroid({ src, caption, tilt = 0, width = 300, reveal = 0, style, signal = false }) {
  const photoW = width - 10;
  const photoH = photoW * (116 / 106);

  return (
    <div
      style={{
        width,
        padding: 5,
        paddingBottom: Math.round(width * 0.16),
        background: '#f7f7f5',
        border: `1px solid ${signal ? C.signal : '#38383d'}`,
        transform: `rotate(${tilt}deg)`,
        boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
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
            filter: `grayscale(${1 - reveal}) contrast(${1.1 - reveal * 0.1})`,
          }}
        />
      </div>
      {caption && (
        <div
          style={{
            marginTop: Math.round(width * 0.04),
            textAlign: 'center',
            fontFamily: FONT_BODY,
            fontWeight: 500,
            fontSize: Math.round(width * 0.058),
            letterSpacing: '0.06em',
            color: signal ? C.signal : '#2a2a2f',
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
