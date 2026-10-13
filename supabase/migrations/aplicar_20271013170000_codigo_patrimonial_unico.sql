-- aplicar_20271013170000_codigo_patrimonial_unico.sql
-- Código patrimonial único (por organização) e sequencial, nascido no BANCO.
-- Plano: docs/planos/2026-10-13-codigo-patrimonial-unico.md
--
-- Aplicar com:  npx supabase db query --linked -f <este arquivo>   (NUNCA db push)
--
-- ── O que havia ──────────────────────────────────────────────────────────────
-- Três geradores no navegador: OPR-PAT-{6 dígitos sorteados} no cadastro e na
-- importação (colisão = erro do banco na cara do usuário), OPR-PRE-{maior+1}
-- sem trava no Condomínio (dois cadastros simultâneos pegavam o mesmo número)
-- e um sorteio com nova tentativa em fn_patrimoniar_item_de_estoque. A
-- unicidade (organization_id, code) também não ignorava caixa nem espaço.
--
-- ── O que passa a valer ──────────────────────────────────────────────────────
-- * fn_proximo_codigo_patrimonial(org, prefixo): trava por org+prefixo
--   (advisory lock da transação) e MAIOR+1 — mesmo padrão de
--   fn_next_stock_item_code (20270913000004). Séries: OPR-PAT-000001 (bens) e
--   OPR-PRE-0001 (ativos prediais do Condomínio).
-- * Gatilho BEFORE INSERT/UPDATE: normaliza (upper+trim) e, se vier vazio no
--   INSERT, gera pelo prefixo da categoria. Código digitado à mão continua
--   aceito — e conta para a série (digitar 000200 faz o próximo ser 000201).
-- * Índice único em (organization_id, upper(btrim(code))).
-- * Renumeração dos OPR-PAT aleatórios existentes (decisão do usuário,
--   13/10/2026), por organização, na ordem de cadastro. O código antigo fica em
--   opura_assets.codigo_anterior (a busca acha o bem pela etiqueta velha) e na
--   tabela de reversão opura_assets_renumeracao_20271013 — NÃO APAGAR.
--
-- ── REGRA #7 ────────────────────────────────────────────────────────────────
-- Pergunta 1: nenhuma policy nova. A tabela de reversão fica com RLS ligada e
--   sem policy (só postgres lê), porque é registro de migração, não dado de tela.
-- Pergunta 2: funções SECURITY INVOKER; todas com REVOKE de PUBLIC/anon.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Gerador atômico
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_proximo_codigo_patrimonial(p_org UUID, p_prefixo TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
    v_digitos INTEGER := CASE WHEN p_prefixo = 'OPR-PRE' THEN 4 ELSE 6 END;
    v_seq     BIGINT;
BEGIN
    IF p_prefixo NOT IN ('OPR-PAT', 'OPR-PRE') THEN
        RAISE EXCEPTION 'Prefixo de código patrimonial desconhecido: %', p_prefixo;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('asset_code:' || p_org::text || ':' || p_prefixo));

    SELECT coalesce(max(substring(upper(btrim(code)) FROM '^' || p_prefixo || '-(\d+)$')::BIGINT), 0) + 1
      INTO v_seq
      FROM public.opura_assets
     WHERE organization_id = p_org
       AND upper(btrim(code)) ~ ('^' || p_prefixo || '-\d+$');

    RETURN p_prefixo || '-' || lpad(v_seq::TEXT, v_digitos, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_proximo_codigo_patrimonial(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_proximo_codigo_patrimonial(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Normaliza e gera no gatilho
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_opura_assets_codigo()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    NEW.code := NULLIF(upper(btrim(coalesce(NEW.code, ''))), '');
    IF NEW.code IS NULL THEN
        IF TG_OP = 'UPDATE' THEN
            NEW.code := OLD.code;           -- apagar o código não apaga: mantém o que era
        ELSE
            NEW.code := public.fn_proximo_codigo_patrimonial(
                NEW.organization_id,
                CASE WHEN NEW.category = 'sistema_predial' THEN 'OPR-PRE' ELSE 'OPR-PAT' END);
        END IF;
    END IF;
    IF NULLIF(btrim(coalesce(NEW.tracking_code, '')), '') IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.tracking_code IS NOT DISTINCT FROM OLD.code AND NEW.code IS DISTINCT FROM OLD.code) THEN
        NEW.tracking_code := NEW.code;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_opura_assets_codigo() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_opura_assets_codigo ON public.opura_assets;
CREATE TRIGGER trg_opura_assets_codigo
    BEFORE INSERT OR UPDATE OF code ON public.opura_assets
    FOR EACH ROW EXECUTE FUNCTION public.fn_opura_assets_codigo();

-- A trava de código de ativo vinculado (aplicar_20271013160000) ganha uma porta
-- transacional, usada SÓ pela renumeração abaixo, que leva o item junto.
CREATE OR REPLACE FUNCTION public.fn_opura_assets_trava_codigo_vinculado()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF OLD.stock_item_id IS NOT NULL AND NEW.stock_item_id IS NOT DISTINCT FROM OLD.stock_item_id
       AND NEW.code IS DISTINCT FROM OLD.code
       AND coalesce(current_setting('opura.renumerando_codigo', true), '') <> 'on' THEN
        RAISE EXCEPTION 'O código patrimonial % não pode mudar: ele é o código do item no Almoxarifado.', OLD.code;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_opura_assets_trava_codigo_vinculado() FROM PUBLIC, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Unicidade que ignora caixa e espaço
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.opura_assets ADD COLUMN IF NOT EXISTS codigo_anterior TEXT;
COMMENT ON COLUMN public.opura_assets.codigo_anterior IS
    'Código patrimonial antes da renumeração de 13/10/2026 (etiquetas antigas). Só leitura/busca.';

ALTER TABLE public.opura_assets DROP CONSTRAINT IF EXISTS uq_asset_code_org;
CREATE UNIQUE INDEX IF NOT EXISTS uq_opura_assets_codigo_org
    ON public.opura_assets (organization_id, upper(btrim(code)));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Renumeração dos OPR-PAT existentes (por org, ordem de cadastro)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opura_assets_renumeracao_20271013 (
    asset_id        UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    codigo_antigo   TEXT NOT NULL,
    codigo_novo     TEXT NOT NULL,
    renumerado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.opura_assets_renumeracao_20271013 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opura_assets_renumeracao_20271013 FROM PUBLIC, anon, authenticated;

INSERT INTO public.opura_assets_renumeracao_20271013 (asset_id, organization_id, codigo_antigo, codigo_novo)
SELECT id, organization_id, code,
       'OPR-PAT-' || lpad(row_number() OVER (PARTITION BY organization_id ORDER BY created_at, id)::TEXT, 6, '0')
  FROM public.opura_assets
 WHERE upper(btrim(code)) ~ '^OPR-PAT-\d+$'
ON CONFLICT (asset_id) DO NOTHING;

-- Só renumera se nenhum código novo já estiver ocupado por OUTRO ativo (ex.: um
-- OPR-PAT-000003 digitado à mão). Em 13/10/2026 os existentes iam de 106268 a
-- 980308 — nenhum conflito; a guarda existe para a migration não mentir.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.opura_assets_renumeracao_20271013 r
          JOIN public.opura_assets a ON a.organization_id = r.organization_id
                                    AND upper(btrim(a.code)) = r.codigo_novo
                                    AND a.id <> r.asset_id
                                    AND NOT EXISTS (SELECT 1 FROM public.opura_assets_renumeracao_20271013 x WHERE x.asset_id = a.id)
    ) THEN
        RAISE EXCEPTION 'Renumeração abortada: um código novo já pertence a um ativo fora da renumeração.';
    END IF;
END $$;

SELECT set_config('opura.renumerando_codigo', 'on', true);

-- Item do Almoxarifado vinculado acompanha (código do item = código do ativo).
UPDATE public.stock_movements m
   SET input_code = r.codigo_novo
  FROM public.opura_assets_renumeracao_20271013 r
  JOIN public.opura_assets a ON a.id = r.asset_id
 WHERE a.stock_item_id IS NOT NULL AND m.organization_id = r.organization_id
   AND m.input_code = r.codigo_antigo AND r.codigo_antigo <> r.codigo_novo;
UPDATE public.stock_balances b
   SET input_code = r.codigo_novo
  FROM public.opura_assets_renumeracao_20271013 r
  JOIN public.opura_assets a ON a.id = r.asset_id
 WHERE a.stock_item_id IS NOT NULL AND b.organization_id = r.organization_id
   AND b.input_code = r.codigo_antigo AND r.codigo_antigo <> r.codigo_novo;
UPDATE public.stock_items i
   SET input_code = r.codigo_novo
  FROM public.opura_assets_renumeracao_20271013 r
  JOIN public.opura_assets a ON a.id = r.asset_id
 WHERE i.id = a.stock_item_id AND i.input_code = r.codigo_antigo AND r.codigo_antigo <> r.codigo_novo;

UPDATE public.opura_assets a
   SET codigo_anterior = coalesce(a.codigo_anterior, r.codigo_antigo),
       code            = r.codigo_novo,
       tracking_code   = r.codigo_novo
  FROM public.opura_assets_renumeracao_20271013 r
 WHERE a.id = r.asset_id AND a.code = r.codigo_antigo AND r.codigo_antigo <> r.codigo_novo;

-- Título de manutenção leva o código no texto (achado pela reference_id, não pelo
-- código): só a descrição muda — valor e status não são tocados.
UPDATE public.internal_transactions t
   SET description = replace(t.description, r.codigo_antigo, r.codigo_novo)
  FROM public.opura_assets_renumeracao_20271013 r
 WHERE t.organization_id = r.organization_id
   AND t.description LIKE '%' || r.codigo_antigo || '%'
   AND r.codigo_antigo <> r.codigo_novo;

SELECT set_config('opura.renumerando_codigo', '', true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Item → ativo usa a série (era sorteio com nova tentativa)
--    Mesmo contrato de aplicar_20271013160000; muda só a origem do código: o
--    ativo nasce sem código, o gatilho 2 numera, e o item recebe o mesmo.
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
        -- 1º o ativo (o gatilho numera na série OPR-PAT), sem vínculo ainda.
        INSERT INTO public.opura_assets
            (organization_id, code, name, category, brand, model, brand_id, model_id,
             purchase_date, purchase_value, useful_life_months, residual_value, status, notes)
        VALUES
            (v_item.organization_id, NULL, coalesce(v_nome, v_item.input_description), p_categoria,
             v_item.brand, v_item.model, v_item.brand_id, v_item.model_id,
             CURRENT_DATE, coalesce(p_valor_unitario, 0), coalesce(p_vida_util_meses, 60), 0, 'disponivel',
             format('Patrimoniado a partir do item %s do almoxarifado.', v_item.input_code))
        RETURNING id, code INTO v_ativo, v_code;

        IF EXISTS (SELECT 1 FROM public.stock_items WHERE organization_id = v_item.organization_id AND input_code = v_code) THEN
            RAISE EXCEPTION 'O código % já é de um item do Almoxarifado que não é ativo — resolva antes de patrimoniar.', v_code;
        END IF;

        INSERT INTO public.stock_items
            (organization_id, input_code, input_description, input_unit, category, source,
             unit_cost_hint, brand_id, model_id, brand, model)
        VALUES
            (v_item.organization_id, v_code,
             public.fn_descricao_item_do_ativo(coalesce(v_nome, v_item.input_description), v_item.brand, v_item.model),
             'UN', public.fn_rotulo_categoria_ativo(p_categoria), 'ativos',
             NULLIF(p_valor_unitario, 0), v_item.brand_id, v_item.model_id, v_item.brand, v_item.model)
        RETURNING id INTO v_novo_item;

        -- O vínculo dispara a reconciliação: 1 UN no almoxarifado.
        UPDATE public.opura_assets
           SET stock_item_id = v_novo_item, warehouse_id = p_warehouse_id
         WHERE id = v_ativo;

        RETURN NEXT v_ativo;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_patrimoniar_item_de_estoque(UUID, UUID, INTEGER, TEXT, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_patrimoniar_item_de_estoque(UUID, UUID, INTEGER, TEXT, INTEGER, NUMERIC, TEXT) TO authenticated;
