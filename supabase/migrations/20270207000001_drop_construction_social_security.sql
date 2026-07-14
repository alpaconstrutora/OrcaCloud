-- =============================================================================
-- Migration: 20270207000001_drop_construction_social_security.sql
-- Objetivo: Aposentar o módulo duplicado de Previdência (SocialSecurityManager).
--           A funcionalidade foi consolidada no módulo canônico ÒPURA CNO
--           (tabelas opura_cno_*), incluindo o DCTFWeb portado na migration
--           20270207000000_opura_cno_dctfweb.sql.
--
-- Pré-condição verificada em 2026-07-14: todas as tabelas abaixo estavam
-- vazias (0 linhas em records/documents/credits/simulations/dctfweb) no
-- ambiente remoto — nenhuma migração de dados necessária.
-- =============================================================================

-- Ordem: filhas antes da tabela-pai (records), embora CASCADE cubra o caso.
DROP TABLE IF EXISTS public.construction_social_security_dctfweb      CASCADE;
DROP TABLE IF EXISTS public.construction_social_security_credits      CASCADE;
DROP TABLE IF EXISTS public.construction_social_security_simulations  CASCADE;
DROP TABLE IF EXISTS public.construction_social_security_documents    CASCADE;
DROP TABLE IF EXISTS public.construction_social_security_records      CASCADE;

-- Enum usado apenas por essas tabelas.
DROP TYPE IF EXISTS public.sero_status;
