import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/surface';
import { Notice } from '@/components/ui/feedback';
import { JoinForm } from '@/components/game/join-form';
import { getCurrentEvent } from '@/lib/data/event';
import { getTeamSession } from '@/lib/session/team-session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Войти по коду',
  description: 'Присоединиться к команде на фото-квесте «Движ-Патруль» по коду приглашения.',
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const session = await getTeamSession();
  if (session) redirect('/team');

  const [event, params] = await Promise.all([getCurrentEvent(), searchParams]);

  const joinable = event && ['registration', 'live', 'paused'].includes(event.status);

  return (
    <div className="page-well py-10 md:py-16">
      <div className="mx-auto max-w-xl">
        <Eyebrow>Вход</Eyebrow>
        <h1 className="mt-3 text-headline md:text-headline">Войти по коду</h1>
        <p className="mt-4 text-body text-muted">
          Введите код из шести символов, который дал капитан.
        </p>

        <div className="mt-8">
          {joinable ? (
            /* Ссылка-приглашение приходит с кодом в адресе —
               подставляем его сразу, чтобы не набирать вручную. */
            <JoinForm defaultCode={params.code?.toUpperCase().slice(0, 6)} />
          ) : (
            <div className="flex flex-col gap-6">
              <Notice tone="strong" icon="info">
                К этому мероприятию сейчас нельзя присоединиться.
              </Notice>
              <ButtonLink href="/" variant="secondary">
                На главную
              </ButtonLink>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
