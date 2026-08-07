-- ═════════════════════════════════════════════════════════════════════════════
-- Histórico de status da unidade — PARTE 2 de 4: RLS e permissões
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ Rodar DEPOIS da parte 1 terminar.
--
-- Duas camadas, e as duas são necessárias (project_rls_authenticated_layer_gap):
--   1. RLS recorta POR ORGANIZAÇÃO quem já está autenticado.
--   2. REVOKE nominal de `anon` fecha a porta de quem não está.
--
-- `GRANT ... TO authenticated` NÃO bloqueia `anon` sozinho: o Supabase mantém
-- `ALTER DEFAULT PRIVILEGES ... GRANT ... TO anon, authenticated` no schema
-- `public`, então a tabela nasce acessível ao papel anônimo. O REVOKE nominal
-- é o que fecha de fato — mesma lição da parte 6 de Garantias F1.

SET lock_timeout = '5s';

ALTER TABLE public.commercial_property_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access_prop_status_events" ON public.commercial_property_status_events;
CREATE POLICY "org_access_prop_status_events" ON public.commercial_property_status_events
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- Ordem importa: revogar tudo primeiro, conceder depois.
REVOKE ALL ON TABLE public.commercial_property_status_events FROM anon;
REVOKE ALL ON TABLE public.commercial_property_status_events FROM PUBLIC;

-- O log é escrito pela TRIGGER (parte 3), não pela aplicação. A aplicação só
-- lê. INSERT/UPDATE/DELETE direto pela API abriria caminho para forjar
-- histórico de vacância — e o histórico só vale se ninguém puder editá-lo.
GRANT SELECT ON TABLE public.commercial_property_status_events TO authenticated;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- Deve listar SOMENTE `authenticated`, e só com SELECT.
-- Se `anon` aparecer, o REVOKE não pegou:
--
-- SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_name = 'commercial_property_status_events';
--
-- E a policy:
-- SELECT policyname, roles, qual
--   FROM pg_policies
--  WHERE tablename = 'commercial_property_status_events';
