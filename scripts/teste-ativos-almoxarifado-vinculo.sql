-- scripts/teste-ativos-almoxarifado-vinculo.sql
-- Roteiro de asserções da sincronia Ativo ↔ Almoxarifado
-- (docs/planos/2026-10-13-ativos-almoxarifado-vinculo.md, item 9).
--
-- Roda dentro de BEGIN … ROLLBACK: não deixa nada gravado. Cada falha é um
-- RAISE EXCEPTION com o que esperava e o que veio (`db query` só devolve o
-- último resultado, então a saída de sucesso é a linha final 'TUDO OK').
--
--   npx supabase db query --linked -f scripts/teste-ativos-almoxarifado-vinculo.sql
--
-- Para testar uma versão nova da migration ANTES de aplicá-la, gere um arquivo
-- com o conteúdo dela no lugar da linha MIGRATION abaixo.

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.saldo(p_wh UUID, p_code TEXT) RETURNS NUMERIC LANGUAGE sql AS $$
    SELECT coalesce((SELECT quantity FROM public.stock_balances WHERE warehouse_id = p_wh AND input_code = p_code), 0)
$$;
CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;
-- Movimentos do ativo lançados desde a última chamada. Não dá para ordenar por
-- created_at: dentro da transação now() é o mesmo para todos.
CREATE TEMP TABLE vistos (id UUID PRIMARY KEY);
CREATE FUNCTION pg_temp.ultimo(p_asset UUID) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
    SELECT string_agg(type || ' ' || quantity::INTEGER || ' | ' || notes, ' ; ' ORDER BY type) INTO v
      FROM public.stock_movements m
     WHERE m.asset_id = p_asset AND NOT EXISTS (SELECT 1 FROM vistos x WHERE x.id = m.id);
    INSERT INTO vistos SELECT id FROM public.stock_movements WHERE asset_id = p_asset ON CONFLICT DO NOTHING;
    RETURN coalesce(v, '(nenhum)');
END $$;

DO $$
DECLARE
    org UUID; w1 UUID; w2 UUID; prj UUID;
    a UUID; it UUID; com UUID; ids UUID[]; v TEXT; n INTEGER;
BEGIN
    SELECT organization_id INTO org FROM public.opura_assets ORDER BY created_at LIMIT 1;
    INSERT INTO public.warehouses (organization_id, name, type) VALUES (org, 'TESTE W1', 'central') RETURNING id INTO w1;
    INSERT INTO public.warehouses (organization_id, name, type) VALUES (org, 'TESTE W2', 'central') RETURNING id INTO w2;
    SELECT id INTO prj FROM public.projects WHERE organization_id = org LIMIT 1;
    prj := coalesce(prj, gen_random_uuid());

    INSERT INTO public.opura_assets (organization_id, code, name, category, purchase_value)
    VALUES (org, 'TST-ATV-0001', 'Betoneira teste', 'equipamento', 4500) RETURNING id INTO a;
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE asset_id = a), 'ativo sem vínculo não mexe no estoque');

    INSERT INTO public.stock_items (organization_id, input_code, input_description, input_unit, source)
    VALUES (org, 'TST-ATV-0001', 'x', 'UN', 'ativos') RETURNING id INTO it;

    -- só o item (sem almoxarifado): vínculo, nenhum saldo
    UPDATE public.opura_assets SET stock_item_id = it WHERE id = a;
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE asset_id = a), 'vínculo sem almoxarifado não lança saldo');
    PERFORM pg_temp.confere((SELECT input_description FROM public.stock_items WHERE id = it) = 'Betoneira teste', 'descrição espelhada no vínculo');

    -- guardar
    UPDATE public.opura_assets SET warehouse_id = w1 WHERE id = a;
    PERFORM pg_temp.confere(pg_temp.saldo(w1, 'TST-ATV-0001') = 1, 'guardar → 1 UN em W1');
    v := pg_temp.ultimo(a); PERFORM pg_temp.confere(v LIKE 'in 1 | Saldo inicial%', 'guardar lança in: ' || v);
    PERFORM pg_temp.confere((SELECT avg_unit_cost FROM public.stock_balances WHERE warehouse_id = w1 AND input_code = 'TST-ATV-0001') = 4500, 'custo = valor de aquisição');

    -- guardar de novo / reconciliar de novo: nada
    n := public.fn_reconciliar_estoque_do_ativo(a);
    UPDATE public.opura_assets SET warehouse_id = w1 WHERE id = a;
    PERFORM pg_temp.confere(n = 0 AND pg_temp.saldo(w1, 'TST-ATV-0001') = 1
        AND (SELECT count(*) FROM public.stock_movements WHERE asset_id = a) = 1, 'reconciliar 2× não lança nada');

    -- editar sincroniza
    UPDATE public.opura_assets SET name = 'Betoneira 400L', brand = 'MarcaTeste', model = 'CS400', category = 'ferramenta', purchase_value = 5000 WHERE id = a;
    SELECT input_description || ' | ' || category || ' | ' || unit_cost_hint::INTEGER INTO v FROM public.stock_items WHERE id = it;
    PERFORM pg_temp.confere(v = 'Betoneira 400L — MarcaTeste CS400 | Ferramenta | 5000', 'editar espelha no item: ' || v);
    PERFORM pg_temp.confere((SELECT input_description FROM public.stock_balances WHERE warehouse_id = w1 AND input_code = 'TST-ATV-0001') = 'Betoneira 400L — MarcaTeste CS400', 'editar espelha no saldo');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.stock_movements WHERE asset_id = a) = 1, 'editar não lança movimento');

    -- movimento manual recusado
    BEGIN
        INSERT INTO public.stock_movements (organization_id, warehouse_id, input_code, input_description, input_unit, type, quantity)
        VALUES (org, w1, 'TST-ATV-0001', 'x', 'UN', 'out', 1);
        RAISE EXCEPTION 'FALHOU: movimento manual do item do ativo passou';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
        PERFORM pg_temp.confere(SQLERRM LIKE '%Movimente-o pela Gestão de Ativos%', 'mensagem da trava: ' || SQLERRM);
    END;

    -- trocar o código de ativo vinculado: recusado
    BEGIN
        UPDATE public.opura_assets SET code = 'TST-ATV-9999' WHERE id = a;
        RAISE EXCEPTION 'FALHOU: código de ativo vinculado mudou';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    END;

    -- entregar à obra / devolver
    UPDATE public.opura_assets SET current_project_id = prj, status = 'em_uso' WHERE id = a;
    PERFORM pg_temp.confere(pg_temp.saldo(w1, 'TST-ATV-0001') = 0, 'entregar à obra → 0');
    v := pg_temp.ultimo(a); PERFORM pg_temp.confere(v LIKE 'out 1 | Retirada do ativo%', 'entregar lança out: ' || v);
    UPDATE public.opura_assets SET current_project_id = NULL, status = 'disponivel' WHERE id = a;
    PERFORM pg_temp.confere(pg_temp.saldo(w1, 'TST-ATV-0001') = 1, 'devolver → 1');
    v := pg_temp.ultimo(a); PERFORM pg_temp.confere(v LIKE 'in 1 | Devolução do ativo%', 'devolver lança in: ' || v);

    -- manutenção não tira do almoxarifado
    UPDATE public.opura_assets SET status = 'manutencao' WHERE id = a;
    PERFORM pg_temp.confere(pg_temp.saldo(w1, 'TST-ATV-0001') = 1, 'manutenção mantém 1');
    UPDATE public.opura_assets SET status = 'disponivel' WHERE id = a;

    -- trocar de almoxarifado
    UPDATE public.opura_assets SET warehouse_id = w2 WHERE id = a;
    PERFORM pg_temp.confere(pg_temp.saldo(w1, 'TST-ATV-0001') = 0 AND pg_temp.saldo(w2, 'TST-ATV-0001') = 1, 'trocar W1→W2');
    v := pg_temp.ultimo(a); PERFORM pg_temp.confere(v LIKE 'transfer_in 1%', 'troca lança transfer_in: ' || v);

    -- baixar / reativar
    UPDATE public.opura_assets SET status = 'baixado' WHERE id = a;
    PERFORM pg_temp.confere(pg_temp.saldo(w2, 'TST-ATV-0001') = 0, 'baixar → 0');
    v := pg_temp.ultimo(a); PERFORM pg_temp.confere(v LIKE 'adjust_out 1 | Baixa do ativo%', 'baixa lança adjust_out: ' || v);
    PERFORM pg_temp.confere((SELECT NOT is_active FROM public.stock_items WHERE id = it), 'baixar desativa o item');
    UPDATE public.opura_assets SET status = 'disponivel' WHERE id = a;
    PERFORM pg_temp.confere(pg_temp.saldo(w2, 'TST-ATV-0001') = 1, 'reativar → 1');
    v := pg_temp.ultimo(a); PERFORM pg_temp.confere(v LIKE 'adjust_in 1 | Reativação%', 'reativar lança adjust_in: ' || v);
    PERFORM pg_temp.confere((SELECT is_active FROM public.stock_items WHERE id = it), 'reativar reativa o item');

    -- saldo duplicado herdado (o bug antigo) é acertado para 1
    PERFORM set_config('opura.reconciliando_ativo', a::TEXT, true);
    INSERT INTO public.stock_movements (organization_id, warehouse_id, input_code, input_description, input_unit, type, quantity, asset_id)
    VALUES (org, w2, 'TST-ATV-0001', 'x', 'UN', 'in', 2, a);
    PERFORM set_config('opura.reconciliando_ativo', '', true);
    n := public.fn_reconciliar_estoque_do_ativo(a);
    PERFORM pg_temp.confere(n = 1 AND pg_temp.saldo(w2, 'TST-ATV-0001') = 1, 'saldo 3 acertado para 1');

    -- excluir tira do estoque
    DELETE FROM public.opura_assets WHERE id = a;
    PERFORM pg_temp.confere(pg_temp.saldo(w2, 'TST-ATV-0001') = 0, 'excluir → 0');
    PERFORM pg_temp.confere((SELECT NOT is_active FROM public.stock_items WHERE id = it), 'excluir desativa o item');

    -- patrimoniar 2 de 3
    INSERT INTO public.stock_items (organization_id, input_code, input_description, input_unit, source, brand)
    VALUES (org, 'TST-ITEM-0003', 'Furadeira de impacto', 'UN', 'avulso', 'MarcaTeste') RETURNING id INTO com;
    INSERT INTO public.stock_movements (organization_id, warehouse_id, input_code, input_description, input_unit, type, quantity, unit_cost)
    VALUES (org, w1, 'TST-ITEM-0003', 'Furadeira de impacto', 'UN', 'in', 3, 100);
    SELECT array_agg(x) INTO ids FROM public.fn_patrimoniar_item_de_estoque(com, w1, 2, 'ferramenta', 24, 150, NULL) AS x;
    PERFORM pg_temp.confere(array_length(ids, 1) = 2, 'patrimoniar 2 devolve 2 ativos');
    PERFORM pg_temp.confere(pg_temp.saldo(w1, 'TST-ITEM-0003') = 1, 'item original fica com 1');
    SELECT count(*) INTO n FROM public.opura_assets oa JOIN public.stock_items si ON si.id = oa.stock_item_id
     WHERE oa.id = ANY(ids) AND oa.warehouse_id = w1 AND oa.category = 'ferramenta' AND oa.purchase_value = 150
       AND oa.name = 'Furadeira de impacto' AND si.input_code = oa.code AND si.source = 'ativos'
       AND si.input_description = 'Furadeira de impacto — MarcaTeste' AND pg_temp.saldo(w1, oa.code) = 1;
    PERFORM pg_temp.confere(n = 2, 'cada ativo novo: item próprio vinculado com 1 UN (' || n || ')');

    -- mais do que o saldo: recusado, sem efeito parcial
    BEGIN
        PERFORM public.fn_patrimoniar_item_de_estoque(com, w1, 5, 'ferramenta', 24, 150, NULL);
        RAISE EXCEPTION 'FALHOU: patrimoniou mais do que o saldo';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
        PERFORM pg_temp.confere(SQLERRM LIKE 'Saldo insuficiente%', 'mensagem de saldo: ' || SQLERRM);
    END;
    PERFORM pg_temp.confere(pg_temp.saldo(w1, 'TST-ITEM-0003') = 1, 'recusa não mexeu no saldo');

    -- item que já é ativo não se patrimonia de novo
    BEGIN
        PERFORM public.fn_patrimoniar_item_de_estoque(
            (SELECT stock_item_id FROM public.opura_assets WHERE id = ids[1]), w1, 1, 'ferramenta', 24, 150, NULL);
        RAISE EXCEPTION 'FALHOU: patrimoniou item que já é ativo';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    END;
END $$;

ROLLBACK;
SELECT 'TUDO OK' AS resultado;
