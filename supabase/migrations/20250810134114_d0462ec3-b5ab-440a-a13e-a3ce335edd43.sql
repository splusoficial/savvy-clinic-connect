
-- Remove as views (seguras se não existirem)
DROP VIEW IF EXISTS public.auth_codes_analytics;
DROP MATERIALIZED VIEW IF EXISTS public.auth_codes_analytics;

DROP VIEW IF EXISTS public.auth_codes_status;
DROP MATERIALIZED VIEW IF EXISTS public.auth_codes_status;
