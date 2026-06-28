-- migration: 20260627000000_make_investor_email_optional.sql
-- Remove the NOT NULL constraint from email column in investors table
-- Email remains UNIQUE to prevent duplicate emails when provided

ALTER TABLE public.investors
ALTER COLUMN email DROP NOT NULL;
