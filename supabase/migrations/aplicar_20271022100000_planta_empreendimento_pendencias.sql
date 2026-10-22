-- Planta ↔ Empreendimento: pendências das PRs #79/#81/#84 (plano docs/planos/2026-10-22-planta-empreendimento-pendencias.md).
-- Aplicar à mão (`npx supabase db query --linked -f <este arquivo>`), nunca `supabase db push`.
-- Idempotente: pode rodar de novo sem efeito.

-- 1) "Desligar" a zona passa a ser lembrado. Até aqui desligar APAGAVA a linha do contexto; sem
--    linha, a planta vinculada a um empreendimento com uma zona só reaplicava a zona sozinha na
--    abertura seguinte (PR #81). Agora desligar grava a linha zerada com esta data; aplicar limpa.
ALTER TABLE public.blueprint_study_urban_context
  ADD COLUMN IF NOT EXISTS zona_desligada_em timestamptz;

COMMENT ON COLUMN public.blueprint_study_urban_context.zona_desligada_em IS
  'Quando a pessoa desligou a zona do estudo. Com valor, a zona única do empreendimento não é aplicada sozinha.';

-- 2) Um empreendimento por planta. A tela e o serviço já impediam (vincularEmpreendimento recusa
--    empreendimento ligado a outra planta), mas a coluna não tinha trava: dois empreendimentos
--    apontando para a mesma planta quebrariam o envio da massa/loteamento sem ninguém ver.
--    Em 22/10/2026 havia 1 vínculo no banco, sem repetição.
CREATE UNIQUE INDEX IF NOT EXISTS empreendimentos_blueprint_study_unico
  ON public.empreendimentos (blueprint_study_id)
  WHERE blueprint_study_id IS NOT NULL;
