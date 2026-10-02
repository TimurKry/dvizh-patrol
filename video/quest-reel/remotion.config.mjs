import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
// swangle — программный растеризатор: в контейнере нет GPU, а без
// явного выбора Chromium падает на первом же кадре.
Config.setChromiumOpenGlRenderer('swangle');
