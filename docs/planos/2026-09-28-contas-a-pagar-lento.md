# Contas a Pagar lento — paginar a exibição, apropriação numa consulta, blocos em paralelo

## Pedido original

> financeiro < contas a pagar: o carregamento esta muito lento. acho que o motivo pode ser que esta carregando todas os lançamentos. analise se é esse o problema e proponha uma solucao

Sessão: bb2c0b2c-6a6a-4d7c-99c3-fe5ae62db2ee · 28/09/2026

Pedido posterior (mesma sessão, depois do diagnóstico medido):

> implementar os 3

## Diagnóstico (medido, não deduzido)

Produção, usuário `agente-leitura`, script `c:/tmp/pwtest/pagar-perf.js`
(rodado pelo usuário), navegação para `#/contas-a-pagar`:

| Etapa | Tempo |
|---|---|
| 3 blocos de `vw_payables` em série (558 + 289 + 176 ms) | terminam em 1,35 s |
| Render de 2.030 linhas / 83.156 nós no `<tbody>` (long task ~600 ms) | tabela visível em 1,96 s |
| `allocationSummary`: 14 lotes de 150 ids em série | até 3,47 s |
| Busca "alpa" (4 teclas) | 0 requisições, ~430 ms de long tasks |

Banco: a mesma consulta leva 15 ms como `postgres` e 90–690 ms com RLS
(`is_org_member` por linha). O palpite do pedido ("carrega todos os
lançamentos") está meio certo: trazer ~2.000 títulos não é o custo; desenhá-los
todos e buscar a apropriação em 14 idas seriais é.

Havia 2 apropriações no banco inteiro (28/09/2026) — as 14 consultas eram para
achar 2 linhas.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 28/09/2026 | Item 2: carregar apropriação só da página visível quebraria busca e ordenação por Imóvel nas outras páginas. Trocar por 1 consulta com as apropriações da organização, cruzadas no navegador? | "1 consulta da org (Recomendado)" |

## Plano

### 1. `components/ContasPagarParcelas.tsx` — paginar a exibição (§6.7)

**O que muda:** o `<tbody>` desenha só a página atual (padrão 100 linhas;
50/100/200/500, tamanho persistido em `contasPagarParcelas:pageSize`, página
atual não persiste). Busca, filtros, ordenação, rodapé "N parcelas / total em
aberto" e o recorte reportado ao pai (export) continuam sobre a lista filtrada
inteira. Rodapé de paginação igual ao do `StandardTable`/Extrato. "Selecionar
todos" marca só a página; Shift+clique usa o índice global (`pageStart + i`).
Página volta para 1 a cada mudança de recorte (busca, status, origem, período,
ordenação, tamanho, organização) — mas NÃO quando uma linha muda de status
(§22: marcar como pago na página 3 não pode jogar para a página 1). Deep-link
(`focusId`) vai para a página que contém o título antes de rolar até ele.

**Como sei que terminou:** com 2.030 títulos, o `<tbody>` tem ≤ 100 linhas;
teste em `__tests__/components/ContasPagarDeepLink.test.tsx` cobre deep-link
para título fora da primeira página; long task da carga medida no script cai
de ~600 ms.

### 2. `services/propertyExpenseService.ts` — apropriação numa consulta

**O que muda:** `allocationSummary(ids, organizationId?)` deixa de mandar os
ids em `.in()` por lotes de 150 (14 idas em série com 2.030 títulos) e passa a
ler as apropriações da organização (`.eq('organization_id')` quando há
organização; em "Todas", a RLS recorta), paginando por `.range()`, e cruza com
os ids no cliente. Seguro porque `fn_set_property_allocations` grava a
organização DA TRANSAÇÃO (`v_org` lido de `internal_transactions`) —
conferido no banco: 2 de 2 apropriações com a mesma organização do título.

**Como sei que terminou:** na medição, `property_expense_allocations` aparece
1 vez (não 14); coluna Imóvel e busca por imóvel continuam funcionando para
linhas de qualquer página.

### 3. `services/payableService.ts` — blocos de `vw_payables` em paralelo

**O que muda:** o 1º bloco vem com `count: 'exact'`; os demais são disparados
juntos. Se o último bloco vier cheio (entrou título entre a contagem e a
busca), continua em série até vir incompleto — a contagem acelera, não
decide sozinha o que existe.

**Como sei que terminou:** na medição, os blocos 2 e 3 começam juntos (mesmo
`t0` de início) e a lista termina antes de 1,35 s; teste unitário do service
cobre contagem > 1000 e título extra entre a contagem e a busca.

## Fora de escopo (registrado para depois)

- Política de `internal_transactions` avaliando `is_org_member` por linha
  (15 ms → 90–690 ms). Atinge toda tela que lê a tabela — frente própria, com
  medição antes/depois.
- Visão "Notas fiscais" desta tela (tabela `invoices`) também não pagina.

## Estado

- [x] 1. Paginar a exibição — 5 testes novos em `ContasPagarDeepLink.test.tsx` (100 de 250 linhas no `<tbody>`, deep-link para a página 2, página mantida quando linha muda de status, busca volta à 1 e acha linha de qualquer página, "selecionar todos" só na página); `check-ui-standard.sh` limpo
- [x] 2. Apropriação numa consulta — `fetchAllPages` sobre `property_expense_allocations` da org, cruzada com os ids; guarda `alocacoesSeq` contra resposta fora de ordem ao trocar de org
- [x] 3. Blocos em paralelo — `fetchAllPagesParallel` em `lib/supabasePaginate.ts` (contagem `head: true` ao lado da 1ª página, restantes juntas, série como rede quando a contagem falha ou fica velha); 5 testes novos em `supabasePaginate.test.ts`
- [x] `npm run ci` na frente: 510 arquivos / 5.839 testes verdes, build ok; `verificar:build` ok
- [ ] Publicação (push em `main`)
- [ ] Medição depois da publicação (mesmo script)

## Verificação

1. `npx vitest run __tests__/components/ContasPagarDeepLink.test.tsx __tests__/payableService*.test.ts`
2. `bash scripts/check-ui-standard.sh components/ContasPagarParcelas.tsx`
3. `npm run ci`
4. Depois de publicado, o usuário roda `c:/tmp/pwtest/pagar-perf.js` (com a
   rodada 2 corrigida para navegar para outra rota antes) e compara com a
   tabela do Diagnóstico.
