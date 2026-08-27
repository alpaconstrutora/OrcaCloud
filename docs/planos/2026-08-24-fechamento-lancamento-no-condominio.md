# Lançamento no condomínio — Fechamento por Centro de Custo

## Pedido original

Sessão de 24/08/2026, transcrito literalmente:

```
financeiro < contas a pagar < Fechamento por Centro de Custo:
1. criar botao de lançamento
2. quando o filtro de centro de custo filtrar grupo condominio, o botão de lançamento
   lança os itens em comercial < condominios < aba financeiro
3. criar checkbox para selecionar os itens que serão lançados pelo botao lançamento
```

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 24/08/2026 | O que o botão grava no condomínio? | **Rateio RASCUNHO** com exatamente os títulos marcados, reusando `condominioRateioService` |
| 24/08/2026 | Onde ficam os checkboxes? | **Nos títulos**, dentro da linha expandida — é a granularidade que o condomínio consome (cada despesa é um `internal_transaction`) |
| 24/08/2026 | Como o filtro "filtra grupo condomínio"? | **Grupos entram no mesmo dropdown** de Centro de Custo, numa seção acima dos centros de custo |

## O problema que isso resolve

- **Financeiro › Contas a Pagar › Fechamento por CC**
  (`components/financeiro/FechamentoCentroCusto.tsx`) consolida os títulos da
  competência por Centro de Custo, uma linha por CC. Não havia seleção nem ação além
  de fechar/reabrir o mês.
- **Comercial › Condomínios › Financeiro** (`components/condominio/FinanceiroTab.tsx`)
  só faz rateio, e as despesas entravam sozinhas: `previa()` varria
  `internal_transactions` por `cost_center_id` + `direction='DEBIT'` +
  `transaction_date` dentro da competência — tudo ou nada.

Quem paga as contas está no Fechamento, olhando título a título — falta o gesto:
marcar e mandar para o condomínio certo.

### O fato que evitou migration

`vw_payables.id` é `internal_transactions.id` (view 1:1, sem join que multiplique —
`aplicar_20270905000007_vw_payables_supplier_id.sql`). O `Payable.id` marcado na tela
já é o `transaction_id` que `condominio_rateio_despesas` exige. E a âncora do
condomínio (`cost_centers_v2.empreendimento_id`, UNIQUE parcial) já existia desde
`aplicar_20270905000024_condominio_rateio.sql`.

### O que "lançar" faz — e o que não faz

Não escreve em `internal_transactions`. Cria um `condominio_rateios` em
`RASCUNHO` com as cotas e o rastro das despesas marcadas — reuso total do fluxo
"Novo rateio" já existente na aba do condomínio (calcular → conferir → salvar). Por
isso funciona mesmo com a competência já fechada no Contas a Pagar: a trigger
`fn_payable_bloqueia_competencia_fechada` só olha escrita em `internal_transactions`.

## Plano

### 1. `types/financial.ts` (editado)

`CostCenter` ganhou `parent_id`, `parent_name`, `empreendimento_id` opcionais;
`CostCenterV2` ganhou `empreendimento_id` (a coluna já existia no banco desde a
migration 24, nunca tinha entrado no tipo).

**Como sei que terminou:** `npx tsc --noEmit` limpo.

### 2. `services/financialRegistryService.ts` (editado)

`listCostCenters` já lia `parent_id` para montar o nome achatado "Grupo > Filho", mas
descartava no retorno. Passou a expor `parent_id`, `parent_name` e
`empreendimento_id` também, sem mudar o `name` achatado que o resto do app já lê.

**Como sei que terminou:** o dropdown do Fechamento lista grupos; nenhuma tela que já
usa `listCostCenters` mudou de comportamento (`tsc` limpo, sem novo campo obrigatório).

### 3. `services/condominioRateioService.ts` (editado)

- `previa()` ganhou `transactionIds?: string[]` — quando presente, troca a janela de
  data por `.in('id', transactionIds)`, mantendo os guardas de `cost_center_id` e
  `direction`.
- `listarPorCentrosDeCusto(costCenterIds)` — resolve, por centro de custo,
  `{ empreendimentoId, empreendimentoNome, organizationId }`.
- `listarJaRateadas(transactionIds)` — quais já entraram em algum rateio vivo (não
  cancelado), para não deixar a mesma despesa ser lançada duas vezes.

**Como sei que terminou:** `previa()` com ids devolve exatamente os títulos
marcados; `listarJaRateadas` reencontra um título recém-lançado.

### 4. `components/financeiro/LancarNoCondominioSheet.tsx` (novo)

Sheet com o fluxo calcular → conferir → lançar. Agrupa os títulos marcados por
condomínio (um rascunho por condomínio quando a seleção cobre mais de um), com
Tipo/Critério compartilhados (GRUPO fica de fora — exige seleção manual de unidade,
fora do escopo deste botão). Checa `uidx_rateio_competencia` antes do usuário
preencher tudo, e não só no submit.

**Como sei que terminou:** `bash scripts/check-ui-standard.sh` limpo; o rascunho
criado aparece em Comercial › Condomínios › Financeiro com exatamente os títulos
marcados.

### 5. `components/financeiro/FechamentoCentroCusto.tsx` (editado)

- Dropdown de Centro de Custo ganhou `<optgroup>` "Grupos" (derivado de
  `cost_centers_v2.parent_id` dos CCs presentes no consolidado) acima de "Centros de
  custo".
- Checkbox por título na linha expandida, só nos títulos cujo CC tem
  `empreendimento_id` — com Shift+clique (§10.1) escopado ao bloco do próprio CC, e
  "Selecionar todos" no cabeçalho do bloco. Título já lançado entra desabilitado.
- Botão "Lançamento" (secundário, ícone `Building2`) ao lado de "Fechar
  competência"/"Reabrir competência" — sempre visível, desabilitado sem seleção.
- Barra flutuante de seleção (§10), sem repetir a ação de lançar (ela mora só no
  botão da toolbar).
- Depois de lançar: `handleLancado` atualiza `rateadas` e limpa a seleção local — sem
  recarregar a tela (§22).

**Como sei que terminou:** `bash scripts/check-ui-standard.sh` limpo (era 0
violações antes; continua 0).

## Estado

- [x] Item 1 — tipos
- [x] Item 2 — `financialRegistryService`
- [x] Item 3 — `condominioRateioService`
- [x] Item 4 — `LancarNoCondominioSheet.tsx`
- [x] Item 5 — `FechamentoCentroCusto.tsx`
- [x] **Verificação no navegador — FEITA em 26/08/2026**, com dado REAL. O DNS do
      projeto voltou a resolver, o que destravou a tentativa bloqueada em 24/08
      (naquele dia `oxedkknreghxrgenyjiu.supabase.co` devolvia "Non-existent
      domain" e o login falhava com `AuthRetryableFetchError` antes de qualquer
      tela abrir). Detalhe abaixo.

## Verificação

**Mecânica (feita em 24/08/2026):**

```bash
npx tsc --noEmit                                                          # limpo
bash scripts/check-ui-standard.sh components/financeiro/FechamentoCentroCusto.tsx      # 0 violações
bash scripts/check-ui-standard.sh components/financeiro/LancarNoCondominioSheet.tsx    # 0 violações
npx vitest run __tests__/orgContextGuard.test.ts __tests__/migrationsPrefixo.test.ts   # 17 passando
```

**Na tela — EXECUTADA em 26/08/2026** (org Alpa Construtora, competência
**07/2026**, condomínio **007 - Bella Vista**, os dois únicos títulos do mês nos
centros de custo de condomínio: R$ 362,33 + R$ 133,57 = **R$ 495,90**).
Roteiro em `c:/tmp/pwtest/teste-lancamento.js` (só leitura) e
`teste-lancamento2.js` (o que grava) — receita do harness na memória
`feedback_teste_navegador_playwright_pwa`.

| Passo | Resultado |
|---|---|
| 1. Dropdown mostra a seção "Grupos" com "Condomínios"; escolher filtra aos filhos | ✅ `optgroup "Grupos" = ["Condomínios"]`; os centros aparecem achatados como `Condomínios > 007 - Bella Vista`; filtrar reduziu o consolidado a 1 linha |
| 2. CC de condomínio mostra checkbox; CC comum, não | ✅ 2 checkboxes na linha expandida do CC de condomínio |
| 3. Marcar 2 → barra flutuante; botão sai do desabilitado | ✅ desabilitado antes, `Lançamento (2)` depois |
| 4. Sheet → Tipo/Critério → Calcular → resumo bate com a soma | ✅ "2 títulos · R$ 495,90 · competência 07/2026", agrupado sob *007 - Bella Vista*, `Rateado: R$ 495,90` |
| 5. Rascunho aparece no condomínio com exatamente os 2 títulos | ✅ 3 POSTs (`condominio_rateios`, `_itens`, `_despesas`); a linha nasceu `Rascunho · 07/2026 · Valor igual por unidade · R$ 495,90`, e "Ver despesas" listou os 2 |
| 6. Títulos ficam desabilitados sem recarregar a página (§22) | ✅ habilitados 2 → 0 na hora, `title="Já lançado num rateio deste condomínio."` |
| 7. Repetir na mesma competência/tipo: o Sheet avisa antes de calcular | ✅ **PROVADO em 27/08/2026** — ver abaixo |
| 8. Fechar a competência e repetir o passo 4 | ✅ **PROVADO em 27/08/2026** — ver abaixo |

**Zero erro de console em toda a passagem.**

✅ **PASSO 7 — PROVADO em 27/08/2026.** Antes não dava: depois de lançar, os dois
únicos títulos de 07/2026 ficavam desabilitados e não sobrava nada para marcar.
A saída foi escolher uma competência com **três** títulos no mesmo centro de
custo — `05/2024` no Bella Vista (R$ 350,00 + R$ 99,57 + R$ 1.822,00). Lançados
dois, o terceiro foi marcado e o Sheet **recusou antes de deixar calcular**, num
bloco vermelho:

> *"Já existe um rateio ordinário vivo de 05/2024 para este condomínio.
> Cancele-o em Comercial › Condomínios › Financeiro antes de lançar aqui."*

`Calcular` e `Lançar como rascunho` ficaram desabilitados. A mensagem diz **onde**
resolver, não só que deu errado — que é a diferença entre aviso e beco sem saída.

⚠️ **O índice `uidx_rateio_competencia` é PARCIAL (`WHERE status <> 'CANCELADO'`)**,
então rateio cancelado não bloqueia a competência. Foi por isso que o primeiro
teste, feito sobre a competência cujo rateio já estava cancelado, não teria
disparado aviso nenhum — não é bug, é o desenho: cancelar existe justamente para
liberar a competência.

✅ **PASSO 8 — PROVADO em 27/08/2026, por carimbo de tempo.** Com a competência
`05/2024` **fechada**, um rateio EXTRAORDINÁRIO foi lançado normalmente:

| Evento | Horário (UTC) |
|---|---|
| `cost_center_closings` 05/2024 → `fechado_em` | `2026-08-27T22:44:38` |
| `condominio_rateios` EXTRAORDINARIO → `created_at` | `2026-08-27T22:44:53` |
| `cost_center_closings` 05/2024 → `reaberto_em` | `2026-08-27T22:47:22` |

Os 15 segundos entre fechar e criar são a prova: **lançar não escreve em
`internal_transactions`**, então `fn_payable_bloqueia_competencia_fechada` não
tem o que barrar. A competência foi **reaberta** e voltou ao estado em que
estava (`REABERTO`, como o usuário a deixara em 21/08).

Usar **EXTRAORDINÁRIO** aqui não foi detalhe: o índice único é
`(empreendimento, competencia, tipo)`, então o tipo diferente é o que permitiu
provar o passo 8 sem antes desfazer o passo 7.

⚠️ **Todos os rateios de teste foram CANCELADOS** (autorizado: "pode gravar e
depois cancelar"). Conferido no banco. Sobraram **três linhas `CANCELADO`**:
`2026-07 ORDINARIO R$ 495,90` (teste dos passos 1–6) e, de `2024-05`,
`ORDINARIO R$ 449,57` + `EXTRAORDINARIO R$ 1.822,00` (testes dos passos 7 e 8).
**As linhas continuam existindo** — cancelar não apaga, e é o desenho correto
(rateio é base de cobrança; sumir com o registro apagaria o rastro). `number`
ficou nulo nas três, porque o número só nasce no fechamento. Se quiser a tabela
limpa para o piloto de verdade, essas três precisam ser removidas à mão.

🔎 **Achado de dado, não de código:** o Sheet avisou *"9 unidade(s) sem
responsável financeiro"*. É a decisão do plano do rateio funcionando, e diz uma
coisa concreta sobre o piloto: o Bella Vista não tem ocupações cadastradas,
então um rateio lançado hoje calcula cotas **sem ninguém de quem cobrar**. Isso é
pré-requisito da fatia de cobrança, não um detalhe.

---

**Roteiro original (referência):** com organização específica no seletor do topo,
em Contas a Pagar › Fechamento por CC:

1. Dropdown de Centro de Custo mostra a seção "Grupos" com "Condomínios"; escolher
   filtra às linhas dos CCs filhos.
2. Expandir um CC de condomínio mostra checkbox nos títulos; um CC comum, não.
3. Marcar 2 títulos → barra flutuante "2 selecionados · R$ X"; botão "Lançamento"
   sai do estado desabilitado.
4. Lançamento → Sheet → Tipo/Critério → Calcular → resumo bate com a soma dos 2
   títulos → Lançar.
5. Comercial › Condomínios › (o condomínio) › Financeiro: o rascunho aparece; "Ver
   despesas" lista exatamente os 2 títulos.
6. Voltar ao Fechamento: os 2 títulos aparecem com checkbox desabilitado ("já
   lançado"), sem precisar recarregar a página.
7. Repetir o lançamento na mesma competência/tipo: o Sheet avisa antes de deixar
   calcular.
8. Fechar a competência no Fechamento e repetir o passo 4 — tem de funcionar, pois
   lançar não escreve em `internal_transactions`.
