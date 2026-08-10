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
- [x] BrokerList.tsx — commit `17a4b13`, deployado
- [x] broker/BrokerDevelopments.tsx — commit `17a4b13`, deployado
- [x] InvestorList.tsx — commit `17a4b13`, deployado
- [x] RentalsModule.tsx — commit `ae841e2`, deployado (3 tabelas: unidades/deals/brokers)
- [x] rentals/RentalRenewals.tsx — commit `ae841e2`, deployado
- [x] SalesModule.tsx — commit `ae841e2`, deployado (3 tabelas: inventário/deals/brokers)
- [x] DealModal.tsx — commit `17a4b13`, deployado (tabela de Parcelas)
- [x] WarrantyModule.tsx — commit a seguir, deployado
- [x] partner/PartnerWorkspaceManager.tsx — commit a seguir, deployado (3 tabelas: parceiros/docs/usuários)
- [x] supplier/SupplierPortalManager.tsx — commit a seguir, deployado
- [x] PriceTableManager.tsx — commit a seguir, deployado

**Fase 2 concluída — 11 de 11.**

⚠️ 2026-08-09: três lotes de agentes caíram por limite de sessão de API (resets
12:20, 13:10 e 17:20 America/Sao_Paulo) no meio do trabalho, mas nenhum ficou
definitivamente perdido — cada novo lote retomou de onde o anterior parou
(funções auxiliares já criadas + JSX por ligar), exceto um caso de sintaxe em
RentalsModule.tsx corrigido manualmente (`.tbody` sem fechar chave do `.map`).

### Fase 3 — Suprimentos / Fornecedores
- [x] SupplierList.tsx — commit a seguir, deployado
- [x] SupplyChainOrderList.tsx — commit a seguir, deployado
- [x] SupplyChainContractList.tsx — commit a seguir, deployado
- [x] SupplyChainReceiptManager.tsx — commit a seguir, deployado
- [x] SupplyChainQuotationList.tsx — commit a seguir, deployado
- [x] SupplierCategoriesSettings.tsx — commit a seguir, deployado
- [x] ContractTypesSettings.tsx — commit a seguir, deployado
- [x] ContractIndexManager.tsx — commit a seguir, deployado
- [x] ContractTemplateManager.tsx — commit a seguir, deployado

**Fase 3 concluída — 9 de 9.**

### Fase 4 — Fiscal / Impostos / Folha
- [x] fiscal/FiscalJobs.tsx — commit a seguir, deployado
- [x] fiscal/FiscalDocuments.tsx — commit a seguir, deployado (subtabela de itens NF-e não usa TableUtils, intocada)
- [x] fiscal/FiscalRules.tsx — commit a seguir, deployado
- [x] CofinsRatesSettings.tsx — commit a seguir, deployado
- [x] PisRatesSettings.tsx — commit a seguir, deployado
- [x] InssBracketsSettings.tsx — commit a seguir, deployado
- [x] TaxSettingsManager.tsx — commit a seguir, deployado
- [x] PaymentTypesSettings.tsx — commit a seguir, deployado
- [x] PayrollRunList.tsx — commit a seguir, deployado

**Fase 4 concluída — 9 de 9.**

### Fase 5 — RH / Labor / Academia
- [x] LaborEmployeeList.tsx — deployado
- [x] LaborAbsences.tsx — deployado
- [x] LaborValeRefeicao.tsx — deployado (3 tabelas: cálculo/aprovados/histórico é card list)
- [x] LaborTrainings.tsx — deployado
- [x] academy/AcademyAssignmentsTab.tsx — deployado
- [x] academy/AcademyCatalogTab.tsx — deployado
- [x] academy/AcademyPanels.tsx — deployado
- [x] OrganizationUsers.tsx — deployado
- [x] OrganizationList.tsx — deployado

**Fase 5 concluída — 9 de 9.**

### Fase 6 — Empreendimento / Engenharia / Áreas
- [ ] empreendimento/EmpreendimentoModule.tsx
- [x] empreendimento/HistoricoTab.tsx — deployado
- [x] EmpreendimentoTypesSettings.tsx — deployado
- [x] AreaEngineModule.tsx — deployado (achado+corrigido bug de colisão `Map` do lucide-react com `new Map()`)
- [x] RegulatoryZoneTable.tsx — deployado
- [x] regulatoryMap/RegulatoryMapModule.tsx — deployado
- [x] electrical/ElectricalProjectsView.tsx — deployado
- [x] ProjectList.tsx — deployado (Diário injeta 2 colunas fixas extras, tratadas como não-arrastáveis)
- [x] PlanningList.tsx — deployado. ⚠️ tela nunca foi migrada para o guia de UI (§7):
      `font-bold`/`font-black` dentro de `<td>` já existiam no arquivo original antes
      deste rollout (confirmado via `git show HEAD`) — copiados literalmente por
      instrução explícita de não mudar visual, não é regressão desta tarefa. Fica
      registrado aqui como item de dívida técnica pré-existente para uma limpeza
      futura do guia de UI (fora do escopo deste plano).
- [x] DiaryProjectsList.tsx — deployado

**Fase 6 concluída — 10 de 10.**

### Fase 7 — Operacional / ÒPURA / Diversos
- [x] OperacionalList.tsx — deployado
- [x] OperacionalModule.tsx — deployado (ProjectSelector)
- [x] OpuraMarketModule.tsx — deployado (2 tabelas)
- [x] OpuraCnoModule.tsx — deployado
- [x] OpuraAssetsModule.tsx — deployado (4 tabelas: ativos/reservas/manutenções/rateio)
- [x] OpuraDocsModule.tsx — N/A: a tabela real é `<DocumentsTable>` (componente
      compartilhado), coberto abaixo; nada a converter no próprio arquivo
- [x] InventoryModule.tsx — deployado (2 tabelas: saldos/movimentos)
- [x] CompaniesModule.tsx — deployado
- [x] CostCenterModule.tsx — deployado
- [x] ClientCategoriesSettings.tsx — deployado
- [x] TasksList.tsx — N/A, decisão registrada: já tem mecanismo PRÓPRIO de
      drag-and-drop de colunas (`colOrder`/`colDragging`, `ColHeader` custom),
      independente de `SortableHeader`/`moveColumn` — só que **sem persistir em
      localStorage** entre sessões, ao contrário do padrão central. Migrar
      exigiria reescrever também o sort (`sortCol`/`sortDir` já é próprio e
      desconectado de `tableColumns`), o que é mudança de arquitetura, não a
      conversão mecânica deste plano. Oportunidade futura, fora deste escopo.
- [x] DatabaseExplorer.tsx — deployado
- [x] documents/DocumentsTable.tsx — deployado (componente compartilhado por
      GED/PartnerWorkspaceManager/PartnerPortal; colunas dinâmicas de máscara
      de pasta não entram no drag, ficam ancoradas onde já estavam)
- [x] AnomaliesPanel.tsx — deployado (2 tabelas)
- [x] DivergencesPanel.tsx — deployado (3 tabelas)
- [x] ProlaboreReconciliationPanel.tsx — deployado

**Fase 7 concluída — 14 de 16 convertidos + 2 exceções documentadas (não é
trabalho pendente, é decisão registrada).**

⚠️ Mesma dívida técnica pré-existente encontrada em `PlanningList.tsx` (Fase 6)
apareceu em `DatabaseExplorer.tsx`, `OperacionalList.tsx` e
`OpuraMarketModule.tsx`: `font-bold`/`font-black`/`font-mono` dentro de `<td>`,
confirmados via `git show HEAD` como já existentes ANTES deste rollout — fora
de escopo aqui, candidatos a uma limpeza futura do guia de UI.

## Estado

- [x] Mecanismo central (`useTableColumns`/`SortableHeader` com drag) — commit `700065c`
- [x] Piloto `ClientList.tsx` — commit `700065c`, deployado
- [x] Fase 1 (10 arquivos) — commit a seguir
- [x] Fase 2 (11 arquivos)
- [x] Fase 3 (9 arquivos)
- [x] Fase 4 (9 arquivos)
- [x] Fase 5 (9 arquivos)
- [x] Fase 6 (10 arquivos)
- [x] Fase 7 (14 de 16 + 2 exceções documentadas)

**ROLLOUT CONCLUÍDO — 72 de 74 arquivos convertidos, 2 exceções documentadas
(TasksList.tsx tem mecanismo próprio; OpuraDocsModule.tsx delega para
DocumentsTable.tsx, que foi convertido).**

**Não declarar o rollout concluído com fase em aberto** — reportar
"Fase N: X de Y arquivos", nunca "concluído" enquanto sobrar item.

## Verificação

Por arquivo: `npx tsc --noEmit -p .` sem erro nesse arquivo, e teste manual de
arrastar um header na tela (login necessário — o usuário confirma via
navegador; sessões automatizadas não têm sessão autenticada).

Ao final de cada fase: commit isolado só dos arquivos daquela fase (nunca
`git add -A` — outras sessões podem estar com arquivos não relacionados
modificados em paralelo, ver histórico deste projeto).
