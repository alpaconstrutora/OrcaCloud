# Os blocos de massa no corte e nas fachadas (29/10/2026)

## Pedidos originais

> "Massa: coloquei um corte na planta porem a mensagem que recebo é nada para mostrar nesta vista. desenhe paredes na
> planta baixa"

> "as vistas de frentes, fundos e laterais tambem nao exibem imagens"

O primeiro pedido veio com um print da Planta 26/10/2026 (Garden): o corte A atravessando as duas torres, que eram só
blocos de massa.

## Causa

- A vista (`ElevationCanvas`, para corte e fachada) só projetava paredes, estrutura, telhado, escada e instalações.
- Os blocos de massa nunca entravam nela.
- Num estudo só de massa, a vista se declarava vazia e pedia paredes.

## Mudança

1. **Puro (`utils/blueprintMassaNaVista.ts`):** `massaNaVista(model, base, origem, levelIds)` transforma cada bloco num
   retângulo `(u, v)` com as cotas das linhas dos pavimentos.
   - **No corte:** o bloco atravessado sai **cortado**, um retângulo por trecho (`trechosCortados`, que cobre o "L").
     O bloco atrás sai em vista; o da frente não sai.
   - **Na fachada:** todos saem em vista.
   - A lista vem de trás para a frente. O subsolo, inteiro abaixo do chão, vem marcado como `enterrado`.
2. **Vista (`ElevationCanvas`):**
   - **Desenho:** a camada "1d", antes da passada das peças.
     - Cortado: cheio no tom do uso, linhas dos pavimentos na cor do uso, traço grosso.
     - Vista: claro, com traço fino.
     - Subsolo: tracejado.
     - Nome do bloco no alto, por dentro do retângulo.
   - **Enquadramento:** conta os blocos. Só com blocos, a caixa é a deles.
   - **"Vazio":** a vista deixa de se declarar vazia quando há massa.
   - **Medir:** encaixa nos cantos dos blocos.

3. **A projeção leva a massa** (`comMassa`), com a caixa crescida e a linha do solo estendida. A tela, a prancha e
   o DXF recebem a mesma projeção. Foi pedido depois: "sim" para incluir a prancha exportada.
   - **Prancha PDF/PNG (`enquadrarElevacao`, `desenharElevacao`):**
     - Só com massa, a prancha deixa de ser recusada como vazia.
     - Os blocos ficam por baixo das peças, com as linhas dos pavimentos e o nome.
     - O bloco cortado sai em cinza e com traço de 0,5 mm; o subsolo, tracejado.
   - **DXF:** camada própria `ELEVACAO-MASSA` com o contorno e os pavimentos. O deslocamento das vistas conta os
     blocos, para a primeira vista não cair sobre a planta.

## Verificação

- **Testes:**
  - `blueprintMassaNaVista`: 8.
    - Corte do print, corte ao lado olhando para os dois lados, fachada e filtro de nível.
    - Caixa, prancha não vazia com os nomes (sem a massa, era vazia), fachada na prancha e camada do DXF.
  - Suítes de vista, exportação e DXF: 454/454.
  - `BlueprintEditor.test.tsx` sozinho: 284/284.
- **Mecânicas:** tsc; check-ui-standard.
- **Visual:** página de teste temporária com a geometria do Garden, sem banco, fotografada no Playwright.
  - Corte A: as torres cortadas, cheias, com as garagens tracejadas.
  - Frente: a Torre A na frente.
  - Lateral: as duas torres com as garagens.
  - Nenhum aviso de vazio e nenhum erro de página.
