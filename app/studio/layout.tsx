import type { Metadata } from 'next';
import { StudioNav } from '@/components/studio/studio-nav';
import { getAdmin } from '@/lib/auth/admin';

export const metadata: Metadata = {
  title: { default: 'Студия', template: '%s · Студия' },
  robots: { index: false, follow: false },
};

/**
 * Оболочка Студии.
 *
 * Как и в админке, права проверяет каждая страница сама
 * (requireAdmin), а не layout: он не перерисовывается при
 * переходах и не может быть единственной точкой отказа.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      {admin && <StudioNav email={admin.email} role={admin.role} />}
      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
