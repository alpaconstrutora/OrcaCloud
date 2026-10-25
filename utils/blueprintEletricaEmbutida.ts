/**
 * A ELÉTRICA EMBUTIDA NA PAREDE, no 3D (25/10/2026).
 *
 * O pedido, com print do 3D da Garden: *"Conduites descem embutidos na parede. as caixas de tomadas e interrrptores
 * tambem"*.
 *
 * O ponto elétrico de parede mora na FACE (é onde a barra do símbolo encosta, #157), e o motor desce o eletroduto ali —
 * no rasgo da face, e não no eixo, onde corre o dreno do ar. O 3D centrava a caixa e a descida nesse ponto: metade de
 * cada uma ficava no ambiente, e a caixa de 100 mm saía da parede como um cubo pendurado.
 *
 * Aqui só se diz ONDE elas ficam, em planta:
 *
 *   caixa ........ a frente rente à face (`RESSALTO_DA_CAIXA_MM` à frente dela, o espelho — no mesmo plano da
 *                  face as duas superfícies brigam no desenho), o corpo para dentro (nunca além do eixo quando a
 *                  caixa é mais funda que meia parede: aí fica no eixo)
 *   eletroduto ... a DESCIDA (o pedaço vertical) que está na face anda para dentro junto: até o centro da caixa, se
 *                  ali há uma; senão `EMBUTIDO_DO_ELETRODUTO_MM` (o rasgo de passagem). A ponta de um pedaço
 *                  horizontal que chega nela anda junto (o tubo não se solta); o horizontal que só passa rente à
 *                  face — no forro, no piso — fica onde está
 *
 * ⚠️ É DESENHO: o modelo continua com o ponto na face (o símbolo, o acerto do clique e o motor dependem disso). O IFC,
 * o Collada, o corte e o clash ainda medem pela face — a diferença é o meio fundo da caixa.
 */
import type { BlueprintModel, ObjectId, Point, SegmentoDoTrecho, Terminal, Trecho, Wall } from './blueprintKernel';
import { segmentosDoEletroduto } from './blueprintKernel';
import { encaixarNaParede } from './blueprintRotaPelasParedes';
import { medidasDoTerminal } from './blueprintRede';

/** Até esta distância da face (para fora ou para dentro) o ponto conta como "na face". */
export const FOLGA_DA_FACE_MM = 30;
/** O eletroduto que desce na face sem caixa ali entra isto na parede (o centro de uma caixa 4×2 padrão). */
export const EMBUTIDO_DO_ELETRODUTO_MM = 50;
/** A frente da caixa fica isto à frente da face: o espelho. No plano da face, caixa e parede brigam no 3D (z-fighting). */
export const RESSALTO_DA_CAIXA_MM = 3;

export interface EmbutimentoEletrico {
  /** O centro em planta da caixa embutida do terminal, ou `null` (não é ponto elétrico de parede). */
  caixa: (t: Terminal) => Point | null;
  /** Os pedaços retos do trecho (`segmentosDoEletroduto`) como o 3D os desenha: no eletroduto, a descida na face e as pontas que chegam nela dentro da parede. */
  segmentos: (t: Trecho) => SegmentoDoTrecho[];
}

const chave = (levelId: ObjectId, p: Point) => `${levelId}|${p.x},${p.y}`;

/** A parede em cuja FACE está `p`: o pé no eixo, a normal do eixo para o lado de `p` e a meia espessura. */
function naFace(p: Point, paredes: readonly Wall[]): { q: Point; n: { x: number; y: number }; meia: number } | null {
  const maiorMeia = paredes.reduce((m, w) => Math.max(m, w.thicknessMm / 2), 0);
  const e = encaixarNaParede(p, paredes, maiorMeia + FOLGA_DA_FACE_MM);
  if (!e || e.d < 1) return null; // no eixo: lado ambíguo
  const meia = e.parede.thicknessMm / 2;
  if (Math.abs(e.d - meia) > FOLGA_DA_FACE_MM) return null;
  return { q: e.q, n: { x: (p.x - e.q.x) / e.d, y: (p.y - e.q.y) / e.d }, meia };
}

/** A `dentroMm` da face para dentro da parede, nunca além do eixo. */
const paraDentro = (f: { q: Point; n: { x: number; y: number }; meia: number }, dentroMm: number): Point => {
  const doEixo = f.meia - Math.min(dentroMm, f.meia);
  return { x: Math.round(f.q.x + f.n.x * doEixo), y: Math.round(f.q.y + f.n.y * doEixo) };
};

export function embutimentoEletrico(model: BlueprintModel): EmbutimentoEletrico {
  const paredesDo = new Map<ObjectId, Wall[]>();
  for (const w of model.walls) {
    const lista = paredesDo.get(w.levelId);
    if (lista) lista.push(w);
    else paredesDo.set(w.levelId, [w]);
  }
  const caixas = new Map<string, Point>();
  const caixaDe = new Map<ObjectId, Point>();
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'ELETRICA' || t.tipoEletrico === 'ILUMINACAO_TETO') continue;
    const f = naFace(t.at, paredesDo.get(t.levelId) ?? []);
    if (!f) continue;
    const c = paraDentro(f, medidasDoTerminal(t).profundidadeMm / 2 - RESSALTO_DA_CAIXA_MM);
    caixaDe.set(t.id, c);
    caixas.set(chave(t.levelId, t.at), c);
  }
  const alturaDo = new Map(model.levels.map((l) => [l.id, l.defaultHeightMm]));
  const pedacos = (t: Trecho) => segmentosDoEletroduto(t, alturaDo.get(t.levelId) ?? 2800);
  /** Onde o eletroduto entra na parede: as caixas e as descidas que estão na face. */
  const descidas = new Map<string, Point>(caixas);
  for (const t of model.trechos ?? []) {
    if (t.disciplina !== 'ELETRICA') continue;
    for (const sg of pedacos(t)) {
      if (sg.a.x !== sg.b.x || sg.a.y !== sg.b.y) continue;
      const k = chave(t.levelId, sg.a);
      if (descidas.has(k)) continue;
      const f = naFace(sg.a, paredesDo.get(t.levelId) ?? []);
      if (f) descidas.set(k, paraDentro(f, EMBUTIDO_DO_ELETRODUTO_MM));
    }
  }
  const mover = (levelId: ObjectId, p: Point) => descidas.get(chave(levelId, p)) ?? p;
  return {
    caixa: (t) => caixaDe.get(t.id) ?? null,
    segmentos: (t) =>
      t.disciplina !== 'ELETRICA' ? pedacos(t) : pedacos(t).map((sg) => ({ ...sg, a: mover(t.levelId, sg.a), b: mover(t.levelId, sg.b) })),
  };
}
