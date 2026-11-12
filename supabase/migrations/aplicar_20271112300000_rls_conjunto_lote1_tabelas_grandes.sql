-- ════════════════════════════════════════════════════════════════════════════
-- RLS: is_org_member por linha → conjunto de orgs calculado uma vez — LOTE 1
-- tabelas do schema public com 300 linhas ou mais (onde o custo foi medido): 21 policies em 10 tabelas
-- ════════════════════════════════════════════════════════════════════════════
-- GERADO por scripts/rls-trocar-is-org-member.mjs a partir do retrato
-- docs/planos/2026-11-11-rls-is-org-member/policies-antes.json — não editar à mão;
-- regerar. Plano: docs/planos/2026-11-11-rls-is-org-member-tabelas-grandes.md
--
-- Cada is_org_member(X) vira COALESCE((X) IN (SELECT public.minhas_orgs_membro()), false):
-- mesmo booleano (inclusive X nulo), calculado uma vez por consulta. Só as cláusulas
-- que tinham a chamada mudam; nome, comando, papéis e as demais pernas ficam.
--
-- REGRA #7 — Pergunta 1: nenhuma perna nova; cada chamada é trocada no lugar.
-- Pergunta 2: nenhuma função nova. minhas_orgs_membro (aplicar_20271111940000) ganha
-- EXECUTE para anon quando o lote tem policy de papel {public}: o anon avalia essas
-- policies (mesmo motivo de is_org_member em aplicar_20271111930000); com JWT vazio
-- ela devolve conjunto vazio.
--
-- TRAVA: cada ALTER POLICY trava a tabela por milissegundos. lock_timeout de 2 s: se
-- uma tabela estiver ocupada o comando falha em vez de enfileirar o app — rodar de novo.
-- VOLTA: docs/planos/2026-11-11-rls-is-org-member/volta-lote-1.sql
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).

SET lock_timeout = '2s';

-- INSERT · {authenticated} · 1 troca(s) · 9554 linhas
ALTER POLICY "boletos_audit_insert" ON "public"."boletos_auditoria"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 9554 linhas
ALTER POLICY "boletos_audit_select" ON "public"."boletos_auditoria"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 4620 linhas
ALTER POLICY "notifications_rw" ON "public"."notifications"
  USING (((lower(recipient_email) = lower((auth.jwt() ->> 'email'::text))) OR ((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))
  WITH CHECK (((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)));

-- ALL · {authenticated} · 2 troca(s) · 3190 linhas
ALTER POLICY "reconciliation_memory_org" ON "public"."reconciliation_classification_memory"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 1154 linhas
ALTER POLICY "boletos_delete" ON "public"."boletos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 1154 linhas
ALTER POLICY "boletos_insert" ON "public"."boletos"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 1154 linhas
ALTER POLICY "boletos_select" ON "public"."boletos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 1154 linhas
ALTER POLICY "boletos_update" ON "public"."boletos"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 941 linhas
ALTER POLICY "blueprint_objects_org_insert" ON "public"."blueprint_objects"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 941 linhas
ALTER POLICY "blueprint_objects_org_read" ON "public"."blueprint_objects"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 737 linhas
ALTER POLICY "sos_manage" ON "public"."supplier_org_shares"
  USING ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()))
  WITH CHECK ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- SELECT · {authenticated} · 1 troca(s) · 737 linhas
ALTER POLICY "sos_select" ON "public"."supplier_org_shares"
  USING ((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin()));

-- INSERT · {authenticated} · 1 troca(s) · 447 linhas
ALTER POLICY "blueprint_audit_org_insert" ON "public"."blueprint_audit_events"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 447 linhas
ALTER POLICY "blueprint_audit_org_read" ON "public"."blueprint_audit_events"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 376 linhas
ALTER POLICY "org_access_contract_precedent_conditions" ON "public"."contract_precedent_conditions"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- DELETE · {authenticated} · 1 troca(s) · 355 linhas
ALTER POLICY "invoices_org_delete" ON "public"."invoices"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- INSERT · {authenticated} · 1 troca(s) · 355 linhas
ALTER POLICY "invoices_org_insert" ON "public"."invoices"
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 1 troca(s) · 355 linhas
ALTER POLICY "invoices_org_select" ON "public"."invoices"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- UPDATE · {authenticated} · 2 troca(s) · 355 linhas
ALTER POLICY "invoices_org_update" ON "public"."invoices"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- ALL · {authenticated} · 2 troca(s) · 336 linhas
ALTER POLICY "Users can manage suppliers of their organization" ON "public"."suppliers"
  USING (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))
  WITH CHECK (COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false));

-- SELECT · {authenticated} · 2 troca(s) · 336 linhas
ALTER POLICY "suppliers_select" ON "public"."suppliers"
  USING ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = suppliers.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false))))));
