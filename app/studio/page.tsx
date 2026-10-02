import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/admin';
import { canUseCrm } from '@/lib/studio/staff';

export default async function StudioPage() {
  const admin = await requireAdmin();
  redirect(canUseCrm(admin.role) ? '/studio/leads' : '/admin');
}
