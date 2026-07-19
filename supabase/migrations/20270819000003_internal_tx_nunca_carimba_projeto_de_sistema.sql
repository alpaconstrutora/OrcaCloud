-- ==========================================================================
-- internal_transactions NUNCA carrega um projeto de SISTEMA como obra
-- Date: 2026-07-19
-- ==========================================================================
-- CONTEXTO
-- "Gestão Comercial" é um projeto de SISTEMA (utils/systemProjects.ts): existe
-- só para pendurar as parcelas/transações do comercial (Vendas e Locações).
-- Ele NÃO é uma obra — mas é uma linha real em `projects`, com id real.
--
-- `financialSyncService.syncFinancialData` carimbava `project_id = project.id`
-- sem exceção. O comentário no código dizia "vaults org-level ficam null", mas
-- a implementação não fazia isso: o vault tem id, então o id do vault ia para
-- a coluna. Como `vw_receivables` faz LEFT JOIN projects → `p.name AS
-- project_name`, toda parcela gerada pelo comercial aparecia em Contas a
-- Receber com **Obra = "Gestão Comercial"**.
--
-- É a mesma família do bug que a REGRA OBRIGATÓRIA #2 do CLAUDE.md já cobria,
-- mas numa camada que ela não alcançava: a regra corta o projeto de sistema na
-- LEITURA (listas de obras); aqui ele estava sendo gravado na ESCRITA, então
-- nenhum filtro de listagem ajudava — o dado já nascia errado.
--
-- Prova de que o marcador certo já era conhecido: o backfill do DRE
-- (20261103000001, blocos 2a/2b) se protegeu com `source_system = 'PROJECT'`,
-- justamente para não atribuir o vault a uma obra. Só o financialSyncService
-- não tinha essa proteção.
--
-- ESTA MIGRATION
--   1. Corrige o dado já gravado (parcelas de Vendas/Locações que hoje exibem
--      "Gestão Comercial" na coluna Obra).
--   2. Instala uma trava no banco para o bug não voltar por outro caminho —
--      código novo, Edge Function, import manual, SQL direto. O fix no
--      TypeScript resolve o produtor de hoje; a trigger resolve os de amanhã.
--
-- Idempotente: rodar de novo afeta 0 linhas e recria a trigger igual.
-- ==========================================================================

-- ────────────────────────────────────────────────────────────
-- 1. Backfill — solta a dimensão obra das linhas já gravadas
-- ────────────────────────────────────────────────────────────
-- Critério pela tabela `projects` (flag OU nome), não por source_system: pega
-- também linhas gravadas antes de `isSystemProject` existir e as que vieram por
-- caminhos que nunca marcaram source_system='COMMERCIAL'.
-- Comparação por texto ('true') em vez de ::boolean: settings é JSONB livre e
-- um valor inesperado faria o cast lançar erro no meio do UPDATE.

UPDATE public.internal_transactions it
SET    project_id = NULL
FROM   public.projects p
WHERE  p.id = it.project_id
  AND  (
        p.settings->>'isSystemProject' = 'true'
     OR p.name = 'Gestão Comercial'
  );

-- ────────────────────────────────────────────────────────────
-- 2. Trava — projeto de sistema não entra na dimensão obra
-- ────────────────────────────────────────────────────────────
-- SECURITY DEFINER de propósito: a checagem precisa enxergar a linha de
-- `projects` mesmo quando a RLS a esconderia do usuário que está gravando.
-- Sem isso o EXISTS daria falso e a trava passaria batido.
-- Delimitador nomeado ($fn$) e não $$: o editor SQL do Supabase injeta
-- comentários entre statements e corta o $$ ("unterminated dollar-quoted
-- string") — ver project_modulo_financeiro_fase7.

CREATE OR REPLACE FUNCTION public.fn_strip_system_project_from_internal_tx()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.project_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM   public.projects p
      WHERE  p.id = NEW.project_id
        AND  (
              p.settings->>'isSystemProject' = 'true'
           OR p.name = 'Gestão Comercial'
        )
  ) THEN
    -- Projeto de sistema (vault comercial) não é obra: a parcela fica sem
    -- dimensão obra e a coluna Obra mostra "—".
    NEW.project_id := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Função de trigger não é chamável como RPC, mas é SECURITY DEFINER:
-- fecha para PUBLIC por padrão da casa (ver feedback_rpc_revoke_public_default).
REVOKE ALL ON FUNCTION public.fn_strip_system_project_from_internal_tx() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_strip_system_project_from_internal_tx ON public.internal_transactions;

CREATE TRIGGER trg_strip_system_project_from_internal_tx
  BEFORE INSERT OR UPDATE OF project_id ON public.internal_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_strip_system_project_from_internal_tx();

-- ==========================================================================
-- FIM: 20270819000003_internal_tx_nunca_carimba_projeto_de_sistema.sql
-- ==========================================================================
