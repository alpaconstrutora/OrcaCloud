-- =============================================================================
-- Representante legal do cliente PESSOA JURÍDICA — para a minuta de contrato
-- Date: 2026-08-04
-- =============================================================================
-- Hoje `clientQualification()` (services/docxFieldCatalog.ts) qualifica um
-- cliente PJ assim: "EMPRESA LTDA, pessoa jurídica de direito privado, inscrita
-- no CNPJ sob o nº ..., com sede em ...", sem NUNCA citar quem assina pela
-- empresa — falta a cláusula "neste ato representada por FULANO, ...", que
-- `landlordQualification()` (locador) já tem para `companies`. Cliente PJ
-- (comprador/locatário/tomador pessoa jurídica) tinha essa mesma lacuna.
--
-- Os nomes espelham o vocabulário já usado em `clients` para a qualificação da
-- PF (migration 20270842000000) e em `contract_guarantors`, só prefixados
-- `legal_rep_` — mesmo padrão, não vocabulário novo. Sem `marital_status` /
-- cônjuge aqui de propósito: quem assina PELA empresa não está outorgando bem
-- próprio (CC 1.647-1.649 não se aplica a esta cláusula), então essa parte da
-- qualificação PF não faz sentido para o representante.
--
-- ⚠️ `clients` é tabela QUENTE (PostgREST lê o tempo todo). Por isso:
--   • só ADD COLUMN de coluna NULLABLE — é metadata-only, não varre a tabela;
--   • sem CHECK / sem FK — texto livre, igual ao precedente da qualificação civil;
--   • sem DEFAULT — nada a afirmar sobre os PJ já cadastrados;
--   • migration própria, isolada, para não segurar lock de outra tabela quente.
-- =============================================================================

SET lock_timeout = '4s';

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS legal_rep_name             TEXT,
    ADD COLUMN IF NOT EXISTS legal_rep_document          TEXT,
    ADD COLUMN IF NOT EXISTS legal_rep_rg                TEXT,
    ADD COLUMN IF NOT EXISTS legal_rep_rg_uf             TEXT,
    ADD COLUMN IF NOT EXISTS legal_rep_rg_issuing_agency TEXT,
    ADD COLUMN IF NOT EXISTS legal_rep_nationality       TEXT,
    ADD COLUMN IF NOT EXISTS legal_rep_role               TEXT;

COMMENT ON COLUMN public.clients.legal_rep_name IS
    'Nome do representante legal (pessoa física) do cliente PJ. Usado na cláusula "neste ato representada por..." da minuta.';
COMMENT ON COLUMN public.clients.legal_rep_document IS
    'CPF do representante legal.';
COMMENT ON COLUMN public.clients.legal_rep_rg IS
    'RG do representante legal.';
COMMENT ON COLUMN public.clients.legal_rep_rg_uf IS
    'UF de expedição do RG do representante legal.';
COMMENT ON COLUMN public.clients.legal_rep_rg_issuing_agency IS
    'Órgão expedidor do RG do representante legal (ex: SSP).';
COMMENT ON COLUMN public.clients.legal_rep_nationality IS
    'Nacionalidade do representante legal (ex: Brasileira).';
COMMENT ON COLUMN public.clients.legal_rep_role IS
    'Cargo/qualificação do representante legal perante o cliente PJ (ex: Sócio-administrador, Procurador).';

-- =============================================================================
-- FIM: 20270867000000_clients_legal_representative.sql
-- =============================================================================
