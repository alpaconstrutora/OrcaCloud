-- ─── Vale Refeição / Alimentação ──────────────────────────────────────────────
-- Motor de cálculo: valor diário × dias elegíveis (dias úteis − ausências)
-- Calendário parametrizável por obra + feriados + regras CLT/convenção

-- ─── 1. Regras de benefício ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vr_regras (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
    nome            text NOT NULL,
    tipo            text NOT NULL DEFAULT 'refeicao' CHECK (tipo IN ('refeicao','alimentacao','ambos')),
    valor_diario    numeric(10,2) NOT NULL CHECK (valor_diario > 0),
    desconto_folha_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_folha_pct >= 0 AND desconto_folha_pct <= 100),
    gera_sabado     boolean NOT NULL DEFAULT false,
    gera_domingo    boolean NOT NULL DEFAULT false,
    gera_feriado    boolean NOT NULL DEFAULT false,
    desconta_falta  boolean NOT NULL DEFAULT true,
    desconta_ferias boolean NOT NULL DEFAULT true,
    desconta_afastamento boolean NOT NULL DEFAULT true,
    ativo           boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Feriados ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vr_feriados (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    data        date NOT NULL,
    descricao   text NOT NULL,
    escopo      text NOT NULL DEFAULT 'municipal' CHECK (escopo IN ('nacional','estadual','municipal','obra')),
    project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vr_feriados_org_data_project
    ON vr_feriados (org_id, data, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ─── 3. Cálculos mensais ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vr_calculos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    regra_id        uuid NOT NULL REFERENCES vr_regras(id) ON DELETE RESTRICT,
    employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
    mes_referencia  date NOT NULL,                          -- primeiro dia do mês
    dias_uteis      int NOT NULL DEFAULT 0,
    dias_faltas     int NOT NULL DEFAULT 0,
    dias_ferias     int NOT NULL DEFAULT 0,
    dias_afastamento int NOT NULL DEFAULT 0,
    dias_outros     int NOT NULL DEFAULT 0,
    dias_elegiveis  int NOT NULL DEFAULT 0,
    valor_diario    numeric(10,2) NOT NULL,
    valor_bruto     numeric(10,2) NOT NULL DEFAULT 0,
    desconto_folha  numeric(10,2) NOT NULL DEFAULT 0,
    valor_liquido   numeric(10,2) NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovado','pago','cancelado')),
    aprovado_por    uuid REFERENCES auth.users(id),
    aprovado_em     timestamptz,
    observacao      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, employee_id, mes_referencia, regra_id)
);

-- ─── 4. Ajustes manuais (auditados) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vr_ajustes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    calculo_id  uuid NOT NULL REFERENCES vr_calculos(id) ON DELETE CASCADE,
    campo       text NOT NULL,
    valor_antes numeric(10,2),
    valor_depois numeric(10,2),
    motivo      text NOT NULL,
    usuario_id  uuid REFERENCES auth.users(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. RLS (padrão do projeto: public.is_org_member) ─────────────────────────
ALTER TABLE vr_regras    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vr_feriados  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vr_calculos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vr_ajustes   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vr_regras_org_access"   ON vr_regras;
DROP POLICY IF EXISTS "vr_feriados_org_access" ON vr_feriados;
DROP POLICY IF EXISTS "vr_calculos_org_access" ON vr_calculos;
DROP POLICY IF EXISTS "vr_ajustes_org_access"  ON vr_ajustes;

CREATE POLICY "vr_regras_org_access" ON vr_regras
    FOR ALL USING (public.is_org_member(org_id));

CREATE POLICY "vr_feriados_org_access" ON vr_feriados
    FOR ALL USING (public.is_org_member(org_id));

CREATE POLICY "vr_calculos_org_access" ON vr_calculos
    FOR ALL USING (public.is_org_member(org_id));

CREATE POLICY "vr_ajustes_org_access" ON vr_ajustes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM vr_calculos c
            WHERE c.id = vr_ajustes.calculo_id
              AND public.is_org_member(c.org_id)
        )
    );

-- ─── 6. updated_at triggers ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_vr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS vr_regras_updated_at   ON vr_regras;
DROP TRIGGER IF EXISTS vr_calculos_updated_at ON vr_calculos;

CREATE TRIGGER vr_regras_updated_at
    BEFORE UPDATE ON vr_regras
    FOR EACH ROW EXECUTE FUNCTION update_vr_updated_at();

CREATE TRIGGER vr_calculos_updated_at
    BEFORE UPDATE ON vr_calculos
    FOR EACH ROW EXECUTE FUNCTION update_vr_updated_at();
