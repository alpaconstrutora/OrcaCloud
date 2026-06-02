-- Adiciona campos de multa e juros à tabela boletos.
-- Ambos são opcionais: extraídos heuristicamente do texto do PDF ou preenchidos manualmente.

ALTER TABLE boletos
    ADD COLUMN IF NOT EXISTS multa           numeric(15, 2),   -- valor fixo de multa (R$)
    ADD COLUMN IF NOT EXISTS multa_percentual numeric(8, 4),   -- multa como % (alternativa ao valor fixo)
    ADD COLUMN IF NOT EXISTS juros_dia        numeric(8, 4),   -- juros de mora por dia (R$ ou %)
    ADD COLUMN IF NOT EXISTS juros_dia_tipo   text             -- 'valor' | 'percentual'
        CHECK (juros_dia_tipo IS NULL OR juros_dia_tipo IN ('valor', 'percentual'));

COMMENT ON COLUMN boletos.multa            IS 'Multa por atraso em R$ (extraída do texto do boleto)';
COMMENT ON COLUMN boletos.multa_percentual IS 'Multa por atraso em % (extraída do texto do boleto)';
COMMENT ON COLUMN boletos.juros_dia        IS 'Juros de mora por dia (valor ou percentual, conforme juros_dia_tipo)';
COMMENT ON COLUMN boletos.juros_dia_tipo   IS 'Tipo do campo juros_dia: valor (R$) ou percentual (%)';
