-- ============================================================
-- Migration: 20270208000002_drop_anon_dev_policies_rollout.sql
-- SEGURANÇA — rollout do drop das políticas anon "Regra 8 / Dev" para todos
-- os módulos (sequência da 20270208000001, que cobriu só o ÒPURA Docs).
--
-- Remove 81 políticas que concediam ao role `anon` (chave pública no bundle
-- do front) acesso irrestrito às tabelas — vazamento/escrita cross-tenant.
--
-- PROVA DE SEGURANÇA (verificada contra o banco REMOTO via pg_policies, não
-- contra o repo — que tem schema drift demais para ser fonte de verdade):
--   1. Políticas do role `anon` só concedem privilégio ao role `anon`.
--      Removê-las NÃO afeta o role `authenticated` (que já funciona hoje).
--   2. Query confirmou: NENHUMA tabela com policy anon fica sem policy
--      `authenticated`/`public` após o drop (zero risco de lockout).
--   3. Todos os fluxos anon/públicos do app usam RPCs SECURITY DEFINER
--      (partner_portal_* [13], get_public_marketplace/submit_public_interest
--      [3], fn_get_document_status_public, *_portal_* dos portais cliente/
--      corretor/investidor/funcionário) — que bypassam RLS e NÃO dependem
--      destas policies de tabela. As 4 telas públicas (PublicMarketplaceView,
--      PublicOpportunityDetail, PublicPlantChecker, PartnerPortal token gate)
--      leem via RPC, nunca a tabela direto como anon.
--   4. Todo o resto do app roda atrás do guard de sessão (role authenticated).
--
-- Só remove backdoors "USING(true)/FOR ALL". PRESERVADAS de propósito (public
-- read/scoped intencional — decisão separada do dono; NÃO são dev cruft):
--   • investor_opportunity_competitors — "Public read for competitors" (marketplace)
--   • sinapi_items — "Public items are viewable by everyone" (catálogo público)
--   • invoices — "Suppliers can view/insert their own invoices" (portal fornecedor)
--   • broker_portal_tokens — "broker_tokens_anon_select" (SELECT escopado por token válido)
--   ⚠️ Ressalva: as policies de invoices (SELECT) e investor_opportunity_competitors
--      usam qual=true (sem escopo real) → possível superexposição; avaliar à parte.
--
-- FORA DESTE ESCOPO (passo separado): policies anon de storage.objects
-- (buckets invoices/broker-materials/opportunity-photos/measure-plants) —
-- entrelaçadas com fluxos públicos reais, exigem análise por bucket.
--
-- Também inclui a policy "Allow anon select on opura_document_versions", que
-- existia só no remoto (drift) e escapou da 20270208000001.
--
-- Idempotente: DROP POLICY IF EXISTS. RLS segue habilitado; policies
-- authenticated org-scoped intactas.
-- ============================================================

-- Financeiro / Boletos
DROP POLICY IF EXISTS "boletos_anon_all" ON public.boletos;
DROP POLICY IF EXISTS "boletos_audit_anon_all" ON public.boletos_auditoria;
DROP POLICY IF EXISTS "invoices_anon_all" ON public.invoices;
DROP POLICY IF EXISTS "supplier_payments_anon_all" ON public.supplier_payments;
DROP POLICY IF EXISTS "sba_anon_all" ON public.supplier_bank_accounts;
DROP POLICY IF EXISTS "Allow anon delete on purchase_orders" ON public.purchase_orders;

-- Remuneração societária / Pró-labore / Dividendos
DROP POLICY IF EXISTS "dividend_rules_anon_all" ON public.dividend_withholding_rules;
DROP POLICY IF EXISTS "profit_batches_anon_all" ON public.profit_distribution_batches;
DROP POLICY IF EXISTS "profit_items_anon_all" ON public.profit_distribution_items;
DROP POLICY IF EXISTS "prolabore_inss_rules_anon_all" ON public.prolabore_inss_rules;
DROP POLICY IF EXISTS "prolabore_items_anon_all" ON public.prolabore_payroll_items;
DROP POLICY IF EXISTS "prolabore_payrolls_anon_all" ON public.prolabore_payrolls;

-- Cadastros / Comercial
DROP POLICY IF EXISTS "Allow anon all on client_categories" ON public.client_categories;

-- Contratos
DROP POLICY IF EXISTS "Allow anon all on contract_utility_bills" ON public.contract_utility_bills;

-- Composições / custom
DROP POLICY IF EXISTS "anon_all_custom_databases" ON public.custom_databases;
DROP POLICY IF EXISTS "anon_all_custom_items" ON public.custom_items;

-- Empreendimentos
DROP POLICY IF EXISTS "Allow anon all on empr_common_areas" ON public.empreendimento_common_areas;
DROP POLICY IF EXISTS "Allow anon all on empr_towers" ON public.empreendimento_towers;
DROP POLICY IF EXISTS "Allow anon all on empr_units" ON public.empreendimento_units;
DROP POLICY IF EXISTS "Allow anon all on empreendimentos" ON public.empreendimentos;

-- Compliance / SST
DROP POLICY IF EXISTS "Allow anon all on compliance_checklists" ON public.compliance_checklists;
DROP POLICY IF EXISTS "Allow anon all on compliance_evidences" ON public.compliance_evidences;
DROP POLICY IF EXISTS "Allow anon all on compliance_physical_locations" ON public.compliance_physical_locations;
DROP POLICY IF EXISTS "Allow anon all on compliance_rules" ON public.compliance_rules;

-- Medição (measure)
DROP POLICY IF EXISTS "Allow anon all on measure_files" ON public.measure_files;
DROP POLICY IF EXISTS "Allow anon all on measure_layers" ON public.measure_layers;
DROP POLICY IF EXISTS "Allow anon all on measure_library_items" ON public.measure_library_items;
DROP POLICY IF EXISTS "Allow anon all on measure_projects" ON public.measure_projects;
DROP POLICY IF EXISTS "Allow anon all on measure_shapes" ON public.measure_shapes;

-- Offices (mini-apps dev)
DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.offices_especificacoes;
DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.offices_leads;
DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.offices_timesheet;

-- Patrimônio / Ativos
DROP POLICY IF EXISTS "Allow anon all on brands" ON public.opura_asset_brands;
DROP POLICY IF EXISTS "Allow anon all on asset_documents" ON public.opura_asset_documents;
DROP POLICY IF EXISTS "Allow anon all on asset_maintenances" ON public.opura_asset_maintenances;
DROP POLICY IF EXISTS "Allow anon all on asset_movements" ON public.opura_asset_movements;
DROP POLICY IF EXISTS "Allow anon all on asset_reservations" ON public.opura_asset_reservations;
DROP POLICY IF EXISTS "Allow anon all on assets" ON public.opura_assets;

-- CNO / Previdência
DROP POLICY IF EXISTS "Allow anon all on opura_cno_compliance_score" ON public.opura_cno_compliance_score;
DROP POLICY IF EXISTS "Allow anon all on opura_cno_dctfweb" ON public.opura_cno_dctfweb;
DROP POLICY IF EXISTS "Allow anon all on opura_cno_deductions" ON public.opura_cno_deductions;
DROP POLICY IF EXISTS "Allow anon all on opura_cno_registrations" ON public.opura_cno_registrations;
DROP POLICY IF EXISTS "Allow anon all on opura_cno_simulations" ON public.opura_cno_simulations;

-- Docs (drift residual da 20270208000001)
DROP POLICY IF EXISTS "Allow anon select on opura_document_versions" ON public.opura_document_versions;

-- Inteligência de mercado
DROP POLICY IF EXISTS "Allow anon select on cities" ON public.opura_market_cities;
DROP POLICY IF EXISTS "Allow anon select on city_configs" ON public.opura_market_city_configs;
DROP POLICY IF EXISTS "Allow anon select on developments" ON public.opura_market_developments;
DROP POLICY IF EXISTS "Allow anon select on listings" ON public.opura_market_listings;
DROP POLICY IF EXISTS "Allow anon select on monitored_competitors" ON public.opura_market_monitored_competitors;
DROP POLICY IF EXISTS "Allow anon select on neighborhood_history" ON public.opura_market_neighborhood_history;
DROP POLICY IF EXISTS "Allow anon select on neighborhoods" ON public.opura_market_neighborhoods;
DROP POLICY IF EXISTS "Allow anon select on terrain_studies" ON public.opura_market_terrain_studies;

-- Estrutural
DROP POLICY IF EXISTS "Allow anon all on structural_calculation_revisions" ON public.opura_structural_calculation_revisions;
DROP POLICY IF EXISTS "Allow anon all on structural_dimension_elements" ON public.opura_structural_dimension_elements;
DROP POLICY IF EXISTS "Allow anon all on structural_projects" ON public.opura_structural_projects;

-- Portal do Parceiro
DROP POLICY IF EXISTS "partner_comp_settings_anon_all" ON public.partner_compensation_settings;
DROP POLICY IF EXISTS "Allow anon all on partner_conversations" ON public.partner_conversations;
DROP POLICY IF EXISTS "Allow anon all on partner_messages" ON public.partner_messages;
DROP POLICY IF EXISTS "Allow anon all on partner_requests" ON public.partner_requests;
DROP POLICY IF EXISTS "Allow anon all on partner_shared_documents" ON public.partner_shared_documents;
DROP POLICY IF EXISTS "Allow anon all on partner_users" ON public.partner_users;
DROP POLICY IF EXISTS "Allow anon all on partner_workspaces" ON public.partner_workspaces;

-- Estudo de Viabilidade / Plantas (plant_*)
DROP POLICY IF EXISTS "Allow anon all on plant_briefings" ON public.plant_briefings;
DROP POLICY IF EXISTS "Allow anon all on plant_floors" ON public.plant_floors;
DROP POLICY IF EXISTS "Allow anon all on plant_scenarios" ON public.plant_scenarios;
DROP POLICY IF EXISTS "Allow anon all on plant_studies" ON public.plant_studies;
DROP POLICY IF EXISTS "Allow anon all on plant_terrains" ON public.plant_terrains;
DROP POLICY IF EXISTS "Allow anon all on plant_units" ON public.plant_units;
DROP POLICY IF EXISTS "Allow anon all on plant_urban_rulesets" ON public.plant_urban_rulesets;
DROP POLICY IF EXISTS "Allow anon all on plant_validations" ON public.plant_validations;

-- ÒPURA Pro (pro_*)
DROP POLICY IF EXISTS "Allow anon all on pro_clientes" ON public.pro_clientes;
DROP POLICY IF EXISTS "Allow anon all on pro_config" ON public.pro_config;
DROP POLICY IF EXISTS "Allow anon all on pro_orcamentos" ON public.pro_orcamentos;
DROP POLICY IF EXISTS "Allow anon all on pro_servicos" ON public.pro_servicos;

-- Reformas (mini-app dev)
DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.reformas_cronograma;
DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.reformas_diarios;
DROP POLICY IF EXISTS "Enable all for anon in dev" ON public.reformas_projetos;

-- Garantia / Assistência técnica
DROP POLICY IF EXISTS "anon_warranty_events_dev" ON public.warranty_claim_events;
DROP POLICY IF EXISTS "anon_warranty_evidence_dev" ON public.warranty_claim_evidence;
DROP POLICY IF EXISTS "anon_warranty_visits_dev" ON public.warranty_claim_visits;
DROP POLICY IF EXISTS "anon_warranty_claims_dev" ON public.warranty_claims;
