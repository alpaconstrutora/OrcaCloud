-- Vínculo opcional de Centro de Custo (cost_centers_v2) com Obra — pedido do
-- usuário em "Minha organização > Centro de custo": colunas Empreendimento e
-- Obra na listagem. Empreendimento é derivado em runtime a partir da Obra via
-- empreendimentoService.mapObrasToEmpreendimentos (mesmo padrão de
-- SupplyChainOrderList/EmpreendimentoCell) — não existe empreendimento_id
-- próprio aqui, só a obra real como FK.

ALTER TABLE public.cost_centers_v2
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cost_centers_v2_project_id ON public.cost_centers_v2(project_id);
