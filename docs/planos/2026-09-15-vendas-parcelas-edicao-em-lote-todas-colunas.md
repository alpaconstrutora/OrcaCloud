# Venda de Ativos › Parcelas — edição em lote com todas as colunas da tabela

## Pedido original

Sessão de 2026-09-15, ~18:40:

> comercial < venda de ativos < aba parcelas : incluir no modal edicao em lote todas as colunas da tabela

Sessão de 2026-09-15, ~19:10 (depois da primeira entrega):

> trabalho mal feito heim ! por que deixou de fora plano de contas e centro de custo. verifique melhor

Sessão de 2026-09-15, ~19:35:

> plano de contas e centro de custo sempre abre em drawer padrao do app. Anote isso para nunca mais deixar de fazer isso

> entao corrija o modal Editar Parcelas em Lote

## Diagnóstico

A aba Parcelas (`components/DealModal.tsx`, `PARCELAS_COLUMNS`) tem 11 colunas:
Vencimento, Cliente, Valor, Desconto, Valor final, Origem, Tipo, Forma pagto.,
Centro de Custo, Plano de Contas, Descrição (+ Ações). O modal "Editar Parcelas
em Lote" (`InstallmentLoteDiscountModal`) cobria só Desconto, Tipo e Forma de
pagamento.

Por linha, a própria tabela deixa editar Vencimento, Valor, Desconto, Tipo,
Forma pagto. e Descrição. Valor final e Origem são derivados. Cliente é do
NEGÓCIO (compradores, todos com o mesmo peso).

**Correção do diagnóstico (2ª rodada):** eu tinha tratado Centro de Custo e
Plano de Contas como "do negócio" porque o `<td>` dizia isso e mostrava o
valor do cabeçalho. Errado: `internal_transactions` guarda `cost_center_id` e
`plano_de_contas_id` POR PARCELA, e é a linha que Contas a Receber
(`vw_receivables` → `ContasReceberManager`) exibe e filtra. A parcela nasce
com o valor do negócio, mas pode divergir (Conciliação reclassifica). Logo:
são editáveis por parcela e no lote, e a célula tem de mostrar a LINHA.

## Itens

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 1 | `utils/paymentPlan.ts`: `somarDias(iso, dias)` em UTC (mesma regra do `somarMeses`) | `__tests__/paymentPlan.test.ts` cobre mês/ano/bissexto/negativo/zero | ✅ |
| 2 | `components/DealModal.tsx`: modal vira `InstallmentLoteEditModal` com Vencimento (mesma data · deslocar dias · deslocar meses), Valor bruto, Desconto, Tipo, Forma de pagamento, Descrição (texto · limpar) | teste jsdom `__tests__/components/DealModalParcelasLote.test.tsx`: um campo por coluna editável, tudo nasce em "Não alterar", Aplicar desabilitado sem mudança, patch só carrega o escolhido | ✅ |
| 3 | ~~Cliente, Centro de Custo e Plano de Contas como leitura~~ → só **Cliente** fica como leitura (do negócio); Origem e Valor final entram na prévia por linha | teste verifica o rótulo do cliente, a frase "use a aba Dados do Cliente", a origem e o "final R$" | ✅ (revisado na 2ª rodada) |
| 7 | `contractService.listFinancialEntries` traz `cost_center_id`/`plano_de_contas_id`; `updateFinancialEntry` grava os dois | `tsc` passa; lote grava por `updateFinancialEntry` | ✅ |
| 8 | Célula Centro de Custo / Plano de Contas da aba Parcelas mostra o valor DA LINHA e abre o drawer padrão (`CostCenterSelect`/`PlanoContasSelect`, `compact`, mesmo desenho do Extrato); parcela paga fica bloqueada | `tsc` + `check-ui-standard.sh` sem violação | ✅ |
| 9 | Modal de lote ganha **Centro de Custo** e **Plano de Contas**; patch leva `costCenterId`/`planoContasId` | teste jsdom: escolher no drawer manda o id; trocar só a descrição não manda os dois | ✅ |
| 10 | **3ª rodada:** os dois campos são o drawer padrão DIRETO no campo (sem `<select>` de modo na frente), como no lote do Extrato; vazio = não alterar; "limpar de todas" sai do lote (o drawer da célula limpa uma a uma) | teste: os dois gatilhos têm `aria-haspopup="dialog"`, não existe combobox com esse rótulo; escolher no drawer manda o id, vazio fica `undefined` | ✅ |
| 4 | `applyBulkEntryEdit` grava vencimento POR LINHA (deslocar parte da data de cada parcela) e pergunta o total do contrato também quando o valor bruto mudou | `tsc` passa; `aplicarBulkDueDate` testado nos três modos | ✅ |
| 5 | Publicar (push em main) e provar de fora | `scripts/conferir-producao.sh` mostra o commit e46b138 no ar | ✅ `conferir-producao.sh` 15/09 ~19:05: domínio serve e46b138 |
| 6 | Conferir na interface real (Playwright, skill `rodar-app`) | print do modal com os campos | ⛔ não feito nesta sessão — a senha do agente de leitura não estava disponível (a skill exige pedir a cada sessão). Fica para a próxima sessão com `PW_SENHA`. |

## Decisões

- **Deslocar vencimento é relativo a cada parcela**, não "mesma data em todas"
  por padrão — o cronograma inteiro desliza sem colapsar num dia só. "Mesma
  data em todas" continua disponível como modo explícito.
- **Centro de Custo / Plano de Contas SÃO campos do lote e da célula** (2ª
  rodada). A decisão anterior ("são do negócio, ficam como leitura") estava
  errada — ver "Correção do diagnóstico" acima. `updateContract` continua
  propagando o cabeçalho para os títulos pendentes quando o cabeçalho MUDA; a
  edição por parcela vale até lá, igual à reclassificação na Conciliação.
- **Cliente continua como leitura**: os compradores da negociação têm o mesmo
  peso (`commercial_deal_buyers`) e a parcela não tem cliente próprio.
