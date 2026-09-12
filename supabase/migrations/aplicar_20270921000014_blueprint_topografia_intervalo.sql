-- ============================================================================
-- Planta Inteligente — topografia fase 13: o modo INTERVALO de níveis (passo
-- fixo a partir do mínimo do terreno — o "Interval" do Contour Map Creator).
--
-- Só o CHECK de `modo_niveis` muda: ganha o quarto valor. `niveis_m` guarda a
-- lista efetiva como nos modos NUMERO e PERSONALIZADO; `equidistancia_m`
-- guarda o próprio intervalo pedido.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_topografia
    DROP CONSTRAINT IF EXISTS blueprint_study_topografia_modo_niveis_check;

ALTER TABLE public.blueprint_study_topografia
    ADD CONSTRAINT blueprint_study_topografia_modo_niveis_check
        CHECK (modo_niveis IN ('EQUIDISTANCIA', 'NUMERO', 'PERSONALIZADO', 'INTERVALO'));

COMMENT ON COLUMN public.blueprint_study_topografia.modo_niveis IS
  'Como os níveis das curvas foram escolhidos: EQUIDISTANCIA (múltiplos de equidistancia_m), INTERVALO (equidistancia_m a partir do mínimo), NUMERO (N entre mín. e máx.) ou PERSONALIZADO (lista).';

RESET lock_timeout;
