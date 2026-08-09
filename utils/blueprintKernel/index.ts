/**
 * Kernel geométrico do Blueprint — braço TypeScript do Spike A (PRD §30).
 *
 * Superfície pública. Nada fora daqui deve importar os módulos internos direto:
 * o contrato do kernel é este arquivo, e é ele que o braço Rust teria que
 * reproduzir caso o Spike A conclua a favor de Rust/WASM.
 */

export { KERNEL_VERSION, DEFAULT_TOLERANCE_MM, KernelError, metersToMm, mmToMeters, roundToMm } from './units';

export type { Point, Segment, IntersectionResult } from './geom';
export { point, intersectSegments, polygonArea, polygonPerimeter, isSimplePolygon, canonicalizeRing, areCollinear, pointInPolygon, interiorPoint } from './geom';

export type { BlueprintModel, Level, Wall, Opening, Boundary, Space, SpaceLabel, ObjectId } from './model';
export { emptyModel, cloneModel, wallLength, isFreeWallEnd, assertModelInvariants } from './model';

export { buildArrangement, recomputeSpaces, vertexDegrees } from './arrangement';
export type { ArrangementResult } from './arrangement';

export { canonicalPayload, snapshotHash, sha256, parseCanonicalPayload, modelFromCanonicalPayload } from './canonical';
export type { CanonicalPayload } from './canonical';

export { computeQuantities, formatarQuantidade, POLITICA_PADRAO } from './quantities';
export type {
  QuantityPolicy,
  Quantitativos,
  QuantidadeAmbiente,
  QuantidadeParede,
  QuantidadeAbertura,
} from './quantities';

export type { Command, CommandResult, Diff } from './commands';
export { applyCommand, applyBatch, ModelHistory } from './commands';
