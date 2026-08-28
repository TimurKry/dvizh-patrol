import type { Metadata } from 'next';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/nav/bottom-nav';
import { PhotoUpload } from '@/components/game/photo-upload';
import { LiveRefresh } from '@/components/game/live-refresh';
import { DeclineTask } from '@/components/game/decline-task';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/surface';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { Icon } from '@/components/ui/icon';
import { framingStyle } from '@/lib/framing';
import { env } from '@/lib/env';
import { getTaskForTeam, getTaskReferences } from '@/lib/data/tasks';
import { requireTeamSession } from '@/lib/session/require';
import {
  REVIEW_REASON_TEXT,
  SUBMISSION_STATUS_TEXT,
  TASK_CATEGORY_TEXT,
  TASK_DIFFICULTY_TEXT,
  attemptsWord,
  membersWord,
  pointsWord,
} from '@/lib/messages';
import { asAreaPolygon, ringCenter } from '@/lib/geo';
import { submissionsOpen } from '@/lib/event-status';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Задание' };

const QuestMap = dynamicImport(
  () => import('@/components/game/quest-map').then((m) => m.QuestMap),
  {
    loading: () => (
      <div className="h-[260px] w-full animate-pulse border border-hairline bg-canvas-deep" />
    ),
  },
);

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireTeamSession();
  const { taskId } = await params;

  // На этапе регистрации задания закрыты для всех.
  //
  // Проверка идёт до загрузки: угадать идентификатор задания
  // нельзя, но и полагаться на это не нужно — пока квест не
  // запущен, формулировка просто не читается из базы.
  if (!session.team.is_test && !['live', 'paused', 'finished'].includes(session.event.status)) {
    return (
      <div className="page-well with-bottom-nav py-8">
        <EmptyState
          title="Задания ещё закрыты"
          description="Список откроется в момент старта квеста."
          action={
            <Link href="/team" className="text-body underline underline-offset-2">
              На страницу команды
            </Link>
          }
        />
        <BottomNav />
      </div>
    );
  }

  // См. список заданий: срок закрывает отправку раньше статуса.
  const eventLive = submissionsOpen(session.event) || session.team.is_test;
  const item = await getTaskForTeam(session.event.id, session.teamId, taskId, { eventLive });

  if (!item) notFound();

  const { task, state, attemptsLeft, latestSubmission, canSubmit } = item;
  const references = await getTaskReferences(task.id);
  const config = env();

  // Отказаться можно от нетронутой карточки на руке, пока квест
  // идёт. Отправленное назад не берут: иначе отказ стал бы
  // способом стереть неудачную попытку. Сервер проверяет это же
  // ещё раз — здесь мы решаем только, показывать ли кнопку.
  const canDecline = eventLive && state === 'available' && latestSubmission === null;

  // Центр карточки: у области — центр нарисованного контура, у
  // точки — её координаты. Без центра карту рисовать не на чем,
  // и блок «где искать» просто не появляется.
  const taskRing = asAreaPolygon(task.area_polygon)?.coordinates[0] ?? null;
  const mapCenter =
    task.map_mode === 'area' && taskRing
      ? ringCenter(taskRing)
      : task.map_mode === 'point' && task.latitude != null && task.longitude != null
        ? { latitude: task.latitude, longitude: task.longitude }
        : null;

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-2 text-caption text-muted hover:text-ink"
        >
          <span aria-hidden="true">←</span> К руке
        </Link>

        <header className="mt-5 flex flex-col gap-3">
          <p className="text-caption text-faint">Задание {task.number}</p>
          <h1 className="text-headline md:text-headline">{task.title}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <Tag>
              {task.points} {pointsWord(task.points)}
            </Tag>
            <Tag>{TASK_CATEGORY_TEXT[task.category]}</Tag>
            <Tag>{TASK_DIFFICULTY_TEXT[task.difficulty]}</Tag>
            {task.minimum_people > 0 && (
              <Tag>
                минимум {task.minimum_people} {membersWord(task.minimum_people)} в кадре
              </Tag>
            )}
            {task.require_location && <Tag>нужна геопозиция</Tag>}
          </div>
        </header>

        {/* ═══ Эталон ═══════════════════════════════════════ */}
        {references.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            {references.map((reference) => (
              <figure key={reference.id} className="flex flex-col gap-2">
                {/* Рамка та же, что на карточке: организатор
                    выбрал её один раз и видит здесь тот же кадр. */}
                <div className="aspect-4/3 w-full overflow-hidden border border-hairline bg-canvas-deep">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={reference.url}
                    alt={reference.caption ?? `Пример к заданию ${task.number}`}
                    className="h-full w-full"
                    style={framingStyle(reference.framing)}
                  />
                </div>
                {(reference.caption ?? task.image_caption) && (
                  <figcaption className="text-caption text-muted">
                    {reference.caption ?? task.image_caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}

        {/* ═══ Где искать ═══════════════════════════════════
            Что показать, решает организатор в поле «Карта», а не
            тип карточки. У точки — крест: место известно, дойти до
            него в чужом городе без карты трудно. У области —
            пунктирный контур без центра: точное место и есть
            ответ. «Без карты» — карты нет вовсе. */}
        {mapCenter && (
          <div className="mt-6 flex flex-col gap-2">
            <h2 className="text-caption font-medium uppercase tracking-[0.08em] text-muted">
              {task.map_mode === 'area' ? 'Где-то здесь' : 'Где искать'}
            </h2>
            {/* Игровое поле здесь не рисуется намеренно. Оно
                заливается тем же сигнальным цветом, что и область
                задания, и обведённый квартал внутри поля просто
                переставал читаться. Границы поля команда видит на
                общей карте; на странице задания важно одно — куда
                идти. */}
            <QuestMap
              className="h-[260px]"
              showLocateButton={false}
              flat
              showPopups={false}
              area={null}
              points={[
                {
                  id: task.id,
                  latitude: mapCenter.latitude,
                  longitude: mapCenter.longitude,
                  label: String(task.number),
                  title: task.title,
                  radiusMeters: task.radius_meters,
                  ring: taskRing,
                  kind: task.map_mode === 'area' ? 'zone' : 'cross',
                  done: state === 'accepted',
                },
              ]}
            />
          </div>
        )}

        {/* ═══ Описание ═════════════════════════════════════ */}
        <div className="mt-6 flex flex-col gap-4">
          <p className="whitespace-pre-line text-body">{task.description}</p>

          {task.criteria.length > 0 && (
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-caption font-medium uppercase tracking-[0.08em] text-muted">
                Что должно быть в кадре
              </h2>
              <ul className="flex flex-col gap-2">
                {task.criteria.map((criterion, index) => (
                  <li key={index} className="flex gap-3 text-body text-muted">
                    <span aria-hidden="true" className="text-faint">
                      {index + 1}.
                    </span>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ═══ По дороге ════════════════════════════════════
            Справка видна сразу, вместе с условием: до точки идти
            десять минут, и это единственное, что человек успевает
            прочитать по пути. Ради этого квест и затевался — чтобы
            команда пришла к памятнику, уже зная, на что смотрит. */}
        {task.backstory && (
          <Card className="mt-6 flex flex-col gap-3 p-5">
            <h2 className="signal-label flex items-center gap-2 text-micro text-signal">
              <Icon name="info" size={14} />
              Пока идёте
            </h2>
            <p className="whitespace-pre-line text-body text-muted">{task.backstory}</p>
          </Card>
        )}

        {/* ═══ Текущее состояние ════════════════════════════ */}
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {latestSubmission ? (
                <StatusBadge status={latestSubmission.status} />
              ) : (
                <Tag>ещё не отправляли</Tag>
              )}
            </div>
            <p className="text-caption text-muted">
              {state === 'accepted'
                ? 'задание засчитано'
                : `осталось ${attemptsLeft} ${attemptsWord(attemptsLeft)} из ${task.max_attempts}`}
            </p>
          </div>

          {latestSubmission && (
            <Notice icon={SUBMISSION_STATUS_TEXT[latestSubmission.status].icon}>
              <p>{SUBMISSION_STATUS_TEXT[latestSubmission.status].hint}</p>
              {latestSubmission.review_reason && (
                <p className="mt-1 text-caption text-muted">
                  {REVIEW_REASON_TEXT[latestSubmission.review_reason] ??
                    latestSubmission.review_reason}
                </p>
              )}
              {latestSubmission.admin_comment && (
                <p className="mt-2 text-caption">
                  Комментарий организатора: {latestSubmission.admin_comment}
                </p>
              )}
              {latestSubmission.awarded_points > 0 && (
                <p className="mt-2 text-caption">
                  Начислено: {latestSubmission.awarded_points}{' '}
                  {pointsWord(latestSubmission.awarded_points)}
                </p>
              )}
            </Notice>
          )}
        </div>

        {/* ═══ Отправка ═════════════════════════════════════ */}
        <div className="mt-8">
          {canSubmit ? (
            <PhotoUpload
              taskId={task.id}
              requireLocation={task.require_location}
              areaEnforced={session.event.area_enforced}
              maxLongEdge={config.MAX_IMAGE_LONG_EDGE}
              maxBytes={config.MAX_UPLOAD_SIZE_MB * 1024 * 1024}
              attemptsLeft={attemptsLeft}
            />
          ) : (
            <Card className="flex flex-col gap-4 p-5">
              <p className="text-body">
                {state === 'accepted'
                  ? 'Задание уже засчитано вашей команде. Новую фотографию отправить нельзя.'
                  : state === 'in_review'
                    ? 'Фотография по этому заданию уже на проверке. Дождитесь результата.'
                    : state === 'attempts_exhausted'
                      ? 'Попытки по этому заданию закончились.'
                      : session.event.status === 'paused'
                        ? 'Квест приостановлен. Отправка временно недоступна.'
                        : 'Квест завершён — новые отправки закрыты.'}
              </p>
              <ButtonLink href="/tasks" variant="secondary" className="self-start">
                К другим заданиям
              </ButtonLink>
            </Card>
          )}
        </div>

        {/* ═══ Отказ от карточки ════════════════════════════
            Отдельно от блока отправки и ниже него: действие
            необратимое, и соседство с «Выбрать из галереи» —
            прямой путь к промаху пальцем. Показывается только
            когда отказываться есть от чего: карточка на руке,
            отправок по ней не было, квест идёт. */}
        {canDecline && <DeclineTask taskId={task.id} taskTitle={task.title} />}

        {/* ═══ После отправки ═══════════════════════════════
            Открывается только когда отправка уже сделана, поэтому
            подсказкой служить не может. Ради этого блок и есть:
            квест заканчивается не кнопкой «отправить», а тем, что
            человек узнал место, мимо которого ходил год. */}
        {latestSubmission && (task.afterword || task.afterword_url) && (
          <Card className="mt-8 flex flex-col gap-3 p-5">
            <h2 className="signal-label flex items-center gap-2 text-micro text-signal">
              <Icon name="info" size={14} />
              Что это было
            </h2>

            {task.afterword && (
              <p className="whitespace-pre-line text-body text-muted">{task.afterword}</p>
            )}

            {task.afterword_url && (
              <a
                href={task.afterword_url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline-slide inline-flex items-center gap-2 self-start text-body"
              >
                {task.afterword_url_label || 'Читать дальше'}
                <Icon name="open" size={14} />
              </a>
            )}
          </Card>
        )}
      </div>

      <LiveRefresh
        active={
          latestSubmission !== null &&
          ['pending', 'checking', 'manual_review'].includes(latestSubmission.status)
        }
      />
      <BottomNav />
    </div>
  );
}
