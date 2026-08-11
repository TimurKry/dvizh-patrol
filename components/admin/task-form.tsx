'use client';

import { useActionState, useState } from 'react';
import { saveTaskAction, type AdminActionState } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { TASK_CARD_TYPE_TEXT, TASK_CATEGORY_TEXT, TASK_DIFFICULTY_TEXT } from '@/lib/messages';
import {
  TASK_CARD_TYPES,
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  type TaskRow,
} from '@/types/database';

const INITIAL: AdminActionState = { ok: false };

/**
 * Редактор задания.
 *
 * Критерии вводятся построчно: организатору проще писать список
 * в текстовом поле, чем добавлять поля по одному. Разбиение на
 * массив происходит на сервере.
 */
export function TaskForm({
  eventId,
  task,
  nextNumber,
}: {
  eventId: string;
  task?: TaskRow;
  nextNumber: number;
}) {
  const [state, formAction, pending] = useActionState(saveTaskAction, INITIAL);
  const fields = state.fields ?? {};

  const [mode, setMode] = useState(task?.validation_mode ?? 'manual');
  const [needsLocation, setNeedsLocation] = useState(task?.require_location ?? false);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="eventId" value={eventId} />
      {task && <input type="hidden" name="taskId" value={task.id} />}

      {state.message && (
        <Notice tone={state.ok ? 'neutral' : 'strong'} icon={state.ok ? '✓' : '!'} role="status">
          {state.message}
        </Notice>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Номер" htmlFor="number" required error={fields.number}>
          <TextInput
            id="number"
            name="number"
            type="number"
            min="1"
            defaultValue={task?.number ?? nextNumber}
            required
          />
        </Field>

        <Field label="Баллы" htmlFor="points" required error={fields.points}>
          <TextInput
            id="points"
            name="points"
            type="number"
            min="0"
            max="1000"
            defaultValue={task?.points ?? 50}
            required
          />
        </Field>
      </div>

      <Field label="Название" htmlFor="title" required error={fields.title}>
        <TextInput id="title" name="title" defaultValue={task?.title} required maxLength={140} />
      </Field>

      <Field
        label="Краткое описание"
        htmlFor="shortDescription"
        error={fields.shortDescription}
        hint="Одна строка для карточки в списке."
      >
        <TextInput
          id="shortDescription"
          name="shortDescription"
          defaultValue={task?.short_description ?? ''}
          maxLength={200}
        />
      </Field>

      <Field
        label="Полное описание"
        htmlFor="description"
        required
        error={fields.description}
        hint="Что именно нужно сделать и что должно попасть в кадр."
      >
        <TextArea
          id="description"
          name="description"
          defaultValue={task?.description}
          required
          rows={6}
        />
      </Field>

      {/* Тип карточки стоит выше категории намеренно: он решает,
          в какую треть руки попадёт задание, а категория — только
          метка для фильтров и экспорта. */}
      <Field
        label="Тип карточки"
        htmlFor="cardType"
        required
        hint="Рука команды собирается по два задания каждого типа"
        error={fields.cardType}
      >
        <Select id="cardType" name="cardType" defaultValue={task?.card_type ?? 'photo'}>
          {TASK_CARD_TYPES.map((cardType) => (
            <option key={cardType} value={cardType}>
              {/* Внутри <option> живёт только текст: рисунок туда
                  не вставить, и подменять его псевдографикой ради
                  выпадающего списка незачем. */}
              {TASK_CARD_TYPE_TEXT[cardType].label} — {TASK_CARD_TYPE_TEXT[cardType].hint}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Категория" htmlFor="category" error={fields.category}>
          <Select id="category" name="category" defaultValue={task?.category ?? 'object_search'}>
            {TASK_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {TASK_CATEGORY_TEXT[category]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Сложность" htmlFor="difficulty" error={fields.difficulty}>
          <Select id="difficulty" name="difficulty" defaultValue={task?.difficulty ?? 'medium'}>
            {TASK_DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {TASK_DIFFICULTY_TEXT[difficulty]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Режим проверки"
          htmlFor="validationMode"
          error={fields.validationMode}
          hint={
            mode === 'auto'
              ? 'Принимается сразу после загрузки.'
              : mode === 'ai'
                ? 'Проверяется автоматически, спорное уходит к вам.'
                : 'Каждая фотография попадает к вам.'
          }
        >
          <Select
            id="validationMode"
            name="validationMode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="manual">Только вручную</option>
            <option value="ai">Автоматическая проверка</option>
            <option value="auto">Принимать сразу</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Критерии проверки"
        htmlFor="criteria"
        error={fields.criteria}
        required={mode === 'ai'}
        hint="По одному в строке. Это то, что проверяется по фотографии."
      >
        <TextArea
          id="criteria"
          name="criteria"
          defaultValue={(task?.criteria ?? []).join('\n')}
          rows={5}
          placeholder={'Виден треугольный дорожный знак\nВ кадре минимум два участника'}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Минимум людей в кадре"
          htmlFor="minimumPeople"
          error={fields.minimumPeople}
          hint="0 — если люди не обязательны."
        >
          <TextInput
            id="minimumPeople"
            name="minimumPeople"
            type="number"
            min="0"
            max="10"
            defaultValue={task?.minimum_people ?? 0}
          />
        </Field>

        <Field label="Попыток" htmlFor="maxAttempts" required error={fields.maxAttempts}>
          <TextInput
            id="maxAttempts"
            name="maxAttempts"
            type="number"
            min="1"
            max="10"
            defaultValue={task?.max_attempts ?? 2}
            required
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4 border border-hairline bg-panel p-4">
        <Checkbox
          name="requireLocation"
          checked={needsLocation}
          onChange={(e) => setNeedsLocation(e.target.checked)}
          label="Требовать геопозицию"
          description="Браузер спросит разрешение только при отправке этого задания."
        />

        {needsLocation && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Широта" htmlFor="latitude" required error={fields.latitude}>
              <TextInput
                id="latitude"
                name="latitude"
                type="number"
                step="0.000001"
                defaultValue={task?.latitude ?? ''}
              />
            </Field>
            <Field label="Долгота" htmlFor="longitude" required error={fields.longitude}>
              <TextInput
                id="longitude"
                name="longitude"
                type="number"
                step="0.000001"
                defaultValue={task?.longitude ?? ''}
              />
            </Field>
            <Field
              label="Радиус, м"
              htmlFor="radiusMeters"
              required
              error={fields.radiusMeters}
              hint="К нему добавится погрешность телефона."
            >
              <TextInput
                id="radiusMeters"
                name="radiusMeters"
                type="number"
                min="10"
                max="20000"
                defaultValue={task?.radius_meters ?? 150}
              />
            </Field>
          </div>
        )}

        <Checkbox
          name="active"
          defaultChecked={task?.active ?? true}
          label="Задание активно"
          description="Выключенное задание мгновенно исчезает из списка у всех команд."
        />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Сохраняем…' : task ? 'Сохранить задание' : 'Создать задание'}
      </Button>
    </form>
  );
}
