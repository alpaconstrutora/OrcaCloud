# Torres e Unidades: Terreno e Torres em blocos separados (28/10/2026)

## Pedido original

> "separe as sessoes Terreno e torres"

O pedido segue o de 27/10: "Separar cada seção para melhorar a organização". Naquele pedido o usuário escolheu
**blocos separados** para Pavimentos e Unidades dentro da torre. Aqui vale o mesmo padrão, sem perguntar de novo.

## Mudança

- `TowerEditor`: as seções **Terreno** e **Torres** passam a ser blocos próprios.
  - Cada uma é um `section` com borda arredondada, fundo branco e respiro interno.
  - Os blocos ficam espaçados entre si.
  - Os cards das torres e os totais continuam dentro do bloco Torres.
- Antes, as duas seções eram só títulos numa mesma coluna, sem divisão visual.

## Verificação

- **Teste:** `TowerEditorTerrenoDaPlanta` (+1). Os dois blocos existem e nenhum contém o outro.
- **Mecânicas:** tsc; check-ui-standard.
