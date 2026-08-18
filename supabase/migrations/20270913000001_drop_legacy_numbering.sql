-- F5 da Nomenclatura — aposenta o mecanismo antigo de numeração.
--
-- As 5 tabelas de contador com escopo hardcoded (por obra / por unidade) e suas
-- RPCs foram substituídas pelo contador genérico `document_number_counters` +
-- `fn_next_document_seq`, cujo escopo segue a combinação de variáveis da máscara
-- configurada. O saldo delas já foi copiado pelo backfill `20270912000005`, e o
-- motor novo está confirmado em produção (2026-08-18) — nenhuma linha de código
-- referencia mais estes objetos (verificado por grep em todo `services/` e
-- `components/`).
--
-- ⚠️ RODAR BLOCO A BLOCO, NÃO O ARQUIVO INTEIRO.
--
-- Motivo: as tabelas têm FK para `projects` e `empreendimento_units`. Um
-- `DROP TABLE` precisa mexer também na tabela REFERENCIADA para remover a
-- constraint, e `projects` está quente — foi exatamente assim que a v1 da
-- migration `20270913000000` tomou `40P01 deadlock detected`. O
-- `SET lock_timeout` abaixo faz a operação FALHAR RÁPIDO (55P03 lock_not_available)
-- em vez de ficar esperando e deadlockar: se um bloco falhar, espere alguns
-- segundos e rode SÓ ele de novo.
--
-- Nada aqui é urgente ou destrutivo para o app: se um bloco ficar para depois, o
-- sistema continua funcionando — estes objetos já não são lidos por ninguém.
--
-- Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md (F5).

-- ═══ BLOCO 1 — RPCs (não travam tabela nenhuma, sempre seguro) ═════════════
DROP FUNCTION IF EXISTS public.fn_next_purchase_order_seq(UUID);
DROP FUNCTION IF EXISTS public.fn_next_contract_seq(UUID);
DROP FUNCTION IF EXISTS public.fn_next_quotation_seq(UUID);
DROP FUNCTION IF EXISTS public.fn_next_rental_contract_seq(UUID);
DROP FUNCTION IF EXISTS public.fn_next_unit_sale_contract_seq(UUID);
-- Assinaturas antigas (org+ano), substituídas em aplicar_20270905000027 — o
-- DROP é inofensivo se elas já não existirem.
DROP FUNCTION IF EXISTS public.fn_next_rental_contract_seq(UUID, SMALLINT);
DROP FUNCTION IF EXISTS public.fn_next_unit_sale_contract_seq(UUID, SMALLINT);

-- ═══ BLOCO 2 — contador de pedidos (FK -> projects) ════════════════════════
SET lock_timeout = '3s';
DROP TABLE IF EXISTS public.purchase_order_number_counters;

-- ═══ BLOCO 3 — contador de contratos de suprimentos (FK -> projects) ═══════
SET lock_timeout = '3s';
DROP TABLE IF EXISTS public.contract_number_counters;

-- ═══ BLOCO 4 — contador de cotações (FK -> projects) ═══════════════════════
SET lock_timeout = '3s';
DROP TABLE IF EXISTS public.quotation_number_counters;

-- ═══ BLOCO 5 — contadores por unidade (FK -> empreendimento_units) ═════════
SET lock_timeout = '3s';
DROP TABLE IF EXISTS public.rental_contract_number_counters;

SET lock_timeout = '3s';
DROP TABLE IF EXISTS public.unit_sale_contract_number_counters;

-- ═══ NÃO dropadas de propósito: services_proposal_seq / services_contract_seq ══
--
-- As duas sequences do CRM de Serviços ficaram órfãs quando os triggers
-- passaram a usar o motor novo (20270912000004), mas continuam no banco de
-- propósito. Corpo de função plpgsql é texto, não gera dependência formal — o
-- Postgres deixaria dropar mesmo se alguma função ainda chamasse `nextval`
-- delas, e a quebra só apareceria em runtime, na hora em que alguém ganhasse
-- uma oportunidade no funil. Uma sequence parada não custa nada; o risco de
-- errar isso custa. Limpeza que aumenta risco não é limpeza.
