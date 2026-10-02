# База данных

Схема лежит в `supabase/migrations/` и накатывается по порядку
номеров. Каждый файл идемпотентен настолько, насколько это
возможно для DDL.

| Файл                  | Что делает                                                |
| --------------------- | --------------------------------------------------------- |
| `0001_schema.sql`     | Перечисления, таблицы, ограничения, индексы               |
| `0002_functions.sql`  | Атомарные операции: регистрация, отправки, баллы, очередь |
| `0003_views.sql`      | Представления рейтинга и прогресса, заморозка             |
| `0004_rls.sql`        | Row Level Security и права ролей                          |
| `0005_storage.sql`    | Бакеты и политики хранилища                               |
| `0006_seed_event.sql` | Мероприятие и 12 демонстрационных заданий                 |
| `0007_play_area.sql`  | Игровое поле события и его учёт при подтверждении         |

## Перечисления

```
event_status            draft → registration → live ⇄ paused → finished → archived
team_status             pending | confirmed | cancelled
submission_status       draft | uploading | pending | checking | accepted
                        | manual_review | rejected | upload_failed | cancelled
validation_mode         auto | ai | manual
validation_job_status   queued | processing | completed | failed | cancelled
leaderboard_mode        public | team_position_only | hidden | frozen
score_transaction_type  task_accepted | manual_adjustment | bonus
                        | penalty | submission_revoked
```

## Таблицы

### events

Мероприятие. Приложение работает с одним активным, но схема
допускает несколько — новый квест заводится без изменения кода.

Ограничения, которые стоит знать:

```sql
CHECK (max_teams BETWEEN 1 AND 10)
CHECK (team_size BETWEEN 1 AND 4)
CHECK (price_cents >= 0)
CHECK (ai_accept_threshold BETWEEN 0 AND 1)
```

Порог принятия хранится здесь, а не в переменных окружения:
организатор меняет его прямо во время квеста, если видит, что
проверка ошибается.

### teams

```sql
UNIQUE (event_id, join_code)
UNIQUE (event_id, lower(btrim(name))) WHERE status <> 'cancelled'
CHECK (join_code ~ '^[A-Z0-9]{6}$')
```

Второй индекс частичный: отменённая команда освобождает своё
название. Он же требует **юникодной локали базы** — при
`--locale=C` функция `lower()` не понимает кириллицу, и
«Трамвай» с «трамваем» пройдут как разные. На Supabase локаль
корректная; локальный кластер поднимается с `C.UTF-8`.

### team_members

```sql
UNIQUE (team_id) WHERE is_captain          -- ровно один капитан
UNIQUE (team_id, lower(btrim(name)))       -- имена внутри команды различаются
```

### team_sessions

Хранится **только SHA-256 от токена**. Сам токен живёт в
httpOnly cookie и нигде не сохраняется. Утечка таблицы не даёт
войти ни в одну команду.

Единственная таблица без политик RLS вообще: доступ только у
service_role.

### tasks

```sql
UNIQUE (event_id, number)
CHECK (max_attempts >= 1)
CHECK (jsonb_typeof(criteria) = 'array')
CHECK (validation_mode <> 'ai' OR jsonb_array_length(criteria) > 0)
CHECK (NOT require_location
       OR (latitude IS NOT NULL AND longitude IS NOT NULL
           AND radius_meters IS NOT NULL))
```

Последние два — попытка не дать завести бессмысленное задание:
автоматической проверке нечего проверять без критериев, а
проверке геопозиции нечего сравнивать без точки.

### submissions

Две гарантии обеспечены индексами, а не кодом:

```sql
-- одно задание засчитывается команде один раз
CREATE UNIQUE INDEX ON submissions (team_id, task_id)
  WHERE status = 'accepted';

-- повтор после обрыва связи не создаёт вторую отправку
CREATE UNIQUE INDEX ON submissions (team_id, task_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

### score_transactions

**Единственный источник истины по баллам.** Поля
`teams.total_score` не существует намеренно.

```sql
CREATE UNIQUE INDEX ON score_transactions (submission_id)
  WHERE transaction_type = 'task_accepted'
    AND reversed_by_transaction_id IS NULL;
```

Это и есть идемпотентность начисления: одна **действующая**
транзакция на отправку. Отмена заполняет
`reversed_by_transaction_id`, индекс освобождается, и задание
можно принять заново — при этом обе строки остаются в журнале.

### consents

```sql
CHECK (participation_consent AND photo_processing_consent)
```

Участие без согласия на обработку фотографий невозможно.
Публикация в соцсетях — отдельная колонка без ограничения:
её можно не давать.

### Служебные

- `admin_users` — кто администратор. Роль проверяется по этой
  таблице, а не по метаданным токена.
- `admin_audit_log` — журнал административных действий.
- `rate_limits` — счётчики фиксированного окна.
- `leaderboard_snapshots` — снимок для режима «заморожен».
- `validation_jobs` — очередь проверок.

## Функции

Все — `SECURITY DEFINER` с `search_path = ''`, право выполнения
только у `service_role`. Из браузера их не вызвать.

Соглашение о возврате:

```json
{"ok": true,  "...": "данные"}
{"ok": false, "error": "код_ошибки"}
```

Исключения оставлены для настоящих сбоев, а не для бизнес-правил:
«мест нет» — это не ошибка сервера.

| Функция                     | Гарантия                                                                  |
| --------------------------- | ------------------------------------------------------------------------- |
| `register_team`             | Advisory-лок на мероприятие: лимит не пробивается параллельными запросами |
| `join_team`                 | `FOR UPDATE` на команду: пятый участник не пройдёт                        |
| `create_submission_slot`    | Проверка статуса, попыток, идемпотентности                                |
| `confirm_submission`        | Решение о маршруте: принять, в очередь или к человеку                     |
| `accept_submission`         | Идемпотентно: повтор не начисляет второй раз                              |
| `revoke_submission`         | Обратная транзакция, журнал не переписывается                             |
| `adjust_team_score`         | Бонус, штраф, корректировка — с обязательной причиной                     |
| `claim_validation_jobs`     | `SKIP LOCKED` + подбор зависших                                           |
| `fail_validation_job`       | Повтор с задержкой, затем — к человеку                                    |
| `requeue_stale_validations` | Кнопка «обработать зависшие»                                              |
| `freeze_leaderboard`        | Снимок таблицы                                                            |
| `touch_rate_limit`          | Счётчик окна                                                              |

## Представления

| Представление        | Назначение                                                         |
| -------------------- | ------------------------------------------------------------------ |
| `team_scores`        | Сумма журнала по команде                                           |
| `leaderboard`        | Ранжирование: баллы → принятые задания → время последнего          |
| `leaderboard_public` | Только публичные колонки, только при `leaderboard_mode = 'public'` |
| `team_progress`      | Счётчики по статусам отправок                                      |
| `admin_dashboard`    | Сводка для организатора                                            |

`leaderboard_public` намеренно **не** `security_invoker`: оно
обходит RLS нижележащих таблиц, поэтому в нём нет ни кодов
приглашения, ни контактов, ни имён капитанов — только то, что и
так висит на общем экране.

## Row Level Security

Включена на всех таблицах. Права по умолчанию для `anon` и
`authenticated` отозваны и выданы точечно.

| Роль                      | Доступ                                                                |
| ------------------------- | --------------------------------------------------------------------- |
| `service_role`            | Всё. Вся запись идёт отсюда                                           |
| `authenticated` (админ)   | Полный через `is_admin()`                                             |
| `authenticated` (команда) | Чтение своего через `current_team_id()`                               |
| `anon`                    | Опубликованное мероприятие, задания идущего квеста, публичный рейтинг |

Участники не имеют **ни одной** политики INSERT/UPDATE/DELETE.

`is_admin()` обращается к `admin_users` изнутри `SECURITY
DEFINER`, поэтому политика самой таблицы не зацикливается на себе.

## Хранилище

| Бакет                   | Доступ    | Содержимое                    |
| ----------------------- | --------- | ----------------------------- |
| `submission-images`     | приватный | Оригиналы фотографий команд   |
| `submission-previews`   | приватный | Уменьшенные копии для списков |
| `task-reference-images` | приватный | Эталоны заданий               |
| `event-assets`          | публичный | Постер и афиша                |

Путь: `events/{eventId}/teams/{teamId}/tasks/{taskId}/{submissionId}.webp`

Клиент никогда не выбирает путь — его строит сервер и выдаёт
одноразовую подписанную ссылку.

## Локальная база

```bash
npm run db:start     # поднять кластер
npm run db:reset     # пересоздать схему и накатить миграции
npm run db:psql      # psql к тестовой базе
npm run db:stop
```

Скрипт поднимает **чистый PostgreSQL**, а не Supabase, и
накатывает `supabase/local/00-supabase-shim.sql` — заглушки для
ролей, схемы `auth` и `storage`. Shim нужен только локально и на
Supabase не применяется.
