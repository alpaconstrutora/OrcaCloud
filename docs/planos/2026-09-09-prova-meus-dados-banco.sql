-- "Meus dados" do parceiro — o bloco bancário. Nenhum fornecedor com portal de
-- parceiro tem conta cadastrada na base, então a única forma de provar que o
-- núcleo entrega as contas é inserir uma dentro de ROLLBACK.
-- Prova também a regra combinada: conta 'inativo' NÃO sai.
BEGIN;

INSERT INTO supplier_bank_accounts
    (supplier_id, organization_id, bank_code, bank_name, agency, account, account_digit,
     account_type, beneficiary_name, pix_key, pix_key_type, is_primary, is_pix_primary, status)
SELECT pw.supplier_id, pw.organization_id, '001', 'Banco do Brasil', '1234', '56789', '0',
       'corrente', s.name, 'contato@teste.com.br', 'email', TRUE, TRUE, 'ativo'
FROM partner_workspaces pw JOIN suppliers s ON s.id = pw.supplier_id
WHERE pw.id = '07bf4dc6-7f83-4b8a-9c1a-a4d8ca241a33';

INSERT INTO supplier_bank_accounts
    (supplier_id, organization_id, bank_code, bank_name, agency, account,
     beneficiary_name, is_primary, status)
SELECT pw.supplier_id, pw.organization_id, '999', 'Banco Desativado', '0000', '00000',
       s.name, FALSE, 'inativo'
FROM partner_workspaces pw JOIN suppliers s ON s.id = pw.supplier_id
WHERE pw.id = '07bf4dc6-7f83-4b8a-9c1a-a4d8ca241a33';

SELECT
    jsonb_array_length(p->'bank_accounts')                          AS contas_devolvidas,
    p->'bank_accounts'->0->>'bank_name'                             AS banco,
    p->'bank_accounts'->0->>'pix_key'                               AS pix,
    (p::text LIKE '%Banco Desativado%')                             AS vazou_inativa,
    (SELECT count(*) FROM supplier_bank_accounts b
      JOIN partner_workspaces pw ON pw.supplier_id = b.supplier_id
     WHERE pw.id = '07bf4dc6-7f83-4b8a-9c1a-a4d8ca241a33')          AS contas_na_tabela
FROM (SELECT public.partner_ws_supplier_profile('07bf4dc6-7f83-4b8a-9c1a-a4d8ca241a33') AS p) x;

ROLLBACK;
