import 'server-only';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Работа с хранилищем.
 *
 * Путь к файлу всегда строит сервер из идентификаторов, которые
 * он сам и получил из базы. Клиент не передаёт путь ни в каком
 * виде — иначе можно было бы записать файл в каталог чужой
 * команды или перезаписать чужую отправку.
 */

export const BUCKETS = {
  submissions: 'submission-images',
  previews: 'submission-previews',
  references: 'task-reference-images',
  assets: 'event-assets',
} as const;

/** events/{eventId}/teams/{teamId}/tasks/{taskId}/{submissionId}.{ext} */
export function submissionPath(params: {
  eventId: string;
  teamId: string;
  taskId: string;
  submissionId: string;
  extension: 'webp' | 'jpg' | 'png';
}): string {
  const { eventId, teamId, taskId, submissionId, extension } = params;
  return `events/${eventId}/teams/${teamId}/tasks/${taskId}/${submissionId}.${extension}`;
}

export function previewPath(params: {
  eventId: string;
  teamId: string;
  taskId: string;
  submissionId: string;
}): string {
  const { eventId, teamId, taskId, submissionId } = params;
  return `events/${eventId}/teams/${teamId}/tasks/${taskId}/${submissionId}.webp`;
}

export function referencePath(params: {
  eventId: string;
  taskId: string;
  imageId: string;
  extension: string;
}): string {
  const { eventId, taskId, imageId, extension } = params;
  return `events/${eventId}/tasks/${taskId}/${imageId}.${extension}`;
}

export function extensionFor(contentType: string): 'webp' | 'jpg' | 'png' {
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/png') return 'png';
  return 'jpg';
}

// ═══ Подписанные ссылки ════════════════════════════════════════

/**
 * Одноразовая ссылка для загрузки.
 *
 * Разрешает записать ровно один объект по заранее известному
 * пути. Ключ service_role при этом в браузер не попадает.
 */
export async function createSignedUpload(
  bucket: string,
  path: string,
): Promise<{ ok: true; url: string; token: string; path: string } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'signed_upload_failed' };
  }

  return { ok: true, url: data.signedUrl, token: data.token, path: data.path };
}

/** Ссылка на чтение с ограниченным сроком жизни. */
export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = env().SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Пакетная выдача ссылок — для списков и очереди проверки. */
export async function createSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn: number = env().SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return result;

  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrls(unique, expiresIn);

  if (error || !data) return result;

  for (const item of data) {
    if (item.signedUrl && item.path) result.set(item.path, item.signedUrl);
  }
  return result;
}

// ═══ Файлы ═════════════════════════════════════════════════════

export async function downloadObject(bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function objectExists(bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const folder = slash > 0 ? path.slice(0, slash) : '';
  const name = slash > 0 ? path.slice(slash + 1) : path;

  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .list(folder, { search: name, limit: 100 });

  if (error || !data) return false;
  return data.some((item) => item.name === name);
}

export async function uploadObject(
  bucket: string,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(path, body, { contentType, upsert: true });
  return !error;
}

export async function removeObjects(bucket: string, paths: string[]): Promise<number> {
  const valid = paths.filter(Boolean);
  if (valid.length === 0) return 0;
  const { data, error } = await supabaseAdmin().storage.from(bucket).remove(valid);
  if (error) return 0;
  return data?.length ?? 0;
}
