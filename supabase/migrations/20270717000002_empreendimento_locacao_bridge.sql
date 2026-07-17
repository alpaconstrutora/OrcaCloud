-- Ponte Empreendimento → Locações (espelho da ponte de Venda de Ativos).
-- Mesma mecânica do commercial_property_id/commercial_building_id (F3 Vendas),
-- mas num eixo INDEPENDENTE: uma unidade pode ser publicada para venda, para
-- locação, ou para ambas, sem conflito de status entre os dois inventários.
--
-- Colunas apenas (RLS é row-level, herdada das tabelas existentes). ALTERs
-- separados para não abrir janela de deadlock (ver histórico do módulo).

-- 1) Vínculo unidade → imóvel de locação no Comercial (purpose='RENTAL').
ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS rental_property_id UUID
        REFERENCES public.commercial_properties(id) ON DELETE SET NULL;

-- 2) Edifício-pai de locação no Comercial (agrupa as unidades publicadas p/ aluguel).
ALTER TABLE public.empreendimentos
    ADD COLUMN IF NOT EXISTS commercial_rental_building_id UUID
        REFERENCES public.commercial_properties(id) ON DELETE SET NULL;

-- 3) Índice de busca reversa (espelha empr_units_commercial_prop_idx).
CREATE INDEX IF NOT EXISTS empr_units_rental_prop_idx
    ON public.empreendimento_units (rental_property_id)
    WHERE rental_property_id IS NOT NULL;
