import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Клиент с ключом service_role.
 *
 * Обходит RLS, поэтому используется только на сервере и только
 * после того, как вызывающий код уже проверил права: командную
 * сессию из cookie или роль администратора.
 *
 * Ключ никогда не покидает сервер: модуль server-only, а имя
 * переменной без префикса NEXT_PUBLIC_.
 */

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const e = env();
    client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { 'x-application-name': 'dvizh-patrol' },
      },
    });
  }
  return client;
}

/**
 * Вызов SQL-функции с разбором соглашения {ok, error}.
 *
 * Ошибки транспорта и бизнес-правил приводятся к одному виду,
 * чтобы вызывающий код не разбирал два разных формата.
 */
export async function callRpc<T extends Record<string, unknown>>(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string; details?: unknown }> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);

  if (error) {
    return { ok: false, error: 'database_error', details: error.message };
  }

  if (data && typeof data === 'object' && 'ok' in data) {
    const result = data as { ok: boolean; error?: string } & T;
    if (result.ok) {
      return { ok: true, data: result };
    }
    return { ok: false, error: result.error ?? 'unknown_error', details: result };
  }

  return { ok: true, data: data as T };
}
