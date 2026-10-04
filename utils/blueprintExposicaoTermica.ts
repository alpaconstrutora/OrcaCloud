/**
 * EXPOSIÇÃO TÉRMICA DO AMBIENTE (04/10/2026, E1.3 do roadmap de climatização —
 * achado 7 do benchmark): para cada ambiente, o que há do outro lado de cada
 * face — e isso ninguém sabia antes. É DERIVAÇÃO PURA do desenho; nada aqui é
 * gravado, e é o que a carga térmica (E2) lê.
 *
 * ─── O que cada face responde ────────────────────────────────────────────────
 *  - PAREDE: externa (com a orientação da normal, 8 pontos cardeais, girada pelo
 *    norte declarado) ou interna (com o ambiente vizinho — e o `labelUid` dele,
 *    que é a chave do "climatizado?" nas premissas do estudo). Áreas bruta,
 *    de vãos e líquida; cada vão com área e o vidro declarado (E1.1).
 *  - TETO: AMBIENTE acima (há um ambiente do pavimento de cima sobre o ponto
 *    interior deste), COBERTURA (uma água de telhado cobre o ponto), LAJE_EXPOSTA
 *    (último pavimento, sem telhado) ou EXTERIOR (há pavimento acima, mas sobre
 *    este ponto não há ambiente nem telhado — terraço descoberto). Leva as
 *    camadas da água ou da laje, quando declaradas (E1.2).
 *  - PISO: AMBIENTE abaixo, SOLO (pavimento mais baixo) ou EXTERIOR (há
 *    pavimento abaixo, mas sem ambiente sob o ponto — pilotis).
 *
 * ─── Por que o PONTO INTERIOR, e não a interseção de polígonos ───────────────
 * `areaComum` só recorta com faca convexa e devolve zero honesto nos côncavos;
 * "o que está em cima" é uma pergunta de pertinência, não de área: basta um
 * ponto garantidamente dentro do ambiente (`interiorPoint`, que respeita furos)
 * e o teste de ponto-no-polígono contra os ambientes, lajes e águas vizinhos.
 * O caso que isso erra — um ambiente metade sob outro, metade sob telhado —
 * sai como pendência quando a área do ambiente de cima é bem menor, não como
 * número inventado.
 *
 * Reaproveita o grafo espacial (fachadas externas com azimute, paredes
 * internas com o vizinho) e a laje descoberta do pluvial como precedente.
 */
import type { BlueprintModel, CamadaParede, Level, ObjectId, Opening, Point, Space, Structural, VidroDaAbertura } from './blueprintKernel';
import { interiorPoint, pegadaEmPlanta, pointInPolygon } from './blueprintKernel';
import { aberturasDoAmbiente } from './blueprintKernel/quantities';
import { construirGrafoEspacial, type PontoCardeal } from './blueprintGrafoEspacial';

export type ExposicaoHorizontal = 'COBERTURA' | 'LAJE_EXPOSTA' | 'AMBIENTE' | 'EXTERIOR' | 'SOLO';
export const ROTULO_DA_EXPOSICAO: Record<ExposicaoHorizontal, string> = {
  COBERTURA: 'sob a cobertura',
  LAJE_EXPOSTA: 'laje exposta',
  AMBIENTE: 'outro ambiente',
  EXTERIOR: 'exterior (descoberto)',
  SOLO: 'sobre o solo',
};

export interface VizinhoDaFace {
  spaceId: ObjectId;
  /** A chave do declarado por ambiente nas premissas do estudo; `null` = sem etiqueta. */
  labelUid: string | null;
  nome: string;
}

export interface VaoDaFace {
  openingId: ObjectId;
  kind: Opening['kind'];
  larguraMm: number;
  alturaMm: number;
  areaM2: number;
  vidro: VidroDaAbertura | null;
}

export interface FaceVerticalDoAmbiente {
  wallId: ObjectId;
  /** `null` = parede solta, sem lado definido (pendência). */
  externa: boolean | null;
  /** Só nas externas: a orientação da normal para fora. */
  orientacao: PontoCardeal | null;
  azimuteGraus: number | null;
  comprimentoMm: number;
  alturaMm: number;
  areaBrutaM2: number;
  areaVaosM2: number;
  areaLiquidaM2: number;
  /** Só nas internas. */
  vizinho: VizinhoDaFace | null;
  vaos: VaoDaFace[];
  camadas: CamadaParede[] | null;
}

export interface FaceHorizontalDoAmbiente {
  tipo: ExposicaoHorizontal;
  /** COBERTURA: as águas que cobrem o ponto interior. */
  aguaIds: ObjectId[];
  vizinho: VizinhoDaFace | null;
  camadas: CamadaParede[] | null;
  /** O pavimento do outro lado, quando há. */
  levelId: ObjectId | null;
}

export interface ExposicaoDoAmbiente {
  spaceId: ObjectId;
  levelId: ObjectId;
  labelUid: string | null;
  nome: string;
  areaPisoM2: number;
  peDireitoMm: number;
  faces: FaceVerticalDoAmbiente[];
  teto: FaceHorizontalDoAmbiente;
  piso: FaceHorizontalDoAmbiente;
  /** O que o desenho não soube responder, em frases. */
  pendencias: string[];
}

const mm2ParaM2 = (mm2: number) => Math.round(mm2 / 1000) / 1000;
const dentro = (s: Space, p: Point) => pointInPolygon(s.ring, p) && !s.holes.some((h) => pointInPolygon(h, p));

function vizinhoDe(s: Space): VizinhoDaFace {
  return { spaceId: s.id, labelUid: s.labelUid ?? null, nome: s.name?.trim() || 'Ambiente' };
}

/** A laje que cobre o ponto num dos pavimentos dados — a primeira por id, para ser determinística. */
function lajeSob(model: BlueprintModel, levelIds: ObjectId[], p: Point): Structural | null {
  return (
    (model.structures ?? [])
      .filter((s) => s.kind === 'LAJE' && levelIds.includes(s.levelId) && pointInPolygon(pegadaEmPlanta(s), p))
      .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
  );
}

/** A exposição de todos os ambientes fechados de um pavimento. */
export function exposicaoDoNivel(model: BlueprintModel, levelId: ObjectId): ExposicaoDoAmbiente[] {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const idx = niveis.findIndex((l) => l.id === levelId);
  if (idx < 0) return [];
  const nivel = niveis[idx];
  const acima = niveis[idx + 1] ?? null;
  const abaixo = niveis[idx - 1] ?? null;
  const grafo = construirGrafoEspacial(model, levelId);
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const porParede = new Map(paredes.map((w) => [w.id, w]));

  return model.spaces
    .filter((s) => s.levelId === levelId && s.ring.length >= 3)
    .map((s) => exposicaoDe(model, s, nivel, acima, abaixo, grafo, porParede, paredes))
    .sort((a, b) => a.spaceId.localeCompare(b.spaceId));
}

/** A exposição de UM ambiente, ou `null` se ele não existe. */
export function exposicaoDoAmbiente(model: BlueprintModel, spaceId: ObjectId): ExposicaoDoAmbiente | null {
  const s = model.spaces.find((x) => x.id === spaceId);
  if (!s) return null;
  return exposicaoDoNivel(model, s.levelId).find((e) => e.spaceId === spaceId) ?? null;
}

function exposicaoDe(
  model: BlueprintModel,
  s: Space,
  nivel: Level,
  acima: Level | null,
  abaixo: Level | null,
  grafo: ReturnType<typeof construirGrafoEspacial>,
  porParede: Map<ObjectId, BlueprintModel['walls'][number]>,
  paredes: BlueprintModel['walls'],
): ExposicaoDoAmbiente {
  const pendencias: string[] = [];
  const nome = s.name?.trim() || 'Ambiente';
  const no = grafo.nos.find((n) => n.spaceId === s.id);
  const p = interiorPoint(s.ring, s.holes);
  const espacosDe = (l: Level | null) => (l ? model.spaces.filter((x) => x.levelId === l.id && x.ring.length >= 3) : []);

  // ── Faces verticais: as fachadas (externas) e as paredes divididas (internas) do grafo.
  const vaosDaParede = new Map<ObjectId, Opening[]>();
  for (const o of aberturasDoAmbiente(s, paredes, model.openings)) vaosDaParede.set(o.wallId, [...(vaosDaParede.get(o.wallId) ?? []), o]);
  const vaosDe = (wallId: ObjectId): VaoDaFace[] =>
    (vaosDaParede.get(wallId) ?? [])
      .map((o) => ({ openingId: o.id, kind: o.kind, larguraMm: o.widthMm, alturaMm: o.heightMm, areaM2: mm2ParaM2(o.widthMm * o.heightMm), vidro: o.vidro ?? null }))
      .sort((a, b) => a.openingId.localeCompare(b.openingId));
  const face = (wallId: ObjectId, comprimentoMm: number, externa: boolean | null, orientacao: PontoCardeal | null, azimuteGraus: number | null, vizinho: VizinhoDaFace | null): FaceVerticalDoAmbiente => {
    const w = porParede.get(wallId);
    const alturaMm = w?.heightMm ?? nivel.defaultHeightMm;
    const vaos = vaosDe(wallId);
    const areaBrutaM2 = mm2ParaM2(comprimentoMm * alturaMm);
    const areaVaosM2 = Math.round(vaos.reduce((t, v) => t + v.areaM2, 0) * 1000) / 1000;
    return { wallId, externa, orientacao, azimuteGraus, comprimentoMm, alturaMm, areaBrutaM2, areaVaosM2, areaLiquidaM2: Math.max(0, Math.round((areaBrutaM2 - areaVaosM2) * 1000) / 1000), vizinho, vaos, camadas: w?.camadas ?? null };
  };
  const faces: FaceVerticalDoAmbiente[] = [];
  for (const f of no?.fachadas ?? []) faces.push(face(f.wallId, f.comprimentoMm, true, f.orientacao, f.azimuteGraus, null));
  for (const a of grafo.arestas) {
    if (a.tipo !== 'PAREDE' || a.de !== s.id) continue;
    if (a.para === null) {
      // Parede para o exterior que não virou fachada (o grafo não achou lado): fica dita.
      if (!faces.some((f) => f.wallId === a.wallId)) {
        faces.push(face(a.wallId, a.comprimentoMm, null, null, null, null));
        pendencias.push(`Parede ${a.wallId} sem lado definido (externa ou interna?).`);
      }
      continue;
    }
    const outro = model.spaces.find((x) => x.id === a.para);
    if (!outro) continue;
    const viz = vizinhoDe(outro);
    if (!viz.labelUid) pendencias.push(`Vizinho "${viz.nome}" sem etiqueta — não se sabe se é climatizado.`);
    faces.push(face(a.wallId, a.comprimentoMm, false, null, null, viz));
  }
  faces.sort((a, b) => a.wallId.localeCompare(b.wallId));

  // ── Teto.
  const sAcima = espacosDe(acima).find((x) => dentro(x, p)) ?? null;
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const aguas = (model.roofs ?? [])
    .filter((r) => r.pontos.length >= 3 && (elev.get(r.levelId) ?? 0) >= nivel.elevationMm && pointInPolygon(r.pontos, p))
    .sort((a, b) => a.id.localeCompare(b.id));
  let teto: FaceHorizontalDoAmbiente;
  if (sAcima) {
    const laje = lajeSob(model, [acima!.id, nivel.id], p);
    const viz = vizinhoDe(sAcima);
    if (!viz.labelUid) pendencias.push(`Ambiente acima "${viz.nome}" sem etiqueta — não se sabe se é climatizado.`);
    if (sAcima.areaMm2 < s.areaMm2 * 0.5) pendencias.push(`"${viz.nome}" cobre só parte deste ambiente — o resto do teto pode estar exposto.`);
    teto = { tipo: 'AMBIENTE', aguaIds: [], vizinho: viz, camadas: laje?.camadas ?? null, levelId: acima!.id };
  } else if (aguas.length) {
    teto = { tipo: 'COBERTURA', aguaIds: aguas.map((a) => a.id), vizinho: null, camadas: aguas[0].camadas ?? null, levelId: aguas[0].levelId };
    if (!teto.camadas) pendencias.push('Cobertura sem camadas declaradas: U do teto não avaliado.');
  } else {
    const laje = lajeSob(model, acima ? [acima.id, nivel.id] : [nivel.id], p);
    teto = { tipo: acima ? 'EXTERIOR' : 'LAJE_EXPOSTA', aguaIds: [], vizinho: null, camadas: laje?.camadas ?? null, levelId: acima?.id ?? null };
    if (!laje) pendencias.push(acima ? 'Nada sobre este ambiente no pavimento de cima (nem laje): confira o desenho.' : 'Último pavimento sem telhado nem laje sobre este ambiente.');
    else if (!laje.camadas) pendencias.push('Laje exposta sem camadas declaradas: U do teto não avaliado.');
  }

  // ── Piso.
  const sAbaixo = espacosDe(abaixo).find((x) => dentro(x, p)) ?? null;
  let piso: FaceHorizontalDoAmbiente;
  if (sAbaixo) {
    const laje = lajeSob(model, [nivel.id, abaixo!.id], p);
    const viz = vizinhoDe(sAbaixo);
    if (!viz.labelUid) pendencias.push(`Ambiente abaixo "${viz.nome}" sem etiqueta — não se sabe se é climatizado.`);
    piso = { tipo: 'AMBIENTE', aguaIds: [], vizinho: viz, camadas: laje?.camadas ?? null, levelId: abaixo!.id };
  } else {
    const laje = lajeSob(model, abaixo ? [nivel.id, abaixo.id] : [nivel.id], p);
    piso = { tipo: abaixo ? 'EXTERIOR' : 'SOLO', aguaIds: [], vizinho: null, camadas: laje?.camadas ?? null, levelId: abaixo?.id ?? null };
  }

  return {
    spaceId: s.id,
    levelId: s.levelId,
    labelUid: s.labelUid ?? null,
    nome,
    areaPisoM2: mm2ParaM2(s.areaMm2),
    peDireitoMm: nivel.defaultHeightMm,
    faces,
    teto,
    piso,
    pendencias,
  };
}

/** Resumo de um pavimento para a tela: quantos ambientes por tipo de teto e de piso. */
export function resumirExposicao(lista: ExposicaoDoAmbiente[]): { teto: Partial<Record<ExposicaoHorizontal, number>>; piso: Partial<Record<ExposicaoHorizontal, number>>; comPendencia: number } {
  const teto: Partial<Record<ExposicaoHorizontal, number>> = {};
  const piso: Partial<Record<ExposicaoHorizontal, number>> = {};
  for (const e of lista) {
    teto[e.teto.tipo] = (teto[e.teto.tipo] ?? 0) + 1;
    piso[e.piso.tipo] = (piso[e.piso.tipo] ?? 0) + 1;
  }
  return { teto, piso, comPendencia: lista.filter((e) => e.pendencias.length > 0).length };
}
