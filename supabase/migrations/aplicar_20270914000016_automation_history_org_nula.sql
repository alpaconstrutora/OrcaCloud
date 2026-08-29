-- ==========================================================================
-- automation_history: fecha a visibilidade global de linha com organização nula
-- ==========================================================================
-- CONTEXTO (28/08/2026)
-- As duas políticas da tabela são `USING (organization_id IS NULL OR
-- is_org_member(organization_id))`. A perna do NULL torna a linha **global**:
-- visível — e, pela política `FOR ALL`, gravável — por qualquer usuário
-- autenticado de QUALQUER inquilino. É a mesma armadilha que a REGRA #5 do
-- CLAUDE.md descreve para "Todas as organizações": NULL não é "todas as minhas
-- organizações", é "todo mundo".
--
-- Havia 16 linhas nesse estado, TODAS com `project_id` preenchido — ou seja,
-- 100% recuperável pela obra, sem descartar histórico. (Descoberto ao rastrear
-- 10 linhas do orçamento "Garden".)
--
-- Não há política `anon` nesta tabela: a da migration original foi removida
-- pelo rollout `20270208*` — verificado em `pg_policy`, não no repo.
--
-- ORDEM (limpeza antes da trava, como na cascata de organização de julho):
--   1. backfill  — as 16 herdam a organização do projeto
--   2. trigger   — corta na origem: INSERT sem organização a deriva do projeto
--   3. política  — só então tira a perna do NULL
--
-- Apertar a política ANTES do backfill faria as 16 sumirem da tela de quem
-- deveria vê-las, e a limpeza ficaria mais difícil.
--
-- ⚠️ APLICAR À MÃO PELO SQL EDITOR — o editor executa só a SELEÇÃO.
--    Rode bloco a bloco e confira o resultado de cada um.
-- ==========================================================================

SET lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────
-- 1. BACKFILL — herda a organização do projeto
--    `COALESCE(nativa, settings->>'organizationId')` porque em `projects` a
--    organização vive nas duas pontas (ver fn_org_cascade_project).
-- ────────────────────────────────────────────────────────────
UPDATE public.automation_history ah
   SET organization_id = COALESCE(p.organization_id, (p.settings->>'organizationId')::uuid)
  FROM public.projects p
 WHERE p.id = ah.project_id
   AND ah.organization_id IS NULL
   AND COALESCE(p.organization_id, (p.settings->>'organizationId')::uuid) IS NOT NULL;
-- Esperado: UPDATE 16

-- PORTÃO: tem que ser 0 antes de seguir para o passo 3. Se sobrar linha aqui, é
-- projeto que também não tem organização — resolva ANTES, senão o passo 3 as
-- torna invisíveis.
SELECT count(*) AS ainda_nulas FROM public.automation_history WHERE organization_id IS NULL;

-- ────────────────────────────────────────────────────────────
-- 2. TRIGGER — corta na origem
--    `webhookService` grava a organização a partir do objeto de projeto que
--    recebeu (`project?.organizationId || ... || settings?.organizationId`);
--    quando nenhum dos três vem preenchido, entra NULL. São 10 pontos de
--    INSERT no arquivo, e cada ponto novo nasce com o mesmo risco. Derivar no
--    banco é o mesmo remédio de `sync_org_from_empresa` (20260710000001).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_automation_history_org_from_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT COALESCE(p.organization_id, (p.settings->>'organizationId')::uuid)
      INTO NEW.organization_id
      FROM public.projects p
     WHERE p.id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_automation_history_org_from_project() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_automation_history_org ON public.automation_history;

CREATE TRIGGER trg_automation_history_org
  BEFORE INSERT OR UPDATE OF organization_id, project_id ON public.automation_history
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_automation_history_org_from_project();

-- ────────────────────────────────────────────────────────────
-- 3. POLÍTICAS — tira a perna do NULL
--
--    ⚠️ Consequência deliberada: a política `FOR ALL` sem WITH CHECK próprio usa
--    o USING também como check de INSERT. Depois disto, gravar linha SEM
--    organização passa a ser REJEITADO. É por isso que o passo 2 vem antes — a
--    trigger deriva a organização e o INSERT passa. Se nem o projeto tiver
--    organização, o log falha com erro visível, em vez de virar linha global
--    calada. `webhookService` já trata falha de log sem derrubar o envio.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view automation history of their organization"   ON public.automation_history;
DROP POLICY IF EXISTS "Users can manage automation history of their organization" ON public.automation_history;

CREATE POLICY "Users can view automation history of their organization"
ON public.automation_history FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can manage automation history of their organization"
ON public.automation_history FOR ALL TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- ==========================================================================
-- CONFERÊNCIA
-- ==========================================================================

-- 1. Nenhuma linha global sobrou:
-- SELECT count(*) FROM public.automation_history WHERE organization_id IS NULL;
-- Esperado: 0

-- 2. As políticas não têm mais a perna do NULL, e não há `anon`:
-- SELECT p.polname,
--        ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)) AS roles,
--        pg_get_expr(p.polqual, p.polrelid)      AS usando,
--        pg_get_expr(p.polwithcheck, p.polrelid) AS com_check
--   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--  WHERE c.relname = 'automation_history';

-- 3. A trigger deriva mesmo? (teste em transação, sempre com ROLLBACK)
-- BEGIN;
--   INSERT INTO public.automation_history (project_id, event_type, status)
--   VALUES ('<id de uma obra sua>', 'teste', 'success');
--   SELECT organization_id FROM public.automation_history WHERE event_type = 'teste';
--   -- Esperado: a organização da obra, não NULL
-- ROLLBACK;

-- ==========================================================================
-- FIM: aplicar_20270914000016_automation_history_org_nula.sql
-- ==========================================================================
