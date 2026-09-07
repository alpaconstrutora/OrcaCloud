-- ==========================================================================
-- CORRECAO: a aprovacao da revisao nao funcionava. O RLS bloqueava o UPDATE.
--
-- --- O defeito, e como ele apareceu ---------------------------------------
--
-- A fatia 2 da Etapa 5 acrescentou tres colunas de aprovacao a
-- `blueprint_snapshots` e mandou o `approvalService` escrever nelas. O que
-- ninguem tinha perguntado: a tabela e IMUTAVEL de proposito, e o RLS a
-- protege -- ela so tem policy de INSERT e de SELECT. Nenhum UPDATE passa.
--
-- Resultado: clicar "Enviar para aprovacao" nao fazia NADA. O `.select()`
-- depois do update nao achava linha, o servico levantava erro, e o erro caia
-- no rodape do painel -- abaixo da dobra. A tela nao contava, e o banco
-- continuava sem status. So apareceu ao conferir o banco depois de clicar.
--
-- --- E havia um SEGUNDO bloqueio, que so a tentativa revelou ---------------
--
-- `trg_blueprint_snapshots_immutable` (de 20270905000000) recusa TODO update e
-- todo delete, com `fn_blueprint_block_mutation` -- uma funcao COMPARTILHADA
-- por tres tabelas: snapshots, objects e audit_events. Mexer nela afrouxaria as
-- outras duas.
--
-- Entao a divisao e por OPERACAO: o DELETE continua no guarda geral, e o UPDATE
-- passa para um guarda proprio, com escopo de coluna. Um guarda por operacao,
-- sem duas verdades sobre o que e permitido.
--
-- --- Por que TRIGGER, e nao so uma policy de UPDATE ------------------------
--
-- Uma policy de UPDATE aberta devolveria a tabela ao estado mutavel, e a
-- imutabilidade do snapshot nao e detalhe: e ela que faz o `hash` significar
-- alguma coisa. Orcamento, planejamento e IFC citam um snapshot pelo hash; se
-- o payload puder mudar depois, a citacao vira mentira.
--
-- RLS nao restringe COLUNA -- `USING` ve a linha velha, `WITH CHECK` ve a
-- nova, e nenhuma das duas compara as duas. Quem compara e um trigger. Entao:
-- a policy autoriza o UPDATE por organizacao, e o trigger recusa qualquer
-- update que mexa em qualquer coisa alem das tres colunas de aprovacao.
--
-- O snapshot continua imutavel no que importa. So o carimbo se move.
-- ==========================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_blueprint_snapshot_so_aprovacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Uma comparacao campo a campo, e nao `row_to_json` do todo: assim a
  -- mensagem diz O QUE mudou, e quem tropecar nisso daqui a um ano nao precisa
  -- adivinhar.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.study_id IS DISTINCT FROM OLD.study_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.hash IS DISTINCT FROM OLD.hash
     OR NEW.kernel_version IS DISTINCT FROM OLD.kernel_version
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.published_by IS DISTINCT FROM OLD.published_by
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
  THEN
    RAISE EXCEPTION
      'Snapshot e imutavel: so as colunas de aprovacao podem mudar (tentou alterar conteudo da revisao %)', OLD.revision
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- SECURITY INVOKER (o padrao): o trigger nao precisa de privilegio nenhum
-- alem do de quem ja passou pelo RLS. Sem SECURITY DEFINER, sem REVOKE.

-- O guarda geral passa a cuidar so do DELETE em snapshots. Ele continua
-- INTACTO em `blueprint_objects` e `blueprint_audit_events`, que nao tem
-- coluna de aprovacao e seguem 100% imutaveis.
DROP TRIGGER IF EXISTS trg_blueprint_snapshots_immutable ON public.blueprint_snapshots;
CREATE TRIGGER trg_blueprint_snapshots_immutable
  BEFORE DELETE ON public.blueprint_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

-- E o UPDATE passa pelo guarda com escopo de coluna.
DROP TRIGGER IF EXISTS trg_blueprint_snapshot_so_aprovacao ON blueprint_snapshots;
CREATE TRIGGER trg_blueprint_snapshot_so_aprovacao
  BEFORE UPDATE ON blueprint_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_blueprint_snapshot_so_aprovacao();

DROP POLICY IF EXISTS blueprint_snapshots_org_update_aprovacao ON blueprint_snapshots;
CREATE POLICY blueprint_snapshots_org_update_aprovacao ON blueprint_snapshots
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

COMMENT ON FUNCTION public.fn_blueprint_snapshot_so_aprovacao() IS
  'Mantem blueprint_snapshots imutavel: recusa qualquer UPDATE que mude algo alem de approval_status, approval_chain e approval_required_levels. E o hash que faz a citacao de um snapshot significar alguma coisa.';
