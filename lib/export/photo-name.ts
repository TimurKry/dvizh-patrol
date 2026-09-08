import { safeFileName } from './zip';
import type { SubmissionStatus } from '@/types/database';

/**
 * Имя снимка внутри архива.
 *
 * Правило вынесено из маршрута отдельно затем, что его нужно
 * проверять: имя — единственное, по чему человек через год поймёт,
 * чей это кадр и к какому заданию. Ошибка здесь не падает и не
 * логируется, она просто превращает архив в свалку.
 *
 * Форма: `Команда/059 — Ратуша, которая старше.jpg`. Номер с
 * ведущими нулями, чтобы файлы сортировались по порядку заданий, а
 * не как 1, 10, 100, 2.
 */

const MARK: Partial<Record<SubmissionStatus, string>> = {
  rejected: 'не зачтено',
  manual_review: 'на ручной проверке',
  pending: 'не проверено',
  checking: 'не проверено',
  uploading: 'не долетело',
};

export interface PhotoNameInput {
  team: string | null | undefined;
  taskNumber: number | null | undefined;
  taskTitle: string | null | undefined;
  status: SubmissionStatus;
  attemptNumber: number;
  imagePath: string | null | undefined;
}

/**
 * Расширение берётся из пути в хранилище, а не из типа содержимого.
 *
 * Путь его уже несёт, а лишний хвост вида `.jpeg?token=…` в имя
 * попасть не должен — отсюда ограничение на длину и набор букв.
 */
function extensionOf(path: string | null | undefined): string {
  const raw = path?.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,4}$/.test(raw) ? raw : 'jpg';
}

export function photoFileName(input: PhotoNameInput): string {
  const team = safeFileName(input.team ?? '', 'без команды');
  const number = String(input.taskNumber ?? 0).padStart(3, '0');
  const title = safeFileName(input.taskTitle ?? '', 'задание');

  const marks: string[] = [];
  const mark = MARK[input.status];
  if (mark) marks.push(mark);
  if (input.attemptNumber > 1) marks.push(`попытка ${input.attemptNumber}`);

  const suffix = marks.length > 0 ? ` (${marks.join(', ')})` : '';

  return `${team}/${number} — ${title}${suffix}.${extensionOf(input.imagePath)}`;
}

/**
 * Развести тёзок.
 *
 * Одна команда могла прислать по заданию два кадра с одинаковой
 * пометкой — например, две отклонённые попытки подряд. В архиве
 * второй файл затёр бы первый молча, и пропажу заметили бы не
 * скоро. Числовой хвост дешевле любой другой развязки.
 */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }

  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';

  let attempt = 2;
  let candidate = `${base} (${attempt})${extension}`;
  while (taken.has(candidate)) {
    attempt += 1;
    candidate = `${base} (${attempt})${extension}`;
  }

  taken.add(candidate);
  return candidate;
}
