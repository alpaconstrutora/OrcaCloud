# Contas a Receber — lentidão ao carregar os lançamentos

## Pedido original

> financeiro< Contas a Receber: esta lento para carregar os lançamentos. verifique se existe um bug ou é devido a quantidade
>
> Sessão: 4a2d777d-8a94-4b76-aa8f-8e8b74a1626a · 2026-09-18

Pedido posterior (mesma sessão, após o diagnóstico): *"sim"* — implementar a correção recomendada.

## Diagnóstico (medido, não deduzido)

**Não é quantidade.** `vw_receivables` tem 362 linhas (2.416 lançamentos no total).
No banco, como usuário autenticado (RLS ativa): lista 46 ms a frio / 13 ms quente,
`fn_inadimplencia` 9 ms, `client_charges` 18 ms.

Em produção, Playwright logado como `agente-leitura` (roteiro `c:/tmp/pwtest/receber-perf*.js`):

| Cenário | Resultado |
|---|---|
| Abrir a tela | tabela visível em ~950 ms; a lista (290 KB) chega em 157 ms, o spinner só some ~330 ms depois |
| Digitar `alpa` (4 teclas) | 32 requisições (8 por tecla); tabela some (spinner) a cada tecla |

Duas causas, ambas no cliente:

1. **Cadeia serial de 5 idas ao servidor antes de mostrar a tabela** —
   `enrichWithEmpreendimento` em `services/receivableService.ts` (commit `a4f477a8`,
   14/09/2026, coluna Empreendimento). Depois da lista chegar, `list()` ainda faz, em
   sequência: `contracts` → `commercial_deals` → (`vw_unit_property_map` +
   `empreendimentos` ∥ `empreendimentos` + `empreendimento_towers`) → `empreendimentos`,
   e só então devolve. Com RTT de 150–300 ms (residencial/4G) são 1–2 s a mais só de espera
   encadeada.
2. **Busca sem debounce refazendo tudo** — `search` e `statusFilter` são dependências
   de `load()` em `ContasReceberManager.tsx`; cada tecla repete as 8 requisições e
   desmonta a tabela. O filtro já era aplicado em memória dentro do `list()` — a ida ao
   servidor não mudava o resultado.

Agravante latente: `sorted` tinha `rows` como dependência em vez de `rowsWithNames`;
mascarado porque a lista (lenta) chegava depois dos catálogos de CC/Plano. Ao acelerar
a lista, o defeito ficaria visível (coluna CC/Plano vazia até o próximo load).

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `services/receivableService.ts` | `list()` devolve as linhas assim que `vw_receivables` chega (sem enriquecer, sem filtrar busca/status). Enriquecimento vira `resolveEmpreendimentos(rows, orgId)` exportado, com 5 saltos seriais reduzidos a 2–3 (deals ∥ mapas). Filtro de busca/status vira função pura `filtrarRecebiveis`. Mudança de status local vira função pura `aplicarStatusLocal` (espelho do CASE da view, migration `20270909000000`). | `npx tsc --noEmit` limpo; teste unitário das duas funções puras passando |
| 2 | `components/ContasReceberManager.tsx` | `load()` só reage a organização/período; busca e status filtram em memória (`filtrarRecebiveis`) — nenhuma requisição ao digitar. Tabela aparece com a lista; Empreendimento preenche quando `resolveEmpreendimentos` termina (guarda de resposta fora de ordem). Baixa / estorno / troca de status / exclusão / baixa em lote atualizam o array local (§22) e só a inadimplência é reconsultada, sem spinner. `sorted` depende de `rowsWithNames`. | Playwright em produção: digitar 4 teclas = 0 requisições; tabela visível antes da cadeia de empreendimento terminar; `check-ui-standard.sh` sem achado novo |
| 3 | `__tests__/receivableService.test.ts` | Testes de `filtrarRecebiveis` (busca em cliente/descrição/obra/empreendimento/reference_id; status por `effective_status`) e de `aplicarStatusLocal` (RECEBIDO, CANCELADO remove, PREVISTO com vencimento passado vira VENCIDO, PARCIAL mantém). | `npx vitest run __tests__/receivableService.test.ts` verde |
| 4 | `docs/ui_ux_guia_unificado.md` §22 | Contas a Receber sai da lista de pendências de propagação. | Diff do guia |

## Estado

- [x] 1 — service
- [x] 2 — componente
- [x] 3 — testes
- [x] 4 — guia

## Verificação

1. `npx tsc --noEmit -p .` e `npx vitest run __tests__/receivableService.test.ts __tests__/orgContextGuard.test.ts`.
2. `bash scripts/check-ui-standard.sh components/ContasReceberManager.tsx`.
3. Após o push (deploy), `c:/tmp/pwtest/receber-perf2.js` contra produção: cenário B
   tem de mostrar 0 requisições ao digitar e spinner em 0 amostras; cenário A a tabela
   visível antes de `contracts` responder.
