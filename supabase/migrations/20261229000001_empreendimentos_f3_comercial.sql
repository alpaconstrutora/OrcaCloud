-- migration: 20261229000001_empreendimentos_f3_comercial.sql
-- F3: índice de busca reversa para a ponte unidade ↔ commercial_properties.
-- Sem novas colunas: commercial_property_id já existe em empreendimento_units
-- (migration 20261228000000). Apenas materializa o índice que faltava.

CREATE INDEX IF NOT EXISTS empr_units_commercial_prop_idx
    ON public.empreendimento_units (commercial_property_id)
    WHERE commercial_property_id IS NOT NULL;
