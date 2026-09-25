# Fornecedor no relatório de rateio

## Pedido original (literal)

> incluir forncedor no relatório

Continuação de `docs/planos/2026-09-25-relatorio-de-rateio.md`.

## De onde vem o fornecedor

**Não é coluna de `condominio_rateio_despesas`.** O snapshot do rateio guarda
descrição e valor; o fornecedor vem do lançamento de origem, por
`transaction_id`.

Medido em 25/09/2026: as **38** despesas de rateio da base acham o lançamento,
e **todas as 38** têm fornecedor cadastrado.

## Uma regra, dois lados

`utils/despesaCondominio.rotuloDeFornecedor(cadastrado, cru)` — a mesma ordem
da aba Despesas e da Conciliação Bancária: **fornecedor cadastrado primeiro,
texto cru depois, e o cru sempre podado** por `podarRuidoDeBoleto` (na origem
BOLETO, `party_name` é o bloco de OCR da linha do beneficiário, com CNPJ,
endereço e publicidade colados).

Ela é pura e mora em `utils/` porque o relatório monta a linha em dois lugares:

- **admin** — `condominioRateioService.listarDespesas` resolve
  `transaction_id → supplier_id → suppliers.name` em lote
  (`fornecedoresDasDespesas`) e aplica a regra;
- **portal** — a RPC devolve os **dois campos crus** e o TypeScript aplica a
  **mesma** função.

⚠️ **A RPC não escolhe o nome, de propósito.** Decidir em SQL criaria uma
segunda regra — e `podarRuidoDeBoleto` vive em TypeScript. O mesmo fornecedor
sairia com dois nomes no mesmo documento, que é exatamente o defeito que a
comparação dos dois PDFs pegou no relatório anterior ("Ordinário" × "Ordinária").

## Migration

`aplicar_20270925000010_condominio_portal_despesa_com_fornecedor.sql` —
`CREATE OR REPLACE` de `fn_condominio_payload_for_client`, acrescentando
`fornecedorCadastrado` e `fornecedorCru` ao subselect de despesas, com
`LEFT JOIN` para `internal_transactions` e `suppliers`.

Cuidados tomados antes de reescrever a função:

1. **Listei as frentes abertas** — só esta toca condomínio/portal
   (`project_rpc_portal_sobrescrita_por_frente_paralela`).
2. **Conferi que o corpo vivo no banco bate com o do repositório** no trecho de
   rateios, e gerei a migration **a partir do arquivo** da migration vigente
   (`aplicar_20270924000050`), mudando só o subselect
   (`feedback_reescrever_funcao_use_o_arquivo_nao_o_banco`).
3. **Validei o subselect novo só com leitura** antes de aplicar.
4. `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` literal (REGRA #7).

`LEFT JOIN` e não `JOIN`: despesa sem lançamento de origem (rateio montado à
mão) continua na lista.

## Degrada sozinho

A coluna Fornecedor **só existe quando há fornecedor** — no PDF e na tabela da
tela. Rateio sem lançamento de origem não gasta largura numa coluna de traços.
Por isso o código é seguro antes da migration: sem os campos na RPC, o portal
simplesmente não mostra a coluna.

## Prova

**Admin** — Galeria Altavista › Relatório do rateio:

```
tabela: Descrição | Fornecedor | Valor · 622px em 622px · 0 células cortadas
PDF: Fornecedor = "Energisa"
```

**Condômino** — pelo link real `/portal-cliente?token=…`, depois da migration
aplicada:

```
PDF: rateio_08-2026.pdf · 21.344 bytes · Fornecedor = "Energisa"
Sala 201/202/203 em negrito azul
```

Os dois PDFs renderizados no Chrome e conferidos página a página.

Testes: `__tests__/despesaCondominio.test.ts` de 13 para 18 — cadastrado ganha
do OCR, texto cru vai podado, cadastro em branco não apaga o cru, sem nome
devolve `null`.

Portões: `tsc --noEmit` 0 · `vitest run` 5391 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build`.

⚠️ `verificar-views-anon.sh` acusa 8 views com cross-tenant aberto
(`vw_hr_*`, `vw_project_cost_comparison`). É preexistente e sem relação com
esta mudança — nenhuma view foi criada ou alterada aqui.
