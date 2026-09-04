import { Config } from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setChromiumOpenGlRenderer('swangle');
// Каталог ассетов называется assets — так задана структура
// видеопроекта. `public` рядом с ним симлинк: staticFile()
// Remotion ищет файлы именно в public.
