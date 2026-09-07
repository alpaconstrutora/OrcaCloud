-- ==========================================================================
-- GED · Compartilhar documento com portal — o upsert volta a funcionar
-- Date: 2026-09-07
-- Corrige: 20270821000008_opura_docs_portal_shares.sql (cliente/colaborador)
--          aplicar_20270920000002_ged_shares_credor.sql (credor)
-- Plano: docs/planos/2026-09-07-portal-credito-credit-room.md
-- ==========================================================================
-- O DEFEITO, MEDIDO NO NAVEGADOR (07/09/2026)
--
-- Compartilhar documento com o Portal do Cliente responde:
--
--     HTTP 400 · 42P10
--     "there is no unique or exclusion constraint matching the ON CONFLICT
--      specification"
--
-- Ou seja: **compartilhar documento com o Portal do Cliente e com o Portal do
-- Colaborador está quebrado em produção desde 21/08/2026** — a data da
-- 20270821000008. Não é regressão desta frente; foi descoberto por ela, ao
-- adicionar a terceira audiência copiando o padrão das duas primeiras e levar
-- o mesmo erro.
--
-- A CAUSA
--
-- Os três índices únicos são PARCIAIS:
--
--     CREATE UNIQUE INDEX uq_opura_portal_shares_cliente
--       ON opura_document_portal_shares (document_id, client_id)
--       WHERE audience = 'cliente';
--
-- e `documentService.sharePortalDocumentsBatch` faz
-- `upsert(..., { onConflict: 'document_id,client_id' })`.
--
-- O Postgres só casa um índice parcial com `ON CONFLICT` se a instrução
-- repetir o predicado (`ON CONFLICT (a, b) WHERE audience = 'cliente'`), e o
-- PostgREST não tem como enviar esse `WHERE` — o parâmetro `on_conflict` da
-- API aceita só a lista de colunas. Então o índice existe, está correto como
-- restrição, e mesmo assim o upsert não o enxerga.
--
-- A CORREÇÃO: TIRAR O `WHERE`, SEM PERDER A GARANTIA
--
-- O predicado é redundante. O CHECK de alvo (`..._target_chk`) já garante que
-- `client_id` só é preenchido quando `audience = 'cliente'` — nas outras
-- audiências ele é NULL. E, no comportamento padrão do Postgres, **NULL não
-- conflita com NULL** num índice único: uma linha de audiência 'credor'
-- (client_id NULL) nunca disputa com outra.
--
-- Resultado: o índice total protege exatamente as mesmas linhas que o parcial
-- protegia, e passa a casar com `ON CONFLICT (document_id, client_id)`.
--
-- ⚠️ NÃO trocar por `NULLS NOT DISTINCT` (PG15+): ali duas linhas de audiências
--    diferentes, ambas com client_id NULL, passariam a conflitar entre si —
--    e um documento compartilhado com um colaborador impediria compartilhá-lo
--    com um Credit Room.
--
-- Conferido antes de aplicar: 0 duplicatas nas três combinações (a tabela tem
-- 0 linhas hoje, o que também explica o defeito ter passado despercebido —
-- ninguém chegou a compartilhar nada com sucesso).
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- ==========================================================================

SET lock_timeout = '5s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'opura_document_portal_shares') THEN
        RAISE EXCEPTION 'ABORTADO: opura_document_portal_shares nao existe.';
    END IF;
END $$;

-- Guarda: se houver duplicata, o CREATE UNIQUE abaixo falharia no meio e
-- deixaria a tabela com um índice novo e outro velho. Falhar aqui é mais claro.
DO $$
DECLARE v_dups integer;
BEGIN
    SELECT count(*) INTO v_dups FROM (
        SELECT document_id, client_id FROM public.opura_document_portal_shares
         WHERE client_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1
        UNION ALL
        SELECT document_id, employee_id FROM public.opura_document_portal_shares
         WHERE employee_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1
        UNION ALL
        SELECT document_id, credit_room_id FROM public.opura_document_portal_shares
         WHERE credit_room_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF v_dups > 0 THEN
        RAISE EXCEPTION 'ABORTADO: % combinacao(oes) duplicada(s) — limpe antes de criar o indice total.', v_dups;
    END IF;
END $$;

-- ── Cliente ────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.uq_opura_portal_shares_cliente;
CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_portal_shares_cliente
    ON public.opura_document_portal_shares (document_id, client_id);

-- ── Colaborador ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.uq_opura_portal_shares_colaborador;
CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_portal_shares_colaborador
    ON public.opura_document_portal_shares (document_id, employee_id);

-- ── Credor (Credit Room) ───────────────────────────────────────────────────
DROP INDEX IF EXISTS public.uq_opura_portal_shares_credor;
CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_portal_shares_credor
    ON public.opura_document_portal_shares (document_id, credit_room_id);

COMMENT ON INDEX public.uq_opura_portal_shares_cliente IS
    'Sem WHERE de proposito: indice parcial nao casa com ON CONFLICT do '
    'PostgREST (42P10). O CHECK de alvo ja garante que client_id so existe '
    'na audiencia cliente, e NULL nao conflita com NULL.';

-- ==========================================================================
-- Conferência
-- ==========================================================================
-- a. Os três índices sem `WHERE`:
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE tablename='opura_document_portal_shares' AND indexname LIKE 'uq_%';
--    -> nenhum com "WHERE"
--
-- b. Na interface (é o que vale): GED → filtrar por disciplina → Compartilhar
--    → Portal do Cliente → escolher cliente → Compartilhar.
--    -> antes: HTTP 400 42P10 · depois: grava e some o modal
--
-- c. Repetir o mesmo compartilhamento não duplica (o upsert casa o índice):
-- SELECT document_id, client_id, count(*) FROM public.opura_document_portal_shares
--  WHERE client_id IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;   -> vazio
-- ==========================================================================
-- FIM: aplicar_20270920000004_portal_shares_indices_upsert.sql
-- ==========================================================================
