'use client';

import { useActionState } from 'react';
import { updateEventAction, type AdminActionState } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, TextInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { LEADERBOARD_MODE_TEXT } from '@/lib/messages';
import { LEADERBOARD_MODES, type EventRow } from '@/types/database';

const INITIAL: AdminActionState = { ok: false };

/**
 * Настройки мероприятия.
 *
 * Дата вводится в поле datetime-local, то есть в местном времени
 * браузера организатора. Это осознанный компромисс: организатор
 * почти всегда находится в том же поясе, что и квест, а иначе
 * пришлось бы объяснять разницу прямо в форме.
 */
function toLocalInput(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function EventSettingsForm({
  event,
  teamsRegistered,
}: {
  event: EventRow;
  teamsRegistered: number;
}) {
  const [state, formAction, pending] = useActionState(updateEventAction, INITIAL);
  const fields = state.fields ?? {};

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
          <TextInput id="title" name="title" defaultValue={event.title} required />
        </Field>

        <Field label="Подзаголовок" htmlFor="subtitle" error={fields.subtitle}>
          <TextInput id="subtitle" name="subtitle" defaultValue={event.subtitle ?? ''} />
        </Field>

        <Field label="Город" htmlFor="city" required error={fields.city}>
          <TextInput id="city" name="city" defaultValue={event.city} required />
        </Field>

        <Field
          label="Часовой пояс"
          htmlFor="timezone"
          required
          error={fields.timezone}
          hint="Например: Europe/Berlin"
        >
          <TextInput id="timezone" name="timezone" defaultValue={event.timezone} required />
        </Field>

        <Field
          label="Старт"
          htmlFor="startsAt"
          required
          error={fields.startsAt}
          hint={`Показывается участникам в поясе ${event.timezone}`}
        >
          <TextInput
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInput(event.starts_at, event.timezone)}
            required
          />
        </Field>

        <Field label="Цена участия, €" htmlFor="price" error={fields.priceCents}>
          <TextInput
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.5"
            defaultValue={(event.price_cents / 100).toString()}
          />
        </Field>

        <Field
          label="Максимум команд"
          htmlFor="maxTeams"
          required
          error={fields.maxTeams}
          hint={`Сейчас зарегистрировано: ${teamsRegistered}. Ниже этого числа опустить нельзя.`}
        >
          <TextInput
            id="maxTeams"
            name="maxTeams"
            type="number"
            min="1"
            max="10"
            defaultValue={event.max_teams}
            required
          />
        </Field>

        <Field
          label="Человек в команде"
          htmlFor="teamSize"
          required
          error={fields.teamSize}
          hint="От 1 до 6."
        >
          <TextInput
            id="teamSize"
            name="teamSize"
            type="number"
            min="1"
            max="6"
            defaultValue={event.team_size}
            required
          />
        </Field>

        <Field label="Режим рейтинга" htmlFor="leaderboardMode" error={fields.leaderboardMode}>
          <Select
            id="leaderboardMode"
            name="leaderboardMode"
            defaultValue={event.leaderboard_mode === 'frozen' ? 'public' : event.leaderboard_mode}
          >
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
            id="aiAcceptThreshold"
            name="aiAcceptThreshold"
            type="number"
            min="0"
            max="1"
            step="0.01"
            defaultValue={event.ai_accept_threshold}
          />
        </Field>

        <Field
          label="Срок хранения фотографий, дней"
          htmlFor="photoRetentionDays"
          error={fields.photoRetentionDays}
          hint="Указывается на странице конфиденциальности."
        >
          <TextInput
            id="photoRetentionDays"
            name="photoRetentionDays"
            type="number"
            min="1"
            defaultValue={event.photo_retention_days ?? ''}
          />
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
              id="areaLatitude"
              name="areaLatitude"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="51.3397"
              defaultValue={event.area_latitude ?? ''}
            />
          </Field>

          <Field label="Долгота центра" htmlFor="areaLongitude" error={fields.areaLongitude}>
            <TextInput
              id="areaLongitude"
              name="areaLongitude"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="12.3731"
              defaultValue={event.area_longitude ?? ''}
            />
          </Field>

          <Field
            label="Радиус, метров"
            htmlFor="areaRadiusMeters"
            error={fields.areaRadiusMeters}
            hint="От 100 до 20000."
          >
            <TextInput
              id="areaRadiusMeters"
              name="areaRadiusMeters"
              type="number"
              min="100"
              max="20000"
              step="10"
              placeholder="1000"
              defaultValue={event.area_radius_meters ?? ''}
            />
          </Field>
        </div>

        <Checkbox
          name="areaEnforced"
          defaultChecked={event.area_enforced}
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

      <div className="flex flex-col gap-4 border border-hairline bg-panel p-4">
        <Checkbox
          name="registrationOpen"
          defaultChecked={event.registration_open}
          label="Регистрация открыта"
          description="Работает только в статусе «Регистрация»."
        />
        <Checkbox
          name="aiValidationEnabled"
          defaultChecked={event.ai_validation_enabled}
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
