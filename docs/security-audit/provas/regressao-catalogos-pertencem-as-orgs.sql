-- VERIFICAÇÃO — "pertence a todas as organizações" do grupo, e a mais ninguém.
--
-- Compara três olhares sobre os mesmos catálogos:
--   1. membro de uma organização do grupo  → tem de ver TUDO (nada sumiu da tela)
--   2. usuário autenticado sem vínculo     → tem de ver só o seed de CLT
--   3. simulação do cliente #2             → idem, e é isso que a correção comprou
--
-- Somente leitura. A organização de teste do caso 3 é criada e descartada no
-- ROLLBACK — é o jeito de provar o comportamento com um tenant que ainda não
-- existe, sem criar tenant de verdade.
BEGIN;

SELECT set_config('v.membro', (SELECT email FROM organization_members ORDER BY email LIMIT 1), true);
-- ⚠️ `is_org_member` casa por `user_id = auth.uid()` quando user_id está
-- preenchido (é o caso de todos aqui), e só cai no e-mail quando é NULL.
-- Um JWT simulado só com email faria a função devolver FALSE e o teste
-- acusaria uma regressão que não existe. Por isso o `sub` vai junto.
SELECT set_config('v.membro_uid', (SELECT user_id::text FROM organization_members ORDER BY email LIMIT 1), true);

-- Organização e usuário do "cliente #2", só para a duração da transação.
INSERT INTO organizations (name) VALUES ('ZZ Cliente Dois (teste)');
INSERT INTO organization_members (organization_id, email, role)
SELECT id, 'cliente-dois@exemplo-invalido.test', 'owner'
  FROM organizations WHERE name = 'ZZ Cliente Dois (teste)';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_membro text := current_setting('v.membro');
    v_uid    text := current_setting('v.membro_uid');
    m_db int; m_it int; m_ru int;
    s_db int; s_it int; s_ru int;
    c_db int; c_it int; c_ru int;
BEGIN
    -- 1) Membro do grupo
    PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','email',v_membro,'sub',v_uid)::text, true);
    SELECT count(*) INTO m_db FROM custom_databases;
    SELECT count(*) INTO m_it FROM custom_items;
    SELECT count(*) INTO m_ru FROM rubrics;

    -- 2) Autenticado sem vínculo nenhum
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"ninguem@exemplo-invalido.test"}', true);
    SELECT count(*) INTO s_db FROM custom_databases;
    SELECT count(*) INTO s_it FROM custom_items;
    SELECT count(*) INTO s_ru FROM rubrics;

    -- 3) Cliente #2: owner da própria organização, nenhum vínculo com o grupo
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"cliente-dois@exemplo-invalido.test"}', true);
    SELECT count(*) INTO c_db FROM custom_databases;
    SELECT count(*) INTO c_it FROM custom_items;
    SELECT count(*) INTO c_ru FROM rubrics;

    RAISE EXCEPTION E'\n=== CATALOGOS: pertencem as organizacoes do grupo ===\n'
        '                          | bases | itens | rubricas\n'
        '  membro do grupo (%)  | %     | %    | %\n'
        '  autenticado sem vinculo  | %     | %    | %\n'
        '  CLIENTE #2 (org propria) | %     | %    | %\n'
        '\n'
        'Esperado: linha 1 ve tudo; linhas 2 e 3 veem 0 bases, 0 itens e\n'
        'apenas as rubricas de CLT (seed do sistema, organization_id NULL).\n'
        '=== fim ===',
        v_membro, m_db, m_it, m_ru, s_db, s_it, s_ru, c_db, c_it, c_ru;
END $$;

ROLLBACK;
