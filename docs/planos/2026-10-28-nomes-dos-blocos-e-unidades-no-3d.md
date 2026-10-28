# Nomes dos blocos e das unidades no 3D (28/10/2026)

## Pedido original

> "implementar identificacao dos blocos e das unidadas diretamente na planta 3d. Coloque também no filtro de exibir
> de forma que o usário possa ocultar e exibir como ele quiser"

O pedido veio com um print da Planta Inteligente em 3D: dois blocos de massa divididos em unidades, sem nenhum nome
na tela.

## Mudança

1. **Posições (puro, novo):** `utils/blueprintRotulosDaMassa.ts`, com `rotulosDaMassa(pecas, { blocos, unidades })`.
   - **Bloco:** uma etiqueta por bloco, no centro do contorno, 1,5 m acima do último pavimento.
     - O bloco que fica inteiro abaixo do chão ("Torre A · Garagem") leva a etiqueta 1,5 m abaixo do fundo. Em cima,
       ela cairia sobre a torre.
   - **Unidade:** uma etiqueta por fatia (unidade × pavimento), no centro da fatia e a meia altura do pavimento.
     - Só existe quando a massa está dividida nas unidades do Empreendimento.
2. **3D (`Blueprint3DViewer`):**
   - O `RotuloDeRede` passa a aceitar tamanho, peso da fonte e "por cima".
     - A etiqueta da unidade mora dentro do prisma e sumiria atrás da própria face. Por isso é desenhada sem teste de
       profundidade.
     - A etiqueta não tem raycast, então não rouba o clique da peça.
   - O bloco tem letra de 1,1 m, e a unidade, de 0,55 m.
   - A peça da massa ganha `bloco` e `rotuloDaUnidade`, e há a prop nova `rotulosDaMassa`. O `Blueprint3DTab` repassa
     as duas.
3. **Exibir (3D) e Preferências:**
   - Dois itens novos no catálogo, `vista3dNomesDosBlocos` e `vista3dNomesDasUnidades`, ligados por padrão. Valem
     por usuário, como os outros itens do Exibir.
   - Os dois ficam desligados, com o motivo na dica, quando não há bloco ou quando "Blocos de massa" está desligado.
   - "Nomes das unidades" também fica desligado quando a massa não está dividida em unidades. Para isso, a planta
     precisa estar ligada a um Empreendimento com unidades.

## Verificação

- **Testes:**
  - `blueprintRotulosDaMassa`: 5 testes (bloco, subsolo, unidades, liga/desliga, sem nome).
  - Catálogo e `SecaoExibicaoDaPlanta`: passam.
  - `BlueprintEditor.test.tsx` sozinho: 284/284.
- **Mecânicas:** tsc; check-ui-standard nos arquivos tocados.
