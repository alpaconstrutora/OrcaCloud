# Credor no Financeiro: fornecedor OU colaborador

## Pedido original

> outra verificacao que fiz e merece verificação:
> em financeiro > contas a pagar > Novo pagamento avulso (escolhi a organizacao alpa constutora e incorporadora) e nenhum colaboradora aparece na lista de fornecedor / credor.
>
> Talvez um ponto de melhoria para não confundir. o conceito de Fornecedor e credor sao diferentes.
> então em financeiro os campo fornecedor deveria ser substituido por Credo, neste caso o credor poderia ser qualquer um, ( fornecedor e colaborador)
> Avalie
>
> Sessão: d303e8b9 · 2026-11-15

Depois da avaliação: **"aprovado"** (2026-11-15), com as duas recomendações abaixo.

## Por que não aparecia

`PagamentoAvulsoSheet` só carregava `supplierService.listSuppliers`. E o título a pagar
(`internal_transactions`) não tinha onde guardar "credor = colaborador": `supplier_id` é FK
de `suppliers`, e `party_id` é FK **só** de `clients` (`internal_txs_party_id_fkey`). A folha
identifica o colaborador pelo `reference_id` (`utils/pixDestino.ts › colaboradorDoTituloDaFolha`),
não por coluna. Medido em 15/11: os 28 títulos `party_type='EMPLOYEE'` têm `party_id` nulo.

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-11-15 | Em Financeiro, a contraparte do título a pagar é "Fornecedor" ou "Credor"? | **Credor** = fornecedor ou colaborador. Suprimentos continua "Fornecedor" (memória: Suprimentos nunca tem cliente; credor = fornecedor). |
| 2026-11-15 | Boletos passam a "Credor"? | **Não** — boleto é emitido por empresa cadastrada; fica "Fornecedor". |
| 2026-11-15 | Sócio como credor? | **Fora** desta etapa — o pró-labore tem fluxo próprio. |
| 2026-11-15 | Quais colaboradores o seletor oferece? | Os mesmos do Extrato (PR #462): ativos da organização do título + os disponibilizados para ela (`laborService.listCredoresColaboradoresDaOrg`). |

Decisões minhas:
- Coluna nova `internal_transactions.employee_id` (FK `employees`, `ON DELETE SET NULL`), com
  CHECK de que `supplier_id` e `employee_id` não convivem. `party_id` não serve: a FK é de clientes.
- Título com colaborador grava `party_type='EMPLOYEE'`, `party_name` = nome do colaborador.
- Escolhido o colaborador, Centro de Custo e Plano de Contas vazios são preenchidos com os do
  cadastro dele, se forem desta organização (memória: app já tem a informação → preenche).
- Notas Fiscais (Contas a Pagar) e Pagar via PIX (rótulo da ORIGEM da chave) continuam "Fornecedor":
  ali a palavra descreve a coisa certa.

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20271115900000_titulo_credor_colaborador.sql` | `employee_id` + FK + CHECK + índice parcial (sem backfill) | aplicada (pelo usuário); `information_schema` mostra a coluna; CHECK em `pg_constraint` |
| 2 | `utils/pagamentoAvulso.ts` + teste | `employeeId` no formulário; `montarTitulosAvulsos` grava `employee_id` e `party_type` EMPLOYEE/SUPPLIER | `__tests__/pagamentoAvulso.test.ts` cobre os dois casos |
| 3 | `services/payableService.ts` | `getAvulso`/`updateAvulso` leem e gravam `employee_id` | tsc + teste do item 2 |
| 4 | `services/laborService.ts` + teste | `listCredoresColaboradoresDaOrg` devolve também CC e plano do colaborador | teste existente ajustado |
| 5 | `components/financeiro/PagamentoAvulsoSheet.tsx` | campo **Credor**: fornecedores + colaboradores (`emp:<id>`), preenche CC/plano do colaborador | conferido na tela: org Alpa lista os colaboradores; salvar grava `employee_id` |
| 6 | `utils/pixDestino.ts` + teste | `favorecidoDoTitulo`: `employee_id` → colaborador | teste do pixDestino |
| 7 | `supabase/functions/_shared/asaasDisparo.ts` | `COLS` lê `employee_id` (o PIX só enxerga o que a Edge lê) | **deploy da `asaas-payment` pelo usuário** |
| 9 | `components/SmartReconciliationCenter.tsx`, `components/BankReconciliation.tsx` | rótulos "Fornecedor"/"cliente/fornecedor" → "Credor"/"cliente/credor" no lado a pagar | grep sem "fornecedor" nesses rótulos |

## Estado

- [ ] 1 migration escrita; **falta o usuário aplicar** (antes do merge — `getAvulso` lê a coluna)
- [x] 2 `pagamentoAvulso.test.ts` — 3 casos novos (colaborador, fornecedor, os dois)
- [x] 3 service lê/grava `employee_id` e `party_type`; tsc 0
- [x] 4 `listCredoresColaboradoresDaOrg` devolve CC/plano; teste confere o select
- [ ] 5 código pronto (campo "Credor", `emp:<id>`, CC/plano do colaborador); **falta conferir na tela** depois da migration
- [x] 6 `pixDestino.test.ts` — 2 casos novos
- [ ] 7 `COLS`/`TituloAPagar` com `employee_id`; **falta o deploy da `asaas-payment` pelo usuário** (depois da migration)
- [x] 9 "Credor" na Central de Conciliação; "cliente/credor" nas buscas e no filtro do Extrato
- (8 saiu — ver abaixo)

## Fora deste plano (registrado)

- **Item 8 (folha gravar `employee_id`) e backfill dos títulos da folha: retirados em 15/11.**
  `internal_transactions` tem gatilhos de UPDATE (`trg_block_period_internal_tx`,
  `trg_payable_competencia_fechada_ins`, `trg_titulo_volta_a_alcada`): atualizar título de
  folha em mês fechado seria recusado ou devolveria título à alçada, e a memória da folha manda
  não ressincronizar folha fechada. Não é necessário: o PIX da folha já acha o colaborador pelo
  `reference_id` (`colaboradorDoTituloDaFolha`), que segue como 2º caminho em `favorecidoDoTitulo`.

- Recibo de pagamento de título com colaborador: o documento (CPF) do credor no recibo vem do
  cadastro de fornecedor; para colaborador o recibo sai sem documento até ajustar a RPC.
- Financeiro do Condomínio (`components/condominio/FinanceiroTab.tsx`) mantém "Fornecedor".
