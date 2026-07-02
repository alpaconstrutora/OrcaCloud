# Plano — Gaps do Módulo Planejamento vs. MS Project (itens 1-6)

Auditoria comparativa do módulo Engenharia → Planejamento (`FinancialSchedule.tsx` +
`components/schedule/` + `utils/schedulingEngine.ts`) contra as funcionalidades do
MS Project. Núcleo CPM (dependências, restrições, folga, caminho crítico, EVM,
baselines, Last Planner) já é sólido. Este documento cobre os 6 gaps priorizados.

Status (2026-07-02): TODOS os 6 itens implementados (Fases 1-4). tsc limpo, 49 testes de
planejamento passando.
Nota sobre #5a: implementado como materialização (cria N tarefas independentes de 1 dia cada,
não resolução em tempo real pelo motor) — mais simples e robusto dado que o outline já é fonte
de verdade da estrutura; cada ocorrência é editável/removível como qualquer tarefa normal.
Nota sobre #5b (split): escolhido "split real que estende o cronograma" (comportamento MS
Project). Núcleo: helper effectiveSpan() no motor — duration continua sendo só o trabalho
(custo/HH), o gap estende a janela início→fim. Os 7 pontos de aritmética de data no CPM
(forward FF/SF/FNET/EF + backward SS/SF/LS) passaram a usar effectiveSpan(task). Gantt desenha
os gaps como recortes hachurados; ação Dividir/Unir no TaskDetailModal.

---

## 1. Feriados / exceções de calendário ⭐ (melhor ROI)

**Situação:** `CalendarEngine` já aceita `holidays: string[]` e trata em
`isWorkingDay`/`addWorkingDays` (schedulingEngine.ts:29-45). `calculate()` instancia
`new CalendarEngine([], workDays)` com lista fixa vazia (schedulingEngine.ts:809).
Falta persistir e ligar a UI.

**Mudanças:**
1. Tipo — `types/project.ts` `ProjectSchedule`: `holidays?: string[]` (ISO `YYYY-MM-DD`).
2. Motor — `SchedulingEngine.calculate` ganha 11º parâmetro `holidays: string[] = []`,
   passado a `new CalendarEngine(holidays, workDays)`. Propagar também a
   `calculateResourceHistogram` e `levelResources` (hoje criam `new CalendarEngine()`
   sem feriados).
3. Injeção central — `FinancialSchedule.tsx` `calcWithGroups` (~linha 1740): após
   injetar `workDays` em `args[8]`, injetar `args[9] = scheduleRef.current.holidays ?? []`.
4. UI — seção "Calendário" no `ConfigModal.tsx`: lista de datas (add/remove) + botão
   "Importar feriados nacionais BR do ano" (cálculo local, fixos + móveis via Páscoa,
   sem dependência externa).

Esforço: ~0,5-1 dia. Risco: baixo (cobrir com teste em `__tests__/calendarEngine.test.ts`).
Atenção ao padrão UTC já usado no motor (evita bug de fuso já documentado no projeto).

---

## 2. Exportação Excel / CSV do cronograma

**Situação:** hoje só há `handleExportPDF` (FinancialSchedule.tsx:3079). App já usa
XLSX em outros pontos (import) — reaproveitar a mesma lib.

**Mudanças:**
1. Novo util `utils/scheduleExport.ts`: `exportScheduleToXlsx(hierarchy, schedule)` →
   achata a hierarchy (WBS/nível/indentação) em linhas: WBS, Tarefa, Início, Término,
   Duração, % Real, Predecessoras, Folga, Crítica, Valor Planejado, Valor Realizado,
   Recursos. CSV = mesma matriz via `;` (abre direto no Excel PT-BR).
2. Handlers `handleExportExcel`/`handleExportCSV` em `FinancialSchedule`, passados ao header.
3. UI — `ScheduleHeader.tsx` menu overflow: "Exportar PDF" vira submenu
   Exportar → PDF / Excel / CSV.

Esforço: ~1 dia. Risco: baixo. Fora de escopo: MPP/XML (formato proprietário).

---

## 3. Recursos tipo Material e Custo + hora extra / custo por uso

**Situação:** `ResourceAllocation.resourceType` só tem `ROLE | WORKER | TEAM`
(types/resources.ts:3); custo só via `costPerHour/costPerDay`.

**Mudanças:**
1. Tipos — `resources.ts`: novo `ResourceMaterial { id, name, unit, costPerUnit,
   organizationId }`; `ResourceRole` ganha `overtimeCostPerHour?`, `costPerUse?`;
   `ResourceAllocation.resourceType` ganha `'MATERIAL' | 'COST'` + `overtimeHours?` +
   `fixedCost?`; `ProjectSchedule.resources` ganha `materials: ResourceMaterial[]`.
2. Motor — `calculateLaborCosts` (schedulingEngine.ts:892) generaliza para
   `calculateResourceCosts`: MATERIAL = `quantity × costPerUnit` (não multiplica por
   duração); COST/fixedCost = valor fixo por tarefa; hora extra =
   `overtimeHours × overtimeCostPerHour`; custo por uso = `costPerUse` uma vez por
   alocação. Materiais não entram no histograma de capacidade nem no nivelamento —
   filtrar por `resourceType`.
3. UI — `ResourceManagement.tsx` aba "Materiais"; `ResourceAllocationModal.tsx`
   permite alocar material/custo e horas extras.

Esforço: ~2-3 dias. Risco: médio (afeta cálculo de custo que alimenta EVM/CPI).

---

## 4. Baseline de custo / HH

**Situação:** `Baseline.itemDates` guarda só `{startDate, endDate}` (schedule.ts:92-98);
criação em FinancialSchedule.tsx:2946-2958 só captura datas.

**Mudanças:**
1. Tipo — evoluir para `itemData: Record<string, { startDate; endDate; duration;
   plannedValue; totalManHours }>`. Manter `itemDates` como leitura retrocompatível.
2. Criação — snapshot da baseline captura também `plannedValue`/`totalManHours`/`duration`.
3. Motor — `BaselineEngine.compare` calcula `costVariance` e `workVariance` além de
   `slippage`/`spi`. Expor via `costVariation` (já existe em `ItemScheduleDetails`).
4. UI — coluna/tooltip de variação de custo vs. baseline no `ScheduleGridView` e
   card no Centro de Comando.

Esforço: ~1-1,5 dia. Risco: baixo-médio (retrocompatibilidade de baselines já salvas).

---

## 5. Tarefas recorrentes + split

**5a. Recorrentes**
1. Tipo — `recurrence?: { frequency: 'DAILY'|'WEEKLY'|'MONTHLY'; interval: number;
   count?: number; until?: string }` em `ItemScheduleDetails`/`OutlineNode`.
2. Geração — `expandRecurringTasks(schedule)`: materializa ocorrências on-the-fly
   respeitando calendário/feriados do item 1.
3. UI — seção "Recorrência" no `OutlineNodeModal`/`TaskDetailModal`.

Esforço: ~1,5 dia. Risco: médio (ocorrências não devem virar predecessoras entre si
salvo configuração explícita).

**5b. Split de tarefa**
1. Tipo — `ItemScheduleDetails.segments?: { start: string; end: string }[]`.
2. Motor — `forwardPass`/`addWorkingDays` pulam o gap entre segmentos; é a mudança
   mais invasiva no motor CPM.
3. UI — Gantt renderiza múltiplas barras + gap; ação "Dividir tarefa".

Esforço: ~3-4 dias. Risco: alto — tratar como fase separada, após 1-4 e 5a.

---

## 6. Diagrama de rede (PERT) + calendário individual por recurso

**6a. Diagrama de rede** — só leitura, não toca no motor (dados já existem:
`predecessors`, `earlyStart/Finish`, `isCritical`, `totalFloat`).
1. Novo componente `schedule/NetworkDiagramView.tsx`: nós = tarefas (ES/EF/LS/LF/folga),
   arestas = dependências, caminho crítico destacado. Layout por níveis via
   `GraphEngine.topologicalSort` (expor em `SchedulingEngine`).
2. Nova aba `network` em `ScheduleHeader.tsx` `viewMode`.

Esforço: ~2 dias. Risco: baixo. Evitar libs pesadas de grafo — SVG simples.

**6b. Calendário individual por recurso**
1. Tipo — `ResourceRole`/`ResourceWorker` ganham `workSchedule?`/`holidays?`.
2. Motor — auto-duração/nivelamento usam interseção do calendário do recurso com o
   do projeto. Impacta `CrewEngine.calculateDuration` e `calculateResourceHistogram`.
3. UI — editor de calendário no cadastro de recurso (reusa componente do item 1).

Esforço: ~2 dias. Risco: médio (interseção de calendários no cálculo de capacidade).

---

## Sequência recomendada

| Fase | Itens | Esforço | Justificativa |
|---|---|---|---|
| 1 | #1 Feriados + #2 Export | ~2 dias | Alto valor, baixo risco |
| 2 | #4 Baseline custo/HH + #6a PERT | ~3-4 dias | Leitura/análise, pouco risco de motor |
| 3 | #3 Materiais/Custo + #5a Recorrentes | ~4 dias | Estrutural mas contido |
| 4 | #6b Calendário por recurso + #5b Split | ~6 dias | Alto risco no núcleo CPM — por último |

Total estimado: ~15-18 dias. Itens que tocam o motor devem vir com teste em
`__tests__/` e passar `tsc --noEmit` local antes do push.
