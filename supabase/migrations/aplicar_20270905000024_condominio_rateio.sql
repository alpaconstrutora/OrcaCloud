-- ============================================================================
-- Financeiro condominial — o RATEIO (fatia 1 de N)
-- Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (🚪 portão)
--
-- DECISÃO DO USUÁRIO (14/08/2026), melhor que as opções que ofereci:
--   "Cada condomínio pode ter uma organização própria ou não. Mas A ÂNCORA É O
--    CENTRO DE CUSTO. Cada condomínio, independente de ter organização própria
--    ou não, terá seu próprio centro de custo."
--
-- Por que isso resolve: a segregação deixa de depender da organização. O
-- despesa do condomínio é a que cai no centro de custo dele — e
-- `internal_transactions.cost_center_id` já aponta para `cost_centers_v2`, que
-- já tem hierarquia e já é dimensão de DRE e balancete. Org própria vira
-- decisão ortogonal (fiscal), não pré-requisito do rateio.
--
-- ⚠️ COEXISTE com `cost_centers_v2.project_id`, que outra frente acrescentou em
-- 20270907000000 para derivar o empreendimento A PARTIR DA OBRA. Aquele caminho
-- não serve aqui: condomínio em operação — ainda mais retrofit — pode não ter
-- obra nenhuma de onde derivar. São dois vínculos para dois casos, não
-- duplicata.
--
-- O QUE ESTA FATIA FAZ: pega as despesas do centro de custo numa competência e
-- divide entre as unidades pelo critério escolhido, gerando a cota de cada uma.
-- O QUE ELA NÃO FAZ (fatias seguintes): cobrança/boleto, fundo de reserva,
-- inadimplência, multa e juros, acordos e prestação de contas.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — a âncora: centro de custo do condomínio ══════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.cost_centers_v2
    ADD COLUMN IF NOT EXISTS empreendimento_id UUID REFERENCES public.empreendimentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cost_centers_v2_empreendimento
    ON public.cost_centers_v2(empreendimento_id) WHERE empreendimento_id IS NOT NULL;

-- Um centro de custo por condomínio: dois seriam duas verdades sobre o mesmo
-- caixa, e a despesa cairia num sem que o rateio do outro a enxergasse.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_cost_center_por_empreendimento
    ON public.cost_centers_v2(empreendimento_id) WHERE empreendimento_id IS NOT NULL;

COMMENT ON COLUMN public.cost_centers_v2.empreendimento_id IS
  'Condomínio cujo caixa este centro de custo representa. É a ÂNCORA da '
  'segregação: a despesa do condomínio é a que cai aqui, com ou sem '
  'organização própria. Complementa `project_id` (20270907000000), que deriva '
  'empreendimento a partir da OBRA — caminho que não existe para prédio em '
  'operação sem obra vinculada.';

-- ═══ BLOCO 2 — o rateio de uma competência ══════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.condominio_rateios (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empreendimento_id UUID NOT NULL,
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cost_center_id    UUID,

    /** Competência: sempre o primeiro dia do mês. */
    competencia       DATE NOT NULL,
    /**
     * ORDINARIO = despesa corrente do mês. EXTRAORDINARIO = obra, reforma,
     * benfeitoria — juridicamente é do PROPRIETÁRIO, não do inquilino, e por
     * isso é rateio separado desde o começo. Misturar os dois num valor só
     * impede saber de quem cobrar quando a unidade está alugada.
     */
    tipo              TEXT NOT NULL DEFAULT 'ORDINARIO'
                        CHECK (tipo IN ('ORDINARIO','EXTRAORDINARIO')),
    criterio          TEXT NOT NULL
                        CHECK (criterio IN ('FRACAO_IDEAL','IGUAL','AREA_PRIVATIVA','GRUPO','FIXO')),
    /** RASCUNHO recalcula; FECHADO congela e vira base de cobrança. */
    status            TEXT NOT NULL DEFAULT 'RASCUNHO'
                        CHECK (status IN ('RASCUNHO','FECHADO','CANCELADO')),

    total_despesas    NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_rateado     NUMERIC(15,2) NOT NULL DEFAULT 0,
    observacoes       TEXT,
    fechado_em        TIMESTAMPTZ,
    fechado_por       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Fechado sem data de fechamento deixa a trilha sem âncora temporal.
    CONSTRAINT rateio_fechado_tem_data
        CHECK (status <> 'FECHADO' OR fechado_em IS NOT NULL)
);

-- Um rateio VIVO por (condomínio, competência, tipo). Dois rateios ordinários
-- do mesmo mês é a forma mais rápida de cobrar duas vezes o mesmo condômino.
-- CANCELADO fica de fora do índice de propósito: refazer exige cancelar antes.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_rateio_competencia
    ON public.condominio_rateios(empreendimento_id, competencia, tipo)
    WHERE status <> 'CANCELADO';

CREATE INDEX IF NOT EXISTS idx_rateios_empr
    ON public.condominio_rateios(empreendimento_id, competencia DESC);

-- ═══ BLOCO 3 — a cota de cada unidade ═══════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.condominio_rateio_itens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rateio_id    UUID NOT NULL,
    unit_id      UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    /**
     * O PESO usado no cálculo, guardado junto com o resultado. Sem ele, meses
     * depois ninguém consegue reconstruir por que aquela unidade pagou aquilo —
     * a fração pode ter sido averbada, a área corrigida, o grupo mudado.
     */
    peso         NUMERIC(18,12) NOT NULL DEFAULT 0,
    valor        NUMERIC(15,2) NOT NULL DEFAULT 0,
    /** Quem paga: sai da ocupação vigente (locatário, senão proprietário). */
    client_id    UUID,
    ajuste_manual BOOLEAN NOT NULL DEFAULT false,
    observacao   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_rateio_item_unidade
    ON public.condominio_rateio_itens(rateio_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_rateio_itens_rateio
    ON public.condominio_rateio_itens(rateio_id);

-- ═══ BLOCO 4 — quais despesas entraram (o rastro) ═══════════════════════════
-- Guardar a LISTA, não só o total: a prestação de contas precisa mostrar o que
-- compôs a cota, e uma despesa lançada depois não pode mudar um rateio fechado
-- em silêncio.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.condominio_rateio_despesas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rateio_id      UUID NOT NULL,
    transaction_id UUID NOT NULL,
    descricao      TEXT,
    valor          NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_rateio_despesa
    ON public.condominio_rateio_despesas(rateio_id, transaction_id);

-- ═══ BLOCO 5 — chaves estrangeiras, separadas ═══════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.condominio_rateios
  DROP CONSTRAINT IF EXISTS condominio_rateios_empr_fk;
ALTER TABLE public.condominio_rateios
  ADD CONSTRAINT condominio_rateios_empr_fk
  FOREIGN KEY (empreendimento_id) REFERENCES public.empreendimentos(id) ON DELETE CASCADE;

ALTER TABLE public.condominio_rateio_itens
  DROP CONSTRAINT IF EXISTS condominio_rateio_itens_rateio_fk;
ALTER TABLE public.condominio_rateio_itens
  ADD CONSTRAINT condominio_rateio_itens_rateio_fk
  FOREIGN KEY (rateio_id) REFERENCES public.condominio_rateios(id) ON DELETE CASCADE;

ALTER TABLE public.condominio_rateio_itens
  DROP CONSTRAINT IF EXISTS condominio_rateio_itens_unit_fk;
ALTER TABLE public.condominio_rateio_itens
  ADD CONSTRAINT condominio_rateio_itens_unit_fk
  FOREIGN KEY (unit_id) REFERENCES public.empreendimento_units(id) ON DELETE CASCADE;

ALTER TABLE public.condominio_rateio_despesas
  DROP CONSTRAINT IF EXISTS condominio_rateio_despesas_rateio_fk;
ALTER TABLE public.condominio_rateio_despesas
  ADD CONSTRAINT condominio_rateio_despesas_rateio_fk
  FOREIGN KEY (rateio_id) REFERENCES public.condominio_rateios(id) ON DELETE CASCADE;

-- ═══ BLOCO 6 — a trava do fechado ═══════════════════════════════════════════
-- Rateio FECHADO é base de cobrança: se o valor mudar depois, o boleto emitido
-- deixa de bater com o que o sistema diz. Editar exige cancelar e refazer.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_rateio_protege_fechado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM public.condominio_rateios
     WHERE id = COALESCE(NEW.rateio_id, OLD.rateio_id);

    IF v_status = 'FECHADO' THEN
        RAISE EXCEPTION
            'Rateio já fechado: os valores viraram base de cobrança. Cancele o rateio e refaça, em vez de alterar o que já foi comunicado.';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_rateio_protege_fechado() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_rateio_itens_protege ON public.condominio_rateio_itens;
CREATE TRIGGER trg_rateio_itens_protege
    BEFORE INSERT OR UPDATE OR DELETE ON public.condominio_rateio_itens
    FOR EACH ROW EXECUTE FUNCTION public.fn_rateio_protege_fechado();

-- ═══ BLOCO 7 — updated_at ═══════════════════════════════════════════════════
SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS set_updated_at_condominio_rateios ON public.condominio_rateios;
CREATE TRIGGER set_updated_at_condominio_rateios BEFORE UPDATE ON public.condominio_rateios
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_rateio_itens ON public.condominio_rateio_itens;
CREATE TRIGGER set_updated_at_rateio_itens BEFORE UPDATE ON public.condominio_rateio_itens
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 8 — RLS ══════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.condominio_rateios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_rateio_itens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condominio_rateio_despesas  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['condominio_rateios','condominio_rateio_itens']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_all', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))',
            t || '_org_all', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END LOOP;
END $$;

-- Despesas: sem organization_id próprio — o recorte vem do rateio.
DROP POLICY IF EXISTS "condominio_rateio_despesas_org_all" ON public.condominio_rateio_despesas;
CREATE POLICY "condominio_rateio_despesas_org_all" ON public.condominio_rateio_despesas
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.condominio_rateios r
                    WHERE r.id = rateio_id AND public.is_org_member(r.organization_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.condominio_rateios r
                    WHERE r.id = rateio_id AND public.is_org_member(r.organization_id)));
REVOKE ALL ON public.condominio_rateio_despesas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.condominio_rateio_despesas TO authenticated;

-- ═══ BLOCO 9 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho.
-- Esperado: tabelas=3, com_rls=3, anon_policies=0, uidx_competencia=1,
--           trigger_fechado=1, col_empreendimento=1

SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'
     AND tablename IN ('condominio_rateios','condominio_rateio_itens','condominio_rateio_despesas'))   AS tabelas,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity
     AND tablename IN ('condominio_rateios','condominio_rateio_itens','condominio_rateio_despesas'))   AS com_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND 'anon' = ANY(roles)
     AND tablename IN ('condominio_rateios','condominio_rateio_itens','condominio_rateio_despesas'))   AS anon_policies,
  (SELECT count(*) FROM pg_indexes WHERE indexname='uidx_rateio_competencia')                          AS uidx_competencia,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_rateio_itens_protege')                            AS trigger_fechado,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
     AND table_name='cost_centers_v2' AND column_name='empreendimento_id')                             AS col_empreendimento;

-- ═══ BLOCO 10 — teste da trava (opcional, desfaz sozinho) ═══════════════════
-- Prova que rateio fechado não aceita alteração de item:
--
-- BEGIN;
--   -- feche um rateio de teste e tente alterar um item dele:
--   UPDATE public.condominio_rateio_itens SET valor = 999 WHERE rateio_id = '<rateio fechado>';
--   -- esperado: "Rateio já fechado: os valores viraram base de cobrança."
-- ROLLBACK;
