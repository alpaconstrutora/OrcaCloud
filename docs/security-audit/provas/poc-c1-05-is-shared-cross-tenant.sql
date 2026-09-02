-- PROVA C1-05 — a perna `OR is_shared` das policies de leitura ignora a organização.
-- Somente leitura: nenhuma escrita, nenhuma transação a desfazer.
BEGIN;

-- Usuário autenticado QUALQUER, sem nenhum vínculo em organization_members.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"poc-auditoria@exemplo-invalido.test","sub":"00000000-0000-0000-0000-0000000000ff"}';

SELECT 'clients'            AS tabela, count(*) AS linhas_visiveis,
       count(DISTINCT organization_id) AS orgs_alcancadas FROM clients
UNION ALL
SELECT 'suppliers',           count(*), count(DISTINCT organization_id) FROM suppliers
UNION ALL
SELECT 'partner_workspaces',  count(*), count(DISTINCT organization_id) FROM partner_workspaces
UNION ALL
SELECT 'organizations (controle)', count(*), count(DISTINCT id) FROM organizations;

ROLLBACK;
