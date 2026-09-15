# Venda de Ativos › Parcelas — edição em lote com todas as colunas da tabela

## Pedido original

Sessão de 2026-09-15, ~18:40:

> comercial < venda de ativos < aba parcelas : incluir no modal edicao em lote todas as colunas da tabela

## Diagnóstico

A aba Parcelas (`components/DealModal.tsx`, `PARCELAS_COLUMNS`) tem 11 colunas:
Vencimento, Cliente, Valor, Desconto, Valor final, Origem, Tipo, Forma pagto.,
Centro de Custo, Plano de Contas, Descrição (+ Ações). O modal "Editar Parcelas
em Lote" (`InstallmentLoteDiscountModal`) cobria só Desconto, Tipo e Forma de
pagamento.

Por linha, a própria tabela deixa editar Vencimento, Valor, Desconto, Tipo,
Forma pagto. e Descrição. Cliente, Centro de Custo e Plano de Contas são
dimensões do NEGÓCIO (o `<td>` diz "iguais em toda a série, leitura") — mudar
é na aba Financeiro / Dados do Cliente. Valor final e Origem são derivados.

## Itens

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 1 | `utils/paymentPlan.ts`: `somarDias(iso, dias)` em UTC (mesma regra do `somarMeses`) | `__tests__/paymentPlan.test.ts` cobre mês/ano/bissexto/negativo/zero | ✅ |
| 2 | `components/DealModal.tsx`: modal vira `InstallmentLoteEditModal` com Vencimento (mesma data · deslocar dias · deslocar meses), Valor bruto, Desconto, Tipo, Forma de pagamento, Descrição (texto · limpar) | teste jsdom `__tests__/components/DealModalParcelasLote.test.tsx`: um campo por coluna editável, tudo nasce em "Não alterar", Aplicar desabilitado sem mudança, patch só carrega o escolhido | ✅ |
| 3 | Cliente, Centro de Custo e Plano de Contas aparecem no modal como leitura, com o caminho para alterar; Origem e Valor final entram na prévia por linha | mesmo teste verifica os três rótulos, a frase "use a aba Financeiro", a origem e o "final R$" | ✅ |
| 4 | `applyBulkEntryEdit` grava vencimento POR LINHA (deslocar parte da data de cada parcela) e pergunta o total do contrato também quando o valor bruto mudou | `tsc` passa; `aplicarBulkDueDate` testado nos três modos | ✅ |
| 5 | Publicar (push em main) e provar de fora | `scripts/conferir-producao.sh` mostra o commit e46b138 no ar | ✅ `conferir-producao.sh` 15/09 ~19:05: domínio serve e46b138 |
| 6 | Conferir na interface real (Playwright, skill `rodar-app`) | print do modal com os campos | ⛔ não feito nesta sessão — a senha do agente de leitura não estava disponível (a skill exige pedir a cada sessão). Fica para a próxima sessão com `PW_SENHA`. |

## Decisões

- **Deslocar vencimento é relativo a cada parcela**, não "mesma data em todas"
  por padrão — o cronograma inteiro desliza sem colapsar num dia só. "Mesma
  data em todas" continua disponível como modo explícito.
- **Cliente / Centro de Custo / Plano de Contas não viraram campos.** Existem
  em `internal_transactions` por linha, mas a tabela mostra o valor do negócio
  e `contractService.updateContract` propaga a classificação do cabeçalho para
  os títulos pendentes — um lote por parcela criaria um valor que a tabela não
  mostra e que a próxima edição do cabeçalho sobrescreve. Se o produto quiser
  classificação por parcela, é outra frente (tabela passa a ler a linha,
  `listFinancialEntries` traz as colunas, `updateFinancialEntry` aceita).
