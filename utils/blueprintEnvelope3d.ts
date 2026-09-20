/**
 * ENVELOPE 3D (19/09/2026, roadmap E3.3): o PRISMA edificável — recuos ×
 * gabarito × afastamentos progressivos × restrições — pavimento a pavimento.
 *
 * Cada pavimento tem o SEU envelope em planta: os recuos efetivos na altura
 * do TOPO daquele pavimento (o afastamento progressivo cresce com a altura —
 * E3.1), as faixas restritas e os recuos fixos (`envelopeConstrutivo`). O
 * prisma do pavimento é esse anel extrudado do piso ao teto; empilhados, são
 * o volume máximo que a lei deixa construir — e é isso que o 3D mostra
 * translúcido por cima da edificação.
 *
 * "CABE?" por pavimento: o contorno externo desenhado (eixo das paredes) tem
 * de estar dentro do anel do envelope. É lido pelos vértices do contorno (com
 * 1 mm de folga) e pela área que sobra fora (`areaForaMm2`), quando o recorte
 * é possível. O pavimento acima do gabarito (altura ou número de pavimentos)
 * é dito à parte: o envelope dele existe em planta, mas a lei não o deixa.
 * Subsolo (cota < 0) não conta no gabarito de pavimentos.
 *
 * Tudo derivado; nada é gravado — como o envelope 2D.
 */
import { anelRecuado,
  areaConstruidaMm2,
  contornoExternoDoNivel,
  pointInPolygon,
  polygonArea,
  recorteComum,
  type BlueprintModel,
  type Boundary,
  type Level,
  type ObjectId,
  type Point,
} from './blueprintKernel';
import { envelopeConstrutivo, type Recuos, type Terreno } from './blueprintTerreno';
import { recuosEfetivos, type AfastamentoProgressivo } from './blueprintZonaUrbanistica';

export interface ZonaDoEnvelope {
  afastamentoProgressivo: AfastamentoProgressivo | null;
  gabaritoAlturaMaxM: number | null;
  gabaritoPavimentos: number | null;
}

export interface PrismaDoEnvelope {
  levelId: ObjectId;
  nome: string;
  baseMm: number;
  topoMm: number;
  /** Anel do envelope NA ALTURA deste pavimento. Vazio quando não cabe (recuos comem o lote). */
  anel: Point[];
  areaMm2: number;
  recuos: Recuos;
  /** O afastamento progressivo em vigor neste pavimento, quando supera o recuo fixo. */
  afastamentoMm: number | null;
  /** Acima do gabarito em altura (topo > gabarito) ou em pavimentos. */
  acimaDoGabarito: boolean;
  motivoDoGabarito: string | null;
  areaConstruidaMm2: number;
  /** Parte do contorno desenhado que fica FORA do envelope. `null` quando não deu para recortar. */
  areaForaMm2: number | null;
  /** Todo o contorno externo desenhado dentro do envelope (1 mm de folga). */
  cabe: boolean;
}

export interface EnvelopeVertical {
  prismas: PrismaDoEnvelope[];
  /** Σ área × pé-direito dos pavimentos DENTRO do gabarito, m³. */
  volumeMaxM3: number;
  /** Σ área do envelope dos pavimentos dentro do gabarito, m². */
  areaMaxM2: number;
  /** Pavimentos que não cabem ou passam do gabarito. */
  pavimentosComProblema: number;
}

/** Área de `anel` fora de `envelope`, quando o recorte é possível (um dos dois convexo). */
function areaFora(anel: Point[], envelope: Point[]): number | null {
  if (anel.length < 3 || envelope.length < 3) return null;
  const comum = recorteComum(anel, envelope);
  if (comum.length < 3) {
    // Sem recorte possível (os dois côncavos) — ou realmente disjuntos: decide pelos vértices.
    const dentro = anel.every((p) => pointInPolygon(envelope, p));
    return dentro ? 0 : null;
  }
  return Math.max(0, Math.round(Math.abs(polygonArea(anel)) - Math.abs(polygonArea(comum))));
}

export function envelopeVertical(model: BlueprintModel, terreno: Terreno | null, limites: Boundary[], recuosBase: Recuos, zona: ZonaDoEnvelope): EnvelopeVertical | null {
  if (!terreno || terreno.anel.length < 3 || model.levels.length === 0) return null;
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const gabaritoMm = zona.gabaritoAlturaMaxM != null ? Math.round(zona.gabaritoAlturaMaxM * 1000) : null;
  let ordinal = 0; // só pavimentos com cota ≥ 0 contam no gabarito de pavimentos
  const prismas: PrismaDoEnvelope[] = niveis.map((l: Level) => {
    const topoMm = l.elevationMm + l.defaultHeightMm;
    const { recuos, afastamentoMm } = recuosEfetivos(recuosBase, { afastamentoProgressivo: zona.afastamentoProgressivo }, topoMm / 1000);
    const env = envelopeConstrutivo(terreno, limites, recuos);
    const acimaEmAltura = gabaritoMm != null && topoMm > gabaritoMm + 1;
    let acimaEmPavimentos = false;
    if (l.elevationMm >= 0) {
      ordinal++;
      acimaEmPavimentos = zona.gabaritoPavimentos != null && ordinal > zona.gabaritoPavimentos;
    }
    // "CABE?" PELA FACE EXTERNA (20/09/2026, backlog P2 — P2.8): o contorno do
    // nível corre no EIXO das paredes; a edificação vai até a face externa, meia
    // espessura adiante. O contorno é deslocado para fora pela meia espessura
    // da parede externa mais grossa do pavimento (`anelRecuado` com recuo
    // negativo). Antes, uma parede de 20 cm no limite do recuo passava por 10 cm.
    const meiaEspessuraMm = Math.round(Math.max(0, ...model.walls.filter((w) => w.levelId === l.id).map((w) => w.thicknessMm)) / 2);
    const contornos = contornoExternoDoNivel(model, l).map((c) => {
      if (meiaEspessuraMm <= 0 || c.length < 3) return c;
      const face = anelRecuado(c, c.map(() => -meiaEspessuraMm));
      return face.length >= 3 ? face : c;
    });
    const anelEnvelope = env.valido ? env.anel : [];
    let fora: number | null = 0;
    let cabe = true;
    for (const c of contornos) {
      if (anelEnvelope.length < 3 || !c.every((p) => pointInPolygon(anelEnvelope, p))) cabe = false;
      const f = anelEnvelope.length >= 3 ? areaFora(c, anelEnvelope) : Math.round(Math.abs(polygonArea(c)));
      if (f === null) fora = null;
      else if (fora !== null) fora += f;
    }
    if (anelEnvelope.length < 3 && contornos.length > 0) cabe = false;
    return {
      levelId: l.id,
      nome: l.name,
      baseMm: l.elevationMm,
      topoMm,
      anel: anelEnvelope,
      areaMm2: env.valido ? Math.round(env.areaMm2) : 0,
      recuos,
      afastamentoMm,
      acimaDoGabarito: acimaEmAltura || acimaEmPavimentos,
      motivoDoGabarito: acimaEmAltura
        ? `topo a ${(topoMm / 1000).toFixed(2).replace('.', ',')} m > gabarito ${zona.gabaritoAlturaMaxM!.toFixed(2).replace('.', ',')} m`
        : acimaEmPavimentos
          ? `${ordinal}º pavimento > gabarito de ${zona.gabaritoPavimentos}`
          : null,
      areaConstruidaMm2: Math.round(areaConstruidaMm2(model, l)),
      areaForaMm2: fora,
      cabe: contornos.length === 0 ? true : cabe,
    };
  });
  const dentroDoGabarito = prismas.filter((p) => !p.acimaDoGabarito);
  return {
    prismas,
    volumeMaxM3: Math.round(dentroDoGabarito.reduce((s, p) => s + (p.areaMm2 * (p.topoMm - p.baseMm)) / 1e9, 0) * 100) / 100,
    areaMaxM2: Math.round(dentroDoGabarito.reduce((s, p) => s + p.areaMm2 / 1e6, 0) * 100) / 100,
    pavimentosComProblema: prismas.filter((p) => !p.cabe || p.acimaDoGabarito).length,
  };
}

/** O que o motor de regras (E3.2) recebe por pavimento. */
export function envelopePorPavimentoParaRegras(env: EnvelopeVertical | null): Record<ObjectId, { areaEnvelopeM2: number; areaForaM2: number | null; cabe: boolean; acimaDoGabarito: boolean }> {
  const saida: Record<ObjectId, { areaEnvelopeM2: number; areaForaM2: number | null; cabe: boolean; acimaDoGabarito: boolean }> = {};
  for (const p of env?.prismas ?? []) {
    saida[p.levelId] = {
      areaEnvelopeM2: Math.round(p.areaMm2 / 10_000) / 100,
      areaForaM2: p.areaForaMm2 === null ? null : Math.round(p.areaForaMm2 / 10_000) / 100,
      cabe: p.cabe,
      acimaDoGabarito: p.acimaDoGabarito,
    };
  }
  return saida;
}
