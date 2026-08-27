-- ============================================================================
-- Cobrança condominial — do rateio fechado ao boleto/PIX (fatia 2)
-- Plano: docs/planos/2026-08-27-cobranca-condominial.md
--
-- O ELO QUE FALTAVA: `asaas-charge` emite cobrança sobre um RECEBÍVEL
-- (`internal_transactions`), não sobre o rateio. Então a cota precisa ser
-- MATERIALIZADA como recebível antes de virar boleto. Esta migration cria o
-- vínculo entre a cota e o recebível dela, e os parâmetros de multa/juros.
--
-- DECISÕES DO USUÁRIO (27/08/2026):
--   1. Quem paga o EXTRAORDINÁRIO: "opção para o usuário escolher entre
--      proprietario e responsavel" — é escolha no momento de gerar, não regra
--      fixa. Por isso NÃO há coluna de pagador aqui: a escolha é do gesto, e
--      fica registrada no recebível que nasce dela.
--   2. Vencimento: escolhido na hora de gerar — por isso nenhuma coluna de dia
--      fixo.
--   3. Multa e juros: configuráveis POR CONDOMÍNIO — os dois campos abaixo.
--
-- O QUE ESTA MIGRATION NÃO FAZ: inadimplência, acordos, fundo de reserva e
-- prestação de contas seguem fora. Multa e juros entram porque o Asaas os
-- calcula sozinho na emissão — é parâmetro de boleto, não régua de cobrança.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ. O SQL Editor roda o script inteiro como
--    UMA transação: um erro no meio desfaz os blocos anteriores.
-- ============================================================================

-- ═══ BLOCO 1 — parâmetros de cobrança do condomínio ═════════════════════════
-- Os defaults são o TETO do Código Civil para condomínio (art. 1.336 §1º):
-- multa de 2% sobre o débito e juros de 1% ao mês. Convenção pode fixar menos,
-- nunca mais — daí o CHECK. O limite de 10 não é jurídico: é anteparo de
-- digitação (quem quis 2 e digitou 20 descobre aqui, não no boleto do condômino).

ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS cobranca_multa_percent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS cobranca_juros_mes_percent NUMERIC(5,2) NOT NULL DEFAULT 1.00;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empreendimentos_cobranca_percentuais_chk') THEN
    ALTER TABLE public.empreendimentos
      ADD CONSTRAINT empreendimentos_cobranca_percentuais_chk
      CHECK (cobranca_multa_percent     >= 0 AND cobranca_multa_percent     <= 10
         AND cobranca_juros_mes_percent >= 0 AND cobranca_juros_mes_percent <= 10);
  END IF;
END $$;

COMMENT ON COLUMN public.empreendimentos.cobranca_multa_percent IS
  'Multa por atraso aplicada ao boleto da cota condominial, em %. Default 2.00 '
  '= teto do Código Civil (art. 1.336 §1º). A convenção pode fixar MENOS.';
COMMENT ON COLUMN public.empreendimentos.cobranca_juros_mes_percent IS
  'Juros ao mês aplicados ao boleto da cota condominial, em %. Default 1.00 '
  '= teto do Código Civil. Quem calcula é o Asaas, a partir do vencimento.';

-- ═══ BLOCO 2 — a cota aponta para o recebível que nasceu dela ═══════════════
-- Sem esta coluna não há como saber se uma cota já virou cobrança, e gerar duas
-- vezes produziria dois boletos para o mesmo condômino no mesmo mês.

ALTER TABLE public.condominio_rateio_itens
  ADD COLUMN IF NOT EXISTS transaction_id UUID;

COMMENT ON COLUMN public.condominio_rateio_itens.transaction_id IS
  'Recebível (internal_transactions) gerado a partir desta cota. NULO = cota '
  'ainda não materializada, ou não cobrável (sem responsável / sem CPF-CNPJ). '
  'É a partir dele que asaas-charge emite o boleto.';

-- ═══ BLOCO 3 — a FK, sozinha ════════════════════════════════════════════════
-- ON DELETE SET NULL, nunca CASCADE: apagar o recebível não pode apagar a
-- memória de quanto aquela unidade devia naquela competência. O rateio é
-- prestação de contas — o rastro sobrevive ao lançamento.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'condominio_rateio_itens_transaction_fk') THEN
    ALTER TABLE public.condominio_rateio_itens
      ADD CONSTRAINT condominio_rateio_itens_transaction_fk
      FOREIGN KEY (transaction_id) REFERENCES public.internal_transactions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══ BLOCO 4 — a trava de idempotência ══════════════════════════════════════
-- Um recebível serve a UMA cota. Índice PARCIAL porque a esmagadora maioria das
-- cotas tem transaction_id nulo (as não cobráveis, e as ainda não geradas) — e
-- NULL não colide com NULL num índice único, mas o parcial deixa a intenção
-- explícita e mantém o índice pequeno.

CREATE UNIQUE INDEX IF NOT EXISTS uidx_rateio_item_transaction
    ON public.condominio_rateio_itens(transaction_id)
    WHERE transaction_id IS NOT NULL;

-- ═══ BLOCO 5 — o rateio sabe se já foi cobrado ══════════════════════════════
-- Distingue "fechado" de "fechado e já cobrado" sem inventar um quarto status.
-- Status é o ciclo de vida do rateio (rascunho → fechado → cancelado); cobrança
-- é outro eixo, e misturar os dois faria "CANCELADO depois de cobrado" virar um
-- estado impossível de representar.

ALTER TABLE public.condominio_rateios
  ADD COLUMN IF NOT EXISTS cobranca_gerada_em TIMESTAMPTZ;

COMMENT ON COLUMN public.condominio_rateios.cobranca_gerada_em IS
  'Quando as cotas deste rateio viraram recebíveis. NULO = fechado mas ainda '
  'não cobrado. Não é status: cobrança é eixo próprio, ortogonal ao ciclo '
  'rascunho/fechado/cancelado.';

CREATE INDEX IF NOT EXISTS idx_rateios_cobranca_pendente
    ON public.condominio_rateios(empreendimento_id)
    WHERE status = 'FECHADO' AND cobranca_gerada_em IS NULL;

-- ═══ BLOCO 6 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: cols_empreendimento=2, chk_percentuais=1, col_item=1, fk=1,
--           fk_on_delete='n' (SET NULL), uidx=1, col_rateio=1, idx_pendente=1

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='empreendimentos'
      AND column_name IN ('cobranca_multa_percent','cobranca_juros_mes_percent'))   AS cols_empreendimento,
  (SELECT count(*) FROM pg_constraint
    WHERE conname='empreendimentos_cobranca_percentuais_chk')                        AS chk_percentuais,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='condominio_rateio_itens'
      AND column_name='transaction_id')                                              AS col_item,
  (SELECT count(*) FROM pg_constraint
    WHERE conname='condominio_rateio_itens_transaction_fk')                          AS fk,
  -- confdeltype: 'n' = SET NULL. NÃO é "no action" — 'a' é que é NO ACTION.
  (SELECT confdeltype FROM pg_constraint
    WHERE conname='condominio_rateio_itens_transaction_fk')                          AS fk_on_delete,
  (SELECT count(*) FROM pg_indexes WHERE indexname='uidx_rateio_item_transaction')   AS uidx,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='condominio_rateios'
      AND column_name='cobranca_gerada_em')                                          AS col_rateio,
  (SELECT count(*) FROM pg_indexes WHERE indexname='idx_rateios_cobranca_pendente')  AS idx_pendente;

-- ═══ BLOCO 7 — teste da trava (opcional, desfaz sozinho) ════════════════════
-- Prova que o mesmo recebível não pode servir a duas cotas:
--
-- BEGIN;
--   -- pegue duas cotas quaisquer do mesmo rateio e um transaction_id real:
--   -- UPDATE condominio_rateio_itens SET transaction_id = '<tx>' WHERE id = '<cota A>';
--   -- UPDATE condominio_rateio_itens SET transaction_id = '<tx>' WHERE id = '<cota B>';
--   -- esperado: 23505 duplicate key em uidx_rateio_item_transaction
-- ROLLBACK;
--
-- Nada de RLS/GRANT novo aqui: as três tabelas tocadas já têm política e grant
-- desde as migrations 17 e 24, e colunas herdam a política da tabela.
