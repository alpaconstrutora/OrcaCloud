# Renovação por aditivo continua a série de parcelas

## Pedido (25/11/2026)

> Gerei uma renovação. qual é o fluxo para gerar as parcelas da renovação. pois se eu
> clicar em gerar parcelas vai gerar as parcelas inclusive nas parcelas ja geradas?

Depois do diagnóstico, as respostas do usuário foram:

> 1. Dia 10
> 2. quem gerou duplicado foi o app. Então investigue o por que
> 3. [...] Por que não gerou?
> Obs: em Parcelas não encontro as novas parcelas da renovação

Ao plano proposto (correção no código e correção dos dados do CTL-006-012-0001), o usuário
respondeu: "sim".

## Causas encontradas (CTL-006-012-0001, aditivo AD-001)

1. **Dia 23.** `applyProrrogacaoAddendum` gera as parcelas pelo `due_day` do contrato, que
   está 23. As parcelas originais vencem no dia 10, porque foram ancoradas na "Data do 1º
   Pagamento". A gaveta de renovação também vinha preenchida com o `due_day`.
2. **Março e abril em dobro.** A série nova começava no 1º dia do período novo
   (23/03/2019). O contrato original cobra o mês depois: a última parcela é de 10/04/2019,
   para uma vigência que terminou em 22/03/2019. O resultado foram duas cobranças em
   março e em abril, e o fim da série 1,5 mês cedo. O "Desfazer aditivo" apagava por data
   (a partir do início do período novo) e levava junto a parcela legítima de 10/04/2019.
3. **Sem IRRF.** A aprovação do aditivo não chamava `taxPayableService.generateForDeal`.
4. **"Não encontro as parcelas".** Elas estão nas linhas 30 a 60 da aba Parcelas. A coluna
   Origem dizia "Contrato CTL-006-012-0001", igual às do contrato original.

## Itens

1. `utils/continuacaoDaSerie.ts`: a 1ª parcela nova vem um ciclo depois da última parcela
   existente, no dia da série, com uma parcela por ciclo do período novo. Sem série para
   continuar, a geração é a de antes, a partir do início.
   **Pronto quando:** `continuacaoDaSerie.test.ts` passa (CTL-006: 10/05/2019, 30 parcelas).
2. `applyProrrogacaoAddendum`:
   - continua a série;
   - corta a negociação a partir da 1ª parcela nova;
   - marca cada parcela com `contract_addendum_id`;
   - regera os tributos.

   **Pronto quando:** `renovacaoAditivoContinuaSerie.test.ts` passa.
3. `undoAddendumRenewal` apaga só as parcelas marcadas com o aditivo. Aditivo antigo, sem
   marca, segue a regra por data. Depois de apagar, regera os tributos e confere os erros
   do delete.
4. Gaveta de renovação:
   - o dia vem da série (`seriesDueDay`);
   - a prévia diz "a 1ª em dd/mm/aaaa (continua a série atual)".
5. Aba Parcelas: a Origem mostra "Aditivo AD-00X (contrato)" nas parcelas marcadas.
6. Migration `aplicar_20271125410000_parcela_do_aditivo.sql`: coluna
   `internal_transactions.contract_addendum_id` com FK `ON DELETE SET NULL` e índice
   parcial. Ensaio em transação abortada: ok.
7. **Dados do CTL-006:** fazer pelo próprio app, depois do deploy:
   - marcar as 30 parcelas do AD-001 com `contract_addendum_id`;
   - usar o "Desfazer" do AD-001 (apaga só elas e regera os tributos);
   - renovar de novo, com o dia 10, até 22/09/2021, a R$ 4.784,92.

   **Pronto quando:** o banco mostra 30 parcelas de 10/05/2019 a 10/10/2021, marcadas, com
   IRRF de R$ 446,49 cada; a parcela de 10/04/2019 continua lá; e `due_day` = 10.

## Fora deste plano

A renovação por **novo contrato** (`renewContract`) tem o mesmo desenho: o filho começa no
início do período, e as parcelas pendentes do pai a partir dele são cortadas. Hoje não há
nenhum contrato-filho no banco. Fica registrado para quando aparecer o primeiro caso.
