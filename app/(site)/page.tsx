import Image from 'next/image';
import { ButtonLink } from '@/components/ui/button';
import {
  CARD_INTERACTIVE,
  CARD_SURFACE,
  Card,
  Eyebrow,
  SectionTitle,
} from '@/components/ui/surface';
import { Tag } from '@/components/ui/status-badge';
import { Notice } from '@/components/ui/feedback';
import {
  formatEventDate,
  formatEventDateLong,
  formatEventTime,
  formatPrice,
  getActiveTaskCount,
  getCurrentEvent,
  getRegistrationStats,
} from '@/lib/data/event';
import { EVENT_STATUS_TEXT, tasksWord, teamsWord } from '@/lib/messages';
import { Countdown } from '@/components/game/countdown';
import { PosterHero } from '@/components/game/poster-hero';
import { Ticker } from '@/components/game/ticker';
import { Reveal } from '@/components/ui/reveal';
import { CountUp } from '@/components/ui/count-up';

/**
 * Главная страница.
 *
 * Всё, что можно, берётся из базы: дата, цена, лимиты, число
 * заданий. Тексты-заглушки появляются только если мероприятие
 * ещё не заведено.
 */

// Данные меняются по ходу регистрации, кэшировать страницу нельзя.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-24">
        <Eyebrow>Движ-Патруль</Eyebrow>
        <h1 className="mt-4 text-headline md:text-display">Мероприятие ещё не опубликовано</h1>
        <p className="mt-4 max-w-prose text-body text-muted">
          Квест готовится. Загляните позже — здесь появятся дата, стоимость и кнопка регистрации
          команды.
        </p>
      </div>
    );
  }

  const [taskCount, stats] = await Promise.all([
    getActiveTaskCount(event.id),
    getRegistrationStats(event),
  ]);

  const showCountdown = event.status === 'registration' || event.status === 'live';

  return (
    <>
      {/* ═══ Герой ═══════════════════════════════════════════ */}
      <PosterHero
        city={event.city}
        title={event.title}
        subtitle={event.subtitle ?? 'Городской фото-квест'}
        dayMonth={formatEventDate(event).slice(0, 5)}
        date={formatEventDate(event).slice(0, 5)}
        time={formatEventTime(event)}
        price={formatPrice(event)}
        timezoneNote={event.timezone}
        tasksNote={`${taskCount || '30+'} ${taskCount ? tasksWord(taskCount) : 'заданий'}`}
        actions={
          <>
            {stats.canRegister ? (
              <ButtonLink href="/register" size="lg">
                Создать команду
              </ButtonLink>
            ) : (
              <ButtonLink href="/rules" size="lg">
                Как это устроено
              </ButtonLink>
            )}
            <ButtonLink href="/join" variant="secondary" size="lg">
              Войти по коду
            </ButtonLink>
          </>
        }
      >
        {showCountdown && (
          <div className="flex justify-center">
            <Countdown target={event.starts_at} status={event.status} />
          </div>
        )}
      </PosterHero>

      {!stats.canRegister && (
        <section className="page-well mt-6">
          <Notice icon="•">
            {event.status === 'registration' && stats.isFull
              ? 'Регистрация команд завершена — все доступные места заняты.'
              : event.status === 'draft' || event.status === 'registration'
                ? 'Регистрация пока закрыта. Следите за анонсом.'
                : `Статус мероприятия: ${EVENT_STATUS_TEXT[event.status] ?? event.status}. Новые команды не регистрируются.`}
          </Notice>
        </section>
      )}

      <section className="page-well mt-10">
        <Reveal>
          <p className="mx-auto max-w-prose text-center text-body text-muted">
            Команда до {event.team_size} человек, {taskCount || '30+'}{' '}
            {taskCount ? tasksWord(taskCount) : 'заданий'} по центру Лейпцига и один вечер, который
            потом ещё долго пересказывают. Маршрута нет — вы сами решаете, куда идти.
          </p>
        </Reveal>
      </section>

      {/* ═══ Афишная лента ═══════════════════════════════════ */}
      <Ticker
        className="mt-10"
        items={[
          event.city,
          formatEventDate(event),
          formatEventTime(event),
          `${taskCount || '30+'} ${taskCount ? tasksWord(taskCount) : 'заданий'}`,
          formatPrice(event),
          'Свободный маршрут',
          'После квеста — BBQ',
        ]}
      />

      {/* ═══ Постер ══════════════════════════════════════════ */}
      <section className="page-well mt-12">
        <Reveal>
          <div className="overflow-hidden border border-hairline bg-panel">
            <Image
              src="/assets/dvizh-patrol-poster.jpg"
              alt={`Постер мероприятия «Движ-Патруль», ${event.city}, ${formatEventDate(event)}`}
              width={1122}
              height={1402}
              priority
              sizes="(min-width: 1024px) 900px, 100vw"
              className="mx-auto h-auto w-full max-w-[900px]"
            />
          </div>
        </Reveal>
      </section>

      {/* ═══ Факты ═══════════════════════════════════════════ */}
      <section className="page-well mt-12 md:mt-20">
        <div className="signal-rule mb-6" />
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            {
              term: 'Дата',
              value: formatEventDate(event),
              note: formatEventDateLong(event),
              count: null,
            },
            {
              term: 'Старт',
              value: formatEventTime(event),
              note: `${event.city}, ${event.timezone}`,
              count: null,
            },
            { term: 'Участие', value: formatPrice(event), note: 'с человека', count: null },
            {
              term: 'Задания',
              value: taskCount ? String(taskCount) : '30+',
              note: taskCount ? tasksWord(taskCount) : 'готовятся',
              // Единственная цифра здесь, которая читается как
              // счётчик, — её и оживляем. Остальные — дата, время
              // и цена: набегающие они выглядели бы как сбой.
              count: taskCount || null,
            },
          ].map((fact, index) => (
            /* Обёртка появления и есть карточка: внутри <dl>
               допустим один уровень div вокруг пары dt/dd,
               второй сделал бы разметку невалидной. */
            <Reveal
              key={fact.term}
              delay={index * 70}
              className={`${CARD_SURFACE} ${CARD_INTERACTIVE} flex flex-col gap-1 p-4`}
            >
              <dt className="signal-label text-caption text-faint">{fact.term}</dt>
              <dd className="display-figure text-title text-signal">
                {fact.count ? <CountUp value={fact.count} /> : fact.value}
              </dd>
              <p className="text-caption text-faint">{fact.note}</p>
            </Reveal>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Tag>
            до {event.max_teams} {teamsWord(event.max_teams)}
          </Tag>
          <Tag>до {event.team_size} человек в команде</Tag>
          <Tag>свободный маршрут</Tag>
          <Tag>после квеста — BBQ</Tag>
          {stats.canRegister && (
            <Tag emphasis>
              свободно мест: {stats.free} из {event.max_teams}
            </Tag>
          )}
        </div>
      </section>

      {/* ═══ Как это работает ════════════════════════════════ */}
      <section className="page-well mt-20">
        <Reveal>
          <Eyebrow>Механика</Eyebrow>
          <SectionTitle className="mt-3">Четыре шага, и вы в игре</SectionTitle>
        </Reveal>

        <ol className="mt-8 grid gap-6 md:grid-cols-4">
          {[
            {
              n: '01',
              title: 'Соберите команду',
              text: `Капитан создаёт команду и получает код из шести символов. Остальные входят по этому коду — до ${event.team_size} человек.`,
            },
            {
              n: '02',
              title: 'Откройте задания',
              text: 'В 15:00 список открывается. Порядок любой: берите то, что ближе, или то, что дороже.',
            },
            {
              n: '03',
              title: 'Снимите и отправьте',
              text: 'Фотография уходит на проверку прямо из браузера. Ждать ответа не нужно — идите дальше.',
            },
            {
              n: '04',
              title: 'Следите за рейтингом',
              text: 'Баллы начисляются автоматически. Таблица обновляется по ходу квеста.',
            },
          ].map((step, index) => (
            <Reveal as="li" key={step.n} delay={index * 90} className="flex flex-col gap-2">
              {/* Номер шага и линейка под ним — цитата нижней
                  строки постера, только по вертикали. */}
              <span className="display-figure text-title text-signal">{step.n}</span>
              <span aria-hidden="true" className="h-px w-10 bg-signal-line" />
              <h3 className="text-body-lg font-normal">{step.title}</h3>
              <p className="text-body text-muted">{step.text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ═══ Примеры заданий ═════════════════════════════════ */}
      <section className="page-well mt-20">
        <Reveal>
          <Eyebrow>Что придётся делать</Eyebrow>
          <SectionTitle className="mt-3">Примеры заданий</SectionTitle>
        </Reveal>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              src: '/assets/tile-tower.webp',
              title: 'Повторить памятник',
              text: 'Найти городскую скульптуру и точно воспроизвести позу.',
            },
            {
              src: '/assets/tile-roofs.webp',
              title: 'Оживить знак',
              text: 'Отыскать дорожный знак и разыграть то, что на нём нарисовано.',
            },
            {
              src: '/assets/tile-facade.webp',
              title: 'Найти по описанию',
              text: 'Объект определённой формы, цвета или возраста — без подсказки, где искать.',
            },
            {
              src: '/assets/tile-square.webp',
              title: 'Обменять скрепку',
              text: 'Начать с канцелярской скрепки и выменять что-то стоящее у прохожих.',
            },
            {
              src: '/assets/tile-arcade.webp',
              title: 'Командный кадр',
              text: 'Собрать всю команду в одну композицию в неочевидном месте.',
            },
            {
              src: '/assets/tile-plaza.webp',
              title: 'Городской типаж',
              text: 'Познакомиться с local-персонажем и сфотографироваться с его согласия.',
            },
          ].map((example, index) => (
            <Reveal
              as="article"
              key={`${example.title}-${index}`}
              delay={(index % 3) * 90}
              className="group flex flex-col gap-3"
            >
              <div className="zoom-host border border-hairline">
                <Image
                  src={example.src}
                  alt=""
                  width={320}
                  height={320}
                  className="aspect-4/3 w-full object-cover"
                />
              </div>
              <h3 className="text-body-lg font-normal transition-colors group-hover:text-signal">
                {example.title}
              </h3>
              <p className="text-body text-muted">{example.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ Правила и BBQ ═══════════════════════════════════ */}
      <section className="page-well mt-20 grid gap-6 lg:grid-cols-2">
        <Card interactive className="flex flex-col gap-4 p-6">
          <Eyebrow>Коротко</Eyebrow>
          <h2 className="text-title">Правила</h2>
          <ul className="flex flex-col gap-3 text-body text-muted">
            {[
              'Каждое задание засчитывается команде один раз.',
              'Число попыток задаётся отдельно для каждого задания.',
              'Фотографировать людей — только с их согласия.',
              'Безопасность важнее баллов: не лезьте на конструкции и не нарушайте ПДД.',
              'Результат подтверждает организатор, его решение окончательное.',
            ].map((rule) => (
              <li key={rule} className="flex gap-3">
                <span aria-hidden="true" className="text-faint">
                  —
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <ButtonLink href="/rules" variant="secondary" size="sm" className="self-start">
            Полные правила
          </ButtonLink>
        </Card>

        <Card interactive className="flex flex-col gap-4 p-6">
          <Eyebrow>После финиша</Eyebrow>
          <h2 className="text-title">BBQ</h2>
          <p className="text-body text-muted">
            Когда последняя фотография отправлена, а рейтинг заморожен, начинается вторая часть
            вечера — барбекю. Там же объявляются результаты и разбираются самые спорные кадры.
          </p>
          <p className="text-body text-muted">
            Участие в BBQ входит в стоимость. Если у вас есть ограничения по еде, предупредите
            организатора заранее.
          </p>
        </Card>
      </section>

      <div className="h-20" />
    </>
  );
}
