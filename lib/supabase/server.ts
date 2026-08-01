import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Клиент Supabase Auth для администратора.
 *
 * Работает с anon-ключом и сессией из cookie, поэтому подчиняется
 * RLS. Права администратора проверяются отдельно — см. lib/auth.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  const e = env();

  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // В Server Component запись cookie запрещена. Обновление
          // сессии выполняет middleware, поэтому молча пропускаем.
        }
      },
    },
  });
}
