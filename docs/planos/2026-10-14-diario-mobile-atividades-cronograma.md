# Diário de Obras mobile — atividade vinculada ao cronograma

## Pedido original

Sessão de 14/10/2026.

> availe: operacional > diario de obra > versao mobile

A avaliação listou, como item 2 (grave): *"No celular, as atividades não se
ligam ao cronograma"* — o app mobile cria a atividade com `itemId: ''` e
quantidade planejada 0, sem seletor de item, e não repassa a evolução para o
Planejamento (o desktop faz). Editar no celular uma atividade vinculada no
desktop muda o diário e não o cronograma. O item 1 foi feito antes
(`2026-10-14-diario-gravacao-por-registro.md`). Pedido seguinte do usuário:

> item 2

## Itens — 4 de 4 concluídos em 14/10/2026

### 1. ✅ Regra única do vínculo, fora da tela
- `utils/diaryPlanningLink.ts` (puro): `resolverPlanejamentoDoDiario` (o
  `autoLinkedProjectId` do desktop), `itensCronogramaVinculaveis` (só itens que
  ainda existem no orçamento), `vincularAtividade`, `temAtividadeVinculada`,
  `aplicarEvolucaoNoCronograma` (maior evolução entre registros não recusados;
  não prevista nunca conta).
- `hooks/useDiaryLinkedPlanning.ts`: carrega cronograma + orçamento do
  planejamento (orçamento do pai quando o planejamento não tem).
- `services/diaryEntryService.ts › sincronizarEvolucaoNoPlanejamento`: relê o
  planejamento na hora e grava o cronograma.

**Pronto quando:** `__tests__/diaryPlanningLink.test.ts` passa.

### 2. ✅ Desktop (`ProjectDiaryManager`) usa as mesmas peças
Sai a cópia local (autodescoberta, carga, filtro de órfãos, laço de
sincronização). A sincronização passa a disparar só quando há atividade
vinculada (antes: qualquer atividade) e o cronograma da tela é atualizado com o
que foi gravado. Vincular também recalcula `realizedQty` e `status`.

**Pronto quando:** `tsc` limpo; `check-ui-standard.sh` sem violação.

### 3. ✅ Mobile (`DiaryMobileApp`) vincula e sincroniza
- seletor nativo "Item do cronograma" no cartão da atividade, quando o diário
  tem cronograma e a atividade não é "não prevista";
- aviso "Sem item vinculado, a evolução não chega ao cronograma.";
- depois do save, empurra a evolução (mesma função do desktop); falha vira aviso.

**Pronto quando:** visto no navegador: vincular preenche descrição/quantidade/
evolução, o save manda o vínculo e o planejamento recebe o `manualRealPct`.

### 4. ✅ Verificação
Ver abaixo.

## Como foi verificado (14/10/2026)

- `diaryPlanningLink.test.ts` (novo) + `diaryActivities` + `orgContextGuard`:
  35/35 em 3 arquivos.
- `tsc --noEmit` 0 erros (1ª rodada caiu no V8 sem erro de tipo; repetida).
- `check-ui-standard.sh` 0 violação nos dois componentes.
- Harness isolado (`__ui_harness.*`, apagado antes do commit) + Playwright a
  390px, PostgREST 100% stub (nada gravado), servidor novo e cache do vite
  apagado: 13/13 — seletor lista só os 2 itens com orçamento (órfão fora); aviso
  aparece sem vínculo e some ao vincular; vincular traz "Alvenaria de vedação" e
  40% do cronograma; não prevista esconde o seletor; a RPC recebeu
  `itemId:'a', evolution:70, plannedQty:50, realizedQty:35` e a não prevista sem
  `itemId`; o PATCH do planejamento levou `manualRealPct 70` em `a` e deixou `b`
  em 0; o diário não foi gravado por PATCH; sem erro de página; sem scroll
  horizontal. PNGs conferidos (seletor, toast ao lado do FAB).
- **Desktop não exercitado no navegador**: a troca lá é pela mesma função
  testada, conferida por tipos.

## Decisões

- Seletor NATIVO (`<select>`) no mobile: no celular abre o picker do sistema,
  que lida com descrição longa melhor que uma lista própria.
- Mantido o comportamento histórico de `aplicarEvolucaoNoCronograma`: item
  vinculado que não existe no cronograma é acrescentado; a evolução nunca
  desce (corrigir 60 → 40 num registro não puxa o cronograma para trás).
