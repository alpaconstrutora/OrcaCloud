-- ============================================================================
-- Congela `opura_asset_brands` (13/10/2026) — substituída por `product_brands`
--
-- Plano: docs/planos/2026-10-13-marcas-e-modelos.md
--
-- ⚠️ Aplicar SÓ DEPOIS de o frontend novo estar no ar (conferir-producao.sh).
--    Antes disso, a Gestão de Ativos publicada ainda grava marca aqui; congelar
--    cedo transformaria "Gerenciar Marcas" em erro para quem está com a aba
--    aberta. Depois do deploy, quem escreve aqui é cliente velho — e o erro
--    visível é melhor do que gravar marca num lugar que ninguém lê.
--
-- Leitura continua liberada (a RLS existente segue valendo). DROP fica para
-- uma semana depois, como item de acompanhamento do plano.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
-- ============================================================================

COMMENT ON TABLE public.opura_asset_brands IS
  'DEPRECADA em 2026-10-13 → product_brands (Configurações › Marcas e Modelos). Só leitura; a linha existente foi copiada com o mesmo id.';

REVOKE INSERT, UPDATE, DELETE ON public.opura_asset_brands FROM PUBLIC, anon, authenticated;
