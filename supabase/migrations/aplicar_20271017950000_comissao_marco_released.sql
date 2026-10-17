-- ============================================================================
-- Comissão do corretor — cada MARCO diz se está LIBERADO (17/10/2026)
--
-- Plano: docs/planos/2026-10-17-parceiro-financeiro-visual-corretor.md (2º pedido)
--
-- As Comissões do Portal do Corretor passam a ser uma tabela de parcelas no
-- desenho do Financeiro do Portal do Parceiro, com status por linha
-- (Pendente / Liberada / Paga). O marco trazia só `paid`; "liberada" existia
-- apenas dentro do texto do `name`. Única mudança: `milestones[].released`,
-- com a MESMA regra do `liberado` agregado (pago, ou aluguel recebido na
-- locação, ou título aprovado na venda). Nada mais muda.
--
-- Reescrita a partir do ARQUIVO vigente (20271017600000_comissao_locacao_por_parcela,
-- conferido contra pg_get_functiondef em 17/10/2026: só formatação difere).
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_broker_comissoes_lista(p_orgs uuid[], p_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH negocio AS (
    SELECT d.*, lower(trim(bp.email)) AS corretor_email, (d.type = 'RENTAL') AS por_parcela
      FROM public.commercial_deals d
      JOIN public.broker_profiles bp ON bp.id = d.broker_id
     WHERE d.organization_id = ANY (p_orgs)
       AND (NULLIF(trim(p_email), '') IS NULL OR lower(trim(bp.email)) = lower(trim(p_email)))
       AND (
            (d.status IS DISTINCT FROM 'CANCELLED'
             AND CASE WHEN d.type = 'RENTAL' THEN COALESCE(d.broker_commission_pct, 0) > 0
                      ELSE COALESCE(d.broker_commission_value, 0) > 0 END)
            -- distrato: comissão de aluguel já recebido continua devida
         OR EXISTS (SELECT 1 FROM public.internal_transactions it
                     WHERE it.reference_id LIKE 'brk-%'
                       AND substring(it.reference_id from 5 for 36) = d.id::text
                       AND it.status <> 'CANCELLED')
       )
),
titulo_base AS (
    SELECT n.id AS deal_id, n.por_parcela,
           it.amount, it.status, it.approval_status, it.due_date, it.payment_date,
           (it.status = 'CONCILIATED') AS pago,
           COALESCE(par.status = 'CONCILIATED' OR par.business_status = 'RECEBIDO', false) AS recebida,
           row_number() OVER (PARTITION BY n.id ORDER BY it.due_date, it.reference_id) AS n_parcela,
           count(*)     OVER (PARTITION BY n.id) AS total_parcelas
      FROM negocio n
      JOIN public.internal_transactions it
        ON it.reference_id LIKE 'brk-%'
       AND substring(it.reference_id from 5 for 36) = n.id::text
       AND it.status <> 'CANCELLED'
       AND it.direction = 'DEBIT'
       -- venda: só o título único; locação: só os por parcela
       AND (CASE WHEN n.por_parcela THEN length(it.reference_id) > 40 ELSE length(it.reference_id) = 40 END)
      LEFT JOIN public.internal_transactions par
        ON n.por_parcela
       AND par.organization_id = it.organization_id
       AND par.reference_id = substring(it.reference_id from 42)
       AND par.direction = 'CREDIT'
),
titulo AS (
    SELECT tb.*,
           min(tb.n_parcela) FILTER (WHERE tb.due_date >= current_date)
               OVER (PARTITION BY tb.deal_id) AS primeira_futura
      FROM titulo_base tb
),
soma AS (
    SELECT t.deal_id,
           sum(t.amount) AS previsto,
           sum(t.amount) FILTER (WHERE t.pago) AS pago,
           sum(t.amount) FILTER (WHERE t.pago
                                    OR (t.por_parcela AND t.recebida)
                                    OR (NOT t.por_parcela AND t.approval_status = 'APROVADO')) AS liberado,
           max(t.total_parcelas) AS parcelas,
           jsonb_agg(jsonb_build_object(
               'name', CASE
                   WHEN t.por_parcela THEN
                       'Parcela ' || t.n_parcela || '/' || t.total_parcelas || ' — ' ||
                       CASE WHEN t.pago     THEN 'comissão paga'
                            WHEN t.recebida THEN 'aluguel recebido — liberada'
                            ELSE 'aluguel a receber' END
                   WHEN t.pago                         THEN 'Pago'
                   WHEN t.approval_status = 'APROVADO' THEN 'Liberado para pagamento'
                   ELSE 'Lançado no Contas a Pagar (aguardando aprovação)'
               END,
               'value', t.amount,
               'date',  COALESCE(CASE WHEN t.pago THEN t.payment_date END, t.due_date),
               'paid',  t.pago,
               -- mesma regra do `liberado` da soma acima, por marco: a tela não
               -- precisa adivinhar "liberada" pelo texto do nome.
               'released', (t.pago
                            OR (t.por_parcela AND t.recebida)
                            OR (NOT t.por_parcela AND t.approval_status = 'APROVADO'))
           ) ORDER BY t.due_date, t.n_parcela)
           -- locação: só o que interessa agora — liberadas/vencidas não pagas
           -- e as próximas 12 (o total vai em parcelas_total).
           FILTER (WHERE NOT t.por_parcela
                      OR (NOT t.pago AND (t.recebida OR t.due_date < current_date))
                      OR (t.due_date >= current_date AND t.n_parcela <= t.primeira_futura + 11)) AS marcos
      FROM titulo t
     GROUP BY t.deal_id
),
unidade AS (
    SELECT n.id AS deal_id,
           string_agg(p.name, ', ' ORDER BY du.is_primary DESC NULLS LAST, p.name) AS nomes,
           min(COALESCE(pai.name, p.block)) AS bloco
      FROM negocio n
      JOIN public.commercial_deal_units du ON du.deal_id = n.id
      JOIN public.commercial_properties p ON p.id = du.property_id
      LEFT JOIN public.commercial_properties pai ON pai.id = p.parent_id
     GROUP BY n.id
)
SELECT COALESCE(jsonb_agg(linha ORDER BY (linha->>'created_at') DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
        'id',                   n.id,
        'organization_id',      n.organization_id,
        'proposal_id',          NULL,
        'broker_email',         n.corretor_email,
        'deal_type',            n.type,
        'commission_base',      CASE WHEN n.por_parcela THEN 'PARCELA' ELSE 'TOTAL' END,
        'parcelas_total',       COALESCE(s.parcelas, 0),
        'contract_number',      COALESCE(
                                    (SELECT c.number FROM public.contracts c
                                      WHERE c.deal_id = n.id ORDER BY c.created_at LIMIT 1),
                                    NULLIF(trim(n.contract_number), ''),
                                    NULLIF(trim(n.code), '')),
        'unit_number',          COALESCE(u.nomes, prop.name),
        'block',                COALESCE(u.bloco, pai.name, prop.block),
        'buyer_name',           cli.name,
        'sale_value',           n.value,
        'commission_pct',       COALESCE(n.broker_commission_pct, 0),
        'commission_predicted', x.previsto,
        'commission_released',  COALESCE(s.liberado, 0),
        'commission_paid',      COALESCE(s.pago, 0),
        'status',               CASE
                                  WHEN x.previsto > 0 AND COALESCE(s.pago, 0) >= x.previsto THEN 'PAGA'
                                  WHEN COALESCE(s.pago, 0) > 0                              THEN 'PARCIAL'
                                  WHEN COALESCE(s.liberado, 0) > 0                          THEN 'LIBERADA'
                                  ELSE 'PENDENTE'
                                END,
        'milestones',           COALESCE(s.marcos, jsonb_build_array(jsonb_build_object(
                                    'name',  CASE WHEN n.por_parcela
                                                  THEN 'Prevista por parcela — as parcelas do aluguel ainda não foram geradas'
                                                  ELSE 'Prevista — ainda sem título no Contas a Pagar' END,
                                    'value', x.previsto,
                                    'date',  NULL,
                                    'paid',  false,
                                    'released', false))),
        'created_at',           COALESCE(n.date::timestamptz, n.created_at),
        'updated_at',           n.created_at
    ) AS linha
      FROM negocio n
      LEFT JOIN soma    s   ON s.deal_id = n.id
      LEFT JOIN unidade u   ON u.deal_id = n.id
      LEFT JOIN public.commercial_properties prop ON prop.id = n.property_id
      LEFT JOIN public.commercial_properties pai  ON pai.id  = prop.parent_id
      LEFT JOIN public.clients cli ON cli.id = n.client_id
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN s.previsto IS NOT NULL AND n.por_parcela THEN s.previsto
                 -- locação sem parcelas geradas: estimativa de UMA parcela
                 WHEN n.por_parcela THEN round(COALESCE(NULLIF(n.installment_value, 0), n.value, 0)
                                               * COALESCE(n.broker_commission_pct, 0) / 100, 2)
                 ELSE n.broker_commission_value
               END AS previsto
      ) x
  ) y;
$$;

-- REGRA #7: o núcleo não é chamável direto — só pelas cascas.
REVOKE EXECUTE ON FUNCTION public.fn_broker_comissoes_lista(uuid[], text) FROM PUBLIC, anon, authenticated;
