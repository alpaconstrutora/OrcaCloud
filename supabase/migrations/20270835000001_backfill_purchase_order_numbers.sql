-- Backfill: renumera TODOS os pedidos existentes no padrão
--   PC-{código do empreendimento}-{código da obra}-{sequencial por obra}
--
-- Ordem do sequencial = created_at (empate desfeito por id), para que o número
-- reflita a ordem real de criação.
--
-- Pedidos cuja obra ou empreendimento não tem código cadastrado são DEIXADOS
-- COMO ESTÃO (número antigo PO-xxxxxx). Não há como inventar o código, e
-- apagar o número quebraria referências já emitidas. O RAISE NOTICE no fim diz
-- quantos ficaram de fora — rode de novo depois de cadastrar os códigos.
--
-- O prefixo 'PC' está fixo aqui porque a configuração de nomenclatura vive no
-- cliente (appSettingsService / localStorage), não no banco. Se o prefixo for
-- alterado nas Configurações, ajuste-o abaixo antes de rodar.

SET lock_timeout = '5s';

DO $BACKFILL$
DECLARE
    v_prefix  TEXT := 'PC';
    v_padding INTEGER := 4;
    v_renamed INTEGER := 0;
    v_skipped INTEGER := 0;
BEGIN
    -- Mapa obra → empreendimento. Vale nos dois sentidos do módulo:
    -- empreendimentos.project_id (obra principal) e empreendimento_towers.project_id
    -- (obra por torre). O vínculo principal tem precedência, igual ao
    -- empreendimentoService.mapObrasToEmpreendimentos.
    CREATE TEMP TABLE tmp_obra_emp ON COMMIT DROP AS
    SELECT DISTINCT ON (project_id) project_id, emp_code
    FROM (
        SELECT t.project_id, e.code AS emp_code, 2 AS prio
        FROM public.empreendimento_towers t
        JOIN public.empreendimentos e ON e.id = t.empreendimento_id
        WHERE t.project_id IS NOT NULL
        UNION ALL
        SELECT e.project_id, e.code AS emp_code, 1 AS prio
        FROM public.empreendimentos e
        WHERE e.project_id IS NOT NULL
    ) s
    ORDER BY project_id, prio;

    CREATE TEMP TABLE tmp_new_numbers ON COMMIT DROP AS
    SELECT
        po.id,
        po.project_id,
        ROW_NUMBER() OVER (PARTITION BY po.project_id ORDER BY po.created_at, po.id) AS seq,
        v_prefix || '-' || m.emp_code || '-' || (p.settings ->> 'code') || '-' ||
            LPAD(ROW_NUMBER() OVER (PARTITION BY po.project_id ORDER BY po.created_at, po.id)::TEXT,
                 v_padding, '0') AS new_number
    FROM public.purchase_orders po
    JOIN public.projects p     ON p.id = po.project_id
    JOIN tmp_obra_emp m        ON m.project_id = po.project_id
    WHERE NULLIF(TRIM(m.emp_code), '') IS NOT NULL
      AND NULLIF(TRIM(p.settings ->> 'code'), '') IS NOT NULL;

    SELECT COUNT(*) INTO v_renamed FROM tmp_new_numbers;
    SELECT COUNT(*) INTO v_skipped
    FROM public.purchase_orders po
    WHERE NOT EXISTS (SELECT 1 FROM tmp_new_numbers n WHERE n.id = po.id);

    UPDATE public.purchase_orders po
    SET number = n.new_number
    FROM tmp_new_numbers n
    WHERE n.id = po.id
      AND po.number IS DISTINCT FROM n.new_number;

    -- Contador tem que continuar de onde o backfill parou, senão o próximo
    -- pedido criado pela aplicação colide com um número já gravado.
    INSERT INTO public.purchase_order_number_counters (project_id, last_seq, updated_at)
    SELECT project_id, MAX(seq), NOW()
    FROM tmp_new_numbers
    GROUP BY project_id
    ON CONFLICT (project_id) DO UPDATE
        SET last_seq   = GREATEST(public.purchase_order_number_counters.last_seq, EXCLUDED.last_seq),
            updated_at = NOW();

    RAISE NOTICE 'Backfill de numeração: % pedidos renumerados, % mantidos (obra ou empreendimento sem código).',
        v_renamed, v_skipped;
END;
$BACKFILL$;
