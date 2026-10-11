/**
 * QUAL AMBIENTE ESTÁ SOB O PONTO (F2 do plano `2026-10-11-planta-recursos-video-synaps.md`).
 *
 * A ferramenta "Ambiente" realça o ambiente sob o cursor e o nomeia no clique.
 * O teste é o mesmo que o kernel usa para religar a etiqueta ao ambiente
 * (`NameSpace`, `aplicarEtiquetas`): dentro do anel E fora de todos os furos.
 *
 * O furo importa: um pátio fechado no meio da casa é outro ambiente, e o anel
 * da casa o contém. Sem descontar o furo, passar o mouse no pátio realçaria a
 * casa inteira — e o clique renomearia o ambiente errado.
 */

import { pointInPolygon, type Point, type Space } from './blueprintKernel';

export function ambienteNoPonto<S extends Pick<Space, 'ring' | 'holes'>>(ambientes: readonly S[], p: Point): S | null {
  for (const s of ambientes) {
    if (!pointInPolygon(s.ring, p)) continue;
    if (s.holes.some((h) => pointInPolygon(h, p))) continue;
    return s;
  }
  return null;
}
