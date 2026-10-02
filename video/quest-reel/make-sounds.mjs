#!/usr/bin/env node
/**
 * Звуки для ролика — синтезом, а не файлами со стоков.
 *
 * Скачать щелчок затвора неоткуда: у этой машины нет выхода в сеть,
 * а у стоковых библиотек своя лицензия, которую пришлось бы читать
 * и хранить рядом. Щелчок при этом — вещь простая: два коротких
 * механических удара с быстрым затуханием. Такое честнее собрать,
 * чем искать.
 *
 * Что получается:
 *
 *   shutter.wav   затвор: удар зеркала вверх, пауза, удар вниз
 *   swipe.wav     пролистывание: короткий шум с подъёмом
 *
 * Оба моно, 44,1 кГц, 16 бит — этого хватает, и вес остаётся в
 * килобайтах, так что файлы спокойно живут в репозитории.
 *
 *   node make-sounds.mjs
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 44100;

/** Простой генератор шума с постоянным зерном: сборка повторяема. */
function noise(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return (state / 2147483648) - 1;
  };
}

/**
 * Однополюсный фильтр низких частот.
 *
 * Чистый белый шум звучит как шипение, а не как удар пластика.
 * Срезав верх, получаем глухой щелчок; чем ниже частота среза, тем
 * тяжелее «железо».
 */
function lowpass(samples, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / RATE;
  const alpha = dt / (rc + dt);
  let previous = 0;
  return samples.map((value) => {
    previous += alpha * (value - previous);
    return previous;
  });
}

function highpass(samples, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / RATE;
  const alpha = rc / (rc + dt);
  let previousIn = 0;
  let previousOut = 0;
  return samples.map((value) => {
    const out = alpha * (previousOut + value - previousIn);
    previousIn = value;
    previousOut = out;
    return out;
  });
}

/** Один механический удар: шум под резкой затухающей огибающей. */
function click({ ms, decay, cutoff, gain, seed }) {
  const length = Math.round((ms / 1000) * RATE);
  const random = noise(seed);

  let samples = Array.from({ length }, () => random());
  samples = lowpass(samples, cutoff);
  samples = highpass(samples, 400);

  return samples.map((value, i) => {
    const t = i / RATE;
    // Мгновенная атака и экспоненциальный спад — так ведёт себя
    // удар, а не нота: нарастания у него нет вовсе.
    const envelope = Math.exp(-t / decay);
    return value * envelope * gain;
  });
}

function silence(ms) {
  return new Array(Math.round((ms / 1000) * RATE)).fill(0);
}

function shutter() {
  return [
    ...click({ ms: 45, decay: 0.007, cutoff: 5200, gain: 1.0, seed: 7 }),
    ...silence(38),
    ...click({ ms: 60, decay: 0.011, cutoff: 3600, gain: 0.72, seed: 23 }),
  ];
}

/**
 * Пролистывание: короткий шорох с подъёмом громкости к концу.
 *
 * Он не должен спорить с затвором, поэтому тише и мягче: его
 * задача — прикрыть склейку, а не быть слышимым отдельно.
 */
function swipe() {
  const ms = 180;
  const length = Math.round((ms / 1000) * RATE);
  const random = noise(101);

  let samples = Array.from({ length }, () => random());
  samples = lowpass(samples, 2600);
  samples = highpass(samples, 700);

  return samples.map((value, i) => {
    const t = i / length;
    // Колокол со смещением вправо: шорох набирает и обрывается.
    const envelope = Math.sin(Math.PI * Math.min(1, t ** 0.7)) ** 2;
    return value * envelope * 0.28;
  });
}

/** Мягкое ограничение вместо жёсткого среза: клиппинг слышен. */
function normalise(samples, peak = 0.89) {
  const max = samples.reduce((best, value) => Math.max(best, Math.abs(value)), 0);
  if (max === 0) return samples;
  const factor = peak / max;
  return samples.map((value) => Math.tanh(value * factor * 1.05));
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => {
    const clamped = Math.max(-1, Math.min(1, value));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  });

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // моно
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

const out = join(import.meta.dirname, 'public');

for (const [name, samples] of [
  ['shutter.wav', shutter()],
  ['swipe.wav', swipe()],
]) {
  const buffer = wav(normalise(samples));
  writeFileSync(join(out, name), buffer);
  console.log(`  ${name} — ${(buffer.length / 1024).toFixed(1)} КБ, ${
    ((buffer.length - 44) / 2 / RATE).toFixed(3)
  } с`);
}
