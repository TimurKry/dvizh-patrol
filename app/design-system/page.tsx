import type { Metadata } from 'next';
import { Button, ButtonLink } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { EmptyState, ErrorNotice, Notice, Skeleton } from '@/components/ui/feedback';
import { DotCluster, Wordmark } from '@/components/ui/logo';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { Card, Divider, Eyebrow, SectionTitle } from '@/components/ui/surface';
import { Ticker } from '@/components/game/ticker';
import { CountUp } from '@/components/ui/count-up';
import { Icon, ICON_NAMES } from '@/components/ui/icon';
import { TaskTypeIcon } from '@/components/game/task-type-icon';
import { SUBMISSION_STATUSES, TASK_CARD_TYPES } from '@/types/database';
import { SUBMISSION_STATUS_TEXT, TASK_CARD_TYPE_TEXT } from '@/lib/messages';
import { TEAM_COLOR_OPTIONS } from '@/lib/team-colors';

/**
 * Витрина дизайн-системы.
 *
 * Нужна по двум причинам. Во-первых, это единственная страница,
 * которая рендерится без базы, — на ней можно проверить внешний
 * вид, не поднимая Supabase. Во-вторых, здесь сразу видно, не
 * разъехались ли компоненты после правки токенов.
 *
 * В продакшене закрыта от индексации.
 */

export const metadata: Metadata = {
  title: 'Дизайн-система',
  robots: { index: false, follow: false },
};

const COLORS = [
  [
    '--color-canvas',
    '#060609',
    'Фон страницы',
    'Почти чёрный, но не #000: на OLED чистый чёрный даёт ореол',
  ],
  ['--color-canvas-deep', '#0b0b0f', 'Полосы', 'Чередующиеся секции и подложки'],
  ['--color-panel', '#121216', 'Поверхность', 'Панели, карточки, поля'],
  ['--color-panel-high', '#1b1b21', 'Второй уровень', 'Строки внутри панели и наведение'],
  ['--color-ink', '#f5f5f1', 'Текст', 'Контраст на холсте 18.7:1'],
  ['--color-muted', '#a3a3a8', 'Абзацы', 'Вторичный текст. Контраст 9.1:1'],
  ['--color-faint', '#83838b', 'Служебное', 'Неактивное. 5.4:1 на холсте, 4.85:1 на панели'],
  ['--color-hairline', '#404045', 'Линия', 'Единственная граница в системе'],
  ['--color-signal', '#ff00b3', 'Сигнал', 'Один акцент на всю систему'],
] as const;

const SCALE = [
  ['display-xl', 'display-figure text-display-xl text-signal', 'ДВИЖ'],
  ['display', 'display-figure text-display', 'ПАТРУЛЬ'],
  ['headline', 'font-display font-bold uppercase text-headline', 'Заголовок раздела'],
  ['title', 'font-display font-bold uppercase text-title', 'Подзаголовок'],
  ['body-lg', 'text-body-lg', 'Название задания'],
  ['body', 'text-body', 'Основной текст, которым набраны описания и правила.'],
  ['caption', 'text-caption', 'Подпись, метаданные, вспомогательный текст'],
  ['eyebrow', 'signal-label text-eyebrow text-signal', 'ГОРОДСКОЙ ФОТО-КВЕСТ'],
  ['label', 'signal-label text-label text-muted', 'ДАТА · СТАРТ · УЧАСТНИК'],
  ['micro', 'signal-label text-micro text-faint', '6 СИМВОЛОВ · БЕЗ АККАУНТА'],
] as const;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-signal-line pt-8">
      <SectionTitle as="h2">{title}</SectionTitle>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="page-well flex flex-col gap-12 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <Wordmark />
          <span className="signal-label text-caption text-signal">05 / 09</span>
        </div>

        <div className="signal-rule" />

        <Eyebrow>Витрина</Eyebrow>
        <h1 className="text-[52px] leading-[0.9] md:text-display-xl">Mono Signal</h1>
        <p className="max-w-prose text-body text-muted">
          Интерфейс чёрно-белый, пурпурный — единственный сигнал. Страница рендерится без базы: на
          ней проверяется внешний вид и целостность компонентов после правки токенов.
        </p>
      </header>

      {/* ═══ Цвета команд ═══════════════════════════════════
          Единственное место в системе, где разрешён цвет помимо
          сигнального. В интерфейс он не выходит: только рубашки
          карточек, орнаменты и командные маркеры. */}
      <Block title="Цвета команд">
        <p className="max-w-prose text-body text-muted">
          Шесть значений хранятся в базе как enum, а hex живут в{' '}
          <code className="font-mono text-caption">lib/team-colors.ts</code>. В интерфейс эти цвета
          не попадают — только на рубашку карточки, орнамент и маркер команды.
        </p>
        <div className="flex flex-wrap gap-3">
          {TEAM_COLOR_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center gap-2 border border-hairline p-2">
              <span
                aria-hidden="true"
                className="block h-8 w-8"
                style={{ backgroundColor: option.hex }}
              />
              <span className="flex flex-col">
                <span className="text-caption">{option.label}</span>
                <span className="font-mono text-micro text-faint">{option.hex}</span>
              </span>
            </div>
          ))}
        </div>
      </Block>

      {/* ═══ Движение ═══════════════════════════════════════ */}
      <Block title="Движение">
        <p className="max-w-prose text-body text-muted">
          Анимируются только <code className="font-mono text-caption">transform</code> и{' '}
          <code className="font-mono text-caption">opacity</code>: браузер считает их на композиторе
          и не пересчитывает раскладку. При включённом «меньше движения» всё замирает в конечном
          состоянии.
        </p>

        <Ticker items={['Leipzig', '05.09', '14:00', '30 заданий', '15 €', 'Свободный маршрут']} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card interactive className="flex flex-col gap-1">
            <span className="signal-label text-caption text-faint">Подъём</span>
            <p className="text-body text-muted">Наведите — карточка приподнимется.</p>
          </Card>
          <Card interactive className="flex flex-col gap-1">
            <span className="signal-label text-caption text-faint">Счётчик</span>
            <p className="display-figure text-headline text-signal">
              <CountUp value={50} />
            </p>
          </Card>
          <Card interactive className="flex flex-col gap-1">
            <span className="signal-label text-caption text-faint">Пульс</span>
            <p className="text-body text-muted">
              <span className="anim-tick inline-block align-[-2px] text-signal">
                <Icon name="checking" size={14} />
              </span>{' '}
              Статус «проверяется» пульсирует.
            </p>
          </Card>
        </div>
      </Block>

      {/* ═══ Цвет ═══════════════════════════════════════════ */}
      <Block title="Палитра">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COLORS.map(([token, value, name, note]) => (
            <Card key={token} className="flex gap-3 p-3">
              <div
                className="h-14 w-14 shrink-0 border border-hairline"
                style={{ backgroundColor: value }}
              />
              <div className="min-w-0">
                <p className="text-body font-medium">{name}</p>
                <p className="font-mono text-caption text-muted">{value}</p>
                <p className="mt-1 text-caption text-faint">{note}</p>
              </div>
            </Card>
          ))}
        </div>
      </Block>

      {/* ═══ Типографика ════════════════════════════════════ */}
      <Block title="Типографика">
        <div className="flex flex-col gap-5">
          {SCALE.map(([name, cls, sample]) => (
            <div key={name} className="flex flex-col gap-1">
              <span className="signal-label text-caption text-faint">{name}</span>
              <span className={cls}>{sample}</span>
            </div>
          ))}
        </div>

        <Divider />

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-2">
            <span className="signal-label text-caption text-faint">Дисплейный · Unbounded</span>
            <span className="display-figure text-headline">14:00 · 15 € · 30+</span>
            <span className="signal-label text-caption">ДАТА · СТАРТ · УЧАСТИЕ</span>
          </Card>
          <Card className="flex flex-col gap-2">
            <span className="signal-label text-caption text-faint">Интерфейсный · Onest</span>
            <p className="text-body text-muted">
              Найдите треугольный знак дорожных работ. Минимум два участника должны повторить позу
              рабочего.
            </p>
          </Card>
        </div>
      </Block>

      {/* ═══ Кнопки ═════════════════════════════════════════ */}
      <Block title="Кнопки">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Создать команду</Button>
          <Button variant="secondary">Войти по коду</Button>
          <Button variant="ghost">Отмена</Button>
          <Button variant="danger">Удалить</Button>
          <Button disabled>Недоступно</Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Мелкая</Button>
          <Button size="md">Обычная</Button>
          <Button size="lg">Крупная</Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/design-system">Ссылка-кнопка</ButtonLink>
          <ButtonLink href="/design-system" variant="secondary">
            Вторичная ссылка
          </ButtonLink>
        </div>
      </Block>

      {/* ═══ Статусы ════════════════════════════════════════ */}
      <Block title="Статусы отправок">
        <p className="max-w-prose text-body text-muted">
          Статус различается тремя независимыми признаками: символ, текст и стиль рамки. Только по
          цвету его определять не нужно — это требование доступности.
        </p>
        <div className="flex flex-wrap gap-2">
          {SUBMISSION_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Tag>категория</Tag>
          <Tag>сложность</Tag>
          <Tag emphasis>50 баллов</Tag>
          <Tag>2 попытки</Tag>
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          {SUBMISSION_STATUSES.slice(2, 7).map((status) => (
            <div key={status} className="flex gap-2 text-caption">
              <dt className="shrink-0 font-medium">{SUBMISSION_STATUS_TEXT[status].label}:</dt>
              <dd className="text-muted">{SUBMISSION_STATUS_TEXT[status].hint}</dd>
            </div>
          ))}
        </dl>
      </Block>

      {/* ═══ Поля ═══════════════════════════════════════════ */}
      <Block title="Поля ввода">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Название команды" htmlFor="ds-name" required hint="До 60 символов">
            <TextInput id="ds-name" placeholder="Ночной трамвай" />
          </Field>

          <Field label="Код команды" htmlFor="ds-code" error="Код состоит из шести символов">
            <TextInput
              id="ds-code"
              invalid
              defaultValue="A1B"
              className="text-center text-title uppercase tracking-[0.3em]"
            />
          </Field>

          <Field label="Категория" htmlFor="ds-select">
            <Select id="ds-select" defaultValue="monuments">
              <option value="monuments">Памятники</option>
              <option value="road_signs">Дорожные знаки</option>
            </Select>
          </Field>

          <Field label="Описание" htmlFor="ds-area">
            <TextArea id="ds-area" rows={3} placeholder="Что нужно сделать" />
          </Field>
        </div>

        <Card className="flex flex-col gap-4">
          <Checkbox
            defaultChecked
            label="Я принимаю правила и согласен на обработку фотографий"
            description="Без этого согласия участие невозможно."
          />
          <Checkbox
            label="Разрешаю публиковать фотографии в социальных сетях"
            description="Необязательно. На баллы не влияет."
          />
        </Card>
      </Block>

      {/* ═══ Значки ═════════════════════════════════════════ */}
      <Block title="Значки">
        <p className="max-w-prose text-body text-muted">
          Один набор — Lucide, сетка 24×24, толщина штриха 2. Значок берётся по имени состояния, а
          не по внешнему виду: в разметке стоит <code className="text-ink">accepted</code>, а не
          «галочка». Поменяется рисунок — не придётся искать его по страницам. Типографские символы
          вроде <code className="text-ink">◇</code> и <code className="text-ink">⁂</code> из
          интерфейса убраны: их подбирали по тому, что нашлось в юникоде, часть отсутствовала в
          Unbounded и молча подменялась чужим начертанием.
        </p>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ICON_NAMES.map((name) => (
            <li
              key={name}
              className="flex items-center gap-3 border border-hairline bg-panel px-3 py-3"
            >
              <Icon name={name} size={18} className="text-signal" />
              <code className="truncate text-caption text-muted">{name}</code>
            </li>
          ))}
        </ul>

        <p className="max-w-prose text-body text-muted">
          Типы заданий живут отдельно: фотоаппарат и бегущие человечки нарисованы от руки, а не
          взяты из набора.
        </p>

        <ul className="flex flex-wrap gap-3">
          {TASK_CARD_TYPES.map((type) => (
            <li
              key={type}
              className="flex items-center gap-3 border border-hairline bg-panel px-4 py-3"
            >
              <TaskTypeIcon type={type} size={26} className="text-signal" />
              <span className="signal-label text-micro text-muted">
                {TASK_CARD_TYPE_TEXT[type].label}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      {/* ═══ Сообщения ══════════════════════════════════════ */}
      <Block title="Сообщения и состояния">
        <Notice icon="info">
          Фото загружено и отправлено на проверку. Можно продолжать квест.
        </Notice>
        <Notice tone="strong" icon="accepted">
          Команда создана. Передайте код остальным участникам.
        </Notice>
        <ErrorNotice>Регистрация команд завершена — все доступные места заняты.</ErrorNotice>

        <EmptyState
          title="Пока ничего не отправлено"
          description="Здесь появятся ваши фотографии и результаты проверки."
          action={<Button size="sm">К заданиям</Button>}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-3">
            <Skeleton className="aspect-4/3 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </Card>
        </div>
      </Block>

      {/* ═══ Карточки ═══════════════════════════════════════ */}
      <Block title="Поверхности">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-2">
            <p className="text-caption text-muted">Дата</p>
            <p className="display-figure text-title">05.09</p>
            <p className="text-caption text-faint">5 сентября 2026</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="text-caption text-muted">Старт</p>
            <p className="display-figure text-title">14:00</p>
            <p className="text-caption text-faint">Leipzig, Europe/Berlin</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="text-caption text-muted">Участие</p>
            <p className="display-figure text-title">15 €</p>
            <p className="text-caption text-faint">с человека</p>
          </Card>
        </div>

        <div className="signal-rule pt-4">
          <p className="signal-label text-caption text-signal">20+ фото-заданий</p>
        </div>
      </Block>

      {/* ═══ Знак ═══════════════════════════════════════════ */}
      <Block title="Знак">
        <div className="flex items-center gap-8">
          <DotCluster size={18} />
          <DotCluster size={28} className="text-signal" />
          <DotCluster size={44} />
          <Wordmark />
        </div>
        <p className="max-w-prose text-caption text-muted">
          Семь точек сеткой 3×3 с пустым центром; восьмая, нижняя правая, набрана сигнальным цветом.
          Из того же знака сделаны иконки PWA.
        </p>
      </Block>

      <footer className="signal-rule py-8">
        <p className="signal-label text-caption text-faint">Движ · Патруль · Leipzig</p>
      </footer>
    </div>
  );
}
