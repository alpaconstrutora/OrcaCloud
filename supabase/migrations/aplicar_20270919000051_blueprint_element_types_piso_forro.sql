-- ============================================================================
-- Planta Inteligente — TIPOS DE ELEMENTO ganham as famílias PISO e FORRO (E7.2)
--
-- O ambiente declara piso (camadas + rodapé) e forro (camadas + rebaixo) na
-- etiqueta (kernel 0.43.0); a composição repetida vira tipo da organização,
-- como a composição da parede em `blueprint_wall_types`. A CHECK da família
-- era fechada em cinco valores.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_element_types DROP CONSTRAINT IF EXISTS blueprint_element_types_familia_check;
ALTER TABLE public.blueprint_element_types
  ADD CONSTRAINT blueprint_element_types_familia_check
  CHECK (familia IN ('ESTRUTURA','TERMINAL','ESCADA','TELHADO','COMPONENTE','PISO','FORRO'));
