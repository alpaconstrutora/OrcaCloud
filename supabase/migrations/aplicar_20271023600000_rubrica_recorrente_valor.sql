-- Colaborador › Folha de Pagamento: rubrica recorrente com VALOR (R$ ou % do salário)
-- Plano: docs/planos/2026-10-22-rh-folha-adicionar-rubricas.md (Pedido posterior 23/10)
--
-- ⚠️ Nasceu como aplicar_20271023300000_rubrica_recorrente_valor.sql e foi APLICADA
-- no remoto com esse nome (23/10/2026). No rebase colidiu com
-- aplicar_20271023300000_preferencias.sql (#113) e foi renomeada. É idempotente
-- (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS / CREATE OR REPLACE): reaplicar não muda nada.
--
-- O vínculo colaborador↔rubrica só guardava o código, e o motor só lançava
-- rubrica "Automática" — 19 das 33 rubricas são de cálculo manual (Gratificação,
-- Hora Extra, prêmios…) e nunca podiam ser recorrentes. Agora o vínculo leva
-- o valor do colaborador: valor_tipo 'fixo' (R$/mês) ou 'percentual' (% do
-- salário da competência, guardado em PONTOS: 10 = 10%). Os dois NULL = usa o
-- cálculo da própria rubrica, como antes — os vínculos existentes não mudam.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): nenhuma policy nova; a tabela segue com
--     employee_automatic_rubrics_org_access = is_org_member(org_id).
--   Pergunta 2 (quem executa): as duas funções são SECURITY DEFINER e checam
--     can_access_employee + is_org_member antes de gravar; EXECUTE só para
--     authenticated (REVOKE de PUBLIC e anon).

BEGIN;

ALTER TABLE public.employee_automatic_rubrics
    ADD COLUMN IF NOT EXISTS valor_tipo text,
    ADD COLUMN IF NOT EXISTS valor numeric(14,4);

ALTER TABLE public.employee_automatic_rubrics
    DROP CONSTRAINT IF EXISTS employee_automatic_rubrics_valor_ck;
-- `valor IS NOT NULL` explícito: num CHECK, `NULL >= 0` dá NULL e NULL PASSA —
-- sem ele, 'fixo' com valor vazio era aceito (provado no banco, 23/10/2026).
ALTER TABLE public.employee_automatic_rubrics
    ADD CONSTRAINT employee_automatic_rubrics_valor_ck CHECK (
        (valor_tipo IS NULL AND valor IS NULL)
        OR (valor_tipo = 'fixo' AND valor IS NOT NULL AND valor >= 0)
        OR (valor_tipo = 'percentual' AND valor IS NOT NULL AND valor >= 0 AND valor <= 100)
    );

COMMENT ON COLUMN public.employee_automatic_rubrics.valor_tipo IS
    'fixo = R$ por mês; percentual = % do salário da competência. NULL = cálculo da própria rubrica.';
COMMENT ON COLUMN public.employee_automatic_rubrics.valor IS
    'Valor do colaborador: R$ (fixo) ou pontos percentuais (percentual, 10 = 10%).';

-- ── Gravação nova: a lista inteira com valor, numa transação ────────────────
CREATE OR REPLACE FUNCTION public.salvar_rubricas_recorrentes_colaborador(p_employee_id uuid, p_org_id uuid, p_rubricas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_access_employee(p_employee_id) OR NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'Sem permissão para alterar as rubricas deste colaborador.'
            USING ERRCODE = '42501';
    END IF;
    IF p_rubricas IS NOT NULL AND jsonb_typeof(p_rubricas) <> 'array' THEN
        RAISE EXCEPTION 'p_rubricas deve ser uma lista.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.employee_automatic_rubrics
    WHERE employee_id = p_employee_id;

    -- Código inexistente cai na FK; valor fora da regra, no CHECK.
    INSERT INTO public.employee_automatic_rubrics (employee_id, rubric_code, org_id, valor_tipo, valor)
    SELECT DISTINCT ON (x.code) p_employee_id, x.code, p_org_id, NULLIF(x.valor_tipo, ''), x.valor
    FROM   jsonb_to_recordset(COALESCE(p_rubricas, '[]'::jsonb)) AS x(code text, valor_tipo text, valor numeric)
    WHERE  x.code IS NOT NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.salvar_rubricas_recorrentes_colaborador(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_rubricas_recorrentes_colaborador(uuid, uuid, jsonb) TO authenticated;

-- ── Gravação antiga (só códigos): continua para o bundle em cache do navegador,
-- mas não apaga mais o valor dos códigos que permanecem ─────────────────────
CREATE OR REPLACE FUNCTION public.update_employee_rubrics(p_employee_id uuid, p_rubric_codes text[], p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.can_access_employee(p_employee_id) OR NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'Sem permissão para alterar as rubricas deste colaborador.'
            USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.employee_automatic_rubrics
    WHERE employee_id = p_employee_id
      AND rubric_code <> ALL (COALESCE(p_rubric_codes, '{}'::text[]));

    IF array_length(p_rubric_codes, 1) > 0 THEN
        INSERT INTO public.employee_automatic_rubrics (employee_id, rubric_code, org_id)
        SELECT p_employee_id, code, p_org_id
        FROM   unnest(p_rubric_codes) AS code
        ON CONFLICT (employee_id, rubric_code) DO NOTHING;
    END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.update_employee_rubrics(uuid, text[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_employee_rubrics(uuid, text[], uuid) TO authenticated;

COMMIT;
