-- ============================================================================
-- Folha → encargos e retenções como tributos próprios
-- Plano: docs/planos/2026-10-21-folha-encargos-em-tributos-a-pagar.md
--
-- 1. payroll_encargos_config — alíquotas patronais da folha POR ORGANIZAÇÃO
--    (CPP, RAT, FAP e entidades de terceiros). Antes: CPP/RAT não existiam na
--    folha CLT, e terceiros ficavam no localStorage de quem clicava.
--    Sem linha gravada, o app deriva o padrão do regime da empresa matriz
--    (utils/folhaFinanceiro.ts › encargosPadrao) — a linha só existe depois que
--    alguém salvou em RH › Encargos Sociais.
-- 2. rubrics.repasse_terceiros — desconto do empregado que o empregador REPASSA
--    a outra entidade (contribuição assistencial/sindical, pensão). Só esses
--    viram título; os outros descontos (falta, VR, dedução do 13º) só reduzem o
--    líquido.
--
-- Aplicar com: npx supabase db query --linked -f <este arquivo>   (nunca db push)
-- ============================================================================

-- ── 1. Alíquotas por organização ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_encargos_config (
    organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    cpp_rate        numeric(7,6) NOT NULL CHECK (cpp_rate BETWEEN 0 AND 1),
    rat_rate        numeric(7,6) NOT NULL CHECK (rat_rate BETWEEN 0 AND 1),
    fap             numeric(6,4) NOT NULL DEFAULT 1 CHECK (fap BETWEEN 0.5 AND 2),
    -- [{ "code": "1170", "name": "Salário-Educação", "rate": 0.025 }, …]
    terceiros       jsonb        NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(terceiros) = 'array'),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    updated_by      uuid         DEFAULT auth.uid()
);

COMMENT ON TABLE public.payroll_encargos_config IS
    'Alíquotas patronais da folha por organização (CPP, RAT×FAP, terceiros). Sem linha = padrão derivado do regime da matriz no app.';

ALTER TABLE public.payroll_encargos_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_encargos_config_membro ON public.payroll_encargos_config;
CREATE POLICY payroll_encargos_config_membro ON public.payroll_encargos_config
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

-- Os privilégios padrão do Supabase dão ALL (TRUNCATE/TRIGGER incluídos) a
-- authenticated: tira tudo e devolve só o necessário.
REVOKE ALL ON public.payroll_encargos_config FROM PUBLIC;
REVOKE ALL ON public.payroll_encargos_config FROM anon;
REVOKE ALL ON public.payroll_encargos_config FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_encargos_config TO authenticated;

-- ── 2. Rubrica de desconto que é repasse a terceiro ─────────────────────────
ALTER TABLE public.rubrics
    ADD COLUMN IF NOT EXISTS repasse_terceiros boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rubrics.repasse_terceiros IS
    'Desconto que o empregador repassa a outra entidade (sindicato, pensão): vira título próprio no financeiro da folha.';

UPDATE public.rubrics
   SET repasse_terceiros = true
 WHERE type = 'desconto'
   AND NOT repasse_terceiros
   AND (code || ' ' || name) ~* '(ASSISTENCIAL|SINDIC|CONFEDERATIV|PENS[AÃ]O)';

-- ── Verificação ─────────────────────────────────────────────────────────────
SELECT
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payroll_encargos_config'::regclass) AS rls_ligada,
    (SELECT string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee, privilege_type)
       FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'payroll_encargos_config'
        AND grantee IN ('anon', 'authenticated', 'PUBLIC'))                                   AS grants,
    (SELECT string_agg(code, ', ') FROM public.rubrics WHERE repasse_terceiros)                AS rubricas_repasse;
