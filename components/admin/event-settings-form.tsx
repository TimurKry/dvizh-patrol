'use client';

import { useActionState, useState } from 'react';
import { updateEventAction, type AdminActionState } from '@/actions/admin';
import { useFormValues } from '@/components/admin/form-values';
import { PointPick } from '@/components/admin/point-pick';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { asAreaPolygon, type PolygonRing } from '@/lib/geo';
import { toZonedInput } from '@/lib/time';
import { LEADERBOARD_MODE_TEXT } from '@/lib/messages';
import { LEADERBOARD_MODES, type EventRow } from '@/types/database';

const INITIAL: AdminActionState = { ok: false };

/**
 * Настройки мероприятия.
 *
 * Даты вводятся и показываются в поясе самого мероприятия, а не
 * браузера: организатор может готовить квест из другого города.
 * Преобразование в обе стороны живёт в `lib/time.ts` — пока оно
 * было только в одну, каждое сохранение сдвигало все даты на
 * смещение пояса.
 */
export function EventSettingsForm({
  event,
  teamsRegistered,
}: {
  event: EventRow;
  teamsRegistered: number;
}) {
  const [state, formAction, pending] = useActionState(updateEventAction, INITIAL);
  const fields = state.fields ?? {};

  // Все поля управляемые. React 19 сбрасывает форму после
  // серверного действия, и при отказе всё введённое исчезало на
  // глазах — «нажал сохранить, и данные просто удалились».
  const form = useFormValues({
    title: event.title,
    subtitle: event.subtitle ?? '',
    city: event.city,
    timezone: event.timezone,
    startsAt: toZonedInput(event.starts_at, event.timezone),
    endsAt: event.ends_at ? toZonedInput(event.ends_at, event.timezone) : '',
    price: (event.price_cents / 100).toString(),
    maxTeams: String(event.max_teams),
    teamSize: String(event.team_size),
    leaderboardMode: event.leaderboard_mode === 'frozen' ? 'public' : event.leaderboard_mode,
    aiAcceptThreshold: String(event.ai_accept_threshold),
    photoRetentionDays: event.photo_retention_days?.toString() ?? '',
    areaLatitude: event.area_latitude?.toString() ?? '',
    areaLongitude: event.area_longitude?.toString() ?? '',
    areaRadiusMeters: event.area_radius_meters?.toString() ?? '',
    areaEnforced: event.area_enforced,
    finishTitle: event.finish_title ?? '',
    finishAddress: event.finish_address ?? '',
    finishAt: event.finish_at ? toZonedInput(event.finish_at, event.timezone) : '',
    finishNote: event.finish_note ?? '',
    registrationOpen: event.registration_open,
    aiValidationEnabled: event.ai_validation_enabled,
  });

  // Точка сбора ставится кликом по карте: набирать координаты
  // руками — тот же способ промахнуться на тысячу километров, от
  // которого уже отказались у заданий.
  const [finishPoint, setFinishPoint] = useState<{ lat: number; lon: number } | null>(() =>
    event.finish_latitude != null && event.finish_longitude != null
      ? { lat: event.finish_latitude, lon: event.finish_longitude }
      : null,
  );

  // Граница поля пунктиром под картой: место сбора обычно рядом с
  // полем, и видеть его контур помогает не промахнуться районом.
  const areaGuide: PolygonRing | null = (() => {
    const parsed = asAreaPolygon(event.area_polygon);
    return parsed ? parsed.coordinates[0] : null;
  })();

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="eventId" value={event.id} />

      {state.message && (
        <Notice
          tone={state.ok ? 'neutral' : 'strong'}
          icon={state.ok ? 'accepted' : 'upload-failed'}
          role="status"
        >
          {state.message}
        </Notice>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Название" htmlFor="title" required error={fields.title}>
          <TextInput {...form.field('title')} required />
        </Field>

        <Field label="Подзаголовок" htmlFor="subtitle" error={fields.subtitle}>
          <TextInput {...form.field('subtitle')} />
        </Field>

        <Field label="Город" htmlFor="city" required error={fields.city}>
          <TextInput {...form.field('city')} required />
        </Field>

        <Field
          label="Часовой пояс"
          htmlFor="timezone"
          required
          error={fields.timezone}
          hint="Например: Europe/Berlin"
        >
          <TextInput {...form.field('timezone')} required />
        </Field>

        <Field
          label="Старт"
          htmlFor="startsAt"
          required
          error={fields.startsAt}
          hint={`Показывается участникам в поясе ${form.values.timezone}`}
        >
          <TextInput {...form.field('startsAt')} type="datetime-local" required />
        </Field>

        {/* Конец игры закрывает приём отправок сам, без кнопки.
            Организатор в этот момент сам где-то в городе, и
            рассчитывать, что он нажмёт «Завершить» ровно в срок,
            нельзя. Статус при этом не меняется: квест завершают
            руками, когда все дошли до места сбора. */}
        <Field
          label="Конец игры"
          htmlFor="endsAt"
          error={fields.endsAt}
          hint="Во столько закрывается приём фотографий. Пусто — только по кнопке «Завершить»."
        >
          <TextInput {...form.field('endsAt')} type="datetime-local" />
        </Field>

        <Field label="Цена участия, €" htmlFor="price" error={fields.priceCents}>
          <TextInput {...form.field('price')} type="number" min="0" step="0.5" />
        </Field>

        <Field
          label="Максимум команд"
          htmlFor="maxTeams"
          required
          error={fields.maxTeams}
          hint={`Сейчас зарегистрировано: ${teamsRegistered}. Ниже этого числа опустить нельзя.`}
        >
          <TextInput {...form.field('maxTeams')} type="number" min="1" max="10" required />
        </Field>

        <Field
          label="Человек в команде"
          htmlFor="teamSize"
          required
          error={fields.teamSize}
          hint="От 1 до 6."
        >
          <TextInput {...form.field('teamSize')} type="number" min="1" max="6" required />
        </Field>

        <Field label="Режим рейтинга" htmlFor="leaderboardMode" error={fields.leaderboardMode}>
          <Select {...form.field('leaderboardMode')}>
            {LEADERBOARD_MODES.filter((mode) => mode !== 'frozen').map((mode) => (
              <option key={mode} value={mode}>
                {LEADERBOARD_MODE_TEXT[mode]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Порог автоматической проверки"
          htmlFor="aiAcceptThreshold"
          error={fields.aiAcceptThreshold}
          hint="От 0 до 1. Ниже порога фотография уходит к вам."
        >
          <TextInput
            {...form.field('aiAcceptThreshold')}
            type="number"
            min="0"
            max="1"
            step="0.01"
          />
        </Field>

        <Field
          label="Срок хранения фотографий, дней"
          htmlFor="photoRetentionDays"
          error={fields.photoRetentionDays}
          hint="Указывается на странице конфиденциальности."
        >
          <TextInput {...form.field('photoRetentionDays')} type="number" min="1" />
        </Field>
      </div>

      {/* ═══ Игровое поле ══════════════════════════════════
          Круг на карте: центр и радиус. Пустые поля означают
          «поля нет» — карта тогда не показывается вовсе. */}
      <fieldset className="flex flex-col gap-4 border border-hairline bg-panel p-4">
        <legend className="px-1 text-caption font-medium uppercase tracking-[0.08em] text-muted">
          Игровое поле
        </legend>

        <p className="text-caption text-faint">
          Круг, внутри которого проходит квест. Координаты центра проще всего взять в Google Maps:
          правый клик по точке — первая строка меню. Оставьте пустым, чтобы не показывать карту.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Широта центра" htmlFor="areaLatitude" error={fields.areaLatitude}>
            <TextInput
              {...form.field('areaLatitude')}
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="51.3397"
            />
          </Field>

          <Field label="Долгота центра" htmlFor="areaLongitude" error={fields.areaLongitude}>
            <TextInput
              {...form.field('areaLongitude')}
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="12.3731"
            />
          </Field>

          <Field
            label="Радиус, метров"
            htmlFor="areaRadiusMeters"
            error={fields.areaRadiusMeters}
            hint="От 100 до 20000."
          >
            <TextInput
              {...form.field('areaRadiusMeters')}
              type="number"
              min="100"
              max="20000"
              step="10"
              placeholder="1000"
            />
          </Field>
        </div>

        <Checkbox
          {...form.flag('areaEnforced')}
          label="Строгий режим: не принимать фотографии вне поля"
          description="Потребует геопозицию к каждой фотографии. Команда, запретившая доступ или стоящая в подворотне, не сможет отправить ничего. Без галочки снимок снаружи не отклоняется, а приходит к вам на проверку с пометкой."
        />
        {fields.areaEnforced && (
          <p className="text-caption text-ink" role="alert">
            <span aria-hidden="true">! </span>
            {fields.areaEnforced}
          </p>
        )}
      </fieldset>

      {/* ═══ Место сбора ═══════════════════════════════════
          Квест заканчивается не таблицей, а тем, что все
          встречаются и идут дальше вместе. Пока об этом было
          написано только на лендинге — то есть там, где участник
          в конце игры точно не находится. */}
      <fieldset className="flex flex-col gap-4 border border-hairline bg-panel p-4">
        <legend className="px-1 text-caption font-medium uppercase tracking-[0.08em] text-muted">
          Место сбора после игры
        </legend>

        <p className="text-caption text-faint">
          Откроется у команд, когда время выйдет или вы завершите квест. До этого момента закрыто:
          посреди игры адрес сбора только отвлекает.
        </p>

        <PointPick value={finishPoint} onChange={setFinishPoint} guide={areaGuide} />

        {finishPoint && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-caption text-muted">
              {finishPoint.lat.toFixed(5)}, {finishPoint.lon.toFixed(5)}
            </span>
            <Button type="button" variant="ghost" onClick={() => setFinishPoint(null)}>
              Убрать точку
            </Button>
          </div>
        )}

        <input type="hidden" name="finishLatitude" value={finishPoint?.lat ?? ''} />
        <input type="hidden" name="finishLongitude" value={finishPoint?.lon ?? ''} />
        {fields.finishLatitude && (
          <p className="text-caption text-ink" role="alert">
            <span aria-hidden="true">! </span>
            {fields.finishLatitude}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Название места"
            htmlFor="finishTitle"
            error={fields.finishTitle}
            hint="«Clara-Zetkin-Park, у главного входа»"
          >
            <TextInput {...form.field('finishTitle')} maxLength={120} />
          </Field>

          <Field label="Адрес" htmlFor="finishAddress" error={fields.finishAddress}>
            <TextInput {...form.field('finishAddress')} maxLength={200} />
          </Field>
        </div>

        <Field
          label="Во сколько встречаемся"
          htmlFor="finishAt"
          error={fields.finishAt}
          hint="Обычно позже конца игры: дойти тоже нужно время."
        >
          <TextInput {...form.field('finishAt')} type="datetime-local" />
        </Field>

        <Field
          label="Что сказать команде"
          htmlFor="finishNote"
          error={fields.finishNote}
          hint="Что взять с собой, куда идём дальше, кто скидывается на закупку."
        >
          <TextArea {...form.field('finishNote')} rows={4} maxLength={600} />
        </Field>
      </fieldset>

      <div className="flex flex-col gap-4 border border-hairline bg-panel p-4">
        <Checkbox
          {...form.flag('registrationOpen')}
          label="Регистрация открыта"
          description="Работает только в статусе «Регистрация»."
        />
        <Checkbox
          {...form.flag('aiValidationEnabled')}
          label="Автоматическая проверка включена"
          description="Выключите, чтобы все фотографии шли только к вам. Квест от этого не останавливается."
        />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Сохраняем…' : 'Сохранить настройки'}
      </Button>
    </form>
  );
}
