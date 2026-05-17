-- Correção de Permissões RLS para Tabelas Fiscais

-- 1. Limpar políticas antigas (somente leitura)
DROP POLICY IF EXISTS "inss_read_all" ON public.inss_brackets;
DROP POLICY IF EXISTS "irrf_read_all" ON public.irrf_brackets;
DROP POLICY IF EXISTS "fgts_read_all" ON public.fgts_config;

-- 2. Criar novas políticas de gestão total para usuários autenticados
CREATE POLICY "inss_manage_all" ON public.inss_brackets
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "irrf_manage_all" ON public.irrf_brackets
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "fgts_manage_all" ON public.fgts_config
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Recarregar esquema
NOTIFY pgrst, 'reload schema';
