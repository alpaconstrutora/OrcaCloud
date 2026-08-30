# Dívidas — MVP 2, Fase 2a: Simulador, CET e comparação de propostas

> Continuação de `docs/planos/2026-08-29-gestao-dividas-financiamentos.md`
> (MVP 1, completo e verificado no navegador em 30/08). Aquele plano marcava o
> MVP 2 como fora de escopo; este cobre a primeira fatia dele.

## Pedido original

> Sessão: eec65ad5-08c5-4260-8056-ed9ed6cd9ac4 · 2026-08-30

```
vamos para o MVP2 e anote para voltarmos posteriormente ao mútuo intercompany e garantias
```

Contexto do mesmo pedido: o MVP 2 do PRD original lista simulador de propostas,
CET, cenários de CDI e IPCA, garantias, covenants, renegociações e
versionamento, concentração bancária, projeção de caixa, apropriação contábil e
rateio por obra. **Três desses já saíram junto com o MVP 1** — renegociação
versionada (F1b), concentração bancária e projeção de caixa (F1c).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-30 | Por onde começar o MVP 2? | **Simulador + CET primeiro** — o motor já existe inteiro; falta UI e uma forma de guardar propostas. |
| 2026-08-30 | Como modelar uma proposta de banco? | **Reusar `debt_contracts` com `status='EM_NEGOCIACAO'`** — ganha cronograma, CET e comparação de graça; aceitar é troca de status. Nada de tabela `debt_proposals` paralela. |
| 2026-08-30 | Como apurar covenants? | **Híbrido** — automático onde o sistema sabe calcular (Dívida líquida/EBITDA, DSCR, endividamento, liquidez), manual com evidência no resto. *(Fase 2b, ainda não implementado.)* |

## O que a investigação achou antes de qualquer código

**O motor já cobria quase tudo.** `utils/debtAmortization.ts` (F1a) tem
`buildSchedule` para os 7 sistemas, `cet()` sobre o fluxo real e
`calculateXIRR`. O simulador não precisou de fórmula nova — só de uma camada
que gira variantes e compara.

**🔴 A decisão de reusar `debt_contracts` quebrava os indicadores.**
`vw_debt_open_installments` (F1c) filtrava
`c.status NOT IN ('LIQUIDADO','CANCELADO')`. Com proposta vivendo como contrato,
**`EM_NEGOCIACAO` contaria como dívida**: o banco que você ainda está cotando
apareceria na "Dívida total", no "Serviço 12 meses" e no custo médio ponderado.
Achado ao conferir a view **antes** de escrever a tela.

## Plano

**1. `supabase/migrations/aplicar_20270915000007_debt_propostas.sql`**
- `debt_contracts` += `proposal_group` (agrupa propostas concorrentes para a
  mesma necessidade), `decided_at`, `decision_notes`.
- **Corrige `vw_debt_open_installments`**: exclui `EM_NEGOCIACAO`.
- `fn_debt_proposal_comparison(uuid)` com as métricas do PRD item 5. **Não elege
  vencedora de propósito** — o PRD manda pesar garantia, covenant, concentração
  e caixa, não só a taxa.
- `REVOKE ... FROM anon` **explícito** na função nova (a lição da `...000006`).
**Como sei que terminou:** ensaio com ROLLBACK no banco real; proposta com
cronograma não altera `fn_debt_position`; `anon` não executa a função.

**2. `utils/debtSimulator.ts`** — puro, sem banco. `simulate`,
`simulateVariants`, variantes prontas (SAC×Price, prazos, carências, entrada,
cenários de indexador), `serieConstante`, `compararRefinanciamento` e
`liquidoLiberado`.
**Como sei que terminou:** `__tests__/debtSimulator.test.ts` provando as
ordenações que a decisão de dinheiro depende (SAC paga menos juros mas aperta
mais o caixa; prazo maior barateia a parcela e encarece o total; carência custa;
custo de saída pode inverter um refinanciamento).

**3. `services/debtService.ts`** — `listProposals`, `compareProposals`,
`saveCet`, `acceptProposal` (aceita uma e **cancela as irmãs**, gravando o
motivo nas duas pontas).
**Como sei que terminou:** `tsc --noEmit` limpo; `acceptProposal` confere
`data.length` do UPDATE das irmãs.

**4. `components/debt/DebtSimulator.tsx`** — aba "Simulador". Parâmetros
persistidos, eixo de comparação, tabela lado a lado e curva da parcela.
**Como sei que terminou:** `check-ui-standard.sh` exit 0.

**5. `components/debt/DebtProposals.tsx`** — aba "Cotações". Comparação do
grupo, **coluna de concentração** mostrando quanto da dívida atual já está
naquele banco, e "Aceitar".
**Como sei que terminou:** `check-ui-standard.sh` exit 0; aceitar troca o status
e cancela as irmãs.

**6. `components/debt/DebtForm.tsx` + `DebtModule.tsx`** — prop `draft` para
criação pré-preenchida, separada de `contract`.
**Como sei que terminou:** criar proposta pelo botão da aba Cotações abre em
modo CRIAÇÃO (botão "Criar proposta"), não edição.

## Estado

- [x] 1 — `aplicar_20270915000007_debt_propostas.sql` — **APLICADA e conferida 30/08**
- [x] 2 — `utils/debtSimulator.ts` — 34 testes
- [x] 3 — `services/debtService.ts` (propostas) + `types/debt.ts`
- [x] 4 — `components/debt/DebtSimulator.tsx`
- [x] 5 — `components/debt/DebtProposals.tsx`
- [x] 6 — `draft` no `DebtForm` + 4 abas no `DebtModule`
- [x] 7 — passeio no navegador da F2a — **FEITO 30/08**, 3 defeitos achados e corrigidos

## O que a Fase 2a não fez — e o que veio depois

- **Garantias e covenants** → entregues na **Fase 2b** (abaixo).
- **UI de rateio** → entregue na **Fase 2c** (abaixo).
- **Apropriação contábil por competência** → ainda em aberto; precisa de uma
  decisão sua (ver "O que falta").
- **Mútuo intercompany e garantias na interface** — pendências herdadas do
  MVP 1, anotadas em memória a pedido do usuário.

---

## Fase 2b — Garantias e Covenants (2026-08-30)

### 🔴 A medição que decidiu o desenho dos covenants

O usuário escolheu apuração **híbrida**. Para saber o que cabe em "automático",
medi contra o banco real:

| | |
|---|---|
| Lançamentos no razão | 2.300 |
| Com `payment_account_id` | **1** |
| `payment_accounts` com `opening_balance` | **0** (de 4) |

Ou seja: **não há saldo de caixa derivável**. Isso tira "Dívida LÍQUIDA/EBITDA"
— o covenant mais cobrado por banco — do automático, porque dívida líquida =
dívida bruta − caixa. O corte honesto ficou:

- **AUTOMÁTICO** — dívida BRUTA/EBITDA, DSCR, limite de endividamento e
  garantias com avaliação vencida. Tudo sai de `fn_debt_position` +
  `fn_dre_summary`.
- **SEMIAUTOMÁTICO** — dívida LÍQUIDA/EBITDA: o sistema calcula assim que o
  usuário informar o caixa do período. Sem o caixa, devolve **NAO_APURADO**, não
  um número inventado.
- **MANUAL** — o resto, com evidência e responsável.

### Itens

**8. `aplicar_20270915000008_debt_covenants.sql`** — `debt_covenants`,
`debt_covenant_measurements`, `fn_debt_covenant_evaluate` e
`vw_debt_guarantee_conflicts` (mesmo bem em duas operações vivas, PRD item 8).
`comparator` distingue TETO de PISO — covenant invertido acusa violação onde
está regular e cala onde estourou.
**Como sei que terminou:** ensaio com ROLLBACK provando as **três faixas** com
dívida real de R$ 100.000 — teto 1.000.000 → REGULAR (margem 90%); teto 110.000
→ **ATENÇÃO** (9,09%); teto 90.000 → **VIOLADO** (−11,11%). E DSCR sem serviço
de dívida → NAO_APURADO, sem inventar.

**9. `services/contractGuaranteeService.ts`** — `listByDebt`, `saveForDebt`,
`listAssetConflicts`. Os métodos entraram no serviço **existente**, não num
novo: a tabela é uma só, e o que separa OBRA/LOCACAO/DIVIDA é o `scope`, nunca
o arquivo — regra que o próprio comentário do serviço já documentava.

**10. `services/debtCovenantService.ts`** — CRUD, `evaluate` (apura **sem
gravar**) e `saveMeasurement` (upsert por covenant+data).

**11. `types/contracts.ts`** — `GuaranteeScope` += `'DIVIDA'`, 12 modalidades de
garantia real, `contract_id` nullable e os campos de LTV/avaliação/bem.

**12. `components/debt/DebtGuarantees.tsx`** — aba Garantias do contrato, com
LTV da operação, alerta de LTV > 100% e de bem já comprometido em outra
operação.

**13. `components/debt/DebtCovenants.tsx`** — aba Covenants do módulo, com KPIs
de violados/atenção/não apurados e o campo de caixa quando algum covenant
precisa dele.

---

## Fase 2c — UI de rateio (2026-08-30)

**14. `components/debt/DebtAllocations.tsx`** — substitui a aba Rateio, que era
só leitura. Editor com seletor real para Empresa, Obra, Empreendimento, Centro
de Custo e Bem, saldo atribuído em reais por destino, e o salvar travado
enquanto a soma não fecha 100%.

**Recorte declarado:** `PROPERTY`, `UNIT` e `BANK_ACCOUNT` existem no CHECK do
banco mas **não têm seletor** — sem lista para escolher, o usuário teria de
colar um uuid à mão, e rateio apontando para lugar nenhum é pior que rateio
nenhum.

Isso fecha o buraco que o passeio do MVP 1 expôs: sem cadastro de rateio,
`vw_debt_by_target` ficava vazia e "dívida por obra" nunca tinha número.

### Registro — Fases 2b e 2c

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erros |
| `npx vitest run` | ✅ **1921 testes**, nada quebrado |
| `check-ui-standard.sh` nos 6 componentes tocados | ✅ exit 0 |
| Ensaio da `...000008` com ROLLBACK | ✅ 3 faixas provadas; `anon`=f / `authenticated`=t |

### Migration aplicada e passeio das Fases 2b/2c no navegador (2026-08-30)

| Conferência no banco | Resultado |
|---|---|
| `debt_covenants` · `debt_covenant_measurements` com RLS | ✅ |
| Grants a `anon` nas tabelas | ✅ **0** |
| `fn_debt_covenant_evaluate` — anon / authenticated | ✅ **false** / true |
| `vw_debt_guarantee_conflicts` | ✅ `{security_invoker=on}` |

Contrato de teste: SAC de R$ 500.000, 1% a.m., 50 parcelas.
**Zero falhas de console e rede no fluxo inteiro.**

#### 2c — Rateio

| Passo | Resultado |
|---|---|
| Aba vazia | ✅ empty state |
| Obra a 60% | ✅ **salvar bloqueado**, com aviso de quanto falta |
| + Centro de Custo a 40% | ✅ salvar liberado |
| Salvar | ✅ "Rateio salvo em 2 destino(s)" |

#### 2b — Garantias

| Passo | Resultado |
|---|---|
| Hipoteca, R$ 800.000 de mercado / R$ 600.000 aceito | ✅ **LTV 83,3%** (500.000 ÷ 600.000, exato) |
| Baixar o aceito para R$ 300.000 | ✅ alerta **"o saldo devedor supera o valor aceito"** (LTV 166,7%) |

#### 2b — Covenants, as três faixas contra dívida real de R$ 500.000

| Covenant | Meta | Apurado | Margem | Situação |
|---|---|---|---|---|
| Teto de endividamento | ≤ 1.000.000 | 500.000 | **50%** | Regular |
| Endividamento apertado | ≤ 520.000 | 500.000 | **3,9%** | **Atenção** |
| Endividamento estourado | ≤ 400.000 | 500.000 | **−25%** | **Violado** |
| Dívida líquida/EBITDA | ≤ 3 | — | — | **Não apurado** |

As três margens conferem à mão. E o quarto é o ponto: **"Precisa do caixa" →
"Não apurado"**, com o aviso explicando por quê — em vez de um número inventado.
KPIs: 4 ativos, 1 violado, 1 em atenção, 1 não apurado.

O pipeline completo funciona: contrato → cronograma → `fn_debt_position` →
covenant apurado e gravado.

#### Limpeza

Em transação com conferência dentro; resíduo reconferido: contratos,
cronogramas, parcelas, rateios, eventos, covenants, apurações e garantias de
dívida = **0**. A garantia de OBRA pré-existente ficou **intacta** — prova de
que a generalização por `scope` não vazou entre famílias.

**Fases 2b e 2c completas e verificadas no navegador.**

---

## Fase 2d — Apropriação por competência, com as 5 convenções (2026-08-30)

Decisão do usuário: *"implemente todas as opções e o usuário escolhe"*.

**15. `utils/debtAccrual.ts`** — `BUS/252` (dias úteis, padrão CDI/Selic,
reusando `brazilianHolidays.ts`), `ACT/365`, `ACT/360`, `ACT/ACT` e `30/360`.
`accrueAt` (juros incorridos e não vencidos numa data) e `accrualByCompetence`
(rateio mês a mês).
**Como sei que terminou:** 25 testes, com dois que são o ponto — a convenção
**muda o número**, e a apropriação **conserva o total** contra o cronograma.

**16. `aplicar_20270915000009_debt_daycount.sql`** — coluna
`day_count_convention`, **nullable e sem default**: um default silencioso
decidiria por conta própria um número que vai para a contabilidade.

**17. `components/debt/DebtAccrual.tsx`** — aba "Competência" no detalhe.

### 🔴 Três defeitos meus, achados no passeio

**1. Eu quebrei o módulo inteiro.** Acrescentei `day_count_convention` ao
`.select()` do serviço **antes** de a migration existir → `42703: column ... does
not exist`, e como é o select da lista, a tela toda parou. A ordem certa é
migration primeiro, código depois. Custou uma rodada de passeio.

**2. Escolher a convenção não atualizava a tela.** `onChanged` do `DebtDetail`
atualizava a lista de contratos mas **não o `detalhe`** — que é justamente o que
vira o prop `contract`. Gravava no banco e a tela continuava pedindo para
escolher. É a mesma família do bug da aba Cotações: estado do filho que o pai
não ressincroniza.

**3. O mútuo aceitava só uma ponta.** Sem a empresa devedora, a perna CREDORA
nasceria sem contraparte e morreria no CHECK — depois de a devedora já ter sido
criada. Agora a validação pede as duas, em português.

### O passeio, com os números

Contrato SAC de R$ 120.000 a 1% a.m., 12 parcelas, liberado em 10/09/2026,
1º vencimento 10/10/2026. Fechamento em **25/09/2026** (metade do 1º período):

| Convenção | Dias | Fração | Juros incorridos | Set/26 |
|---|---|---|---|---|
| ACT/365 | 15 de 30 | 50% | R$ 600,00 | R$ 840,00 |
| ACT/360 | 15 de 30 | 50% | R$ 600,00 | R$ 840,00 |
| ACT/ACT | 15 de 30 | 50% | R$ 600,00 | R$ 840,00 |
| 30/360 | 15 de 30 | 50% | R$ 600,00 | R$ 840,00 |
| **BUS/252** | **11 de 21** | **52,4%** | **R$ 628,57** | **R$ 857,14** |

**Por que quatro coincidem — e isso NÃO é defeito:** dentro de um mesmo período
o rateio é `dias decorridos ÷ dias do período`, e a base anual **cancela na
divisão**. ACT/365 e ACT/360 só divergem ao converter para taxa ao ano; 30/360
diverge em mês irregular (fevereiro, meses de 31 dias); DU/252 diverge sempre,
porque conta outro conjunto de dias. A tela passou a dizer isso — sem a nota, o
seletor parece quebrado.

Set/26 = R$ 840,00 confere: o período 10/09→10/10 tem 21 de 30 dias em setembro
(70% de R$ 1.200). Em DU/252, 15 de 21 dias úteis → R$ 857,14.

---

---

## Pendência do MVP 1 · Mútuo intercompany exercitado (2026-08-30)

Com autorização do usuário, criei uma segunda empresa de teste na organização
(`SPE Teste Mútuo (apagar)`) — mútuo entre empresas do grupo exige duas pontas,
e a organização tinha uma só.

### O que funcionou

| Verificação | Resultado |
|---|---|
| "Parte relacionada" troca o campo de instituição pelo de empresa do grupo | ✅ |
| Criar mútuo sem a empresa devedora | ✅ barrado com mensagem em português |
| Criar mútuo válido | ✅ **2 contratos** numa tacada |
| Marcação na lista | ✅ "mútuo — perna devedora" e "espelho — crédito a receber, fora da dívida" |
| Rodapé | ✅ avisa quantos espelhos há |
| KPI "Operações ativas" | ✅ **1**, com 2 linhas na lista |
| Espelhos ligados nos DOIS sentidos (no banco) | ✅ 2 |
| `vw_debt_open_installments` | ✅ 10 parcelas — só a devedora |
| `fn_debt_position` | ✅ **R$ 100.000 / 1 contrato** — não conta duas vezes |

### 🔴 Dois defeitos que SÓ um mútuo revelaria

**A. `fn_debt_concentration` quebrava inteira: `22P02: invalid input syntax for
type uuid: "SEM_INSTITUICAO"`.**

A versão da `...000004` usava sentinela de texto como chave e convertia para
uuid no JOIN, com um guarda `AND a.k <> 'SEM_INSTITUICAO'`. **O Postgres não
garante a ordem de avaliação das condições de um JOIN** — o cast rodava antes do
guarda. Só aparece quando existe contrato sem instituição financeira, isto é,
num mútuo. Passou por todos os passeios anteriores porque nenhum tinha um.

Corrigido em `aplicar_20270915000010`: a chave de agrupamento continua texto, e
a de JOIN virou coluna uuid separada — **o cast deixou de existir**. A sentinela
ganhou rótulo legível ("Sem instituição (mútuo / parte relacionada)").

**B. 🔴 Uma consulta que falha mostrava R$ 0,00 — não um erro.**

O `DebtDashboard` carregava os quatro painéis num `Promise.all`. Com a
concentração estourando, o conjunto rejeitava, `posicao` ficava no default
zerado e a tela exibia **"Dívida total R$ 0,00" tendo R$ 100.000 de dívida
real**. Zero que parece dado é pior que erro — é a mesma família do casamento
vazio silencioso já registrado no projeto.

Corrigido: `Promise.allSettled` (um painel que falha não derruba os outros), os
KPIs mostram **"—" e "não apurado"** quando a apuração falhou, e o estado vazio
distingue "nenhuma dívida" de "não foi possível apurar", dizendo com todas as
letras que *os números não são zero, são desconhecidos*.

**Conferido no banco após a correção**, contra o mútuo real: as 5 dimensões de
concentração rodam, a soma fecha 100% e `anon` continua sem executar.

### Correção aplicada e conferida na tela (2026-08-30)

`aplicar_20270915000010` aplicada. Conferido no banco, contra o mútuo real: as
5 dimensões de concentração rodam, `anon` segue sem executar, e a instituição
ausente aparece como "Sem instituição (mútuo / parte relacionada)".

E na tela — que era onde o R$ 0,00 aparecia:

| | |
|---|---|
| `DÍVIDA TOTAL` | **R$ 100.000,00 / 1 operação** |
| `CURTO PRAZO` | R$ 100.000,00 (as 10 parcelas cabem em 12 meses) |
| `SERVIÇO 12 MESES` | **R$ 105.500,00** |
| Curva e concentração | ✅ renderizam |
| Banner de erro · KPIs em "—" | ✅ ausentes |
| Falhas de console e rede | ✅ **0** |

R$ 105.500,00 confere à mão: 10 amortizações de R$ 10.000 mais 1% sobre a soma
dos saldos (100k + 90k + … + 10k = 550k) = R$ 5.500.

## O que falta
- **`PROPERTY`, `UNIT` e `BANK_ACCOUNT` no rateio** — sem seletor, por decisão
  declarada na Fase 2c.


## Registro de execução

### 2026-08-30 · Fase 2a

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erros |
| `npx vitest run` (suíte completa) | ✅ **1921 testes**, nada quebrado |
| `__tests__/debtSimulator.test.ts` | ✅ 34 testes |
| `check-ui-standard.sh` nos 4 componentes | ✅ exit 0 |
| `migrationsPrefixo.test.ts` | ✅ sem colisão |
| Ensaio da migration no banco real (ROLLBACK) | ✅ compila; `anon`=f / `authenticated`=t; comparação sem proposta devolve 0 |

**Um defeito meu, achado e corrigido antes de rodar:** liguei o botão "Nova
proposta" passando um rascunho pelo prop `contract`. Como `DebtForm` decide o
modo por `Boolean(contract)`, o formulário entraria em **edição** e
`salvar()` chamaria `updateContract(undefined)` — `.eq('id', undefined)`. Criei
o prop `draft`, separado, para criação pré-preenchida.

**Uma asserção minha estava errada, não o motor:** o teste exigia parcela Price
exatamente constante e falhou por R$ 0,43 na última. É o desenho documentado —
a última absorve o resíduo de arredondamento para o saldo fechar em zero, o
mesmo que o navegador mostrou no SAC de 120× em 30/08 (R$ 1.052,81 contra
R$ 1.052,63). Corrigi o teste para afirmar o comportamento real: constante
exceto a última, que difere em menos de R$ 1, e saldo final 0.

⛔ **A migration `...000007` NÃO foi aplicada.** Sem ela a aba Cotações não
funciona (faltam as colunas e a RPC) e — mais grave — **proposta contaria como
dívida** nos indicadores.

## Verificação de ponta a ponta (depois de aplicar a migration)

1. Aba **Simulador**: girar SAC × Price com R$ 100.000 a 1% em 60×; conferir que
   SAC paga menos juros e tem primeira parcela maior. Pôr R$ 2.000 de IOF e ver
   o CET subir sem o cronograma mudar.
2. Aba **Cotações**: criar 2–3 propostas do mesmo grupo em bancos diferentes,
   gerar o cronograma de cada uma, comparar.
3. 🔴 **Conferir que proposta não é dívida**: com as propostas cadastradas, a aba
   "Posição consolidada" tem de continuar mostrando a dívida REAL, sem elas.
4. Aceitar uma: ela vira CONTRATADO, as irmãs vão a CANCELADO com o motivo, e só
   então a "Dívida total" sobe.
5. Rodar nos três contextos de organização (REGRA #5).
6. Limpar o dado de teste e conferir o resíduo.

### 2026-08-30 · Migration aplicada e passeio da F2a no navegador

| Conferência no banco | Resultado |
|---|---|
| `proposal_group`, `decided_at`, `decision_notes` | ✅ presentes |
| `vw_debt_open_installments` exclui `EM_NEGOCIACAO` | ✅ |
| Colunas da view · `security_invoker` | ✅ 24 · `{security_invoker=on}` |
| `fn_debt_proposal_comparison` — anon / authenticated | ✅ **false** / true |

#### Três defeitos meus, achados no passeio

**1. Criar proposta não atualizava a aba Cotações.** O formulário é do pai
(`DebtModule`), mas `DebtProposals` tem lista própria e só carregava na
montagem — a tela ficava no empty state como se a criação tivesse falhado.
Corrigido com um `reloadKey` que o pai incrementa a cada gravação.

**2. A coluna CET vinha vazia ("—") nas duas propostas.** Eu escrevi `saveCet`
e **nunca o chamei**. A comparação ordena por `cet_annual NULLS LAST`, então
caía silenciosamente para o total pago — e o CET é a métrica-título da tela.
Corrigido: `generateSchedule` calcula e grava o CET, que é o único momento em
que existe cronograma para calcular sobre.

**3. 🔴 O CET saiu ERRADO na primeira correção — e o número denunciou.**
Uma proposta a 1% a.m. **sem custo nenhum** apareceu como **13,19% a.a.**,
quando 1% a.m. é 12,68% a.a. por definição. Causa: sem data de liberação
preenchida, o fallback era o **primeiro vencimento** — equivale a dizer que o
dinheiro entrou no mesmo dia da primeira parcela, o que comprime o prazo e
infla o CET. Corrigido para um período antes do 1º vencimento (mesma convenção
do `debtSimulator`). Depois: **12,67%**.

#### O passeio, passo a passo

| Passo | Resultado |
|---|---|
| Simulador SAC × Price | ✅ tabela, curva e o aviso "o menor CET não decide sozinho" |
| CET a 1% a.m. | ✅ **12,68% a.a.** |
| R$ 2.000 de IOF | ✅ CET sobe para **13,77% / 13,68%** sem o cronograma mudar |
| Eixo "carências alternativas" | ✅ renderiza |
| Criar 2 propostas no mesmo grupo + gerar cronogramas | ✅ |
| 🔴 **Proposta não é dívida** | ✅ **`DÍVIDA TOTAL R$ 0,00 / 0 operação(ões)`** com as duas propostas cadastradas E com cronograma |
| Comparação | ✅ CET 12,15% (0,85% + R$ 6k IOF) × 12,67% (1% sem custo); coluna Concentração; aviso do verde |
| Aceitar | ✅ "Proposta de Edson aceita. **1 recusada(s)**" |
| 🔴 **Só então vira dívida** | ✅ **R$ 200.000,00 / 1 operação**; serviço 12m R$ 42.691,20 (10 × R$ 4.269,12, exato); custo médio 0,9% a.m. |
| Falhas de console/rede no fluxo inteiro | ✅ **0** |

#### Limpeza

Em transação com conferência dentro; resíduo reconferido depois:
`debt_contracts`, `debt_schedules`, `debt_installments`, `debt_events` e razão
`DEBT_INSTALLMENT` = **0**. O seed de 7 `debt_component_accounts` ficou.

**Fase 2a completa e verificada no navegador.**
