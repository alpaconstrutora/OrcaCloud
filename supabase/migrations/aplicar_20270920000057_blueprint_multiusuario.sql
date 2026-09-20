-- ============================================================================
-- Planta Inteligente — MULTIUSUÁRIO: permissões por estudo e menções (20/09/2026, E10.1)
--
-- Roadmap `docs/planos/2026-09-18-planta-inteligente-roadmap-unificado.md`,
-- fase 10.1. Presença, trava por elemento e difusão de comandos são Realtime
-- (efêmeros, sem tabela). O que persiste está aqui:
--
-- 1. `blueprint_study_permissions`: papel por (estudo, e-mail) — LEITOR ou
--    EDITOR. SEM LINHA = EDITOR: o comportamento de sempre para membros da
--    organização não muda. LEITOR é uma RESTRIÇÃO adicional, aplicada como
--    policy RESTRICTIVE sobre a gravação do rascunho (`blueprint_branches`
--    UPDATE) e a publicação (`blueprint_snapshots` INSERT) — a RLS de membro
--    continua igual; esta só tira o que o leitor não pode.
-- 2. `blueprint_comments.mencoes` (e-mails) + gatilho que grava UMA
--    notificação por mencionado em `notifications` (a tabela da casa: sino do
--    topo, com `organization_id` para visibilidade da equipe).
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- ── 1. Permissões por estudo ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blueprint_study_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id        UUID NOT NULL REFERENCES public.blueprint_studies(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email           TEXT NOT NULL CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
    papel           TEXT NOT NULL CHECK (papel IN ('LEITOR', 'EDITOR')),
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT blueprint_study_permissions_unica UNIQUE (study_id, email)
);

COMMENT ON TABLE public.blueprint_study_permissions IS
  'Papel por (estudo, e-mail) na Planta Inteligente: LEITOR não grava rascunho nem publica; sem linha = EDITOR (membro da organização).';

CREATE INDEX IF NOT EXISTS blueprint_study_permissions_study_idx ON public.blueprint_study_permissions(study_id);

DROP TRIGGER IF EXISTS trg_blueprint_study_permissions_updated ON public.blueprint_study_permissions;
CREATE TRIGGER trg_blueprint_study_permissions_updated
    BEFORE UPDATE ON public.blueprint_study_permissions
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_touch_updated_at();

ALTER TABLE public.blueprint_study_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blueprint_study_permissions_org" ON public.blueprint_study_permissions;
CREATE POLICY "blueprint_study_permissions_org"
    ON public.blueprint_study_permissions
    FOR ALL TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
REVOKE ALL ON public.blueprint_study_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_study_permissions TO authenticated;

-- O e-mail de quem chama, como o JWT o traz.
CREATE OR REPLACE FUNCTION public.fn_blueprint_email_do_jwt()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$ SELECT lower(coalesce(auth.jwt() ->> 'email', '')) $$;
REVOKE ALL ON FUNCTION public.fn_blueprint_email_do_jwt() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_blueprint_email_do_jwt() TO authenticated;

-- É LEITOR deste estudo?
CREATE OR REPLACE FUNCTION public.fn_blueprint_e_leitor(p_study_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.blueprint_study_permissions p
         WHERE p.study_id = p_study_id
           AND p.papel = 'LEITOR'
           AND p.email = public.fn_blueprint_email_do_jwt()
    )
$$;
REVOKE ALL ON FUNCTION public.fn_blueprint_e_leitor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_blueprint_e_leitor(UUID) TO authenticated;

-- RESTRICTIVE: soma-se às permissivas de membro; só recusa o LEITOR.
DROP POLICY IF EXISTS "blueprint_branches_leitor_nao_grava" ON public.blueprint_branches;
CREATE POLICY "blueprint_branches_leitor_nao_grava"
    ON public.blueprint_branches
    AS RESTRICTIVE
    FOR UPDATE TO authenticated
    USING (NOT public.fn_blueprint_e_leitor(study_id))
    WITH CHECK (NOT public.fn_blueprint_e_leitor(study_id));

DROP POLICY IF EXISTS "blueprint_snapshots_leitor_nao_publica" ON public.blueprint_snapshots;
CREATE POLICY "blueprint_snapshots_leitor_nao_publica"
    ON public.blueprint_snapshots
    AS RESTRICTIVE
    FOR INSERT TO authenticated
    WITH CHECK (NOT public.fn_blueprint_e_leitor(study_id));

-- ── 2. Menções em comentários ───────────────────────────────────────────────
ALTER TABLE public.blueprint_comments ADD COLUMN IF NOT EXISTS mencoes TEXT[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.blueprint_comments.mencoes IS 'E-mails mencionados com @ no texto; cada um recebe uma notificação (gatilho).';

CREATE OR REPLACE FUNCTION public.fn_blueprint_comment_mencoes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_estudo TEXT;
    v_email TEXT;
BEGIN
    IF NEW.mencoes IS NULL OR cardinality(NEW.mencoes) = 0 THEN RETURN NEW; END IF;
    SELECT s.name INTO v_estudo FROM public.blueprint_studies s WHERE s.id = NEW.study_id;
    FOREACH v_email IN ARRAY NEW.mencoes LOOP
        -- Não se notifica quem escreveu; e-mail estranho não entra.
        IF v_email IS NULL OR position('@' in v_email) = 0 OR lower(v_email) = lower(coalesce(NEW.autor_email, '')) THEN CONTINUE; END IF;
        INSERT INTO public.notifications (recipient_email, title, message, link, type, organization_id)
        VALUES (
            lower(v_email),
            'Você foi mencionado em ' || coalesce(v_estudo, 'um estudo da Planta'),
            coalesce(NEW.autor_email, 'Alguém') || ': ' || left(NEW.texto, 200),
            '#/blueprint?estudo=' || NEW.study_id || '&comentario=' || NEW.id,
            'planta_mencao',
            NEW.organization_id
        );
    END LOOP;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'planta: menção não notificou (%)', SQLERRM;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_blueprint_comment_mencoes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_blueprint_comment_mencoes ON public.blueprint_comments;
CREATE TRIGGER trg_blueprint_comment_mencoes
    AFTER INSERT ON public.blueprint_comments
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_comment_mencoes();
