/**
 * Prédio automático — o CONTORNO DOS PILARES para as redes que o prédio traça em linha reta (PA22 do plano
 * docs/planos/2026-11-12-predio-automatico.md, 17/11/2026, decisão do usuário 4a): o condutor pluvial enterrado, o
 * alimentador de água, a rede de incêndio enterrada, a drenagem da garagem. Os pilares de QUALQUER pavimento cuja altura
 * alcança a cota do tubo (o do térreo desce até a fundação, a −0,50 m; o do subsolo sobe até o piso do térreo), com a
 * pegada crescida pelo raio do tubo e a folga; o caminho por fora deles (`desvioDoPilar`, o do eletroduto), e os pedaços
 * com a cota pelo comprimento.
 */
import { envelopeDoTrecho, pegadaEmPlanta, type BlueprintModel, type Command, type DisciplinaDeRede, type ObjectId, type Point, type Trecho } from '../blueprintKernel';
import { anelDoPilar, desvioDoPilar, fracaoDentro } from '../blueprintObstaculosEstruturais';

/** A folga do tubo à pegada do pilar, além do raio, mm. */
export const FOLGA_DO_TUBO_AO_PILAR_MM = 50;

/** As pegadas dos pilares (de qualquer pavimento) cuja altura, no mundo, alcança `zLo`..`zHi`, crescidas pelo raio + folga. */
export function pilaresNaFaixa(model: BlueprintModel, zLoMundoMm: number, zHiMundoMm: number, raioMm: number): Point[][] {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  return (model.structures ?? [])
    .filter((s) => {
      if (s.kind !== 'PILAR') return false;
      const z0 = (elevacao.get(s.levelId) ?? 0) + s.baseMm;
      return z0 < zHiMundoMm && z0 + s.alturaMm > zLoMundoMm;
    })
    .map((s) => anelDoPilar(pegadaEmPlanta(s), raioMm + FOLGA_DO_TUBO_AO_PILAR_MM) as Point[]);
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** O caminho a→b por fora dos pilares (sem contorno possível, a reta) e o comprimento dele, mm. */
export function caminhoPorFora(a: Point, b: Point, pegadas: readonly Point[][]): { pts: Point[]; mm: number } {
  const meio = a.x === b.x && a.y === b.y ? [] : (desvioDoPilar(a, b, pegadas) ?? []).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }) as Point);
  const pts = [a, ...meio, b];
  return { pts, mm: pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0) };
}

/** Os pedaços do caminho, com a cota de cada vértice pelo comprimento até ele — a mesma declividade em todos. */
export function pedacosComCota(pts: readonly Point[], cotaAMm: number, cotaBMm: number): { a: Point; b: Point; cotaAMm: number; cotaBMm: number }[] {
  const L = pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  const saida: { a: Point; b: Point; cotaAMm: number; cotaBMm: number }[] = [];
  let feito = 0;
  let anterior = cotaAMm;
  for (let i = 1; i < pts.length; i++) {
    feito += dist(pts[i - 1], pts[i]);
    const cota = i === pts.length - 1 || L === 0 ? cotaBMm : Math.round(cotaAMm - ((cotaAMm - cotaBMm) * feito) / L);
    saida.push({ a: pts[i - 1], b: pts[i], cotaAMm: anterior, cotaBMm: cota });
    anterior = cota;
  }
  return saida;
}

/** PA22b/c: as redes sob pressão cujos trechos horizontais o prédio refaz por fora do pilar. */
const REDES_SOB_PRESSAO: readonly DisciplinaDeRede[] = ['AGUA_FRIA', 'AGUA_QUENTE', 'INCENDIO'];

/**
 * PA22b/c do prédio automático (17/11/2026, decisão do usuário 4a): os trechos HORIZONTAIS de água e de incêndio dos
 * pavimentos `levelIds` que atravessam um pilar (de qualquer pavimento que alcance a cota deles — o do térreo desce até a
 * fundação) refeitos por fora dele: as mesmas pontas e propriedades, os pedaços com a cota pelo comprimento. O alimentador
 * e a rede de incêndio enterrados a −0,30 m passavam pelo pé do pilar do térreo (R4 2); a água do tipo do RL, a 2,47 m,
 * pelo pilar da parede (1 por andar). Os motores deles (o alimentador, o PPCI da planta, a água da casa) não mudam: só o
 * prédio refaz o trecho. Sem contorno (a ponta dentro do pilar, pilares encostados), fica.
 */
export function contornarPilaresDasRedesSobPressao(m: BlueprintModel, levelIds: readonly ObjectId[]): { comandos: Command[]; trechos: number } {
  const elevacao = new Map(m.levels.map((l) => [l.id, l.elevationMm]));
  const pilares = (m.structures ?? [])
    .filter((s) => s.kind === 'PILAR')
    .map((s) => {
      const g = pegadaEmPlanta(s);
      const z0 = (elevacao.get(s.levelId) ?? 0) + s.baseMm;
      return { g, z0, z1: z0 + s.alturaMm, x0: Math.min(...g.map((p) => p.x)), x1: Math.max(...g.map((p) => p.x)), y0: Math.min(...g.map((p) => p.y)), y1: Math.max(...g.map((p) => p.y)) };
    });
  const niveis = new Set(levelIds);
  const comandos: Command[] = [];
  let trechos = 0;
  for (const t of m.trechos ?? []) {
    if (!niveis.has(t.levelId) || !REDES_SOB_PRESSAO.includes(t.disciplina) || (t.a.x === t.b.x && t.a.y === t.b.y)) continue;
    const env = envelopeDoTrecho(t);
    const r = Math.max(env.raioPlantaMm, env.raioVerticalMm);
    const e = elevacao.get(t.levelId) ?? 0;
    const zLo = e + Math.min(t.cotaAMm, t.cotaBMm) - r;
    const zHi = e + Math.max(t.cotaAMm, t.cotaBMm) + r;
    const alcance = r + FOLGA_DO_TUBO_AO_PILAR_MM + 2000;
    const [x0, x1, y0, y1] = [Math.min(t.a.x, t.b.x) - alcance, Math.max(t.a.x, t.b.x) + alcance, Math.min(t.a.y, t.b.y) - alcance, Math.max(t.a.y, t.b.y) + alcance];
    const perto = pilares.filter((p) => p.z0 < zHi && p.z1 > zLo && p.x1 > x0 && p.x0 < x1 && p.y1 > y0 && p.y0 < y1).map((p) => anelDoPilar(p.g, r + FOLGA_DO_TUBO_AO_PILAR_MM) as Point[]);
    if (!perto.length || fracaoDentro(t.a, t.b, perto) === 0) continue;
    const { pts } = caminhoPorFora(t.a as Point, t.b as Point, perto);
    if (pts.length <= 2) continue;
    comandos.push({ type: 'DeleteTrecho', trechoId: t.id });
    for (const x of pedacosComCota(pts, t.cotaAMm, t.cotaBMm)) comandos.push({ ...comoAddTrecho(t), a: { x: x.a.x, y: x.a.y }, b: { x: x.b.x, y: x.b.y }, cotaAMm: x.cotaAMm, cotaBMm: x.cotaBMm } as Command);
    trechos++;
  }
  return { comandos, trechos };
}

/** As propriedades do trecho para refazê-lo (como `trechoComo` da água rebaixada). */
function comoAddTrecho(t: Trecho): Omit<Extract<Command, { type: 'AddTrecho' }>, 'a' | 'b' | 'cotaAMm' | 'cotaBMm'> {
  return {
    type: 'AddTrecho',
    levelId: t.levelId,
    disciplina: t.disciplina,
    bitolaMm: t.bitolaMm,
    ...(t.itemCode != null ? { itemCode: t.itemCode } : {}),
    ...(t.rotulo != null ? { rotulo: t.rotulo } : {}),
    ...(t.material != null ? { material: t.material } : {}),
    ...(t.isolamentoMm != null ? { isolamentoMm: t.isolamentoMm } : {}),
    ...(t.sugerido != null ? { sugerido: t.sugerido } : {}),
  } as Omit<Extract<Command, { type: 'AddTrecho' }>, 'a' | 'b' | 'cotaAMm' | 'cotaBMm'>;
}
