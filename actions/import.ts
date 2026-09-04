'use server';

import { revalidatePath } from 'next/cache';
import { audit, requireAdmin } from '@/lib/auth/admin';
import { parseTaskImport, toTaskRow, type ImportIssue } from '@/lib/import/tasks';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { TaskImportItem } from '@/lib/validation/schemas';

/**
 * Импорт заданий.
 *
 * Два шага: сначала предпросмотр, потом подтверждение. Между
 * ними ничего не сохраняется — файл разбирается заново, поэтому
 * подделать предпросмотр и протащить непроверенные данные нельзя.
 */

export interface ImportState {
  stage: 'idle' | 'preview' | 'done';
  ok: boolean;
  message?: string;
  issues?: ImportIssue[];
  items?: TaskImportItem[];
  total?: number;
  /** Содержимое файла — возвращаем, чтобы подтвердить тот же текст. */
  content?: string;
  format?: 'json' | 'csv';
  /** Сколько заданий уже есть в мероприятии. */
  existing?: number;
  imported?: number;
}

function detectFormat(name: string, content: string): 'json' | 'csv' {
  if (name.toLowerCase().endsWith('.csv')) return 'csv';
  if (name.toLowerCase().endsWith('.json')) return 'json';
  return content.trim().startsWith('[') ? 'json' : 'csv';
}

export async function previewImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();

  const file = formData.get('file');
  const pasted = String(formData.get('content') ?? '').trim();

  let content = pasted;
  let name = 'вставленный текст';

  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) {
      return { stage: 'idle', ok: false, message: 'Файл больше 2 МБ.' };
    }
    content = await file.text();
    name = file.name;
  }

  if (!content) {
    return { stage: 'idle', ok: false, message: 'Выберите файл или вставьте содержимое.' };
  }

  const format = detectFormat(name, content);
  const result = parseTaskImport(content, format);

  const eventId = String(formData.get('eventId') ?? '');
  const { count } = await supabaseAdmin()
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  return {
    stage: 'preview',
    ok: result.ok,
    issues: result.issues,
    items: result.items,
    total: result.total,
    content,
    format,
    existing: count ?? 0,
    message: result.ok
      ? `Файл разобран: ${result.items.length} заданий, ошибок нет.`
      : `Найдено ошибок: ${result.issues.length}. Импорт не выполнен.`,
  };
}

export async function commitImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const admin = await requireAdmin();

  const eventId = String(formData.get('eventId') ?? '');
  const content = String(formData.get('content') ?? '');
  const format = String(formData.get('format') ?? 'json') as 'json' | 'csv';
  const replace = formData.get('replace') === 'on';

  // Разбираем ещё раз: доверять предпросмотру нельзя, он пришёл
  // из формы и мог быть изменён.
  const result = parseTaskImport(content, format);

  if (!result.ok) {
    return {
      stage: 'preview',
      ok: false,
      issues: result.issues,
      items: result.items,
      total: result.total,
      content,
      format,
      message: 'В файле есть ошибки — импорт отменён целиком.',
    };
  }

  const db = supabaseAdmin();

  if (replace) {
    // Удаляем только те задания, по которым ещё нет отправок:
    // иначе пропали бы уже начисленные баллы.
    const { data: withSubmissions } = await db
      .from('submissions')
      .select('task_id')
      .eq('event_id', eventId);

    const protectedIds = new Set(
      ((withSubmissions as Array<{ task_id: string }> | null) ?? []).map((r) => r.task_id),
    );

    const { data: allTasks } = await db.from('tasks').select('id').eq('event_id', eventId);
    const removable = ((allTasks as Array<{ id: string }> | null) ?? [])
      .map((t) => t.id)
      .filter((id) => !protectedIds.has(id));

    if (removable.length > 0) {
      await db.from('tasks').delete().in('id', removable);
    }
  }

  const rows = result.items.map((item) => toTaskRow(item, eventId));

  // Одной операцией: либо приезжают все задания, либо ни одного.
  const { error, data } = await db
    .from('tasks')
    .upsert(rows, { onConflict: 'event_id,number' })
    .select('id');

  if (error) {
    return {
      stage: 'preview',
      ok: false,
      content,
      format,
      items: result.items,
      issues: [
        {
          row: 0,
          field: 'база',
          message: error.message,
        },
      ],
      message: 'База отклонила импорт. Ничего не изменено.',
    };
  }

  await audit({
    admin,
    action: 'tasks_imported',
    entityType: 'event',
    entityId: eventId,
    after: { imported: data?.length ?? 0, replace, format },
  });

  revalidatePath('/admin/tasks');
  revalidatePath('/tasks');
  revalidatePath('/');

  return {
    stage: 'done',
    ok: true,
    imported: data?.length ?? 0,
    message: `Импортировано заданий: ${data?.length ?? 0}.`,
  };
}
