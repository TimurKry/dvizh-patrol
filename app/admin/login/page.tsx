import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminLoginForm, EmailLinkForm } from '@/components/admin/admin-login-form';
import { ErrorNotice } from '@/components/ui/feedback';
import { DotCluster } from '@/components/ui/logo';
import { getAdmin } from '@/lib/auth/admin';
import { staffHome } from '@/lib/studio/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Вход' };

const ERRORS: Record<string, string> = {
  expired: 'Ссылка для входа устарела или уже использована. Попросите новую или войдите иначе.',
  no_access: 'У этого аккаунта нет доступа. Если вы в команде — напишите владельцу.',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await getAdmin();
  if (admin) redirect(staffHome(admin.role));

  const { error } = await searchParams;
  const errorText = error ? ERRORS[error] : undefined;

  return (
    <div className="page-well flex min-h-dvh items-center justify-center py-16">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <DotCluster size={24} />
          <h1 className="text-headline">Вход для команды</h1>
          <p className="text-body text-muted">
            Участникам вход сюда не нужен — они заходят по коду команды.
          </p>
        </div>

        {errorText && <ErrorNotice>{errorText}</ErrorNotice>}

        <AdminLoginForm />

        <div className="flex flex-col gap-4 border-t border-hairline pt-6">
          <p className="text-caption text-muted">Без пароля: пришлём ссылку для входа на почту.</p>
          <EmailLinkForm />
        </div>
      </div>
    </div>
  );
}
