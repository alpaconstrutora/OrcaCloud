-- aplicar_20271013160000_ativos_almoxarifado_vinculo.sql
-- Gestão de Ativos ↔ Almoxarifado: vínculo real, sincronia e caminho de volta.
-- Plano: docs/planos/2026-10-13-ativos-almoxarifado-vinculo.md
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
--
-- ── O que havia ──────────────────────────────────────────────────────────────
-- A única ponte era Importar Itens › Gestão de Ativos: copiava o ativo para
-- stock_items uma vez (input_code = código patrimonial, sem FK) e lançava 1 UN
-- a cada importação — reimportar dava saldo 2, 3… num bem unitário. Depois
-- disso nada conversava: editar, baixar, entregar à obra ou devolver o ativo
-- não mexia no estoque.
--
-- ── O desenho: o banco RECONCILIA estado, não soma eventos ──────────────────
-- "Lançar um movimento a cada evento" foi a causa da duplicação, e o ativo é
-- escrito por vários caminhos (cadastro, Movimentar, Retirada, Condomínio).
-- Então a sincronia mora aqui, idempotente:
--
--   saldo desejado do ativo vinculado = 1 UN em opura_assets.warehouse_id
--     se status <> 'baixado' e current_project_id IS NULL (está "em casa");
--     senão 0 em todo almoxarifado.
--   warehouse_id NULL = não guardado → a função não mexe em saldo.
--
-- fn_reconciliar_estoque_do_ativo lê stock_balances e lança SÓ a diferença;
-- rodá-la duas vezes não lança nada na segunda.
--
-- ── REGRA #7 ────────────────────────────────────────────────────────────────
-- Pergunta 1 (OR que libera sozinho): nenhuma policy nova aqui.
-- Pergunta 2 (quem mais executa): todas as funções são SECURITY INVOKER — rodam
--   com a RLS de quem chama (org_access_* por organization_members nas cinco
--   tabelas). Mesmo assim, cada uma leva REVOKE de PUBLIC/anon.
--   A trava de movimento manual (fn_stock_movements_trava_item_de_ativo) usa um
--   GUC transacional que só fn_reconciliar_estoque_do_ativo liga.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colunas do vínculo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.opura_assets
    ADD COLUMN IF NOT EXISTS stock_item_id UUID REFERENCES public.stock_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS warehouse_id  UUID REFERENCES public.warehouses(id)  ON DELETE SET NULL;

COMMENT ON COLUMN public.opura_assets.stock_item_id IS
    'Item do catálogo do Almoxarifado que É este ativo (input_code = code). Um item ↔ um ativo.';
COMMENT ON COLUMN public.opura_assets.warehouse_id IS
    'Almoxarifado onde o bem mora quando não está numa obra. NULL = não guardado (o estoque não é tocado).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_assets_stock_item
    ON public.opura_assets (stock_item_id) WHERE stock_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opura_assets_warehouse
    ON public.opura_assets (warehouse_id) WHERE warehouse_id IS NOT NULL;

ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.opura_assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.stock_movements.asset_id IS
    'Movimento lançado pela sincronia do ativo patrimonial (fn_reconciliar_estoque_do_ativo).';

CREATE INDEX IF NOT EXISTS idx_stock_movements_asset
    ON public.stock_movements (asset_id) WHERE asset_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rótulo de categoria e descrição do item — espelho de
--    utils/assetToStockItemRow.ts (ASSET_CATEGORY_LABELS e a descrição
--    "Nome — Marca Modelo"). __tests__/ativosAlmoxarifadoVinculo.test.ts
--    compara este CASE com o mapa do TypeScript.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_rotulo_categoria_ativo(p_categoria TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
    SELECT CASE p_categoria
        WHEN 'equipamento'     THEN 'Equipamento'
        WHEN 'ferramenta'      THEN 'Ferramenta'
        WHEN 'veiculo'         THEN 'Veículo'
        WHEN 'tecnologia'      THEN 'Tecnologia'
        WHEN 'imovel'          THEN 'Imóvel'
        WHEN 'mobiliario'      THEN 'Mobiliário'
        WHEN 'sistema_predial' THEN 'Sistema Predial'
        ELSE p_categoria
    END
$$;

CREATE OR REPLACE FUNCTION public.fn_descricao_item_do_ativo(p_nome TEXT, p_marca TEXT, p_modelo TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
    SELECT concat_ws(' — ',
        NULLIF(btrim(coalesce(p_nome, '')), ''),
        NULLIF(concat_ws(' ',
            CASE WHEN btrim(coalesce(p_marca, ''))  <> '' THEN p_marca  END,
            CASE WHEN btrim(coalesce(p_modelo, '')) <> '' THEN p_modelo END), ''))
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rotulo_categoria_ativo(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_rotulo_categoria_ativo(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_descricao_item_do_ativo(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_descricao_item_do_ativo(TEXT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Reconciliação — o coração da sincronia
--    p_antes   = a linha antes da mudança (NULL num INSERT): só decide o TIPO e a
--                nota do movimento; a QUANTIDADE vem sempre do saldo real.
--    p_excluir = o ativo está sendo excluído: desejado 0 em todo lugar.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconciliar_estoque_do_ativo(
    p_asset_id UUID,
    p_antes    public.opura_assets DEFAULT NULL,
    p_excluir  BOOLEAN DEFAULT false
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    a          public.opura_assets%ROWTYPE;
    v_item     public.stock_items%ROWTYPE;
    v_wh_org   UUID;
    v_destino  UUID;
    v_obra     TEXT;
    v_tem      NUMERIC;
    v_excesso  NUMERIC;
    v_tipo     TEXT;
    v_nota     TEXT;
    v_custo    NUMERIC;
    v_n        INTEGER := 0;
    r          RECORD;
BEGIN
    SELECT * INTO a FROM public.opura_assets WHERE id = p_asset_id;
    IF NOT FOUND OR a.stock_item_id IS NULL OR a.warehouse_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_item FROM public.stock_items WHERE id = a.stock_item_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    IF v_item.organization_id IS DISTINCT FROM a.organization_id THEN
        RAISE EXCEPTION 'O item % do almoxarifado é de outra organização que o ativo %.', v_item.input_code, a.code;
    END IF;
    SELECT organization_id INTO v_wh_org FROM public.warehouses WHERE id = a.warehouse_id;
    IF v_wh_org IS DISTINCT FROM a.organization_id THEN
        RAISE EXCEPTION 'O almoxarifado escolhido não pertence à organização do ativo %.', a.code;
    END IF;

    v_destino := CASE
        WHEN p_excluir THEN NULL
        WHEN a.status <> 'baixado' AND a.current_project_id IS NULL THEN a.warehouse_id
    END;
    IF a.current_project_id IS NOT NULL THEN
        SELECT name INTO v_obra FROM public.projects WHERE id = a.current_project_id;
    END IF;
    v_custo := NULLIF(a.purchase_value, 0);

    -- Só a reconciliação passa pela trava de movimento manual.
    PERFORM set_config('opura.reconciliando_ativo', a.id::text, true);

    -- Saídas: todo saldo fora do destino, e o que passar de 1 UN no destino.
    FOR r IN
        SELECT b.warehouse_id, b.quantity, w.name AS wh_name
          FROM public.stock_balances b
          JOIN public.warehouses w ON w.id = b.warehouse_id
         WHERE b.organization_id = a.organization_id
           AND b.input_code = v_item.input_code
           AND b.quantity > 0
    LOOP
        v_excesso := r.quantity - CASE WHEN r.warehouse_id = v_destino THEN 1 ELSE 0 END;
        CONTINUE WHEN v_excesso <= 0;

        IF p_excluir THEN
            v_tipo := 'adjust_out'; v_nota := format('Ativo %s excluído', a.code);
        ELSIF r.warehouse_id = v_destino THEN
            v_tipo := 'adjust_out'; v_nota := format('Acerto: o ativo %s é uma unidade só', a.code);
        ELSIF a.status = 'baixado' THEN
            v_tipo := 'adjust_out'; v_nota := format('Baixa do ativo %s', a.code);
        ELSIF a.current_project_id IS NOT NULL THEN
            v_tipo := 'out';
            v_nota := format('Retirada do ativo %s para a obra %s', a.code, coalesce(v_obra, 'sem nome'));
        ELSE
            v_tipo := 'transfer_out';
            v_nota := format('Ativo %s transferido para outro almoxarifado', a.code);
        END IF;

        INSERT INTO public.stock_movements
            (organization_id, warehouse_id, input_code, input_description, input_unit,
             type, quantity, notes, asset_id, created_by)
        VALUES
            (a.organization_id, r.warehouse_id, v_item.input_code, v_item.input_description, v_item.input_unit,
             v_tipo, v_excesso, v_nota, a.id, auth.uid());
        v_n := v_n + 1;
    END LOOP;

    -- Entrada: falta a unidade no destino.
    IF v_destino IS NOT NULL THEN
        SELECT quantity INTO v_tem
          FROM public.stock_balances
         WHERE warehouse_id = v_destino AND input_code = v_item.input_code;
        v_tem := coalesce(v_tem, 0);

        IF v_tem < 1 THEN
            IF p_antes.id IS NOT NULL AND p_antes.current_project_id IS NOT NULL THEN
                SELECT name INTO v_obra FROM public.projects WHERE id = p_antes.current_project_id;
                v_tipo := 'in';
                v_nota := format('Devolução do ativo %s da obra %s', a.code, coalesce(v_obra, 'sem nome'));
            ELSIF p_antes.id IS NOT NULL AND p_antes.status = 'baixado' THEN
                v_tipo := 'adjust_in'; v_nota := format('Reativação do ativo %s', a.code);
            ELSIF p_antes.id IS NOT NULL AND p_antes.warehouse_id IS NOT NULL
                  AND p_antes.warehouse_id <> a.warehouse_id THEN
                v_tipo := 'transfer_in';
                v_nota := format('Ativo %s transferido de outro almoxarifado', a.code);
            ELSE
                v_tipo := 'in'; v_nota := format('Saldo inicial do ativo %s', a.code);
            END IF;

            INSERT INTO public.stock_movements
                (organization_id, warehouse_id, input_code, input_description, input_unit,
                 type, quantity, unit_cost, notes, asset_id, created_by)
            VALUES
                (a.organization_id, v_destino, v_item.input_code, v_item.input_description, v_item.input_unit,
                 v_tipo, 1 - v_tem, v_custo, v_nota, a.id, auth.uid());
            v_n := v_n + 1;
        END IF;
    END IF;

    PERFORM set_config('opura.reconciliando_ativo', '', true);
    RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reconciliar_estoque_do_ativo(UUID, public.opura_assets, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_reconciliar_estoque_do_ativo(UUID, public.opura_assets, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Gatilhos em opura_assets
-- ─────────────────────────────────────────────────────────────────────────────

-- 4.1 Depois de gravar: espelha a descrição no item e reconcilia o saldo.
CREATE OR REPLACE FUNCTION public.fn_opura_assets_sincroniza_estoque()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    v_desc TEXT;
    v_code TEXT;
BEGIN
    IF NEW.stock_item_id IS NOT NULL AND (
           TG_OP = 'INSERT'
        OR NEW.stock_item_id  IS DISTINCT FROM OLD.stock_item_id
        OR NEW.name           IS DISTINCT FROM OLD.name
        OR NEW.brand          IS DISTINCT FROM OLD.brand
        OR NEW.model          IS DISTINCT FROM OLD.model
        OR NEW.brand_id       IS DISTINCT FROM OLD.brand_id
        OR NEW.model_id       IS DISTINCT FROM OLD.model_id
        OR NEW.category       IS DISTINCT FROM OLD.category
        OR NEW.purchase_value IS DISTINCT FROM OLD.purchase_value
    ) THEN
        v_desc := public.fn_descricao_item_do_ativo(NEW.name, NEW.brand, NEW.model);
        UPDATE public.stock_items
           SET input_description = v_desc,
               category          = public.fn_rotulo_categoria_ativo(NEW.category),
               unit_cost_hint    = NULLIF(NEW.purchase_value, 0),
               brand_id          = NEW.brand_id,
               model_id          = NEW.model_id,
               brand             = NEW.brand,
               model             = NEW.model,
               is_active         = (NEW.status <> 'baixado')
         WHERE id = NEW.stock_item_id
         RETURNING input_code INTO v_code;
        -- A aba Saldos lê a descrição do saldo, não do item.
        UPDATE public.stock_balances
           SET input_description = v_desc
         WHERE organization_id = NEW.organization_id AND input_code = v_code;
    ELSIF TG_OP = 'UPDATE' AND NEW.stock_item_id IS NOT NULL
          AND NEW.status IS DISTINCT FROM OLD.status THEN
        UPDATE public.stock_items SET is_active = (NEW.status <> 'baixado') WHERE id = NEW.stock_item_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM public.fn_reconciliar_estoque_do_ativo(NEW.id, NULL);
    ELSIF NEW.status             IS DISTINCT FROM OLD.status
       OR NEW.current_project_id IS DISTINCT FROM OLD.current_project_id
       OR NEW.warehouse_id       IS DISTINCT FROM OLD.warehouse_id
       OR NEW.stock_item_id      IS DISTINCT FROM OLD.stock_item_id THEN
        PERFORM public.fn_reconciliar_estoque_do_ativo(NEW.id, OLD);
    END IF;
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_opura_assets_sincroniza_estoque() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_opura_assets_sincroniza_estoque ON public.opura_assets;
CREATE TRIGGER trg_opura_assets_sincroniza_estoque
    AFTER INSERT OR UPDATE ON public.opura_assets
    FOR EACH ROW EXECUTE FUNCTION public.fn_opura_assets_sincroniza_estoque();

-- 4.2 O código patrimonial de um ativo guardado não muda: é o código do item,
--     que é imutável (inventoryService.upsertStockItem).
CREATE OR REPLACE FUNCTION public.fn_opura_assets_trava_codigo_vinculado()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF OLD.stock_item_id IS NOT NULL AND NEW.stock_item_id IS NOT DISTINCT FROM OLD.stock_item_id
       AND NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'O código patrimonial % não pode mudar: ele é o código do item no Almoxarifado.', OLD.code;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_opura_assets_trava_codigo_vinculado() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_opura_assets_trava_codigo_vinculado ON public.opura_assets;
CREATE TRIGGER trg_opura_assets_trava_codigo_vinculado
    BEFORE UPDATE OF code ON public.opura_assets
    FOR EACH ROW EXECUTE FUNCTION public.fn_opura_assets_trava_codigo_vinculado();

-- 4.3 Excluir o ativo tira a unidade do estoque e desativa o item.
CREATE OR REPLACE FUNCTION public.fn_opura_assets_exclui_do_estoque()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF OLD.stock_item_id IS NOT NULL THEN
        PERFORM public.fn_reconciliar_estoque_do_ativo(OLD.id, NULL, true);
        UPDATE public.stock_items SET is_active = false WHERE id = OLD.stock_item_id;
    END IF;
    RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_opura_assets_exclui_do_estoque() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_opura_assets_exclui_do_estoque ON public.opura_assets;
CREATE TRIGGER trg_opura_assets_exclui_do_estoque
    BEFORE DELETE ON public.opura_assets
    FOR EACH ROW EXECUTE FUNCTION public.fn_opura_assets_exclui_do_estoque();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trava: item que É um ativo só se movimenta pela Gestão de Ativos.
--    Saída manual, requisição ou transferência dessincronizariam o bem.
--    Roda depois de trg_stock_movements_resolve_item (ordem alfabética), com o
--    input_code já resolvido.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_stock_movements_trava_item_de_ativo()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    v_ativo RECORD;
BEGIN
    SELECT a.id, a.code, a.name INTO v_ativo
      FROM public.opura_assets a
      JOIN public.stock_items i ON i.id = a.stock_item_id
     WHERE i.organization_id = NEW.organization_id
       AND i.input_code = NEW.input_code;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    IF NEW.asset_id IS NOT DISTINCT FROM v_ativo.id
       AND current_setting('opura.reconciliando_ativo', true) = v_ativo.id::text THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'O item % é o ativo patrimonial "%". Movimente-o pela Gestão de Ativos (Retirada, Movimentar ou Guardar no almoxarifado).',
        NEW.input_code, v_ativo.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_stock_movements_trava_item_de_ativo() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_stock_movements_trava_item_de_ativo ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_trava_item_de_ativo
    BEFORE INSERT ON public.stock_movements
    FOR EACH ROW EXECUTE FUNCTION public.fn_stock_movements_trava_item_de_ativo();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Caminho de volta: N unidades de um item do almoxarifado viram N ativos.
--    Tudo ou nada: sai N UN do item original, nascem N ativos (código próprio),
--    N itens source='ativos' vinculados, e o gatilho 4.1 lança 1 UN de cada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_patrimoniar_item_de_estoque(
    p_item_id         UUID,
    p_warehouse_id    UUID,
    p_quantidade      INTEGER,
    p_categoria       TEXT,
    p_vida_util_meses INTEGER,
    p_valor_unitario  NUMERIC,
    p_nome            TEXT
) RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    v_item      public.stock_items%ROWTYPE;
    v_wh_org    UUID;
    v_saldo     NUMERIC;
    v_nome      TEXT := NULLIF(btrim(coalesce(p_nome, '')), '');
    v_code      TEXT;
    v_novo_item UUID;
    v_ativo     UUID;
    i           INTEGER;
BEGIN
    IF p_quantidade IS NULL OR p_quantidade < 1 THEN
        RAISE EXCEPTION 'Informe ao menos 1 unidade para transformar em ativo.';
    END IF;
    IF p_quantidade > 200 THEN
        RAISE EXCEPTION 'No máximo 200 ativos por vez (pedido: %).', p_quantidade;
    END IF;
    IF coalesce(btrim(p_categoria), '') = '' THEN
        RAISE EXCEPTION 'Escolha a categoria do ativo.';
    END IF;

    SELECT * INTO v_item FROM public.stock_items WHERE id = p_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item do almoxarifado não encontrado.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.opura_assets WHERE stock_item_id = p_item_id) THEN
        RAISE EXCEPTION 'O item % já é um ativo patrimonial.', v_item.input_code;
    END IF;
    SELECT organization_id INTO v_wh_org FROM public.warehouses WHERE id = p_warehouse_id;
    IF v_wh_org IS DISTINCT FROM v_item.organization_id THEN
        RAISE EXCEPTION 'O almoxarifado não pertence à organização do item.';
    END IF;

    SELECT quantity INTO v_saldo
      FROM public.stock_balances
     WHERE warehouse_id = p_warehouse_id AND input_code = v_item.input_code
       FOR UPDATE;
    IF coalesce(v_saldo, 0) < p_quantidade THEN
        RAISE EXCEPTION 'Saldo insuficiente: há % UN de % neste almoxarifado e foram pedidas %.',
            coalesce(v_saldo, 0), v_item.input_code, p_quantidade;
    END IF;

    INSERT INTO public.stock_movements
        (organization_id, warehouse_id, input_code, input_description, input_unit,
         type, quantity, notes, created_by)
    VALUES
        (v_item.organization_id, p_warehouse_id, v_item.input_code, v_item.input_description, v_item.input_unit,
         'adjust_out', p_quantidade,
         format('Transformado em %s ativo(s) patrimonial(is)', p_quantidade), auth.uid());

    FOR i IN 1..p_quantidade LOOP
        LOOP
            v_code := 'OPR-PAT-' || (100000 + floor(random() * 900000))::INTEGER::TEXT;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.opura_assets
                                   WHERE organization_id = v_item.organization_id AND code = v_code)
                  AND NOT EXISTS (SELECT 1 FROM public.stock_items
                                   WHERE organization_id = v_item.organization_id AND input_code = v_code);
        END LOOP;

        INSERT INTO public.stock_items
            (organization_id, input_code, input_description, input_unit, category, source,
             unit_cost_hint, brand_id, model_id, brand, model)
        VALUES
            (v_item.organization_id, v_code,
             public.fn_descricao_item_do_ativo(coalesce(v_nome, v_item.input_description), v_item.brand, v_item.model),
             'UN', public.fn_rotulo_categoria_ativo(p_categoria), 'ativos',
             NULLIF(p_valor_unitario, 0), v_item.brand_id, v_item.model_id, v_item.brand, v_item.model)
        RETURNING id INTO v_novo_item;

        INSERT INTO public.opura_assets
            (organization_id, code, tracking_code, name, category, brand, model, brand_id, model_id,
             purchase_date, purchase_value, useful_life_months, residual_value, status, notes,
             stock_item_id, warehouse_id)
        VALUES
            (v_item.organization_id, v_code, v_code, coalesce(v_nome, v_item.input_description), p_categoria,
             v_item.brand, v_item.model, v_item.brand_id, v_item.model_id,
             CURRENT_DATE, coalesce(p_valor_unitario, 0), coalesce(p_vida_util_meses, 60), 0, 'disponivel',
             format('Patrimoniado a partir do item %s do almoxarifado.', v_item.input_code),
             v_novo_item, p_warehouse_id)
        RETURNING id INTO v_ativo;

        RETURN NEXT v_ativo;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_patrimoniar_item_de_estoque(UUID, UUID, INTEGER, TEXT, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_patrimoniar_item_de_estoque(UUID, UUID, INTEGER, TEXT, INTEGER, NUMERIC, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Backfill: item que veio da importação de ativos ganha o vínculo.
--    warehouse_id = onde há saldo (se houver). O gatilho 4.1 reconcilia.
--    Em 13/10/2026: 1 item, sem saldo → só o vínculo, nenhum movimento.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.opura_assets a
   SET stock_item_id = si.id,
       warehouse_id  = coalesce(a.warehouse_id, (
           SELECT b.warehouse_id FROM public.stock_balances b
            WHERE b.organization_id = si.organization_id AND b.input_code = si.input_code AND b.quantity > 0
            ORDER BY b.quantity DESC LIMIT 1))
  FROM public.stock_items si
 WHERE si.source = 'ativos'
   AND si.organization_id = a.organization_id
   AND si.input_code = a.code
   AND a.stock_item_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.opura_assets x WHERE x.stock_item_id = si.id);
