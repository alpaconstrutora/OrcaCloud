# Central de Controle — menores da revisão do #546 (caixa)

> **Para quem executa:** siga tarefa por tarefa (superpowers:executing-plans); os passos usam `- [ ]`.

**Objetivo:** fechar os 4 menores que a revisão final do #546 deixou para depois — todos no caixa
projetado de `components/CentralControle.tsx`. Só app, sem banco.
**Contexto:** `docs/planos/2026-11-17-central-caixa-e-troca-de-org.md` (seção "Estado").

## Pedido original

> Contexto: no relatório final do #546 listei "Deixado para depois, menores da revisão": fragilidade
> latente ref × estado da espera (caixa preso em esqueleto se os serviços ganharem cache); "Tentar de
> novo" do caixa seguido de Atualizar descarta a resposta válida; falta teste do lado "carga
> descartada por troca de org continua marcando o pegajoso"; trocar o período com Atualizar em voo
> mostra o saldo do período anterior sem esmaecer.
>
> **"Resolve itens Deixado para depois, menores da revisão"**
>
> Sessão: 4df5f147-5935-4f89-aca8-224927a45bb4 · 17/11/2026

## Decisões (minhas — vão ao usuário no relatório)

| Item | Decisão | Por quê |
|---|---|---|
| Ref × estado da espera | Estado-CONTADOR `vezDoCaixa` (soma 1 quando a espera acaba) nas deps do efeito, no lugar do booleano; o ref síncrono continua decidindo se espera | `true→false` no mesmo lote se anula; contador não |
| Atualizar descarta resposta válida | O efeito só descarta a busca pendente se ela é de OUTRA org ou OUTRO período (`ultimaBuscaCaixa`); a limpeza do efeito deixa de invalidar | Resposta da mesma org e período é válida; a busca mais nova continua vencendo pela geração. **Nota da revisão final:** depois da Tarefa 4, quem segura a resposta é sobretudo o contador (o Atualizar nem redispara o efeito ao ligar a espera); a invalidação condicional ficou como defesa, sem efeito visível próprio |
| Período trocado com a chamada única em voo | Esmaece o gráfico (`caixaTrocando`) até o novo chegar; NÃO busca na hora | Mesmo comportamento da troca de período normal, sem disputar o banco com a chamada única |
| Teste faltando | Teste novo, provado vermelho com o lado `orgNaTela.current !== organizationId` removido | Código já certo; o teste é a trava |

---

### Tarefa 1: teste — carga descartada por troca de org continua marcando o pegajoso
- [ ] Teste: `'carga descartada por troca de org: a queda da anterior conta (voltar a ela vai direto aos blocos)'` —
  bootstrap o1 pendente (controlado); rerender o2 (responde); o1 rejeita; rerender o1 →
  `fontesSeparadas('o1')` e `bootstrap` só `['o1','o2']`.
- [ ] Ver VERMELHO com a condição reduzida a `vale()` (mutante), VERDE no código real · commit.

### Tarefa 2: "Tentar de novo" do caixa + Atualizar não descarta a resposta válida
- [ ] Teste: `'"Tentar de novo" do caixa e Atualizar na mesma org: a resposta pinta'` — 1º cashflow rejeita;
  "Tentar de novo" → promessa controlada; Atualizar com bootstrap pendente; responde 1.234 →
  `aria-label` `R$ 1.234` no cartão, `aria-busy="false"`.
- [ ] Ver falhar · implementar (`ultimaBuscaCaixa`, invalidação condicional, limpeza sem invalidar) · ver passar · commit.

### Tarefa 3: período trocado com a chamada única em voo esmaece o gráfico
- [ ] Teste: `'trocar o período com o Atualizar em voo: o gráfico anterior esmaece até o novo chegar'` —
  o1 carregado (R$ 1.000); Atualizar com bootstrap pendente; clicar "30 dias" → o valor fica dentro de
  `[aria-busy="true"]`; bootstrap responde → `cashflow('o1', 30)`.
- [ ] Ver falhar · implementar (`caixaDoPeriodo` gravado no sucesso; efeito esperando + mesma org + período
  diferente → `setCaixaTrocando(true)`) · ver passar · commit.

### Tarefa 4: espera do caixa por contador
- [ ] Teste (arquivo novo, FORA do `act`, `createRoot` + `IS_REACT_ACT_ENVIRONMENT=false`, respostas
  instantâneas): `'troca de org com as respostas já resolvidas: o caixa da org nova sai'` →
  `cashflow('o2', 90)` chamado.
- [ ] Ver falhar · implementar (`vezDoCaixa`) · ver passar · commit.

### Tarefa 5: verificar e publicar
- [ ] `typecheck`; suíte inteira; revisão final; PR → CI → merge → produção → CI da `main`.
- [ ] Prova em produção (desvio de `fetch`, atrasos < 20 s): Atualizar lento + "30 dias" → gráfico
  esmaecido; caixa caído + "Tentar de novo" lento + Atualizar lento → o valor pinta sem esperar.

## Estado

- [x] Tarefas 1–4 — cada uma com o teste visto falhando antes (17/11); Tarefa 1 por mutante (condição só `vale()`).
- [x] Tarefa 5 (parte local): `typecheck` exit=0; suíte inteira só com as falhas conhecidas do Windows.
- [x] Revisão final (revisor novo): sem crítico; 1 importante corrigido — o teste fora do `act` esperava
  tempo fixo (200/300 ms) e podia cair na CI; agora consulta até acontecer (`vi.waitFor`), vermelho com o
  mutante booleano.
- [x] PR #551 · CI verde (`9b3bd81`) · merge `fa0f207` · domínio servindo `fa0f207` · CI da `main` verde (17/11).
- [x] Prova em produção ("Todas", desvio de `fetch` só no navegador, atrasos < 20 s):
  - Atualizar com a chamada única atrasada 8 s + "30 dias" no meio: o saldo de 90 dias ficou ESMAECIDO e
    nenhum caixa foi pedido durante a espera; o de 30 dias (31 pontos) saiu 10 ms depois da chamada única e
    apareceu sem esmaecer (R$ 10.491.259).
  - Caixa caído → "Tentar de novo" atrasado 6 s → Atualizar com a chamada única atrasada 12 s: a resposta
    do "Tentar de novo" PINTOU (R$ 10.503.886) aos 7,5 s, com o Atualizar ainda esperando; ao fim, o caixa
    foi buscado de novo depois da chamada única.
  - Recarregada: 1 chamada única (787 ms) e o caixa depois dela.
  - Contador da espera (Tarefa 4) e trava do pegajoso (Tarefa 1): só nos testes (não há como forçar respostas
    em cache na produção sem mexer no app).

**Deixado para depois (menores da revisão):**
- 90→30→90 durante a chamada única: o gráfico (já do período escolhido) fica esmaecido até a chamada única
  voltar e o caixa ser buscado de novo — só esmaece mais tempo. Ajuste: `setCaixaTrocando(caixaDoPeriodo !== periodo)` na espera.
- O teste da Tarefa 3 não confere o FIM do esmaecido (funciona hoje; não está travado).
