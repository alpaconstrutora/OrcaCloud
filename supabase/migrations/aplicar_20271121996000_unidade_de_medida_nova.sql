-- =============================================================================
-- UNIDADE DE MEDIDA NOVA (21/11/2026)
-- Pedido: "implemente opção para criação de nova unidade de medida".
-- Plano: docs/planos/2026-11-21-unidade-de-medida-nova.md
--
-- `master_units_of_measure` é o cadastro GLOBAL de unidades (Dados Mestres ›
-- Unidades). Até aqui só se lia; agora o superadministrador cadastra unidade nova
-- — a mesma regra de escrita da equivalência de unidades (aplicar_20271121920000).
--
-- REGRA #7, pergunta 1: a policy de INSERT tem uma perna só, `is_superadmin()`,
-- que sozinha basta e é o que se quer. Pergunta 2: nenhuma função nova.
-- Sem UPDATE/DELETE: unidade usada por item/pedido não pode sumir nem mudar de
-- sentido por baixo deles.
-- Idempotente.
-- =============================================================================

-- Símbolo único ignorando a caixa ("TB" e "tb" seriam a mesma unidade).
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_units_of_measure_symbol_lower
    ON public.master_units_of_measure (lower(symbol));

DROP POLICY IF EXISTS master_units_of_measure_insert_superadmin ON public.master_units_of_measure;
CREATE POLICY master_units_of_measure_insert_superadmin ON public.master_units_of_measure
    FOR INSERT TO authenticated WITH CHECK (public.is_superadmin());

-- anon não tem policy (não lê nada); tira também o privilégio. authenticated: ler e
-- inserir (a policy decide quem insere); nada de alterar, apagar ou TRUNCATE.
REVOKE ALL ON public.master_units_of_measure FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.master_units_of_measure FROM authenticated;
GRANT SELECT, INSERT ON public.master_units_of_measure TO authenticated;
