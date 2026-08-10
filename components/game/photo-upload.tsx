'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorNotice, Notice } from '@/components/ui/feedback';
import { compressImage, formatBytes } from '@/lib/image/compress';
import {
  createIdempotencyKey,
  deleteDraft,
  getDraft,
  markDraftFailed,
  saveDraft,
} from '@/lib/offline/draft-store';
import { requestLocation, uploadSubmission } from '@/lib/upload-client';
import { cn } from '@/lib/cn';

/**
 * Загрузка фотографии задания.
 *
 * Ключевое поведение: участник не ждёт результат проверки. Как
 * только файл принят, экран говорит «можно продолжать квест».
 *
 * Если связь оборвалась, подготовленный файл остаётся в
 * IndexedDB вместе с ключом идемпотентности, и повтор не создаёт
 * вторую отправку.
 */

type Phase = 'idle' | 'preparing' | 'ready' | 'uploading' | 'done' | 'error';

interface Props {
  taskId: string;
  requireLocation: boolean;
  /**
   * Строгое игровое поле: геопозиция нужна к каждой фотографии,
   * даже если само задание к месту не привязано.
   */
  areaEnforced?: boolean;
  maxLongEdge: number;
  maxBytes: number;
  attemptsLeft: number;
}

const STAGE_TEXT: Record<string, string> = {
  reserving: 'Готовим отправку…',
  uploading: 'Загружаем фотографию…',
  confirming: 'Подтверждаем…',
};

export function PhotoUpload({
  taskId,
  requireLocation,
  areaEnforced = false,
  maxLongEdge,
  maxBytes,
  attemptsLeft,
}: Props) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{
    blob: Blob;
    contentType: string;
    bytes: number;
    ratio: number;
  } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [stage, setStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const releasePreview = useCallback(() => {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
  }, []);

  // Незавершённый черновик этого задания.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const draft = await getDraft(taskId);
      if (cancelled || !draft) return;

      const url = URL.createObjectURL(draft.blob);
      previewUrl.current = url;
      setPreview(url);
      setPrepared({
        blob: draft.blob,
        contentType: draft.contentType,
        bytes: draft.bytes,
        ratio: 1,
      });
      setIdempotencyKey(draft.idempotencyKey);
      setPhase('ready');
      setRestored(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => releasePreview, [releasePreview]);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Можно загружать только изображения.');
      setPhase('error');
      return;
    }

    setError(null);
    setRestored(false);
    setPhase('preparing');

    try {
      const compressed = await compressImage(file, { maxLongEdge, maxBytes });
      const key = createIdempotencyKey();

      releasePreview();
      const url = URL.createObjectURL(compressed.blob);
      previewUrl.current = url;

      setPreview(url);
      setPrepared({
        blob: compressed.blob,
        contentType: compressed.contentType,
        bytes: compressed.bytes,
        ratio: compressed.ratio,
      });
      setIdempotencyKey(key);
      setPhase('ready');

      // Черновик пишем сразу: если связь пропадёт между выбором
      // и отправкой, файл уже сохранён.
      await saveDraft({
        taskId,
        idempotencyKey: key,
        blob: compressed.blob,
        contentType: compressed.contentType,
        bytes: compressed.bytes,
        createdAt: Date.now(),
        attempts: 0,
      });
    } catch {
      setError('Не удалось подготовить фотографию. Попробуйте другой снимок.');
      setPhase('error');
    }
  }

  async function handleSend() {
    if (!prepared || !idempotencyKey) return;

    setError(null);
    setPhase('uploading');

    let location: { latitude: number; longitude: number; accuracy?: number } | null = null;

    // Геопозиция нужна либо самому заданию, либо строгому
    // игровому полю. Сервер проверит оба условия ещё раз —
    // здесь мы лишь избавляем команду от отправки, которая
    // заведомо не пройдёт.
    const needsLocation = requireLocation || areaEnforced;

    if (needsLocation) {
      setStage('Запрашиваем геопозицию…');
      const result = await requestLocation();

      if ('error' in result) {
        setPhase('ready');
        setStage('');
        setError(
          result.error === 'denied'
            ? requireLocation
              ? 'Для этого задания нужна геопозиция. Разрешите доступ в настройках браузера и попробуйте снова.'
              : 'На этом квесте фотографии принимаются только внутри игрового поля — разрешите доступ к геопозиции.'
            : 'Не удалось определить местоположение. Выйдите на открытое место и повторите.',
        );
        return;
      }
      location = result;
    }

    const result = await uploadSubmission({
      taskId,
      idempotencyKey,
      blob: prepared.blob,
      contentType: prepared.contentType,
      location,
      onProgress: (s) => setStage(STAGE_TEXT[s] ?? ''),
    });

    setStage('');

    if (result.ok) {
      await deleteDraft(taskId);
      releasePreview();
      setPhase('done');
      // Страница перерисуется с новым статусом отправки.
      router.refresh();
      return;
    }

    await markDraftFailed(taskId, result.error ?? 'unknown');
    setError(result.message ?? 'Не удалось отправить фотографию.');
    setPhase('error');
  }

  function reset() {
    releasePreview();
    setPreview(null);
    setPrepared(null);
    setIdempotencyKey('');
    setError(null);
    setRestored(false);
    setPhase('idle');
    void deleteDraft(taskId);
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="strong" icon="✓" role="status">
          Фото загружено и отправлено на проверку. Можно продолжать квест.
        </Notice>
        <Button variant="secondary" onClick={() => router.push('/tasks')}>
          К списку заданий
        </Button>
      </div>
    );
  }

  const busy = phase === 'uploading' || phase === 'preparing';

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {restored && phase === 'ready' && (
        <Notice icon="◍">
          Эта фотография осталась с прошлой попытки — отправка не завершилась. Можно отправить её
          снова или выбрать другую.
        </Notice>
      )}

      {error && <ErrorNotice>{error}</ErrorNotice>}

      {preview && (
        <figure className="flex flex-col gap-2">
          {/* Предпросмотр — локальный blob, next/image здесь не нужен. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Выбранная фотография"
            className="w-full border border-hairline object-cover"
          />
          {prepared && (
            <figcaption className="text-caption text-muted">
              После сжатия: {formatBytes(prepared.bytes)}
              {prepared.ratio > 1.1 && ` — меньше исходного в ${prepared.ratio.toFixed(1)} раза`}
            </figcaption>
          )}
        </figure>
      )}

      {busy && (
        <p className="text-body text-muted" role="status" aria-live="polite">
          {stage || 'Обрабатываем…'}
        </p>
      )}

      {phase === 'idle' || phase === 'error' ? (
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            fullWidth
            onClick={() => cameraInput.current?.click()}
            disabled={attemptsLeft <= 0}
          >
            Сделать фото
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => galleryInput.current?.click()}
            disabled={attemptsLeft <= 0}
          >
            Выбрать из галереи
          </Button>
        </div>
      ) : null}

      {phase === 'ready' && (
        <div className="flex flex-col gap-3">
          <Button size="lg" fullWidth onClick={() => void handleSend()}>
            Отправить на проверку
          </Button>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => cameraInput.current?.click()}
              className={cn('flex-1')}
            >
              Переснять
            </Button>
            <Button variant="ghost" fullWidth onClick={reset} className="flex-1">
              Отменить
            </Button>
          </div>
        </div>
      )}

      {(requireLocation || areaEnforced) && (
        <p className="text-caption text-muted">
          <span aria-hidden="true">◎ </span>
          {requireLocation
            ? 'Задание привязано к месту: при отправке браузер спросит разрешение на геопозицию.'
            : 'Фотографии принимаются только внутри игрового поля: при отправке браузер спросит разрешение на геопозицию.'}
        </p>
      )}
    </div>
  );
}
