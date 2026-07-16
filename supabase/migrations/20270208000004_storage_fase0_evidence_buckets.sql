-- ============================================================
-- Migration: 20270208000004_storage_fase0_evidence_buckets.sql
-- Fase 0 do PLANO_STORAGE_PRIVATIZACAO.md — privatiza os 3 buckets de
-- evidência que estavam VAZIOS (0 objetos) no remoto: compliance-evidences,
-- incentive-evidence, operational-evidence. Momento mais seguro possível
-- (zero dado real a proteger/migrar).
--
-- Ao investigar as policies existentes, apareceram dois achados além da
-- exposição de leitura pública que motivou o plano:
--
--   1. operational-evidence NÃO TINHA NENHUMA POLICY (RLS habilitado, zero
--      policies para qualquer role/comando). O recurso de evidência de OS
--      (OperacionalEvidence.tsx) já estava QUEBRADO em produção — todo
--      upload falhava silenciosamente por RLS, por isso o bucket tinha 0
--      objetos. Esta migration cria as policies que faltavam.
--
--   2. compliance-evidences e incentive-evidence tinham policies de
--      INSERT/UPDATE/DELETE para `authenticated` SEM escopo de organização
--      (só checavam bucket_id) — ou seja, qualquer empresa logada podia
--      escrever/apagar evidência de QUALQUER outra empresa. Corrigido para
--      org-scoped no mesmo padrão comprovado do opura-docs.
--
-- Padrão de path confirmado no código (todos usam orgId como segmento):
--   compliance-evidences: "{orgId}/{timestamp}-{random}.ext"      → foldername[1]
--   incentive-evidence:   "{orgId}/{timestamp}-{filename}"        → foldername[1]
--   operational-evidence: "evidence/{orgId}/{workOrderId}/{ts}.ext" → foldername[2]
--
-- Companheiro de código (mesma tarefa): complianceService.ts,
-- ComplianceChecklists.tsx, LaborIncentivos.tsx, OperacionalEvidence.tsx
-- passam a persistir o PATH do storage (não mais a URL pública) e resolvem
-- signed URL na leitura — a coluna já era TEXT/VARCHAR, sem migração de
-- schema necessária.
-- ============================================================

-- ─── compliance-evidences ─────────────────────────────────────
DROP POLICY IF EXISTS "Public Access for compliance-evidences" ON storage.objects;
DROP POLICY IF EXISTS "Auth Insert compliance-evidences" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update compliance-evidences" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete compliance-evidences" ON storage.objects;

CREATE POLICY "compliance_evidences_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'compliance-evidences'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "compliance_evidences_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'compliance-evidences'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "compliance_evidences_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'compliance-evidences'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "compliance_evidences_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'compliance-evidences'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- ─── incentive-evidence ───────────────────────────────────────
DROP POLICY IF EXISTS "Public Incentive Evidence Read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Incentive Evidence Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Incentive Evidence Update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Incentive Evidence Delete" ON storage.objects;

CREATE POLICY "incentive_evidence_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'incentive-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "incentive_evidence_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'incentive-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "incentive_evidence_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'incentive-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "incentive_evidence_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'incentive-evidence'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- ─── operational-evidence (não tinha NENHUMA policy) ──────────
CREATE POLICY "operational_evidence_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'operational-evidence'
    AND (storage.foldername(name))[2] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "operational_evidence_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'operational-evidence'
    AND (storage.foldername(name))[2] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "operational_evidence_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'operational-evidence'
    AND (storage.foldername(name))[2] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "operational_evidence_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'operational-evidence'
    AND (storage.foldername(name))[2] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

-- ─── Privatiza os 3 buckets (código já convertido p/ signed URL) ──
UPDATE storage.buckets SET public = false
WHERE id IN ('compliance-evidences', 'incentive-evidence', 'operational-evidence');
