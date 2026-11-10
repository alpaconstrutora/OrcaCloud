# NOI de Locações: despesa pelo empreendimento do Centro de Custo

## Pedido original

Sessão `b556295c`, Financeiro › Contas a Pagar.

09/11/2026, depois do PR #289:

> a funcionalidade imovel esta duplicada, pois o campo empreendimento ja faz isso

O PR #289 tirou de Contas a Pagar a coluna Imóvel e o botão "Apropriar a imóvel". Na mesma resposta ofereci: "Se você quiser que ele passe a somar as despesas pelo empreendimento do Centro de Custo, é uma mudança separada que posso fazer."

10/11/2026:

> sim

## Contexto (medido em produção em 09/11/2026)

- `property_expense_allocations` tem **0 linhas**. O NOI de Comercial › Locações › Análise nunca contou despesa e mostra "—".
- Existem 11 centros de custo com `empreendimento_id`. Só um deles tem imóveis de locação e despesa em 2026: Galeria Altavista, com 12 imóveis e R$ 12.600 vindos do contrato CTS-010-036-0001.
- O card "NOI no ano" tem um botão "Apropriar despesas" que leva a Contas a Pagar. Lá esse botão não existe mais desde o PR #289.

## Regra

Uma despesa entra no NOI quando o seu Centro de Custo pertence a um empreendimento.

1. **Empreendimento do Centro de Custo.** Vale o vínculo direto (`cost_centers_v2.empreendimento_id`). Sem ele, vale o empreendimento da obra do Centro de Custo (`project_id`). É a mesma regra da coluna Empreendimento em Centro de Custo.
2. **Quais despesas.** Títulos de `vw_payables` que não estão cancelados e cujo vencimento cai na janela do NOI.
3. **Para qual imóvel a despesa vai.**
   - Se o edifício-pai do empreendimento está na carteira, a despesa vai inteira para ele. O NOI do edifício já soma as unidades.
   - Se não está, a despesa é rateada entre os imóveis de locação do empreendimento que estão na carteira, pela área privativa. Sem área cadastrada, o rateio é igual (`allocateProrated`).
   - Empreendimento sem imóvel de locação na carteira não entra no NOI.

## Itens

1. **Função pura `expenseByPropertyFromEmpreendimentos`** em `lib/rentalNoi.ts`.
   - Feito quando: os testes cobrem o edifício na carteira, o rateio por área, o rateio igual sem área e o empreendimento sem imóvel.
2. **`rentalNoiService.getNoiMetrics` passa a ler a despesa pelo Centro de Custo**, no lugar de `property_expense_allocations`.
   - Feito quando: um teste com mocks mostra a despesa de um centro de custo com empreendimento (direto ou pela obra) chegando ao NOI, e a de um centro sem empreendimento ficando de fora.
3. **Textos da aba Análise.**
   - "Apropriar despesas" passa a ser "Ver Contas a Pagar".
   - Os avisos explicam a regra nova: a despesa conta quando é lançada com um Centro de Custo vinculado ao empreendimento.
   - Feito quando: nenhum texto da Análise manda mais "apropriar" despesa.
4. **Verificação.**
   - Feito quando: `tsc` dá 0 erros, os testes de locação passam e `check-ui-standard` passa no componente alterado.

## Andamento (10/11/2026)

1. ✅ `expenseByPropertyFromEmpreendimentos` com 4 testes em `__tests__/rentalNoi.test.ts`.
2. ✅ `getNoiMetrics` lê pelo Centro de Custo. Os testes em `__tests__/rentalNoiServiceDespesa.test.ts` cobrem o vínculo direto, o vínculo pela obra, o título cancelado e o Centro de Custo sem empreendimento.
3. ✅ A aba Análise não manda mais "apropriar" despesa. O botão virou "Ver Contas a Pagar", e o aviso aponta para Minha Organização › Centro de Custo.
4. ✅ `tsc` com 0 erros e `check-ui-standard` sem violações.
   - Testes de locação e crédito: 15 arquivos, 222 testes, todos passaram.
   - Suíte inteira: 3 falhas em PainelVersoes e TowerEditor, telas que este trabalho não alterou. Rodando esses 2 arquivos sozinhos, os 45 testes passam.

## Limite conhecido

O Centro de Custo do empreendimento pode carregar custo de obra (CAPEX), e o NOI deveria ter só despesa de operação. Hoje isso não acontece: em 2026 a única despesa de empreendimento com imóvel de locação é o contrato da Galeria Altavista. Se passar a acontecer, o próximo passo é filtrar pelo Plano de Contas.
