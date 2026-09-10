# Seletor de Centro de Custo — um padrão para o app inteiro

## Pedido original

> Propague pelo app esse padrao UI/UX para o centro de custo
>
> Sessão 8a772665 · 2026-09-10

Contexto do "esse padrão" (mesma sessão, pedidos anteriores, já no ar em `50580cb`):

> 1. O design deve ser o mesmo empregado em minha organizacao < centro de custo.
> (incluir accordion e sem prenenchimento com cores.

Ou seja: o campo de Centro de Custo abre um **drawer lateral com busca**, e a lista
dentro dele tem o **mesmo desenho da tela Minha Organização › Centro de Custo**
(`CostCenterModule`): accordion por grupo, código em texto simples, sem badge
colorido; buscando, lista chata com o grupo em cinza antes do nome. Implementado
primeiro em Boletos a Pagar (`BoletoFormModal`) via `HierarchicalSelect` com
`parentId`/`parentName`.

## Decisões tomadas

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-10 | Cada tela monta os itens por conta própria? | Não. Um componente só, `components/CostCenterSelect.tsx`, recebe a lista crua (de `listCostCenters`, `costCenterService.list` ou `payrollService.listCostCenters`) e resolve grupo/filho, título e textos. Tela nova usa ele e nasce certa. |
| 2026-09-10 | Onde o padrão NÃO se aplica? | (a) `<select>` **inline em célula de tabela** (guia §7.1 — Extrato, alocações de dívida): editar na linha é outro padrão. (b) **Filtro de toolbar** (Fechamento por CC — "Todos os centros / grupos / centros"): filtra a tela, não escolhe um valor de registro. (c) Barra escura de **ação em lote do Extrato** (`bulk-costcenter-select`): estilo próprio da barra; fica listado para decisão futura. (d) Aba Vinculações do Empreendimento: já é um Sheet próprio de "vincular" com criação. |
| 2026-09-10 | Campo compacto em barra de cabeçalho (folha de pagamento)? | `HierarchicalSelect` ganha `size="sm"` (gatilho h-9, mesmo recorte dos outros controles da barra). |

## Plano

Um item por arquivo. Critério de pronto entre parênteses.

### Base

- [x] `components/HierarchicalSelect.tsx` — `size?: 'md' | 'sm'` no gatilho; item aceita `fullName` para `valueField="name"` (valor gravado continua sendo o nome achatado "Grupo > Filho", como antes). *(tsc passa; Plano de Contas continua com badges.)*
- [x] `components/CostCenterSelect.tsx` — novo. Props `costCenters`, `value`, `onChange`, `placeholder?`, `valueField?`, `size?`, `disabled?`. Resolve `parentName` pelo `parent_id` quando a lista não traz, tira o prefixo "Grupo > " do nome. *(usado por todos os itens abaixo.)*
- [x] `services/payrollService.ts` — `listCostCenters` passa a selecionar `parent_id` (sem isso a folha vê lista chata). *(RH › Folha mostra grupos.)*
- [x] `components/DivergencesPanel.tsx` — consulta direta a `cost_centers_v2` inclui `code, parent_id`. *(idem.)*

### Telas convertidas (todas: campo abre drawer; grupos recolhidos com chevron; sem cor; busca com grupo)

- [x] `components/BoletoFormModal.tsx` — 2 campos passam para `CostCenterSelect` (remove `costCenterItems` local).
- [x] `components/BoletoLoteModal.tsx` — captura em lote, campos comuns.
- [x] `components/BoletoEdicaoEmLoteModal.tsx` + `components/BoletoManager.tsx` — edição em lote; o pai passa a lista crua em vez de `{id, name}`.
- [x] `components/BankTxEdicaoEmLoteModal.tsx` + `components/BankReconciliation.tsx` — `masterCostCenters` passa a guardar `code/parent_id/parent_name`.
- [x] `components/ContractModal.tsx` — Contratos › Centro de Custo e Orçamento.
- [x] `components/DealModal.tsx` — Negociação › Financeiro.
- [x] `components/SupplyChainOrderForm.tsx` — Pedido de compra (era dropdown pequeno).
- [x] `components/FinancialOrderDetails.tsx` — Pedido › financeiro (`valueField="name"`, legado).
- [x] `components/PayrollRunDetail.tsx` — cabeçalho da folha (`size="sm"`).
- [x] `components/LaborPayroll.tsx` — modal de nova folha.
- [x] `components/LaborEmployeeForm.tsx` — cadastro do colaborador.
- [x] `components/DivergencesPanel.tsx` — painel de divergências.

### Fora desta rodada (decisão acima)

- `components/reconciliation/tabelasDaConciliacao.tsx` — `LazySelect` inline nas células do Extrato (§7.1).
- `components/debt/DebtAllocations.tsx` — `<select>` inline em célula.
- `components/financeiro/FechamentoCentroCusto.tsx` — filtro de toolbar com grupos/centros.
- `components/BankReconciliation.tsx:3395` — `<select>` da barra escura de ação em lote.
- `components/empreendimento/VinculacoesTab.tsx` — Sheet de vincular/criar CC do empreendimento.

## Estado

Ver caixas acima. Commit: (preenchido no fechamento).

## Verificação

- `npx tsc --noEmit`; `bash scripts/check-ui-standard.sh` em cada arquivo tocado.
- Playwright (usuário de leitura, sem gravar): abrir cada tela, clicar no campo, provar
  título "Selecionar Centro de Custo", grupos recolhidos com chevron, 0 spans com
  fundo colorido, busca "galeria" com grupo ao lado.
