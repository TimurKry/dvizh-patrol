# Миграции 0008–0019: накатывание и откат

Двенадцать миграций, добавленных при доводке до V3 Mono Signal. Здесь
описано, что каждая делает, чем рискует, как её накатить и как
откатить.

Порядок отката — обратный порядку накатывания: `0019`, `0018`, `0017`, `0016`, `0015`,
`0014`, `0013`, `0012`, `0011`, `0010`, `0009`, `0008`. Пропускать шаги нельзя: `0009` создаёт тип, на
который ссылается колонка, `0010` — ограничение, которое проверяет
колонку из той же миграции, а `0011` правит права функций из
`0009`.

## Накатывание на production

Все двенадцать применены к `mnoytybnurzsbvhyuuxb`: `0008`–`0012` 11.08.2026,
`0013`–`0017` — тогда же, `0018` и `0019` — 23.08.2026, все с
подтверждения владельца. Ниже — порядок
на случай второго контура: тестового проекта, восстановления из
резервной копии, переезда.

На момент наката `0008`–`0012` боевых данных не было вовсе. К
`0013` и `0014` в базе уже лежали две тестовые команды владельца,
восемь отправок и сорок семь заданий — ни одна из двух миграций их
не трогает: `0013` правит только `events.team_size`, `0014`
добавляет колонки со значением по умолчанию. Проверено до наката.

Порядок и проверки одинаковы: цвета
команд раздаст триггер при первой регистрации, `card_type`
проставится из `category` бэкофиллом внутри `0009`, полигон поля
останется пустым до первой отрисовки в админке.

Порядок — строго по возрастанию:

```
supabase/migrations/0008_update_event_schedule.sql
supabase/migrations/0009_card_race.sql
supabase/migrations/0010_play_area_polygon.sql
supabase/migrations/0011_lock_hand_functions.sql
supabase/migrations/0012_move_event_to_september.sql
supabase/migrations/0013_team_size_five.sql
supabase/migrations/0014_task_map_and_afterword.sql
supabase/migrations/0015_image_framing.sql
supabase/migrations/0016_task_backstory.sql
supabase/migrations/0017_landing_slots.sql
supabase/migrations/0018_finish_and_deadline.sql
supabase/migrations/0019_team_size_and_delete.sql
```

`supabase db push` из корня репозитория применит их сам. Через MCP —
по вызову `apply_migration` на файл, в том же порядке.

**Накатывать только при остановленном квесте.** `0009` заменяет
гарантию уникальности принятых отправок: если во время миграции
существуют две принятые отправки разных команд по одному заданию,
индекс `submissions_one_global_accept_key` не создастся и вся
миграция откатится. Проверка перед стартом:

```sql
SELECT task_id, count(*)
FROM public.submissions
WHERE status = 'accepted'
GROUP BY task_id
HAVING count(*) > 1;
```

Пустой результат — можно накатывать.

**Проверка после накатывания:**

```sql
SELECT
  (SELECT starts_at FROM public.events WHERE slug = 'leipzig-2026') AS starts_at,
  to_regclass('public.team_hand') IS NOT NULL AS has_team_hand,
  (SELECT count(*) FROM public.tasks WHERE card_type IS NULL) AS tasks_without_card_type,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'submissions_one_global_accept_key') AS global_accept_index;
```

Ожидается `2026-09-05 12:00:00+00` (14:00 Europe/Berlin), `true`,
`0`, `1`.

Раздавать руки вручную не нужно: `get_team_hand` сам вызывает
`refill_team_hand` при первом чтении, так что команда получает свои
шесть карточек, как только откроет «Задания». Если хочется
прогреть заранее — `SELECT public.refill_team_hand(id) FROM
public.teams;` безопасен и идемпотентен.

Цвета тоже не требуют ручной работы: сама `0009` раздаёт их
командам, существовавшим до накатывания, а дальше это делает
триггер `teams_assign_color` на вставке. Палитра из шести цветов,
команд может быть больше — седьмая и следующие останутся с
`color IS NULL` и нейтральной рубашкой. Это ожидаемо, не ошибка.

## Перед откатом

```sql
-- Слепок того, что потеряется. Выполнить ДО отката.
SELECT id, name, color FROM public.teams;
SELECT id, number, card_type, claimed_by_team_id, claimed_at FROM public.tasks;
SELECT area_polygon FROM public.events;
```

Сохраните результат: восстановить эти значения после отката
неоткуда.

---

## 0011 — права функций руки

**Делает:** отзывает `EXECUTE` у `PUBLIC`, `anon` и
`authenticated` на `get_team_hand`, `refill_team_hand`,
`next_team_color`, `assign_team_color`, `hand_size_per_type`;
оставляет только `service_role`. Заодно добавляет
`SET search_path = ''` в `hand_size_per_type`.

**Зачем:** `0009` выдала права `service_role`, но не отняла те,
что PostgreSQL раздаёт сам — новая функция получает `EXECUTE` для
`PUBLIC`. `get_team_hand` — `SECURITY DEFINER` и обходит RLS по
построению, так что публичным ключом из браузера можно было
прочитать руку любой команды по её `uuid`, а `refill_team_hand`
ещё и изменить. Нашёл линтер Supabase (`get_advisors`) сразу
после наката `0009`.

**Откатывать не нужно и не следует.** Если очень нужно вернуть
прежнее поведение — `GRANT EXECUTE ... TO anon, authenticated`,
но это ровно та дыра, ради которой миграция и написана.

---

## 0010 — игровое поле полигоном

**Добавляет:** `events.area_polygon` (jsonb), ограничение
`events_area_polygon_valid`, функции `is_valid_area_polygon` и
`point_in_area_polygon`. Переписывает ограничение
`events_area_enforced_needs_area`, разрешая строгий режим при
заданном полигоне.

**Что теряется при откате:** нарисованная граница поля. Круг
(`area_latitude`, `area_longitude`, `area_radius_meters`) не
затрагивается и продолжает работать.

```sql
BEGIN;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_area_polygon_valid;
ALTER TABLE public.events DROP COLUMN IF EXISTS area_polygon;

-- Возврат к прежнему условию: строгий режим требует круга.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_area_enforced_needs_area;
ALTER TABLE public.events
  ADD CONSTRAINT events_area_enforced_needs_area CHECK (
    area_enforced = false OR area_latitude IS NOT NULL
  );

DROP FUNCTION IF EXISTS public.point_in_area_polygon(jsonb, double precision, double precision);
DROP FUNCTION IF EXISTS public.is_valid_area_polygon(jsonb);

COMMIT;
```

**Осторожно:** если строгий режим включён, а круга нет, второе
ограничение не создастся. Сначала выключите строгий режим:
`UPDATE public.events SET area_enforced = false;`

---

## 0009 — карточная механика и гонка

**Добавляет:** типы `team_color` и `task_card_type`; колонки
`teams.color`, `tasks.card_type`, `tasks.claimed_by_team_id`,
`tasks.claimed_submission_id`, `tasks.claimed_at`; таблицу
`team_hand`; функции `next_team_color`, `assign_team_color`,
`hand_size_per_type`, `refill_team_hand`, `get_team_hand`;
триггер `teams_assign_color`.

**Переписывает:** `accept_submission` и `revoke_submission`.

**Меняет гарантию:** индекс `submissions_one_accepted_per_task_key`
(одна принятая отправка на пару команда+задание) заменён на
`submissions_one_global_accept_key` (одна принятая отправка на
задание во всём мероприятии).

**Что теряется при откате:** цвета команд, типы карточек, руки,
информация о том, кто какое задание забрал. Начисленные баллы и
журнал `score_transactions` не затрагиваются — они и есть
источник истины по результатам.

**Главный риск:** после отката два разных экземпляра
`accept_submission` начнут вести себя по-разному. Откатывать
`0009` во время идущего квеста нельзя: команды, чьи отправки уже
приняты, сохранят баллы, но задания снова станут доступны всем
остальным.

```sql
BEGIN;

-- Функции возвращаются к версии из 0002. Скопируйте их оттуда
-- целиком: CREATE OR REPLACE поверх текущих определений.
--   supabase/migrations/0002_functions.sql, разделы
--   «accept_submission» и «revoke_submission».

DROP TRIGGER IF EXISTS teams_assign_color ON public.teams;
DROP FUNCTION IF EXISTS public.assign_team_color();
DROP FUNCTION IF EXISTS public.get_team_hand(uuid);
DROP FUNCTION IF EXISTS public.refill_team_hand(uuid);
DROP FUNCTION IF EXISTS public.hand_size_per_type();
DROP FUNCTION IF EXISTS public.next_team_color(uuid);

DROP TABLE IF EXISTS public.team_hand;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_claim_complete;
DROP INDEX IF EXISTS public.tasks_unclaimed_idx;
DROP INDEX IF EXISTS public.tasks_event_card_type_idx;
ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS claimed_at,
  DROP COLUMN IF EXISTS claimed_submission_id,
  DROP COLUMN IF EXISTS claimed_by_team_id,
  DROP COLUMN IF EXISTS card_type;

DROP INDEX IF EXISTS public.teams_event_color_key;
ALTER TABLE public.teams DROP COLUMN IF EXISTS color;

DROP TYPE IF EXISTS public.task_card_type;
DROP TYPE IF EXISTS public.team_color;

-- Возврат прежней, более слабой гарантии.
DROP INDEX IF EXISTS public.submissions_one_global_accept_key;
CREATE UNIQUE INDEX submissions_one_accepted_per_task_key
  ON public.submissions (team_id, task_id)
  WHERE status = 'accepted';

COMMIT;
```

**Если индекс не создаётся,** значит в базе уже есть две принятые
отправки одной команды по одному заданию. Такого быть не должно;
разберитесь с данными до отката.

---

## 0019 — свой размер команды и удаление

**Делает:** добавляет `teams.size_limit` (1..6, NULL — общий из
мероприятия), учит `join_team` сверяться с ним и заводит
`delete_team` — удаление команды со всем следом, разрешённое только
в статусах «Черновик» и «Регистрация».

```sql
DROP FUNCTION IF EXISTS public.delete_team(uuid);
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_size_limit_range;
ALTER TABLE public.teams DROP COLUMN IF EXISTS size_limit;
```

**Функцию `join_team` откатывать отдельно:** заново применить её
определение из `0002_functions.sql`. Если этого не сделать после
удаления колонки, вход по коду упадёт на ссылке на `size_limit`.
Порядок обратный накатыванию: сначала функция, потом колонка.

**Что теряется:** индивидуальные потолки команд. Все возвращаются к
общему числу из настроек мероприятия — команда из шести человек
станет переполненной, но никого не выгонит: проверка стоит только
на входе нового участника.

---

## 0018 — конец игры по времени и место сбора

**Делает:** начинает использовать `events.ends_at` (колонка была в
схеме с самого начала и не читалась нигде) и добавляет место сбора:
`finish_latitude`, `finish_longitude`, `finish_title`,
`finish_address`, `finish_note`, `finish_at` с проверками. Заменяет
`create_submission_slot`: после `ends_at` отправка не создаётся,
ошибка `event_over`.

```sql
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_finish_point_complete;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_finish_latitude_range;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_finish_longitude_range;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_finish_after_start;
ALTER TABLE public.events
  DROP COLUMN IF EXISTS finish_latitude,
  DROP COLUMN IF EXISTS finish_longitude,
  DROP COLUMN IF EXISTS finish_title,
  DROP COLUMN IF EXISTS finish_address,
  DROP COLUMN IF EXISTS finish_note,
  DROP COLUMN IF EXISTS finish_at;
```

**Функцию откатывать отдельно:** заново применить определение
`create_submission_slot` из `0002_functions.sql`. Без этого квест
продолжит закрывать отправки по `ends_at`, а `ends_at` после отката
колонок останется — она из `0001`.

**Осторожно с откатом во время игры.** Если `ends_at` заполнено, а
функцию вернули к старой, окно отправок снова станет бессрочным:
команды смогут досылать фотографии после конца.

---

## 0017 — примеры на лендинге

**Делает:** добавляет `tasks.landing_slot` (1..3) и частичный
уникальный индекс на пару «мероприятие + слот».

```sql
DROP INDEX IF EXISTS tasks_landing_slot_key;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_landing_slot_range;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS landing_slot;
```

**Безопасна к откату:** витрина вернётся к зашитым примерам —
код держит их запасным вариантом ровно на такой случай.

---

## 0016 — что почитать по дороге

**Делает:** добавляет `tasks.backstory` — справку, видную сразу,
рядом с условием.

```sql
ALTER TABLE public.tasks DROP COLUMN IF EXISTS backstory;
```

**Безопасна к откату:** теряются только написанные справки.

---

## 0015 — видимая зона картинки

**Делает:** добавляет `task_reference_images.fit`
(`cover`/`contain`), `focus_x` и `focus_y` со значением 0.5 и
проверками диапазона.

```sql
ALTER TABLE public.task_reference_images
  DROP CONSTRAINT IF EXISTS task_reference_images_focus_range,
  DROP CONSTRAINT IF EXISTS task_reference_images_fit_valid,
  DROP COLUMN IF EXISTS focus_y,
  DROP COLUMN IF EXISTS focus_x,
  DROP COLUMN IF EXISTS fit;
```

**Безопасна к откату:** файлы не трогались вовсе, теряются только
выбранные рамки. Прежняя версия кода режет всё по центру, как
делала раньше.

---

## 0014 — карта задания и материал после отправки

**Делает:** добавляет `tasks.map_mode` (`none`/`point`/`area`),
`tasks.area_polygon`, `image_caption`, `afterword`, `afterword_url`,
`afterword_url_label` и шесть проверок к ним. Бэкофиллом проставляет
`map_mode` по прежнему правилу (точка там, где есть координаты и тип
не «актив») и плашку «Фото-эталон» тем заданиям, у которых эталон
загружен.

```sql
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_afterword_label_needs_url;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_afterword_url_shape;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_map_area_has_polygon;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_map_mode_has_data;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_area_polygon_valid;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_map_mode_valid;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS afterword_url_label,
  DROP COLUMN IF EXISTS afterword_url,
  DROP COLUMN IF EXISTS afterword,
  DROP COLUMN IF EXISTS image_caption,
  DROP COLUMN IF EXISTS area_polygon,
  DROP COLUMN IF EXISTS map_mode;
```

**Осторожно:** откат теряет нарисованные области и тексты
послесловий безвозвратно. Если нужен только откат кода, колонки
можно оставить: прежняя версия приложения их просто не читает, а
карту рисует по типу карточки, как раньше.

Зависит от `0010`: проверка `tasks_area_polygon_valid` вызывает
`is_valid_area_polygon`, созданную там. Откатывать `0010` раньше
`0014` нельзя.

---

## 0013 — команда из пяти человек

**Делает:** расширяет `events_team_size_range` до `1..6`, поднимает
умолчание колонки до `5` и ставит `team_size = 5` боевому
мероприятию.

```sql
UPDATE public.events SET team_size = 4 WHERE slug = 'leipzig-2026';

ALTER TABLE public.events ALTER COLUMN team_size SET DEFAULT 4;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_team_size_range;
ALTER TABLE public.events
  ADD CONSTRAINT events_team_size_range CHECK (team_size BETWEEN 1 AND 4);
```

**Осторожно:** откат сузит ограничение обратно до четырёх, и он
упадёт, если хоть одно мероприятие в базе уже стоит на пяти.
Сначала `UPDATE`, потом `ALTER` — порядок в примере такой не
случайно.

Откатывать после того, как в командах появился пятый участник, не
нужно и вредно: ограничение проверяет `events.team_size`, а не
фактический состав, поэтому лишние участники в базе останутся, но
приложение начнёт считать команды переполненными.

---

## 0012 — перенос на 5 сентября

**Делает:** ставит `starts_at` на 05.09.2026 14:00 Europe/Berlin.
Отменяет дату из `0008`.

```sql
UPDATE public.events
SET starts_at = timestamptz '2026-08-29 14:00:00+02'
WHERE slug = 'leipzig-2026';
```

Дата живёт только в `events` — лендинг, отсчёт, og-превью и
экраны участника читают её оттуда, поэтому и накат, и откат
сводятся к одному `UPDATE`.

---

## 0008 — дата мероприятия

**Делает:** переносит `starts_at` на 29.08.2026 14:00 Europe/Berlin
и обнуляет `poster_path`. Дату потом отменила `0012`; смысл
сохраняет только сброс постера.

```sql
UPDATE public.events
SET starts_at = timestamptz '2026-08-15 15:00:00+02',
    poster_path = 'dvizh-patrol-poster.jpg'
WHERE slug = 'leipzig-2026';
```

**Осторожно:** файл постера удалён из репозитория вместе с
постерной версткой. Возврат `poster_path` имеет смысл только
вместе с откатом кода.

---

## Откат кода без отката базы

Такой порядок безопаснее и почти всегда достаточен: колонки,
добавленные `0009` и `0010`, не мешают предыдущей версии
приложения — она их просто не читает.

Единственное исключение — индекс
`submissions_one_global_accept_key`. Старый код рассчитывает, что
задание может забрать каждая команда, и на второй принятой
отправке получит ошибку уникальности. Если откатываете код во
время квеста, удалите индекс:

```sql
DROP INDEX IF EXISTS public.submissions_one_global_accept_key;
```

Остальное — цвета, типы, руки — останется в базе неиспользованным
и не потеряется, если вы решите вернуться.
