# PRD / Roadmap — Evolução do Módulo de Planejamento (ÒPURA Planning)

> Visão: transformar o cronograma num **sistema operacional da obra**, conectado a
> orçamento, suprimentos, engenharia, contratos, financeiro e execução.
> Diagnóstico ancorado no código real (verificado 2026-06-18):
> `utils/schedulingEngine.ts` (~1.044 linhas) + `components/schedule/*` (11 componentes) +
> `components/FinancialSchedule.tsx`.

---

## 1. Onde estamos hoje (baseline honesta)

O módulo já tem uma **espinha dorsal CPM sólida**. O que falta é a camada que *diferencia*
(Lean, IA, 4D, automatismos). Mapa do estado atual contra a visão-alvo:

| # | Capacidade | Estado | Evidência no código |
|---|---|---|---|
| 1 | Planejamento multinível (estratégico/tático/operacional) | ❌ | Cronograma único |
| 2 | WBS/EAP | 🟡 | 4 níveis (grupo→etapa→subetapa→item) espelhando o orçamento, não EAP física (bloco/pavimento/ambiente) |
| 3 | Integração com orçamento | ✅ | `basedOnBudgetSnapshot`, Sincronizar, versionamento planejamento×orçamento |
| 4 | Gantt / dependências / marcos | ✅ | `ScheduleGantt.tsx`, 4 tipos (TI/II/TT/IT), lag, drag |
| 5 | Linha de base | ✅ | `BaselineModal`, múltiplas baselines, slippage por item |
| 6 | Controle de restrições (Lean) | ❌ | Só `constraintType` do CPM (SNET/MSO) — outra coisa |
| 7 | Last Planner / PPC | ❌ | Inexistente |
| 8 | Planejamento de suprimentos | 🟡 | `taskInsights` cruza tarefa × `purchase_orders` por código SINAPI (alerta), mas não gera datas/solicitações |
| 9 | Planejamento de mão de obra | ✅ | `CrewEngine` (produtividade oficial/ajudante, h/dia) + recursos + nivelamento automático |
| 10 | Planejamento de equipamentos | ❌ | Recursos são pessoas; sem equipamento nem conflito |
| 11 | Simulação de cenários | 🟡 | "Modo What-If" é arraste ao vivo; não salva nem compara cenários |
| 12 | IA no planejamento | ❌ | Nenhuma |
| 13 | Avanço físico de campo | 🟡 | `realizedValues` de diários+ordens+`manualRealPct`; Operacional não realimenta fechado |
| 14 | Curva S | 🟡 | Só financeira acumulada (desembolso); falta física + tendência |
| 15 | Caminho crítico | ✅ | CPM calcula `isCritical`/`totalFloat` |
| 16 | Dashboards executivos | 🟡 | `ScheduleRiskDashboard` (risco); falta painel KPI (SPI/CPI/PPC/desvio) |
| 17 | 4D BIM | ❌ | Inexistente |
| 18 | Centro de Comando | ❌ | Peças soltas, sem visão única |

**Reuso disponível (não recriar):** CPM completo (forward/backward, ES/EF/LS/LF, float, crítico),
calendário/jornada configurável (`schedule.workSchedule`), baselines, recursos (papéis/trabalhadores/
equipes) + nivelamento, What-If engine, integração e versionamento com orçamento, `taskInsights`
(tarefa × compras). **Persistência:** tudo em `projects.settings.schedule` (JSONB) — fases novas que
precisem de colaboração/consulta cruzada migram para tabelas com RLS por `organization_id`.

---

## 2. Princípios de arquitetura para todas as fases

1. **Multi-tenant sempre** — toda tabela nova: `organization_id` + RLS. Snapshots não-FK seguem o
   padrão do orçamento (`sinapiItem` embutido).
2. **JSONB para o que é do cronograma, tabela para o que é colaborativo** — restrições, PPC e
   cenários ganham tabela própria (várias pessoas editam, há histórico, há consulta agregada).
   Datas/durações continuam no JSONB do schedule.
3. **O CPM é a fonte de datas** — nenhuma fase reescreve o engine; elas o consomem ou o anexam.
4. **Nada quebra o que existe** — toda fase é retrocompatível; planejamentos antigos abrem inalterados.
5. **UI** — seguir `UI_PATTERNS.md` (Sheet lateral vs Modal vs página; `useConfirm`; primitivas em
   `components/ui/`).

---

## 3. Roadmap em fases

Ordem por **impacto competitivo × proximidade da base atual**. Cada fase entrega valor sozinha.

### FASE 1 — Restrições + Last Planner / PPC  ⭐ (maior gap, reusa tarefas)

**Por que primeiro:** é o diferencial Lean mais valorizado e o que mais aproxima o cronograma da
execução. Reusa a estrutura de tarefas que já existe.

**Entidades novas (tabelas com RLS):**
```sql
-- Restrição (bloqueio) atrelada a uma atividade do cronograma
create table schedule_constraints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid not null references projects(id),
  schedule_item_id text not null,         -- id do item em settings.schedule.itemSchedules
  category text not null,                  -- projeto | material | contrato | equipe | equipamento | aprovacao
  description text not null,
  status text not null default 'open',     -- open | removed
  responsible text,
  due_date date,                           -- data-limite para remover a restrição
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Compromisso semanal (Last Planner) + apontamento de cumprimento
create table weekly_commitments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid not null references projects(id),
  schedule_item_id text not null,
  week_start date not null,                -- segunda-feira da semana
  planned_qty numeric,                     -- meta da semana (na unidade da atividade)
  done_qty numeric,                        -- realizado apontado
  is_complete boolean,                     -- 100%? (entra no PPC)
  failure_reason text,                     -- motivo de não cumprimento (categorizado)
  created_at timestamptz not null default now()
);
```

**Lógica:**
- Uma atividade só é "liberada para a semana" se **não tem restrição aberta** (`status='open'`).
- **PPC = compromissos cumpridos / compromissos planejados** na semana. Indicadores: PPC semanal,
  PPC acumulado, tendência, Pareto de motivos de não cumprimento.
- **Lookahead (médio prazo):** janela de 4–6 semanas listando atividades que entram e suas
  restrições — a ponte entre o cronograma mestre e a programação semanal.

**Telas:**
- Aba nova no header do Planejamento: **"Restrições"** e **"Semanal (Last Planner)"**.
- Quadro de restrições por categoria (estilo do `ScheduleRiskDashboard`) com checklist por atividade.
- Planejamento semanal: lista de compromissos, apontamento, cálculo de PPC, gráfico de tendência.
- Badge de restrição na linha da tarefa no Gantt/Tabela (🔴 N restrições abertas).

**KPIs entregues:** PPC, motivos de não cumprimento, restrições abertas por categoria.

---

### FASE 2 — Cenários salvos e comparáveis  (motor já existe)

**Por que:** "efeito uau" executivo com esforço baixo — o What-If já roda, falta **persistir** e
**comparar**.

**Persistência:** `projects.settings.schedule.scenarios?: Scenario[]` (JSONB — é do cronograma).
```ts
interface Scenario {
  id: string;
  name: string;                 // "4 equipes", "Turno adicional"
  createdAt: string;
  // overrides aplicados sobre o cronograma base
  overrides: {
    workSchedule?: WorkSchedule;            // jornada/turno
    crewMultipliers?: Record<string,number>;// fator de equipe por atividade/grupo
    durationOverrides?: Record<string,number>;
  };
  // resultado calculado e congelado no momento do salvamento
  result: { endDate: string; totalCost: number; criticalPathIds: string[] };
}
```

**Telas:**
- Botão "Salvar cenário" no Modo What-If (captura o estado atual da simulação).
- Tela de **comparação lado a lado** (Cenário 1 vs 2 vs 3): término, custo, caminho crítico, Δ vs base.
- Aplicar cenário → vira o planejamento ativo (com confirmação).

**Reuso:** `SchedulingEngine.calculate` + `SimulationBanner` + `handleToggleSimulation`.

---

### FASE 3 — Gerador de suprimentos (datas ideais de compra)  (destrava Plano de Aquisições)

**Por que:** transforma o cronograma em **demanda de compras** automática. A base de cruzamento já
existe (`taskInsights`); falta o motor necessidade + lead time → data de compra.

**Integra com:** [PLANO_MODULO_PLANO_AQUISICOES.md](PLANO_MODULO_PLANO_AQUISICOES.md) (já tem PRD) e
[PLANO_MODULO_ALMOXARIFADO.md](PLANO_MODULO_ALMOXARIFADO.md) (saldo/reserva).

**Lógica:**
- Para cada atividade com data de início (CPM): explodir composições → insumos × quantidades.
- `data_ideal_compra = inicio_atividade − lead_time_insumo − folga_seguranca`.
- Posição líquida = saldo (Almoxarifado) + em trânsito (`purchase_orders`) − reservado.
- Gerar **sugestões de solicitação/cotação** (`quotation_request`) com data e quantidade.

**Telas:** "Plano de Compras" derivado do cronograma (timeline de datas de compra), com botão
"gerar solicitação". **Esta fase é, na prática, a Fase 1–2 do Plano de Aquisições alimentada pelo
cronograma.**

---

### FASE 4 — Centro de Comando + KPIs executivos  (consolida o que já é calculado)

**Por que:** unifica numa visão única o que hoje está espalhado. Responde: *o que deveria / o que está
/ o que vai / o que impede / impacto financeiro*.

**Entrega:**
- Painel de KPIs: **SPI** (já calculado por item), **CPI** (precisa de custo real → vem do financeiro
  por obra, ver `internal_transactions.project_id` / RPCs do dashboard financeiro), **PPC** (Fase 1),
  desvio de prazo, % físico × financeiro, restrições abertas, atividades atrasadas, caminho crítico.
- **Curva S física** (além da financeira que já existe) + linha de tendência/forecast.
- "Se esta atividade atrasar N dias, a entrega muda?" — simulação interativa sobre o caminho crítico
  (reusa CPM + folga).
- Reaproveitar o padrão de RPC do dashboard financeiro
  (`fn_financial_kpis`, migration 20261118000001) para os KPIs que dependem de dados financeiros.

**Telas:** dashboard executivo (cards de KPI + curva S + caminho crítico + restrições), pensado para
diretoria.

---

### FASE 5 — (Futuro) Diferenciadores de alto esforço

Depois das fundações acima, em ordem de maturidade:

1. **IA de planejamento** — (a) gerar cronograma inicial a partir do orçamento + tipo de obra +
   produtividade histórica da empresa; (b) predição de risco de atraso com probabilidade
   (histórico de fornecedores/atividades); (c) recomendações ("contrate esquadria até DD/MM");
   (d) assistente conversacional ("quais atividades estão atrasadas?", "o que impacta a Torre A?").
2. **Planejamento de equipamentos** — gruas/plataformas/betoneiras como recurso com **detecção de
   conflito** (estende o modelo de recursos atual).
3. **EAP física** — empreendimento → bloco → pavimento → ambiente → disciplina → serviço, paralela à
   WBS de orçamento (rastreabilidade de localização).
4. **Planejamento multinível** — mestre (estratégico) ↔ mensal (tático) ↔ semanal (operacional, já
   coberto pela Fase 1) formalmente ligados.
5. **4D BIM / Digital Twin** — vincular atividades ao modelo IFC, sequência construtiva no tempo.
6. **Avanço físico fechado de campo** — app/fotos/checklist do Operacional realimentando % físico do
   cronograma automaticamente.

---

## 4. Dependências entre fases

```
FASE 1 (Restrições/Last Planner) ──┐
FASE 2 (Cenários) ─────────────────┤── independentes entre si, podem paralelizar
FASE 3 (Suprimentos) ──> depende de Plano de Aquisições + Almoxarifado (PRDs prontos)
FASE 4 (Centro de Comando) ──> consome PPC (F1) + CPI (financeiro) + curva S
FASE 5 (IA/4D/EAP) ──> depende de histórico acumulado das fases 1–4
```

---

## 5. Recomendação de início

**Começar pela FASE 1 (Restrições + Last Planner/PPC).** Maior impacto competitivo, reusa a base de
tarefas, e gera o dado (PPC, motivos) que alimenta o Centro de Comando (Fase 4). Entregável mínimo:
quadro de restrições por atividade + cálculo de PPC semanal.

---

## 6. Checklist transversal (toda fase)

- [ ] `organization_id` + RLS em toda tabela nova
- [ ] Retrocompatível (planejamento antigo abre sem erro)
- [ ] Datas date-only em **UTC** no engine (ver `project_cronograma_timezone_bug`)
- [ ] `npx tsc --noEmit` limpo
- [ ] UI conforme `UI_PATTERNS.md`
- [ ] Deploy: git add → commit → push main (Vercel auto-deploy)

---

## FIM — PLANO_MODULO_PLANEJAMENTO.md
