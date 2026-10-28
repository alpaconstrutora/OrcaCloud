# Conciliação Bancária › aba Dashboard — confiança nos números e o resto da crítica

## Pedido original

> /impeccable critique: financeiro > Conciliação Bancária > aba dashboard

Sessão `b2f16f10-ee9c-4bcb-8732-9dc7c18dfc92` · 28/10/2026, manhã.

Depois da crítica (15/40), respostas do usuário às perguntas do relatório:

> Por onde começamos na aba Dashboard da Conciliação? → **Confiança nos números (Recomendado)**
> Quanto disso entra nesta rodada? → **Tudo, inclusive menores**
> Na tela, quer o saldo que o próprio banco informa no extrato ao lado do saldo calculado,
> como resposta direta para 'bate?' → **Sim, ao lado do calculado**

E sobre a ordem dos passos do plano de ação:

> uma de cada vez

Crítica gravada em `.impeccable/critique/2026-10-28T13-29-50Z__components-reconciliationdashboard-tsx.md`
(na frente de leitura `critica-conciliacao-dashboard`).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 28/10/2026 | Prioridade | Confiança nos números (os dois P0) primeiro |
| 28/10/2026 | Escopo | Tudo, inclusive observações menores |
| 28/10/2026 | Saldo informado pelo banco ao lado do calculado | Sim |
| 28/10/2026 | Ritmo | Um passo de cada vez (um PR por passo) |
| 28/10/2026 | Passo 2: conta sem saldo informado pelo banco (Sicredi ×2; Itaú só em OFX) — digitar à mão? | **Sim, à mão com data** (o automático continua valendo; o mais recente vence) |
| 28/10/2026 | Passo 2: banco ≠ calculado — oferecer saldo inicial que fecha? | **Sim, sugere e confirma** (antes → depois; nunca automático) |
| 28/10/2026 | Passo 2: tarifas levam para onde? | **Pendentes, já filtrado**, com "Criar regra" ao lado |
| 28/10/2026 | Passo 2: o Itaú tem extrato de 02/01/2014 a 31/08/2026 com saldo inicial 0 (não é extrato em dobro: 67 linhas repetidas, R$ 11.416,35); "ajustar o valor" daria −R$ 10.889.235,39 em 2014. O que o "Ajustar" oferece? | **As duas, com o impacto**: (a) manter a data e ajustar o valor; (b) recomeçar no saldo do banco a partir do dia seguinte — cada uma com saldo inicial, data e quantos pendentes deixam de contar |

## O que a crítica comprovou (no código e no banco, não só no relatório dos agentes)

1. **A fileira de KPIs de cima mente no rótulo.** Na aba Dashboard, `loadTransactions`
   cai no `else` e carrega só extrato `MATCHED` (`BankReconciliation.tsx`, `buildBankQuery`);
   "Pendentes" = `bankTransactions.length` = quantidade de **conciliados** da conta do
   seletor. Visto em produção: "Pendentes 0" com 7.516 pendentes no Itaú na tabela abaixo.
2. **"Conciliado" muda de valor entre as tabelas por conta e por empresa.**
   `fn_reconciliation_dashboard` conta `TRANSFER` como conciliado desde
   `aplicar_20270919000016_bank_tx_transfer.sql` — cujo comentário diz *"Dashboard e
   consolidado: TRANSFER conta no saldo"* —, mas só o dashboard foi redefinido ali;
   `fn_reconciliation_consolidated` ficou com `('MATCHED','CONFIRMED','LOCKED')`
   (conferido com `pg_get_functiondef` em 28/10). Transferência entre contas próprias
   soma num lado e não no outro; no total do grupo elas quase se anulam (R$ 76.740,48 ×
   R$ 76.840,48), mas por linha a Diferença chega a trocar de sinal.
3. **Editar o saldo inicial grava dado errado.** `parseFloat(texto.replace(',', '.'))`
   lê "1.234,56" como 1,234; `setEditDate('')` + `editDate || null` grava
   `opening_balance_date = null` a cada salvamento (o cálculo passa a puxar o extrato
   inteiro); sem confirmação.
4. Enquanto carrega, ou se a carga falha, a tela mostra R$ 0,00 como dado real e
   "Pendente" verde.

## Plano

Um passo por PR, na ordem do plano de ação aprovado.

### Passo 1 — `/impeccable harden`: os dois P0 + estados de carga

| # | O que muda | Como sei que terminou |
|---|---|---|
| 1.1 | Sai a fileira `KpiCardCompact` (Pendentes/Automação/Regras ativas/Atenção) da aba Dashboard em `BankReconciliation.tsx`. Os KPIs da aba passam a ser só os do `ReconciliationDashboard` | Aba Dashboard sem os 4 cards compactos; demais abas não tinham a fileira (`activeView === 'dashboard'` era a única condição) |
| 1.2 | Migration nova: `fn_bank_tx_conciliado(status)` e `fn_bank_tx_pendente(status)` (fonte única dos dois conjuntos), e `fn_reconciliation_dashboard` + `fn_reconciliation_consolidated` reescritas usando as duas. O dashboard passa a devolver `opening_balance_date` por conta | `pg_get_functiondef` das duas funções sem lista literal de status; consulta de conferência: soma de `reconciled_balance` por conta = soma por empresa, para cada org e para "Todas" |
| 1.3 | Trava de regressão: teste que lê a migration e exige que as duas funções usem o helper (nenhuma lista literal de status de extrato no corpo) | `npx vitest run __tests__/conciliacaoStatusUnico.test.ts` verde; falha se alguém reescrever uma das funções com a lista à mão |
| 1.4 | Edição do saldo inicial: campo de valor em reais (`MoneyCentsInput` com opção de sinal negativo — saldo pode ser negativo), data de início preenchida com a atual, confirmação (`useConfirm`, `warning`) mostrando antes → depois, Enter salva, Esc cancela, foco volta ao botão da linha, rótulos acessíveis com o nome da conta | Teste de componente: digitar 123456 → confirmação com "R$ 1.234,56", serviço chamado com 1234.56 e a data ORIGINAL; Esc não grava; valor negativo aceito |
| 1.5 | Estados: esqueleto enquanto carrega pela 1ª vez (sem números), cartão de erro com "Tentar de novo" se falhar, e o tom de "Pendente" só calculado com dado | Teste de componente: serviço rejeita → aparece "Tentar de novo" e nenhum "R$ 0,00"; clicar tenta de novo |

### Passo 2 — `/impeccable shape`: saldo do banco ao lado do calculado e ação em cada número

**O que já existe (medido em 28/10):** `bank_statement_imports.ledger_balance/_date` (saldo de
fechamento do OFX) e `payment_account_gateway.saldo/saldo_em` (API do Asaas). Nenhuma tela mostra.

| Conta | Banco informa | App calcula hoje |
|---|---|---|
| Banco Itaú | −R$ 39.048,13 em 14/09/2026 (OFX; 24 de 98 importações têm saldo) | R$ 10.850.187,26 |
| Asaas | R$ 138,35 (API, 28/10) | R$ 138,35 |
| Sicredi, Sicredi - Garden | — (nenhuma importação registrada) | −R$ 41.405,70 / R$ 9.070,63 |

| # | O que muda | Como sei que terminou |
|---|---|---|
| 2.1 | Tabela nova de saldo informado à mão (conta, data, valor, quem, quando; RLS pela org da conta; RPC nova com REVOKE). `fn_reconciliation_dashboard` devolve por conta o **último saldo informado com data ≤ "Posição em"** — origem OFX, Asaas ou à mão, o mais recente vence — e o **calculado naquela mesma data** (saldo inicial + extrato até ela) | Consulta: Itaú devolve −39.048,13 em 14/09 (OFX) e o calculado em 14/09; Asaas 138,35 (Asaas); Sicredi nulo; `conciliacaoStatusUnico.test` continua verde |
| 2.2 | Coluna "Saldo no banco" na tabela por conta: valor + "em dd/mm · OFX/Asaas/informado" e o estado *bate* / *fora R$ X* / *o banco não informou*. Sem saldo: "Informar saldo do extrato" (valor + data) | Teste de componente dos três estados; na tela, Itaú "fora", Asaas "bate", Sicredi "Informar" |
| 2.3 | Resposta direta acima da tabela: "N de M contas batem com o banco" com as que não batem nomeadas | Teste: contagem com os três estados |
| 2.4 | "Ajustar" abre uma gaveta com duas opções e o impacto de cada uma: **(a) manter a data** — saldo inicial + (banco − calculado na data); **(b) recomeçar no saldo do banco** — saldo inicial = saldo do banco, a partir do dia seguinte, dizendo quantos pendentes deixam de contar. Aviso de que extrato em dobro ou período faltando também abrem diferença (link para Anomalias). Grava só ao confirmar | Teste: as duas sugestões calculadas; grava a escolhida, com a data certa |
| 2.5 | Ação em cada número que preocupa (link azul com seta, guia §4.5): Pendente → Central da conta com mais pendentes (nomeada); Divergência → aba Divergências; Sem classificação → Pendentes da conta com mais; Tarifas → Pendentes buscando os termos de tarifa + "Criar regra"; linha da conta → "Conciliar" (Pendentes da conta). Número que não preocupa não ganha ação | Teste: cada ação chama a navegação com aba + conta (+ busca); sem pendência, sem link |

**Fora do passo 2 (achado ao detalhar):** "Sem empresa" não ganha link — nenhuma tela edita
`payment_accounts.empresa_id` (Minha Organização › Contas de Pagamento não tem o campo).
### Passo 3 — `/impeccable distill`: na aba Dashboard, só "Posição em" e "Importar extrato"

| # | O que muda | Como sei que terminou |
|---|---|---|
| 3.1 | Na aba Dashboard, a barra de escopo mostra só "Posição em" (com rótulo ligado ao campo) + Atualizar à esquerda e "Importar extrato" à direita; conta, competência e Início/Fim saem (não chegavam ao dashboard). As outras abas não mudam | Na tela: barra do Dashboard com 3 controles; Extrato/Pendentes iguais a antes |
| 3.2 | Sai a linha "Saldo Bancário vs. Contábil · Posição em · Atualizar" de dentro do conteúdo (era o mesmo controle em segundo lugar); o dashboard recebe `asOf`/`recarga`/`onCarregando` | Teste: trocar a data e clicar Atualizar recarregam; o componente não tem controle de data próprio |
| 3.3 | "Posição em" abre em hoje no fuso local (`hojeLocal`); antes `toISOString()` virava o dia seguinte depois das 21h. Não aceita data futura | Na tela: campo com `max` = hoje |
| 3.4 | A aba Dashboard deixa de carregar o extrato `MATCHED` da conta do seletor e as contagens de `loadStats` (serviam só à fileira removida em 1.1) | Rede: abrir a Conciliação no Dashboard não pede `bank_transactions` |
### Passo 4 — `/impeccable clarify`: rótulos (Pendente bruto, legenda do Contábil, alerta de divergência, plurais, "Grupo", subtítulo)

| # | O que muda | Como sei que terminou |
|---|---|---|
| 4.1 | Subtítulo: "Se o saldo de cada conta bate com o banco, e o que falta conciliar." (falava de automação) | Na tela |
| 4.2 | KPIs: "Saldo pelo extrato" (era "Saldo Bancário (Real)" — não é o saldo do banco); "Saldo conciliado"; **"A conciliar" = valor BRUTO + quantidade** (era a diferença líquida: +1.000 e −1.000 davam R$ 0,00 verde com "2 pendentes"); legenda do "Saldo contábil" corrigida para "lançamentos baixados no sistema, de qualquer origem" | Teste "A conciliar mostra o valor BRUTO" |
| 4.3 | Divergência num bloco só (`utils/conciliacaoTextos.textoDaDivergencia`): diz o lado ("o sistema tem R$ X a mais…"); **âmbar "esperada por enquanto"** quando há baixados sem conferir, com quantos e o que fecha; **vermelho** só quando tudo foi conferido (vínculo faltando ou duplicado). Sai a faixa separada "N de M conferidos" | Testes de texto (4) e de tela (âmbar / vermelho) |
| 4.4 | Colunas "Diferença" → "A conciliar" (bruto) nas tabelas por conta e por empresa, com total; "Saldo Bancário" → "Saldo pelo extrato"; títulos "Por conta bancária", "Por empresa", "Caixa realizado por obra" | Na tela |
| 4.5 | Plurais de verdade (`plural`): pendentes, sem classificação, tarifas, empresas/contas; "Grupo" → "Total"; estado vazio diz onde cadastrar conta | Nenhum "(s)/(ões)/(is)" no componente |
### Passo 5 — `/impeccable layout`: `KpiCard destaque` com ação (§4.5) e hierarquia
### Passo 6 — `/impeccable audit`: rótulos de campo, foco, títulos, abas como abas, contraste, conciliado negativo, data local
### Passo 7 — `/impeccable polish`

(Os passos 2–7 ganham a tabela "o que muda / como sei que terminou" quando chegar a vez de cada um.)

## Estado

- [ ] Passo 1 — 5 de 5 no código e no banco; falta só a conferência visual em produção
  - [x] 1.1 fileira de KPIs compactos removida da aba Dashboard
  - [x] 1.2 migration `aplicar_20271028300000_conciliacao_status_unico.sql` — aplicada no
    banco remoto em 28/10/2026, com autorização do usuário ("sim"; a 1ª tentativa tinha
    sido barrada pelo modo automático). Conciliado por conta − por empresa, como
    desenvolvedor@: **antes** Todas −100,00 · Alpa Construtora −278.916,00 · Altair
    287.816,00 · Garden SPE −9.000,00; **depois** 0,00 em todas as linhas, e
    `contas_com_data` = `contas` (5 de 5). `pg_get_functiondef`: as duas funções usam o
    helper e não têm lista literal; ACL das 4 sem PUBLIC/anon.
  - [x] 1.3 trava `__tests__/conciliacaoStatusUnico.test.ts` (controle negativo: sem a
    migration reprova os 4 casos)
  - [x] 1.4 edição do saldo inicial (`MoneyCentsInput permitirNegativo`, data preservada,
    `useConfirm`, Enter/Esc, foco de volta, rótulos com o nome da conta). O front tolera a
    função antiga: sem `opening_balance_date` no retorno, não mexe na data.
  - [x] 1.5 esqueleto, erro com "Tentar de novo", aviso quando a tela ainda mostra outra data,
    guarda de resposta fora de ordem ao trocar "Posição em"
  - Testes: `__tests__/components/ReconciliationDashboard.test.tsx` (7; controle negativo com o
    componente antigo reprova os 7), `moneyCentsInput.test.ts` (+3). `tsc` limpo;
    `check-ui-standard.sh` sem violação nos 3 arquivos. Suíte: 12.105 ok, 2 falhas em
    `PainelVersoes.test.tsx` (Planta, não tocado) que passam 39/39 isolado.
  - Publicado no PR #219 (`7e0723ab`); produção conferida pelo bundle (`conferir-producao.sh`).
  - Conferência visual em produção (28/10, Chrome, "Todas"): fileira compacta sumiu; botões
    "Editar saldo inicial de <conta>"; digitar 123456 mostra "1.234,56" com foco no campo;
    Enter abre "Alterar o saldo inicial? · Banco Itaú · R$ 0,00 → R$ 1.234,56"; Cancelar não
    grava (saldo segue R$ 0,00); X devolve o foco ao lápis. Conciliado por empresa agora fecha
    com o por conta na tela ("Sem empresa" R$ 377.042,84 = Itaú + Asaas + Sandbox).
  - **Achado na conferência e corrigido (PR seguinte):** depois de Cancelar na confirmação o
    foco ia para o `<body>` e o Esc não saía mais da edição. Agora o foco volta ao campo (também
    quando salvar falha); teste "não confirmou" cobre (reprova com a versão anterior).
- [ ] Passo 2 — 5 de 5 no código; falta conferência visual em produção
  - [x] 2.1 migration `aplicar_20271028800000_conciliacao_saldo_do_banco.sql` — **aplicada pelo
    usuário** em 28/10 (o modo automático barrou a minha aplicação). Conferido como
    desenvolvedor@: Itaú −39.048,13 em 14/09 (OFX) × calculado 10.850.187,26, 0 pendentes depois;
    Asaas 138,35 (Asaas) × 138,35; Asaas Sandbox 56,03 × 0,00; Sicredi ×2 sem saldo do banco;
    tabela nova com RLS.
  - [x] 2.2 coluna "Saldo no banco" (bate / app calcula + Ajustar / Informar; "Atualizar" no digitado)
  - [x] 2.3 "N de M contas batem com o banco", com as contas de cada estado nomeadas
  - [x] 2.4 `AjustarSaldoInicialSheet` (recomeçar = padrão; manter a data; aviso + Anomalias)
  - [x] 2.5 ações: KPI Pendente → Central da conta com mais pendentes; Divergência → aba;
    Sem classificação e Tarifas → Pendentes com recorte (aviso azul + "Mostrar todos"); Criar regra
    → Central com a gaveta de Regras preenchida; linha → "Conciliar"
  - Testes: `conciliacaoSaldoBanco.test.ts` (9, inclui paridade da expressão de tarifas com o SQL),
    `ReconciliationDashboardSaldoBanco.test.tsx` (8), `conciliacaoStatusUnico.test.ts` (+1). `tsc`
    limpo; `check-ui-standard.sh` sem violação nos 5 arquivos tocados.
  - Publicado no PR #227 (`096a4ba`). Conferência em produção (28/10): resumo "1 de 5 contas
    batem com o banco (Asaas). Não batem: Asaas Sandbox, Banco Itaú. O banco não informou:
    Sicredi, Sicredi - Garden"; coluna e links como desenhados.
  - **Achado na conferência e corrigido (PR seguinte):** "Ver tarifas em Pendentes" abriu a aba
    com o extrato VAZIO — busca, filtros e competência guardados de uma visita anterior recortavam
    por cima do recorte (busca antiga + "Despesas" + 57 categorias + 2026). Agora chegar de um
    número do Dashboard limpa busca, filtros rápidos, filtro avançado e período, e o aviso diz isso.
    Sem teste de componente (`BankReconciliation.tsx` não tem montagem de teste); conferido em
    produção depois do merge.
- [x] Passo 3 — 4 de 4. PR #235 (`00120ea`). Conferido em produção (28/10): barra do Dashboard com
  "Posição em" (hoje, `max` = hoje, rótulo ligado) + Atualizar + Importar extrato; linha antiga
  sumiu; Extrato mantém conta e competência.
- [ ] Passo 4 — 5 de 5 no código; falta conferência em produção. Testes: `conciliacaoTextos.test.ts`
  (4) + 3 de tela.
- [ ] Passos 5 a 7

## Fora deste plano (observado na crítica, conferir antes de mexer)

- Conta "Asaas Sandbox" aparece no dashboard de produção.
- "Caixa Realizado por Obra" mostra Entradas R$ 0,00 em todas as obras.
- As 5 contas estão com saldo inicial zero.
- Na aba Dashboard, `loadTransactions` ainda busca o extrato `MATCHED` da conta do seletor
  (servia só à fileira removida em 1.1) — custo de rede sem uso; avaliar no passo 3.
- `stats` (`BankReconciliation.tsx`) ficou sem leitor depois de 1.1, mas `loadStats` é
  chamado em ~20 pontos (duas contagens por chamada). Remover é limpeza à parte.
