-- migration: 20261230000002_empreendimento_units_floor_tipo.sql
-- Adiciona floor_tipo diretamente na unidade para que o usuário possa
-- definir o tipo de pavimento (SUBSOLO/TERREO/TIPO/etc.) sem precisar
-- de um template de pavimento no FloorEditor.

ALTER TABLE public.empreendimento_units
    ADD COLUMN IF NOT EXISTS floor_tipo TEXT
        CHECK (floor_tipo IN ('SUBSOLO','TERREO','MEZANINO','TIPO','COBERTURA','TECNICO','GARAGEM','OUTRO'));
