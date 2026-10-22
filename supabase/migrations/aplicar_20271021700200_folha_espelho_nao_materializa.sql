-- ============================================================================
-- Título da folha não é regravado pelo espelho da obra
-- Plano: docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md
--
-- O sync da folha mantém um espelho em projects.settings.financialInfo.transactions
-- (a tela financeira da obra o exibe). `financialSyncService.syncFinancialData`
-- — chamado pela Conciliação para TODAS as obras e ao salvar o financeiro da
-- obra — fazia upsert desse JSON em internal_transactions pelo MESMO
-- reference_id, com source_system 'PROJECT'. Efeitos medidos em 21/10/2026:
--   • a folha 04/2026 inteira (8 títulos) virou 'PROJECT', sem credor nem tipo;
--   • 2 títulos 'PROJECT' de uma folha que já não existe continuam a pagar;
--   • com os tributos da folha em Tributos a Pagar (party_type 'TAX'), o upsert
--     os tiraria de lá e ressuscitaria título que o sync da folha apagou.
-- O código novo não materializa mais `labor-…`; este gatilho garante o mesmo
-- para navegador com o bundle antigo em cache (PWA) e para qualquer outro
-- caminho: a linha 'PROJECT' com reference_id `labor-…` é IGNORADA (RETURN NULL
-- num BEFORE pula a linha, inclusive o ON CONFLICT do upsert).
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (nunca db push)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_folha_espelho_nao_materializa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- O dono de `labor-{folha}-…` é o sync da folha (source_system 'LABOR').
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_folha_espelho_nao_materializa() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_folha_espelho_nao_materializa ON public.internal_transactions;
CREATE TRIGGER trg_folha_espelho_nao_materializa
    BEFORE INSERT OR UPDATE ON public.internal_transactions
    FOR EACH ROW
    WHEN (NEW.source_system = 'PROJECT' AND NEW.reference_id LIKE 'labor-%')
    EXECUTE FUNCTION public.fn_folha_espelho_nao_materializa();

-- ── Verificação ─────────────────────────────────────────────────────────────
-- ⚠️ Sem BEGIN/ROLLBACK aqui: `db query -f` roda o arquivo numa transação só e o
-- ROLLBACK desfaria o gatilho junto (aconteceu na 1ª aplicação, 21/10/2026).
-- Com o gatilho, o INSERT abaixo não grava nada — RETURNING vem vazio.
WITH ins AS (
    INSERT INTO public.internal_transactions (organization_id, source_system, reference_id, transaction_date, amount, direction, description, status)
    VALUES ('926cf626-ba49-4ee4-9f35-472822fb90e6', 'PROJECT', 'labor-teste-espelho-nao-materializa', '2026-10-21', 1, 'DEBIT', 'teste', 'PENDING')
    RETURNING id
)
SELECT (SELECT count(*) FROM ins)                                                               AS linhas_inseridas_deve_ser_0,
       (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_folha_espelho_nao_materializa')     AS gatilho;
