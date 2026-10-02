import React from 'react';
import { Composition, staticFile, continueRender, delayRender } from 'remotion';
import { Reel } from './Reel.jsx';
import { FPS, H, W, totalFrames } from './theme.js';
import pairs from '../public/pairs/pairs.json';
import totals from '../public/pairs/totals.json';

/**
 * Шрифты подключаются здесь и с `font-display: block`: иначе
 * первые кадры рендерятся системным шрифтом, и в готовом файле
 * заставка выглядит иначе, чем всё остальное.
 */
const handle = delayRender('Шрифты');

const style = document.createElement('style');
style.textContent = `
@font-face { font-family: 'UnboundedVideo'; src: url('${staticFile('fonts/unbounded.woff2')}') format('woff2'); font-weight: 100 900; font-display: block; }
@font-face { font-family: 'OnestVideo'; src: url('${staticFile('fonts/onest.woff2')}') format('woff2'); font-weight: 100 900; font-display: block; }
`;
document.head.appendChild(style);

Promise.all([
  document.fonts.load('700 100px UnboundedVideo'),
  document.fonts.load('400 40px OnestVideo'),
])
  .then(() => continueRender(handle))
  .catch(() => continueRender(handle));

/**
 * Цифры финала.
 *
 * Берутся из `totals.json`, а не из набора пар: в ленту попадает
 * выборка на сорок секунд, а гордиться хочется целым вечером.
 * Файл пишут оба сценария подготовки материала — и выгрузка из
 * базы, и заглушки, — поэтому импорт всегда находит его на месте.
 */
const STATS = [
  { value: totals.photos, label: 'фотографий' },
  { value: totals.teams, label: 'команды' },
  { value: totals.tasks, label: 'заданий взято' },
];

export function RemotionRoot() {
  return (
    <Composition
      id="quest-reel"
      component={Reel}
      durationInFrames={totalFrames(pairs.length)}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{ pairs, stats: STATS }}
    />
  );
}
