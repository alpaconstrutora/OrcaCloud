# Contas a Pagar vira tela dedicada e Gestão Financeira para de duplicar telas

## Pedido original

Sessão `6d6cee0a-c071-43a3-b7eb-6a233ebb378b` · 2026-08-15

Primeira mensagem:

> sidebar financeiro < gestão financeiro e financeiro < contas a pagar são a mesma coisa?

Segunda mensagem (a que originou o plano):

> sinto que esta confuso e falta um fluxo no processo.
> contas a receber e boletos a receber são páginas dedicadas, boletos a pagar é uma página dedicada também, porem contas a pagar näo fica confuso com gestäo financeira.
> o que sugere?

Terceira mensagem, aprovando a sugestão apresentada:

> sim

## Diagnóstico

O menu Financeiro tem 13 itens. Doze são rota própria; **"Contas a Pagar" não é** —
`AppRouter.tsx:797-816` mandava `contas-a-pagar`, `project-financial` e
`financial-categories` para o **mesmo** `ProjectFinancialManager`, mudando só a aba
inicial (`initialTab`). Clicar em "Contas a Pagar" e em "Gestão Financeira" podia
abrir exatamente a mesma tela, porque "Gestão Financeira" restaura a última aba
visitada do `localStorage['financial_active_tab']`.

Pior que isso: o `ProjectFinancialManager` **re-embute três telas que já existem
como página dedicada no menu**:

| Aba do PFM | Componente | Já existe no menu como |
|---|---|---|
| Contas a Pagar | `ContasPagarManager` | item "Contas a Pagar" (que era a própria aba) |
| Boletos a Pagar | `BoletoManager` | item "Captura de Boletos" |
| Conciliação | `BankReconciliation` | item "Conciliação Bancária" |

A causa é a tela misturar **dois eixos**:

- **por obra/carteira** — Resumo, Receitas, Despesas, Rentabilidade, Extrato. Dependem
  de `projectId` e leem `projects.settings.financialInfo`. É a identidade real do PFM.
- **por organização (tesouraria)** — as três acima. Não olham obra nenhuma: recebem só
  `organizationId`. Estão ali por herança.

O lado "a receber" nunca foi absorvido (`ContasReceberManager` e `ClientChargesModule`
são rotas próprias) — por isso ele parece limpo e o "a pagar" não.

Precedente: a aba **"Fluxo"** já foi aposentada por este mesmo motivo (era a 4ª versão
do fluxo de caixa) — ver `RETIRED_TABS` no PFM e
[[project_financeiro_telas_eixo_temporal]]. Este plano repete o movimento para as três
abas restantes.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-15 | Rota dedicada para Contas a Pagar + remover as 3 abas duplicadas + renomear rótulos? | Sim |

Decisões de detalhe assumidas por mim (assinaladas para revisão):

- "Captura de Boletos" → **"Boletos a Pagar"**: é o nome que a própria aba usava e faz
  par com "Boletos ao Cliente". "Captura" descreve o *como*, não o *quê*.
- "Gestão Financeira" → **"Financeiro da Obra"**: com as 3 abas fora, sobra o que a
  tela de fato é. O nome antigo prometia "o financeiro da empresa" e competia com todos
  os outros itens do grupo.
- Grupos visuais no menu (`DropdownGroupLabel`, já usado no menu de RH): A receber ·
  A pagar · Tesouraria · Análise.

## Plano

### 1. `components/AppRouter.tsx`

**O que muda:** `contas-a-pagar` vira `case` próprio renderizando `ContasPagarManager`
direto (espelho de `contas-a-receber` → `ContasReceberManager`), com `React.lazy` +
`Suspense` como as vizinhas. Sai o `case 'financial-categories'` (alias morto: o id não
aparece no menu nem em nenhuma navegação do repo — o `'financial-categories'` que existe
em `FinancialCategoriesManager.tsx` é queryKey do react-query, coisa outra). Sai a prop
`initialTab` do `ProjectFinancialManager`. Em `onViewPayable` (deep-link do Fiscal,
linha 975) sai o `setProjectId(pid)` — o `ContasPagarManager` não recebe `projectId`,
então esse set já era inócuo e só mexia no contexto de obra por trás.

**Como sei que terminou:** clicar em Financeiro › Contas a Pagar abre o
`ContasPagarManager` sem barra de abas do PFM; `grep -n "financial-categories"` no
AppRouter não retorna nada; o deep-link do Fiscal (`Ver título`) cai em Contas a Pagar
sem trocar a obra selecionada no topo.

### 2. `components/ProjectFinancialManager.tsx`

**O que muda:** `TabKey` perde `'conciliacao' | 'boletos' | 'contas_pagar'`; as três
entram em `RETIRED_TABS` (quem tinha uma delas no `localStorage` cai no Resumo em vez de
tela em branco). Saem as três entradas de `tabs`, os três blocos de render, os imports
de `BankReconciliation`/`BoletoManager`/`ContasPagarManager`, o `tabsOnlyBar`, o
`TABS_RENDERED_BY_CHILD`/`childOwnsTabsBar` e a prop `initialTab`. Ficam 5 abas: Resumo,
Receitas, Despesas, Rentabilidade, Extrato.

**Como sei que terminou:** a tela mostra 5 abas; `npx tsc --noEmit` passa sem "declared
but never read"; com `localStorage['financial_active_tab'] = 'contas_pagar'` a tela abre
no Resumo.

### 3. `components/Layout.tsx`

**O que muda:** rótulo `boletos-pagar` "Captura de Boletos" → "Boletos a Pagar";
`project-financial` "Gestão Financeira" → "Financeiro da Obra" (nos dois lugares: o
`DropdownItem` da linha ~1052 e a entrada de busca rápida da linha ~524). Itens
reordenados com `DropdownGroupLabel` em 4 grupos. `financeiroViews` (linha 488) fica
igual — todos os ids continuam existindo.

**Como sei que terminou:** o menu Financeiro aberto mostra os 4 rótulos de grupo e os 13
itens na ordem nova; nenhum item some.

### 4. `services/p2pFlowService.ts`

**O que muda:** os estágios `financeiro` ("Contas a Pagar") e `pagamento` ("Pago /
Baixado") apontam `view: 'project-financial'` (linhas 146 e 152). Passam a apontar
`'contas-a-pagar'` — senão, depois da mudança, clicar neles cai no Resumo do Financeiro
da Obra, que não tem nada a ver com título a pagar.

**Como sei que terminou:** no P2P, clicar no estágio "Contas a Pagar" abre a tela de
Contas a Pagar.

### 5. `components/FinancialDashboard.tsx`

**O que muda:** os KPIs "A Receber" e "Recebido" navegam para `'project-financial'`
(linhas 229 e 236). Passam a apontar `'contas-a-receber'`, simétrico aos KPIs "A Pagar"/
"Pago" que já apontam `'contas-a-pagar'`. *(Extra além do combinado — uma linha cada,
mesmo assunto; sinalizado ao usuário no relatório.)*

**Como sei que terminou:** clicar no card "A Receber" abre Contas a Receber.

### 6. `components/BoletoManager.tsx` e `components/ContasPagarManager.tsx`

**O que muda:** o `<h1>` do BoletoManager vira "Boletos a Pagar" (era "Captura de
Boletos"), batendo com o menu. Nos dois, sai a prop `tabsSlot` — o único componente que
a passava era o PFM, e ela ficaria como API morta documentando uma relação que deixou de
existir.

**Como sei que terminou:** `grep -rn "tabsSlot" components/` não retorna nada nesses dois
arquivos nem no PFM; as duas telas abrem com título → KPIs → botões → tabela, sem buraco
onde ficavam as abas.

### 7. Verificação de padrão (REGRA #1)

`bash scripts/check-ui-standard.sh` em cada arquivo tocado, `npx tsc --noEmit`, e o
guard de organização (`npx vitest run __tests__/orgContextGuard.test.ts`).

## Estado

Implementado em 2026-08-15, ainda **não commitado** e **não aberto no navegador**.

- [x] Item 1 — AppRouter: `contas-a-pagar` é `case` próprio com `ContasPagarManager`
      lazy; `financial-categories` removido; `initialTab` removido; `setProjectId` fora
      do `onViewPayable`.
- [x] Item 2 — ProjectFinancialManager: 8 abas → 5; as 3 removidas entraram em
      `RETIRED_TABS`; imports, `tabsOnlyBar`, `TABS_RENDERED_BY_CHILD` e as props
      `organizations`/`userEmail`/`onOrgChange` (que só serviam para repassar aos filhos)
      removidos.
- [x] Item 3 — Layout: 4 grupos (`DropdownGroupLabel`), "Boletos a Pagar" e
      "Financeiro da Obra"; a busca rápida ganhou `boletos-pagar`, que não estava lá.
- [x] Item 4 — p2pFlowService: estágios `financeiro` e `pagamento` → `contas-a-pagar`.
- [x] Item 5 — FinancialDashboard: KPIs "A Receber"/"Recebido" → `contas-a-receber`.
- [x] Item 6 — `tabsSlot` removido de BoletoManager e ContasPagarManager; `<h1>` do
      BoletoManager virou "Boletos a Pagar".
- [x] Item 7 — verificações mecânicas (ver abaixo).

### Correções de padrão arrastadas junto (REGRA #1)

`ProjectFinancialManager.tsx` **já reprovava** no `check-ui-standard.sh` antes desta
tarefa, em pontos não relacionados a ela. Como a REGRA #1 exige o arquivo limpo antes de
reportar, foram corrigidos: pílula §8 em "KPIs Consolidados" e em "Correspondência
Encontrada" (viraram texto simples colorido), `uppercase` no irmão "Sem correspondência",
e `expenseSearchTerm` migrado de `useState` para `usePersistedState` (§3). A legenda do
gráfico de fluxo (bolinha de cor + rótulo) era **falso positivo** — `rounded-full` e
`uppercase` estavam na mesma linha física em elementos irmãos; foi quebrada em linhas,
sem mudança visual.

### O que foi verificado

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | passa |
| `npm run build` | passa (`✓ built in 15.46s`) |
| `bash scripts/check-ui-standard.sh` nos 6 arquivos | 6/6 sem violação |
| `npx vitest run __tests__/orgContextGuard.test.ts` | 14/14 |
| `bash scripts/check-system-projects.sh` | sem filtro manual |

A catraca do `orgContextGuard` **reprovou na primeira tentativa** (AppRouter 33 → 34):
o `case` novo tinha nascido com `activeOrganizationId || ''`, copiado das vizinhas.
Corrigido para `?? undefined` — a sentinela de "Todas" é ausência, não string vazia.

### O que NÃO foi verificado

**Nada foi aberto no navegador.** As checagens acima são mecânicas e não provam
comportamento (ver `feedback_nunca_declarar_corrigido_sem_verificar`). Falta rodar a
"Verificação de ponta a ponta" abaixo com o app no ar.

## Verificação de ponta a ponta

1. Menu Financeiro: os 13 itens aparecem, agrupados, com "Boletos a Pagar" e
   "Financeiro da Obra" nos nomes novos.
2. Contas a Pagar abre tela própria (título "Contas a Pagar", sem barra de abas do PFM),
   com as 3 visões internas — Parcelas / Notas fiscais / Fechamento por CC — intactas.
3. Financeiro da Obra abre com 5 abas e nenhuma delas repete outra tela do menu.
4. Com `localStorage['financial_active_tab']` = `contas_pagar`, `boletos` ou
   `conciliacao`, a tela abre no Resumo (não em branco).
5. Deep-link do Fiscal para um título a pagar continua chegando em Contas a Pagar.
6. Não há mudança de dado, schema, RLS ou service de leitura — só rota e navegação.
