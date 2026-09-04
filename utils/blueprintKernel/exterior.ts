/**
 * Parede EXTERNA ou INTERNA — derivado do arranjo, para o `Pset_WallCommon.IsExternal`
 * do IFC e para quem mais precisar.
 *
 * A pergunta é respondida pelos ambientes, não pelo contorno externo: amostra-se
 * um ponto de cada lado da parede, logo além da face, e vê-se se ele cai dentro
 * de algum `Space` do mesmo pavimento.
 *
 *   • um lado dentro, outro fora  → EXTERNA (`true`)
 *   • os dois lados dentro        → INTERNA (`false`) — divide dois ambientes
 *   • nenhum lado dentro          → `null` — parede solta, muro, desenho sem
 *                                   ambiente fechado. Não se afirma nada: no IFC
 *                                   a propriedade é OMITIDA, nunca inventada.
 *
 * `contornoExternoDoNivel` não serve aqui: ele é por FACE e a parede é por EIXO,
 * e casar os dois com tolerância é exatamente o tipo de conta que erra em
 * parede fina encostada em parede grossa. A amostragem é direta e usa o mesmo
 * `pointInPolygon` que religa as etiquetas de ambiente.
 */

import { DEFAULT_TOLERANCE_MM } from './units';
import { pointInPolygon, type Point } from './geom';
import { type BlueprintModel, type Wall, wallLength } from './model';

export function paredeEhExterna(
  model: BlueprintModel,
  wall: Wall,
  tolerance = DEFAULT_TOLERANCE_MM,
): boolean | null {
  const comp = wallLength(wall);
  if (comp <= 0) return null;

  const ux = (wall.b.x - wall.a.x) / comp;
  const uy = (wall.b.y - wall.a.y) / comp;
  // Normal ESQUERDA do sentido a → b — a mesma do canvas e do `+Y` local no IFC.
  const nx = -uy;
  const ny = ux;
  const mx = (wall.a.x + wall.b.x) / 2;
  const my = (wall.a.y + wall.b.y) / 2;
  // Um pouco além da face, para não cair sobre a aresta do anel (o anel do
  // ambiente é o EIXO, então a face já está dentro dele — o ponto tem de sair
  // da meia espessura e ainda da tolerância de junção).
  const d = wall.thicknessMm / 2 + 2 * tolerance + 1;

  const dentro = (p: Point) =>
    model.spaces.some(
      (s) =>
        s.levelId === wall.levelId &&
        pointInPolygon(s.ring, p) &&
        !s.holes.some((h) => pointInPolygon(h, p)),
    );

  const esquerda = dentro({ x: mx + nx * d, y: my + ny * d });
  const direita = dentro({ x: mx - nx * d, y: my - ny * d });

  if (esquerda && direita) return false;
  if (esquerda || direita) return true;
  return null;
}
