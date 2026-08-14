-- ============================================================================
-- Ocupações — de que contrato de locação esta ocupação nasceu
-- Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
--        (seção "Ponte com Locações — importar ocupações dos contratos")
--
-- POR QUE ESTA COLUNA EXISTE: o índice `uidx_unit_occupancies_vigente` cobre
-- apenas ocupação VIGENTE (`ended_at IS NULL`). Ocupação encerrada não tem
-- trava nenhuma — e a importação traz contratos encerrados como histórico. Sem
-- uma marca de origem, clicar "Importar de Locações" duas vezes duplicaria todo
-- o histórico EM SILÊNCIO: nenhum erro, nenhum aviso, só o dobro de linhas.
--
-- A marca também é a resposta a "de onde veio esta ocupação?". Ocupação digitada
-- à mão tem `source_contract_id` nulo; importada aponta para o contrato vivo da
-- cadeia de renovação.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ. O SQL Editor roda o script inteiro como
--    UMA transação: um erro no meio desfaz os blocos anteriores.
-- ============================================================================

-- ═══ BLOCO 1 — a coluna ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.unit_occupancies
  ADD COLUMN IF NOT EXISTS source_contract_id UUID;

COMMENT ON COLUMN public.unit_occupancies.source_contract_id IS
  'Contrato de locação que originou esta ocupação (contracts.domain = LOCACAO). '
  'NULO = cadastrada à mão. Numa cadeia de renovação aponta para o contrato VIVO '
  '(o mais recente), porque renovar cria contrato-FILHO e não aditivo — a '
  'ocupação é a mesma continuando.';

-- ═══ BLOCO 2 — a chave estrangeira, sozinha ═════════════════════════════════
-- `contracts` é tabela quente (Gestão de Contratos, Locações, cron de reajuste).
-- FK exige ShareRowExclusiveLock na tabela REFERENCIADA — mesma família do
-- deadlock de aplicar_20270905000013. Se der 40P01, o lock_timeout aborta sem
-- estragar nada: repetir com o app fechado.
--
-- ON DELETE SET NULL, nunca CASCADE: apagar o contrato não pode apagar o
-- registro de quem morou ali. A ocupação vira "digitada à mão" e sobrevive.
SET lock_timeout = '5s';

ALTER TABLE public.unit_occupancies
  DROP CONSTRAINT IF EXISTS unit_occupancies_source_contract_fk;

ALTER TABLE public.unit_occupancies
  ADD CONSTRAINT unit_occupancies_source_contract_fk
  FOREIGN KEY (source_contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;

-- ═══ BLOCO 3 — a trava de idempotência ══════════════════════════════════════
-- Inclui `role` porque o mesmo contrato gera DUAS ocupações para a mesma unidade
-- (INQUILINO e RESPONSAVEL_FINANCEIRO) — sem o papel na chave, a segunda seria
-- recusada como duplicata da primeira.
-- Inclui `unit_id` porque um contrato reúne apto + vaga + box: N unidades, um
-- contrato só (ver commercial_deal_units, 20270825000020).
SET lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_unit_occupancies_origem
    ON public.unit_occupancies(source_contract_id, unit_id, role)
    WHERE source_contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unit_occupancies_source_contract
    ON public.unit_occupancies(source_contract_id)
    WHERE source_contract_id IS NOT NULL;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: coluna=1, fk=1, uidx_origem=1, fk_on_delete='n' (SET NULL)

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='unit_occupancies'
      AND column_name='source_contract_id')                                AS coluna,
  (SELECT count(*) FROM pg_constraint
    WHERE conname='unit_occupancies_source_contract_fk')                   AS fk,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public' AND indexname='uidx_unit_occupancies_origem') AS uidx_origem,
  (SELECT confdeltype FROM pg_constraint
    WHERE conname='unit_occupancies_source_contract_fk')                   AS fk_on_delete;

-- ═══ BLOCO 5 — teste da trava (opcional, desfaz sozinho) ════════════════════
-- Prova que reimportar não duplica. Troque os ids por reais e rode inteiro:
-- o segundo INSERT tem de falhar com
--   duplicate key value violates unique constraint "uidx_unit_occupancies_origem"
--
-- BEGIN;
--   INSERT INTO public.unit_occupancies (unit_id, client_id, organization_id, role, source_contract_id)
--   VALUES ('<unit>', '<client>', NULL, 'INQUILINO', '<contrato>');
--   INSERT INTO public.unit_occupancies (unit_id, client_id, organization_id, role, source_contract_id)
--   VALUES ('<unit>', '<client>', NULL, 'INQUILINO', '<contrato>');
-- ROLLBACK;
