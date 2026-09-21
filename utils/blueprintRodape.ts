/**
 * RODAPÉ COMO ELEMENTO (21/09/2026, backlog P2 — P2.21): o rodapé deixa de
 * ser só uma DECLARAÇÃO por ambiente (E7.2: "este ambiente tem rodapé de 7 cm
 * do item X", com o comprimento DERIVADO do perímetro menos as portas) e passa
 * a poder ser TRECHO desenhado — uma polilinha ao pé da parede, com altura e
 * material próprios, que se pode encurtar, apagar (sob o armário, atrás da
 * bancada, na parede de vidro) e trocar por trecho.
 *
 * ─── CONVIVÊNCIA COM A DECLARAÇÃO ───────────────────────────────────────────
 *
 * A declaração continua sendo a política do ambiente (altura e material
 * padrão), e é dela que o gerador parte. O quantitativo passa a somar os
 * TRECHOS quando o desenho tem algum; sem nenhum, continua o derivado de
 * sempre. Nunca soma os dois.
 *
 * ─── O GERADOR ──────────────────────────────────────────────────────────────
 *
 * `sugerirRodapes`: para cada ambiente do pavimento, cada lado do anel vira um
 * trecho SUGERIDO, descontados os vãos de porta/passagem/correr que dão para
 * o ambiente (o intervalo do vão projetado no lado). Ambiente com rodapé
 * declarado `null` ("sem rodapé") é pulado; ambiente que já tem trecho
 * (`spaceUid` da etiqueta dele) também — é idempotente por etiqueta.
 */
import {
  aberturasDoAmbiente as aberturasQueDaoParaOAmbiente,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
  type Space,
  type TrechoDeRodape,
  acabamentosDoAmbiente,
  projecaoNoSegmento,
} from './blueprintKernel';

export interface HipotesesDeRodape {
  /** Altura quando o ambiente não declarou. */
  alturaMm: number;
  itemCode: string;
  descricao: string;
}
export const HIPOTESES_DE_RODAPE_PADRAO: HipotesesDeRodape = { alturaMm: 70, itemCode: '', descricao: 'Rodapé' };

export interface SugestaoDeRodape {
  spaceId: ObjectId;
  nomeDoAmbiente: string;
  comando: Command;
  comprimentoMm: number;
}
export interface ResultadoDaSugestaoDeRodape {
  sugestoes: SugestaoDeRodape[];
  /** Ambientes pulados e por quê. */
  pulados: { spaceId: ObjectId; nome: string; motivo: string }[];
}

/** Comprimento de uma polilinha em mm. */
export function comprimentoDoRodape(r: Pick<TrechoDeRodape, 'pontos'>): number {
  let c = 0;
  for (let i = 1; i < r.pontos.length; i++) c += Math.hypot(r.pontos[i].x - r.pontos[i - 1].x, r.pontos[i].y - r.pontos[i - 1].y);
  return c;
}

/**
 * Os intervalos [t0, t1] (em mm ao longo do lado `a→b`) ocupados pelos vãos
 * de porta/passagem/correr que dão para o ambiente e ficam sobre este lado.
 */
function vaosNoLado(model: BlueprintModel, s: Space, a: Point, b: Point): [number, number][] {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1) return [];
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  const saida: [number, number][] = [];
  for (const o of aberturasQueDaoParaOAmbiente(s, model.walls, model.openings)) {
    if (o.kind === 'window') continue;
    const w = model.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    // O vão no eixo da parede, depois projetado no lado do anel (que corre pelo mesmo eixo).
    const cw = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const wx = (w.b.x - w.a.x) / cw;
    const wy = (w.b.y - w.a.y) / cw;
    const p0 = { x: w.a.x + wx * o.offsetMm, y: w.a.y + wy * o.offsetMm };
    const p1 = { x: w.a.x + wx * (o.offsetMm + o.widthMm), y: w.a.y + wy * (o.offsetMm + o.widthMm) };
    // Só conta se o vão está sobre ESTE lado (a menos de 1 mm da reta e dentro do trecho).
    const dist = (p: Point) => Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
    if (dist(p0) > 1 || dist(p1) > 1) continue;
    const t0 = (p0.x - a.x) * ux + (p0.y - a.y) * uy;
    const t1 = (p1.x - a.x) * ux + (p1.y - a.y) * uy;
    const ini = Math.max(0, Math.min(t0, t1));
    const fim = Math.min(L, Math.max(t0, t1));
    if (fim - ini > 1) saida.push([ini, fim]);
  }
  return saida.sort((x, y) => x[0] - y[0]);
}

/** Um lado menos os vãos: os trechos restantes como pares de pontos. */
export function trechosDoLado(a: Point, b: Point, vaos: [number, number][]): [Point, Point][] {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1) return [];
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  const em = (t: number): Point => ({ x: Math.round(a.x + ux * t), y: Math.round(a.y + uy * t) });
  const saida: [Point, Point][] = [];
  let cursor = 0;
  for (const [ini, fim] of vaos) {
    if (ini - cursor > 1) saida.push([em(cursor), em(ini)]);
    cursor = Math.max(cursor, fim);
  }
  if (L - cursor > 1) saida.push([em(cursor), em(L)]);
  return saida;
}

export function sugerirRodapes(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDeRodape = HIPOTESES_DE_RODAPE_PADRAO): ResultadoDaSugestaoDeRodape {
  const sugestoes: SugestaoDeRodape[] = [];
  const pulados: ResultadoDaSugestaoDeRodape['pulados'] = [];
  const comTrecho = new Set((model.rodapes ?? []).map((r) => r.spaceUid).filter((u): u is string => !!u));
  for (const s of model.spaces.filter((x) => x.levelId === levelId && x.ring.length >= 3)) {
    const nome = s.name?.trim() || 'Ambiente';
    const acab = acabamentosDoAmbiente(model, s);
    if (acab?.rodape === null) {
      pulados.push({ spaceId: s.id, nome, motivo: 'declarado sem rodapé' });
      continue;
    }
    if (s.labelUid && comTrecho.has(s.labelUid)) {
      pulados.push({ spaceId: s.id, nome, motivo: 'já tem trecho de rodapé' });
      continue;
    }
    const alturaMm = acab?.rodape?.alturaMm ?? hip.alturaMm;
    const itemCode = acab?.rodape?.itemCode ?? hip.itemCode;
    const descricao = acab?.rodape?.descricao || hip.descricao;
    for (let i = 0; i < s.ring.length; i++) {
      const a = s.ring[i];
      const b = s.ring[(i + 1) % s.ring.length];
      for (const [p, q] of trechosDoLado(a, b, vaosNoLado(model, s, a, b))) {
        sugestoes.push({
          spaceId: s.id,
          nomeDoAmbiente: nome,
          comprimentoMm: Math.hypot(q.x - p.x, q.y - p.y),
          comando: { type: 'AddRodape', levelId, pontos: [p, q], alturaMm, itemCode, descricao, sugerido: true, ...(s.labelUid ? { spaceUid: s.labelUid } : {}) },
        });
      }
    }
  }
  return { sugestoes, pulados };
}

/** Resumo para o ribbon/painel: quantos trechos, quantos sugeridos, metros. */
export function resumirRodapes(model: BlueprintModel, levelId?: ObjectId | null): { trechos: number; sugeridos: number; metros: number } {
  const lista = (model.rodapes ?? []).filter((r) => !levelId || r.levelId === levelId);
  return {
    trechos: lista.length,
    sugeridos: lista.filter((r) => r.sugerido).length,
    metros: Math.round(lista.reduce((s, r) => s + comprimentoDoRodape(r), 0) / 10) / 100,
  };
}

/** O ponto de uma polilinha mais próximo de `p` — para o clique. */
export function distanciaAoRodape(r: Pick<TrechoDeRodape, 'pontos'>, p: Point): number {
  let melhor = Infinity;
  for (let i = 1; i < r.pontos.length; i++) {
    const q = projecaoNoSegmento(p, r.pontos[i - 1], r.pontos[i])?.ponto;
    if (q) melhor = Math.min(melhor, Math.hypot(q.x - p.x, q.y - p.y));
  }
  return melhor;
}
