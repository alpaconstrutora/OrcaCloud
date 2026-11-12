-- SÓ LEITURA (desfeito no fim): (antiga) IS DISTINCT FROM (nova) linha a linha, lote 1, 28 expressões × cada usuário.
DO $c$
DECLARE r text := ''; u record; k bigint; total bigint := 0; testes int := 0; detalhes text := '';
BEGIN
  PERFORM set_config('statement_timeout', '1800s', true);
  CREATE TEMP TABLE _quem ON COMMIT DROP AS
    SELECT DISTINCT lower(m.email) AS email, COALESCE(m.user_id, au.id) AS uid
      FROM public.organization_members m LEFT JOIN auth.users au ON lower(au.email) = lower(m.email)
    UNION
    SELECT DISTINCT lower(b.email), au.id FROM public.broker_profiles b LEFT JOIN auth.users au ON lower(au.email) = lower(b.email)
    UNION SELECT NULL, NULL;
  FOR u IN SELECT * FROM _quem LOOP
    PERFORM set_config('request.jwt.claims', CASE WHEN u.email IS NULL THEN '' ELSE json_build_object('sub', u.uid, 'email', u.email, 'role', 'authenticated')::text END, true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."boletos_auditoria" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s boletos_auditoria.boletos_audit_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s boletos_auditoria.boletos_audit_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."boletos_auditoria" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s boletos_auditoria.boletos_audit_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s boletos_auditoria.boletos_audit_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."notifications" WHERE ((((lower(recipient_email) = lower((auth.jwt() ->> 'email'::text))) OR ((organization_id IS NOT NULL) AND is_org_member(organization_id))))) IS DISTINCT FROM ((((lower(recipient_email) = lower((auth.jwt() ->> 'email'::text))) OR ((organization_id IS NOT NULL) AND COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s notifications.notifications_rw USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s notifications.notifications_rw USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."notifications" WHERE ((((organization_id IS NULL) OR is_org_member(organization_id)))) IS DISTINCT FROM ((((organization_id IS NULL) OR COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s notifications.notifications_rw CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s notifications.notifications_rw CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_classification_memory" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_classification_memory.reconciliation_memory_org USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_classification_memory.reconciliation_memory_org USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."reconciliation_classification_memory" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s reconciliation_classification_memory.reconciliation_memory_org CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s reconciliation_classification_memory.reconciliation_memory_org CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."boletos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s boletos.boletos_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s boletos.boletos_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."boletos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s boletos.boletos_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s boletos.boletos_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."boletos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s boletos.boletos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s boletos.boletos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."boletos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s boletos.boletos_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s boletos.boletos_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."boletos" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s boletos.boletos_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s boletos.boletos_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_objects" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_objects.blueprint_objects_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_objects.blueprint_objects_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_objects" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_objects.blueprint_objects_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_objects.blueprint_objects_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_org_shares.sos_manage USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_org_shares.sos_manage USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_org_shares.sos_manage CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_org_shares.sos_manage CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."supplier_org_shares" WHERE (((is_org_member(target_org_id) OR is_superadmin()))) IS DISTINCT FROM (((COALESCE((target_org_id) IN (SELECT public.minhas_orgs_membro()), false) OR is_superadmin())))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s supplier_org_shares.sos_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s supplier_org_shares.sos_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_audit_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_audit_events.blueprint_audit_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_audit_events.blueprint_audit_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."blueprint_audit_events" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s blueprint_audit_events.blueprint_audit_org_read USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s blueprint_audit_events.blueprint_audit_org_read USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_precedent_conditions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_precedent_conditions.org_access_contract_precedent_conditions USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_precedent_conditions.org_access_contract_precedent_conditions USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."contract_precedent_conditions" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s contract_precedent_conditions.org_access_contract_precedent_conditions CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s contract_precedent_conditions.org_access_contract_precedent_conditions CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."invoices" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s invoices.invoices_org_delete USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s invoices.invoices_org_delete USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."invoices" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s invoices.invoices_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s invoices.invoices_org_insert CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."invoices" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s invoices.invoices_org_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s invoices.invoices_org_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."invoices" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s invoices.invoices_org_update USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s invoices.invoices_org_update USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."invoices" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s invoices.invoices_org_update CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s invoices.invoices_org_update CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."suppliers" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s suppliers.Users can manage suppliers of their organization USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s suppliers.Users can manage suppliers of their organization USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."suppliers" WHERE ((is_org_member(organization_id))) IS DISTINCT FROM ((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false)))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s suppliers.Users can manage suppliers of their organization CHECK: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s suppliers.Users can manage suppliers of their organization CHECK: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
    BEGIN
      EXECUTE $q$SELECT count(*) FROM "public"."suppliers" WHERE (((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = suppliers.id) AND is_org_member(sh.target_org_id))))))) IS DISTINCT FROM (((COALESCE((organization_id) IN (SELECT public.minhas_orgs_membro()), false) OR (EXISTS ( SELECT 1
   FROM supplier_org_shares sh
  WHERE ((sh.supplier_id = suppliers.id) AND COALESCE((sh.target_org_id) IN (SELECT public.minhas_orgs_membro()), false)))))))$q$ INTO k;
      testes := testes + 1; total := total + k;
      IF k > 0 THEN detalhes := detalhes || format(' [%s %s suppliers.suppliers_select USING: %s]', COALESCE(u.email, 'anon'), '', k); END IF;
    EXCEPTION WHEN OTHERS THEN detalhes := detalhes || format(' [ERRO %s suppliers.suppliers_select USING: %s]', COALESCE(u.email, 'anon'), SQLERRM);
    END;
  END LOOP;
  RAISE EXCEPTION 'RESULTADOS: lote 1: % comparações (expressão × usuário), % linhas com resultado diferente%', testes, total,
    CASE WHEN detalhes = '' THEN '' ELSE E'
' || left(detalhes, 3000) END;
END
$c$;
