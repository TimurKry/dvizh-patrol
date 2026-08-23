/**
 * Звук ролика — синтез с нуля.
 *
 * Ни одного постороннего сэмпла: и музыка, и эффекты собираются
 * здесь из осцилляторов и шума. Это снимает вопрос лицензии
 * начисто — трек написан специально для этого ролика и никому,
 * кроме проекта, не принадлежит.
 *
 * Темп 125 BPM: доля 0,48 с, такт 1,92 с, на 24 секунды ровно
 * 12,5 такта. Переходы монтажа стоят на долях — см. storyboard.md.
 *
 * Тональность — ля минор. Бас держит корень, арпеджио идёт по
 * трезвучиям, лид вступает на середине и уходит перед финалом,
 * чтобы последний удар не с чем было спутать.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RATE = 48_000;
const SECONDS = 24;
const LENGTH = RATE * SECONDS;
const BPM = 125;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const OUT = path.resolve(import.meta.dirname, '../assets/audio');

const left = new Float64Array(LENGTH);
const right = new Float64Array(LENGTH);

// ═══ Утилиты ═══════════════════════════════════════════════════

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Экспоненциальный спад: 1 → 0 за `time` секунд. */
const decay = (t, time) => Math.exp(-t / (time / 4));

/** Мягкая ADSR-огибающая без сустейна — для коротких нот. */
function env(t, duration, attack = 0.005, release = 0.06) {
  if (t < 0 || t > duration) return 0;
  const up = clamp01(t / attack);
  const down = clamp01((duration - t) / release);
  return up * down;
}

/** Ноты: 0 = A4 (440 Гц), шаг — полутон. */
const note = (semitones, octave = 0) => 440 * 2 ** (semitones / 12 + octave);

let seed = 20260905;
function noise() {
  // Свой генератор, чтобы трек собирался одинаково при каждом
  // прогоне: воспроизводимость важнее качества шума.
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return (seed / 2147483648) - 1;
}

function add(sample, index, gain, pan = 0) {
  if (index < 0 || index >= LENGTH) return;
  const l = gain * (1 - Math.max(0, pan));
  const r = gain * (1 + Math.min(0, pan));
  left[index] += sample * l;
  right[index] += sample * r;
}

/**
 * Обобщённый «голос»: считает форму на каждом отсчёте.
 * `shape(t, phase)` возвращает значение от -1 до 1.
 */
function voice({ at, duration, gain = 0.2, pan = 0, shape }) {
  const start = Math.round(at * RATE);
  const total = Math.round(duration * RATE);
  let phase = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / RATE;
    const { value, step } = shape(t, phase);
    phase += step;
    add(value, start + i, gain, pan);
  }
}

// ═══ Инструменты ═══════════════════════════════════════════════

function kick(at, gain = 0.95) {
  voice({
    at,
    duration: 0.42,
    gain,
    shape: (t, phase) => {
      // Питч-огибающая: 128 → 44 Гц за 60 мс — это и даёт «удар».
      const freq = 44 + 84 * Math.exp(-t / 0.028);
      const body = Math.sin(2 * Math.PI * phase);
      const click = t < 0.006 ? noise() * 0.5 : 0;
      return { value: (body + click) * decay(t, 0.42), step: freq / RATE };
    },
  });
}

function hat(at, gain = 0.16, tail = 0.045) {
  voice({
    at,
    duration: tail,
    gain,
    pan: 0.25,
    shape: (t) => {
      // Разность соседних отсчётов шума работает как фильтр верхних
      // частот: получается металлический шелест, а не «пшш».
      const value = (noise() - noise()) * 0.5;
      return { value: value * decay(t, tail), step: 0 };
    },
  });
}

function clap(at, gain = 0.42) {
  voice({
    at,
    duration: 0.22,
    gain,
    shape: (t) => {
      // Три быстрых повтора — так хлопок звучит «живым».
      const burst = t < 0.012 || (t > 0.018 && t < 0.028) || (t > 0.034 && t < 0.046) ? 1 : 0.35;
      const tone = noise() * burst;
      return { value: tone * decay(t, 0.2), step: 0 };
    },
  });
}

function bass(at, semitones, duration, gain = 0.34) {
  voice({
    at,
    duration,
    gain,
    shape: (t, phase) => {
      const p = phase % 1;
      // Пила плюс синус октавой ниже: пила даёт характер, синус —
      // тело, которое слышно в телефонном динамике.
      const saw = 2 * p - 1;
      const sub = Math.sin(2 * Math.PI * phase * 0.5);
      const cut = 0.35 + 0.65 * Math.exp(-t / 0.09);
      return {
        value: (saw * 0.55 * cut + sub * 0.6) * env(t, duration, 0.006, 0.08),
        step: note(semitones, -2) / RATE,
      };
    },
  });
}

function pluck(at, semitones, duration, gain = 0.17, pan = 0) {
  voice({
    at,
    duration,
    gain,
    pan,
    shape: (t, phase) => {
      const p = phase % 1;
      const square = p < 0.5 ? 1 : -1;
      const saw = 2 * p - 1;
      const mix = square * 0.35 + saw * 0.65;
      return { value: mix * env(t, duration, 0.004, duration * 0.7), step: note(semitones) / RATE };
    },
  });
}

function pad(at, semitones, duration, gain = 0.09) {
  for (const [detune, pan] of [
    [-0.08, -0.6],
    [0.08, 0.6],
  ]) {
    voice({
      at,
      duration,
      gain,
      pan,
      shape: (t, phase) => {
        const p = phase % 1;
        return {
          value: (2 * p - 1) * env(t, duration, 0.35, 0.6),
          step: (note(semitones, -1) + detune * 4) / RATE,
        };
      },
    });
  }
}

function riser(at, duration, gain = 0.2) {
  voice({
    at,
    duration,
    gain,
    shape: (t) => {
      const progress = t / duration;
      // Шум через резонанс, ползущий вверх: классический подъём
      // перед сменой сцены.
      const value = noise() * (0.25 + progress ** 2);
      return { value: value * clamp01(progress * 3) * 0.7, step: 0 };
    },
  });
}

// ═══ Эффекты интерфейса ════════════════════════════════════════

const tap = (at, gain = 0.2) =>
  voice({
    at,
    duration: 0.05,
    gain,
    shape: (t, phase) => ({
      value: Math.sin(2 * Math.PI * phase) * decay(t, 0.045),
      step: (1750 - 900 * (t / 0.05)) / RATE,
    }),
  });

const swipe = (at, gain = 0.16, duration = 0.28) =>
  voice({
    at,
    duration,
    gain,
    shape: (t) => {
      const progress = t / duration;
      const value = (noise() - noise()) * 0.5;
      return { value: value * Math.sin(Math.PI * progress) ** 2, step: 0 };
    },
  });

const flip = (at, gain = 0.22) => {
  swipe(at, gain * 0.8, 0.34);
  voice({
    at: at + 0.2,
    duration: 0.07,
    gain: gain * 0.9,
    shape: (t, phase) => ({
      value: (Math.sin(2 * Math.PI * phase) * 0.6 + noise() * 0.4) * decay(t, 0.06),
      step: 620 / RATE,
    }),
  });
};

const shutter = (at, gain = 0.34) => {
  voice({
    at,
    duration: 0.03,
    gain,
    shape: (t) => ({ value: noise() * decay(t, 0.025), step: 0 }),
  });
  voice({
    at: at + 0.055,
    duration: 0.06,
    gain: gain * 0.85,
    shape: (t) => ({ value: noise() * decay(t, 0.05), step: 0 }),
  });
};

const blip = (at, freq, gain = 0.16, duration = 0.08) =>
  voice({
    at,
    duration,
    gain,
    shape: (t, phase) => ({
      value: Math.sin(2 * Math.PI * phase) * env(t, duration, 0.004, 0.05),
      step: freq / RATE,
    }),
  });

const success = (at, gain = 0.24) => {
  // Ля-мажорное трезвучие вверх: единственный мажор во всём ролике,
  // и стоит он ровно на «засчитано».
  [0, 4, 7, 12].forEach((semitone, index) => {
    blip(at + index * 0.055, note(semitone), gain * (1 - index * 0.12), 0.28);
  });
};

const notify = (at, gain = 0.22) => {
  blip(at, note(7), gain, 0.12);
  blip(at + 0.1, note(12), gain, 0.2);
};

const rankUp = (at, gain = 0.2) => {
  voice({
    at,
    duration: 0.34,
    gain,
    shape: (t, phase) => ({
      value: Math.sin(2 * Math.PI * phase) * env(t, 0.34, 0.01, 0.2),
      step: (330 + 640 * (t / 0.34) ** 1.6) / RATE,
    }),
  });
};

// ═══ Аранжировка ═══════════════════════════════════════════════

// Гармония: Am — F — C — G, по два такта на аккорд не влезает,
// поэтому по одному: 12 тактов = три круга.
const CHORDS = [
  [0, 3, 7], // Am
  [-4, 0, 5], // F
  [3, 7, 12], // C
  [-2, 2, 7], // G
];

function arrange() {
  const bars = Math.ceil(SECONDS / BAR);

  for (let bar = 0; bar < bars; bar += 1) {
    const at = bar * BAR;
    if (at >= SECONDS) break;

    const chord = CHORDS[bar % CHORDS.length];
    const intro = bar < 1;
    const full = bar >= 2 && bar < 10;
    const finale = bar >= 11;

    // Бочка: с самого начала, она держит темп монтажа.
    for (let beat = 0; beat < 4; beat += 1) {
      const time = at + beat * BEAT;
      if (time >= SECONDS) break;
      kick(time, intro ? 0.6 : 0.95);
    }

    // Хлопок на 2 и 4 — появляется со второго такта.
    if (!intro) {
      clap(at + BEAT);
      clap(at + BEAT * 3);
    }

    // Хэты восьмыми, на слабых долях тише.
    for (let step = 0; step < 8; step += 1) {
      const time = at + (step * BEAT) / 2;
      if (time >= SECONDS) break;
      hat(time, step % 2 === 0 ? 0.14 : 0.08);
    }

    // Бас: корень аккорда, восьмыми с пропуском — так он «качает».
    if (!intro) {
      for (const [offset, length] of [
        [0, BEAT * 0.9],
        [BEAT * 1.5, BEAT * 0.45],
        [BEAT * 2, BEAT * 0.9],
        [BEAT * 3.5, BEAT * 0.45],
      ]) {
        const time = at + offset;
        if (time < SECONDS) bass(time, chord[0], length, finale ? 0.4 : 0.34);
      }
    }

    // Арпеджио шестнадцатыми — движение, за которое цепляется глаз
    // на быстрых склейках.
    if (full) {
      for (let step = 0; step < 8; step += 1) {
        const time = at + (step * BEAT) / 2;
        if (time >= SECONDS) break;
        const semitone = chord[step % 3] + (step >= 4 ? 12 : 0);
        pluck(time, semitone, BEAT * 0.42, 0.15, step % 2 === 0 ? -0.35 : 0.35);
      }
    }

    // Пэд держит гармонию под всем остальным.
    if (bar >= 1) pad(at, chord[1], Math.min(BAR, SECONDS - at), bar >= 10 ? 0.05 : 0.09);
  }

  // Подъём перед рейтингом и перед финалом.
  riser(19.2, 1.8, 0.16);
  riser(22.2, 0.8, 0.2);

  // Финальный удар — под вспышку в последней плашке.
  kick(23.0, 1.15);
  bass(23.0, 0, 0.95, 0.5);
  voice({
    at: 23.0,
    duration: 1.0,
    gain: 0.5,
    shape: (t, phase) => ({
      value: Math.sin(2 * Math.PI * phase) * decay(t, 1.0),
      step: (55 + 30 * Math.exp(-t / 0.05)) / RATE,
    }),
  });
}

/**
 * Эффекты стоят по монтажным точкам из storyboard.md.
 * Меняете раскадровку — правьте и этот список.
 */
function effects() {
  swipe(0.05, 0.22, 0.7); // маршрут прочерчивается
  [0.34, 0.5, 0.66, 0.82, 0.98, 1.14].forEach((at) => blip(at, 1480, 0.07, 0.05));
  swipe(1.72, 0.2, 0.4); // уход в приложение
  tap(1.86, 0.16);

  // Ввод кода: шесть символов — шесть щелчков.
  [2.52, 2.66, 2.8, 2.94, 3.08, 3.22].forEach((at) => tap(at, 0.13));
  tap(3.62, 0.24); // «Войти в команду»
  notify(4.05, 0.14);

  swipe(4.5, 0.14); // прокрутка экрана команды
  swipe(5.6, 0.12);

  tap(7.12, 0.22);
  flip(7.26, 0.24); // переворот фото-карточки
  tap(9.5, 0.2);
  flip(9.64, 0.22); // переворот загадки

  tap(11.1, 0.22); // «Открыть задание»
  swipe(12.2, 0.12);

  swipe(14.05, 0.16, 0.4); // карта: панорама
  blip(14.9, 880, 0.1, 0.07); // приближение
  blip(15.6, 1040, 0.1, 0.07);
  blip(16.35, 1320, 0.14, 0.1); // выбор метки

  shutter(17.08); // фотография выбрана
  tap(17.72, 0.22); // «Отправить на проверку»
  [17.86, 18.0, 18.14, 18.28].forEach((at, index) => blip(at, 660 + index * 110, 0.09, 0.06));
  notify(18.6, 0.2); // «на проверке»

  tap(19.5, 0.18); // организатор подтверждает
  success(20.2); // «засчитано»
  rankUp(21.45); // строка команды идёт вверх
  blip(22.5, note(12), 0.16, 0.24);
}

// ═══ Сведение ══════════════════════════════════════════════════

arrange();
effects();

// Мягкое ограничение вместо жёсткого клиппинга: пики скругляются,
// середина остаётся линейной.
function limit(x) {
  const drive = 0.82;
  return Math.tanh(x * drive) / Math.tanh(drive);
}

const FADE = Math.round(0.08 * RATE);
const bytes = Buffer.alloc(LENGTH * 4);

for (let i = 0; i < LENGTH; i += 1) {
  const fadeIn = Math.min(1, i / FADE);
  const fadeOut = Math.min(1, (LENGTH - i) / FADE);
  const gain = fadeIn * fadeOut * 0.86;

  const l = Math.round(limit(left[i] * gain) * 32000);
  const r = Math.round(limit(right[i] * gain) * 32000);

  bytes.writeInt16LE(Math.max(-32768, Math.min(32767, l)), i * 4);
  bytes.writeInt16LE(Math.max(-32768, Math.min(32767, r)), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + bytes.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(bytes.length, 40);

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'soundtrack.wav'), Buffer.concat([header, bytes]));

process.stdout.write(`Звук собран: ${SECONDS} с, ${BPM} BPM, ${RATE} Гц стерео\n`);
