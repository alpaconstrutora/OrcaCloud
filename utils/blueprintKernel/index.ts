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

export type { MaterialDeTubo, SecaoDeCalha, PapelDoReservatorio, FormaDoReservatorio, PosicaoDoSprinkler, PontoDaCurvaDaBomba } from './model';
export type { FaseDeReforma, Etapa, BlueprintModel, AcabamentosDoAmbiente, Forro, Rodape, Agua, Circuito, Corte, Eixo, Restricao, TipoDeRestricao, FamiliaRestringivel, Unidade, AcessorioDaUnidade, AmbienteDeclarado, ClassificacaoNbr12721, CoberturaNbr12721, DivisaoNbr12721, EscopoNbr12721, Grupo, InstanciaDeGrupo, RotacaoDoGrupo, EspelhoDoGrupo, Nucleo, TipoDeNucleo, Vaga, TipoDeVaga, Bloco, UsoDoBloco, GuardaCorpo, TipoDeGuardaCorpo, MaterialDeGuardaCorpo, Anotacao, TipoDeAnotacao, VistaDaAnotacao, VistaDependente, RevisaoDaNuvem, ArcoDaParede, CortinaDeVidro, Brise, PainelDeCortina, OrientacaoDeBrise, SubRegiao, MaterialDeSubRegiao, FichaDoMaterialDeSubRegiao, Quadra, Lote, TipoDeLote, Via, AreaPublica, TipoDeAreaPublica, AreaDeOperacao, RiscoDeSprinkler, TipoAmbiental, FichaDaAreaPublica, VerticeDoTerreno, TipoDeLimite, TrechoDeRodape, TracoDaAnotacao, PadraoDeHachura, Componente, TipoDeComponente, FamiliaDeComponente, FichaDoComponente, FilhoDoConjunto, SimboloDoComponente, TipoDeRestricaoDoLote, RestricaoDoLote, DisciplinaDeRede, VidroDaAbertura, ProtecaoSolar, Camera, MecanismoDeFolha, FolhaDaEsquadria, BandeiraDaEsquadria, ConfiguracaoDaEsquadria, Escada, Georreferencia, Quadro, Trecho, Terminal, Esquadria, TipoCirculacao, ProtecaoDaEscada, MarcaDeEmergencia, AgenteExtintor, Level, Wall, CamadaParede, FuncaoCamada, HachuraDaCamada, PadraoDeMaterial, PlanoDaAnotacao, Opening, Boundary, BoundaryKind, BoundaryPapel, Structural, StructuralKind, TipoDePontoEletrico, TipoDeInterruptor, TipoDePontoHidraulico, LigacaoDoCircuito, FaseDoCircuito, DispositivoDR, CorrenteDiferencialMa, PolosDoDR, DispositivoDPS, ClasseDeDPS, CurvaDoDisjuntor, TipoDeQuadro, TipoDeAmbiente, UsoDoAmbiente, Space, SpaceLabel, ObjectId, SegmentoIdentificado, DeslocamentoDeSegmentos, PontaDesencostada, ReservaDePonta } from './model';
export { FASES_DE_REFORMA, ROTULO_DA_FASE, faseDe, PARAMETRO_COTA_DA_REDE, DISCIPLINAS, TIPOS_DE_PONTO_ELETRICO, TIPOS_DE_INFRAESTRUTURA_ELETRICA, TIPOS_DE_INTERRUPTOR, TIPOS_DE_PONTO_HIDRAULICO, DISCIPLINAS_DO_PONTO_HIDRAULICO, MATERIAIS_DE_TUBO, MATERIAIS_DA_DISCIPLINA, SECOES_DE_CALHA, PAPEIS_DO_RESERVATORIO, FORMAS_DO_RESERVATORIO, POSICOES_DO_SPRINKLER, FATOR_K_MAXIMO, PONTOS_MINIMOS_DA_CURVA, materialPadraoDaDisciplina, materialDoTrecho, LIGACOES_DO_CIRCUITO, FASES_DO_CIRCUITO, CORRENTES_DIFERENCIAIS_MA, POLOS_DO_DR, CLASSES_DE_DPS, CURVAS_DO_DISJUNTOR, TIPOS_DE_QUADRO, ROTULO_DO_TIPO_DE_QUADRO, cadeiaDeQuadros, TIPOS_DE_AMBIENTE, USOS_DO_AMBIENTE, TIPO_NBR5410_DO_USO, pontasPresasAsPecas, emptyModel, cloneModel, wallLength, isFreeWallEnd, assertModelInvariants, nomeDoTipoDeAbertura, assinaturaDaEsquadria, nomeDaEsquadria, PROTECOES_SOLARES, ROTULO_DA_PROTECAO_SOLAR, FATOR_DE_SOMBREAMENTO_DA_PROTECAO, fatorDeSombreamento, normalizarVidro, findCamera, assertCamera, ALTURA_DO_OLHO_PADRAO_MM, ALTURA_DO_OLHO_MIN_MM, ALTURA_DO_OLHO_MAX_MM, FOCAL_PADRAO_MM, FOCAL_MIN_MM, FOCAL_MAX_MM, MAX_NOME_DE_CAMERA, MECANISMOS_DE_FOLHA, ROTULO_DO_MECANISMO, MECANISMOS_DA_BANDEIRA, MAX_FOLHAS_DA_ESQUADRIA, MIN_LARGURA_DA_FOLHA_PCT, MIN_ALTURA_DA_BANDEIRA_MM, MIN_ALTURA_SOB_A_BANDEIRA_MM, folhasIguais, normalizarConfiguracao, descricaoDaConfiguracao, nomeDoTipoEstrutural, prefixoDeRotulo, FORMA_ESTRUTURAL, pontosEsperados, contornoEmPlanta, pontosDeConexaoEstrutural, findStructural, findAgua, findCorte, findEixo, MAX_NOME_DE_EIXO, letraDoEixo, eixoEhVertical, proximoNomeDeEixo, findRestricao, pecaPorUid, limparRestricoesOrfas, TIPOS_DE_RESTRICAO, EXIGENCIAS_DA_RESTRICAO, findUnidade, unidadeDaEtiqueta, limparEtiquetasOrfasDasUnidades, COBERTURAS_NBR12721, DIVISOES_NBR12721, ESCOPOS_NBR12721, MAX_COEFICIENTE_NBR12721, MAX_NOME_DE_AMBIENTE_DECLARADO, classificacaoNbr12721Valida, findAmbienteDeclarado, limparReferenciasNbr12721, MAX_NUMERO_DE_UNIDADE, MAX_TIPOLOGIA_DE_UNIDADE, findNucleo, pavimentosDoNucleo, pavimentoMaisAlto, TIPOS_DE_NUCLEO, nomeDoTipoDeNucleo, findVaga, contornoDaVaga, TIPOS_DE_VAGA, findBloco, USOS_DO_BLOCO, ROTULO_DO_USO_DO_BLOCO, MAX_NOME_DE_BLOCO, MAX_PAVIMENTOS_DO_BLOCO, PE_DIREITO_PADRAO_DO_BLOCO_MM, PE_DIREITO_MIN_DO_BLOCO_MM, PE_DIREITO_MAX_DO_BLOCO_MM, DIMENSAO_DA_VAGA, ROTULO_DO_TIPO_DE_VAGA, findAnotacao, anguloDaCota, trechosDaCotaLinear, mesmaVista, findVistaDependente, MAX_NOME_DE_VISTA_DEPENDENTE, findSubRegiao, findRodape, findEtapa, findQuadra, findLote, findVia, findAreaPublica, findAreaDeOperacao, PROTECOES_DE_ESCADA, MARCAS_DE_EMERGENCIA, AGENTES_EXTINTORES, capacidadeExtintoraValida, PADRAO_DO_CODIGO_DE_PLACA, limparPlacasOrfas, TIPOS_DO_LACO_DE_ALARME, limparLacosOrfos, limparCondensadorasOrfas, TIPOS_DE_EVAPORADORA, TIPOS_DE_CONDENSADORA, TIPOS_DE_DIVISAO_DO_VRF, TIPOS_QUE_LIGAM_NA_CONDENSADORA, TIPOS_DE_TERMINAL_DE_AR, TIPOS_COM_CAPACIDADE, TIPOS_COM_VAZAO, TIPOS_DE_CLIMATIZACAO, RISCOS_DE_SPRINKLER, MAX_NOME_DE_AREA_DE_OPERACAO, MAX_NOME_DE_VERTICE, TOLERANCIA_DO_VERTICE_MM, TIPOS_DE_LIMITE, MAX_DOCUMENTO_DO_CONFRONTANTE, TIPOS_DE_LOTE, TIPOS_DE_AREA_PUBLICA, TIPOS_DE_AREA_DO_LOTEAMENTO, TIPOS_AMBIENTAIS, ehAreaDoLoteamento, FICHA_DA_AREA_PUBLICA, MAX_NOME_DE_QUADRA, MAX_NUMERO_DE_LOTE, MAX_NOME_DE_VIA, MAX_NOME_DE_AREA_PUBLICA, MAX_LARGURA_DE_VIA_MM, MAX_NOME_DE_ETAPA, MATERIAIS_DE_SUB_REGIAO, FICHA_DO_MATERIAL_DE_SUB_REGIAO, MAX_NOME_DE_SUB_REGIAO, DATA_ISO_DA_REVISAO, TIPOS_DE_ANOTACAO, ROTULO_DO_TIPO_DE_ANOTACAO, PONTOS_MINIMOS_DA_ANOTACAO, TRACOS_DA_ANOTACAO, PADROES_DE_HACHURA, MAX_TEXTO_DE_ANOTACAO, ALTURA_PADRAO_DO_TEXTO_MM, findGuardaCorpo, comprimentoDoGuardaCorpo, TIPOS_DE_GUARDA_CORPO, ROTULO_DO_TIPO_DE_GUARDA_CORPO, MATERIAIS_DE_GUARDA_CORPO, ROTULO_DO_MATERIAL_DE_GUARDA_CORPO, ALTURA_PADRAO_DO_GUARDA_CORPO_MM, ALTURA_MINIMA_DO_GUARDA_CORPO_MM, FAIXA_DO_CORRIMAO_MM, MAX_ROTULO_DE_GUARDA_CORPO, findComponente, contornoDoComponente, pontoHidraulicoDoComponente, pontoEletricoDoComponente, CATALOGO_DE_COMPONENTES, CONJUNTOS_DE_COMPONENTES, ehConjunto, filhosDoConjunto, paiDoComponente, extensaoDoConjunto, TIPOS_DE_COMPONENTE, FAMILIAS_DE_COMPONENTE, ROTULO_DA_FAMILIA_DE_COMPONENTE, MAX_ROTULO_DE_COMPONENTE, TIPOS_DE_RESTRICAO_DO_LOTE, FAIXA_PADRAO_DA_RESTRICAO, ROTULO_DA_RESTRICAO_DO_LOTE, findGrupo, uidDaCopia, transformarPontoDoGrupo, giroTransformadoDoGrupo, copiasDeInstancia, limparOrigensOrfasDosGrupos, MAX_NOME_DE_GRUPO, ESPELHOS_DO_GRUPO, ROTACOES_DO_GRUPO, findEscada, extensaoDeCanto, deslocamentoParaManterFace, ladoOposto, somaDasCamadas, clonarCamadas, clonarArco, PAINEIS_DE_CORTINA, ROTULO_DO_PAINEL_DE_CORTINA, ORIENTACOES_DE_BRISE, MIN_MODULO_DE_CORTINA_MM, MIN_MONTANTE_MM, MIN_LAMINA_DE_BRISE_MM, assinaturaDasCamadas, assertHachuraDaCamada, PADROES_DE_MATERIAL, ROTULO_DO_PADRAO_DE_MATERIAL, ESCALA_MIN_DA_HACHURA_PCT, ESCALA_MAX_DA_HACHURA_PCT, FUNCOES_DE_CAMADA, clonarAcabamentos, acabamentosOuAusente, assinaturaDosAcabamentos, acabamentosDoAmbiente, MAX_REBAIXO_DE_FORRO_MM, MAX_ALTURA_DE_RODAPE_MM, MAX_CHARS_DO_DEPARTAMENTO, departamentoNormalizado, pontasDeslocadas, reservaDeAberturas, circuitosDoTrecho, pontasNoVerticeMovido, faceInternaMm, recuoAteFace, SENO_MINIMO_MITRA, retanguloDoLaco, verticeDeAcompanhamento } from './model';
// MURO (0.104.0): muro de divisa, grade, mureta com grade e os portões.
export type { Muro, PortaoDoMuro, TipoDeMuro, TipoDePortao } from './model';
export { TIPOS_DE_MURO, ROTULO_DO_TIPO_DE_MURO, TIPOS_DE_PORTAO, ROTULO_DO_TIPO_DE_PORTAO, ALTURA_PADRAO_DO_MURO_MM, ESPESSURA_PADRAO_DO_MURO_MM, ALTURA_PADRAO_DA_MURETA_MM, LARGURA_PADRAO_DO_PORTAO_MM, MAX_ROTULO_DE_MURO, comprimentoDoMuro, assertMuro, findMuro } from './model';
export { trechosDoMuro, vaosDosPortoes, areasDoMuro, noPercursoDoMuro, type TrechoDoMuro, type VaoDoPortao } from './muro';
// REGISTRO DO LANÇAMENTO (0.105.0): com que escolhas cada motor de lançamento lançou a rede.
export type { MotorDeLancamento, RegistroDeLancamento, ValorDeEscolha } from './model';
export { MOTORES_DE_LANCAMENTO } from './model';

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
  baseDaEscadaMm,
  bordasDaEscada,
  comprimentoDoPercurso,
  contornoDaEscada,
  degrausDaEscada,
  desnivelDaEscada,
  ehEscadaDeAcesso,
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

export { computeQuantities, formatarQuantidade, POLITICA_PADRAO, areaRecuada, areaConstruidaMm2, medirEstrutura, aberturasDoAmbiente, ladoSemParede, comprimentoSemParedeMm, agruparPorBitola, medidaDaBitola, agruparPorTerminal, especificacaoDoTerminal, agruparPorConexao, agruparPorCondutor, agruparPorDisjuntor, agruparPorDR, agruparPorDPS, quadrosQuantificados, repartirCondutores } from './quantities';
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
  QuantidadeTrecho,
  QuantidadePorBitola,
  QuantidadePorTerminal,
  QuantidadePorConexao,
  QuantidadePorCondutor,
  QuantidadePorDisjuntor,
  QuantidadeDoQuadro,
} from './quantities';

export type { Command, CommandResult, Diff, FamiliaComParametros, EspecificacaoDeInstancia } from './commands';
export { assertParametros, CHAVE_DE_PARAMETRO, MAX_PARAMETROS_POR_PECA, MAX_TEXTO_DE_PARAMETRO } from './model';
export type { Parametros, ValorDeParametro } from './model';
export { applyCommand, applyBatch, ModelHistory } from './commands';

// CLASH de instalação. Saída PRÓPRIA, de propósito: ela NÃO vira desconto no
// quantitativo — ver o cabeçalho de `conflitos.ts`.
export { conflitosDoModelo, distanciaEntreEixos3D, envelopeDoTrecho, pontasNoMundo, type Conflito, type VolumeDePeca } from './conflitos';
export { segmentosDoEletroduto, type SegmentoDoTrecho } from './caminhoDoEletroduto';
// CLASH arquitetônico (E0.4): vão × estrutura, escada × pilar, escada × altura livre. Mesma
// natureza (pendência, não desconto), tipo próprio porque a peça não é um trecho.
export { conflitosArquitetonicos, conflitosDeReserva, conflitosDoEquipamento, folgaDoEquipamentoMm, contornoComFolga, ehReservaDeEquipamento, ALTURA_LIVRE_MIN_MM, AFASTAMENTO_SPRINKLER_OBSTRUCAO_MM, FAIXA_DO_TETO_MM, type ConflitoArquitetonico } from './conflitosArquitetonicos';

// O QUADRO DE CARGAS. Derivado, nunca gravado — e só SOMA o que foi declarado:
// dimensionamento está fora do escopo por decisão. Ver o cabeçalho do arquivo.
export {
  quadroDeCargas,
  type QuadroDeCargas,
  type CargaDoQuadro,
  type CargaDoCircuito,
} from './quadroDeCargas';
export { conexoesDerivadas, conexaoViraPeca, tipoDeConexaoManual, ROTULO_DA_CONEXAO, CAIXAS_DE_ESGOTO, extensaoVerticalDaCaixa } from './conexoes';
export type { ConexaoDerivada, ConexoesDoModelo, PontaAberta, RamalDaConexao, TipoDeConexao } from './conexoes';
export { furosDoNucleo, medirNucleo, type FuroDoNucleo, type MedidaDoNucleo } from './nucleo';
// E2.3 (29/09/2026): grafo da rede, comandos, condutores (Tab. 58) e fiação derivada — no kernel,
// para o quantitativo de fio ler a MESMA fiação que o desenho.
export * from './grafoDeRede';
export * from './comandos';
export * from './condutores';
export * from './fiacao';
// E3.1 (29/09/2026): o DR como peça do quadro, com o legado `protecaoDR` lido igual.
export * from './protecaoDr';
