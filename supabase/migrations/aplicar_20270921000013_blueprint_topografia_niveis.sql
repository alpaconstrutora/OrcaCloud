-- ============================================================================
-- Planta Inteligente — topografia fase 12: como os níveis das curvas foram
-- escolhidos (o que o Contour Map Creator oferece).
--
-- `modo_niveis`: EQUIDISTANCIA (cotas redondas, o padrão até aqui), NUMERO
-- (N níveis igualmente espaçados entre o mínimo e o máximo) ou PERSONALIZADO
-- (lista digitada). `niveis_m`: a lista efetiva de cotas das curvas nos dois
-- modos novos; NULL na equidistância (os níveis saem de `equidistancia_m`).
-- `equidistancia_m` continua NOT NULL: nos modos novos guarda o menor passo
-- entre níveis, que é o que o hipsométrico e a proveniência leem.
--
-- Nasceu como 20270921000012; renumerada antes de ser aplicada porque outra
-- frente (pricing_rule_applications) já usava o número.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_topografia
    ADD COLUMN IF NOT EXISTS modo_niveis TEXT NOT NULL DEFAULT 'EQUIDISTANCIA'
        CHECK (modo_niveis IN ('EQUIDISTANCIA', 'NUMERO', 'PERSONALIZADO')),
    ADD COLUMN IF NOT EXISTS niveis_m JSONB;

COMMENT ON COLUMN public.blueprint_study_topografia.modo_niveis IS
  'Como os níveis das curvas foram escolhidos: EQUIDISTANCIA (múltiplos de equidistancia_m), NUMERO (N entre mín. e máx.) ou PERSONALIZADO (lista).';
COMMENT ON COLUMN public.blueprint_study_topografia.niveis_m IS
  'As cotas das curvas, em m, nos modos NUMERO e PERSONALIZADO; NULL na equidistância.';

RESET lock_timeout;
