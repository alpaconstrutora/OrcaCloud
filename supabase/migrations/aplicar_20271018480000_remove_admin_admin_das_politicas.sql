-- Remove o e-mail `admin@admin.com` das políticas de RLS (item 4 da segurança Asaas)
--
-- Pedido do usuário em 18/10/2026: aprovou os 6 itens da análise de segurança e, depois
-- dos itens 1 e 2, respondeu "sim" a seguir com os itens 3 e 4.
-- Plano: docs/planos/2026-10-18-asaas-seguranca-chaves-pix.md.
--
-- O risco: 16 políticas em 11 tabelas davam acesso TOTAL a quem tivesse o e-mail
-- `admin@admin.com` no token (as 2 de supplier_bank_accounts saíram em
-- aplicar_20271018460000). O usuário existe desde 10/03/2026, nunca entrou e não confirmou o
-- e-mail — mas o domínio admin.com é de terceiros: confirmação ou troca de senha chegaria a
-- quem controla esse domínio. Nenhum código do app usa esse e-mail.
--
-- Cada ALTER POLICY abaixo foi gerado da definição do banco em 18/10/2026, tirando só o
-- trecho `OR (... = 'admin@admin.com')`; o resto de cada regra fica idêntico. A trava no fim
-- desfaz tudo se sobrar alguma política com o e-mail.
--
-- REGRA #7, pergunta 1 (policies): só RESTRINGE (tira um OU); nenhuma regra nova.
-- REGRA #7, pergunta 2 (funções): nenhuma.

-- public.broker_portal_proposal_units · broker_proposal_units_delete (DELETE)
ALTER POLICY "broker_proposal_units_delete" ON public.broker_portal_proposal_units
    USING ((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))))))));

-- public.broker_portal_proposal_units · broker_proposal_units_insert (INSERT)
ALTER POLICY "broker_proposal_units_insert" ON public.broker_portal_proposal_units
    WITH CHECK ((is_org_member(organization_id) AND (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
           FROM organization_members om
          WHERE ((om.organization_id = pr.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text))))))))))));

-- public.broker_portal_proposal_units · broker_proposal_units_select (SELECT)
ALTER POLICY "broker_proposal_units_select" ON public.broker_portal_proposal_units
    USING ((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND ((lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))) OR is_org_member(pr.organization_id)))))));

-- public.broker_portal_proposal_units · broker_proposal_units_update (UPDATE)
ALTER POLICY "broker_proposal_units_update" ON public.broker_portal_proposal_units
    USING ((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM broker_portal_proposals pr
  WHERE ((pr.id = broker_portal_proposal_units.proposal_id) AND (lower(pr.broker_email) = lower((auth.jwt() ->> 'email'::text))))))));

-- public.broker_portal_proposals · broker_proposals_insert (INSERT)
ALTER POLICY "broker_proposals_insert" ON public.broker_portal_proposals
    WITH CHECK ((is_org_member(organization_id) AND ((lower(broker_email) = lower((auth.jwt() ->> 'email'::text))) OR (EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = broker_portal_proposals.organization_id) AND (lower(om.email) = lower((auth.jwt() ->> 'email'::text)))))))));

-- public.broker_property_access · broker_property_access_manage (ALL)
ALTER POLICY "broker_property_access_manage" ON public.broker_property_access
    USING (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND is_org_member(p.organization_id))))))
    WITH CHECK (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND is_org_member(p.organization_id))))));

-- public.broker_property_access · broker_property_access_select (SELECT)
ALTER POLICY "broker_property_access_select" ON public.broker_property_access
    USING (((EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = broker_property_access.property_id) AND is_org_member(p.organization_id))))));

-- public.commercial_deal_units · Enable access to organization members (ALL)
ALTER POLICY "Enable access to organization members" ON public.commercial_deal_units
    USING ((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND is_org_member(p.organization_id))))))
    WITH CHECK ((is_org_member(organization_id) OR (EXISTS ( SELECT 1
   FROM commercial_properties p
  WHERE ((p.id = commercial_deal_units.property_id) AND is_org_member(p.organization_id))))));

-- public.crm_contacts · crm_contacts_org_members (ALL)
ALTER POLICY "crm_contacts_org_members" ON public.crm_contacts
    USING ((is_org_member(organization_id)))
    WITH CHECK ((is_org_member(organization_id)));

-- public.crm_opportunities · crm_opportunities_org_members (ALL)
ALTER POLICY "crm_opportunities_org_members" ON public.crm_opportunities
    USING ((is_org_member(organization_id)))
    WITH CHECK ((is_org_member(organization_id)));

-- public.crm_proposals · crm_proposals_org_members (ALL)
ALTER POLICY "crm_proposals_org_members" ON public.crm_proposals
    USING ((is_org_member(organization_id)))
    WITH CHECK ((is_org_member(organization_id)));

-- public.crm_tasks · crm_tasks_org_members (ALL)
ALTER POLICY "crm_tasks_org_members" ON public.crm_tasks
    USING ((is_org_member(organization_id)))
    WITH CHECK ((is_org_member(organization_id)));

-- public.crm_timeline_events · crm_timeline_org_members (ALL)
ALTER POLICY "crm_timeline_org_members" ON public.crm_timeline_events
    USING ((is_org_member(organization_id)))
    WITH CHECK ((is_org_member(organization_id)));

-- storage.objects · storage_docs_select_partner_uploads (SELECT)
ALTER POLICY "storage_docs_select_partner_uploads" ON storage.objects
    USING (((bucket_id = 'opura-docs'::text) AND ((storage.foldername(name))[1] = 'partner-uploads'::text) AND (((storage.foldername(name))[2] IN ( SELECT (partner_users.partner_workspace_id)::text AS partner_workspace_id
   FROM partner_users
  WHERE ((partner_users.email = (auth.jwt() ->> 'email'::text)) AND (partner_users.is_active = true)))) OR ((storage.foldername(name))[2] IN ( SELECT (pw.id)::text AS id
   FROM partner_workspaces pw
  WHERE (is_org_member(pw.organization_id)))))));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE coalesce(qual, '') || coalesce(with_check, '') ILIKE '%admin@admin.com%') THEN
        RAISE EXCEPTION 'Ainda há política com admin@admin.com — nada foi alterado.';
    END IF;
END $$;
