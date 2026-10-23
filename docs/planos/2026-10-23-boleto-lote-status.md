# Boletos › Edição em Lote: mudar o status

## Pedido original

> inlcuir altercao de status em edicao em lote

Sessão `d0ca5b1c-ae98-4b59-bf0b-6246a601d64d` · 23/10/2026.

## Decisões

| Data | Origem | Decisão |
|---|---|---|
| 23/10/2026 | o usuário, para o campo Status da página do boleto (PR #115) | "Guiado pelo fluxo": a mudança faz o mesmo que o botão correspondente; Aprovado/Cancelado também voltam a Rascunho; Cancelar cancela o título. |
| 23/10/2026 | aplicada aqui, sem nova pergunta | O lote usa a MESMA tabela (`transicoesDoBoleto`) boleto a boleto: quem pode, muda; quem não pode, fica como está, com o motivo. |

Aprovado fica fora do campo do lote: já existe "Aprovar e Lançar", com a regra própria
(`avaliarAprovacaoEmLote` — fornecedor sugerido, vencimento, valor). O campo diz isso.

## Plano

### 1. Regra pura — `utils/boletoStatus.ts`
**Muda:** `STATUS_DO_LOTE` (revisão, rascunho, pago, cancelado), `temLancamento(b)`,
`planoDeStatusDoBoleto(b, para)` (muda com a transição, ou fica com o motivo: já está nele /
programado / caminho inexistente) e `resumoDeStatusEmLote(boletos, para)` (quantos mudam,
quantos ficam, e o efeito de cada grupo de origem).
**Pronto quando:** `__tests__/boletoStatusLote.test.ts`.

### 2. Serviço — `boletoService.mudarStatusEmLote`
**Muda:** boleto a boleto, relê, aplica o plano e chama o caminho de cada efeito
(`marcarRevisao`, `marcarPago`, `reverterParaRascunho`, `cancelar` com o motivo). Devolve
`ok`, `errors` (falhou ao executar: trava de vínculo, alçada…) e `ficaram` (a regra não
deixa mudar). Boleto de outra organização não é tocado.
**Pronto quando:** teste de serviço.

### 3. Janela — `BoletoEdicaoEmLoteModal.tsx`
**Muda:** bloco "Mudar status" acima de "Alterar campos": select (— Não alterar — e os 4
status), contagem "X de N mudam", motivo por boleto na lista, frase do efeito por grupo,
motivo do cancelamento e botão "Aplicar status" (vermelho quando estorna/cancela; desligado com
o motivo). Resultado diz "com o status alterado" (não "aprovados"). A frase "Selecione ao
menos um campo para habilitar as ações" fica só para o Salvar Rascunho.
**Pronto quando:** teste de componente; `check-ui-standard.sh`; CI.

## Estado
- [x] 1 — `__tests__/boletoStatusLote.test.ts` 6/6.
- [x] 2 — `mudarStatusEmLote`; 4 casos novos em `__tests__/boletoExcluir.test.ts` (cancelar e voltar a
  rascunho em lote, trava de vínculo sem parar o lote, cancelar sem motivo recusado antes de tudo).
- [x] 3 — bloco "Mudar status"; `__tests__/components/BoletoEdicaoEmLoteStatus.test.tsx` 4/4;
  `check-ui-standard.sh` sem violação; testes com "boleto" no nome: 20 arquivos, 187/187.
  ⚠️ Não conferido no navegador (só jsdom). Elementos novos na escala ANTIGA da janela (§16 — não misturar).
- [ ] publicação (eu mesmo: CI verde → merge → conferir produção → fechar frente)
