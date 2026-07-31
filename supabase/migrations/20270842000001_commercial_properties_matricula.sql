-- =============================================================================
-- Registro do imóvel: matrícula, cartório e inscrição imobiliária
-- Date: 2026-07-31
-- =============================================================================
-- A cláusula de objeto de um contrato de locação identifica o imóvel pela
-- MATRÍCULA, não pelo nome comercial da unidade:
--   "o imóvel situado na Rua X, nº 100, apto 101, objeto da matrícula nº 12.345
--    do Cartório de Registro de Imóveis de Belo Horizonte/MG"
--
-- `commercial_properties` tem nome, tipo, endereço e áreas, mas NÃO tem
-- matrícula — as únicas do sistema estavam em `empreendimentos.matricula`,
-- `company_spe_branches.matriculas`, `cno.matricula_imovel` e
-- `contracts.obra_registration`, nenhuma delas por unidade locável.
--
-- `registry_office` entra junto porque matrícula sem cartório é cláusula
-- incompleta ("matrícula nº 12.345 do ⟨em branco⟩"); o nome espelha
-- `contract_guarantees.registry_office`, já existente. `iptu_registration` é a
-- inscrição imobiliária, citada na cláusula de encargos (IPTU por conta do
-- locatário).
--
-- ⚠️ `commercial_properties` é tabela QUENTE. Mesmas precauções da migration
-- irmã 20270842000000: só ADD COLUMN nullable (metadata-only), sem CHECK, sem
-- DEFAULT, sem FK nova, lock_timeout curto, e em arquivo próprio para não
-- misturar DDL de duas tabelas quentes numa transação só.
-- =============================================================================

SET lock_timeout = '4s';

ALTER TABLE public.commercial_properties
    ADD COLUMN IF NOT EXISTS registration_number TEXT,
    ADD COLUMN IF NOT EXISTS registry_office     TEXT,
    ADD COLUMN IF NOT EXISTS iptu_registration   TEXT;

COMMENT ON COLUMN public.commercial_properties.registration_number IS
    'Matrícula do imóvel no Registro de Imóveis. Identifica a unidade na cláusula de objeto do contrato.';
COMMENT ON COLUMN public.commercial_properties.registry_office IS
    'Cartório de Registro de Imóveis / comarca onde a matrícula está registrada.';
COMMENT ON COLUMN public.commercial_properties.iptu_registration IS
    'Inscrição imobiliária (IPTU) da unidade. Citada na cláusula de encargos do contrato de locação.';

-- =============================================================================
-- FIM: 20270842000001_commercial_properties_matricula.sql
-- =============================================================================
