# Central de Controle — esmaecido do caixa com a chamada única em voo (menores do #551)

> **Para quem executa:** siga tarefa por tarefa (superpowers:executing-plans); os passos usam `- [ ]`.

**Objetivo:** fechar os 2 menores que a revisão do #551 deixou: (1) 90→30→90 com a chamada única em voo
deixava o gráfico (já do período escolhido) esmaecido até a nova busca; (2) o teste do esmaecido não
conferia o FIM. Só `components/CentralControle.tsx` (efeito do caixa) e testes. Sem banco.
**Contexto:** `docs/planos/2026-11-17-central-caixa-menores.md` (seção "Estado").

## Pedido original

> Contexto: no relatório final do #551, "Ficaram 2 menores": 90 → 30 → 90 durante a espera esmaece mais
> tempo que o necessário; o teste do esmaecido não confere o momento em que ele termina.
>
> **"implementar os 2 menores:"**
>
> Sessão: 4df5f147-5935-4f89-aca8-224927a45bb4 · 17/11/2026

## Decisão (minha)

Na espera, `if (caixaDaOrg.current === organizationId) setCaixaTrocando(caixaDoPeriodo.current !== periodoCaixa)`
— o esmaecido acompanha "o gráfico na tela é de outro período", ligando E desligando (sugestão da revisão).

### Tarefa 1: o teste do esmaecido confere o fim
- [ ] Acrescentar ao teste `'trocar o período com o Atualizar em voo: o gráfico anterior esmaece até o novo chegar'`:
  depois de `cashflow('o1', 30)`, esperar o valor fora de `[aria-busy="true"]`.
- [ ] Ver VERMELHO num mutante (sucesso da busca sem `setCaixaTrocando(false)`), VERDE no real · commit.

### Tarefa 2: 90→30→90 na espera desliga o esmaecido
- [ ] Teste: `'90 → 30 → 90 com o Atualizar em voo: de volta ao período da tela, o gráfico não fica esmaecido'`.
- [ ] Ver falhar · implementar a decisão · ver passar · commit.

### Tarefa 3: verificar e publicar
- [ ] `typecheck`; suíte; revisão final; PR → CI → merge → produção → CI da `main`; prova em produção (90→30→90 com o Atualizar lento).

## Estado

- [ ] Tarefas 1–2 · [ ] Tarefa 3
