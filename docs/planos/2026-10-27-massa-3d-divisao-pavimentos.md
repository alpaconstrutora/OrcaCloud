# Massa no 3D: divisão dos pavimentos (27/10/2026)

## Pedido original

> "Faça uma divisão dos pavimentos" (com a imagem do 3D da "Planta 26/10/2026": duas torres azuis lisas sobre o
> subsolo, sem nenhuma linha entre um pavimento e outro)

## Diagnóstico

- O 3D já monta um prisma por pavimento: `massa3d` no editor, um item por `m.pisos`.
- Os prismas são da mesma cor, e o `<Edges>` do drei (LineSegments2) que deveria contornar cada um não aparece na
  massa em produção. Ampliei o 3D no Chrome do usuário e não havia aresta nem nos cantos das torres. Por isso a
  torre de 6 pavimentos aparecia como um bloco só.

## Correção

- `Blueprint3DViewer` › `prismasDaMassa` ganha `arestas = new THREE.EdgesGeometry(geom)`, desenhado como
  `<lineSegments>` + `lineBasicMaterial`, a mesma linha comum do WebGL das curvas de nível. O contorno de cada
  pavimento aparece, e a junção entre dois pavimentos vira a linha do piso.
- O material da face recebe `polygonOffset` (fator 1), para a linha no mesmo plano vencer a profundidade.
- Cores: ardósia-escura normal, azul na seleção, vermelho quando o pavimento tem problema (as mesmas regras do
  `<Edges>` anterior).

## Verificação

- tsc e testes que importam o `Blueprint3DViewer`.
- Produção: o 3D da "Planta 26/10/2026" no Chrome do usuário, ampliado, com 6 faixas por torre e 1 no subsolo.
