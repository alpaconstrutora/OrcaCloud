# Conciliação: categorias fora da conciliação (ex.: "Movimentação")

## Pedido original
> em regras, implementar funcionalidae de não inclusào no motor de sugestão de conciliacao (central).
> por exemplo movimentações. Nesse caso, todos os lançamentos no extrato cuja categoria = movimentacao nào entra na conciliacao. Isso diminui a quantidade na analise
> Sessão df7b7923 · 2026-10-01

## Decisões do usuário (01/10/2026)
| Pergunta | Resposta |
|---|---|
| Alcance da exclusão | **Motor de sugestões (Central), Agrupamentos sugeridos, Divergências e lista da Pendentes** (no Extrato continuam) |
| Transferências entre contas próprias | **Continuam pareando** — a exclusão não vale para essa etapa |
| Configuração | **Lista no painel Regras** da Central, por organização (a da conta) |

## Contexto (medido)
- Na Sicredi da Alpa, **1.028 dos ~5.700** extratos que o motor analisa (18%) têm categoria
  "Movimentação" — viram sugestão inútil contra títulos.
- O motor escolhe os extratos em 4 pontos: Edge `reconciliation-engine/index.ts` (:211 pontuação,
  :187 transferências) e navegador `bankReconciliationService.ts` (:1026, :1110). Ajustes por
  org já vivem em `reconciliation_settings` (lidos por `carregarAjustes`/`loadSettings` →
  `regras.montarAjustes`).
- ⚠️ No PostgREST `category not in (...)` também esconde `category IS NULL` (os sem
  classificação, os que mais importam). Filtro sempre por função pura em memória ou com `or(is.null, …)`.

## Plano

### 1. Migration `aplicar_20271001000050_categorias_fora_da_conciliacao.sql`
- `ALTER TABLE reconciliation_settings ADD COLUMN excluded_categories text[] NOT NULL DEFAULT '{}'`.
- `fn_reconciliation_divergences` recriada: `bank_pending` ignora extrato cuja categoria está na
  lista da org dele (`NOT EXISTS … rs.organization_id = bt.organization_id AND bt.category = ANY(rs.excluded_categories)`),
  comparação sem acento/caixa. REVOKE PUBLIC/anon (REGRA #7).
- **Pronto:** aplicada; ACL ok; Divergências da Alpa com a lista ["Movimentação"] cai ~na proporção
  (medir antes/depois em transação desfeita).

### 2. `utils/reconciliationRules.ts` + teste
- `excluded_categories: string[]` em `ReconciliationEngineSettings`/`montarAjustes` (padrão `[]`).
- Pura `foraDaConciliacao(categoria, excluidas)`: comparação normalizada ("Movimentação" =
  "movimentacao"); categoria vazia nunca é excluída.
- **Pronto:** testes (acento/caixa, vazio, lista vazia).

### 3. Motor — Edge e navegador
- Leitura de `excluded_categories` junto das tolerâncias; `category` no select dos extratos.
- Pontuação usa só os elegíveis; **`fn_replace_suggestions` recebe TODOS os ids** (as sugestões
  antigas dos excluídos somem no próximo Reprocessar). Transferências: inalteradas.
- Edge republicada (`--no-verify-jwt`) + prova `curl` 401 (REGRA #7, pergunta 3).
- **Pronto:** teste do plano; Reprocessar real na Sicredi reduz as sugestões.

### 4. Agrupamentos (`reconciliationGroupService.findGroups`) e tela
- `findGroups` lê a lista e tira os excluídos antes de agrupar.
- `BankReconciliation.loadTransactions`: na Pendentes/Central (não no Extrato) tira os extratos
  excluídos da lista e as sugestões deles — efeito imediato, sem esperar Reprocessar.
- **Pronto:** navegador: lista da Pendentes e cartões da Central sem "Movimentação"; Extrato mostra.

### 5. `components/reconciliation/RegrasSheet.tsx` — seção "Categorias fora da conciliação"
- Na lista do painel: chips das categorias excluídas + seletor para adicionar (mesmas `categories`),
  remover no ×; grava em `reconciliation_settings` da org da conta (upsert só da coluna nova).
  Texto: "Extratos destas categorias não geram sugestão, não entram em agrupamentos, divergências
  nem na Pendentes. Continuam no Extrato e nas transferências entre contas."
- Serviço: `lerCategoriasExcluidas(org)` / `salvarCategoriasExcluidas(org, lista)`.
- **Pronto:** `check-ui-standard` 0; salva e relê no navegador (escrita real só com ok do usuário).

## Verificação
Testes + suíte (conta fechando), `tsc`, `segurancaMigrations`, `orgContextGuard`; transação
desfeita para divergências; navegador com escritas bloqueadas (lista e cartões filtrados);
Edge `curl` 401; por fim Reprocessar real na Sicredi (usuário clica) e contagem de sugestões.

## Estado (01/10/2026)

- [x] 1. Migration `aplicar_20271001000050_categorias_fora_da_conciliacao.sql` (o 000030 já era de
  outra frente) **aplicada**. Antes, transação desfeita na Alpa com a lista `['movimentacao ']`:
  "extrato sem lançamento" 7.826 → 6.346 e "valor divergente" 1.396 → 1.380 (−1.496 = exatamente os
  pendentes "Movimentação" da org); lista vazia = resultado idêntico ao de antes; 71 ms. Depois:
  coluna com default `'{}'`, 0 orgs com lista, ACL `{postgres, authenticated, service_role}`,
  `segurancaMigrations` verde.
- [x] 2. `foraDaConciliacao` + `excluded_categories` em `montarAjustes`/`AJUSTES_PADRAO`; filtro no
  início de `planMatching` (Edge e navegador usam a mesma função). 8 testes novos em
  `bankReconciliation.engine.test.ts` (o caso "sem lista concilia" prova que é o filtro que tira o par).
- [x] 3. Edge republicada (`--no-verify-jwt`). Sem cabeçalho → 401. Só anon → 401, mas em 90 s:
  o Supabase Auth estava fora no momento (`/auth/v1/health` 522/524). Refazer a prova com o Auth de volta.
- [x] 4. `findGroups` e `loadTransactions` (Pendentes/Central; Extrato não) filtram.
- [x] 5. Seção "Categorias fora da conciliação" no painel Regras; grava ao adicionar/remover;
  ao fechar com mudança, a Central recarrega. `check-ui-standard` 0, `orgContextGuard` verde.
- Navegador (escritas bloqueadas, Sicredi da Alpa, lista simulada na leitura): Pendentes
  **5.695 → 4.667** extratos (−1.028 = os "Movimentação" pendentes da conta), 0 células
  "Movimentação" na página; Extrato segue com 5.803; seletor do painel sem "Movimentação" (já na
  lista); gravação bloqueada aparece como erro no painel, sem chip falso.
  Central: não conferida (Auth fora derrubou o login antes).
- `tsc` 0. Suíte: 6.688 passaram, 0 falharam, 33 pulados; 113 do `BlueprintEditor.test.tsx`
  inacabados no relatório (instabilidade conhecida) — isolado, 193/193. `check-xss-sinks` limpo.
- [ ] Publicar (com ok do usuário) → usuário marca "Movimentação" no painel e roda Reprocessar
  na Sicredi → contar sugestões.
