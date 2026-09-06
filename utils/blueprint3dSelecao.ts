// utils/blueprint3dSelecao.ts
//
// Clicar numa peça do 3D sem confundir com ORBITAR.
//
// ─── O PROBLEMA ──────────────────────────────────────────────────────────────
//
// Numa cena 3D o mesmo botão do mouse faz duas coisas: arrastar gira a câmera,
// clicar escolhe a peça. O `onClick` do R3F dispara no `pointerup` mesmo depois
// de um arraste — então girar a cena e soltar o botão sobre uma parede a
// selecionaria, e a pessoa veria o painel trocar sem ter pedido nada.
//
// A decisão mora aqui, e não no componente, porque `Blueprint3DViewer` está sob
// `@ts-nocheck` (a augmentation de JSX do R3F saiu do programa TS) — nem
// compilador nem teste alcançam lá dentro. É a mesma lição que o enquadramento
// e a grade já custaram.

/** Quantos pixels de arraste ainda contam como clique parado. */
export const TOLERANCIA_DE_CLIQUE_PX = 4;

/**
 * Foi CLIQUE, ou foi órbita?
 *
 * Quatro pixels: acima disso a intenção era girar; abaixo, escolher. O limite
 * não é zero de propósito — a mão treme, e exigir imobilidade perfeita
 * transformaria metade dos cliques em nada, que é um defeito pior porque parece
 * intermitente.
 *
 * Sem ponto de partida não há como saber, e o silêncio é a resposta segura:
 * selecionar sem ter visto o `pointerdown` seria adivinhar.
 */
export function ehClique(
  inicio: { x: number; y: number } | null,
  fim: { x: number; y: number },
): boolean {
  if (!inicio) return false;
  return Math.hypot(fim.x - inicio.x, fim.y - inicio.y) <= TOLERANCIA_DE_CLIQUE_PX;
}
