/**
 * OS FUROS PREVISTOS NA ESTRUTURA (F14c da casa automática, 16/10/2026).
 *
 * Decisão do usuário (16/10): *"Manter 2,80 m, furar vigas"* — a rede que passa de um cômodo ao outro no forro
 * atravessa a viga, e cada passagem vira FURO PREVISTO na lista para o calculista (posição, diâmetro e a viga).
 *
 * A lista sai dos encontros trecho × peça estrutural (`conflitosDoModelo`): viga, viga de fundação (baldrame) e laje.
 * Para a viga, os critérios que DISPENSAM a verificação do furo (NBR 6118, 13.2.5.1 — furo que atravessa a viga na
 * direção da largura) entram como HIPÓTESES, para conferir: diâmetro até 12 cm e até h/3; a pelo menos 2h da face do
 * apoio; furos de um mesmo tramo a pelo menos 2h entre si. Fora deles, "verificar com o calculista" — nunca
 * "proibido": quem decide a armadura em volta do furo é ele. Na laje, a passagem é listada (o shaft, a coluna, o tubo
 * de queda) sem critério de dispensa.
 */
import { conflitosDoModelo, envelopeDoTrecho, type BlueprintModel, type ObjectId, type Point, type Structural, type Trecho } from './blueprintKernel';

export interface HipotesesDosFuros {
  /** Diâmetro máximo do furo que dispensa a verificação, mm. */
  diametroMaximoMm: number;
  /** E no máximo esta fração da altura da viga. */
  fracaoDaAltura: number;
  /** A face do furo a pelo menos isto × a altura da viga da face do apoio. */
  distanciaDoApoioEmAlturas: number;
  /** Furos de um mesmo tramo a pelo menos isto × a altura da viga entre as faces. */
  distanciaEntreFurosEmAlturas: number;
  /** O furo é o tubo (com o isolamento) mais esta folga em volta (a camisa), mm. */
  folgaDoFuroMm: number;
}

export const HIPOTESES_DOS_FUROS_PADRAO: HipotesesDosFuros = {
  diametroMaximoMm: 120,
  fracaoDaAltura: 1 / 3,
  distanciaDoApoioEmAlturas: 2,
  distanciaEntreFurosEmAlturas: 2,
  folgaDoFuroMm: 10,
};

export interface FuroPrevisto {
  /** A peça furada. */
  pecaId: ObjectId;
  peca: string;
  tipoDaPeca: 'VIGA' | 'VIGA_FUNDACAO' | 'LAJE';
  levelId: ObjectId;
  trechoId: ObjectId;
  disciplina: Trecho['disciplina'];
  /** HORIZONTAL atravessa a viga de lado a lado; VERTICAL desce por ela (ou pela laje). */
  direcao: 'HORIZONTAL' | 'VERTICAL';
  diametroMm: number;
  /** Onde, em planta, e a cota do centro do furo (do piso do pavimento da peça). */
  ponto: Point;
  cotaMm: number;
  /** Ao longo do eixo da viga, do começo dela; e até a face do apoio mais perto (só na viga). */
  aoLongoMm: number | null;
  distanciaAoApoioMm: number | null;
  /** `true` = dispensa a verificação pelos critérios (hipóteses); `false` = verificar com o calculista; `null` = laje. */
  dispensa: boolean | null;
  motivos: string[];
  /**
   * 25/10/2026 ("eletrodutos conduite nao bifurca"): os trechos que passam JUNTOS por este furo — os eletrodutos que
   * correm lado a lado atravessam a peça no mesmo lugar, por um furo só, do tamanho do feixe. Ausente = só `trechoId`.
   */
  trechoIds?: ObjectId[];
}

/** O vão entre dois eletrodutos lado a lado no feixe, mm — o mesmo do 3D (`VAO_ENTRE_ELETRODUTOS_MM`). */
const VAO_NO_FEIXE_MM = 10;

const projecao = (p: { x: number; y: number }, a: Point, b: Point) => {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  return { t: (p.x - a.x) * u.x + (p.y - a.y) * u.y, d: Math.abs((p.x - a.x) * u.y - (p.y - a.y) * u.x), L };
};

/** O ponto do trecho (em planta e cota) mais perto do eixo da peça — onde ele a atravessa. */
function travessia(t: Trecho, peca: Structural): { ponto: Point; cotaMm: number } {
  if (t.a.x === t.b.x && t.a.y === t.b.y) {
    const meio = peca.kind === 'LAJE' ? peca.baseMm + peca.alturaMm / 2 : Math.max(Math.min(t.cotaAMm, t.cotaBMm), peca.baseMm) / 2 + Math.min(Math.max(t.cotaAMm, t.cotaBMm), peca.baseMm + peca.alturaMm) / 2;
    return { ponto: { x: t.a.x, y: t.a.y } as Point, cotaMm: Math.round(meio) };
  }
  const [a, b] = [peca.pontos[0], peca.pontos[peca.pontos.length - 1]];
  let melhor = { k: 0, d: Infinity };
  for (let k = 0; k <= 40; k++) {
    const q = { x: t.a.x + ((t.b.x - t.a.x) * k) / 40, y: t.a.y + ((t.b.y - t.a.y) * k) / 40 };
    const d = peca.kind === 'LAJE' ? 0 : projecao(q, a, b).d;
    if (d < melhor.d) melhor = { k, d };
  }
  const f = melhor.k / 40;
  return { ponto: { x: Math.round(t.a.x + (t.b.x - t.a.x) * f), y: Math.round(t.a.y + (t.b.y - t.a.y) * f) } as Point, cotaMm: Math.round(t.cotaAMm + (t.cotaBMm - t.cotaAMm) * f) };
}

/**
 * A distância, ao longo do eixo da viga, de `ponto` à FACE do apoio mais perto (mm, antes de descontar o raio do furo).
 * O apoio é o da NBR 6118 13.2.5.1 como esta lista o lê: as PONTAS da peça (onde ela se apoia — em pilar ou em outra
 * viga) e os pilares sobre o eixo dela (centro a até a largura da viga). É a régua única: `paredesDoForro` a usa para pôr
 * a travessia fora da zona de 2h (correção 1, 24/10/2026) — antes ela via só os pilares, e o furo "previsto" caía junto
 * da ponta da viga e saía "verificar".
 */
export function distanciaAoApoioDaViga(peca: Pick<Structural, 'kind' | 'levelId' | 'pontos' | 'larguraMm'>, ponto: { x: number; y: number }, pilares: readonly Pick<Structural, 'levelId' | 'pontos' | 'larguraMm' | 'profundidadeMm'>[]): number {
  const [a, b] = [peca.pontos[0], peca.pontos[peca.pontos.length - 1]];
  const pr = projecao(ponto, a, b);
  let d = Math.min(pr.t, pr.L - pr.t);
  for (const p of pilares) {
    if (p.levelId !== peca.levelId && peca.kind !== 'VIGA_FUNDACAO') continue;
    const pp = projecao(p.pontos[0], a, b);
    if (pp.d > peca.larguraMm) continue;
    d = Math.min(d, Math.abs(pp.t - pr.t) - Math.max(p.larguraMm, p.profundidadeMm) / 2);
  }
  return d;
}

/**
 * Os furos previstos do modelo — um por (trecho, peça) que se encontram — com a avaliação dos critérios na viga.
 * Ordenados por peça e posição ao longo dela.
 */
export function furosPrevistos(model: BlueprintModel, hip: HipotesesDosFuros = HIPOTESES_DOS_FUROS_PADRAO): FuroPrevisto[] {
  const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const pecas = new Map((model.structures ?? []).map((s) => [s.id, s]));
  const pilares = (model.structures ?? []).filter((s) => s.kind === 'PILAR');
  const saida: FuroPrevisto[] = [];
  // Os que atravessam a MESMA peça no MESMO lugar (os eletrodutos repetidos que correm juntos) passam por um furo só:
  // o diâmetro é o do feixe — os tubos lado a lado, com o vão entre eles, mais a folga. Contados um a um, cada furo
  // tinha o outro "a menos de 2h" e todos saíam "verificar".
  const grupos = new Map<string, { peca: Structural; t: Trecho; ids: ObjectId[]; tubosMm: number[]; ponto: Point; cotaMm: number; direcao: 'HORIZONTAL' | 'VERTICAL' }>();
  for (const c of conflitosDoModelo(model)) {
    if (c.classe !== 'ESTRUTURA') continue;
    const peca = pecas.get(c.outroId);
    const t = porId.get(c.trechoId);
    if (!peca || !t || !['VIGA', 'VIGA_FUNDACAO', 'LAJE'].includes(peca.kind)) continue;
    const env = envelopeDoTrecho(t);
    const tuboMm = 2 * Math.max(env.raioPlantaMm, env.raioVerticalMm);
    const { ponto, cotaMm } = travessia(t, peca);
    const direcao = t.a.x === t.b.x && t.a.y === t.b.y ? 'VERTICAL' : 'HORIZONTAL';
    const k = `${peca.id}|${t.disciplina}|${direcao}|${ponto.x},${ponto.y},${cotaMm}`;
    const g = grupos.get(k);
    if (g) {
      g.ids.push(t.id);
      g.tubosMm.push(tuboMm);
    } else grupos.set(k, { peca, t, ids: [t.id], tubosMm: [tuboMm], ponto, cotaMm, direcao });
  }
  for (const { peca, t, ids, tubosMm, ponto, cotaMm, direcao } of grupos.values()) {
    const feixeMm = tubosMm.reduce((s, d) => s + d, 0) + (tubosMm.length - 1) * VAO_NO_FEIXE_MM;
    const diametroMm = Math.round(feixeMm + 2 * hip.folgaDoFuroMm);
    let aoLongoMm: number | null = null;
    let distanciaAoApoioMm: number | null = null;
    if (peca.kind !== 'LAJE' && peca.pontos.length >= 2) {
      const [a, b] = [peca.pontos[0], peca.pontos[peca.pontos.length - 1]];
      const pr = projecao(ponto, a, b);
      aoLongoMm = Math.round(pr.t);
      // O apoio: os pilares sobre o eixo da viga (face) e as pontas dela.
      const d = distanciaAoApoioDaViga(peca, ponto, pilares);
      distanciaAoApoioMm = Math.round(Math.max(0, d - diametroMm / 2));
    }
    saida.push({
      pecaId: peca.id,
      peca: peca.rotulo ?? peca.id,
      tipoDaPeca: peca.kind as FuroPrevisto['tipoDaPeca'],
      levelId: peca.levelId,
      trechoId: t.id,
      disciplina: t.disciplina,
      direcao,
      diametroMm,
      ponto,
      cotaMm,
      aoLongoMm,
      distanciaAoApoioMm,
      dispensa: null,
      motivos: [],
      ...(ids.length > 1 ? { trechoIds: ids } : {}),
    });
  }
  saida.sort((x, y) => x.peca.localeCompare(y.peca) || (x.aoLongoMm ?? 0) - (y.aoLongoMm ?? 0) || x.cotaMm - y.cotaMm);
  // Os critérios, na viga (o baldrame também é viga).
  const cm = (mm: number) => `${(mm / 10).toFixed(mm % 10 === 0 ? 0 : 1).replace('.', ',')} cm`;
  for (const f of saida) {
    if (f.tipoDaPeca === 'LAJE') continue;
    const peca = pecas.get(f.pecaId)!;
    const h = peca.alturaMm;
    const limite = Math.min(hip.diametroMaximoMm, h * hip.fracaoDaAltura);
    if (f.direcao === 'VERTICAL') f.motivos.push('furo VERTICAL na viga (desce por ela)');
    if (f.diametroMm > limite) f.motivos.push(`Ø ${cm(f.diametroMm)} acima de ${cm(Math.round(limite))} (12 cm e h/3)`);
    if (f.distanciaAoApoioMm != null && f.distanciaAoApoioMm < hip.distanciaDoApoioEmAlturas * h) f.motivos.push(`a ${cm(f.distanciaAoApoioMm)} do apoio (pede ${cm(hip.distanciaDoApoioEmAlturas * h)})`);
    const vizinho = saida.find((g) => g !== f && g.pecaId === f.pecaId && g.aoLongoMm != null && f.aoLongoMm != null && Math.abs(g.aoLongoMm - f.aoLongoMm) - (g.diametroMm + f.diametroMm) / 2 < hip.distanciaEntreFurosEmAlturas * h);
    if (vizinho) f.motivos.push(`outro furo a menos de ${cm(hip.distanciaEntreFurosEmAlturas * h)} (${vizinho.disciplina.toLowerCase().replace('_', ' ')})`);
    f.dispensa = f.motivos.length === 0;
  }
  return saida;
}
