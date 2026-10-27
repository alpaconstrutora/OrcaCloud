-- Pé-direito por pavimento no Empreendimento (27/10/2026).
--
-- Pedido: "crie pé-direito por pavimento em empreendimento" — depois da PR #204 (blocos da massa da Planta seguem
-- Torres e Unidades), o pé-direito era o único dado que a Planta ainda inventava (3,00 m em todo piso). Decisão do
-- usuário: o pé-direito mora no PAVIMENTO e a TORRE tem um padrão (o pavimento sem valor usa o da torre — cobre a
-- torre sem cadastro de pavimentos, como as do Garden Cambuhy, cujos andares vêm só das unidades).
-- Plano: docs/planos/2026-10-27-pe-direito-por-pavimento.md.
--
-- Metros com duas casas, como a tela digita. A faixa 2–15 m é a mesma do bloco de massa da Planta
-- (PE_DIREITO_MIN/MAX_DO_BLOCO_MM): um valor fora dela não teria como chegar à massa.
-- Só colunas novas e anuláveis: nenhuma linha muda; RLS das tabelas vale para elas sem nada a fazer.
-- Idempotente (IF NOT EXISTS). Aplicar com `npx supabase db query --linked -f` — nunca `db push`.

ALTER TABLE public.empreendimento_floors
  ADD COLUMN IF NOT EXISTS pe_direito_m numeric(5,2)
    CONSTRAINT empreendimento_floors_pe_direito_m_faixa CHECK (pe_direito_m IS NULL OR pe_direito_m BETWEEN 2 AND 15);

COMMENT ON COLUMN public.empreendimento_floors.pe_direito_m IS
  'Pé-direito (piso a piso) do pavimento, em metros; NULL = usa o padrão da torre (empreendimento_towers.pe_direito_padrao_m).';

ALTER TABLE public.empreendimento_towers
  ADD COLUMN IF NOT EXISTS pe_direito_padrao_m numeric(5,2)
    CONSTRAINT empreendimento_towers_pe_direito_padrao_m_faixa CHECK (pe_direito_padrao_m IS NULL OR pe_direito_padrao_m BETWEEN 2 AND 15);

COMMENT ON COLUMN public.empreendimento_towers.pe_direito_padrao_m IS
  'Pé-direito padrão dos pavimentos da torre, em metros; vale para o pavimento sem pe_direito_m e para a torre sem cadastro de pavimentos.';

NOTIFY pgrst, 'reload schema';
