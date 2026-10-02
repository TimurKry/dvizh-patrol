import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { audit } from '@/lib/auth/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { safeNextPath, staffHome } from '@/lib/studio/staff';
import type { AdminUserRow } from '@/types/database';

/**
 * Приём ссылки для входа.
 *
 * Ссылки бывают двух видов, и обе заканчиваются здесь:
 *
 *   ?token_hash=…&type=magiclink — ссылка, которую владелец
 *     получает в разделе «Команда» и пересылает сотруднику сам.
 *     Не зависит от настроек почты Supabase и работает на любом
 *     устройстве.
 *   ?code=… — ссылка из письма Supabase (вход по почте). Работает
 *     в том же браузере, где её запросили.
 *
 * Сессия сама по себе прав не даёт: после входа сверяемся со
 * списком сотрудников, и отключённого выпускаем обратно.
 */

const OTP_TYPES: readonly EmailOtpType[] = ['magiclink', 'email', 'invite', 'signup'];

function fail(request: NextRequest, reason: 'expired' | 'no_access') {
  return NextResponse.redirect(new URL(`/admin/login?error=${reason}`, request.url));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const supabase = await supabaseServer();

  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const code = params.get('code');

  let userId: string | null = null;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) userId = data.user?.id ?? null;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id ?? null;
  }

  if (!userId) return fail(request, 'expired');

  const { data } = await supabaseAdmin()
    .from('admin_users')
    .select('user_id, email, role, disabled_at')
    .eq('user_id', userId)
    .maybeSingle();
  const staff = data as Pick<AdminUserRow, 'user_id' | 'email' | 'role' | 'disabled_at'> | null;

  if (!staff || staff.disabled_at) {
    await supabase.auth.signOut();
    return fail(request, 'no_access');
  }

  await audit({
    admin: { userId: staff.user_id, email: staff.email },
    action: 'admin_login_link',
    entityType: 'admin',
    entityId: staff.user_id,
  });

  const next = safeNextPath(params.get('next'), staffHome(staff.role));
  return NextResponse.redirect(new URL(next, request.url));
}
