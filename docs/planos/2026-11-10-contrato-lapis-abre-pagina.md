# Lápis "Ajustar Contrato" da lista abre a página do contrato (drawer só cria)

## Pedido original

Sessão de 09–10/11/2026 (VS Code), depois de perguntar se Contratos de Serviço tinha
Centro de Custo e Plano de Contas:

> existe alguma informacao no drawer Ajustar Contrato que nao existe no contrato mesmo. Parece que o drawer esta duplicando o que ja existe no contrato

Resposta (resumo): nenhum campo é exclusivo do drawer — os 10 blocos do `ContractModal`
estão na página do contrato, repartidos nas abas Resumo, Financeiro e Emissão
(`ContractDetailView.tsx`, `RESUMO_/FINANCEIRO_/EMISSAO_FORM_SECTIONS`). O drawer só tem a
mais a lista editável de parcelas com "Redistribuir igualmente" (tirada da página em
24 e 26/10 por ignorar parcela paga) e o card "Exposição Financeira". Proposta: o lápis
da lista abre a página do contrato e o drawer fica só para criar.

> sim

## Por que não é só duplicação

A lista carrega os contratos sem `payment_schedule` (`contractService.listContracts`).
O lápis entregava esse objeto ao drawer; num contrato Parcelado o drawer gerava um
cronograma padrão pelo Valor Original e, ao salvar, mandava `payment_schedule` —
`updateContract` regravava o cronograma e ressincronizava o financeiro, por cima do que
foi ajustado em Financeiro › Parcelas.

## Itens

1. **`components/SupplyChainContractList.tsx`** — o lápis "Ajustar Contrato" (grade e
   tabela) chama `onViewDetails(contract.id)`; a prop `onEdit` sai.
   *Pronto quando:* teste em `__tests__/components/SuprimentosAgrupar.test.tsx` clica no
   lápis e vê `onViewDetails('<id>')`.
2. **`components/AppRouter.tsx`** (Suprimentos › Contratos) — não passa mais `onEdit` à lista.
   *Pronto quando:* `tsc` sem erro.
3. **`components/ServiceContractsModule.tsx`** (Comercial › Contratos de Serviço) — não
   passa `onEdit` à lista nem ao detalhe (o do detalhe já era `@deprecated`, nunca
   chamado); o `ContractModal` fica só de criação.
   *Pronto quando:* `tsc` sem erro e o fluxo "Novo" continua abrindo o drawer.

Fora do escopo: o `onEdit` `@deprecated` do `ContractDetailView` no `AppRouter` (nunca
é chamado) e o card "Exposição Financeira" do drawer de criação.

## Andamento

- 10/11/2026 — itens 1, 2 e 3 feitos. Teste novo falhou antes da mudança e passa
  depois; `tsc` sem erro; `check-ui-standard.sh` nos 3 arquivos e
  `check-org-selector-guard.sh` limpos. Não conferido no navegador.

## Pedido de 10/11/2026 (mesma sessão, após o #302 no ar)

> aprovado.
> faça mais um ajuste do lado do lapis existe botão ver detalhes com a mesma funcao do lapis. Exclui-lo e manter apenas o lapis

4. **`components/SupplyChainContractList.tsx`** — sai o botão "Ver Detalhes" da coluna
   Ações da tabela (a grade não tinha); a largura padrão da coluna cai de 200 para
   120 px (lápis + menu ⋯ + padding). Quem já redimensionou a coluna mantém a largura salva.
   *Pronto quando:* o teste do lápis confirma que a linha não tem "Ver Detalhes".
   — Feito: teste passa, `tsc` sem erro, `check-ui-standard.sh` limpo. Não conferido no navegador.
