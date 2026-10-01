# Conciliação: incluir (ou não) extratos sem credor/cliente

## Pedido original
> no drawer Regras de classificação: incluir checkbox com: Incluir lançamentos do extrato sem credor/ cliente definido. se tiver selecionado incluir,se nao estiver selecionado incluir

Sessão df7b7923 · 2026-10-01.

## Decisões do usuário
| Pergunta | Resposta |
|---|---|
| Onde vale | **Na conciliação (Central)** — ajuste da organização, junto de "Categorias fora da conciliação" |
| Padrão | **Marcado (incluir)** — nada muda até alguém desmarcar |

## Contexto (medido, Sicredi da Alpa)
- 2.095 dos 5.695 extratos pendentes sem `counterparty_name` (o único campo de credor/cliente
  do extrato); 50 sugestões apontam para eles. Lista de categorias já gravada pelo usuário:
  `{Movimentação, Pró-labore, Saque}`.
- O motor reconhece a contraparte (CNPJ/PIX/apelido) e grava `counterparty_name` no próprio
  Reprocessar. Por isso, no motor, "sem credor/cliente" = sem nome **e** não reconhecido.

## Plano
1. Migration: `reconciliation_settings.include_without_counterparty boolean NOT NULL DEFAULT true`;
   `fn_reconciliation_divergences` ignora extrato sem contraparte quando a org desligou.
2. `utils/reconciliationRules.ts`: `extratoForaDaConciliacao(tx, opcoes)` (categoria OU sem
   contraparte) + campo em `montarAjustes` (padrão `true`); `planMatching` usa, com a exceção do
   reconhecido pelo índice de contrapartes. Testes.
3. Edge e navegador leem o campo; Edge republicada + `curl` 401.
4. `findGroups` e `loadTransactions` (Pendentes/Central) usam a mesma função.
5. Painel Regras: checkbox "Incluir lançamentos do extrato sem credor/cliente definido" na seção
   "fora da conciliação"; grava ao clicar. Serviço passa a ler/gravar os dois filtros juntos.

## Verificação
Transação desfeita para divergências; testes; `tsc`; `check-ui-standard`; `orgContextGuard`;
navegador com escritas bloqueadas (checkbox desmarcado simulado → Pendentes cai os sem contraparte).

## Estado (01/10/2026)
- [x] 1. `aplicar_20271001000070_conciliacao_extrato_sem_contraparte.sql` **aplicada** (o 000060 já
  era de outra frente). Antes, transação desfeita na Alpa: padrão = idêntico ao de antes; desligado,
  "sem lançamento" 5.376 → 3.562 e "valor divergente" 1.097 → 883 (−2.028 = os pendentes sem
  contraparte fora das categorias excluídas); 53 ms. Depois: default `true`, 0 orgs desligadas, ACL ok.
- [x] 2. `extratoForaDaConciliacao` + `include_without_counterparty` em `montarAjustes`; no
  `planMatching`, sem nome mas reconhecido pelo índice continua. 7 testes novos.
- [x] 3. Edge republicada; `curl` sem cabeçalho → 401 (0,9 s), só anon → 401 (1,1 s).
- [x] 4. `findGroups` e `loadTransactions` usam a mesma função; serviço lê/grava os dois filtros
  (`lerFiltrosDaConciliacao`/`salvarFiltrosDaConciliacao`).
- [x] 5. Painel: seção renomeada "Fora da conciliação", checkbox com explicação; grava ao clicar.
- Navegador (escritas bloqueadas, Sicredi da Alpa, lista real `{Movimentação, Pró-labore, Saque}`):
  opção marcada → Pendentes 3.894, Central 44 cartões; desmarcada (simulada sobre a resposta real)
  → Pendentes **3.242** (= contagem do banco), Central **18**; Extrato 5.803 nos dois. Clique com
  gravação bloqueada: checkbox não muda e o erro aparece.
- `tsc` 0; suíte 6.934 passaram + 33 pulados = 6.967 (fecha); `check-ui-standard` 0;
  `orgContextGuard` verde.
