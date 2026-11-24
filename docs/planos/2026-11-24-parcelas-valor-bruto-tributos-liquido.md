# Parcelas da negociação: Valor bruto, Tributos e Valor líquido

## Pedido original

> Gerenciar Negociação > parcelas:
> 1. Altere o nome da coluna Valor final para Valor Bruto
> 2. Crie nova coluna chamada Tributos e traga o valor dos tributos e deve estar sincronizado com financeiro > Tributos a Pagar
> 3. Crie nova coluna chama Valor líquido que deve ser o resultado do calculo: Valor Bruto - valor dos tributos

(24/11/2026)

## Decisões

- **Fonte dos tributos:** as próprias linhas de Tributos a Pagar (`internal_transactions` com `party_type='TAX'`, ligadas por `parcela_id`), somadas pelo campo computado `tributos_da_parcela`. São lidas por `receivableService.resolveTributos`, o mesmo leitor das colunas de Contas a Receber. Não há nada gravado em paralelo que possa ficar desatualizado.
- **Grafia:** "Valor bruto" / "Valor líquido", como em Contas a Receber (rótulos em sentence case). A chave interna `valor_final` continua a mesma, para preservar a ordem e a largura das colunas que cada usuário salvou.
- **Recálculo dos tributos:** até aqui, os tributos só eram regerados no Salvar da negociação. Passam a ser regerados também quando a parcela muda, usando a mesma regeração do Salvar: só os pendentes são refeitos; pagos, conciliados e os que estão em DARF ficam como estão.

## Itens

- [x] 1. Coluna "Valor final" renomeada para "Valor bruto". Colunas novas "Tributos" e "Valor líquido" (= bruto − tributos). Enquanto os tributos não chegam, a célula mostra "—".
  - **Pronto quando:** check-ui-standard e tsc sem erros. No banco, para CTL-006-012-0001: bruto 4.556,00, tributos 388,97, líquido 4.167,03. ✅ Falta conferir na tela, o que precisa do login do usuário.
- [x] 2. Tributos regerados depois de qualquer mudança na aba Parcelas que afete os impostos:
  - mudança de valor, desconto ou vencimento (na parcela ou na edição em lote);
  - exclusão de parcela;
  - "Gerar parcelas" e lançamento do plano no contrato.

  Também são regerados depois de um reajuste em Locações › Reajustes que tenha mudado parcelas. Se a regeração falhar, a edição continua gravada e o usuário é avisado para salvar a negociação.
  - **Pronto quando:** `__tests__/reajusteLocacaoService.test.ts` cobre três casos: regera após reajuste, não regera em "Não reajustar", e falha não desfaz o reajuste. ✅ Falta conferir na tela.

## Fora do escopo (observado)

- Contrato filho de renovação não herda `deal_id`, por isso `generateForDeal` não enxerga as parcelas dele. Hoje nenhum contrato renovado tem parcelas (conferido em 24/11), mas quando tiver, a coluna Tributos dessas parcelas vai mostrar R$ 0,00.
