# Aba Despesas: coluna Origem

## Pedido original

Sessão de 24/09/2026, transcrito literalmente:

> condomínio < aba financeiro: criar campo origem na tabela

### Definição do usuário (perguntado antes de editar)

"Origem" podia ser duas coisas na mesma aba, e as duas eram plausíveis logo
depois da investigação da divergência entre Rateios e Despesas:

| Leitura | O que seria |
|---|---|
| **Despesas** ✅ escolhida | De onde veio o LANÇAMENTO (`source_system`) |
| Rateios | Como o RATEIO foi montado (competência × seleção de títulos) |

O usuário escolheu **Despesas — de onde veio o lançamento**.

## O que a investigação achou antes de editar

- **Hoje a coluna nasce com valor único.** As 139 despesas em centros de custo
  de condomínio são **todas** `BOLETO`. A coluna só ganha variedade quando
  entrarem outras origens — o que o sistema já sabe gravar: a base inteira tem
  12 origens distintas (`COMMERCIAL`, `CONTRACT_RECURRING`, `LABOR`, `NFE`,
  `PURCHASE_ORDER`, `MANUAL`…). Isso foi dito ao usuário antes da escolha.
- **O rótulo em português já existe.** `origemLabel`, em
  `components/ContasPagarParcelas.tsx`, com degradação legível: origem fora do
  mapa vira "Asset Maintenance" em vez de `ASSET_MAINTENANCE`. Reusar é o que
  impede as duas telas de darem nomes diferentes à mesma origem.

## Plano

### 1. `services/condominioRateioService.ts` (editado)

`LancamentoDoCondominio` ganha `origem` (o `source_system` cru), e a consulta
passa a selecioná-lo. O rótulo fica na tela, não no service: o dado cru é o que
se filtra e se compara.

### 2. `components/condominio/FinanceiroTab.tsx` (editado)

- Coluna **Origem** entre Fornecedor e Centro de custo, com
  `useResizableColumns` como as demais (§6.1) — entrou no `<colgroup>`, no
  `<thead>` com `ResizeHandle` e no `<tbody>`, e o `colSpan` do rodapé subiu de
  6 para 7. As larguras padrão foram reequilibradas para a soma não estourar.
- **A busca alcança a nova coluna** (e o fornecedor, que tinha ficado de fora):
  coluna visível que a busca não enxerga faz o usuário digitar "boleto" e a
  linha sumir. O placeholder passou a dizer o que procura.

**Decisão registrada:** o `origemLabel` é importado de
`components/ContasPagarParcelas.tsx`, não extraído para um util. É a convenção
já estabelecida — `ContasPagarManager` e `financeiro/FechamentoCentroCusto`
importam dali do mesmo jeito. Extrair tocaria esses dois arquivos sem ninguém
ter pedido.

## Estado — 24/09/2026: concluído

Conferido na tela, dado real, escritas bloqueadas, zero erro de console:

| Verificação | Resultado |
|---|---|
| Coluna Origem presente | ✅ `Data · Descrição · Fornecedor · Origem · Centro de custo · Situação · Valor` |
| Rótulo em português | ✅ **"Boleto"**, não `BOLETO` |
| Redimensiona como as outras | ✅ alça própria, e o auto-ajuste continua funcionando |
| Busca | ✅ placeholder "Buscar por descrição, fornecedor, origem ou centro de custo..." |

Mecânica: `tsc` limpo · **5.240 testes** · `check-ui-standard.sh` limpo em
`FinanceiroTab.tsx` · os 4 scripts de regra OK.
