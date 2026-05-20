-- ============================================================
-- OrçaCloud — Módulo Fiscal & Custos
-- Migration 003: Funções PL/pgSQL atômicas
--
-- Adaptações em relação ao módulo standalone:
--   - invoices      → nfe_invoices
--   - invoice_items → nfe_invoice_items
--   - company_id    → organization_id
--   - Verificação de replay usa fiscal_member_of() em vez de auth_user_role()
-- ============================================================

-- ============================================================
-- LOCK OTIMISTA: adquire job para processamento exclusivo
-- Retorna TRUE somente se o job estava em 'queued'
-- Previne processamento duplicado em concorrência
-- ============================================================

CREATE OR REPLACE FUNCTION public.acquire_job(p_job_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_acquired BOOLEAN := FALSE;
BEGIN
  UPDATE public.processing_jobs
  SET status     = 'processing',
      started_at = NOW()
  WHERE id     = p_job_id
    AND status = 'queued'
  RETURNING TRUE INTO v_acquired;

  RETURN COALESCE(v_acquired, FALSE);
END;
$$;

-- ============================================================
-- TRANSAÇÃO ATÔMICA: persiste todo o pipeline de uma NF-e
--   extracted_documents + nfe_invoices + nfe_invoice_items
--   + atualiza processing_job e raw_document — num único bloco
--
-- ROLLBACK automático do PostgreSQL se qualquer etapa falhar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.persist_nfe_transaction(
  p_job_id           UUID,
  p_raw_document_id  UUID,
  p_organization_id  UUID,
  p_contract         JSONB,
  p_contract_version TEXT,
  p_parser_version   TEXT,
  p_warnings         JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_extracted_id  UUID;
  v_invoice_id    UUID;
  v_item          JSONB;
  v_access_key    TEXT;
  v_issue_date    DATE;
BEGIN
  -- Extrair campos raiz do contrato
  v_access_key := p_contract->'metadata'->>'access_key';
  v_issue_date := (p_contract->'metadata'->>'issue_date')::DATE;

  -- 1. Desativar versões anteriores do extracted_document deste raw
  UPDATE public.extracted_documents
  SET is_active = FALSE
  WHERE raw_document_id = p_raw_document_id
    AND is_active = TRUE;

  -- 2. Inserir novo extracted_document (JSON Contract V1)
  INSERT INTO public.extracted_documents (
    raw_document_id,
    contract_version,
    extracted_data,
    parser_version,
    extracted_at,
    warnings,
    is_active
  ) VALUES (
    p_raw_document_id,
    p_contract_version,
    p_contract,
    p_parser_version,
    NOW(),
    p_warnings,
    TRUE
  )
  RETURNING id INTO v_extracted_id;

  -- Atualizar superseded_by no anterior para rastrear histórico
  UPDATE public.extracted_documents
  SET superseded_by = v_extracted_id
  WHERE raw_document_id = p_raw_document_id
    AND is_active       = FALSE
    AND superseded_by   IS NULL
    AND id              != v_extracted_id;

  -- 3. Inserir nfe_invoice (domínio normalizado)
  INSERT INTO public.nfe_invoices (
    organization_id,
    raw_document_id,
    access_key,
    issuer_name,
    issuer_cnpj,
    recipient_name,
    recipient_cnpj,
    issue_date,
    total_value,
    document_status,
    payment_status
  ) VALUES (
    p_organization_id,
    p_raw_document_id,
    v_access_key,
    p_contract->'issuer'->>'name',
    p_contract->'issuer'->>'cnpj',
    p_contract->'recipient'->>'name',
    p_contract->'recipient'->>'cnpj',
    v_issue_date,
    (p_contract->'totals'->>'total_value')::NUMERIC,
    'active',
    'pending'
  )
  RETURNING id INTO v_invoice_id;

  -- 4. Inserir nfe_invoice_items (uma linha por item do XML)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_contract->'items')
  LOOP
    INSERT INTO public.nfe_invoice_items (
      invoice_id,
      line_number,
      description,
      ncm,
      cfop,
      quantity,
      commercial_unit,
      taxable_unit,
      unit_value,
      total_value,
      tax_value
    ) VALUES (
      v_invoice_id,
      (v_item->>'line_number')::INTEGER,
      v_item->>'description',
      NULLIF(v_item->>'ncm', ''),
      NULLIF(v_item->>'cfop', ''),
      (v_item->>'quantity')::NUMERIC,
      NULLIF(v_item->>'commercial_unit', ''),
      NULLIF(v_item->>'taxable_unit', ''),
      (v_item->>'unit_value')::NUMERIC,
      (v_item->>'total_value')::NUMERIC,
      NULLIF(v_item->>'tax_value', '')::NUMERIC
    );
  END LOOP;

  -- 5. Marcar processing_job como completed (na MESMA transação)
  UPDATE public.processing_jobs
  SET status      = 'completed',
      finished_at = NOW()
  WHERE id = p_job_id;

  -- 6. Marcar raw_document como completed
  UPDATE public.raw_documents
  SET processing_status = 'completed'
  WHERE id = p_raw_document_id;

  -- Qualquer falha acima faz ROLLBACK automático de toda a função.
END;
$$;

-- ============================================================
-- REPLAY MANUAL: reprocessa job em dead_letter
-- Cria novo job do tipo 'replay' e reseta raw_document
-- Qualquer membro da organização pode fazer replay
-- (controle de acesso mais fino pode ser adicionado depois)
-- ============================================================

CREATE OR REPLACE FUNCTION public.replay_dead_letter(p_job_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_job         public.processing_jobs%ROWTYPE;
  v_new_job_id  UUID;
BEGIN
  -- Buscar o job (deve ser dead_letter)
  SELECT * INTO v_job
  FROM public.processing_jobs
  WHERE id = p_job_id AND status = 'dead_letter';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % não encontrado ou não está em dead_letter', p_job_id;
  END IF;

  -- Verificar que o caller pertence à mesma organização
  IF NOT fiscal_member_of(v_job.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para replay nesta organização';
  END IF;

  -- Criar novo job de replay
  INSERT INTO public.processing_jobs (
    organization_id,
    raw_document_id,
    job_type,
    status,
    retry_count,
    max_retries,
    payload
  ) VALUES (
    v_job.organization_id,
    v_job.raw_document_id,
    'replay',
    'queued',
    0,
    3,
    jsonb_build_object(
      'replayed_from', p_job_id,
      'replayed_at',   NOW()
    )
  )
  RETURNING id INTO v_new_job_id;

  -- Resetar raw_document para novo processamento
  UPDATE public.raw_documents
  SET processing_status = 'queued'
  WHERE id = v_job.raw_document_id;

  RETURN v_new_job_id;
END;
$$;

-- ============================================================
-- CRON: Fallback polling (configure via Supabase Dashboard)
-- Dispara a Edge Function a cada 2 minutos para resgatar
-- jobs órfãos (webhook perdido) e retry_candidates.
--
-- SELECT cron.schedule(
--   'fiscal-fallback-polling',
--   '*/2 * * * *',
--   $$
--   SELECT net.http_post(
--     url  := current_setting('app.supabase_url') || '/functions/v1/fiscal-nfe-processor',
--     body := '{"fallback_polling": true}'::jsonb,
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.service_role_key')
--     )
--   )
--   $$
-- );
-- ============================================================
