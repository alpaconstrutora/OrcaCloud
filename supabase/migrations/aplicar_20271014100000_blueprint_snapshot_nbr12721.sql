-- ============================================================================
-- Planta Inteligente — ÁREAS NBR 12721 CONGELADAS NA VERSÃO + APROVAÇÕES
-- (14/10/2026, Fase 7 do plano docs/planos/2026-10-13-areas-nbr12721-na-planta.md)
--
-- O Motor de Áreas antigo tinha um ciclo próprio (draft → calculated →
-- technically_approved → legally_approved → locked) com hash documental. Na
-- Planta, a VERSÃO PUBLICADA (blueprint_snapshots) já é imutável e tem hash; o
-- que faltava é:
--
--   1. blueprint_snapshot_nbr12721 — a entrada e a saída do motor (Quadros I,
--      II, IV-B, frações) congeladas no momento da publicação, com o hash da
--      saída e a versão do motor. Imutável (UPDATE bloqueado pelo gatilho; sem
--      grant de DELETE: some só em cascata com a versão). Molde:
--      blueprint_snapshot_produto (aplicar_20271002000030).
--   2. blueprint_snapshot_nbr12721_aprovacoes — TÉCNICA e JURÍDICA, uma de cada
--      por versão, só por cima: ninguém altera nem apaga (sem grant de UPDATE/
--      DELETE + gatilho). Só a RPC grava.
--   3. aprovar_nbr12721_da_versao(snapshot, tipo, observação) — SECURITY
--      DEFINER com a autorização DENTRO: autenticado, membro da organização da
--      versão, quadro congelado e SEM pendência bloqueante, jurídica só depois
--      da técnica, nada repetido.
--
-- REGRA #7: policies de uma perna (is_org_member); a função leva REVOKE de
-- PUBLIC e anon na mesma migration.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Quadros congelados ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_snapshot_nbr12721 (
    snapshot_id     UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    study_id        UUID NOT NULL,
    -- `EntradaNbr12721` e `SaidaNbr12721` (utils/nbr12721/tipos.ts), inteiras.
    entrada         JSONB NOT NULL,
    saida           JSONB NOT NULL,
    -- sha256 da saída canônica — é o que a aprovação e o documento citam.
    hash            TEXT NOT NULL,
    versao_motor    TEXT NOT NULL,
    -- Sem FK para auth.users (deadlock em auth.users — ver aplicar_20270905000003).
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_snapshot_nbr12721_snapshot_fk
      FOREIGN KEY (snapshot_id, organization_id)
      REFERENCES public.blueprint_snapshots(id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_snapshot_nbr12721_snapshot_org_key UNIQUE (snapshot_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_blueprint_snapshot_nbr12721_study ON public.blueprint_snapshot_nbr12721(study_id);

COMMENT ON TABLE public.blueprint_snapshot_nbr12721 IS
  'Quadros NBR 12721 (entrada e saída do motor) congelados quando a versão do estudo foi publicada. Imutável; some com a versão.';

DROP TRIGGER IF EXISTS trg_blueprint_snapshot_nbr12721_immutable ON public.blueprint_snapshot_nbr12721;
CREATE TRIGGER trg_blueprint_snapshot_nbr12721_immutable
    BEFORE UPDATE ON public.blueprint_snapshot_nbr12721
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

ALTER TABLE public.blueprint_snapshot_nbr12721 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_snapshot_nbr12721_read" ON public.blueprint_snapshot_nbr12721;
CREATE POLICY "blueprint_snapshot_nbr12721_read" ON public.blueprint_snapshot_nbr12721
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_snapshot_nbr12721_insert" ON public.blueprint_snapshot_nbr12721;
CREATE POLICY "blueprint_snapshot_nbr12721_insert" ON public.blueprint_snapshot_nbr12721
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_snapshot_nbr12721 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.blueprint_snapshot_nbr12721 TO authenticated;

-- ── 2. Aprovações ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_snapshot_nbr12721_aprovacoes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id     UUID NOT NULL,
    organization_id UUID NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('TECNICA', 'JURIDICA')),
    -- O hash do quadro aprovado: a aprovação diz O QUE foi aprovado, não só "a versão".
    hash            TEXT NOT NULL,
    observacao      TEXT,
    aprovado_por    UUID NOT NULL,
    aprovado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_snapshot_nbr12721_aprovacoes_quadro_fk
      FOREIGN KEY (snapshot_id, organization_id)
      REFERENCES public.blueprint_snapshot_nbr12721(snapshot_id, organization_id) ON DELETE CASCADE,
    CONSTRAINT blueprint_snapshot_nbr12721_aprovacoes_unica UNIQUE (snapshot_id, tipo)
);
CREATE INDEX IF NOT EXISTS idx_blueprint_snapshot_nbr12721_aprovacoes_snapshot ON public.blueprint_snapshot_nbr12721_aprovacoes(snapshot_id);

COMMENT ON TABLE public.blueprint_snapshot_nbr12721_aprovacoes IS
  'Aprovações técnica e jurídica dos Quadros NBR 12721 de uma versão publicada. Só acrescenta; grava-se pela RPC aprovar_nbr12721_da_versao.';

DROP TRIGGER IF EXISTS trg_blueprint_snapshot_nbr12721_aprovacoes_immutable ON public.blueprint_snapshot_nbr12721_aprovacoes;
CREATE TRIGGER trg_blueprint_snapshot_nbr12721_aprovacoes_immutable
    BEFORE UPDATE ON public.blueprint_snapshot_nbr12721_aprovacoes
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

ALTER TABLE public.blueprint_snapshot_nbr12721_aprovacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_snapshot_nbr12721_aprovacoes_read" ON public.blueprint_snapshot_nbr12721_aprovacoes;
CREATE POLICY "blueprint_snapshot_nbr12721_aprovacoes_read" ON public.blueprint_snapshot_nbr12721_aprovacoes
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

-- Sem policy nem grant de escrita: quem grava é a RPC (SECURITY DEFINER).
REVOKE ALL ON public.blueprint_snapshot_nbr12721_aprovacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.blueprint_snapshot_nbr12721_aprovacoes TO authenticated;

-- ── 3. Aprovar ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aprovar_nbr12721_da_versao(
    p_snapshot_id UUID,
    p_tipo TEXT,
    p_observacao TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
    v_hash TEXT;
    v_status TEXT;
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
    END IF;
    IF p_tipo IS NULL OR p_tipo NOT IN ('TECNICA', 'JURIDICA') THEN
        RAISE EXCEPTION 'tipo de aprovação desconhecido: %', p_tipo USING ERRCODE = '22023';
    END IF;
    SELECT q.organization_id, q.hash, q.saida->>'status'
      INTO v_org, v_hash, v_status
      FROM public.blueprint_snapshot_nbr12721 q
     WHERE q.snapshot_id = p_snapshot_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'esta versão não tem os Quadros NBR 12721 congelados' USING ERRCODE = 'P0002';
    END IF;
    -- A autorização mora AQUI (o GRANT é só privilégio de chamada — REGRA #7).
    IF NOT public.is_org_member(v_org) THEN
        RAISE EXCEPTION 'você não é membro da organização desta versão' USING ERRCODE = '42501';
    END IF;
    IF v_status IS DISTINCT FROM 'success' THEN
        RAISE EXCEPTION 'os quadros desta versão têm pendência bloqueante — não há o que aprovar' USING ERRCODE = '22023';
    END IF;
    IF p_tipo = 'JURIDICA' AND NOT EXISTS (
        SELECT 1 FROM public.blueprint_snapshot_nbr12721_aprovacoes a WHERE a.snapshot_id = p_snapshot_id AND a.tipo = 'TECNICA'
    ) THEN
        RAISE EXCEPTION 'a aprovação jurídica vem depois da técnica' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.blueprint_snapshot_nbr12721_aprovacoes a WHERE a.snapshot_id = p_snapshot_id AND a.tipo = p_tipo) THEN
        RAISE EXCEPTION 'esta versão já tem a aprovação %', lower(p_tipo) USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.blueprint_snapshot_nbr12721_aprovacoes (snapshot_id, organization_id, tipo, hash, observacao, aprovado_por)
    VALUES (p_snapshot_id, v_org, p_tipo, v_hash, NULLIF(btrim(COALESCE(p_observacao, '')), ''), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aprovar_nbr12721_da_versao(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_nbr12721_da_versao(UUID, TEXT, TEXT) TO authenticated;

RESET lock_timeout;
