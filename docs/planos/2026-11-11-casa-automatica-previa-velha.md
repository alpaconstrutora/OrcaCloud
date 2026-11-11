# Casa automática — prévia velha, Lançar durante a geração, custo do plano, platô no Ctrl+Z, "Voltar ao padrão"

## Pedido original

Sessão de 11/11/2026 (Claude Code, VS Code).

1ª mensagem:

> incorporacao > planta inteligente > casa automatica: analise

A análise (lida de `origin/main` 1623a5ae) listou 11 achados e propôs corrigir os itens 1–5 numa frente só.

2ª mensagem:

> sim

## Itens

### 1. A prévia fica velha e o Lançar continua ligado

**O que muda.** `useCasaAutomatica` guarda, junto do plano, a ASSINATURA do pedido que o gerou (tudo o que não é o
desenho: programa, hipóteses, zona, premissas das disciplinas, chuva, topografia). O editor calcula a assinatura do
pedido de agora; diferente → a tela mostra "As premissas mudaram desde a prévia — gere de novo" e desliga Lançar e Criar
alternativa com esse motivo. O desenho continua conferido pela trava que já existia (`conferirPlanoDaCasa`).

**Como sei que terminou.** Teste da tela: com `desatualizada`, o aviso aparece e os dois botões ficam desligados com o
motivo no `title`. Teste da assinatura: muda com o programa, não muda com o modelo.

### 2. Lançar ligado durante o "Gerar de novo"

**O que muda.** Com `casa.rodando`, Lançar e Criar alternativa desligam com "Aguarde: a casa está sendo gerada".

**Como sei que terminou.** Teste da tela com `rodando: true` e plano antigo: os dois botões desligados com o motivo.

### 3. Custo e nome da alternativa pelo programa da PRÉVIA

**O que muda.** O hook guarda o programa curto do pedido (`curtoDoPlano`). O CUB é buscado pelo padrão da prévia (com
prévia) e o rótulo do custo mostra esse padrão; o nome de "Criar alternativa" usa os dormitórios e o padrão da prévia.

**Como sei que terminou.** Teste da tela: prévia R1-N e premissas mudadas para R1-A → o rótulo do custo diz R1-N.

### 4. Ctrl+Z da casa desfaz também o platô

**O que muda.** `aplicarPlatoDaCasa` devolve o platô anterior; `restaurarPlato(anterior)` grava de volta. O editor guarda
o modelo de antes e o de depois do lote (o histórico devolve as MESMAS referências): voltou ao de antes → restaura o
platô anterior; refez até o de depois → regrava o platô da casa. Lote recusado pelo editor (trava de outra pessoa,
somente leitura) não grava platô e diz que não lançou.

**Como sei que terminou.** Teste do hook: aplicar → restaurar volta base, cota, anel e muros, e grava. Teste da função
pura que decide restaurar/regravar a partir do modelo atual.

### 5. "Voltar ao padrão" pede confirmação e não desfaz o vínculo da unidade

**O que muda.** `useConfirm` (§14 do guia, `warning`) antes de voltar; a unidade do Empreendimento escolhida fica.

**Como sei que terminou.** Teste da tela: cancelar não muda nada; confirmar chama `onPremissas` com o padrão e o
`unidadeId` de antes.

## Estado

| Item | Situação |
|---|---|
| 1 | feito — `assinaturaDoPedidoDaCasa` + `desatualizada`; testes da assinatura, do hook e da tela |
| 2 | feito — teste da tela com `rodando` |
| 3 | feito — `curtoDoPlano` (CUB e nome da alternativa); teste do rótulo do custo |
| 4 | feito — `restaurarPlato` + `passoDoPlatoDaCasa`; lote recusado não grava platô; testes do hook e da função pura. Ctrl+Z no app real: a conferir |
| 5 | feito — `useConfirm` (`warning`), `unidadeId` preservado; teste da tela |

Observação: o "Construir pelo Empreendimento" aplica a zona e gera no render seguinte; se a zona chegar depois da
geração, a prévia agora aparece como velha (antes gerava com a zona antiga em silêncio).
