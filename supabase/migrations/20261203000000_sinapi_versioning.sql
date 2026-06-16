-- migration: 20261203000000_sinapi_versioning.sql
-- Fase 0 do versionamento de bases SINAPI.
-- Adiciona `reference_date` (competência) como 2ª dimensão da chave de
-- sinapi_items, mantendo o JSONB `prices` (UF × com/sem) intacto, e cria o
-- registro de versões `sinapi_references` (fonte do dropdown de competência).
--
-- Idempotente. Faz backfill da base atual (carga 12/2025) para 2025-12-01.
-- IMPORTANTE: sinapi_items foi criada manualmente fora das migrations; este
-- arquivo NÃO cria a tabela, apenas evolui o schema existente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Coluna de competência
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sinapi_items
    ADD COLUMN IF NOT EXISTS reference_date DATE;

-- Backfill: tudo que já existe é a competência 12/2025.
UPDATE public.sinapi_items
   SET reference_date = '2025-12-01'
 WHERE reference_date IS NULL;

-- NOT NULL sem DEFAULT: toda importação futura é obrigada a informar a
-- competência (evita que itens sem reference_date caiam silenciosamente
-- em 12/2025).
ALTER TABLE public.sinapi_items
    ALTER COLUMN reference_date SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Troca da PK: code → (code, reference_date)
--    A PK atual foi criada manualmente (nome desconhecido), então a
--    descobrimos dinamicamente antes de trocar.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_pk TEXT;
BEGIN
    SELECT conname INTO v_pk
      FROM pg_constraint
     WHERE conrelid = 'public.sinapi_items'::regclass
       AND contype  = 'p';

    IF v_pk IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.sinapi_items DROP CONSTRAINT %I', v_pk);
    END IF;

    -- Recria a PK composta caso não exista (idempotente em reexecuções).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.sinapi_items'::regclass
           AND contype  = 'p'
    ) THEN
        ALTER TABLE public.sinapi_items
            ADD CONSTRAINT sinapi_items_pkey PRIMARY KEY (code, reference_date);
    END IF;
END $$;

-- Índices p/ filtros por competência (busca, categorias, tipo).
-- A PK composta (code, reference_date) já cobre lookups por code (coluna líder).
CREATE INDEX IF NOT EXISTS idx_sinapi_items_reference
    ON public.sinapi_items (reference_date);
CREATE INDEX IF NOT EXISTS idx_sinapi_items_ref_category
    ON public.sinapi_items (reference_date, category);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Registro de versões (fonte do dropdown de competência)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sinapi_references (
    reference_date DATE        PRIMARY KEY,
    label          TEXT        NOT NULL,                 -- ex: '12/2025'
    status         TEXT        NOT NULL DEFAULT 'published'
                                   CHECK (status IN ('published', 'draft', 'archived')),
    item_count     INTEGER     NOT NULL DEFAULT 0,
    imported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes          TEXT
);

ALTER TABLE public.sinapi_references ENABLE ROW LEVEL SECURITY;

-- Espelha a política de sinapi_items: leitura p/ autenticados, escrita só service_role.
DROP POLICY IF EXISTS "sinapi_references read authenticated" ON public.sinapi_references;
CREATE POLICY "sinapi_references read authenticated"
    ON public.sinapi_references FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sinapi_references service_role all" ON public.sinapi_references;
CREATE POLICY "sinapi_references service_role all"
    ON public.sinapi_references FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed da competência atual (item_count calculado da própria base).
INSERT INTO public.sinapi_references (reference_date, label, status, item_count, notes)
VALUES (
    '2025-12-01',
    '12/2025',
    'published',
    (SELECT COUNT(*) FROM public.sinapi_items WHERE reference_date = '2025-12-01'),
    'Carga inicial migrada via backfill.'
)
ON CONFLICT (reference_date) DO UPDATE
    SET item_count = EXCLUDED.item_count,
        label      = EXCLUDED.label;
