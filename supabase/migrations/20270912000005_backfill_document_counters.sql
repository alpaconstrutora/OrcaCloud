-- Backfill de `document_number_counters` a partir dos mecanismos antigos —
-- SEM ISSO A NUMERAÇÃO REINICIA DO 1 e bate no índice único assim que uma
-- organização gerar o primeiro documento pelo motor novo numa obra/unidade
-- que já tinha pedidos. Documentos já emitidos MANTÊM o número antigo
-- (decisão de produto 2026-08-17) — este script só semeia o CONTADOR, nunca
-- renumera uma linha existente.
--
-- Idempotente: todo INSERT usa ON CONFLICT DO UPDATE ... GREATEST(), então
-- rodar de novo (ou depois de mais pedidos terem sido criados no mecanismo
-- antigo) só sobe o contador, nunca desce.
--
-- Os scope_key aqui replicam a máscara DEFAULT de cada doc_type
-- (services/documentNumbering/catalog.ts). Uma organização que já tiver
-- reconfigurado a máscara antes de rodar este backfill vai precisar rodar de
-- novo com os códigos da NOVA máscara — isso é esperado: mudar a máscara já
-- muda o escopo do contador para documentos novos.

SET lock_timeout = '5s';

-- ═══ 1. PURCHASE_ORDER — default ['PREFIX','EMPREENDIMENTO','OBRA'] ═══════
INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT
    p.organization_id,
    'PURCHASE_ORDER',
    COALESCE(emp_direct.code, emp_tower.code, '') || '|' || COALESCE(NULLIF(p.code, ''), p.settings->>'code', ''),
    c.last_seq,
    NOW()
FROM public.purchase_order_number_counters c
JOIN public.projects p ON p.id = c.project_id
LEFT JOIN LATERAL (
    SELECT e.code FROM public.empreendimentos e WHERE e.project_id = p.id LIMIT 1
) emp_direct ON true
LEFT JOIN LATERAL (
    SELECT e.code FROM public.empreendimento_towers t
    JOIN public.empreendimentos e ON e.id = t.empreendimento_id
    WHERE t.project_id = p.id LIMIT 1
) emp_tower ON true
WHERE p.organization_id IS NOT NULL
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

-- ═══ 2. SUPPLY_CONTRACT — mesmo formato de escopo do PURCHASE_ORDER ═══════
INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT
    p.organization_id,
    'SUPPLY_CONTRACT',
    COALESCE(emp_direct.code, emp_tower.code, '') || '|' || COALESCE(NULLIF(p.code, ''), p.settings->>'code', ''),
    c.last_seq,
    NOW()
FROM public.contract_number_counters c
JOIN public.projects p ON p.id = c.project_id
LEFT JOIN LATERAL (
    SELECT e.code FROM public.empreendimentos e WHERE e.project_id = p.id LIMIT 1
) emp_direct ON true
LEFT JOIN LATERAL (
    SELECT e.code FROM public.empreendimento_towers t
    JOIN public.empreendimentos e ON e.id = t.empreendimento_id
    WHERE t.project_id = p.id LIMIT 1
) emp_tower ON true
WHERE p.organization_id IS NOT NULL
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

-- ═══ 3. QUOTATION — idem ═══════════════════════════════════════════════
INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT
    p.organization_id,
    'QUOTATION',
    COALESCE(emp_direct.code, emp_tower.code, '') || '|' || COALESCE(NULLIF(p.code, ''), p.settings->>'code', ''),
    c.last_seq,
    NOW()
FROM public.quotation_number_counters c
JOIN public.projects p ON p.id = c.project_id
LEFT JOIN LATERAL (
    SELECT e.code FROM public.empreendimentos e WHERE e.project_id = p.id LIMIT 1
) emp_direct ON true
LEFT JOIN LATERAL (
    SELECT e.code FROM public.empreendimento_towers t
    JOIN public.empreendimentos e ON e.id = t.empreendimento_id
    WHERE t.project_id = p.id LIMIT 1
) emp_tower ON true
WHERE p.organization_id IS NOT NULL
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

-- ═══ 4. RENTAL_CONTRACT — default ['PREFIX','EMPREENDIMENTO','UNIDADE'] ═══
-- vw_unit_property_map já traz empreendimento_code + organization_id prontos.
INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT
    m.organization_id,
    'RENTAL_CONTRACT',
    COALESCE(m.empreendimento_code, '') || '|' || COALESCE(m.unit_name, ''),
    c.last_seq,
    NOW()
FROM public.rental_contract_number_counters c
JOIN public.vw_unit_property_map m ON m.unit_id = c.unit_id AND m.purpose = 'RENTAL'
WHERE m.organization_id IS NOT NULL
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

-- ═══ 5. UNIT_SALE_CONTRACT — idem, purpose SALE ═══════════════════════════
INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT
    m.organization_id,
    'UNIT_SALE_CONTRACT',
    COALESCE(m.empreendimento_code, '') || '|' || COALESCE(m.unit_name, ''),
    c.last_seq,
    NOW()
FROM public.unit_sale_contract_number_counters c
JOIN public.vw_unit_property_map m ON m.unit_id = c.unit_id AND m.purpose = 'SALE'
WHERE m.organization_id IS NOT NULL
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

-- ═══ 6. SERVICE_CONTRACT — legado 3 dígitos, sem máscara (scope_key='') ═══
-- MAX(number) por organização entre os contratos domain='SERVICOS'
-- (direction OUTGOING, mesmo filtro do ContractModal legado).
INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT organization_id, 'SERVICE_CONTRACT', '', MAX(n), NOW()
FROM (
    SELECT organization_id, CAST(number AS INTEGER) AS n
    FROM public.contracts
    WHERE domain = 'SERVICOS' AND number ~ '^\d+$' AND organization_id IS NOT NULL
) x
GROUP BY organization_id
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

-- ═══ 7. SALE_DEAL — legado 3 dígitos (commercial_deals.code, type=SALE) ═══
INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), 'SALE_DEAL', '', MAX(n), NOW()
FROM (
    SELECT organization_id, CAST(code AS INTEGER) AS n
    FROM public.commercial_deals
    WHERE type = 'SALE' AND code ~ '^\d+$'
) x
GROUP BY organization_id
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

-- ═══ 8. SERVICE_PROPOSAL / SERVICE_CRM_CONTRACT — sequence global antiga ═══
-- Não havia escopo por organização (nextval('services_proposal_seq') é
-- global); semeia por organização com o maior sufixo numérico já emitido lá,
-- para não colidir com propostas antigas da MESMA organização. Não protege
-- contra colisão entre organizações diferentes que compartilhavam a mesma
-- sequence — essa colisão não existia no mecanismo antigo (UNIQUE é
-- organization_id+proposal_number) e continua não existindo aqui.
INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT organization_id, 'SERVICE_PROPOSAL', '', MAX(n), NOW()
FROM (
    -- '.*\D' consome tudo até o ÚLTIMO não-dígito (ex.: "PROP-2026-" em
    -- "PROP-2026-00001"), deixando só o grupo numérico final — ^\D* pararia
    -- em "PROP-" e devolveria "2026-00001", que não faz CAST para INTEGER.
    SELECT organization_id, CAST(regexp_replace(proposal_number, '.*\D', '') AS INTEGER) AS n
    FROM public.services_proposals
    WHERE proposal_number ~ '\d+$'
) x
GROUP BY organization_id
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

INSERT INTO public.document_number_counters (organization_id, doc_type, scope_key, last_seq, updated_at)
SELECT organization_id, 'SERVICE_CRM_CONTRACT', '', MAX(n), NOW()
FROM (
    SELECT organization_id, CAST(regexp_replace(contract_number, '.*\D', '') AS INTEGER) AS n
    FROM public.services_contracts
    WHERE contract_number ~ '\d+$'
) x
GROUP BY organization_id
ON CONFLICT (organization_id, doc_type, scope_key) DO UPDATE
    SET last_seq = GREATEST(public.document_number_counters.last_seq, EXCLUDED.last_seq), updated_at = NOW();

-- RENTAL_DEAL e CONDO_RATEIO não têm mecanismo antigo — nascem do 1, sem backfill.
