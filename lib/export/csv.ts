/**
 * Формирование CSV.
 *
 * Excel по умолчанию читает файл в кодировке системы, поэтому
 * добавляем BOM — иначе кириллица превращается в мусор, и
 * организатор решает, что экспорт сломан.
 */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  // BOM для Excel.
  return `﻿${lines.join('\r\n')}`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'cache-control': 'no-store',
    },
  });
}

/** Дата в формате, который не разъедется между локалями. */
export function isoDate(value: string | null | undefined, timeZone: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
    hour12: false,
  }).format(new Date(value));
}
