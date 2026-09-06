import React from 'react';
import { Img, staticFile, interpolate, Easing } from 'remotion';
import {
  CANVAS,
  FAINT,
  FONT_DISPLAY,
  FONT_TEXT,
  H,
  INK,
  MUTED,
  PANEL,
  W,
  teamColor,
} from './theme.js';

/**
 * Детали кадра.
 *
 * Одно правило на весь файл: сигнальный цвет в кадре ровно один —
 * цвет команды, чья это работа. Всё остальное живёт на графитовом
 * и белом. Иначе лента из двадцати карточек превращается в
 * светофор, и глазу не за что зацепиться.
 */

// ═══ Подписи ═══════════════════════════════════════════════════

export function Label({ children, color = MUTED, style }) {
  return (
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: 4,
        textTransform: 'uppercase',
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Chip({ children, color }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        border: `2px solid ${color}`,
        color,
        fontFamily: FONT_DISPLAY,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: 2,
        padding: '10px 22px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

// ═══ Кадр пары ═════════════════════════════════════════════════

/**
 * Одна карточка ленты.
 *
 * Снимок команды идёт во весь кадр, эталон — врезкой сверху
 * справа, с лёгким наклоном. Так читается сразу: большое — то, что
 * получилось, маленькое — то, что задавали. Обратный порядок
 * пробовать не стоит: задание интересно ровно две секунды, а
 * смотрят люди на результат.
 */
export function Card({ pair }) {
  const accent = teamColor(pair.color);

  return (
    <div
      style={{
        width: W,
        height: H,
        position: 'relative',
        overflow: 'hidden',
        background: CANVAS,
      }}
    >
      {/* Снимок команды. object-fit: cover — кадры сняты и
          вертикально, и горизонтально, и подгонять их поштучно
          некому. */}
      <Img
        src={staticFile(`pairs/${pair.shot}`)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Затемнение сверху и снизу: подписи должны читаться на
          любом снимке, а какой он будет — заранее неизвестно. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(6,6,9,0.78) 0%, rgba(6,6,9,0.10) 26%,' +
            ' rgba(6,6,9,0.10) 52%, rgba(6,6,9,0.92) 100%)',
        }}
      />

      {/* ═══ Шапка: номер и название задания ═══ */}
      <div style={{ position: 'absolute', top: 96, left: 72, right: 72 }}>
        <Label color={accent}>Задание {String(pair.number).padStart(2, '0')}</Label>
        <div
          style={{
            marginTop: 14,
            fontFamily: FONT_DISPLAY,
            fontSize: pair.title.length > 26 ? 56 : 68,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: -1.4,
            color: INK,
            maxWidth: 720,
          }}
        >
          {pair.title}
        </div>
      </div>

      {/* ═══ Врезка с эталоном ═══ */}
      {pair.task && (
        <div
          style={{
            position: 'absolute',
            top: 300,
            right: 64,
            width: 300,
            transform: 'rotate(-2.5deg)',
            background: INK,
            padding: 14,
            paddingBottom: 46,
            boxShadow: '0 30px 70px rgba(0,0,0,0.55)',
          }}
        >
          <Img
            src={staticFile(`pairs/${pair.task}`)}
            style={{ width: '100%', height: 300, objectFit: 'cover', display: 'block' }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 16,
              fontFamily: FONT_DISPLAY,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: CANVAS,
            }}
          >
            Как задавали
          </div>
        </div>
      )}

      {/* ═══ Подвал: команда и баллы ═══ */}
      <div
        style={{
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 108,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <div>
          <Label>Сделали</Label>
          <div
            style={{
              marginTop: 10,
              fontFamily: FONT_DISPLAY,
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: -1,
              color: accent,
              maxWidth: 620,
              lineHeight: 1.05,
            }}
          >
            {pair.team}
          </div>
        </div>

        <Chip color={accent}>+{pair.points}</Chip>
      </div>
    </div>
  );
}

// ═══ Затвор ════════════════════════════════════════════════════

/**
 * Вспышка на прилёте карточки.
 *
 * Две трети кадра — резкий белый, дальше быстрый спад. Держать
 * дольше нельзя: вспышка должна восприниматься как щелчок, а не
 * как склейка через белое.
 */
export function Flash({ progress }) {
  const alpha = interpolate(progress, [0, 0.18, 1], [0.44, 0.2, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });

  if (alpha <= 0.001) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: INK,
        opacity: alpha,
        pointerEvents: 'none',
      }}
    />
  );
}

// ═══ Рамка ленты ═══════════════════════════════════════════════

/** Полоска прогресса: сколько ленты позади. */
export function Progress({ done, total }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        background: 'rgba(245,245,241,0.14)',
      }}
    >
      <div
        style={{
          width: `${Math.min(100, (done / total) * 100)}%`,
          height: '100%',
          background: INK,
        }}
      />
    </div>
  );
}

// ═══ Заставка и финал ══════════════════════════════════════════

export function Title({ appear, lines, note }) {
  const shift = interpolate(appear, [0, 1], [40, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        width: W,
        height: H,
        background: CANVAS,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        padding: '0 64px',
        opacity: interpolate(appear, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `translateY(${shift}px)`,
      }}
    >
      {lines.map((line, i) => (
        <div
          key={line}
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: i === 0 ? 88 : 44,
            fontWeight: i === 0 ? 800 : 600,
            letterSpacing: i === 0 ? -2 : 6,
            textTransform: i === 0 ? 'none' : 'uppercase',
            color: i === 0 ? INK : MUTED,
            textAlign: 'center',
          }}
        >
          {line}
        </div>
      ))}

      {note && (
        <div
          style={{
            marginTop: 34,
            fontFamily: FONT_TEXT,
            fontSize: 32,
            color: FAINT,
            textAlign: 'center',
            maxWidth: 760,
            lineHeight: 1.4,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

/** Итоговая плашка с цифрами вечера. */
export function Totals({ appear, stats }) {
  return (
    <div
      style={{
        width: W,
        height: H,
        background: CANVAS,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 54,
        opacity: interpolate(appear, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
      }}
    >
      {stats.map((item, i) => (
        <div key={item.label} style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 126,
              fontWeight: 800,
              letterSpacing: -4,
              lineHeight: 1,
              color: i === 0 ? INK : INK,
              transform: `translateY(${interpolate(
                appear,
                [i * 0.12, 0.4 + i * 0.12],
                [30, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) },
              )}px)`,
            }}
          >
            {item.value}
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: FONT_DISPLAY,
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            {item.label}
          </div>
        </div>
      ))}

      <div
        style={{
          marginTop: 40,
          padding: '18px 40px',
          border: `2px solid ${PANEL}`,
          fontFamily: FONT_DISPLAY,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: 8,
          textTransform: 'uppercase',
          color: INK,
        }}
      >
        Движ-Патруль
      </div>
    </div>
  );
}
