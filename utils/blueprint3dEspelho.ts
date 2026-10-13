/**
 * O DESENHO NO MUNDO 3D, SEM ESPELHO (12/10/2026).
 *
 * O 3D da Planta monta tudo no ESPAÇO DO DESENHO: `X = x`, `Y = cota`,
 * `Z = +y` (paredes, `shapeDoAnel`, `malhaDaGrade`, `cameraNoMundo3d`…). No
 * three (mão direita, Y para cima), leste = +X e cima = +Y obrigam
 * SUL = +Z — leste × cima = sul. Norte em +Z era a planta vista pelo AVESSO:
 * prédio e lote espelhados parecem certos, e só o texto do mapa colado no
 * relevo denunciou (o nome do rio de trás para frente). É o mesmo defeito que
 * o canvas 2D teve até 09/08/2026.
 *
 * A correção não reescreve a geometria: a cena inteira entra num grupo com
 * esta escala, e só o que vive FORA dela (câmera, órbita, luzes, grade,
 * percorrer, pontos de vista, planos de recorte — que o three aplica em
 * coordenadas do mundo) passa por estas funções. Plano:
 * docs/planos/2026-10-12-3d-sem-espelho.md.
 */

export type Vetor3 = [number, number, number];

/** A escala do grupo da cena: o espaço do desenho (norte em +Z) vira o mundo (norte em −Z). */
export const ESCALA_DO_DESENHO_NO_MUNDO: Vetor3 = [1, 1, -1];

/** Um ponto (ou direção) do espaço do desenho no mundo. É a própria inversa: serve nos dois sentidos. */
export function doDesenhoParaMundo(p: readonly [number, number, number]): Vetor3 {
  return [p[0], p[1], -p[2]];
}

/**
 * Um plano `n·p + c = 0` do espaço do desenho, no mundo. Com `p' = (x, y, −z)`,
 * `(nx, ny, −nz)·p' + c` = `n·p + c`: a normal troca o z, a constante fica.
 */
export function planoNoMundo(pl: { normal: readonly [number, number, number]; constante: number }): { normal: Vetor3; constante: number } {
  return { normal: doDesenhoParaMundo(pl.normal), constante: pl.constante };
}
