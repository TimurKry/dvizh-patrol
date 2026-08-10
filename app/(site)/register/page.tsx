import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/surface';
import { Notice } from '@/components/ui/feedback';
import { RegisterForm } from '@/components/game/register-form';
import { getCurrentEvent, getRegistrationStats } from '@/lib/data/event';
import { getTeamSession } from '@/lib/session/team-session';
import { EVENT_STATUS_TEXT, teamsWord } from '@/lib/messages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Создать команду',
  description: 'Регистрация команды на городской фото-квест «Движ-Патруль» в Лейпциге.',
};

export default async function RegisterPage() {
  // Вошедшую команду отправляем на её страницу: вторая
  // регистрация из того же браузера почти всегда ошибка.
  const session = await getTeamSession();
  if (session) redirect('/team');

  const event = await getCurrentEvent();
  if (!event) {
    return (
      <div className="page-well py-20">
        <h1 className="text-headline">Мероприятие не найдено</h1>
        <p className="mt-4 text-body text-muted">Регистрация пока недоступна.</p>
      </div>
    );
  }

  const stats = await getRegistrationStats(event);

  return (
    <div className="page-well py-10 md:py-16">
      <div className="mx-auto max-w-xl">
        <Eyebrow>Регистрация</Eyebrow>
        <h1 className="mt-3 text-headline md:text-headline">Создать команду</h1>
        <p className="mt-4 text-body text-muted">
          Капитан регистрирует команду и получает код приглашения. Email и пароль не нужны.
        </p>

        <div className="mt-8">
          {stats.canRegister ? (
            <>
              <Card className="mb-6 flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-caption text-muted">Свободные места</span>
                <span className="text-body font-medium">
                  {stats.free} из {event.max_teams} {teamsWord(event.max_teams)}
                </span>
              </Card>

              <RegisterForm teamSize={event.team_size} />
            </>
          ) : (
            <div className="flex flex-col gap-6">
              <Notice tone="strong" icon="•">
                {stats.isFull && event.status === 'registration'
                  ? 'Регистрация команд завершена — все доступные места заняты.'
                  : event.status === 'registration'
                    ? 'Регистрация временно закрыта организатором.'
                    : `Сейчас статус мероприятия — «${EVENT_STATUS_TEXT[event.status] ?? event.status}». Новые команды не регистрируются.`}
              </Notice>

              <p className="text-body text-muted">
                Если вас уже добавили в команду, войдите по коду от капитана.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/join" variant="secondary">
                  Войти по коду
                </ButtonLink>
                <ButtonLink href="/" variant="ghost">
                  На главную
                </ButtonLink>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
