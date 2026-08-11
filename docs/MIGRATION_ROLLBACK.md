# Миграции 0008–0011: накатывание и откат

Четыре миграции, добавленные при доводке до V3 Mono Signal. Здесь
описано, что каждая делает, чем рискует, как её накатить и как
откатить.

Порядок отката — обратный порядку накатывания: `0011`, `0010`,
`0009`, `0008`. Пропускать шаги нельзя: `0009` создаёт тип, на
который ссылается колонка, `0010` — ограничение, которое проверяет
колонку из той же миграции, а `0011` правит права функций из
`0009`.

## Накатывание на production

**Состояние проекта `mnoytybnurzsbvhyuuxb` на 10.08.2026**
(проверено запросом только на чтение):

| Что                     | Значение                        |
| ----------------------- | ------------------------------- |
| последняя миграция      | `play_area` (`0007`)            |
| `0008`, `0009`, `0010`  | не применены                    |
| `events.starts_at`      | `2026-08-15 13:00+00` — старая  |
| `events.status`         | `registration`                  |
| команд / отправок / баллов | `0` / `0` / `0`              |
| заданий                 | `12`                            |

Боевых данных нет, поэтому накатывание ничего не разрушает: цвета
команд раздаст триггер при первой регистрации, `card_type`
проставится из `category` бэкофиллом внутри `0009`, полигон поля
останется пустым до первой отрисовки в админке.

Порядок — строго по возрастанию:

```
supabase/migrations/0008_update_event_schedule.sql
supabase/migrations/0009_card_race.sql
supabase/migrations/0010_play_area_polygon.sql
supabase/migrations/0011_lock_hand_functions.sql
```

`supabase db push` из корня репозитория применит их сам. Через MCP —
три вызова `apply_migration`, по файлу на вызов, в том же порядке.

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

Ожидается `2026-08-29 12:00:00+00` (14:00 Europe/Berlin), `true`,
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

## 0008 — дата мероприятия

**Делает:** переносит `starts_at` на 29.08.2026 14:00 Europe/Berlin
и обнуляет `poster_path`.

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
