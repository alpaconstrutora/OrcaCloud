# Credit Room — cards de empreendimento pelo objetivo (Vendas · Locação · Serviços) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Pedido original

Sessão 2961426b, 22/11/2026:

> Na sequencia implementar:
> Aba empreendimento e contratos: observar Objetivo do empreendimento, se o objetivo for:
> 1. vendas: manter VGV vendido e VGV disponivel (como é atualmente
> 2. Locação: implementar Unidades locadas e Unidades disponiveis
> 3. Serviços: implementar Contrato faturado e Contrato a Faturar

Respostas às perguntas de definição (mesma data):
> Faturado: título gerado no financeiro
> Minuta: não

> "Rascunho" e "Revisão" também não entrarm

**Goal:** Na aba "Empreendimentos e contratos" (interno, portal do credor e book), o card de cada empreendimento mostra os números do seu objetivo: Vendas = VGV vendido/disponível (como hoje); Locação = unidades locadas e disponíveis com o aluguel; Serviços = contrato faturado e a faturar.

**Architecture:** Os números nascem na coleta da prévia/versão (`coletarEmpreendimentosDoEscopo` → `SnapshotEmpreendimentoItem` ganha campos opcionais) e ficam congelados na versão liberada, como o resto. Uma função pura decide as linhas do card por objetivo e é usada pela tela (interno + portal) e pelo book. Sem migration.

**Spec:** este arquivo.

## Definições (decididas com o usuário)
- **Vendas** (e objetivo vazio/misto): VGV vendido e VGV disponível, como hoje.
- **Locação:**
  - *Unidades locadas* = quantidade (`alugadas`) + aluguel mensal contratado = Σ `aluguelMensal` das locações vigentes do empreendimento (`LocacaoVigente`, a mesma base da série).
  - *Unidades disponíveis* = quantidade (`disponiveis`) + aluguel pedido = Σ `commercial_properties.rental_price` das unidades disponíveis; unidade disponível sem valor de aluguel cadastrado → contada à parte ("N sem valor cadastrado"), nunca R$ 0; nenhuma com valor → "—".
- **Serviços:** contratos `contracts.domain = 'SERVICOS'` com `project_id = empreendimentos.project_id` e **status `Ativo` ou `Concluído`** (Minuta, Rascunho e Revisão NÃO entram).
  - *Contrato faturado* = Σ valor dos **títulos a receber gerados no financeiro** para esses contratos (recebidos ou não; ligação título → contrato por `originIdFromRef`).
  - *Contrato a faturar* = Σ `current_value` desses contratos − faturado (mínimo 0).
  - Sem contrato válido → "sem contrato de serviço ativo".

## Global Constraints
- `CLAUDE.md`; tela editada → guia de UI + `check-ui-standard`; `<label>` §21 literal.
- "Dado ausente ≠ zero": campo novo ausente (versões antigas) → "—"; sem valor de aluguel → frase, não R$ 0.
- Nome de cliente nunca aparece (o card não mostra contrato por cliente).
- Portal do credor vê o mesmo card (componente compartilhado, `accent`).

## Tasks
### Task 1: Coleta e snapshot
- `SnapshotEmpreendimentoItem` ganha opcionais: `aluguel_locadas: number | null`, `aluguel_disponiveis: number | null`, `disponiveis_sem_aluguel: number`, `servico: { n_contratos: number; valor_contratos: number; faturado: number; a_faturar: number } | null`.
- `unidadesComPreco` passa a trazer `rental_price`; `coletarEmpreendimentosDoEscopo` calcula os campos (locações do escopo para `aluguel_locadas`; contratos de serviço por `project_id` + status; títulos já lidos em `coletarTitulos` — conferir se títulos de contrato de SERVIÇO entram em `todos`; se não, ler os do contrato).
- Util puro `linhasDoCardDoEmpreendimento(emp)` → `{ rotulo, valor }[]` por objetivo (+ testes: Vendas igual a hoje; Locação com e sem aluguel cadastrado; Serviços com contrato, sem contrato, faturado > valor → a faturar 0; versão antiga sem os campos → "—").
### Task 2: Tela e book
- `CreditRoomEmpreendimentos` (card e Sheet) e `utils/creditRoomBook/empreendimentos.ts` usam `linhasDoCardDoEmpreendimento`. Testes de tela (interno e portal) e do book.
### Task 3: Prova e PR
- Prova só leitura (prévia): o 019 Igreja mostra "sem contrato de serviço ativo" (o 001 está em Minuta); um de locação (020/014/006) mostra locadas/disponíveis com aluguel; um de vendas igual a hoje. PR, CI, merge, produção.

## Decisões tomadas por mim (conferir)
- Objetivo vazio ou misto cai em Vendas (comportamento de hoje).
- Locação usa o aluguel do CONTRATO vigente (mesma base da renda da série), não o `rental_price` da unidade locada.
- Contrato de serviço achado pela obra do empreendimento (`project_id`), porque `contracts.empreendimento_id` está vazio em todos os contratos de serviço.

## Estado (22/11/2026)
Tasks 1 e 2 feitas e revisadas; Task 3: prova na tela feita (só leitura, 0 escritas) no room "Demonstração": 010 Galeria Altavista "Unidades locadas 11 · R$ 8.600/mês" e "Unidades disponíveis 1 · R$ 1.266/mês"; 020 "Sem aluguel cadastrado 4 unidades"; 019 e 015 "sem contrato de serviço ativo"; vendas iguais a antes. PR pendente.
- Achados de cadastro: 014 tem locação vigente (R$ 3.500) sem unidade marcada "Locado"; 2 unidades de locação "Reservado" contam como disponíveis (comportamento de antes); 017 e 018 estão cadastrados como Vendas.
- Aluguel pedido vem do espelho de Locações (`commercial_properties.rental_price` via `rental_property_id`) — em produção `empreendimento_units.rental_price` está vazio em todas as unidades.
