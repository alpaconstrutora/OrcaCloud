# Condomínio › Financeiro: padding do drawer + coluna Código nas Despesas

## Pedido original (literal)

> 1. Olha o print que tem enviei o drawer esta sem paddind lateral interno. o
>    texto esta encostando na borda
> 2. condominio < aba Financeiro < aba despesas: incluir coluna Código
>    (primeira coluna) e traga o código de cada lançamento.

## 1. O padding

**Não era regressão da malha do §30.** `SheetPanel` (`components/ui/sheet.tsx`)
é só `flex-1 overflow-y-auto` — quem chama é que põe o padding, e é o que o
resto do app faz (`p-6`, `px-6 py-6`: 60+ ocorrências). Os **quatro** drawers
de `FinanceiroTab.tsx` — Novo rateio, Detalhe do rateio, Gerar cobrança e
Resultado da emissão — chamavam `<SheetPanel>` pelado desde antes.

Ficou invisível enquanto o conteúdo era uma coluna estreita; com a grade de
duas colunas do §30 ela passou a ocupar os 672px inteiros e encostou nas duas
bordas. Corrigido nos quatro, não só no que o print mostra.

Medido depois: `padding: 24px 24px 24px 24px`, painel 672px, grade 624px,
folga de 24px de cada lado.

## 2. A coluna Código

Código do **documento de origem**. Medição no banco (24/09/2026): as 136
despesas de condomínio da base são **todas** `source_system = 'BOLETO'` e
todas com `reference_id` — então o código é o nº do boleto.

Formatado com a **mesma** regra da Conciliação Bancária
(`loadOriginCodes` em `components/BankReconciliation.tsx`):
`String(numero).padStart(4, '0')`. Se as duas telas divergissem, o mesmo
título teria dois códigos.

- `services/condominioRateioService.ts`: campo `codigo: string | null` em
  `LancamentoDoCondominio`, `reference_id` no select e o helper
  `codigosDeBoleto()` (busca em lote, best-effort — falhar só apaga a coluna,
  não some com a lista).
- Origem sem código próprio (NFE, MANUAL, PURCHASE_ORDER) fica `null` e a
  célula mostra "—". Derivar algo do uuid seria pior que admitir que não há.
- `components/condominio/FinanceiroTab.tsx`: primeira coluna, 100px, com
  `<col>`, `ResizeHandle`, `colSpan` do rodapé de 7 → 8, e a **busca**
  passando a alcançá-la (o comentário do filtro já mandava: "a busca alcança
  as colunas VISÍVEIS"). Placeholder atualizado.

Este método não desmonta `reference_id`: na origem BOLETO ele é o id puro.
Os formatos compostos são das origens de contrato, que nem chegam aqui —
ver o aviso de 22P02 em `BankReconciliation.tsx` e `lib/receivableRef.ts`.

## Prova

Playwright no servidor da frente, Bella Vista › Financeiro › Despesas,
competência 06/2020 (09/2026 não tem despesa neste condomínio):

```
padding computado: 24px 24px 24px 24px
painel 672px · grade 624px → folga 24px de cada lado

colunas: Código | Data | Descrição | Fornecedor | Origem | Centro de custo |
         Situação | (espaçador) | Valor
linhas: 3 · com código preenchido: 3
  0977 · 21/06/2020 · Despesa sem descrição
  0979 · 21/06/2020 · Despesa sem descrição
  0055 · 10/06/2020 · MN CONSERVAÇÃO ELEVADORES…
```

Testes novos: `__tests__/condominioLancamentoCodigo.test.ts` (7) — nº de 1
dígito sai com 4, origem sem código vira `null` e não o uuid, boleto que não
volta de `boletos` não derruba a linha, `numero` nulo não vira a string
"null", id repetido consulta uma vez.

Portões: `tsc --noEmit` 0 · `vitest run` 5276 passaram / 0 falhas ·
`check-ui-standard.sh` · `check-system-projects.sh` ·
`check-project-classification.sh` · `check-org-selector-guard.sh` ·
`check-xss-sinks.sh` · `npm run build`.
