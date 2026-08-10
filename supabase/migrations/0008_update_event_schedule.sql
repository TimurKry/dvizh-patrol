-- Применяется и к уже развёрнутой базе, где 0006 была выполнена
-- со старой датой. Для новых установок то же значение уже стоит
-- непосредственно в 0006_seed_event.sql.

UPDATE public.events
SET starts_at = timestamptz '2026-08-29 14:00:00+02',
    poster_path = NULL
WHERE slug = 'leipzig-2026';
