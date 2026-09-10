/**
 * Kernel geométrico do Blueprint — braço TypeScript do Spike A (PRD §30).
 *
 * Superfície pública. Nada fora daqui deve importar os módulos internos direto:
 * o contrato do kernel é este arquivo, e é ele que o braço Rust teria que
 * reproduzir caso o Spike A conclua a favor de Rust/WASM.
 */

export { KERNEL_VERSION, DEFAULT_TOLERANCE_MM, KernelError, metersToMm, mmToMeters, roundToMm } from './units';

export type { Point, Segment, IntersectionResult, AlinhamentoParede, ProjecaoNoSegmento } from './geom';
export { point, pointKey, intersectSegments, cantoEntreEixos, polygonArea, polygonPerimeter, isSimplePolygon, canonicalizeRing, areCollinear, isBetween, pointInPolygon, interiorPoint, travarOrtogonal, eixoDaParede, cantosDaParede, pontaEsticada, poligonoRegular, poligonoPeloLado, retanguloPorCantos, anelRecuado, envelopeValido, signedArea, projecaoNoSegmento, componenteNoEixo, SENO_MINIMO_CANTO } from './geom';

export type { BlueprintModel, Agua, Circuito, Corte, DisciplinaDeRede, Escada, Georreferencia, Quadro, Trecho, Terminal, Esquadria, TipoCirculacao, Level, Wall, CamadaParede, FuncaoCamada, Opening, Boundary, BoundaryKind, BoundaryPapel, Structural, StructuralKind, TipoDePontoEletrico, TipoDeAmbiente, Space, SpaceLabel, ObjectId, SegmentoIdentificado, DeslocamentoDeSegmentos, PontaDesencostada } from './model';
export { DISCIPLINAS, TIPOS_DE_PONTO_ELETRICO, TIPOS_DE_AMBIENTE, pontasPresasAsPecas, emptyModel, cloneModel, wallLength, isFreeWallEnd, assertModelInvariants, nomeDoTipoDeAbertura, assinaturaDaEsquadria, nomeDaEsquadria, nomeDoTipoEstrutural, prefixoDeRotulo, FORMA_ESTRUTURAL, pontosEsperados, contornoEmPlanta, pontosDeConexaoEstrutural, findStructural, findAgua, findCorte, findEscada, extensaoDeCanto, deslocamentoParaManterFace, ladoOposto, somaDasCamadas, clonarCamadas, assinaturaDasCamadas, pontasDeslocadas, pontasNoVerticeMovido, faceInternaMm, recuoAteFace, SENO_MINIMO_MITRA, retanguloDoLaco, verticeDeAcompanhamento } from './model';

export { paredeEhExterna } from './exterior';

export {
  AGUA_INCLINACAO_MAX_PCT,
  alturaNaAgua,
  contornoDaAguaEm3d,
  distanciaAoBeiralMm,
  medirAgua,
  normalDaAgua,
  perfilDaAguaNoPlano,
  planoDaAgua,
} from './telhado';
export type { AguaGeometrica, MedidaDaAgua, PlanoDaAgua } from './telhado';

export {
  BLONDEL_MAX_MM,
  BLONDEL_MIN_MM,
  ESPELHO_MAX_MM,
  ESPELHO_MIN_MM,
  RAMPA_INCLINACAO_MAX_PCT,
  bordasDaEscada,
  comprimentoDoPercurso,
  contornoDaEscada,
  degrausDaEscada,
  desnivelDaEscada,
  fatiasDaEscada,
  furosDaEscada,
  medirEscada,
  nivelDeChegada,
} from './escada';
export type { DegrauDaEscada, FatiaDaEscada, FuroDaEscada, MedidaEscada } from './escada';

export { mitraDaPonta, poligonoDaJuncao, pontasNaJuncao } from './juncoes';
export type { MitraDaPonta, PontaNaJuncao } from './juncoes';

export { buildArrangement, contornoExternoDoNivel, recomputeSpaces, vertexDegrees, encostosSemJuncao, cantosEncostados, pontasSoltasDoNivel, juntasParalelasSemCanto } from './arrangement';
export type { EncostoSemJuncao, CantoEncostado, PontaSoltaDoNivel, JuntaParalela } from './arrangement';
export type { ArrangementResult } from './arrangement';

export { canonicalPayload, snapshotHash, payloadDoHash, hashDePayload, parseCanonicalPayload, modelFromCanonicalPayload } from './canonical';
export type { CanonicalPayload, IdentidadeCanonica } from './canonical';
export { sha256, stableStringify } from './hash';

export { novoUid, uidDeterministico, uidDeTeste, geradorSequencial, usarGeradorDeUid, rotuloCurto, EH_UID, PREFIXO_ROTULO_UID } from './identity';
export type { ElementUid, FamiliaComUid } from './identity';

export { computeQuantities, formatarQuantidade, POLITICA_PADRAO, areaRecuada, areaConstruidaMm2, medirEstrutura } from './quantities';
export { sobreposicoesDe, sobreposicoesDoModelo, areaComum, recorteComum, faixaDaEstruturaNaParede, pontasEncurtadasPorEstrutura } from './sobreposicao';
export type { PontaEncurtada } from './sobreposicao';
export type { Sobreposicao } from './sobreposicao';
export type {
  QuantityPolicy,
  Quantitativos,
  QuantidadeAmbiente,
  QuantidadeParede,
  QuantidadeAbertura,
  QuantidadeCamada,
  QuantidadePorMaterial,
  QuantidadeEstrutural,
  QuantidadeAgua,
  SobreposicaoQuantificada,
} from './quantities';

export type { Command, CommandResult, Diff } from './commands';
export { applyCommand, applyBatch, ModelHistory } from './commands';

// CLASH de instalação. Saída PRÓPRIA, de propósito: ela NÃO vira desconto no
// quantitativo — ver o cabeçalho de `conflitos.ts`.
export { conflitosDoModelo, distanciaEntreEixos3D, pontasNoMundo, type Conflito } from './conflitos';

// O QUADRO DE CARGAS. Derivado, nunca gravado — e só SOMA o que foi declarado:
// dimensionamento está fora do escopo por decisão. Ver o cabeçalho do arquivo.
export {
  quadroDeCargas,
  type QuadroDeCargas,
  type CargaDoQuadro,
  type CargaDoCircuito,
} from './quadroDeCargas';
