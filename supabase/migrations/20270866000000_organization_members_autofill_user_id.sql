-- ============================================================
-- organization_members.user_id deixa de nascer NULL
--
-- PROBLEMA (2026-08-04): 19 tabelas resolvem o vínculo do usuário com
--   organization_id IN (SELECT organization_id FROM organization_members
--                       WHERE user_id = auth.uid())
-- em vez de public.is_org_member(uuid), que casa por e-mail do JWT.
-- Membro convidado por e-mail entra com user_id NULL e vira "não-membro"
-- nessas tabelas: toda escrita devolve
--   42501 new row violates row-level security policy
-- e o SELECT também barra, exibindo só as linhas globais.
--
-- Aconteceu com altair.rosa@alpaconstrutora.com.br: membro das 4 organizações,
-- as 4 com user_id NULL. Criar Tipo de Empreendimento falhava.
--
-- POR QUE NÃO CORRIGIR AS 19 POLICIES: DROP/CREATE POLICY pega
-- AccessExclusiveLock e deadlocka (40P01) contra o app em produção — já
-- aconteceu ao tentar aplicar 20270865000000. Corrigir o DADO resolve as 19 de
-- uma vez, e estes triggers impedem o problema de voltar.
--
-- Estes triggers NÃO substituem a padronização em is_org_member(); apenas
-- garantem que a premissa das policies existentes (user_id preenchido) seja
-- sempre verdadeira. Ver memória project_rls_user_id_vs_email_organization_members.
-- ============================================================

-- ─── 1) Membro criado/alterado: resolve o user_id pelo e-mail ────────────
CREATE OR REPLACE FUNCTION public.fn_org_member_fill_user_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL AND NEW.email IS NOT NULL THEN
        SELECT u.id INTO NEW.user_id
        FROM   auth.users u
        WHERE  LOWER(u.email) = LOWER(NEW.email)
        LIMIT  1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_org_member_fill_user_id ON public.organization_members;

CREATE TRIGGER trg_org_member_fill_user_id
    BEFORE INSERT OR UPDATE OF email, user_id ON public.organization_members
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_org_member_fill_user_id();

-- ─── 2) Conta criada DEPOIS do convite: liga os vínculos pendentes ───────
-- Convidar por e-mail antes de a pessoa se cadastrar é o caso mais comum:
-- no INSERT do membro ainda não existe auth.users, então o trigger acima não
-- tem o que preencher. Este roda quando a conta enfim é criada.
CREATE OR REPLACE FUNCTION public.fn_auth_user_link_org_members()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.organization_members
    SET    user_id = NEW.id
    WHERE  LOWER(email) = LOWER(NEW.email)
      AND  user_id IS DISTINCT FROM NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auth_user_link_org_members ON auth.users;

CREATE TRIGGER trg_auth_user_link_org_members
    AFTER INSERT OR UPDATE OF email ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auth_user_link_org_members();

-- ─── 3) Backfill do que já está gravado ──────────────────────────────────
-- Idempotente: só toca linhas cujo user_id diverge do e-mail.
UPDATE public.organization_members om
SET    user_id = u.id
FROM   auth.users u
WHERE  LOWER(u.email) = LOWER(om.email)
  AND  om.user_id IS DISTINCT FROM u.id;
