-- ==========================================================================
-- Migration: proposta com versionamento + link público por token (F3 do PV)
-- Date: 2026-07-18
-- ==========================================================================
-- CONTEXTO
-- F3 do Plano de Vendas: converter a simulação em proposta com (a) versionamento
-- — histórico de revisões — e (b) link público tokenizado para o comprador ver a
-- proposta sem login. Espelha o padrão de purchase_orders.share_token
-- (20260531000001) + a correção de search_path em SECURITY DEFINER (20260801000001).
--
-- ⚠️ broker_portal_proposals JÁ deadlockou com DDL em transação (ver
-- 20270716000001): rodar as ETAPAS **uma de cada vez** no SQL Editor, não o
-- arquivo inteiro. lock_timeout faz falhar rápido (55P03) em vez de travar; se
-- der timeout, repetir só aquela etapa (todas idempotentes).
--
-- NUNCA `supabase db push`.
-- ==========================================================================

-- ==========================================================================
-- ETAPA 1 — Colunas (só tocam broker_portal_proposals)
--   version          — nº da revisão atual (começa em 1)
--   revision_history — snapshots das versões anteriores (append a cada alteração)
--   share_token      — token do link público; NULL = não compartilhada
-- ==========================================================================
SET lock_timeout = '5s';

ALTER TABLE public.broker_portal_proposals
    ADD COLUMN IF NOT EXISTS version          INT   NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS revision_history  JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS share_token       UUID;

-- ==========================================================================
-- ETAPA 2 — Índice único do token (parcial: só linhas compartilhadas)
-- ==========================================================================
SET lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS broker_proposals_share_token_idx
    ON public.broker_portal_proposals (share_token)
    WHERE share_token IS NOT NULL;

-- ==========================================================================
-- ETAPA 3 — RPC pública: busca a proposta pelo token (acesso anon).
--   SECURITY DEFINER ignora RLS; retorna SÓ campos voltados ao comprador.
--   NUNCA expõe admin_notes (nota interna) nem custo/margem (que nem existem
--   nesta tabela — o custo mora no eixo do empreendimento e nunca sai da RPC
--   fn_unit_cost_basis, que recusa quem não é gestor).
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_proposal_public(p_token UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT row_to_json(t) FROM (
        SELECT
            pr.id,
            pr.version,
            pr.status,
            pr.buyer_name,
            pr.unit_price,
            pr.discount_pct,
            pr.total_value,
            pr.down_payment,
            pr.monthly_installments,
            pr.monthly_value,
            pr.balloon_value,
            pr.financing_value,
            pr.payment_plan,
            pr.notes,
            pr.created_at,
            pr.updated_at,
            cp.name AS property_name,
            o.name  AS organization_name
        FROM public.broker_portal_proposals pr
        LEFT JOIN public.commercial_properties cp ON cp.id = pr.property_id
        LEFT JOIN public.organizations o          ON o.id = pr.organization_id
        WHERE pr.share_token = p_token
        LIMIT 1
    ) t;
$$;

REVOKE ALL ON FUNCTION public.fn_proposal_public(UUID) FROM PUBLIC;
-- Link público: anon PRECISA executar (é o ponto). O gate é o token secreto (uuid
-- v4, ~122 bits): sem o token não há linha. A função nunca lista, só resolve 1.
GRANT EXECUTE ON FUNCTION public.fn_proposal_public(UUID) TO anon, authenticated;
