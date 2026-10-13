-- scripts/teste-codigo-patrimonial.sql
-- Asserções do código patrimonial único e sequencial
-- (docs/planos/2026-10-13-codigo-patrimonial-unico.md, item 4).
--
-- BEGIN … ROLLBACK: não grava nada. Falha = RAISE EXCEPTION 'FALHOU: …';
-- sucesso = a linha final 'TUDO OK' (`db query` só devolve o último resultado).
--
--   npx supabase db query --linked -f scripts/teste-codigo-patrimonial.sql
--
-- Para ensaiar a migration ANTES de aplicá-la, gere um arquivo com o conteúdo
-- dela no lugar da linha MIGRATION abaixo.

BEGIN;
-- MIGRATION

CREATE FUNCTION pg_temp.confere(p_ok BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

DO $$
DECLARE
    org UUID; org2 UUID; n BIGINT; v TEXT; esperado TEXT; a1 UUID;
BEGIN
    -- ── a série existente: OPR-PAT contígua de 1 a N em cada organização ──────
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM (
            SELECT organization_id,
                   substring(code FROM '^OPR-PAT-(\d+)$')::BIGINT AS num,
                   row_number() OVER (PARTITION BY organization_id ORDER BY substring(code FROM '^OPR-PAT-(\d+)$')::BIGINT) AS pos
              FROM public.opura_assets WHERE code ~ '^OPR-PAT-\d+$'
        ) s WHERE s.num <> s.pos), 'OPR-PAT contígua de 000001 a N, sem buraco nem repetição');
    PERFORM pg_temp.confere(NOT EXISTS (SELECT 1 FROM public.opura_assets WHERE code ~ '^OPR-PAT-\d{7,}$' OR code <> upper(btrim(code))),
        'nenhum código fora do formato normalizado');
    PERFORM pg_temp.confere((SELECT count(*) FROM public.opura_assets_renumeracao_20271013)
        = (SELECT count(*) FROM public.opura_assets a JOIN public.opura_assets_renumeracao_20271013 r ON r.asset_id = a.id AND r.codigo_novo = a.code),
        'tabela de reversão bate com os códigos atuais');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM public.opura_assets a JOIN public.stock_items i ON i.id = a.stock_item_id WHERE i.input_code <> a.code),
        'item vinculado tem o mesmo código do ativo');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM public.opura_assets_renumeracao_20271013 r
          JOIN public.internal_transactions t ON t.organization_id = r.organization_id
         WHERE r.codigo_antigo <> r.codigo_novo AND t.description LIKE '%' || r.codigo_antigo || '%'),
        'nenhum título ficou com o código antigo no texto');
    PERFORM pg_temp.confere(NOT EXISTS (
        SELECT 1 FROM public.opura_assets_renumeracao_20271013 r JOIN public.opura_assets a ON a.id = r.asset_id
         WHERE r.codigo_antigo <> r.codigo_novo AND a.codigo_anterior IS DISTINCT FROM r.codigo_antigo),
        'codigo_anterior guarda o código da etiqueta antiga');

    -- ── o gerador ────────────────────────────────────────────────────────────
    SELECT organization_id INTO org FROM public.opura_assets ORDER BY created_at LIMIT 1;
    SELECT id INTO org2 FROM public.organizations WHERE id <> org LIMIT 1;

    SELECT coalesce(max(substring(code FROM '^OPR-PAT-(\d+)$')::BIGINT), 0) INTO n
      FROM public.opura_assets WHERE organization_id = org AND code ~ '^OPR-PAT-\d+$';
    INSERT INTO public.opura_assets (organization_id, name, category) VALUES (org, 'TST cod 1', 'ferramenta') RETURNING code INTO v;
    esperado := 'OPR-PAT-' || lpad((n + 1)::TEXT, 6, '0');
    PERFORM pg_temp.confere(v = esperado, format('sem código → %s (veio %s)', esperado, v));
    INSERT INTO public.opura_assets (organization_id, code, name, category) VALUES (org, '', 'TST cod 2', 'ferramenta') RETURNING code INTO v;
    esperado := 'OPR-PAT-' || lpad((n + 2)::TEXT, 6, '0');
    PERFORM pg_temp.confere(v = esperado, format('código vazio → %s (veio %s)', esperado, v));
    PERFORM pg_temp.confere((SELECT tracking_code FROM public.opura_assets WHERE organization_id = org AND code = v) = v, 'tracking_code acompanha');

    INSERT INTO public.opura_assets (organization_id, code, name, category) VALUES (org, '  opr-pat-900200 ', 'TST manual', 'ferramenta') RETURNING id, code INTO a1, v;
    PERFORM pg_temp.confere(v = 'OPR-PAT-900200', 'manual é normalizado (veio ' || v || ')');
    INSERT INTO public.opura_assets (organization_id, name, category) VALUES (org, 'TST cod 3', 'ferramenta') RETURNING code INTO v;
    PERFORM pg_temp.confere(v = 'OPR-PAT-900201', 'manual entra na série: próximo é 900201 (veio ' || v || ')');

    BEGIN
        INSERT INTO public.opura_assets (organization_id, code, name, category) VALUES (org, 'Opr-Pat-900200', 'TST dup', 'ferramenta');
        RAISE EXCEPTION 'FALHOU: duplicata com outra caixa passou';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    UPDATE public.opura_assets SET code = '   ' WHERE id = a1;
    PERFORM pg_temp.confere((SELECT code FROM public.opura_assets WHERE id = a1) = 'OPR-PAT-900200', 'apagar o código num UPDATE mantém o que era');

    SELECT coalesce(max(substring(code FROM '^OPR-PRE-(\d+)$')::BIGINT), 0) INTO n
      FROM public.opura_assets WHERE organization_id = org AND code ~ '^OPR-PRE-\d+$';
    INSERT INTO public.opura_assets (organization_id, name, category) VALUES (org, 'TST predial', 'sistema_predial') RETURNING code INTO v;
    esperado := 'OPR-PRE-' || lpad((n + 1)::TEXT, 4, '0');
    PERFORM pg_temp.confere(v = esperado, format('predial na série própria → %s (veio %s)', esperado, v));

    IF org2 IS NOT NULL THEN
        INSERT INTO public.opura_assets (organization_id, code, name, category) VALUES (org2, 'OPR-PAT-900200', 'TST outra org', 'ferramenta') RETURNING code INTO v;
        PERFORM pg_temp.confere(v = 'OPR-PAT-900200', 'outra organização pode repetir o número');
    END IF;
END $$;

ROLLBACK;
SELECT 'TUDO OK' AS resultado;
