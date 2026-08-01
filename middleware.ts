import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Обновление сессии Supabase Auth.
 *
 * Нужно только администратору: Server Component не может писать
 * cookie, поэтому продление токена делается здесь. Участников
 * это не касается — их сессия своя и живёт в отдельной cookie.
 *
 * Права здесь НЕ проверяются: middleware лишь освежает токен,
 * а решение о доступе принимает requireAdmin на самой странице.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
