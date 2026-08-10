import Link from 'next/link';
import { Notice } from '@/components/ui/feedback';
import { Reveal } from '@/components/ui/reveal';
import { Hero } from '@/components/landing/hero';
import { SectionHead } from '@/components/landing/section-head';
import { TaskCardDemo } from '@/components/landing/task-card-demo';
import { TicketCta } from '@/components/landing/ticket-cta';
import { QuestMap } from '@/components/game/quest-map';
import { DotCluster } from '@/components/ui/logo';
import {
  formatEventDate,
  formatEventTime,
  formatPrice,
  getActiveTaskCount,
  getCurrentEvent,
  getRegistrationStats,
} from '@/lib/data/event';
import { EVENT_STATUS_TEXT, tasksWord } from '@/lib/messages';
import { TELEGRAM_MANAGER, TELEGRAM_MANAGER_URL } from '@/lib/links';

/**
 * Главная страница · Figma 74:3 (mobile) и 87:2 (desktop hero).
 *
 * Всё, что можно, берётся из базы: дата, время, цена, лимиты,
 * число заданий, граница игрового поля. Ни одной зашитой даты.
 *
 * Пять блоков в порядке макета: герой, примеры карточек, игровое
 * поле, маршрут вечера, регистрация и подвал.
 */

// Данные меняются по ходу регистрации, кэшировать страницу нельзя.
export const dynamic = 'force-dynamic';

/**
 * Маршрут вечера. Времени в базе нет — `events` хранит один
 * `starts_at`, а не расписание, поэтому первая точка получает
 * время оттуда, а остальные описаны относительно неё. Как только
 * организатор пришлёт полный тайминг (content/11-schedule), это
 * место превратится в чтение из таблицы.
 */
function routeStops(startTime: string) {
  return [
    {
      n: '01',
      when: startTime,
      title: 'Старт патруля',
      text: 'Код открывает задания. Команда выходит в центр.',
      accent: false,
    },
    {
      n: '02',
      when: '3–4 часа',
      title: 'Городской квест',
      text: 'Фото, загадки, активы. Баллы считаются на сервере.',
      accent: false,
    },
    {
      n: '03',
      when: 'перед BBQ',
      title: 'Не забудьте закупиться',
      text: 'Вода, еда и всё, что понадобится вашей команде.',
      accent: false,
    },
    {
      n: '04',
      when: 'после финиша',
      title: 'Общий BBQ',
      text: 'Встречаемся, считаем баллы и объявляем результат.',
      accent: true,
    },
  ];
}

export default async function HomePage() {
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-24">
        <p className="signal-label text-label text-signal">Движ-Патруль</p>
        <h1 className="mt-4 text-headline lg:text-display">Мероприятие ещё не опубликовано</h1>
        <p className="mt-4 max-w-prose text-body text-muted">
          Квест готовится. Загляните позже — здесь появятся дата, стоимость и кнопка входа команды.
        </p>
      </div>
    );
  }

  const [taskCount, stats] = await Promise.all([
    getActiveTaskCount(event.id),
    getRegistrationStats(event),
  ]);

  const showCountdown = event.status === 'registration' || event.status === 'live';
  const time = formatEventTime(event);
  const tasksLabel = taskCount ? `${taskCount} ${tasksWord(taskCount)}` : '30–50 заданий';

  const area =
    event.area_latitude !== null &&
    event.area_longitude !== null &&
    event.area_radius_meters !== null
      ? {
          latitude: event.area_latitude,
          longitude: event.area_longitude,
          radiusMeters: event.area_radius_meters,
        }
      : null;

  return (
    <>
      <Hero
        title={event.title}
        subtitle={event.subtitle ?? 'Городской фото-квест'}
        city={event.city}
        date={formatEventDate(event)}
        time={time}
        price={formatPrice(event)}
        startsAt={event.starts_at}
        status={event.status}
        showCountdown={showCountdown}
        primary={
          stats.canRegister
            ? {
                href: TELEGRAM_MANAGER_URL,
                label: 'Создать команду',
                sub: `Telegram · @${TELEGRAM_MANAGER}`,
                external: true,
              }
            : { href: '/rules', label: 'Как это устроено', sub: 'Правила квеста', external: false }
        }
      />

      {!stats.canRegister && (
        <section className="page-well">
          <Notice icon="•">
            {event.status === 'registration' && stats.isFull
              ? `Все ${event.max_teams} мест заняты — набор команд закрыт.`
              : event.status === 'draft' || event.status === 'registration'
                ? 'Набор команд пока закрыт. Следите за анонсом.'
                : `Статус мероприятия: ${EVENT_STATUS_TEXT[event.status] ?? event.status}. Новые команды не набираются.`}
          </Notice>
        </section>
      )}

      {/* ═══ 02 · Примеры заданий · Figma 81:4 ══════════════ */}
      <section className="page-well py-14 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-16">
          <Reveal>
            <SectionHead
              index="02 / Примеры заданий"
              title={
                <>
                  Три типа
                  <br />
                  движения
                </>
              }
              intro="Загадка, фото-повтор или городской актив. Карточка показывает главное сразу, детали — по перевороту."
            />
          </Reveal>

          <Reveal delay={90}>
            <TaskCardDemo />
          </Reveal>
        </div>
      </section>

      {/* ═══ 03 · Игровое поле · Figma 83:2 ═════════════════ */}
      <section className="border-t border-hairline bg-canvas-deep py-14 lg:py-24">
        <div className="page-well flex flex-col gap-8">
          <Reveal>
            <SectionHead
              index="03 / Игровое поле"
              title={
                <>
                  Центр —
                  <br />
                  наша доска
                </>
              }
              intro={
                area
                  ? 'Внутри круга — задания. Карту можно двигать и приближать.'
                  : 'Границу поля организатор объявит до старта. Карту можно двигать и приближать.'
              }
            />
          </Reveal>

          <Reveal delay={90}>
            <div className="border border-hairline bg-panel p-2">
              <QuestMap area={area} points={[]} className="h-[340px] lg:h-[460px]" />
              <p className="signal-label px-2 py-3 text-micro text-muted">
                Leipzig / Spielfeld · drag · pinch
              </p>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <dl className="grid grid-cols-3 border border-hairline">
              {[
                { term: 'Маршрут', value: 'свободный', signal: false },
                { term: 'Заданий', value: taskCount ? String(taskCount) : '30–50', signal: true },
                { term: 'Игра', value: '3–4 ч', signal: false },
              ].map((fact, index) => (
                <div
                  key={fact.term}
                  className={`flex flex-col items-center gap-1 px-2 py-4 ${
                    index > 0 ? 'border-l border-hairline' : ''
                  }`}
                >
                  <dd
                    className={`display-figure text-title ${fact.signal ? 'text-signal' : 'text-ink'}`}
                  >
                    {fact.value}
                  </dd>
                  <dt className="signal-label text-micro text-muted">{fact.term}</dt>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ═══ 04 · Маршрут вечера · Figma 84:2 ═══════════════
          Единственная светлая секция на сайте. Инверсия здесь
          не украшение: маршрут — это то, что читают заранее и
          вслух, и на светлом длинный список читается легче. */}
      <section className="bg-[#f5f5f1] py-14 lg:py-24">
        <div className="page-well flex flex-col gap-8">
          <Reveal>
            <SectionHead
              tone="paper"
              index="04 / Маршрут вечера"
              title={
                <>
                  От старта
                  <br />
                  до углей
                </>
              }
              intro="Четыре понятные точки — без мелкого расписания и лишнего шума."
            />
          </Reveal>

          <ol className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
            {routeStops(time).map((stop, index) => (
              <Reveal
                as="li"
                key={stop.n}
                delay={index * 80}
                className={`flex flex-col gap-2 border p-4 ${
                  stop.accent ? 'border-[#060609] bg-[#060609]' : 'border-[#babab8] bg-[#f5f5f1]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={`display-figure text-caption ${
                      stop.accent ? 'text-signal' : 'text-[#5c5c63]'
                    }`}
                  >
                    {stop.n}
                  </span>
                  <span
                    className={`signal-label text-micro ${
                      stop.accent ? 'text-signal' : 'text-[#060609]'
                    }`}
                  >
                    {stop.when}
                  </span>
                </div>
                <h3 className={`text-title ${stop.accent ? 'text-[#f5f5f1]' : 'text-[#060609]'}`}>
                  {stop.title}
                </h3>
                <p className={`text-caption ${stop.accent ? 'text-[#b8b8ba]' : 'text-[#5c5c63]'}`}>
                  {stop.text}
                </p>
              </Reveal>
            ))}
          </ol>

          {/* Цена BBQ для гостей — Figma 84:37. Значение ждёт
              подтверждения организатора (content/10-bbq-info),
              поэтому ссылка ведёт к менеджеру, а не в оплату. */}
          <Reveal delay={200}>
            <Link
              href={TELEGRAM_MANAGER_URL}
              target="_blank"
              rel="noreferrer"
              className="lift flex min-h-[58px] items-center justify-between gap-4 bg-signal px-4 py-3 text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              <span className="flex flex-col gap-1">
                <span className="signal-label text-micro">Не участвуешь в квесте?</span>
                <span className="display-figure text-title">Приходи на BBQ</span>
              </span>
              <span aria-hidden="true" className="text-title font-bold">
                ↗
              </span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ═══ 05 · Регистрация · Figma 85:2 ══════════════════ */}
      <section className="border-t border-hairline py-14 lg:py-24">
        <div className="page-well flex flex-col gap-6">
          <Reveal>
            <SectionHead
              index="05 / Регистрация"
              title={
                <>
                  Выходим
                  <br />в город?
                </>
              }
            />
          </Reveal>

          <Reveal delay={70}>
            <p className="signal-label text-label text-muted">
              {formatEventDate(event)} · {time} · {event.city}
            </p>
          </Reveal>

          <Reveal delay={110}>
            <dl className="flex items-center justify-between gap-4 border border-hairline bg-panel px-4 py-4">
              <div className="flex flex-col gap-1">
                <dd className="display-figure text-headline text-signal">{formatPrice(event)}</dd>
                <dt className="signal-label text-micro text-muted">с участника</dt>
              </div>
              <div className="flex flex-col items-end gap-1">
                <dd className="display-figure text-headline">
                  {event.max_teams} × {event.team_size}
                </dd>
                <dt className="signal-label text-micro text-muted">команд × человек</dt>
              </div>
            </dl>
          </Reveal>

          <Reveal delay={150}>
            <TicketCta
              href={TELEGRAM_MANAGER_URL}
              label="Записаться"
              sub={`t.me/${TELEGRAM_MANAGER}`}
              external
            />
          </Reveal>

          <Reveal delay={190}>
            <p className="max-w-[46ch] text-body text-muted">
              Напишите Тимуру: согласуем состав, название команды и выдадим код. Аккаунт заводить не
              нужно — на квесте достаточно кода из шести символов и имени.
            </p>
          </Reveal>

          <Reveal delay={230}>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hairline pt-6">
              <DotCluster size={28} />
              <p className="signal-label text-micro text-ink">Менеджер · @{TELEGRAM_MANAGER}</p>
              <p className="signal-label text-micro text-muted">
                {event.city} · {formatEventDate(event)}
              </p>
              <p className="signal-label text-micro text-muted">{tasksLabel}</p>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
