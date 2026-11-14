# Meus Clientes — propagar a edição pelo app, agrupar por empreendimento, ações no título

## Pedido original

Sessão de 13/11/2026 (noite), transcrito literalmente:

> Minhas organizações > meus Cientes: ao alterar algo e salvar, perguntar se deseja propagar pelo app (financeiro, suprimentos etc). apenas como exemplo ao alterar o nome
> Minhas organizações > meus Cientes:
> 1. Ao alterar algo e salvar, perguntar se deseja propagar pelo app (financeiro, suprimentos etc). apenas como exemplo ao alterar o nome.
> 2. Filtro grupo falta empreendimento.
> 3. Mover botões voltar e salvar alterações para o topo, na linha do título da tela, alinhado a direita.

## Diagnóstico (medido no banco em 13/11/2026)

O nome do cliente fica copiado como TEXTO, além do id, em:

| destino | tabela | vínculo | campos | linhas do cliente | já divergentes |
|---|---|---|---|---|---|
| Financeiro | `internal_transactions` | `party_id` | `party_name`, `entity_name`, `party_email` | 363 | 42 (36 de "Filtrelec Comercio e Importação" ainda "Filtrelec") |
| Cobranças | `client_charges` | `client_id` | `party_name`, `party_email` | 2 | 2 |
| Garantia | `warranty_claims` | `client_id` | `client_name` | 4 | 0 |
| Obras | `projects.settings.client` | `settings.clientId` | nome | — | sim (ex.: "Arquidiocese… / Paroquia…") |

Fora, de propósito: recibos numerados, NF-e e histórico da régua de cobrança
(documento emitido guarda o nome da emissão). **Suprimentos não guarda cópia de
cliente** (credor lá é fornecedor). Vendas, Locações e Contratos leem o nome pelo
id, na hora — não precisam de propagação.

## Itens

### 1. Propagar a edição (nome / e-mail)
- **Muda:** `utils/clientPropagacao.ts` (decisões puras), `services/clientPropagacaoService.ts`
  (planejar = só lê; aplicar = UPDATE em lote, cai para linha a linha se o banco recusar
  uma linha — ex.: título a pagar em competência fechada — e conta o que a RLS pulou),
  `components/ClientList.tsx` (`oferecerPropagacao` depois do salvar de uma EDIÇÃO).
- **Comportamento:** só pergunta se mudou nome/e-mail NESTE salvamento E houver cópia
  diferente; a pergunta lista quantos registros por destino; "Propagar" / "Só no cadastro".
- **Pronto quando:** `__tests__/clientPropagacao.test.ts` e
  `__tests__/clientPropagacaoService.test.ts` verdes. ✅

### 2. Agrupar por Empreendimento
- **Muda:** `components/ClientList.tsx` (opção "Empreendimento"), `utils/agruparLinhas.ts`
  (`chavePorCombinacao`), guia §6.12.
- **Decisão:** vários empreendimentos por cliente → um grupo por COMBINAÇÃO ("X, Y"), o
  texto que a célula lista; a linha não se duplica.
- **Pronto quando:** caso novo em `__tests__/components/CadastrosAgrupar.test.tsx` verde. ✅

### 3. Voltar / Salvar alterações na linha do título
- **Muda:** `components/ClientForm.tsx` — rodapé sai, ações vão para a linha do `<h1>`,
  submit pelo atributo `form`. Guia §25 (lista das telas migradas).
- **Pronto quando:** `__tests__/components/ClientFormAcoesNoTitulo.test.tsx` verde. ✅

## Estado

3 de 3 itens com teste verde na frente `clientes-propagar-edicao`. Falta: PR + publicação.
