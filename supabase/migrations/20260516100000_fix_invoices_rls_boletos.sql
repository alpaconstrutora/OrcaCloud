-- Fix: garante que a tabela invoices aceita INSERT do fluxo de aprovação de boletos.
-- Aplique este arquivo no Supabase Dashboard → SQL Editor.

-- Remove políticas conflitantes
DROP POLICY IF EXISTS "Permitir leitura publica"    ON public.invoices;
DROP POLICY IF EXISTS "Permitir insercao publica"   ON public.invoices;
DROP POLICY IF EXISTS "Permitir update publico"     ON public.invoices;
DROP POLICY IF EXISTS "Permitir delete publico"     ON public.invoices;
DROP POLICY IF EXISTS "Allow all on invoices"       ON public.invoices;

-- Garante RLS ativo
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Política única: membros autenticados de qualquer organização têm acesso total
CREATE POLICY "invoices_authenticated_all" ON public.invoices
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Mantém acesso anon para dev (padrão do projeto)
CREATE POLICY "invoices_anon_all" ON public.invoices
    FOR ALL TO anon
    USING (true)
    WITH CHECK (true);
