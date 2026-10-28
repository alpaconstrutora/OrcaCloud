# Unidades: coluna Elevação e o nome do pavimento no grupo (28/10/2026)

## Pedidos originais

> "criar coluna elevação em torres e unidades > sessao unidades"

> "ao clicar em gerar a partir dos pavimentos, a identificacao das pavimentos na sessao unidades nao esta usando o
> mesmo nome dos pavimentos na sessao pavimentos e isso pode confundir o usuário"

O segundo veio com um print do Garden, Torre A. A seção Pavimentos tinha "Estacionamento 1", "Estacionamento 2" e
"Pavimento -1", e a seção Unidades agrupava como "Pavimento -4", "Pavimento -3" e assim por diante.

## Mudança (`UnitEditor`)

1. **Nome do pavimento no grupo:**
   - O cabeçalho de cada grupo passa a usar o **nome do pavimento cadastrado**, o mesmo da seção Pavimentos, pela
     expansão de `estruturaDaTorre`/`andaresDoCadastro` ("Tipo 2" na repetição).
   - Sem cadastro, vale o nome que a estrutura dá ao andar: Térreo, Pavimento N, Garagem N.
   - O número do andar fica ao lado ("andar -4"), e a elevação continua no cabeçalho.
2. **Coluna "Elevação"**, depois de "Tipo Pav.":
   - Mostra a elevação do andar da unidade, a mesma da seção Pavimentos: digitada, ou calculada com "(calc.)".
   - Na edição da linha é só leitura, porque a elevação é do pavimento e se muda na seção Pavimentos.
   - Os `colSpan` do cabeçalho do grupo e do total passaram de 4 para 5.

## Verificação

- **Testes:** `UnitEditorOrdemDoPavimento` (+2): o nome do pavimento com o andar e a coluna Elevação (digitada e
  calculada). As suítes vizinhas (UnitForm, Tower) passam.
- **Mecânicas:** tsc; check-ui-standard.
