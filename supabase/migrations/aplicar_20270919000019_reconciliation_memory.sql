-- ==========================================================================
-- Memória de classificação por contraparte + alias que aprende fornecedor
-- Date: 2026-09-06 · Plano: docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md (item 2.3)
-- ==========================================================================
-- PROBLEMA 1 — o sistema não aprendia fornecedor.
-- `reconciliation_aliases.party_id` era NOT NULL, e `learnAliasFromMatch` só
-- gravava quando o título tinha `party_id`. Só que a FK `internal_txs_party_id_fkey`
-- aponta apenas para `clients`: fornecedor SEMPRE tem party_id nulo, por regra.
-- Resultado medido em 05/09/2026: 2 aliases em toda a base, nenhum de fornecedor,
-- enquanto 73% do volume do extrato é débito.
-- Correção: `party_id` passa a aceitar NULL e a identidade do alias inclui o nome.
--
-- PROBLEMA 2 — o trabalho de classificar não era reaproveitado.
-- O uso real do módulo é classificar extrato (6.147 linhas já têm categoria por
-- regra), mas nada disso volta na importação seguinte. A memória abaixo guarda
-- "esta contraparte costuma ser esta categoria, esta obra, este centro de custo"
-- e devolve na próxima.
--
-- `counterparty_key` é o CNPJ/CPF só-dígitos quando o texto do extrato traz um, e o
-- token normalizado da descrição quando não traz. Documento é identidade forte;
-- token é heurística — por isso `key_kind` distingue os dois e a aplicação
-- automática pode exigir mais evidência do token.
--
-- REGRA #7: sem função nova aqui; RLS por is_org_member com WITH CHECK explícito.
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`) — NUNCA `supabase db push`.
-- ==========================================================================

SET lock_timeout = '10s';

-- ── 1. Alias aprende fornecedor (party_id nulo) ────────────────────────────
ALTER TABLE public.reconciliation_aliases ALTER COLUMN party_id DROP NOT NULL;

-- O UNIQUE antigo (org, alias_token, party_id) não separa dois fornecedores
-- distintos com party_id nulo: no Postgres, NULL nunca é igual a NULL, então o
-- índice deixa passar duplicata silenciosa. A identidade passa a incluir o nome.
-- O UNIQUE nasceu como CONSTRAINT, e o índice pertence a ela: derrubar o índice
-- direto dá 2BP01. A constraint cai primeiro e leva o índice junto.
ALTER TABLE public.reconciliation_aliases
  DROP CONSTRAINT IF EXISTS reconciliation_aliases_organization_id_alias_token_party_id_key;
DROP INDEX IF EXISTS reconciliation_aliases_organization_id_alias_token_party_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_aliases_identidade_uq
  ON public.reconciliation_aliases
     (organization_id, alias_token, party_type, coalesce(party_id::text, ''), coalesce(party_name, ''));

COMMENT ON COLUMN public.reconciliation_aliases.party_id IS
  'Nulo para fornecedor: internal_transactions.party_id tem FK só para clients, então fornecedor é identificado por party_name.';

-- ── 2. Memória de classificação ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reconciliation_classification_memory (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  counterparty_key TEXT        NOT NULL,
  key_kind         TEXT        NOT NULL CHECK (key_kind IN ('DOCUMENTO', 'TOKEN')),
  category         TEXT,
  project_id       UUID        REFERENCES public.projects(id) ON DELETE SET NULL,
  cost_center_id   UUID,
  party_type       TEXT        CHECK (party_type IS NULL OR party_type IN ('SUPPLIER', 'CLIENT')),
  party_id         UUID,
  party_name       TEXT,
  hits             INT         NOT NULL DEFAULT 1,
  last_used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, counterparty_key)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_memory_org_hits
  ON public.reconciliation_classification_memory (organization_id, hits DESC);

COMMENT ON TABLE public.reconciliation_classification_memory IS
  'O que esta organização costuma lançar para esta contraparte. Alimentada por toda classificação manual do extrato; aplicada na importação seguinte.';
COMMENT ON COLUMN public.reconciliation_classification_memory.counterparty_key IS
  'CNPJ/CPF só-dígitos quando o extrato traz um (key_kind=DOCUMENTO), senão o token normalizado da descrição (key_kind=TOKEN).';

ALTER TABLE public.reconciliation_classification_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reconciliation_memory_org" ON public.reconciliation_classification_memory;
CREATE POLICY "reconciliation_memory_org"
  ON public.reconciliation_classification_memory
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_classification_memory TO authenticated;

-- ── 3. Semeia a memória com o que já foi classificado à mão ────────────────
-- O trabalho já feito nas 6.147 linhas com categoria vira conhecimento em vez de
-- ficar preso a cada linha. Só entra contraparte com pelo menos 2 ocorrências
-- concordantes: uma única classificação pode ter sido engano.
INSERT INTO public.reconciliation_classification_memory
       (organization_id, counterparty_key, key_kind, category, project_id, cost_center_id, party_name, hits)
SELECT organization_id, chave, 'TOKEN', categoria, obra, cc, contraparte, n
  FROM (
    SELECT bt.organization_id,
           upper(regexp_replace(translate(coalesce(bt.counterparty_name, ''),
                    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
                    '[^A-Za-z0-9 ]', ' ', 'g'))                     AS chave,
           mode() WITHIN GROUP (ORDER BY bt.category)                AS categoria,
           mode() WITHIN GROUP (ORDER BY bt.project_id)              AS obra,
           mode() WITHIN GROUP (ORDER BY bt.cost_center_id)          AS cc,
           mode() WITHIN GROUP (ORDER BY bt.counterparty_name)       AS contraparte,
           count(*)                                                  AS n
      FROM public.bank_transactions bt
     WHERE coalesce(bt.counterparty_name, '') <> ''
       AND coalesce(bt.category, '') <> ''
     GROUP BY bt.organization_id, 2
    HAVING count(*) >= 2
  ) s
 WHERE btrim(chave) <> ''
    ON CONFLICT (organization_id, counterparty_key) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.reconciliation_classification_memory;
  RAISE NOTICE 'Memória semeada com % contrapartes', n;
END $$;
