# Boletos a Pagar — filtro avançado com todas as colunas

## Pedido original

> financeiro > boletos a pagar: filtro avançado nao tem todas as colunas, veja exemplo que falta centro de custo. verificar o que mais nao esta incluido

(Sessão de 27/10/2026, com print do painel "Filtros" aberto: o seletor de campo listava só Beneficiário, Descrição, Status, Valor, Vencimento, Banco e Origem.)

## Diagnóstico

`buildAdvancedFilterFields` (BoletoManager) tinha 7 campos para 12 colunas de dados. A tabela mostra Código, Documento, Beneficiário, Descrição, Obra, Centro de Custo, Valor, Vencimento, Status, Capturado em, Capturado por e Origem. **Faltavam seis:** Código, Documento, Obra, Centro de Custo, Capturado em, Capturado por. (Banco está no filtro mas não é coluna — mantido.)

## Itens

1. **Um campo por coluna.** Move `buildAdvancedFilterFields`/`getAdvancedFilterValue` para `utils/boletoFiltroAvancado.ts` e acrescenta os seis campos. Obra, Centro de Custo e Capturado por = lista com busca (§5.5); Código = número; Documento = texto livre; Capturado em = data.
   - Pronto quando: `__tests__/boletoFiltroAvancado.test.ts` passa, inclusive o teste que lê `BOLETO_COLUMNS` e exige um campo para cada coluna (coluna nova no futuro quebra o teste, não o usuário).
2. **Capturado em compara o DIA local.** `created_at` é timestamp UTC; o `getValue` devolve AAAA-MM-DD no fuso do usuário (o dia que a célula mostra), senão "É" nunca casa e "Entre" exclui o último dia.
   - Pronto quando: teste `diaDaCaptura` cobre 20/10 23:30 local → `2026-10-20`.

## Verificação

- `tsc --noEmit` exit 0; `check-ui-standard.sh components/BoletoManager.tsx` sem violação; suíte de boletos + filtro avançado: 202 testes passando.
