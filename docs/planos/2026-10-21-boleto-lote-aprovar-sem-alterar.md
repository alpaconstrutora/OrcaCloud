# Boletos › Edição em Lote: "Aprovar e Lançar" sem exigir alteração

## Pedido original

> incluir no docker opcao de aprovar e lançar boleto

Sessão `d0ca5b1c-ae98-4b59-bf0b-6246a601d64d` · 21/10/2026.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 21/10/2026 | Em qual tela a opção "Aprovar e Lançar"? (página do boleto e Edição em Lote já a tinham; na Edição em Lote ela só ligava depois de alterar algum campo) | "Edição em Lote sem exigir alteração" |

## Diagnóstico

- `BoletoEdicaoEmLoteModal.tsx`: "Aprovar e Lançar" desligado por `noneChanged` — sem
  mexer em campo nenhum, não havia como lançar os boletos selecionados.
- `boletoService.aprovarEmLote` já aceita `fields` vazio, mas:
  - **não confere o status**: `aprovarECriarInvoice` grava `status: 'aprovado'` em
    qualquer boleto — um pago/cancelado selecionado voltaria a "aprovado". Com o botão
    ligado sem alteração, isso fica a um clique;
  - **não usa o fornecedor sugerido**: os 14 boletos Energisa (#1455–#1471) têm só
    `sugestao_supplier_id` e cairiam todos em "Selecione um fornecedor". A página do
    boleto já usa a sugestão (`BoletoFormModal.tsx`, efeito sobre `sugestao_supplier_id`).
- O erro do lote mostrava `Boleto 1a2b3c4d…` (pedaço do uuid), não o número do boleto.

## Plano

### 1. Regra pura — `utils/boletoAprovacaoLote.ts` (novo)
**Muda:** `avaliarAprovacaoEmLote(boleto, fields)` decide, por boleto, se pode ser
lançado e com qual fornecedor: só `rascunho`/`revisao`; fornecedor = o escolhido no lote
(inclusive "Sem vínculo" = nenhum), senão o do boleto, senão o **sugerido**; exige
vencimento e valor > 0. `resumoDaAprovacaoEmLote` conta prontos/pendentes para a janela.
`MOTIVO_SEM_VENCIMENTO` passa a morar aqui (o service reexporta).
**Pronto quando:** `__tests__/boletoAprovacaoLote.test.ts` cobre cada motivo, a ordem
deles, a sugestão e o "Sem vínculo" que não cai na sugestão.

### 2. Serviço — `services/boletoService.ts` › `aprovarEmLote`
**Muda:** antes de aprovar cada boleto, relê status/fornecedor/sugestão/vencimento/valor
e aplica a regra 1; quem não passa vai para `errors` com o motivo, sem gravar nada; quem
usa a sugestão grava `supplier_id` (com auditoria `associacao_lote`, `origem: 'sugestao'`)
antes de aprovar.
**Pronto quando:** teste de serviço prova: pago não é tocado; sugestão vira `supplier_id`
e o boleto é aprovado; o teste antigo (sem vencimento) continua passando.

### 3. Janela — `components/BoletoEdicaoEmLoteModal.tsx`
**Muda:** "Aprovar e Lançar" liga sem alteração quando há ao menos 1 boleto pronto;
desligado diz o motivo no `title`. A lista resumida mostra, por boleto, o que impede o
lançamento e quando o fornecedor virá da sugestão; acima dela, "X de N prontos para
lançar". "Salvar Rascunho" continua exigindo alteração, agora com o motivo no `title`.
Erros do resultado mostram `#0457` em vez do pedaço do uuid.
**Pronto quando:** teste de componente: sem alteração o botão está ligado e chama
`aprovarEmLote` com `{}`; com nenhum pronto está desligado e o `title` diz por quê;
`check-ui-standard.sh` no arquivo; `tsc` limpo.

## Estado
- [x] 1 — `utils/boletoAprovacaoLote.ts`; `__tests__/boletoAprovacaoLote.test.ts` 8/8.
- [x] 2 — `aprovarEmLote` com a regra; `__tests__/boletoAprovarEmLoteRegra.test.ts` 4/4 e o
  antigo `boletoAprovarSemVencimentoEFornecedor.test.ts` 6/6 sem mudança. Junto: valor > 0
  passou a ser exigido no lote (a aprovação individual não confere valor e o título nasceria
  sem valor).
- [x] 3 — janela; `__tests__/components/BoletoEdicaoEmLoteAprovar.test.tsx` 4/4;
  `check-ui-standard.sh` sem violação. Testes com "boleto" no nome: 16 arquivos, 151/151.
  ⚠️ Não conferido visualmente no navegador (só jsdom). A janela continua na escala antiga
  do §16 (`rounded-3xl`, botões em caixa alta) — o resumo novo entrou como texto, sem
  moldura nova, para não misturar escalas; migrar a janela inteira fica para quando o
  usuário pedir.

## Verificação
`npx vitest run __tests__/boletoAprovacaoLote.test.ts __tests__/boletoAprovarSemVencimentoEFornecedor.test.ts __tests__/components/BoletoEdicaoEmLote*.test.tsx`;
`bash scripts/check-ui-standard.sh components/BoletoEdicaoEmLoteModal.tsx`; `tsc --noEmit`.
