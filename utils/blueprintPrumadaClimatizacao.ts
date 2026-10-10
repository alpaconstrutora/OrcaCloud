/**
 * A PRUMADA DA CLIMATIZAÇÃO ENTRE PAVIMENTOS (10/10/2026, pendências C1 e C2 do
 * roadmap de climatização).
 *
 * A linha frigorígena que liga uma evaporadora a uma condensadora de OUTRO
 * pavimento (a do split na cobertura, o tronco do VRF que desce aos andares)
 * sobe ou desce por uma PRUMADA: um lance vertical por pavimento, na mesma
 * posição em planta — o molde da prumada do eletroduto (`blueprintEletrodutos`).
 * No pavimento de partida o lance vai da cota da linha ao teto (ou ao piso); nos
 * do meio, de piso a teto; no de chegada, do piso (ou do teto) à cota de chegada.
 * O nó do teto de um pavimento é o mesmo do piso do de cima (`fazerChave`), e é
 * assim que a rede se emenda sem nada novo no kernel.
 *
 * A prumada corre por um SHAFT que atravesse todos os pavimentos do caminho, se
 * houver um perto da condensadora (`raioDoShaftMm`, hipótese editável); senão,
 * na posição da própria condensadora.
 *
 * Quem lança a prumada deixa trechos em outros pavimentos — e relançar tem de
 * achá-los. `componentesSugeridos` agrupa os trechos sugeridos pela continuidade
 * da rede (chave de mundo), para cada planejador apagar os SEUS onde estiverem.
 */
import type { BlueprintModel, Level, ObjectId, Trecho } from './blueprintKernel';
import { pavimentosDoNucleo } from './blueprintKernel';
import { fazerChave, type No } from './blueprintGrafoDeRede';
import { centroDoNucleo } from './blueprintNucleoVertical';
import type { P2 } from './blueprintRotaPelasParedes';

const porElevacao = (model: BlueprintModel): Level[] => [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm || a.id.localeCompare(b.id));

/** Os pavimentos de `deId` a `paraId`, inclusive, na ordem do caminho. */
export function pavimentosEntre(model: BlueprintModel, deId: ObjectId, paraId: ObjectId): Level[] {
  const niveis = porElevacao(model);
  const i = niveis.findIndex((l) => l.id === deId);
  const j = niveis.findIndex((l) => l.id === paraId);
  if (i < 0 || j < 0) return [];
  return i <= j ? niveis.slice(i, j + 1) : niveis.slice(j, i + 1).reverse();
}

export interface LanceDaPrumada {
  levelId: ObjectId;
  cotaAMm: number;
  cotaBMm: number;
}

/**
 * Os lances verticais da prumada, orientados de `de` para `para`. No mesmo
 * pavimento é um lance só (de uma cota à outra).
 */
export function lancesDaPrumada(model: BlueprintModel, de: { levelId: ObjectId; cotaMm: number }, para: { levelId: ObjectId; cotaMm: number }): LanceDaPrumada[] {
  const caminho = pavimentosEntre(model, de.levelId, para.levelId);
  if (caminho.length <= 1) return [{ levelId: de.levelId, cotaAMm: de.cotaMm, cotaBMm: para.cotaMm }];
  const sobe = caminho[1].elevationMm > caminho[0].elevationMm;
  return caminho.map((l, k) => {
    const primeiro = k === 0;
    const ultimo = k === caminho.length - 1;
    const entrada = primeiro ? de.cotaMm : sobe ? 0 : l.defaultHeightMm;
    const saida = ultimo ? para.cotaMm : sobe ? l.defaultHeightMm : 0;
    return { levelId: l.id, cotaAMm: entrada, cotaBMm: saida };
  });
}

/**
 * Onde a prumada corre em planta: o centro do SHAFT (tipo SHAFT, sem disciplina
 * ou MECANICA) mais perto de `perto`, a até `raioMm`, que atravesse TODOS os
 * `niveis`; senão `perto` mesmo. Coordenadas em mm inteiros (a rede emenda por
 * coincidência exata).
 */
export function pontoDaPrumada(model: BlueprintModel, perto: P2, niveis: readonly ObjectId[], raioMm: number): { at: P2; shaft: boolean } {
  let melhor: { at: P2; d: number } | null = null;
  for (const n of model.nucleos ?? []) {
    if (n.tipo !== 'SHAFT' || (n.disciplina != null && n.disciplina !== 'MECANICA')) continue;
    const atravessa = new Set(pavimentosDoNucleo(model, n).map((l) => l.id));
    if (!niveis.every((id) => atravessa.has(id))) continue;
    const c = centroDoNucleo(n);
    const at = { x: Math.round(c.x), y: Math.round(c.y) };
    const d = Math.hypot(at.x - perto.x, at.y - perto.y);
    if (d <= raioMm && (!melhor || d < melhor.d)) melhor = { at, d };
  }
  return melhor ? { at: melhor.at, shaft: true } : { at: { x: perto.x, y: perto.y }, shaft: false };
}

/**
 * Os trechos agrupados pela continuidade da rede: dois trechos ficam no mesmo
 * grupo quando têm uma ponta no mesmo nó (chave de mundo — a prumada emenda os
 * pavimentos). Devolve, por grupo, os trechos e os nós.
 */
export function componentesSugeridos(model: BlueprintModel, trechos: readonly Trecho[]): { trechos: Trecho[]; nos: Set<No> }[] {
  const chave = fazerChave(model.levels);
  const pai = new Map<string, string>();
  const raiz = (k: string): string => {
    let r = k;
    while (pai.get(r) !== r) r = pai.get(r)!;
    let x = k;
    while (pai.get(x) !== r) {
      const prox = pai.get(x)!;
      pai.set(x, r);
      x = prox;
    }
    return r;
  };
  const no = (k: string) => {
    if (!pai.has(k)) pai.set(k, k);
    return k;
  };
  const unir = (a: string, b: string) => pai.set(raiz(no(a)), raiz(no(b)));
  const pontas = (t: Trecho): [No, No] => [chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm)];
  for (const t of trechos) {
    const [a, b] = pontas(t);
    unir(`t:${t.id}`, a);
    unir(`t:${t.id}`, b);
  }
  const grupos = new Map<string, { trechos: Trecho[]; nos: Set<No> }>();
  for (const t of trechos) {
    const r = raiz(`t:${t.id}`);
    let g = grupos.get(r);
    if (!g) grupos.set(r, (g = { trechos: [], nos: new Set() }));
    g.trechos.push(t);
    for (const p of pontas(t)) g.nos.add(p);
  }
  return [...grupos.values()];
}
