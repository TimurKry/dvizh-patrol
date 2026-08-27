import { Composition, staticFile, continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';
import { Preview } from './Preview.jsx';
import { DURATION, FPS } from './theme.js';

/**
 * Шрифты подкладываются из файлов, а не из сети: рендер идёт в
 * песочнице без доступа к Google Fonts, и подмена на системный
 * гротеск сразу ломает фирменную типографику.
 */
const FONT_CSS = `
@font-face { font-family: 'UnboundedVideo'; src: url('${staticFile('fonts/unbounded.woff2')}') format('woff2'); font-weight: 100 900; font-display: block; }
@font-face { font-family: 'OnestVideo'; src: url('${staticFile('fonts/onest.woff2')}') format('woff2'); font-weight: 100 900; font-display: block; }
`;

const WithFonts = (props) => {
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
  return <Preview {...props} />;
};

export const RemotionRoot = () => (
  <Composition
    id="app-preview"
    component={WithFonts}
    durationInFrames={DURATION}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
