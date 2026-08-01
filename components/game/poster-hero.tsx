import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Герой главной страницы — прямая цитата постера.
 *
 * Порядок и соотношения взяты с макета: тонкая линейка сверху,
 * служебная строка, гигантское название города поверх сепийной
 * фотографии, под ним имя квеста, разряженный подзаголовок между
 * линейками и нижняя строка «ДАТА · СТАРТ · УЧАСТИЕ».
 *
 * Компонент презентационный: ничего не знает про базу и получает
 * готовые строки. Благодаря этому он рендерится и на витрине
 * /design-system с образцовыми данными — там его и проверяют
 * визуально, не поднимая Supabase.
 */

export interface PosterHeroProps {
  city: string;
  title: string;
  subtitle: string;
  /** «15.08» — как в углу постера. */
  dayMonth: string;
  date: string;
  time: string;
  price: string;
  /** «20+ фото-заданий» в нижней строке. */
  tasksNote: string;
  timezoneNote: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/** Плитки коллажа. Наклон задаётся переменной для анимации покачивания. */
const COLLAGE = [
  { src: '/assets/tile-roofs.webp', className: 'left-[1%] top-[24%] w-16 lg:w-24', tilt: '-6deg', delay: '0s' },
  { src: '/assets/tile-tower.webp', className: 'right-[2%] top-[20%] w-14 lg:w-20', tilt: '4deg', delay: '1.4s' },
  { src: '/assets/tile-facade.webp', className: 'left-[3%] top-[42%] w-14 lg:w-20', tilt: '3deg', delay: '2.6s' },
  { src: '/assets/tile-square.webp', className: 'right-[1%] top-[38%] w-16 lg:w-24', tilt: '-4deg', delay: '3.8s' },
];

export function PosterHero({
  city,
  title,
  subtitle,
  dayMonth,
  date,
  time,
  price,
  tasksNote,
  timezoneNote,
  actions,
  children,
}: PosterHeroProps) {
  const [day, month] = dayMonth.split('.');

  return (
    <section className="page-well pt-4">
      <div className="paper-grain relative overflow-hidden rounded-[16px] border border-brick-line bg-canvas-deep">
        {/* ═══ Фотография города ═══════════════════════════════
            На постере дом вырастает снизу, а не заливает лист
            целиком — здесь так же: полоса прижата к нижнему краю
            и растворяется вверх маской. Медленный наезд оживляет
            кадр, тёплая вуаль сверху держит читаемость шрифта. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="anim-kenburns absolute inset-x-0 bottom-0 aspect-[1600/421] min-h-[46%] origin-bottom bg-cover bg-bottom bg-no-repeat"
            style={{
              backgroundImage: 'url(/assets/hero-city.webp)',
              maskImage: 'linear-gradient(to bottom, transparent 0%, #000 22%, #000 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 22%, #000 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(240,219,201,0.5) 0%, rgba(240,219,201,0.3) 42%, rgba(240,219,201,0.74) 80%, rgba(240,219,201,0.93) 100%)',
            }}
          />
        </div>

        {/* ═══ Плитки коллажа ══════════════════════════════════ */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden="true">
          {COLLAGE.map((tile) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={tile.src}
              src={tile.src}
              alt=""
              className={cn('anim-float absolute rounded-[12px] border border-brick-line', tile.className)}
              style={
                {
                  '--tilt': tile.tilt,
                  animationDelay: tile.delay,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        {/* ═══ Содержимое ══════════════════════════════════════ */}
        <div className="relative px-5 pt-5 pb-6 md:px-10 md:pt-7 md:pb-9">
          {/* Верхняя линейка постера с ромбом посередине. */}
          <div className="anim-fade relative mb-5 flex items-center" aria-hidden="true">
            <span className="h-px flex-1 bg-brick-line" />
            <span className="px-3 text-[10px] leading-none text-brick">◆</span>
            <span className="h-px flex-1 bg-brick-line" />
          </div>

          {/* Служебная строка постера */}
          <div className="anim-fade flex items-start justify-between gap-4">
            <span className="poster-label text-caption text-brick">Движ · Патруль</span>
            <span className="poster-figure text-right leading-[0.95] text-brick text-heading-sm">
              {day}
              <span className="mx-0.5 font-normal">/</span>
              <br className="sm:hidden" />
              {month}
            </span>
          </div>

          <div className="anim-draw delay-1 mt-3 h-px w-full bg-brick-line" />

          {/* Название города — самое крупное на постере */}
          <h1 className="anim-headline delay-2 mt-6 text-center text-[clamp(3rem,17vw,11rem)] leading-[0.82] text-brick md:mt-10">
            {city}
          </h1>

          {/* Имя квеста */}
          <p className="anim-headline delay-3 poster-display mt-1 text-center text-[clamp(1.6rem,7vw,4.5rem)] leading-[0.9] text-brick">
            {title}
          </p>

          {/* Разряженный подзаголовок между линейками */}
          <div className="anim-fade delay-4 mt-4 flex items-center justify-center gap-3">
            <span className="h-px w-6 bg-brick-line sm:w-16" />
            <span className="poster-label text-center text-caption text-brick">{subtitle}</span>
            <span className="h-px w-6 bg-brick-line sm:w-16" />
          </div>

          {children && <div className="anim-rise delay-5 mt-7">{children}</div>}

          {actions && (
            <div className="anim-rise delay-5 mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {actions}
            </div>
          )}

          {/* ═══ Нижняя строка постера ═════════════════════════ */}
          <div className="anim-draw delay-5 mt-8 h-px w-full bg-brick-line" />

          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { term: 'Дата', value: date, note: '' },
              { term: 'Старт', value: time, note: timezoneNote },
              { term: 'Участие', value: price, note: 'с человека' },
            ].map((item, index) => (
              <div
                key={item.term}
                className={cn(
                  'anim-rise flex flex-col items-center gap-1',
                  index === 1 && 'border-x border-brick-line',
                  index === 0 && 'delay-3',
                  index === 1 && 'delay-4',
                  index === 2 && 'delay-5',
                )}
              >
                <dd className="poster-figure text-heading-sm text-brick md:text-heading">
                  {item.value}
                </dd>
                <dt className="poster-label text-[11px] text-sepia">{item.term}</dt>
                {item.note && <p className="text-[11px] text-sand">{item.note}</p>}
              </div>
            ))}
          </dl>

          <div className="anim-fade delay-5 mt-5 text-center">
            <span className="poster-label brick-diamond text-[11px] text-brick">{tasksNote}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
