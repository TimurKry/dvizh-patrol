/**
 * Клиентская часть загрузки.
 *
 * Три шага: занять место, положить файл в хранилище по
 * подписанной ссылке, подтвердить. Между шагами связь может
 * оборваться, поэтому каждый из них безопасно повторить —
 * ключ идемпотентности один на всю попытку.
 */

import { createClient } from '@supabase/supabase-js';

export interface UploadResult {
  ok: boolean;
  status?: string;
  error?: string;
  message?: string;
  /** true, если отправка по этому ключу уже была принята раньше. */
  alreadySubmitted?: boolean;
}

interface StartResponse {
  ok: boolean;
  error?: string;
  message?: string;
  alreadySubmitted?: boolean;
  submissionId?: string;
  status?: string;
  bucket?: string;
  path?: string;
  token?: string;
}

let storageClient: ReturnType<typeof createClient> | null = null;

/**
 * Клиент только для загрузки по подписанной ссылке.
 *
 * anon-ключ здесь не даёт доступа к данным: бакет приватный,
 * авторизует сам одноразовый токен.
 */
function getStorageClient() {
  if (!storageClient) {
    storageClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return storageClient;
}

export interface UploadParams {
  taskId: string;
  idempotencyKey: string;
  blob: Blob;
  contentType: string;
  location?: { latitude: number; longitude: number; accuracy?: number } | null;
  onProgress?: (stage: 'reserving' | 'uploading' | 'confirming') => void;
  signal?: AbortSignal;
}

export async function uploadSubmission(params: UploadParams): Promise<UploadResult> {
  const { taskId, idempotencyKey, blob, contentType, location, onProgress, signal } = params;

  // ─── Шаг 1: место под отправку ─────────────────────────────
  onProgress?.('reserving');

  let start: StartResponse;
  try {
    const response = await fetch('/api/submissions/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskId,
        idempotencyKey,
        contentType,
        bytes: blob.size,
      }),
      signal,
    });
    start = (await response.json()) as StartResponse;
  } catch {
    return { ok: false, error: 'network_error', message: 'Нет связи с сервером.' };
  }

  if (!start.ok) {
    return { ok: false, error: start.error, message: start.message };
  }

  if (start.alreadySubmitted) {
    return { ok: true, alreadySubmitted: true, status: start.status };
  }

  if (!start.bucket || !start.path || !start.token || !start.submissionId) {
    return { ok: false, error: 'upload_failed', message: 'Сервер не выдал ссылку на загрузку.' };
  }

  // ─── Шаг 2: файл в хранилище ───────────────────────────────
  onProgress?.('uploading');

  const { error: uploadError } = await getStorageClient()
    .storage.from(start.bucket)
    .uploadToSignedUrl(start.path, start.token, blob, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    return {
      ok: false,
      error: 'upload_failed',
      message: 'Не удалось загрузить фотографию. Проверьте связь и повторите.',
    };
  }

  // ─── Шаг 3: подтверждение ──────────────────────────────────
  onProgress?.('confirming');

  try {
    const response = await fetch('/api/submissions/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        submissionId: start.submissionId,
        latitude: location?.latitude,
        longitude: location?.longitude,
        locationAccuracy: location?.accuracy,
      }),
      signal,
    });

    const confirmed = (await response.json()) as UploadResult;
    return confirmed;
  } catch {
    // Файл уже в хранилище. Повтор подтверждения безопасен,
    // поэтому черновик не удаляем.
    return {
      ok: false,
      error: 'network_error',
      message: 'Фото загружено, но подтверждение не дошло. Повторите отправку.',
    };
  }
}

/** Геопозиция по требованию задания. Запрашивается только здесь. */
export function requestLocation(
  timeoutMs = 15_000,
): Promise<{ latitude: number; longitude: number; accuracy?: number } | { error: string }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ error: 'unsupported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => resolve({ error: error.code === error.PERMISSION_DENIED ? 'denied' : 'failed' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
