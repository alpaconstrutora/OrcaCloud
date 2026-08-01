-- ═══════════════════════════════════════════════════════════════════════════
-- REPARO — desfaz a adoção excessiva do passo 6.3 da 20270849000000
--
-- A primeira versão do passo 6.3 marcava `published_at` em QUALQUER parcela que
-- tivesse lançamento correspondente em Contas a Receber, inclusive as meramente
-- PREVISTO. Como a limpeza (20270849000001) poupa tudo que está publicado, o
-- efeito era whitelistar o passivo inteiro: a PARTE B não apagava nada.
--
-- A 6.3 já foi corrigida para adotar SÓ o que está liquidado, mas um UPDATE que
-- marca não desmarca — bancos que rodaram a versão original precisam deste
-- reparo. Ambiente novo não precisa (a 6.3 corrigida nunca cria o estado ruim);
-- rodar mesmo assim é inofensivo, o WHERE simplesmente não casa nada.
--
-- Levantamento no banco de produção em 2026-08-01, antes do reparo:
--   ASSINATURA RENTAL  96 parcelas   R$  51.146,00
--   PENDING    RENTAL  66 parcelas   R$ 187.800,00
--   PENDING    SALE    24 parcelas   R$ 953.583,00
--   RESERVA    RENTAL  36 parcelas   R$  36.000,00
--   RESERVA    SALE     2 parcelas   R$ 500.000,00
--   ────────────────────────────────────────────────
--   224 parcelas, R$ 1.728.529,00 — NENHUMA de negócio fechado
--   (zero em COMPLETED/CONTRATO) e NENHUMA recebida.
--
-- Decisão do usuário: varrer tudo, inclusive ASSINATURA — publicar passou a ser
-- ato explícito, e contrato em assinatura ainda não foi assinado. As parcelas
-- NÃO se perdem: voltam a ser plano ("Não lançada") e são republicadas com um
-- clique em "Enviar ao Contas a Receber", negócio a negócio, conforme fecham.
--
-- ⚠️ Rodar ANTES da PARTE B da 20270849000001. NUNCA `supabase db push`.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.deal_installments di
   SET published_at       = NULL,
       financial_entry_id = NULL,
       unpublished_at     = NOW(),
       settlement_status  = 'NAO_LANCADA'
  FROM public.internal_transactions it
 WHERE it.organization_id = di.organization_id
   AND it.reference_id    = di.reference_id
   AND it.direction       = 'CREDIT'
   AND di.published_at IS NOT NULL
   -- Trava dura, redundante com o levantamento acima mas obrigatória: dinheiro
   -- que entrou nunca é desmarcado, em nenhuma circunstância.
   AND it.status <> 'CONCILIATED'
   AND COALESCE(it.business_status, 'PREVISTO') NOT IN ('RECEBIDO', 'PAGO');

-- Conferência (esperado após o reparo: publicadas = 0, alvo = 226)
SELECT (SELECT count(*) FROM public.deal_installments WHERE published_at IS NOT NULL) AS publicadas,
       (SELECT count(*) FROM public.deal_installments WHERE settlement_status = 'NAO_LANCADA') AS nao_lancadas,
       (SELECT count(*) FROM public._vw_cleanup_commercial_alvo) AS alvo_da_limpeza;
