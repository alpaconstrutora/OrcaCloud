# Dívidas — emissão que dá zero em silêncio, e contrato histórico já quitado

> Frente: `divida-contrato-historico` (REGRA #8) · branch `feat/divida-contrato-historico`

## Pedido original

Sessão de 2026-09-09.

**Mensagem 1 (usuário):**

> financeiro < Dívidas e Financiamentos: emiti o contrato 5772. verifique.

**Mensagem 2 (usuário), respondendo às duas perguntas do diagnóstico** — (a) qual
das duas opções seguir, (b) se os R$ 57.000 ainda estão em aberto ou é contrato
histórico já quitado:

> Recomendo a 1, que já cobre a 2. Quer que eu siga por aí? Sim
>
> E confirme antes: os R$ 57.000 desse contrato realmente ainda estão em aberto
> desde 2021, ou é um contrato histórico que você cadastrou já quitado: contrato
> histórico que cadastrei e já quitado

A "opção 1" referida é, textualmente, o que foi oferecido na resposta anterior:

> **Corrigir a tela** — quando não houver parcela futura, oferecer emitir desde a
> primeira em aberto, e transformar o "0 títulos" em erro visível em vez de aviso
> neutro. Resolve para qualquer contrato retroativo, não só este.

---

## O que a verificação encontrou (2026-09-09, banco remoto)

Contrato **5772** — `debt_contracts.id = 2eff7025-7780-4eae-85bf-e12346c4c1f0`,
org `926cf626-…`, CAPITAL_GIRO, `CONTRATADO`, R$ 57.000,00, SAC, 0,41% a.m.,
44 parcelas, carência 5 meses sem capitalização.

**O cronograma está matematicamente correto** (versão 13, ativa):

| Conferido | Resultado |
|---|---|
| Σ amortização | 57.000,00 = principal ✓ |
| Amortização SAC | 1.461,54/mês constante ✓ |
| Juros da carência | 5 × 233,70 = 1.402,20, cobrados na parcela 6 ✓ |
| Juros da parcela 7 | 55.538,46 × 0,41% = 227,71 ✓ |
| Total | 62.842,50 |

**Nenhum título foi emitido.** `internal_transactions` com
`reference_id like 'debt-2eff7025…%'` → **0 linhas**. O `debt_events` registrado
diz literalmente `LIBERACAO — "0 título(s) emitido(s) no Contas a Pagar"`.

**Causa:** `debtFinanceService.syncInstallmentsToPayables` corta em `hoje` por
padrão (`services/debtFinanceService.ts:136-138`):

```ts
const corte = opts?.fromDate ?? new Date().toISOString().slice(0, 10);
const alvo = installments.filter(p => p.dueDate >= corte && p.status !== 'CANCELADA');
```

As 44 parcelas vencem entre **2021-07-26 e 2025-02-26** — todas antes de hoje
(09/09/2026). `alvo` ficou vazio. O corte existe de propósito (não reescrever
parcela paga nem período fechado), mas não distingue "não há futuro a atualizar"
de "o contrato inteiro é retroativo e nada foi lançado".

E a tela não avisou: `DebtDetail.tsx:170-174` monta `"0 título(s) no Contas a
Pagar…"` no mesmo `aviso` esverdeado do caminho de sucesso.

**Não é trava de período:** `financial_period_locks` dessa organização não tem
nenhum mês fechado (os três registros de 2026 foram reabertos; nada de
2021–2025). Emissão retroativa passaria pela trigger.

**Resposta do usuário sobre o caso concreto:** contrato **histórico, já quitado**.
Logo, para o 5772 o certo é **não** emitir os 44 títulos — é registrar a
quitação. Hoje `vw_debt_open_installments` devolve R$ 57.000,00 de saldo devedor
para um contrato que está pago.

### Achados laterais (registrados, fora do escopo desta frente)

- `first_due_date` (2021-07-26) é anterior a `signed_at` (2021-07-29).
- `final_due_date` está NULL embora o cronograma termine em 2025-02-26.
- 13 versões de cronograma, todas `kind='VIGENTE'` (só a v13 ativa). Duas
  inativas (v9 e v12) saíram com Σ amortização ≠ principal (67.948,09 e
  58.178,13) — a geração aceitou parâmetros que furam a invariante sem reclamar.
- `principal_released` = 57.000,00 sem nenhuma linha em `debt_disbursements`.
- Zero `debt_allocations` (sem rateio, título nasceria sem obra/centro de custo).

---

## Decisões de desenho

1. **Onde a decisão acontece: `Modal` central.** `UI_PATTERNS.md` §3 põe
   "Alertas / confirmações" em modal central, e §6.2 exige bloco de contexto
   antes de ação financeira crítica. Não dá para usar `useConfirm()` (§14 do guia
   de UI): ele é booleano e aqui existem **duas ações distintas** (emitir
   retroativo × registrar quitação) além de cancelar. Uso a primitiva `Modal`
   (`components/ui/modal.tsx`), que é justamente o que UI_PATTERNS §5.2 manda
   usar nesse caso — não markup de modal à mão.

2. **Quitação histórica não cria nem apaga título.** Marca as parcelas em aberto
   como `PAGA` (`paid_at = due_date`, `paid_amount = total`), o contrato como
   `LIQUIDADO`, e grava um evento `LIQUIDACAO`. Isso basta para limpar os
   indicadores: `vw_debt_open_installments` já filtra
   `installment_status NOT IN ('PAGA','CANCELADA')` e
   `contract_status NOT IN ('LIQUIDADO','CANCELADO','EM_NEGOCIACAO')`, e
   `DebtModule.tsx:169` já descarta `LIQUIDADO`/`CANCELADO` dos KPIs.
   **Não mexe em `internal_transactions`** — apagar título possivelmente
   conciliado seria pior que deixá-lo, e o texto do modal diz isso.

3. **O filtro de emissão vira função única.** Duplicar o `filter` na tela criaria
   drift com o service. Vira `parcelasEmitiveis(installments, fromDate)`,
   exportada e usada pelos dois.

---

## Itens

### 1. `services/debtFinanceService.ts`

**O que muda:**
- Exporta `parcelasEmitiveis(installments, fromDate)` — o filtro
  `dueDate >= corte && status !== 'CANCELADA'` num lugar só;
  `syncInstallmentsToPayables` passa a usá-lo.
- Novo `settleHistoricalContract(contract, installments, opts)`: marca parcelas
  em aberto como `PAGA`, contrato como `LIQUIDADO`, grava evento `LIQUIDACAO`
  com o total quitado. Devolve `{ parcelas, total }`.

**Como sei que terminou:** `npx vitest run __tests__/debtEmissao.test.ts` passa e
`npx tsc --noEmit` limpo.

### 2. `components/debt/DebtDetail.tsx`

**O que muda:**
- `emitirTitulos` calcula os emitíveis antes de chamar o service. Se não há
  nenhum e existem parcelas em aberto → abre o modal de decisão em vez de
  gravar. Se o service devolver 0 fora desse caso → `setErro` (vermelho), nunca
  o `aviso` verde.
- Modal de decisão com bloco de contexto (§6.2 do UI_PATTERNS: nº de parcelas,
  período, total, credor) e duas ações: "Emitir N títulos retroativos" e
  "Registrar contrato como quitado".
- Handlers `emitirRetroativo` (chama o sync com `fromDate` = vencimento da
  primeira parcela em aberto) e `registrarQuitacao`.

**Como sei que terminou:** `bash scripts/check-ui-standard.sh
components/debt/DebtDetail.tsx` sai 0; o modal usa a primitiva `Modal`; os
botões seguem §17 (compacto, `h-9`, `rounded-[6px]`, sentence case) e §6.1 do
UI_PATTERNS (verbo + objeto).

### 3. `__tests__/debtEmissao.test.ts` (novo)

**O que muda:** cobre o defeito que passou.
- Contrato inteiramente no passado → `parcelasEmitiveis` devolve `[]`
  (é o caso do 5772: reproduz o zero antes de corrigir).
- Com `fromDate` na primeira parcela → devolve as 44.
- Parcela `CANCELADA` fica de fora nos dois casos.
- Parcela exatamente no `corte` entra (o filtro é `>=`).

**Como sei que terminou:** `npx vitest run __tests__/debtEmissao.test.ts` verde,
e o 1º caso falha se o `>=` virar `>`.

### 4. Dado do contrato 5772

**O que muda:** nada por SQL sem combinar. `CLAUDE.md` do projeto autoriza
`db query --linked` para leitura/diagnóstico; escrita só combinada
explicitamente. O caminho preferido é o usuário clicar "Registrar contrato como
quitado" na tela publicada — o que também prova a correção de ponta a ponta.

**Como sei que terminou:** `vw_debt_open_installments` para
`2eff7025-7780-4eae-85bf-e12346c4c1f0` devolve 0 linhas e saldo 0.

---

## Estado

- [x] Item 1 — `debtFinanceService.ts`
- [x] Item 2 — `DebtDetail.tsx`
- [x] Item 3 — `__tests__/debtEmissao.test.ts`
- [ ] Item 4 — dado do 5772 (aguarda o usuário: clicar na tela, ou autorizar o SQL)
