---
type: módulo
title: "Obras: planejamento, cronograma e diário de obra"
description: O planejamento é um projeto PLANEJAMENTO com cronograma em settings, calculado por um motor CPM puro (calendário, grafo, passes de ida e volta, folga, linha de base) e exibido num Gantt com grade em camada única. O diário de obra é gravado registro a registro por RPCs com trava de linha, aprovado conforme regra do banco e ligado ao cronograma pelas mesmas regras no desktop e no celular.
tags: [planning, schedule, cpm, gantt, diary, construction-log, approval]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-6c39507ce2f176179fba120e
    resource: repo://components/schedule/ScheduleGantt.tsx
  - id: openwiki-source-d3fbf7235b6a0d59e9de83a4
    resource: repo://services/diaryEntryService.ts
  - id: openwiki-source-cb83d37c13a39ccb43710b4a
    resource: repo://utils/diaryAprovacao.ts
  - id: openwiki-source-8ff070e9cc71ea44bb51d6de
    resource: repo://utils/diaryPlanningLink.ts
  - id: openwiki-source-0683851d2eaee6b7b41a4791
    resource: repo://utils/ganttDependencias.ts
  - id: openwiki-source-da047dc3c6e68b980537e1e8
    resource: repo://utils/schedulingEngine.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Obras: planejamento, cronograma e diário de obra

## Planejamento

Planejamento é um projeto `PLANEJAMENTO` (ver
[Projetos e classificação](../../conceitos/classificacao-de-projetos.md)) que
aponta para o orçamento em que se baseia (`linkedProjectId`, com snapshot do
orçamento congelado ou versão fixada — ver
[Orçamento e SINAPI](./orcamento-e-sinapi.md)). O cronograma vive no `settings`
do projeto (`schedule`, `planningVersions`, linha de base), que por isso é
pesado — listas de projeto usam o modo `lean` de `listProjects` para não baixar
tudo.

Telas: `PlanningDashboard`, `components/schedule/` — Gantt
(`ScheduleGantt`), grade (`ScheduleGridView`), diagrama de rede, EAP, linha de
base, restrições, nivelamento, cenários, Last Planner, risco do cronograma,
suprimentos/risco de abastecimento, alocação de recursos e classificação de
equipe.

### Motor CPM (`utils/schedulingEngine.ts`)

Puro e determinístico, organizado em partes:

| Parte | Papel |
|---|---|
| CalendarEngine | dias úteis (dias da semana configuráveis) e feriados (`utils/brazilianHolidays.ts`) |
| GraphEngine | ordenação topológica (Kahn) e mapa de sucessores |
| CPMEngine | passe de ida (ES/EF em ordem topológica), duração = max(EF), passe de volta (LS/LF), folga total `TF = LS − ES`, crítica se `TF = 0` |
| BaselineEngine | escorregamento e SPI contra a linha de base |

`SchedulingEngine.calculate(tasks, início, linhaDeBase, diasÚteis, modoDeReplanejamento, papéis, quantidades, trabalhadores, equipes, diasDaSemana, feriados, materiais)` devolve as tarefas com datas. Cada passe é O(V + E).

Além do CPM, o motor deriva **duração a partir das composições** do orçamento:
`deriveEffortFromComposition`, `deriveTotalLaborFromComposition`,
`autoAllocateFromComposition` e `applyAutoDurations` usam os componentes de mão
de obra (classificados por `CrewClassificationConfig`) e as quantidades para
estimar esforço e duração.

**Tarefa dividida**: `effectiveSpan` mede a janela início→fim incluindo os
intervalos entre trechos (`segments`); `duration` **nunca muda** — continua
representando o trabalho (custo/HH).

Dependências `FS`, `SS`, `FF`, `SF`. O traçado delas no Gantt
(`utils/ganttDependencias.ts`) segue o padrão MS Project: sai colado na borda da
barra **como desenhada**, desce num degrau curto e, quando o destino começa antes
da saída, contorna por baixo.

### Gantt: desempenho

A grade da timeline é **uma camada única** atrás de todas as linhas. Antes era um
`<div>` por coluna **por linha** — na escala Dia, 300 tarefas × 366 colunas davam
~120 mil nós e travavam a rolagem. O recuo/reflow ao arrastar barra só é aplicado
ao **soltar**.

### Físico × financeiro

O cronograma físico (tarefas, durações, avanço) e o cronograma financeiro
(desembolso, `FinancialSchedule`) são visões separadas do mesmo planejamento;
o financeiro deriva dos custos do orçamento distribuídos no tempo, sem misturar
os dois modelos de dado. Exportação em `utils/scheduleExport.ts`; estrutura de
tópicos em `utils/scheduleOutline.ts`.

## Diário de obra

O diário é um projeto `DIARIO` (ou se pendura numa obra) cujos registros vivem em
`settings.diaryEntries`. Telas: `ProjectDiaryManager` (desktop),
`DiaryMobileApp` (celular, PWA), `DiaryDashboard`, `DiaryReportViewer`,
`DiarioReport`. Mídia em `diaryMediaService`; rascunho local em
`utils/diaryDraft.ts`.

### Gravação registro a registro

`services/diaryEntryService.ts`:

- `salvarRegistroDiario(projectId, entry)` → RPC **`diary_upsert_entry`**;
- `excluirRegistroDiario(projectId, entryId)` → RPC **`diary_delete_entry`**;
- `carregarRegistrosDiario(projectId)` → lista atual do banco.

As RPCs travam a linha do projeto e trocam **só** o registro daquele `id`. Antes,
o diário era gravado pelo `saveProject` com a lista inteira: quem salvava por
último apagava o registro do outro (celular × desktop, campo × escritório,
auto-save).

⚠️ Um **gatilho no banco** faz o `saveProject` do projeto inteiro **manter
`diaryEntries` como está** — salvar o projeto por outro caminho não altera o
diário, em silêncio. Registro de diário só muda pelas RPCs.

As RPCs devolvem a lista **já gravada** (com o que outra pessoa lançou) e a
versão anterior do registro segundo o banco; a mídia órfã é calculada contra
ela, não contra a cópia da tela.

### Aprovação

Quem aprova/recusa registro (e altera/exclui um já aprovado) é decidido no banco
por `fn_pode_aprovar_diario`; as RPCs recusam com `42501`.
`utils/diaryAprovacao.ts` replica a regra só para o botão explicar o motivo antes:

- não é membro da organização do diário → não aprova;
- `admin`/`owner` → aprova;
- `canApproveDiary` definido no membro → vale ele;
- sem a chave → **não** aprova (membro comum não mexe em aprovações);
- organização ainda não carregada → libera o botão (o banco confere).

### Vínculo diário ↔ cronograma

`utils/diaryPlanningLink.ts` concentra as regras puras, **as mesmas no desktop e
no celular** — antes só o desktop as tinha, e o celular lançava atividade sem
vínculo e não empurrava evolução para o cronograma.

- `resolverPlanejamentoDoDiario`: o diário aponta para uma obra, orçamento ou
  planejamento; o cronograma mora no **planejamento** — a função acha o
  planejamento que aponta para o vínculo (com fallback para o próprio vínculo).
- Atividades do diário vinculadas a tarefas empurram evolução para o
  cronograma (`hooks/useDiaryLinkedPlanning.ts`).
- Mão de obra do diário pode vir do RH (`DiaryLaborFromRhSheet`,
  `utils/diaryLabor.ts`).

## Onde olhar

| Pergunta | Arquivo |
|---|---|
| datas, caminho crítico, folga | `utils/schedulingEngine.ts` |
| traçado de dependência | `utils/ganttDependencias.ts` |
| Gantt | `components/schedule/ScheduleGantt.tsx` |
| gravar/excluir registro do diário | `services/diaryEntryService.ts` |
| quem aprova | `utils/diaryAprovacao.ts` (espelho de `fn_pode_aprovar_diario`) |
| diário ↔ cronograma | `utils/diaryPlanningLink.ts` |
