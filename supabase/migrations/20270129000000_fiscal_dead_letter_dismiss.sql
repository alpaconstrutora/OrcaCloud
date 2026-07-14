-- ============================================================
-- OrçaCloud — Módulo Fiscal
-- Dead letter: ação manual de "arquivar" (dismiss)
--
-- Contexto: o único fluxo disponível para dead_letter era o Replay,
-- que reprocessa o MESMO XML sem alteração — inútil para data_failure
-- (o XML segue com o mesmo defeito) e sem forma de marcar como
-- "já tratado fora do sistema" (ex: cliente reenviou XML corrigido
-- por fora, o job antigo fica órfão pra sempre na fila).
-- ============================================================

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS dismissed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_by     UUID,
  ADD COLUMN IF NOT EXISTS dismissal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_dismissed ON public.processing_jobs(organization_id, dismissed_at)
  WHERE dismissed_at IS NOT NULL;

-- ============================================================
-- ARQUIVAR MANUALMENTE: marca dead_letter como tratado fora do
-- fluxo de replay (ex: cliente reenviou XML corrigido por fora,
-- ou o documento não será mais processado). Não muda `status`
-- (continua 'dead_letter' para preservar o histórico/contagem
-- original) — só marca `dismissed_at`, que passa a excluir o job
-- da fila ativa nas views/telas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dismiss_dead_letter(p_job_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_job public.processing_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job
  FROM public.processing_jobs
  WHERE id = p_job_id AND status = 'dead_letter';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % não encontrado ou não está em dead_letter', p_job_id;
  END IF;

  IF NOT fiscal_member_of(v_job.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para arquivar nesta organização';
  END IF;

  UPDATE public.processing_jobs
  SET dismissed_at     = NOW(),
      dismissed_by     = auth.uid(),
      dismissal_reason = p_reason
  WHERE id = p_job_id;
END;
$$;

-- replay_dead_letter: se o job dispensado for reenviado para replay,
-- o novo job nasce sem dismissed_at (INSERT normal já não copia essas
-- colunas), então nenhuma mudança é necessária ali — só documentado aqui.

-- ============================================================
-- View: dead letters aguardando ação — exclui os já arquivados
-- ============================================================

CREATE OR REPLACE VIEW public.dead_letter_queue AS
SELECT
  pj.id,
  pj.organization_id,
  pj.raw_document_id,
  pj.failure_type,
  pj.error_code,
  pj.error_message,
  pj.retry_count,
  pj.created_at,
  rd.access_key,
  rd.file_path
FROM public.processing_jobs pj
JOIN public.raw_documents rd ON rd.id = pj.raw_document_id
WHERE pj.status = 'dead_letter'
  AND pj.dismissed_at IS NULL
ORDER BY pj.created_at DESC;
