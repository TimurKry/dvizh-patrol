import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/admin-nav';
import { getAdmin } from '@/lib/auth/admin';
import { getCurrentEvent, getRegistrationStats } from '@/lib/data/event';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { EVENT_STATUS_TEXT, teamsWord } from '@/lib/messages';

export const metadata: Metadata = {
  title: { default: 'Админка', template: '%s · Админка' },
  robots: { index: false, follow: false },
};

/**
 * Оболочка админки · Figma 104:87.
 *
 * Сайдбар слева, содержимое справа. У организатора десяток
 * разделов, и в верхнюю ленту они помещались только прокруткой.
 *
 * Внизу сайдбара — состояние квеста: сколько команд и сколько
 * висит в очереди. Во время мероприятия это два числа, ради
 * которых организатор чаще всего и открывает экран, и держать
 * их на виду дешевле, чем гонять его на сводку.
 *
 * Права здесь не проверяются: страницы вызывают requireAdmin
 * сами, иначе layout стал бы единственной точкой отказа.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();

  let state: { status: string; teams: string; queue: string } | undefined;

  if (admin) {
    const event = await getCurrentEvent();
    if (event) {
      const [stats, queue] = await Promise.all([
        getRegistrationStats(event),
        supabaseAdmin()
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id)
          .in('status', ['pending', 'checking', 'manual_review']),
      ]);

      state = {
        status: EVENT_STATUS_TEXT[event.status] ?? event.status,
        teams: `${stats.active} ${teamsWord(stats.active)} · ${stats.members} участников`,
        queue: `в очереди: ${queue.count ?? 0}`,
      };
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      {admin && <AdminNav email={admin.email} state={state} />}
      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
