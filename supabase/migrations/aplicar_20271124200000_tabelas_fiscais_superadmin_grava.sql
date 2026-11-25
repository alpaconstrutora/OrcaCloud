-- Tabelas fiscais oficiais: gravação só para superadmin (24/11/2026).
-- Plano: docs/planos/2026-11-24-tributos-um-lugar-so.md (item 3).
--
-- INSS, IRRF, FGTS, PIS e COFINS valem para TODAS as organizações e ficam em
-- Configurações do Sistema › Tributos e Impostos. Até aqui as cinco tinham RLS
-- ligada e só policy de SELECT: os botões Editar/Novo/Excluir da antiga tela
-- RH › Config. Fiscais não gravavam nada (UPDATE/DELETE afetavam 0 linhas,
-- INSERT era recusado). Decisão do usuário: só superadmin edita.
--
-- Leitura continua como está (policies *_read_all / *_select). Idempotente.

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['inss_brackets', 'irrf_brackets', 'fgts_config', 'tax_pis_rates', 'tax_cofins_rates']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_delete', t);

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_superadmin()))',
            t || '_superadmin_insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_superadmin())) WITH CHECK ((SELECT public.is_superadmin()))',
            t || '_superadmin_update', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_superadmin()))',
            t || '_superadmin_delete', t);

        -- Default privileges dão TRUNCATE a authenticated, e TRUNCATE ignora RLS (padrão #468).
        EXECUTE format('REVOKE TRUNCATE ON public.%I FROM authenticated', t);
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', t);
        EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    END LOOP;
END $$;
