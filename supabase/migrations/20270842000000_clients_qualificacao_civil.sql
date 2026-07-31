-- =============================================================================
-- Qualificação civil do cliente (locatário) — para a minuta de locação
-- Date: 2026-07-31
-- =============================================================================
-- A minuta de um contrato de locação abre qualificando as partes:
--   "FULANO DE TAL, brasileiro, casado sob o regime de comunhão parcial de bens,
--    engenheiro, portador do RG nº ... e inscrito no CPF sob o nº ..., residente
--    e domiciliado em ..."
--
-- `clients` já tem nome, documento, RG (rg/rg_uf/rg_issuing_agency) e endereço,
-- mas NÃO tem nacionalidade, profissão, estado civil, regime de bens nem cônjuge
-- — sem isso a cláusula de qualificação nasce incompleta. Esses campos só
-- existiam em `contract_guarantors` (garantidor/fiador); os nomes aqui são
-- IDÊNTICOS aos de lá, de propósito: mesmo vocabulário, mesmas constantes de UI
-- (constants/civilStatus.ts), mesmo componente de formulário reaproveitável.
--
-- ⚠️ `clients` é tabela QUENTE (PostgREST lê o tempo todo). Por isso:
--   • só ADD COLUMN de coluna NULLABLE — é metadata-only, não varre a tabela;
--   • sem CHECK — a enumeração vive em constants/civilStatus.ts, igual ao
--     precedente de contract_guarantors.marital_status (TEXT puro);
--   • sem DEFAULT — em PG11+ o default é lido pelas linhas antigas, então
--     `DEFAULT 'Brasileira'` faria o sistema AFIRMAR a nacionalidade de 100% dos
--     clientes legados sem ninguém ter digitado. O valor inicial vive no
--     useState do ClientModal, onde é sugestão e não fato;
--   • migration própria, separada da de commercial_properties — misturar DDL de
--     duas tabelas quentes na mesma transação foi o que causou o deadlock 40P01.
-- =============================================================================

SET lock_timeout = '4s';

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS nationality     TEXT,
    ADD COLUMN IF NOT EXISTS profession      TEXT,
    ADD COLUMN IF NOT EXISTS marital_status  TEXT,
    ADD COLUMN IF NOT EXISTS marital_regime  TEXT,
    ADD COLUMN IF NOT EXISTS spouse_name     TEXT,
    ADD COLUMN IF NOT EXISTS spouse_document TEXT;

COMMENT ON COLUMN public.clients.nationality IS
    'Nacionalidade do cliente PF (ex: Brasileira). Usada na cláusula de qualificação das partes do contrato.';
COMMENT ON COLUMN public.clients.profession IS
    'Profissão do cliente PF. Usada na cláusula de qualificação das partes do contrato.';
COMMENT ON COLUMN public.clients.marital_status IS
    'Estado civil. Vocabulário em constants/civilStatus.ts (mesmo de contract_guarantors.marital_status) — sem CHECK de propósito.';
COMMENT ON COLUMN public.clients.marital_regime IS
    'Regime de bens. Só faz sentido com marital_status casado / união estável. Vocabulário em constants/civilStatus.ts.';
COMMENT ON COLUMN public.clients.spouse_name IS
    'Nome do cônjuge — necessário para outorga conjugal (CC 1.647-1.649) na minuta.';
COMMENT ON COLUMN public.clients.spouse_document IS
    'CPF do cônjuge.';

-- =============================================================================
-- FIM: 20270842000000_clients_qualificacao_civil.sql
-- =============================================================================
