-- ============================================================================
-- Planta Inteligente — topografia fase 15: linhas de quebra e TIN importada.
--
-- `linhas_de_quebra`: [{ pontos: [{ x, y, cotaM }] }] em mm/m — polilinhas 3D
-- do levantamento (crista, pé de talude, meio-fio, curva de nível importada)
-- que a triangulação honra por densificação. Os vértices também estão em
-- `pontos_cotados`; a linha é por coordenada, não por índice.
-- `tin_importada`: { faces: [a, b, c, …] } — triplas de índices em
-- `pontos_cotados` de uma superfície importada (LandXML ou 3DFACE), usada
-- DIRETAMENTE em vez da triangulação nossa. NULL = TIN calculada.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_topografia
    ADD COLUMN IF NOT EXISTS linhas_de_quebra JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS tin_importada JSONB;

COMMENT ON COLUMN public.blueprint_study_topografia.linhas_de_quebra IS
  'Linhas de quebra (polilinhas 3D em mm/m) honradas pela triangulação por densificação; [] = nenhuma.';
COMMENT ON COLUMN public.blueprint_study_topografia.tin_importada IS
  'Faces da TIN importada (LandXML/3DFACE): triplas de índices em pontos_cotados; NULL = triangulação calculada.';

RESET lock_timeout;
