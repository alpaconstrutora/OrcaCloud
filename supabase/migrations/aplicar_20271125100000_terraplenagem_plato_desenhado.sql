-- ─────────────────────────────────────────────────────────────────────────────
-- TERRAPLENAGEM: o platô DESENHADO (25/11/2026)
--
-- Pedido: o reel "Terrain Modification Tool" — desenhar o platô e ajustá-lo no
-- 3D. Decisões do usuário: um só platô (o de hoje) e "desenhar na planta,
-- ajustar no 3D". Plano: docs/planos/2026-11-25-planta-plato-desenhado-3d.md.
--
--  - `base` ganha 'DESENHADO' (o contorno que o usuário desenhou);
--  - `anel_desenhado` guarda o DESENHO à parte, em mm do desenho
--    ([{x, y}, …]). O `anel_plato` é o anel EM USO e é sobrescrito a cada
--    troca de base (e pelo "Lançar" da casa); sem coluna própria, trocar para
--    "No lote" e voltar apagaria o desenho do usuário.
--
-- Aditivo: uma coluna anulável e a CHECK alargada. Nenhuma premissa existente
-- muda. A coluna herda as policies da tabela (org-scoped desde
-- `aplicar_20270921000006`) — não há policy nem função nova.
--
-- ⚠️ APLICAR À MÃO, ANTES do merge do código que lê a coluna
-- (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.blueprint_study_terraplenagem
  ADD COLUMN IF NOT EXISTS anel_desenhado JSONB;

COMMENT ON COLUMN public.blueprint_study_terraplenagem.anel_desenhado IS
  'O contorno do platô DESENHADO pelo usuário, mm do desenho ([{x, y}, …]); guardado à parte para não se perder quando a base muda. NULL = nunca desenhado.';

ALTER TABLE public.blueprint_study_terraplenagem
  DROP CONSTRAINT IF EXISTS blueprint_study_terraplenagem_base_check;
ALTER TABLE public.blueprint_study_terraplenagem
  ADD CONSTRAINT blueprint_study_terraplenagem_base_check
  CHECK (base IN ('ENVELOPE', 'LOTE', 'CASA', 'DESENHADO'));

-- O desenho, quando vem, é uma lista de pelo menos 3 pontos.
ALTER TABLE public.blueprint_study_terraplenagem
  DROP CONSTRAINT IF EXISTS blueprint_study_terraplenagem_anel_desenhado_chk;
ALTER TABLE public.blueprint_study_terraplenagem
  ADD CONSTRAINT blueprint_study_terraplenagem_anel_desenhado_chk
  CHECK (anel_desenhado IS NULL OR (jsonb_typeof(anel_desenhado) = 'array' AND jsonb_array_length(anel_desenhado) >= 3));

COMMIT;
