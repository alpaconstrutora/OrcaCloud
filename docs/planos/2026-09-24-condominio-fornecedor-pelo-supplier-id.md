# Condomínio › Despesas: a coluna Fornecedor não olhava o `supplier_id`

## Pedido original (literal)

> explique por que o boleto 1383 na aba condominio < financeiro nao aparece o
> fornecedor

E, depois do diagnóstico: **"sim"** — para corrigir.

## O diagnóstico

O boleto 1383 é da **Energisa**, e o sistema sabe disso:

| campo | valor |
|---|---|
| `internal_transactions.party_name` | `NULL` |
| `internal_transactions.entity_name` | `NULL` |
| `internal_transactions.supplier_id` | `ddec35e7…` → **Energisa** |
| `boletos.beneficiario_nome` | `NULL` |
| `boletos.beneficiario_cnpj` | `07.282.377/0081-04` |
| `boletos.supplier_id` | `ddec35e7…` → **Energisa** |
| `boletos.metodo_extracao` | `pdf_text` (`download (98).pdf`) |

Duas falhas encadeadas:

1. **A extração não pegou o nome.** PDF sem linha digitável: o `pdf_text` tirou
   o CNPJ do beneficiário mas não o nome, então `beneficiario_nome`,
   `party_name` e `entity_name` nasceram nulos.
2. **A tela não consultava o vínculo.** Alguém depois ligou o fornecedor — o
   `supplier_id` está preenchido nos dois lados — mas `listarLancamentos` lia
   só `party_name || entity_name`.

**Não era caso isolado.** Das 136 despesas de condomínio da base:

```
101  mostravam algum nome (bloco de OCR cru)
 35  mostravam "—" COM supplier_id preenchido
  0  realmente anônimas
```

Todo traço naquela coluna era recuperável.

**E as duas telas discordavam do mesmo título.** A Conciliação Bancária já
resolve isso em `displayPartyName` (`components/BankReconciliation.tsx`):
tenta `supplier_id → suppliers.name` antes de cair no `entity_name`. O
lançamento 1383 aparecia como "Energisa" lá e como "—" aqui.

## O que foi feito

`services/condominioRateioService.ts` — `listarLancamentos` traz `supplier_id`,
resolve os nomes em lote (`nomesDeFornecedor`, best-effort como
`codigosDeBoleto`) e monta a coluna na **mesma ordem da Conciliação**:

```
fornecedor cadastrado → podarRuidoDeBoleto(party_name || entity_name)
```

O cadastrado vem primeiro porque `party_name` na origem BOLETO é o bloco de
OCR da linha do beneficiário, com CNPJ, endereço e chamada publicitária
colados. Sem fornecedor cadastrado, o texto cru vai **podado** pelo mesmo
`podarRuidoDeBoleto` que a descrição já usa — mostrar o bloco inteiro é pior
que mostrar o começo legível dele.

Efeito medido nas 136 linhas: **35** saem do "—", **98** trocam o bloco de OCR
pelo nome cadastrado, **3** seguem no texto cru (não têm fornecedor vinculado).

⚠️ **Não mexi na coluna Descrição.** `rotuloDeDespesa` continua recebendo o
`party_name` cru. Alimentá-la com o nome cadastrado faria Descrição e
Fornecedor mostrarem o mesmo texto lado a lado.

## Prova

Bella Vista › Financeiro › Despesas, 06/2020 — o mesmo mês do print anterior:

```
antes:  0977 · — | 0979 · — | 0055 · MN CONSERVAÇÃO ELEV…CNPJ: 07.604.526…
depois: 0977 · Energisa
        0979 · Energisa
        0055 · MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA
linhas sem fornecedor ("—"): 0
```

Testes: `__tests__/condominioLancamentoCodigo.test.ts` passou de 7 para 14.
Os 3 novos de comportamento foram **provados falhando** com a linha antiga
(`fornecedor: party_name || entity_name`) antes de valer como portão.

Portões: `tsc --noEmit` 0 · `vitest run` 5295 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build`.
