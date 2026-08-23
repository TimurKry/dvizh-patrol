'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveTaskAction, type AdminActionState } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select, TextArea, TextInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { useFormValues } from '@/components/admin/form-values';
import { PolygonDraw, toRing, type DrawPoint } from '@/components/admin/polygon-draw';
import { PointPick } from '@/components/admin/point-pick';
import { TaskFace } from '@/components/game/task-face';
import { Icon } from '@/components/ui/icon';
import {
  TASK_CARD_TYPE_TEXT,
  TASK_CATEGORY_TEXT,
  TASK_DIFFICULTY_TEXT,
  TASK_MAP_MODE_TEXT,
} from '@/lib/messages';
import { asAreaPolygon, pointInPolygon, type PolygonRing } from '@/lib/geo';
import {
  TASK_CARD_TYPES,
  TASK_CATEGORIES,
  TASK_DIFFICULTIES,
  TASK_MAP_MODES,
  type ImageFraming,
  type TaskCardType,
  type TaskMapMode,
  type TaskRow,
} from '@/types/database';

const INITIAL: AdminActionState = { ok: false };

/**
 * Точка внутри поля?
 *
 * Предупреждение, а не запрет: поле может быть не нарисовано, а
 * задание — стоять на самой границе намеренно. Но опечатка в
 * координатах чаще всего выкидывает точку за тысячи километров, и
 * тогда это видно сразу.
 */
function insideGuide(guide: PolygonRing | null | undefined, point: { lat: number; lon: number }) {
  if (!guide || guide.length < 4) return true;
  return pointInPolygon(guide, point.lat, point.lon);
}

/**
 * Редактор задания.
 *
 * Слева форма, справа живая карточка — ровно та, которую увидит
 * команда. Превью здесь не украшение: до него организатор писал
 * вслепую и узнавал, что название не влезло, а короткое описание
 * обрезалось на третьей строке, уже после сохранения. Разметка у
 * превью и у боя одна — `TaskFace`, иначе они разойдутся.
 *
 * Критерии вводятся построчно: писать список в текстовом поле
 * проще, чем добавлять поля по одному. Разбиение на массив
 * происходит на сервере.
 */
export function TaskForm({
  eventId,
  task,
  nextNumber,
  areaGuide,
  referenceImageUrl,
  referenceFraming,
}: {
  eventId: string;
  task?: TaskRow;
  nextNumber: number;
  /** Граница поля — пунктиром под областью задания. */
  areaGuide?: PolygonRing | null;
  /** Первый эталон — чтобы превью показывало настоящую картинку. */
  referenceImageUrl?: string | null;
  /** И в той же рамке, в какой его увидит команда. */
  referenceFraming?: ImageFraming | null;
}) {
  const [state, formAction, pending] = useActionState(saveTaskAction, INITIAL);
  const fields = state.fields ?? {};

  // Подмотать к первому непринятому полю.
  //
  // Форма выше экрана: кнопка внизу, обязательное описание вверху.
  // Отказ без прокрутки выглядел как «нажал — и ничего»: подпись об
  // ошибке появлялась там, куда организатор не смотрит. Фокус
  // вместо простой прокрутки — чтобы читалку тоже переносило к
  // полю, а не только страницу.
  useEffect(() => {
    const first = Object.keys(state.fields ?? {})[0];
    if (!first) return;

    // Область рисуют мышью, поля с таким именем нет — переносим к
    // выбору режима карты, рядом с которым живёт и её ошибка.
    const node = document.getElementById(first === 'areaPolygon' ? 'mapModeSelect' : first);
    if (!(node instanceof HTMLElement)) return;

    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.focus({ preventScroll: true });
  }, [state]);

  // Все поля управляемые. React 19 сбрасывает форму после
  // серверного действия: при отказе введённое описание исчезало —
  // то есть форма наказывала за собственную же придирчивость.
  const form = useFormValues({
    number: String(task?.number ?? nextNumber),
    title: task?.title ?? '',
    shortDescription: task?.short_description ?? '',
    description: task?.description ?? '',
    points: String(task?.points ?? 50),
    category: task?.category ?? 'object_search',
    cardType: task?.card_type ?? 'photo',
    difficulty: task?.difficulty ?? 'medium',
    validationMode: task?.validation_mode ?? 'manual',
    criteria: (task?.criteria ?? []).join('\n'),
    minimumPeople: String(task?.minimum_people ?? 0),
    maxAttempts: String(task?.max_attempts ?? 2),
    radiusMeters: String(task?.radius_meters ?? 150),
    imageCaption: task?.image_caption ?? '',
    landingSlot: String(task?.landing_slot ?? 0),
    backstory: task?.backstory ?? '',
    afterword: task?.afterword ?? '',
    afterwordUrl: task?.afterword_url ?? '',
    afterwordUrlLabel: task?.afterword_url_label ?? '',
    requireLocation: task?.require_location ?? false,
    active: task?.active ?? true,
  });

  const mode = form.values.validationMode;
  const needsLocation = form.values.requireLocation;
  const cardType = form.values.cardType as TaskCardType;

  const [mapMode, setMapMode] = useState<TaskMapMode>(task?.map_mode ?? 'none');

  // Точка задания. Живёт в состоянии, потому что её ставят кликом
  // по карте: числовые поля остаются рядом только для копирования
  // готовых координат.
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(() =>
    task?.latitude != null && task?.longitude != null
      ? { lat: task.latitude, lon: task.longitude }
      : null,
  );

  const [area, setArea] = useState<DrawPoint[]>(() => {
    const parsed = asAreaPolygon(task?.area_polygon);
    if (!parsed) return [];
    return parsed.coordinates[0].slice(0, -1).map(([lon, lat]) => ({ lat, lon }));
  });

  const areaPayload =
    area.length >= 3 ? JSON.stringify({ type: 'Polygon', coordinates: [toRing(area)] }) : '';

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <form action={formAction} className="flex flex-col gap-6" noValidate>
        <input type="hidden" name="eventId" value={eventId} />
        {task && <input type="hidden" name="taskId" value={task.id} />}
        <input type="hidden" name="mapMode" value={mapMode} />
        <input type="hidden" name="areaPolygon" value={areaPayload} />

        {state.message && (
          <Notice
            tone={state.ok ? 'neutral' : 'strong'}
            icon={state.ok ? 'accepted' : 'upload-failed'}
            // Отказ объявляется сразу, а не в порядке очереди:
            // «status» читалка договаривает после текущей фразы, и
            // до сообщения о незаполненном поле дело доходило не
            // всегда.
            role={state.ok ? 'status' : 'alert'}
          >
            {state.message}
          </Notice>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Номер" htmlFor="number" required error={fields.number}>
            <TextInput {...form.field('number')} type="number" min="1" required />
          </Field>

          <Field label="Баллы" htmlFor="points" required error={fields.points}>
            <TextInput {...form.field('points')} type="number" min="0" max="1000" required />
          </Field>
        </div>

        <Field label="Название" htmlFor="title" required error={fields.title}>
          <TextInput {...form.field('title')} required maxLength={140} />
        </Field>

        <Field
          label="Краткое описание"
          htmlFor="shortDescription"
          error={fields.shortDescription}
          hint="Одна строка на карточке. Длиннее трёх строк — обрежется, видно справа."
        >
          <TextInput {...form.field('shortDescription')} maxLength={200} />
        </Field>

        <Field
          label="Полное описание"
          htmlFor="description"
          required
          error={fields.description}
          hint="Что именно нужно сделать и что должно попасть в кадр. Видно на странице задания, а не на карточке."
        >
          <TextArea {...form.field('description')} required rows={6} />
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
          <Select {...form.field('cardType')}>
            {TASK_CARD_TYPES.map((value) => (
              <option key={value} value={value}>
                {/* Внутри <option> живёт только текст: рисунок туда
                    не вставить, и подменять его псевдографикой ради
                    выпадающего списка незачем. */}
                {TASK_CARD_TYPE_TEXT[value].label} — {TASK_CARD_TYPE_TEXT[value].hint}
              </option>
            ))}
          </Select>
        </Field>

        {/* ═══ Карта ══════════════════════════════════════════
            Отдельно от типа карточки. Раньше «загадка» означала
            круг, а «фото» — крест, и выбора не было: круг у
            загадки либо настолько мелкий, что выдаёт ответ, либо
            настолько крупный, что бесполезен. */}
        <fieldset className="flex flex-col gap-4 border border-hairline bg-panel p-4">
          <legend className="signal-label px-2 text-micro text-signal">Карта</legend>

          <Field
            label="Что показать команде"
            htmlFor="mapModeSelect"
            hint={TASK_MAP_MODE_TEXT[mapMode].hint}
            error={fields.areaPolygon}
          >
            <Select
              id="mapModeSelect"
              value={mapMode}
              onChange={(e) => setMapMode(e.target.value as TaskMapMode)}
            >
              {TASK_MAP_MODES.map((value) => (
                <option key={value} value={value}>
                  {TASK_MAP_MODE_TEXT[value].label}
                </option>
              ))}
            </Select>
          </Field>

          {mapMode === 'point' && (
            <div className="flex flex-col gap-3">
              <PointPick value={point} onChange={setPoint} guide={areaGuide ?? null} />

              {/* Числа остаются видны: их копируют из карт, и
                  запрещать вставку было бы вредно. Но набирать их
                  вслепую больше не нужно — карта выше показывает,
                  куда именно они указывают. */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Широта" htmlFor="latitude" required error={fields.latitude}>
                  <TextInput
                    id="latitude"
                    name="latitude"
                    type="number"
                    step="0.000001"
                    value={point?.lat ?? ''}
                    onChange={(e) =>
                      setPoint((current) => ({
                        lat: Number(e.target.value),
                        lon: current?.lon ?? 0,
                      }))
                    }
                  />
                </Field>
                <Field label="Долгота" htmlFor="longitude" required error={fields.longitude}>
                  <TextInput
                    id="longitude"
                    name="longitude"
                    type="number"
                    step="0.000001"
                    value={point?.lon ?? ''}
                    onChange={(e) =>
                      setPoint((current) => ({
                        lat: current?.lat ?? 0,
                        lon: Number(e.target.value),
                      }))
                    }
                  />
                </Field>
              </div>

              {point && !insideGuide(areaGuide, point) && (
                <Notice icon="upload-failed">
                  Точка стоит за границей игрового поля. Проверьте — команда до неё не дойдёт.
                </Notice>
              )}
            </div>
          )}

          {mapMode === 'area' && (
            <div className="flex flex-col gap-3">
              <PolygonDraw
                points={area}
                onChange={setArea}
                guide={areaGuide ?? null}
                height="h-[320px]"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setArea([])}
                  disabled={!area.length}
                >
                  Убрать все точки
                </Button>
                <span className="text-caption text-muted">
                  {area.length >= 3
                    ? `${area.length} точек`
                    : `нужно ещё ${3 - area.length} — иначе область не сохранится`}
                </span>
              </div>
            </div>
          )}

          {mapMode !== 'none' && (
            <p className="text-caption text-faint">
              Координаты и контур живут отдельно от проверки геопозиции ниже: карта говорит, куда
              идти, а проверка — что телефон действительно там.
            </p>
          )}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Категория" htmlFor="category" error={fields.category}>
            <Select {...form.field('category')}>
              {TASK_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {TASK_CATEGORY_TEXT[category]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Сложность" htmlFor="difficulty" error={fields.difficulty}>
            <Select {...form.field('difficulty')}>
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
            <Select {...form.field('validationMode')}>
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
          hint="По одному в строке. Их видит и команда — для загадки это значит, что критерий не должен называть ответ."
        >
          <TextArea
            {...form.field('criteria')}
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
            <TextInput {...form.field('minimumPeople')} type="number" min="0" max="10" />
          </Field>

          <Field label="Попыток" htmlFor="maxAttempts" required error={fields.maxAttempts}>
            <TextInput {...form.field('maxAttempts')} type="number" min="1" max="10" required />
          </Field>
        </div>

        {/* ═══ Картинка ═══════════════════════════════════════ */}
        <Field
          label="Плашка над картинкой"
          htmlFor="imageCaption"
          error={fields.imageCaption}
          hint="«Фото-эталон», «Картина», «Так это выглядело в 1900-м». Пусто — плашки не будет. Сами картинки грузятся отдельным блоком под формой."
        >
          <TextInput {...form.field('imageCaption')} maxLength={60} placeholder="Фото-эталон" />
        </Field>

        {/* ═══ Витрина лендинга ═══════════════════════════════
            Три карточки на главной странице раньше были зашиты в
            код, и любая правка примера упиралась в выкладку. */}
        <fieldset className="flex flex-col gap-4 border border-hairline bg-panel p-4">
          <legend className="signal-label px-2 text-micro text-signal">Витрина лендинга</legend>

          <Field
            label="Слот на главной"
            htmlFor="landingSlot"
            error={fields.landingSlot}
            hint="Три карточки-примера в ряд, слева направо. Один слот — одно задание."
          >
            <Select {...form.field('landingSlot')}>
              <option value="0">Не показывать</option>
              <option value="1">Слот 1 — слева</option>
              <option value="2">Слот 2 — по центру</option>
              <option value="3">Слот 3 — справа</option>
            </Select>
          </Field>

          {form.values.landingSlot !== '0' && (
            <Notice icon="upload-failed">
              Лендинг открыт всем. Всё, что попало в слот, читается до старта: формулировка,
              картинка и точка на карте. Для загадки это значит, что её решат заранее — либо берите
              то, что не жалко раскрыть, либо сделайте выключенное задание специально для витрины:
              выключенное в руки не раздаётся, но на главной показывается.
            </Notice>
          )}
        </fieldset>

        {/* ═══ По дороге ══════════════════════════════════════
            Видно сразу, вместе с условием. До точки идти десять
            минут, и это единственное, что человек успевает
            прочитать по пути. */}
        <fieldset className="flex flex-col gap-4 border border-hairline bg-panel p-4">
          <legend className="signal-label px-2 text-micro text-signal">По дороге</legend>

          <Field
            label="Справка о месте"
            htmlFor="backstory"
            error={fields.backstory}
            hint="Кому памятник, чем известен дом. Видно сразу, вместе с условием — команда читает это, пока идёт."
          >
            <TextArea {...form.field('backstory')} rows={5} maxLength={2000} />
          </Field>

          {cardType === 'riddle' && (
            <Notice icon="upload-failed">
              У загадки справка почти всегда выдаёт ответ: биография рядом с «тот, кто вписал город
              в свою книгу» решает её за команду. Если всё же пишете — не называйте объект.
            </Notice>
          )}
        </fieldset>

        {/* ═══ После отправки ═════════════════════════════════
            Показывается только после того, как команда отправила
            снимок, поэтому подсказкой служить не может. Ради
            этого поле и есть: квест заканчивается не кнопкой
            «отправить», а тем, что человек узнал новое место. */}
        <fieldset className="flex flex-col gap-4 border border-hairline bg-panel p-4">
          <legend className="signal-label px-2 text-micro text-signal">После отправки</legend>

          <p className="text-caption text-muted">
            Команда увидит это, только когда отправит фотографию. До отправки текст закрыт, так что
            подсказкой он не будет.
          </p>

          <Field
            label="Что рассказать"
            htmlFor="afterword"
            error={fields.afterword}
            hint="Пара абзацев о месте: что это, почему интересно."
          >
            <TextArea {...form.field('afterword')} rows={5} maxLength={2000} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ссылка" htmlFor="afterwordUrl" error={fields.afterwordUrl}>
              <TextInput
                {...form.field('afterwordUrl')}
                type="url"
                placeholder="https://ru.wikipedia.org/wiki/…"
              />
            </Field>
            <Field
              label="Подпись ссылки"
              htmlFor="afterwordUrlLabel"
              error={fields.afterwordUrlLabel}
              hint="Пусто — напишем «Читать дальше»."
            >
              <TextInput {...form.field('afterwordUrlLabel')} maxLength={80} />
            </Field>
          </div>
        </fieldset>

        <div className="flex flex-col gap-4 border border-hairline bg-panel p-4">
          <Checkbox
            {...form.flag('requireLocation')}
            label="Требовать геопозицию при отправке"
            description="Браузер спросит разрешение только при отправке этого задания."
          />

          {needsLocation && (
            <>
              {mapMode !== 'point' && (
                <Notice icon="info">
                  Проверка геопозиции сверяет телефон с координатами задания. Сейчас карта у него не
                  «Точка», поэтому координаты нужно указать всё равно — переключите карту на «Точку»
                  или снимите проверку.
                </Notice>
              )}
              <Field
                label="Радиус, м"
                htmlFor="radiusMeters"
                required
                error={fields.radiusMeters}
                hint="К нему добавится погрешность телефона."
              >
                <TextInput {...form.field('radiusMeters')} type="number" min="10" max="20000" />
              </Field>
            </>
          )}

          <Checkbox
            {...form.flag('active')}
            label="Задание активно"
            description="Выключенное задание мгновенно исчезает из списка у всех команд."
          />
        </div>

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? 'Сохраняем…' : task ? 'Сохранить задание' : 'Создать задание'}
        </Button>
      </form>

      {/* ═══ Превью ═════════════════════════════════════════ */}
      {/* Прокрутка внутри липкого блока: карточка с картинкой и
          длинным названием выше экрана ноутбука, и без неё у
          превью срезало бы верх вместе с баллами. */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
        <p className="signal-label flex items-center gap-2 text-micro text-muted">
          <Icon name="open" size={14} />
          Так карточку увидит команда
        </p>

        <TaskFace
          type={cardType}
          mapMode={mapMode}
          kicker={`${TASK_CARD_TYPE_TEXT[cardType].label} / №${form.values.number || '—'}`}
          title={form.values.title || 'Без названия'}
          points={form.values.points || '0'}
          text={form.values.shortDescription}
          place={TASK_MAP_MODE_TEXT[mapMode].place}
          image={
            referenceImageUrl
              ? {
                  src: referenceImageUrl,
                  badge: form.values.imageCaption || undefined,
                  framing: referenceFraming,
                }
              : null
          }
          placeholder={form.values.number || '—'}
          status={{ icon: 'available', text: 'Доступно', tone: 'available' }}
        />

        <p className="text-caption text-faint">
          Обновляется на лету. Рубашка красится в цвет команды, здесь показана лицевая сторона.
        </p>
      </aside>
    </div>
  );
}
