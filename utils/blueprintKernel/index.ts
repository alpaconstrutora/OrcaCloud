/**
 * Kernel geométrico do Blueprint — braço TypeScript do Spike A (PRD §30).
 *
 * Superfície pública. Nada fora daqui deve importar os módulos internos direto:
 * o contrato do kernel é este arquivo, e é ele que o braço Rust teria que
 * reproduzir caso o Spike A conclua a favor de Rust/WASM.
 */

export { KERNEL_VERSION, DEFAULT_TOLERANCE_MM, KernelError, metersToMm, mmToMeters, roundToMm } from './units';

export type { Point, Segment, IntersectionResult, AlinhamentoParede } from './geom';
export { point, pointKey, intersectSegments, cantoEntreEixos, polygonArea, polygonPerimeter, isSimplePolygon, canonicalizeRing, areCollinear, pointInPolygon, interiorPoint, travarOrtogonal, eixoDaParede, cantosDaParede, pontaEsticada, poligonoRegular, poligonoPeloLado, retanguloPorCantos, anelRecuado, envelopeValido, signedArea } from './geom';

export type { BlueprintModel, Level, Wall, Opening, Boundary, BoundaryKind, BoundaryPapel, Space, SpaceLabel, ObjectId, SegmentoIdentificado } from './model';
export { emptyModel, cloneModel, wallLength, isFreeWallEnd, assertModelInvariants, nomeDoTipoDeAbertura, extensaoDeCanto, pontasDeslocadas, faceInternaMm, recuoAteFace, retanguloDoLaco, verticeDeAcompanhamento } from './model';

export { buildArrangement, contornoExternoDoNivel, recomputeSpaces, vertexDegrees, encostosSemJuncao, cantosEncostados, pontasSoltasDoNivel } from './arrangement';
export type { EncostoSemJuncao, CantoEncostado, PontaSoltaDoNivel } from './arrangement';
export type { ArrangementResult } from './arrangement';

export { canonicalPayload, snapshotHash, sha256, parseCanonicalPayload, modelFromCanonicalPayload } from './canonical';
export type { CanonicalPayload } from './canonical';

export { computeQuantities, formatarQuantidade, POLITICA_PADRAO, areaRecuada, areaConstruidaMm2 } from './quantities';
export type {
  QuantityPolicy,
  Quantitativos,
  QuantidadeAmbiente,
  QuantidadeParede,
  QuantidadeAbertura,
} from './quantities';

export type { Command, CommandResult, Diff } from './commands';
export { applyCommand, applyBatch, ModelHistory } from './commands';
