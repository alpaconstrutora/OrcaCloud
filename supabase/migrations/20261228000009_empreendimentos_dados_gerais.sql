-- migration: 20261228000009_empreendimentos_dados_gerais.sql
-- Frente A do upgrade de cadastro: dados gerais + tipo do empreendimento + endereço
-- de divulgação separado do terreno. NÃO toca em pavimentos/sync (Frente B virá depois).

ALTER TABLE public.empreendimentos
    -- Tipo construtivo do empreendimento
    ADD COLUMN IF NOT EXISTS tipo TEXT
        CHECK (tipo IN ('VERTICAL','HORIZONTAL','MISTO','COND_LOGISTICO','COND_INDUSTRIAL')),

    -- Dados gerais / regularização
    ADD COLUMN IF NOT EXISTS matricula TEXT,
    ADD COLUMN IF NOT EXISTS construtora TEXT,            -- distinta da incorporadora (developer_name)
    ADD COLUMN IF NOT EXISTS responsavel_tecnico TEXT,
    ADD COLUMN IF NOT EXISTS crea_cau TEXT,
    ADD COLUMN IF NOT EXISTS numero_processo TEXT,        -- processo de aprovação na prefeitura

    -- Endereço de divulgação / oficial (separado do terreno_*)
    ADD COLUMN IF NOT EXISTS endereco_street TEXT,
    ADD COLUMN IF NOT EXISTS endereco_number TEXT,
    ADD COLUMN IF NOT EXISTS endereco_complement TEXT,
    ADD COLUMN IF NOT EXISTS endereco_neighborhood TEXT,
    ADD COLUMN IF NOT EXISTS endereco_city TEXT,
    ADD COLUMN IF NOT EXISTS endereco_state TEXT,
    ADD COLUMN IF NOT EXISTS endereco_zip_code TEXT;

COMMENT ON COLUMN public.empreendimentos.tipo IS
    'Tipo construtivo: VERTICAL, HORIZONTAL, MISTO, COND_LOGISTICO, COND_INDUSTRIAL';
COMMENT ON COLUMN public.empreendimentos.construtora IS
    'Construtora responsável pela obra (distinta da incorporadora em developer_name)';
COMMENT ON COLUMN public.empreendimentos.numero_processo IS
    'Número do processo de aprovação na prefeitura/órgão competente';
