import { Composition, Sequence, staticFile, continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';
import { Preview } from './Preview.jsx';
import { DURATION, FPS, TEASER, TEASER_DURATION } from './theme.js';

/**
 * Шрифты подкладываются из файлов, а не из сети: рендер идёт в
 * песочнице без доступа к Google Fonts, и подмена на системный
 * гротеск сразу ломает фирменную типографику.
 */
const FONT_CSS = `
@font-face { font-family: 'UnboundedVideo'; src: url('${staticFile('fonts/unbounded.woff2')}') format('woff2'); font-weight: 100 900; font-display: block; }
@font-face { font-family: 'OnestVideo'; src: url('${staticFile('fonts/onest.woff2')}') format('woff2'); font-weight: 100 900; font-display: block; }
`;

function useFonts() {
  const [handle] = useState(() => delayRender('шрифты'));
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = FONT_CSS;
    document.head.appendChild(style);
    Promise.all([
      document.fonts.load('800 52px UnboundedVideo'),
      document.fonts.load('400 30px OnestVideo'),
    ]).then(() => continueRender(handle));
  }, [handle]);
}

const Full = () => {
  useFonts();
  return <Preview />;
};

/**
 * Пятнадцатисекундный тизер.
 *
 * Не отдельный монтаж, а вырезка из того же ролика: каждый кусок
 * оборачивается во вложенную последовательность со сдвигом назад,
 * и сцена внутри видит своё родное время. Поэтому тизер не может
 * разойтись с полной версией — он и есть она, только короче.
 */
const Teaser = () => {
  useFonts();
  let at = 0;
  return (
    <>
      {TEASER.map(([from, length]) => {
        const seq = (
          <Sequence key={from} from={at} durationInFrames={length}>
            <Sequence from={-from} durationInFrames={from + length}>
              <Preview />
            </Sequence>
          </Sequence>
        );
        at += length;
        return seq;
      })}
    </>
  );
};

export const RemotionRoot = () => (
  <>
    <Composition
      id="app-preview"
      component={Full}
      durationInFrames={DURATION}
      fps={FPS}
      width={1080}
      height={1920}
    />
    <Composition
      id="teaser"
      component={Teaser}
      durationInFrames={TEASER_DURATION}
      fps={FPS}
      width={1080}
      height={1920}
    />
  </>
);
