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
Componentes já migrados p/ `Format.tsx` (primitivas): ContasPagarManager, BoletoManager, BoletoFormModal (`formatBRL` delega), ContasReceberManager, FinancialApprovalModule, ClientChargesModule, DunningModule (HistoricoTab), PayrollRunList, ThreeWayMatchPanel (só moeda), ProcurementModule (moeda/data/mês — corrigiu bug de fuso real), SupplyChainOrderList (moeda de detalhe + data de entrega), StockConsumptionModal (só moeda), PriceTableManager (só moeda), ContractMeasurementModal (moeda + data de aditivo — corrigiu bug de sinal negativo).
Componentes com ação em massa (F3): ContasPagarManager (marcar pago em lote), ContasReceberManager (baixar/receber em lote), ClientChargesModule (cancelar cobrança em lote), SupplyChainOrderList (excluir pedidos em lote, só na visão em lista).

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

### F2 — Memória completa da tabela (#34)
- `useTableColumns` passa a persistir também **ordenação, filtros e página**
  (hoje só colunas). Mesmo `storageKey`.
- Avaliar persistência por-usuário no servidor (hoje só localStorage/por-browser).

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
- Próximo candidato a avaliar: BalanceteReport, WIPReport ou fila de conciliação
  bancária (SmartReconciliationCenter/GroupMatchPanel).

### F4 — Totalizadores padronizados (#21)
- Rodapé de resumo reutilizável (respeita filtro) — generalizar o que já existe
  em ContasPagar para BoletoManager e demais financeiros/fiscais.

### F5 (reservado) — Volume alto
- Virtualização + eventual server-side apenas nas 4 telas citadas em "Não fazer".

## Lacunas do documento (específicas do ÒPURA)
- Escopo multi-tenant/org refletido na UI (RLS) — o doc ignora; recorrente aqui.
- Manual×importado×calculado (#25) é **estrutural** no ÒPURA (XML NF-e, Asaas, DRE),
  não observação — por isso virou primitiva na F1.
