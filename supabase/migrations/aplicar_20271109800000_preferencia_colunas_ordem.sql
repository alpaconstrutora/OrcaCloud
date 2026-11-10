-- Preferência de colunas por usuário: também a ORDEM (arrastada no cabeçalho) e as
-- colunas já "conhecidas" (pedido de 09/11/2026, Minha Organização › Meus Fornecedores:
-- "Colunas visíveis: implemente salvar escolha do usuário" / "a posição das colunas
-- não está mantendo").
-- Plano: docs/planos/2026-11-09-fornecedores-colunas-salvas-e-filtro-e-ou.md
--
-- Até aqui a ordem vivia só no localStorage do navegador. NULL = linha gravada antes
-- desta migration: a tela usa a ordem default e trata as visíveis como conhecidas
-- (mesma regra do localStorage legado — mesclarPreferenciaDeColunas).
--
-- REGRA #7: nenhuma policy nem função nova. A policy `..._own_row` (FOR ALL, o
-- próprio e-mail do JWT) já cobre as colunas novas.

BEGIN;

ALTER TABLE public.user_table_column_preferences
    ADD COLUMN IF NOT EXISTS column_order jsonb,
    ADD COLUMN IF NOT EXISTS known_columns jsonb;

COMMENT ON COLUMN public.user_table_column_preferences.column_order IS
    'Ordem de TODAS as colunas da tela (visíveis e ocultas), como o usuário arrastou. NULL = ordem default.';
COMMENT ON COLUMN public.user_table_column_preferences.known_columns IS
    'Colunas que a tela tinha quando o usuário gravou — coluna nova fora daqui nasce visível. NULL = as visíveis.';

COMMIT;
