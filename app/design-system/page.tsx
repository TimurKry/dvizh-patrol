import type { Metadata } from 'next';
import { Button, ButtonLink } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { EmptyState, ErrorNotice, Notice, Skeleton } from '@/components/ui/feedback';
import { DotCluster, Wordmark } from '@/components/ui/logo';
import { StatusBadge, Tag } from '@/components/ui/status-badge';
import { Card, Divider, Eyebrow, SectionTitle } from '@/components/ui/surface';
import { SUBMISSION_STATUSES } from '@/types/database';
import { SUBMISSION_STATUS_TEXT } from '@/lib/messages';

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
  ['--color-canvas', '#f0dbc9', 'Фон страницы', 'Доминирующий цвет постера, 47% площади'],
  ['--color-canvas-deep', '#e7cdb8', 'Полосы', 'Чередующиеся секции и подложки'],
  ['--color-paper', '#faefe5', 'Карточки', 'Теплее холста, но не белый'],
  ['--color-brick', '#9b1c17', 'Акцент', 'Кирпичный с постера. Контраст 6.6:1'],
  ['--color-brick-deep', '#7e150f', 'Нажатие', 'Тёмный кирпич для hover и active'],
  ['--color-brick-soft', '#b6371b', 'Светлый кирпич', 'Буквы на фоне неба'],
  ['--color-ink', '#2b1a14', 'Текст', 'Тёплый тёмный. Контраст 13.4:1'],
  ['--color-sepia', '#6b4636', 'Абзацы', 'Основной текст. Контраст 6.6:1'],
  ['--color-sand', '#8a6a55', 'Подсказки', 'Только крупный текст, 3.9:1'],
] as const;

const SCALE = [
  ['display-xl', 'poster-display text-display-xl text-brick', 'ДВИЖ-ПАТРУЛЬ'],
  ['display', 'poster-display text-display', 'Городской квест'],
  ['heading-lg', 'poster-display text-heading-lg', 'Заголовок раздела'],
  ['heading', 'poster-display text-heading', 'Заголовок страницы'],
  ['heading-sm', 'text-heading-sm', 'Подзаголовок'],
  ['subheading', 'text-subheading', 'Название задания'],
  ['body', 'text-body', 'Основной текст, которым набраны описания и правила.'],
  ['caption', 'text-caption', 'Подпись, метаданные, вспомогательный текст'],
] as const;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-brick-line pt-8">
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
          <span className="poster-label text-caption text-brick">15 / 08</span>
        </div>

        <div className="brick-rule" />

        <Eyebrow>Витрина</Eyebrow>
        <h1 className="text-[52px] leading-[0.9] md:text-display-xl">Дизайн-система</h1>
        <p className="max-w-prose text-body text-sepia">
          Палитра снята пипеткой с утверждённого постера. Страница рендерится без базы —
          на ней проверяется внешний вид и целостность компонентов.
        </p>
      </header>

      {/* ═══ Цвет ═══════════════════════════════════════════ */}
      <Block title="Палитра">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COLORS.map(([token, value, name, note]) => (
            <Card key={token} className="flex gap-3 p-3">
              <div
                className="h-14 w-14 shrink-0 rounded-[12px] border border-hairline"
                style={{ backgroundColor: value }}
              />
              <div className="min-w-0">
                <p className="text-body font-medium">{name}</p>
                <p className="font-mono text-caption text-sepia">{value}</p>
                <p className="mt-1 text-caption text-sand">{note}</p>
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
              <span className="poster-label text-caption text-sand">{name}</span>
              <span className={cls}>{sample}</span>
            </div>
          ))}
        </div>

        <Divider />

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-2">
            <span className="poster-label text-caption text-sand">Плакатный · Oswald</span>
            <span className="poster-figure text-heading">15:00 · 15 € · 30+</span>
            <span className="poster-label text-caption">ДАТА · СТАРТ · УЧАСТИЕ</span>
          </Card>
          <Card className="flex flex-col gap-2">
            <span className="poster-label text-caption text-sand">Текстовый · Literata</span>
            <p className="text-body text-sepia">
              Найдите треугольный знак дорожных работ. Минимум два участника должны повторить
              позу рабочего.
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
        <p className="max-w-prose text-body text-sepia">
          Статус различается тремя независимыми признаками: символ, текст и стиль рамки.
          Только по цвету его определять не нужно — это требование доступности.
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
              <dd className="text-sepia">{SUBMISSION_STATUS_TEXT[status].hint}</dd>
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
              className="text-center text-heading-sm uppercase tracking-[0.3em]"
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

      {/* ═══ Сообщения ══════════════════════════════════════ */}
      <Block title="Сообщения и состояния">
        <Notice icon="•">
          Фото загружено и отправлено на проверку. Можно продолжать квест.
        </Notice>
        <Notice tone="strong" icon="✓">
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
            <p className="text-caption text-sepia">Дата</p>
            <p className="poster-figure text-heading-sm">15.08</p>
            <p className="text-caption text-sand">15 августа 2026</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="text-caption text-sepia">Старт</p>
            <p className="poster-figure text-heading-sm">15:00</p>
            <p className="text-caption text-sand">Leipzig, Europe/Berlin</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="text-caption text-sepia">Участие</p>
            <p className="poster-figure text-heading-sm">15 €</p>
            <p className="text-caption text-sand">с человека</p>
          </Card>
        </div>

        <div className="brick-rule pt-4">
          <p className="poster-label brick-diamond text-caption text-brick">
            20+ фото-заданий
          </p>
        </div>
      </Block>

      {/* ═══ Знак ═══════════════════════════════════════════ */}
      <Block title="Знак">
        <div className="flex items-center gap-8">
          <DotCluster size={18} />
          <DotCluster size={28} className="text-brick" />
          <DotCluster size={44} />
          <Wordmark />
        </div>
        <p className="max-w-prose text-caption text-sepia">
          Восемь точек сеткой 3×3 с пустым центром. На постере тем же ромбом разделены
          надписи в нижней строке.
        </p>
      </Block>

      <footer className="brick-rule py-8">
        <p className="poster-label text-caption text-sand">Движ · Патруль · Leipzig</p>
      </footer>
    </div>
  );
}
