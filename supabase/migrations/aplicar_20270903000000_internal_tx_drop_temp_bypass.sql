-- ═════════════════════════════════════════════════════════════════════════════
-- internal_transactions — remover TEMP_BYPASS_ALL_INTERNAL_TXS
-- ═════════════════════════════════════════════════════════════════════════════
-- Descoberto em 2026-08-06: `GET /rest/v1/internal_transactions` com a chave
-- publicável (sem sessão) devolvia `Content-Range: 0-999/1300` — valor,
-- descrição, party_name e organization_id de várias organizações.
--
-- A causa NÃO é RLS desligada. É esta policy, que existe só no remoto (não está
-- em migration nenhuma deste repositório — foi aplicada por SQL direto):
--
--     TEMP_BYPASS_ALL_INTERNAL_TXS | {public} | ALL | true
--
-- `{public}` engloba `anon` e `authenticated`; `ALL` cobre SELECT/INSERT/
-- UPDATE/DELETE; `qual = true` não filtra nada. Como `anon` também tem os
-- GRANTs default do Supabase, a exposição não era só de leitura.
--
-- ⚠️ TABELA QUENTE: 84 usos diretos nos services, além de `vw_payables`,
-- `vw_receivables`, partida dobrada e a trigger
-- `trg_strip_system_project_from_internal_tx`. Daí o `lock_timeout` e os
-- guardas abaixo. NUNCA `supabase db push` — o histórico de `schema_migrations`
-- deste projeto está furado.
--
-- LEVANTAMENTO DE IMPACTO (feito antes de escrever isto): nenhum consumidor
-- legítimo depende do bypass.
--   • asaas-charge / dunning-notifier usam a anon key só para `auth.getUser()`;
--     as queries vão pelo cliente `admin` com service_role (bypassa RLS).
--   • asaas-webhook é service_role direto.
--   • O app roda como `authenticated` → coberto por "Manage ... as member".
--   • Parceiro logado → coberto por `internal_transactions_select_partner`.
--   • Portais públicos (Corretor, Cliente, Investidor) não tocam esta tabela,
--     nem `vw_payables`, nem `vw_receivables`.

SET lock_timeout = '5s';

DO $$
DECLARE
    v_sem_org   BIGINT;
    v_tem_membro BOOLEAN;
BEGIN
    -- GUARDA 1 — lançamento sem organização.
    -- `is_org_member` faz `WHERE organization_id = org_id`, e `= NULL` é NULL,
    -- logo devolve FALSE. Toda linha com organization_id nulo fica invisível e
    -- toda escrita sem org passa a ser recusada assim que o bypass cair. Se
    -- houver alguma, o backfill vem ANTES — não se derruba a policy e se
    -- descobre depois, em produção.
    SELECT count(*) INTO v_sem_org
      FROM public.internal_transactions
     WHERE organization_id IS NULL;

    IF v_sem_org > 0 THEN
        RAISE EXCEPTION
            'ABORTADO: % lancamento(s) com organization_id NULL. Derrubar o bypass agora os tornaria invisiveis e quebraria a escrita. Faca o backfill da organizacao primeiro.',
            v_sem_org;
    END IF;

    -- GUARDA 2 — não derrubar o bypass sem ter o que o substitua.
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'internal_transactions'
           AND policyname = 'Manage internal_transactions as member'
    ) INTO v_tem_membro;

    IF NOT v_tem_membro THEN
        RAISE EXCEPTION
            'ABORTADO: a policy "Manage internal_transactions as member" nao existe. Derrubar o bypass trancaria a tabela para todo mundo.';
    END IF;
END $$;

-- Idempotente: rodar de novo não falha.
DROP POLICY IF EXISTS "TEMP_BYPASS_ALL_INTERNAL_TXS" ON public.internal_transactions;

-- Rede de segurança: a policy só vale se o RLS estiver ligado. Já deveria
-- estar (3 migrations o ligam), mas o remoto já divergiu do repo uma vez —
-- que é justamente como esta policy apareceu.
ALTER TABLE public.internal_transactions ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — rodar depois, e conferir o efeito, não o arquivo
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) Sobraram só as duas policies legítimas, ambas {authenticated}:
--      SELECT policyname, roles, cmd FROM pg_policies
--       WHERE tablename = 'internal_transactions';
--    Esperado: "Manage internal_transactions as member" (ALL) e
--              "internal_transactions_select_partner" (SELECT). Nenhuma {public}.
--
-- 2) RLS ligada:
--      SELECT relrowsecurity FROM pg_class WHERE relname = 'internal_transactions';
--    Esperado: true
--
-- 3) A prova que importa — anon não lê mais. Fora do SQL Editor:
--      curl -s "$URL/rest/v1/internal_transactions?select=id&limit=1" -H "apikey: $ANON"
--    Esperado: `[]` (o GRANT continua, a policy é que barra), NUNCA uma linha.
--
-- 4) Regressão no app, com sessão: Contas a Pagar, Contas a Receber, Extrato e
--    Conciliação continuam listando. Se algo esvaziar, é um caller gravando sem
--    organization_id — o guarda 1 deveria ter pego, mas confira.
