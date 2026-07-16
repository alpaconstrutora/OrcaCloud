-- ============================================================
-- Migration: 20270208000000_opura_folders_naming_mask_disciplines.sql
-- Corrige schema drift: as colunas `naming_mask` e `disciplines` de
-- public.opura_folders eram lidas/gravadas pelo documentService e pelo
-- OpuraDocsModule, mas nunca haviam sido criadas por nenhuma migration
-- (existiam apenas no banco remoto, criadas fora do versionamento).
-- Esta migration reprovisiona essas colunas de forma idempotente para
-- que `supabase db reset` / novo provisionamento não quebrem o GED.
--
-- naming_mask  = máscara de nomenclatura da pasta (ex: [OBRA]-[DISCIPLINA]-[NUMERO]-[REVISAO])
-- disciplines  = lista de códigos de disciplina permitidos na pasta (ex: {ARQ,ESTR})
-- ============================================================

ALTER TABLE public.opura_folders
  ADD COLUMN IF NOT EXISTS naming_mask TEXT;

ALTER TABLE public.opura_folders
  ADD COLUMN IF NOT EXISTS disciplines TEXT[] NOT NULL DEFAULT '{}'::text[];
