import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth/admin';
import { getCurrentEvent } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { csvResponse, isoDate, toCsv } from '@/lib/export/csv';
import {
  REVIEW_REASON_TEXT,
  SUBMISSION_STATUS_TEXT,
  TASK_CATEGORY_TEXT,
  TEAM_STATUS_TEXT,
} from '@/lib/messages';
import type {
  ConsentRow,
  ScoreTransactionRow,
  SubmissionRow,
  TaskRow,
  TeamMemberRow,
  TeamRow,
} from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Выгрузка результатов.
 *
 * Подписанные ссылки на фотографии в CSV не кладутся: они живут
 * час, а таблица остаётся у организатора надолго. Вместо них —
 * путь в хранилище, по которому файл всегда можно достать.
 */

const KINDS = [
  'teams',
  'members',
  'tasks',
  'submissions',
  'leaderboard',
  'score-transactions',
  'consents',
] as const;

type Kind = (typeof KINDS)[number];

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const admin = await getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) {
    return NextResponse.json({ ok: false, error: 'unknown_export' }, { status: 404 });
  }

  const event = await getCurrentEvent();
  if (!event) {
    return NextResponse.json({ ok: false, error: 'event_not_found' }, { status: 404 });
  }

  const db = supabaseAdmin();
  const tz = event.timezone;
  const stamp = new Date().toISOString().slice(0, 10);

  switch (kind as Kind) {
    case 'teams': {
      const { data } = await db
        .from('teams')
        .select('*')
        .eq('event_id', event.id)
        .order('created_at');
      const teams = (data as TeamRow[] | null) ?? [];

      const { data: scoreData } = await db.from('team_scores').select('*');
      const scores = new Map(
        (
          (scoreData as Array<{
            team_id: string;
            total_points: number;
            accepted_count: number;
          }> | null) ?? []
        ).map((s) => [s.team_id, s]),
      );

      return csvResponse(
        `команды-${stamp}.csv`,
        toCsv(
          [
            'название',
            'код',
            'капитан',
            'контакт',
            'статус',
            'оплата',
            'баллы',
            'принято_заданий',
            'создана',
            // Тестовые команды не убираем из выгрузки, но
            // помечаем: в таблице результатов их нет, а здесь
            // они с настоящими баллами и без пометки читались бы
            // как участники вечера.
            'для_тестов',
          ],
          teams.map((t) => [
            t.name,
            t.join_code,
            t.captain_name,
            t.contact ?? '',
            TEAM_STATUS_TEXT[t.status],
            t.payment_confirmed ? 'да' : 'нет',
            scores.get(t.id)?.total_points ?? 0,
            scores.get(t.id)?.accepted_count ?? 0,
            isoDate(t.created_at, tz),
            t.is_test ? 'да' : 'нет',
          ]),
        ),
      );
    }

    case 'members': {
      const { data } = await db
        .from('team_members')
        .select('*, teams:team_id (name, event_id)')
        .order('created_at');

      const rows =
        (data as Array<
          TeamMemberRow & { teams: { name: string; event_id: string } | null }
        > | null) ?? [];

      return csvResponse(
        `участники-${stamp}.csv`,
        toCsv(
          ['команда', 'участник', 'капитан', 'добавлен'],
          rows
            .filter((r) => r.teams?.event_id === event.id)
            .map((r) => [
              r.teams?.name ?? '',
              r.name,
              r.is_captain ? 'да' : 'нет',
              isoDate(r.created_at, tz),
            ]),
        ),
      );
    }

    case 'tasks': {
      const { data } = await db.from('tasks').select('*').eq('event_id', event.id).order('number');
      const tasks = (data as TaskRow[] | null) ?? [];

      return csvResponse(
        `задания-${stamp}.csv`,
        toCsv(
          [
            'number',
            'title',
            'shortDescription',
            'description',
            'points',
            'category',
            'difficulty',
            'validationMode',
            'criteria',
            'minimumPeople',
            'maxAttempts',
            'requireLocation',
            'latitude',
            'longitude',
            'radiusMeters',
            'active',
          ],
          tasks.map((t) => [
            t.number,
            t.title,
            t.short_description ?? '',
            t.description,
            t.points,
            t.category,
            t.difficulty,
            t.validation_mode,
            t.criteria.join(' | '),
            t.minimum_people,
            t.max_attempts,
            t.require_location ? 'true' : 'false',
            t.latitude ?? '',
            t.longitude ?? '',
            t.radius_meters ?? '',
            t.active ? 'true' : 'false',
          ]),
        ),
      );
    }

    case 'submissions': {
      const { data } = await db
        .from('submissions')
        .select('*, tasks:task_id (number, title, category), teams:team_id (name)')
        .eq('event_id', event.id)
        .order('submitted_at');

      const rows =
        (data as Array<
          SubmissionRow & {
            tasks: Pick<TaskRow, 'number' | 'title' | 'category'> | null;
            teams: { name: string } | null;
          }
        > | null) ?? [];

      return csvResponse(
        `отправки-${stamp}.csv`,
        toCsv(
          [
            'команда',
            'задание_номер',
            'задание',
            'категория',
            'статус',
            'попытка',
            'баллы',
            'причина_проверки',
            'уверенность',
            'похожа_на',
            'отправлено',
            'проверено',
            'комментарий',
            'путь_в_хранилище',
          ],
          rows.map((r) => [
            r.teams?.name ?? '',
            r.tasks?.number ?? '',
            r.tasks?.title ?? '',
            r.tasks ? (TASK_CATEGORY_TEXT[r.tasks.category] ?? r.tasks.category) : '',
            SUBMISSION_STATUS_TEXT[r.status].label,
            r.attempt_number,
            r.awarded_points,
            r.review_reason ? (REVIEW_REASON_TEXT[r.review_reason] ?? r.review_reason) : '',
            r.ai_confidence ?? '',
            r.duplicate_submission_id ?? '',
            isoDate(r.submitted_at, tz),
            isoDate(r.reviewed_at, tz),
            r.admin_comment ?? '',
            r.image_path ?? '',
          ]),
        ),
      );
    }

    case 'leaderboard': {
      const { data } = await db
        .from('leaderboard')
        .select('*')
        .eq('event_id', event.id)
        .order('position');

      const rows =
        (data as Array<{
          position: number;
          team_name: string;
          total_points: number;
          accepted_count: number;
          last_accepted_at: string | null;
        }> | null) ?? [];

      return csvResponse(
        `рейтинг-${stamp}.csv`,
        toCsv(
          ['место', 'команда', 'баллы', 'принято_заданий', 'последнее_принятое'],
          rows.map((r) => [
            r.position,
            r.team_name,
            r.total_points,
            r.accepted_count,
            isoDate(r.last_accepted_at, tz),
          ]),
        ),
      );
    }

    case 'score-transactions': {
      const { data } = await db
        .from('score_transactions')
        .select('*, teams:team_id (name)')
        .eq('event_id', event.id)
        .order('created_at');

      const rows =
        (data as Array<ScoreTransactionRow & { teams: { name: string } | null }> | null) ?? [];

      return csvResponse(
        `начисления-${stamp}.csv`,
        toCsv(
          ['время', 'команда', 'тип', 'баллы', 'причина', 'отправка', 'отменена'],
          rows.map((r) => [
            isoDate(r.created_at, tz),
            r.teams?.name ?? '',
            r.transaction_type,
            r.points,
            r.reason ?? '',
            r.submission_id ?? '',
            r.reversed_by_transaction_id ? 'да' : 'нет',
          ]),
        ),
      );
    }

    case 'consents': {
      const { data } = await db
        .from('consents')
        .select('*, teams:team_id (name, event_id)')
        .order('created_at');

      const rows =
        (data as Array<ConsentRow & { teams: { name: string; event_id: string } | null }> | null) ??
        [];

      return csvResponse(
        `согласия-${stamp}.csv`,
        toCsv(
          [
            'команда',
            'участник',
            'участие',
            'обработка_фото',
            'публикация_в_соцсетях',
            'версия_политики',
            'дата',
          ],
          rows
            .filter((r) => r.teams?.event_id === event.id)
            .map((r) => [
              r.teams?.name ?? '',
              r.member_name,
              r.participation_consent ? 'да' : 'нет',
              r.photo_processing_consent ? 'да' : 'нет',
              r.social_publication_consent ? 'да' : 'нет',
              r.policy_version,
              isoDate(r.created_at, tz),
            ]),
        ),
      );
    }
  }
}
