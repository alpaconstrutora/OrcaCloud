-- ============================================================================
-- Planta Inteligente — quantitativos reproduzíveis
-- Plano: docs/planos/2026-08-09-quantitativos.md
-- PRD:   §15.1 (quantity_snapshots), §8.7 RF-120/121, CA-08
--
-- Um quantitativo só existe a partir de uma VERSÃO PUBLICADA. Nunca de rascunho:
-- número que o orçamento vai citar não pode vir de geometria que ainda muda.
--
-- CA-08 pede que repetir o cálculo sobre o mesmo snapshot e a mesma política
-- devolva valores idênticos, e que mudar a política crie um snapshot NOVO em vez
-- de sobrescrever. As duas coisas saem da chave única (snapshot_id, policy_version).
--
-- ⚠️ SEM FK PARA auth.users — ver bloco 1. A primeira versão deste arquivo
--    deu `40P01 deadlock detected` por causa dela.
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor, **UM BLOCO POR VEZ**. Rodar tudo de uma vez
--    coloca DDL e leitura de catálogo na MESMA transação, que foi o outro
--    ingrediente do deadlock.
-- ============================================================================

-- ═══ BLOCO 1 — tabela ═══════════════════════════════════════════════════════
-- Rodar sozinho.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.blueprint_quantity_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id     UUID NOT NULL,
    organization_id UUID NOT NULL,

    policy_version  TEXT NOT NULL,
    -- A política INTEIRA, não só a versão: se ela for editada no código no
    -- futuro, o resultado antigo continua explicável pelos parâmetros que de
    -- fato o produziram.
    policy          JSONB NOT NULL,
    kernel_version  TEXT NOT NULL,

    payload         JSONB NOT NULL,
    -- Totais destacados para consulta sem abrir o payload.
    totais          JSONB NOT NULL,

    -- SEM `REFERENCES auth.users(id)`, de propósito.
    --
    -- Criar FK para auth.users exige ShareRowExclusiveLock nela, e auth.users é
    -- a tabela mais quente do Supabase — o serviço de autenticação lê e escreve
    -- nela continuamente. A primeira versão desta migration deadlockou por isso
    -- (40P01): esta transação segurava o lock exclusivo da tabela nova enquanto
    -- esperava auth.users, e o outro processo esperava o inverso.
    --
    -- O que se perde: o `ON DELETE SET NULL` automático se o usuário for
    -- excluído. Aceitável — o campo é informativo e o valor vem de auth.uid()
    -- na inserção. O que se ganha: a migration não derruba o login de ninguém.
    computed_by     UUID,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blueprint_qty_snapshot_fk
      FOREIGN KEY (snapshot_id, organization_id)
      REFERENCES public.blueprint_snapshots(id, organization_id) ON DELETE CASCADE,
    -- O par que garante o CA-08.
    CONSTRAINT blueprint_qty_unique UNIQUE (snapshot_id, policy_version)
);

-- ═══ BLOCO 2 — índices e comentários ════════════════════════════════════════
-- Rodar sozinho.

SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_blueprint_qty_snapshot
    ON public.blueprint_quantity_snapshots(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_qty_org
    ON public.blueprint_quantity_snapshots(organization_id, computed_at DESC);

COMMENT ON TABLE public.blueprint_quantity_snapshots IS
  'Quantitativo reproduzível de uma versão publicada. Imutável: recalcular com '
  'a mesma política devolve o registro existente; mudar a política cria outro, '
  'preservando o que o orçamento já citou (PRD CA-08).';

-- ═══ BLOCO 3 — imutabilidade ════════════════════════════════════════════════
-- Rodar sozinho.
-- Só UPDATE é bloqueado. DELETE fica liberado para o CASCADE do snapshot poder
-- limpar — mesma lição de aplicar_20270905000002: imutável não é indelével.

SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_blueprint_qty_immutable ON public.blueprint_quantity_snapshots;
CREATE TRIGGER trg_blueprint_qty_immutable
    BEFORE UPDATE ON public.blueprint_quantity_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

-- ═══ BLOCO 4 — RLS ══════════════════════════════════════════════════════════
-- Rodar sozinho.

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_quantity_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blueprint_qty_org_read" ON public.blueprint_quantity_snapshots;
CREATE POLICY "blueprint_qty_org_read" ON public.blueprint_quantity_snapshots
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "blueprint_qty_org_insert" ON public.blueprint_quantity_snapshots;
CREATE POLICY "blueprint_qty_org_insert" ON public.blueprint_quantity_snapshots
    FOR INSERT TO authenticated
    WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.blueprint_quantity_snapshots FROM anon;
GRANT SELECT, INSERT ON public.blueprint_quantity_snapshots TO authenticated;

-- ═══ BLOCO 5 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, DEPOIS dos anteriores. Fica separado de propósito: ler
-- catálogo (pg_policies, information_schema) na mesma transação do DDL foi o
-- segundo ingrediente do deadlock.
-- Esperado: tabela=1, com_rls=1, policies=2, trg_imutavel=1, fk_auth_users=0

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_quantity_snapshots')      AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='blueprint_quantity_snapshots'
      AND rowsecurity)                                                            AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='blueprint_quantity_snapshots')       AS policies,
  (SELECT count(*) FROM information_schema.triggers
    WHERE trigger_name='trg_blueprint_qty_immutable')                             AS trg_imutavel,
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t  ON t.oid = c.conrelid
     JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE t.relname='blueprint_quantity_snapshots' AND rt.relname='users')        AS fk_auth_users;
