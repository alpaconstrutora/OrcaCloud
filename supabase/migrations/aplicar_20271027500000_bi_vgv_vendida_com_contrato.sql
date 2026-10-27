-- BI: "vendida" = negociação de VENDA em Contrato, Assinatura ou Concluído.
--
-- Decisão do usuário, 27/10/2026 (PR #200, plano
-- docs/planos/2026-10-27-vendas-aba-analise.md): as telas de Venda de Ativos
-- (Análise, cards de Imóveis, Resultados) passaram a contar venda a partir do
-- contrato — em produção nenhuma das 14 negociações estava em Concluído, e o
-- VGV vendido saía R$ 0. Pedido seguinte do usuário: "alinhe o BI à mesma regra".
-- Fonte da regra no front: `saleDealStage` em lib/salesAnalysis.ts.
--
-- O que muda (só a definição das duas views; colunas e tipos iguais, então
-- fn_bi_executive e fn_bi_trend — que leem is_vgv/in_conversao_base — seguem
-- sem alteração):
--   is_vgv            SALE em CONTRATO/ASSINATURA/COMPLETED (era só COMPLETED)
--   is_fechado        venda com contrato, OU outro tipo em COMPLETED (locação
--                     continua fechando só em Concluído — a decisão foi de venda)
--   in_conversao_base SALE vendida ou cancelada — a regra documentada em
--                     __tests__/biConvergence.test.ts; antes misturava locação
--                     no denominador de uma taxa cujo numerador é só venda
--   vw_bi_commercial  mesmas regras; vgv_fechado/ticket_medio só de VENDA (antes
--                     somavam o valor de locações concluídas junto)
--
-- security_invoker = on é REPETIDO de propósito: as views foram trocadas para
-- invoker em 20270903000003 e não podem voltar a definer (RLS por organização).
--
-- Reverter: recriar com as definições do bloco "ANTES" no fim deste arquivo.

CREATE OR REPLACE VIEW public.vw_fact_deal WITH (security_invoker = on) AS
SELECT d.id,
    COALESCE(d.organization_id, cp.organization_id) AS organization_id,
    d.property_id,
    d.client_id,
    d.type,
    d.status,
    d.value,
    d.date AS deal_date,
    d.origin_channel,
    d.type = 'SALE'::text AS is_venda,
    CASE
        WHEN d.type = 'SALE'::text THEN d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text])
        ELSE d.status = 'COMPLETED'::text
    END AS is_fechado,
    d.type = 'SALE'::text AND d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text]) AS is_vgv,
    d.status = 'CANCELLED'::text AS is_cancelado,
    d.type = 'SALE'::text AND d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text, 'CANCELLED'::text]) AS in_conversao_base,
    d.created_at
   FROM commercial_deals d
     LEFT JOIN commercial_properties cp ON cp.id = d.property_id;

CREATE OR REPLACE VIEW public.vw_bi_commercial WITH (security_invoker = on) AS
SELECT COALESCE(cp.organization_id, d.organization_id) AS organization_id,
    count(*) AS total_deals,
    count(*) FILTER (WHERE
        CASE
            WHEN d.type = 'SALE'::text THEN d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text])
            ELSE d.status = 'COMPLETED'::text
        END) AS deals_fechados,
    count(*) FILTER (WHERE d.status = 'IN_NEGOTIATION'::text) AS deals_negociacao,
    count(*) FILTER (WHERE d.status = 'CANCELLED'::text) AS deals_cancelados,
    CASE
        WHEN count(*) FILTER (WHERE d.type = 'SALE'::text AND d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text, 'CANCELLED'::text])) > 0
        THEN round(
            count(*) FILTER (WHERE d.type = 'SALE'::text AND d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text]))::numeric
            / count(*) FILTER (WHERE d.type = 'SALE'::text AND d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text, 'CANCELLED'::text]))::numeric
            * 100::numeric, 1)
        ELSE NULL::numeric
    END AS taxa_conversao_pct,
    COALESCE(sum(d.value) FILTER (WHERE d.type = 'SALE'::text AND d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text])), 0::numeric) AS vgv_fechado,
    COALESCE(avg(d.value) FILTER (WHERE d.type = 'SALE'::text AND d.status = ANY (ARRAY['CONTRATO'::text, 'ASSINATURA'::text, 'COMPLETED'::text])), 0::numeric) AS ticket_medio
   FROM commercial_deals d
     LEFT JOIN commercial_properties cp ON cp.id = d.property_id
  GROUP BY (COALESCE(cp.organization_id, d.organization_id));

-- Fechadas para anon (trava __tests__/viewSecurityGuard.test.ts). No banco já
-- estavam assim antes desta migration (anon sem SELECT, conferido 27/10) — o
-- `CREATE OR REPLACE` preserva os grants; aqui o arquivo declara o estado.
REVOKE ALL ON public.vw_fact_deal FROM anon;
REVOKE ALL ON public.vw_fact_deal FROM PUBLIC;
GRANT SELECT ON public.vw_fact_deal TO authenticated;
REVOKE ALL ON public.vw_bi_commercial FROM anon;
REVOKE ALL ON public.vw_bi_commercial FROM PUBLIC;
GRANT SELECT ON public.vw_bi_commercial TO authenticated;

-- ─── ANTES (lido do banco em 27/10/2026, pg_get_viewdef) ─────────────────────
-- vw_fact_deal:
--   d.status = 'COMPLETED' AS is_fechado,
--   d.type = 'SALE' AND d.status = 'COMPLETED' AS is_vgv,
--   d.status = ANY (ARRAY['COMPLETED','CANCELLED']) AS in_conversao_base,
--   (demais colunas idênticas às de cima)
-- vw_bi_commercial:
--   count(*) FILTER (WHERE d.status = 'COMPLETED') AS deals_fechados,
--   taxa_conversao_pct = COMPLETED ÷ (COMPLETED + CANCELLED), qualquer tipo,
--   COALESCE(sum(d.value) FILTER (WHERE d.status = 'COMPLETED'), 0) AS vgv_fechado,
--   COALESCE(avg(d.value) FILTER (WHERE d.status = 'COMPLETED'), 0) AS ticket_medio
