# Conciliação › Cadastrar Credor/Cliente obedece ao seletor de organização do topo

## Pedido original

> Financeiro < conciliação bancaria: o botão Cadastrar Credor está cadastrando
> novos credores desconsiderando o seletor de organização no topo da tela. Se
> está selecionado todas as organizações o credor deve ser todas as organizações.
> está havendo uma completa confusão. Entre organização do credor e organização
> da conta bancária.

Sessão: 9196da7b-322f-4aa0-8adf-44665845b2c7 · 2026-09-19

## Diagnóstico

`components/BankReconciliation.tsx › handleSaveNewEntity` gravava o credor (e o
cliente — é o mesmo modal e o mesmo handler) com:

```ts
const orgId = effectiveOrgId || organizationId;
```

e `effectiveOrgId` é, por definição (linha ~729), **a organização da conta
bancária selecionada** quando o topo está em "Todas". Ou seja: o credor nascia
na org da conta, o seletor do topo era ignorado e, em "Todas", nunca era
oferecido "todas as organizações". É exatamente a confusão descrita no pedido.

Modelo do projeto para "todas as organizações" em fornecedor/cliente (plano
`2026-08-28-organization-id-dono-explicito-e-compartilhamento.md`): **um único
cadastro com dono (`organization_id`) + `is_shared = true`** — o trigger
`fn_share_com_minhas_orgs` grava os destinos em `supplier_org_shares` /
`client_org_shares`. Não é replicação por org (`forEachTargetOrg`) porque
CPF/CNPJ (`assertDocumentNotDuplicated`) e e-mail (`suppliers_email_key`) são
únicos.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-19 | Topo em "Todas": abrir o modal padrão da REGRA #5 (Todas = compartilhado, dono = org da conta; ou uma org específica) ou gravar direto como compartilhado sem perguntar? | **Modal padrão da REGRA #5** |

## Plano

- [x] `components/BankReconciliation.tsx`
  **O que muda:** `handleSaveNewEntity` passa a resolver o destino com
  `useOrgWriteTarget().resolveWriteOrg('all-allowed')`:
  - topo com organização (ou empresa/obra) → grava naquela org, `is_shared: false`, sem perguntar;
  - topo em "Todas" → modal padrão; "Todas as organizações" → `is_shared: true`
    com dono = organização da conta bancária do lançamento (`effectiveOrgId`);
    org específica → grava nela;
  - cancelou → nada gravado.
  O registro salvo entra nos estados locais (`supplierRegistros`/`clienteRegistros`
  e `masterSuppliers`/`masterClients`) — §22 do guia — para aparecer no drawer da
  célula sem recarregar. Erros saem no toast da tela (`setActionFeedback`), não em
  `alert()`. `{orgTargetModal}` renderizado no JSX.
  **Como sei que terminou:** `npm run typecheck` limpo; `npx vitest run
  __tests__/orgContextGuard.test.ts` verde; `bash scripts/check-ui-standard.sh
  components/BankReconciliation.tsx` sem achado novo; teste manual abaixo.

## Estado

- [x] `components/BankReconciliation.tsx` — typecheck limpo; `orgContextGuard` 14/14;
  `check-ui-standard` sem achado; `check-xss-sinks` limpo; 71 arquivos de testes de
  componentes (670) verdes; prova Playwright em preview (`C:/tmp/pwtest/concil-cadastrar-credor.js`,
  2026-09-19): topo em "Todas" → Cadastrar credor → "Cadastrar e vincular" → modal
  "Selecionar organização" com "Todas as organizações" + 2 orgs; cancelado, 0 escritas,
  0 erros de página (`concil-credor-03-apos-clicar.png`).
- [x] Publicado em `main` — `8a0f9dc9`; `conferir-producao.sh` provou o SHA no domínio em 2026-09-19.

## Verificação

1. Topo em uma organização X, conta bancária da org Y selecionada → Cadastrar
   Credor → sem modal; em Cadastros › Fornecedores o credor aparece com
   Organização = X (não Y).
2. Topo em "Todas as organizações" → Cadastrar Credor → abre "Selecionar
   organização"; escolher "Todas as organizações" → o fornecedor aparece com
   Organização = "Todas as Organizações (de <org da conta>)" e é visível em cada
   org do usuário.
3. Mesmo caso, escolher uma org específica → aparece só nela.
4. Cancelar o modal → nada é gravado e o modal de cadastro continua aberto.
