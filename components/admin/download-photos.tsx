'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/feedback';
import { buildZipParts } from '@/lib/export/zip';

/**
 * Скачивание всех фотографий одним архивом.
 *
 * Качает и пакует браузер, а не сервер. Причина в лимите времени
 * serverless-функции: сотню мегабайт она может не успеть провести
 * через себя, и организатор получит оборванный архив — файл,
 * который выглядит целым и не открывается. Здесь же ограничения
 * нет вовсе, а вместо ожидания вслепую видно, сколько скачано.
 *
 * Прогресс показывается по числу файлов, а не по байтам: размер
 * заранее неизвестен, а «37 из 125» понятнее любой полоски.
 */

interface FileLink {
  url: string;
  name: string;
}

type Phase = 'idle' | 'listing' | 'downloading' | 'packing' | 'done';

const CONCURRENCY = 4;

export function DownloadPhotos({ scope }: { scope?: 'accepted' }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setFailed([]);
    setDone(0);
    setPhase('listing');

    try {
      const response = await fetch(
        `/api/admin/export/photos${scope === 'accepted' ? '?scope=accepted' : ''}`,
      );

      if (!response.ok) {
        // Причину показываем на экране, а не только в консоли:
        // иначе «не удалось» отправляет организатора искать логи.
        const reason = await response
          .json()
          .then((body: { detail?: string; error?: string }) => body.detail ?? body.error)
          .catch(() => null);

        throw new Error(
          reason
            ? `Не удалось получить список фотографий: ${reason}`
            : 'Не удалось получить список фотографий.',
        );
      }

      const { files, archiveName } = (await response.json()) as {
        files: FileLink[];
        archiveName: string;
      };

      if (files.length === 0) {
        setError('Фотографий пока нет.');
        setPhase('idle');
        return;
      }

      setTotal(files.length);
      setPhase('downloading');

      const entries: Array<{ name: string; data: Uint8Array }> = [];
      const lost: string[] = [];
      let cursor = 0;

      // Своя очередь на четыре потока. Больше — упираемся в лимиты
      // хранилища и в канал; меньше — сотня файлов качается заметно
      // дольше, чем нужно.
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
          while (cursor < files.length) {
            const index = cursor;
            cursor += 1;
            const file = files[index]!;

            try {
              const photo = await fetch(file.url);
              if (!photo.ok) throw new Error(String(photo.status));

              entries[index] = {
                name: file.name,
                data: new Uint8Array(await photo.arrayBuffer()),
              };
            } catch {
              // Один недокачанный кадр не повод терять весь архив:
              // он попадёт в список пропусков, остальное соберётся.
              lost.push(file.name);
            }

            setDone((value) => value + 1);
          }
        }),
      );

      setPhase('packing');

      const parts = buildZipParts(entries.filter(Boolean));
      const blob = new Blob(parts as BlobPart[], { type: 'application/zip' });

      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = archiveName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Отзываем ссылку не сразу: Safari успевает начать скачивание
      // не мгновенно, и слишком быстрый revoke обрывает файл.
      setTimeout(() => URL.revokeObjectURL(href), 60_000);

      setFailed(lost);
      setPhase('done');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не получилось собрать архив.');
      setPhase('idle');
    }
  }

  const busy = phase === 'listing' || phase === 'downloading' || phase === 'packing';

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={start} disabled={busy}>
        {phase === 'listing' && 'Собираю список…'}
        {phase === 'downloading' && `Скачиваю ${done} из ${total}…`}
        {phase === 'packing' && 'Упаковываю…'}
        {(phase === 'idle' || phase === 'done') &&
          (scope === 'accepted' ? 'Скачать зачтённые' : 'Скачать все фотографии')}
      </Button>

      {phase === 'downloading' && (
        <div className="h-1 w-full bg-ink-wash" aria-hidden="true">
          <div
            className="h-full bg-ink transition-[width] duration-200"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {busy ? `Скачано ${done} из ${total}` : ''}
      </p>

      {phase === 'done' && failed.length === 0 && (
        <Notice icon="info">Архив собран и скачан.</Notice>
      )}

      {phase === 'done' && failed.length > 0 && (
        <Notice tone="strong" icon="rejected">
          Архив собран, но {failed.length} снимк{failed.length === 1 ? 'а' : 'ов'} скачать не
          удалось. Попробуйте ещё раз — ссылки выдаются заново.
        </Notice>
      )}

      {error && (
        <Notice tone="strong" icon="rejected">
          {error}
        </Notice>
      )}
    </div>
  );
}
