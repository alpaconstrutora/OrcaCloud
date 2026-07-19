-- ==========================================================================
-- PASSO 1/2 — Backfill: solta a dimensão obra das linhas já gravadas
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
-- ⚠️ POR QUE ESTE ARQUIVO É SÓ O BACKFILL
-- A primeira versão fazia backfill + CREATE TRIGGER no mesmo script e deu
-- `40P01: deadlock detected` com o app em produção rodando. Motivo: o UPDATE
-- pega AccessShareLock em `projects` + RowExclusive em `internal_transactions`;
-- em seguida o CREATE TRIGGER precisa escalar para AccessExclusiveLock em
-- `internal_transactions` — enquanto uma query viva do app segurava
-- `internal_transactions` e pedia `projects`. Ordem de locks invertida = deadlock.
-- A trigger (defensiva) foi separada em 20270819000004, que é curto e isolado.
--
-- Este passo é DML puro: não escala lock, não conflita com leitura do app.
-- Idempotente: rodar de novo afeta 0 linhas.
-- ==========================================================================

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

-- Conferência: deve retornar 0 linhas depois do UPDATE acima.
SELECT count(*) AS parcelas_ainda_com_projeto_de_sistema
FROM   public.internal_transactions it
JOIN   public.projects p ON p.id = it.project_id
WHERE  p.settings->>'isSystemProject' = 'true'
   OR  p.name = 'Gestão Comercial';

-- ==========================================================================
-- FIM: PASSO 1/2 — rodar em seguida 20270819000004 (trigger)
-- ==========================================================================
