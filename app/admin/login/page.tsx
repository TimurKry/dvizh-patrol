import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin/admin-login-form';
import { DotCluster } from '@/components/ui/logo';
import { getAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Вход' };

export default async function AdminLoginPage() {
  const admin = await getAdmin();
  if (admin) redirect('/admin');

  return (
    <div className="page-well flex min-h-dvh items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <DotCluster size={24} />
          <h1 className="text-heading">Вход для организатора</h1>
          <p className="text-body text-sepia">
            Участникам вход сюда не нужен — они заходят по коду команды.
          </p>
        </div>

        <AdminLoginForm />
      </div>
    </div>
  );
}
