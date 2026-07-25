-- ==========================================================================
-- Portal do Corretor › Empreendimentos: colunas configuráveis da tabela de preços
-- Date: 2026-07-25
-- ==========================================================================
-- CONTEXTO
-- A aba "Empreendimentos" do Portal do Corretor mostra a tabela de preços
-- vigente do prédio. Ela exibia um subconjunto das colunas de
-- PriceTableManager (faltavam Banheiros, Pavimento e Posição) e não tinha o
-- botão de configurar colunas.
--
-- A escolha de colunas aqui NÃO é preferência de tela (localStorage): ela é
-- uma decisão de PRODUTO da organização — o que o admin marca na visão do app
-- é o que o corretor vê no link público. Por isso mora no banco, por
-- organização, e é lida pelo modo anon via RPC própria (o link não tem sessão
-- Supabase).
--
-- Sem FK para `organizations` de propósito: DDL com FK em tabela quente já
-- deadlockou neste projeto. `org_id` é conferido pela RLS (is_org_member) na
-- escrita e pelo token na leitura anon.
--
-- ⚠️ COMO APLICAR — UMA PARTE DE CADA VEZ, NUNCA O ARQUIVO INTEIRO
-- A primeira tentativa de rodar tudo de uma vez deu `40P01 deadlock detected`.
-- O SQL Editor envolve o script todo numa transação: a PARTE 3 pega
-- AccessExclusiveLock em fn_broker_portal_get_rental_price_table enquanto a
-- transação já segura locks das partes anteriores, e cruza com uma consulta
-- concorrente do app nas mesmas relações. Rodando PARTE 1, depois 2, depois 3,
-- cada uma é uma transação curta e não há ciclo.
--
-- Cada parte começa com `SET lock_timeout = '3s'`: se pegar tabela ocupada,
-- ela falha limpa com 55P03 (lock_not_available) em vez de virar deadlock —
-- é só esperar e rodar aquela parte de novo. As três são idempotentes.
--
-- NUNCA `supabase db push`.
-- ==========================================================================

-- ##########################################################################
-- PARTE 1 de 3 — tabela + RLS (rodar sozinha)
-- ##########################################################################
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.broker_portal_price_columns (
    org_id          UUID PRIMARY KEY,
    visible_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.broker_portal_price_columns IS
    'Colunas visíveis da tabela de preços no Portal do Corretor, por organização. '
    'Definido na visão do app (admin) e refletido na visão do link (anon, via '
    'fn_broker_portal_get_price_columns). Chaves: unit, status, privArea, '
    'bedrooms, bathrooms, parking, floor, position, price.';

ALTER TABLE public.broker_portal_price_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_portal_price_columns_member ON public.broker_portal_price_columns;
CREATE POLICY broker_portal_price_columns_member
    ON public.broker_portal_price_columns
    FOR ALL
    TO authenticated
    USING (public.is_org_member(org_id))
    WITH CHECK (public.is_org_member(org_id));

-- Sem policy `TO anon`: o link público lê pela RPC SECURITY DEFINER abaixo.
