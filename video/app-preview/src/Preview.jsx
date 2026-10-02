import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { Backdrop, Caption, Dot, Mark, Phone, Polaroid, Route, Screen, Zoom, place } from './parts.jsx';
import { C, CANVAS, FONT_BODY, FONT_DISPLAY, SAFE } from './theme.js';

/**
 * App Preview · Движ-Патруль
 *
 * 43,5 секунды. Один игровой цикл целиком: код → команда → рука →
 * карточка → задание → карта → город → отправка → проверка →
 * баллы → история → рейтинг → архив.
 *
 * Правила, по которым собран монтаж.
 *
 * **Один объект в кадре.** Ни в одной сцене нет двух подписей
 * сразу и двух способов выделения сразу.
 *
 * **Сначала целое, потом деталь.** Каждая функция показывается
 * внутри полного экрана, и только после этого приближается. Ни
 * одна сцена не начинается с обрезанного куска интерфейса.
 *
 * **Переходы мотивированы.** Маршрут становится светом на грани
 * телефона, карточка — экраном задания, метка карты — объективом,
 * фотография — полароидом, полароид входит в загрузку, рейтинг
 * сворачивается в архив.
 *
 * **Ничего не нарисовано заново.** Все экраны — настоящие снимки
 * приложения 1170×2532. Графика вокруг них своя, интерфейс — нет.
 */

// ═══ Раскадровка ═══════════════════════════════════════════════

const S = {
  intro: [0, 90],
  product: [90, 174],
  join: [174, 264],
  team: [264, 348],
  hand: [348, 450],
  flip: [450, 558],
  task: [558, 663],
  map: [663, 759],
  city: [759, 843],
  upload: [843, 939],
  verdict: [939, 1035],
  story: [1035, 1101],
  rank: [1101, 1191],
  final: [1191, 1305],
};

const len = ([a, b]) => b - a;

/** Плавная кривая для наездов: без рывка на входе и на выходе. */
const ease = (frame, from, to, a, b) =>
  interpolate(frame, [from, to], [a, b], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  });

/** Появление и уход одним значением: 0 → 1 → 0. */
function inOut(local, dur, up = 10, down = 10) {
  return Math.min(
    interpolate(local, [0, up], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(local, [dur - down, dur], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
}

export function Preview() {
  return (
    <Backdrop>
      <Sequence from={S.intro[0]} durationInFrames={len(S.intro)}><Intro /></Sequence>
      <Sequence from={S.product[0]} durationInFrames={len(S.product)}><Product /></Sequence>
      <Sequence from={S.join[0]} durationInFrames={len(S.join)}><Join /></Sequence>
      <Sequence from={S.team[0]} durationInFrames={len(S.team)}><Team /></Sequence>
      <Sequence from={S.hand[0]} durationInFrames={len(S.hand)}><Hand /></Sequence>
      <Sequence from={S.flip[0]} durationInFrames={len(S.flip)}><Flip /></Sequence>
      <Sequence from={S.task[0]} durationInFrames={len(S.task)}><Task /></Sequence>
      <Sequence from={S.map[0]} durationInFrames={len(S.map)}><MapScene /></Sequence>
      <Sequence from={S.city[0]} durationInFrames={len(S.city)}><City /></Sequence>
      <Sequence from={S.upload[0]} durationInFrames={len(S.upload)}><Upload /></Sequence>
      <Sequence from={S.verdict[0]} durationInFrames={len(S.verdict)}><Verdict /></Sequence>
      <Sequence from={S.story[0]} durationInFrames={len(S.story)}><Story /></Sequence>
      <Sequence from={S.rank[0]} durationInFrames={len(S.rank)}><Rank /></Sequence>
      <Sequence from={S.final[0]} durationInFrames={len(S.final)}><Final /></Sequence>
    </Backdrop>
  );
}

// ═══ 0:00–0:03 · Город становится игрой ════════════════════════

/**
 * Точка, маршрут и три настоящих кадра Лейпцига.
 *
 * Фотографии и подписи взяты с лендинга — те же файлы и те же
 * подписи, что в `components/landing/hero.tsx`. Ролик и сайт
 * должны выглядеть одной работой, а не двумя.
 */
function Intro() {
  const frame = useCurrentFrame();
  const dur = len(S.intro);

  // Точка горит с нулевого кадра и сразу в кадре: две секунды
  // почти чёрного экрана в начале Reels — это две секунды, за
  // которые ролик пролистывают.
  const draw = ease(frame, 0, 46, 0.06, 1);
  const dotGlow = interpolate(frame, [0, 6, 16], [0.4, 1.6, 1], { extrapolateRight: 'clamp' });
  const dotSize = interpolate(frame, [0, 10], [54, 24], { extrapolateRight: 'clamp' });

  const cards = [
    { src: 'city-station.jpg', caption: 'ВОКЗАЛ / 14:42', x: 96, y: 980, tilt: -8, at: 8 },
    { src: 'city-tunnel.jpg', caption: 'СЛЕД № 07', x: 630, y: 706, tilt: 7, at: 20 },
    { src: 'city-markt.jpg', caption: 'НАВЕДЕНИЕ ●', x: 350, y: 330, tilt: -5, at: 32, signal: true },
  ];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 1, 9) }}>
      <Route progress={draw} />
      <Dot x={118 + draw * 300} y={interpolate(draw, [0, 1], [1540, 1300])} size={dotSize} glow={dotGlow} />

      {cards.map((c) => {
        const local = frame - c.at;
        if (local < 0) return null;
        const rise = spring({ frame: local, fps: 30, config: { damping: 200, mass: 0.9 } });
        return (
          <div
            key={c.src}
            style={{
              position: 'absolute',
              left: c.x,
              top: c.y,
              opacity: interpolate(local, [0, 10], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translateY(${interpolate(rise, [0, 1], [46, 0])}px) scale(${interpolate(
                rise,
                [0, 1],
                [0.9, 1],
              )})`,
            }}
          >
            <Polaroid
              src={c.src}
              caption={c.caption}
              tilt={c.tilt}
              width={300}
              signal={c.signal}
              reveal={interpolate(local, [8, 30], [0, 1], { extrapolateRight: 'clamp' })}
            />
          </div>
        );
      })}

      <Caption text="ГОРОД СТАНОВИТСЯ ИГРОЙ" at={44} big />
    </AbsoluteFill>
  );
}

// ═══ 0:03–0:06 · Появление продукта ════════════════════════════

/** Телефон как предмет: первый уровень показа. */
function Product() {
  const frame = useCurrentFrame();
  const dur = len(S.product);

  const rise = spring({ frame, fps: 30, config: { damping: 200, mass: 1.2 } });
  const push = ease(frame, 0, dur, 1, 1.13);
  const glow = interpolate(frame, [0, 26], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 1, 8) }}>
      {/* Маршрут ушёл вглубь и стал светом на грани корпуса. */}
      <Route
        progress={1}
        opacity={interpolate(frame, [0, 22], [0.8, 0.13], { extrapolateRight: 'clamp' })}
      />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 200 }}>
        <div
          style={{
            transform: `translateY(${interpolate(rise, [0, 1], [170, 0])}px) scale(${push})`,
            opacity: interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' }),
            filter: `drop-shadow(0 0 ${60 * glow}px rgba(255,0,179,0.2))`,
          }}
        >
          <Phone src="01-join-empty" width={556} />
        </div>
      </AbsoluteFill>

      <Caption text="ОДИН КОД — И ВЫ В ИГРЕ" at={26} />
    </AbsoluteFill>
  );
}

// ═══ 0:06–0:09 · Вход в команду ════════════════════════════════

/** Экран целиком: второй уровень. Ввод кода по шагам. */
function Join() {
  const frame = useCurrentFrame();
  const dur = len(S.join);

  const src = frame < 26 ? '01-join-empty' : frame < 52 ? '02-join-typing' : '03-join-ready';
  const scale = ease(frame, 0, dur, 1.02, 1.06);

  // Координаты сняты с макета 1170×2532 браузером, а не на глаз.
  const field = [63, 400, 1044, 132];
  const button = [48, 1042, 1074, 148];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 8, 8) }}>
      <Screen src={src} scale={scale} />
      {frame < 58 ? (
        <Mark crop={field} scale={scale} progress={inOut(frame, 58, 8, 8)} />
      ) : (
        <Mark crop={button} scale={scale} progress={inOut(frame - 58, dur - 58, 8, 10)} pulse />
      )}
      <Caption text="БЕЗ РЕГИСТРАЦИИ" at={2} dur={42} />
      <Caption text="БЕЗ АККАУНТА" at={46} dur={40} />
    </AbsoluteFill>
  );
}

// ═══ 0:09–0:12 · Игровой экран команды ═════════════════════════

/** Всё, что видит команда сразу после входа. */
function Team() {
  const frame = useCurrentFrame();
  const dur = len(S.team);

  const scale = ease(frame, 0, dur, 1.06, 1.0);
  const score = [48, 1426, 1074, 337];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 8, 8) }}>
      <Screen src="04-team" scale={scale} />
      <Mark crop={score} scale={scale} progress={inOut(frame - 26, dur - 26, 10, 12)} pulse />
      <Caption text="ВСЁ ВАЖНОЕ — НА ОДНОМ ЭКРАНЕ" at={4} />
    </AbsoluteFill>
  );
}

// ═══ 0:12–0:16 · Рука заданий ══════════════════════════════════

/**
 * Шесть карт рубашкой вверх.
 *
 * Категории подписаны по очереди — по одной за раз, рамкой на
 * своей паре карт. Это и есть объяснение состава руки: две
 * загадки, два фото-повтора, два актива.
 */
function Hand() {
  const frame = useCurrentFrame();
  const dur = len(S.hand);

  const scale = ease(frame, 0, dur, 1.0, 1.05);

  // Гнёзда карт в исходных пикселях: три в ряд, два ряда.
  const slot = (i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return [48 + col * 370, 1062 + row * 481, 334, 445];
  };

  const steps = [
    { at: 10, cards: [0, 1], label: 'ЗАГАДКИ' },
    { at: 42, cards: [2, 3], label: 'ФОТО-ПОВТОР' },
    { at: 72, cards: [4, 5], label: 'АКТИВНОСТИ' },
  ];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 8, 8) }}>
      <Screen src="05-hand" scale={scale} />

      {steps.map((s) => {
        const p = inOut(frame - s.at, 30, 7, 7);
        if (p <= 0.001) return null;
        return s.cards.map((i) => (
          <Mark key={`${s.label}-${i}`} crop={slot(i)} scale={scale} progress={p} />
        ));
      })}

      <Caption text="ШЕСТЬ КАРТ НА РУКАХ" eyebrow="РУКА КОМАНДЫ" at={0} dur={12} />
      {steps.map((s) => (
        <Caption key={s.label} text={s.label} eyebrow="ТИП ЗАДАНИЯ" at={s.at + 2} dur={28} />
      ))}
    </AbsoluteFill>
  );
}

// ═══ 0:16–0:20 · Выбор и переворот карточки ════════════════════

/**
 * Настоящий переворот, а не выдуманная 3D-анимация.
 *
 * Шесть кадров сняты с работающего приложения: рубашка, ребро,
 * лицо. Углы задавались прямо в DOM, поэтому движение ровное и
 * повторяемое, а пиксели — приложения.
 */
function Flip() {
  const frame = useCurrentFrame();
  const dur = len(S.flip);

  const FRAMES = [
    { src: '10-flip-180', at: 0 },
    { src: '11-flip-145', at: 14 },
    { src: '12-flip-100', at: 20 },
    { src: '13-flip-055', at: 26 },
    { src: '14-flip-020', at: 32 },
    { src: '15-flip-000', at: 38 },
  ];

  const cur = [...FRAMES].reverse().find((f) => frame >= f.at) ?? FRAMES[0];
  const scale = frame < 42 ? 1.02 : ease(frame, 42, dur, 1.02, 1.07);

  // Лицевая часть открытой карты: заголовок, баллы, эталон.
  const face = [76, 305, 1020, 1400];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 6, 8) }}>
      <Screen src={cur.src} scale={scale} />

      {frame >= 48 && frame < 78 && (
        <Mark crop={face} scale={scale} progress={inOut(frame - 48, 30, 8, 8)} />
      )}

      <Caption text="ВЫБЕРИТЕ ЗАДАНИЕ" at={0} dur={44} />
      <Caption text="ОТКРОЙТЕ УСЛОВИЕ" at={46} dur={62} />
    </AbsoluteFill>
  );
}

// ═══ 0:20–0:24 · Полное описание задания ═══════════════════════

/**
 * Страница задания: сначала целиком, потом крупно условие.
 *
 * Экран остаётся на месте и приглушается, а нужный блок
 * поднимается над ним — зритель всё время видит, откуда взят
 * увеличенный кусок.
 */
function Task() {
  const frame = useCurrentFrame();
  const dur = len(S.task);

  const zoom = ease(frame, 52, 72, 0, 1);
  const scale = ease(frame, 0, 46, 1.0, 1.04);

  const head = [48, 470, 1074, 430];
  const road = [48, 540, 1074, 750];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 8, 8) }}>
      {frame < 46 ? (
        <>
          <Screen src="20-task-top" scale={scale} />
          <Mark crop={head} scale={scale} progress={inOut(frame - 8, 34, 8, 8)} />
        </>
      ) : (
        <Zoom src="22-task-road" crop={road} progress={zoom} width={930} targetY={760} dim={0.62} />
      )}

      <Caption text="ПРОЧИТАЙТЕ И ВЫПОЛНИТЕ" at={2} dur={42} />
      <Caption text="ПО ДОРОГЕ — ИСТОРИЯ МЕСТА" at={48} dur={57} />
    </AbsoluteFill>
  );
}

// ═══ 0:24–0:28 · Карта и маршрут ═══════════════════════════════

/** Игровое поле, метки заданий и выбранная точка. */
function MapScene() {
  const frame = useCurrentFrame();
  const dur = len(S.map);

  const scale = ease(frame, 0, dur, 1.0, 1.06);
  const src = frame < 46 ? '30-map' : '31-map-marker';

  const field = [296, 985, 590, 480];
  const marker = [350, 1100, 460, 300];
  const zoom = ease(frame, 50, 76, 0, 1);

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 8, 8) }}>
      {frame < 46 ? (
        <>
          <Screen src={src} scale={scale} />
          <Mark crop={field} scale={scale} progress={inOut(frame - 12, 32, 8, 8)} />
        </>
      ) : (
        <Zoom
          src={src}
          crop={field}
          progress={zoom}
          width={900}
          targetY={820}
          dim={0.55}
          outline={false}
        >
          {(t) => <Mark crop={marker} {...t} progress={zoom} pulse />}
        </Zoom>
      )}

      <Caption text="МАРШРУТ ВЫБИРАЕТЕ ВЫ" at={0} dur={44} />
      <Caption text="ИДИТЕ К ВЫБРАННОЙ ТОЧКЕ" at={46} dur={50} />
    </AbsoluteFill>
  );
}

// ═══ 0:28–0:31 · Из приложения в город ═════════════════════════

/**
 * Метка становится объективом.
 *
 * Здесь ролик выходит из интерфейса в город: круг метки
 * раскрывается, и сквозь него виден эталонный кадр задания — тот
 * самый, который команда повторяет, — а затем снимок команды.
 */
function City() {
  const frame = useCurrentFrame();
  const dur = len(S.city);

  const open = ease(frame, 0, 26, 0, 1);
  const size = interpolate(open, [0, 1], [90, 1120]);
  const shot = frame >= 54;

  const words = [
    { text: 'НАЙДИТЕ', at: 2, dur: 26 },
    { text: 'ПОВТОРИТЕ', at: 29, dur: 25 },
    { text: 'СНИМИТЕ', at: 56, dur: 28 },
  ];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 6, 8) }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 230 }}>
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            overflow: 'hidden',
            border: `3px solid ${C.signal}`,
            boxShadow: `0 0 90px ${C.signal}44, 0 40px 110px rgba(0,0,0,0.7)`,
            position: 'relative',
          }}
        >
          <Img
            src={staticFile(`photos/${shot ? 'shot-27.jpg' : 'ref-27.jpg'}`)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              transform: `scale(${ease(frame, 0, dur, 1.16, 1.02)})`,
            }}
          />
          {shot && <Viewfinder />}
        </div>
      </AbsoluteFill>

      {words.map((w) => (
        <Caption key={w.text} text={w.text} at={w.at} dur={w.dur} big />
      ))}
    </AbsoluteFill>
  );
}

/** Рамка видоискателя: кадр снимают прямо сейчас. */
function Viewfinder() {
  const frame = useCurrentFrame();
  const blink = frame % 20 < 12 ? 1 : 0.35;
  const corner = {
    position: 'absolute',
    width: 70,
    height: 70,
    border: `3px solid ${C.ink}`,
    opacity: 0.9,
  };
  return (
    <>
      <div style={{ ...corner, left: 130, top: 200, borderRight: 'none', borderBottom: 'none' }} />
      <div style={{ ...corner, right: 130, top: 200, borderLeft: 'none', borderBottom: 'none' }} />
      <div style={{ ...corner, left: 130, bottom: 200, borderRight: 'none', borderTop: 'none' }} />
      <div style={{ ...corner, right: 130, bottom: 200, borderLeft: 'none', borderTop: 'none' }} />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 130,
          transform: 'translateX(-50%)',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: C.signal,
          opacity: blink,
        }}
      />
    </>
  );
}

// ═══ 0:31–0:35 · Загрузка фотографии ═══════════════════════════

/**
 * Полароид входит в настоящий экран загрузки.
 *
 * Снимок из предыдущей сцены превращается в карточку, уменьшается
 * и садится ровно в то место экрана, где живёт предпросмотр.
 */
function Upload() {
  const frame = useCurrentFrame();
  const dur = len(S.upload);

  const fly = ease(frame, 0, 26, 0, 1);
  const src = frame < 24 ? '40-upload-idle' : '41-upload-preview';

  const preview = [48, 230, 1074, 800];
  const send = [48, 1160, 1074, 185];

  const target = place(preview);
  const px = interpolate(fly, [0, 1], [CANVAS.w / 2 - 190, target.left]);
  const py = interpolate(fly, [0, 1], [520, target.top]);

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 6, 8) }}>
      <Screen src={src} />

      {frame < 27 && (
        <div
          style={{
            position: 'absolute',
            left: px,
            top: py,
            opacity: interpolate(fly, [0.84, 1], [1, 0], { extrapolateLeft: 'clamp' }),
            transform: `scale(${interpolate(fly, [0, 1], [1, 0.44])}) rotate(${interpolate(
              fly,
              [0, 1],
              [-6, 0],
            )}deg)`,
            transformOrigin: 'top left',
          }}
        >
          <Polaroid src="shot-27.jpg" caption="СДЕЛКА / №27" width={380} reveal={1} />
        </div>
      )}

      {frame >= 30 && frame < 58 && <Mark crop={preview} progress={inOut(frame - 30, 28, 8, 8)} />}
      {frame >= 60 && <Mark crop={send} progress={inOut(frame - 60, dur - 60, 8, 10)} pulse />}

      <Caption text="ВЫБЕРИТЕ ФОТО" at={0} dur={56} />
      <Caption text="ОТПРАВЬТЕ" at={58} dur={38} />
    </AbsoluteFill>
  );
}

// ═══ 0:35–0:38 · Проверка и баллы ══════════════════════════════

/**
 * Настоящие состояния — там же, где их увидит игрок.
 *
 * Список отправок: «Проверяется» сменяется на «Принято», и рядом
 * появляется начисление. Ничего не дорисовано: это два снимка
 * одного экрана до и после ответа проверки.
 */
function Verdict() {
  const frame = useCurrentFrame();
  const dur = len(S.verdict);

  const accepted = frame >= 40;
  const row = [48, 630, 1074, 260];

  const burst = interpolate(frame, [40, 54], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 8, 8) }}>
      <Screen src={accepted ? '67-submissions-accepted' : '52-submissions-checking'} scale={1.02} />
      <Mark crop={row} scale={1.02} progress={inOut(frame - 6, dur - 6, 8, 10)} pulse={accepted} />

      {accepted && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(46% 26% at 50% 38%, ${C.signal}26, transparent 70%)`,
            opacity: 1 - burst,
          }}
        />
      )}

      <Caption text="НА ПРОВЕРКЕ" at={0} dur={38} />
      <Caption text="ЗАСЧИТАНО · +70 БАЛЛОВ" at={42} dur={54} />
    </AbsoluteFill>
  );
}

// ═══ 0:38–0:40 · История после выполнения ══════════════════════

/** Блок «Что это было» — сначала на экране, потом крупно. */
function Story() {
  const frame = useCurrentFrame();
  const dur = len(S.story);

  const zoom = ease(frame, 14, 34, 0, 1);
  const card = [48, 620, 1074, 620];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 8, 8) }}>
      <Zoom src="62-afterword" crop={card} progress={zoom} width={950} targetY={800} dim={0.66} />
      <Caption text="ОТКРЫВАЙТЕ ИСТОРИИ ГОРОДА" at={0} />
    </AbsoluteFill>
  );
}

// ═══ 0:40–0:43 · Рейтинг ═══════════════════════════════════════

/** Было второе место, стало первое: два настоящих снимка. */
function Rank() {
  const frame = useCurrentFrame();
  const dur = len(S.rank);

  const after = frame >= 38;
  const scale = ease(frame, 0, dur, 1.0, 1.05);

  const row = after ? [48, 651, 1074, 206] : [48, 881, 1074, 206];

  return (
    <AbsoluteFill style={{ opacity: inOut(frame, dur, 8, 8) }}>
      <Screen src={after ? '65-rank-after' : '06-rank-before'} scale={scale} />
      <Mark crop={row} scale={scale} progress={inOut(frame - 8, dur - 8, 8, 10)} pulse={after} />
      <Caption text="СОРЕВНУЙТЕСЬ В РЕАЛЬНОМ ВРЕМЕНИ" at={2} />
    </AbsoluteFill>
  );
}

// ═══ 0:43–0:43,5 · Архив и призыв ══════════════════════════════

/**
 * Финал: рейтинг сворачивается, вокруг собирается архив команды,
 * маршрут приводит к логотипу.
 *
 * Все цифры — из базы мероприятия: 05.09.2026, 14:00, Leipzig,
 * 15 €, до пяти человек в команде.
 */
function Final() {
  const frame = useCurrentFrame();

  const collapse = ease(frame, 0, 24, 0, 1);
  const draw = ease(frame, 16, 66, 0, 1);

  const archive = [
    { src: 'city-station.jpg', caption: 'ВОКЗАЛ / 14:42', x: 72, y: 250, tilt: -7, at: 18, w: 250 },
    { src: 'shot-27.jpg', caption: 'СДЕЛКА / №27', x: 392, y: 196, tilt: 4, at: 25, w: 292, signal: true },
    { src: 'city-tunnel.jpg', caption: 'СЛЕД № 07', x: 748, y: 268, tilt: 8, at: 32, w: 244 },
    { src: 'city-markt.jpg', caption: 'НАВЕДЕНИЕ ●', x: 136, y: 646, tilt: 6, at: 38, w: 238 },
    { src: 'city-center.jpg', caption: 'ЦЕНТР / 15:06', x: 664, y: 660, tilt: -6, at: 44, w: 250 },
  ];

  return (
    <AbsoluteFill>
      <Route progress={draw} opacity={0.5} />

      {/* Рейтинг уходит вглубь — на его месте собирается архив. */}
      {collapse < 1 && (
        <div style={{ opacity: 1 - collapse }}>
          <Screen src="65-rank-after" scale={1 - collapse * 0.7} shift={collapse * 150} />
        </div>
      )}

      {archive.map((p) => {
        const local = frame - p.at;
        if (local < 0) return null;
        const rise = spring({ frame: local, fps: 30, config: { damping: 200, mass: 0.8 } });
        return (
          <div
            key={p.src}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              opacity: interpolate(local, [0, 9], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translateY(${interpolate(rise, [0, 1], [40, 0])}px) scale(${interpolate(
                rise,
                [0, 1],
                [0.88, 1],
              )})`,
            }}
          >
            <Polaroid
              src={p.src}
              caption={p.caption}
              tilt={p.tilt}
              width={p.w}
              signal={p.signal}
              reveal={interpolate(local, [6, 26], [0, 1], { extrapolateRight: 'clamp' })}
            />
          </div>
        );
      })}

      <Outro at={52} />
    </AbsoluteFill>
  );
}

/** Логотип, фактура мероприятия и призыв. */
function Outro({ at }) {
  const frame = useCurrentFrame();
  const local = frame - at;
  if (local < 0) return null;

  const rise = spring({ frame: local, fps: 30, config: { damping: 200, mass: 0.8 } });
  const opacity = interpolate(local, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  const facts = ['05.09.2026 · 14:00', 'LEIPZIG · ЦЕНТР', '15 € С ЧЕЛОВЕКА', 'ДО 5 В КОМАНДЕ'];

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: CANVAS.h - SAFE.bottom - 40,
        textAlign: 'center',
        opacity,
        transform: `translateY(${interpolate(rise, [0, 1], [30, 0])}px)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -200,
          right: -200,
          bottom: -160,
          height: 700,
          background: 'linear-gradient(to top, rgba(6,6,9,0.97) 44%, rgba(6,6,9,0))',
          zIndex: -1,
        }}
      />
      <Img
        src={staticFile('logo.png')}
        style={{ width: 250, display: 'block', margin: '0 auto 24px' }}
      />
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 66,
          letterSpacing: '-0.015em',
          color: C.ink,
          lineHeight: 1.04,
        }}
      >
        СОБИРАЙ КОМАНДУ
      </div>
      <div
        style={{
          marginTop: 16,
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: 25,
          letterSpacing: '0.2em',
          color: C.signal,
        }}
      >
        ГОРОД. ИГРА. ВОСПОМИНАНИЯ.
      </div>
      <div
        style={{
          marginTop: 24,
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '10px 16px',
          fontFamily: FONT_BODY,
          fontSize: 24,
          color: C.muted,
        }}
      >
        {facts.map((f) => (
          <span key={f} style={{ border: `1px solid ${C.hairline}`, padding: '8px 15px' }}>
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
