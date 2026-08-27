import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Backdrop, Caption, Detail, Note, Phone, Polaroid, Route } from './parts.jsx';
import { C, FONT_BODY, FONT_DISPLAY } from './theme.js';

/**
 * App Preview «Движ-Патруля» — 36 секунд.
 *
 * Вторая редакция. Первая перебирала экраны; владелец попросил
 * показать одну партию целиком, чтобы после просмотра не осталось
 * вопросов. Поэтому весь ролик идёт по одному заданию — №42
 * «Круглый камень» — от рубашки карты до исторической справки:
 *
 *   код → рука → карта переворачивается → условие → «пока идёте»
 *   → где искать → снимок → отправка → баллы → «что это было»
 *   → карточка ушла из руки, рейтинг вырос.
 *
 * Задание выбрано из тех, что заполнены полностью: условие,
 * критерий, точка на карте, справка в дорогу и материал после
 * отправки. Показывать наполовину заведённое нельзя — ролик
 * обещал бы то, чего команда не увидит.
 *
 * Все кадры интерфейса — настоящие снимки приложения. Где текст
 * надо прочитать, кадр укрупняется до нужного куска снимка.
 */

const S = {
  hook: [0, 75],
  join: [75, 165],
  hand: [165, 255],
  flip: [255, 345],
  task: [345, 465],
  road: [465, 555],
  where: [555, 645],
  shoot: [645, 735],
  send: [735, 855],
  story: [855, 945],
  after: [945, 1005],
  final: [1005, 1080],
};

const len = ([a, b]) => b - a;

export const Preview = () => (
  <Backdrop>
    <Sequence from={S.hook[0]} durationInFrames={len(S.hook)}><Hook /></Sequence>
    <Sequence from={S.join[0]} durationInFrames={len(S.join)}><Join /></Sequence>
    <Sequence from={S.hand[0]} durationInFrames={len(S.hand)}><Hand /></Sequence>
    <Sequence from={S.flip[0]} durationInFrames={len(S.flip)}><Flip /></Sequence>
    <Sequence from={S.task[0]} durationInFrames={len(S.task)}><Task /></Sequence>
    <Sequence from={S.road[0]} durationInFrames={len(S.road)}><Criteria /></Sequence>
    <Sequence from={S.where[0]} durationInFrames={len(S.where)}><Road /></Sequence>
    <Sequence from={S.shoot[0]} durationInFrames={len(S.shoot)}><Shoot /></Sequence>
    <Sequence from={S.send[0]} durationInFrames={len(S.send)}><Send /></Sequence>
    <Sequence from={S.story[0]} durationInFrames={len(S.story)}><Story /></Sequence>
    <Sequence from={S.after[0]} durationInFrames={len(S.after)}><After /></Sequence>
    <Sequence from={S.final[0]} durationInFrames={len(S.final)}><Final /></Sequence>
  </Backdrop>
);

// ═══ 0:00–0:02,5 · Город становится игрой ══════════════════════

function Hook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = interpolate(frame, [4, 46], [0, 1], { extrapolateRight: 'clamp' });

  const p1 = spring({ frame: frame - 6, fps, config: { damping: 200, mass: 0.7 } });
  const p2 = spring({ frame: frame - 16, fps, config: { damping: 200, mass: 0.7 } });
  // Полароид лендинга лежит чёрно-белым и оживает при наведении.
  // Здесь это стало приёмом монтажа: цвет возвращается сам.
  const reveal = interpolate(frame, [26, 42], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const logo = interpolate(frame, [50, 62], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const away = interpolate(frame, [50, 64], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Route progress={draw} />

      <div style={{ position: 'absolute', inset: 0, opacity: away }}>
        <div style={{ position: 'absolute', left: 110, top: 520, opacity: p1, transform: `translateY(${interpolate(p1, [0, 1], [60, 0])}px)` }}>
          <Polaroid src="p1.jpg" caption="ПАТРУЛЬ" tilt={-7} width={340} reveal={reveal} />
        </div>
        <div style={{ position: 'absolute', right: 100, top: 830, opacity: p2, transform: `translateY(${interpolate(p2, [0, 1], [60, 0])}px)` }}>
          <Polaroid src="p2.jpg" caption="УЛИКИ" tilt={6} width={320} reveal={reveal} />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 860,
          display: 'flex',
          justifyContent: 'center',
          opacity: logo,
          transform: `scale(${interpolate(logo, [0, 1], [0.88, 1])})`,
        }}
      >
        <Img src={staticFile('logo.png')} style={{ width: 520 }} />
      </div>

      <Caption text="ЛЕЙПЦИГ СТАНОВИТСЯ ИГРОЙ" at={0} delay={10} />
    </AbsoluteFill>
  );
}

// ═══ 0:02,5–0:05,5 · Вход по коду ══════════════════════════════

function Join() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200, mass: 0.7 } });
  const filled = frame >= 36;

  return (
    <AbsoluteFill>
      <Route progress={1} opacity={0.12} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${interpolate(rise, [0, 1], [70, 0])}px)`, marginTop: -60 }}>
          <Detail src={filled ? '02-join-filled' : '01-join-empty'} crop={[40, 620, 1090, 860]} width={880} />
        </div>
      </div>
      <Caption eyebrow="ШЕСТЬ СИМВОЛОВ ОТ КАПИТАНА" text="ВХОД БЕЗ РЕГИСТРАЦИИ" at={0} delay={8} />
    </AbsoluteFill>
  );
}

// ═══ 0:05,5–0:08,5 · Рука команды ══════════════════════════════

function Hand() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200, mass: 0.8 } });
  const scale = interpolate(frame, [0, 90], [1.05, 1.0]);

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Phone
          src="10-hand"
          width={520}
          style={{
            transform: `translateY(${interpolate(rise, [0, 1], [110, 0])}px) scale(${scale})`,
            marginTop: -110,
          }}
        />
      </div>
      <Caption eyebrow="КАРТЫ ЛЕЖАТ РУБАШКОЙ ВВЕРХ" text="ПОРЯДОК ВЫБИРАЕТЕ ВЫ" at={0} delay={10} />
    </AbsoluteFill>
  );
}

// ═══ 0:08,5–0:11,5 · Карта переворачивается ════════════════════

/** Настоящие кадры анимации, снятые по ходу открытия карточки. */
const FLIP = ['11-flip-a', '11-flip-b', '11-flip-c'];

function Flip() {
  const frame = useCurrentFrame();
  const step = frame < 9 ? 0 : frame < 15 ? 1 : frame < 22 ? 2 : 3;
  const open = step === 3;
  const { fps } = useVideoConfig();
  const settle = spring({ frame: frame - 22, fps, config: { damping: 200, mass: 0.6 } });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {open ? (
          <div style={{ marginTop: -90, transform: `scale(${interpolate(settle, [0, 1], [0.96, 1])})` }}>
            <Detail src="12-card-open" crop={[95, 300, 985, 660]} width={880} />
          </div>
        ) : (
          <Phone src={FLIP[step]} width={520} style={{ marginTop: -110 }} />
        )}
      </div>
      <Caption text="КАРТА ОТКРЫВАЕТСЯ" at={0} delay={4} />
      {open && <Note at={22} delay={6}>Фото-повтор · 70 баллов · точка на карте</Note>}
    </AbsoluteFill>
  );
}

// ═══ 0:11,5–0:15,5 · Условие задания ═══════════════════════════

function Task() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200, mass: 0.8 } });
  const body = frame >= 58;

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ marginTop: -90, transform: `translateY(${interpolate(rise, [0, 1], [40, 0])}px)` }}>
          {body ? (
            <Detail src="14-task-road" crop={[40, 320, 1090, 380]} width={920} />
          ) : (
            <Detail src="13-task-top" crop={[40, 440, 1090, 500]} width={920} />
          )}
        </div>
      </div>
      <Caption
        eyebrow={body ? 'УСЛОВИЕ ЦЕЛИКОМ' : 'ЗАДАНИЕ 42'}
        text={body ? 'ЧТО НУЖНО СДЕЛАТЬ' : 'КРУГЛЫЙ КАМЕНЬ · 70 БАЛЛОВ'}
        at={body ? 58 : 0}
        delay={6}
      />
    </AbsoluteFill>
  );
}

// ═══ 0:15,5–0:18,5 · Пока идёте ════════════════════════════════

function Road() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const open = spring({ frame, fps, config: { damping: 200, mass: 0.9 } });

  return (
    <AbsoluteFill>
      <Route progress={1} opacity={0.14} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            marginTop: -80,
            transform: `scaleY(${interpolate(open, [0, 1], [0.85, 1])})`,
            transformOrigin: 'top center',
            opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <Detail src="14-task-road" crop={[40, 930, 1090, 420]} width={920} />
        </div>
      </div>
      <Caption eyebrow="ВИДНО СРАЗУ, ЕЩЁ ПО ДОРОГЕ" text="ПОДСКАЗКА, КУДА СМОТРЕТЬ" at={0} delay={8} />
    </AbsoluteFill>
  );
}

// ═══ 0:15,5–0:18,5 · Что должно быть в кадре ═══════════════════

/**
 * На этом месте по сценарию была карта задания — «Где искать», один
 * крест с номером. Кадр снят и лежит в `13-task-top`, но плитки
 * OpenStreetMap в песочнице не грузятся, и карта выходит пустой
 * серой плашкой. Владелец просил, чтобы после просмотра не
 * оставалось вопросов, а пустая карта — это ровно вопрос.
 *
 * Поэтому здесь критерий: он отвечает на «а что засчитают» и
 * читается без оговорок. Карту вернуть — дело одного снимка,
 * сделанного на машине с интернетом.
 */
function Criteria() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200, mass: 0.8 } });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            marginTop: -80,
            transform: `translateY(${interpolate(rise, [0, 1], [40, 0])}px)`,
            opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <Detail src="14-task-road" crop={[40, 570, 1090, 340]} width={920} />
        </div>
      </div>
      <Caption eyebrow="ВИДНО ДО ОТПРАВКИ" text="ЗА ЧТО ЗАСЧИТАЮТ" at={0} delay={8} />
    </AbsoluteFill>
  );
}

// ═══ 0:21,5–0:24,5 · Дошли и сняли ═════════════════════════════

function Shoot() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p1 = spring({ frame: frame - 4, fps, config: { damping: 200, mass: 0.7 } });
  const p2 = spring({ frame: frame - 16, fps, config: { damping: 200, mass: 0.7 } });
  const reveal = interpolate(frame, [30, 48], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 80, top: 470, opacity: p1, transform: `translateY(${interpolate(p1, [0, 1], [50, 0])}px)` }}>
        <Polaroid src="p2.jpg" caption="ДОШЛИ" tilt={-6} width={360} reveal={reveal} />
      </div>
      <div style={{ position: 'absolute', right: 70, top: 800, opacity: p2, transform: `translateY(${interpolate(p2, [0, 1], [50, 0])}px)` }}>
        <Polaroid src="p1.jpg" caption="СНЯЛИ" tilt={7} width={340} reveal={reveal} />
      </div>
      <Caption eyebrow="ФОТОГРАФИЯ И ЕСТЬ ОТВЕТ" text="НАШЛИ И СНЯЛИ" at={0} delay={10} />
    </AbsoluteFill>
  );
}

// ═══ 0:24,5–0:28,5 · Отправка и проверка ═══════════════════════

const STATES = [
  { at: 0, src: '14-task-road', crop: [40, 1620, 1090, 260], label: 'ОТПРАВЛЯЕМ' },
  { at: 30, src: '20-sent', crop: [40, 610, 1090, 400], label: 'ОЖИДАЕТ ПРОВЕРКИ' },
  { at: 58, src: '21-checking', crop: [40, 610, 1090, 400], label: 'ПРОВЕРЯЕТСЯ' },
  { at: 86, src: '22-accepted', crop: [40, 610, 1090, 400], label: 'ЗАСЧИТАНО' },
];

function Send() {
  const frame = useCurrentFrame();
  const active = [...STATES].reverse().find((s) => frame >= s.at) ?? STATES[0];
  const local = frame - active.at;
  const done = active.label === 'ЗАСЧИТАНО';

  const pulse = done ? interpolate(local, [0, 8, 24], [0, 0.14, 0], { extrapolateRight: 'clamp' }) : 0;
  const points = done
    ? Math.round(interpolate(local, [4, 24], [0, 70], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
    : null;

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            marginTop: -110,
            opacity: interpolate(local, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            transform: `translateY(${interpolate(local, [0, 10], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
          }}
        >
          <Detail src={active.src} crop={active.crop} width={900} />
        </div>
      </div>

      <AbsoluteFill style={{ background: C.signal, opacity: pulse }} />
      <Caption text={active.label} at={active.at} delay={4} />

      {points !== null && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 500,
            textAlign: 'center',
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 120,
            color: C.signal,
            letterSpacing: '-0.02em',
            filter: `drop-shadow(0 0 40px ${C.signal}55)`,
          }}
        >
          +{points}
          <span style={{ fontSize: 46, marginLeft: 14, color: C.ink }}>БАЛЛОВ</span>
        </div>
      )}
    </AbsoluteFill>
  );
}

// ═══ 0:28,5–0:31,5 · Что это было ══════════════════════════════

function Story() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const open = spring({ frame, fps, config: { damping: 200, mass: 0.9 } });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            marginTop: -80,
            transform: `scaleY(${interpolate(open, [0, 1], [0.8, 1])})`,
            transformOrigin: 'top center',
            opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <Detail src="24-afterword" crop={[40, 1560, 1090, 620]} width={920} />
        </div>
      </div>
      <Caption eyebrow="ОТКРЫЛОСЬ ТОЛЬКО ПОСЛЕ ОТПРАВКИ" text="ГОРОД РАССКАЗЫВАЕТ" at={0} delay={8} />
    </AbsoluteFill>
  );
}

// ═══ 0:31,5–0:33,5 · Карта ушла, рейтинг вырос ═════════════════

function After() {
  const frame = useCurrentFrame();
  const rank = frame >= 30;

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            marginTop: -100,
            opacity: interpolate(frame % 30, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          {rank ? (
            <Detail src="27-rank-after" crop={[40, 600, 1090, 540]} width={920} />
          ) : (
            <Detail src="26-hand-after" crop={[40, 640, 1090, 860]} width={860} />
          )}
        </div>
      </div>
      <Caption
        text={rank ? 'РЕЙТИНГ ОБНОВЛЯЕТСЯ СРАЗУ' : 'КАРТА УХОДИТ ИЗ РУКИ'}
        at={rank ? 30 : 0}
        delay={5}
      />
    </AbsoluteFill>
  );
}

// ═══ 0:33,5–0:36 · Финал ═══════════════════════════════════════

const FACTS = ['05.09.2026 · 14:00', 'LEIPZIG', '15 € С УЧАСТНИКА', 'КОМАНДА ДО 5 ЧЕЛОВЕК', '3–4 ЧАСА ИГРЫ + BBQ'];

function Final() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 200, mass: 0.8 } });
  const flash = interpolate(frame, [64, 70, 75], [0, 0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const p = (i) => spring({ frame: frame - 2 - i * 5, fps, config: { damping: 200, mass: 0.7 } });

  return (
    <AbsoluteFill>
      <Route progress={1} opacity={0.18} />

      <div style={{ position: 'absolute', left: 50, top: 300, opacity: p(0) * 0.92, transform: `rotate(-8deg) scale(${interpolate(p(0), [0, 1], [0.9, 1])})` }}>
        <Polaroid src="p1.jpg" caption="" width={240} reveal={1} />
      </div>
      <div style={{ position: 'absolute', right: 50, top: 270, opacity: p(1) * 0.92, transform: `rotate(9deg) scale(${interpolate(p(1), [0, 1], [0.9, 1])})` }}>
        <Polaroid src="p2.jpg" caption="" width={230} reveal={1} />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 30,
          paddingTop: 150,
        }}
      >
        <Img src={staticFile('logo.png')} style={{ width: 440, opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.9, 1])})` }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {FACTS.map((f, i) => {
            const o = interpolate(frame, [8 + i * 5, 18 + i * 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div
                key={f}
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 600,
                  fontSize: 32,
                  letterSpacing: '0.06em',
                  color: i === 0 ? C.ink : C.muted,
                  opacity: o,
                  transform: `translateY(${interpolate(o, [0, 1], [10, 0])}px)`,
                }}
              >
                {f}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 20,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 62,
            color: C.ink,
            opacity: interpolate(frame, [40, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          СОБИРАЙ КОМАНДУ
        </div>

        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: 30,
            letterSpacing: '0.08em',
            color: C.signal,
            opacity: interpolate(frame, [48, 58], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          DVIZH-PATROL.VERCEL.APP
        </div>
      </div>

      <AbsoluteFill style={{ background: C.signal, opacity: flash }} />
    </AbsoluteFill>
  );
}
