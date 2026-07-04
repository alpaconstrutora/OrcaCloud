# PLANO — Evolução do Design System de Tabelas (ÒPURA)

> Fonte: avaliação do documento "52 boas práticas de tabela em SaaS/ERP" (2026-07-04)
> confrontado com o que já existe no ÒPURA. **Regra-mãe:** evoluir a base única
> (`components/ui/TableUtils.tsx`), NÃO fragmentar em 6 componentes-tipo.

## Estado atual (o que JÁ existe — não recriar)

| Recurso | Onde | Cobre item do doc |
|---|---|---|
| Mostrar/ocultar colunas + persistência (localStorage por `storageKey`) | `useTableColumns`/`ColumnConfigButton` em `components/ui/TableUtils.tsx` | #20 (parcial), #34 (parcial) |
| Ordenação por coluna com indicador (chevron) | `SortableHeader` | #9 |
| Restaurar padrão de colunas | `resetColumns` | #20 |
| Labels humanos | `ColumnConfig.label` (texto livre) | #47 |
| Totalizador que respeita o filtro | `ContasPagarManager.tsx:527` (`filtered...reduce`) | #21 (só nesse componente) |
| **Primitivas de formato BR (F1 CONCLUÍDA)** | `components/ui/Format.tsx` (`Money`/`DateBR`/`formatMoney`/`formatDateBR`/`formatPercent`) | #6/#7 |
| **Ação em massa (F3, 2 de N telas)** | ContasPagarManager e ContasReceberManager: checkbox + barra de seleção + total selecionado + ação em lote | #11 |
| Drawer lateral / confirmação | `Sheet` + `useConfirm` (ver `UI_PATTERNS.md`) | #3, #10, #36 |

Componentes já migrados p/ `TableUtils`: ProjectList, ClientList, BoletoManager, ContasPagarManager.
Componentes já migrados p/ `Format.tsx` (primitivas): ContasPagarManager, BoletoManager, BoletoFormModal (`formatBRL` delega), ContasReceberManager, FinancialApprovalModule, ClientChargesModule, DunningModule (HistoricoTab), PayrollRunList, ThreeWayMatchPanel (só moeda), ProcurementModule (moeda/data/mês — corrigiu bug de fuso real), SupplyChainOrderList (moeda de detalhe + data de entrega), StockConsumptionModal (só moeda), PriceTableManager (só moeda), ContractMeasurementModal (moeda + data de aditivo — corrigiu bug de sinal negativo), BalanceteReport (só moeda), WIPReport (moeda + % — corrigiu separador decimal do percentual), SmartReconciliationCenter + GroupMatchPanel (moeda/data), BankReconciliation (moeda em 8 pontos + formatDateBR local unificado com a primitiva), ReconciliationDashboard (só moeda), ContractsDashboard (só data), InventoryModule (moeda/data/% — corrigiu bug de fuso real em 3 datas + separador decimal), PayrollEventModal (só moeda), LaborEmployeeList (só moeda), OperacionalDetail (data + dedup interno de moeda), CompaniesModule (só moeda), OfficesDashboard (só %), OfficesFinanceiro (data — corrigiu bug de fuso real), ReportViewer (7 ocorrências de moeda claras).
Componentes com ação em massa (F3): ContasPagarManager (marcar pago em lote), ContasReceberManager (baixar/receber em lote), ClientChargesModule (cancelar cobrança em lote), SupplyChainOrderList (excluir pedidos em lote, só na visão em lista), InventoryModule (cancelar requisições de material em lote).

**Exceção conhecida:** ContasReceberManager tem ordenação própria (`handleSort`/`SortIcon`), não usa `SortableHeader`/`useTableColumns` para sort — decisão já registrada (refatoração considerada complexa, custo/benefício baixo). F1/F3 foram aplicados por cima sem tocar nisso.

## Não fazer (over-engineering rejeitado)

- **6 "tipos oficiais" de tabela (#52)** → manter 1 base + variações por slots.
- **Server-side sort/filter/paginação como regra (#46)** → só onde o volume exige:
  extrato bancário, lançamentos fiscais, insumos SINAPI, EAP. Client-side segue ok
  para a maioria (centenas de linhas).
- **Densidade global ajustável (#17)** → 1 densidade fixa por tipo de tela.

## Fases (ordem de ROI)

### F1 — Primitivas de célula (extração, não invenção) — ✅ CONCLUÍDA
- `<Money>`/`formatMoney`, `<DateBR>`/`formatDateBR`, `formatPercent` em `components/ui/Format.tsx`.
  `formatDateBR` nasceu com split de string, nunca `new Date('YYYY-MM-DD')` cru (bug de
  fuso já documentado na memória).
- **Aplicado em:** ContasPagarManager, BoletoManager, BoletoFormModal (`formatBRL` agora
  delega), ContasReceberManager, FinancialApprovalModule (todos via import com alias
  `fmt`/`fmtDate` p/ menor diff).
- **Não aplicado propositalmente:** ProjectList/ClientList — datas lá são `created_at`/
  `updated_at`/`expires_at` (timestamptz com hora real), não `vencimento`/`dueDate` (DATE
  puro). Usar `formatDateBR` (que ignora timezone e só lê o prefixo `YYYY-MM-DD`) nesses
  campos **introduziria o bug inverso**. Não têm duplicação de formatação de moeda.
  InvoiceManager (upload de NFe/recibos): também descartado — sem coluna de valor
  monetário e a única data é `createdAt` (timestamp de upload, não DATE de negócio).
- DunningModule tem duas famílias de data distintas: `fmtDate` (topo do arquivo,
  timestamp completo com hora, usado no `sent_at` de eventos) ficou intocado — é
  timestamptz de verdade, não DATE; já `fmtBRL`/`fmtDue` do `HistoricoTab` migraram
  para as primitivas (mesmo padrão DATE-only de vencimento).
- ThreeWayMatchPanel: só `fmt` (moeda) migrou. `fmtDate` intocado — `approvedAt` é
  timestamptz de aprovação da NF-e (audit, confirmado na migration
  `nfe_link_financeiro.sql`), não DATE puro; mesmo raciocínio do bug inverso.
  `fmtQty` (quantidade) é formatador distinto, fora do escopo Money/Date/Percent e
  sem duplicação em outro arquivo — não extraído.
- PayrollRunList: só `fmtBRL` (moeda) migrou. As datas do período (`start_date`/
  `end_date`) usam `formatDate` de `lib/payrollUIHelpers.ts`, que **já implementa a
  mesma lógica seguindo split de string** e é reusado em 16 arquivos — dedup com
  `formatDateBR` teria valor mas é refactor grande de baixo risco/benefício marginal;
  não vale o blast radius sem necessidade concreta. Registrado aqui, não feito.
- **Nova primitiva `formatMonthLabel`** (2026-07-04): rótulo "julho de 2026"/"jul. de 26"
  a partir de "YYYY-MM", extraído por split (nunca `new Date`). Corrigiu **bug de fuso
  real e confirmado** em ProcurementModule: 6 ocorrências de
  `new Date(\`${y}-${m}-01\`).toLocaleDateString(...)` faziam o dia 1º retroceder pro mês
  anterior em UTC-3 (mesma classe do bug já documentado em
  [[project_cronograma_timezone_bug]], testado e confirmado via Intl antes do fix).
- **LaborBIAnalytics avaliado, nada migrado:** `fmt.brl` usa `maximumFractionDigits: 0`
  (sem centavos) — convenção deliberada de dashboards/KPI, confirmada em **42 arquivos**
  do projeto; forçar `formatMoney` (2 casas) quebraria essa convenção só neste arquivo.
  `fmt.date`/`fmt.mes` já evitam o bug de fuso por outra técnica (`iso + 'T12:00:00'`,
  meio-dia local) e `fmt.mes` remove o ponto da abreviação — formato diferente da
  primitiva nova, sem ganho real em forçar a troca.
- Pendente: util de alinhamento genérico (#6) e marcador visual de origem
  manual×importado×calculado (#25) — ainda não extraídos como primitiva.
- **Descoberta a considerar no futuro:** convenção de moeda "sem centavos" para
  dashboards (`maximumFractionDigits: 0`) está duplicada em ~42 arquivos — se um dia
  fizer sentido extrair, seria uma segunda primitiva (`formatMoneyCompact` ou parâmetro
  `decimals` em `formatMoney`), não uma migração para a primitiva de detalhe atual.
- SupplyChainOrderList: migrada a moeda de detalhe (linha/card, 2 casas) e
  `deliveryDate` (DATE puro, mesmo output de `new Date(v+'T12:00:00').toLocaleDateString`).
  KPI "Valor Total" (sem centavos) e `created_at` (timestamptz real) ficaram intocados,
  mesmo raciocínio dos casos anteriores.
- StockConsumptionModal: só `fmtBrl` (moeda) migrou. `fmt` (quantidade) tem precisão
  diferente (2-4 casas) do `fmtQty` visto em ThreeWayMatchPanel (0-3 casas) — não são
  o mesmo formatador duplicado, não extraído.
- PriceTableManager: só `fmtBRL` migrou. `fmtDate` intocado — `created_at` é TIMESTAMPTZ
  confirmado na migration `20261231000007_commercial_price_tables.sql`, não DATE puro.
- **ContractMeasurementModal — bug cosmético real corrigido:** 5 ocorrências escreviam
  `` `R$ ${v.toLocaleString('pt-BR', {minimumFractionDigits:2})}` `` (prefixo manual, sem
  `style:'currency'`). Para valores negativos isso produzia **"R$ -500,25"** (ordem
  errada); `formatMoney`/Intl produz **"-R$ 500,25"** (padrão correto). Confirmado via
  teste de codepoint (espaço comum vs ` ` do Intl, más o bug real é o sinal).
  `new_end_date` (DATE puro de aditivo) também migrado para `formatDateBR`.
- **WIPReport — bug real de separador decimal corrigido:** `fmtPct` usava `v.toFixed(1)`,
  que sempre usa ponto como separador ("20.6%"), nunca vírgula, mesmo em pt-BR — testado
  e confirmado. `formatPercent(v, {asPoints:true, decimals:1})` corrige para "20,6%".
  BalanceteReport só teve `fmt` (moeda) migrado.
- **SmartReconciliationCenter/GroupMatchPanel:** `formatBRL`/`formatDate` locais
  idênticos nos dois arquivos, migrados. Nuance: valor ausente agora mostra "—" em vez
  de "R$ 0,00" (o `formatBRL` antigo tratava `undefined` como zero) — mais consistente
  com os demais campos do mesmo card que já usam "—" quando ausentes.
- **BankReconciliation:** `formatDateBR` local (definida dentro do componente, mesma
  lógica de split) unificada com a primitiva compartilhada mantendo o nome — zero-diff
  nos 7 call sites. 8 pontos de moeda inline unificados. `toLocaleTimeString` de log de
  auditoria mantido (fora de escopo).
- **InventoryModule — bug real de fuso corrigido:** `moved_at`/`last_movement_date`/
  `requested_at` são DATE puro (confirmado nas migrations `almoxarifado_phase1/2/3` e
  `material_requests`), mas eram formatados via `new Date(iso).toLocaleDateString(...)`
  — retrocede 1 dia em UTC-3. Migrados para `formatDateBR`. `t.created_at` (stock
  transfers) mantido — TIMESTAMPTZ real, confirmado na migration. **Também corrigido
  bug de separador decimal:** `turnoverRate` usava `(v*100).toFixed(1)` (sempre ponto);
  `formatPercent` corrige.
- **PayrollEventModal:** 2 ocorrências do padrão `"R$ " + toLocaleString` manual
  migradas para `formatMoney` (mesma família do bug do ContractMeasurementModal, mas
  aqui o valor nunca é negativo — sinal controlado à parte pela lógica provento/
  desconto). Timestamp de auditoria (`toLocaleString` com hora) mantido.
- **LaborPayroll** é só orquestrador (delega para PayrollRunList, já migrado); não tem
  tabela própria além de um `alert()` nativo com `toFixed`, fora do escopo de UI.
- **LaborEmployeeList:** `base_salary` (padrão manual "R$ "+toLocaleString) migrado.
  `daily_cost`/`hourly_cost` mantidos SEM prefixo "R$" (usam ícone DollarSign/Clock como
  indicador) — migrar acrescentaria texto "R$" que hoje não existe, mudança de design
  não pedida. LaborEmployeeForm: `fmt` local (faixa salarial, uso único) não extraído.
- **OperacionalDetail:** `fmtDate` local (já usava `T00:00:00`, correto — interpretado
  como horário local, não UTC) tinha saída idêntica à `formatDateBR`; unificado mantendo
  o nome (zero-diff). `budgetedValue` deduplicado para chamar o `fmtCurrency` já local
  do arquivo (mesma expressão repetida inline). `fmtCurrency`/`fmtDateTime` mantidos.
  OperacionalList avaliado, nada alterado — `fmtDate` ali tem formato abreviado
  (dia+mês, sem ano) diferente de `formatDateBR`, não é duplicata.
- **CompaniesModule:** `capital_social` (única ocorrência, sem helper local, já 2
  casas) migrado direto.
- **OfficesDashboard/OfficesFinanceiro — bug real de fuso corrigido:**
  `inst.vencimento` (OfficesFinanceiro) é gerado como string DATE pura em
  `officesService.ts` (`new Date(...).toISOString().split('T')[0]`), mas formatado via
  `new Date(iso).toLocaleDateString(...)` — retrocede 1 dia em UTC-3. Migrado para
  `formatDateBR`. `l.created_at` (OfficesDashboard, leads) mantido — TIMESTAMPTZ
  confirmado na migration `opura_offices`. `kpi.delta` (já correto) migrado p/
  `formatPercent` por consistência. `BRL`/`COMPACT` (moeda sem centavos + notação
  compacta) mantidos — convenção de dashboard.

### F2 — Memória completa da tabela (#34) — ✅ CONCLUÍDA (15/15 telas)
- `useTableColumns` (`components/ui/TableUtils.tsx`) passa a persistir **ordenação**
  junto com colunas visíveis, no mesmo `storageKey`. Formato legado (array puro) ainda
  é lido corretamente — sem quebrar preferências já salvas.
- Novo `usePersistedState<T>(key, defaultValue)` — hook genérico (mesma assinatura de
  `useState`) para qualquer tela persistir filtros/página em localStorage, sem
  reimplementar load/save a cada vez.
- **Piloto:** ContasPagarManager — `search`/`statusFilter`/`vencDe`/`vencAte`.
  **Testado e confirmado** com harness Playwright isolado: reload completo de página
  restaura busca + filtro de status + ordenação, lidos direto do localStorage (não só
  visualmente). Zero erros de console.
- **Rollout completo** para as 14 telas restantes com `useTableColumns`: BoletoManager,
  BrokerList, ClientList, ContasReceberManager, FinancialRegistryManager, InvestorList,
  LaborEmployeeList, OperacionalList, OrganizationList, PlanningList, ProjectList,
  SupplierList, SupplyChainOrderList, SupplyChainQuotationList, TasksList. Cada tela
  persiste seus próprios filtros (busca/status/período/viewMode/ordenação própria)
  em chaves `<tela>Filters:<campo>`, sem alterar o `storageKey` de colunas.
- **Bug corrigido de passagem:** ContasReceberManager chamava `useTableColumns` sem
  `storageKey` (caía no default `'tableColumns'`, colidindo com qualquer outro
  componente que também esquecesse de passar a chave) — agora usa
  `'contasReceberManagerColumns'`.
- **Não persistido de propósito:** `ProjectList.activeTab` (deriva de prop externa,
  persistir criaria inconsistência); InvoiceManager/ContractIndexManager/
  ContractTemplateManager (sem filtro de lista, só CRUD/config).
- Avaliar persistência por-usuário no servidor (hoje só localStorage/por-browser) —
  não feito, fica pra decisão futura se localStorage não for suficiente.

### F3 — Ação em massa (#11) — EM ANDAMENTO (2/N telas)
- Coluna de checkbox + barra de seleção ("N selecionados | Ação | Limpar").
- Regra de clique fixa (resolve conflito #35×#10×#11):
  **linha abre drawer; checkbox seleciona; botão/menu NÃO propaga (stopPropagation).**
- ✅ ContasPagarManager — marcar pago em lote.
- ✅ ContasReceberManager — baixar (receber) em lote; critério de seleção espelha o botão
  "Baixar" por linha (`effective_status !== 'RECEBIDO'`).
- ✅ ClientChargesModule — cancelar cobrança (boleto/PIX Asaas) em lote; critério espelha
  `handleCancel` por linha (`status !== 'CANCELLED' && !PAID.includes(status) &&
  transaction_id` presente); confirmação única antes do lote (mesmo padrão do botão
  individual, que já pedia `confirm()`).
- BoletoManager já tinha seleção em massa própria (pré-existente, não migrada para o
  padrão comum — avaliar unificação depois).
- **Avaliado e descartado:** FinancialApprovalModule — fila mistura 3 entidades
  (transaction/contract/purchase_order) com dispatch e nível de aprovação calculados
  por item, e rejeição exige motivo obrigatório individual. Bulk sem modal por item
  perderia esse contexto; precisaria de desenho próprio (ex.: bulk só para "aprovar
  sem observação", nunca para rejeitar) — não faz sentido forçar o padrão genérico aqui.
- **Avaliado e descartado:** DunningModule — `ReguaTab` é config de regras (não
  transacional); `HistoricoTab` é log de auditoria de disparos, sem ação por item
  (doc §12: auditoria é para rastrear, não para agir em lote).
- **Avaliado e descartado:** ThreeWayMatchPanel — painel de comparação read-only
  (Pedido × Recebimento × NF-e), sem nenhuma ação por linha para agrupar.
- **Avaliado e descartado:** PayrollRunList — únicas ações por linha são
  duplicar/excluir; bulk-delete de folhas de pagamento já calculadas é uma ação
  perigosa e sem caso de uso concreto pedido — não forçar F3 aqui.
- **Já existia (pré-existente, madura):** ProcurementModule — seleção de itens por
  mês/grupo + barra "N selecionado(s) — Gerar Cotação" (linhas ~220-360). Nada a
  adicionar; só F1 (moeda/data/mês) foi aplicado ali.
- **Avaliado e descartado:** LaborBIAnalytics — única ação por linha é excluir uma
  movimentação de RH (admissão/demissão/transferência); dado sensível, ação rara e
  perigosa o suficiente pra não valer bulk-delete sem pedido explícito (doc §44: RH
  precisa proteção extra).
- ✅ SupplyChainOrderList — excluir pedidos em lote, só na visão em lista (grid mantém
  exclusão individual); critério de seleção espelha `canDeleteOrder` (não
  Entregue/Recebido/Divergência), mesma guarda já usada no menu por linha.
- **Avaliado e descartado:** StockConsumptionModal — não é lista de registros
  persistidos, é formulário de composição de linhas enviadas juntas num único submit;
  não há "ação em massa" a aplicar sobre nada já salvo.
- **Avaliado e descartado:** PriceTableManager — já tem ação em massa madura e
  intencional ("Aplicar reajuste em massa" por %/índice) aplicada a TODA a versão
  rascunho de uma vez; não é seleção de subconjunto, é por design sobre a versão
  inteira. Não precisa de checkbox.
- **Avaliado e descartado:** ContractMeasurementModal — mesmo formato de
  StockConsumptionModal: formulário de composição de itens de UMA medição, enviados
  juntos; não há lista de registros persistidos para bulk-agir.
- **Avaliado e descartado:** BalanceteReport e WIPReport — relatórios read-only tipo
  "Analítica" (comparar, não agir); sem ação por linha.
- **Já existia (pré-existente, madura):** SmartReconciliationCenter — "Conciliar alta
  confiança (N)" por threshold de score, sem checkbox (mais adequado ao domínio: a
  seleção é por confiança do motor de match, não escolha arbitrária do usuário).
  GroupMatchPanel — "Conciliar grupo" por unidade atômica de agrupamento (cada grupo já
  é o item de ação, não faz sentido dividir em checkboxes individuais). Nada a adicionar
  em nenhum dos dois, só F1.
- **Já existia (pré-existente, madura e extensa):** BankReconciliation (tela principal,
  4348 linhas) — checkboxes + "N selecionados" + exclusão em lote já espalhados por toda
  a tela. Só F1 foi aplicado (8 pontos de moeda + `formatDateBR` local duplicado, mesma
  lógica, unificado com a primitiva compartilhada mantendo o nome p/ zero-diff nos
  7 call sites).
- **Avaliado e descartado:** ReconciliationDashboard — edição inline por conta (saldo
  inicial), não lista de registros para bulk-agir.
- **Avaliado e descartado:** ContractsDashboard — feed de alertas/portfólio, sem ação
  por linha além de navegar ao detalhe do contrato.
- ✅ InventoryModule — cancelar requisições de material em lote (checkbox por card,
  não `<table>` — lista é card-based); critério espelha `handleCancel` por item
  (pending/approved/separated). "Entregar" ficou fora do bulk — é confirmação física
  de recebimento, mais sensível a ser feita item a item.
- **Avaliado e descartado:** PayrollEventModal — lista pequena de lançamentos manuais
  por colaborador dentro de UMA folha; cada exclusão recalcula a folha individualmente,
  sem caso de uso concreto para bulk. LaborPayroll é só orquestrador, sem tabela própria.
- **Avaliado e descartado:** LaborEmployeeList — ações mistas (editar/compartilhar/
  toggle status/excluir) sobre dado sensível de RH, mesma cautela de LaborBIAnalytics/
  PayrollRunList. LaborEmployeeForm é formulário de 1 registro, não lista.
- **Avaliado e descartado:** OperacionalList/OperacionalDetail — lista é tipo "Consulta"
  (só navegação por linha, sem ação inline); transições de status vivem na página de
  detalhe de UMA ordem (OperacionalDetail), não é lista para bulk-agir.
- **Avaliado e descartado:** CompaniesModule — única ação por linha é excluir
  empresa/CNPJ, dado mestre sensível e tipicamente poucas linhas.
- **Avaliado e descartado:** OfficesDashboard/OfficesFinanceiro — ambos read-only
  (funil de leads / fluxo de caixa projetado); `MoreHorizontal` é botão decorativo sem
  handler, não ação de linha.
- Próximo candidato a avaliar: aguardando indicação do usuário.

### F4 — Totalizadores padronizados (#21)
- Rodapé de resumo reutilizável (respeita filtro) — generalizar o que já existe
  em ContasPagar para BoletoManager e demais financeiros/fiscais.

### F5 (reservado) — Volume alto
- Virtualização + eventual server-side apenas nas 4 telas citadas em "Não fazer".

## Auditoria por grupo de menu — "Engenharia" (2026-07-04)
Varredura focada nos 12 itens do dropdown "Engenharia" (Layout.tsx). Só 6 têm `<table>`:
- **ProjectList/PlanningList** (Obras+Orçamentos, Planejamento) — já cobertos no rollout geral.
- **ReportViewer** (Relatórios) — ✅ F1 aplicado (7 ocorrências claras de moeda). **Achado**:
  inconsistência pré-existente no próprio relatório — a tabela simples de Insumos mostra "R$"
  nas colunas Unitário/Total, mas a árvore aninhada mais profunda (INPUTS_ANALYTIC) e o
  breakdown por natureza (mão de obra/material/equipamento) mostram os MESMOS dados sem "R$"
  (colunas estreitas/densas). Pode ser design intencional de compactação — **não corrigido
  sem confirmação do usuário**, registrado aqui pra decisão futura.
- **DatabaseExplorer (Composições) — ✅ F1/F2 CONCLUÍDOS (2026-07-04):** adicionado
  `useTableColumns`+`SortableHeader`+`ColumnConfigButton` na tabela em lista (não tinha nada
  disso); os ~13 filtros (busca/código/tipo/grupo/banco/localização/encargos/competência/
  natureza/escopo/modo/favoritos/viewMode) agora persistem via `usePersistedState` (não
  persistia nenhum antes). **3 bugs de moeda corrigidos**, um deles o pior da varredura toda:
  `result.price.toFixed(2)` na visão em grade — `toFixed` sempre usa ponto E não agrupa
  milhares (ex.: "R$ 1234.56" em vez de "R$ 1.234,56"). `sortedResults` (memo) unifica
  ordenação entre grid e lista. Sem F3 — exclusão só em itens da base própria/override
  (dado de referência de custo, mesma cautela de CompaniesModule).
- **StructuralModule (Ferragem & Aço) — ✅ F1 CONCLUÍDO (2026-07-04):** `item.custo_kg`
  migrado para `formatMoney` (única ocorrência). Sem F2/F3: catálogo pequeno de bitolas
  de aço (NBR 7480), sem busca/filtro, não justifica `useTableColumns`.

**Auditoria do grupo Engenharia encerrada** — 12 itens do menu avaliados, 6 com `<table>`,
todos com F1 aplicado onde fazia sentido; F2 completo em DatabaseExplorer (era o mais
atrasado); F3 já maduro em AreaEngineModule, descartado nos demais por falta de ação
em massa homogênea ou por serem dado de referência/catálogo pequeno.
- **AreaEngineModule** (Áreas NBR 12721) — já tem F3 próprio e maduro (seleção de espaços +
  edição em lote de cobertura/coeficiente, "Camada B"). Quase nada a fazer em F1.

**Achado de nomenclatura (não é bug de tabela, é UX de menu):** "Templates de Obra"
(`ProjectTypeTemplateEditor` — monta EAP+docs+indicadores+checklist) e "Tipos de Obra"
(`ObraTypesManager` — CRUD raso nome/cor/slug) são camadas diferentes mas o nome não deixa
isso óbvio. Considerar renomear um dos dois se o usuário achar confuso na prática.

**Achado estrutural:** "Obras" e "Orçamentos" no menu Engenharia renderizam **literalmente o
mesmo componente** `<ProjectList classificationFilter="OBRA"|"ORCAMENTO">` — por isso
compartilham `storageKey` de colunas (`'projectListColumns'`), fazendo preferências de coluna
"vazarem" entre os dois contextos. Não é bug, é reuso deliberado, mas explica comportamento
que pode confundir o usuário.

## Lacunas do documento (específicas do ÒPURA)
- Escopo multi-tenant/org refletido na UI (RLS) — o doc ignora; recorrente aqui.
- Manual×importado×calculado (#25) é **estrutural** no ÒPURA (XML NF-e, Asaas, DRE),
  não observação — por isso virou primitiva na F1.
