-- ============================================================================
-- Preferências de Suprimentos › Pedidos de Compra na tabela `public.preferencias`.
-- Plano: docs/planos/2026-11-09-pedido-compra-preferencias.md
-- Aplicar à mão (`npx supabase db query --linked -f <este arquivo>`), nunca `supabase db push`.
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD.
--
-- A tabela nasceu para a planta (aplicar_20271023300000) e só aceitava chave `planta.%` e valor
-- de até 1 KB. Os padrões do pedido novo moram nela também, com a mesma RLS:
--   ORGANIZACAO  chave `suprimentos.pedido.padroes`          — padrão da empresa (gestor grava)
--   USUARIO      chave `suprimentos.pedido.padroes.<orgId>`  — ajuste pessoal por organização
-- O valor é UM objeto com os campos definidos; a observação padrão pode passar de 1 KB, então o
-- teto de `suprimentos.%` é 4 KB. O teto da planta não muda.
--
-- REGRA #7: esta migration não cria função nem policy — só troca dois CHECK. As policies da tabela
-- (aplicar_20271023300000) continuam valendo: USUARIO só o próprio; ORGANIZACAO lê membro e grava
-- owner/admin (is_org_manager).
-- ============================================================================

SET lock_timeout = '10s';

ALTER TABLE public.preferencias DROP CONSTRAINT IF EXISTS preferencias_chave_sanidade;
ALTER TABLE public.preferencias ADD CONSTRAINT preferencias_chave_sanidade
  CHECK ((chave LIKE 'planta.%' OR chave LIKE 'suprimentos.%') AND length(chave) <= 100);

ALTER TABLE public.preferencias DROP CONSTRAINT IF EXISTS preferencias_valor_sanidade;
ALTER TABLE public.preferencias ADD CONSTRAINT preferencias_valor_sanidade
  CHECK (pg_column_size(valor) <= CASE WHEN chave LIKE 'suprimentos.%' THEN 4096 ELSE 1024 END);

RESET lock_timeout;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.preferencias'::regclass AND contype = 'c';
