/**
 * Черновики отправок в IndexedDB.
 *
 * Если участник выбрал фотографию, а связь пропала, файл нельзя
 * терять: переснять сцену на улице часто уже невозможно — люди
 * разошлись, свет ушёл, объект закрылся.
 *
 * Черновик хранит подготовленный (сжатый) файл и ключ
 * идемпотентности. При повторной попытке используется ТОТ ЖЕ
 * ключ, поэтому сервер не создаёт вторую отправку.
 *
 * Баллы локально не начисляются никогда: черновик — это только
 * файл, ожидающий отправки.
 */

const DB_NAME = 'dvizh-patrol';
const DB_VERSION = 1;
const STORE = 'submission-drafts';

export interface SubmissionDraft {
  /** Ключ хранилища: taskId. Одно задание — один черновик. */
  taskId: string;
  idempotencyKey: string;
  blob: Blob;
  contentType: string;
  bytes: number;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'taskId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    // Приватный режим или запрет хранилища — работаем без черновиков.
    request.onerror = () => resolve(null);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

export async function saveDraft(draft: SubmissionDraft): Promise<void> {
  await withStore('readwrite', (store) => store.put(draft));
}

export async function getDraft(taskId: string): Promise<SubmissionDraft | null> {
  const result = await withStore<SubmissionDraft | undefined>('readonly', (store) =>
    store.get(taskId),
  );
  return result ?? null;
}

export async function listDrafts(): Promise<SubmissionDraft[]> {
  const result = await withStore<SubmissionDraft[]>('readonly', (store) => store.getAll());
  return result ?? [];
}

export async function deleteDraft(taskId: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(taskId));
}

export async function markDraftFailed(taskId: string, error: string): Promise<void> {
  const draft = await getDraft(taskId);
  if (!draft) return;
  await saveDraft({ ...draft, attempts: draft.attempts + 1, lastError: error });
}

/** Ключ идемпотентности: случайный, живёт вместе с черновиком. */
export function createIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
