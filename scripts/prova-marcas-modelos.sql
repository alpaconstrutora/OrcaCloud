-- ============================================================================
-- PROVA · Marcas e Modelos — gatilhos de espelho e FKs compostas
-- (aplicar_20271013000100_catalogo_marcas_modelos.sql)
--
-- Uso: npx supabase db query --linked -f scripts/prova-marcas-modelos.sql
--
-- NÃO grava nada: tudo roda num único DO que termina SEMPRE em exceção — a
-- mensagem "PROVA_OK" (sucesso) ou "FALHOU: ..." (o primeiro assert que
-- quebrou). Exceção desfaz o bloco inteiro. `db query` só devolve o último
-- resultado, por isso o veredito vai na mensagem de erro.
-- ============================================================================
DO $prova$
DECLARE
    org_a UUID;
    org_b UUID;
    b1 UUID; b2 UUID; bx UUID;
    m1 UUID; m2 UUID;
    ativo UUID;
    item UUID;
    r RECORD;
BEGIN
    SELECT id INTO org_a FROM organizations ORDER BY created_at LIMIT 1;
    SELECT id INTO org_b FROM organizations WHERE id <> org_a ORDER BY created_at LIMIT 1;

    INSERT INTO product_brands (organization_id, name) VALUES (org_a, 'ZZProva Marca Um') RETURNING id INTO b1;
    INSERT INTO product_brands (organization_id, name) VALUES (org_a, 'ZZProva Marca Dois') RETURNING id INTO b2;
    INSERT INTO product_brands (organization_id, name) VALUES (org_b, 'ZZProva Marca Outra Org') RETURNING id INTO bx;
    INSERT INTO product_models (organization_id, brand_id, name) VALUES (org_a, b1, 'ZZ-100') RETURNING id INTO m1;
    INSERT INTO product_models (organization_id, brand_id, name) VALUES (org_a, b2, 'ZZ-200') RETURNING id INTO m2;

    -- 0 · INSERT com ids → texto espelhado
    INSERT INTO opura_assets (organization_id, code, name, category, status, purchase_value, brand_id, model_id)
    VALUES (org_a, 'ZZPROVA-1', 'Ativo prova', 'equipamento', 'disponivel', 0, b1, m1) RETURNING id INTO ativo;
    SELECT brand, model INTO r FROM opura_assets WHERE id = ativo;
    IF r.brand IS DISTINCT FROM 'ZZProva Marca Um' OR r.model IS DISTINCT FROM 'ZZ-100' THEN
        RAISE EXCEPTION 'FALHOU 0: espelho no INSERT (%/%)', r.brand, r.model; END IF;

    INSERT INTO stock_items (organization_id, input_description, input_unit, brand_id, model_id)
    VALUES (org_a, 'Item prova', 'UN', b1, m1) RETURNING id INTO item;

    -- 1 · renomear marca e modelo propaga para ativo e item
    UPDATE product_brands SET name = 'ZZProva Marca Renomeada' WHERE id = b1;
    UPDATE product_models SET name = 'ZZ-101' WHERE id = m1;
    SELECT brand, model, brand_id, model_id INTO r FROM opura_assets WHERE id = ativo;
    IF r.brand <> 'ZZProva Marca Renomeada' OR r.model <> 'ZZ-101' OR r.brand_id <> b1 OR r.model_id <> m1 THEN
        RAISE EXCEPTION 'FALHOU 1a: renomear no ativo (% / % / %)', r.brand, r.model, r.model_id; END IF;
    SELECT brand, model INTO r FROM stock_items WHERE id = item;
    IF r.brand <> 'ZZProva Marca Renomeada' OR r.model <> 'ZZ-101' THEN
        RAISE EXCEPTION 'FALHOU 1b: renomear no item (%/%)', r.brand, r.model; END IF;

    -- 2 · marca de OUTRA organização é rejeitada pela FK composta
    BEGIN
        UPDATE opura_assets SET brand_id = bx, model_id = NULL WHERE id = ativo;
        RAISE EXCEPTION 'FALHOU 2: aceitou marca de outra org';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- 3 · trocar o MODELO para um de outra marca: a marca segue o modelo
    UPDATE opura_assets SET model_id = m2 WHERE id = ativo;
    SELECT brand_id, brand, model INTO r FROM opura_assets WHERE id = ativo;
    IF r.brand_id <> b2 OR r.brand <> 'ZZProva Marca Dois' OR r.model <> 'ZZ-200' THEN
        RAISE EXCEPTION 'FALHOU 3a: marca não seguiu o modelo (%/%)', r.brand, r.model; END IF;
    --     trocar a MARCA mantendo o modelo antigo: o modelo sai, o texto fica
    UPDATE opura_assets SET brand_id = b1 WHERE id = ativo;
    SELECT brand_id, model_id, brand, model INTO r FROM opura_assets WHERE id = ativo;
    IF r.brand_id <> b1 OR r.model_id IS NOT NULL OR r.model <> 'ZZ-200' THEN
        RAISE EXCEPTION 'FALHOU 3b: modelo de outra marca não saiu (% / %)', r.model_id, r.model; END IF;

    -- 4 · texto alterado sem id (edição em lote / cliente antigo) revincula
    UPDATE opura_assets SET brand = 'zzprova   marca dois', model = 'zz-200' WHERE id = ativo;
    SELECT brand_id, model_id, brand, model INTO r FROM opura_assets WHERE id = ativo;
    IF r.brand_id <> b2 OR r.model_id <> m2 OR r.brand <> 'ZZProva Marca Dois' THEN
        RAISE EXCEPTION 'FALHOU 4a: texto não revinculou (% / %)', r.brand_id, r.model_id; END IF;
    --     texto que não existe no catálogo desvincula e mantém o que foi digitado
    UPDATE opura_assets SET brand = 'ZZ Sem Cadastro', model = 'X' WHERE id = ativo;
    SELECT brand_id, model_id, brand INTO r FROM opura_assets WHERE id = ativo;
    IF r.brand_id IS NOT NULL OR r.model_id IS NOT NULL OR r.brand <> 'ZZ Sem Cadastro' THEN
        RAISE EXCEPTION 'FALHOU 4b: texto livre não desvinculou'; END IF;

    -- 5 · excluir o modelo mantém o texto no item
    DELETE FROM product_models WHERE id = m1;
    SELECT model_id, model, brand_id INTO r FROM stock_items WHERE id = item;
    IF r.model_id IS NOT NULL OR r.model <> 'ZZ-101' OR r.brand_id <> b1 THEN
        RAISE EXCEPTION 'FALHOU 5: excluir modelo (% / %)', r.model_id, r.model; END IF;
    --     marca com modelo não se exclui
    BEGIN
        DELETE FROM product_brands WHERE id = b2;
        RAISE EXCEPTION 'FALHOU 5b: excluiu marca com modelo';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- 6 · mover o modelo de marca leva os ativos junto (ON UPDATE CASCADE)
    UPDATE opura_assets SET brand_id = b2, model_id = m2 WHERE id = ativo;
    UPDATE product_models SET brand_id = b1 WHERE id = m2;
    SELECT brand_id, brand, model_id INTO r FROM opura_assets WHERE id = ativo;
    IF r.brand_id <> b1 OR r.brand <> 'ZZProva Marca Renomeada' OR r.model_id <> m2 THEN
        RAISE EXCEPTION 'FALHOU 6: mover modelo de marca (% / %)', r.brand, r.model_id; END IF;

    -- 7 · INSERT só com texto vincula o que existe e NÃO cria
    INSERT INTO opura_assets (organization_id, code, name, category, status, purchase_value, brand, model)
    VALUES (org_a, 'ZZPROVA-2', 'Ativo prova 2', 'equipamento', 'disponivel', 0, 'ZZPROVA MARCA DOIS', 'nao existe')
    RETURNING id INTO ativo;
    SELECT brand_id, model_id, brand, model INTO r FROM opura_assets WHERE id = ativo;
    IF r.brand_id <> b2 OR r.model_id IS NOT NULL OR r.model <> 'nao existe' THEN
        RAISE EXCEPTION 'FALHOU 7: INSERT só com texto'; END IF;
    IF EXISTS (SELECT 1 FROM product_models WHERE name_key = 'nao existe') THEN
        RAISE EXCEPTION 'FALHOU 7b: gatilho criou modelo'; END IF;

    RAISE EXCEPTION 'PROVA_OK: 7 grupos de asserts passaram (nada foi gravado)';
END;
$prova$;
