-- ============================================================
-- Migration: 20260705000001_company_targets_views
-- Sprint E: Metas anuais + Views consolidadas do grupo
-- ============================================================

-- ─── 1. METAS ANUAIS POR EMPRESA ────────────────────────────

CREATE TABLE IF NOT EXISTS company_targets (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ano                     INT NOT NULL,
  margem_alvo_pct         NUMERIC(5,2),
  limite_endividamento_pct NUMERIC(5,2),
  faturamento_meta        NUMERIC(15,2),
  ebitda_alvo             NUMERIC(15,2),
  ticket_medio_alvo       NUMERIC(15,2),
  qtd_obras_meta          INT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, ano)
);

CREATE OR REPLACE FUNCTION set_company_targets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER company_targets_updated_at
  BEFORE UPDATE ON company_targets
  FOR EACH ROW EXECUTE FUNCTION set_company_targets_updated_at();

CREATE INDEX IF NOT EXISTS idx_company_targets_company_id ON company_targets(company_id);

ALTER TABLE company_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "targets_select"
  ON company_targets FOR SELECT
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

CREATE POLICY "targets_write_admin"
  ON company_targets FOR ALL
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.org_id IN (
        SELECT organization_id FROM organization_members
        WHERE email = (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
      )
    )
  );

-- ─── 2. EMPRESA_VINCULADA em suppliers ──────────────────────
-- Liga fornecedores que são empresas do grupo (transações intercompany)

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS empresa_vinculada_id UUID REFERENCES companies(id);

-- ─── 3. VIEW CONSOLIDADA DO GRUPO ───────────────────────────

CREATE OR REPLACE VIEW vw_company_consolidated AS
SELECT
  c.org_id,
  COALESCE(c.empresa_consolidadora_id, c.id) AS consolidadora_id,
  c.id                  AS company_id,
  c.razao_social,
  c.nome_fantasia,
  c.tipo,
  c.status,
  c.cor_sistema,
  c.regime_tributario,
  c.is_headquarters,
  c.holding_id,
  -- Projetos / Obras
  (
    SELECT COUNT(*)
    FROM projects p
    WHERE p.empresa_id = c.id
  )                     AS qtd_obras,
  -- Contratos ativos
  (
    SELECT COUNT(*)
    FROM contracts ct
    WHERE ct.empresa_id = c.id
  )                     AS qtd_contratos,
  -- Receita contratada total (current_value = valor com aditivos)
  (
    SELECT COALESCE(SUM(ct.current_value), 0)
    FROM contracts ct
    WHERE ct.empresa_id = c.id
  )                     AS receita_contratada,
  -- Pedidos de compra aprovados/entregues (total em JSONB items — exibir como contagem)
  (
    SELECT COUNT(*)
    FROM purchase_orders po
    WHERE po.empresa_id = c.id
      AND po.status IN ('Confirmado', 'Entregue', 'Recebido')
  )                     AS compras_aprovadas,
  -- Sócios ativos
  (
    SELECT COUNT(*)
    FROM company_partners cp
    WHERE cp.company_id = c.id
      AND cp.data_saida IS NULL
  )                     AS qtd_socios,
  -- Contas bancárias ativas
  (
    SELECT COUNT(*)
    FROM company_bank_accounts cba
    WHERE cba.company_id = c.id
      AND cba.ativa = true
  )                     AS qtd_contas,
  -- Documentos vencidos
  (
    SELECT COUNT(*)
    FROM company_documents cd
    WHERE cd.company_id = c.id
      AND cd.data_validade < CURRENT_DATE
  )                     AS docs_vencidos,
  -- Documentos vencendo nos próximos 30 dias
  (
    SELECT COUNT(*)
    FROM company_documents cd
    WHERE cd.company_id = c.id
      AND cd.data_validade BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
  )                     AS docs_vencendo
FROM companies c;

-- ─── 4. VIEW TRANSAÇÕES INTERCOMPANY ────────────────────────

CREATE OR REPLACE VIEW vw_intercompany_transactions AS
SELECT
  po.id,
  po.empresa_id               AS empresa_pagadora_id,
  c_pag.razao_social          AS empresa_pagadora,
  s.empresa_vinculada_id      AS empresa_recebedora_id,
  c_rec.razao_social          AS empresa_recebedora,
  po.status,
  po.created_at
FROM purchase_orders po
JOIN suppliers       s     ON s.id     = po.supplier_id
JOIN companies       c_pag ON c_pag.id = po.empresa_id
JOIN companies       c_rec ON c_rec.id = s.empresa_vinculada_id
WHERE s.empresa_vinculada_id IS NOT NULL
  AND po.empresa_id IS NOT NULL;
