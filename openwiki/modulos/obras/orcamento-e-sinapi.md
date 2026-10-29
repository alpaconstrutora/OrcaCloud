---
type: módulo
title: "Obras: orçamentação, SINAPI e estimativa paramétrica"
description: Como o orçamento é guardado (budget e EAP dentro do projeto ORCAMENTO, versões em settings.versions), como outros projetos resolvem "o orçamento efetivo" (budgetResolver), a base SINAPI versionada por competência (importação em lotes e rebase), a reconstrução da EAP quando ela se perde, o CUB por padrão/UF e o motor puro de áreas NBR 12721.
tags: [budget, orcamento, sinapi, eap, wbs, cub, nbr12721, parametric]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-b3360bf1c381b7ea25e7b58f
    resource: repo://components/SinapiRebaseModal.tsx
  - id: openwiki-source-dcc87a9328ab99a3e1f301ce
    resource: repo://services/budgetResolver.ts
  - id: openwiki-source-8020b5d4407269ffcea76cf0
    resource: repo://services/cubService.ts
  - id: openwiki-source-f4c4894c777cf757d301ae5b
    resource: repo://services/sinapiService.ts
  - id: openwiki-source-390ad192edb0fce958b27438
    resource: repo://supabase/functions/sinapi-import/index.ts
  - id: openwiki-source-b908942364b01306ad5afc48
    resource: repo://types/budget.ts
  - id: openwiki-source-9729f19af491f07b0e913b04
    resource: repo://utils/nbr12721/quadros.ts
  - id: openwiki-source-524c7ef4339a715b70372852
    resource: repo://utils/nbr12721/tipos.ts
  - id: openwiki-source-3d09a7fde4ed71590ea82f65
    resource: repo://utils/wbsFromBudget.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Obras: orçamentação, SINAPI e estimativa paramétrica

## Onde o orçamento mora

Orçamento é um **projeto** com `settings.classification = 'ORCAMENTO'` (ver
[Projetos e classificação](../../conceitos/classificacao-de-projetos.md)). O
que importa nele:

| Campo | Conteúdo |
|---|---|
| `projects.budget` | lista de `BudgetEntry` — cada linha aponta um `sinapiItem` (composição ou insumo), quantidade, BDI, etapa (`group`/`phase`/`subPhase`), disciplina, local (bloco/torre/pavimento/cômodo), centro de custo, memória de cálculo, classe de precisão (A–E) e status |
| `settings.wbs` | a **EAP** (árvore de etapas) que a tela renderiza |
| `settings.versions` / `activeVersionId` | versões do orçamento; a ativa recebe uma cópia do `budget` a cada auto-save |
| `settings.basedOnBudgetSnapshot` | em planejamento: o orçamento congelado em que ele se baseia |

Editor: `components/BudgetEditor.tsx` (~4.000 linhas). O auto-save (debounce de
2 s, salvar ao trocar de projeto) é do `usePersistenceSync` — ver
[Estado e acesso a dados](../../arquitetura/estado-e-dados.md).
`utils/budgetPersistence.ts` clona `budget`/`settings` antes de gravar.

### Orçamento efetivo de outro projeto: `budgetResolver`

`projects.budget` só tem itens no projeto que **é** o orçamento. Os demais
encontram o orçamento por vínculo — `linkedProjectId` aponta sempre do filho
para o pai: **PLANEJAMENTO → ORCAMENTO → OBRA**. `services/budgetResolver.ts`
devolve os itens e de onde vieram (`BudgetSource`):

| Fonte | Quando |
|---|---|
| `own` | o próprio projeto é o orçamento |
| `snapshot` | planejamento com orçamento congelado |
| `pinned-version` | fixado numa versão do orçamento vinculado |
| `active-version` | versão ativa do vinculado, fixada agora (o chamador grava o snapshot) |
| `linked-live` | vinculado sem versões |
| `child-project` | obra: o orçamento é o projeto filho que aponta para ela |

**Quem precisa dos itens de orçamento de um projeto passa por aqui**, não lê
`project.budget` cru.

### EAP perdida ≠ itens perdidos

A árvore do orçamento só mostra o que está em `settings.wbs`, e casa item ↔ nó
por **igualdade exata de string** (`item.phase === phase.name`). Os KPIs somam o
array inteiro. Se a EAP se perde (importação de EAP que não remapeia itens,
restauração de versão sem `wbs`, ponte que grava em grupo não registrado — como
a Planta Inteligente), o orçamento fica com total certo e árvore vazia, e a tela
chama os itens de "fantasmas".

`utils/wbsFromBudget.ts` **reconstrói a EAP** a partir dos caminhos que os
itens carregam, em vez de apagar o orçamento: nomes preservados caractere por
caractere, nível em branco vira `'Geral'` (no nó e no item), ids posicionais
(`01`, `01.01`) só para expandir/recolher.

## Base SINAPI

`services/sinapiService.ts` (singleton `sinapiService`) lê `sinapi_items`,
`sinapi_references` e itens próprios (`custom_items`).

- **Versionamento por competência**: cada item pertence a uma competência
  (`reference_date` `'YYYY-MM-DD'`, rótulo `'MM/AAAA'`).
  `resolveReferenceDate` aceita o formato canônico ou o rótulo legado; sem
  referência, usa a competência publicada mais recente. Se a tabela de
  referências não existe, as buscas não filtram por competência — o código é
  seguro mesmo publicado antes da migration.
- **Importação**: `SinapiImportModal` processa a planilha no navegador e envia
  lotes de até 200 itens à Edge Function `sinapi-import` (só gestor); o último
  lote (`is_last`) registra a competência em `sinapi_references`. Há também
  scripts de carga (`scripts/loadSinapi.mjs`, `SINAPI_IMPORT.md`).
- **Rebase** (`SinapiRebaseModal`): leva um orçamento fixado numa competência
  para uma mais nova; só itens SINAPI participam (base própria não é
  versionada) e a comparação usa custo direto sem BDI.
- Importação de planilhas de orçamento/EAP: `ExcelImportModal`,
  `WBSImportModal`, `WBSTemplateModal`; bases customizadas em
  `DatabaseManagerModal`/`customDatabaseService`.

## Estimativa paramétrica e CUB

- `components/ParametricEstimator.tsx` + `services/parametricService.ts`:
  estimativa rápida por área × CUB/m² com BDI e ajustes, a partir de
  `ProjectSettings`.
- `services/cubService.ts`: o CUB de **um** padrão numa UF (mês mais recente de
  `cub_parametric_data`, linha "Total"), criado para o Estudo de Massa que
  precisa do R$/m² puro. O mapa padrão → coluna é **explícito**
  (`COLUNA_DO_PADRAO_CUB`, ex.: `PP-N` → `pp_4_n`); montar o nome da coluna a
  partir da chave erra em silêncio e cai em valor estimado — defeito que o
  `parametricService` ainda tem para alguns padrões.
- Painel de mercado: `CUBMarketPanel`.

## NBR 12721 (áreas e frações)

`utils/nbr12721/` é um **motor puro** de áreas da NBR 12721 (Quadros I, II,
IV-B; coeficientes e frações ideais):

- a entrada **não conhece a planta**: blocos, pavimentos, unidades e espaços já
  classificados. Adaptadores montam isso — `utils/blueprintNbr12721.ts` a partir
  do desenho, ou o estudo sem desenho a partir de áreas declaradas — e os dois
  caem no mesmo cálculo;
- a saída usa os **nomes das colunas do SQL antigo**
  (`qi_02_private_covered_standard_raw`…), que a exportação PDF/XLSX e o
  memorial de incorporação já leem;
- `calcularNbr12721`, `validarNbr12721` (pendências), arredondamento no mesmo
  ponto do SQL antigo e `milesimosPeloMaiorResto` para frações que somam
  exatamente 1; conferido contra fixtures em `__tests__/fixtures/nbr12721/`;
- `VERSAO_DO_MOTOR_NBR12721` carimba a versão do motor.

Os quadros moram hoje na Planta Inteligente (o antigo "Motor de Áreas"
saiu). Constantes da norma em `constants_nbr.ts`.

## Do orçamento para o resto

- **Planejamento**: o cronograma se baseia no orçamento (snapshot ou versão
  fixada) — ver [Planejamento e diário](./planejamento-e-diario.md).
- **Suprimentos**: cotações e plano de aquisições partem dos itens do orçamento.
- **Planta Inteligente**: quantitativos do desenho viram itens de orçamento
  (`utils/blueprintBudget.ts`) — ver
  [Disciplinas e geradores](../planta/disciplinas-e-geradores.md).
