'use client';

import { useActionState } from 'react';
import { commitImportAction, previewImportAction, type ImportState } from '@/actions/import';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';
import { Checkbox, Field, TextArea } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { Tag } from '@/components/ui/status-badge';
import { formatIssuesCsv } from '@/lib/import/tasks';
import { TASK_CATEGORY_TEXT, tasksWord } from '@/lib/messages';

const INITIAL: ImportState = { stage: 'idle', ok: false };

/**
 * Импорт заданий: разбор, предпросмотр, подтверждение.
 *
 * Пока в файле есть хоть одна ошибка, кнопка подтверждения не
 * появляется. Частичный импорт не предусмотрен намеренно.
 */
export function ImportPanel({ eventId }: { eventId: string }) {
  const [preview, previewAction, previewPending] = useActionState(previewImportAction, INITIAL);
  const [commit, commitAction, commitPending] = useActionState(commitImportAction, INITIAL);

  // После успешного импорта показываем только итог.
  if (commit.stage === 'done' && commit.ok) {
    return (
      <Notice tone="strong" icon="✓" role="status">
        {commit.message} Задания уже видны в разделе «Задания».
      </Notice>
    );
  }

  const state = commit.stage === 'preview' ? commit : preview;

  function downloadIssues() {
    if (!state.issues || state.issues.length === 0) return;
    const blob = new Blob([`﻿${formatIssuesCsv(state.issues)}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ошибки-импорта.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ═══ Шаг 1: файл ══════════════════════════════════ */}
      <form action={previewAction} className="flex flex-col gap-5">
        <input type="hidden" name="eventId" value={eventId} />

        <Field
          label="Файл JSON или CSV"
          htmlFor="file"
          hint="Формат определяется по расширению. Максимум 2 МБ."
        >
          <input
            id="file"
            name="file"
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="w-full border border-hairline bg-panel px-4 py-3 text-body file:mr-4 file: file:border-0 file:bg-ink file:px-4 file:py-2 file:text-caption file:text-canvas"
          />
        </Field>

        <Field
          label="…или вставьте содержимое"
          htmlFor="content"
          hint="Если файла под рукой нет — можно вставить текст напрямую."
        >
          <TextArea id="content" name="content" rows={6} placeholder='[{"number": 1, ...}]' />
        </Field>

        <Button type="submit" variant="secondary" disabled={previewPending} className="self-start">
          {previewPending ? 'Разбираем…' : 'Проверить файл'}
        </Button>
      </form>

      {/* ═══ Шаг 2: результат разбора ═════════════════════ */}
      {state.stage === 'preview' && (
        <div className="flex flex-col gap-5 border-t border-hairline pt-6">
          <Notice tone={state.ok ? 'neutral' : 'strong'} icon={state.ok ? '✓' : '!'} role="status">
            {state.message}
          </Notice>

          {state.issues && state.issues.length > 0 && (
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-body-lg">Ошибки ({state.issues.length})</h3>
                <Button type="button" variant="secondary" size="sm" onClick={downloadIssues}>
                  Скачать отчёт
                </Button>
              </div>

              <div className="scroll-x">
                <table className="w-full min-w-[520px] border-collapse text-caption">
                  <thead>
                    <tr className="border-b border-hairline text-left text-muted">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Строка
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Задание
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Поле
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Что не так
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.issues.slice(0, 60).map((issue, index) => (
                      <tr key={index} className="border-b border-hairline last:border-0">
                        <td className="py-2 pr-3 tabular-nums">{issue.row}</td>
                        <td className="py-2 pr-3 tabular-nums">{issue.taskNumber ?? '—'}</td>
                        <td className="py-2 pr-3 font-mono">{issue.field}</td>
                        <td className="py-2">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {state.issues.length > 60 && (
                <p className="text-caption text-muted">
                  Показаны первые 60. Полный список — в скачанном отчёте.
                </p>
              )}
            </Card>
          )}

          {state.items && state.items.length > 0 && (
            <Card className="flex flex-col gap-3 p-5">
              <h3 className="text-body-lg">
                Разобрано: {state.items.length} {tasksWord(state.items.length)}
              </h3>

              <div className="scroll-x max-h-80 overflow-y-auto">
                <table className="w-full min-w-[560px] border-collapse text-caption">
                  <thead className="sticky top-0 bg-panel">
                    <tr className="border-b border-hairline text-left text-muted">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        №
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Название
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Категория
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Баллы
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Проверка
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.items.map((item) => (
                      <tr key={item.number} className="border-b border-hairline last:border-0">
                        <td className="py-2 pr-3 tabular-nums">{item.number}</td>
                        <td className="py-2 pr-3">{item.title}</td>
                        <td className="py-2 pr-3">{TASK_CATEGORY_TEXT[item.category]}</td>
                        <td className="py-2 pr-3 tabular-nums">{item.points}</td>
                        <td className="py-2">{item.validationMode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {state.existing !== undefined && state.existing > 0 && (
                <p className="text-caption text-muted">
                  Сейчас в мероприятии {state.existing} {tasksWord(state.existing)}. Задания с
                  совпадающими номерами будут перезаписаны.
                </p>
              )}
            </Card>
          )}

          {/* ═══ Шаг 3: подтверждение ═══════════════════════ */}
          {state.ok && state.content && (
            <form action={commitAction} className="flex flex-col gap-4">
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="content" value={state.content} />
              <input type="hidden" name="format" value={state.format ?? 'json'} />

              <div className=" border border-hairline bg-panel p-4">
                <Checkbox
                  name="replace"
                  label="Заменить существующие задания"
                  description="Удалит те задания, по которым ещё нет ни одной отправки. Задания с отправками останутся."
                />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={commitPending}>
                  {commitPending
                    ? 'Импортируем…'
                    : `Импортировать ${state.items?.length ?? 0} заданий`}
                </Button>
                <Tag>всё или ничего</Tag>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
