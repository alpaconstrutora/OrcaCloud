# Contrato › Parcelas — os 3 pontos menores adiados do PR #183

## Pedido original

> implementar os 3 Pontos menores adiados

Sessão `28d65126-a526-45e0-8d6a-3e30e5f1eef2` · 26/10/2026. Os três vieram da revisão final de
`docs/planos/2026-10-26-contrato-parcelas-conferencia-e-gerador.md` (PR #183):

1. Contrato Encerrado/Cancelado ainda mostrava o aviso e o gerador.
2. A parcela complementar entrava sem "Tipo" (`installment_type`).
3. O painel "Gerar parcelas" não tinha teste de tela próprio.

## Decisões tomadas com o usuário (26/10, "Sim")

| Pergunta | Resposta |
|---|---|
| Contrato **Cancelado** | A conferência some (`aplica = false`) — parcelas canceladas fariam o card dizer "Faltam" o valor cheio |
| Contrato **Concluído / Encerrado** | Card e faixa continuam (informação útil); "Corrigir divergência" e "Gerar parcelas" desligados com o motivo |
| O **Concluído** entra junto com o Encerrado? | Sim (em Locações, concluído já bloqueia faturamento) |
| Tipo da parcela complementar | `AVULSA` ("Parcelas avulsas", `constants/paymentTypes.ts`) — a sync já leva o tipo do cronograma ao título |

## Plano

- [x] **U1. `utils/conferenciaParcelasContrato.ts`** — `ContratoConferido.status`; `conferirParcelas`
  não aplica em `Cancelado`; `motivoContratoFechado(contrato)` → motivo para `Concluído`/`Encerrado`,
  `null` nos demais; `parcelaComplementar` grava `installment_type: 'AVULSA'`.
  Teste `__tests__/conferenciaParcelasContrato.test.ts`. **Pronto quando:** visto vermelho, depois verde.
- [x] **T1. `components/ContractDetailView.tsx`** — os dois botões desligados com o motivo (span com
  `title`, padrão do botão desligado que diz por quê).
  **Pronto quando:** `check-ui-standard.sh` limpo e, no navegador, contrato Encerrado com botões desligados.
- [x] **T2. `__tests__/components/GerarParcelasSheet.test.tsx`** (novo) — prévia (pagas ficam, novas somam
  Atual − pago), botão espera o Asaas, recusa entrada ≥ saldo, grava pelo serviço, mensagem por direção.

## Fato medido (26/10)

No banco não há contrato Encerrado nem Cancelado; há 2 Concluídos (CTV-0001 venda, sem parcela
nenhuma — mostra "Faltam R$ 500.000,00" com as ações desligadas; CTL-010-0003 recorrente, fora).
Conferência no navegador: o servidor local pede login com a conta real — fica para a produção.

## Estado

- [x] Desenho aprovado (26/10, "Sim")
- [x] Implementação (U1 visto vermelho → verde; T2 nasceu verde — o painel já existia — e foi
  provado por mutação: quebrar a espera do Asaas e o destino da mensagem deixou 3 casos vermelhos)
- [ ] Publicar (PR + CI verde + merge)
