---
type: conceito
title: "Projetos: obra, orçamento, planejamento, diário e projetos de sistema"
description: A tabela projects guarda quatro entidades distintas separadas por settings.classification, mais projetos criados pelo sistema como "Gestão Comercial". O corte é feito na origem (store e listProjects), com fonte única em utils/projectClassification.ts e utils/systemProjects.ts, trava no banco para a escrita e scripts que reprovam o filtro feito à mão.
tags: [projects, classification, system-projects, obra, data-model, invariants]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-74988d24f90e1f73a5e83820
    resource: repo://scripts/check-system-projects.sh
  - id: openwiki-source-f820acbec7763cd2e43e8bbe
    resource: repo://services/commercialFinanceService.ts
  - id: openwiki-source-a2e46e5b7c77b46a428626ce
    resource: repo://services/projectService.ts
  - id: openwiki-source-97ef94bd02baac0bacfd990c
    resource: repo://supabase/migrations/20270819000004_trigger_strip_system_project.sql
  - id: openwiki-source-f5f6c6e9d905816a83c660e9
    resource: repo://utils/projectClassification.ts
  - id: openwiki-source-d32fb451f574f8e66ad49bc2
    resource: repo://utils/systemProjects.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Projetos: obra, orçamento, planejamento, diário e projetos de sistema

A tabela `projects` é sobrecarregada. Cada linha guarda tudo em
`settings` (JSONB) e é **uma de quatro coisas**, distinguidas só por
`settings.classification`:

| Classificação | O que é | Onde aparece |
|---|---|---|
| `OBRA` | a obra de verdade | Engenharia › Obras, e todo seletor de "obra" |
| `ORCAMENTO` | orçamento | Engenharia › Orçamentos, seletor "vincular orçamento" |
| `PLANEJAMENTO` | planejamento/cronograma | Planejamento |
| `DIARIO` | diário de obra | Diário |
| `COST_ESTIMATION` (legado) | tratado como irmão de `ORCAMENTO` | seletores de orçamento antigos |

Além disso existem **projetos de sistema** — hoje só **"Gestão Comercial"**,
criado por `services/commercialFinanceService.ts` para pendurar parcelas e
transações da área comercial. Ele é gravado com `classification: 'OBRA'` e
`isSystemProject: true`.

**Regra de produto:** quando a tela fala em "obra", ela mostra **só `OBRA`** e
nunca projeto de sistema. Orçamento e planejamento só aparecem quando a tela
pede por eles explicitamente.

## Por que o corte é na origem

Isso era decidido tela a tela e as telas discordavam: dezenas de comparações
`=== 'OBRA'`, listas de exclusão que deixavam passar projeto sem
classificação, e telas sem filtro algum (um planejamento "Plan: Garden"
aparecia na coluna Obra de Contratos e de Boletos). Para "Gestão Comercial",
eram 28 filtros `p.name !== 'Gestão Comercial'` em 18 arquivos — e o bug
voltava, porque **toda tela nova nasce errada**: quem escreve não tem como
adivinhar o filtro. A solução foi tornar as fontes seguras por padrão.

## Fontes de projetos e o que fazer com cada uma

| Fonte | Conteúdo | O que a tela faz |
|---|---|---|
| `useStore().projects` | só `OBRA`, sem sistema | nada |
| `useStore().allProjects` | os quatro tipos, sem sistema | usar helpers (`onlyOrcamentos`, `onlyPlanejamentos`, `onlyDiarios`) |
| `useStore().systemProjects` | só projetos de sistema | só o financeiro comercial precisa |
| `projectService.listProjects()` | default `classifications: ['OBRA']`, sem sistema | nada |
| `listProjects({ classifications: [...] \| 'ALL' })` | o que for pedido | justificar no código quando for `'ALL'` |
| `supabase.from('projects')` direto | tudo | `.not('name', 'in', SYSTEM_PROJECT_NAMES_SQL)` + helper de classificação |

No `AppRouter`, `typedProjects` (só obra) vai para quase todas as telas e
`typedAllProjects` só para as que tratam explicitamente dos outros tipos (ver
[Navegação](../arquitetura/navegacao-e-telas.md)).

### `listProjects` recebe um objeto de opções

`listProjects(opcoes)` aceita `{ clientId, organizationId, includeOrphans,
empresaId, includeSystemProjects, classifications, lean }`. A troca de
parâmetros posicionais por objeto foi proposital: forçou o compilador a apontar
cada uma das ~30 chamadas existentes quando `classifications` ganhou o default
seguro.

- `organizationId` nulo = "Todas" (a RLS recorta); `empresaId` tem precedência;
  `includeOrphans` traz também `organization_id IS NULL`.
- O filtro de classificação roda **em memória**, pelos helpers, e não em SQL —
  para não haver duas fontes da verdade sobre o caso "sem classificação".
- `lean: true` busca só as chaves escalares de `settings` necessárias para
  filtro e rótulo (`classification`, `isSystemProject`, `name`,
  `organizationId`, `code`). O `settings` completo pesava ~1,2 MB por chamada
  (cronograma, versões de planejamento, financeiro). ⚠️ O `settings` devolvido
  em modo enxuto é **parcial**: quem lê cronograma, WBS ou financeiro não pode
  usar `lean`.

O store chama `listProjects({ classifications: 'ALL' })` uma vez e deriva as
três listas (ver [Estado global](../arquitetura/estado-e-dados.md)).

## Fonte única: `utils/projectClassification.ts`

- `getClassification(p)` normaliza o valor (maiúsculas, trim) e reconhece o
  legado `COST_ESTIMATION` — que nunca é obra.
- `isObra`, `isOrcamento`, `isPlanejamento`, `isDiario`,
  `isOrcamentoOuLegado`, `onlyObras`, `onlyOrcamentos`… são os únicos filtros
  aceitos.
- **`TRATAR_SEM_CLASSIFICACAO_COMO_OBRA = false`** é a única linha que decide o
  caso ambíguo: projeto sem classificação **não** é obra. O default do próprio
  sistema (`INITIAL_PROJECT_SETTINGS.classification`) é `'ORCAMENTO'`; tratar
  ausência como obra traria orçamento antigo de volta às listas. A consequência
  aceita é que uma obra legada sem o campo some até ser classificada — um erro
  visível, não silencioso. Diagnóstico no banco:
  `scripts/diagnostico-classificacao-projetos.sql`. A correção preferida é
  backfill, não virar a constante.

## Fonte única: `utils/systemProjects.ts`

- `isSystemProject(p)` é verdadeiro se `settings.isSystemProject === true`
  **ou** se o nome está em `SYSTEM_PROJECT_NAMES`. O fallback por nome cobre
  linhas que o backfill do flag não alcançou (outro ambiente, backup antigo).
- `excludeSystemProjects` / `onlySystemProjects` filtram listas.
- `SYSTEM_PROJECT_NAMES_SQL` serve para `.not('name','in', …)`. O corte SQL é
  por **nome**, não pelo flag: um filtro sobre chave JSON ausente descartaria a
  linha e esconderia obras reais.
- `projectService.deleteProject` recusa excluir projeto de sistema.

### A regra vale também na escrita

Projeto de sistema **nunca é dimensão obra de um lançamento**: o `project_id`
gravado a partir dele é sempre `NULL`.

```ts
const projectId = isSystemProject(project) ? null : (project.id ?? null);
```

O bug que motivou isso: `financialSyncService` gravava `project_id =
project.id` do projeto comercial, e toda parcela de Vendas/Locações aparecia em
Contas a Receber, no Scorecard e nos alertas de risco com Obra = "Gestão
Comercial". Nenhum filtro de listagem resolvia — o dado já nascia errado.

Rede de segurança no banco: a trigger
`fn_strip_system_project_from_internal_tx` (migration
`20270819000004_trigger_strip_system_project.sql`, `SECURITY DEFINER` para
enxergar `projects` mesmo sob RLS) zera o `project_id` de
`internal_transactions` quando aponta para projeto de sistema. Ela protege
caminhos futuros (Edge Function, import, SQL direto); não é desculpa para
gravar errado. Ver [Financeiro: títulos e sincronização](../modulos/financeiro/titulos-e-sincronizacao.md).

## Verificação mecânica

```bash
bash scripts/check-project-classification.sh [arquivo]   # reprova === 'OBRA' literal
bash scripts/check-system-projects.sh [arquivo]          # reprova comparação com 'Gestão Comercial'
```

Ambos saem com código ≠ 0 ao achar o padrão proibido; cada um tem uma
allowlist de arquivos que mencionam o literal legitimamente. Eles **não**
pegam "chamou `listProjects` e usou o resultado sem pensar" — essa é a razão
do default seguro.

Ao ver um desses projetos num lugar novo, pergunte primeiro: é **leitura** ou
**escrita**?
