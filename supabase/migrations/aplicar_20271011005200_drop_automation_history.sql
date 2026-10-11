-- Apaga automation_history — o log da integração com o Make.com (11/10/2026)
--
-- Pedido do usuário, depois de remover o Make ("nao vou usar mais o make"):
-- "a tabela automation_history continua lá [...] Apague".
--
-- Nada mais grava nem lê: o único escritor era services/webhookService.ts, apagado
-- no commit "chore: remove a integração com o Make.com". Antes de apagar:
-- 30 linhas (pedidos, cotações e contratos enviados ao Make, 02–09/2026), sem view,
-- sem FK apontando para ela, sem função citando o nome. Backup das 30 linhas em
-- JSON ficou fora do repositório (scratchpad da sessão), não versionado.
--
-- Vai junto: o gatilho trg_automation_history_org (cai com a tabela), as duas
-- policies (idem) e a função fn_automation_history_org_from_project, que só
-- servia a esse gatilho.
--
-- Aplicar com `npx supabase db query --linked -f` — NUNCA `db push`. Idempotente.

BEGIN;

DROP TABLE IF EXISTS public.automation_history;
DROP FUNCTION IF EXISTS public.fn_automation_history_org_from_project();

COMMIT;
