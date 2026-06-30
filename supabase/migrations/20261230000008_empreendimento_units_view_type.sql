-- migration: 20261230000008_empreendimento_units_view_type.sql
-- Adiciona "qualidade da vista" às unidades do empreendimento. Junto de position_type
-- (FRENTE/LATERAL/FUNDOS) e sun_orientation (NORTE/SUL/LESTE/OESTE), já existentes,
-- forma os 3 atributos de precificação consumidos pelo motor hedônico do Comercial
-- (traduzidos PT→EN na publicação).

ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS view_type TEXT
        CHECK (view_type IN ('SEM_VISTA','PARCIAL','PLENA'));
