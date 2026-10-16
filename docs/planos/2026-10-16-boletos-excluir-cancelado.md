# Permitir excluir boletos cancelados (mistakes), não só manter como histórico

## Pedido original
1. "tentei excluir boletos em lote e recebi essa mensagem de erro: Nenhum dos boletos
   selecionados pode ser excluído — cancelados ficam no histórico"
2. (resposta à pergunta de esclarecimento, "a seleção pegou o errado" × "quero excluir
   cancelado mesmo") → usuário interrompeu e corrigiu com a mensagem abaixo, que é a
   intenção real:
3. "voce deixar claros um ponto;. boletos devem ser excluiveis. Por exemplos boletos
   duplicados, boletos que nao era para estar no app como como por exemplo boletos
   pessoais, pdf que nao eram boletos etc. concondo que tenha boletos que deve ser
   cancelados e mentidos no app como historico, mas tambem deveria ter boletos que som
   deveriam poder ser definitivamente excluidos"
4. Pergunta de confirmação feita por mim: ao liberar exclusão de cancelado, 28 dos 53
   cancelados hoje ainda têm um título real parado em Contas a Pagar (porque "Cancelar"
   nunca desfez o lançamento) — excluir esses remove o título e a nota junto, com as
   mesmas guardas de segurança que já existem para "aprovado". Resposta do usuário:
   **"Sim, remover o título junto (Recomendado)"**.

## Contexto
Hoje `boletoService.podeExcluir` bloqueava `cancelado` incondicionalmente — a ideia
original era "cancelar preserva histórico". Mas na prática "cancelado" também é usado
para erros de captura (duplicata, PDF que não era boleto, documento pessoal), e esses
não deveriam ficar presos no app para sempre. Não havia nenhuma trava de banco (RLS/CHECK/
trigger) para isso — era uma regra só da camada de aplicação.

`boletoService.excluir()` já decidia se desfaz o lançamento financeiro pela presença de
`invoice_id` no boleto, não pelo status — então liberar `cancelado` em `podeExcluir`
reaproveita, sem nenhuma mudança, as 3 guardas já testadas em `desfazerLancamento`
(recusa se já conciliado, em rateio de condomínio ou com pagamento a fornecedor lançado).

`cancelar()` continua sem desfazer o lançamento — mudar o que "Cancelar" faz é decisão
maior, fora do que foi pedido; fica fora de escopo, só sinalizado.

## O que mudou
- `services/boletoService.ts`: `podeExcluir` passou a aceitar `cancelado` (só `pago` e
  `programado` continuam bloqueados); nova função `mensagemConfirmacaoExclusao` como
  fonte única do texto de confirmação (cobre aprovado, cancelado-com-invoice e genérico).
- `components/BoletoManager.tsx`: removida a função local duplicada `mensagemDeExclusao`;
  `handleExcluirLote` reescrito para contar bloqueios por `pago`/`programado` (não mais
  por subtração, que assumia cancelado sempre bloqueado) e avisar sobre título junto
  cobrindo aprovado + cancelado-com-invoice_id.
- `components/BoletoFormModal.tsx`: `handleExcluir` passou a usar
  `boletoService.mensagemConfirmacaoExclusao` em vez do ternário duplicado (que já errava
  a mensagem para `revisao` e erraria mais para `cancelado`).

## Fora do escopo
- `cancelar()` continuar sem desfazer lançamento.
- Trilha de auditoria de exclusão (pré-existente: excluir qualquer boleto já cascade-deleta
  `boletos_auditoria`, independente do status).

## Verificação
- `__tests__/boletoExcluir.test.ts` estendido: `podeExcluir('cancelado') === true`,
  exclusão de cancelado com e sem `invoice_id`, guarda de conciliação aplicada também a
  cancelado-com-título, e testes de `mensagemConfirmacaoExclusao`.
- `check-ui-standard.sh` nos dois componentes: sem violação.
- `tsc --noEmit`: 0 erros.
- Suíte completa: 980 arquivos / 9666 testes passando (1 falha isolada e não relacionada
  em `PainelVersoes.test.tsx`, confirmada como flake do ambiente — passou isolada).
