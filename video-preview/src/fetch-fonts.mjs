/**
 * Локальная копия шрифтов системы.
 *
 * Приложение подключает Unbounded и Onest через next/font — то есть
 * тоже держит их у себя. Титры и подписи ролика рисуются отдельными
 * HTML-страницами, и им нужны те же файлы: иначе заголовок в кадре
 * набран не тем, чем интерфейс под ним.
 *
 * Скрипт забирает CSS у Google Fonts, скачивает woff2 и переписывает
 * ссылки на локальные. unicode-range сохраняется как есть — без него
 * кириллица уедет в подстановочный шрифт.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../assets/fonts');
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const FAMILIES = ['Unbounded:wght@400;600;700', 'Onest:wght@400;500;600'];

await mkdir(OUT, { recursive: true });

let combined = '/* Скачано из Google Fonts скриптом video-preview/src/fetch-fonts.mjs */\n';

for (const family of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
  const response = await fetch(url, { headers: { 'user-agent': UA } });
  if (!response.ok) throw new Error(`${family}: ${response.status}`);

  let css = await response.text();
  const links = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)]+/g) ?? [])];

  for (const link of links) {
    const name = link.split('/').slice(-2).join('-');
    const file = await fetch(link, { headers: { 'user-agent': UA } });
    await writeFile(path.join(OUT, name), Buffer.from(await file.arrayBuffer()));
    css = css.split(link).join(`./fonts/${name}`);
  }

  combined += `\n${css}`;
}

await writeFile(path.join(OUT, '..', 'fonts.css'), combined);
process.stdout.write(`шрифты: ${OUT}\n`);
