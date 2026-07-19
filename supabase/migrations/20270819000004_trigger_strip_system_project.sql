-- ==========================================================================
-- PASSO 2/2 — Trava: projeto de sistema não entra na dimensão obra
-- Date: 2026-07-19
-- ==========================================================================
-- Rede de segurança para o bug do 20270819000003 não voltar por outro caminho
-- (código novo, Edge Function, import manual, SQL direto). O fix em
-- `financialSyncService.ts` resolve o produtor de hoje; a trigger, os de amanhã.
--
-- ⚠️ ESTE SCRIPT PEGA AccessExclusiveLock EM `internal_transactions`
-- CREATE/DROP TRIGGER conflita com QUALQUER leitura da tabela — e o app lê
-- `internal_transactions`/`vw_receivables` o tempo todo. Foi assim que a versão
-- anterior (backfill + trigger juntos) deu `40P01: deadlock detected`.
--
-- Defesas aqui:
--   • `lock_timeout` **menor que o `deadlock_timeout`** (padrão 1s). Na 2ª
--     tentativa usamos 5s e ainda deu 40P01: o detector de deadlock dispara em
--     1s e mata a transação ANTES do lock_timeout de 5s ter chance de agir.
--     Com 800ms a espera aborta limpo (55P03) antes do detector rodar.
--   • Script curto e isolado: nada de UPDATE antes, então não há ordem de locks
--     invertida contra as queries do app.
--
-- SE DER `55P03 lock_timeout`: não é erro de sintaxe, é a tabela ocupada.
-- Feche as abas do sistema (ou rode fora do horário de uso) e execute de novo.
-- Nada fica pela metade — ou aplica inteiro, ou não aplica.
--
-- ⚠️ ESTA TRIGGER É OPCIONAL. O bug já está resolvido sem ela: o fix em
-- `financialSyncService.ts` impede gravar errado e o backfill (000003) limpou o
-- que existia. Ela só protege contra caminhos FUTUROS. Se continuar brigando
-- com o lock, deixe para uma janela de manutenção — não há urgência.
--
-- Idempotente: recria função e trigger iguais.
-- ==========================================================================

SET lock_timeout = '800ms';

-- ────────────────────────────────────────────────────────────
-- 1. Função — não toca em internal_transactions, não pega lock na tabela
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

-- ────────────────────────────────────────────────────────────
-- 2. Trigger — este é o passo que precisa do lock exclusivo
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_strip_system_project_from_internal_tx ON public.internal_transactions;

CREATE TRIGGER trg_strip_system_project_from_internal_tx
  BEFORE INSERT OR UPDATE OF project_id ON public.internal_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_strip_system_project_from_internal_tx();

-- ==========================================================================
-- FIM: 20270819000004_trigger_strip_system_project.sql
-- ==========================================================================
