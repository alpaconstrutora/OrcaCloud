-- ════════════════════════════════════════════════════════════════════════════
-- Portal do Cliente — aba "Dados da Unidade"
-- Plano: docs/planos/2026-09-03-portal-cliente-aba-dados-da-unidade.md
--
-- POR QUE: o comprador de um apartamento e o locatário de uma sala não tinham
-- NENHUMA tela no portal com a ficha do próprio imóvel. O Financeiro mostra as
-- parcelas, Contratos mostra o contrato — metragem, fração ideal, pavimento,
-- matrícula e características não apareciam em lugar nenhum.
--
-- ⚠️ A FONTE É `commercial_properties`, NÃO `empreendimento_units`. Conferido no
-- banco em 2026-09-03: os 9 contratos de locação (8 clientes) apontam para
-- imóveis SEM `empreendimento_units.commercial_property_id`. Uma RPC que
-- partisse da unidade de empreendimento devolveria vazio para todos eles — a
-- aba abriria bonita dizendo "nenhuma unidade" a quem tem três. A unidade de
-- empreendimento entra como ENRIQUECIMENTO (fração ideal, área real NBR, torre,
-- nome do empreendimento) quando o vínculo existe.
--
-- ⚠️ DUAS RPCs DE LEITURA, DE PROPÓSITO — mesma razão da aba Condomínio
-- (20270901000001). O Portal do Cliente tem três entradas e só uma usa token.
-- `commercial_deals` e `commercial_properties` têm RLS por `is_org_member`, e o
-- cliente logado NÃO é membro da organização: pela via normal ele receberia
-- zero linhas SEM ERRO. Por isso o caminho autenticado também é SECURITY
-- DEFINER, com a autorização escrita dentro da função.
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>
-- NUNCA `supabase db push` (histórico de migrations furado).
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ BLOCO 1 — o payload, por client_id ═════════════════════════════════════
--
-- Uma função interna monta o JSON; as duas RPCs públicas só decidem QUEM pode
-- pedir. Duplicar o payload em duas funções é como elas divergem depois.

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
         WHERE d.client_id = p_client_id
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
-- Ninguém chama esta direto: quem autoriza são as duas RPCs abaixo. Ela roda
-- como SECURITY DEFINER de dentro delas, sem precisar de grant nenhum.

-- ═══ BLOCO 2 — entrada por LINK PÚBLICO (anon) ══════════════════════════════

CREATE OR REPLACE FUNCTION public.client_portal_get_unidade(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_tok public.client_portal_tokens;
BEGIN
    SELECT * INTO v_tok FROM public.client_portal_tokens
     WHERE token = p_token AND is_active AND expires_at > NOW();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Link inválido ou expirado.');
    END IF;

    UPDATE public.client_portal_tokens SET last_used_at = NOW() WHERE id = v_tok.id;

    RETURN public.fn_unidade_payload_for_client(v_tok.client_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.client_portal_get_unidade(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_portal_get_unidade(TEXT) TO anon, authenticated;

-- ═══ BLOCO 3 — entrada AUTENTICADA (cliente logado, e admin por dentro) ═════
--
-- Este é o bloco que impede o defeito silencioso. NÃO existe caminho por RLS
-- aqui: o cliente logado não é membro da organização, então a RLS de
-- `commercial_deals` devolveria zero linhas sem erro nenhum.

CREATE OR REPLACE FUNCTION public.client_portal_get_unidade_for_client(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_cli public.clients;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Não autenticado.');
    END IF;

    SELECT * INTO v_cli FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Cliente não encontrado.');
    END IF;

    -- Duas autorizações, e só elas:
    --   (a) membro da organização dona do cliente — o admin abrindo o portal;
    --   (b) o próprio cliente logado, casando pelo e-mail do cadastro (mesmo
    --       critério que `useAuthSync` usa para dizer que este usuário É este
    --       cliente).
    -- ⚠️ `is_org_member(NULL)` não pode virar liberação: muitos clients têm
    -- organization_id NULL, e a RLS de `clients` os mostra a qualquer
    -- autenticado. Espelhar a RLS aqui foi o que faltou em `fn_planning_for_client`.
    IF NOT (
        (v_cli.organization_id IS NOT NULL AND public.is_org_member(v_cli.organization_id))
        OR (v_cli.email IS NOT NULL
            AND LOWER(v_cli.email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')))
    ) THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Sem permissão para ver este cadastro.');
    END IF;

    RETURN public.fn_unidade_payload_for_client(p_client_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.client_portal_get_unidade_for_client(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_portal_get_unidade_for_client(UUID) TO authenticated;

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Cole o resultado. Qualquer número fora do esperado = migration não aplicada
-- inteira.

SELECT
    (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'fn_unidade_payload_for_client',
        'client_portal_get_unidade',
        'client_portal_get_unidade_for_client'))                     AS rpcs_novas,          -- 3
    (SELECT has_function_privilege('anon',
        'public.client_portal_get_unidade(text)', 'EXECUTE'))::TEXT  AS anon_le_unidade,      -- true
    (SELECT has_function_privilege('anon',
        'public.client_portal_get_unidade_for_client(uuid)', 'EXECUTE'))::TEXT
                                                                     AS anon_NAO_pode_por_id, -- false
    (SELECT has_function_privilege('anon',
        'public.fn_unidade_payload_for_client(uuid)', 'EXECUTE'))::TEXT
                                                                     AS anon_NAO_pode_interna; -- false
