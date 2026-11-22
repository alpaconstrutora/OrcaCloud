-- ==========================================================================
-- Credit Room · capacidade de pagamento — escopo, empreendimentos, parâmetros
-- Date: 2026-11-22
-- Tabela alterada: public.credit_rooms (só ADD COLUMN aditivo + 1 trigger)
-- Plano: credit-room-capacidade F1 (Task 3)
-- ==========================================================================
-- O QUÊ
--   escopo                  'EMPRESA' (só a org dona) ou 'GRUPO' (várias orgs).
--   grupo_organization_ids  orgs do grupo quando escopo = 'GRUPO'.
--   empreendimento_ids      empreendimentos escolhidos para a capacidade.
--   parametros_capacidade   parâmetros da conta (jsonb livre, lido pela app).
--
-- TRIGGER fn_credit_room_grupo_valido (BEFORE INSERT OR UPDATE OF escopo,
--   grupo_organization_ids, organization_id):
--   · EMPRESA → grupo_organization_ids := '{}'.
--   · GRUPO   → inclui organization_id (sem duplicar) e RECUSA qualquer org
--     que o usuário NÃO seja membro (minhas_orgs_membro()), com check_violation.
--   SECURITY INVOKER de propósito: minhas_orgs_membro() lê auth.uid() do
--   próprio chamador. Quem roda como postgres/service_role (auth.uid() nulo,
--   sem JWT) não tem conjunto de orgs — a trava vale para o usuário da app.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): não há policy nova; as policies de credit_rooms
--   continuam as da migration 20270920000001, sem alteração.
--   Pergunta 2 (quem executa): função NOVA → REVOKE de PUBLIC e anon. É função
--   de trigger (SECURITY INVOKER); o gatilho a dispara sem exigir EXECUTE do
--   chamador da DML.
--
-- ⚠️ APLICAR À MÃO — NUNCA `supabase db push` (ver CLAUDE.md).
-- Idempotente. Rollback: aplicar_20271122000000_credit_room_capacidade_rollback.sql
-- ==========================================================================

SET lock_timeout = '5s';

-- ── Guarda: dependências ───────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = 'minhas_orgs_membro') THEN
        RAISE EXCEPTION 'ABORTADO: public.minhas_orgs_membro() nao existe.';
    END IF;
END $$;

-- ── 1. Colunas ─────────────────────────────────────────────────────────────
ALTER TABLE public.credit_rooms
    ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'EMPRESA'
        CHECK (escopo IN ('EMPRESA', 'GRUPO')),
    ADD COLUMN IF NOT EXISTS grupo_organization_ids uuid[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS empreendimento_ids uuid[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS parametros_capacidade jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.credit_rooms.escopo IS
    'EMPRESA = capacidade so da organizacao dona; GRUPO = soma as orgs de '
    'grupo_organization_ids (todas do usuario, validado por trigger).';
COMMENT ON COLUMN public.credit_rooms.grupo_organization_ids IS
    'Orgs do grupo quando escopo = GRUPO (inclui a org dona). Vazio em EMPRESA. '
    'Sem FK (tabela quente, ver cabecalho da migration do Credit Room).';
COMMENT ON COLUMN public.credit_rooms.empreendimento_ids IS
    'Empreendimentos escolhidos para a conta de capacidade. Sem FK.';
COMMENT ON COLUMN public.credit_rooms.parametros_capacidade IS
    'Parametros da conta de capacidade de pagamento (lidos pela aplicacao).';

-- ── 2. Trigger de validação do grupo ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_credit_room_grupo_valido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_alheia uuid;
BEGIN
    IF NEW.escopo = 'EMPRESA' THEN
        NEW.grupo_organization_ids := '{}';
        RETURN NEW;
    END IF;

    -- GRUPO: a org dona entra sempre, sem duplicar nem repetir ids.
    NEW.grupo_organization_ids := ARRAY(
        SELECT DISTINCT x
          FROM unnest(COALESCE(NEW.grupo_organization_ids, '{}'::uuid[])
                      || ARRAY[NEW.organization_id]) AS x
         WHERE x IS NOT NULL
    );

    SELECT x INTO v_alheia
      FROM unnest(NEW.grupo_organization_ids) AS x
     WHERE x NOT IN (SELECT public.minhas_orgs_membro())
     LIMIT 1;

    IF v_alheia IS NOT NULL THEN
        RAISE EXCEPTION 'Credit Room: o usuario nao e membro da organizacao % do grupo.', v_alheia
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_credit_room_grupo_valido() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_credit_rooms_grupo_valido ON public.credit_rooms;
CREATE TRIGGER trg_credit_rooms_grupo_valido
    BEFORE INSERT OR UPDATE OF escopo, grupo_organization_ids, organization_id
    ON public.credit_rooms
    FOR EACH ROW EXECUTE FUNCTION public.fn_credit_room_grupo_valido();
