# Boleto: campo Status editável na página do boleto

## Pedido original

> ao editar boleto, crie campo com o status do boleto e com possibilidade de edicao do status.

Sessão `d0ca5b1c-ae98-4b59-bf0b-6246a601d64d` · 23/10/2026.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 23/10/2026 | Trocar o status só muda o rótulo, ou segue o fluxo (Aprovado lança o título, Pago dá baixa…)? | "Guiado pelo fluxo (Recomendado)" |
| 23/10/2026 | Caminhos de volta que hoje não existem | "Aprovado → Rascunho, Cancelado → Rascunho, Cancelar estorna o título" |

## Diagnóstico

- Status do boleto não é rótulo: Aprovado cria título + nota; Pago dá baixa; Pago → Rascunho
  (`reverterParaRascunho`) APAGA título e nota (`desfazerLancamento`, que recusa título
  conciliado, em rateio de condomínio ou com pagamento a fornecedor); Programado é da Asaas.
- `cancelar` só mudava o boleto: o título ficava em aberto em Contas a Pagar. Gravava o motivo
  POR CIMA das observações e pedia o motivo por `window.prompt` (guia §14).
- Os 25 cancelados com título que existem vieram da limpeza de duplicados
  (`aplicar_20270919000018`): título `CANCELLED`, "nada é apagado". O Cancelar segue o mesmo
  princípio — título `CANCELLED`, nota `rejected` (a nota não tem "cancelado": CHECK
  `pending|approved|rejected|paid`) — e o boleto guarda o `invoice_id` para o histórico.
- `boletos_auditoria.acao` não tem CHECK (só `metodo`): `status_*` grava.

## Plano

### 1. Regra pura — `utils/boletoStatus.ts`
**Muda:** `transicoesDoBoleto(status, temLancamento)` — mudanças válidas a partir de cada
status, com o efeito e a frase do que acontece:
rascunho → revisão / aprovado / cancelado · revisão → rascunho / aprovado / cancelado ·
aprovado → pago / rascunho (estorno) / cancelado · pago → rascunho (estorno) ·
cancelado → rascunho (reabre; estorna se tiver lançamento) · programado → nenhuma
(`MOTIVO_STATUS_PROGRAMADO`).
**Pronto quando:** `__tests__/boletoStatusTransicoes.test.ts` cobre a tabela inteira.

### 2. Serviço — `services/boletoService.ts`
**Muda:**
- `marcarRevisao(id, org, 'rascunho'|'revisao')` — só entre rascunho e revisão, sem efeito no financeiro;
- `reverterParaRascunho` aceita aprovado, pago e cancelado (estorno = `desfazerLancamento`);
- `cancelar` recusa pago, programado e cancelado; com título: confere os mesmos vínculos do
  estorno, passa o título PENDING a `CANCELLED` (título já baixado = recusa) e a nota a
  `rejected`; o motivo vai ACRESCENTADO às observações, não por cima;
- mensagens de vínculo deixam de mandar "use Cancelar" (Cancelar agora também mexe no título).
**Pronto quando:** testes de serviço (novos + `boletoExcluir.test.ts` ajustado) passam.

### 3. Tela — `components/BoletoFormModal.tsx`
**Muda:** card "Status" no topo da coluna da direita: `<select>` com o status atual e só as
mudanças válidas. Rascunho ↔ revisão aplica na hora; as demais abrem, logo abaixo, o que vai
acontecer + Confirmar/Voltar (Cancelado pede o motivo ali — sai o `window.prompt`).
Aprovado usa o mesmo `handleAprovar` (salva antes; desligado com o motivo); Pago usa
`handleMarcarPago` (alçada pendente = desligado com o motivo). Botão "Cancelar" do topo abre
o mesmo painel; some em programado.
**Pronto quando:** teste de componente; `check-ui-standard.sh`; `tsc`/CI verde.

## Estado
- [x] 1 — `transicoesDoBoleto` / `motivoSemTransicao`; `__tests__/boletoStatusTransicoes.test.ts` 6/6.
- [x] 2 — `marcarRevisao`, `reverterParaRascunho` (aprovado/pago/cancelado), `cancelar` novo,
  `motivoQueTravaOTitulo` (as 3 travas, frases sem "use Cancelar"); `boletoExcluir.test.ts`
  com 9 casos novos e 1 ajustado de propósito (cancelado agora volta a rascunho).
  Achado no caminho: a fila de aprovação lê só `approval_status = 'PENDENTE'`, sem olhar o
  status do título — o cancelamento passa a alçada PENDENTE a `REJEITADO`. E o Excluir de
  programado dizia "cancele": agora aponta o cancelamento do pagamento em Contas a Pagar ›
  Parcelas (cancelar programado é recusado, a Asaas ainda pode pagar).
- [x] 3 — card "Status" no topo da coluna direita; painel com a frase do efeito, motivo do
  cancelamento e "Confirmar" / "Manter como está" (não "Voltar": o topo já tem um Voltar);
  botões do topo "Cancelar" e "Reverter para rascunho" abrem o mesmo painel; `window.prompt`
  removido. `__tests__/components/BoletoFormModalStatus.test.tsx` 7/7; `check-ui-standard.sh`
  sem violação; testes com "boleto" no nome: 18 arquivos, 173/173.
  ⚠️ Não conferido visualmente no navegador (só jsdom).

## Verificação
`npx vitest run boleto Boleto`; `bash scripts/check-ui-standard.sh components/BoletoFormModal.tsx`; CI.
