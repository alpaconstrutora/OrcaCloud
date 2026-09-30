# Conciliação: aba Regras absorvida pela Central

## Pedido original

> verifique se na aba regras existe alguma funcionalidade útil

> essas funcionalidades poderia ser absorvidas pela aba central?

> sim

Sessão df7b7923 · 2026-09-30. O "sim" respondeu à proposta de 3 itens + trava, descrita
em Contexto.

## Contexto (diagnóstico de 30/09/2026, só leitura)

- 3 regras, todas da Alpa: "Aluguel Tanaka", "Waldir" (nasceu do código de depuração
  WALDIR/400000 apontado em 05/09) e "Repasse Gateway (Asaas)" (`auto_confirm`).
  Hoje as 3 casam só ~19 linhas em aberto.
- 5.878 extratos em `RULE_APPLIED`, mas 5.554 não casam regra nenhuma: o status quer dizer
  "tem categoria" (manual, lote ou memória), e a tela escreve "Regra aplicada". Os 613
  `RULE_MATCH` da auditoria são REAPLICAÇÕES das mesmas ~14 linhas.
- A automação está em 3 botões que se sobrepõem:
  | Botão | Onde | Roda |
  |---|---|---|
  | Aplicar memória (cérebro) | barra de conta/período | `reconciliationMemoryService.aplicar` (só campo VAZIO) |
  | Aplicar Regras Agora | aba Regras | `applyCustomRules(reprocessAll=true)` + motor |
  | Reprocessar | Central | só o motor (`runMatchingEngineTracked`) |
  Na importação, as regras rodam sozinhas (`bankReconciliationService.ts:292`). Depois, só
  pela aba Regras.
- O motor roda na Edge Function `reconciliation-engine` (também por CRON). **Ela não aplica
  regras nem memória**: as duas são só do navegador.
- **O defeito que a unificação tornaria frequente:** `applyCustomRules` busca linhas
  `IMPORTED | NORMALIZED | RULE_APPLIED` (+ `MATCHED` em reprocessAll) e grava a categoria da
  regra por cima. Uma linha que você classificou à mão e que casa uma regra PERDE a sua
  categoria. Hoje quase não aparece porque só roda por clique na aba Regras.
- "Sugerir da memória" (`candidatasARegra`, hits ≥ 5) e "Testar" existem, mas só dentro do
  formulário da regra. A tela só cria e mostra a condição simples "contém": o formato E/OU
  com filtros (Onda 2.6) funciona no motor e é invisível na UI; uma regra nesse formato
  apareceria com a condição vazia.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 30/09 | As funcionalidades da aba Regras podem ir para a Central? | Sim: 3 itens + trava |
| 30/09 | Migração visual da Central junto? | **Plano separado**: esta entrega não muda a cara da Central além do necessário |
| 30/09 | Regra "Waldir" | **Excluir** |
| 30/09 | Botão de memória (cérebro) no Extrato | **Fica** |
| 30/09 | Regra do Asaas só para entradas | **Sim** (ok explícito para alterar em produção) |

## Plano

Um item por arquivo. Cada item diz o que muda e como sei que terminou.

### 1. `utils/reconciliationRules.ts` + `__tests__/reconciliationRules.test.ts` — a trava, pura
- `linhaAceitaRegra(tx)`: só `IMPORTED`/`NORMALIZED` **e** sem `category`. Nunca
  `RULE_APPLIED`, `CONFIRMED` nem `MATCHED`.
- `regrasSugeridasDaMemoria(candidatas, regrasExistentes)`: sai do handler do pai. Devolve
  todas as candidatas `TOKEN` sem regra equivalente, não só a primeira.
- **Pronto quando:** os testes cobrem linha categorizada à mão recusada; linha sem categoria
  aceita; MATCHED recusada; e sugestão que já tem regra filtrada, inclusive com diferença de
  caixa.

### 2. `services/bankReconciliationService.ts`
- `applyCustomRules` passa a filtrar por `linhaAceitaRegra` (a query pede
  `IMPORTED,NORMALIZED` + `category is null`). O parâmetro `reprocessAll` deixa de reabrir
  `MATCHED`.
- `reprocessarTudo(conta, org)`: memória → regras → motor, nessa ordem. Devolve
  `{ memoria: {aplicados, campos}, regras: n, motor: MatchingRunResult }`. Se a memória ou as
  regras falharem, o motor roda assim mesmo e o erro volta no resultado. Não engole.
- CRUD de regra sai dos `supabase.from` diretos do pai: `listarRegras`, `salvarRegra`,
  `excluirRegra`. Mesma tabela, mesmos campos.
- **Pronto quando:** typecheck verde. **Prova no banco:** em transação desfeita, uma linha
  categorizada à mão que casa "Aluguel Tanaka" mantém a sua categoria depois de
  `applyCustomRules`, e uma linha sem categoria recebe a da regra.

### 3. `components/reconciliation/RegrasSheet.tsx` (novo) — painel lateral (REGRA #4)
- Lista das regras (nome, condição legível **nos 3 formatos**, categoria, prioridade,
  ativa), editar, excluir com `useConfirm`.
- Formulário no mesmo painel: nome, "descrição contém", **direção** (Todas / Entradas /
  Saídas, gravada como `filters.direction` no formato de grupo), categoria, credor/cliente
  com `SupplierSelect`/`ClientSelect`, e o "Testar" com os exemplos.
- **Pronto quando:** `check-ui-standard.sh` sem achados, e uma regra no formato E/OU aparece
  legível no navegador (não "undefined").

### 4. `components/SmartReconciliationCenter.tsx`
- "Reprocessar" chama `reprocessarTudo`. O toast diz de onde veio cada número: "12
  classificados pela memória · 4 por regra · 9 conciliados · 30 sugestões". Erro de etapa
  aparece no toast, não só no console.
- Botão "Regras (N)" ao lado da engrenagem de Tolerâncias: abre o `RegrasSheet`.
- Seção "Regras sugeridas" (quando houver): cada contraparte com ≥ 5 classificações e sem
  regra, mostrando "Aceitar", que abre o formulário já preenchido. O usuário confere e salva;
  nada é criado sem revisão.
- **Pronto quando:** visto no navegador, com escritas bloqueadas: botão Regras abre o painel,
  a seção de sugeridas aparece quando há candidatas, e o toast do Reprocessar é conferido com
  a escrita liberada só numa conta combinada com o usuário.

### 5. `components/BankReconciliation.tsx`
- Sai a aba `'rules'`: tipo `ReconciliationView`, botão da barra de abas, `renderRules`,
  `RuleFormModal`, estado e handlers de regra (vão para o Sheet e o serviço).
  `activeView` salvo como `'rules'` cai em `'center'`.
- "Aplicar Regras Agora" deixa de existir (vira o Reprocessar).
- O botão de memória (cérebro) do Extrato **fica** (decidido em 30/09).
- **Pronto quando:** typecheck verde, e nenhum `'rules'` sobra no arquivo.

### 6. `components/reconciliation/RulesTab.tsx` — apagado
- **Pronto quando:** `grep -rn RulesTab components` vazio.

### 7. Rótulo do status (`components/reconciliation/tabelasDaConciliacao.tsx`)
- `RULE_APPLIED: 'Regra aplicada'` → `'Classificado'`. É o que o status significa para
  5.554 das 5.878 linhas. Não muda dado nenhum, só o texto.
- **Pronto quando:** a tela Pendentes mostra "Classificado".

### 8. Dados em produção — só com ok explícito do usuário, item por item
- Regra "Repasse Gateway (Asaas)": restringir a **entradas** (`filters.direction = CREDIT`).
  Hoje ela casaria 4 débitos de 2023 "LIQUIDAÇÃO BOLETO … ASAAS" (pagamentos) e os
  confirmaria como repasse.
- Regra "Waldir": **excluir** (decidido em 30/09). A auditoria antiga continua.
- **Pronto quando:** SELECT da regra mostra o novo `conditions`; contagem de linhas que ela
  casa conferida antes e depois.

## Fora deste plano (registrado para não se perder)
- **Levar memória + regras para a Edge Function**, para o CRON classificar também. Exige
  portar `evaluateRule` e `aplicar` para Deno e publicar a function; é outra frente.
- **Registrar em `reconciliation_runs`** quanto veio da memória e das regras. Hoje a linha
  "Última execução" só conta o motor. Exige migration + Edge.

## Decisões pendentes

Nenhuma. As 4 foram respondidas em 30/09 (tabela acima).

## Estado (30/09/2026)

- [x] 1. `utils/reconciliationRules.ts`: `linhaAceitaRegra`, `descreverCondicao`,
  `condicaoDoFormulario`/`formularioDaCondicao` e `regrasSugeridasDaMemoria`. 14 testes novos em
  `reconciliationRules.test.ts` (36 no arquivo).
- [x] 2. `bankReconciliationService`: trava em `applyCustomRules` (consulta
  `IMPORTED,NORMALIZED` sem categoria + filtro em memória). De carona, o `.limit(10000)`
  virou `fetchAllPages`: era o teto de 1.000 linhas do PostgREST (achado C1 de 05/09), então
  a regra via só parte do extrato. Ganhou também `listarRegras`, `salvarRegra`, `excluirRegra`
  e `simularRegraNaConta`. O `reprocessarTudo` ficou em `services/reconciliationReprocessService.ts`,
  porque dentro do serviço daria import circular. Coberto por `reconciliationReprocess.test.ts`
  (6 testes: ordem, falha isolada, erro do PostgREST legível, texto do toast).
  **Prova no banco:** comparei o filtro antigo com o novo nos dados reais. "Aluguel Tanaka"
  pegaria 10 linhas → 0 (já classificadas). Linhas com categoria DIFERENTE da regra, que o
  filtro antigo sobrescreveria: **0 hoje**. A trava evita o estrago futuro; não havia estrago
  presente.
- [x] 3. `components/reconciliation/RegrasSheet.tsx` com lista, ativar/desativar (`TableSwitch`),
  editar, excluir (`useConfirm`), formulário (contém + direção + categoria + cliente/credor por
  drawer) e o "Testar" contra o extrato inteiro da conta, já com a trava. Regra avançada (E/OU,
  faixa de valor) aparece legível e a condição não é reescrita ao salvar. `check-ui-standard` 0.
- [x] 4. `SmartReconciliationCenter.tsx`: o Reprocessar chama `reprocessarTudo`, com toast por
  fonte e erro de etapa visível. Ganhou o botão "Regras (N)" e a seção "Regras sugeridas" (até 5,
  "Revisar e criar" abre o formulário preenchido). As regras vêm da organização da CONTA
  (`resolverOrganizacaoDaConta`), então funciona com o topo em "Todas".
- [x] 5. `BankReconciliation.tsx`: sai a aba `'rules'` (tipo, título, botão, render, estado e
  handlers). A aba salva como `'rules'` abre a Central. O ⚡ da Pendentes passou a chamar o MESMO
  `reprocessarTudo` (antes rodava regras + motor, e a Central só o motor). Ficam `rules`/`loadRules`,
  porque a aba Categorias renomeia a categoria dentro das regras e o KPI "Regras ativas" do
  Dashboard as conta.
- [x] 6. `RulesTab.tsx` apagado. O tipo que a `CategoriesTab` importava dele virou tipo
  estrutural (só `actions.category`).
- [x] 7. `RULE_APPLIED` passa a aparecer como "Classificado".
- [x] 8. **Aplicado em produção em 30/09**, com snapshot antes e 2 linhas em
  `reconciliation_audit_log` (`RULE_EDIT`, `RULE_DELETE`, com o valor anterior no payload):
  - Asaas: `conditions` virou o grupo `{op: OR, items: [contém ASAAS], filters: {direction: CREDIT}}`.
    Linhas livres que ela pegava: **4 (todas DEBIT) → 0**. Sem isso, o primeiro Reprocessar
    unificado confirmaria 4 pagamentos de boleto de 2023 como repasse.
  - Waldir: excluída. A organização fica com 2 regras.
  - ⚠️ Até esta frente ser publicada, a aba Regras ANTIGA em produção mostra a condição do Asaas
    vazia: ela só lê `conditions.value`, e esta regra agora é um grupo. O motor antigo já entende
    o formato (Onda 2.6), então a regra funciona certo; só a exibição fica vazia.

**Correção durante a execução.** A guarda da REGRA #5 (`orgContextGuard.test.ts`) reprovou 2
`if (!organizationId) return` no `RegrasSheet`. Eram redundantes, porque os botões só existem com
a organização, e foram removidos: a organização passou a ir por parâmetro.

**Verificação executada:**
- `tsc` 0; `check-ui-standard` 0 nos 5 .tsx tocados; `check-xss-sinks` 0.
- Suíte: 6.462 passaram + 33 pendentes = 6.495, 0 falhas.
- Navegador (conta de leitura, org Alpa, conta Sicredi 1234, escritas bloqueadas = 0, erros = 0):
  - a aba Regras sumiu; a aba salva "rules" abre na Central;
  - "Regras (2)"; o Asaas aparece como "Descrição contém "ASAAS" · só entradas · confirma sozinha";
  - o formulário do Asaas carrega contém/direção; o "Testar" responde "Não classificaria nenhum
    movimento agora";
  - "Regras sugeridas" traz 5 (Sicredi 615×, SAAE 272×, Energisa 210×, Itaú 181×, Defensoria
    104×), e "Revisar e criar" abre o formulário preenchido.
- **Não visto no navegador:** o clique real em Reprocessar e em Criar/Salvar/Excluir (tudo
  escrita), coberto só pelos testes unitários.
- ⚠️ **Cuidado com a sugestão "SICREDI":** "contém SICREDI" pode ser amplo demais, porque o nome
  do banco aparece em muitas descrições. O "Testar" mostra o alcance antes de criar.

## Verificação
1. `npx vitest run __tests__/reconciliationRules.test.ts`, depois a suíte completa (conta
   fechando no JSON).
2. `tsc --noEmit`, `check-ui-standard.sh` nos .tsx tocados, `check-xss-sinks.sh`.
3. Prova da trava no banco, em transação desfeita (item 2).
4. Navegador com a conta de leitura, escritas bloqueadas (itens 3 e 4). Escrita real só numa
   conta combinada.
