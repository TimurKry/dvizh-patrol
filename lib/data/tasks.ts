import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BUCKETS, createSignedUrls } from '@/lib/storage';
import { asAreaPolygon, type PolygonRing } from '@/lib/geo';
import type {
  HandCard,
  ImageFraming,
  SubmissionRow,
  SubmissionStatus,
  TaskReferenceImageRow,
  TaskRow,
} from '@/types/database';

/**
 * Задания глазами конкретной команды.
 *
 * К каждому заданию добавляется состояние: что уже отправлено,
 * сколько попыток осталось, можно ли отправлять сейчас. Считать
 * это в компоненте нельзя — правила должны быть в одном месте
 * и совпадать с тем, что проверит база.
 *
 * Команда видит не весь пул, а руку из шести карточек. Раздаёт
 * её база (`get_team_hand`), и она же следит, чтобы в руке всегда
 * было по два задания каждого типа. Отдавать сюда весь список
 * нельзя: он и есть содержание квеста.
 */

export type TaskState =
  | 'available'
  | 'in_review'
  | 'accepted'
  | 'rejected'
  | 'attempts_exhausted'
  /** Задание успела забрать другая команда — оно больше не играет. */
  | 'claimed_by_other';

export interface TaskWithState {
  task: TaskRow;
  state: TaskState;
  /** Последняя отправка команды по заданию. */
  latestSubmission: SubmissionRow | null;
  attemptsUsed: number;
  attemptsLeft: number;
  canSubmit: boolean;
  referenceImageUrl: string | null;
  /** Как первая картинка ложится в кадр карточки. */
  referenceFraming: ImageFraming | null;
}

/** Статусы, которые тратят попытку (совпадает с логикой в SQL). */
const ATTEMPT_STATUSES: SubmissionStatus[] = [
  'pending',
  'checking',
  'accepted',
  'manual_review',
  'rejected',
];

/**
 * Рука команды: шесть заданий и их состояние.
 *
 * `taskIds` ограничивает выборку тем, что реально лежит на руке
 * или уже трогалось командой. Без этого ограничения страница
 * заданий вернула бы весь пул, и весь смысл руки пропал бы.
 */
export async function getTeamHand(
  eventId: string,
  teamId: string,
  options: { eventLive: boolean },
): Promise<TaskWithState[]> {
  const { data, error } = await supabaseAdmin().rpc('get_team_hand', { p_team_id: teamId });

  if (error) return [];

  const hand = ((data as { hand?: HandCard[] } | null)?.hand ?? []) as HandCard[];
  if (hand.length === 0) return [];

  const items = await getTasksForTeam(eventId, teamId, options, {
    taskIds: hand.map((card) => card.taskId),
  });

  // Порядок раздачи, а не номера заданий: карточка, взятая в руку
  // раньше, стоит левее и не прыгает при пополнении.
  const order = new Map(hand.map((card, index) => [card.taskId, index]));
  return items.sort((a, b) => (order.get(a.task.id) ?? 0) - (order.get(b.task.id) ?? 0));
}

/**
 * Задание без скрытых критериев.
 *
 * `TaskHand` и карточки — клиентские компоненты, и всё, что в них
 * попадает, уезжает в браузер целиком: колонка, добавленная в
 * таблицу, оказывается в разметке страницы, даже если её нигде не
 * рисуют. Для скрытых критериев это означало бы ответы к загадкам,
 * лежащие в исходном коде страницы.
 *
 * Поэтому наружу задание отдаётся только через эту функцию. Модель
 * читает скрытые критерии своим запросом, на сервере
 * (`lib/ai/worker.ts`), и туда они и попадают.
 */
function publicTask(task: TaskRow): TaskRow {
  const { hidden_criteria: _hidden, ...rest } = task;
  return rest as TaskRow;
}

export async function getTasksForTeam(
  eventId: string,
  teamId: string,
  options: { eventLive: boolean },
  scope: { taskIds?: string[] } = {},
): Promise<TaskWithState[]> {
  const db = supabaseAdmin();

  let tasksQuery = db
    .from('tasks')
    .select('*')
    .eq('event_id', eventId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('number', { ascending: true });

  if (scope.taskIds) {
    if (scope.taskIds.length === 0) return [];
    tasksQuery = tasksQuery.in('id', scope.taskIds);
  }

  const [tasksResult, submissionsResult, referencesResult] = await Promise.all([
    tasksQuery,
    db
      .from('submissions')
      .select('*')
      .eq('team_id', teamId)
      .order('submitted_at', { ascending: false }),
    db.from('task_reference_images').select('*').order('sort_order', { ascending: true }),
  ]);

  const tasks = ((tasksResult.data as TaskRow[] | null) ?? []).map(publicTask);
  const submissions = (submissionsResult.data as SubmissionRow[] | null) ?? [];
  const references = (referencesResult.data as TaskReferenceImageRow[] | null) ?? [];

  // Первое эталонное изображение на задание — оно и попадает на
  // карточку, вместе со своей рамкой.
  const referenceByTask = new Map<string, TaskReferenceImageRow>();
  for (const ref of references) {
    if (!referenceByTask.has(ref.task_id)) referenceByTask.set(ref.task_id, ref);
  }

  const signedReferences = await createSignedUrls(
    BUCKETS.references,
    [...referenceByTask.values()].map((ref) => ref.image_path),
  );

  const byTask = new Map<string, SubmissionRow[]>();
  for (const submission of submissions) {
    const list = byTask.get(submission.task_id) ?? [];
    list.push(submission);
    byTask.set(submission.task_id, list);
  }

  const now = Date.now();

  return tasks.map((task) => {
    const taskSubmissions = byTask.get(task.id) ?? [];
    const attemptsUsed = taskSubmissions.filter((s) => ATTEMPT_STATUSES.includes(s.status)).length;
    const attemptsLeft = Math.max(0, task.max_attempts - attemptsUsed);

    const accepted = taskSubmissions.find((s) => s.status === 'accepted');
    const inReview = taskSubmissions.find((s) =>
      ['pending', 'checking', 'manual_review'].includes(s.status),
    );
    const rejected = taskSubmissions.find((s) => s.status === 'rejected');

    const withinWindow =
      (!task.available_from || new Date(task.available_from).getTime() <= now) &&
      (!task.available_until || new Date(task.available_until).getTime() >= now);

    // Захват сильнее всех прочих состояний: если задание забрала
    // другая команда, ни попытки, ни проверка уже ничего не решают.
    const claimedByOther = task.claimed_by_team_id !== null && task.claimed_by_team_id !== teamId;

    let state: TaskState = 'available';
    if (claimedByOther) state = 'claimed_by_other';
    else if (accepted) state = 'accepted';
    else if (inReview) state = 'in_review';
    else if (attemptsLeft === 0) state = 'attempts_exhausted';
    else if (rejected) state = 'rejected';

    const reference = referenceByTask.get(task.id);

    return {
      task,
      state,
      latestSubmission: taskSubmissions[0] ?? null,
      attemptsUsed,
      attemptsLeft,
      canSubmit:
        options.eventLive &&
        withinWindow &&
        !claimedByOther &&
        !accepted &&
        !inReview &&
        attemptsLeft > 0,
      referenceImageUrl: reference ? (signedReferences.get(reference.image_path) ?? null) : null,
      referenceFraming: reference
        ? {
            fit: reference.fit,
            focusX: Number(reference.focus_x),
            focusY: Number(reference.focus_y),
          }
        : null,
    };
  });
}

/**
 * Одно задание для страницы задания.
 *
 * Доступ ограничен рукой и историей команды: иначе страница
 * `/tasks/<uuid>` работала бы как способ прочитать любое задание
 * пула, минуя раздачу.
 */
export async function getTaskForTeam(
  eventId: string,
  teamId: string,
  taskId: string,
  options: { eventLive: boolean },
): Promise<TaskWithState | null> {
  const db = supabaseAdmin();

  const [handResult, touchedResult] = await Promise.all([
    db.from('team_hand').select('task_id').eq('team_id', teamId).eq('task_id', taskId),
    db.from('submissions').select('id').eq('team_id', teamId).eq('task_id', taskId).limit(1),
  ]);

  const inHand = (handResult.data as Array<{ task_id: string }> | null)?.length ?? 0;
  const touched = (touchedResult.data as Array<{ id: string }> | null)?.length ?? 0;
  if (inHand === 0 && touched === 0) return null;

  const all = await getTasksForTeam(eventId, teamId, options, { taskIds: [taskId] });
  return all[0] ?? null;
}

/** Все эталонные изображения задания — для его страницы. */
export async function getTaskReferences(
  taskId: string,
): Promise<Array<{ id: string; url: string; caption: string | null; framing: ImageFraming }>> {
  const { data } = await supabaseAdmin()
    .from('task_reference_images')
    .select('*')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true });

  const rows = (data as TaskReferenceImageRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const signed = await createSignedUrls(
    BUCKETS.references,
    rows.map((r) => r.image_path),
  );

  return rows
    .map((row) => ({
      id: row.id,
      url: signed.get(row.image_path) ?? '',
      caption: row.caption,
      framing: {
        fit: row.fit,
        focusX: Number(row.focus_x),
        focusY: Number(row.focus_y),
      } satisfies ImageFraming,
    }))
    .filter((r) => r.url !== '');
}

// ═══ Отправки команды ══════════════════════════════════════════

export interface SubmissionWithTask {
  submission: SubmissionRow;
  task: TaskRow | null;
  previewUrl: string | null;
}

export async function getTeamSubmissions(teamId: string): Promise<SubmissionWithTask[]> {
  const db = supabaseAdmin();

  const { data } = await db
    .from('submissions')
    .select('*, tasks:task_id (*)')
    .eq('team_id', teamId)
    // Черновики и незавершённые загрузки участнику показывать нечего.
    .not('status', 'in', '("draft","uploading")')
    .order('submitted_at', { ascending: false });

  const rows = (data as Array<SubmissionRow & { tasks: TaskRow | null }> | null) ?? [];

  // Списки открывают превью, а не оригиналы: на мобильном
  // интернете разница принципиальная.
  const previewPaths = rows.map((r) => r.preview_path).filter((p): p is string => Boolean(p));
  const signed = await createSignedUrls(BUCKETS.previews, previewPaths);

  return rows.map((row) => {
    const { tasks, ...submission } = row;
    return {
      submission: submission as SubmissionRow,
      task: tasks,
      previewUrl: row.preview_path ? (signed.get(row.preview_path) ?? null) : null,
    };
  });
}

export async function getTeamSubmission(
  teamId: string,
  submissionId: string,
): Promise<(SubmissionWithTask & { imageUrl: string | null }) | null> {
  const db = supabaseAdmin();

  const { data } = await db
    .from('submissions')
    .select('*, tasks:task_id (*)')
    .eq('team_id', teamId)
    .eq('id', submissionId)
    .maybeSingle();

  if (!data) return null;

  const row = data as SubmissionRow & { tasks: TaskRow | null };
  const { tasks, ...submission } = row;

  const [previewSigned, imageSigned] = await Promise.all([
    row.preview_path ? createSignedUrls(BUCKETS.previews, [row.preview_path]) : null,
    row.image_path ? createSignedUrls(BUCKETS.submissions, [row.image_path]) : null,
  ]);

  return {
    submission: submission as SubmissionRow,
    task: tasks,
    previewUrl: row.preview_path ? (previewSigned?.get(row.preview_path) ?? null) : null,
    imageUrl: row.image_path ? (imageSigned?.get(row.image_path) ?? null) : null,
  };
}

// ═══ Витрина лендинга ══════════════════════════════════════════

/** Карточка-пример на лендинге. Всё уже подписано и готово к отрисовке. */
export interface LandingExample {
  id: string;
  slot: number;
  number: number;
  title: string;
  text: string | null;
  points: number;
  cardType: TaskRow['card_type'];
  mapMode: TaskRow['map_mode'];
  latitude: number | null;
  longitude: number | null;
  ring: PolygonRing | null;
  imageUrl: string | null;
  imageBadge: string | null;
  framing: ImageFraming | null;
}

/**
 * Задания, выбранные для витрины лендинга.
 *
 * Отдаёт только то, у чего проставлен слот. Остальной пул наружу
 * не уходит: лендинг открыт всем, и запрос «дай все задания»
 * здесь означал бы «раздай ответы» — ровно то, от чего защищает
 * `get_team_hand` на боевых экранах.
 *
 * `active` не проверяется намеренно. Выключенное задание в руки не
 * раздаётся, и это законный способ сделать карточку специально для
 * витрины: показать, ничего не раскрывая из боевого пула.
 */
export async function getLandingExamples(eventId: string): Promise<LandingExample[]> {
  const db = supabaseAdmin();

  const { data } = await db
    .from('tasks')
    .select('*')
    .eq('event_id', eventId)
    .not('landing_slot', 'is', null)
    .order('landing_slot', { ascending: true });

  const tasks = ((data as TaskRow[] | null) ?? []).map(publicTask);
  if (tasks.length === 0) return [];

  const { data: imageData } = await db
    .from('task_reference_images')
    .select('*')
    .in(
      'task_id',
      tasks.map((task) => task.id),
    )
    .order('sort_order', { ascending: true });

  const images = (imageData as TaskReferenceImageRow[] | null) ?? [];
  const firstImage = new Map<string, TaskReferenceImageRow>();
  for (const image of images) {
    if (!firstImage.has(image.task_id)) firstImage.set(image.task_id, image);
  }

  const signed = await createSignedUrls(
    BUCKETS.references,
    [...firstImage.values()].map((image) => image.image_path),
  );

  return tasks.map((task) => {
    const image = firstImage.get(task.id);
    const url = image ? (signed.get(image.image_path) ?? null) : null;

    return {
      id: task.id,
      slot: task.landing_slot ?? 0,
      number: task.number,
      title: task.title,
      text: task.short_description,
      points: task.points,
      cardType: task.card_type,
      mapMode: task.map_mode,
      latitude: task.latitude,
      longitude: task.longitude,
      ring: asAreaPolygon(task.area_polygon)?.coordinates[0] ?? null,
      imageUrl: url,
      imageBadge: image?.caption ?? task.image_caption,
      framing: image
        ? { fit: image.fit, focusX: Number(image.focus_x), focusY: Number(image.focus_y) }
        : null,
    };
  });
}
