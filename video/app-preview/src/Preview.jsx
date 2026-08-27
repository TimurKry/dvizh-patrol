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
import { Backdrop, Caption, Detail, Note, Phone, Route, SAFE } from './parts.jsx';
import { C, FONT_BODY, FONT_DISPLAY } from './theme.js';

/**
 * App Preview «Движ-Патруля» — 36 секунд.
 *
 * Порядок сцен повторяет порядок игры: код → команда → карточки →
 * карта → выполнение → отправка → баллы → история → рейтинг →
 * финал. Каждый следующий кадр отвечает на вопрос предыдущего.
 *
 * Все экраны — настоящие снимки приложения на 390×844 при
 * плотности 3. Ничего не перерисовано: где текст надо прочитать,
 * кадр укрупняется до нужного куска, а не подменяет его версткой.
 */

const S = {
  hook: [0, 90],
  join: [90, 180],
  team: [180, 270],
  cards: [270, 420],
  map: [420, 540],
  city: [540, 660],
  send: [660, 810],
  story: [810, 900],
  rank: [900, 990],
  final: [990, 1080],
};

const len = ([a, b]) => b - a;

export const Preview = () => (
  <Backdrop>
    <Sequence from={S.hook[0]} durationInFrames={len(S.hook)}><Hook /></Sequence>
    <Sequence from={S.join[0]} durationInFrames={len(S.join)}><Join /></Sequence>
    <Sequence from={S.team[0]} durationInFrames={len(S.team)}><Team /></Sequence>
    <Sequence from={S.cards[0]} durationInFrames={len(S.cards)}><Cards /></Sequence>
    <Sequence from={S.map[0]} durationInFrames={len(S.map)}><MapScene /></Sequence>
    <Sequence from={S.city[0]} durationInFrames={len(S.city)}><City /></Sequence>
    <Sequence from={S.send[0]} durationInFrames={len(S.send)}><Send /></Sequence>
    <Sequence from={S.story[0]} durationInFrames={len(S.story)}><Story /></Sequence>
    <Sequence from={S.rank[0]} durationInFrames={len(S.rank)}><Rank /></Sequence>
    <Sequence from={S.final[0]} durationInFrames={len(S.final)}><Final /></Sequence>
  </Backdrop>
);

// ═══ 0:00–0:03 · Город становится игрой ════════════════════════

function Hook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dot = spring({ frame, fps, config: { damping: 200 } });
  const draw = interpolate(frame, [6, 62], [0, 1], { extrapolateRight: 'clamp' });
  const title = interpolate(frame, [20, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const logo = interpolate(frame, [62, 76], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleOut = interpolate(frame, [58, 72], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Route progress={draw} />

      <div
        style={{
          position: 'absolute',
          left: 540 - 9,
          top: 1420 - 9,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: C.signal,
          transform: `scale(${dot})`,
          filter: `drop-shadow(0 0 26px ${C.signal})`,
          opacity: 1 - draw,
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 80,
          right: 80,
          top: 720,
          textAlign: 'center',
          opacity: title * titleOut,
          transform: `translateY(${interpolate(title, [0, 1], [30, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 92,
            lineHeight: 0.98,
            letterSpacing: '-0.02em',
            color: C.ink,
          }}
        >
          ЛЕЙПЦИГ
          <br />
          СТАНОВИТСЯ
          <br />
          <span style={{ color: C.signal }}>ИГРОЙ</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 830,
          display: 'flex',
          justifyContent: 'center',
          opacity: logo,
          transform: `scale(${interpolate(logo, [0, 1], [0.86, 1])})`,
        }}
      >
        <Img src={staticFile('logo.png')} style={{ width: 560 }} />
      </div>
    </AbsoluteFill>
  );
}

// ═══ 0:03–0:06 · Вход без регистрации ══════════════════════════

function Join() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200, mass: 0.7 } });

  // Пустое поле сменяется заполненным на 34-м кадре: так виден
  // сам факт ввода, а не только результат.
  const filled = frame >= 34;
  const flash = interpolate(frame, [34, 40], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Route progress={1} opacity={0.14} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${interpolate(rise, [0, 1], [70, 0])}px)`, position: 'relative' }}>
          <Detail
            src={filled ? '02-join-filled' : '01-join-empty'}
            crop={[40, 620, 1090, 900]}
            width={880}
          />
          <AbsoluteFill style={{ background: C.signal, opacity: flash * 0.12, borderRadius: 22 }} />
        </div>
      </div>
      <Caption eyebrow="КОД КОМАНДЫ" text="БЕЗ РЕГИСТРАЦИИ" at={0} delay={8} />
    </AbsoluteFill>
  );
}

// ═══ 0:06–0:09 · Команда в игре ════════════════════════════════

function Team() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200, mass: 0.8 } });
  const scale = interpolate(frame, [0, 90], [1.04, 1.0]);

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Phone
          src="03-hand"
          width={520}
          style={{
            transform: `translateY(${interpolate(rise, [0, 1], [120, 0])}px) scale(${scale})`,
            marginTop: -110,
          }}
        />
      </div>
      <Caption eyebrow="6 КАРТ НА РУКЕ" text="ВЫБИРАЙТЕ СВОЙ МАРШРУТ" at={0} delay={10} />
    </AbsoluteFill>
  );
}

// ═══ 0:09–0:14 · Три типа заданий ══════════════════════════════

const TYPES = [
  { src: '04-card-3', label: 'РАЗГАДЫВАЙТЕ', hint: 'Загадка · 40 баллов' },
  { src: '04-card-1', label: 'ДЕЙСТВУЙТЕ', hint: 'Актив · 60 баллов' },
  { src: '04-card-4', label: 'ПОВТОРЯЙТЕ ФОТО', hint: 'Фото-повтор · 70 баллов' },
];

function Cards() {
  const frame = useCurrentFrame();
  const step = Math.min(2, Math.floor(frame / 50));
  const local = frame - step * 50;
  const { fps } = useVideoConfig();
  const enter = spring({ frame: local, fps, config: { damping: 200, mass: 0.7 } });
  const card = TYPES[step];

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            transform: `translateY(${interpolate(enter, [0, 1], [50, 0])}px) scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
            opacity: interpolate(local, [0, 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            marginTop: -70,
          }}
        >
          <Detail src={card.src} crop={[95, 300, 985, 640]} width={880} />
        </div>
      </div>
      <Caption text={card.label} at={step * 50} delay={6} />
      <Note at={step * 50} delay={10}>{card.hint}</Note>
    </AbsoluteFill>
  );
}

// ═══ 0:14–0:18 · Выбор точки и карта ═══════════════════════════

function MapScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Первая половина — страница задания, вторая — карта.
  const toMap = interpolate(frame, [52, 66], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rise = spring({ frame, fps, config: { damping: 200 } });
  const zoom = interpolate(frame, [60, 120], [1.12, 1.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Route progress={1} opacity={0.16} />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', marginTop: -110 }}>
          <div style={{ opacity: 1 - toMap, transform: `translateY(${interpolate(rise, [0, 1], [60, 0])}px)` }}>
            <Phone src="05-task-top" width={520} />
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: toMap,
              transform: `scale(${zoom})`,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Phone src="08-map" width={520} />
          </div>
        </div>
      </div>

      <Caption text="МАРШРУТ ВЫБИРАЕТЕ ВЫ" at={0} delay={10} />
    </AbsoluteFill>
  );
}

// ═══ 0:18–0:22 · Выполнение в городе ═══════════════════════════

/**
 * Здесь по сценарию должна быть съёмка команды у памятника.
 * Настоящих кадров города нет и придумывать их нельзя, поэтому
 * место занимает то, что в этот момент действительно перед
 * глазами участника: условие задания крупно и рамка видоискателя.
 */
function City() {
  const frame = useCurrentFrame();
  const steps = ['НАШЛИ', 'ВЫПОЛНИЛИ', 'СНЯЛИ'];
  const kb = interpolate(frame, [0, 120], [1.0, 1.09]);

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${kb})`, marginTop: -80 }}>
          <Detail src="05-task-top" crop={[40, 440, 1090, 760]} width={900} />
        </div>
      </div>

      <Viewfinder />

      <div
        style={{
          position: 'absolute',
          left: 90,
          right: 90,
          bottom: SAFE.bottom,
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          alignItems: 'center',
        }}
      >
        {steps.map((s, i) => {
          const on = interpolate(frame, [i * 26 + 8, i * 26 + 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {i > 0 && <span style={{ color: C.signal, fontSize: 30, opacity: on }}>→</span>}
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 36,
                  color: C.ink,
                  opacity: 0.25 + on * 0.75,
                }}
              >
                {s}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Viewfinder() {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [10, 26], [0, 0.75], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const corner = (style) => (
    <div style={{ position: 'absolute', width: 74, height: 74, border: `4px solid ${C.signal}`, ...style }} />
  );
  return (
    <AbsoluteFill style={{ opacity: o, pointerEvents: 'none' }}>
      {corner({ left: 90, top: 420, borderRight: 'none', borderBottom: 'none' })}
      {corner({ right: 90, top: 420, borderLeft: 'none', borderBottom: 'none' })}
      {corner({ left: 90, bottom: 620, borderRight: 'none', borderTop: 'none' })}
      {corner({ right: 90, bottom: 620, borderLeft: 'none', borderTop: 'none' })}
    </AbsoluteFill>
  );
}

// ═══ 0:22–0:27 · Загрузка и проверка ═══════════════════════════

const STATES = [
  { at: 0, src: '05-task-top', crop: [40, 1660, 1090, 300], label: 'ЗАГРУЗКА' },
  { at: 34, src: '21-submission-pending', crop: [40, 610, 1090, 400], label: 'ОТПРАВЛЕНО' },
  { at: 68, src: '22-submission-checking', crop: [40, 610, 1090, 400], label: 'НА ПРОВЕРКЕ' },
  { at: 104, src: '23-submission-accepted', crop: [40, 610, 1090, 400], label: 'ЗАСЧИТАНО' },
];

function Send() {
  const frame = useCurrentFrame();
  const active = [...STATES].reverse().find((s) => frame >= s.at) ?? STATES[0];
  const local = frame - active.at;
  const accepted = active.label === 'ЗАСЧИТАНО';

  const pulse = accepted
    ? interpolate(local, [0, 10, 26], [0, 0.16, 0], { extrapolateRight: 'clamp' })
    : 0;
  const points = accepted
    ? Math.round(interpolate(local, [4, 26], [0, 120], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
    : null;

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            marginTop: -120,
            opacity: interpolate(local, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            transform: `translateY(${interpolate(local, [0, 10], [22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
          }}
        >
          <Detail src={active.src} crop={active.crop} width={900} />
        </div>
      </div>

      <AbsoluteFill style={{ background: C.signal, opacity: pulse * 0.1 }} />

      <Caption text={active.label} at={active.at} delay={4} />

      {points !== null && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 470,
            textAlign: 'center',
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 130,
            color: C.signal,
            letterSpacing: '-0.02em',
            filter: `drop-shadow(0 0 40px ${C.signal}55)`,
          }}
        >
          +{points}
          <span style={{ fontSize: 52, marginLeft: 14, color: C.ink }}>БАЛЛОВ</span>
        </div>
      )}
    </AbsoluteFill>
  );
}

// ═══ 0:27–0:30 · История открывается ═══════════════════════════

function Story() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const open = spring({ frame, fps, config: { damping: 200, mass: 0.9 } });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            marginTop: -90,
            transform: `scaleY(${interpolate(open, [0, 1], [0.82, 1])})`,
            transformOrigin: 'top center',
            opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <Detail src="25-afterword" crop={[40, 600, 1090, 740]} width={920} />
        </div>
      </div>
      <Caption eyebrow="ОТКРЫЛОСЬ ПОСЛЕ ОТПРАВКИ" text="ГОРОД РАСКРЫВАЕТ СВОИ ИСТОРИИ" at={0} delay={10} />
    </AbsoluteFill>
  );
}

// ═══ 0:30–0:33 · Рейтинг ═══════════════════════════════════════

function Rank() {
  const frame = useCurrentFrame();
  const after = frame >= 40;
  const flash = interpolate(frame, [40, 52], [0.3, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ marginTop: -100, position: 'relative' }}>
          <Detail
            src={after ? '27-leaderboard-after' : '20-leaderboard-before'}
            crop={[40, 600, 1090, 560]}
            width={920}
          />
          <AbsoluteFill style={{ background: C.signal, opacity: flash * 0.2, borderRadius: 22 }} />
        </div>
      </div>
      <Caption text="РЕЙТИНГ МЕНЯЕТСЯ В РЕАЛЬНОМ ВРЕМЕНИ" at={0} delay={8} />
    </AbsoluteFill>
  );
}

// ═══ 0:33–0:36 · Финал ═════════════════════════════════════════

const FACTS = [
  '05.09.2026 · 14:00',
  'LEIPZIG',
  '15 € С УЧАСТНИКА',
  'КОМАНДА ДО 5 ЧЕЛОВЕК',
  '3–4 ЧАСА ИГРЫ + BBQ',
];

function Final() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 200, mass: 0.8 } });
  const flash = interpolate(frame, [78, 84, 90], [0, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Route progress={1} opacity={0.2} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 40,
          paddingTop: 40,
        }}
      >
        <Img
          src={staticFile('logo.png')}
          style={{ width: 520, opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.9, 1])})` }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {FACTS.map((f, i) => {
            const o = interpolate(frame, [10 + i * 6, 20 + i * 6], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <div
                key={f}
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 600,
                  fontSize: 34,
                  letterSpacing: '0.06em',
                  color: i === 0 ? C.ink : C.muted,
                  opacity: o,
                  transform: `translateY(${interpolate(o, [0, 1], [12, 0])}px)`,
                }}
              >
                {f}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 30,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 64,
            color: C.ink,
            opacity: interpolate(frame, [46, 58], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          СОБИРАЙ КОМАНДУ
        </div>

        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: 32,
            letterSpacing: '0.08em',
            color: C.ink,
            opacity: interpolate(frame, [54, 66], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          DVIZH-PATROL.VERCEL.APP
        </div>
      </div>

      <AbsoluteFill style={{ background: C.signal, opacity: flash }} />
    </AbsoluteFill>
  );
}
