# Controladoria — Conta Financeira nos produtores do razão (contratos, boletos, tributos)

## Pedido original
> atacar 3 e 4
> Sessão: 074d416c-dd6a-42e5-97d2-97038aa05a12 · 2026-09-20

"3 e 4" são os pendentes listados ao fechar
`docs/planos/2026-09-20-controladoria-dre-fallback-nome-e-spe.md`:

> 3. `contractService`: categoria por direção + gravar `category_id`.
> 4. Boletos (498 lançamentos, R$ 508 k) só classificados no `chart_of_accounts`
>    legado; impostos de locação chegando como `'Locação'`.

Pedido-raiz da sequência: *"Verifique o módulo controladoria"* (mesma sessão).

## Correção ao diagnóstico do item 4
Medido antes de codar: os boletos **não** estão classificados no
`chart_of_accounts` (0 de 1.116 boletos da Alpa; a tabela tem 2 linhas no
sistema inteiro — está morta). Eles não têm categoria financeira em lugar
nenhum: carregam Centro de Custo (563) e Plano de Contas (1), que são outras
dimensões. Logo o item 4 não é "ponte", é **dar ao boleto a dimensão que a DRE
lê** e fazê-la descer ao razão.

Também desatualizada a memória de que categorias globais (org NULL) eram
invisíveis via RLS: a policy vigente é
`(organization_id IS NULL) OR is_org_member(organization_id)`.

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-20 | Atacar itens 3 e 4? | "atacar 3 e 4" |

Decisões minhas, dentro do escopo (registradas para revisão):
- Padrão por direção quando o contrato não tem Conta Financeira escolhida:
  recebível → `Receita de Obra` (org) senão `Receita de Serviços` (global);
  pagável → `Mão de Obra / Serviço` (org) senão `Empreiteiros` (global).
- Tributos automáticos: IRPJ/CSLL/IR → `IRPJ / CSLL` (IMPOSTOS); ISS, PIS,
  COFINS, INSS e o resto → `Impostos s/ Receita (ISS/PIS/COFINS)` (DEDUCOES).
- Boletos já existentes **não** recebem categoria por adivinhação: o usuário
  escolhe no formulário ou na edição em lote.

## Plano

### `services/financialCategoryResolver.ts` (novo)
**O que muda:** peça única que devolve `{category_id, category}`: por id
escolhido, por lista de nomes (org > global, na ordem), por contrato (escolhida
> padrão pela direção), e `categoriaDoTributo(nome)`.
**Como sei que terminou:** `__tests__/financialCategoryResolver.test.ts` passa
(preferência org > global, outra org ignorada, id apagado → padrão, IRRF ≠ IR).

### `services/contractService.ts`
**O que muda:** os 4 syncs (parcelado, recorrente, série recorrente por período,
à vista) chamam `resolverCategoriaDoContrato` e gravam `category` +
`category_id` no razão (e o nome no espelho JSONB). `updateContract` propaga
mudança de `category_id` aos títulos PENDENTES, como já fazia com plano/CC.
**Como sei que terminou:** nenhum `'Mão de Obra / Serviço'` literal restante no
arquivo; `contractUpdatePropagaPlano.test.ts` continua passando; typecheck OK.

### `services/taxPayableService.ts`
**O que muda:** `pushRow` grava `category`/`category_id` pela natureza do
tributo em vez de `origin`.
**Como sei que terminou:** grep de `category:        origin` vazio; typecheck OK.

### `types/boletos.ts` · `services/boletoService.ts`
**O que muda:** `Boleto.category_id`; `BOLETO_COLUMNS` e os 2 selects sem
plano ganham `plano_de_contas_id, category_id`; aprovação grava
`category_id`/`category` no título; `associar`, `associarEmLote` e
`aprovarEmLote` aceitam `category_id` e espelham no razão.
**Como sei que terminou:** typecheck OK; aprovação de boleto com conta escolhida
cria título com `category_id` preenchido (verificação manual após publicar).

### `components/BoletoFormModal.tsx` · `components/BoletoEdicaoEmLoteModal.tsx`
**O que muda:** campo "Conta Financeira" (drawer `HierarchicalSelect`, mesmo do
ContractModal) nos 2 layouts do formulário e no lote ("— Não alterar —").
**Como sei que terminou:** `check-ui-standard.sh` limpo nos dois; build OK.

### `supabase/migrations/aplicar_20270921000030_controladoria_categoria_contratos_boletos_tributos.sql`
**O que muda:** `boletos.category_id` (FK financial_categories, SET NULL) +
backfill do razão em 4 passos: A) parcela herda `contracts.category_id`;
B) recebível de contrato com 'Mão de Obra / Serviço' → receita; C) tributo
`party_type='TAX'` → dedução/imposto; D) texto sem id → id pelo nome (org ou
global). Não toca valor, direção, status, data nem boleto.
**Como sei que terminou:** aplicada; DRE 2026 da Alpa mostra Receita Bruta
prevista ≈ R$ 1,05 M e Deduções ≈ R$ 5 k; "Sem Classificação" = só boletos.

## Estado
- [x] resolvedor + teste (10 casos)
- [x] contractService (4 syncs + propagação no updateContract)
- [x] taxPayableService
- [x] boletos: tipo, service, formulário, lote
- [x] migration aplicada (2026-09-20) — medido depois: CONTRACT CREDIT 362/362
  com id ("Receita de Obra"); CONTRACT DEBIT 40/40; COMMERCIAL 1184/1184
  (tributos → "Impostos s/ Receita"); BOLETO 0/580 (por decisão); DRE 2026
  Receita Bruta prev. R$ 1.046.437,14, Deduções prev. R$ 5.112,30,
  Sem Classificação R$ 222.602,60 (= só boletos conciliados)
- [x] typecheck · testes relacionados 8 arquivos/60 + novo 10 · check-ui nos 2 modais
- [ ] build · commit · push em main

## Fora do escopo (continua pendente)
- Classificar os 580 boletos já lançados — agora é possível pela edição em lote
  (Boletos › selecionar › Conta Financeira), mas é decisão de negócio, não de código.
- `financialService.ts:453/489` grava 'Mão de Obra / Serviço' no espelho JSONB
  da obra (medições) — não alimenta a DRE; não mexido.
- Contas a Pagar/Receber não têm edição de Conta Financeira por linha.
- `chart_of_accounts` (2 linhas, morta) e `boletos.chart_of_accounts_id`:
  aposentar.

## Verificação
```bash
npx vitest run __tests__/financialCategoryResolver.test.ts __tests__/contractUpdatePropagaPlano.test.ts
bash scripts/check-ui-standard.sh components/BoletoFormModal.tsx
bash scripts/check-ui-standard.sh components/BoletoEdicaoEmLoteModal.tsx
# no app: Boletos › novo/editar → "Conta Financeira"; aprovar → Controladoria › Balancete mostra a conta
```
