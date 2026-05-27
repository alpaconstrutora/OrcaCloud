-- ============================================================
-- Migration: 20260526000001_create_companies_and_empresa_id
-- Introduz a camada companies (empresas do grupo) entre
-- organizations (tenant SaaS) e as entidades operacionais.
--
-- Hierarquia resultante:
--   organizations (org_id)
--     └── companies (empresa_id)   ← NOVA CAMADA
--           ├── projects
--           ├── contracts
--           ├── employees
--           ├── labor_teams
--           ├── payment_accounts
--           ├── cost_centers
--           ├── chart_of_accounts
--           └── purchase_orders
--
-- Estratégia: empresa_id nullable agora, backfill, NOT NULL depois.
-- ============================================================

-- ─── 1. TABELA COMPANIES ────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identificação (Camada 1 — obrigatório para funcionar)
  razao_social          TEXT NOT NULL,
  nome_fantasia         TEXT,
  cnpj                  TEXT,
  inscricao_estadual    TEXT,
  inscricao_municipal   TEXT,
  cnae_principal        TEXT,
  natureza_juridica     TEXT,
  regime_tributario     TEXT CHECK (regime_tributario IN (
                          'simples', 'lucro_presumido', 'lucro_real', 'mei'
                        )),
  data_abertura         DATE,
  capital_social        NUMERIC(15,2),
  status                TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN (
                          'ativa', 'inativa', 'em_implantacao', 'encerrada'
                        )),

  -- Tipo de empresa (núcleo de inteligência — controla módulos habilitados)
  tipo                  TEXT NOT NULL DEFAULT 'construtora' CHECK (tipo IN (
                          'construtora', 'incorporadora', 'concreteira',
                          'distribuidora', 'holding', 'spe',
                          'prestadora_servicos', 'administracao_patrimonial',
                          'industrial', 'transportadora', 'rural', 'comercial'
                        )),

  -- Visual
  logo_url              TEXT,
  cor_sistema           TEXT DEFAULT '#2563EB',

  -- Endereços separados (fiscal, operacional)
  endereco_fiscal       JSONB,   -- { cep, logradouro, numero, complemento, bairro, cidade, uf }
  endereco_operacional  JSONB,

  -- Contatos
  telefone              TEXT,
  email_financeiro      TEXT,
  email_fiscal          TEXT,
  email_comercial       TEXT,
  website               TEXT,

  -- Módulos habilitados por empresa (habilitar/desabilitar por tipo)
  modulos_habilitados   JSONB DEFAULT '{
    "obras": true,
    "compras": true,
    "financeiro": true,
    "fiscal": false,
    "rh": false,
    "incorporacao": false,
    "crm": false,
    "estoque": false,
    "broker_portal": false
  }'::jsonb,

  -- Tributário básico
  crt                   TEXT,
  retencao_iss          BOOLEAN DEFAULT false,
  retencao_inss         BOOLEAN DEFAULT false,
  retencao_irrf         BOOLEAN DEFAULT false,

  -- Estrutura de grupo econômico
  is_headquarters       BOOLEAN DEFAULT false,  -- empresa-mãe / sede do grupo
  holding_id            UUID REFERENCES companies(id),  -- empresa controladora (para SPE, filiais)

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, cnpj)
);

CREATE OR REPLACE FUNCTION set_companies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_companies_updated_at();

CREATE INDEX idx_companies_org_id ON companies(org_id);

-- ─── 2. RLS COMPANIES ───────────────────────────────────────

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select"
  ON companies FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "companies_insert_admin"
  ON companies FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE email = (auth.jwt() ->> 'email')
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "companies_update_admin"
  ON companies FOR UPDATE
  USING (
    org_id IN (
      SELECT organization_id FROM organization_members
      WHERE email = (auth.jwt() ->> 'email')
        AND role IN ('owner', 'admin')
    )
  );

-- ─── 3. SEED: uma company por org existente ─────────────────
-- Migra nome e CNPJ que já existem em organizations.
-- is_headquarters = true marca a empresa original de cada tenant.

INSERT INTO companies (
  org_id,
  razao_social,
  cnpj,
  tipo,
  is_headquarters,
  status
)
SELECT
  id          AS org_id,
  COALESCE(name, 'Empresa Principal') AS razao_social,
  cnpj,
  'construtora' AS tipo,
  true          AS is_headquarters,
  'ativa'       AS status
FROM organizations
ON CONFLICT (org_id, cnpj) DO NOTHING;

-- Para orgs sem CNPJ (cnpj IS NULL), o UNIQUE(org_id, cnpj) não pega — inserir mesmo assim
INSERT INTO companies (
  org_id,
  razao_social,
  tipo,
  is_headquarters,
  status
)
SELECT
  id,
  COALESCE(name, 'Empresa Principal'),
  'construtora',
  true,
  'ativa'
FROM organizations o
WHERE o.cnpj IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM companies c WHERE c.org_id = o.id
  );

-- ─── 4. ADICIONAR empresa_id NAS TABELAS FILHAS ─────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES companies(id);

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES companies(id);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES companies(id);

ALTER TABLE labor_teams
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES companies(id);

ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES companies(id);

ALTER TABLE cost_centers
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES companies(id);

ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES companies(id);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES companies(id);

-- ─── 5. BACKFILL ────────────────────────────────────────────
-- Liga todos os registros existentes à empresa-sede do seu org.

-- projects: organizationId fica dentro do JSONB settings (TEXT)
UPDATE projects p
SET empresa_id = c.id
FROM companies c
WHERE c.org_id::text = (p.settings->>'organizationId')
  AND c.is_headquarters = true
  AND p.empresa_id IS NULL;

-- contracts: coluna organization_id (UUID)
UPDATE contracts ct
SET empresa_id = c.id
FROM companies c
WHERE c.org_id = ct.organization_id
  AND c.is_headquarters = true
  AND ct.empresa_id IS NULL;

-- employees: coluna org_id (UUID)
UPDATE employees e
SET empresa_id = c.id
FROM companies c
WHERE c.org_id = e.org_id
  AND c.is_headquarters = true
  AND e.empresa_id IS NULL;

-- labor_teams: coluna org_id (UUID)
UPDATE labor_teams lt
SET empresa_id = c.id
FROM companies c
WHERE c.org_id = lt.org_id
  AND c.is_headquarters = true
  AND lt.empresa_id IS NULL;

-- payment_accounts: coluna organization_id (UUID)
UPDATE payment_accounts pa
SET empresa_id = c.id
FROM companies c
WHERE c.org_id = pa.organization_id
  AND c.is_headquarters = true
  AND pa.empresa_id IS NULL;

-- cost_centers: coluna organization_id (UUID)
UPDATE cost_centers cc
SET empresa_id = c.id
FROM companies c
WHERE c.org_id = cc.organization_id
  AND c.is_headquarters = true
  AND cc.empresa_id IS NULL;

-- chart_of_accounts: coluna organization_id (UUID)
UPDATE chart_of_accounts coa
SET empresa_id = c.id
FROM companies c
WHERE c.org_id = coa.organization_id
  AND c.is_headquarters = true
  AND coa.empresa_id IS NULL;

-- purchase_orders: herda empresa do projeto vinculado
UPDATE purchase_orders po
SET empresa_id = p.empresa_id
FROM projects p
WHERE po.project_id = p.id
  AND po.empresa_id IS NULL
  AND p.empresa_id IS NOT NULL;

-- ─── 6. ÍNDICES ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_empresa_id       ON projects(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contracts_empresa_id      ON contracts(empresa_id);
CREATE INDEX IF NOT EXISTS idx_employees_empresa_id      ON employees(empresa_id);
CREATE INDEX IF NOT EXISTS idx_labor_teams_empresa_id    ON labor_teams(empresa_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_empresa  ON payment_accounts(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_empresa      ON cost_centers(empresa_id);
CREATE INDEX IF NOT EXISTS idx_chart_accounts_empresa    ON chart_of_accounts(empresa_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_empresa   ON purchase_orders(empresa_id);
