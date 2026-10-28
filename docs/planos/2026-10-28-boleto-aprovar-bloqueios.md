# Boletos a Pagar — bloqueios do "Aprovar e Lançar"

## Pedido original

Sessão de 28/10/2026, ~14h:

> financeiro > Boletos a Pagar: 1. implementar bloqueios do Botão de aprovar e lançar
> 1. Se campo Fornecedor não estiver preenchido
> 2. Se campo Valor (R$) não estiver preenchido
> 3. Se campo Vencimento não estiver preenchido

## Diagnóstico (origin/main 096a4ba3)

| Caminho | Fornecedor | Valor | Vencimento |
|---|---|---|---|
| Edição em Lote (`utils/boletoAprovacaoLote.ts`) | bloqueia | bloqueia (> 0) | bloqueia |
| Página do boleto (`BoletoFormModal`, botão e campo Status) | bloqueia | **não bloqueava** | bloqueia |
| Serviço `aprovarECriarInvoice` | recusa | **não recusava** | recusa |

Pela página, um boleto sem valor virava título zerado em Contas a Pagar.

## Itens

1. ✅ `components/BoletoFormModal.tsx` — `motivoParaNaoAprovar` cobra, nesta ordem,
   fornecedor → valor (> 0, lido do campo da tela) → vencimento, com as frases de
   `utils/boletoAprovacaoLote.ts`. Vale para o botão e para a transição "aprovar"
   do campo Status (ambos usam o mesmo motivo).
   **Pronto quando:** `__tests__/components/BoletoFormModalDuplicadoEVencimento.test.tsx`
   — botão desligado com `title` = motivo para fornecedor vazio, valor nulo/zero e
   valor apagado na tela (falha sem a correção: provado).
2. ✅ `services/boletoService.ts` — `aprovarECriarInvoice` recusa valor nulo/zero
   com `MOTIVO_SEM_VALOR` antes de qualquer gravação.
   **Pronto quando:** `__tests__/boletoAprovarSemVencimentoEFornecedor.test.ts`
   — "aprovar boleto sem valor" recusa e não insere nota nem título (falha sem a
   correção: provado).
