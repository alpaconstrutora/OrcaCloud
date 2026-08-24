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
- [ ] **Verificação no navegador — PENDENTE.** Mecânica (`tsc`, `check-ui-standard.sh`,
      `orgContextGuard`/`migrationsPrefixo`) passou; ninguém abriu a tela ainda.
      Tentativa em 24/08/2026: bloqueada por ambiente, não por código — o host do
      projeto Supabase em `.env` (`oxedkknreghxrgenyjiu.supabase.co`) não resolvia por
      DNS na máquina de execução (`nslookup` via 8.8.8.8 devolveu "Non-existent
      domain"; `supabase.co` raiz resolvia normalmente). Login do app falhava com
      `AuthRetryableFetchError: Failed to fetch` antes de qualquer tela abrir.
      Refazer esta verificação assim que o DNS do projeto voltar (ou apontando para
      o host correto, se o projeto mudou).

## Verificação

**Mecânica (feita em 24/08/2026):**

```bash
npx tsc --noEmit                                                          # limpo
bash scripts/check-ui-standard.sh components/financeiro/FechamentoCentroCusto.tsx      # 0 violações
bash scripts/check-ui-standard.sh components/financeiro/LancarNoCondominioSheet.tsx    # 0 violações
npx vitest run __tests__/orgContextGuard.test.ts __tests__/migrationsPrefixo.test.ts   # 17 passando
```

**Na tela (pendente):** com organização específica no seletor do topo (piloto: 010 -
Galeria Altavista ou 007 - Bella Vista), em Contas a Pagar › Fechamento por CC:

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
