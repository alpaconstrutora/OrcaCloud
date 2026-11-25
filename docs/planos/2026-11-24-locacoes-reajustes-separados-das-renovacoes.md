# Locações: reajuste anual separado da renovação

## Pedido original

Sessão 98df7c3d, 24/11/2026, depois da explicação de onde o reajuste é aplicado:

> Aba renovações é para tratar renovar um contrato que chega ao fim,e não de reajuste anual do contrato

Decisões do usuário (AskUserQuestion, mesma sessão):

- **Para onde vai a lista de reajuste vencido:** "Aba própria "Reajustes" (Recommended)". É uma aba nova em Comercial › Locações, ao lado de Renovações. Ela mostra os contratos com reajuste vencido ou nos próximos 30 dias, e o reajuste é aplicado dali.
- **Valor do aluguel ao renovar:** "Valor atual (Recommended)". O período novo nasce com o aluguel vigente, e o reajuste segue só pelo fluxo de reajuste, na data de aniversário.

## Contexto (o que existia)

- A lista "reajuste vencido" (`ContractReajusteDue`) aparecia no fim de Locações › Renovações (`RentalRenewals.tsx`). Ela listava contratos de **todos** os domínios, porque `listDueForReajuste` não filtra domínio.
- Na negociação, a renovação (`ContractRenewalsPanel`) sugeria o aluguel já reajustado (`previewRenewal` com `applyReajuste` padrão = tem índice).
- As duas vias de renovação reiniciavam o aniversário do reajuste: `reajuste_data_base = início do período novo` e `reajuste_proximo = início + 12 meses`.
  - Aditivo: `applyProrrogacaoAddendum` em `contractService.ts`.
  - Contrato novo: `renewContract` em `contractRenewalService.ts`.
  - Com a renovação deixando de reajustar, isso faria o reajuste anual ser **pulado**.

## Itens

1. **Renovação nasce com o aluguel vigente.** O `ContractRenewalsPanel` passa `applyReajuste: false` na prévia e na efetivação. O texto de apoio aponta para Locações › Reajustes.
   - *Pronto quando:* ao renovar, "Valor do Aluguel" mostra o aluguel vigente e o aviso "Índice … não encontrado" não aparece mais.
2. **Renovar sem mudar o valor mantém o aniversário do reajuste.** Vale para o aditivo e para o contrato novo. Se o usuário digitar outro valor na renovação, aquilo é um reajuste, e o aniversário reinicia como antes. A regra é uma função pura testada.
   - *Pronto quando:* existe um teste de unidade da regra, e as duas vias a usam.
3. **Aplicar reajuste pelo índice num lugar só.** A busca do índice-base e do atual mais `applyReajuste` sai de `ContractReajusteDue` e vai para `contractService.aplicarReajustePeloIndice`. A busca do índice passa a usar a organização do contrato, não a da tela (REGRA #5).
   - *Pronto quando:* `ContractReajusteDue` e a aba nova chamam a mesma função.
4. **Aba "Reajustes" em Locações.** `rentals/RentalReajustes.tsx` traz os contratos de LOCAÇÃO ativos com índice e reajuste vencido ou nos próximos 30 dias. Colunas: contrato, locatário, índice, data do reajuste, situação, aluguel atual e ações. "Aplicar" fica desligado, com o motivo, antes da data. A tabela é `StandardTable`.
   - *Pronto quando:* a aba aparece depois de Renovações, e o `check-ui-standard` sai limpo.
5. **Renovações sem reajuste.** O `ContractReajusteDue` sai de `RentalRenewals.tsx`. A tela "Reajustes de Contrato" (alerta da Central) continua.
   - *Pronto quando:* a aba Renovações só mostra o que está chegando ao fim.

## Progresso

- [x] 1 — `ContractRenewalsPanel`: `applyReajuste: false` na prévia e na efetivação; texto de apoio aponta para Locações › Reajustes.
- [x] 2 — `aniversarioAposRenovacao` (`utils/reajusteParcelado.ts`, 4 testes) usada em `applyProrrogacaoAddendum` e `renewContract`.
- [x] 3 — `contractService.aplicarReajustePeloIndice`; `ContractReajusteDue` passou a chamá-la (índice pela org do contrato).
- [x] 4 — `rentals/RentalReajustes.tsx` (`StandardTable`) + `contractIndexService.listReajustesLocacao`; aba depois de Renovações. `check-ui-standard` limpo.
- [x] 5 — `ContractReajusteDue` saiu de `RentalRenewals.tsx`; tela "Reajustes de Contrato" da Central mantida.
- [ ] Conferência na tela (não feita nesta sessão: exige login).

⚠️ Achado ao conferir os dados (24/11/2026): 6 locações entram na fila hoje. A CTL-006-012-0001 tem data-base 23/09/2016 —
aplicar reajusta 10 anos de IGP-M de uma vez. Se o aluguel de R$ 4.556 já inclui reajustes feitos fora do sistema, a
data-base precisa ser corrigida antes (decisão do usuário, não automatizada).

---

## Fase 2 — reajuste pelo aniversário, com escolha e aviso configurável

### Pedido (24/11/2026, mesma sessão)

> 1. Por que 10 anos ? Vai ser aplicado pelo período de vigência do contrato, se não me engano do contrato e de 30 meses. Então finaliza em 2019.
> 2. O reajuste é aplicada de acordo com a periodicidade. Por exemplo, se não me engano se for anual. O reajuste é aplicado após 12 meses. Quando chegar em 12 meses o usuário pode optar por aplicar o índice do contrato conforme acordado. Ele pode aplicar 100% do índice ou o valor que ele quiser, ou até mesmo não aplicar reajuste nenhum.
> Ao aplicar o reajuste o valor do contrato deve ser rejustado com o novo valor das parcelas remanescentes
> Ou ponto é que o usuário deve receber uma mensagem / alerta quando o data dr reajuste estiver chegando. Ele poderia escolher para ser alertado tantos dias antes x dias d da data de reajuste

Decisões (AskUserQuestion):

- **Aviso:** "Os dois". Cada organização tem um padrão em Configurações do Sistema, e cada contrato pode trocar o seu.
- **Periodicidade vazia:** "Vazia = Anual (Recommended)".

### O que está errado hoje (conferido no banco e no código em 24/11/2026)

CTL-006-012-0001 tem vigência de 23/09/2016 a 22/03/2019 (30 meses), IGP-M, data-base 23/09/2016 e próximo reajuste em 23/09/2017. Há 30 parcelas `CONTRACT_RECURRING` de R$ 4.556: 23 conciliadas e 7 em aberto, com vencimentos de 2016 a 2019.

- **Conta errada.** `applyReajuste` / `aplicarReajustePeloIndice` usa fator = índice de **hoje** ÷ índice da data-base. No caso acima isso dá 10 anos de IGP-M, quando o certo seria o índice do mês do aniversário.
- **Parcelas não mudam.** Só são atualizadas as parcelas em aberto com vencimento **a partir de hoje**. As 7 parcelas em aberto acima são todas anteriores a hoje, então nenhuma mudaria: só o valor do contrato subiria.
- **Data do próximo reajuste.** O próximo é contado como hoje + 12 meses: não respeita o aniversário, a periodicidade nem o fim da vigência.
- **Sem escolha nem histórico.** Não dá para escolher outro percentual, outro valor ou "não aplicar". Não há histórico, só uma linha na descrição do contrato.
- **Aviso fixo.** `fn_notif_contrato_reajuste(30)` usa 30 dias fixos e ignora aniversário vencido há mais de 90 dias; por isso o de 2017 nunca avisou.
- **Periodicidade sem lugar no contrato.** A "Periodicidade do Reajuste" mora na negociação (`commercial_deals.billing_cycle`: 3 com Anual, 7 vazias, e a tela mostra "Mensal" quando está vazia). No contrato, `billing_cycle` é a cadência de COBRANÇA (Mensal nas 9 locações), então o contrato não tem onde guardar a periodicidade do reajuste.

### Itens

6. **Banco (migration aditiva).**
   - Em `contracts`:
     - `reajuste_periodicidade_meses smallint`, nulo = 12. Preenchido a partir da negociação: Anual 12, Semestral 6, Trimestral 3, Bimestral 2, Mensal 1, vazio fica nulo.
     - `reajuste_aviso_dias smallint`, nulo = padrão da organização.
   - Tabela `contract_reajustes`, o histórico de cada aniversário:
     - contrato, organização, aniversário, data-base, índice;
     - mês e valor do índice base e do índice do aniversário, % do índice;
     - decisão (`INDICE` | `PERCENTUAL` | `VALOR` | `NAO_APLICADO`), % aplicado, valor anterior, valor novo;
     - parcelas atualizadas, observação, quem e quando.
     - RLS por `minhas_orgs_membro()` e REVOKE TRUNCATE.
   - O padrão da organização fica em `organizations.settings.reajuste_aviso_dias`, gravado por RPC que confere se a pessoa é admin e mescla a chave sem pisar nas outras.
   - *Pronto quando:* a migration é aplicada (com autorização), a coluna e a tabela existem, e a policy é conferida no banco.
7. **Regra do aniversário (função pura, testada).**
   - Recebe data-base, próximo reajuste, periodicidade e fim da vigência.
   - Devolve o aniversário a tratar, o mês do índice (o do aniversário) e o próximo aniversário (este + periodicidade, nunca hoje + 12).
   - Se o próximo aniversário passa do fim da vigência, o contrato sai da fila.
   - *Pronto quando:* passam os testes do caso real (2016 → aniversários 23/09/2017 e 23/09/2018, depois sai da fila), de Anual/Semestral e de 29/02.
8. **Aplicar o reajuste de um aniversário** (`contractService`).
   - A prévia mostra os índices base → aniversário, o % e o valor sugerido.
   - A decisão é 100% do índice, outro %, valor novo ou não aplicar.
   - Ao aplicar:
     - o valor do contrato muda;
     - mudam as parcelas **em aberto com vencimento a partir do aniversário**, das duas origens: `CONTRACT_RECURRING` do contrato e `tx-{deal}` da negociação. Pagas, conciliadas e com valor manual não mudam;
     - a data-base passa a ser o aniversário, e o próximo aniversário é calculado pela regra do item 7;
     - grava o histórico.
   - "Não aplicar" só avança o aniversário e grava o histórico.
   - `aplicarReajustePeloIndice`, usada pela tela da Central, passa a usar o mesmo caminho com a decisão `INDICE`.
   - *Pronto quando:* há testes com o serviço simulado (parcelas a partir do aniversário, dois aniversários em sequência, "não aplicar"), e um teste no banco dentro de transação com ROLLBACK no CTL-006-012-0001 mostra as 7 parcelas certas.
9. **Tela Locações › Reajustes.**
   - "Aplicar reajuste" abre um painel com a prévia e as 4 opções.
   - A linha abre o histórico do contrato.
   - A fila respeita o aviso de cada contrato e o fim da vigência.
   - *Pronto quando:* o `check-ui-standard` sai limpo e o fluxo é conferido na tela.
10. **Aviso configurável.**
    - Campo "Avisar X dias antes do reajuste" em Dados do contrato.
    - Em Configurações do Sistema › Índices de Reajuste fica o padrão da organização, desligado em "Todas", com o motivo.
    - `fn_notif_contrato_reajuste` passa a usar contrato → organização → 30. Avisa enquanto estiver vencido dentro da vigência, sem o corte de 90 dias, e no máximo um aviso a cada 30 dias. A mensagem aponta para Locações › Reajustes.
    - *Pronto quando:* a função é aplicada e o teste no banco mostra o aviso do CTL-006-012-0001 sendo gerado (com ROLLBACK).
11. **Periodicidade na tela.**
    - "Periodicidade do Reajuste" vazia passa a mostrar Anual.
    - Ao salvar a negociação, a periodicidade e o aviso vão para o contrato (mesmo caminho do #682).
    - *Pronto quando:* salvar a negociação grava `reajuste_periodicidade_meses` e `reajuste_aviso_dias` no contrato.

### Fora (registrado)

- O reajuste de contrato **não recorrente** (venda parcelada, suprimentos) continua no `applyReajuste` atual, só com o índice do aniversário.
- O "Periodicidade" da tela de renovação é a cadência de cobrança e não foi mexido.

### Progresso Fase 2

- [x] 6 — `aplicar_20271124100000_reajuste_aniversario.sql` aplicada em 24/11/2026 (autorização do usuário). Conferido no banco:
  - as 2 colunas existem e 3 locações receberam a periodicidade da negociação;
  - `contract_reajustes` tem RLS e 2 policies, sem TRUNCATE para authenticated;
  - a RPC fecha para anon;
  - a rotina de aviso já usa o aviso do contrato → org.
- [x] 7 — `utils/reajusteAniversario.ts`, com 23 testes: caso real 2017 → 2018 → sai da fila, semestral, 29/02, decisões e regra da fila.
- [x] 8 — `services/reajusteLocacaoService.ts` (prévia, decidir, histórico, padrão da org), com 6 testes de serviço; `aplicarReajustePeloIndice` delega para locação.
  - Dados reais: no 1º aniversário (23/09/2017) do CTL-006-012-0001 mudam as 6 parcelas em aberto de 11/2018 a 04/2019; a de 11/2016 não.
- [x] 9 — `RentalReajustes` (fila pelo aniversário/aviso; "Reajustar" a partir da data; histórico na linha) e `ReajusteDecisaoSheet` (4 opções e resultado ao vivo). `check-ui-standard` limpo.
- [x] 10 — "Avisar antes do reajuste" em Dados do contrato (grava no contrato ao sair do campo) e `AvisoReajusteOrgSettings` em Configurações › Índices de Reajuste.
  - Na rotina: o teste com ROLLBACK gerou 36 avisos (6 locações × 6 membros), entre eles o do CTL-006-012-0001.
  - O link `/rentals?tab=reajustes` agora abre a aba (`linkNotificacao` + evento). O `tab=renewals` também passou a valer.
- [x] 11 — periodicidade vazia mostra Anual (e ganhou Trimestral). Salvar a negociação leva periodicidade e índice ao contrato (`termosDeReajusteParaOContrato`, recalcula o próximo aniversário). `createFromDeal` grava a periodicidade e o 1º aniversário por ela. Renovação por contrato novo herda os termos.
- [ ] Conferência na tela (não feita nesta sessão: exige login).

## Fase 3 — data do reajuste escolhida na gaveta (24/11/2026)

Pedido original: *"na gaveta de reajuste incluir campo para o usuário escolher a data de reajuste. Vir pre selecionada a data que o app calculoiu"*

- [x] 12. Campo "Data do reajuste" na gaveta (Locações › Reajustes › Reajustar), pré-preenchido com o aniversário calculado (data-base + periodicidade) e com "Usar a calculada" quando trocado. A data escolhida vira o aniversário: índice do mês dela, parcelas em aberto a partir dela, data-base nova = ela, próximo = ela + periodicidade, e é a data gravada no histórico.
  - Validação (`motivoDaDataDeReajuste`, também no `decidir`): depois da data-base e até o fim da vigência; fora disso o botão fica desligado e diz o motivo.
  - **Pronto quando:** testes de `reajusteAniversario` e `reajusteLocacaoService` cobrem data escolhida (CTL-006: 15/10/2017 → 2 parcelas, próximo 15/10/2018) e data recusada sem gravar; tsc e check-ui-standard limpos. ✅ Conferência na tela: pendente (precisa do login do usuário).

## Fase 4 — Reajustes recortado pelo empreendimento aberto (24/11/2026)

Pedido original: *"Corrigir a aba reajuste: Inves de listar os lacatorias referentes ao respectivo empreedimento esta trazendo todos"*

Causa: dentro de um empreendimento (Gestão de Unidades), a aba Contratos filtra pelo edifício aberto (`selectedBuildingId`). A aba Reajustes recebia só a organização e listava os contratos de todos os empreendimentos.

- [x] 13. A regra "contrato do edifício aberto" saiu de dentro de `sortedDeals` e foi para `dealsDoEdificio`, em `components/RentalsModule.tsx`, valendo para as duas abas. A aba Reajustes recebe `negociacoesDoEmpreendimento` e filtra a fila com `filaDoEmpreendimento`. Os indicadores (vencido e chegando) contam a lista já filtrada.
  - O contrato renovado não tem `deal_id`: `listarFila` sobe a cadeia por `parent_contract_id` (`negociacaoDaCadeia`). Sem isso, o renovado sumiria da lista dentro do empreendimento.
  - **Pronto quando:** `__tests__/reajusteFilaPorEmpreendimento.test.ts` cobre a cadeia (renovado e renovado do renovado, laço, sem negociação) e o filtro (fora do empreendimento = tudo; dentro = só os dele; empreendimento sem negociação = vazio). tsc e check-ui-standard sem erros. ✅ Falta conferir na tela.
- [x] 14. A aba **Renovações** passa a usar o mesmo recorte. O usuário respondeu "Sim" em 24/11/2026.
  - `RentalRenewals` recebe `negociacoesDoEmpreendimento`, e `listRentalsExpiring` traz a `negociacaoId` de cada contrato.
  - A busca pela cadeia virou um serviço só (`services/negociacaoDoContratoService.ts`), usado por Reajustes e Renovações.
  - **Pronto quando:** `reajusteFilaPorEmpreendimento.test.ts` cobre `negociacoesDosContratos`, que lê os pais nível a nível e devolve a negociação da raiz. tsc e check-ui-standard sem erros. ✅ Falta conferir na tela.
