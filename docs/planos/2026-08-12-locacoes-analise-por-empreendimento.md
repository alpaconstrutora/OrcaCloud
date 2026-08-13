# Locações › Análise — total e por empreendimento

## Pedido original

> **Sessão de 2026-08-12** (mensagem literal do usuário):
>
> Gestão de Locações < aba análise:
> fazer Analise total e anallise por empreendimento

### Decisões tomadas na mesma sessão (perguntadas e respondidas pelo usuário)

1. **Formato:** *"Seletor + tabela comparativa"* — um seletor de empreendimento no topo da
   aba recorta **todos** os KPIs; a tabela por empreendimento aparece quando o seletor está
   em "Todos".
2. **Gráficos:** *"Um gráfico de barras comparativo"* — barras horizontais por empreendimento,
   acima da tabela.

---

## Estado antes desta entrega

A aba **Análise** só existe na visão mestre de `components/RentalsModule.tsx`
(`!currentBuilding && activeTab === 'analysis'`). Mostra 8 KPIs executivos + um detalhamento
recolhível, **sempre da organização inteira**. O empreendimento já é conhecido pelo módulo
(`empreendimentoByProperty`, carregado no `loadData()`), mas só como coluna derivada nas
tabelas de Unidades e Contratos — nunca como recorte de análise.

Consequência: um prédio com 40% de ocupação desaparece dentro da média de 82% da carteira.

---

## Princípio de projeto: uma consulta, muitos baldes

Não fazer N chamadas de serviço (uma por empreendimento). Carregar o bruto uma vez, como já
se faz hoje, e **agrupar no cliente**. Duas razões:

- a tabela comparativa sai sem N×4 round-trips;
- **a soma das linhas bate com o total por construção.** Linha vinda de consulta própria
  diverge do total na primeira diferença de filtro — foi o defeito que produziu "patrimônio ×
  receita" inconsistentes antes da Fase 0 do plano de KPIs
  (`docs/planos/2026-08-06-kpis-locacao-primitivas.md`).

Corolário **obrigatório**: a tabela tem a linha **"Sem empreendimento"**. Imóvel de locação
sem vínculo em `empreendimento_units.rental_property_id` existe; sem essa linha as colunas não
fecham com o topo, e o usuário lê a diferença como bug.

---

## Itens

### 0. Este arquivo — `docs/planos/2026-08-12-locacoes-analise-por-empreendimento.md`

**O que muda:** o plano passa a viver no repositório, com o pedido literal (REGRA #6).
**Pronto quando:** existe, versionado, e é atualizado durante a execução — não substituído.

- [x] Concluído

---

### 1. `lib/rentalByEmpreendimento.ts` (novo, puro)

**O que muda:** funções sem I/O que resolvem o vínculo e montam os baldes.

- `SEM_EMPREENDIMENTO` — id do balde dos não vinculados.
- `empreendimentoOfProperty(property, map)` — unidade sem vínculo próprio **herda do pai**
  (edifício vem de `empreendimentos.commercial_rental_building_id`, unidade de
  `rental_property_id`).
- `empreendimentoOfContract(contract, byId, dealToEmp)` — `contracts.deal_id` → negócio →
  imóvel. ⚠️ Contrato-**filho** de renovação **não herda `deal_id`**
  (memória `project_locacao_renovacao_contratos`): com `deal_id` nulo, sobe por
  `parent_contract_id` até achar um que tenha. Sem isso a carteira renovada inteira cairia em
  "Sem empreendimento" e o WALE por empreendimento estaria errado justo nos contratos antigos.
- `groupRentalAnalysis(...)` — devolve `{ total, rows[] }` dos **mesmos** insumos; é ela que
  garante Σ linhas = total.

Cada linha: `empreendimentoId, name, unitsCount, rentedCount, occupancyRate, financialRate,
monthlyRevenue, portfolioValue, vacancyDays|null, vacantCount|null, noi|null, waleYears|null,
overdue90Rate|null, contractsCount`.
`null` continua sendo **"não medido", nunca zero** — regra transversal do módulo.

**Pronto quando:** `npx vitest run __tests__/rentalByEmpreendimento.test.ts` passa com:
soma das linhas = total; contrato-filho sem `deal_id` herda o empreendimento do pai; imóvel sem
vínculo cai em `SEM_EMPREENDIMENTO`; unidade sem vínculo próprio herda do edifício.

- [x] Concluído

---

### 2. `services/rentalVacancyService.ts`

**O que muda:** extrair `getVacancyEvents(orgId, buildingId?)` → `StatusEvent[] | null`.
`getVacancyMetrics` passa a chamá-la e continua com o comportamento idêntico (incluindo o
tratamento de tabela ausente / `42501` / vazia).
**Por quê:** `vacancyStats`/`netAbsorption` (`lib/rentalVacancy.ts`) já são puras — a tela
agrupa os eventos por imóvel e chama por balde.
**Pronto quando:** a aba Análise em "Todos" mostra os mesmos dias de vacância de antes.

- [x] Concluído

---

### 3. `services/rentalExecutiveService.ts`

**O que muda:** extrair `loadRaw(orgId)` → `{ contracts, receivablesByContract }`;
`load()` vira `loadRaw` + as três funções puras. Adiciona `deal_id` ao `select` de `contracts`
e `reference_id` ao de `vw_receivables`.
**Por quê:** é o único jeito de saber a qual contrato cada recebível pertence — via
`originIdFromRef` (`lib/receivableRef.ts`), porque `reference_id` é composto
`{contract_id}-p{vencimento}`.
**Pronto quando:** WALE, taxa de renovação e "vencido > 90 dias" em "Todos" não mudam de valor.

- [x] Concluído

---

### 4. `services/rentalNoiService.ts` — mudou (o plano previa "nenhuma mudança")

Já devolvia `byProperty: Map<string, NoiResult>`, e a tela recompõe por balde com
`portfolioNoi(subárvore, byProperty)` (`lib/rentalNoi.ts`), que soma só as raízes.
**Mas o serviço listava a carteira por conta própria, sem o
`visible_in_sales is not false` que a tela aplica** — um único imóvel oculto e a soma
das linhas não fecharia com o KPI do topo, sem nenhum sinal na tela. Ganhou um
parâmetro opcional `carteira?: NoiPropertyRow[]`: quando quem chama já tem a lista,
as duas contas partem da MESMA base (e some uma consulta).

⚠️ Efeito colateral aceito: o NOI total pode mudar ligeiramente em relação ao valor
exibido antes, se houver imóvel com `visible_in_sales = false`. É correção — o KPI
passa a descrever a mesma carteira que os outros sete ao lado dele.

- [x] Concluído

---

### 5. `components/RentalsModule.tsx`

**O que muda:**

1. Estado `analysisEmpId` via `usePersistedState('rentals:analysisEmpreendimento', 'ALL')`.
2. Memo `analysisProperties` — em `'ALL'` é `properties`; senão mantém **pai e filhos juntos**,
   porque `leafNodes`/`sumPortfolioValue`/`portfolioNoi` dependem da relação pai-filho.
3. `stats` e `financialOcc` passam a ler `analysisProperties` — as fórmulas não mudam, só a base.
4. Memo `analysisByEmp` chamando `groupRentalAnalysis`.
5. Os `useEffect` da aba guardam também o **bruto** (`vacancyEvents`, `executiveRaw`).
   **`analysisEmpId` não entra nas dependências**: trocar o filtro não recarrega nada.
6. JSX: seletor acima dos KPIs; gráfico de barras de receita mensal contratada (Recharts,
   precedente `RentalsDashboard.tsx`) só em "Todos" e com ≥ 2 baldes; tabela "Por
   empreendimento" com `useTableColumns`/`ColumnConfigButton`/`SortableHeader` e busca
   persistida (§5.2), linha clicável que aplica o filtro.

**Pronto quando:** os 5 cenários de navegador da seção Verificação passam.

- [x] Concluído

---

## Limitações conhecidas (não corrigidas aqui, de propósito)

- `rentalNoiService` atribui receita só por **`deal.property_id`**, ignorando
  `commercial_deal_units` — contrato multi-unidade não distribui receita entre as unidades.
  Isso já afeta o NOI **total** de hoje; corrigir aqui mudaria o número exibido e é assunto
  próprio.
- Contrato sem `deal_id` **e** sem cadeia de `parent_contract_id` resolvível cai em "Sem
  empreendimento". É o comportamento certo (não inventar vínculo), e a tela mostra quantos são.
- A vacância por empreendimento depende de `commercial_property_status_events`, cuja migration
  (`supabase/migrations/aplicar_20270901000000/`) **não sobe no deploy**. Sem ela a coluna
  inteira fica `—`, como já acontece com o KPI do topo.

---

## Verificação

1. `npx vitest run __tests__/rentalByEmpreendimento.test.ts`
2. `npx vitest run __tests__/orgContextGuard.test.ts` — catraca do CI (REGRA #5)
3. `bash scripts/check-ui-standard.sh components/RentalsModule.tsx`
4. `npx tsc --noEmit` — é o que o build da Vercel roda
5. **No navegador — AINDA NÃO FEITO.** Itens 1 a 4 passaram (17 testes novos,
   `tsc --noEmit` limpo, `vite build` OK, checador de UI sem violação nova — as
   que ele acusa são as do card de grade legado, idênticas às de antes da
   mudança). Falta abrir a tela:
   - Análise em "Todos": os 8 KPIs mostram **os mesmos valores de antes** da mudança;
   - a soma das linhas da tabela bate com o topo (unidades, receita mensal, NOI);
   - escolhendo um empreendimento: os 8 KPIs mudam, gráfico e tabela somem, o detalhamento
     recolhível também se recorta;
   - recarregar a página: o filtro persiste;
   - com o seletor do topo em "Todas as organizações": a tela carrega (não fica em branco —
     REGRA #5) e a tabela lista empreendimentos de mais de uma org;
   - empreendimento sem contrato aparece com `—` nas colunas de contrato, **não 0**.
