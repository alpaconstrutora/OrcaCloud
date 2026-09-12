-- ════════════════════════════════════════════════════════════════════════════
-- Compradores com o mesmo peso — Portal do Cliente e modelo da minuta
-- Plano: docs/planos/2026-09-12-vendas-multiplos-compradores.md (itens 11–13)
--
-- Pedido (2026-09-12): depois de a negociação de venda passar a ter N
-- compradores (aplicar_20270919000035), "devem aparecer no contrato etc" e o
-- co-comprador precisa ver a negociação no portal dele.
--
-- 1) fn_portal_get_contracts e fn_unidade_payload_for_client passam a
--    reconhecer o cliente como parte da negociação também via
--    commercial_deal_buyers. Copiadas dos ARQUIVOS 20270825000020 e
--    aplicar_20270918000027 (não do banco), com só o filtro alterado.
-- 2) O modelo .docx ativo tem os marcadores da cláusula das partes apontando
--    para a origem `client` (um cadastro). Remapeados para a origem `buyers`
--    ("Compradores (todos)"): com um comprador só a saída é IDÊNTICA (a origem
--    cai em [client]); com dois, os nomes/CPFs/endereços saem enumerados.
--
-- REGRA #7: cada função leva REVOKE + GRANT explícitos nesta mesma migration.
-- Idempotente. Aplicar com: npx supabase db query --linked -f <este arquivo>
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ 1a. Contratos no link do portal ════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_portal_get_contracts(p_token TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_tok      public.client_portal_tokens;
    v_category TEXT;
    v_domain   TEXT;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
    WHERE token = p_token AND is_active = TRUE AND expires_at > NOW();
    IF NOT FOUND THEN RETURN json_build_object('valid', FALSE); END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    -- Domínio de contrato derivado da categoria do cliente (catálogo editável).
    SELECT category INTO v_category FROM public.clients WHERE id = v_tok.client_id;
    v_domain := CASE
        WHEN v_category ILIKE 'venda%'  THEN 'VENDAS'
        WHEN v_category ILIKE 'loca%'   THEN 'LOCACAO'
        WHEN v_category ILIKE 'servi%'  THEN 'SERVICOS'
        ELSE NULL
    END;

    RETURN json_build_object(
        'valid', TRUE,
        'data', (
            SELECT json_agg(c ORDER BY c.created_at DESC)
            FROM (
                SELECT id, number, title, contract_type, status,
                       original_value, current_value, start_date, end_date,
                       signature_status, signature_url, signed_contract_url,
                       direction, domain, minuta_versions, created_at
                FROM public.contracts
                -- Contrato do cliente: aponta para ele (`client_id`) OU nasceu de
                -- uma negociação em que ele é um dos compradores
                -- (`commercial_deal_buyers`, mesmo peso). Espelha
                -- contractService.listContractsByClientId — as duas camadas
                -- precisam da mesma regra (ver memória do caso CL-2026-002).
                WHERE (client_id = v_tok.client_id
                       OR deal_id IN (SELECT b.deal_id FROM public.commercial_deal_buyers b
                                       WHERE b.client_id = v_tok.client_id))
                  AND organization_id = v_tok.org_id
                  -- NÃO usar `direction` aqui: é direção financeira
                  -- (LOCACAO=INCOMING desde 20270815000001), não "quem emitiu".
                  AND domain IN ('VENDAS', 'LOCACAO', 'SERVICOS')
                  AND status <> 'Rascunho'
                  AND (v_domain IS NULL OR domain = v_domain)
            ) c
        )
    );
END;
$$;

-- RPC nova/substituída: revogar PUBLIC antes de conceder (GRANT to authenticated
-- sozinho não bloqueia anon). O portal é acessado por token anônimo.
REVOKE ALL ON FUNCTION public.fn_portal_get_contracts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_portal_get_contracts(TEXT) TO anon, authenticated;


-- ═══ 1b. Dados da Unidade (payload interno; as RPCs de entrada não mudam) ═══

CREATE OR REPLACE FUNCTION public.fn_unidade_payload_for_client(p_client_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    WITH negocios AS (
        -- Um contrato pode reunir apartamento + vaga + box (`commercial_deal_units`).
        -- O LEFT JOIN cobre os dois casos: com linhas de unidade, uma por
        -- unidade; sem elas, cai na `property_id` da própria negociação.
        SELECT COALESCE(du.property_id, d.property_id)      AS property_id,
               d.id            AS deal_id,
               d.type,
               d.status,
               d.date,
               d.code,
               d.contract_number,
               d.value         AS deal_value,
               d.installment_value,
               d.end_date,
               d.billing_cycle,
               d.reajuste_index,
               du.value        AS unit_value,
               -- Mesma unidade pode aparecer em duas negociações (alugou, depois
               -- comprou). Fica a mais recente; card duplicado da mesma sala lê
               -- como bug para o cliente.
               ROW_NUMBER() OVER (
                   PARTITION BY COALESCE(du.property_id, d.property_id)
                   ORDER BY d.date DESC NULLS LAST, d.created_at DESC
               ) AS rn
          FROM public.commercial_deals d
          LEFT JOIN public.commercial_deal_units du ON du.deal_id = d.id
         -- O cliente é parte da negociação se é o `client_id` (ponteiro legado)
         -- OU está em `commercial_deal_buyers` — todos os compradores têm o
         -- mesmo peso e cada um vê a unidade no seu portal.
         WHERE (d.client_id = p_client_id
                OR EXISTS (SELECT 1 FROM public.commercial_deal_buyers b
                            WHERE b.deal_id = d.id AND b.client_id = p_client_id))
           AND d.status <> 'CANCELLED'
           AND COALESCE(du.property_id, d.property_id) IS NOT NULL
    )
    SELECT jsonb_build_object(
        'ok', true,
        'unidades', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'propertyId',   p.id,
                'nome',         p.name,
                'tipoImovel',   p.type,
                'finalidade',   p.purpose,

                -- ── Identificação ──
                'empreendimento', e.name,
                'torre',          COALESCE(t.name, p.block),
                'unidade',        COALESCE(u.name, p.name),
                -- ⚠️ `0` é TÉRREO, valor legítimo. NULLIF(floor,0) — o padrão dos
                -- campos vizinhos — faria o térreo virar "—" (aconteceu no Portal
                -- do Corretor, corrigido em 20270826000005).
                'pavimento',      COALESCE(p.floor, u.floor),
                'pavimentoTipo',  COALESCE(u.floor_tipo, p.specs->>'floorTipo'),
                'tipologia',      COALESCE(p.typology, u.typology),
                'posicao',        COALESCE(p.position_type, u.position_type),
                'vista',          COALESCE(p.view_type, u.view_type),
                'orientacaoSolar', COALESCE(p.sun_orientation, u.sun_orientation, p.sun_position),

                -- ── Áreas ──
                'areaPrivativa',  COALESCE(p.private_area, u.private_area),
                'areaComum',      COALESCE(p.common_area,  u.common_area),
                'areaTotal',      COALESCE(p.total_area,   u.total_area, p.area),
                'areaRealNbr',    u.area_real_total_m2,
                'fracaoIdeal',    u.fracao_ideal_decimal,
                'fracaoMilesimos', u.fracao_ideal_thousandths,
                'fracaoFonte',    COALESCE(u.fracao_ideal_fonte, u.fracao_ideal_origem),

                -- ── Características ──
                -- ⚠️ REGRA OPOSTA à do pavimento: aqui o `0` na coluna significa
                -- "o dado está em specs" (é assim que o publish do Espelho grava).
                -- Chaves em camelCase — conferido no banco.
                -- `NULLIF(texto,'')` antes do cast: specs vazio ('') estoura em
                -- `::INT` e derruba a aba inteira, não só o campo.
                'dormitorios', COALESCE(NULLIF(p.bedrooms, 0),       NULLIF(NULLIF(p.specs->>'bedrooms', '')::INT, 0),      u.bedrooms),
                'suites',      COALESCE(NULLIF(NULLIF(p.specs->>'suites', '')::INT, 0), u.suites),
                'banheiros',   COALESCE(NULLIF(p.bathrooms, 0),      NULLIF(NULLIF(p.specs->>'bathrooms', '')::INT, 0),     u.bathrooms),
                'vagas',       COALESCE(NULLIF(p.parking_spaces, 0), NULLIF(NULLIF(p.specs->>'parkingSpaces', '')::INT, 0), u.parking_spaces),
                'caracteristicas', COALESCE(to_jsonb(p.features), '[]'::jsonb),

                -- ── Endereço ──
                'endereco', jsonb_build_object(
                    'logradouro',  p.street,
                    'numero',      p.number,
                    'complemento', p.complement,
                    'bairro',      p.neighborhood,
                    'cidade',      p.city,
                    'uf',          p.state,
                    'cep',         p.zip_code,
                    'livre',       p.address
                ),

                -- ── Registro do imóvel ──
                'matricula',     p.registration_number,
                'cartorio',      p.registry_office,
                'inscricaoIptu', p.iptu_registration,

                -- ── A negociação que dá acesso a esta unidade ──
                -- NÃO entra aqui: comissão de corretor, checklist interno de
                -- documentos, nem dado de outro comprador. Nada disso é do cliente.
                'negociacao', jsonb_build_object(
                    'id',           n.deal_id,
                    'tipo',         n.type,
                    'status',       n.status,
                    'data',         n.date,
                    'codigo',       n.code,
                    'contrato',     n.contract_number,
                    'valorUnidade', COALESCE(n.unit_value, n.deal_value),
                    -- ⚠️ Locação: `value` é o TOTAL do contrato; o mensal é
                    -- `installment_value`. Confundir os dois já custou duas
                    -- rodadas de correção em Locações. Multi-unidade rateia pela
                    -- participação da unidade no total.
                    'aluguelMensal', CASE WHEN n.type = 'RENTAL' THEN
                        COALESCE(n.installment_value, n.deal_value)
                        * CASE WHEN n.unit_value IS NOT NULL AND n.deal_value > 0
                               THEN n.unit_value / n.deal_value ELSE 1 END
                    END,
                    'vigenciaFim',    n.end_date,
                    'periodicidade',  n.billing_cycle,
                    'indiceReajuste', n.reajuste_index
                )
            ) ORDER BY e.name NULLS LAST, t.name NULLS LAST, COALESCE(u.name, p.name))
              FROM negocios n
              JOIN public.commercial_properties p ON p.id = n.property_id
              LEFT JOIN public.empreendimento_units  u ON u.commercial_property_id = p.id
              LEFT JOIN public.empreendimento_towers t ON t.id = u.tower_id
              LEFT JOIN public.empreendimentos       e ON e.id = t.empreendimento_id
             WHERE n.rn = 1), '[]'::jsonb)
    );
$fn$;

-- ⚠️ `REVOKE ... FROM PUBLIC` NÃO BASTA no Supabase: o projeto concede EXECUTE
-- a `anon`/`authenticated` por default privileges, e esse grant é DIRETO ao
-- papel — sobrevive ao revoke de PUBLIC. Sem o revoke nominal abaixo, uma RPC
-- "só para autenticado" fica aberta ao link público, e nada na tela denuncia.
REVOKE ALL ON FUNCTION public.fn_unidade_payload_for_client(UUID) FROM PUBLIC, anon, authenticated;


-- ═══ 2. Modelo .docx — cláusula das partes → "Compradores (todos)" ═══════════
-- Só o modelo ativo da Alpa (e6e620da…); token_map é jsonb {token: {source,
-- field, label}}. Troca só as entradas que ainda apontam para `client`.
UPDATE public.document_templates t
   SET token_map = (
       SELECT jsonb_object_agg(e.key,
           CASE
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'name'
               THEN jsonb_build_object('source','buyers','field','names','label','Nomes ("A, B e C")')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'document'
               THEN jsonb_build_object('source','buyers','field','documents','label','CPFs / CNPJs ("A, B e C")')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'type'
               THEN jsonb_build_object('source','buyers','field','types','label','Tipo (PF/PJ) de cada um')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'address'
               THEN jsonb_build_object('source','buyers','field','address','label','Logradouro(s)')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'address_number'
               THEN jsonb_build_object('source','buyers','field','address_number','label','Número(s)')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'neighborhood'
               THEN jsonb_build_object('source','buyers','field','neighborhood','label','Bairro(s)')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'city'
               THEN jsonb_build_object('source','buyers','field','city','label','Cidade(s)')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'state'
               THEN jsonb_build_object('source','buyers','field','state','label','Estado(s) (UF)')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'zip_code'
               THEN jsonb_build_object('source','buyers','field','zip_code','label','CEP(s)')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'email'
               THEN jsonb_build_object('source','buyers','field','emails','label','E-mails')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'qualificacao'
               THEN jsonb_build_object('source','buyers','field','qualificacao','label','Qualificação de todos (parágrafo)')
             WHEN e.value->>'source' = 'client' AND e.value->>'field' = 'address_full'
               THEN jsonb_build_object('source','buyers','field','address_full','label','Endereço completo de cada um')
             ELSE e.value
           END)
       FROM jsonb_each(t.token_map) e
   ),
   updated_at = NOW()
 WHERE t.id = 'e6e620da-bb1b-4fc4-8b60-8830a83590bd'
   AND EXISTS (SELECT 1 FROM jsonb_each(t.token_map) e WHERE e.value->>'source' = 'client');
