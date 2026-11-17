# Central de Controle — pendências da revisão do #538 (caixa, troca de org, pegajoso)

> **Para quem executa:** siga tarefa por tarefa (superpowers:executing-plans); os passos usam `- [ ]`.

**Objetivo:** fechar os 3 menores que a revisão final do #538 deixou para depois e os 2 defeitos
pré-existentes que ela achou — todos em `components/CentralControle.tsx` (+ `utils/planoBPegajoso.ts`).

**Base:** React 18; Vitest + Testing Library. Nenhuma mudança no banco.
**Contexto:** `docs/planos/2026-11-17-central-menores-plano-b.md` (seção "Estado").

## Pedido original

> Contexto: no relatório final do #538 listei "Deixado para depois, menores da revisão" (pegajoso
> ligado por carga descartada da mesma org; caixa da org nova saindo junto com a chamada única dela;
> "Todas" chega como `''`) e "Achados que já existiam antes, fora desta frente" ("Tentar de novo" do
> caixa + troca de org pinta o caixa da org anterior; concluir tarefa que falha depois de trocar de
> org recarrega a org antiga).
>
> **"faça os Deixado para depois e os Achados que já existiam antes"**
>
> Sessão: 4df5f147-5935-4f89-aca8-224927a45bb4 · 17/11/2026

## Decisões (minhas — o pedido não as fixa; vão ao usuário no relatório)

| Item | Decisão | Por quê |
|---|---|---|
| Pegajoso por carga descartada | Marca só se a carga ainda vale **ou** foi descartada por troca de org | Carga mais nova da mesma org decide por si; a queda numa org trocada continua contando |
| Caixa na troca de org | Ref `esperandoChamadaUnicaRef`, ligado de forma síncrona no início do `load`; o efeito do caixa lê o ref (o estado fica nas dependências só para disparar de novo) | O efeito do caixa roda no mesmo commit do `load` da org nova e lia o estado ainda `false` |
| "Todas" | `''` e `null` são a mesma chave (`organizationId \|\| TODAS`) | O AppRouter entrega `''`; o serviço já trata `organizationId \|\| null` |
| Caixa de outra org | Geração (`caixaAtual`): cada busca e cada rodada do efeito do caixa invalidam as respostas pendentes — inclusive a do "Tentar de novo", que chama `carregarCaixa` fora do efeito | O cancelamento devolvido por `carregarCaixa` era descartado nesse caminho |
| Tarefa que falha após trocar de org | Recarrega só se a tela ainda é da org da ação (`orgNaTela.current === organizationId`); senão não recarrega | O `load` guardado no clique era o da org antiga: repunha `orgNaTela` e pintava a org antiga debaixo do seletor novo (REGRA #5) |

## Restrições

- Caminho normal idêntico: bootstrap respondendo → 1 chamada, caixa depois dela.
- "Todas" = `null`/`''` (REGRA #5); a org vem da prop (BASELINE).

---

### Tarefa 1: "Todas" — `''` e `null` são a mesma chave do pegajoso

- [ ] Teste (`__tests__/planoBPegajoso.test.ts`): `'"Todas" chega como texto vazio: é a mesma chave de null'` — `marcarQueCaiu('')` → `pularChamadaUnica(null) === true` e `pularChamadaUnica('') === true`; `pularChamadaUnica('o1') === false`.
- [ ] Ver falhar · implementar (`organizationId || TODAS`, comentário) · ver passar · commit.

### Tarefa 2: carga descartada da mesma org não liga o pegajoso

- [ ] Teste (tela): `'carga descartada pela mesma org não liga o pegajoso quando a mais nova respondeu'` —
  Obras em "Não carregou." (scorecards caído no 1º bootstrap); Atualizar → bootstrap 2 pendente (controlado);
  "Tentar de novo" de Obras → bootstrap 3 responde; então o bootstrap 2 rejeita; Atualizar de novo →
  `bootstrap` chamado 4 vezes e `fontesSeparadas` 0.
- [ ] Ver falhar · implementar (`if (!pular && rejeitou && (vale() || orgNaTela.current !== organizationId))`) · ver passar · commit.

### Tarefa 3: caixa da org nova espera a chamada única dela

- [ ] Teste (tela): `'trocar de org: o caixa da nova espera a chamada única dela'` — o1 carrega (caixa o1 buscado);
  rerender o2 com bootstrap pendente → nenhum `cashflow('o2', …)`; bootstrap o2 responde → `cashflow('o2', 90)`.
- [ ] Ver falhar · implementar (ref síncrono) · ver passar · commit.

### Tarefa 4: resposta velha do caixa não pinta a org nova

- [ ] Teste (tela): `'"Tentar de novo" do caixa e troca de org: a resposta da org anterior não pinta a nova'` —
  1º `cashflow` rejeita (cartão "Não carregou."); "Tentar de novo" → promessa controlada; rerender o2 com
  bootstrap pendente; responde a promessa com saldo 1.111 → o cartão do caixa não mostra `R$ 1.111` e segue `aria-busy="true"`.
- [ ] Ver falhar · implementar (geração `caixaAtual`) · ver passar · commit.

### Tarefa 5: tarefa que falha depois de trocar de org não recarrega a org antiga

- [ ] Teste (tela): `'concluir tarefa que falha depois de trocar de org não recarrega a org anterior'` — o1 com
  tarefa; concluir com `atualizarTarefa` controlado; rerender o2 (bootstrap responde); rejeita a gravação →
  `bootstrap` nunca chamado de novo com `'o1'` (só `o1`, `o2`).
- [ ] Ver falhar · implementar · ver passar · commit.

### Tarefa 6: verificar e publicar

- [ ] `npm run typecheck`; suíte inteira; revisão final (revisor novo); PR → CI → merge → `conferir-producao` → CI da `main`.
- [ ] Prova em produção (desvio de `fetch` só no navegador): troca de org → `fn_cashflow_projection` começa
  depois que `fn_central_controle_bootstrap` termina; caixa caído + "Tentar de novo" lento + troca de org →
  o valor da org anterior não aparece. (Tarefa 2 e 5 ficam só nos testes: a 5 gravaria uma tarefa real.)

## Estado

- [x] Tarefas 1–5 — cada uma com o teste visto falhando antes (17/11).
- [x] Tarefa 6 (parte local): `typecheck` exit=0; suíte inteira só com as falhas conhecidas do Windows.
- [x] Revisão final (revisor novo): sem crítico; 1 importante corrigido — regressão da Tarefa 3: o
  "Não carregou." do caixa da org anterior ficava na nova durante a espera (o erro não gravava `caixaDaOrg`).
- [x] PR #546 · CI verde (`52d55f2`) · merge `17db364` · domínio servindo `a0d9577` (contém o merge) · CI da `main` verde (17/11).
- [x] Prova em produção (desvio de `fetch` só no navegador; contexto devolvido a "Todas"):
  - caixa de "Todas" caído → troca para a Alpa com a chamada única dela atrasada 6 s: o cartão foi ao
    esqueleto na hora (sem o "Não carregou." anterior) e `fn_cashflow_projection` da Alpa saiu 28 ms DEPOIS
    da chamada única dela;
  - caixa da Alpa caído → "Tentar de novo" atrasado 16 s → troca para "Todas" (chamada única atrasada 17 s):
    a resposta da Alpa (saldo −10.958) chegou com a tela em "Todas" e NÃO pintou (esqueleto); depois veio
    o caixa de "Todas" (R$ 10.503.886).
  - Recarregada: 1 chamada única (807 ms) e o caixa depois dela.
  - Tarefas 2 e 5 só nos testes (a 5 gravaria uma tarefa real).

**Deixado para depois (menores da revisão):**
- Fragilidade latente: se bootstrap/reajustes/config respondessem antes do React renderizar a espera
  (só com cache nesses serviços — hoje passam pela rede), o caixa da org nova ficaria em esqueleto.
  Correção sugerida: contador de "vez do caixa" nas dependências do efeito.
- "Tentar de novo" do caixa seguido de Atualizar descarta a resposta válida (esqueleto até o caixa ser buscado de novo).
- Falta teste do lado "carga descartada por troca de org continua marcando o pegajoso" (código certo).
- Pré-existente: trocar o período com Atualizar em voo mostra o saldo do período anterior sem esmaecer até a chamada única voltar.
