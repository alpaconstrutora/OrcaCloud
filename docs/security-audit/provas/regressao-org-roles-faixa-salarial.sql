-- PROVA / REGRESSÃO — faixa salarial de cargo é visível só para admin.
--
-- ANTES da aplicar_20270918000025, `salario_minimo` e `salario_maximo` moravam
-- em `org_roles`, cuja policy de SELECT é `check_user_belongs_to_company` — sem
-- recorte de papel. Qualquer colaborador da empresa lia a faixa de TODOS os
-- cargos. Esconder no frontend não adiantaria: o valor vinha no JSON do
-- PostgREST, visível no DevTools.
--
-- DEPOIS, as duas colunas viraram linhas em `org_role_salary_bands`, com policy
-- `check_user_is_admin_of_company`. A RLS recorta linha, não coluna — então a
-- coluna precisou virar linha para a RLS poder fazer seu trabalho.
--
-- `check_user_belongs_to_company` e `check_user_is_admin_of_company` casam por
-- `auth.jwt() ->> 'email'` (não por uid), então o JWT simulado só precisa do
-- e-mail. O colaborador comum é criado e descartado no ROLLBACK.
--
-- Esperado:
--   admin da empresa      → vê as faixas E os cargos
--   colaborador da mesma  → vê os cargos, 0 faixas
BEGIN;

SELECT set_config('v.company', (SELECT c.id::text
                                  FROM companies c
                                  JOIN org_role_salary_bands b ON b.company_id = c.id
                                 LIMIT 1), true);

SELECT set_config('v.admin', (SELECT m.email
                                FROM organization_members m
                                JOIN companies c ON c.org_id = m.organization_id
                               WHERE c.id = current_setting('v.company')::uuid
                                 AND m.role IN ('owner','admin')
                               LIMIT 1), true);

-- Colaborador comum da MESMA organização, criado só para esta prova.
INSERT INTO organization_members (organization_id, email, role)
SELECT c.org_id, 'colaborador-comum@exemplo-invalido.test', 'member'
  FROM companies c WHERE c.id = current_setting('v.company')::uuid;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_comp uuid := current_setting('v.company')::uuid;
    v_adm  text := current_setting('v.admin');
    a_cargos int; a_faixas int;
    c_cargos int; c_faixas int;
BEGIN
    -- 1) Admin da empresa
    PERFORM set_config('request.jwt.claims',
        json_build_object('role','authenticated','email',v_adm)::text, true);
    SELECT count(*) INTO a_cargos FROM org_roles            WHERE company_id = v_comp;
    SELECT count(*) INTO a_faixas FROM org_role_salary_bands WHERE company_id = v_comp;

    -- 2) Colaborador comum da mesma organização
    PERFORM set_config('request.jwt.claims',
        '{"role":"authenticated","email":"colaborador-comum@exemplo-invalido.test"}', true);
    SELECT count(*) INTO c_cargos FROM org_roles            WHERE company_id = v_comp;
    SELECT count(*) INTO c_faixas FROM org_role_salary_bands WHERE company_id = v_comp;

    RAISE EXCEPTION E'\n=== faixa salarial de cargo ===\n'
        '                     | cargos | faixas\n'
        '  admin da empresa   | %     | %\n'
        '  colaborador comum  | %     | %\n'
        '\n'
        'Esperado: colaborador enxerga os cargos e ZERO faixas.\n'
        'Antes da correcao ele lia a faixa de todos os cargos, junto com o cargo.\n'
        '=== fim ===',
        a_cargos, a_faixas, c_cargos, c_faixas;
END $$;

ROLLBACK;
