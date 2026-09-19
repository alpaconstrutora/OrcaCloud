-- migration: aplicar_20270919000048_stock_items_source_ativos.sql (nasceu como 000030 — renumerada antes do push por colisão com main; JÁ APLICADA no banco em 2026-09-19 com conteúdo idêntico — não rodar de novo)
-- Almoxarifado › Importar Itens — quarta origem: Gestão de Ativos.
-- Ver docs/planos/2026-09-19-almoxarifado-importar-itens-gestao-de-ativos.md
--
-- O CHECK de `stock_items.source` (20270913000004, seção 1.1) enumera as
-- origens de importação. A aba "Gestão de Ativos" grava `source = 'ativos'`
-- (input_code = código patrimonial do ativo em opura_assets). Sem esta
-- migration o upsert cai no CHECK e a importação falha inteira.
--
-- Prefixo `aplicar_` = rodada à mão (npx supabase db query --linked -f ...),
-- fora do schema_migrations. Nunca `supabase db push`.

ALTER TABLE public.stock_items
    DROP CONSTRAINT IF EXISTS chk_stock_items_source;
ALTER TABLE public.stock_items
    ADD CONSTRAINT chk_stock_items_source
    CHECK (source IS NULL OR source IN ('avulso','catalogo','orcamento','planilha','recebimento','ativos'));

COMMENT ON COLUMN public.stock_items.source IS
    'Origem do cadastro: avulso | catalogo | orcamento | planilha | recebimento | ativos (Gestão de Ativos — input_code = código patrimonial)';
