-- ==========================================================================
-- TRAVA DE ORGANIZAÇÃO EM CASCATA (3/3) — projects (Orçamento/Planejamento)
-- Date: 2026-07-21
-- ==========================================================================
-- Regra: um projeto vinculado a outro (settings.linkedProjectId → pai; cadeia
-- Planejamento → Orçamento → Obra) NUNCA pode ter organização diferente do pai.
-- A camada de app já faz o filho herdar a org do pai (useProjectOperations); esta
-- trigger é a rede de segurança. Decisão do usuário: BLOQUEAR com erro, e cobrir
-- também Orçamento/Planejamento no banco.
--
-- "Org efetiva" = COALESCE(organization_id nativa, settings->>'organizationId'),
-- porque em projects a org vive nas DUAS pontas (muitos projetos só têm o JSONB).
-- Compara em TEXTO e casa o pai por id::text para evitar erro de cast de uuid.
--
-- ⚠️ CONVIVE com o trigger existente `projects_sync_org` (BEFORE INSERT/UPDATE OF
-- empresa_id, de 20260710000001), que copia companies.org_id → organization_id.
-- Ordem de disparo é alfabética por nome: `projects_sync_org` roda ANTES de
-- `trg_org_cascade_project` — ou seja, a org de empresa é resolvida primeiro e só
-- depois a cascata valida contra o pai. Se um projeto tiver empresa de uma org e
-- obra-pai de outra, o erro abaixo aponta a divergência (é mistura real).
--
-- ⚠️ APLICAR MANUALMENTE, NUNCA `supabase db push`. `projects` é tabela QUENTE e
-- FK/DDL nela já deadlockou ≥3× neste projeto. Defesas: `lock_timeout` 800ms
-- (< deadlock_timeout), script curto e isolado. Rode a Fase 2 (limpeza) ANTES.
-- SE DER `55P03 lock_timeout`: tabela ocupada, feche as abas e repita. Idempotente.
-- ==========================================================================

SET lock_timeout = '800ms';

CREATE OR REPLACE FUNCTION public.fn_org_cascade_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  linked_id   text;
  child_org   text;
  parent_org  text;
BEGIN
  linked_id := NEW.settings->>'linkedProjectId';

  IF linked_id IS NOT NULL AND linked_id <> '' THEN
    child_org := COALESCE(NEW.organization_id::text, NEW.settings->>'organizationId');

    SELECT COALESCE(p.organization_id::text, p.settings->>'organizationId')
    INTO   parent_org
    FROM   public.projects p
    WHERE  p.id::text = linked_id;

    IF parent_org IS NOT NULL
       AND child_org IS NOT NULL
       AND child_org <> parent_org THEN
      RAISE EXCEPTION
        'Organização em cascata: este projeto (org %) não pode ter organização diferente da obra/projeto pai vinculado (org %). Orçamento e Planejamento ficam na mesma organização da Obra/Empreendimento.',
        child_org, parent_org
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_org_cascade_project() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_org_cascade_project ON public.projects;

CREATE TRIGGER trg_org_cascade_project
  BEFORE INSERT OR UPDATE OF organization_id, settings ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_org_cascade_project();

-- ==========================================================================
-- FIM: 20270821000003_trigger_org_cascade_projects.sql
-- ==========================================================================
