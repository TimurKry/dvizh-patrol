-- ─────────────────────────────────────────────────────────────
-- 0011 — Закрыть функции руки от анонимного вызова
--
-- В 0009 у функций руки выданы права service_role, но не отняты
-- те, что PostgreSQL раздаёт сам: новая функция получает EXECUTE
-- для PUBLIC, а Supabase поверх этого держит в схеме `public`
-- дефолтные привилегии для `anon` и `authenticated`. Явный GRANT
-- ничего не сужает — он только добавляет.
--
-- Что из этого следовало. `get_team_hand(p_team_id)` — SECURITY
-- DEFINER и обходит RLS по построению. Пока она открыта роли
-- `anon`, её можно вызвать одним публичным ключом из браузера:
--
--   POST /rest/v1/rpc/get_team_hand  {"p_team_id": "<чужой uuid>"}
--
-- и прочитать руку любой команды, а `refill_team_hand` ещё и
-- меняет её. Ровно то, что 0009 брался предотвратить: команда
-- должна видеть шесть своих карточек и ничего больше.
--
-- Приложение ходит в обе функции только через service_role
-- (`lib/data/tasks.ts`), поэтому отзыв ничего не ломает.
-- `next_team_color` и `assign_team_color` из клиента не
-- вызываются вовсе: первую дёргает триггер, вторая и есть
-- триггер.
-- ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.get_team_hand(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refill_team_hand(uuid)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_team_color(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_team_color()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hand_size_per_type()     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_team_hand(uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION public.refill_team_hand(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_team_color(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.hand_size_per_type()   TO service_role;

-- Константа, но с изменяемым search_path: линтер Supabase считает
-- это дырой независимо от тела, и он прав — тело правят чаще, чем
-- перечитывают заголовок.
CREATE OR REPLACE FUNCTION public.hand_size_per_type()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 2 $$;

REVOKE ALL ON FUNCTION public.hand_size_per_type() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hand_size_per_type() TO service_role;
