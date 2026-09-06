import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate, Easing } from 'remotion';
import { Card, Flash, Progress, Title, Totals } from './parts.jsx';
import { CANVAS, H, HOLD, INTRO, STEP, arrivalOf } from './theme.js';

/**
 * Лента.
 *
 * Все карточки лежат в одной колонке высотой N×H, а движется сама
 * колонка. Так переход между кадрами — это буквально прокрутка, а
 * не склейка двух планов: соседняя карточка на мгновение видна,
 * как в настоящей ленте.
 *
 * Ход считается от одного числа — дробного номера карточки. Целая
 * часть говорит, какая карточка сейчас, дробная — где мы внутри её
 * шага. Пока дробная меньше HOLD, колонка стоит; дальше уходит
 * вверх с торможением в конце.
 */

function scrollOffset(frame, count) {
  const raw = (frame - INTRO) / STEP;

  if (raw <= 0) return 0;
  if (raw >= count - 1) return (count - 1) * H;

  const index = Math.floor(raw);
  const within = raw - index;

  const glide =
    within <= HOLD
      ? 0
      : interpolate(within, [HOLD, 1], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          // Резкий старт и мягкая посадка: так двигается палец,
          // бросивший ленту, а не механизм с постоянной скоростью.
          easing: Easing.bezier(0.16, 0.9, 0.2, 1),
        });

  return (index + glide) * H;
}

/** Насколько «свежа» вспышка: 0 в момент прилёта, 1 через полшага. */
function flashProgress(frame, count) {
  const raw = (frame - INTRO) / STEP;
  if (raw < 0 || raw > count - 1) return 1;

  const since = raw - Math.floor(raw);
  // Прилёт — это начало шага: карточка только что встала.
  return Math.min(1, since / 0.34);
}

export function Reel({ pairs, stats }) {
  const frame = useCurrentFrame();
  const count = pairs.length;

  const offset = scrollOffset(frame, count);
  const inReel = frame >= INTRO && frame < arrivalOf(count);

  const introFade = interpolate(frame, [INTRO - 10, INTRO], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: CANVAS }}>
      {/* ═══ Лента ═══ */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translateY(${-offset}px)`,
            willChange: 'transform',
          }}
        >
          {pairs.map((pair) => (
            <Card key={pair.slot} pair={pair} />
          ))}
        </div>
      </AbsoluteFill>

      {/* ═══ Вспышка затвора ═══ */}
      {inReel && <Flash progress={flashProgress(frame, count)} />}

      {/* ═══ Полоска прогресса ═══ */}
      {inReel && <Progress done={offset / H + 1} total={count} />}

      {/* ═══ Звук: щелчок на каждый прилёт ═══
          Отдельной дорожкой на карточку, а не одним длинным
          файлом: так ритм звука не разъезжается с картинкой, если
          поменять STEP. */}
      {pairs.map((pair, index) => (
        <Sequence key={pair.slot} from={arrivalOf(index)} durationInFrames={STEP}>
          <Audio src={staticFile('shutter.wav')} volume={0.85} />
        </Sequence>
      ))}

      {/* Шорох пролистывания — в момент броска, перед прилётом. */}
      {pairs.slice(1).map((pair, index) => (
        <Sequence
          key={`swipe-${pair.slot}`}
          from={Math.round(arrivalOf(index) + STEP * HOLD)}
          durationInFrames={Math.round(STEP * (1 - HOLD)) + 4}
        >
          <Audio src={staticFile('swipe.wav')} volume={0.5} />
        </Sequence>
      ))}

      {/* ═══ Заставка ═══ */}
      {frame < INTRO && (
        <AbsoluteFill style={{ opacity: introFade }}>
          <Title
            appear={interpolate(frame, [0, 22], [0, 1], { extrapolateRight: 'clamp' })}
            lines={['Движ-Патруль', 'Лейпциг · 05.09.2026']}
            note="Пять команд, сто заданий, два часа двадцать минут на весь центр"
          />
        </AbsoluteFill>
      )}

      {/* ═══ Финал ═══ */}
      <Sequence from={arrivalOf(count)}>
        <Totals
          appear={interpolate(frame - arrivalOf(count), [0, 26], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}
          stats={stats}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
