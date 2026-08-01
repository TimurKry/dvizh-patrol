import Image from 'next/image';
import { ButtonLink } from '@/components/ui/button';
import { Card, Eyebrow, SectionTitle } from '@/components/ui/surface';
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

/**
 * Главная страница.
 *
 * Всё, что можно, берётся из базы: дата, цена, лимиты, число
 * заданий. Тексты-заглушки появляются только если мероприятие
 * ещё не заведено.
 */

// Данные меняются по ходу регистрации, кэшировать страницу нельзя.
export const dynamic = 'force-dynamic';

const COLLAGE = [
  { src: '/assets/tile-letters.webp', className: 'left-[2%] top-[6%] w-20 md:w-28 -rotate-6' },
  { src: '/assets/tile-tower.webp', className: 'right-[4%] top-[12%] w-16 md:w-24 rotate-3' },
  { src: '/assets/tile-facade.webp', className: 'left-[6%] bottom-[16%] w-16 md:w-24 rotate-2' },
  { src: '/assets/tile-square.webp', className: 'right-[2%] bottom-[10%] w-20 md:w-28 -rotate-3' },
];

export default async function HomePage() {
  const event = await getCurrentEvent();

  if (!event) {
    return (
      <div className="page-well py-24">
        <Eyebrow>Движ-Патруль</Eyebrow>
        <h1 className="mt-4 text-heading-lg md:text-display">Мероприятие ещё не опубликовано</h1>
        <p className="mt-4 max-w-prose text-body text-stone">
          Квест готовится. Загляните позже — здесь появятся дата, стоимость и кнопка
          регистрации команды.
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
      <section className="relative overflow-hidden pt-8 pb-16 md:pt-16 md:pb-24">
        {/* Плитки-полароиды по периметру. Декоративны, поэтому
            скрыты от программ чтения с экрана. */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden="true">
          {COLLAGE.map((tile) => (
            <Image
              key={tile.src}
              src={tile.src}
              alt=""
              width={320}
              height={320}
              className={`absolute rounded-[12px] ${tile.className}`}
            />
          ))}
        </div>

        <div className="page-well relative">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>{event.city}</Eyebrow>

            <h1 className="mt-4 text-[52px] leading-[0.9] tracking-[-2.6px] md:text-display-xl">
              Движ-Патруль
            </h1>

            <p className="mt-5 text-subheading text-stone md:text-heading-sm">
              {event.subtitle ?? 'Городской фото-квест'}
            </p>

            <p className="mx-auto mt-6 max-w-prose text-body text-stone">
              Команда до {event.team_size} человек, {taskCount || '30+'}{' '}
              {taskCount ? tasksWord(taskCount) : 'заданий'} по центру Лейпцига и один вечер,
              который потом ещё долго пересказывают. Маршрута нет — вы сами решаете, куда идти.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
            </div>

            {!stats.canRegister && (
              <div className="mt-6">
                <Notice icon="•" className="text-left">
                  {event.status === 'registration' && stats.isFull
                    ? 'Регистрация команд завершена — все доступные места заняты.'
                    : event.status === 'draft' || event.status === 'registration'
                      ? 'Регистрация пока закрыта. Следите за анонсом.'
                      : `Статус мероприятия: ${EVENT_STATUS_TEXT[event.status] ?? event.status}. Новые команды не регистрируются.`}
                </Notice>
              </div>
            )}

            {showCountdown && (
              <div className="mt-8">
                <Countdown target={event.starts_at} status={event.status} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ Постер ══════════════════════════════════════════ */}
      <section className="page-well">
        <div className="overflow-hidden rounded-[16px] border border-hairline bg-paper-white">
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
      </section>

      {/* ═══ Факты ═══════════════════════════════════════════ */}
      <section className="page-well mt-12 md:mt-20">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { term: 'Дата', value: formatEventDate(event), note: formatEventDateLong(event) },
            { term: 'Старт', value: formatEventTime(event), note: `${event.city}, ${event.timezone}` },
            { term: 'Участие', value: formatPrice(event), note: 'с человека' },
            {
              term: 'Задания',
              value: taskCount ? String(taskCount) : '30+',
              note: taskCount ? tasksWord(taskCount) : 'готовятся',
            },
          ].map((fact) => (
            <Card key={fact.term} className="flex flex-col gap-1">
              <dt className="text-caption text-stone">{fact.term}</dt>
              <dd className="text-heading-sm font-normal tracking-[-0.48px]">{fact.value}</dd>
              <p className="text-caption text-pebble">{fact.note}</p>
            </Card>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Tag>до {event.max_teams} {teamsWord(event.max_teams)}</Tag>
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
        <Eyebrow>Механика</Eyebrow>
        <SectionTitle className="mt-3">Четыре шага, и вы в игре</SectionTitle>

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
          ].map((step) => (
            <li key={step.n} className="flex flex-col gap-2">
              <span className="text-caption font-medium text-pebble">{step.n}</span>
              <h3 className="text-subheading font-normal">{step.title}</h3>
              <p className="text-body text-stone">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ═══ Примеры заданий ═════════════════════════════════ */}
      <section className="page-well mt-20">
        <Eyebrow>Что придётся делать</Eyebrow>
        <SectionTitle className="mt-3">Примеры заданий</SectionTitle>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              src: '/assets/tile-tower.webp',
              title: 'Повторить памятник',
              text: 'Найти городскую скульптуру и точно воспроизвести позу.',
            },
            {
              src: '/assets/tile-letters.webp',
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
              src: '/assets/tile-title.webp',
              title: 'Командный кадр',
              text: 'Собрать всю команду в одну композицию в неочевидном месте.',
            },
            {
              src: '/assets/tile-tower.webp',
              title: 'Городской типаж',
              text: 'Познакомиться с local-персонажем и сфотографироваться с его согласия.',
            },
          ].map((example, index) => (
            <article key={`${example.title}-${index}`} className="flex flex-col gap-3">
              <div className="overflow-hidden rounded-[12px] border border-hairline">
                <Image
                  src={example.src}
                  alt=""
                  width={320}
                  height={320}
                  className="aspect-4/3 w-full object-cover"
                />
              </div>
              <h3 className="text-subheading font-normal">{example.title}</h3>
              <p className="text-body text-stone">{example.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ═══ Правила и BBQ ═══════════════════════════════════ */}
      <section className="page-well mt-20 grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-6">
          <Eyebrow>Коротко</Eyebrow>
          <h2 className="text-heading-sm">Правила</h2>
          <ul className="flex flex-col gap-3 text-body text-stone">
            {[
              'Каждое задание засчитывается команде один раз.',
              'Число попыток задаётся отдельно для каждого задания.',
              'Фотографировать людей — только с их согласия.',
              'Безопасность важнее баллов: не лезьте на конструкции и не нарушайте ПДД.',
              'Результат подтверждает организатор, его решение окончательное.',
            ].map((rule) => (
              <li key={rule} className="flex gap-3">
                <span aria-hidden="true" className="text-pebble">
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

        <Card className="flex flex-col gap-4 p-6">
          <Eyebrow>После финиша</Eyebrow>
          <h2 className="text-heading-sm">BBQ</h2>
          <p className="text-body text-stone">
            Когда последняя фотография отправлена, а рейтинг заморожен, начинается вторая часть
            вечера — барбекю. Там же объявляются результаты и разбираются самые спорные кадры.
          </p>
          <p className="text-body text-stone">
            Участие в BBQ входит в стоимость. Если у вас есть ограничения по еде, предупредите
            организатора заранее.
          </p>
        </Card>
      </section>

      <div className="h-20" />
    </>
  );
}
