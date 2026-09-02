-- PROVA / REGRESSÃO C1-05 — `is_shared` agora diz COM QUEM.
--
-- ANTES da aplicar_20270918000019, as três policies terminavam em
-- `OR is_shared`, um booleano sem destino. Um usuário autenticado SEM VÍNCULO
-- NENHUM lia 7 clientes, 119 fornecedores e 1 workspace de parceiro.
--
-- DEPOIS, o compartilhamento é enumerado em `client_org_shares` /
-- `supplier_org_shares`, e o workspace herda do fornecedor.
--
-- Este script compara três olhares e cria um "cliente #2" descartado no
-- ROLLBACK — é o jeito de provar o comportamento com um tenant que ainda não
-- existe, sem criar tenant de verdade.
--
-- Esperado:
--   membro do grupo          → continua vendo os compartilhados (nada sumiu)
--   autenticado sem vínculo  → 0 / 0 / 0
--   cliente #2               → 0 / 0 / 0
BEGIN;

SELECT set_config('v.membro',     (SELECT email FROM organization_members ORDER BY email LIMIT 1), true);
-- ⚠️ `is_org_member` casa por `user_id = auth.uid()` quando user_id está
-- preenchido, e só cai no e-mail quando é NULL. JWT simulado só com e-mail faria
-- a função devolver FALSE e a prova acusaria regressão inexistente.
SELECT set_config('v.membro_uid', (SELECT user_id::text FROM organization_members ORDER BY email LIMIT 1), true);

INSERT INTO organizations (name) VALUES ('ZZ Cliente Dois (teste)');
INSERT INTO organization_members (organization_id, email, role)
SELECT id, 'cliente-dois@exemplo-invalido.test', 'owner'
  FROM organizations WHERE name = 'ZZ Cliente Dois (teste)';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_membro text := current_setting('v.membro');
    v_uid    text := current_setting('v.membro_uid');
    m_c int; m_s int; m_w int;
    n_c int; n_s int; n_w int;
    d_c int; d_s int; d_w int;
BEGIN
    -- 1) Membro do grupo
    PERFORM set_config('request.jwt.claims',
        json_build_object('role','authenticated','email',v_membro,'sub',v_uid)::text, true);
    SELECT count(*) INTO m_c FROM clients;
    SELECT count(*) INTO m_s FROM suppliers;
    SELECT count(*) INTO m_w FROM partner_workspaces;

    -- 2) Autenticado sem vínculo nenhum
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"ninguem@exemplo-invalido.test"}', true);
    SELECT count(*) INTO n_c FROM clients;
    SELECT count(*) INTO n_s FROM suppliers;
    SELECT count(*) INTO n_w FROM partner_workspaces;

    -- 3) Cliente #2, owner da própria organização
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"cliente-dois@exemplo-invalido.test"}', true);
    SELECT count(*) INTO d_c FROM clients;
    SELECT count(*) INTO d_s FROM suppliers;
    SELECT count(*) INTO d_w FROM partner_workspaces;

    RAISE EXCEPTION E'\n=== C1-05: is_shared com destino ===\n'
        '                          | clientes | fornecedores | workspaces\n'
        '  membro do grupo         | %       | %          | %\n'
        '  autenticado sem vinculo | %       | %          | %\n'
        '  CLIENTE #2              | %       | %          | %\n'
        '\n'
        'Antes da correcao, as linhas 2 e 3 liam 7 / 119 / 1.\n'
        '=== fim ===',
        m_c, m_s, m_w, n_c, n_s, n_w, d_c, d_s, d_w;
END $$;

ROLLBACK;
