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
