-- migration: 20261230000007_empreendimento_commercial_building.sql
-- Vincula o Empreendimento a um "edifício-pai" no módulo Comercial (commercial_properties
-- type='BUILDING'). Ao publicar unidades no Comercial, todas ficam penduradas neste pai
-- via parent_id, em vez de soltas. ON DELETE SET NULL: apagar o edifício no Comercial
-- não destrói o empreendimento — apenas solta o vínculo (recriável na próxima publicação).

ALTER TABLE public.empreendimentos
    ADD COLUMN IF NOT EXISTS commercial_building_id UUID
        REFERENCES public.commercial_properties(id) ON DELETE SET NULL;
