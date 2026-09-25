/**
 * Kernel geométrico do Blueprint — braço TypeScript do Spike A (PRD §30).
 *
 * Superfície pública. Nada fora daqui deve importar os módulos internos direto:
 * o contrato do kernel é este arquivo, e é ele que o braço Rust teria que
 * reproduzir caso o Spike A conclua a favor de Rust/WASM.
 */

export { KERNEL_VERSION, DEFAULT_TOLERANCE_MM, KernelError, metersToMm, mmToMeters, roundToMm } from './units';

export type { Point, Segment, IntersectionResult, AlinhamentoParede, ProjecaoNoSegmento } from './geom';
export { point, pointKey, intersectSegments, cantoEntreEixos, polygonArea, polygonPerimeter, isSimplePolygon, canonicalizeRing, areCollinear, isBetween, pointInPolygon, interiorPoint, travarOrtogonal, eixoDaParede, cantosDaParede, pontaEsticada, intersecaoDeRetas, poligonoRegular, poligonoPeloLado, retanguloPorCantos, anelRecuado, envelopeValido, signedArea, projecaoNoSegmento, componenteNoEixo, SENO_MINIMO_CANTO } from './geom';

export type { FaseDeReforma, Etapa, BlueprintModel, AcabamentosDoAmbiente, Forro, Rodape, Agua, Circuito, Corte, Eixo, Restricao, TipoDeRestricao, FamiliaRestringivel, Unidade, Grupo, InstanciaDeGrupo, RotacaoDoGrupo, EspelhoDoGrupo, Nucleo, TipoDeNucleo, Vaga, TipoDeVaga, GuardaCorpo, TipoDeGuardaCorpo, MaterialDeGuardaCorpo, Anotacao, TipoDeAnotacao, VistaDaAnotacao, VistaDependente, RevisaoDaNuvem, ArcoDaParede, CortinaDeVidro, Brise, PainelDeCortina, OrientacaoDeBrise, SubRegiao, MaterialDeSubRegiao, FichaDoMaterialDeSubRegiao, Quadra, Lote, TipoDeLote, Via, AreaPublica, TipoDeAreaPublica, FichaDaAreaPublica, TrechoDeRodape, TracoDaAnotacao, PadraoDeHachura, Componente, TipoDeComponente, FamiliaDeComponente, FichaDoComponente, FilhoDoConjunto, SimboloDoComponente, TipoDeRestricaoDoLote, RestricaoDoLote, DisciplinaDeRede, Escada, Georreferencia, Quadro, Trecho, Terminal, Esquadria, TipoCirculacao, Level, Wall, CamadaParede, FuncaoCamada, Opening, Boundary, BoundaryKind, BoundaryPapel, Structural, StructuralKind, TipoDePontoEletrico, TipoDeInterruptor, TipoDePontoHidraulico, LigacaoDoCircuito, FaseDoCircuito, TipoDeAmbiente, Space, SpaceLabel, ObjectId, SegmentoIdentificado, DeslocamentoDeSegmentos, PontaDesencostada, ReservaDePonta } from './model';
export { FASES_DE_REFORMA, ROTULO_DA_FASE, faseDe, DISCIPLINAS, TIPOS_DE_PONTO_ELETRICO, TIPOS_DE_INTERRUPTOR, TIPOS_DE_PONTO_HIDRAULICO, DISCIPLINAS_DO_PONTO_HIDRAULICO, LIGACOES_DO_CIRCUITO, FASES_DO_CIRCUITO, TIPOS_DE_AMBIENTE, pontasPresasAsPecas, emptyModel, cloneModel, wallLength, isFreeWallEnd, assertModelInvariants, nomeDoTipoDeAbertura, assinaturaDaEsquadria, nomeDaEsquadria, nomeDoTipoEstrutural, prefixoDeRotulo, FORMA_ESTRUTURAL, pontosEsperados, contornoEmPlanta, pontosDeConexaoEstrutural, findStructural, findAgua, findCorte, findEixo, MAX_NOME_DE_EIXO, findRestricao, pecaPorUid, limparRestricoesOrfas, TIPOS_DE_RESTRICAO, EXIGENCIAS_DA_RESTRICAO, findUnidade, unidadeDaEtiqueta, limparEtiquetasOrfasDasUnidades, MAX_NUMERO_DE_UNIDADE, MAX_TIPOLOGIA_DE_UNIDADE, findNucleo, pavimentosDoNucleo, pavimentoMaisAlto, TIPOS_DE_NUCLEO, nomeDoTipoDeNucleo, findVaga, contornoDaVaga, TIPOS_DE_VAGA, DIMENSAO_DA_VAGA, ROTULO_DO_TIPO_DE_VAGA, findAnotacao, anguloDaCota, mesmaVista, findVistaDependente, MAX_NOME_DE_VISTA_DEPENDENTE, findSubRegiao, findRodape, findEtapa, findQuadra, findLote, findVia, findAreaPublica, TIPOS_DE_LOTE, TIPOS_DE_AREA_PUBLICA, FICHA_DA_AREA_PUBLICA, MAX_NOME_DE_QUADRA, MAX_NUMERO_DE_LOTE, MAX_NOME_DE_VIA, MAX_NOME_DE_AREA_PUBLICA, MAX_LARGURA_DE_VIA_MM, MAX_NOME_DE_ETAPA, MATERIAIS_DE_SUB_REGIAO, FICHA_DO_MATERIAL_DE_SUB_REGIAO, MAX_NOME_DE_SUB_REGIAO, DATA_ISO_DA_REVISAO, TIPOS_DE_ANOTACAO, ROTULO_DO_TIPO_DE_ANOTACAO, PONTOS_MINIMOS_DA_ANOTACAO, TRACOS_DA_ANOTACAO, PADROES_DE_HACHURA, MAX_TEXTO_DE_ANOTACAO, ALTURA_PADRAO_DO_TEXTO_MM, findGuardaCorpo, comprimentoDoGuardaCorpo, TIPOS_DE_GUARDA_CORPO, ROTULO_DO_TIPO_DE_GUARDA_CORPO, MATERIAIS_DE_GUARDA_CORPO, ROTULO_DO_MATERIAL_DE_GUARDA_CORPO, ALTURA_PADRAO_DO_GUARDA_CORPO_MM, ALTURA_MINIMA_DO_GUARDA_CORPO_MM, FAIXA_DO_CORRIMAO_MM, MAX_ROTULO_DE_GUARDA_CORPO, findComponente, contornoDoComponente, pontoHidraulicoDoComponente, CATALOGO_DE_COMPONENTES, CONJUNTOS_DE_COMPONENTES, ehConjunto, filhosDoConjunto, paiDoComponente, extensaoDoConjunto, TIPOS_DE_COMPONENTE, FAMILIAS_DE_COMPONENTE, ROTULO_DA_FAMILIA_DE_COMPONENTE, MAX_ROTULO_DE_COMPONENTE, TIPOS_DE_RESTRICAO_DO_LOTE, FAIXA_PADRAO_DA_RESTRICAO, ROTULO_DA_RESTRICAO_DO_LOTE, findGrupo, uidDaCopia, transformarPontoDoGrupo, giroTransformadoDoGrupo, copiasDeInstancia, limparOrigensOrfasDosGrupos, MAX_NOME_DE_GRUPO, ESPELHOS_DO_GRUPO, ROTACOES_DO_GRUPO, findEscada, extensaoDeCanto, deslocamentoParaManterFace, ladoOposto, somaDasCamadas, clonarCamadas, clonarArco, PAINEIS_DE_CORTINA, ROTULO_DO_PAINEL_DE_CORTINA, ORIENTACOES_DE_BRISE, MIN_MODULO_DE_CORTINA_MM, MIN_MONTANTE_MM, MIN_LAMINA_DE_BRISE_MM, assinaturaDasCamadas, FUNCOES_DE_CAMADA, clonarAcabamentos, acabamentosOuAusente, assinaturaDosAcabamentos, acabamentosDoAmbiente, MAX_REBAIXO_DE_FORRO_MM, MAX_ALTURA_DE_RODAPE_MM, MAX_CHARS_DO_DEPARTAMENTO, departamentoNormalizado, pontasDeslocadas, reservaDeAberturas, circuitosDoTrecho, pontasNoVerticeMovido, faceInternaMm, recuoAteFace, SENO_MINIMO_MITRA, retanguloDoLaco, verticeDeAcompanhamento } from './model';

export { paredeEhExterna } from './exterior';
export { perfilDeCobertura, aguasDaExtrusao, aguasDaMesmaExtrusao, TIPOS_DE_PERFIL_DE_COBERTURA, ROTULO_DO_PERFIL_DE_COBERTURA, MENSAGEM_DO_ERRO_DE_PERFIL, type PontoDoPerfil, type TipoDePerfilDeCobertura, type ParametrosDoPerfil, type AguaExtrudada, type ErroDoPerfil } from './coberturaExtrusao';
export { discretizarArco, circuloPorTresPontos, arcoConsistente, segmentosDoMesmoArco, varreduraDoArco, anguloEmTorno, facetasDoArco, PASSO_MAX_DO_ARCO_GRAUS, FLECHA_MAX_DO_ARCO_MM, MAX_FACETAS_DO_ARCO, TOLERANCIA_DO_ARCO_MM, type ArcoDiscretizado, type Circulo } from './arco';

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

export { buildArrangement, contornoExternoDoNivel, recomputeSpaces, vertexDegrees, encostosSemJuncao, cantosEncostados, pontasSoltasDoNivel, juntasParalelasSemCanto, extensoesAteEncontrar, MAX_EXTENSAO_MM } from './arrangement';
export type { EncostoSemJuncao, CantoEncostado, PontaSoltaDoNivel, JuntaParalela } from './arrangement';
export type { ArrangementResult } from './arrangement';

export { canonicalPayload, snapshotHash, payloadDoHash, hashDePayload, parseCanonicalPayload, modelFromCanonicalPayload } from './canonical';
export type { CanonicalPayload, IdentidadeCanonica } from './canonical';
export { sha256, stableStringify } from './hash';

export { novoUid, uidDeterministico, uidDeTeste, geradorSequencial, usarGeradorDeUid, rotuloCurto, EH_UID, PREFIXO_ROTULO_UID } from './identity';
export type { ElementUid, FamiliaComUid } from './identity';

export { computeQuantities, formatarQuantidade, POLITICA_PADRAO, areaRecuada, areaConstruidaMm2, medirEstrutura, aberturasDoAmbiente } from './quantities';
export { sobreposicoesDe, sobreposicoesDoModelo, areaComum, recorteComum, pegadaEmPlanta, faixaDaEstruturaNaParede, pontasEncurtadasPorEstrutura } from './sobreposicao';
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

export type { Command, CommandResult, Diff, FamiliaComParametros, EspecificacaoDeInstancia } from './commands';
export { assertParametros, CHAVE_DE_PARAMETRO, MAX_PARAMETROS_POR_PECA, MAX_TEXTO_DE_PARAMETRO } from './model';
export type { Parametros, ValorDeParametro } from './model';
export { applyCommand, applyBatch, ModelHistory } from './commands';

// CLASH de instalação. Saída PRÓPRIA, de propósito: ela NÃO vira desconto no
// quantitativo — ver o cabeçalho de `conflitos.ts`.
export { conflitosDoModelo, distanciaEntreEixos3D, pontasNoMundo, type Conflito } from './conflitos';
// CLASH arquitetônico (E0.4): vão × estrutura, escada × pilar, escada × altura livre. Mesma
// natureza (pendência, não desconto), tipo próprio porque a peça não é um trecho.
export { conflitosArquitetonicos, conflitosDeReserva, contornoComFolga, ehReservaDeEquipamento, ALTURA_LIVRE_MIN_MM, type ConflitoArquitetonico } from './conflitosArquitetonicos';

// O QUADRO DE CARGAS. Derivado, nunca gravado — e só SOMA o que foi declarado:
// dimensionamento está fora do escopo por decisão. Ver o cabeçalho do arquivo.
export {
  quadroDeCargas,
  type QuadroDeCargas,
  type CargaDoQuadro,
  type CargaDoCircuito,
} from './quadroDeCargas';
export { conexoesDerivadas, tipoDeConexaoManual, ROTULO_DA_CONEXAO } from './conexoes';
export type { ConexaoDerivada, ConexoesDoModelo, PontaAberta, TipoDeConexao } from './conexoes';
export { furosDoNucleo, medirNucleo, type FuroDoNucleo, type MedidaDoNucleo } from './nucleo';
