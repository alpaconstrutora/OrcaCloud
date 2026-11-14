# Meus Fornecedores — propagar a edição pelo app

## Pedido original (14/11/2026)

> implemente a mesma funcionalidade em minha organização > meus fornecedores

"A mesma funcionalidade" = a de Meus Clientes (#405 e #432): ao salvar a edição
do nome ou do e-mail, a tela pergunta "Propagar … pelo app?" e corrige as cópias
de texto. Quando não há cópia, ela avisa "nada a propagar".

## Diagnóstico (banco, 14/11/2026)

Medido em `information_schema` e nos dados:

| tabela                 | vínculo                          | cópia de texto                   | decisão |
|------------------------|----------------------------------|----------------------------------|---------|
| internal_transactions  | supplier_id (party_id: 0 linhas sem supplier_id) | party_name, entity_name, party_email | **propaga** |
| supplier_payments      | supplier_id                      | beneficiary_name                 | fora: titular da conta no momento do pagamento (dado bancário) |
| supplier_bank_accounts | supplier_id                      | beneficiary_name                 | fora: titular da conta, que pode ser outra pessoa |
| boletos                | supplier_id                      | beneficiario_nome                | fora: lido do documento |
| nfe_invoices           | —                                | issuer_name                      | fora: documento emitido |
| financial_receipts     | —                                | issuer_name                      | fora: documento emitido |
| credit_rooms, reconciliation_* , sindico_financeiro_eventos | id | nome | 0 linhas ligadas a fornecedor hoje |

Os demais módulos (Suprimentos, Contratos, Ativos, Documentos…) guardam só o
`supplier_id` e leem o nome na hora.

Das 534 linhas do financeiro com `supplier_id`, 296 têm nome diferente do
cadastro. 295 delas são de origem BOLETO: 162 vazias e 133 com o bloco de OCR. As
telas já resolvem o nome por `supplier_id` primeiro; mesmo assim, a cópia vazia
ou o OCR aparecem em quem lê `party_name` direto.

**Regra para BOLETO:** troca só o `party_name`. O `entity_name` fica com o
beneficiário lido do documento, porque a conciliação o usa para comparar
(`utils/reconciliationRules.ts`).

**Regra para RASCUNHO (vale também para clientes):** uma conta a pagar
DEBIT/PENDING/RASCUNHO não é alterada. O gatilho `trg_titulo_volta_a_alcada`
põe em PENDENTE qualquer rascunho alterado, seja qual for a coluna, e trocar o
nome não pode submeter o título para a aprovação. A pergunta informa quantos
ficaram de fora. Simulado com a RLS do usuário: os 28 rascunhos são todos de
"Débora Cristina Duarte"; Energisa (120 títulos) e MN Elevadores (84) mudariam
inteiros.

## Itens

1. [x] Hook `useOferecerPropagacao`: o fluxo pergunta/aviso/aplicar sai do
   ClientList, que passa a usá-lo (os testes de #432 continuam verdes).
2. [x] `supplierPropagacaoService.planejar`, que lê o financeiro por `supplier_id` ou `party_id`.
3. [x] SupplierList: o handleEdit oferece propagar. O "antes" é o último valor
   gravado, não o `formState` velho, para que um segundo salvamento não repita
   a comparação contra o valor de antes da primeira edição.
4. [x] Testes de tela em Meus Fornecedores, cobrindo pergunta, "nada a propagar" e erro.
