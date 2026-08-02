-- ═══════════════════════════════════════════════════════════════════════════
-- APOSENTA `deal_installments` — não existe mais parcela de proposta
--
-- Decisão do usuário (02/08/2026), depois de usar o modelo anterior:
--
--   "Isso está gerando uma confusão enorme e desnecessária! Não quero mais
--    parcelas para proposta! Não tem nenhum ganho com isso! Elimine totalmente!
--    Ficando apenas as parcelas reais e que devem ir para o contas a receber!"
--
-- A tabela foi criada em 01/08 (`20270849000000`) para ser uma série única com
-- estado intermediário — a parcela existia como "Não lançada" e um botão a
-- publicava em Contas a Receber. Na prática isso criou duas realidades para o
-- mesmo dado e quatro incidentes seguidos.
--
-- Modelo atual: **parcela existe ⟺ está em Contas a Receber**. A única fonte é
-- `internal_transactions`; quem cria é o botão "Gerar parcelas" da aba Parcelas
-- (`services/dealReceivablesService.ts`), com confirmação explícita.
--
-- As linhas que nunca viraram cobrança (as "Não lançada") são descartadas —
-- elas não estavam no Contas a Receber, então o financeiro NÃO muda em nada
-- com esta migration.
--
-- ⚠️ DUAS PARTES. Rode a A, confira, e só então a B.
-- ⚠️ NUNCA `supabase db push` — SQL Editor, à mão.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE A — RELATÓRIO (não altera nada)
-- ───────────────────────────────────────────────────────────────────────────

-- A.1 — composição da tabela que será descartada
SELECT source,
       settlement_status,
       count(*)                                   AS parcelas,
       sum(amount)                                AS total,
       count(*) FILTER (WHERE published_at IS NOT NULL) AS publicadas
  FROM public.deal_installments
 GROUP BY source, settlement_status
 ORDER BY parcelas DESC;

-- A.2 — CONFERÊNCIA DE SEGURANÇA: nada que esteja publicado pode se perder.
-- O `DROP` abaixo não toca em `internal_transactions`; esta consulta só
-- confirma que toda linha publicada tem mesmo o lançamento correspondente lá.
-- Esperado: zero linhas. Se voltar alguma, PARE e me avise.
SELECT di.id, di.reference_id, di.amount, di.settlement_status
  FROM public.deal_installments di
 WHERE di.published_at IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM public.internal_transactions it
        WHERE it.organization_id = di.organization_id
          AND it.reference_id    = di.reference_id
          AND it.direction       = 'CREDIT');

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE B — BACKUP E DROP (só depois de conferir a A)
-- ───────────────────────────────────────────────────────────────────────────
--
-- Deixar a tabela vazia NÃO é opção: uma fonte adormecida foi exatamente o que
-- ressuscitou as parcelas pelo vault comercial em 01/08. Ou é fonte da verdade,
-- ou não existe.

/*  ── descomente para executar ─────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public._bkp_deal_installments AS
    SELECT * FROM public.deal_installments;

-- CASCADE leva junto a view auxiliar `_vw_cleanup_commercial_alvo`
-- (20270849000001), que dependia desta tabela e já cumpriu seu papel.
DROP TABLE public.deal_installments CASCADE;

COMMIT;

    ─────────────────────────────────────────────────────────────────────── */

-- ── Depreciação do espelho JSONB ───────────────────────────────────────────
-- `custom_installments` continua sendo escrito na geração porque
-- `contractService.createFromDeal` lê o valor da 1ª parcela para definir o
-- aluguel do contrato. Não é fonte de leitura da tela.
COMMENT ON COLUMN public.commercial_deals.custom_installments IS
    'Espelho do último cronograma gerado. NÃO é fonte da verdade: as parcelas '
    'reais vivem em internal_transactions (aba Parcelas = Contas a Receber). '
    'Mantido porque contractService.createFromDeal lê o valor da 1ª parcela.';

-- Conferência final (esperado: erro "relation does not exist" para a 1ª, o que
-- confirma o DROP; e o total de cobranças da área comercial na 2ª).
-- SELECT count(*) FROM public.deal_installments;
SELECT count(*) AS cobrancas_comerciais
  FROM public.internal_transactions
 WHERE direction = 'CREDIT'
   AND reference_id LIKE 'tx-%';
