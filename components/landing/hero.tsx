import { Countdown } from '@/components/game/countdown';
import { DotCluster } from '@/components/ui/logo';
import { TicketCta } from './ticket-cta';
import { Polaroid } from './polaroid';
import { TELEGRAM_MANAGER_URL } from '@/lib/links';
import type { EventStatus } from '@/types/database';

/**
 * Герой лендинга.
 *
 * Figma 74:4 на мобильном и 87:2 на десктопе. Композиция одна и
 * та же, меняется только раскладка полароидов: на телефоне они
 * жмутся к краям экрана за титулом, на десктопе разъезжаются по
 * четырём углам и освобождают центр.
 *
 * Полароиды абсолютные и вынесены за поток: они декоративные и
 * не должны влиять на высоту героя. Контент в центре — обычная
 * колонка, поэтому герой растёт под длинную дату или длинное
 * название так же спокойно, как под короткое.
 *
 * Даты в компоненте нет ни одной: всё приходит из `events`.
 */

const POLAROIDS = [
  {
    src: '/assets/polaroid-station.webp',
    caption: 'ВОКЗАЛ / 14:42',
    tilt: '8deg',
    className: 'left-[-12px] top-[178px] w-[124px] lg:left-[2%] lg:top-[16%] lg:w-[186px]',
  },
  {
    src: '/assets/polaroid-center.webp',
    caption: 'ЦЕНТР / 15:06',
    tilt: '-9deg',
    className: 'right-[-14px] top-[170px] w-[122px] lg:right-[3%] lg:top-[10%] lg:w-[178px]',
  },
  {
    src: '/assets/polaroid-tunnel.webp',
    caption: 'СЛЕД № 07',
    tilt: '-7deg',
    className: 'left-[-10px] top-[336px] w-[130px] lg:left-[6%] lg:top-[58%] lg:w-[196px]',
  },
  {
    src: '/assets/polaroid-markt.webp',
    caption: 'НАВЕДЕНИЕ ●',
    tilt: '7deg',
    className: 'right-[-16px] top-[330px] w-[134px] lg:right-[5%] lg:top-[54%] lg:w-[200px]',
    signal: true,
  },
] as const;

export function Hero({
  title,
  subtitle,
  city,
  date,
  time,
  price,
  startsAt,
  status,
  showCountdown,
  primary,
}: {
  title: string;
  subtitle: string;
  city: string;
  date: string;
  time: string;
  price: string;
  startsAt: string;
  status: EventStatus;
  showCountdown: boolean;
  /** Главный CTA меняется, когда регистрация закрыта. */
  primary: { href: string; label: string; sub: string; external: boolean };
}) {
  const [first, ...rest] = title.split(/[-\s]+/);

  return (
    <section className="relative min-h-[820px] overflow-hidden bg-canvas pt-6 pb-14 lg:min-h-[860px] lg:pt-12 lg:pb-24">
      {/* Полароиды — оформление, а не содержание: целиком скрыты
          от скринридера и не мешают порядку чтения.

          Слой абсолютный, но контейнер пропускает нажатия
          насквозь, а сами снимки их ловят: иначе прозрачные поля
          вокруг наклонённой карточки перехватывали бы тапы по
          кнопкам, которые лежат под ними. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
        {POLAROIDS.map((item, index) => (
          <Polaroid
            key={item.src}
            {...item}
            priority={index < 2}
            delay={index * 0.9}
            className={`pointer-events-auto ${item.className}`}
          />
        ))}
      </div>

      <div className="page-well relative z-10 flex flex-col items-center gap-6">
        <DotCluster size={44} className="anim-fade text-ink" />

        {/* Заголовок тянется по ширине экрана, а не по фиксированному
            кеглю: «ПАТРУЛЬ» в Unbounded на 45px не помещается в 390px
            и упирается в край. clamp держит его в колодце на любом
            телефоне и доводит до макетных 72px на десктопе. */}
        <h1 className="anim-headline text-center text-[clamp(34px,10.2vw,45px)] leading-[0.95] lg:text-display-xl">
          <span className="block">{first}</span>
          {rest.length > 0 && <span className="block">{rest.join(' ')}</span>}
        </h1>

        <p className="anim-fade delay-1 text-center">
          <span className="signal-label bg-canvas px-2 py-1 text-[11px] tracking-[0.16em] text-signal sm:text-eyebrow">
            {subtitle}
            <span className="hidden sm:inline"> · {city}</span>
          </span>
        </p>

        <p className="anim-fade delay-2 text-center">
          <span className="signal-label bg-canvas px-2 py-1 text-micro whitespace-nowrap text-muted">
            Наведите на фото — вернётся цвет
          </span>
        </p>

        {/* Воздух под нижнюю пару полароидов. Без него факты и
            отсчёт наезжают на снимки: в Figma между подсказкой
            (y≈300) и полосой фактов (y=508) как раз пустая
            полоса, в которой снимки и живут. */}
        <div aria-hidden="true" className="h-[250px] shrink-0 lg:h-[40px]" />

        {/* ═══ Факты · Figma 79:2 ═══════════════════════════ */}
        <dl className="anim-rise delay-2 mt-2 grid w-full max-w-[560px] grid-cols-3 border border-hairline bg-panel">
          {[
            { term: 'Дата', value: date, signal: false },
            { term: 'Старт', value: time, signal: false },
            { term: 'Участник', value: price, signal: true },
          ].map((fact, index) => (
            <div
              key={fact.term}
              className={`flex flex-col items-center gap-1 px-2 py-3 ${
                index > 0 ? 'border-l border-hairline' : ''
              }`}
            >
              <dd className="display-figure text-title">{fact.value}</dd>
              <dt
                className={`signal-label text-micro ${fact.signal ? 'text-signal' : 'text-muted'}`}
              >
                {fact.term}
              </dt>
            </div>
          ))}
        </dl>

        {/* ═══ Отсчёт · Figma 79:11 ═════════════════════════ */}
        {showCountdown && (
          <div className="anim-rise delay-3 flex w-full flex-col items-center gap-3">
            <p className="signal-label text-label text-muted">До старта осталось</p>
            <Countdown target={startsAt} status={status} />
          </div>
        )}

        {/* ═══ CTA · Figma 79:24 / 79:30 ════════════════════ */}
        <div className="anim-rise delay-4 mt-2 flex w-full max-w-[560px] flex-col gap-4 lg:max-w-[740px] lg:flex-row">
          <TicketCta
            href={primary.href}
            label={primary.label}
            sub={primary.sub}
            external={primary.external}
            className="lg:flex-1"
          />
          <TicketCta
            href="/join"
            label="Войти по коду"
            sub="6 символов · без аккаунта"
            tone="outline"
            className="lg:flex-1"
          />
        </div>

        <p className="signal-label text-center text-micro text-faint">
          Команду заводит менеджер в Telegram: {TELEGRAM_MANAGER_URL.replace('https://', '')}
        </p>
      </div>
    </section>
  );
}
