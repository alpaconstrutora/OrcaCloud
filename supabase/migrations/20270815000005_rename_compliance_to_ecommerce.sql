-- ============================================================
-- Migration: 20270815000005_rename_compliance_to_ecommerce.sql
-- Rebranding do módulo "ÒPURA Compliance" para "ÒPURA E-commerce" —
-- muda só o nome do produto na interface; o conteúdo (TTS-MG, segregação
-- física de estoque, evidências operacionais) continua o mesmo.
--
-- Estado dos dados antes desta migration (verificado em 2026-07-18):
--   compliance_physical_locations: 0 linhas
--   compliance_rules:              1 linha  (seed antigo do frontend)
--   compliance_checklists:         4 linhas (seed antigo do frontend)
--   compliance_evidences:          0 linhas
--   storage.objects em 'compliance-evidences': 0 objetos
-- Volume mínimo — ALTER TABLE RENAME preserva os dados existentes (linhas,
-- FKs, RLS) sem necessidade de recriar/copiar nada. O bucket, por ter 0
-- objetos, é recriado (não movido) para simplificar.
--
-- Companheiro de código: services/ecommerceService.ts (era
-- complianceService.ts), types/ecommerce.ts (era types/compliance.ts),
-- components/Ecommerce{Dashboard,Checklists,PhysicalMap}.tsx.
-- ============================================================

-- 1. Renomeia as 4 tabelas — FKs (rule_id, checklist_id) e RLS acompanham
--    automaticamente o rename no Postgres, não precisam ser recriadas.
ALTER TABLE IF EXISTS public.compliance_physical_locations RENAME TO ecommerce_physical_locations;
ALTER TABLE IF EXISTS public.compliance_rules               RENAME TO ecommerce_rules;
ALTER TABLE IF EXISTS public.compliance_checklists           RENAME TO ecommerce_checklists;
ALTER TABLE IF EXISTS public.compliance_evidences            RENAME TO ecommerce_evidences;

-- 2. Renomeia as policies de RLS (cosmético — a policy já protege a tabela
--    renomeada acima; isto só evita o nome desatualizado "compliance_..."
--    sobrevivendo dentro de uma tabela "ecommerce_...").
ALTER POLICY IF EXISTS "compliance_physical_locations_org_access" ON public.ecommerce_physical_locations
  RENAME TO "ecommerce_physical_locations_org_access";
ALTER POLICY IF EXISTS "compliance_rules_org_access" ON public.ecommerce_rules
  RENAME TO "ecommerce_rules_org_access";
ALTER POLICY IF EXISTS "compliance_checklists_org_access" ON public.ecommerce_checklists
  RENAME TO "ecommerce_checklists_org_access";
ALTER POLICY IF EXISTS "compliance_evidences_org_access" ON public.ecommerce_evidences
  RENAME TO "ecommerce_evidences_org_access";

-- 3. Bucket de storage — 0 objetos no momento desta migration, então é mais
--    simples recriar sob o novo nome do que mover objetos + reapontar FKs.
--    Se algum dia isto rodar com objetos já existentes, ver o padrão de
--    "criar novo bucket + UPDATE storage.objects.bucket_id + apagar antigo"
--    usado nas correções de storage anteriores (PLANO_STORAGE_PRIVATIZACAO.md).
--    ⚠️ storage.buckets/storage.objects têm um trigger protect_delete que
--    bloqueia DELETE direto via SQL (só permite via Storage API com service
--    role). Sem essa chave disponível aqui, o bucket antigo 'compliance-
--    evidences' fica órfão (vazio, já privado, sem policy, sem código
--    apontando pra ele) em vez de removido — inerte, sem risco funcional.
--    Remover manualmente pelo Dashboard do Supabase quando conveniente.
DROP POLICY IF EXISTS "compliance_evidences_select_org" ON storage.objects;
DROP POLICY IF EXISTS "compliance_evidences_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "compliance_evidences_update_org" ON storage.objects;
DROP POLICY IF EXISTS "compliance_evidences_delete_org" ON storage.objects;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ecommerce-evidences', 'ecommerce-evidences', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ecommerce_evidences_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ecommerce-evidences'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "ecommerce_evidences_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ecommerce-evidences'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "ecommerce_evidences_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ecommerce-evidences'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );

CREATE POLICY "ecommerce_evidences_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ecommerce-evidences'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.organization_members
      WHERE email = auth.jwt() ->> 'email'
    )
  );
