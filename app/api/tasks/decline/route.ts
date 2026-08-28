import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTeamSession } from '@/lib/session/team-session';
import { callRpc } from '@/lib/supabase/admin';
import { declineTaskSchema } from '@/lib/validation/schemas';
import { errorMessage } from '@/lib/messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Вернуть карточку в колоду.
 *
 * Команда берётся из cookie, а не из тела запроса: иначе отказ
 * стал бы способом чистить чужие руки. Задание проверяется на
 * сервере — оно должно лежать на руке именно этой команды.
 *
 * Вся логика в `decline_task`: отказ, исключение задания из
 * будущих раздач и добор руки идут одной транзакцией. Разложить
 * это на несколько запросов значит однажды получить руку из пяти
 * карт после оборвавшейся связи.
 */
export async function POST(request: Request) {
  const session = await getTeamSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', message: errorMessage('unauthorized') },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'validation_failed' }, { status: 400 });
  }

  const parsed = declineTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_failed',
        message: errorMessage('validation_failed'),
        issues: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  const limit = await checkRateLimit('declineTask', session.teamId);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', message: errorMessage('rate_limited') },
      { status: 429 },
    );
  }

  const result = await callRpc<{ declinedTaskId: string }>('decline_task', {
    p_team_id: session.teamId,
    p_task_id: parsed.data.taskId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, message: errorMessage(result.error) },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, declinedTaskId: result.data.declinedTaskId });
}
