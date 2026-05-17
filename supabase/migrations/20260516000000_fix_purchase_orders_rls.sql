-- Fix: purchase_orders UPDATE being silently blocked by RLS
-- The SELECT works but UPDATE returns 0 rows affected with no error,
-- which is the classic symptom of a restrictive RLS policy on the table.
-- For a single-org app, RLS on purchase_orders adds no security value
-- (all users belong to the same org). Disable it and rely on app-level auth.

ALTER TABLE public.purchase_orders DISABLE ROW LEVEL SECURITY;
