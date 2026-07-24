-- =============================================================================
-- tax_settings › aplicabilidade por origem (Venda de Ativo / Locação)
-- Date: 2026-07-24
-- =============================================================================
-- Permite marcar, por tributo, se ele incide sobre Vendas de Ativos e/ou sobre
-- Locações. Usado por taxPayableService.generateForDeal para decidir quais
-- tributos gerar em cada tipo de negócio (deal.type SALE × RENTAL).
--
-- Ex.: PIS/COFINS incidem sobre locação de PJ mas normalmente NÃO sobre a
-- receita de venda de bem do ativo imobilizado; INSS não incide em nenhum dos
-- dois. Default TRUE nas duas = mantém o comportamento anterior (todo tributo
-- ativo gerava nas duas origens) até o usuário refinar no cadastro.
--
-- tax_settings é tabela de configuração (baixa concorrência); ADD COLUMN com
-- DEFAULT constante é metadata-only no PG moderno. lock_timeout por segurança.
-- =============================================================================

SET lock_timeout = '4s';

ALTER TABLE public.tax_settings
    ADD COLUMN IF NOT EXISTS aplica_venda_ativo BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS aplica_locacao     BOOLEAN NOT NULL DEFAULT true;

-- =============================================================================
-- FIM: 20270824000011_tax_settings_origin_applicability.sql
-- =============================================================================
