# Tributos a Pagar vira tela de gestão; pagamento só em Contas a Pagar

## Pedido original

Sessão `4b376e5e`, 21/10/2026:

> Financeiro > tributos a pagar: Essa tela deve ser uma tela de gerenciamento de tributos. Porem quero centralizar as acoes de pagamentos somente na tela de financeiro > contas a pagar

## Contexto levantado (banco, 21/10/2026)

- Tributo é linha de `internal_transactions` (`direction = DEBIT`, `party_type = TAX`).
  `vw_payables` não filtra `party_type`, então **os 787 tributos já aparecem em Contas a
  Pagar › Parcelas** (interseção de 787 com `vw_commercial_tax_payables`). Não é preciso
  levar nada para lá; basta tirar o pagamento de Tributos.
- Contas a Pagar paga com `payableService.darBaixa` (data, forma, recibo, Asaas), que grava
  `business_status = PAGO` e `status = CONCILIATED`. Tributos lia isso direito.
- **30 tributos RETIDO (R$ 11.669,10)** — o cliente recolhe — também estão em `vw_payables`,
  e Contas a Pagar só tratava PAGO/CANCELADO como "sem pagamento": oferecia "Dar baixa" e
  PIX para eles. Tributos já recusava. Com o pagamento centralizado, o buraco fica no único
  caminho.
- **7 tributos `PREVISTO` + `CONCILIATED`** (conciliados no extrato): Contas a Pagar mostra
  Pago, Tributos mostrava Vencido — `vw_commercial_tax_payables` só lê `business_status`.

## Itens

| # | Arquivo | O que muda | Como sei que terminou | Estado |
|---|---|---|---|---|
| 1 | `components/TributosAPagarManager.tsx` | Sai: botão Pagar, Estornar baixa, checkboxes/Shift+clique e barra "Pagar (Baixa)" em lote. Entra: "Ver em Contas a Pagar" por linha (deep-link `navigateToFocus('contas-a-pagar', id, 'CONTA_PAGAR')`, o mesmo do Portal do Parceiro). Fica: Novo, Gerar, editar/excluir manual, Cancelar/Reativar (select), KPIs, filtros, Agrupar, Fechamento. Subtítulo diz onde se paga. | `TributosSemPagamento.test.tsx` | ✅ |
| 2 | `components/ContasPagarParcelas.tsx` | RETIDO entra em `SEM_PAGAMENTO_A_FAZER` (com PAGO/CANCELADO): sem Dar baixa, sem PIX/Asaas, fora da baixa em lote e do total em aberto. Rótulo "Retido pelo cliente". | revisão do diff + `ContasPagarParcelasAgrupar.test.tsx` verde | ✅ |
| 3 | `services/taxPayableService.ts` | `list()` mostra como PAGO o tributo conciliado (`tributoJaPago`), antes do filtro de status. Sem migration. | `tributoConciliadoAparecePago.test.ts` | ✅ |
| 4 | `__tests__/components/FinanceiroAgrupar.test.tsx` | Passo "selecionar todos" vira opcional (Tributos não tem mais seleção). | suíte do arquivo verde | ✅ |
| 5 | `components/ContasPagarManager.tsx` + `types/financial.ts` | Card "A pagar" de Contas a Pagar deixa de somar RETIDO; `PayableEffectiveStatus` ganha `'RETIDO'` (a view já devolvia). Card "A pagar" de Tributos: contagem "em aberto" deixa de contar RETIDO (o valor já não somava). Achado na conferência no navegador. | card de Contas a Pagar: R$ 1.947.847,24 / 1139 → R$ 1.936.178,14 / 1109 (−R$ 11.669,10 / −30 = os retidos); Tributos: "750 tributos em aberto" | ✅ |
| 6 | verificação | `check-ui-standard.sh` nos `.tsx`; `tsc --noEmit`; tela no navegador | `check-ui-standard` 0 violações nos 3 arquivos; `tsc exit=0`; Vitest 13 arquivos / 57 testes; navegador (`c:/tmp/pwtest/tributos-sem-pagamento.cjs`, usuário de leitura, Alpa, só leitura): 15 conferências OK, 0 erro de console/HTTP — sem Pagar/Estornar/seleção, atalho abre o título certo, retido sem Dar baixa/PIX, aberto com Dar baixa, conciliado Pago | ✅ |

## Fora do escopo (registrado, não feito)

- Corrigir `vw_commercial_tax_payables` no banco para ler `status` como `vw_payables` — o
  item 3 resolve na leitura sem migration; mudar a view é decisão separada.
- Rótulo de origem `COMMERCIAL` em Contas a Pagar ("Commercial"): `source_system` é
  compartilhado com outros débitos do comercial, não dá para chamar tudo de "Tributo".
