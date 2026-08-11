import type { Metadata } from 'next';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import { BottomNav } from '@/components/nav/bottom-nav';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { Card, Eyebrow, Meta } from '@/components/ui/surface';
import { getTeamHand } from '@/lib/data/tasks';
import { requireTeamSession } from '@/lib/session/require';
import { toPlayArea } from '@/lib/geo';
import type { MapPoint } from '@/components/game/quest-map';

/**
 * Карта квеста.
 *
 * Показывает границы поля и задания с привязкой к месту. Точки
 * есть только у тех заданий, где место задано организатором,
 * то есть где оно и так не является загадкой: «дойдите до
 * фонтана» с зачётом по радиусу. Задания вида «найдите что-то
 * треугольное» координат не имеют и на карте не появляются —
 * иначе карта решала бы их за команду.
 *
 * Список под картой дублирует её содержимое текстом: карта —
 * интерактивный виджет, с которым скринридер бесполезен.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Карта' };

const QuestMap = dynamicImport(
  () => import('@/components/game/quest-map').then((m) => m.QuestMap),
  {
    loading: () => (
      <div className="h-[420px] w-full animate-pulse border border-hairline bg-canvas-deep" />
    ),
  },
);

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} км` : `${meters} м`;
}

export default async function MapPage() {
  const session = await requireTeamSession();
  const area = toPlayArea(session.event);

  // Та же преграда, что и на списке заданий: до старта точки
  // заданий не читаются из базы вовсе. Поле при этом показываем —
  // знать, где будет игра, полезно заранее и ничего не выдаёт.
  const tasksOpen = ['live', 'paused', 'finished'].includes(session.event.status);

  const points: MapPoint[] = [];

  if (tasksOpen) {
    // На карте только рука. Показать точки всего пула значило бы
    // выдать содержание квеста через карту в обход раздачи —
    // ровно то, от чего рука и защищает.
    const items = await getTeamHand(session.event.id, session.teamId, {
      eventLive: session.event.status === 'live',
    });

    for (const item of items) {
      const { task } = item;
      if (task.latitude == null || task.longitude == null) continue;

      // Актив к месту не привязан по определению: «найти пять
      // жёлтых предметов» делается где угодно внутри поля. Если
      // организатор всё же проставил ему координаты, на карту он
      // всё равно не идёт — иначе точка соврала бы, что идти надо
      // именно туда.
      if (task.card_type === 'active') continue;

      points.push({
        id: task.id,
        latitude: task.latitude,
        longitude: task.longitude,
        label: String(task.number),
        title: task.title,
        href: `/tasks/${task.id}`,
        radiusMeters: task.radius_meters,
        // Загадка показывает район, фото — крест. Разница не
        // косметическая: у загадки точное место и есть ответ, и
        // выдать его на карте значит решить задание за команду.
        kind: task.card_type === 'riddle' ? 'zone' : 'cross',
        done: item.state === 'accepted',
      });
    }
  }

  if (!area && points.length === 0) {
    return (
      <div className="page-well with-bottom-nav py-8 md:py-12">
        <Eyebrow>Команда «{session.team.name}»</Eyebrow>
        <h1 className="mt-3 text-headline md:text-headline">Карта</h1>
        <div className="mt-8">
          <EmptyState
            title="Карта пока пуста"
            description={
              tasksOpen
                ? 'Организатор не задал ни игрового поля, ни заданий с привязкой к месту.'
                : 'Задания с привязкой к месту появятся здесь после старта квеста.'
            }
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-well with-bottom-nav py-8 md:py-12">
      <Eyebrow>Команда «{session.team.name}»</Eyebrow>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-headline md:text-headline">Карта</h1>
        {area && (
          <Meta>
            {area.shape === 'polygon'
              ? 'поле обведено по границе'
              : `поле — ${formatDistance(area.radiusMeters)} вокруг центра`}
          </Meta>
        )}
      </div>

      {area && session.event.area_enforced && (
        <div className="mt-6">
          <Notice tone="strong" icon="upload-failed">
            Фотографии принимаются только внутри игрового поля. Отправка попросит геопозицию — без
            неё принять снимок не получится.
          </Notice>
        </div>
      )}

      <div className="mt-6">
        <QuestMap area={area} points={points} />
      </div>

      {points.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-body-lg">Задания на карте</h2>
          <p className="mt-1 text-caption text-faint">
            Здесь только задания с заданным местом. Остальные ищутся по описанию.
          </p>

          <ul className="mt-4 flex flex-col gap-3">
            {points.map((point) => (
              <li key={point.id}>
                <Link href={point.href ?? '#'} className="block">
                  <Card interactive className="flex items-center gap-4">
                    <span className="display-figure shrink-0 text-title text-signal">
                      {point.label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{point.title}</span>
                      {point.radiusMeters && (
                        <span className="block text-caption text-faint">
                          зачёт в радиусе {formatDistance(point.radiusMeters)}
                        </span>
                      )}
                    </span>
                    {point.done && (
                      <span className="shrink-0 text-caption text-muted">принято</span>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-6 text-body text-muted">
          {tasksOpen
            ? 'Ни одно задание не привязано к месту — всё ищется по описанию.'
            : 'Задания откроются в момент старта квеста. Пока на карте только границы поля.'}
        </p>
      )}

      <BottomNav />
    </div>
  );
}
