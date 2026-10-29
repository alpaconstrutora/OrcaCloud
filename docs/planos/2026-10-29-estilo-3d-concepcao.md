# Estilo do 3D "Concepção", para mostrar ao cliente (29/10/2026)

## Pedido original

> "para visualizacao de massa essa design esta ok. Fazer uma nova opcao chamada Conceoção para o usuário mostrar
> para o cliente. Vou te passar algumas imagens para voce entender o estilo"

As quatro imagens de referência são diagramas de concepção de massa:
- volumes claros com contorno forte;
- as camadas dos pavimentos;
- uma cor por bloco ou uso (torre azul, embasamento laranja);
- etiquetas de chamada com caixa colorida e linha tracejada;
- vista axonométrica sobre o lote em cor sólida.

**Decisões do usuário:**
- Um 4º estilo do 3D, em Vista › Estilo do 3D.
- Os quatro elementos: volumes e pavimentos, cor por bloco/uso, etiquetas de chamada, vista isométrica e chão.
- Unidades e envelope seguem o Exibir.

## Mudança

1. **Puro (`utils/blueprintConcepcao.ts`):**
   - `blocosDaConcepcao` junta os prismas da massa (por pavimento e por unidade) num volume por bloco, com o contorno
     do bloco, os pavimentos, a cor do uso e o tom quase branco.
   - `chamadasDaConcepcao` põe a caixa de cada bloco do lado de fora da cena, na altura do meio do bloco. A linha
     encosta na face.
   - Também: `DESTAQUE_DO_USO`, `tomClaro` e as cores do lote.
2. **3D (`Blueprint3DViewer`), com `estilo === 'CONCEPCAO'`:**
   - **Peças do modelo:** como a Linha oculta, brancas com aresta.
   - **Massa:**
     - Tom claro do uso, com brilho próprio. Só com a luz, o tom claro saía cinza.
     - Linhas dos pavimentos mais leves.
     - Sem o vermelho de "problema": é aviso de projeto, não do cliente.
   - **Contorno forte do bloco:** `Line` do drei com espessura 3,2, nas arestas do volume inteiro e na cor do uso.
     Usa `side=DoubleSide`, porque a cena mora num grupo de escala negativa (o espelho do desenho), e a linha grossa,
     feita de faces, sumia sem isso.
   - **Chamadas:** caixa na cor do uso, com o nome e "uso · N pav", e linha tracejada. Aparecem no lugar do nome do
     bloco, quando "Nomes dos blocos" está ligado.
     - Ficam do mesmo tamanho na tela: sem `sizeAttenuation`, e a escala acompanha a lente a cada quadro.
   - **Lote:** cor sólida com contorno. Fundo branco, sem a grade. Luz de apresentação no lugar do sol do estudo.
   - **Vista (`CameraDaConcepcao`):**
     - Lente de 10°, na diagonal isométrica, com 30% de folga para as chamadas. Ao sair do estilo, volta para 45°.
     - O `PontoDeVista` recebe a lente do estilo. Antes, ele forçava 45° a cada redimensionamento.
     - O Exportar imagem usa a mesma câmera, então sai nesse estilo.
3. **Catálogo, templates de vista e tipos:** a 4ª opção, "Concepção".

## Verificação

- **Testes:**
  - `blueprintConcepcao`: 6.
  - `SecaoExibicaoDaPlanta`: atualizado com a 4ª opção.
  - Suítes vizinhas: 158/158.
  - `BlueprintEditor.test.tsx` sozinho: 284/284.
- **Mecânicas:** tsc; check-ui-standard.
- **Visual:** página de teste temporária, sem banco, com o `Blueprint3DTab` real e a geometria da Planta 26/10/2026,
  fotografada no Playwright.
  - Concepção residencial e com torre comercial: contorno azul e laranja, chamadas e lote.
  - O Sombreado ficou igual ao de antes.
  - Ao alternar da Concepção para o Sombreado, a lente vai de 10° para 45° e o quadro volta ao de antes.
  - Nenhum erro de página.
