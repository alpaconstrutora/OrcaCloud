# PLANO — Tipos & Natureza de Tarefas no Cronograma

> Status: **PRD (aguardando implementação)** · Base de código: outline WBS já entregue (commit `31f190f`/`2921a6b`).
> Pré-requisito: módulo de CRUD do cronograma (`OutlineNode`, `scheduleOutline.ts`, `buildHierarchy` fromOutline).

## 1. Contexto e problema

Planejadores tradicionais (MS Project, Primavera P6/Cloud, ProjectLibre) expõem ~7 "tipos de tarefa", mas a
maioria **não é tipo — é atributo**: Manual/Automática é uma flag, Marco é `duração = 0`, Inativa é uma flag,
e dependências/restrições/caminho crítico são atributos/cálculos. O que esses sistemas realmente entregam são
os **atributos** (dependências FS/SS/FF/SF, restrições, calendários, recursos, custos, CPM) — não a taxonomia.

O ÒPURA já modela quase todos esses atributos (ver §3). O risco é copiar a taxonomia inflada dos planejadores e
criar dezenas de tipos difíceis de manter. **A oportunidade** é separar duas dimensões ortogonais:

- **Tipo (estrutural/comportamental):** como a tarefa se comporta no cronograma.
- **Natureza (semântica/domínio):** a que módulo do ecossistema a tarefa pertence.

A **Natureza** é o diferencial de ERP de construção: é a ponte que faz o planejamento conversar com Procurement,
Contratos, Aprovações, Qualidade, Financeiro etc. — algo que P6/MSP não fazem. Casa diretamente com o
[[Roadmap de Planejamento]] (Fase 1⭐ Last Planner/Restrições e Fase 4 Centro de Comando).

## 2. Decisão de arquitetura

**Duas dimensões independentes em cada nó-folha do outline:**

1. **3 tipos estruturais** (não 5): `Tarefa`, `Resumo`, `Marco`. Os demais "tipos" tradicionais são atributos
   (Manual/Auto = `autoDuration`; Inativa = nova flag `inactive`) ou são formas diferentes adiadas
   (Recorrente = gerador; Checklist = sub-estrutura) — ver §6 (Não-objetivos / Diferido).
2. **1 Natureza** opcional por tarefa: enum semântico que dirige integração, cor, filtros e KPIs.

Mapeamento no modelo atual (`OutlineNode.type`): `group/phase/subphase` = **Resumo** (3 níveis WBS de obra);
`item`/`activity` = **Tarefa**; **Marco** = `activity` com `duração = 0` + `isMilestone` (flag já existente).

## 3. O que JÁ existe (não reimplementar)

| Conceito tradicional | Onde já está no ÒPURA |
|---|---|
| Tarefa Resumo (Summary) | `OutlineNode` group/phase/subphase + rollup em `buildHierarchy`/`aggregateDates` |
| Tarefa com/sem custo | `item` (BudgetEntry) vs `activity` (schedule-only) |
| Marco | `ItemScheduleDetails.isMilestone` (+ duração 0) |
| Manual vs Automática | `ItemScheduleDetails.autoDuration` |
| Dependências FS/SS/FF/SF | `DependencyType` + `Predecessor` |
| Restrições (MSO/MFO/SNET/SNLT/FNET/FNLT/ASAP/ALAP) | `ConstraintType` (8) + `constraintDate` |
| Caminho crítico / folga | CPM (`CPMEngine`), `isCritical`, `totalFloat` |
| Recursos / equipe / custo | `allocations`, `resources` (roles/workers/teams), curva S |
| Ligação tarefa↔compra | `taskInsights` (parcial — semente da Natureza "Compra") |

## 4. Escopo desta entrega (mínimo de alto valor)

### 4.1 Natureza da Tarefa (núcleo)
- Novo campo opcional `nature?: TaskNature` em `OutlineNode` (folhas) — ou em `ItemScheduleDetails` se preferir
  manter o outline puramente estrutural. **Recomendado: em `OutlineNode`**, pois é metadado de estrutura.
- Enum `TaskNature` em `types/schedule.ts`:
  `PRODUCAO | COMPRA | CONTRATACAO | APROVACAO | INSPECAO | SEGURANCA | QUALIDADE | FINANCEIRO | BIM | DOCUMENTACAO | RH | MANUTENCAO`.
  Default: `PRODUCAO` (ou `undefined` = não classificada).
- Seletor de Natureza no `OutlineNodeModal` (criação) e via menu "Renomear/Editar" (`OutlineRowMenu`).
- **Cor/badge por Natureza** no Gantt e no grid (paleta dedicada, distinta da paleta de grupo já existente).
- **Filtro por Natureza** na barra do cronograma (reusar o padrão de `visibleSummaryLevels`).

### 4.2 Marco (Milestone) — expor o que já existe
- Ação "Adicionar Marco" no `OutlineRowMenu` (cria `activity` com `duration: 0`, `isMilestone: true`).
- Ícone losango no Gantt já existe para `isMilestone` — apenas garantir que o caminho de criação seta o flag.

### 4.3 Tarefa Inativa
- Novo flag `inactive?: boolean` em `ItemScheduleDetails`.
- O motor (`SchedulingEngine`/CPM) **ignora** tarefas inativas (não entram em duração do projeto, CPM, curva S,
  agregação de datas). Toggle no menu de linha + estilo "esmaecido" na UI.

## 5. Integração com módulos (o porquê da Natureza)

A Natureza é a chave de roteamento. Por natureza, a tarefa passa a:
- **COMPRA** → vincular a `quotation_request`/Pedido (Procurement/Plano de Aquisições); alerta de restrição se o
  insumo não chegou (alimenta Last Planner).
- **CONTRATACAO** → vincular a contrato (Gestão de Contratos).
- **APROVACAO** → disparar/observar fluxo de alçadas (ÒPURA Governance).
- **INSPECAO/QUALIDADE/SEGURANCA** → checklists e registros de campo (futuro).
- **FINANCEIRO** → medições/curva S.

Esta entrega **NÃO** implementa os vínculos — apenas o **campo + UI + filtros**. Os vínculos por natureza são
fases seguintes, guiadas pelo Centro de Comando e pelo Last Planner (Fase 1⭐ do roadmap).

## 6. Não-objetivos / Diferido (com justificativa)

- **Tarefa Recorrente:** é um **gerador/template** (expande em N instâncias: DDS diário, medição mensal), não um
  tipo de nó. Mexe no motor (persistência das instâncias, CPM, recálculo no deslize). Reusar o padrão de cron do
  Módulo Tarefas quando houver demanda. **Diferido.**
- **Checklist:** é **atributo de uma tarefa** (lista de sub-itens binários que dirige o % de avanço), não irmão
  de "Tarefa". Modelar como `checklist?: {label; done}[]` em `ItemScheduleDetails` numa fase futura. **Diferido.**
- **Profundidade arbitrária de Resumo:** hoje travada em 3 níveis (Grupo/Etapa/Subetapa). Só reabrir se a
  compatibilidade P6/MSP virar requisito (ver §7).
- **Import/Export `.mpp`/`.xer`:** fora de escopo (ver §7).

## 7. Decisão em aberto (gate)

**A compatibilidade com P6/MS Project é requisito real (import/export de `.mpp`/`.xer`) ou aspiracional?**
- **Real** → o modelo estrutural ganha peso: avaliar profundidade arbitrária de Resumo e um mapeamento de
  ida/volta dos atributos. A Natureza vira metadado descartado na exportação (não quebra compatibilidade).
- **Aspiracional** → ignorar compatibilidade como driver; otimizar 100% para integração com os módulos ÒPURA —
  os 3 tipos atuais bastam e a Natureza é o único investimento que importa.

> **Recomendação:** tratar como aspiracional até haver pedido concreto de cliente. Priorizar Natureza.

## 8. Modelo de dados (resumo)

```ts
// types/schedule.ts
export enum TaskNature {
  PRODUCAO='PRODUCAO', COMPRA='COMPRA', CONTRATACAO='CONTRATACAO', APROVACAO='APROVACAO',
  INSPECAO='INSPECAO', SEGURANCA='SEGURANCA', QUALIDADE='QUALIDADE', FINANCEIRO='FINANCEIRO',
  BIM='BIM', DOCUMENTACAO='DOCUMENTACAO', RH='RH', MANUTENCAO='MANUTENCAO',
}

export interface OutlineNode {
  // ...existente...
  nature?: TaskNature;           // NOVO — só em folhas (item/activity); estruturais ignoram
}

export interface ItemScheduleDetails {
  // ...existente...
  inactive?: boolean;            // NOVO — pulada pelo motor (CPM/duração/curva S)
}
```

Persistência: nenhuma migration — tudo em `projects.settings.schedule` (JSONB), como o resto do cronograma.

## 9. Arquivos afetados (estimativa)

- `types/schedule.ts` — `TaskNature`, `OutlineNode.nature`, `ItemScheduleDetails.inactive`.
- `components/schedule/OutlineNodeModal.tsx` — seletor de Natureza + atalho "Marco".
- `components/schedule/OutlineRowMenu.tsx` — ações "Adicionar Marco", "Marcar Inativa", "Definir Natureza".
- `components/FinancialSchedule.tsx` — handlers (`handleSetNature`, `handleToggleInactive`, criar Marco) +
  filtro por Natureza no header.
- `utils/schedulingEngine.ts` — CPM/`applyAutoDurations`/curva S ignoram `inactive`.
- `components/schedule/ScheduleGantt.tsx` / `ScheduleGridView.tsx` — cor/badge por Natureza, estilo "inativa".

## 10. Verificação

- `npx tsc --noEmit` limpo (gate de deploy).
- Testes: estender `__tests__/scheduleOutline.test.ts` (nature persistida no nó; marco com duração 0) e cobertura
  do CPM ignorando `inactive`.
- Manual: criar Marco (losango no Gantt, 0d); definir Natureza e ver cor/badge + filtro; marcar tarefa Inativa e
  confirmar que sai do cálculo de duração/CPM/curva S; recarregar e confirmar persistência.

## 11. Faseamento

1. **F1 — Natureza (núcleo):** campo + enum + seletor + cor/badge + filtro. **Maior valor, baixo risco.**
2. **F2 — Marco + Inativa:** ações no menu + motor ignora inativa.
3. **F3 (futuro, sob demanda):** vínculos por Natureza (Compra→Procurement, Aprovação→Governance...) — junto com
   Last Planner/Restrições (Fase 1⭐) e Centro de Comando (Fase 4) do [[Roadmap de Planejamento]].
4. **F4 (gate §7):** só se compatibilidade P6/MSP virar requisito.
