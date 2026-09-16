# Planta Inteligente — Grupo de fundação: bloco + estacas, quantidade e critérios de distribuição

**Data:** 16/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> 1. um bloco e estaca forma um grupo. a estaca e seu bloco deve estar agrupado.
> 2. ao clicar no grupo implementar opcao de duplicacao de estacas ou campo quantidade caso o usuário queira
> 3. Critérios de Distribuição das estacas no bloco de fundacao. 3.1. Centro de Carga: O eixo central do pilar deve coincidir com o centro geométrico do conjunto de estacas. 3.2. Espaçamento: ≥ 3φ entre eixos. 3.3. Simetria. [Bastos/UNESP — Blocos.pdf; FOT-II Aula 12]

Decisões com o usuário: quantidade **livre (1 a 12)** com os arranjos canônicos 1–6 em destaque ·
agrupado = **move junto, exclui junto, estacas aninhadas na lista** · **1 clique** (bloco ou
estaca, desenho ou lista) seleciona o **grupo**; **duplo clique** seleciona só a peça.

## Como ficou

- **Grupo derivado, sem campo novo no kernel** (`utils/blueprintGrupoDeFundacao.ts`): a estaca é
  do bloco cujo contorno contém o centro dela (mesmo pavimento; blocos sobrepostos → o primeiro);
  o pilar do grupo é o que tem o centro dentro do bloco (pode não haver).
- **Arranjos** (s = 3φ, no referencial do pilar): 1 centro · 2 linha · 3 triângulo equilátero de
  lado s · 4 quadrado · 5 quadrado + centro com lado s√2 (canto–centro = s) · 6 retângulo 2×3 ·
  7 hexágono + centro · 8 malha 3×3 sem centro · 9 malha 3×3 · 10–12 malha r×c (primo → linha,
  com aviso). Teste confere, para n = 1..12: centroide (0,0), menor distância ≥ 3φ, simetria pelo
  eixo do pilar (o triângulo tem 3 eixos; os demais também giram 180°).
- **Bloco envolvente**: ΔU/ΔV das estacas + φ + 15 cm por lado, nunca menor que pilar + 10 cm por
  lado, a cada 5 cm — reproduz 60 × 60 (1 estaca) e 150 × 60 (2) do lançamento automático; 3 →
  150 × 140. O bloco é recentrado no pilar (3.1) e gira com ele.
- **Seleção = grupo**: `selecionar([id])` de bloco/estaca expande para `[bloco, ...estacas]`;
  `selecionarSoAPeca(id)` no duplo clique (canvas: `onSelecionarPeca`, `aoDuploClique` com o
  evento; lista: `onSelecionarPeca` na linha). Mover (arraste, setas, painel) e excluir levam o
  grupo porque a seleção já o contém — nada mudou em `TranslateEntities`.
- **Painel do grupo** (`PainelGrupoDeFundacao`): "B1 · 3 estacas · sob o pilar P1", bloco e
  estacas, botões 1–6 (nome do arranjo no `aria-label`) + campo livre 1–12, Ø, comprimento,
  resumo do critério aplicado, peças (clique = peça sozinha), Δx/Δy "Mover grupo", "Excluir
  grupo". Quantidade/Ø/comprimento aplicam na hora num `runBatch` (`planejarEstacasDoBloco`:
  Delete das estacas → Add das novas com rótulos E<n> reaproveitados → MoveStructuralVertex +
  SetStructuralProps do bloco); a seleção reexpande com as estacas novas (`selecaoPendente`).
- **Painel da peça** (duplo clique): "Estaca do bloco B1 · 3 estacas · [Editar o grupo]".
- **Lista Componentes**: `LinhaDeComponente.paiId`; estacas aninhadas sob o bloco (nível 3);
  subgrupo "Estaca" só com órfãs; contagem do subgrupo = peças do tipo; o olho do subgrupo/bloco
  alcança as estacas aninhadas.
- **Lançamento automático unificado**: `estacasPorBloco` 1–12 com o mesmo arranjo
  (`comprimentoDoBlocoDeDuas` saiu; `ladoDoBloco` = caso n = 1).

## Verificação

- `__tests__/blueprintGrupoDeFundacao.test.ts` (23) · fundações (14, +1: 3 estacas) ·
  `blueprintComponentes` (+1 paiId) · `PainelComponentes` (+2: aninhamento e olho; duplo clique) ·
  editor (+1: 1 clique = grupo; 3 → triângulo, 150 × 140, E1/E2/E3; campo livre 7 → hexágono;
  duplo clique → painel da estaca com "Editar o grupo"; Desfazer). Suíte 330 arquivos / 4360 ·
  tsc · `check-ui-standard.sh` (4 arquivos) · build.
- App real na planta do usuário (vite 3147, Playwright, escritas a `/rest/v1/**` abortadas — 15,
  0 erros JS): E1 aninhada em B1; 1 clique em E1 → "GRUPO DE FUNDAÇÃO B1 · 1 estaca · sob o
  pilar P1"; botão 3 → "B1 · 3 estacas · Bloco 150 × 140 × 60 · Arranjo triângulo · 90 cm";
  duplo clique em E1 → "Estaca do bloco B1 · 3 estacas · Editar o grupo"; no 3D o grupo acende
  (bloco + 3 estacas) com o mesmo painel. Capturas `out-grupo/g-0{1..4}-*.png`.

## Riscos declarados

Bloco desenhado à mão que contenha estacas de blocos vizinhos sobrepostos: cada estaca é do
PRIMEIRO bloco na ordem do modelo · n primo > 9 vira linha com aviso · o bloco de 3 estacas é o
retângulo envolvente (o kernel não tem PONTO triangular).
