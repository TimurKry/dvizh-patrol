'use client';

import { useActionState, useRef, useState } from 'react';
import {
  deleteTaskImageAction,
  uploadTaskImageAction,
  type AdminActionState,
} from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';

/**
 * Картинки задания.
 *
 * Живут отдельной формой, а не полем внутри редактора задания.
 * Причина простая: файл нельзя «набрать и сохранить вместе с
 * остальным». Если положить `<input type="file">` в общую форму,
 * то неудачная валидация номера или описания сбросит выбранный
 * файл, и организатор будет выбирать его заново — браузер не
 * восстанавливает содержимое файловых полей.
 *
 * Первая картинка попадает на карточку, остальные видно на
 * странице задания. Порядок задаётся временем загрузки.
 */

const INITIAL: AdminActionState = { ok: false };

export interface TaskImage {
  id: string;
  url: string;
  caption: string | null;
}

export function TaskImages({ taskId, images }: { taskId: string; images: TaskImage[] }) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadTaskImageAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteTaskImageAction, INITIAL);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const state = uploadState.message ? uploadState : deleteState;

  return (
    <div className="flex flex-col gap-4 border border-hairline bg-panel p-4">
      <div className="flex flex-col gap-1">
        <p className="signal-label text-micro text-signal">Картинки</p>
        <p className="text-caption text-muted">
          Первая попадает на карточку, остальные видно на странице задания. Для фото-повтора это
          эталон, для загадки — гравюра или картина по теме: главное, чтобы она не выдавала ответ.
        </p>
      </div>

      {state.message && (
        <Notice tone={state.ok ? 'neutral' : 'strong'} icon={state.ok ? 'accepted' : 'upload-failed'}>
          {state.message}
        </Notice>
      )}

      {images.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-2 border border-hairline p-2">
              {/* Пропорцию держит обёртка, а не сам снимок:
                  aspect-ratio на <img> с собственными размерами
                  браузер применяет не так, как ожидаешь, и
                  вертикальная картинка растягивает карточку. */}
              <div className="aspect-4/3 w-full overflow-hidden bg-canvas-deep">
                {/* Ссылка подписанная и живёт недолго — оптимизатору
                    next/image её кэшировать нечего. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="h-full w-full object-cover" />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-caption text-muted">
                  {index === 0 ? 'На карточке' : `№${index + 1}`}
                  {image.caption ? ` · ${image.caption}` : ''}
                </span>

                <form action={deleteAction}>
                  <input type="hidden" name="imageId" value={image.id} />
                  <button
                    type="submit"
                    className="tap-target flex items-center px-2 text-caption text-muted hover:text-signal"
                  >
                    <span className="sr-only">Удалить картинку {index + 1}</span>
                    <Icon name="remove" size={16} />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={uploadAction} className="flex flex-col gap-3">
        <input type="hidden" name="taskId" value={taskId} />

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            Выбрать файл
          </Button>
          <span className="text-caption text-muted">
            {fileName || 'JPEG, PNG или WebP, до 10 МБ'}
          </span>
        </div>

        <Field
          label="Подпись под этой картинкой"
          htmlFor="imageOwnCaption"
          hint="Необязательно. Пусто — возьмётся общая плашка задания."
        >
          <TextInput id="imageOwnCaption" name="caption" maxLength={140} />
        </Field>

        <Button type="submit" disabled={uploading || !fileName} className="self-start">
          {uploading ? 'Загружаем…' : 'Загрузить картинку'}
        </Button>
      </form>
    </div>
  );
}
