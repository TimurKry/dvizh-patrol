import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/admin-nav';
import { getAdmin } from '@/lib/auth/admin';

export const metadata: Metadata = {
  title: { default: 'Админка', template: '%s · Админка' },
  robots: { index: false, follow: false },
};

/**
 * Оболочка админки.
 *
 * Своя навигация вместо плавающей таблетки: у организатора
 * десяток разделов, и таблетка на них не рассчитана. Палитра,
 * радиусы и плоскость — те же, что и во всём приложении.
 *
 * Права здесь не проверяются: страницы вызывают requireAdmin
 * сами, иначе layout стал бы единственной точкой отказа.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-linen-canvas">
      {admin && <AdminNav email={admin.email} />}
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
