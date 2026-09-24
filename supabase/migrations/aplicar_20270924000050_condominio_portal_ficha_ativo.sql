-- Portal do Cliente › Condomínio › Equipamentos do prédio: a ficha do bem
--
-- Pedido do usuário em 24/09/2026: "ao clicar em um equipamento trazer os
-- detalhes de cadastro do equipamento" — e, perguntado QUAIS detalhes,
-- respondeu "os dados cadastrados em gestão de ativos < ativos patrimoniais".
--
-- Então o payload de `ativos` passa a carregar os mesmos campos daquele
-- formulário (`components/OpuraAssetsModule.tsx`): subcategoria, nº de série,
-- data e valor de aquisição, vida útil, valor residual, observações e imagem,
-- além dos que já iam. É uma reversão consciente do recorte de 23/09 —
-- registrada aqui para não parecer descuido de quem ler depois.
--
-- REGRA #7, pergunta 2 ("quem mais pode executar esta função?"): a assinatura
-- não muda e o CREATE OR REPLACE preserva a ACL, mas o REVOKE/GRANT vai junto
-- de novo, explícito, porque é o que a trava de `__tests__/segurancaMigrations.test.ts`
-- confere e é o que impede a função de nascer executável por PUBLIC/anon num
-- ambiente novo. A autorização de verdade continua DENTRO da função (ela só
-- devolve o que pertence ao `p_client_id` recebido) e nas duas cascas públicas.

CREATE OR REPLACE FUNCTION public.fn_condominio_payload_for_client(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    WITH minhas AS (
        -- Uma linha por UNIDADE (não por ocupação): a mesma pessoa costuma ser
        -- inquilina E responsável financeira da mesma sala, e o portal não deve
        -- mostrar a sala duas vezes. Os papéis viram lista.
        SELECT u.id AS unit_id, u.name AS unit_name, u.floor, u.private_area,
               u.typology, u.fracao_ideal_decimal, u.fracao_ideal_origem,
               t.name AS tower_name,
               e.id AS empreendimento_id, e.code AS condominio_code,
               e.name AS condominio_name, e.condominio_cnpj,
               ARRAY_AGG(DISTINCT o.role ORDER BY o.role) AS papeis
          FROM public.unit_occupancies o
          JOIN public.empreendimento_units  u ON u.id = o.unit_id
          JOIN public.empreendimento_towers t ON t.id = u.tower_id
          JOIN public.empreendimentos       e ON e.id = t.empreendimento_id
         WHERE o.client_id = p_client_id
           AND o.ended_at IS NULL
           AND e.status = 'EM_OPERACAO'
         GROUP BY u.id, u.name, u.floor, u.private_area, u.typology,
                  u.fracao_ideal_decimal, u.fracao_ideal_origem, t.name,
                  e.id, e.code, e.name, e.condominio_cnpj
    ),
    -- Os condomínios em que esta pessoa ocupa alguma unidade. É o recorte de
    -- TUDO que vem abaixo: prédio onde ela não ocupa nada não aparece.
    predios AS (
        SELECT DISTINCT empreendimento_id FROM minhas
    )
    SELECT jsonb_build_object(
        'ok', true,
        'unidades', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'unitId',        m.unit_id,
                'unidade',       m.unit_name,
                'torre',         m.tower_name,
                'pavimento',     m.floor,
                'tipologia',     m.typology,
                'areaPrivativa', m.private_area,
                'fracaoIdeal',   m.fracao_ideal_decimal,
                'fracaoOrigem',  m.fracao_ideal_origem,
                'papeis',        to_jsonb(m.papeis),
                'condominioId',   m.empreendimento_id,
                'condominioCode', m.condominio_code,
                'condominioNome', m.condominio_name,
                'condominioCnpj', m.condominio_cnpj,
                -- Quem MAIS consta na unidade. Só papel e nome: o portal não é
                -- lugar de expor documento nem contato de terceiro.
                'ocupacoes', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('papel', o2.role, 'nome', c2.name)
                                     ORDER BY o2.role, c2.name)
                      FROM public.unit_occupancies o2
                      JOIN public.clients c2 ON c2.id = o2.client_id
                     WHERE o2.unit_id = m.unit_id AND o2.ended_at IS NULL), '[]'::jsonb)
            ) ORDER BY m.condominio_name, m.tower_name, m.unit_name)
            FROM minhas m), '[]'::jsonb),
        'avisos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', av.id, 'titulo', av.titulo, 'corpo', av.corpo,
                'categoria', av.categoria, 'publicadoEm', av.publicado_em,
                'condominioNome', e2.name,
                'lido', EXISTS (SELECT 1 FROM public.condominio_aviso_leituras l
                                 WHERE l.aviso_id = av.id AND l.client_id = p_client_id))
                ORDER BY av.publicado_em DESC)
              FROM public.condominio_avisos av
              JOIN public.empreendimentos e2 ON e2.id = av.empreendimento_id
             WHERE av.empreendimento_id IN (SELECT empreendimento_id FROM predios)
               AND (av.valido_ate IS NULL OR av.valido_ate >= CURRENT_DATE)), '[]'::jsonb),
        'documentos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', d.id, 'titulo', d.titulo, 'categoria', d.categoria,
                'url', d.url, 'descricao', d.descricao,
                'condominioNome', e3.name)
                ORDER BY d.categoria, d.titulo)
              FROM public.condominio_documentos d
              JOIN public.empreendimentos e3 ON e3.id = d.empreendimento_id
             WHERE d.empreendimento_id IN (SELECT empreendimento_id FROM predios)
               AND d.visivel_portal), '[]'::jsonb),

        -- ── Manutenção: o plano NBR 5674 do prédio ──────────────────────────
        -- Só item ATIVO: item desativado é decisão administrativa revogada, e
        -- mostrá-lo faria o condômino cobrar manutenção que não existe mais.
        'manutencao', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', i.id,
                'descricao', i.description,
                'sistema', bs.name,
                'periodicidadeValor', i.periodicity_value,
                'periodicidadeUnidade', i.periodicity_unit,
                'ultimaExecucao', i.last_executed_at,
                'proximoVencimento', i.next_due_date,
                'responsavel', i.responsible_type,
                'condominioNome', e4.name)
                ORDER BY i.next_due_date NULLS LAST, i.description)
              FROM public.maintenance_plan_items i
              JOIN public.maintenance_plans p ON p.id = i.plan_id
              JOIN public.empreendimentos   e4 ON e4.id = p.empreendimento_id
              LEFT JOIN public.building_systems bs ON bs.id = i.building_system_id
             WHERE p.empreendimento_id IN (SELECT empreendimento_id FROM predios)
               AND p.status = 'VIGENTE'
               AND i.is_active), '[]'::jsonb),

        -- ── Ordens de serviço do prédio ─────────────────────────────────────
        -- `cost` fica FORA: quanto se pagou ao fornecedor é negociação da
        -- administração. O que o condômino precisa é saber que foi feito, o
        -- que se gastou no total ele vê pelo rateio.
        'ordens', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', o.id,
                'codigo', o.code,
                'descricao', o.description,
                'sistema', bs2.name,
                'tipo', o.type,
                'prioridade', o.priority,
                'situacao', o.status,
                'agendadaPara', o.scheduled_date,
                'executadaEm', o.executed_date,
                'condominioNome', e5.name)
                ORDER BY COALESCE(o.executed_date, o.scheduled_date) DESC NULLS LAST)
              FROM public.maintenance_orders o
              JOIN public.empreendimentos e5 ON e5.id = o.empreendimento_id
              LEFT JOIN public.building_systems bs2 ON bs2.id = o.building_system_id
             WHERE o.empreendimento_id IN (SELECT empreendimento_id FROM predios)), '[]'::jsonb),

        -- ── Ativos: os equipamentos do prédio ───────────────────────────────
        -- A FICHA do bem, como ela está em Gestão de Ativos › Ativos
        -- Patrimoniais — decisão do usuário em 24/09/2026, ao pedir "ao clicar
        -- em um equipamento trazer os detalhes de cadastro". Isto REVERTE o
        -- recorte de 23/09, que deixava de fora série, aquisição e valores.
        -- `supplier_id` continua fora: o fornecedor não é campo daquele
        -- cadastro (a garantia dele já vai em `garantiaAte`).
        'ativos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id,
                'nome', a.name,
                'codigo', a.code,
                'categoria', a.category,
                'subcategoria', a.subcategory,
                'marca', a.brand,
                'modelo', a.model,
                'numeroSerie', a.serial_number,
                'situacao', a.status,
                'sistema', bs3.name,
                'dataAquisicao', a.purchase_date,
                'valorAquisicao', a.purchase_value,
                'vidaUtilMeses', a.useful_life_months,
                'valorResidual', a.residual_value,
                'observacoes', a.notes,
                'imagemUrl', a.image_url,
                'garantiaAte', a.supplier_warranty_until,
                'condominioNome', e6.name)
                ORDER BY a.name)
              FROM public.opura_assets a
              JOIN public.empreendimentos e6 ON e6.id = a.empreendimento_id
              LEFT JOIN public.building_systems bs3 ON bs3.id = a.building_system_id
             WHERE a.empreendimento_id IN (SELECT empreendimento_id FROM predios)), '[]'::jsonb),

        -- ── Financeiro: o rateio ────────────────────────────────────────────
        -- COMPLETO, com a cota de todas as unidades — escolha explícita do
        -- usuário (23/09/2026) entre "só a minha", "minha + despesas" e "tudo".
        -- `status` vai junto para a tela rotular rateio em aberto como prévia.
        'rateios', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id,
                'numero', r.number,
                'competencia', r.competencia,
                'tipo', r.tipo,
                'criterio', r.criterio,
                'status', r.status,
                'totalDespesas', r.total_despesas,
                'totalRateado', r.total_rateado,
                'fechadoEm', r.fechado_em,
                'condominioNome', e7.name,
                'despesas', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                               'id', d2.id, 'descricao', d2.descricao, 'valor', d2.valor)
                           ORDER BY d2.valor DESC)
                      FROM public.condominio_rateio_despesas d2
                     WHERE d2.rateio_id = r.id), '[]'::jsonb),
                'cotas', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                               'id', it.id,
                               'unitId', it.unit_id,
                               'unidade', u2.name,
                               'torre', t2.name,
                               'pessoa', c3.name,
                               'peso', it.peso,
                               'valor', it.valor,
                               'ajusteManual', it.ajuste_manual,
                               -- A cota DESTA pessoa, para a tela destacá-la no
                               -- meio das outras sem refazer a conta no cliente.
                               'minha', it.client_id = p_client_id)
                           ORDER BY t2.name, u2.name)
                      FROM public.condominio_rateio_itens it
                      LEFT JOIN public.empreendimento_units  u2 ON u2.id = it.unit_id
                      LEFT JOIN public.empreendimento_towers t2 ON t2.id = u2.tower_id
                      LEFT JOIN public.clients c3 ON c3.id = it.client_id
                     WHERE it.rateio_id = r.id), '[]'::jsonb))
                ORDER BY r.competencia DESC, r.number DESC)
              FROM public.condominio_rateios r
              JOIN public.empreendimentos e7 ON e7.id = r.empreendimento_id
             WHERE r.empreendimento_id IN (SELECT empreendimento_id FROM predios)
               -- CANCELADO fica de fora: o vocabulário é RASCUNHO | FECHADO |
               -- CANCELADO, e cancelado não é "em aberto" — é decisão desfeita.
               -- Na base de 23/09/2026 são 4 dos 5 rateios; sem este corte o
               -- condômino veria cobrança que a administração já anulou.
               AND r.status <> 'CANCELADO'), '[]'::jsonb)
    );
$$;

-- REGRA OBRIGATÓRIA #7, pergunta 2. `CREATE OR REPLACE` preserva a ACL que a
-- migration original já tinha deixado (só postgres e service_role), então no
-- banco de hoje isto é redundante — mas num banco NOVO o CREATE nasceria com
-- EXECUTE para PUBLIC, porque é o default do PostgreSQL e o REPLACE não muda
-- isso. A trava de `__tests__/segurancaMigrations.test.ts` exige o REVOKE
-- literal no arquivo justamente para a migration ser correta sozinha.

REVOKE EXECUTE ON FUNCTION public.fn_condominio_payload_for_client(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_condominio_payload_for_client(uuid) IS
    'Payload da aba Condomínio do Portal do Cliente: unidades, avisos, documentos, plano de manutenção, ordens, ativos e rateios. Chamada pelas duas RPCs de portal (token e client_id).';
