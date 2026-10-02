'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isTeamColor, teamColorLabel } from '@/lib/team-colors';
import { isTeamAccess, teamAccessSpec } from '@/lib/team-access';
import { errorMessage } from '@/lib/messages';
import { asAreaPolygon } from '@/lib/geo';
import { audit, requireAdmin } from '@/lib/auth/admin';
import { allowedNextStatuses } from '@/lib/event-status';
import { fromZonedInput } from '@/lib/time';
import { runValidationWorker } from '@/lib/ai/worker';
import { env } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabaseServer } from '@/lib/supabase/server';
import { callRpc, supabaseAdmin } from '@/lib/supabase/admin';
import { revokeAllTeamSessions } from '@/lib/session/team-session';
import {
  adminLoginSchema,
  eventSettingsSchema,
  fieldErrors,
  reviewDecisionSchema,
  scoreAdjustmentSchema,
  taskSchema,
  taskValidationReport,
} from '@/lib/validation/schemas';
import { BUCKETS, extensionFor, referencePath } from '@/lib/storage';
import type { EventStatus, LeaderboardMode, TaskReferenceImageRow } from '@/types/database';

/**
 * Действия администратора.
 *
 * Каждое начинается с requireAdmin и заканчивается записью в
 * журнал. Проверка прав в компоненте не считается: серверное
 * действие вызывается по своему адресу и обязано защищаться само.
 */

export interface AdminActionState {
  ok: boolean;
  error?: string;
  message?: string;
  fields?: Record<string, string>;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateJoinCodes(count = 5): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    return code;
  });
}

// ═══ Вход ══════════════════════════════════════════════════════

export async function adminLoginAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = adminLoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  const limit = await checkRateLimit('adminLogin');
  if (!limit.allowed) {
    return { ok: false, error: 'rate_limited', message: 'Слишком много попыток. Подождите.' };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Не подсказываем, что именно неверно.
    return { ok: false, message: 'Неверный email или пароль.' };
  }

  // Аккаунт есть, но прав нет — сессию сразу закрываем.
  const { data: adminRow } = await supabaseAdmin()
    .from('admin_users')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (!adminRow) {
    await supabase.auth.signOut();
    return { ok: false, message: 'У этого аккаунта нет прав администратора.' };
  }

  await audit({
    admin: { userId: data.user.id, email: parsed.data.email, name: null },
    action: 'admin_login',
    entityType: 'admin',
    entityId: data.user.id,
  });

  redirect('/admin');
}

export async function adminLogoutAction(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

// ═══ Мероприятие ═══════════════════════════════════════════════

export async function updateEventAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');

  const parsed = eventSettingsSchema.safeParse({
    title: formData.get('title'),
    subtitle: formData.get('subtitle') ?? '',
    city: formData.get('city'),
    timezone: formData.get('timezone'),
    startsAt: formData.get('startsAt'),
    priceCents: Math.round(Number(formData.get('price') ?? 0) * 100),
    maxTeams: Number(formData.get('maxTeams') ?? 10),
    teamSize: Number(formData.get('teamSize') ?? 5),
    registrationOpen: formData.get('registrationOpen') === 'on',
    leaderboardMode: formData.get('leaderboardMode'),
    aiValidationEnabled: formData.get('aiValidationEnabled') === 'on',
    aiAcceptThreshold: Number(formData.get('aiAcceptThreshold') ?? 0.88),
    photoRetentionDays: formData.get('photoRetentionDays')
      ? Number(formData.get('photoRetentionDays'))
      : null,
    areaLatitude: optionalNumber(formData.get('areaLatitude')),
    areaLongitude: optionalNumber(formData.get('areaLongitude')),
    areaRadiusMeters: optionalNumber(formData.get('areaRadiusMeters')),
    areaEnforced: formData.get('areaEnforced') === 'on',
    endsAt: optionalText(formData.get('endsAt')),
    finishLatitude: optionalNumber(formData.get('finishLatitude')),
    finishLongitude: optionalNumber(formData.get('finishLongitude')),
    finishTitle: formData.get('finishTitle') ?? '',
    finishAddress: formData.get('finishAddress') ?? '',
    finishNote: formData.get('finishNote') ?? '',
    finishAt: optionalText(formData.get('finishAt')),
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  // Все три момента читаются в поясе мероприятия — в том самом,
  // который организатор только что мог и поменять.
  const moment = (local: string | null) =>
    local ? fromZonedInput(local, parsed.data.timezone) : null;

  const startsAt = moment(parsed.data.startsAt);
  if (!startsAt) {
    return {
      ok: false,
      error: 'validation_failed',
      message: 'Не разобрали дату старта. Проверьте поле и часовой пояс.',
      fields: { startsAt: 'Непонятная дата' },
    };
  }

  const db = supabaseAdmin();
  const { data: before } = await db.from('events').select('*').eq('id', eventId).maybeSingle();

  if (!before) return { ok: false, message: 'Мероприятие не найдено.' };

  // Лимит нельзя опустить ниже числа уже зарегистрированных команд:
  // иначе кто-то оказался бы «сверх лимита» задним числом.
  const { count } = await db
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('status', 'cancelled');

  if ((count ?? 0) > parsed.data.maxTeams) {
    return {
      ok: false,
      message: `Уже зарегистрировано ${count} команд — лимит нельзя опустить до ${parsed.data.maxTeams}.`,
    };
  }

  const { error } = await db
    .from('events')
    .update({
      title: parsed.data.title,
      subtitle: parsed.data.subtitle || null,
      city: parsed.data.city,
      timezone: parsed.data.timezone,
      // Поле формы — время в поясе мероприятия, а не в поясе
      // сервера. Пока это читалось через `new Date(...)`, каждое
      // сохранение сдвигало дату на смещение пояса: три нажатия
      // «Сохранить» подряд уводили старт на шесть часов.
      starts_at: startsAt,
      price_cents: parsed.data.priceCents,
      max_teams: parsed.data.maxTeams,
      team_size: parsed.data.teamSize,
      registration_open: parsed.data.registrationOpen,
      leaderboard_mode: parsed.data.leaderboardMode,
      ai_validation_enabled: parsed.data.aiValidationEnabled,
      ai_accept_threshold: parsed.data.aiAcceptThreshold,
      photo_retention_days: parsed.data.photoRetentionDays,
      area_latitude: parsed.data.areaLatitude,
      area_longitude: parsed.data.areaLongitude,
      area_radius_meters: parsed.data.areaRadiusMeters,
      area_enforced: parsed.data.areaEnforced,
      ends_at: moment(parsed.data.endsAt),
      finish_latitude: parsed.data.finishLatitude,
      finish_longitude: parsed.data.finishLongitude,
      finish_title: parsed.data.finishTitle || null,
      finish_address: parsed.data.finishAddress || null,
      finish_note: parsed.data.finishNote || null,
      finish_at: moment(parsed.data.finishAt),
    })
    .eq('id', eventId);

  if (error) return { ok: false, message: 'Не удалось сохранить настройки.' };

  const { data: after } = await db.from('events').select('*').eq('id', eventId).maybeSingle();

  await audit({
    admin,
    action: 'event_updated',
    entityType: 'event',
    entityId: eventId,
    before,
    after,
  });

  revalidatePath('/admin/event');
  revalidatePath('/');
  revalidatePath('/map');
  return { ok: true, message: 'Настройки сохранены.' };
}

/**
 * Пустое поле формы — это «не задано», а не ноль.
 *
 * `Number('')` возвращает 0, и координата 0,0 — настоящая точка
 * в Атлантике. Без этой проверки очистка поля молча переносила бы
 * квест в Гвинейский залив.
 */
/** Пустая строка из формы — это «не задано», а не пустая дата. */
function optionalText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function changeEventStatusAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');
  const next = String(formData.get('status') ?? '') as EventStatus;

  const db = supabaseAdmin();
  const { data: before } = await db.from('events').select('*').eq('id', eventId).maybeSingle();
  if (!before) return { ok: false, message: 'Мероприятие не найдено.' };

  const current = before.status as EventStatus;
  if (!allowedNextStatuses(current).includes(next)) {
    return {
      ok: false,
      message: `Переход «${current}» → «${next}» не разрешён.`,
    };
  }

  const patch: Record<string, unknown> = { status: next };

  // Переход в «Регистрацию» открывает набор. Раньше это были две
  // независимые ручки, и организатор, нажавший «Открыть
  // регистрацию», получал статус «Регистрация» с закрытым
  // набором — то есть страницу, которая всем отвечает «мест нет».
  // Отдельный флаг остаётся в настройках: закрыть набор, не меняя
  // статус, иногда нужно.
  if (next === 'registration') patch.registration_open = true;

  // Запуск квеста закрывает регистрацию: добирать команды на
  // ходу — почти всегда ошибка организатора.
  if (next === 'live' && current === 'registration') patch.registration_open = false;

  const { error } = await db.from('events').update(patch).eq('id', eventId);
  if (error) return { ok: false, message: 'Не удалось сменить статус.' };

  await audit({
    admin,
    action: `event_status_${next}`,
    entityType: 'event',
    entityId: eventId,
    before: { status: current },
    after: { status: next },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/event');
  revalidatePath('/');
  return { ok: true, message: `Статус изменён на «${next}».` };
}

// ═══ Рейтинг ═══════════════════════════════════════════════════

export async function setLeaderboardModeAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');
  const mode = String(formData.get('mode') ?? '') as LeaderboardMode;

  const result =
    mode === 'frozen'
      ? await callRpc<{ rows: number }>('freeze_leaderboard', { p_event_id: eventId })
      : await callRpc<{ mode: string }>('unfreeze_leaderboard', {
          p_event_id: eventId,
          p_mode: mode,
        });

  if (!result.ok) return { ok: false, message: 'Не удалось изменить режим рейтинга.' };

  await audit({
    admin,
    action: 'leaderboard_mode_changed',
    entityType: 'event',
    entityId: eventId,
    after: { mode },
  });

  revalidatePath('/admin/leaderboard');
  revalidatePath('/leaderboard');
  return { ok: true, message: 'Режим рейтинга обновлён.' };
}

// ═══ Команды ═══════════════════════════════════════════════════

export async function updateTeamAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const teamId = String(formData.get('teamId') ?? '');
  const action = String(formData.get('action') ?? '');

  const db = supabaseAdmin();
  const { data: before } = await db.from('teams').select('*').eq('id', teamId).maybeSingle();
  if (!before) return { ok: false, message: 'Команда не найдена.' };

  let patch: Record<string, unknown> = {};
  let message = '';

  switch (action) {
    case 'confirm_payment':
      patch = { payment_confirmed: true, status: 'confirmed' };
      message = 'Оплата подтверждена.';
      break;
    case 'revoke_payment':
      patch = { payment_confirmed: false, status: 'pending' };
      message = 'Подтверждение оплаты снято.';
      break;
    case 'cancel':
      patch = { status: 'cancelled' };
      message = 'Регистрация отменена, место освободилось.';
      break;
    case 'restore':
      patch = { status: 'pending' };
      message = 'Команда возвращена.';
      break;
    case 'rename': {
      const name = String(formData.get('name') ?? '').trim();
      if (name.length < 2) return { ok: false, message: 'Слишком короткое название.' };
      patch = { name };
      message = 'Название изменено.';
      break;
    }
    case 'set_size': {
      // Пусто — «как у всех»: команда возвращается к общему числу
      // из настроек мероприятия, а не получает жёсткую копию.
      const raw = String(formData.get('sizeLimit') ?? '').trim();
      if (raw === '') {
        patch = { size_limit: null };
        message = 'Размер команды снова общий.';
        break;
      }

      const size = Number(raw);
      if (!Number.isInteger(size) || size < 1 || size > 6) {
        return { ok: false, message: 'Размер команды — целое число от 1 до 6.' };
      }

      // Опустить потолок ниже уже вошедших нельзя: лишние люди
      // иначе оказались бы «сверх лимита» задним числом, а
      // выгонять их некому.
      const { count: members } = await db
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId);

      if ((members ?? 0) > size) {
        return {
          ok: false,
          message: `В команде уже ${members} участников — ниже этого числа потолок не опустить.`,
        };
      }

      patch = { size_limit: size };
      message = `Размер команды: ${size}.`;
      break;
    }
    case 'set_access': {
      const access = String(formData.get('access') ?? '');
      if (!isTeamAccess(access)) return { ok: false, message: 'Неизвестный режим доступа.' };

      // Через функцию, а не патчем: `is_test` и `full_pool`
      // связаны ограничением, порядок их обновления имеет
      // значение, и рука должна пересобраться под новый режим.
      const result = await callRpc<{ access: string; wipedSubmissions?: number }>(
        'set_team_access',
        { p_team_id: teamId, p_access: access },
      );

      if (!result.ok) {
        return { ok: false, message: errorMessage(result.error) };
      }

      // Смена доступа пишется в журнал наравне с остальными
      // действиями: команда, у которой зачёты не забирают задания
      // и которой не видно в рейтинге, — не мелочь, и вопрос
      // «кто и когда это включил» должен иметь ответ.
      await audit({
        admin,
        action: 'team_access_changed',
        entityType: 'team',
        entityId: teamId,
        before: { is_test: before.is_test, full_pool: before.full_pool },
        after: { access, wiped_submissions: result.data.wipedSubmissions ?? 0 },
      });

      revalidatePath('/admin/teams');
      revalidatePath(`/admin/teams/${teamId}`);

      // Про удалённые отправки говорим прямо: организатор нажал
      // «сделать обычной», а вместе с режимом ушла часть истории
      // команды. Молча такое не делают.
      const wiped = result.data.wipedSubmissions ?? 0;
      const wipedNote =
        wiped > 0
          ? ` Служебных отправок удалено: ${wiped} — вместе с баллами по ним.`
          : '';

      return {
        ok: true,
        message: `Доступ команды: ${teamAccessSpec(access).label.toLowerCase()}.${wipedNote}`,
      };
    }
    case 'set_color': {
      const color = String(formData.get('color') ?? '');
      if (!isTeamColor(color)) return { ok: false, message: 'Неизвестный цвет.' };
      patch = { color };
      message = `Цвет команды: ${teamColorLabel(color).toLowerCase()}.`;
      break;
    }
    case 'clear_color':
      patch = { color: null };
      message = 'Цвет снят — команда осталась без рубашки.';
      break;
    case 'regenerate_code': {
      const codes = generateJoinCodes(1);
      patch = { join_code: codes[0] };
      message = `Новый код: ${codes[0]}`;
      break;
    }
    case 'reset_sessions':
      await revokeAllTeamSessions(teamId);
      await audit({
        admin,
        action: 'team_sessions_reset',
        entityType: 'team',
        entityId: teamId,
      });
      revalidatePath(`/admin/teams/${teamId}`);
      return { ok: true, message: 'Все сессии команды отозваны.' };
    default:
      return { ok: false, message: 'Неизвестное действие.' };
  }

  // Возврат команды не должен пробивать лимит мероприятия.
  if (action === 'restore') {
    const { data: event } = await db
      .from('events')
      .select('max_teams')
      .eq('id', before.event_id)
      .maybeSingle();
    const { count } = await db
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', before.event_id)
      .neq('status', 'cancelled');

    if (event && (count ?? 0) >= event.max_teams) {
      return { ok: false, message: 'Все места заняты — сначала освободите одно.' };
    }
  }

  const { error } = await db.from('teams').update(patch).eq('id', teamId);
  if (error) {
    return {
      ok: false,
      message:
        error.code !== '23505'
          ? 'Не удалось сохранить изменения.'
          : action === 'set_color'
            ? 'Этот цвет уже занят другой командой.'
            : 'Такое название команды уже занято.',
    };
  }

  await audit({
    admin,
    action: `team_${action}`,
    entityType: 'team',
    entityId: teamId,
    before,
    after: patch,
  });

  revalidatePath('/admin/teams');
  revalidatePath(`/admin/teams/${teamId}`);
  return { ok: true, message };
}

export async function createTeamAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const eventId = String(formData.get('eventId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const captain = String(formData.get('captainName') ?? '').trim();
  const contact = String(formData.get('contact') ?? '').trim();

  if (name.length < 2 || captain.length < 2) {
    return { ok: false, message: 'Укажите название команды и имя капитана.' };
  }

  // Пусто — «как у всех»: команда живёт по общему числу из
  // настроек мероприятия, а не получает его жёсткой копией.
  const isTest = formData.get('isTest') === 'on';

  const rawSize = String(formData.get('sizeLimit') ?? '').trim();
  const sizeLimit = rawSize === '' ? null : Number(rawSize);
  if (sizeLimit !== null && (!Number.isInteger(sizeLimit) || sizeLimit < 1 || sizeLimit > 6)) {
    return { ok: false, message: 'Размер команды — целое число от 1 до 6.' };
  }

  // Сессия здесь никому не нужна, но функция её создаёт — кладём
  // случайный хэш, который никому не соответствует.
  const throwawayHash = randomBytes(32).toString('hex');

  const result = await callRpc<{ teamId: string; joinCode: string }>('register_team', {
    p_event_id: eventId,
    p_team_name: name,
    p_captain_name: captain,
    p_contact: contact || null,
    p_candidate_codes: generateJoinCodes(),
    p_session_token_hash: throwawayHash,
    p_session_ttl_hours: env().TEAM_SESSION_TTL_HOURS,
    p_policy_version: env().POLICY_VERSION,
    p_social_consent: false,
    p_user_agent: 'admin',
    // Организатор заводит команду вручную и вне окна регистрации,
    // но лимит max_teams всё равно соблюдается.
    p_bypass_limits: true,
  });

  if (!result.ok) {
    const messages: Record<string, string> = {
      event_full: 'Все места заняты.',
      team_name_taken: 'Команда с таким названием уже есть.',
    };
    return { ok: false, message: messages[result.error] ?? 'Не удалось создать команду.' };
  }

  // Размер и признак теста ставятся вторым шагом: `register_team`
  // — общая функция регистрации, и добавлять в неё поля ради
  // админки значило бы тянуть их через весь путь участника.
  const patch: Record<string, unknown> = {};
  if (sizeLimit !== null) patch.size_limit = sizeLimit;
  if (isTest) patch.is_test = true;
  if (Object.keys(patch).length) {
    await supabaseAdmin().from('teams').update(patch).eq('id', result.data.teamId);
  }

  await audit({
    admin,
    action: 'team_created_by_admin',
    entityType: 'team',
    entityId: result.data.teamId,
    after: { name, captain, size_limit: sizeLimit, is_test: isTest },
  });

  revalidatePath('/admin/teams');
  return {
    ok: true,
    message: isTest
      ? `Тестовая команда «${name}» создана. Код: ${result.data.joinCode}`
      : `Команда «${name}» создана. Код для участников: ${result.data.joinCode}`,
  };
}

/**
 * Удаление команды.
 *
 * Отмена регистрации и удаление — разные действия, и разница не в
 * силе. Отмена нужна во время игры: команда сошла, место
 * освободилось, а её отправки и баллы остаются в журнале, потому
 * что влияли на гонку за задания у всех остальных.
 *
 * Удаление нужно до старта: обкатали, попробовали, теперь список
 * должен быть чистым перед настоящими людьми. После старта база
 * его не разрешит — проверка стоит в `delete_team`, а не здесь:
 * серверное действие вызывается по своему адресу и защищаться
 * обязано на стороне базы.
 */
export async function deleteTeamAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const teamId = String(formData.get('teamId') ?? '');

  const result = await callRpc<{
    teamName: string;
    members: number;
    submissions: number;
    releasedTasks: number;
    imagePaths: string[];
    previewPaths: string[];
  }>('delete_team', { p_team_id: teamId });

  if (!result.ok) {
    const messages: Record<string, string> = {
      team_not_found: 'Команда не найдена.',
      event_started:
        'Квест уже запущен — команду можно только отменить. Её баллы влияли на гонку за задания у всех остальных.',
    };
    return { ok: false, message: messages[result.error] ?? 'Не удалось удалить команду.' };
  }

  // Снимки убираем после строк: если удаление не прошло, файлы
  // остались на месте и целыми.
  const { removeObjects } = await import('@/lib/storage');
  if (result.data.imagePaths.length) {
    await removeObjects(BUCKETS.submissions, result.data.imagePaths);
  }
  if (result.data.previewPaths.length) {
    await removeObjects(BUCKETS.previews, result.data.previewPaths);
  }

  await audit({
    admin,
    action: 'team_deleted',
    entityType: 'team',
    entityId: teamId,
    before: {
      name: result.data.teamName,
      members: result.data.members,
      submissions: result.data.submissions,
    },
  });

  revalidatePath('/admin/teams');
  revalidatePath('/admin/leaderboard');
  revalidatePath('/leaderboard');

  // Карточки удалённой команды больше нет — возвращаться некуда.
  redirect('/admin/teams');
}

export async function adjustScoreAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = scoreAdjustmentSchema.safeParse({
    teamId: formData.get('teamId'),
    points: Number(formData.get('points') ?? 0),
    transactionType: formData.get('transactionType'),
    reason: formData.get('reason'),
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  // Штраф — это всегда минус, бонус — всегда плюс. Знак
  // выводим из типа, чтобы нельзя было «оштрафовать на +50».
  let points = parsed.data.points;
  if (parsed.data.transactionType === 'penalty') points = -Math.abs(points);
  if (parsed.data.transactionType === 'bonus') points = Math.abs(points);

  const result = await callRpc<{ transactionId: string }>('adjust_team_score', {
    p_team_id: parsed.data.teamId,
    p_points: points,
    p_type: parsed.data.transactionType,
    p_reason: parsed.data.reason,
    p_admin_id: admin.userId,
  });

  if (!result.ok) return { ok: false, message: 'Не удалось изменить баллы.' };

  await audit({
    admin,
    action: 'score_adjusted',
    entityType: 'team',
    entityId: parsed.data.teamId,
    after: { points, type: parsed.data.transactionType, reason: parsed.data.reason },
  });

  revalidatePath('/admin/teams');
  revalidatePath(`/admin/teams/${parsed.data.teamId}`);
  revalidatePath('/admin/leaderboard');
  return { ok: true, message: `Начислено ${points > 0 ? '+' : ''}${points}.` };
}

// ═══ Проверка отправок ═════════════════════════════════════════

export async function reviewSubmissionAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = reviewDecisionSchema.safeParse({
    submissionId: formData.get('submissionId'),
    decision: formData.get('decision'),
    points: formData.get('points') ? Number(formData.get('points')) : undefined,
    comment: formData.get('comment') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', fields: fieldErrors(parsed.error) };
  }

  const db = supabaseAdmin();
  const { data: before } = await db
    .from('submissions')
    .select('*')
    .eq('id', parsed.data.submissionId)
    .maybeSingle();

  if (!before) return { ok: false, message: 'Отправка не найдена.' };

  const comment = parsed.data.comment || null;
  let message = '';

  switch (parsed.data.decision) {
    case 'accept': {
      // Если отправку уже принимали и отменяли, accept_submission
      // создаст новую действующую транзакцию — дубля не будет.
      const result = await callRpc<{ points: number; alreadyAccepted: boolean }>(
        'accept_submission',
        {
          p_submission_id: parsed.data.submissionId,
          p_points: parsed.data.points ?? null,
          p_admin_id: admin.userId,
          p_reason: 'manual_review',
          p_comment: comment,
        },
      );
      if (!result.ok) {
        return {
          ok: false,
          message:
            result.error === 'task_already_accepted'
              ? 'По этому заданию у команды уже принята другая фотография.'
              : 'Не удалось принять отправку.',
        };
      }
      message = result.data.alreadyAccepted
        ? 'Отправка уже была принята.'
        : `Принято, начислено ${result.data.points}.`;
      break;
    }

    case 'reject': {
      // Отклонение принятой отправки должно снять баллы, поэтому
      // идём через revoke, а не простым UPDATE статуса.
      const result = await callRpc<{ reversed: boolean }>('revoke_submission', {
        p_submission_id: parsed.data.submissionId,
        p_admin_id: admin.userId,
        p_reason: comment ?? 'Отклонено организатором',
        p_new_status: 'rejected',
      });
      if (!result.ok) return { ok: false, message: 'Не удалось отклонить отправку.' };
      message = result.data.reversed
        ? 'Отклонено, ранее начисленные баллы сняты обратной транзакцией.'
        : 'Отклонено.';
      break;
    }

    case 'request_retake': {
      const result = await callRpc<{ reversed: boolean }>('revoke_submission', {
        p_submission_id: parsed.data.submissionId,
        p_admin_id: admin.userId,
        p_reason: comment ?? 'Организатор просит переснять',
        p_new_status: 'rejected',
      });
      if (!result.ok) return { ok: false, message: 'Не удалось отправить на пересъёмку.' };
      message = 'Команде предложено переснять — попытка осталась использованной.';
      break;
    }

    case 'retry_ai': {
      const limit = await checkRateLimit('retryValidation', admin.userId);
      if (!limit.allowed) return { ok: false, message: 'Слишком часто. Подождите минуту.' };

      await db
        .from('submissions')
        .update({ status: 'pending', review_reason: null })
        .eq('id', parsed.data.submissionId);

      await db.from('validation_jobs').upsert(
        {
          submission_id: parsed.data.submissionId,
          status: 'queued',
          available_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
        },
        { onConflict: 'submission_id' },
      );

      void runValidationWorker({ limit: 1 }).catch(() => undefined);
      message = 'Отправка возвращена на автоматическую проверку.';
      break;
    }
  }

  if (comment && parsed.data.decision !== 'retry_ai') {
    await db
      .from('submissions')
      .update({ admin_comment: comment })
      .eq('id', parsed.data.submissionId);
  }

  await audit({
    admin,
    action: `submission_${parsed.data.decision}`,
    entityType: 'submission',
    entityId: parsed.data.submissionId,
    before: { status: before.status, awarded_points: before.awarded_points },
    after: { decision: parsed.data.decision, points: parsed.data.points, comment },
  });

  revalidatePath('/admin/submissions');
  revalidatePath('/admin');
  revalidatePath('/admin/leaderboard');
  return { ok: true, message };
}

// ═══ Очередь ═══════════════════════════════════════════════════

export async function requeueStaleAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');

  const result = await callRpc<{ requeuedJobs: number; releasedSubmissions: number }>(
    'requeue_stale_validations',
    { p_event_id: eventId, p_stale_minutes: env().AI_STALE_CHECK_MINUTES },
  );

  if (!result.ok) return { ok: false, message: 'Не удалось перезапустить проверки.' };

  const report = await runValidationWorker({ limit: env().AI_MAX_CONCURRENCY });

  await audit({
    admin,
    action: 'validations_requeued',
    entityType: 'event',
    entityId: eventId,
    after: { ...result.data, ...report },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/submissions');
  return {
    ok: true,
    message:
      `Возвращено в очередь: ${result.data.requeuedJobs}, ` +
      `освобождено отправок: ${result.data.releasedSubmissions}, ` +
      `обработано сейчас: ${report.claimed}.`,
  };
}

/** Массовое действие для аварийного сценария: всё — человеку. */
export async function bulkManualReviewAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('submissions')
    .update({ status: 'manual_review', review_reason: 'ai_unavailable' })
    .eq('event_id', eventId)
    .in('status', ['pending', 'checking'])
    .select('id');

  if (error) return { ok: false, message: 'Не удалось перевести отправки.' };

  await db
    .from('validation_jobs')
    .update({ status: 'cancelled', locked_at: null, locked_by: null })
    .in('status', ['queued', 'processing']);

  await audit({
    admin,
    action: 'bulk_manual_review',
    entityType: 'event',
    entityId: eventId,
    after: { moved: data?.length ?? 0 },
  });

  revalidatePath('/admin/submissions');
  return { ok: true, message: `Переведено в ручную проверку: ${data?.length ?? 0}.` };
}

/** Принять все ожидающие отправки по одному заданию. */
export async function acceptAllForTaskAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const taskId = String(formData.get('taskId') ?? '');

  const db = supabaseAdmin();
  const { data: pending } = await db
    .from('submissions')
    .select('id')
    .eq('task_id', taskId)
    .in('status', ['pending', 'checking', 'manual_review']);

  const rows = (pending as Array<{ id: string }> | null) ?? [];
  let accepted = 0;

  for (const row of rows) {
    const result = await callRpc<{ alreadyAccepted: boolean }>('accept_submission', {
      p_submission_id: row.id,
      p_points: null,
      p_admin_id: admin.userId,
      p_reason: 'bulk_accept',
      p_comment: null,
    });
    if (result.ok) accepted += 1;
  }

  await audit({
    admin,
    action: 'bulk_accept_task',
    entityType: 'task',
    entityId: taskId,
    after: { accepted, considered: rows.length },
  });

  revalidatePath('/admin/submissions');
  revalidatePath('/admin/leaderboard');
  return { ok: true, message: `Принято ${accepted} из ${rows.length}.` };
}

// ═══ Задания ═══════════════════════════════════════════════════

/**
 * Что именно оказалось занято.
 *
 * Уникальных ограничений у заданий два — номер и слот витрины, — и
 * оба возвращают 23505. Общий текст «задание с таким номером уже
 * существует» на занятом слоте отправлял бы организатора менять
 * правильный номер.
 */
function duplicateMessage(error: { message?: string; details?: string }): string {
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  if (text.includes('landing_slot')) {
    return 'Этот слот на главной уже занят другим заданием. Освободите его или выберите другой.';
  }
  return 'Задание с таким номером уже существует.';
}

export async function saveTaskAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const taskId = String(formData.get('taskId') ?? '');
  const eventId = String(formData.get('eventId') ?? '');

  const lines = (value: FormDataEntryValue | null) =>
    String(value ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const criteria = lines(formData.get('criteria'));
  const hiddenCriteria = lines(formData.get('hiddenCriteria'));

  const requireLocation = formData.get('requireLocation') === 'on';

  // Контур приезжает из редактора области строкой JSON. Разбор
  // здесь, а не в схеме: сломанную строку надо показать как
  // ошибку поля, а не уронить весь разбор формы.
  const rawPolygon = String(formData.get('areaPolygon') ?? '').trim();
  let areaPolygon: unknown = null;
  if (rawPolygon) {
    try {
      areaPolygon = JSON.parse(rawPolygon);
    } catch {
      return {
        ok: false,
        error: 'validation_failed',
        fields: { areaPolygon: 'Область пришла в нечитаемом виде. Нарисуйте её заново.' },
      };
    }
  }

  const parsed = taskSchema.safeParse({
    number: Number(formData.get('number') ?? 0),
    title: formData.get('title'),
    shortDescription: formData.get('shortDescription') ?? '',
    description: formData.get('description'),
    points: Number(formData.get('points') ?? 0),
    category: formData.get('category'),
    cardType: formData.get('cardType'),
    difficulty: formData.get('difficulty'),
    validationMode: formData.get('validationMode'),
    criteria,
    hiddenCriteria,
    minimumPeople: Number(formData.get('minimumPeople') ?? 0),
    maxAttempts: Number(formData.get('maxAttempts') ?? 1),
    requireLocation,
    latitude: formData.get('latitude') ? Number(formData.get('latitude')) : null,
    longitude: formData.get('longitude') ? Number(formData.get('longitude')) : null,
    radiusMeters: formData.get('radiusMeters') ? Number(formData.get('radiusMeters')) : null,
    active: formData.get('active') === 'on',
    mapMode: formData.get('mapMode') ?? 'none',
    areaPolygon,
    imageCaption: formData.get('imageCaption') ?? '',
    landingSlot: Number(formData.get('landingSlot') ?? 0),
    backstory: formData.get('backstory') ?? '',
    afterword: formData.get('afterword') ?? '',
    afterwordUrl: formData.get('afterwordUrl') ?? '',
    afterwordUrlLabel: formData.get('afterwordUrlLabel') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation_failed', ...taskValidationReport(parsed.error) };
  }

  const payload = {
    event_id: eventId,
    number: parsed.data.number,
    title: parsed.data.title,
    short_description: parsed.data.shortDescription || null,
    description: parsed.data.description,
    points: parsed.data.points,
    category: parsed.data.category,
    card_type: parsed.data.cardType,
    difficulty: parsed.data.difficulty,
    validation_mode: parsed.data.validationMode,
    criteria: parsed.data.criteria,
    hidden_criteria: parsed.data.hiddenCriteria,
    minimum_people: parsed.data.minimumPeople,
    max_attempts: parsed.data.maxAttempts,
    require_location: parsed.data.requireLocation,
    // Координаты живут независимо от проверки геопозиции: крест на
    // карте говорит, куда идти, а require_location проверяет, что
    // телефон действительно там. Раньше первое существовало только
    // вместе со вторым, и точку нельзя было показать, не включив
    // проверку.
    latitude: parsed.data.latitude ?? null,
    longitude: parsed.data.longitude ?? null,
    radius_meters: parsed.data.radiusMeters ?? null,
    map_mode: parsed.data.mapMode,
    area_polygon: parsed.data.mapMode === 'area' ? asAreaPolygon(parsed.data.areaPolygon) : null,
    image_caption: parsed.data.imageCaption || null,
    landing_slot: parsed.data.landingSlot || null,
    backstory: parsed.data.backstory || null,
    afterword: parsed.data.afterword || null,
    afterword_url: parsed.data.afterwordUrl || null,
    afterword_url_label: parsed.data.afterwordUrlLabel || null,
    active: parsed.data.active,
    sort_order: parsed.data.number,
  };

  const db = supabaseAdmin();

  if (taskId) {
    const { data: before } = await db.from('tasks').select('*').eq('id', taskId).maybeSingle();
    const { error } = await db.from('tasks').update(payload).eq('id', taskId);
    if (error) {
      return {
        ok: false,
        message: error.code === '23505' ? duplicateMessage(error) : 'Не удалось сохранить задание.',
      };
    }
    await audit({
      admin,
      action: 'task_updated',
      entityType: 'task',
      entityId: taskId,
      before,
      after: payload,
    });
    revalidatePath('/admin/tasks');
    revalidatePath(`/admin/tasks/${taskId}`);
    return { ok: true, message: 'Задание сохранено.' };
  }

  const { data, error } = await db.from('tasks').insert(payload).select('id').maybeSingle();
  if (error) {
    return {
      ok: false,
      message: error.code === '23505' ? duplicateMessage(error) : 'Не удалось создать задание.',
    };
  }

  await audit({
    admin,
    action: 'task_created',
    entityType: 'task',
    entityId: data?.id ?? null,
    after: payload,
  });

  revalidatePath('/admin/tasks');

  // На страницу самого задания, а не в список. Картинки
  // привязываются к идентификатору, которого до сохранения не
  // существует, поэтому их блок живёт только здесь — и после
  // создания организатор должен оказаться там, где работа
  // продолжается, а не искать своё задание в списке из полусотни.
  if (data?.id) redirect(`/admin/tasks/${data.id}`);
  redirect('/admin/tasks');
}

export async function toggleTaskAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const taskId = String(formData.get('taskId') ?? '');
  const active = formData.get('active') === 'true';

  const { error } = await supabaseAdmin().from('tasks').update({ active }).eq('id', taskId);
  if (error) return { ok: false, message: 'Не удалось изменить задание.' };

  await audit({
    admin,
    action: active ? 'task_enabled' : 'task_disabled',
    entityType: 'task',
    entityId: taskId,
    after: { active },
  });

  revalidatePath('/admin/tasks');
  return { ok: true, message: active ? 'Задание включено.' : 'Задание выключено.' };
}

/**
 * Загрузка картинки к заданию.
 *
 * Интерфейса для этого не было вовсе: бакет `task-reference-images`
 * и таблица существовали с самого начала, а положить туда файл
 * можно было только руками через панель Supabase. Для фото-повтора
 * эталон обязателен, а для загадки картинка — это гравюра или
 * картина по теме, так что без загрузки не обойтись ни тому, ни
 * другому.
 *
 * Файл идёт через серверное действие, а не подписанной ссылкой из
 * браузера, как отправки команд. Разница в объёме: команда за
 * вечер шлёт сотни снимков с телефона на мобильном интернете, а
 * организатор загружает полсотни картинок один раз с ноутбука.
 * Ради второго заводить обмен токенами незачем.
 */
export async function uploadTaskImageAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const taskId = String(formData.get('taskId') ?? '');
  const caption = String(formData.get('caption') ?? '').trim();
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Выберите файл с картинкой.' };
  }

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  if (!ALLOWED.includes(file.type)) {
    return { ok: false, message: 'Годятся JPEG, PNG и WebP.' };
  }

  // Три мегабайта — заведомо ниже потолка тела серверного
  // действия (4 МБ в next.config.ts). Проверка здесь ловит только
  // то, что до него доехало: запрос крупнее потолка Next отбросит
  // раньше, и это уже не наша ошибка, а страница «не загрузилось».
  // Обычный путь — сжатие в браузере, сюда приезжает 200–600 КБ.
  const MAX_BYTES = 3 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: 'Картинка больше 3 МБ. Сожмите её или выберите файл поменьше.',
    };
  }

  const db = supabaseAdmin();
  const { data: task } = await db
    .from('tasks')
    .select('id, event_id')
    .eq('id', taskId)
    .maybeSingle();

  if (!task) return { ok: false, message: 'Задание не найдено.' };

  const imageId = randomBytes(8).toString('hex');
  const path = referencePath({
    eventId: (task as { event_id: string }).event_id,
    taskId,
    imageId,
    extension: extensionFor(file.type),
  });

  const { error: uploadError } = await db.storage
    .from(BUCKETS.references)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (uploadError) {
    return { ok: false, message: 'Не удалось загрузить файл в хранилище.' };
  }

  // Порядок — по количеству уже загруженных: первая картинка и
  // попадает на карточку, остальные видно на странице задания.
  const { count } = await db
    .from('task_reference_images')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId);

  const { error } = await db.from('task_reference_images').insert({
    task_id: taskId,
    image_path: path,
    caption: caption || null,
    sort_order: count ?? 0,
  });

  if (error) {
    // Строки нет — файл в хранилище стал мусором, убираем сразу.
    await db.storage.from(BUCKETS.references).remove([path]);
    return { ok: false, message: 'Не удалось сохранить картинку.' };
  }

  await audit({
    admin,
    action: 'task_image_added',
    entityType: 'task',
    entityId: taskId,
    after: { image_path: path, caption: caption || null },
  });

  revalidatePath(`/admin/tasks/${taskId}`);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true, message: 'Картинка загружена.' };
}

/**
 * Рамка картинки: как вписать и куда смотреть.
 *
 * Кадр карточки 4:3, а картинки приходят разные. Вертикальный
 * рисунок при обрезке по центру теряет головы — ровно то, ради
 * чего его и загружали. Файл при этом не трогаем: обрезать
 * оригинал значило бы терять данные при каждой правке рамки.
 */
export async function updateTaskImageFramingAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const imageId = String(formData.get('imageId') ?? '');
  const fit = String(formData.get('fit') ?? 'cover');
  const focusX = Number(formData.get('focusX') ?? 0.5);
  const focusY = Number(formData.get('focusY') ?? 0.5);

  if (fit !== 'cover' && fit !== 'contain') {
    return { ok: false, message: 'Неизвестный способ вписывания.' };
  }
  if (![focusX, focusY].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    return { ok: false, message: 'Точка фокуса вышла за пределы картинки.' };
  }

  const db = supabaseAdmin();
  const { data } = await db
    .from('task_reference_images')
    .select('*')
    .eq('id', imageId)
    .maybeSingle();

  const image = data as TaskReferenceImageRow | null;
  if (!image) return { ok: false, message: 'Картинка не найдена.' };

  const { error } = await db
    .from('task_reference_images')
    .update({ fit, focus_x: focusX, focus_y: focusY })
    .eq('id', imageId);

  if (error) return { ok: false, message: 'Не удалось сохранить рамку.' };

  await audit({
    admin,
    action: 'task_image_framed',
    entityType: 'task',
    entityId: image.task_id,
    before: { fit: image.fit, focus_x: image.focus_x, focus_y: image.focus_y },
    after: { fit, focus_x: focusX, focus_y: focusY },
  });

  revalidatePath(`/admin/tasks/${image.task_id}`);
  revalidatePath(`/tasks/${image.task_id}`);
  revalidatePath('/tasks');
  return { ok: true, message: 'Рамка сохранена.' };
}

/** Удаление картинки: строка и файл уходят вместе. */
export async function deleteTaskImageAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const imageId = String(formData.get('imageId') ?? '');

  const db = supabaseAdmin();
  const { data } = await db
    .from('task_reference_images')
    .select('*')
    .eq('id', imageId)
    .maybeSingle();

  const image = data as TaskReferenceImageRow | null;
  if (!image) return { ok: false, message: 'Картинка не найдена.' };

  const { error } = await db.from('task_reference_images').delete().eq('id', imageId);
  if (error) return { ok: false, message: 'Не удалось удалить картинку.' };

  // Файл после строки: если удаление строки не прошло, картинка
  // осталась на месте и целой.
  await db.storage.from(BUCKETS.references).remove([image.image_path]);

  await audit({
    admin,
    action: 'task_image_removed',
    entityType: 'task',
    entityId: image.task_id,
    before: { image_path: image.image_path },
  });

  revalidatePath(`/admin/tasks/${image.task_id}`);
  revalidatePath(`/tasks/${image.task_id}`);
  return { ok: true, message: 'Картинка удалена.' };
}

export async function deleteTaskAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const taskId = String(formData.get('taskId') ?? '');

  const db = supabaseAdmin();

  // Задание с отправками не удаляем: это разорвало бы историю
  // начислений. Такое задание нужно выключать.
  const { count } = await db
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      message: `По заданию уже есть отправки (${count}). Его можно только выключить.`,
    };
  }

  const { data: before } = await db.from('tasks').select('*').eq('id', taskId).maybeSingle();
  const { error } = await db.from('tasks').delete().eq('id', taskId);
  if (error) return { ok: false, message: 'Не удалось удалить задание.' };

  await audit({ admin, action: 'task_deleted', entityType: 'task', entityId: taskId, before });

  revalidatePath('/admin/tasks');
  return { ok: true, message: 'Задание удалено.' };
}

// ═══ Хранение фотографий ═══════════════════════════════════════

export async function purgePhotosAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');

  const db = supabaseAdmin();
  const { data: event } = await db
    .from('events')
    .select('photo_retention_days')
    .eq('id', eventId)
    .maybeSingle();

  const days = event?.photo_retention_days ?? env().PHOTO_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: old } = await db
    .from('submissions')
    .select('id, image_path, preview_path')
    .eq('event_id', eventId)
    .lt('submitted_at', cutoff)
    .not('image_path', 'is', null);

  const rows =
    (old as Array<{ id: string; image_path: string; preview_path: string | null }> | null) ?? [];

  if (rows.length === 0) {
    return { ok: true, message: 'Фотографий старше срока хранения нет.' };
  }

  const { removeObjects, BUCKETS } = await import('@/lib/storage');
  await removeObjects(
    BUCKETS.submissions,
    rows.map((r) => r.image_path),
  );
  await removeObjects(
    BUCKETS.previews,
    rows.map((r) => r.preview_path).filter((p): p is string => Boolean(p)),
  );

  // Записи остаются: журнал начислений и результаты не должны
  // разъезжаться из-за удаления файлов.
  await db
    .from('submissions')
    .update({ image_path: null, preview_path: null })
    .in(
      'id',
      rows.map((r) => r.id),
    );

  await audit({
    admin,
    action: 'photos_purged',
    entityType: 'event',
    entityId: eventId,
    after: { removed: rows.length, olderThan: cutoff },
  });

  revalidatePath('/admin/settings');
  return { ok: true, message: `Удалено файлов: ${rows.length}.` };
}

// ═══ Проверка связи с моделью ══════════════════════════════════

/**
 * «Проверить связь с ИИ».
 *
 * Появилось после того, как первая боевая отправка ушла на ручную
 * проверку с кодом `ai_error`: ключ в переменных окружения был, а
 * ответ Google — нет, и понять это можно было только по чужой
 * фотографии. Кнопка отвечает на вопрос до квеста, а не во время.
 *
 * Наружу уходит текст ошибки Google (например, «API key not
 * valid»), но никогда сам ключ.
 */
export async function checkAiConnectionAction(
  _prev: AdminActionState,
  _formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const limit = await checkRateLimit('aiPing', admin.userId);
  if (!limit.allowed) {
    return { ok: false, error: 'rate_limited', message: 'Слишком часто. Подождите минуту.' };
  }

  const { pingGemini } = await import('@/lib/ai/gemini');
  const result = await pingGemini();

  if (result.status === 'ok') {
    return {
      ok: true,
      message: `Связь есть: ${result.model}, ответ за ${result.durationMs} мс.`,
    };
  }

  if (result.status === 'disabled') {
    return {
      ok: false,
      error: 'ai_unavailable',
      message: 'Ключ не задан или автоматическая проверка выключена в окружении.',
    };
  }

  // Ключ не принят — чинится в переменных окружения. Отвергнут
  // сам запрос — ключ рабочий, чинить надо код проверки.
  const where =
    result.stage === 'key' ? 'Ключ не принят' : 'Ключ рабочий, но модель отвергла запрос';

  if (result.status === 'network') {
    return { ok: false, error: 'ai_error', message: `${where}. Сеть: ${result.detail}` };
  }

  return {
    ok: false,
    error: 'ai_error',
    message: `${where}. HTTP ${result.code}: ${result.detail}`,
  };
}

// ═══ Игровое поле полигоном ════════════════════════════════════

/**
 * Сохранение границы поля.
 *
 * Отдельное действие, а не поле в общей форме настроек: границу
 * рисуют мышью по карте, а не набирают числами, и сохранять её
 * вместе с ценой и лимитом команд означало бы терять контур при
 * каждой правке соседнего поля.
 *
 * Форма приходит строкой JSON и проверяется здесь же — тем же
 * набором требований, что и ограничение в базе. Полагаться на
 * клиентскую проверку нельзя: действие вызывается из браузера.
 */
export async function savePlayAreaAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const eventId = String(formData.get('eventId') ?? '');
  const raw = String(formData.get('polygon') ?? '').trim();

  const db = supabaseAdmin();
  const { data: before } = await db.from('events').select('*').eq('id', eventId).maybeSingle();
  if (!before) return { ok: false, message: 'Мероприятие не найдено.' };

  // Пустое значение — осознанная очистка границы.
  if (raw === '') {
    if (before.area_enforced && before.area_latitude === null) {
      return {
        ok: false,
        message:
          'Строгий режим включён, а круга нет — сначала выключите строгий режим или задайте центр и радиус.',
      };
    }

    const { error } = await db.from('events').update({ area_polygon: null }).eq('id', eventId);
    if (error) return { ok: false, message: 'Не удалось очистить границу.' };

    await audit({
      admin,
      action: 'play_area_cleared',
      entityType: 'event',
      entityId: eventId,
      before: { area_polygon: before.area_polygon },
      after: { area_polygon: null },
    });

    revalidatePath('/admin/event');
    revalidatePath('/map');
    revalidatePath('/');
    return { ok: true, message: 'Граница очищена. Поле снова описывается кругом, если он задан.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Граница пришла в нечитаемом виде. Нарисуйте её заново.' };
  }

  const polygon = asAreaPolygon(parsed);
  if (!polygon) {
    return {
      ok: false,
      message: 'Нужен замкнутый контур минимум из трёх точек и не больше пятисот.',
    };
  }

  const { error } = await db.from('events').update({ area_polygon: polygon }).eq('id', eventId);
  if (error) {
    return {
      ok: false,
      message:
        error.code === '23514'
          ? 'База отклонила контур: проверьте, что он замкнут и без самопересечений.'
          : 'Не удалось сохранить границу.',
    };
  }

  await audit({
    admin,
    action: 'play_area_saved',
    entityType: 'event',
    entityId: eventId,
    before: { area_polygon: before.area_polygon },
    after: { points: polygon.coordinates[0].length - 1 },
  });

  revalidatePath('/admin/event');
  revalidatePath('/map');
  revalidatePath('/');
  return {
    ok: true,
    message: `Граница сохранена: ${polygon.coordinates[0].length - 1} точек.`,
  };
}
