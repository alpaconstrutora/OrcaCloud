-- ============================================================================
-- Planta Inteligente — TIPOS DE ELEMENTO ganham a família COMPONENTE (E7.1)
--
-- O componente (mobiliário, louça, bancada, armário, equipamento — kernel
-- 0.42.0) recebe custo, fabricante e código pelo tipo de elemento (E1.1), como
-- estrutura, terminal, escada e telhado. A CHECK da família era fechada.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--
-- ⚠️ JÁ APLICADA em produção (19/09/2026) sob o número 20270919000048. Foi
-- renumerada para 000050 porque outra frente (stock_items_source_ativos) chegou
-- ao 000048 primeiro. NÃO rodar de novo — é idempotente, mas não há por quê.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_element_types DROP CONSTRAINT IF EXISTS blueprint_element_types_familia_check;
ALTER TABLE public.blueprint_element_types
  ADD CONSTRAINT blueprint_element_types_familia_check
  CHECK (familia IN ('ESTRUTURA','TERMINAL','ESCADA','TELHADO','COMPONENTE'));
