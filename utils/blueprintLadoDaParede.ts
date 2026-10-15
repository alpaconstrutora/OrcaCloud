/**
 * A PAREDE DE UM LADO DO AMBIENTE (F9 da casa automática, 15/10/2026).
 *
 * O lado a–b do anel de um ambiente corre sobre qual parede? Por DISTÂNCIA à reta da parede, e não por
 * colinearidade exata. Num desenho girado, os vértices do arranjo são interseções arredondadas ao mm (ou
 * pontas esticadas) e nunca caem exatamente na reta: o teste exato não achava parede nenhuma. Foi assim
 * que o ambiente ficou sem janela e sem recuo de face nas regras (F3, 14/10/2026); e, nas tomadas, o lado
 * de piso ficava no EIXO, e a tomada caía na borda do ambiente e sumia da contagem (F9, a 17° e a 30°).
 *
 * Era uma cópia por arquivo (regras, distribuição de pontos, grafo espacial, unidades); fica uma só.
 */
import type { Wall } from './blueprintKernel';

type P = { x: number; y: number };

/**
 * O arranjo do kernel une pontas a até 5 mm (o snap da junção em T): num desenho girado, a parede
 * interna passa `ALEM_MM` = 3 mm além do encontro e o VÉRTICE do ambiente fica nessa ponta, 3 mm
 * fora da reta da parede hospedeira. A tolerância do lado acompanha a do arranjo.
 */
export const TOLERANCIA_DO_LADO_MM = 5;

/** A parede contém o lado a–b (as duas pontas a até `tolMm` da reta e dentro do comprimento dela)? */
export function paredeContemLado(w: Pick<Wall, 'a' | 'b'>, a: P, b: P, tolMm = TOLERANCIA_DO_LADO_MM): boolean {
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (L < 1e-9) return false;
  const dist = (p: P) => Math.abs((w.b.x - w.a.x) * (p.y - w.a.y) - (w.b.y - w.a.y) * (p.x - w.a.x)) / L;
  const entre = (p: P) => {
    const t = ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / L;
    return t >= -tolMm && t <= L + tolMm;
  };
  return dist(a) <= tolMm && dist(b) <= tolMm && entre(a) && entre(b);
}

/** A parede sobre a qual o lado a→b corre — a primeira, na ordem dada — ou `null`. */
export function paredeDoLado<W extends Pick<Wall, 'a' | 'b'>>(paredes: readonly W[], a: P, b: P): W | null {
  return paredes.find((w) => paredeContemLado(w, a, b)) ?? null;
}
