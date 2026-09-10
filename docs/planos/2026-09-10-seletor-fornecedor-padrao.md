# Seletor de Fornecedor — um padrão para o app inteiro

## Pedido original

> propague pelo app esse desigh UI/UX de drawer do fornecedot
>
> Sessão 8a772665 · 2026-09-10

"Esse design" = o drawer de fornecedor feito em Boletos a Pagar na mesma sessão
(`12b27bd`): pedido literal anterior —

> no drawer forncedor o nome do forncedor esta vindo com o cnpj depois do nome:
> 1. crie tres colunas com classificacao
> 1.1 Nome
> 1.2 CNPJ
> 1.3 Categoria
> 2. filtro para para a categoria

Ou seja: `components/SupplierSelect.tsx` — drawer lateral com tabela de três
colunas ordenáveis (Nome · CNPJ/CPF · Categoria), busca por nome ou dígitos do
documento, filtro por categoria, campo fechado com nome + documento em cinza.

## Decisões tomadas

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-10 | Onde o padrão se aplica? | Em todo campo de formulário que escolhe **um** fornecedor do cadastro. Mesma regra do seletor de Centro de Custo (`2026-09-10-seletor-centro-de-custo-padrao.md`). |
| 2026-09-10 | Onde NÃO se aplica? | (a) Cotação › "Fornecedores Convidados": é multi-seleção em cards, não um campo. (b) Portal do Fornecedor › "Impersonar Fornecedor": controle administrativo âmbar, deliberadamente diferente. (c) Extrato › edição em lote e células inline: o "credor" ali é texto livre vindo dos movimentos, não FK do cadastro. |
| 2026-09-10 | Campo compacto (h-9) em barra/linha? | `SupplierSelect` ganha `size="sm"`, igual ao `HierarchicalSelect`. |
| 2026-09-10 | E os formulários que JÁ são drawer (Dívidas › `DebtForm`, Sala de Crédito › `CreditRoomForm`, Estoque › `StockItemSheet`)? | **Ficam com o `<select>`.** Abrir o seletor-drawer por cima deles é drawer aninhado — proibido pelo `UI_PATTERNS.md` §4.4 (REGRA #4) — e o Esc do picker bateria na guarda `dirty` do formulário de trás. Se o padrão for exigido lá, o caminho é o próprio formulário virar página. |
| 2026-09-10 | Lista sem documento/categoria? | Funciona (colunas mostram "—"), mas quem consulta `suppliers` direto passa a trazer `document, category` para as colunas terem conteúdo. |

## Plano

- [x] `components/SupplierSelect.tsx` — `size?: 'md' | 'sm'` no gatilho.
- [x] `components/SupplyChainOrderForm.tsx` — Pedido › Fornecedor.
- [x] `components/ProcurementModule.tsx` — Compras › 2 formulários ("Fornecedor *").
- [x] `components/ContractModal.tsx` — Contrato › Fornecedor / Contratado (`sm`, no lugar do select h-9 com ícone).
- [x] `components/BoletoLoteModal.tsx` — captura em lote, campos comuns.
- [x] `components/BoletoEdicaoEmLoteModal.tsx` + `components/BoletoManager.tsx` — edição em lote; o pai passa a lista crua (`Supplier[]`).
- [x] `components/ProjectFinancialManager.tsx` — linha de lançamento rápido (`sm`); consulta traz `document, category`.
- [x] `components/CentralFornecedor.tsx` — régua "qual fornecedor" (`sm`); consulta traz `category`.

### Fora desta rodada (decisões acima)

- `components/inventory/StockItemSheet.tsx`, `components/debt/DebtForm.tsx`, `components/credit/CreditRoomForm.tsx` — formulários que já são drawer (REGRA #4).
- `components/SupplyChainQuotationForm.tsx` — multi-seleção de convidados.
- `components/SupplierDashboard.tsx` — "Impersonar Fornecedor" (admin).
- `components/BankTxEdicaoEmLoteModal.tsx` e células do Extrato — credor é texto livre.

## Estado

8 de 8 itens do plano. Publicado em (preenchido no fechamento).

## Verificação

- `npx tsc --noEmit`; `bash scripts/check-ui-standard.sh` nos arquivos tocados.
- Playwright (usuário de leitura, sem gravar): abrir Pedido, Contrato, Central de
  Fornecedores e Boletos › lote; provar drawer "Selecionar
  Fornecedor" com colunas Nome / CNPJ / Categoria e o filtro de categoria.
