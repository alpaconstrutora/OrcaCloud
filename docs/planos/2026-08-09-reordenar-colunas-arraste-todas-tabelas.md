# Reordenar colunas por arraste (estilo ClickUp) — todas as tabelas do sistema

## Pedido original

> "o sistema clickup.com tem uma boa funcionalidade: nas tabelas o usuário pode
> clicar e segurar com o mouse no header de uma coluna e mover a posicäo da
> coluna para onde o usuãrio quiser trocando de posicao de uma coluna com a
> outra"
>
> Depois, perguntado sobre a estratégia de rollout (piloto vs. mecanismo só vs.
> rollout completo), o usuário escolheu **"Piloto em 1 tela primeiro"**.
>
> Validado o piloto (`ClientList.tsx`, deployado em `700065c`) e ajustado o
> atraso visual do drag nativo, o pedido seguinte foi:
>
> **"aplique em todas as tabelas do sistema"**
>
> Sessão: conversa corrente · 2026-08-09.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-04 | Estratégia de rollout dado que a ordem das colunas é hardcoded no JSX de cada tela (82 arquivos) | Piloto em 1 tela primeiro |
| 2026-08-09 | (implícita, ao aprovar o piloto) Propagar para as demais telas | "aplique em todas as tabelas do sistema" |

## O mecanismo (já pronto, não repetir)

`components/ui/TableUtils.tsx`:
- `useTableColumns` retorna `orderedVisibleColumns` (ordem arrastável, já
  filtrada por visibilidade) e `moveColumn(dragKey, dropKey)`, persistidos no
  mesmo `storageKey` de cada tela (localStorage).
- `SortableHeader` aceita `onMoveColumn` opcional — presente, o `<th>` vira
  arrastável (ghost customizado, sem o atraso do snapshot nativo do
  navegador) e soltar sobre outro header troca as duas colunas de posição.

**Cada tela precisa de 3 mudanças** (ver `ClientList.tsx` como referência
completa, e a seção "Reordenar colunas por arraste" em `GUIA_TABLE_UTILS.md`):

1. `<colgroup>`: mapear `tableColumns.orderedVisibleColumns` em vez de repetir
   `visibleColumns.includes(key) && <col .../>` por coluna.
2. `<thead>`: mesma troca, usando `SortableHeader` com
   `onMoveColumn={tableColumns.moveColumn}` adicionado.
3. `<tbody>`: extrair o conteúdo de cada `<td>` para uma função pura
   `renderXCell(key, item, ...)` e mapear `orderedVisibleColumns` no lugar da
   sequência fixa de `<td>`s condicionais.

Telas com múltiplas tabelas (abas) repetem o padrão por tabela, com
`storageKey` próprio de cada uma (já existente).

## Plano — 74 arquivos restantes

Cada item: **arquivo** — critério de pronto = `tsc --noEmit` limpo no arquivo
+ colgroup/thead/tbody convertidos para `orderedVisibleColumns` +
`onMoveColumn` no `SortableHeader` de toda tabela do arquivo que hoje usa
`visibleColumns.includes(`.

### Fase 1 — Financeiro / Contas
- [x] BankReconciliation.tsx (3 tabelas: Extrato, Pendentes›Extrato, Pendentes›Internos)
- [x] ContasReceberManager.tsx
- [x] BoletoManager.tsx
- [x] ContasPagarParcelas.tsx
- [x] ContasPagarManager.tsx
- [x] ClientChargesModule.tsx
- [x] TributosAPagarManager.tsx
- [x] FinancialRegistryManager.tsx
- [x] FinancialCategoriesManager.tsx
- [x] InvoiceManager.tsx

### Fase 2 — Comercial / Locações / Parceiros
- [ ] BrokerList.tsx
- [ ] broker/BrokerDevelopments.tsx
- [ ] InvestorList.tsx
- [ ] RentalsModule.tsx
- [ ] rentals/RentalRenewals.tsx
- [ ] SalesModule.tsx
- [ ] DealModal.tsx
- [ ] WarrantyModule.tsx
- [ ] partner/PartnerWorkspaceManager.tsx
- [ ] supplier/SupplierPortalManager.tsx
- [ ] PriceTableManager.tsx

### Fase 3 — Suprimentos / Fornecedores
- [ ] SupplierList.tsx
- [ ] SupplyChainOrderList.tsx
- [ ] SupplyChainContractList.tsx
- [ ] SupplyChainReceiptManager.tsx
- [ ] SupplyChainQuotationList.tsx
- [ ] SupplierCategoriesSettings.tsx
- [ ] ContractTypesSettings.tsx
- [ ] ContractIndexManager.tsx
- [ ] ContractTemplateManager.tsx

### Fase 4 — Fiscal / Impostos / Folha
- [ ] fiscal/FiscalJobs.tsx
- [ ] fiscal/FiscalDocuments.tsx
- [ ] fiscal/FiscalRules.tsx
- [ ] CofinsRatesSettings.tsx
- [ ] PisRatesSettings.tsx
- [ ] InssBracketsSettings.tsx
- [ ] TaxSettingsManager.tsx
- [ ] PaymentTypesSettings.tsx
- [ ] PayrollRunList.tsx

### Fase 5 — RH / Labor / Academia
- [ ] LaborEmployeeList.tsx
- [ ] LaborAbsences.tsx
- [ ] LaborValeRefeicao.tsx
- [ ] LaborTrainings.tsx
- [ ] academy/AcademyAssignmentsTab.tsx
- [ ] academy/AcademyCatalogTab.tsx
- [ ] academy/AcademyPanels.tsx
- [ ] OrganizationUsers.tsx
- [ ] OrganizationList.tsx

### Fase 6 — Empreendimento / Engenharia / Áreas
- [ ] empreendimento/EmpreendimentoModule.tsx
- [ ] empreendimento/HistoricoTab.tsx
- [ ] EmpreendimentoTypesSettings.tsx
- [ ] AreaEngineModule.tsx
- [ ] RegulatoryZoneTable.tsx
- [ ] regulatoryMap/RegulatoryMapModule.tsx
- [ ] electrical/ElectricalProjectsView.tsx
- [ ] ProjectList.tsx
- [ ] PlanningList.tsx
- [ ] DiaryProjectsList.tsx

### Fase 7 — Operacional / ÒPURA / Diversos
- [ ] OperacionalList.tsx
- [ ] OperacionalModule.tsx
- [ ] OpuraMarketModule.tsx
- [ ] OpuraCnoModule.tsx
- [ ] OpuraAssetsModule.tsx
- [ ] OpuraDocsModule.tsx
- [ ] InventoryModule.tsx
- [ ] CompaniesModule.tsx
- [ ] CostCenterModule.tsx
- [ ] ClientCategoriesSettings.tsx
- [ ] TasksList.tsx
- [ ] DatabaseExplorer.tsx
- [ ] documents/DocumentsTable.tsx
- [ ] AnomaliesPanel.tsx
- [ ] DivergencesPanel.tsx
- [ ] ProlaboreReconciliationPanel.tsx

## Estado

- [x] Mecanismo central (`useTableColumns`/`SortableHeader` com drag) — commit `700065c`
- [x] Piloto `ClientList.tsx` — commit `700065c`, deployado
- [x] Fase 1 (10 arquivos) — commit a seguir
- [ ] Fase 2 (11 arquivos)
- [ ] Fase 3 (9 arquivos)
- [ ] Fase 4 (9 arquivos)
- [ ] Fase 5 (9 arquivos)
- [ ] Fase 6 (10 arquivos)
- [ ] Fase 7 (16 arquivos)

**Não declarar o rollout concluído com fase em aberto** — reportar
"Fase N: X de Y arquivos", nunca "concluído" enquanto sobrar item.

## Verificação

Por arquivo: `npx tsc --noEmit -p .` sem erro nesse arquivo, e teste manual de
arrastar um header na tela (login necessário — o usuário confirma via
navegador; sessões automatizadas não têm sessão autenticada).

Ao final de cada fase: commit isolado só dos arquivos daquela fase (nunca
`git add -A` — outras sessões podem estar com arquivos não relacionados
modificados em paralelo, ver histórico deste projeto).
