-- ==========================================================================
-- TRAVA DE ORGANIZAÇÃO EM CASCATA (1/3) — commercial_properties
-- Date: 2026-07-21
-- ==========================================================================
-- Regra: uma unidade (parent_id = edifício) NUNCA pode ter organização diferente
-- do edifício-pai, que remonta ao Empreendimento. A camada de app já faz o filho
-- nascer com a org do pai (commercialService.saveProperty); esta trigger é a rede
-- de segurança para qualquer caminho que escape (SQL direto, Edge Function, código
-- novo). Decisão do usuário: BLOQUEAR com erro (não corrigir em silêncio).
--
-- ⚠️ APLICAR MANUALMENTE no Supabase, NUNCA `supabase db push`.
-- ⚠️ commercial_properties é tabela QUENTE (o PostgREST lê o tempo todo). O
-- CREATE TRIGGER pega AccessExclusiveLock e conflita com qualquer leitura →
-- risco de deadlock (40P01). Defesas: `lock_timeout` menor que o `deadlock_timeout`
-- (800ms), script curto e isolado (sem DML antes — a limpeza dos dados é a Fase 2,
-- rodada ANTES desta). SE DER `55P03 lock_timeout`: não é erro de sintaxe, é a
-- tabela ocupada — feche as abas do sistema (ou rode fora de horário) e repita.
-- Nada fica pela metade. Idempotente.
--
-- IMPORTANTE: rode a Fase 2 (limpeza) ANTES desta. Com a trava ativa, um UPDATE
-- numa unidade já divergente do prédio passaria a falhar.
-- ==========================================================================

SET lock_timeout = '800ms';

-- Delimitador nomeado ($fn$) e não $$: o editor SQL do Supabase injeta comentários
-- entre statements e corta o $$. SECURITY DEFINER: a checagem precisa enxergar a
-- linha do prédio-pai mesmo sob RLS.
CREATE OR REPLACE FUNCTION public.fn_org_cascade_commercial_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  parent_org uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT organization_id INTO parent_org
    FROM   public.commercial_properties
    WHERE  id = NEW.parent_id;

    IF parent_org IS NOT NULL
       AND NEW.organization_id IS DISTINCT FROM parent_org THEN
      RAISE EXCEPTION
        'Organização em cascata: a unidade (org %) não pode ter organização diferente do edifício/empreendimento (org %). Tudo abaixo do Empreendimento fica na mesma organização.',
        NEW.organization_id, parent_org
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_org_cascade_commercial_property() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_org_cascade_commercial_property ON public.commercial_properties;

CREATE TRIGGER trg_org_cascade_commercial_property
  BEFORE INSERT OR UPDATE OF organization_id, parent_id ON public.commercial_properties
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_org_cascade_commercial_property();

-- ==========================================================================
-- FIM: 20270821000001_trigger_org_cascade_commercial_properties.sql
-- ==========================================================================
