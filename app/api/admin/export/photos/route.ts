import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKETS, createSignedUrls } from '@/lib/storage';
import { photoFileName, uniqueName } from '@/lib/export/photo-name';
import type { SubmissionStatus } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Список фотографий для скачивания архивом.
 *
 * Маршрут отдаёт не файлы, а подписанные ссылки на них, и это
 * главное решение здесь.
 *
 * Собрать zip на сервере кажется проще, но именно этого делать
 * нельзя: сто мегабайт нужно сначала скачать из хранилища в
 * функцию, потом отдать браузеру, и всё это внутри лимита времени
 * serverless-функции. Упрёшься в лимит — браузер получит оборванный
 * архив, который выглядит как файл и не открывается. Хуже отказа.
 *
 * Поэтому функция делает только то, что быстро: спрашивает у базы
 * список и просит у хранилища ссылки. Скачивает и пакует браузер
 * организатора — у него нет ни лимита времени, ни лишнего звена в
 * середине, а прогресс видно вживую.
 */

/**
 * Связь называется по колонке, а не по таблице, и это обязательно.
 *
 * Между `submissions` и `tasks` две дороги: отправка ссылается на
 * задание через `task_id`, а задание на победившую отправку — через
 * `claimed_submission_id`. От безымянного `tasks(...)` PostgREST
 * отказывается: он не знает, какую из двух иметь в виду, и весь
 * запрос падает. Форма `tasks:task_id (...)` снимает вопрос.
 */
const SELECT =
  'id,status,attempt_number,image_path,submitted_at,' +
  'teams:team_id (name),tasks:task_id (number, title)';

interface Row {
  id: string;
  status: SubmissionStatus;
  attempt_number: number;
  image_path: string | null;
  submitted_at: string;
  teams: { name: string } | null;
  tasks: { number: number; title: string } | null;
}

export async function GET(request: Request) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const event = await getCurrentEvent();
  if (!event) {
    return NextResponse.json({ ok: false, error: 'event_not_found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const acceptedOnly = searchParams.get('scope') === 'accepted';

  let query = supabaseAdmin()
    .from('submissions')
    .select(SELECT)
    .eq('event_id', event.id)
    .not('image_path', 'is', null)
    .order('submitted_at', { ascending: true });

  if (acceptedOnly) query = query.eq('status', 'accepted');

  const { data, error } = await query;

  if (error) {
    // Причина уходит и в журнал, и в ответ. Маршрут админский,
    // прятать от организатора нечего, а «не удалось» без причины
    // означает ещё один заход в логи вместо ответа на экране.
    console.error('export/photos:', error.message);
    return NextResponse.json(
      { ok: false, error: 'database_error', detail: error.message },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as Row[];
  const paths = rows.map((row) => row.image_path).filter((path): path is string => Boolean(path));

  // Час: столько живёт ссылка, и столько же в худшем случае идёт
  // скачивание сотни мегабайт на медленном канале. Меньше — и
  // архив оборвётся на середине.
  const signed = await createSignedUrls(BUCKETS.submissions, paths, 3600);

  const taken = new Set<string>();

  const files = rows.flatMap((row) => {
    const url = row.image_path ? signed.get(row.image_path) : null;
    if (!url) return [];

    const name = uniqueName(
      photoFileName({
        team: row.teams?.name,
        taskNumber: row.tasks?.number,
        taskTitle: row.tasks?.title,
        status: row.status,
        attemptNumber: row.attempt_number,
        imagePath: row.image_path,
      }),
      taken,
    );

    return [{ url, name }];
  });

  const missing = rows.length - files.length;

  return NextResponse.json({
    ok: true,
    files,
    missing,
    archiveName: `фотографии-${event.slug ?? 'квест'}.zip`,
  });
}
