-- ============================================================================
-- Avisos automáticos pedidos em 03/09/2026 (ver docs/planos/2026-09-03-*)
-- ============================================================================
--
--   1. Novo recibo de pagamento disponível  → fn_notif_recibo_disponivel()
--   2. Data de pagamento próxima            → fn_notif_pagamento_proximo(N)
--   3. Atraso de pagamento                  → fn_notif_pagamento_atraso()
--   4. Vencimento do contrato próximo       → generate_rental_renewal_alerts()
--                                             (já existia, aqui é ESTENDIDA)
--   5. Data de reajuste próxima             → fn_notif_contrato_reajuste(N)
--
-- Template: `20270827000003_rental_renewal_cron.sql` — SECURITY DEFINER com
-- `SET search_path`, loop por `organization_members` da org do registro, e
-- dedup manual por `link` (a tabela não tem chave única).
--
-- ── Duas decisões que valem para as quatro funções ──────────────────────────
--
-- **`COALESCE(business_status,'PREVISTO')` é obrigatório.** A coluna é NULL em
-- ~1.000 das 2.299 linhas de `internal_transactions` (tudo que veio de sync).
-- Sem o COALESCE, `business_status NOT IN (...)` é NULL — nunca verdadeiro — e
-- essas linhas jamais entrariam no filtro. É exatamente o bug que a migration
-- `20270819000002` corrigiu na `vw_receivables`.
--
-- **Não lemos `vw_receivables`, replicamos a regra dela.** A view é
-- `security_invoker = on` (`20270909000000:140`); dentro de uma função
-- SECURITY DEFINER ela passaria a aplicar a RLS do owner, não a do chamador —
-- resultado imprevisível. Aqui a fonte é sempre a tabela base.
--
-- ── Sobre o `link` ──────────────────────────────────────────────────────────
--
-- `App.tsx:469` (`handleNavigate`) usa só a parte antes do `?` para escolher a
-- view; a query string é ignorada. Aproveitamos isso para pendurar o id do
-- registro (e, no atraso, o marco de dias) no link — é o que dá ao dedup uma
-- chave por registro sem afetar a navegação.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 0. Moeda em pt-BR
-- ════════════════════════════════════════════════════════════════════════════
--
-- `lc_numeric` do banco é `en_US.UTF-8`, então os marcadores `G` e `D` de
-- `to_char` produzem "1,234,567.50" — separadores invertidos para o Brasil.
-- Medido em 03/09/2026; é a razão de a primeira versão destes avisos ter saído
-- com "R$ 561.25" no texto.
--
-- Trocar a locale do cluster afetaria todo o banco, e `SET lc_numeric` por
-- função depende de a locale estar instalada no host. A saída determinística é
-- formatar no padrão americano e trocar os separadores por posição.
--
-- O mesmo defeito existe nos avisos antigos (`generate_rental_renewal_alerts`,
-- `fn_vencimento_alerts`), que usam `to_char` cru — não corrigidos aqui por
-- estarem fora do escopo do pedido, mas o helper fica disponível para quando
-- forem tocados.
CREATE OR REPLACE FUNCTION public.fn_brl(p_valor NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT 'R$ ' || translate(
        to_char(COALESCE(p_valor, 0), 'FM999G999G999G990D00'),
        ',.', '.,'
    );
$$;

COMMENT ON FUNCTION public.fn_brl IS
    'Formata valor em Real no padrão pt-BR (1.234.567,89). Necessário porque lc_numeric do cluster é en_US.';

REVOKE EXECUTE ON FUNCTION public.fn_brl(NUMERIC) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_brl(NUMERIC) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. Recibo de pagamento disponível
-- ════════════════════════════════════════════════════════════════════════════
--
-- Não existe recibo persistido: `exportService.generateReceiptPDF`
-- (services/exportService.ts:566) monta o PDF com jsPDF e faz `doc.save()` no
-- navegador — nada vai para o banco nem para o Storage. Então o fato que o
-- aviso anuncia é a BAIXA, momento a partir do qual o recibo pode ser emitido.
--
-- Só `CREDIT`: recibo é o comprovante que NÓS emitimos de algo que recebemos
-- ("Recebemos de {cliente}…", exportService.ts:603). No pagável, quem emite o
-- recibo é o fornecedor.
--
-- `payment_date` é preenchido pelo trigger `trg_payment_date_na_baixa`
-- (`20270909000002`) quando o lançamento vira CONCILIATED / PAGO / RECEBIDO.
-- A janela é de 2 dias (`>= CURRENT_DATE - 1`) para não perder baixa feita
-- depois do horário do cron; o dedup por link cobre a sobreposição.
CREATE OR REPLACE FUNCTION public.fn_notif_recibo_disponivel()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx      RECORD;
    v_member  RECORD;
    v_created INTEGER := 0;
    v_link    TEXT;
    v_valor   TEXT;
BEGIN
    FOR v_tx IN
        SELECT t.id, t.organization_id, t.amount, t.payment_date,
               COALESCE(t.party_name, t.entity_name, 'Cliente') AS pagador,
               COALESCE(t.description, t.category, 'Parcela')   AS descricao
          FROM public.internal_transactions t
         WHERE t.direction     = 'CREDIT'
           AND t.payment_date IS NOT NULL
           AND t.payment_date >= CURRENT_DATE - 1
           AND (t.status = 'CONCILIATED'
                OR COALESCE(t.business_status, 'PREVISTO') IN ('PAGO', 'RECEBIDO'))
           AND t.organization_id IS NOT NULL
    LOOP
        v_link  := '/contas-a-receber?tx=' || v_tx.id;
        v_valor := public.fn_brl(v_tx.amount);

        FOR v_member IN
            SELECT m.email
              FROM public.organization_members m
             WHERE m.organization_id = v_tx.organization_id
               AND m.email IS NOT NULL
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.notifications n
                 WHERE n.recipient_email = v_member.email
                   AND n.link            = v_link
                   AND n.created_at      > now() - INTERVAL '7 days'
            ) THEN
                INSERT INTO public.notifications
                    (recipient_email, title, message, link, type, organization_id)
                VALUES (
                    v_member.email,
                    'Novo recibo de pagamento disponível',
                    'Pagamento de ' || v_valor || ' recebido de ' || v_tx.pagador
                        || ' em ' || to_char(v_tx.payment_date, 'DD/MM/YYYY')
                        || ' (' || v_tx.descricao || '). '
                        || 'Abra Contas a Receber para emitir o recibo.',
                    v_link,
                    'pagamento_recibo',
                    v_tx.organization_id
                );
                v_created := v_created + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $$;

COMMENT ON FUNCTION public.fn_notif_recibo_disponivel IS
    'Avisa que o recibo de um recebimento baixado nas últimas 48h pode ser emitido. '
    'Só CREDIT (recibo é o comprovante que a organização emite). Dedup por link, 7 dias.';

REVOKE EXECUTE ON FUNCTION public.fn_notif_recibo_disponivel() FROM PUBLIC, anon;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Data de pagamento próxima
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cobre CREDIT e DEBIT (decisão do usuário em 03/09/2026).
--
-- ⚠️ Já existe `generate_payment_tasks(3)` (job `daily-payment-tasks`, 07h UTC)
-- criando uma TAREFA — não notificação — para DEBIT vencendo em 3 dias. A
-- partir daqui o mesmo vencimento gera tarefa E notificação. É o comportamento
-- pedido, não duplicação acidental: a tarefa é trabalho a fazer, a notificação
-- é o aviso na caixa. Registrado aqui para não ser "corrigido" por engano.
--
-- Dispara no dia exato (`due_date = CURRENT_DATE + N`), não numa janela, para
-- que cada lançamento gere um aviso só.
CREATE OR REPLACE FUNCTION public.fn_notif_pagamento_proximo(p_days_ahead INTEGER DEFAULT 3)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx      RECORD;
    v_member  RECORD;
    v_created INTEGER := 0;
    v_link    TEXT;
    v_valor   TEXT;
    v_receber BOOLEAN;
BEGIN
    FOR v_tx IN
        SELECT t.id, t.organization_id, t.amount, t.due_date, t.direction,
               COALESCE(t.party_name, t.entity_name)          AS parte,
               COALESCE(t.description, t.category, 'Parcela') AS descricao
          FROM public.internal_transactions t
         WHERE t.status   = 'PENDING'
           AND t.due_date = CURRENT_DATE + p_days_ahead
           AND COALESCE(t.business_status, 'PREVISTO')
               NOT IN ('PAGO', 'RECEBIDO', 'CANCELADO', 'RENEGOCIADO')
           AND t.organization_id IS NOT NULL
    LOOP
        v_receber := v_tx.direction = 'CREDIT';
        v_link    := CASE WHEN v_receber THEN '/contas-a-receber?tx=' ELSE '/contas-a-pagar?tx=' END || v_tx.id;
        v_valor   := public.fn_brl(v_tx.amount);

        FOR v_member IN
            SELECT m.email
              FROM public.organization_members m
             WHERE m.organization_id = v_tx.organization_id
               AND m.email IS NOT NULL
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.notifications n
                 WHERE n.recipient_email = v_member.email
                   AND n.link            = v_link
                   AND n.created_at      > now() - INTERVAL '7 days'
            ) THEN
                INSERT INTO public.notifications
                    (recipient_email, title, message, link, type, organization_id)
                VALUES (
                    v_member.email,
                    CASE WHEN v_receber
                         THEN 'Recebimento previsto em ' || p_days_ahead || ' dia(s)'
                         ELSE 'Pagamento vence em ' || p_days_ahead || ' dia(s)' END,
                    v_tx.descricao
                        || COALESCE(' — ' || v_tx.parte, '')
                        || ': ' || v_valor
                        || CASE WHEN v_receber THEN ' a receber em ' ELSE ' a pagar em ' END
                        || to_char(v_tx.due_date, 'DD/MM/YYYY') || '.',
                    v_link,
                    'pagamento_proximo',
                    v_tx.organization_id
                );
                v_created := v_created + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $$;

COMMENT ON FUNCTION public.fn_notif_pagamento_proximo IS
    'Avisa lançamentos (CREDIT e DEBIT) que vencem exatamente em N dias. '
    'Convive de propósito com generate_payment_tasks, que cria TAREFA para o mesmo fato.';

REVOKE EXECUTE ON FUNCTION public.fn_notif_pagamento_proximo(INTEGER) FROM PUBLIC, anon;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. Atraso de pagamento
-- ════════════════════════════════════════════════════════════════════════════
--
-- Não existe status `overdue` gravado — atraso é derivado. A regra canônica é
-- o CASE de `vw_receivables` (`20270909000000:140-176`), replicado aqui sobre
-- a tabela base pelo motivo explicado no cabeçalho.
--
-- **Marcos, não varredura diária.** Avisar todo dia sobre a mesma parcela
-- vencida transforma a caixa em ruído e o usuário para de ler — que é o modo
-- de falha que mata um sistema de notificação. Os marcos 3/7/15/30 dão a
-- escalada sem repetir. O marco entra no `link`, então cada um é uma
-- notificação distinta para o dedup.
CREATE OR REPLACE FUNCTION public.fn_notif_pagamento_atraso()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx      RECORD;
    v_member  RECORD;
    v_created INTEGER := 0;
    v_link    TEXT;
    v_valor   TEXT;
    v_receber BOOLEAN;
    v_dias    INTEGER;
BEGIN
    FOR v_tx IN
        SELECT t.id, t.organization_id, t.amount, t.due_date, t.direction,
               COALESCE(t.party_name, t.entity_name)          AS parte,
               COALESCE(t.description, t.category, 'Parcela') AS descricao,
               (CURRENT_DATE - t.due_date)                    AS dias_atraso
          FROM public.internal_transactions t
         WHERE t.status    = 'PENDING'
           AND t.due_date IS NOT NULL
           AND COALESCE(t.business_status, 'PREVISTO')
               NOT IN ('PAGO', 'RECEBIDO', 'CANCELADO', 'RENEGOCIADO')
           AND (CURRENT_DATE - t.due_date) IN (3, 7, 15, 30)
           AND t.organization_id IS NOT NULL
    LOOP
        v_dias    := v_tx.dias_atraso;
        v_receber := v_tx.direction = 'CREDIT';
        v_link    := CASE WHEN v_receber THEN '/contas-a-receber?tx=' ELSE '/contas-a-pagar?tx=' END
                     || v_tx.id || '&atraso=' || v_dias;
        v_valor   := public.fn_brl(v_tx.amount);

        FOR v_member IN
            SELECT m.email
              FROM public.organization_members m
             WHERE m.organization_id = v_tx.organization_id
               AND m.email IS NOT NULL
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.notifications n
                 WHERE n.recipient_email = v_member.email
                   AND n.link            = v_link
                   AND n.created_at      > now() - INTERVAL '7 days'
            ) THEN
                INSERT INTO public.notifications
                    (recipient_email, title, message, link, type, organization_id)
                VALUES (
                    v_member.email,
                    CASE WHEN v_receber
                         THEN 'Recebimento em atraso há ' || v_dias || ' dias'
                         ELSE 'Pagamento em atraso há ' || v_dias || ' dias' END,
                    v_tx.descricao
                        || COALESCE(' — ' || v_tx.parte, '')
                        || ': ' || v_valor
                        || ', vencido em ' || to_char(v_tx.due_date, 'DD/MM/YYYY') || '.',
                    v_link,
                    'pagamento_atraso',
                    v_tx.organization_id
                );
                v_created := v_created + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $$;

COMMENT ON FUNCTION public.fn_notif_pagamento_atraso IS
    'Avisa atraso nos marcos de 3, 7, 15 e 30 dias (não diariamente, para não virar ruído). '
    'Replica o CASE de vw_receivables sobre a tabela base — a view é security_invoker.';

REVOKE EXECUTE ON FUNCTION public.fn_notif_pagamento_atraso() FROM PUBLIC, anon;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. Data de reajuste próxima
-- ════════════════════════════════════════════════════════════════════════════
--
-- `contracts.reajuste_proximo` existe desde `20261102000003`, e o COMMENT dela
-- já dizia "pode ser verificada por scheduler mensal" — o scheduler nunca foi
-- escrito. Esta é ele.
--
-- ⚠️ **A janela olha para trás, e isso não é detalhe.** Medido em 03/09/2026:
-- dos 8 contratos de LOCAÇÃO com a coluna preenchida, 6 têm `reajuste_proximo`
-- NO PASSADO (2017-09, 2021-05, 2023-03, 2025-05, 2025-08, 2026-08) —
-- reajustes devidos e nunca aplicados. Um filtro `BETWEEN hoje AND hoje+30`
-- não dispararia em nenhum deles, ou seja, ficaria calado exatamente nos casos
-- mais urgentes. Mesmo raciocínio do `end_date >= v_today - 30` do cron de
-- renovação.
--
-- Como a janela é larga, o dedup é de **30 dias**: um lembrete mensal por
-- contrato enquanto o reajuste seguir pendente, em vez de um por dia.
CREATE OR REPLACE FUNCTION public.fn_notif_contrato_reajuste(p_days_ahead INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_c       RECORD;
    v_member  RECORD;
    v_created INTEGER := 0;
    v_link    TEXT;
    v_dias    INTEGER;
    v_quando  TEXT;
BEGIN
    FOR v_c IN
        SELECT c.id, c.number, c.title, c.reajuste_proximo, c.reajuste_index,
               c.current_value, c.organization_id
          FROM public.contracts c
         WHERE c.status = 'Ativo'
           AND c.reajuste_proximo IS NOT NULL
           AND c.reajuste_proximo >= CURRENT_DATE - 90
           AND c.reajuste_proximo <= CURRENT_DATE + p_days_ahead
           AND c.organization_id IS NOT NULL
           -- Contrato já sucedido por uma renovação não precisa de reajuste:
           -- o valor novo vive no filho (mesma lógica do cron de renovação).
           AND NOT EXISTS (
               SELECT 1 FROM public.contracts f WHERE f.parent_contract_id = c.id
           )
    LOOP
        v_dias   := v_c.reajuste_proximo - CURRENT_DATE;
        v_quando := CASE WHEN v_dias < 0
                         THEN 'venceu há ' || abs(v_dias) || ' dia(s)'
                         ELSE 'vence em '  || v_dias || ' dia(s)' END;
        v_link   := '/contracts-reajuste?contract=' || v_c.id;

        FOR v_member IN
            SELECT m.email
              FROM public.organization_members m
             WHERE m.organization_id = v_c.organization_id
               AND m.email IS NOT NULL
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.notifications n
                 WHERE n.recipient_email = v_member.email
                   AND n.link            = v_link
                   AND n.created_at      > now() - INTERVAL '30 days'
            ) THEN
                INSERT INTO public.notifications
                    (recipient_email, title, message, link, type, organization_id)
                VALUES (
                    v_member.email,
                    'Reajuste do contrato ' || v_c.number || ' ' || v_quando,
                    COALESCE(v_c.title, 'Contrato')
                        || ' — reajuste previsto para '
                        || to_char(v_c.reajuste_proximo, 'DD/MM/YYYY')
                        || COALESCE(' pelo índice ' || v_c.reajuste_index, '')
                        || COALESCE('. Valor atual: ' || public.fn_brl(v_c.current_value), '')
                        || '. Abra Contratos > Reajustes para aplicar.',
                    v_link,
                    'contrato_reajuste',
                    v_c.organization_id
                );
                v_created := v_created + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $$;

COMMENT ON FUNCTION public.fn_notif_contrato_reajuste IS
    'Lembrete mensal de reajuste contratual pendente. A janela inclui 90 dias de ATRASO — '
    'a maioria dos reajustes do banco está vencida, e olhar só para frente ficaria calado neles. '
    'Espelha a condição de contractIndexService.listDueForReajuste.';

REVOKE EXECUTE ON FUNCTION public.fn_notif_contrato_reajuste(INTEGER) FROM PUBLIC, anon;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. Vencimento de contrato — ESTENDER o alerta existente a todos os domínios
-- ════════════════════════════════════════════════════════════════════════════
--
-- `generate_rental_renewal_alerts` (20270827000003) já roda em produção pelo
-- job `daily-rental-renewal-alerts`, mas só alertava `domain = 'LOCACAO'` com
-- `is_recurring = true`. Ficavam de fora, sem aviso nenhum, 20 contratos de
-- SUPRIMENTOS com `end_date`, mais SERVIÇOS e VENDAS.
--
-- O que muda: caem os dois filtros de domínio; entram `type`, `link` e módulo
-- da tarefa por domínio. O que NÃO muda (e é deliberado): `end_date >=
-- v_today - 30`, porque contrato que passou do fim sem renovar é o caso MAIS
-- urgente, não o menos; e o `NOT EXISTS` do contrato-filho.
--
-- `type` continua `rental_renewal` em LOCAÇÃO: reclassificar mudaria a
-- categoria das notificações já emitidas sem ganho nenhum.
CREATE OR REPLACE FUNCTION public.generate_rental_renewal_alerts(p_days_ahead INTEGER DEFAULT 60)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today   DATE    := CURRENT_DATE;
    v_c       RECORD;
    v_member  RECORD;
    v_created INTEGER := 0;
    v_days    INTEGER;
    v_label   TEXT;
    v_link    TEXT;
    v_view    TEXT;
    v_type    TEXT;
    v_module  TEXT;
    v_locacao BOOLEAN;
BEGIN
    FOR v_c IN
        SELECT c.id, c.number, c.title, c.end_date, c.organization_id, c.domain
        FROM public.contracts c
        WHERE c.status    IN ('Ativo', 'Assinado')
          AND c.end_date  IS NOT NULL
          -- Inclui os vencidos há pouco: contrato que passou do fim sem renovar
          -- é o caso MAIS urgente, não pode sumir do alerta.
          AND c.end_date  >= v_today - 30
          AND c.end_date  <= v_today + COALESCE(c.renewal_notice_days, p_days_ahead)
          AND NOT EXISTS (
              SELECT 1 FROM public.contracts f WHERE f.parent_contract_id = c.id
          )
    LOOP
        v_locacao := v_c.domain = 'LOCACAO';
        v_days    := v_c.end_date - v_today;
        v_label   := CASE WHEN v_days < 0
                          THEN 'venceu há ' || abs(v_days) || ' dia(s)'
                          ELSE 'vence em ' || v_days || ' dia(s)' END;

        v_view := CASE v_c.domain
                       WHEN 'LOCACAO'     THEN 'rentals'
                       WHEN 'SERVICOS'    THEN 'service-contracts'
                       WHEN 'SUPRIMENTOS' THEN 'supplies-contracts'
                       ELSE 'rentals'
                  END;
        -- O sufixo `?tab=…` é ignorado por handleNavigate (App.tsx:469) fora do
        -- portal do fornecedor; ele existe aqui só para dar ao dedup uma chave
        -- por contrato. Mantido idêntico ao formato anterior em LOCAÇÃO para
        -- não re-alertar contratos que já receberam aviso nos últimos 7 dias.
        v_link := CASE WHEN v_locacao
                       THEN '/rentals?tab=renewals&contract=' || v_c.id
                       ELSE '/' || v_view || '?contract=' || v_c.id END;

        v_type   := CASE WHEN v_locacao THEN 'rental_renewal' ELSE 'contrato_vencimento' END;
        v_module := CASE v_c.domain
                         WHEN 'SUPRIMENTOS' THEN 'suprimentos'
                         WHEN 'SERVICOS'    THEN 'servicos'
                         ELSE 'comercial'
                    END;

        FOR v_member IN
            SELECT om.user_id, om.email
            FROM public.organization_members om
            WHERE om.organization_id = v_c.organization_id
        LOOP
            -- ⚠️ O EXISTS em `auth.users` não é paranoia: há 1 linha em
            -- `organization_members` com `user_id` de uma conta que não existe
            -- mais (medido em 03/09/2026). `tasks_user_id_fkey` aponta para
            -- `auth.users`, então `create_task` levanta 23503 nesse membro — e,
            -- por ser erro e não aviso, aborta a função INTEIRA, deixando sem
            -- alerta todos os contratos ainda não percorridos. O membro órfão
            -- segue recebendo a notificação abaixo (que só depende do e-mail);
            -- o que ele não ganha é a tarefa, que exige uma conta real.
            IF v_member.user_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM auth.users u WHERE u.id = v_member.user_id
            ) THEN
                PERFORM public.create_task(
                    p_user_id       := v_member.user_id,
                    p_org_id        := v_c.organization_id,
                    p_title         := CASE WHEN v_locacao
                                            THEN 'Renovar locação: ' || v_c.number
                                            ELSE 'Renovar contrato: ' || v_c.number END,
                    p_due           := (v_c.end_date::TEXT || 'T12:00:00Z')::TIMESTAMPTZ,
                    p_source_module := v_module,
                    p_source_ref    := jsonb_build_object(
                                           'type',  'contract_renewal',
                                           'id',    v_c.id,
                                           'route', v_view
                                       ),
                    -- ⚠️ `::SMALLINT` é obrigatório. `create_task` declara
                    -- `p_priority SMALLINT` e o CASE devolve INTEGER; a
                    -- conversão integer→smallint é de ATRIBUIÇÃO, não
                    -- implícita, então a resolução por nome falha com 42883.
                    -- O bug estava latente desde 20270827000003 (mesmo CASE
                    -- sem cast): os 37 jobs "succeeded" nunca chegaram nesta
                    -- linha porque o filtro antigo (LOCACAO + is_recurring +
                    -- janela) não casava contrato nenhum. Ampliar o filtro é
                    -- o que fez o erro aparecer.
                    p_priority      := (CASE WHEN v_days <= 30 THEN 1 ELSE 2 END)::SMALLINT,
                    p_description   := COALESCE(v_c.title, 'Contrato')
                                       || ' — ' || v_label
                                       || ' (fim da vigência em ' || v_c.end_date::TEXT || ')'
                );
                v_created := v_created + 1;
            END IF;

            IF v_member.email IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.notifications n
                WHERE n.recipient_email = v_member.email
                  AND n.link            = v_link
                  AND n.created_at      > now() - INTERVAL '7 days'
            ) THEN
                INSERT INTO public.notifications
                    (recipient_email, title, message, link, type, organization_id)
                VALUES (
                    v_member.email,
                    CASE WHEN v_locacao
                         THEN 'Contrato de locação ' || v_c.number || ' ' || v_label
                         ELSE 'Contrato ' || v_c.number || ' ' || v_label END,
                    COALESCE(v_c.title, initcap(COALESCE(v_c.domain, 'Contrato')))
                        || ' — término em ' || to_char(v_c.end_date, 'DD/MM/YYYY')
                        || CASE WHEN v_locacao
                                THEN '. Abra Locações > Renovações para renovar com reajuste.'
                                ELSE '. Abra o contrato para renovar ou encerrar.' END,
                    v_link,
                    v_type,
                    v_c.organization_id
                );
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_created;
END $$;

COMMENT ON FUNCTION public.generate_rental_renewal_alerts IS
    'Alerta diário de contratos chegando ao fim da vigência, em TODOS os domínios '
    '(estendido em 03/09/2026; antes só LOCACAO recorrente). Respeita contracts.renewal_notice_days. '
    'Idempotente: tarefas por uq_tasks_source_open, notificações por NOT EXISTS de 7 dias. '
    'Contrato já renovado (com filho em parent_contract_id) não alerta.';

REVOKE EXECUTE ON FUNCTION public.generate_rental_renewal_alerts(INTEGER) FROM PUBLIC, anon;


-- ════════════════════════════════════════════════════════════════════════════
-- Agendamento — 08:45 UTC
-- ════════════════════════════════════════════════════════════════════════════
--
-- Horários já ocupados: 05:00 (billing-ruler), 06:00 (warranty-sla),
-- 07:00 (payment-tasks), 07:30 (rental-renewal), 08:00 (docs + portal),
-- 08:15 (academy), 09:00 (manutenção). 08:45 não colide com nenhum.
--
-- Um job só para as quatro funções: elas leem as mesmas tabelas e não têm
-- dependência entre si — quatro entradas de cron seria só mais superfície para
-- desincronizar.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-financial-notifications') THEN
        PERFORM cron.unschedule('daily-financial-notifications');
    END IF;
END $$;

SELECT cron.schedule(
    'daily-financial-notifications',
    '45 8 * * *',
    $$
        SELECT public.fn_notif_recibo_disponivel();
        SELECT public.fn_notif_pagamento_proximo(3);
        SELECT public.fn_notif_pagamento_atraso();
        SELECT public.fn_notif_contrato_reajuste(30);
    $$
);
