/**
 * Comandos, diff e histórico (PRD §12.3).
 *
 * ADR-01: o renderer não é o modelo. Todo gesto vira comando; todo comando é
 * validado pelo kernel e produz um diff. Nada muda o modelo por atribuição direta.
 *
 * IDEMPOTÊNCIA: repetir o mesmo `commandId` não duplica efeito. É o que permite ao
 * cliente reenviar um lote depois de uma queda de rede sem criar parede fantasma.
 */

import { KernelError, assertIntegerMm, roundToMm } from './units';
import { arcoConsistente, discretizarArco } from './arco';
import { aguasDaExtrusao, MENSAGEM_DO_ERRO_DE_PERFIL, type ErroDoPerfil, type PontoDoPerfil } from './coberturaExtrusao';
import { faixaDaEstruturaNaParede } from './sobreposicao';
import {
  type BlueprintModel,
  type CamadaParede,
  type DisciplinaDeRede,
  type TipoDePontoEletrico,
  type TipoDeInterruptor,
  type TipoDePontoHidraulico,
  type LigacaoDoCircuito,
  type FaseDoCircuito,
  type TipoDeAmbiente,
  type Georreferencia,
  type ObjectId,
  type Opening,
  type Wall,
  assertModelInvariants,
  assinaturaDasCamadas,
  clonarCamadas,
  clonarArco,
  type ArcoDaParede,
  type CortinaDeVidro,
  type Brise,
  type RevisaoDaNuvem,
  findVistaDependente,
  findSubRegiao,
  MATERIAIS_DE_SUB_REGIAO,
  MAX_NOME_DE_SUB_REGIAO,
  type MaterialDeSubRegiao,
  CONJUNTOS_DE_COMPONENTES,
  ehConjunto,
  filhosDoConjunto,
  extensaoDoConjunto,
  MAX_NOME_DE_VISTA_DEPENDENTE,
  acabamentosOuAusente,
  type AcabamentosDoAmbiente,
  cloneModel,
  somaDasCamadas,
  type BoundaryKind,
  type BoundaryPapel,
  type Esquadria,
  type StructuralKind,
  type TipoCirculacao,
  type Trecho,
  FORMA_ESTRUTURAL,
  findAgua,
  findCorte,
  findEscada,
  findBoundary,
  findLevel,
  findStructural,
  findWall,
  ladoOposto,
  nextId,
  nomeDoTipoEstrutural,
  pontosEsperados,
  pontasDeslocadas,
  reservaDeAberturas,
  pontasNoVerticeMovido,
  wallLength,
  pontasPresasAsPecas,
  assertParametros,
  findEixo,
  findRestricao,
  limparRestricoesOrfas,
  findUnidade,
  limparEtiquetasOrfasDasUnidades,
  findGrupo,
  findNucleo,
  type TipoDeNucleo,
  findVaga,
  DIMENSAO_DA_VAGA,
  type TipoDeVaga,
  findComponente,
  findGuardaCorpo,
  findAnotacao,
  PONTOS_MINIMOS_DA_ANOTACAO,
  ALTURA_PADRAO_DO_TEXTO_MM,
  MAX_TEXTO_DE_ANOTACAO,
  type TipoDeAnotacao,
  type VistaDaAnotacao,
  type TracoDaAnotacao,
  type PadraoDeHachura,
  ALTURA_PADRAO_DO_GUARDA_CORPO_MM,
  MAX_ROTULO_DE_GUARDA_CORPO,
  type TipoDeGuardaCorpo,
  type MaterialDeGuardaCorpo,
  CATALOGO_DE_COMPONENTES,
  FASES_DE_REFORMA,
  type FaseDeReforma,
  MAX_ROTULO_DE_COMPONENTE,
  type TipoDeComponente,
  type FamiliaDeComponente,
  FAIXA_PADRAO_DA_RESTRICAO,
  type TipoDeRestricaoDoLote,
  uidDaCopia,
  transformarPontoDoGrupo,
  giroTransformadoDoGrupo,
  copiasDeInstancia,
  limparOrigensOrfasDosGrupos,
  MAX_NOME_DE_GRUPO,
  type Grupo,
  type InstanciaDeGrupo,
  type RotacaoDoGrupo,
  type EspelhoDoGrupo,
  MAX_NUMERO_DE_UNIDADE,
  MAX_TIPOLOGIA_DE_UNIDADE,
  MAX_NOME_DE_EIXO,
  type Restricao,
  type TipoDeRestricao,
  type FamiliaRestringivel,
  type Parametros,
  type ValorDeParametro,
  type Level,
  type SpaceLabel,
  type Structural,
} from './model';
import {
  type AlinhamentoParede,
  type Point,
  areCollinear,
  interiorPoint,
  pointInPolygon,
  pointsEqual,
} from './geom';
import { recomputeSpaces } from './arrangement';
import { snapshotHash } from './canonical';
import { novoUid, type ElementUid } from './identity';

export type Command =
  /** `tipoDeId`: nasce vinculado a este pavimento tipo (E2.1). */
  | { type: 'AddLevel'; name: string; elevationMm: number; defaultHeightMm: number; tipoDeId?: ObjectId }
  | {
      type: 'AddWall';
      levelId: ObjectId;
      a: Point;
      b: Point;
      thicknessMm: number;
      heightMm: number;
      /**
       * De que lado do eixo estava o traço clicado. `a`/`b` continuam sendo o
       * EIXO já resolvido por `eixoDaParede` — este campo não o desloca, só
       * grava a autoria para quem for mudar a espessura depois. Omitido =
       * `'EIXO'`, o comportamento de sempre. Ver `Wall.alinhamento`.
       */
      alinhamento?: AlinhamentoParede;
      /**
       * Composição já na criação.
       *
       * `SetWallLayers` existe e faz o mesmo, mas exige o `id` da parede — que
       * só nasce ao aplicar o comando. Quem importa um arquivo monta a lista
       * INTEIRA antes de aplicar (é o que torna a importação "ou tudo, ou
       * nada"), e não tem esse id. Mesma razão de `secaoT` estar em
       * `AddStructural`.
       *
       * Quando presente, `thicknessMm` é IGNORADO: a espessura vem da soma das
       * camadas, como em `SetWallLayers`.
       */
      camadas?: CamadaParede[];
      /**
       * Identidade vinda de FORA — o `GlobalId` de um arquivo importado.
       *
       * Omitido (o caso de todo desenho feito à mão) = `novoUid()`. Presente,
       * é o que faz a ida e volta com o Revit fechar: `IfcGloballyUniqueId` é
       * um UUID comprimido, então o `uid` do kernel PODE ser o identificador do
       * próprio arquivo, e a exportação devolve o mesmo `GlobalId`.
       */
      uid?: ElementUid;
    }
  /** CORTINA DE VIDRO (0.54.0, P2.20): `null` volta a parede opaca. */
  | { type: 'SetWallCortina'; wallId: ObjectId; cortina: CortinaDeVidro | null }
  /** BRISE (0.54.0, P2.20): `null` tira o brise. */
  | { type: 'SetWallBrise'; wallId: ObjectId; brise: Brise | null }
  /**
   * PAREDE CURVA (0.48.0, P2.12): arco por três pontos — início, fim e um
   * ponto por onde passa — gravado como N paredes retas (facetas) com o
   * metadado `arco`. Ver `arco.ts`. Recusa colineares (`DEGENERATE_ARC`).
   */
  | {
      type: 'AddCurvedWall';
      levelId: ObjectId;
      a: Point;
      b: Point;
      passandoPor: Point;
      thicknessMm: number;
      heightMm: number;
      alinhamento?: AlinhamentoParede;
      camadas?: CamadaParede[];
    }
  | {
      type: 'AddOpening';
      /**
       * A parede furada. Vazio quando quem chama só tem o `uid` — ver
       * `wallUid`, e exatamente um dos dois tem de vir preenchido.
       */
      wallId: ObjectId;
      /**
       * A parede furada pela IDENTIDADE, e não pelo id.
       *
       * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────
       *
       * Quem importa um arquivo monta a lista INTEIRA de comandos antes de
       * aplicar — é o que faz a importação ser "ou tudo, ou nada". A parede
       * nasce nessa mesma lista, então o `id` dela ainda não existe quando o
       * vão precisa apontar para ela. O `uid`, sim: ele veio do arquivo.
       *
       * É para isto que serve identidade estável. A alternativa seria o
       * chamador prever o id que `nextId` vai gerar, acoplando-o ao gerador.
       */
      wallUid?: ElementUid;
      kind: 'door' | 'window' | 'passage' | 'sliding';
      offsetMm: number;
      widthMm: number;
      heightMm: number;
      sillMm: number;
      /** Omitido = `true`/`false` — o padrão de sempre, para não obrigar todo
       * chamador existente a decidir orientação numa porta nova. */
      hingeAtStart?: boolean;
      swingReversed?: boolean;
      /** Só para `sliding`. Omitido = corre por FORA, que é a forma comum. */
      embutida?: boolean;
      /** O tipo, quando a barra já o escolheu. Omitido = sem tipo. */
      esquadria?: Esquadria;
    }
  /**
   * Limite sem material. `kind` distingue o anel do LOTE de uma divisa solta —
   * ver `BoundaryKind`. Omitido continua valendo `DIVISA`, para não obrigar o
   * chamador antigo (os testes de ambiente dividido) a decidir sobre terreno.
   */
  | {
      type: 'AddBoundary';
      levelId: ObjectId;
      a: Point;
      b: Point;
      kind?: BoundaryKind;
      papel?: BoundaryPapel | null;
      /** Obrigatório com `kind = 'RESTRICAO'`; omitido = faixa padrão do tipo. */
      restricao?: { tipo: TipoDeRestricaoDoLote; faixaMm?: number };
    }
  /** Tipo e faixa da RESTRICAO; trocar o tipo sem faixa leva a faixa padrão do tipo novo. */
  | { type: 'SetBoundaryRestricao'; boundaryId: ObjectId; tipo?: TipoDeRestricaoDoLote; faixaMm?: number }
  | { type: 'MoveBoundaryVertex'; boundaryId: ObjectId; end: 'a' | 'b'; to: Point }
  | { type: 'DeleteBoundary'; boundaryId: ObjectId }
  /**
   * Cria um elemento de estrutura. `pontos` já vem com a cardinalidade da forma
   * (1, 2 ou ≥3) — quem monta o gesto é que sabe quando o contorno fechou, e
   * inferir a forma pelo tamanho do array aqui aceitaria em silêncio uma laje
   * de dois vértices como se fosse viga.
   *
   * Os campos que não se aplicam à forma (profundidade numa viga, largura numa
   * laje) são opcionais e nascem em 0 — pela mesma razão que `sillMm` existe em
   * porta: um tipo que bifurca por `kind` espalha o `switch` por todo chamador.
   */
  | {
      type: 'AddStructural';
      levelId: ObjectId;
      kind: StructuralKind;
      pontos: Point[];
      larguraMm?: number;
      profundidadeMm?: number;
      alturaMm: number;
      baseMm?: number;
      circular?: boolean;
      rotacaoDeg?: number;
      rotulo?: string | null;
      /** Seção em T (mesa + alma). Ausente = seção cheia. Ver `secaoT.ts`. */
      secaoT?: { mesaAlturaMm: number; almaLarguraMm: number };
    }
  /** Campo omitido fica como está — o painel edita uma medida por vez. */
  | {
      type: 'SetStructuralProps';
      structuralId: ObjectId;
      larguraMm?: number;
      profundidadeMm?: number;
      alturaMm?: number;
      baseMm?: number;
      circular?: boolean;
      rotacaoDeg?: number;
      rotulo?: string | null;
    }
  /**
   * Troca o tipo de uma peça já lançada — DENTRO da mesma forma geométrica.
   *
   * Existe pela lição de `SetOpeningKind`: sem ele, quem lançou um pilar e
   * queria uma estaca tem de apagar e refazer, perdendo seção, cota e rótulo já
   * ajustados. E RECUSA a troca que mude a forma (pilar → viga) porque os
   * `pontos` não sobrevivem: um centro não é um eixo, e converter inventaria
   * geometria que ninguém desenhou. A UI oferece só os destinos compatíveis.
   */
  | { type: 'SetStructuralKind'; structuralId: ObjectId; kind: StructuralKind }
  /** Move UM vértice. Espelha `MoveBoundaryVertex`; em `PONTO` reposiciona a peça. */
  | { type: 'MoveStructuralVertex'; structuralId: ObjectId; index: number; to: Point }
  | { type: 'DeleteStructural'; structuralId: ObjectId }
  /**
   * Lança uma ÁGUA de telhado — o polígono em planta mais a regra de caimento.
   *
   * `beiralIndex` nasce em 0 (o primeiro lado desenhado) porque quem contorna
   * uma água costuma começar pelo beiral, que é a linha que ele enxerga na
   * fachada. Trocar depois é um clique no painel, e o desenho mostra a seta.
   */
  | {
      type: 'AddAgua';
      levelId: ObjectId;
      pontos: Point[];
      inclinacaoPct: number;
      beiralIndex?: number;
      baseMm?: number;
      espessuraMm?: number;
    }
  /**
   * COBERTURA POR EXTRUSÃO (0.49.0, P2.13): perfil em corte (`s` através do
   * eixo, `z` altura sobre o piso) extrudado ao longo de A→B — uma água por
   * trecho reto, com o metadado `extrusao`. Ver `coberturaExtrusao.ts`.
   */
  | {
      type: 'AddRoofByExtrusion';
      levelId: ObjectId;
      eixoA: Point;
      eixoB: Point;
      perfil: PontoDoPerfil[];
      espessuraMm?: number;
    }
  /** Campo omitido fica como está — o painel edita uma medida por vez. */
  | {
      type: 'SetAguaProps';
      aguaId: ObjectId;
      inclinacaoPct?: number;
      beiralIndex?: number;
      baseMm?: number;
      espessuraMm?: number;
    }
  /** Move UM vértice da água. Espelha `MoveStructuralVertex`. */
  | { type: 'MoveAguaVertex'; aguaId: ObjectId; index: number; to: Point }
  | { type: 'DeleteAgua'; aguaId: ObjectId }
  /**
   * Lança uma LINHA DE CORTE — dois cliques, como a viga.
   *
   * `olharPara` nasce em `ESQUERDA` porque é a convenção em que o eixo
   * horizontal do desenho cai sobre `a → b`: quem traça da esquerda para a
   * direita vê o corte na mesma mão em que desenhou.
   */
  | {
      type: 'AddCorte';
      a: Point;
      b: Point;
      olharPara?: 'ESQUERDA' | 'DIREITA';
      rotulo?: string;
    }
  | {
      type: 'SetCorteProps';
      corteId: ObjectId;
      olharPara?: 'ESQUERDA' | 'DIREITA';
      rotulo?: string;
    }
  /** Move UMA ponta da linha. Espelha `MoveBoundaryVertex`. */
  | { type: 'MoveCorteVertex'; corteId: ObjectId; end: 'a' | 'b'; to: Point }
  | { type: 'DeleteCorte'; corteId: ObjectId }
  /**
   * EIXO da malha (E1.4). `nome` omitido = palpite pela direção: horizontal
   * (|dx| ≥ |dy|) ganha a próxima LETRA, vertical o próximo NÚMERO — a
   * convenção de prancha. `nome: ''` explícito = linha de referência sem bolha.
   */
  | { type: 'AddEixo'; a: Point; b: Point; nome?: string }
  | { type: 'SetEixoProps'; eixoId: ObjectId; nome?: string }
  | { type: 'MoveEixoVertex'; eixoId: ObjectId; end: 'a' | 'b'; to: Point }
  | { type: 'DeleteEixo'; eixoId: ObjectId }
  /**
   * RESTRIÇÃO (E1.4b): declara a intenção; a conferência é derivada. Alvo e
   * referência por ID de peça (o comando resolve o uid). Ver `Restricao`.
   */
  | {
      type: 'AddRestricao';
      tipo: TipoDeRestricao;
      alvo: { familia: 'wall' | 'structural'; id: ObjectId };
      referencia?: { familia: FamiliaRestringivel; id: ObjectId };
      valorMm?: number;
    }
  | { type: 'DeleteRestricao'; restricaoId: ObjectId }
  /**
   * UNIDADE (E2.2): conjunto de etiquetas de ambiente. `labelIds` são IDs de
   * etiqueta (o comando resolve o uid); etiqueta que estava em outra unidade
   * é TRANSFERIDA. Número duplicado é recusado (`BAD_UNIT`).
   */
  | { type: 'AddUnidade'; numero: string; tipologia?: string | null; pcd?: boolean; labelIds?: ObjectId[] }
  /** Campo omitido fica como está; `labelIds` substitui o conjunto inteiro. */
  | { type: 'SetUnidadeProps'; unidadeId: ObjectId; numero?: string; tipologia?: string | null; pcd?: boolean; labelIds?: ObjectId[] }
  | { type: 'DeleteUnidade'; unidadeId: ObjectId }
  /**
   * Põe UM ambiente numa unidade (ou tira: `unidadeId: null`). Ambiente sem
   * etiqueta ganha uma com `nome` — a unidade só sabe falar de etiquetas.
   */
  | { type: 'SetUnidadeDoAmbiente'; spaceId: ObjectId; unidadeId: ObjectId | null; nome?: string }
  /**
   * GRUPO COM ORIGEM (E2.3). A origem são peças que já existem, do mesmo
   * pavimento; as aberturas das paredes vão junto. `pivo` omitido = canto
   * inferior-esquerdo da caixa das peças. Ver `Grupo`.
   */
  | { type: 'AddGrupo'; nome: string; wallIds: ObjectId[]; structuralIds?: ObjectId[]; labelIds?: ObjectId[]; pivo?: Point; instancias?: EspecificacaoDeInstancia[] }
  | { type: 'SetGrupoProps'; grupoId: ObjectId; nome?: string; pivo?: Point }
  /**
   * Nova instância: espelho e giro em torno do pivô, depois translação. As
   * cópias nascem no MESMO comando. Com `unidade`, as etiquetas copiadas já
   * nascem numa unidade nova ("unidade tipo" = grupo + unidade).
   */
  | ({ type: 'AddInstanciaDeGrupo'; grupoId: ObjectId } & EspecificacaoDeInstancia)
  | { type: 'SetInstanciaDeGrupo'; grupoId: ObjectId; instanciaUid: ElementUid; translacao?: Point; rotacaoGraus?: RotacaoDoGrupo; espelho?: EspelhoDoGrupo }
  | { type: 'DeleteInstanciaDeGrupo'; grupoId: ObjectId; instanciaUid: ElementUid }
  /** `manterInstancias` = desagrupar: as cópias ficam, livres. Senão somem. */
  | { type: 'DeleteGrupo'; grupoId: ObjectId; manterInstancias: boolean }
  /**
   * ESCADA ou RAMPA pelo PERCURSO.
   *
   * ⚠️ NÃO existe um `degraus` aqui, e a ausência é o ponto. O número de
   * espelhos é DERIVADO do desnível (`medirEscada`), e aceitá-lo como parâmetro
   * abriria a porta exata que a família fechou: uma escada com 20 degraus numa
   * altura que pede 22, que desenha bonito e não chega ao piso de cima.
   *
   * `alvoEspelhoMm` nasce em 175 — o espelho da casa brasileira, e o meio da
   * faixa de 160 a 180 da NBR 9050.
   */
  | {
      type: 'AddEscada';
      levelId: ObjectId;
      pontos: Point[];
      tipo?: TipoCirculacao;
      larguraMm?: number;
      alvoEspelhoMm?: number;
      rotulo?: string | null;
    }
  | {
      type: 'SetEscadaProps';
      escadaId: ObjectId;
      tipo?: TipoCirculacao;
      larguraMm?: number;
      alvoEspelhoMm?: number;
      rotulo?: string | null;
      /** Escada multiandares (E2.4): `null` volta ao próximo pavimento acima. */
      ateLevelId?: ObjectId | null;
    }
  /**
   * NÚCLEO VERTICAL (E2.4): shaft ou elevador, polígono em planta que atravessa
   * de `levelId` a `ateLevelId` (ausente = o mais alto). Ver `Nucleo`.
   */
  | {
      type: 'AddNucleo';
      levelId: ObjectId;
      tipo: TipoDeNucleo;
      ring: Point[];
      ateLevelId?: ObjectId | null;
      rotulo?: string | null;
      /** Só SHAFT (E11.1): a disciplina que a prumada carrega; ausente = geral. */
      disciplina?: DisciplinaDeRede | null;
      pocoMm?: number | null;
      casaDeMaquinasMm?: number | null;
      capacidade?: number | null;
    }
  | {
      type: 'SetNucleoProps';
      nucleoId: ObjectId;
      tipo?: TipoDeNucleo;
      ateLevelId?: ObjectId | null;
      rotulo?: string | null;
      disciplina?: DisciplinaDeRede | null;
      pocoMm?: number | null;
      casaDeMaquinasMm?: number | null;
      capacidade?: number | null;
    }
  | { type: 'MoveNucleoVertex'; nucleoId: ObjectId; index: number; to: Point }
  | { type: 'DeleteNucleo'; nucleoId: ObjectId }
  /**
   * VAGA DE GARAGEM (E2.5). Medidas omitidas = as do tipo (`DIMENSAO_DA_VAGA`).
   * `sugerida: true` vem do lançamento automático; mover confirma.
   */
  | { type: 'AddVaga'; levelId: ObjectId; at: Point; tipo?: TipoDeVaga; larguraMm?: number; comprimentoMm?: number; rotacaoGraus?: number; numero?: string | null; sugerida?: boolean }
  /** Trocar o tipo sem medidas leva as medidas do tipo novo. */
  | { type: 'SetVagaProps'; vagaId: ObjectId; tipo?: TipoDeVaga; larguraMm?: number; comprimentoMm?: number; rotacaoGraus?: number; numero?: string | null; sugerida?: boolean | null }
  | { type: 'MoveVaga'; vagaId: ObjectId; to: Point }
  | { type: 'DeleteVaga'; vagaId: ObjectId }
  /**
   * COMPONENTE (E7.1). Medidas e família omitidas = as do catálogo
   * (`CATALOGO_DE_COMPONENTES`); trocar o tipo em `SetComponenteProps` sem
   * medidas puxa as do tipo novo, como a vaga.
   */
  | { type: 'AddComponente'; levelId: ObjectId; tipoId: TipoDeComponente; at: Point; familia?: FamiliaDeComponente; larguraMm?: number; profundidadeMm?: number; alturaMm?: number; rotacaoGraus?: number; cotaMm?: number | null; rotulo?: string | null; sugerido?: boolean }
  | { type: 'SetComponenteProps'; componenteId: ObjectId; tipoId?: TipoDeComponente; familia?: FamiliaDeComponente; larguraMm?: number; profundidadeMm?: number; alturaMm?: number; rotacaoGraus?: number; cotaMm?: number | null; rotulo?: string | null; sugerido?: boolean | null }
  | { type: 'MoveComponente'; componenteId: ObjectId; to: Point }
  /** FAMÍLIAS ANINHADAS (0.52.0, P2.18): insere um CONJUNTO (pai + filhos com `paiUid`) centrado em `at`. */
  | { type: 'AddConjunto'; levelId: ObjectId; tipoId: TipoDeComponente; at: Point; rotacaoGraus?: number }
  | { type: 'DeleteComponente'; componenteId: ObjectId }
  /**
   * GUARDA-CORPO / CORRIMÃO (E7.3). Altura omitida = a padrão do tipo (1,10 m /
   * 0,92 m); material omitido = METALICO. `MoveGuardaCorpo` desloca a polilinha
   * inteira por um vetor; vértice a vértice vai por `SetGuardaCorpoProps.pontos`.
   */
  /** VISTA DEPENDENTE (0.51.0, P2.17): recorte nomeado de uma planta, com escala própria. */
  /** SUB-REGIÃO DO TERRENO (0.53.0, P2.19): polígono com material de superfície. */
  | { type: 'AddSubRegiao'; levelId: ObjectId; material: MaterialDeSubRegiao; pontos: Point[]; nome?: string | null }
  | { type: 'SetSubRegiaoProps'; subRegiaoId: ObjectId; material?: MaterialDeSubRegiao; nome?: string | null; pontos?: Point[] }
  | { type: 'MoveSubRegiaoVertex'; subRegiaoId: ObjectId; index: number; to: Point }
  | { type: 'DeleteSubRegiao'; subRegiaoId: ObjectId }
  | { type: 'AddVistaDependente'; levelId: ObjectId; nome: string; recorte: { minX: number; minY: number; maxX: number; maxY: number }; denominador?: number }
  | { type: 'SetVistaDependenteProps'; vistaId: ObjectId; nome?: string; recorte?: { minX: number; minY: number; maxX: number; maxY: number }; denominador?: number }
  | { type: 'DeleteVistaDependente'; vistaId: ObjectId }
  | { type: 'AddGuardaCorpo'; levelId: ObjectId; tipo: TipoDeGuardaCorpo; pontos: Point[]; alturaMm?: number; material?: MaterialDeGuardaCorpo; itemCode?: string; descricao?: string; rotulo?: string | null; sugerido?: boolean }
  /**
   * FASES DE REFORMA (E10.2): marca paredes, aberturas, estruturas e componentes
   * de uma vez. `null` ou `'NOVO'` apaga a chave (NOVO é o padrão e a ausência).
   * Id desconhecido é recusado — marcar o que não existe é erro de quem chama.
   */
  | { type: 'SetFase'; ids: ObjectId[]; fase: FaseDeReforma | null }
  | { type: 'SetGuardaCorpoProps'; guardaCorpoId: ObjectId; tipo?: TipoDeGuardaCorpo; pontos?: Point[]; alturaMm?: number; material?: MaterialDeGuardaCorpo; itemCode?: string; descricao?: string; rotulo?: string | null; sugerido?: boolean | null }
  | { type: 'MoveGuardaCorpo'; guardaCorpoId: ObjectId; dx: number; dy: number }
  | { type: 'DeleteGuardaCorpo'; guardaCorpoId: ObjectId }
  /**
   * ANOTAÇÃO (E8.1). Texto omitido em TEXTO/LEADER = "Texto"; altura omitida =
   * 250 mm do modelo; hachura omitida na HACHURA = DIAGONAL. `MoveAnotacao`
   * desloca todos os pontos; um vértice só vai por `SetAnotacaoProps.pontos`.
   */
  | { type: 'AddAnotacao'; vista: VistaDaAnotacao; tipo: TipoDeAnotacao; pontos: Point[]; texto?: string | null; alturaMm?: number; traco?: TracoDaAnotacao; hachura?: PadraoDeHachura | null; rotacaoGraus?: number; cor?: string | null; /** Obrigatória na NUVEM (0.50.0), recusada nas demais. */ revisao?: RevisaoDaNuvem }
  | { type: 'SetAnotacaoProps'; anotacaoId: ObjectId; pontos?: Point[]; texto?: string | null; alturaMm?: number; traco?: TracoDaAnotacao; hachura?: PadraoDeHachura | null; rotacaoGraus?: number; cor?: string | null; revisao?: RevisaoDaNuvem }
  | { type: 'MoveAnotacao'; anotacaoId: ObjectId; dx: number; dy: number }
  | { type: 'DeleteAnotacao'; anotacaoId: ObjectId }
  /**
   * Um TRECHO de instalação — ver o cabeçalho de `Trecho` em `model.ts`.
   *
   * As duas cotas são OBRIGATÓRIAS, e não têm padrão. Um padrão aqui (zero, por
   * exemplo) faria toda prumada nascer degenerada e todo esgoto nascer sem
   * caimento — e um esgoto sem caimento é um desenho que fecha e não funciona.
   */
  | {
      type: 'AddTrecho';
      levelId: ObjectId;
      disciplina: DisciplinaDeRede;
      a: Point;
      b: Point;
      cotaAMm: number;
      cotaBMm: number;
      bitolaMm: number;
      itemCode?: string | null;
      rotulo?: string | null;
      /** Um circuito já conhecido ao criar — açúcar para `circuitoIds: [id]`. Só em `ELETRICA`. */
      circuitoId?: ObjectId | null;
      /** Os circuitos que passam pelo eletroduto (lançamento automático compartilhado). */
      circuitoIds?: ObjectId[] | null;
      /** Condutores já conhecidos ao criar. */
      condutores?: number | null;
      /** Gerado pelo lançamento automático — ver `Trecho.sugerido`. */
      sugerido?: boolean | null;
    }
  | {
      type: 'SetTrechoProps';
      trechoId: ObjectId;
      disciplina?: DisciplinaDeRede;
      cotaAMm?: number;
      cotaBMm?: number;
      bitolaMm?: number;
      itemCode?: string | null;
      rotulo?: string | null;
      /** UM circuito: `null` desliga todos; um id = só ele. Açúcar de `circuitoIds`. Ausente não mexe. */
      circuitoId?: ObjectId | null;
      /** Os circuitos do trecho, sem repetição; `[]` desliga. Ausente não mexe. */
      circuitoIds?: ObjectId[] | null;
      /** Quantos condutores passam no eletroduto. `null` = não informado. */
      condutores?: number | null;
      /** `false` aceita o caminho sugerido — ver `Trecho.sugerido`. */
      sugerido?: boolean | null;
    }
  | {
      type: 'AddTerminal';
      levelId: ObjectId;
      disciplina: DisciplinaDeRede;
      tipo: string;
      at: Point;
      cotaMm: number;
      itemCode?: string | null;
      rotulo?: string | null;
      /** Classificação, quando a ferramenta já a conhece — ver `TIPOS_DE_PONTO_ELETRICO`. */
      tipoEletrico?: TipoDePontoEletrico | null;
      /** Letra do comando, quando já se sabe qual é. */
      comando?: string | null;
      /** Gerado pela distribuição automática — ver `Terminal.sugerida`. */
      sugerida?: boolean | null;
      /** Potência já conhecida ao criar (a mínima da norma na luz sugerida). */
      potenciaW?: number | null;
      /** A variante do interruptor — ver `TIPOS_DE_INTERRUPTOR`. */
      interruptor?: TipoDeInterruptor | null;
      /** Classificação hidráulica — ver `TIPOS_DE_PONTO_HIDRAULICO`. */
      tipoHidraulico?: TipoDePontoHidraulico | null;
      /** Volume em litros — só faz sentido em `RESERVATORIO`; ignorado nos demais. */
      volumeL?: number | null;
    }
  | {
      type: 'SetTerminalProps';
      terminalId: ObjectId;
      tipo?: string;
      cotaMm?: number;
      itemCode?: string | null;
      rotulo?: string | null;
      /** `null` desliga o ponto do circuito; ausente não mexe. */
      circuitoId?: ObjectId | null;
      potenciaW?: number | null;
      /** Letra do comando ("a", "b"). `null` apaga. */
      comando?: string | null;
      /** `false` aceita a posição sugerida. */
      sugerida?: boolean | null;
      interruptor?: TipoDeInterruptor | null;
      /** Classificação do ponto elétrico. `null` volta a "a classificar". */
      tipoEletrico?: TipoDePontoEletrico | null;
      /** Classificação hidráulica. `null` volta a "a classificar". */
      tipoHidraulico?: TipoDePontoHidraulico | null;
      /** Volume em litros (reservatório). `null` apaga. */
      volumeL?: number | null;
      /** Medidas em mm. `null` volta ao padrão da família; ausente não mexe. */
      larguraMm?: number | null;
      alturaMm?: number | null;
      profundidadeMm?: number | null;
      /** Giro em planta, em graus. Normalizado para 0–359; `null` volta a 0. */
      rotacaoGraus?: number | null;
    }
  | {
      type: 'AddQuadro';
      levelId: ObjectId;
      nome: string;
      at: Point;
      cotaMm?: number;
      /** A alimentação, quando já se sabe — ver `Quadro.ligacao`/`tensaoV`/`alimentadorM`. */
      ligacao?: LigacaoDoCircuito | null;
      tensaoV?: number | null;
      alimentadorM?: number | null;
    }
  | {
      type: 'SetQuadroProps';
      quadroId: ObjectId;
      nome?: string;
      cotaMm?: number;
      /** Medidas em mm. `null` volta ao padrão da família; ausente não mexe. */
      larguraMm?: number | null;
      alturaMm?: number | null;
      profundidadeMm?: number | null;
      /** Giro em planta, em graus. Normalizado para 0–359; `null` volta a 0. */
      rotacaoGraus?: number | null;
      /** A alimentação declarada — ver `Quadro.ligacao`/`tensaoV`/`alimentadorM`. */
      ligacao?: LigacaoDoCircuito | null;
      tensaoV?: number | null;
      alimentadorM?: number | null;
    }
  /**
   * Um CIRCUITO. Exige o quadro: circuito órfão não existe — ele é o que um
   * disjuntor DE UM QUADRO protege.
   */
  | {
      type: 'AddCircuito';
      quadroId: ObjectId;
      nome: string;
      tipo?: string | null;
      tensaoV?: number | null;
      disjuntorA?: number | null;
      secaoMm2?: number | null;
      ligacao?: LigacaoDoCircuito | null;
      protecaoDR?: boolean | null;
      fase?: FaseDoCircuito | null;
    }
  | {
      type: 'SetCircuitoProps';
      circuitoId: ObjectId;
      nome?: string;
      tipo?: string | null;
      tensaoV?: number | null;
      disjuntorA?: number | null;
      secaoMm2?: number | null;
      ligacao?: LigacaoDoCircuito | null;
      protecaoDR?: boolean | null;
      fase?: FaseDoCircuito | null;
    }
  /** Move UM vértice do percurso. Espelha `MoveAguaVertex`. */
  | { type: 'MoveEscadaVertex'; escadaId: ObjectId; index: number; to: Point }
  | { type: 'DeleteEscada'; escadaId: ObjectId }
  | { type: 'DeleteTrecho'; trechoId: ObjectId }
  | { type: 'DeleteTerminal'; terminalId: ObjectId }
  /**
   * Apaga o QUADRO — e os circuitos dele junto.
   *
   * ⚠️ O circuito não sobrevive ao quadro: ele é o que um disjuntor DE UM QUADRO
   * protege. Deixá-lo órfão criaria uma etiqueta solta que apareceria no quadro
   * de cargas de ninguém, e os invariantes a recusariam na leitura seguinte.
   */
  | { type: 'DeleteQuadro'; quadroId: ObjectId }
  | { type: 'DeleteCircuito'; circuitoId: ObjectId }
  /**
   * Quem CEDE o volume disputado quando dois componentes ocupam o mesmo espaço.
   *
   * Um comando só para parede e para peça de concreto porque a pergunta é a
   * mesma dos dois lados — "este componente abre mão do que divide com o
   * outro?" — e o `id` já diz qual família é. Dois comandos gêmeos obrigariam
   * quem chama a saber o tipo antes de perguntar, para responder o mesmo.
   *
   * O comando grava só a DECISÃO. O volume é recalculado a cada leitura do
   * quantitativo (`sobreposicoesDoModelo`), senão mover o pilar deixaria para
   * trás um desconto obsoleto — que não some da tela, vira número plausível.
   */
  | { type: 'SetCedeSobreposicao'; id: ObjectId; cede: boolean }
  /**
   * CORTA a parede onde a peça de concreto passa: ela deixa de atravessar o
   * pilar e termina na face dele.
   *
   * Pedido do usuário (01/09/2026): *"A parede tem de ser cortada de verdade"*.
   * Diferente de `SetCedeSobreposicao`, que só abate o volume no cálculo, aqui a
   * GEOMETRIA muda — e por isso o desconto sai de graça: a parede fica mais
   * curta, e alvenaria mais curta é menos alvenaria.
   *
   * ⚠️ Só faz sentido com a PONTE ESTRUTURAL do arranjo planar
   * (`pontesEstruturais`). Sem ela, o pedaço removido abre o anel e o ambiente
   * some — medido: sala de 4 × 3 m cai de 12,00 m² para zero.
   */
  | { type: 'CutWallAtStructural'; wallId: ObjectId; structuralId: ObjectId }
  /** Qual recuo se aplica a esta divisa. `null` tira o papel. */
  | { type: 'SetBoundaryPapel'; boundaryId: ObjectId; papel: BoundaryPapel | null }
  /**
   * O que a ESCRITURA diz deste lado: a medida da matrícula e o confrontante.
   *
   * Os dois num comando só porque é assim que se lê uma matrícula — "12,00 m
   * confrontando com a Rua das Acácias" é uma frase, não duas. `null` em
   * qualquer um apaga aquele campo; confrontante em branco vira `null`, para não
   * guardar string vazia que depois se compara com `!== null` e engana.
   */
  | {
      type: 'SetBoundaryEscritura';
      boundaryId: ObjectId;
      medidaMm: number | null;
      confrontante: string | null;
    }
  /** Área do lote na escritura, em mm². `null` tira. */
  | { type: 'SetAreaEscritura'; areaMm2: number | null }
  | {
      /**
       * Onde o desenho fica no mundo. `null` tira a georreferência.
       *
       * Um só comando para as duas formas (lat/long e projetada) porque elas
       * descrevem o MESMO fato: separar em dois deixaria o desenho afirmar uma
       * coordenada geográfica e uma projetada que não são o mesmo lugar.
       */
      type: 'SetGeorreferencia';
      georreferencia: Georreferencia | null;
    }
  /**
   * ⚠️ RECUSADO numa parede que tem camadas (`THICKNESS_FROM_LAYERS`): lá a
   * espessura é a SOMA da composição, e usar este comando obrigaria a escolher
   * como redistribuir os milímetros entre as faixas. Escalar proporcionalmente
   * daria espessuras fracionárias e mexeria em material que ninguém mandou
   * mexer — em silêncio, que é a pior forma. Use `SetWallLayers`.
   */
  | { type: 'SetThickness'; wallId: ObjectId; thicknessMm: number }
  /**
   * Troca a COMPOSIÇÃO inteira da parede, e com ela a espessura.
   *
   * ─── UM COMANDO, E NÃO CINCO ────────────────────────────────────────────
   *
   * Adicionar, excluir, duplicar, reordenar e editar camada são todos ESTE
   * comando: a UI monta a lista nova inteira e manda. Cinco comandos
   * granulares custariam caro em três frentes ao mesmo tempo, e a terceira é
   * fatal: `applyBatch` revalida o modelo a cada comando, um gesto viraria
   * vários passos de desfazer, e os estados intermediários seriam INVÁLIDOS —
   * tirar uma camada antes de engrossar outra viola
   * `LAYERS_THICKNESS_MISMATCH` numa edição que, vista como um todo, fecha.
   * É a mesma razão que `TranslateEntities` documenta.
   *
   * ─── A ESPESSURA VEM JUNTO ──────────────────────────────────────────────
   *
   * `thicknessMm` é RECALCULADO como a soma — não é o chamador que informa. Uma
   * espessura passada por fora seria a segunda fonte da verdade sobre a mesma
   * medida, e a primeira coisa a divergir.
   *
   * ⚠️ A geometria NÃO se move sozinha aqui. Mudar a espessura de uma parede
   * traçada pela face exige transladar o eixo para a face escolhida ficar
   * parada — quem chama emite `TranslateEntities` com `manterJuncoes` no MESMO
   * lote, como `mudarEspessura` já faz para `SetThickness`.
   *
   * `camadas: null` volta a parede a homogênea, preservando a espessura atual.
   */
  | { type: 'SetWallLayers'; wallId: ObjectId; camadas: CamadaParede[] | null }
  /**
   * Move UMA ponta de UMA parede.
   *
   * `manterJuncoes` (padrão `false`) leva junto o que estava preso naquela ponta:
   * as pontas de outras paredes/limites que estavam no vértice, e as que
   * repousavam no CORPO da parede movida (o T). Sem ele, o vértice se desprende —
   * que é a semântica CRUA de que `conectarAgora`, `juntarPontas` e o lote de
   * `esticarParede` dependem, e por isso o padrão não pode mudar.
   */
  | {
      type: 'MoveVertex';
      wallId: ObjectId;
      end: 'a' | 'b';
      to: Point;
      manterJuncoes?: boolean;
    }
  /**
   * Desloca um CONJUNTO de paredes e limites de uma vez, rigidamente.
   *
   * Existe em vez de um lote de `MoveVertex` por três motivos independentes,
   * cada um suficiente sozinho:
   *
   * 1. `applyBatch` roda `recomputeSpaces` + `assertModelInvariants` +
   *    `snapshotHash` A CADA comando. Mover 40 paredes seriam 80 recomputações
   *    do arranjo planar num único gesto do usuário.
   * 2. **Os estados intermediários de um lote são inválidos.** `MoveVertex`
   *    mexe numa ponta de cada vez, e com uma ponta andada a parede fica mais
   *    curta — o suficiente para `OPENING_OUT_OF_BOUNDS` recusar o lote inteiro
   *    numa translação que, vista como um todo, não encurta nada. Aqui as duas
   *    pontas andam juntas: o comprimento é preservado por construção, então
   *    nenhuma abertura sai de posição.
   * 3. Um gesto = um passo de desfazer, sem depender de `runBatch` para fingir
   *    atomicidade.
   *
   * As ABERTURAS não precisam de nada: `offsetMm` é relativo à parede que as
   * hospeda, e a parede inteira andou.
   *
   * `manterJuncoes` é a diferença entre MANTER e SOLTAR: ligado, a ponta de um
   * segmento NÃO selecionado que estava presa ao bloco acompanha pela componente
   * do deslocamento paralela ao eixo dela — muda de comprimento, nunca de
   * direção. Desligado, o bloco se desprende, mantendo as próprias medidas.
   * A regra completa, e por que não é a translação crua, está em
   * `pontasDeslocadas`.
   */
  | {
      type: 'TranslateEntities';
      wallIds: ObjectId[];
      /**
       * Limites deslocados no MESMO passo das paredes. Separar em dois comandos
       * quebraria o anel do lote em cada passo intermediário — e é justamente o
       * anel que o `manterJuncoes` precisa enxergar inteiro.
       */
      boundaryIds: ObjectId[];
      /**
       * Estruturas deslocadas no mesmo passo. Elas andam RÍGIDAS: não têm
       * junção com nada (não entram no arranjo planar), então `manterJuncoes`
       * não as alcança e o delta é aplicado a cada vértice sem mais nenhuma
       * regra. Ficarem de fora seria pior do que parece — arrastar uma parede
       * com o pilar embutido deixaria o pilar para trás, no meio do ambiente.
       */
      structuralIds: ObjectId[];
      /**
       * Águas deslocadas junto. Opcional pela razão do `aguaIds` de
       * `DuplicateEntities`, e presente pela razão do `structuralIds` logo
       * acima: arrastar a casa sem levar o telhado o deixaria para trás, no ar.
       */
      aguaIds?: ObjectId[];
      /**
       * INSTALAÇÕES deslocadas junto. Mesma razão de todas as anteriores:
       * arrastar a parede sem levar o eletroduto embutido nela deixaria o cano
       * atravessando o ar, e o clash passaria a acusar um encontro que só existe
       * porque metade do desenho ficou para trás.
       *
       * ⚠️ Só x e y. As COTAS não mudam: arrastar em planta é gesto horizontal,
       * e mexer na altura por causa dele moveria o cano para dentro da laje sem
       * ninguém ter pedido.
       */
      trechoIds?: ObjectId[];
      terminalIds?: ObjectId[];
      quadroIds?: ObjectId[];
      /**
       * NÚCLEOS, VAGAS e COMPONENTES deslocados junto (20/09/2026, backlog P2 —
       * P2.4). Andam RÍGIDOS como a estrutura: o contorno do shaft, o centro da
       * vaga e o do móvel recebem o delta e nada mais — nenhum deles entra no
       * arranjo planar. Mover a vaga/o componente sugerido CONFIRMA, como o
       * terminal: quem arrastou para o lugar certo já decidiu.
       */
      nucleoIds?: ObjectId[];
      vagaIds?: ObjectId[];
      componenteIds?: ObjectId[];
      delta: Point;
      manterJuncoes: boolean;
    }
  /**
   * ESPELHA um conjunto (17/09/2026: *"Espelhar seleção (horizontal/vertical)
   * — plantas geminadas e apartamentos espelhados"*).
   *
   * Reflexão em torno de uma reta paralela a um eixo: `eixo: 'VERTICAL'` é a
   * reta x = `em` (troca esquerda ↔ direita), `'HORIZONTAL'` é y = `em`
   * (troca frente ↔ fundos). O conjunto anda RÍGIDO, como em `DuplicateEntities`
   * — sem `manterJuncoes`: uma reflexão não é translação, e "esticar a vizinha
   * até a nova posição" não tem sentido geométrico quando a peça virou do
   * avesso. Quem espelha metade de um contorno fechado abre o anel, e o
   * ambiente derivado some — é o mesmo que acontece ao arrastar em SOLTAR.
   *
   * O que a reflexão faz com cada família:
   * - parede: `a` e `b` refletidos, SEM trocar de lugar — o `offsetMm` das
   *   aberturas é medido de `a`, e mantê-lo em `a'` põe a porta no ponto
   *   refletido; `swingReversed` inverte, porque o lado de abrir é relativo ao
   *   sentido a→b e a reflexão troca esquerda por direita.
   * - estrutura: vértices refletidos e `rotacaoDeg` negada (uma reflexão leva
   *   o giro θ em −θ, seja qual for o eixo).
   * - água, trecho, terminal, quadro: pontos refletidos; o giro do terminal e
   *   do quadro também é negado. As cotas não mudam (gesto em planta).
   *
   * `em` é aceito em MEIO milímetro: o centro de uma caixa de largura ímpar cai
   * em ,5, e 2·em − x continua inteiro.
   */
  | {
      type: 'MirrorEntities';
      wallIds: ObjectId[];
      boundaryIds: ObjectId[];
      structuralIds: ObjectId[];
      aguaIds?: ObjectId[];
      trechoIds?: ObjectId[];
      terminalIds?: ObjectId[];
      quadroIds?: ObjectId[];
      eixo: 'VERTICAL' | 'HORIZONTAL';
      /** Posição da reta de reflexão (x para VERTICAL, y para HORIZONTAL), em mm. */
      em: number;
    }
  /**
   * GIRA um conjunto em torno de um centro (18/09/2026, roadmap E0.1:
   * *"Rotacionar — P0, edição básica"*).
   *
   * Ângulo em graus INTEIROS, no mesmo sentido de `rotacaoDeg` da estrutura
   * (x' = cx + dx·cos − dy·sen, y' = cy + dx·sen + dy·cos). Múltiplos de 90°
   * são EXATOS — seno e cosseno viram 0/±1 e nenhuma coordenada é arredondada;
   * é o caso de quase todo giro em planta (virar a unidade, girar o bloco de
   * banheiros). Outros ângulos arredondam cada vértice ao milímetro: o conjunto
   * continua rígido a menos de 1 mm, e um vértice compartilhado por duas
   * paredes cai no MESMO ponto arredondado — a junção não abre.
   *
   * O que o giro faz com cada família, como no espelhamento:
   * - parede/limite: `a` e `b` girados; as aberturas mantêm o `offsetMm` (o
   *   sentido a→b se preserva num giro, então `swingReversed` NÃO muda). Se o
   *   arredondamento encurtou a parede em 1 mm e a última abertura deixou de
   *   caber, o offset recua esse milímetro — nunca `OPENING_OUT_OF_BOUNDS` por
   *   causa de um giro.
   * - estrutura: vértices girados e `rotacaoDeg` somado (normalizado a [0, 360)).
   * - água, trecho, terminal, quadro: pontos girados; o giro do terminal e do
   *   quadro é somado. As cotas não mudam (gesto em planta).
   *
   * `centro` em mm INTEIROS — é o que mantém o giro de 90° exato. Quem chama
   * arredonda o centro da caixa (`comandoDeRotacao`).
   */
  | {
      type: 'RotateEntities';
      wallIds: ObjectId[];
      boundaryIds: ObjectId[];
      structuralIds: ObjectId[];
      aguaIds?: ObjectId[];
      trechoIds?: ObjectId[];
      terminalIds?: ObjectId[];
      quadroIds?: ObjectId[];
      anguloGraus: number;
      centro: Point;
    }
  /**
   * PARÂMETROS PERSONALIZADOS (18/09/2026, E1.2): grava/apaga chaves de
   * `parametros` numa peça. `null` apaga a chave; o objeto que ficar vazio some
   * (nunca `{}`). Um comando para as oito famílias, pela chave da família + id —
   * oito comandos seriam oito cópias da mesma regra.
   */
  | {
      type: 'SetParametros';
      familia: FamiliaComParametros;
      id: ObjectId;
      valores: Record<string, ValorDeParametro | null>;
    }
  | { type: 'SplitWall'; wallId: ObjectId; at: Point }
  | { type: 'MergeWalls'; firstId: ObjectId; secondId: ObjectId }
  | { type: 'DeleteWall'; wallId: ObjectId }
  | { type: 'DeleteOpening'; openingId: ObjectId }
  /**
   * Alterna um dos dois eixos do símbolo de porta. Os dois são independentes —
   * ver o comentário de `Opening.hingeAtStart`/`swingReversed` em `model.ts` —
   * então o comando pede QUAL eixo, nunca os dois de uma vez.
   */
  | { type: 'FlipOpening'; openingId: ObjectId; axis: 'hinge' | 'swing' }
  /**
   * Muda o tamanho de uma abertura já inserida. Campo omitido fica como está —
   * o painel edita uma medida de cada vez, e mandar as três a cada tecla faria
   * um comando dizer que mexeu no que ninguém tocou.
   */
  | {
      type: 'SetOpeningSize';
      openingId: ObjectId;
      widthMm?: number;
      heightMm?: number;
      sillMm?: number;
    }
  /**
   * Desliza a abertura ao longo da parede que já a hospeda.
   *
   * NÃO troca de parede: `wallId` fica como está. Mudar de hospedeira é outra
   * operação, com outras perguntas (o que acontece com a orientação da folha
   * quando a parede nova aponta para outro lado?) — e resolver as duas no mesmo
   * comando esconderia a segunda dentro da primeira.
   */
  | { type: 'MoveOpening'; openingId: ObjectId; offsetMm: number }
  /**
   * Troca o TIPO de uma abertura já inserida.
   *
   * Faltava, e a falta era mais cara do que parece: o tipo só podia ser
   * escolhido no seletor ANTES do clique, então quem inseriu uma porta e
   * queria janela tinha de apagar e refazer — perdendo posição, largura,
   * altura e peitoril já ajustados. Com quatro tipos e dois deles novos, era
   * o caminho por onde todo mundo passava.
   *
   * `embutida` só é lida quando o tipo de destino é `sliding`; nos outros ela
   * é zerada, para não guardar uma afirmação sobre bolso numa janela.
   */
  | {
      type: 'SetOpeningKind';
      openingId: ObjectId;
      kind: 'door' | 'window' | 'passage' | 'sliding';
      embutida?: boolean;
    }
  /**
   * Declara ou remove o TIPO de uma abertura. `null` remove.
   *
   * Aplicar um tipo do catálogo é ESTE comando mais `SetOpeningKind` e
   * `SetOpeningSize`, num `applyBatch` — um passo de desfazer, como a
   * composição da parede. Não é um comando único "aplicar tipo" porque cada
   * um dos três já existe com as suas guardas, e um quarto que refizesse as
   * três seria a segunda cópia de cada regra.
   */
  | { type: 'SetOpeningEsquadria'; openingId: ObjectId; esquadria: Esquadria | null }
  /** Nome vazio remove a etiqueta. */
  | { type: 'NameSpace'; spaceId: ObjectId; name: string; tipoDeAmbiente?: TipoDeAmbiente | null; acabamentos?: AcabamentosDoAmbiente | null }
  /**
   * Classifica a ETIQUETA de um ambiente. `null` volta a "a classificar".
   * `acabamentos` (E7.2) SUBSTITUI o conjunto inteiro (piso, forro e rodapé);
   * `null` limpa. Ausente não mexe.
   */
  | { type: 'SetSpaceLabelProps'; labelId: ObjectId; tipoDeAmbiente?: TipoDeAmbiente | null; acabamentos?: AcabamentosDoAmbiente | null }
  /**
   * Renomeia e reposiciona um pavimento. Campo omitido fica como está — o painel
   * edita uma propriedade de cada vez.
   *
   * `elevationMm`/`defaultHeightMm` não tocam nas paredes: cada parede carrega o
   * próprio `heightMm`, e `defaultHeightMm` é só o palpite para a PRÓXIMA parede
   * do nível. Por isso o comando não pode invalidar abertura nenhuma.
   */
  | {
      type: 'SetLevelProps';
      levelId: ObjectId;
      name?: string;
      elevationMm?: number;
      defaultHeightMm?: number;
      /**
       * PAVIMENTO TIPO (E2.1): id do tipo para vincular, `null` para desvincular
       * (as cópias ficam, agora editáveis). Vincular DESCARTA o que o pavimento
       * tinha de arquitetura/estrutura — ele passa a ser a cópia do tipo.
       */
      tipoDeId?: ObjectId | null;
    }
  /**
   * Remove um pavimento E tudo que vive nele (paredes, aberturas, limites,
   * etiquetas) — cascata. Recusa o ÚLTIMO nível: um modelo sem nível nenhum não
   * tem onde desenhar, e `useBlueprintEditor` recria um "Térreo" no vazio, o que
   * mascararia a remoção.
   */
  | { type: 'RemoveLevel'; levelId: ObjectId }
  /**
   * Cria um pavimento novo com a geometria de outro — o "copiar andar" do CAD.
   *
   * Um passo de histórico, e não um lote de `AddLevel` + N×`AddWall`: a cópia é
   * geometria derivada do modelo, então mora no kernel, testável por golden. Os
   * ids saem do contador determinístico (`nextId`), nunca de `randomUUID`.
   */
  | { type: 'DuplicateLevel'; levelId: ObjectId; novoNome: string; elevationMm: number }
  /**
   * Copia paredes, limites e aberturas para outro lugar — o "colar" do editor.
   *
   * UM comando, e não um lote de `AddWall` + N×`AddOpening`, por duas razões que
   * o lote não alcança:
   *
   * 1. **A abertura precisa do id da parede que ainda não existe.** Num lote,
   *    quem monta os comandos teria de adivinhar o id que `nextId` vai gerar no
   *    passo anterior. Aqui o de-para é interno, como já é em `DuplicateLevel`.
   * 2. **Um gesto = um passo de desfazer.** Colar seis paredes e voltar atrás
   *    seis vezes seria o mesmo defeito que `TranslateEntities` já corrigiu para
   *    o arraste.
   *
   * As aberturas hospedadas em `wallIds` **vêm junto sozinhas** — é o que faz
   * "copiar a parede" trazer a porta e a janela dela. Pedi-las também em
   * `openings` duplicaria cada uma.
   *
   * `openings` é para a abertura AVULSA: a porta copiada sem a parede, que o
   * usuário cola em outra parede qualquer. Por isso ela carrega o hospedeiro e o
   * offset de destino, decididos pela UI (a parede sob o cursor) — `delta` não
   * diz nada sobre onde uma abertura cai, porque o offset dela é medido ao longo
   * do eixo do hospedeiro, não no plano.
   */
  | {
      type: 'DuplicateEntities';
      /**
       * Nível de destino das cópias. É parâmetro, e não o nível de origem, para
       * que colar num pavimento diferente do copiado seja o mesmo comando.
       */
      levelId: ObjectId;
      wallIds: ObjectId[];
      boundaryIds: ObjectId[];
      /** Estruturas copiadas, deslocadas por `delta` como paredes e limites. */
      structuralIds: ObjectId[];
      /**
       * Águas copiadas. OPCIONAL, ao contrário das outras listas: toda chamada
       * existente foi escrita antes do telhado existir, e exigir a lista aqui
       * quebraria as onze delas para dizer `[]`.
       */
      aguaIds?: ObjectId[];
      openings: { openingId: ObjectId; wallId: ObjectId; offsetMm: number }[];
      delta: Point;
    };

/** As famílias que carregam `parametros` — as mesmas de `assertParametros`. */
export type FamiliaComParametros = 'wall' | 'opening' | 'structural' | 'roof' | 'stair' | 'trecho' | 'terminal' | 'quadro';

export interface Diff {
  created: ObjectId[];
  updated: ObjectId[];
  deleted: ObjectId[];
  /** split/merge: quem veio de quem. Preserva linhagem quando o ID muda. */
  ancestry: Record<ObjectId, ObjectId[]>;
}

export interface CommandResult {
  model: BlueprintModel;
  diff: Diff;
  hash: string;
}

function emptyDiff(): Diff {
  return { created: [], updated: [], deleted: [], ancestry: {} };
}

/**
 * Aplica um comando sobre uma CÓPIA do modelo.
 *
 * Copiar antes de validar é o que garante que um comando rejeitado não deixa o
 * modelo pela metade: ou o diff inteiro entra, ou nada muda.
 */
/**
 * O corpo de `applyCommand`, SEM calcular o hash.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * `snapshotHash` serializa o modelo INTEIRO e faz SHA-256 dele. Num modelo de
 * 2.000 peças isso custa ~18 ms — por comando. `applyBatch` chamava
 * `applyCommand` em laço, então um lote de n comandos pagava n hashes de um
 * modelo que cresce, e o custo virava O(n²): medido em 06/09/2026, importar as
 * 3.345 peças de um IFC estrutural real levava **62 segundos** de navegador
 * congelado. A curva não deixa dúvida — 250 peças em 0,3 s, 500 em 1,2 s,
 * 1.000 em 4,9 s, 2.000 em 21 s: dobrar quadruplica.
 *
 * E TODOS ESSES HASHES ERAM DESCARTADOS. `applyBatch` calcula o seu no fim; os
 * intermediários não eram lidos por ninguém.
 *
 * Medido função a função no mesmo modelo: `snapshotHash` 18,25 ms/chamada,
 * `assertModelInvariants` 0,50 ms, `recomputeSpaces` 0,00 ms. Por isso só o
 * hash saiu do laço — as outras duas continuam rodando a cada comando, e a
 * semântica do lote fica idêntica: invariante conferida peça a peça, arranjo
 * recomputado sempre. Adiantar essas duas economizaria menos de 1 s e mudaria
 * o que o lote garante.
 */
function aplicarSemHash(
  model: BlueprintModel,
  command: Command,
): { model: BlueprintModel; diff: Diff } {
  const next = cloneModel(model);
  recusarEdicaoEmPavimentoVinculado(model, command);
  recusarEdicaoEmInstanciaDeGrupo(model, command);
  /** Cópias de instância de grupo que existem agora — a sincronização apaga as que deixarem de ser esperadas. */
  const copiasAntes: ReadonlySet<ElementUid> = new Set(copiasDeInstancia(model).keys());
  const diff = emptyDiff();

  switch (command.type) {
    case 'AddLevel': {
      const id = nextId(next, 'lvl');
      if (command.tipoDeId !== undefined) findLevel(next, command.tipoDeId);
      next.levels.push({
        id,
        uid: novoUid(),
        name: command.name,
        elevationMm: command.elevationMm,
        defaultHeightMm: command.defaultHeightMm,
        ...(command.tipoDeId !== undefined ? { tipoDeId: command.tipoDeId } : {}),
      });
      diff.created.push(id);
      break;
    }

    case 'AddWall': {
      if (pointsEqual(command.a, command.b)) {
        throw new KernelError('DEGENERATE_WALL', 'Parede de comprimento zero');
      }
      // `uid` fora de formato e lista de camadas vazia são recusados por
      // `assertModelInvariants`, que roda em todo `applyCommand` — repetir a
      // guarda aqui criaria uma segunda verdade sobre o que é válido.
      const id = nextId(next, 'wal');
      next.walls.push({
        id,
        uid: command.uid ?? novoUid(),
        levelId: command.levelId,
        a: { ...command.a },
        b: { ...command.b },
        // Com camadas, a espessura É a soma delas — a mesma regra de
        // `SetWallLayers`, que recusa `SetThickness` numa parede composta.
        thicknessMm: command.camadas ? somaDasCamadas(command.camadas) : command.thicknessMm,
        heightMm: command.heightMm,
        ...(command.camadas ? { camadas: clonarCamadas(command.camadas) } : {}),
        // `'EIXO'` não é gravado: é o padrão, e emitir a chave em toda parede
        // faria o payload canônico de TODO desenho antigo crescer sem que nada
        // no desenho tivesse mudado. Mesma razão de `areaEscrituraMm2`.
        ...(command.alinhamento && command.alinhamento !== 'EIXO'
          ? { alinhamento: command.alinhamento }
          : {}),
      });
      diff.created.push(id);
      break;
    }

    case 'SetWallCortina': {
      const w = findWall(next, command.wallId);
      if (command.cortina) w.cortina = { moduloMm: assertIntegerMm(roundToMm(command.cortina.moduloMm), 'moduloMm'), montanteMm: assertIntegerMm(roundToMm(command.cortina.montanteMm), 'montanteMm'), painel: command.cortina.painel };
      else delete w.cortina;
      diff.updated.push(w.id);
      break;
    }

    case 'SetWallBrise': {
      const w = findWall(next, command.wallId);
      if (command.brise) w.brise = { orientacao: command.brise.orientacao, laminaMm: assertIntegerMm(roundToMm(command.brise.laminaMm), 'laminaMm'), passoMm: assertIntegerMm(roundToMm(command.brise.passoMm), 'passoMm'), afastamentoMm: assertIntegerMm(roundToMm(command.brise.afastamentoMm), 'afastamentoMm'), lado: command.brise.lado };
      else delete w.brise;
      diff.updated.push(w.id);
      break;
    }

    case 'AddCurvedWall': {
      const arco = discretizarArco(command.a, command.b, command.passandoPor);
      if (!arco) {
        throw new KernelError('DEGENERATE_ARC', 'Os três pontos não definem um arco (colineares, coincidentes ou raio minúsculo)');
      }
      const metadado: ArcoDaParede = { centro: { x: arco.centro.x, y: arco.centro.y }, raioMm: arco.raioMm };
      for (let i = 1; i < arco.vertices.length; i++) {
        const id = nextId(next, 'wal');
        next.walls.push({
          id,
          uid: novoUid(),
          levelId: command.levelId,
          a: { ...arco.vertices[i - 1] },
          b: { ...arco.vertices[i] },
          thicknessMm: command.camadas ? somaDasCamadas(command.camadas) : command.thicknessMm,
          heightMm: command.heightMm,
          ...(command.camadas ? { camadas: clonarCamadas(command.camadas) } : {}),
          ...(command.alinhamento && command.alinhamento !== 'EIXO' ? { alinhamento: command.alinhamento } : {}),
          arco: { centro: { ...metadado.centro }, raioMm: metadado.raioMm },
        });
        diff.created.push(id);
      }
      break;
    }

    case 'AddOpening': {
      const porUid = command.wallUid
        ? next.walls.find((w) => w.uid === command.wallUid)
        : undefined;
      if (command.wallUid && !porUid) {
        throw new KernelError('WALL_NOT_FOUND', `Nenhuma parede com uid ${command.wallUid}`);
      }
      const wall = porUid ?? findWall(next, command.wallId);
      const limit = wallLength(wall);
      if (command.offsetMm < 0 || command.offsetMm + command.widthMm > limit) {
        throw new KernelError(
          'OPENING_OUT_OF_BOUNDS',
          `Abertura ${command.offsetMm}+${command.widthMm} não cabe em ${limit} mm`,
        );
      }
      const id = nextId(next, 'opn');
      next.openings.push({
        id,
        uid: novoUid(),
        wallId: wall.id,
        kind: command.kind,
        offsetMm: command.offsetMm,
        widthMm: command.widthMm,
        heightMm: command.heightMm,
        sillMm: command.sillMm,
        hingeAtStart: command.hingeAtStart ?? true,
        swingReversed: command.swingReversed ?? false,
        // Por FORA é o padrão: é a forma comum, e o bolso exige parede
        // preparada — quem tem bolso sabe que tem, quem não pensou no assunto
        // não tem.
        embutida: command.embutida ?? false,
        ...(command.esquadria ? { esquadria: { ...command.esquadria } } : {}),
      });
      diff.created.push(id);
      break;
    }

    case 'AddBoundary': {
      // A MESMA guarda de `AddWall`. Faltava enquanto nenhuma UI criava limite:
      // agora que se desenha terreno clicando, dois cliques no mesmo vértice
      // produziriam uma aresta nula, que o arranjo planar engole sem erro — o
      // lado sumiria do anel e a área do lote sairia menor, calada.
      if (pointsEqual(command.a, command.b)) {
        throw new KernelError('DEGENERATE_BOUNDARY', 'Limite de comprimento zero');
      }
      findLevel(next, command.levelId);
      const id = nextId(next, 'bnd');
      next.boundaries.push({
        id,
        uid: novoUid(),
        levelId: command.levelId,
        a: { ...command.a },
        b: { ...command.b },
        kind: command.kind ?? 'DIVISA',
        papel: command.papel ?? null,
        ...(command.kind === 'RESTRICAO'
          ? {
              restricao: {
                tipo: command.restricao?.tipo ?? 'NAO_EDIFICAVEL',
                faixaMm: assertIntegerMm(roundToMm(command.restricao?.faixaMm ?? FAIXA_PADRAO_DA_RESTRICAO[command.restricao?.tipo ?? 'NAO_EDIFICAVEL']), 'faixaMm'),
              },
            }
          : {}),
      });
      diff.created.push(id);
      break;
    }

    case 'SetBoundaryRestricao': {
      const boundary = findBoundary(next, command.boundaryId);
      if (boundary.kind !== 'RESTRICAO') throw new KernelError('BAD_RESTRICTION', 'Só a faixa restrita tem tipo e faixa');
      const atual = boundary.restricao ?? { tipo: 'NAO_EDIFICAVEL' as const, faixaMm: FAIXA_PADRAO_DA_RESTRICAO.NAO_EDIFICAVEL };
      const tipo = command.tipo ?? atual.tipo;
      const faixaMm = command.faixaMm !== undefined ? assertIntegerMm(roundToMm(command.faixaMm), 'faixaMm') : command.tipo && command.tipo !== atual.tipo ? FAIXA_PADRAO_DA_RESTRICAO[command.tipo] : atual.faixaMm;
      if (faixaMm <= 0) throw new KernelError('BAD_RESTRICTION', 'A faixa tem de ser positiva');
      boundary.restricao = { tipo, faixaMm };
      diff.updated.push(boundary.id);
      break;
    }

    case 'MoveBoundaryVertex': {
      const boundary = findBoundary(next, command.boundaryId);
      const outra = command.end === 'a' ? boundary.b : boundary.a;
      if (pointsEqual(command.to, outra)) {
        throw new KernelError('DEGENERATE_BOUNDARY', 'Mover o vértice colapsaria o limite');
      }
      boundary[command.end] = { ...command.to };
      diff.updated.push(boundary.id);
      // Sem a checagem de abertura que `MoveVertex` faz: limite não hospeda
      // porta nem janela. Encurtá-lo não pode deixar nada pendurado fora.
      break;
    }

    case 'DeleteBoundary': {
      const boundary = findBoundary(next, command.boundaryId);
      next.boundaries = next.boundaries.filter((b) => b.id !== boundary.id);
      diff.deleted.push(boundary.id);
      break;
    }

    case 'SetBoundaryPapel': {
      const boundary = findBoundary(next, command.boundaryId);
      boundary.papel = command.papel;
      diff.updated.push(boundary.id);
      break;
    }

    // ── Estrutura ────────────────────────────────────────────────────────────

    case 'AddStructural': {
      findLevel(next, command.levelId);

      const forma = FORMA_ESTRUTURAL[command.kind];
      if (!forma) {
        throw new KernelError('BAD_STRUCTURAL_KIND', `Tipo estrutural desconhecido: ${command.kind}`);
      }

      // A cardinalidade é conferida AQUI, e não só nos invariantes, para a
      // mensagem falar do gesto que falhou ("a laje precisa de 3 vértices") em
      // vez de citar um id que o usuário nunca viu.
      const minimo = pontosEsperados(command.kind);
      const ok = forma === 'AREA' ? command.pontos.length >= minimo : command.pontos.length === minimo;
      if (!ok) {
        throw new KernelError(
          'BAD_STRUCTURAL_POINTS',
          `${nomeDoTipoEstrutural(command.kind)} precisa de ${forma === 'AREA' ? `pelo menos ${minimo}` : minimo} vértice(s); recebeu ${command.pontos.length}`,
        );
      }

      const pontos = command.pontos.map((p, i) => ({
        x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`),
        y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`),
      }));

      if (forma === 'LINHA' && pointsEqual(pontos[0], pontos[1])) {
        throw new KernelError('DEGENERATE_STRUCTURAL', 'Estrutura linear de comprimento zero');
      }

      const id = nextId(next, 'str');
      next.structures.push({
        id,
        uid: novoUid(),
        levelId: command.levelId,
        kind: command.kind,
        pontos,
        larguraMm: command.larguraMm ?? 0,
        profundidadeMm: command.profundidadeMm ?? 0,
        alturaMm: command.alturaMm,
        baseMm: command.baseMm ?? 0,
        circular: command.circular ?? false,
        rotacaoDeg: command.rotacaoDeg ?? 0,
        rotulo: command.rotulo?.trim() ? command.rotulo.trim() : null,
        // Só entra quando existe: campo ausente mantém o payload canônico do
        // acervo byte a byte, que é o que preserva os hashes já publicados.
        ...(command.secaoT ? { secaoT: command.secaoT } : {}),
      });
      diff.created.push(id);
      break;
    }

    case 'SetStructuralProps': {
      const s = findStructural(next, command.structuralId);
      if (command.larguraMm !== undefined) s.larguraMm = command.larguraMm;
      if (command.profundidadeMm !== undefined) s.profundidadeMm = command.profundidadeMm;
      if (command.alturaMm !== undefined) s.alturaMm = command.alturaMm;
      if (command.baseMm !== undefined) s.baseMm = command.baseMm;
      if (command.circular !== undefined) s.circular = command.circular;
      if (command.rotacaoDeg !== undefined) {
        // Normaliza para [0, 360) — sem isso, girar dez vezes guardaria 3600 no
        // payload canônico e duas peças visualmente idênticas teriam hashes
        // diferentes.
        const g = Math.round(command.rotacaoDeg) % 360;
        s.rotacaoDeg = g < 0 ? g + 360 : g;
      }
      // String vazia vira `null`: guardar '' faria `rotulo !== null` mentir, e
      // a tela mostraria um rótulo em branco onde não há rótulo nenhum.
      if (command.rotulo !== undefined) {
        s.rotulo = command.rotulo?.trim() ? command.rotulo.trim() : null;
      }
      diff.updated.push(s.id);
      break;
    }

    case 'CutWallAtStructural': {
      const wall = findWall(next, command.wallId);
      const peca = (next.structures ?? []).find((s) => s.id === command.structuralId);
      if (!peca) {
        throw new KernelError('NOT_FOUND', `Peça ${command.structuralId} não existe`);
      }

      const faixa = faixaDaEstruturaNaParede(wall, peca);
      if (!faixa) {
        throw new KernelError(
          'NO_OVERLAP',
          'A peça não atravessa esta parede — não há o que cortar',
        );
      }

      const comp = wallLength(wall);
      const x0 = Math.max(0, Math.round(faixa.x0));
      const x1 = Math.min(comp, Math.round(faixa.x1));
      if (x1 <= x0) {
        throw new KernelError('NO_OVERLAP', 'A peça toca a parede sem atravessá-la');
      }

      // Ponto sobre o eixo a `t` mm de `a`.
      const ux = (wall.b.x - wall.a.x) / comp;
      const uy = (wall.b.y - wall.a.y) / comp;
      const sobreOEixo = (t: number): Point => ({
        x: roundToMm(wall.a.x + ux * t),
        y: roundToMm(wall.a.y + uy * t),
      });

      const daParede = next.openings.filter((o) => o.wallId === wall.id);
      // ⚠️ A CONFERÊNCIA VEM ANTES DE QUALQUER MUTAÇÃO. Abertura que ficaria
      // partida — ou que mora inteira no pedaço removido — aborta o corte. Some
      // uma porta em silêncio é pior do que não cortar: o desenho continua
      // parecendo certo e o orçamento perde uma esquadria.
      for (const o of daParede) {
        const oFim = o.offsetMm + o.widthMm;
        const foraDoVao = oFim <= x0 || o.offsetMm >= x1;
        if (!foraDoVao) {
          throw new KernelError(
            'CUT_THROUGH_OPENING',
            `O corte atravessa a abertura ${o.id}`,
          );
        }
      }

      const sobraInicio = x0 > 0;
      const sobraFim = x1 < comp;

      // A peça cobre a parede inteira: não sobra alvenaria nenhuma.
      if (!sobraInicio && !sobraFim) {
        next.openings = next.openings.filter((o) => o.wallId !== wall.id);
        next.walls = next.walls.filter((w) => w.id !== wall.id);
        for (const o of daParede) diff.deleted.push(o.id);
        diff.deleted.push(wall.id);
        break;
      }

      // Sobra UM trecho: encurta no lugar, sem criar id novo. Manter a mesma
      // parede preserva o que estiver pendurado nela (o `alinhamento`, a decisão
      // de sobreposição) e não polui o histórico com uma peça "nova" que é a
      // mesma de antes.
      if (sobraInicio !== sobraFim) {
        if (sobraInicio) wall.b = sobreOEixo(x0);
        else {
          wall.a = sobreOEixo(x1);
          for (const o of next.openings) {
            if (o.wallId === wall.id) o.offsetMm -= x1;
          }
        }
        diff.updated.push(wall.id);
        break;
      }

      // Sobram os DOIS trechos: vira duas paredes, com o vão do concreto entre
      // elas. Mesmo idioma de `SplitWall` — ids novos, ancestralidade nos dois.
      const primeiroId = nextId(next, 'wal');
      const segundoId = nextId(next, 'wal');
      // IDENTIDADE: o trecho que contém `a` HERDA o uid (pelo spread); o outro
      // nasce com uid novo. Mesma regra de `SplitWall`, pelo mesmo motivo — ver
      // o comentário lá.
      const primeiro: Wall = { ...wall, id: primeiroId, a: { ...wall.a }, b: sobreOEixo(x0) };
      const segundo: Wall = {
        ...wall,
        id: segundoId,
        uid: novoUid(),
        a: sobreOEixo(x1),
        b: { ...wall.b },
      };

      next.walls = next.walls.filter((w) => w.id !== wall.id);
      next.walls.push(primeiro, segundo);
      next.openings = next.openings.map((o) => {
        if (o.wallId !== wall.id) return o;
        return o.offsetMm + o.widthMm <= x0
          ? { ...o, wallId: primeiroId }
          : { ...o, wallId: segundoId, offsetMm: o.offsetMm - x1 };
      });

      diff.deleted.push(wall.id);
      diff.created.push(primeiroId, segundoId);
      diff.ancestry[primeiroId] = [wall.id];
      diff.ancestry[segundoId] = [wall.id];
      break;
    }

    case 'SetFase': {
      if (command.fase !== null && !FASES_DE_REFORMA.includes(command.fase)) {
        throw new KernelError('BAD_PHASE', `Fase de reforma inválida: ${String(command.fase)}`);
      }
      for (const id of command.ids) {
        const alvo =
          next.walls.find((w) => w.id === id) ??
          next.openings.find((o) => o.id === id) ??
          (next.structures ?? []).find((s) => s.id === id) ??
          (next.componentes ?? []).find((c) => c.id === id);
        if (!alvo) throw new KernelError('NOT_FOUND', `Peça ${id} não existe`);
        if (command.fase && command.fase !== 'NOVO') alvo.fase = command.fase;
        else delete alvo.fase;
        diff.updated.push(id);
      }
      break;
    }

    case 'SetCedeSobreposicao': {
      const alvo =
        next.walls.find((w) => w.id === command.id) ??
        (next.structures ?? []).find((s) => s.id === command.id);
      if (!alvo) {
        throw new KernelError('NOT_FOUND', `Componente ${command.id} não existe`);
      }
      // `false` APAGA a chave em vez de gravá-la. `cedeSobreposicao: false` e a
      // ausência significam a mesma coisa, e emitir a chave acrescentaria peso
      // ao payload canônico de todo desenho que passasse por aqui uma vez.
      if (command.cede) alvo.cedeSobreposicao = true;
      else delete alvo.cedeSobreposicao;
      diff.updated.push(alvo.id);
      break;
    }

    case 'SetStructuralKind': {
      const s = findStructural(next, command.structuralId);
      const destino = FORMA_ESTRUTURAL[command.kind];
      if (!destino) {
        throw new KernelError('BAD_STRUCTURAL_KIND', `Tipo estrutural desconhecido: ${command.kind}`);
      }
      if (destino !== FORMA_ESTRUTURAL[s.kind]) {
        throw new KernelError(
          'STRUCTURAL_SHAPE_MISMATCH',
          `Não dá para converter ${nomeDoTipoEstrutural(s.kind)} em ${nomeDoTipoEstrutural(command.kind)}: as formas geométricas são diferentes`,
        );
      }
      s.kind = command.kind;
      diff.updated.push(s.id);
      break;
    }

    case 'MoveStructuralVertex': {
      const s = findStructural(next, command.structuralId);
      if (command.index < 0 || command.index >= s.pontos.length) {
        throw new KernelError(
          'BAD_STRUCTURAL_POINTS',
          `Vértice ${command.index} fora de ${s.id} (${s.pontos.length} vértices)`,
        );
      }
      const to = {
        x: assertIntegerMm(roundToMm(command.to.x), 'to.x'),
        y: assertIntegerMm(roundToMm(command.to.y), 'to.y'),
      };
      // Colapsar o eixo da viga é o mesmo defeito que `MoveBoundaryVertex`
      // recusa no limite: a peça continua na tela e o volume vai a zero.
      if (FORMA_ESTRUTURAL[s.kind] === 'LINHA') {
        const outra = s.pontos[command.index === 0 ? 1 : 0];
        if (pointsEqual(to, outra)) {
          throw new KernelError('DEGENERATE_STRUCTURAL', 'Mover o vértice colapsaria a peça');
        }
      }
      s.pontos[command.index] = to;
      diff.updated.push(s.id);
      break;
    }

    case 'DeleteStructural': {
      const s = findStructural(next, command.structuralId);
      next.structures = next.structures.filter((e) => e.id !== s.id);
      diff.deleted.push(s.id);
      break;
    }

    // ── Telhado ──────────────────────────────────────────────────────────────

    case 'AddAgua': {
      findLevel(next, command.levelId);

      // A cardinalidade é conferida AQUI, e não só nos invariantes, pela razão
      // de `AddStructural`: a mensagem tem de falar do gesto que falhou, não
      // citar um id que o usuário nunca viu.
      if (command.pontos.length < 3) {
        throw new KernelError(
          'BAD_ROOF_POINTS',
          `A água precisa de pelo menos 3 vértices; recebeu ${command.pontos.length}`,
        );
      }

      const pontos = command.pontos.map((p, i) => ({
        x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`),
        y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`),
      }));

      const beiral = command.beiralIndex ?? 0;
      if (!Number.isInteger(beiral) || beiral < 0 || beiral >= pontos.length) {
        throw new KernelError(
          'BAD_ROOF_EDGE',
          `Lado ${beiral} não existe num polígono de ${pontos.length} lados`,
        );
      }

      const id = nextId(next, 'agu');
      next.roofs = [
        ...(next.roofs ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          pontos,
          beiralIndex: beiral,
          inclinacaoPct: command.inclinacaoPct,
          baseMm: command.baseMm ?? 0,
          // 120 mm é o pacote telha + trama de uma cobertura cerâmica comum. É
          // ponto de partida editável, não afirmação: o painel mostra o campo.
          espessuraMm: command.espessuraMm ?? 120,
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'AddRoofByExtrusion': {
      findLevel(next, command.levelId);
      const eixoA = { x: assertIntegerMm(roundToMm(command.eixoA.x), 'eixoA.x'), y: assertIntegerMm(roundToMm(command.eixoA.y), 'eixoA.y') };
      const eixoB = { x: assertIntegerMm(roundToMm(command.eixoB.x), 'eixoB.x'), y: assertIntegerMm(roundToMm(command.eixoB.y), 'eixoB.y') };
      const perfil = command.perfil.map((p, i) => ({ s: assertIntegerMm(roundToMm(p.s), `perfil[${i}].s`), z: assertIntegerMm(roundToMm(p.z), `perfil[${i}].z`) }));
      let geradas: ReturnType<typeof aguasDaExtrusao>;
      try {
        geradas = aguasDaExtrusao(eixoA, eixoB, perfil);
      } catch (e) {
        const codigo = (e as Error).message as ErroDoPerfil;
        throw new KernelError('BAD_EXTRUSION', MENSAGEM_DO_ERRO_DE_PERFIL[codigo] ?? String(codigo));
      }
      for (const g of geradas.aguas) {
        const id = nextId(next, 'agu');
        next.roofs = [
          ...(next.roofs ?? []),
          {
            id,
            uid: novoUid(),
            levelId: command.levelId,
            pontos: g.pontos,
            beiralIndex: g.beiralIndex,
            inclinacaoPct: g.inclinacaoPct,
            baseMm: g.baseMm,
            espessuraMm: command.espessuraMm ?? 120,
            extrusao: { a: { ...eixoA }, b: { ...eixoB } },
          },
        ];
        diff.created.push(id);
      }
      break;
    }

    case 'SetAguaProps': {
      const agua = findAgua(next, command.aguaId);
      if (command.inclinacaoPct !== undefined) agua.inclinacaoPct = command.inclinacaoPct;
      if (command.baseMm !== undefined) agua.baseMm = assertIntegerMm(roundToMm(command.baseMm), 'baseMm');
      if (command.espessuraMm !== undefined) {
        agua.espessuraMm = assertIntegerMm(roundToMm(command.espessuraMm), 'espessuraMm');
      }
      if (command.beiralIndex !== undefined) agua.beiralIndex = command.beiralIndex;
      diff.updated.push(agua.id);
      break;
    }

    case 'MoveAguaVertex': {
      const agua = findAgua(next, command.aguaId);
      if (command.index < 0 || command.index >= agua.pontos.length) {
        throw new KernelError(
          'BAD_ROOF_POINTS',
          `Vértice ${command.index} não existe em ${agua.id}`,
        );
      }
      agua.pontos[command.index] = {
        x: assertIntegerMm(roundToMm(command.to.x), 'to.x'),
        y: assertIntegerMm(roundToMm(command.to.y), 'to.y'),
      };
      // COBERTURA POR EXTRUSÃO: vértice movido = a água já não é a faixa que o
      // perfil fez; sai do grupo (o metadado é agrupamento, não geometria).
      delete agua.extrusao;
      diff.updated.push(agua.id);
      break;
    }

    // ── Corte ────────────────────────────────────────────────────────────────

    case 'AddCorte': {
      if (pointsEqual(command.a, command.b)) {
        throw new KernelError('DEGENERATE_SECTION', 'Linha de corte de comprimento zero');
      }
      const id = nextId(next, 'cor');
      // A letra da PRÓXIMA marca, quando ninguém disse: A, B, C… pela contagem
      // do que já existe. É palpite de rótulo, não numeração canônica — o
      // usuário troca no painel, e duas letras iguais não quebram nada.
      const proximaLetra = String.fromCharCode(65 + ((next.sections ?? []).length % 26));
      next.sections = [
        ...(next.sections ?? []),
        {
          id,
          uid: novoUid(),
          a: { ...command.a },
          b: { ...command.b },
          olharPara: command.olharPara ?? 'ESQUERDA',
          rotulo: command.rotulo?.trim() || proximaLetra,
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetCorteProps': {
      const corte = findCorte(next, command.corteId);
      if (command.olharPara !== undefined) corte.olharPara = command.olharPara;
      if (command.rotulo !== undefined) corte.rotulo = command.rotulo.trim();
      diff.updated.push(corte.id);
      break;
    }

    case 'MoveCorteVertex': {
      const corte = findCorte(next, command.corteId);
      const outra = command.end === 'a' ? corte.b : corte.a;
      if (pointsEqual(command.to, outra)) {
        throw new KernelError('DEGENERATE_SECTION', 'Mover a ponta colapsaria o corte');
      }
      corte[command.end] = {
        x: assertIntegerMm(roundToMm(command.to.x), 'to.x'),
        y: assertIntegerMm(roundToMm(command.to.y), 'to.y'),
      };
      diff.updated.push(corte.id);
      break;
    }

    case 'DeleteCorte': {
      const corte = findCorte(next, command.corteId);
      next.sections = (next.sections ?? []).filter((c) => c.id !== corte.id);
      // As anotações DO corte vão junto: sem o plano, não há onde desenhá-las (E8.1).
      const anotacoesDoCorte = (next.anotacoes ?? []).filter((a) => a.vista.tipo === 'CORTE' && a.vista.corteId === corte.id);
      next.anotacoes = (next.anotacoes ?? []).filter((a) => !(a.vista.tipo === 'CORTE' && a.vista.corteId === corte.id));
      diff.deleted.push(corte.id, ...anotacoesDoCorte.map((a) => a.id));
      break;
    }

    // ── Eixos ────────────────────────────────────────────────────────────────

    case 'AddEixo': {
      if (pointsEqual(command.a, command.b)) {
        throw new KernelError('DEGENERATE_AXIS', 'Eixo de comprimento zero');
      }
      const id = nextId(next, 'eix');
      let nome = command.nome !== undefined ? command.nome.trim().slice(0, MAX_NOME_DE_EIXO) : null;
      if (nome === null) {
        // Palpite: horizontal = letra, vertical = número, contando só os da
        // mesma família de nome já existentes (A, B, C… / 1, 2, 3…).
        const horizontal = Math.abs(command.b.x - command.a.x) >= Math.abs(command.b.y - command.a.y);
        const usados = new Set((next.eixos ?? []).map((e) => e.nome));
        if (horizontal) {
          let i = 0;
          while (usados.has(String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : ''))) i++;
          nome = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');
        } else {
          let i = 1;
          while (usados.has(String(i))) i++;
          nome = String(i);
        }
      }
      next.eixos = [
        ...(next.eixos ?? []),
        {
          id,
          uid: novoUid(),
          nome,
          a: { x: assertIntegerMm(roundToMm(command.a.x), 'a.x'), y: assertIntegerMm(roundToMm(command.a.y), 'a.y') },
          b: { x: assertIntegerMm(roundToMm(command.b.x), 'b.x'), y: assertIntegerMm(roundToMm(command.b.y), 'b.y') },
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetEixoProps': {
      const e = findEixo(next, command.eixoId);
      if (command.nome !== undefined) e.nome = command.nome.trim().slice(0, MAX_NOME_DE_EIXO);
      diff.updated.push(e.id);
      break;
    }

    case 'MoveEixoVertex': {
      const e = findEixo(next, command.eixoId);
      const outra = command.end === 'a' ? e.b : e.a;
      if (pointsEqual(command.to, outra)) throw new KernelError('DEGENERATE_AXIS', 'Mover a ponta colapsaria o eixo');
      e[command.end] = {
        x: assertIntegerMm(roundToMm(command.to.x), 'to.x'),
        y: assertIntegerMm(roundToMm(command.to.y), 'to.y'),
      };
      diff.updated.push(e.id);
      break;
    }

    case 'DeleteEixo': {
      const e = findEixo(next, command.eixoId);
      next.eixos = (next.eixos ?? []).filter((x) => x.id !== e.id);
      diff.deleted.push(e.id);
      break;
    }

    // ── Unidades ─────────────────────────────────────────────────────────────

    case 'AddUnidade': {
      const numero = command.numero.trim();
      if (!numero || numero.length > MAX_NUMERO_DE_UNIDADE) throw new KernelError('BAD_UNIT', `Número da unidade vazio ou maior que ${MAX_NUMERO_DE_UNIDADE} caracteres`);
      if ((next.unidades ?? []).some((u) => u.numero === numero)) throw new KernelError('BAD_UNIT', `Já existe a unidade "${numero}"`);
      const uids = (command.labelIds ?? []).map((id) => findLabel(next, id).uid);
      const id = nextId(next, 'und');
      next.unidades = next.unidades ?? [];
      transferirEtiquetas(next, uids, null, diff);
      next.unidades.push({
        id,
        uid: novoUid(),
        numero,
        tipologia: tipologiaValida(command.tipologia),
        pcd: command.pcd ?? false,
        etiquetaUids: [...new Set(uids)],
      });
      diff.created.push(id);
      break;
    }

    case 'SetUnidadeProps': {
      const u = findUnidade(next, command.unidadeId);
      if (command.numero !== undefined) {
        const numero = command.numero.trim();
        if (!numero || numero.length > MAX_NUMERO_DE_UNIDADE) throw new KernelError('BAD_UNIT', `Número da unidade vazio ou maior que ${MAX_NUMERO_DE_UNIDADE} caracteres`);
        if ((next.unidades ?? []).some((x) => x.id !== u.id && x.numero === numero)) throw new KernelError('BAD_UNIT', `Já existe a unidade "${numero}"`);
        u.numero = numero;
      }
      if (command.tipologia !== undefined) u.tipologia = tipologiaValida(command.tipologia);
      if (command.pcd !== undefined) u.pcd = command.pcd;
      if (command.labelIds !== undefined) {
        const uids = [...new Set(command.labelIds.map((id) => findLabel(next, id).uid))];
        transferirEtiquetas(next, uids, u.id, diff);
        u.etiquetaUids = uids;
      }
      diff.updated.push(u.id);
      break;
    }

    case 'DeleteUnidade': {
      const u = findUnidade(next, command.unidadeId);
      next.unidades = (next.unidades ?? []).filter((x) => x.id !== u.id);
      diff.deleted.push(u.id);
      break;
    }

    case 'SetUnidadeDoAmbiente': {
      const space = next.spaces.find((s) => s.id === command.spaceId);
      if (!space) throw new KernelError('SPACE_NOT_FOUND', `Ambiente inexistente: ${command.spaceId}`);
      let label = space.labelUid ? next.labels.find((l) => l.uid === space.labelUid) : undefined;
      if (!label) {
        const nome = command.nome?.trim();
        if (!nome) throw new KernelError('BAD_UNIT', 'Ambiente sem etiqueta: informe o nome para criá-la');
        const id = nextId(next, 'lbl');
        label = { id, uid: novoUid(), levelId: space.levelId, at: interiorPoint(space.ring, space.holes), name: nome, tipoDeAmbiente: null };
        next.labels.push(label);
        diff.created.push(id);
      }
      const destino = command.unidadeId === null ? null : findUnidade(next, command.unidadeId);
      transferirEtiquetas(next, [label.uid], destino?.id ?? null, diff);
      if (destino && !destino.etiquetaUids.includes(label.uid)) {
        destino.etiquetaUids.push(label.uid);
        diff.updated.push(destino.id);
      }
      break;
    }

    // ── Núcleo vertical ──────────────────────────────────────────────────────

    case 'AddNucleo': {
      findLevel(next, command.levelId);
      if (command.ateLevelId) findLevel(next, command.ateLevelId);
      if (command.ring.length < 3) throw new KernelError('BAD_CORE', `O contorno precisa de pelo menos 3 vértices; recebeu ${command.ring.length}`);
      const ring = command.ring.map((p, i) => ({ x: assertIntegerMm(roundToMm(p.x), `ring[${i}].x`), y: assertIntegerMm(roundToMm(p.y), `ring[${i}].y`) }));
      const id = nextId(next, 'nuc');
      const elevador = command.tipo === 'ELEVADOR';
      next.nucleos = [
        ...(next.nucleos ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          ...(command.ateLevelId ? { ateLevelId: command.ateLevelId } : {}),
          tipo: command.tipo,
          ring,
          rotulo: command.rotulo?.trim() || null,
          ...(!elevador && command.disciplina ? { disciplina: command.disciplina } : {}),
          ...(elevador && command.pocoMm != null ? { pocoMm: assertIntegerMm(roundToMm(command.pocoMm), 'pocoMm') } : {}),
          ...(elevador && command.casaDeMaquinasMm != null ? { casaDeMaquinasMm: assertIntegerMm(roundToMm(command.casaDeMaquinasMm), 'casaDeMaquinasMm') } : {}),
          ...(elevador && command.capacidade != null ? { capacidade: Math.round(command.capacidade) } : {}),
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetNucleoProps': {
      const n = findNucleo(next, command.nucleoId);
      if (command.tipo !== undefined) {
        n.tipo = command.tipo;
        // Virar shaft apaga as medidas de elevador: não há poço num shaft.
        if (n.tipo !== 'ELEVADOR') {
          delete n.pocoMm;
          delete n.casaDeMaquinasMm;
          delete n.capacidade;
        }
        // E o elevador não tem disciplina.
        if (n.tipo !== 'SHAFT') delete n.disciplina;
      }
      if (command.disciplina !== undefined) {
        if (command.disciplina && n.tipo !== 'SHAFT') throw new KernelError('BAD_CORE', 'disciplina só existe no shaft');
        if (command.disciplina) n.disciplina = command.disciplina;
        else delete n.disciplina;
      }
      if (command.ateLevelId !== undefined) {
        if (command.ateLevelId) {
          findLevel(next, command.ateLevelId);
          n.ateLevelId = command.ateLevelId;
        } else delete n.ateLevelId;
      }
      if (command.rotulo !== undefined) n.rotulo = command.rotulo?.trim() || null;
      const medida = (k: 'pocoMm' | 'casaDeMaquinasMm' | 'capacidade', v: number | null | undefined) => {
        if (v === undefined) return;
        if (n.tipo !== 'ELEVADOR') throw new KernelError('BAD_CORE', `${k} só existe no elevador`);
        if (v === null) delete n[k];
        else n[k] = k === 'capacidade' ? Math.round(v) : assertIntegerMm(roundToMm(v), k);
      };
      medida('pocoMm', command.pocoMm);
      medida('casaDeMaquinasMm', command.casaDeMaquinasMm);
      medida('capacidade', command.capacidade);
      diff.updated.push(n.id);
      break;
    }

    case 'MoveNucleoVertex': {
      const n = findNucleo(next, command.nucleoId);
      if (command.index < 0 || command.index >= n.ring.length) throw new KernelError('BAD_CORE', `Vértice ${command.index} fora do contorno`);
      n.ring = n.ring.map((p, i) => (i === command.index ? { x: assertIntegerMm(roundToMm(command.to.x), 'to.x'), y: assertIntegerMm(roundToMm(command.to.y), 'to.y') } : p));
      diff.updated.push(n.id);
      break;
    }

    case 'DeleteNucleo': {
      const n = findNucleo(next, command.nucleoId);
      next.nucleos = (next.nucleos ?? []).filter((x) => x.id !== n.id);
      diff.deleted.push(n.id);
      break;
    }

    // ── Vagas de garagem ─────────────────────────────────────────────────────

    case 'AddVaga': {
      findLevel(next, command.levelId);
      const tipo = command.tipo ?? 'COMUM';
      const padrao = DIMENSAO_DA_VAGA[tipo];
      const id = nextId(next, 'vag');
      next.vagas = [
        ...(next.vagas ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          at: { x: assertIntegerMm(roundToMm(command.at.x), 'at.x'), y: assertIntegerMm(roundToMm(command.at.y), 'at.y') },
          larguraMm: assertIntegerMm(roundToMm(command.larguraMm ?? padrao.larguraMm), 'larguraMm'),
          comprimentoMm: assertIntegerMm(roundToMm(command.comprimentoMm ?? padrao.comprimentoMm), 'comprimentoMm'),
          rotacaoGraus: ((Math.round(command.rotacaoGraus ?? 0) % 360) + 360) % 360,
          tipo,
          numero: command.numero?.trim() || null,
          ...(command.sugerida ? { sugerida: true } : {}),
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetVagaProps': {
      const v = findVaga(next, command.vagaId);
      if (command.tipo !== undefined && command.tipo !== v.tipo) {
        v.tipo = command.tipo;
        if (command.larguraMm === undefined) v.larguraMm = DIMENSAO_DA_VAGA[command.tipo].larguraMm;
        if (command.comprimentoMm === undefined) v.comprimentoMm = DIMENSAO_DA_VAGA[command.tipo].comprimentoMm;
      }
      if (command.larguraMm !== undefined) v.larguraMm = assertIntegerMm(roundToMm(command.larguraMm), 'larguraMm');
      if (command.comprimentoMm !== undefined) v.comprimentoMm = assertIntegerMm(roundToMm(command.comprimentoMm), 'comprimentoMm');
      if (command.rotacaoGraus !== undefined) v.rotacaoGraus = ((Math.round(command.rotacaoGraus) % 360) + 360) % 360;
      if (command.numero !== undefined) v.numero = command.numero?.trim() || null;
      if (command.sugerida !== undefined) {
        if (command.sugerida) v.sugerida = true;
        else delete v.sugerida;
      }
      diff.updated.push(v.id);
      break;
    }

    case 'MoveVaga': {
      const v = findVaga(next, command.vagaId);
      v.at = { x: assertIntegerMm(roundToMm(command.to.x), 'to.x'), y: assertIntegerMm(roundToMm(command.to.y), 'to.y') };
      // Mover confirma: a vaga sugerida deixa de ser sugestão, como o terminal.
      delete v.sugerida;
      diff.updated.push(v.id);
      break;
    }

    case 'DeleteVaga': {
      const v = findVaga(next, command.vagaId);
      next.vagas = (next.vagas ?? []).filter((x) => x.id !== v.id);
      diff.deleted.push(v.id);
      break;
    }

    // ── Componentes (E7.1) ──────────────────────────────────────────────────

    case 'AddComponente': {
      findLevel(next, command.levelId);
      const ficha = CATALOGO_DE_COMPONENTES[command.tipoId];
      if (!ficha) throw new KernelError('BAD_COMPONENT', `Tipo de componente desconhecido: ${String(command.tipoId)}`);
      const id = nextId(next, 'cmp');
      next.componentes = [
        ...(next.componentes ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          tipoId: command.tipoId,
          familia: command.familia ?? ficha.familia,
          at: { x: assertIntegerMm(roundToMm(command.at.x), 'at.x'), y: assertIntegerMm(roundToMm(command.at.y), 'at.y') },
          larguraMm: assertIntegerMm(roundToMm(command.larguraMm ?? ficha.larguraMm), 'larguraMm'),
          profundidadeMm: assertIntegerMm(roundToMm(command.profundidadeMm ?? ficha.profundidadeMm), 'profundidadeMm'),
          alturaMm: assertIntegerMm(roundToMm(command.alturaMm ?? ficha.alturaMm), 'alturaMm'),
          rotacaoGraus: ((Math.round(command.rotacaoGraus ?? 0) % 360) + 360) % 360,
          // Cota: a pedida, senão a da ficha (evaporadora/exaustor nascem no alto); zero não se grava.
          ...((command.cotaMm ?? ficha.cotaMm ?? 0) > 0 ? { cotaMm: assertIntegerMm(roundToMm(command.cotaMm ?? ficha.cotaMm ?? 0), 'cotaMm') } : {}),
          rotulo: command.rotulo?.trim().slice(0, MAX_ROTULO_DE_COMPONENTE) || null,
          ...(command.sugerido ? { sugerido: true } : {}),
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'AddConjunto': {
      findLevel(next, command.levelId);
      const filhos = CONJUNTOS_DE_COMPONENTES[command.tipoId];
      if (!filhos) throw new KernelError('BAD_COMPONENT', `${String(command.tipoId)} não é um conjunto`);
      const fichaPai = CATALOGO_DE_COMPONENTES[command.tipoId];
      const giro = ((Math.round(command.rotacaoGraus ?? 0) % 360) + 360) % 360;
      const rad = (giro * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sen = Math.sin(rad);
      const at = { x: assertIntegerMm(roundToMm(command.at.x), 'at.x'), y: assertIntegerMm(roundToMm(command.at.y), 'at.y') };
      const ext = extensaoDoConjunto(command.tipoId);
      const idPai = nextId(next, 'cmp');
      const uidPai = novoUid();
      next.componentes = [
        ...(next.componentes ?? []),
        { id: idPai, uid: uidPai, levelId: command.levelId, tipoId: command.tipoId, familia: fichaPai.familia, at, larguraMm: ext.larguraMm, profundidadeMm: ext.profundidadeMm, alturaMm: fichaPai.alturaMm, rotacaoGraus: giro, rotulo: null },
      ];
      diff.created.push(idPai);
      for (const f of filhos) {
        const ficha = CATALOGO_DE_COMPONENTES[f.tipoId];
        const id = nextId(next, 'cmp');
        next.componentes.push({
          id,
          uid: novoUid(),
          levelId: command.levelId,
          tipoId: f.tipoId,
          familia: ficha.familia,
          at: { x: assertIntegerMm(roundToMm(at.x + (f.dxMm - ext.centroXMm) * cos - (f.dyMm - ext.centroYMm) * sen), 'at.x'), y: assertIntegerMm(roundToMm(at.y + (f.dxMm - ext.centroXMm) * sen + (f.dyMm - ext.centroYMm) * cos), 'at.y') },
          larguraMm: ficha.larguraMm,
          profundidadeMm: ficha.profundidadeMm,
          alturaMm: ficha.alturaMm,
          rotacaoGraus: (((f.rotacaoGraus + giro) % 360) + 360) % 360,
          ...((ficha.cotaMm ?? 0) > 0 ? { cotaMm: ficha.cotaMm } : {}),
          rotulo: null,
          paiUid: uidPai,
        });
        diff.created.push(id);
      }
      break;
    }

    case 'SetComponenteProps': {
      const c = findComponente(next, command.componenteId);
      if (command.tipoId !== undefined && command.tipoId !== c.tipoId) {
        const ficha = CATALOGO_DE_COMPONENTES[command.tipoId];
        if (!ficha) throw new KernelError('BAD_COMPONENT', `Tipo de componente desconhecido: ${String(command.tipoId)}`);
        c.tipoId = command.tipoId;
        if (command.familia === undefined) c.familia = ficha.familia;
        if (command.larguraMm === undefined) c.larguraMm = ficha.larguraMm;
        if (command.profundidadeMm === undefined) c.profundidadeMm = ficha.profundidadeMm;
        if (command.alturaMm === undefined) c.alturaMm = ficha.alturaMm;
        if (command.cotaMm === undefined) {
          if ((ficha.cotaMm ?? 0) > 0) c.cotaMm = ficha.cotaMm;
          else delete c.cotaMm;
        }
      }
      if (command.cotaMm !== undefined) {
        if (command.cotaMm == null || command.cotaMm <= 0) delete c.cotaMm;
        else c.cotaMm = assertIntegerMm(roundToMm(command.cotaMm), 'cotaMm');
      }
      if (command.familia !== undefined) c.familia = command.familia;
      if (command.larguraMm !== undefined) c.larguraMm = assertIntegerMm(roundToMm(command.larguraMm), 'larguraMm');
      if (command.profundidadeMm !== undefined) c.profundidadeMm = assertIntegerMm(roundToMm(command.profundidadeMm), 'profundidadeMm');
      if (command.alturaMm !== undefined) c.alturaMm = assertIntegerMm(roundToMm(command.alturaMm), 'alturaMm');
      if (command.rotacaoGraus !== undefined) {
        const novo = ((Math.round(command.rotacaoGraus) % 360) + 360) % 360;
        // FAMÍLIAS ANINHADAS: girar o conjunto gira os filhos em torno do centro dele.
        const delta = novo - c.rotacaoGraus;
        if (delta !== 0 && ehConjunto(c.tipoId)) {
          const rad = (delta * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sen = Math.sin(rad);
          for (const f of filhosDoConjunto(next, c)) {
            const dx = f.at.x - c.at.x;
            const dy = f.at.y - c.at.y;
            f.at = { x: assertIntegerMm(roundToMm(c.at.x + dx * cos - dy * sen), 'at.x'), y: assertIntegerMm(roundToMm(c.at.y + dx * sen + dy * cos), 'at.y') };
            f.rotacaoGraus = (((f.rotacaoGraus + delta) % 360) + 360) % 360;
            diff.updated.push(f.id);
          }
        }
        c.rotacaoGraus = novo;
      }
      if (command.rotulo !== undefined) c.rotulo = command.rotulo?.trim().slice(0, MAX_ROTULO_DE_COMPONENTE) || null;
      if (command.sugerido !== undefined) {
        if (command.sugerido) c.sugerido = true;
        else delete c.sugerido;
      }
      diff.updated.push(c.id);
      break;
    }

    case 'MoveComponente': {
      const c = findComponente(next, command.componenteId);
      const destino = { x: assertIntegerMm(roundToMm(command.to.x), 'to.x'), y: assertIntegerMm(roundToMm(command.to.y), 'to.y') };
      // FAMÍLIAS ANINHADAS: mover o conjunto leva os filhos pelo mesmo vetor.
      const dxPai = destino.x - c.at.x;
      const dyPai = destino.y - c.at.y;
      if (ehConjunto(c.tipoId)) {
        for (const f of filhosDoConjunto(next, c)) {
          f.at = { x: f.at.x + dxPai, y: f.at.y + dyPai };
          diff.updated.push(f.id);
        }
      }
      c.at = destino;
      // Mover confirma, como o terminal e a vaga.
      delete c.sugerido;
      diff.updated.push(c.id);
      break;
    }

    case 'DeleteComponente': {
      const c = findComponente(next, command.componenteId);
      // FAMÍLIAS ANINHADAS: apagar o conjunto apaga os filhos; apagar um filho tira só ele.
      const filhos = ehConjunto(c.tipoId) ? filhosDoConjunto(next, c) : [];
      const fora = new Set([c.id, ...filhos.map((f) => f.id)]);
      next.componentes = (next.componentes ?? []).filter((x) => !fora.has(x.id));
      diff.deleted.push(...fora);
      break;
    }

    // ── Guarda-corpos (E7.3) ────────────────────────────────────────────────

    case 'AddGuardaCorpo': {
      findLevel(next, command.levelId);
      const id = nextId(next, 'grc');
      next.guardaCorpos = [
        ...(next.guardaCorpos ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          tipo: command.tipo,
          pontos: command.pontos.map((p, i) => ({ x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`), y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`) })),
          alturaMm: assertIntegerMm(roundToMm(command.alturaMm ?? ALTURA_PADRAO_DO_GUARDA_CORPO_MM[command.tipo] ?? 1100), 'alturaMm'),
          material: command.material ?? 'METALICO',
          itemCode: command.itemCode ?? '',
          descricao: command.descricao ?? '',
          rotulo: command.rotulo?.trim().slice(0, MAX_ROTULO_DE_GUARDA_CORPO) || null,
          ...(command.sugerido ? { sugerido: true } : {}),
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetGuardaCorpoProps': {
      const g = findGuardaCorpo(next, command.guardaCorpoId);
      if (command.tipo !== undefined && command.tipo !== g.tipo) {
        // Trocar o tipo puxa a altura padrão do novo quando a atual era a padrão do antigo.
        const eraPadrao = g.alturaMm === ALTURA_PADRAO_DO_GUARDA_CORPO_MM[g.tipo];
        g.tipo = command.tipo;
        if (eraPadrao && command.alturaMm === undefined) g.alturaMm = ALTURA_PADRAO_DO_GUARDA_CORPO_MM[command.tipo];
      }
      if (command.pontos !== undefined) g.pontos = command.pontos.map((p, i) => ({ x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`), y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`) }));
      if (command.alturaMm !== undefined) g.alturaMm = assertIntegerMm(roundToMm(command.alturaMm), 'alturaMm');
      if (command.material !== undefined) g.material = command.material;
      if (command.itemCode !== undefined) g.itemCode = command.itemCode;
      if (command.descricao !== undefined) g.descricao = command.descricao;
      if (command.rotulo !== undefined) g.rotulo = command.rotulo?.trim().slice(0, MAX_ROTULO_DE_GUARDA_CORPO) || null;
      if (command.sugerido !== undefined) {
        if (command.sugerido) g.sugerido = true;
        else delete g.sugerido;
      }
      diff.updated.push(g.id);
      break;
    }

    case 'MoveGuardaCorpo': {
      const g = findGuardaCorpo(next, command.guardaCorpoId);
      const dx = assertIntegerMm(roundToMm(command.dx), 'dx');
      const dy = assertIntegerMm(roundToMm(command.dy), 'dy');
      g.pontos = g.pontos.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      // Mover confirma, como o terminal, a vaga e o componente.
      delete g.sugerido;
      diff.updated.push(g.id);
      break;
    }

    // ── Sub-regiões do terreno (P2.19) ─────────────────────────────────────

    case 'AddSubRegiao': {
      findLevel(next, command.levelId);
      if (!MATERIAIS_DE_SUB_REGIAO.includes(command.material)) throw new KernelError('BAD_SUBREGION', `Material desconhecido: ${String(command.material)}`);
      if (command.pontos.length < 3) throw new KernelError('BAD_SUBREGION', `A sub-região precisa de pelo menos 3 vértices; recebeu ${command.pontos.length}`);
      const id = nextId(next, 'sub');
      next.subRegioes = [
        ...(next.subRegioes ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          material: command.material,
          pontos: command.pontos.map((p, i) => ({ x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`), y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`) })),
          nome: command.nome?.trim().slice(0, MAX_NOME_DE_SUB_REGIAO) || null,
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetSubRegiaoProps': {
      const s = findSubRegiao(next, command.subRegiaoId);
      if (command.material !== undefined) {
        if (!MATERIAIS_DE_SUB_REGIAO.includes(command.material)) throw new KernelError('BAD_SUBREGION', `Material desconhecido: ${String(command.material)}`);
        s.material = command.material;
      }
      if (command.nome !== undefined) s.nome = command.nome?.trim().slice(0, MAX_NOME_DE_SUB_REGIAO) || null;
      if (command.pontos !== undefined) s.pontos = command.pontos.map((p, i) => ({ x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`), y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`) }));
      diff.updated.push(s.id);
      break;
    }

    case 'MoveSubRegiaoVertex': {
      const s = findSubRegiao(next, command.subRegiaoId);
      if (command.index < 0 || command.index >= s.pontos.length) throw new KernelError('BAD_SUBREGION', `Vértice ${command.index} não existe em ${s.id}`);
      s.pontos[command.index] = { x: assertIntegerMm(roundToMm(command.to.x), 'to.x'), y: assertIntegerMm(roundToMm(command.to.y), 'to.y') };
      diff.updated.push(s.id);
      break;
    }

    case 'DeleteSubRegiao': {
      const s = findSubRegiao(next, command.subRegiaoId);
      next.subRegioes = (next.subRegioes ?? []).filter((x) => x.id !== s.id);
      diff.deleted.push(s.id);
      break;
    }

    // ── Vistas dependentes (P2.17) ──────────────────────────────────────────

    case 'AddVistaDependente': {
      findLevel(next, command.levelId);
      const id = nextId(next, 'vdp');
      next.vistasDependentes = [
        ...(next.vistasDependentes ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          nome: command.nome.trim().slice(0, MAX_NOME_DE_VISTA_DEPENDENTE) || 'Vista',
          recorte: recorteInteiro(command.recorte),
          denominador: Math.max(1, Math.round(command.denominador ?? 50)),
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetVistaDependenteProps': {
      const v = findVistaDependente(next, command.vistaId);
      if (command.nome !== undefined) v.nome = command.nome.trim().slice(0, MAX_NOME_DE_VISTA_DEPENDENTE) || v.nome;
      if (command.recorte !== undefined) v.recorte = recorteInteiro(command.recorte);
      if (command.denominador !== undefined) v.denominador = Math.max(1, Math.round(command.denominador));
      diff.updated.push(v.id);
      break;
    }

    case 'DeleteVistaDependente': {
      const v = findVistaDependente(next, command.vistaId);
      next.vistasDependentes = (next.vistasDependentes ?? []).filter((x) => x.id !== v.id);
      diff.deleted.push(v.id);
      break;
    }

    case 'DeleteGuardaCorpo': {
      const g = findGuardaCorpo(next, command.guardaCorpoId);
      next.guardaCorpos = (next.guardaCorpos ?? []).filter((x) => x.id !== g.id);
      diff.deleted.push(g.id);
      break;
    }

    // ── Anotações (E8.1) ────────────────────────────────────────────────────

    case 'AddAnotacao': {
      const id = nextId(next, 'ant');
      const precisaTexto = command.tipo === 'TEXTO' || command.tipo === 'LEADER';
      const texto = command.texto?.trim().slice(0, MAX_TEXTO_DE_ANOTACAO) || (precisaTexto ? 'Texto' : null);
      next.anotacoes = [
        ...(next.anotacoes ?? []),
        {
          id,
          uid: novoUid(),
          vista: { ...command.vista },
          tipo: command.tipo,
          pontos: command.pontos.map((p, i) => ({ x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`), y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`) })),
          texto: command.tipo === 'TEXTO' || command.tipo === 'LEADER' || command.tipo === 'HACHURA' || command.tipo === 'NUVEM' ? texto : null,
          alturaMm: assertIntegerMm(roundToMm(command.alturaMm ?? ALTURA_PADRAO_DO_TEXTO_MM), 'alturaMm'),
          traco: command.traco ?? 'CONTINUO',
          hachura: command.tipo === 'HACHURA' ? command.hachura ?? 'DIAGONAL' : null,
          rotacaoGraus: ((Math.round(command.rotacaoGraus ?? 0) % 360) + 360) % 360,
          cor: command.cor ?? null,
          // NUVEM DE REVISÃO (0.50.0): a revisão vem de quem cria (os invariantes recusam nuvem sem ela).
          ...(command.tipo === 'NUVEM' && command.revisao ? { revisao: { numero: command.revisao.numero, data: command.revisao.data } } : {}),
        },
      ];
      if (command.pontos.length < PONTOS_MINIMOS_DA_ANOTACAO[command.tipo]) {
        throw new KernelError('BAD_ANNOTATION', `${command.tipo} pede ${PONTOS_MINIMOS_DA_ANOTACAO[command.tipo]} ponto(s)`);
      }
      diff.created.push(id);
      break;
    }

    case 'SetAnotacaoProps': {
      const a = findAnotacao(next, command.anotacaoId);
      if (command.pontos !== undefined) a.pontos = command.pontos.map((p, i) => ({ x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`), y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`) }));
      if (command.texto !== undefined) a.texto = command.texto?.trim().slice(0, MAX_TEXTO_DE_ANOTACAO) || null;
      if (command.alturaMm !== undefined) a.alturaMm = assertIntegerMm(roundToMm(command.alturaMm), 'alturaMm');
      if (command.traco !== undefined) a.traco = command.traco;
      if (command.hachura !== undefined) a.hachura = command.hachura;
      if (command.rotacaoGraus !== undefined) a.rotacaoGraus = ((Math.round(command.rotacaoGraus) % 360) + 360) % 360;
      if (command.cor !== undefined) a.cor = command.cor;
      if (command.revisao !== undefined) a.revisao = { numero: command.revisao.numero, data: command.revisao.data };
      diff.updated.push(a.id);
      break;
    }

    case 'MoveAnotacao': {
      const a = findAnotacao(next, command.anotacaoId);
      const dx = assertIntegerMm(roundToMm(command.dx), 'dx');
      const dy = assertIntegerMm(roundToMm(command.dy), 'dy');
      a.pontos = a.pontos.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      diff.updated.push(a.id);
      break;
    }

    case 'DeleteAnotacao': {
      const a = findAnotacao(next, command.anotacaoId);
      next.anotacoes = (next.anotacoes ?? []).filter((x) => x.id !== a.id);
      diff.deleted.push(a.id);
      break;
    }

    // ── Grupos com origem ────────────────────────────────────────────────────

    case 'AddGrupo': {
      const nome = command.nome.trim();
      if (!nome || nome.length > MAX_NOME_DE_GRUPO) throw new KernelError('BAD_GROUP', `Nome do grupo vazio ou maior que ${MAX_NOME_DE_GRUPO} caracteres`);
      const paredes = command.wallIds.map((id) => findWall(next, id));
      const estruturas = (command.structuralIds ?? []).map((id) => findStructural(next, id));
      const etiquetas = (command.labelIds ?? []).map((id) => findLabel(next, id));
      const pecas = [...paredes, ...estruturas, ...etiquetas];
      if (pecas.length === 0) throw new KernelError('EMPTY_SELECTION', 'Nada para agrupar');
      const levelId = pecas[0].levelId;
      if (pecas.some((p) => p.levelId !== levelId)) throw new KernelError('BAD_GROUP', 'As peças da origem têm de estar no mesmo pavimento');
      const pontos = [...paredes.flatMap((w) => [w.a, w.b]), ...estruturas.flatMap((s) => s.pontos), ...etiquetas.map((l) => l.at)];
      const pivo = command.pivo
        ? { x: assertIntegerMm(command.pivo.x, 'pivo.x'), y: assertIntegerMm(command.pivo.y, 'pivo.y') }
        : { x: Math.min(...pontos.map((p) => p.x)), y: Math.min(...pontos.map((p) => p.y)) };
      const id = nextId(next, 'grp');
      next.grupos = next.grupos ?? [];
      const grupo: Grupo = {
        id,
        uid: novoUid(),
        nome,
        levelId,
        pivo,
        origem: { walls: [...new Set(paredes.map((w) => w.uid))], structures: [...new Set(estruturas.map((s) => s.uid))], labels: [...new Set(etiquetas.map((l) => l.uid))] },
        instancias: [],
      };
      next.grupos.push(grupo);
      diff.created.push(id);
      // Instâncias iniciais no MESMO comando: "Repetir unidade" é agrupar + instanciar, um Ctrl+Z.
      for (const spec of command.instancias ?? []) adicionarInstancia(next, diff, grupo, spec, copiasAntes);
      break;
    }

    case 'SetGrupoProps': {
      const g = findGrupo(next, command.grupoId);
      if (command.nome !== undefined) {
        const nome = command.nome.trim();
        if (!nome || nome.length > MAX_NOME_DE_GRUPO) throw new KernelError('BAD_GROUP', `Nome do grupo vazio ou maior que ${MAX_NOME_DE_GRUPO} caracteres`);
        g.nome = nome;
      }
      if (command.pivo !== undefined) g.pivo = { x: assertIntegerMm(command.pivo.x, 'pivo.x'), y: assertIntegerMm(command.pivo.y, 'pivo.y') };
      diff.updated.push(g.id);
      break;
    }

    case 'AddInstanciaDeGrupo': {
      adicionarInstancia(next, diff, findGrupo(next, command.grupoId), command, copiasAntes);
      break;
    }

    case 'SetInstanciaDeGrupo': {
      const g = findGrupo(next, command.grupoId);
      const i = g.instancias.find((x) => x.uid === command.instanciaUid);
      if (!i) throw new KernelError('GROUP_NOT_FOUND', `Instância inexistente: ${command.instanciaUid}`);
      if (command.translacao !== undefined) i.translacao = { x: assertIntegerMm(command.translacao.x, 'translacao.x'), y: assertIntegerMm(command.translacao.y, 'translacao.y') };
      if (command.rotacaoGraus !== undefined) i.rotacaoGraus = command.rotacaoGraus;
      if (command.espelho !== undefined) i.espelho = command.espelho;
      diff.updated.push(g.id);
      break;
    }

    case 'DeleteInstanciaDeGrupo': {
      const g = findGrupo(next, command.grupoId);
      if (!g.instancias.some((x) => x.uid === command.instanciaUid)) throw new KernelError('GROUP_NOT_FOUND', `Instância inexistente: ${command.instanciaUid}`);
      g.instancias = g.instancias.filter((x) => x.uid !== command.instanciaUid);
      diff.updated.push(g.id);
      // As cópias somem na sincronização da cauda (uid esperado deixou de existir).
      break;
    }

    case 'DeleteGrupo': {
      const g = findGrupo(next, command.grupoId);
      if (!command.manterInstancias) {
        // Apaga as cópias ANTES de esquecer o grupo: depois ninguém mais sabe que eram cópias.
        g.instancias = [];
        sincronizarGrupos(next, diff, copiasAntes);
      }
      next.grupos = (next.grupos ?? []).filter((x) => x.id !== g.id);
      diff.deleted.push(g.id);
      break;
    }

    // ── Restrições ───────────────────────────────────────────────────────────

    case 'AddRestricao': {
      const alvoPeca = command.alvo.familia === 'wall' ? findWall(next, command.alvo.id) : findStructural(next, command.alvo.id);
      let referencia: Restricao['referencia'];
      if (command.referencia) {
        const f = command.referencia.familia;
        const p = f === 'wall' ? findWall(next, command.referencia.id) : f === 'structural' ? findStructural(next, command.referencia.id) : findEixo(next, command.referencia.id);
        referencia = { familia: f, uid: p.uid };
      }
      const id = nextId(next, 'rst');
      // Uma restrição igual (tipo, alvo, referência) não se repete: a segunda substitui a primeira.
      next.restricoes = (next.restricoes ?? []).filter(
        (r) => !(r.tipo === command.tipo && r.alvo.uid === alvoPeca.uid && (r.referencia?.uid ?? null) === (referencia?.uid ?? null)),
      );
      next.restricoes.push({
        id,
        uid: novoUid(),
        tipo: command.tipo,
        alvo: { familia: command.alvo.familia, uid: alvoPeca.uid },
        ...(referencia ? { referencia } : {}),
        ...(command.valorMm !== undefined ? { valorMm: assertIntegerMm(roundToMm(command.valorMm), 'valorMm') } : {}),
      });
      diff.created.push(id);
      break;
    }

    case 'DeleteRestricao': {
      const r = findRestricao(next, command.restricaoId);
      next.restricoes = (next.restricoes ?? []).filter((x) => x.id !== r.id);
      diff.deleted.push(r.id);
      break;
    }

    // ── Escada e rampa ───────────────────────────────────────────────────────

    case 'AddEscada': {
      findLevel(next, command.levelId);

      // A cardinalidade é conferida AQUI, e não só nos invariantes, pela razão
      // de `AddAgua`: a mensagem tem de falar do gesto que falhou, e não citar
      // um id que o usuário nunca viu.
      if (command.pontos.length < 2) {
        throw new KernelError(
          'BAD_STAIR_POINTS',
          `O percurso precisa de pelo menos 2 vértices; recebeu ${command.pontos.length}`,
        );
      }

      const pontos = command.pontos.map((p, i) => ({
        x: assertIntegerMm(roundToMm(p.x), `pontos[${i}].x`),
        y: assertIntegerMm(roundToMm(p.y), `pontos[${i}].y`),
      }));

      const id = nextId(next, 'esc');
      next.stairs = [
        ...(next.stairs ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          tipo: command.tipo ?? 'ESCADA',
          pontos,
          larguraMm: assertIntegerMm(roundToMm(command.larguraMm ?? 1200), 'larguraMm'),
          alvoEspelhoMm: assertIntegerMm(roundToMm(command.alvoEspelhoMm ?? 175), 'alvoEspelhoMm'),
          rotulo: command.rotulo?.trim() || null,
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'AddTrecho': {
      findLevel(next, command.levelId);
      const a = {
        x: assertIntegerMm(roundToMm(command.a.x), 'a.x'),
        y: assertIntegerMm(roundToMm(command.a.y), 'a.y'),
      };
      const b = {
        x: assertIntegerMm(roundToMm(command.b.x), 'b.x'),
        y: assertIntegerMm(roundToMm(command.b.y), 'b.y'),
      };
      const cotaAMm = assertIntegerMm(roundToMm(command.cotaAMm), 'cotaAMm');
      const cotaBMm = assertIntegerMm(roundToMm(command.cotaBMm), 'cotaBMm');

      // ⚠️ A recusa é conferida AQUI, além dos invariantes, pela razão de
      // `AddEscada`: a mensagem tem de falar do gesto que falhou. E ela olha as
      // TRÊS dimensões — conferir só a planta recusaria toda PRUMADA, que é o
      // trecho mais comum de uma instalação.
      if (a.x === b.x && a.y === b.y && cotaAMm === cotaBMm) {
        throw new KernelError(
          'DEGENERATE_RUN',
          'O trecho tem comprimento zero: as duas pontas estão no mesmo lugar e na mesma cota',
        );
      }

      const id = nextId(next, 'trc');
      next.trechos = [
        ...(next.trechos ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          disciplina: command.disciplina,
          a,
          b,
          cotaAMm,
          cotaBMm,
          bitolaMm: assertIntegerMm(roundToMm(command.bitolaMm), 'bitolaMm'),
          itemCode: command.itemCode?.trim() || null,
          rotulo: command.rotulo?.trim() || null,
          // Só quando informados — a chave ausente é o estado de todo trecho
          // anterior, e é o que a invariante e o canônico esperam.
          ...(command.circuitoIds && command.circuitoIds.length > 0
            ? { circuitoIds: [...new Set(command.circuitoIds)] }
            : command.circuitoId != null
              ? { circuitoIds: [command.circuitoId] }
              : {}),
          ...(command.condutores != null ? { condutores: command.condutores } : {}),
          ...(command.sugerido ? { sugerido: true } : {}),
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetTrechoProps': {
      const trecho = (next.trechos ?? []).find((t) => t.id === command.trechoId);
      if (!trecho) {
        throw new KernelError('RUN_NOT_FOUND', `Trecho não encontrado: ${command.trechoId}`);
      }
      if (command.disciplina !== undefined) trecho.disciplina = command.disciplina;
      if (command.cotaAMm !== undefined) {
        trecho.cotaAMm = assertIntegerMm(roundToMm(command.cotaAMm), 'cotaAMm');
      }
      if (command.cotaBMm !== undefined) {
        trecho.cotaBMm = assertIntegerMm(roundToMm(command.cotaBMm), 'cotaBMm');
      }
      if (command.bitolaMm !== undefined) {
        trecho.bitolaMm = assertIntegerMm(roundToMm(command.bitolaMm), 'bitolaMm');
      }
      if (command.itemCode !== undefined) trecho.itemCode = command.itemCode?.trim() || null;
      if (command.rotulo !== undefined) trecho.rotulo = command.rotulo?.trim() || null;
      if (command.circuitoIds !== undefined) {
        trecho.circuitoIds = command.circuitoIds && command.circuitoIds.length > 0 ? [...new Set(command.circuitoIds)] : null;
      } else if (command.circuitoId !== undefined) {
        trecho.circuitoIds = command.circuitoId ? [command.circuitoId] : null;
      }
      if (command.condutores !== undefined) trecho.condutores = command.condutores;
      if (command.sugerido !== undefined) trecho.sugerido = command.sugerido ? true : null;
      diff.updated.push(trecho.id);
      break;
    }

    case 'AddTerminal': {
      findLevel(next, command.levelId);
      if (!command.tipo?.trim()) {
        throw new KernelError('BAD_TERMINAL_KIND', 'O terminal precisa de um tipo');
      }
      const id = nextId(next, 'trm');
      next.terminais = [
        ...(next.terminais ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          disciplina: command.disciplina,
          tipo: command.tipo.trim(),
          at: {
            x: assertIntegerMm(roundToMm(command.at.x), 'at.x'),
            y: assertIntegerMm(roundToMm(command.at.y), 'at.y'),
          },
          cotaMm: assertIntegerMm(roundToMm(command.cotaMm), 'cotaMm'),
          itemCode: command.itemCode?.trim() || null,
          rotulo: command.rotulo?.trim() || null,
          tipoEletrico: command.tipoEletrico ?? null,
          comando: command.comando?.trim() || null,
          sugerida: command.sugerida ? true : null,
          ...(command.potenciaW != null ? { potenciaW: command.potenciaW } : {}),
          ...(command.interruptor != null && command.tipoEletrico === 'INTERRUPTOR'
            ? { interruptor: command.interruptor }
            : {}),
          ...(command.tipoHidraulico != null ? { tipoHidraulico: command.tipoHidraulico } : {}),
          // Volume só entra no reservatório — a invariante recusaria nos outros.
          ...(command.volumeL != null && command.tipoHidraulico === 'RESERVATORIO'
            ? { volumeL: assertIntegerMm(Math.round(command.volumeL), 'volumeL') }
            : {}),
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetTerminalProps': {
      const terminal = (next.terminais ?? []).find((t) => t.id === command.terminalId);
      if (!terminal) {
        throw new KernelError('TERMINAL_NOT_FOUND', `Terminal não encontrado: ${command.terminalId}`);
      }
      if (command.tipo !== undefined) {
        if (!command.tipo.trim()) {
          throw new KernelError('BAD_TERMINAL_KIND', 'O terminal precisa de um tipo');
        }
        terminal.tipo = command.tipo.trim();
      }
      if (command.cotaMm !== undefined) {
        terminal.cotaMm = assertIntegerMm(roundToMm(command.cotaMm), 'cotaMm');
      }
      if (command.itemCode !== undefined) terminal.itemCode = command.itemCode?.trim() || null;
      if (command.rotulo !== undefined) terminal.rotulo = command.rotulo?.trim() || null;
      if (command.circuitoId !== undefined) terminal.circuitoId = command.circuitoId;
      if (command.potenciaW !== undefined) terminal.potenciaW = command.potenciaW;
      if (command.tipoEletrico !== undefined) terminal.tipoEletrico = command.tipoEletrico;
      if (command.comando !== undefined) terminal.comando = command.comando?.trim() || null;
      if (command.sugerida !== undefined) terminal.sugerida = command.sugerida ? true : null;
      if (command.interruptor !== undefined) terminal.interruptor = command.interruptor;
      // Deixar de ser interruptor leva a variante junto — ela não tem sentido
      // numa tomada, e a invariante recusaria.
      if (terminal.tipoEletrico !== 'INTERRUPTOR' && terminal.interruptor != null) {
        terminal.interruptor = null;
      }
      if (command.tipoHidraulico !== undefined) terminal.tipoHidraulico = command.tipoHidraulico;
      if (command.volumeL !== undefined) {
        terminal.volumeL = command.volumeL == null ? null : assertIntegerMm(Math.round(command.volumeL), 'volumeL');
      }
      // Deixar de ser reservatório leva o volume junto — a invariante recusaria.
      if (terminal.tipoHidraulico !== 'RESERVATORIO' && terminal.volumeL != null) {
        terminal.volumeL = null;
      }
      aplicarMedidas(terminal, command);
      diff.updated.push(terminal.id);
      break;
    }

    case 'AddQuadro': {
      findLevel(next, command.levelId);
      if (!command.nome?.trim()) {
        throw new KernelError('BAD_BOARD_NAME', 'O quadro precisa de um nome');
      }
      const id = nextId(next, 'qdr');
      next.quadros = [
        ...(next.quadros ?? []),
        {
          id,
          uid: novoUid(),
          levelId: command.levelId,
          nome: command.nome.trim(),
          at: {
            x: assertIntegerMm(roundToMm(command.at.x), 'at.x'),
            y: assertIntegerMm(roundToMm(command.at.y), 'at.y'),
          },
          cotaMm: assertIntegerMm(roundToMm(command.cotaMm ?? 1600), 'cotaMm'),
          ligacao: command.ligacao ?? null,
          tensaoV: command.tensaoV ?? null,
          alimentadorM: command.alimentadorM ?? null,
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetQuadroProps': {
      const q = (next.quadros ?? []).find((x) => x.id === command.quadroId);
      if (!q) throw new KernelError('BOARD_NOT_FOUND', `Quadro não encontrado: ${command.quadroId}`);
      if (command.nome !== undefined) {
        if (!command.nome.trim()) throw new KernelError('BAD_BOARD_NAME', 'O quadro precisa de um nome');
        q.nome = command.nome.trim();
      }
      if (command.cotaMm !== undefined) {
        q.cotaMm = assertIntegerMm(roundToMm(command.cotaMm), 'cotaMm');
      }
      aplicarMedidas(q, command);
      if (command.ligacao !== undefined) q.ligacao = command.ligacao;
      if (command.tensaoV !== undefined) q.tensaoV = command.tensaoV;
      if (command.alimentadorM !== undefined) q.alimentadorM = command.alimentadorM;
      diff.updated.push(q.id);
      break;
    }

    case 'AddCircuito': {
      if (!(next.quadros ?? []).some((q) => q.id === command.quadroId)) {
        throw new KernelError('BOARD_NOT_FOUND', `Quadro não encontrado: ${command.quadroId}`);
      }
      if (!command.nome?.trim()) {
        throw new KernelError('BAD_CIRCUIT_NAME', 'O circuito precisa de um nome');
      }
      const id = nextId(next, 'cir');
      next.circuitos = [
        ...(next.circuitos ?? []),
        {
          id,
          uid: novoUid(),
          quadroId: command.quadroId,
          nome: command.nome.trim(),
          tipo: command.tipo?.trim() || null,
          tensaoV: command.tensaoV ?? null,
          disjuntorA: command.disjuntorA ?? null,
          secaoMm2: command.secaoMm2 ?? null,
          ligacao: command.ligacao ?? null,
          protecaoDR: command.protecaoDR ?? null,
          fase: command.fase ?? null,
        },
      ];
      diff.created.push(id);
      break;
    }

    case 'SetCircuitoProps': {
      const c = (next.circuitos ?? []).find((x) => x.id === command.circuitoId);
      if (!c) {
        throw new KernelError('CIRCUIT_NOT_FOUND', `Circuito não encontrado: ${command.circuitoId}`);
      }
      if (command.nome !== undefined) {
        if (!command.nome.trim()) {
          throw new KernelError('BAD_CIRCUIT_NAME', 'O circuito precisa de um nome');
        }
        c.nome = command.nome.trim();
      }
      if (command.tipo !== undefined) c.tipo = command.tipo?.trim() || null;
      if (command.tensaoV !== undefined) c.tensaoV = command.tensaoV;
      if (command.disjuntorA !== undefined) c.disjuntorA = command.disjuntorA;
      if (command.secaoMm2 !== undefined) c.secaoMm2 = command.secaoMm2;
      if (command.ligacao !== undefined) c.ligacao = command.ligacao;
      if (command.protecaoDR !== undefined) c.protecaoDR = command.protecaoDR;
      if (command.fase !== undefined) c.fase = command.fase;
      diff.updated.push(c.id);
      break;
    }

    case 'SetEscadaProps': {
      const escada = findEscada(next, command.escadaId);
      if (command.tipo !== undefined) escada.tipo = command.tipo;
      if (command.larguraMm !== undefined) {
        escada.larguraMm = assertIntegerMm(roundToMm(command.larguraMm), 'larguraMm');
      }
      // ALTERNAR PARA RAMPA NÃO APAGA O ALVO DE ESPELHO. O campo fica inerte
      // enquanto o tipo for RAMPA, e volta como o usuário deixou quando ele
      // desfizer a escolha — zerar aqui faria um clique de ida e volta perder
      // um ajuste que ninguém mandou perder.
      if (command.alvoEspelhoMm !== undefined) {
        escada.alvoEspelhoMm = assertIntegerMm(roundToMm(command.alvoEspelhoMm), 'alvoEspelhoMm');
      }
      if (command.rotulo !== undefined) escada.rotulo = command.rotulo?.trim() || null;
      if (command.ateLevelId !== undefined) {
        if (command.ateLevelId) findLevel(next, command.ateLevelId);
        escada.ateLevelId = command.ateLevelId || undefined;
        if (escada.ateLevelId === undefined) delete escada.ateLevelId;
      }
      diff.updated.push(escada.id);
      break;
    }

    case 'MoveEscadaVertex': {
      const escada = findEscada(next, command.escadaId);
      if (command.index < 0 || command.index >= escada.pontos.length) {
        throw new KernelError(
          'BAD_STAIR_POINTS',
          `Vértice ${command.index} não existe num percurso de ${escada.pontos.length} pontos`,
        );
      }
      escada.pontos = escada.pontos.map((p, i) =>
        i === command.index
          ? {
              x: assertIntegerMm(roundToMm(command.to.x), 'to.x'),
              y: assertIntegerMm(roundToMm(command.to.y), 'to.y'),
            }
          : p,
      );
      diff.updated.push(escada.id);
      break;
    }

    case 'DeleteTrecho': {
      const antes = (next.trechos ?? []).length;
      next.trechos = (next.trechos ?? []).filter((t) => t.id !== command.trechoId);
      if (next.trechos.length === antes) {
        throw new KernelError('RUN_NOT_FOUND', `Trecho não encontrado: ${command.trechoId}`);
      }
      diff.deleted.push(command.trechoId);
      break;
    }

    case 'DeleteTerminal': {
      const antes = (next.terminais ?? []).length;
      next.terminais = (next.terminais ?? []).filter((t) => t.id !== command.terminalId);
      if (next.terminais.length === antes) {
        throw new KernelError(
          'TERMINAL_NOT_FOUND',
          `Terminal não encontrado: ${command.terminalId}`,
        );
      }
      diff.deleted.push(command.terminalId);
      break;
    }

    case 'DeleteQuadro': {
      const quadro = (next.quadros ?? []).find((q) => q.id === command.quadroId);
      if (!quadro) {
        throw new KernelError('BOARD_NOT_FOUND', `Quadro não encontrado: ${command.quadroId}`);
      }
      // Os circuitos DELE vão junto, e os pontos que os citavam ficam SEM
      // circuito em vez de apontar para o vazio. Apagar o ponto seria pior: ele
      // é peça desenhada, e quem tirou o quadro não decidiu tirar as tomadas.
      const filhos = (next.circuitos ?? []).filter((c) => c.quadroId === quadro.id);
      const idsFilhos = new Set(filhos.map((c) => c.id));
      next.circuitos = (next.circuitos ?? []).filter((c) => !idsFilhos.has(c.id));
      next.terminais = (next.terminais ?? []).map((t) =>
        t.circuitoId && idsFilhos.has(t.circuitoId) ? { ...t, circuitoId: null } : t,
      );
      next.trechos = (next.trechos ?? []).map((t) => semCircuitos(t, idsFilhos));
      next.quadros = (next.quadros ?? []).filter((q) => q.id !== quadro.id);
      diff.deleted.push(quadro.id, ...filhos.map((c) => c.id));
      break;
    }

    case 'DeleteCircuito': {
      const antes = (next.circuitos ?? []).length;
      next.circuitos = (next.circuitos ?? []).filter((c) => c.id !== command.circuitoId);
      if (next.circuitos.length === antes) {
        throw new KernelError(
          'CIRCUIT_NOT_FOUND',
          `Circuito não encontrado: ${command.circuitoId}`,
        );
      }
      // O ponto perde o circuito, e não a existência.
      next.terminais = (next.terminais ?? []).map((t) =>
        t.circuitoId === command.circuitoId ? { ...t, circuitoId: null } : t,
      );
      // O ELETRODUTO também (14/09/2026): desde o lançamento automático o
      // trecho carrega `circuitoId`, e a invariante recusa trecho apontando
      // para circuito inexistente — sem esta linha, apagar um circuito com
      // eletroduto lançado falhava o comando inteiro.
      next.trechos = (next.trechos ?? []).map((t) => semCircuitos(t, new Set([command.circuitoId])));
      diff.deleted.push(command.circuitoId);
      break;
    }

    case 'DeleteEscada': {
      const escada = findEscada(next, command.escadaId);
      next.stairs = (next.stairs ?? []).filter((e) => e.id !== escada.id);
      diff.deleted.push(escada.id);
      break;
    }

    case 'DeleteAgua': {
      const agua = findAgua(next, command.aguaId);
      next.roofs = (next.roofs ?? []).filter((r) => r.id !== agua.id);
      diff.deleted.push(agua.id);
      break;
    }

    case 'SetBoundaryEscritura': {
      const boundary = findBoundary(next, command.boundaryId);
      boundary.medidaEscrituraMm =
        command.medidaMm === null ? null : assertIntegerMm(command.medidaMm, 'medidaEscrituraMm');
      // Espaço em volta some, e o que sobrar vazio vira `null`. String vazia
      // guardada passaria por "informado" em toda checagem de presença e
      // desenharia uma coluna de confrontantes cheia de nada.
      const texto = command.confrontante?.trim() ?? '';
      boundary.confrontante = texto === '' ? null : texto;
      diff.updated.push(boundary.id);
      break;
    }

    case 'SetGeorreferencia': {
      const g = command.georreferencia;
      if (g) {
        // ⚠️ A FAIXA É A TRAVA. Latitude fora de ±90 e longitude fora de ±180
        // não existem no planeta, e o modo comum de chegar aqui é trocar as
        // duas — que num visualizador federado põe o prédio no oceano, com a
        // forma perfeita. Trocar de volta por conta própria seria adivinhar.
        if (!Number.isFinite(g.latitude) || Math.abs(g.latitude) > 90) {
          throw new KernelError('BAD_GEOREF', `Latitude fora do planeta: ${g.latitude}`);
        }
        if (!Number.isFinite(g.longitude) || Math.abs(g.longitude) > 180) {
          throw new KernelError('BAD_GEOREF', `Longitude fora do planeta: ${g.longitude}`);
        }
        if (g.elevacaoM != null && !Number.isFinite(g.elevacaoM)) {
          throw new KernelError('BAD_GEOREF', 'Elevação não é um número');
        }
        if (g.rotacaoNorteDeg != null && !Number.isFinite(g.rotacaoNorteDeg)) {
          throw new KernelError('BAD_GEOREF', 'Rotação do norte não é um número');
        }
        if (g.projetada) {
          const p = g.projetada;
          if (!Number.isFinite(p.lesteM) || !Number.isFinite(p.norteM)) {
            throw new KernelError('BAD_GEOREF', 'Coordenada projetada não é um número');
          }
          // CRS em branco com coordenada preenchida é o pior dos casos: o
          // número existe e ninguém sabe de que sistema é.
          if (!p.crs.trim()) {
            throw new KernelError('BAD_GEOREF', 'Coordenada projetada sem o sistema (CRS)');
          }
        }
      }
      next.georreferencia = g
        ? { ...g, projetada: g.projetada ? { ...g.projetada } : null }
        : null;
      // Sem `diff.updated`: é do DESENHO, não de um objeto com id — a mesma
      // razão de `SetAreaEscritura`.
      break;
    }

    case 'SetAreaEscritura': {
      next.areaEscrituraMm2 = command.areaMm2;
      // Sem `diff.updated`: a área da escritura é do LOTE, não de um objeto com
      // id. Empurrar um id inventado aqui faria a trilha de auditoria apontar
      // para algo que não existe.
      break;
    }

    case 'SetThickness': {
      const wall = findWall(next, command.wallId);
      // Numa parede com composição a espessura é DERIVADA. Recusar em vez de
      // redistribuir: escalar as faixas produziria milímetro fracionário e
      // mexeria em material que ninguém mandou mexer, calado. Ver o comentário
      // do comando.
      if (wall.camadas) {
        throw new KernelError(
          'THICKNESS_FROM_LAYERS',
          `A espessura de ${wall.id} vem das camadas — edite a composição`,
        );
      }
      wall.thicknessMm = command.thicknessMm;
      diff.updated.push(wall.id);
      break;
    }

    case 'SetWallLayers': {
      const wall = findWall(next, command.wallId);

      if (command.camadas === null) {
        // Volta a homogênea PRESERVANDO a espessura: as camadas somavam
        // `thicknessMm` (invariante), então largar a decomposição não muda nada
        // de geometria — nenhum canto se mexe, nenhum ambiente muda de área.
        delete wall.camadas;
      } else {
        // Cópia profunda: o array vem de fora (da UI), e guardá-lo por
        // referência deixaria quem o montou capaz de reescrever o modelo por
        // baixo do histórico.
        wall.camadas = clonarCamadas(command.camadas);
        // A soma MANDA. `assertModelInvariants` confere logo em seguida e
        // recusa camada de espessura zero ou negativa — aqui não se valida de
        // novo, para não haver duas cópias da mesma regra.
        wall.thicknessMm = somaDasCamadas(command.camadas);
      }

      diff.updated.push(wall.id);
      break;
    }

    case 'MoveVertex': {
      const wall = findWall(next, command.wallId);
      const other = command.end === 'a' ? wall.b : wall.a;
      if (pointsEqual(command.to, other)) {
        throw new KernelError('DEGENERATE_WALL', 'Mover o vértice colapsaria a parede');
      }

      // O VÉRTICE COMO ESTAVA, e o corpo como fica. A vizinhança é procurada no
      // lugar antigo — no novo é justamente onde ela não está.
      const antes = { ...wall[command.end] };
      const corpoNovo =
        command.end === 'a' ? { a: { ...command.to }, b: wall.b } : { a: wall.a, b: { ...command.to } };

      if (command.manterJuncoes) {
        const acompanham = pontasNoVerticeMovido(
          [...next.walls, ...next.boundaries],
          wall.id,
          antes,
          command.to,
          corpoNovo,
        );
        for (const alvo of [...next.walls, ...next.boundaries]) {
          const destino = acompanham.get(alvo.id);
          if (!destino) continue;
          alvo.a = { x: assertIntegerMm(destino.a.x, 'x'), y: assertIntegerMm(destino.a.y, 'y') };
          alvo.b = { x: assertIntegerMm(destino.b.x, 'x'), y: assertIntegerMm(destino.b.y, 'y') };
          diff.updated.push(alvo.id);
        }
      }

      wall[command.end] = { ...command.to };
      diff.updated.push(wall.id);

      // §9.1: mexer na parede hospedeira pode invalidar a abertura. Erro explícito
      // é melhor que silenciosamente deixar a abertura pendurada fora da parede.
      // Com `manterJuncoes` as VIZINHAS também mudaram de comprimento, então a
      // checagem tem de cobrir todas as paredes tocadas, não só a movida.
      const tocadas = new Set(diff.updated);
      for (const alvo of next.walls) {
        if (!tocadas.has(alvo.id)) continue;
        const newLimit = wallLength(alvo);
        for (const opening of next.openings.filter((o) => o.wallId === alvo.id)) {
          if (opening.offsetMm + opening.widthMm > newLimit) {
            throw new KernelError(
              'OPENING_OUT_OF_BOUNDS',
              `Encurtar ${alvo.id} deixaria a abertura ${opening.id} fora da parede`,
            );
          }
        }
      }
      break;
    }

    case 'TranslateEntities': {
      const estruturaIds = command.structuralIds ?? [];
      const aguaIds = command.aguaIds ?? [];
      const trechoIds = command.trechoIds ?? [];
      const terminalIds = command.terminalIds ?? [];
      const quadroIds = command.quadroIds ?? [];
      const nucleoIds = command.nucleoIds ?? [];
      const vagaIds = command.vagaIds ?? [];
      const componenteIds = command.componenteIds ?? [];
      if (
        command.wallIds.length === 0 &&
        command.boundaryIds.length === 0 &&
        estruturaIds.length === 0 &&
        aguaIds.length === 0 &&
        trechoIds.length === 0 &&
        terminalIds.length === 0 &&
        quadroIds.length === 0 &&
        nucleoIds.length === 0 &&
        vagaIds.length === 0 &&
        componenteIds.length === 0
      ) {
        throw new KernelError('EMPTY_SELECTION', 'Nada para deslocar');
      }

      const dx = assertIntegerMm(roundToMm(command.delta.x), 'delta.x');
      const dy = assertIntegerMm(roundToMm(command.delta.y), 'delta.y');

      // `findWall`/`findBoundary` lançam em id inexistente — resolver TODOS
      // antes de mexer em qualquer um é o que garante que um id errado no meio
      // da lista não deixe metade do conjunto deslocada.
      command.wallIds.forEach((id) => findWall(next, id));
      command.boundaryIds.forEach((id) => findBoundary(next, id));
      const estruturas = estruturaIds.map((id) => findStructural(next, id));

      // PAREDES E LIMITES NA MESMA CONTA. Rodar duas vezes, uma para cada
      // família, faria a vizinhança de um tipo não enxergar o outro: arrastar um
      // bloco de paredes com "esticar" deixaria a divisa encostada nele para
      // trás, o anel do lote abriria e o ambiente derivado sumiria sem erro.
      // `soltas` é sinal de UI (a prévia desenha o anel de alerta), não regra de
      // modelo: aqui só interessam os destinos.
      const { destinos } = pontasDeslocadas(
        [...next.walls, ...next.boundaries],
        [...command.wallIds, ...command.boundaryIds],
        { x: dx, y: dy },
        command.manterJuncoes,
        reservaDeAberturas(next),
      );

      const inteiro = (v: number) => assertIntegerMm(v, 'coordenada deslocada');
      const selecionadas = new Set(command.wallIds);
      for (const alvo of [...next.walls, ...next.boundaries]) {
        const destino = destinos.get(alvo.id);
        if (!destino) continue;
        // A PONTA `a` DE UMA PAREDE SELECIONADA pode ter sido levada ao canto
        // (estendida ou aparada sobre o próprio eixo — ver `pontasDeslocadas`).
        // As aberturas medem `offsetMm` a partir de `a`: para ficarem no MESMO
        // lugar do mundo, o offset anda o contrário do que `a` andou no eixo.
        // Aparar só acontece dentro da reserva, então nenhuma sai da parede.
        if (selecionadas.has(alvo.id)) {
          const rigidaA = { x: alvo.a.x + dx, y: alvo.a.y + dy };
          const ux = destino.b.x - destino.a.x;
          const uy = destino.b.y - destino.a.y;
          const comp = Math.hypot(ux, uy);
          const andouA = comp === 0 ? 0 : ((destino.a.x - rigidaA.x) * ux + (destino.a.y - rigidaA.y) * uy) / comp;
          if (Math.abs(andouA) >= 1) {
            for (const o of next.openings) {
              if (o.wallId !== alvo.id) continue;
              o.offsetMm = assertIntegerMm(roundToMm(o.offsetMm - andouA), 'offsetMm');
              diff.updated.push(o.id);
            }
          }
        }
        alvo.a = { x: inteiro(destino.a.x), y: inteiro(destino.a.y) };
        alvo.b = { x: inteiro(destino.b.x), y: inteiro(destino.b.y) };
        // PAREDE CURVA: o centro do arco anda rígido com a faceta SELECIONADA;
        // uma vizinha esticada saiu do círculo e `retirarArcosDesfeitos` cuida.
        if (selecionadas.has(alvo.id) && 'arco' in alvo && alvo.arco) {
          alvo.arco = { centro: { x: inteiro(alvo.arco.centro.x + dx), y: inteiro(alvo.arco.centro.y + dy) }, raioMm: alvo.arco.raioMm };
        }
        diff.updated.push(alvo.id);
      }

      // Estrutura anda RÍGIDA, fora de `pontasDeslocadas`: ela não tem junção
      // com nada (não entra no arranjo planar), então não há vizinha para
      // esticar nem ponta para soltar. Todo vértice recebe o mesmo delta.
      for (const s of estruturas) {
        s.pontos = s.pontos.map((p) => ({
          x: inteiro(p.x + dx),
          y: inteiro(p.y + dy),
        }));
        diff.updated.push(s.id);
      }

      // Água anda rígida pelo mesmo motivo da estrutura: não tem junção com
      // nada. `beiralIndex` é índice de lado e acompanha os vértices sem
      // precisar de ajuste — o lado continua sendo o mesmo lado.
      for (const id of aguaIds) {
        const agua = findAgua(next, id);
        agua.pontos = agua.pontos.map((p) => ({
          x: inteiro(p.x + dx),
          y: inteiro(p.y + dy),
        }));
        if (agua.extrusao) agua.extrusao = { a: { x: inteiro(agua.extrusao.a.x + dx), y: inteiro(agua.extrusao.a.y + dy) }, b: { x: inteiro(agua.extrusao.b.x + dx), y: inteiro(agua.extrusao.b.y + dy) } };
        diff.updated.push(agua.id);
      }

      // INSTALAÇÕES andam rígidas, como a estrutura e a água: elas não têm
      // junção com nada e nada as estica.
      //
      // ⚠️ E as COTAS não mudam. Arrastar em planta desloca em x e y; a altura
      // do trecho é outra dimensão, e mexer nela por causa de um arraste
      // horizontal moveria o cano para dentro da laje sem ninguém pedir.
      // ⚠️ As PONTAS PRESAS às peças que vão andar, calculadas ANTES de mover
      // qualquer coisa — depois, a peça já não está onde a ponta está, e a
      // igualdade que define a conexão deixaria de valer.
      const presas = pontasPresasAsPecas(next, terminalIds, quadroIds);
      const rigidos = new Set(trechoIds);

      for (const id of trechoIds) {
        const t = (next.trechos ?? []).find((x) => x.id === id);
        if (!t) throw new KernelError('RUN_NOT_FOUND', `Trecho não encontrado: ${id}`);
        t.a = { x: inteiro(t.a.x + dx), y: inteiro(t.a.y + dy) };
        t.b = { x: inteiro(t.b.x + dx), y: inteiro(t.b.y + dy) };
        // MOVER É DECIDIR, como na tomada sugerida: o caminho que a pessoa
        // arrastou deixou de ser proposta do sistema.
        if (t.sugerido) t.sugerido = null;
        diff.updated.push(t.id);
      }

      // ─── A CONEXÃO SE MANTÉM (10/09/2026) ────────────────────────────────
      //
      // A ponta do trecho que está NA peça anda com ela. Sem isto, mover uma
      // tomada deixava o eletroduto apontando para onde ela ESTAVA — a ponta no
      // ar, a 30 cm da peça, e nada na tela dizendo.
      //
      // ⚠️ Só as pontas presas, e só dos trechos que NÃO andaram rígidos: o
      // trecho selecionado já foi inteiro, e somar o delta de novo numa ponta
      // dele o esticaria pelo dobro. E só x e y — a cota é outra dimensão.
      for (const [id, lados] of presas) {
        if (rigidos.has(id)) continue;
        const t = (next.trechos ?? []).find((x) => x.id === id);
        if (!t) continue;
        if (lados.a) t.a = { x: inteiro(t.a.x + dx), y: inteiro(t.a.y + dy) };
        if (lados.b) t.b = { x: inteiro(t.b.x + dx), y: inteiro(t.b.y + dy) };
        diff.updated.push(t.id);
      }
      for (const id of terminalIds) {
        const t = (next.terminais ?? []).find((x) => x.id === id);
        if (!t) throw new KernelError('TERMINAL_NOT_FOUND', `Terminal não encontrado: ${id}`);
        t.at = { x: inteiro(t.at.x + dx), y: inteiro(t.at.y + dy) };
        // ⚠️ MOVER É DECIDIR: a marca de "sugerida" cai aqui, e não num botão.
        // Quem arrastou a tomada para o lugar certo já disse onde ela fica.
        if (t.sugerida) t.sugerida = null;
        diff.updated.push(t.id);
      }
      for (const id of quadroIds) {
        const q = (next.quadros ?? []).find((x) => x.id === id);
        if (!q) throw new KernelError('BOARD_NOT_FOUND', `Quadro não encontrado: ${id}`);
        q.at = { x: inteiro(q.at.x + dx), y: inteiro(q.at.y + dy) };
        diff.updated.push(q.id);
      }
      // P2.4: núcleo (contorno inteiro), vaga e componente (centro) — rígidos.
      for (const id of nucleoIds) {
        const n = findNucleo(next, id);
        n.ring = n.ring.map((p) => ({ x: inteiro(p.x + dx), y: inteiro(p.y + dy) }));
        diff.updated.push(n.id);
      }
      for (const id of vagaIds) {
        const v = findVaga(next, id);
        v.at = { x: inteiro(v.at.x + dx), y: inteiro(v.at.y + dy) };
        if (v.sugerida) delete v.sugerida;
        diff.updated.push(v.id);
      }
      // FAMÍLIAS ANINHADAS: os filhos dos conjuntos selecionados vão junto (uma vez só).
      const idsDeComponente = new Set(componenteIds);
      for (const id of componenteIds) {
        const c = findComponente(next, id);
        if (ehConjunto(c.tipoId)) for (const f of filhosDoConjunto(next, c)) idsDeComponente.add(f.id);
      }
      for (const id of idsDeComponente) {
        const c = findComponente(next, id);
        c.at = { x: inteiro(c.at.x + dx), y: inteiro(c.at.y + dy) };
        if (c.sugerido) delete c.sugerido;
        diff.updated.push(c.id);
      }

      // Só as VIZINHAS podem ter mudado de comprimento — as selecionadas
      // andaram rígidas. `assertModelInvariants` no fim de `applyCommand` cobre
      // a abertura que ficaria fora da parede, e como a cópia é feita antes de
      // validar, o modelo original fica intacto quando isso acontece.
      break;
    }

    case 'MirrorEntities': {
      const aguaIds = command.aguaIds ?? [];
      const trechoIds = command.trechoIds ?? [];
      const terminalIds = command.terminalIds ?? [];
      const quadroIds = command.quadroIds ?? [];
      if (
        command.wallIds.length === 0 &&
        command.boundaryIds.length === 0 &&
        command.structuralIds.length === 0 &&
        aguaIds.length === 0 &&
        trechoIds.length === 0 &&
        terminalIds.length === 0 &&
        quadroIds.length === 0
      ) {
        throw new KernelError('EMPTY_SELECTION', 'Nada para espelhar');
      }
      // 2·em inteiro: aceita o meio milímetro do centro de uma caixa ímpar e
      // garante que toda coordenada refletida continue inteira.
      const dobro = assertIntegerMm(Math.round(command.em * 2), 'em');
      const vertical = command.eixo === 'VERTICAL';
      const refletir = (p: Point): Point =>
        vertical
          ? { x: assertIntegerMm(dobro - p.x, 'coordenada espelhada'), y: p.y }
          : { x: p.x, y: assertIntegerMm(dobro - p.y, 'coordenada espelhada') };
      const giroEspelhado = (g: number) => {
        const n = Math.round(-g) % 360;
        return n < 0 ? n + 360 : n;
      };

      // Resolver TODOS antes de tocar em qualquer um — um id errado no meio da
      // lista não pode deixar metade do conjunto espelhada.
      const paredes = command.wallIds.map((id) => findWall(next, id));
      const limites = command.boundaryIds.map((id) => findBoundary(next, id));
      const estruturas = command.structuralIds.map((id) => findStructural(next, id));
      const aguas = aguaIds.map((id) => findAgua(next, id));
      const trechos = trechoIds.map((id) => {
        const t = (next.trechos ?? []).find((x) => x.id === id);
        if (!t) throw new KernelError('RUN_NOT_FOUND', `Trecho não encontrado: ${id}`);
        return t;
      });
      const terminais = terminalIds.map((id) => {
        const t = (next.terminais ?? []).find((x) => x.id === id);
        if (!t) throw new KernelError('TERMINAL_NOT_FOUND', `Terminal não encontrado: ${id}`);
        return t;
      });
      const quadros = quadroIds.map((id) => {
        const q = (next.quadros ?? []).find((x) => x.id === id);
        if (!q) throw new KernelError('BOARD_NOT_FOUND', `Quadro não encontrado: ${id}`);
        return q;
      });

      const espelhadas = new Set(command.wallIds);
      for (const w of [...paredes, ...limites]) {
        w.a = refletir(w.a);
        w.b = refletir(w.b);
        diff.updated.push(w.id);
      }
      for (const w of paredes) if (w.arco) w.arco = { centro: refletir(w.arco.centro), raioMm: w.arco.raioMm };
      // O lado de abrir é relativo ao sentido a→b; a reflexão troca os lados.
      for (const o of next.openings) {
        if (!espelhadas.has(o.wallId)) continue;
        o.swingReversed = !o.swingReversed;
        diff.updated.push(o.id);
      }
      for (const s of estruturas) {
        s.pontos = s.pontos.map(refletir);
        if (s.rotacaoDeg) s.rotacaoDeg = giroEspelhado(s.rotacaoDeg);
        diff.updated.push(s.id);
      }
      for (const a of aguas) {
        a.pontos = a.pontos.map(refletir);
        if (a.extrusao) a.extrusao = { a: refletir(a.extrusao.a), b: refletir(a.extrusao.b) };
        diff.updated.push(a.id);
      }
      for (const t of trechos) {
        t.a = refletir(t.a);
        t.b = refletir(t.b);
        if (t.sugerido) t.sugerido = null;
        diff.updated.push(t.id);
      }
      for (const t of terminais) {
        t.at = refletir(t.at);
        if (t.rotacaoGraus) t.rotacaoGraus = giroEspelhado(t.rotacaoGraus);
        if (t.sugerida) t.sugerida = null;
        diff.updated.push(t.id);
      }
      for (const q of quadros) {
        q.at = refletir(q.at);
        if (q.rotacaoGraus) q.rotacaoGraus = giroEspelhado(q.rotacaoGraus);
        diff.updated.push(q.id);
      }
      break;
    }

    case 'RotateEntities': {
      const aguaIds = command.aguaIds ?? [];
      const trechoIds = command.trechoIds ?? [];
      const terminalIds = command.terminalIds ?? [];
      const quadroIds = command.quadroIds ?? [];
      if (
        command.wallIds.length === 0 &&
        command.boundaryIds.length === 0 &&
        command.structuralIds.length === 0 &&
        aguaIds.length === 0 &&
        trechoIds.length === 0 &&
        terminalIds.length === 0 &&
        quadroIds.length === 0
      ) {
        throw new KernelError('EMPTY_SELECTION', 'Nada para girar');
      }
      if (!Number.isInteger(command.anguloGraus)) {
        throw new KernelError('BAD_ROTATION', `anguloGraus tem de ser inteiro: ${command.anguloGraus}`);
      }
      const g = ((command.anguloGraus % 360) + 360) % 360;
      const cx = assertIntegerMm(command.centro.x, 'centro.x');
      const cy = assertIntegerMm(command.centro.y, 'centro.y');
      // Múltiplo de 90°: seno e cosseno inteiros, giro exato. Fora disso, o
      // arredondamento ao milímetro é inevitável e é feito UMA vez por vértice.
      const quarto = g % 90 === 0 ? g / 90 : -1;
      const cos = quarto >= 0 ? [1, 0, -1, 0][quarto] : Math.cos((g * Math.PI) / 180);
      const sen = quarto >= 0 ? [0, 1, 0, -1][quarto] : Math.sin((g * Math.PI) / 180);
      const girar = (p: Point): Point => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        return {
          x: assertIntegerMm(Math.round(cx + dx * cos - dy * sen), 'coordenada girada'),
          y: assertIntegerMm(Math.round(cy + dx * sen + dy * cos), 'coordenada girada'),
        };
      };
      const somarGiro = (atual: number | null | undefined) => (((atual ?? 0) + g) % 360 + 360) % 360;

      // Resolver TODOS antes de tocar em qualquer um — como no espelhamento.
      const paredes = command.wallIds.map((id) => findWall(next, id));
      const limites = command.boundaryIds.map((id) => findBoundary(next, id));
      const estruturas = command.structuralIds.map((id) => findStructural(next, id));
      const aguas = aguaIds.map((id) => findAgua(next, id));
      const trechos = trechoIds.map((id) => {
        const t = (next.trechos ?? []).find((x) => x.id === id);
        if (!t) throw new KernelError('RUN_NOT_FOUND', `Trecho não encontrado: ${id}`);
        return t;
      });
      const terminais = terminalIds.map((id) => {
        const t = (next.terminais ?? []).find((x) => x.id === id);
        if (!t) throw new KernelError('TERMINAL_NOT_FOUND', `Terminal não encontrado: ${id}`);
        return t;
      });
      const quadros = quadroIds.map((id) => {
        const q = (next.quadros ?? []).find((x) => x.id === id);
        if (!q) throw new KernelError('BOARD_NOT_FOUND', `Quadro não encontrado: ${id}`);
        return q;
      });

      const giradas = new Set(command.wallIds);
      for (const w of [...paredes, ...limites]) {
        w.a = girar(w.a);
        w.b = girar(w.b);
        diff.updated.push(w.id);
      }
      for (const w of paredes) if (w.arco) w.arco = { centro: girar(w.arco.centro), raioMm: w.arco.raioMm };
      // O arredondamento pode ter tirado 1 mm da parede; a abertura que deixou
      // de caber recua esse milímetro em vez de derrubar o gesto inteiro.
      for (const o of next.openings) {
        if (!giradas.has(o.wallId)) continue;
        const w = paredes.find((x) => x.id === o.wallId)!;
        const comp = wallLength(w);
        if (o.offsetMm + o.widthMm > comp && o.widthMm <= comp) {
          o.offsetMm = comp - o.widthMm;
          diff.updated.push(o.id);
        }
      }
      for (const s of estruturas) {
        s.pontos = s.pontos.map(girar);
        s.rotacaoDeg = somarGiro(s.rotacaoDeg);
        diff.updated.push(s.id);
      }
      for (const a of aguas) {
        a.pontos = a.pontos.map(girar);
        if (a.extrusao) a.extrusao = { a: girar(a.extrusao.a), b: girar(a.extrusao.b) };
        diff.updated.push(a.id);
      }
      for (const t of trechos) {
        t.a = girar(t.a);
        t.b = girar(t.b);
        if (t.sugerido) t.sugerido = null;
        diff.updated.push(t.id);
      }
      for (const t of terminais) {
        t.at = girar(t.at);
        if (g !== 0 || t.rotacaoGraus) t.rotacaoGraus = somarGiro(t.rotacaoGraus);
        if (t.sugerida) t.sugerida = null;
        diff.updated.push(t.id);
      }
      for (const q of quadros) {
        q.at = girar(q.at);
        if (g !== 0 || q.rotacaoGraus) q.rotacaoGraus = somarGiro(q.rotacaoGraus);
        diff.updated.push(q.id);
      }
      break;
    }

    case 'SetParametros': {
      const listaDe = (f: FamiliaComParametros): { id: ObjectId; parametros?: Parametros }[] => {
        switch (f) {
          case 'wall': return next.walls;
          case 'opening': return next.openings;
          case 'structural': return next.structures;
          case 'roof': return next.roofs ?? [];
          case 'stair': return next.stairs ?? [];
          case 'trecho': return next.trechos ?? [];
          case 'terminal': return next.terminais ?? [];
          case 'quadro': return next.quadros ?? [];
        }
      };
      const peca = listaDe(command.familia).find((x) => x.id === command.id);
      if (!peca) throw new KernelError('NOT_FOUND', `Peça não encontrada para parâmetros: ${command.familia} ${command.id}`);
      // Objeto NOVO, nunca mutação: `cloneModel` copia as peças rasas, e mutar
      // o objeto aqui alteraria o modelo anterior do histórico (Ctrl+Z quebrado).
      const novo: Parametros = { ...(peca.parametros ?? {}) };
      for (const [chave, valor] of Object.entries(command.valores)) {
        if (valor === null) delete novo[chave];
        else novo[chave] = typeof valor === 'string' ? valor.trim() : valor;
      }
      if (Object.keys(novo).length === 0) delete peca.parametros;
      else peca.parametros = novo;
      // A validação fina (chave, tamanho, contagem) é da invariante, ao fim do comando.
      assertParametros(peca.parametros, `${command.familia} ${command.id}`);
      diff.updated.push(command.id);
      break;
    }

    case 'SplitWall': {
      const wall = findWall(next, command.wallId);
      if (!areCollinear(wall.a, wall.b, command.at)) {
        throw new KernelError('SPLIT_OFF_AXIS', 'Ponto de divisão fora do eixo da parede');
      }
      if (pointsEqual(command.at, wall.a) || pointsEqual(command.at, wall.b)) {
        throw new KernelError('SPLIT_AT_ENDPOINT', 'Divisão coincide com uma ponta');
      }

      const firstId = nextId(next, 'wal');
      const secondId = nextId(next, 'wal');
      // Os dois fragmentos herdam a MESMA composição — dividir uma parede não
      // muda de que ela é feita —, mas cada um com a sua CÓPIA: `...wall` copia
      // a referência do array, e as duas metades ficariam com a mesma lista.
      const first: Wall = {
        ...wall,
        id: firstId,
        a: { ...wall.a },
        b: { ...command.at },
        ...(wall.camadas ? { camadas: clonarCamadas(wall.camadas)! } : {}),
      };
      // IDENTIDADE: `first` HERDA o uid da parede original (pelo spread) e
      // `second` nasce com um novo. É `first`, e não "a metade maior", porque é
      // o fragmento que preservou a origem `a`, o sentido `a → b` e, com eles,
      // os `offsetMm` das aberturas intactos — para o mundo de fora (IFC,
      // cronograma) ele é a mesma parede, encurtada. "A maior" seria ambígua no
      // corte ao meio e dependeria de onde o usuário clicou.
      const second: Wall = {
        ...wall,
        id: secondId,
        uid: novoUid(),
        a: { ...command.at },
        b: { ...wall.b },
        ...(wall.camadas ? { camadas: clonarCamadas(wall.camadas)! } : {}),
      };

      next.walls = next.walls.filter((w) => w.id !== wall.id);
      next.walls.push(first, second);

      // Cada abertura vai para o fragmento que a contém, com offset recalculado.
      const cutAt = Math.round(
        Math.sqrt((command.at.x - wall.a.x) ** 2 + (command.at.y - wall.a.y) ** 2),
      );
      const rehosted: Opening[] = [];
      for (const opening of next.openings) {
        if (opening.wallId !== wall.id) {
          rehosted.push(opening);
          continue;
        }
        if (opening.offsetMm + opening.widthMm <= cutAt) {
          rehosted.push({ ...opening, wallId: firstId });
        } else if (opening.offsetMm >= cutAt) {
          rehosted.push({ ...opening, wallId: secondId, offsetMm: opening.offsetMm - cutAt });
        } else {
          throw new KernelError(
            'SPLIT_THROUGH_OPENING',
            `A divisão atravessa a abertura ${opening.id}`,
          );
        }
      }
      next.openings = rehosted;

      diff.deleted.push(wall.id);
      diff.created.push(firstId, secondId);
      diff.ancestry[firstId] = [wall.id];
      diff.ancestry[secondId] = [wall.id];
      break;
    }

    case 'MergeWalls': {
      const first = findWall(next, command.firstId);
      const second = findWall(next, command.secondId);

      if (first.levelId !== second.levelId) {
        throw new KernelError('MERGE_CROSS_LEVEL', 'Paredes em níveis diferentes');
      }
      if (first.thicknessMm !== second.thicknessMm) {
        throw new KernelError('MERGE_THICKNESS_MISMATCH', 'Espessuras diferentes');
      }
      // A COMPOSIÇÃO também tem de bater, e a checagem de espessura não cobre
      // isto: 25+140+25 e 190 homogênea somam o mesmo, e uma delas é bloco com
      // reboco e a outra é concreto. Unir sem conferir escolheria a composição
      // da `first` em silêncio e apagaria a da `second` — um material sumindo do
      // orçamento sem nada na tela dizendo que sumiu.
      if (assinaturaDasCamadas(first.camadas) !== assinaturaDasCamadas(second.camadas)) {
        throw new KernelError('MERGE_LAYERS_MISMATCH', 'Composições de camadas diferentes');
      }
      // CORTINA/BRISE (P2.20): pele diferente não se une — uma seria apagada em silêncio.
      if (JSON.stringify(first.cortina ?? null) !== JSON.stringify(second.cortina ?? null) || JSON.stringify(first.brise ?? null) !== JSON.stringify(second.brise ?? null)) {
        throw new KernelError('MERGE_SKIN_MISMATCH', 'Cortina de vidro ou brise diferentes');
      }
      if (!areCollinear(first.a, first.b, second.a) || !areCollinear(first.a, first.b, second.b)) {
        throw new KernelError('MERGE_NOT_COLLINEAR', 'Paredes não são colineares');
      }

      // Encontrar a ponta compartilhada e montar o eixo resultante.
      let start: Point | null = null;
      let end: Point | null = null;
      if (pointsEqual(first.b, second.a)) {
        start = first.a;
        end = second.b;
      } else if (pointsEqual(first.a, second.b)) {
        start = second.a;
        end = first.b;
      } else if (pointsEqual(first.a, second.a)) {
        start = first.b;
        end = second.b;
      } else if (pointsEqual(first.b, second.b)) {
        start = first.a;
        end = second.a;
      }
      if (!start || !end) {
        throw new KernelError('MERGE_NOT_ADJACENT', 'Paredes não compartilham uma ponta');
      }

      const mergedId = nextId(next, 'wal');
      next.walls = next.walls.filter((w) => w.id !== first.id && w.id !== second.id);

      // O LADO DO TRAÇO ACOMPANHA O SENTIDO, como o offset das aberturas logo
      // abaixo — é a mesma pergunta ("a `first` foi percorrida ao contrário?") e
      // tem de ter a mesma resposta. Só o caso `first.a === second.a` inverte a
      // `first`, e ali a face que era à DIREITA passa a estar à ESQUERDA do
      // sentido novo. Sem isto, unir duas paredes viraria a face do avesso e a
      // próxima troca de espessura andaria para o lado errado.
      const primeiraInvertida = !pointsEqual(start, first.a);
      const alinhamentoUnido = primeiraInvertida
        ? ladoOposto(first.alinhamento)
        : (first.alinhamento ?? 'EIXO');

      // A ORDEM DAS CAMADAS ACOMPANHA O SENTIDO, pela mesma razão do lado do
      // traço logo acima: a composição é gravada da face ESQUERDA para a
      // DIREITA relativas a `a → b`, então inverter o sentido troca as duas
      // faces de lugar. Sem isto, unir duas paredes poria o reboco externo do
      // lado de dentro — e como os dois rebocos costumam ter a mesma espessura,
      // o desenho continuaria plausível e ninguém veria.
      const camadasUnidas = primeiraInvertida
        ? clonarCamadas(first.camadas)?.reverse()
        : clonarCamadas(first.camadas);

      next.walls.push({
        id: mergedId,
        // IDENTIDADE: a parede unida continua sendo a `first` para o mundo de
        // fora — o uid da `second` some com ela. Simétrico ao `SplitWall`, em
        // que `first` é quem herda.
        uid: first.uid,
        levelId: first.levelId,
        a: { ...start },
        b: { ...end },
        thicknessMm: first.thicknessMm,
        heightMm: first.heightMm,
        ...(alinhamentoUnido !== 'EIXO' ? { alinhamento: alinhamentoUnido } : {}),
        ...(camadasUnidas ? { camadas: camadasUnidas } : {}),
      });

      // Reancorar aberturas medindo o offset a partir da nova origem.
      const firstLen = wallLength(first);
      next.openings = next.openings.map((o) => {
        if (o.wallId !== first.id && o.wallId !== second.id) return o;
        const fromFirst = o.wallId === first.id;
        const flipped = fromFirst ? !pointsEqual(start!, first.a) : !pointsEqual(start!, second.a);
        const base = fromFirst ? 0 : firstLen;
        const own = flipped
          ? (fromFirst ? firstLen : wallLength(second)) - o.offsetMm - o.widthMm
          : o.offsetMm;
        return { ...o, wallId: mergedId, offsetMm: base + own };
      });

      diff.deleted.push(first.id, second.id);
      diff.created.push(mergedId);
      diff.ancestry[mergedId] = [first.id, second.id];
      break;
    }

    case 'DeleteOpening': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      next.openings = next.openings.filter((o) => o.id !== opening.id);
      diff.deleted.push(opening.id);
      break;
    }

    case 'SetOpeningKind': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      // Posição e medidas ficam: trocar o tipo é dizer O QUE é a abertura, não
      // onde ela está nem quanto ela mede. Zerar isso obrigaria a refazer o
      // ajuste — exatamente o que este comando existe para evitar.
      next.openings = next.openings.map((o) =>
        o.id === opening.id
          ? {
              ...o,
              kind: command.kind,
              embutida: command.kind === 'sliding' ? (command.embutida ?? o.embutida) : false,
            }
          : o,
      );
      diff.updated.push(opening.id);
      break;
    }

    case 'SetOpeningEsquadria': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      if (command.esquadria === null) {
        delete opening.esquadria;
      } else {
        if (!command.esquadria.nome.trim()) {
          throw new KernelError('BAD_ESQUADRIA', 'O tipo de esquadria precisa de um nome');
        }
        // Cópia, e não o objeto do chamador: o catálogo passa o próprio registro,
        // e editar a abertura depois não pode reescrever o molde por referência.
        opening.esquadria = {
          nome: command.esquadria.nome.trim(),
          itemCode: command.esquadria.itemCode.trim(),
          descricao: command.esquadria.descricao,
        };
      }
      diff.updated.push(opening.id);
      break;
    }

    case 'SetOpeningSize': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      const wall = findWall(next, opening.wallId);

      const largura = command.widthMm ?? opening.widthMm;
      const altura = command.heightMm ?? opening.heightMm;
      const peitoril = command.sillMm ?? opening.sillMm;

      // Recusar ANTES de gravar, com a medida no texto. `assertModelInvariants`
      // pegaria os mesmos casos no fim do comando, mas a mensagem dela fala de
      // um id de abertura — aqui dá para dizer quanto sobrou, que é o que a
      // pessoa precisa saber para escolher outro número.
      if (largura <= 0) {
        throw new KernelError('BAD_OPENING_WIDTH', 'Largura tem que ser maior que zero');
      }
      if (altura <= 0) {
        throw new KernelError('BAD_OPENING_HEIGHT', 'Altura tem que ser maior que zero');
      }
      if (peitoril < 0) {
        throw new KernelError('BAD_SILL', 'Peitoril não pode ser negativo');
      }

      const limite = wallLength(wall);
      if (opening.offsetMm + largura > limite) {
        throw new KernelError(
          'OPENING_OUT_OF_BOUNDS',
          `Largura máxima aqui é ${limite - opening.offsetMm} mm — a abertura começa a ${opening.offsetMm} mm de uma parede de ${limite} mm`,
        );
      }
      if (peitoril + altura > wall.heightMm) {
        throw new KernelError(
          'OPENING_TALLER_THAN_WALL',
          `Altura máxima aqui é ${wall.heightMm - peitoril} mm — a parede tem ${wall.heightMm} mm e o peitoril está em ${peitoril} mm`,
        );
      }

      next.openings = next.openings.map((o) =>
        o.id !== opening.id
          ? o
          : { ...o, widthMm: largura, heightMm: altura, sillMm: peitoril },
      );
      diff.updated.push(opening.id);
      break;
    }

    case 'MoveOpening': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      const wall = findWall(next, opening.wallId);
      const limite = wallLength(wall);

      if (command.offsetMm < 0) {
        throw new KernelError('OPENING_OUT_OF_BOUNDS', 'A abertura não pode começar antes da parede');
      }
      // A medida MÁXIMA na mensagem, como em `SetOpeningSize`: recusar sem dizer
      // até onde dá obriga a descobrir por tentativa.
      if (command.offsetMm + opening.widthMm > limite) {
        throw new KernelError(
          'OPENING_OUT_OF_BOUNDS',
          `Distância máxima aqui é ${limite - opening.widthMm} mm — a abertura tem ${opening.widthMm} mm numa parede de ${limite} mm`,
        );
      }

      next.openings = next.openings.map((o) =>
        o.id !== opening.id ? o : { ...o, offsetMm: command.offsetMm },
      );
      diff.updated.push(opening.id);
      break;
    }

    case 'FlipOpening': {
      const opening = next.openings.find((o) => o.id === command.openingId);
      if (!opening) {
        throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${command.openingId}`);
      }
      // Não muda offset/largura/parede hospedeira — é só o SÍMBOLO que muda de
      // lado. Por isso não há validação de limite aqui: nada que `AddOpening`
      // já aceitou pode deixar de caber por causa de girar ou espelhar.
      next.openings = next.openings.map((o) =>
        o.id !== opening.id
          ? o
          : command.axis === 'hinge'
            ? { ...o, hingeAtStart: !o.hingeAtStart }
            : { ...o, swingReversed: !o.swingReversed },
      );
      diff.updated.push(opening.id);
      break;
    }

    case 'DeleteWall': {
      const wall = findWall(next, command.wallId);
      next.walls = next.walls.filter((w) => w.id !== wall.id);
      const orphans = next.openings.filter((o) => o.wallId === wall.id);
      next.openings = next.openings.filter((o) => o.wallId !== wall.id);
      diff.deleted.push(wall.id, ...orphans.map((o) => o.id));
      break;
    }

    case 'NameSpace': {
      const space = next.spaces.find((s) => s.id === command.spaceId);
      if (!space) {
        throw new KernelError('SPACE_NOT_FOUND', `Ambiente inexistente: ${command.spaceId}`);
      }

      // O nome é ancorado num PONTO dentro do ambiente, não no id dele. Ambiente
      // é derivado: mover uma parede recria todos com ids novos, e um nome
      // guardado por id não sobreviveria a nenhuma edição.
      const ancora = interiorPoint(space.ring, space.holes);

      // Renomear o mesmo ambiente substitui a etiqueta, não empilha outra.
      const existente = next.labels.find(
        (l) =>
          l.levelId === space.levelId &&
          pointInPolygon(space.ring, l.at) &&
          !space.holes.some((h) => pointInPolygon(h, l.at)),
      );

      const nome = command.name.trim();

      if (!nome) {
        if (existente) {
          next.labels = next.labels.filter((l) => l.id !== existente.id);
          diff.deleted.push(existente.id);
        }
        break;
      }

      if (existente) {
        next.labels = next.labels.map((l) =>
          l.id === existente.id
            ? {
                ...l,
                name: nome,
                // Ausente não mexe no tipo: renomear não é reclassificar.
                ...(command.tipoDeAmbiente !== undefined ? { tipoDeAmbiente: command.tipoDeAmbiente } : {}),
                ...(command.acabamentos !== undefined ? { acabamentos: acabamentosOuAusente(command.acabamentos) } : {}),
              }
            : l,
        );
        diff.updated.push(existente.id);
      } else {
        const id = nextId(next, 'lbl');
        next.labels.push({
          id,
          uid: novoUid(),
          levelId: space.levelId,
          at: ancora,
          name: nome,
          tipoDeAmbiente: command.tipoDeAmbiente ?? null,
          ...(command.acabamentos ? { acabamentos: acabamentosOuAusente(command.acabamentos) } : {}),
        });
        diff.created.push(id);
      }
      break;
    }

    case 'SetSpaceLabelProps': {
      const label = next.labels.find((l) => l.id === command.labelId);
      if (!label) throw new KernelError('LABEL_NOT_FOUND', `Etiqueta inexistente: ${command.labelId}`);
      if (command.tipoDeAmbiente !== undefined) label.tipoDeAmbiente = command.tipoDeAmbiente;
      if (command.acabamentos !== undefined) {
        const a = acabamentosOuAusente(command.acabamentos);
        if (a) label.acabamentos = a;
        else delete label.acabamentos;
      }
      diff.updated.push(label.id);
      break;
    }

    case 'SetLevelProps': {
      const level = findLevel(next, command.levelId);
      if (command.name !== undefined) {
        const nome = command.name.trim();
        if (!nome) {
          throw new KernelError('BAD_LEVEL_NAME', 'Nome do pavimento não pode ser vazio');
        }
        level.name = nome;
      }
      if (command.elevationMm !== undefined) {
        level.elevationMm = assertIntegerMm(command.elevationMm, 'elevationMm');
      }
      if (command.defaultHeightMm !== undefined) {
        const altura = assertIntegerMm(command.defaultHeightMm, 'defaultHeightMm');
        if (altura <= 0) {
          throw new KernelError('BAD_LEVEL_HEIGHT', 'Pé-direito tem que ser maior que zero');
        }
        level.defaultHeightMm = altura;
      }
      diff.updated.push(level.id);
      if (command.tipoDeId !== undefined) {
        if (command.tipoDeId === null) {
          delete level.tipoDeId;
        } else {
          if (command.tipoDeId === level.id) throw new KernelError('BAD_LEVEL_LINK', 'Um pavimento não pode ser tipo de si mesmo');
          const tipo = findLevel(next, command.tipoDeId);
          if (tipo.tipoDeId !== undefined) throw new KernelError('BAD_LEVEL_LINK', `"${tipo.name}" já é cópia de outro pavimento — vincule ao tipo dele`);
          if (next.levels.some((l) => l.tipoDeId === level.id)) throw new KernelError('BAD_LEVEL_LINK', `"${level.name}" é tipo de outros pavimentos — desvincule-os antes`);
          level.tipoDeId = command.tipoDeId;
        }
      }
      break;
    }

    case 'RemoveLevel': {
      const level = findLevel(next, command.levelId);
      if (next.levels.length <= 1) {
        throw new KernelError('LAST_LEVEL', 'Não dá para remover o único pavimento');
      }
      // O tipo some: os pavimentos que o copiavam ficam SOLTOS, com as cópias.
      for (const l of next.levels) if (l.tipoDeId === level.id) delete l.tipoDeId;
      const paredesDoNivel = new Set(
        next.walls.filter((w) => w.levelId === level.id).map((w) => w.id),
      );
      const aberturasOrfas = next.openings.filter((o) => paredesDoNivel.has(o.wallId));
      const limitesDoNivel = next.boundaries.filter((b) => b.levelId === level.id);
      const etiquetasDoNivel = next.labels.filter((l) => l.levelId === level.id);
      const estruturasDoNivel = next.structures.filter((s) => s.levelId === level.id);
      const aguasDoNivel = (next.roofs ?? []).filter((r) => r.levelId === level.id);
      // A escada VAI JUNTO — ao contrário do corte, que não tem pavimento.
      // Ela parte deste piso; sem ele, não parte de lugar nenhum.
      const escadasDoNivel = (next.stairs ?? []).filter((e) => e.levelId === level.id);
      // Instalação também vai junto: as cotas dela são medidas DESTE piso.
      const trechosDoNivel = (next.trechos ?? []).filter((t) => t.levelId === level.id);
      const terminaisDoNivel = (next.terminais ?? []).filter((t) => t.levelId === level.id);
      const vagasDoNivel = (next.vagas ?? []).filter((v) => v.levelId === level.id);
      const componentesDoNivel = (next.componentes ?? []).filter((c) => c.levelId === level.id);
      const guardaCorposDoNivel = (next.guardaCorpos ?? []).filter((g) => g.levelId === level.id);
      const anotacoesDoNivel = (next.anotacoes ?? []).filter((a) => a.vista.tipo === 'PLANTA' && a.vista.levelId === level.id);
      const vistasDoNivel = (next.vistasDependentes ?? []).filter((v) => v.levelId === level.id);
      const subRegioesDoNivel = (next.subRegioes ?? []).filter((s) => s.levelId === level.id);

      next.walls = next.walls.filter((w) => w.levelId !== level.id);
      next.openings = next.openings.filter((o) => !paredesDoNivel.has(o.wallId));
      next.boundaries = next.boundaries.filter((b) => b.levelId !== level.id);
      next.structures = next.structures.filter((s) => s.levelId !== level.id);
      next.roofs = (next.roofs ?? []).filter((r) => r.levelId !== level.id);
      next.stairs = (next.stairs ?? []).filter((e) => e.levelId !== level.id).map((e) => (e.ateLevelId === level.id ? { ...e, ateLevelId: undefined } : e));
      const nucleosDoNivel = (next.nucleos ?? []).filter((n) => n.levelId === level.id);
      next.nucleos = (next.nucleos ?? []).filter((n) => n.levelId !== level.id).map((n) => (n.ateLevelId === level.id ? { ...n, ateLevelId: undefined } : n));
      next.trechos = (next.trechos ?? []).filter((t) => t.levelId !== level.id);
      next.terminais = (next.terminais ?? []).filter((t) => t.levelId !== level.id);
      next.vagas = (next.vagas ?? []).filter((v) => v.levelId !== level.id);
      next.componentes = (next.componentes ?? []).filter((c) => c.levelId !== level.id);
      next.guardaCorpos = (next.guardaCorpos ?? []).filter((g) => g.levelId !== level.id);
      next.anotacoes = (next.anotacoes ?? []).filter((a) => !(a.vista.tipo === 'PLANTA' && a.vista.levelId === level.id));
      next.vistasDependentes = (next.vistasDependentes ?? []).filter((v) => v.levelId !== level.id);
      next.subRegioes = (next.subRegioes ?? []).filter((s) => s.levelId !== level.id);
      // ⚠️ O quadro vai junto (é peça deste piso); os CIRCUITOS dele vão junto
      // também, senão ficariam apontando para um quadro que não existe mais. E
      // os terminais que os citavam já saíram, ou perdem a referência.
      const quadrosDoNivel = (next.quadros ?? []).filter((q) => q.levelId === level.id);
      const idsQuadro = new Set(quadrosDoNivel.map((q) => q.id));
      const circuitosOrfaos = (next.circuitos ?? []).filter((c) => idsQuadro.has(c.quadroId));
      const idsCircuito = new Set(circuitosOrfaos.map((c) => c.id));
      next.quadros = (next.quadros ?? []).filter((q) => !idsQuadro.has(q.id));
      next.circuitos = (next.circuitos ?? []).filter((c) => !idsCircuito.has(c.id));
      next.terminais = (next.terminais ?? []).map((t) =>
        t.circuitoId && idsCircuito.has(t.circuitoId) ? { ...t, circuitoId: null } : t,
      );
      next.trechos = (next.trechos ?? []).map((t) => semCircuitos(t, idsCircuito));
      next.labels = next.labels.filter((l) => l.levelId !== level.id);
      next.levels = next.levels.filter((l) => l.id !== level.id);

      diff.deleted.push(
        level.id,
        ...paredesDoNivel,
        ...aberturasOrfas.map((o) => o.id),
        ...limitesDoNivel.map((b) => b.id),
        ...estruturasDoNivel.map((s) => s.id),
        ...aguasDoNivel.map((r) => r.id),
        ...escadasDoNivel.map((e) => e.id),
        ...nucleosDoNivel.map((n) => n.id),
        ...trechosDoNivel.map((t) => t.id),
        ...terminaisDoNivel.map((t) => t.id),
        ...vagasDoNivel.map((v) => v.id),
        ...componentesDoNivel.map((c) => c.id),
        ...guardaCorposDoNivel.map((g) => g.id),
        ...anotacoesDoNivel.map((a) => a.id),
        ...vistasDoNivel.map((v) => v.id),
        ...subRegioesDoNivel.map((s) => s.id),
        ...quadrosDoNivel.map((q) => q.id),
        ...circuitosOrfaos.map((c) => c.id),
        ...etiquetasDoNivel.map((l) => l.id),
      );
      break;
    }

    case 'DuplicateLevel': {
      const origem = findLevel(next, command.levelId);
      const nome = command.novoNome.trim();
      if (!nome) {
        throw new KernelError('BAD_LEVEL_NAME', 'Nome do pavimento não pode ser vazio');
      }
      const novoNivelId = nextId(next, 'lvl');
      // IDENTIDADE: toda cópia — o nível e cada peça dele — nasce com uid NOVO,
      // atribuído DEPOIS do spread para sobrescrever o herdado. Cópia com o uid
      // do original seria `DUPLICATE_UID` nos invariantes.
      next.levels.push({
        id: novoNivelId,
        uid: novoUid(),
        name: nome,
        elevationMm: assertIntegerMm(command.elevationMm, 'elevationMm'),
        defaultHeightMm: origem.defaultHeightMm,
      });
      diff.created.push(novoNivelId);

      // `.filter` tira uma FOTO do array antes dos `push` abaixo — o laço não
      // enxerga o que ele mesmo acabou de acrescentar, então não há cópia da
      // cópia.
      const dePara = new Map<ObjectId, ObjectId>();
      for (const w of next.walls.filter((w) => w.levelId === origem.id)) {
        const id = nextId(next, 'wal');
        dePara.set(w.id, id);
        next.walls.push({ ...w, id, uid: novoUid(), levelId: novoNivelId, a: { ...w.a }, b: { ...w.b } });
        diff.created.push(id);
      }
      for (const o of next.openings.filter((o) => dePara.has(o.wallId))) {
        const id = nextId(next, 'opn');
        // `esquadria` copiada a fundo pela razão de `camadas` em `cloneModel`.
        next.openings.push({
          ...o,
          id,
          uid: novoUid(),
          wallId: dePara.get(o.wallId)!,
          ...(o.esquadria ? { esquadria: { ...o.esquadria } } : {}),
        });
        diff.created.push(id);
      }
      for (const b of next.boundaries.filter((b) => b.levelId === origem.id)) {
        const id = nextId(next, 'bnd');
        next.boundaries.push({ ...b, id, uid: novoUid(), levelId: novoNivelId, a: { ...b.a }, b: { ...b.b } });
        diff.created.push(id);
      }
      for (const s of next.structures.filter((s) => s.levelId === origem.id)) {
        const id = nextId(next, 'str');
        next.structures.push({
          ...s,
          id,
          uid: novoUid(),
          levelId: novoNivelId,
          pontos: s.pontos.map((p) => ({ ...p })),
        });
        diff.created.push(id);
      }
      // `.filter` sobre a lista ANTES dos push, como as famílias acima — aqui a
      // cópia é reatribuída em vez de `push`ada porque `roofs` pode não existir
      // num modelo antigo, e `?? []` só funciona numa expressão.
      for (const r of (next.roofs ?? []).filter((r) => r.levelId === origem.id)) {
        const id = nextId(next, 'agu');
        next.roofs = [
          ...(next.roofs ?? []),
          { ...r, id, uid: novoUid(), levelId: novoNivelId, pontos: r.pontos.map((p) => ({ ...p })) },
        ];
        diff.created.push(id);
      }
      for (const l of next.labels.filter((l) => l.levelId === origem.id)) {
        const id = nextId(next, 'lbl');
        next.labels.push({ ...l, id, uid: novoUid(), levelId: novoNivelId, at: { ...l.at } });
        diff.created.push(id);
      }
      break;
    }

    case 'DuplicateEntities': {
      findLevel(next, command.levelId);

      // O deslocamento passa pela MESMA porta do arraste (`TranslateEntities`):
      // arredondado ao milímetro e conferido como inteiro. Colar com um delta
      // fracionário poria coordenada quebrada no payload canônico, e o hash da
      // versão publicada deixaria de ser reproduzível.
      const dx = assertIntegerMm(roundToMm(command.delta.x), 'delta.x');
      const dy = assertIntegerMm(roundToMm(command.delta.y), 'delta.y');
      const deslocar = (p: Point): Point => ({
        x: assertIntegerMm(p.x + dx, 'coordenada colada'),
        y: assertIntegerMm(p.y + dy, 'coordenada colada'),
      });

      // Resolver TODOS os originais antes de criar qualquer cópia: um id
      // inexistente na lista tem de derrubar o comando inteiro, e não deixar
      // metade da seleção colada. `applyCommand` já trabalha sobre uma cópia do
      // modelo, mas só se ninguém publicar resultado parcial no caminho.
      const paredes = command.wallIds.map((id) => findWall(next, id));
      const limites = command.boundaryIds.map((id) => findBoundary(next, id));
      const estruturas = (command.structuralIds ?? []).map((id) => findStructural(next, id));
      const aguas = (command.aguaIds ?? []).map((id) => findAgua(next, id));
      const avulsas = command.openings.map((alvo) => {
        const original = next.openings.find((o) => o.id === alvo.openingId);
        if (!original) {
          throw new KernelError('OPENING_NOT_FOUND', `Abertura inexistente: ${alvo.openingId}`);
        }
        return { alvo, original, hospedeira: findWall(next, alvo.wallId) };
      });

      if (
        paredes.length === 0 &&
        limites.length === 0 &&
        estruturas.length === 0 &&
        aguas.length === 0 &&
        avulsas.length === 0
      ) {
        throw new KernelError('NOTHING_TO_DUPLICATE', 'Nada selecionado para copiar');
      }

      const dePara = new Map<ObjectId, ObjectId>();
      for (const w of paredes) {
        const id = nextId(next, 'wal');
        dePara.set(w.id, id);
        // IDENTIDADE: cópia nasce com uid NOVO, depois do spread — ver
        // `DuplicateLevel`.
        next.walls.push({
          ...w,
          id,
          uid: novoUid(),
          levelId: command.levelId,
          a: deslocar(w.a),
          b: deslocar(w.b),
          ...(w.arco ? { arco: { centro: deslocar(w.arco.centro), raioMm: w.arco.raioMm } } : {}),
        });
        diff.created.push(id);
      }

      // `.filter` tira uma FOTO antes dos `push` — o laço não enxerga o que ele
      // mesmo acrescenta, então não há cópia da cópia. Mesma disciplina de
      // `DuplicateLevel`.
      for (const o of next.openings.filter((o) => dePara.has(o.wallId))) {
        const id = nextId(next, 'opn');
        // `esquadria` copiada a fundo pela razão de `camadas` em `cloneModel`.
        next.openings.push({
          ...o,
          id,
          uid: novoUid(),
          wallId: dePara.get(o.wallId)!,
          ...(o.esquadria ? { esquadria: { ...o.esquadria } } : {}),
        });
        diff.created.push(id);
      }

      for (const { alvo, original, hospedeira } of avulsas) {
        const offset = assertIntegerMm(roundToMm(alvo.offsetMm), 'offsetMm');
        const limite = wallLength(hospedeira);
        // Recusar AQUI, e não deixar para `assertModelInvariants`: a mensagem
        // dela fala de um id de abertura, e quem colou precisa saber quanto
        // sobrou na parede que ele mirou.
        if (offset < 0 || offset + original.widthMm > limite) {
          throw new KernelError(
            'OPENING_OUT_OF_BOUNDS',
            `Abertura ${offset}+${original.widthMm} não cabe em ${limite} mm`,
          );
        }
        const id = nextId(next, 'opn');
        next.openings.push({
          ...original,
          id,
          uid: novoUid(),
          wallId: alvo.wallId,
          offsetMm: offset,
          ...(original.esquadria ? { esquadria: { ...original.esquadria } } : {}),
        });
        diff.created.push(id);
      }

      for (const b of limites) {
        const id = nextId(next, 'bnd');
        next.boundaries.push({
          ...b,
          id,
          uid: novoUid(),
          levelId: command.levelId,
          a: deslocar(b.a),
          b: deslocar(b.b),
        });
        diff.created.push(id);
      }

      for (const s of estruturas) {
        const id = nextId(next, 'str');
        next.structures.push({
          ...s,
          id,
          uid: novoUid(),
          levelId: command.levelId,
          pontos: s.pontos.map(deslocar),
        });
        diff.created.push(id);
      }

      for (const r of aguas) {
        const id = nextId(next, 'agu');
        next.roofs = [
          ...(next.roofs ?? []),
          { ...r, id, uid: novoUid(), levelId: command.levelId, pontos: r.pontos.map(deslocar), ...(r.extrusao ? { extrusao: { a: deslocar(r.extrusao.a), b: deslocar(r.extrusao.b) } } : {}) },
        ];
        diff.created.push(id);
      }
      break;
    }

    default: {
      const exhaustive: never = command;
      throw new KernelError('UNKNOWN_COMMAND', `Comando desconhecido: ${JSON.stringify(exhaustive)}`);
    }
  }

  // GRUPOS (E2.3): origem sem peça viva perde a peça; as instâncias se re-derivam da origem.
  diff.updated.push(...limparOrigensOrfasDosGrupos(next));
  sincronizarGrupos(next, diff, copiasAntes);
  // PAVIMENTO TIPO (E2.1): as cópias vivas se re-derivam do tipo (inclusive as cópias de grupo).
  sincronizarPavimentosVinculados(next, diff);
  // Restrição sem alvo ou referência viva some com o comando que os apagou.
  diff.deleted.push(...limparRestricoesOrfas(next));
  // Etiqueta apagada sai da unidade; a unidade fica (E2.2).
  diff.updated.push(...limparEtiquetasOrfasDasUnidades(next));
  // PAREDE CURVA (P2.12): faceta que saiu do círculo perde o metadado.
  retirarArcosDesfeitos(next, diff);
  // FAMÍLIAS ANINHADAS (P2.18): filho cujo conjunto sumiu fica solto.
  for (const c of next.componentes ?? []) {
    if (c.paiUid && !(next.componentes ?? []).some((x) => x.uid === c.paiUid)) {
      delete c.paiUid;
      if (!diff.updated.includes(c.id) && !diff.created.includes(c.id)) diff.updated.push(c.id);
    }
  }
  recomputeSpaces(next);
  assertModelInvariants(next);

  return { model: next, diff };
}

/**
 * Tira `arco` de toda faceta cujas pontas não estão mais sobre o círculo.
 *
 * É o que torna o metadado SEGURO: MoveVertex, ponta esticada/aparada por
 * `manterJuncoes`, SplitWall na corda — qualquer gesto que tire uma ponta do
 * círculo — deixam a parede reta e honesta, em vez de um arco desenhado que não
 * passa pelas pontas. Roda em todo comando porque é O(paredes) e porque é a
 * única forma de nenhum caminho novo esquecer de cuidar disto.
 */
/** O recorte da vista dependente em mm inteiros, com min/max na ordem certa. */
function recorteInteiro(r: { minX: number; minY: number; maxX: number; maxY: number }): { minX: number; minY: number; maxX: number; maxY: number } {
  const x0 = assertIntegerMm(roundToMm(Math.min(r.minX, r.maxX)), 'recorte.minX');
  const x1 = assertIntegerMm(roundToMm(Math.max(r.minX, r.maxX)), 'recorte.maxX');
  const y0 = assertIntegerMm(roundToMm(Math.min(r.minY, r.maxY)), 'recorte.minY');
  const y1 = assertIntegerMm(roundToMm(Math.max(r.minY, r.maxY)), 'recorte.maxY');
  return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
}

function retirarArcosDesfeitos(next: BlueprintModel, diff: Diff): void {
  for (const w of next.walls) {
    if (w.arco && !arcoConsistente(w)) {
      delete w.arco;
      if (!diff.updated.includes(w.id) && !diff.created.includes(w.id)) diff.updated.push(w.id);
    }
  }
}

/** O que uma instância nova pede — em `AddInstanciaDeGrupo` e nas iniciais de `AddGrupo`. */
export interface EspecificacaoDeInstancia {
  levelId?: ObjectId;
  translacao?: Point;
  rotacaoGraus?: RotacaoDoGrupo;
  espelho?: EspelhoDoGrupo;
  /** "Unidade tipo": as etiquetas copiadas já nascem numa unidade nova. */
  unidade?: { numero: string; tipologia?: string | null; pcd?: boolean };
}

function adicionarInstancia(next: BlueprintModel, diff: Diff, g: Grupo, spec: EspecificacaoDeInstancia, copiasAntes: ReadonlySet<ElementUid>): void {
  const levelId = spec.levelId ?? g.levelId;
  findLevel(next, levelId);
  const t = spec.translacao ?? { x: 0, y: 0 };
  const instancia: InstanciaDeGrupo = {
    uid: novoUid(),
    levelId,
    translacao: { x: assertIntegerMm(t.x, 'translacao.x'), y: assertIntegerMm(t.y, 'translacao.y') },
    rotacaoGraus: spec.rotacaoGraus ?? 0,
    espelho: spec.espelho ?? 'NENHUM',
  };
  if (instancia.rotacaoGraus === 0 && instancia.espelho === 'NENHUM' && instancia.translacao.x === 0 && instancia.translacao.y === 0 && levelId === g.levelId) {
    throw new KernelError('BAD_GROUP', 'A instância cairia exatamente sobre a origem: espelhe, gire ou desloque');
  }
  g.instancias.push(instancia);
  if (!diff.updated.includes(g.id)) diff.updated.push(g.id);
  // As cópias nascem AGORA (a sincronização é idempotente; a da cauda só confirma),
  // porque a unidade tipo precisa das etiquetas copiadas já existindo.
  sincronizarGrupos(next, diff, copiasAntes);
  if (spec.unidade) {
    const numero = spec.unidade.numero.trim();
    if (!numero || numero.length > MAX_NUMERO_DE_UNIDADE) throw new KernelError('BAD_UNIT', `Número da unidade vazio ou maior que ${MAX_NUMERO_DE_UNIDADE} caracteres`);
    if ((next.unidades ?? []).some((u) => u.numero === numero)) throw new KernelError('BAD_UNIT', `Já existe a unidade "${numero}"`);
    const etiquetasCopiadas = g.origem.labels.map((uid) => uidDaCopia(instancia.uid, uid)).filter((uid) => next.labels.some((l) => l.uid === uid));
    const id = nextId(next, 'und');
    next.unidades = next.unidades ?? [];
    next.unidades.push({ id, uid: novoUid(), numero, tipologia: tipologiaValida(spec.unidade.tipologia), pcd: spec.unidade.pcd ?? false, etiquetaUids: etiquetasCopiadas });
    diff.created.push(id);
  }
}

function findLabel(model: BlueprintModel, id: ObjectId): SpaceLabel {
  const l = model.labels.find((x) => x.id === id);
  if (!l) throw new KernelError('LABEL_NOT_FOUND', `Etiqueta inexistente: ${id}`);
  return l;
}

/** Tipologia aparada; vazia vira `null`. */
function tipologiaValida(t: string | null | undefined): string | null {
  const v = (t ?? '').trim();
  if (v.length > MAX_TIPOLOGIA_DE_UNIDADE) throw new KernelError('BAD_UNIT', `Tipologia maior que ${MAX_TIPOLOGIA_DE_UNIDADE} caracteres`);
  return v || null;
}

/**
 * Tira as etiquetas de qualquer OUTRA unidade que as tivesse (uma etiqueta,
 * uma unidade). `exceto` é a unidade que vai recebê-las — não é tocada.
 */
function transferirEtiquetas(model: BlueprintModel, uids: ElementUid[], exceto: ObjectId | null, diff: Diff): void {
  const conjunto = new Set(uids);
  for (const u of model.unidades ?? []) {
    if (u.id === exceto) continue;
    const antes = u.etiquetaUids.length;
    u.etiquetaUids = u.etiquetaUids.filter((x) => !conjunto.has(x));
    if (u.etiquetaUids.length !== antes) diff.updated.push(u.id);
  }
}

/** Aplica UM comando. O hash sai daqui porque quem pede um comando só o usa. */
/**
 * Copia as medidas declaradas do comando para a peça.
 *
 * ⚠️ Três estados, e os três importam: **ausente** não mexe (é o `SetProps` que
 * só quer trocar o nome), **`null`** volta ao padrão da família, e um **número**
 * declara. Tratar `null` como "não mexe" tiraria do usuário o único jeito de
 * desfazer uma medida errada sem apagar a peça.
 *
 * A validação fica em `assertModelInvariants`, que roda em todo `applyCommand` —
 * repeti-la aqui criaria duas verdades sobre o que é medida válida.
 */
interface MedidasEditaveis {
  larguraMm?: number | null;
  alturaMm?: number | null;
  profundidadeMm?: number | null;
  rotacaoGraus?: number | null;
}

function aplicarMedidas(peca: MedidasEditaveis, command: MedidasEditaveis): void {
  for (const campo of ['larguraMm', 'alturaMm', 'profundidadeMm'] as const) {
    const v = command[campo];
    if (v === undefined) continue;
    peca[campo] = v == null ? null : assertIntegerMm(roundToMm(v), campo);
  }
  if (command.rotacaoGraus !== undefined) {
    // ⚠️ NORMALIZA para 0–359 antes de gravar. `-90` e `270` descrevem a mesma
    // peça, e `360` e `0` também: guardados como vieram, dariam hashes
    // diferentes para desenhos idênticos. O `+ 360` extra existe porque o `%`
    // do JavaScript devolve resto NEGATIVO para entrada negativa.
    const g = command.rotacaoGraus;
    peca.rotacaoGraus = g == null ? null : ((Math.round(g) % 360) + 360) % 360;
  }
}

/**
 * O trecho sem os circuitos apagados: os que sobram ficam; sem nenhum, `null`.
 * Antes o eletroduto perdia "o" circuito; agora perde só os que se foram — o
 * tronco compartilhado continua alimentando os outros.
 */
function semCircuitos(t: Trecho, apagados: ReadonlySet<ObjectId>): Trecho {
  const ids = t.circuitoIds ?? [];
  if (!ids.some((id) => apagados.has(id))) return t;
  const restantes = ids.filter((id) => !apagados.has(id));
  return { ...t, circuitoIds: restantes.length > 0 ? restantes : null };
}

export function applyCommand(model: BlueprintModel, command: Command): CommandResult {
  const r = aplicarSemHash(model, command);
  return { ...r, hash: snapshotHash(r.model) };
}

/**
 * Histórico com undo/redo.
 *
 * Guarda estados inteiros, não comandos inversos. Para um spike isso é o certo:
 * comando inverso exige uma prova de que cada operação é reversível, e é
 * exatamente essa prova que o caso 23 quer testar sem circularidade.
 */
export class ModelHistory {
  private readonly states: BlueprintModel[] = [];
  private cursor = -1;
  private readonly applied = new Map<string, string>();

  constructor(initial: BlueprintModel) {
    this.states.push(cloneModel(initial));
    this.cursor = 0;
  }

  get current(): BlueprintModel {
    return this.states[this.cursor];
  }

  get hash(): string {
    return snapshotHash(this.current);
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.states.length - 1;
  }

  /**
   * Aplica um comando. `commandId` repetido devolve o hash já conhecido sem
   * reaplicar — idempotência do PRD §12.3.
   */
  apply(command: Command, commandId?: string): CommandResult {
    if (commandId && this.applied.has(commandId)) {
      return { model: this.current, diff: emptyDiff(), hash: this.applied.get(commandId)! };
    }

    const result = applyCommand(this.current, command);

    // Um novo comando descarta o ramo de redo.
    this.states.splice(this.cursor + 1);
    this.states.push(result.model);
    this.cursor = this.states.length - 1;

    if (commandId) this.applied.set(commandId, result.hash);
    return result;
  }

  /**
   * Aplica vários comandos como UM passo do histórico.
   *
   * Existe porque um gesto do usuário pode precisar de mais de um comando para
   * deixar o modelo coerente: desenhar um trecho encadeado pela face cria a
   * parede nova E corrige a ponta da anterior para o canto mitrado. Aplicados
   * separadamente, um "desfazer" desfaria só metade do gesto e deixaria o canto
   * pela metade — estado que o usuário nunca pediu e não sabe nomear.
   *
   * Aborta inteiro no primeiro erro (`applyBatch`), então o histórico nunca
   * recebe um lote parcial.
   */
  applyMany(commands: Command[]): CommandResult {
    const result = applyBatch(this.current, commands);

    this.states.splice(this.cursor + 1);
    this.states.push(result.model);
    this.cursor = this.states.length - 1;
    return result;
  }

  undo(): BlueprintModel {
    if (!this.canUndo) throw new KernelError('NOTHING_TO_UNDO', 'Nada a desfazer');
    this.cursor -= 1;
    return this.current;
  }

  redo(): BlueprintModel {
    if (!this.canRedo) throw new KernelError('NOTHING_TO_REDO', 'Nada a refazer');
    this.cursor += 1;
    return this.current;
  }
}

/** Aplica um lote na ordem dada, abortando inteiro no primeiro erro. */
export function applyBatch(model: BlueprintModel, commands: Command[]): CommandResult {
  let current = model;
  const merged = emptyDiff();

  for (const command of commands) {
    // SEM hash por comando — ver `aplicarSemHash`. O do lote sai uma vez, no
    // fim, que é o único que alguém lê.
    const result = aplicarSemHash(current, command);
    current = result.model;
    merged.created.push(...result.diff.created);
    merged.updated.push(...result.diff.updated);
    merged.deleted.push(...result.diff.deleted);
    Object.assign(merged.ancestry, result.diff.ancestry);
  }

  return { model: current, diff: merged, hash: snapshotHash(current) };
}


// ─── PAVIMENTO TIPO (E2.1) ───────────────────────────────────────────────────

const FAMILIAS_SINCRONIZADAS = ['wall', 'opening', 'structural', 'roof', 'label'] as const;

// `uidDaCopia` mora em `model.ts` desde a E2.3: grupos e pavimento tipo usam a mesma função.

/**
 * Recusa comandos que editam ARQUITETURA/ESTRUTURA de um pavimento vinculado:
 * a edição seria desfeita pela sincronização na cauda, e "não aconteceu nada"
 * é pior que uma mensagem. Instalações, pavimentos, eixos e restrições passam.
 */
/**
 * O que um comando de EDIÇÃO toca, por família de id — a base das duas recusas
 * (pavimento cópia, E2.1; instância de grupo, E2.3). Comando fora da lista não
 * toca peça nenhuma (pavimentos, eixos, unidades…).
 */
function alvosDoComando(command: Command): { levelIds: string[]; wallIds: string[]; openingIds: string[]; structuralIds: string[]; aguaIds: string[]; labelIds: string[]; spaceIds: string[] } {
  const c = command as Record<string, unknown> & { type: string };
  const a = { levelIds: [] as string[], wallIds: [] as string[], openingIds: [] as string[], structuralIds: [] as string[], aguaIds: [] as string[], labelIds: [] as string[], spaceIds: [] as string[] };
  const str = (v: unknown) => (typeof v === 'string' ? [v] : []);
  const lista = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  switch (c.type) {
    case 'AddWall':
    case 'AddCurvedWall':
    case 'AddStructural':
    case 'AddAgua':
    case 'AddRoofByExtrusion':
    case 'DuplicateEntities':
      a.levelIds = str(c.levelId);
      break;
    case 'AddOpening':
      a.wallIds = str(c.wallId);
      break;
    case 'MoveVertex':
    case 'SetThickness':
    case 'SetWallLayers':
    case 'SplitWall':
    case 'DeleteWall':
    case 'SetCedeSobreposicao':
    case 'CutWallAtStructural':
      a.wallIds = str(c.wallId);
      break;
    case 'MergeWalls':
      a.wallIds = [...str(c.firstId), ...str(c.secondId)];
      break;
    case 'MoveOpening':
    case 'FlipOpening':
    case 'SetOpeningSize':
    case 'SetOpeningKind':
    case 'SetOpeningEsquadria':
    case 'DeleteOpening':
      a.openingIds = str(c.openingId);
      break;
    case 'SetStructuralProps':
    case 'SetStructuralKind':
    case 'MoveStructuralVertex':
    case 'DeleteStructural':
      a.structuralIds = str(c.structuralId);
      break;
    case 'SetAguaProps':
    case 'MoveAguaVertex':
    case 'DeleteAgua':
      a.aguaIds = str(c.aguaId);
      break;
    case 'NameSpace':
      a.spaceIds = str(c.spaceId);
      break;
    case 'SetSpaceLabelProps':
      a.labelIds = str(c.labelId);
      break;
    case 'TranslateEntities':
    case 'MirrorEntities':
    case 'RotateEntities':
      a.wallIds = lista(c.wallIds);
      a.structuralIds = lista(c.structuralIds);
      a.aguaIds = lista(c.aguaIds);
      break;
    case 'SetParametros': {
      const f = c.familia as string;
      if (f === 'wall') a.wallIds = str(c.id);
      else if (f === 'opening') a.openingIds = str(c.id);
      else if (f === 'structural') a.structuralIds = str(c.id);
      else if (f === 'roof') a.aguaIds = str(c.id);
      break;
    }
    default:
      break;
  }
  return a;
}

function recusarEdicaoEmPavimentoVinculado(model: BlueprintModel, command: Command): void {
  const vinculados = new Map(model.levels.filter((l) => l.tipoDeId !== undefined).map((l) => [l.id, l]));
  if (vinculados.size === 0) return;
  const al = alvosDoComando(command);
  const nivelDe = (levelId: string | undefined): Level | null => (levelId && vinculados.get(levelId)) || null;
  const daParede = (id: string) => nivelDe(model.walls.find((w) => w.id === id)?.levelId);
  const candidatos: (Level | null)[] = [
    ...al.levelIds.map(nivelDe),
    ...al.wallIds.map(daParede),
    ...al.openingIds.map((id) => daParede(model.openings.find((o) => o.id === id)?.wallId ?? '')),
    ...al.structuralIds.map((id) => nivelDe(model.structures.find((s) => s.id === id)?.levelId)),
    ...al.aguaIds.map((id) => nivelDe((model.roofs ?? []).find((r) => r.id === id)?.levelId)),
    ...al.labelIds.map((id) => nivelDe((model.labels ?? []).find((l) => l.id === id)?.levelId)),
    ...al.spaceIds.map((id) => nivelDe(model.spaces.find((x) => x.id === id)?.levelId)),
  ];
  const alvo = candidatos.find((x) => x !== null) ?? null;
  if (alvo) {
    const tipo = model.levels.find((l) => l.id === alvo.tipoDeId);
    throw new KernelError(
      'LEVEL_LINKED',
      `"${alvo.name}" é cópia do pavimento tipo "${tipo?.name ?? alvo.tipoDeId}": edite o tipo (a edição propaga) ou desvincule o pavimento`,
    );
  }
}

/** Cópia de instância de grupo não se edita: edita-se a origem (propaga) ou desagrupa-se. */
function recusarEdicaoEmInstanciaDeGrupo(model: BlueprintModel, command: Command): void {
  if (!(model.grupos ?? []).some((g) => g.instancias.length > 0)) return;
  const copias = copiasDeInstancia(model);
  const al = alvosDoComando(command);
  const uids: (ElementUid | undefined)[] = [
    ...al.wallIds.map((id) => model.walls.find((w) => w.id === id)?.uid),
    ...al.openingIds.map((id) => model.openings.find((o) => o.id === id)?.uid),
    ...al.structuralIds.map((id) => model.structures.find((s) => s.id === id)?.uid),
    ...al.labelIds.map((id) => (model.labels ?? []).find((l) => l.id === id)?.uid),
    ...al.spaceIds.map((id) => model.spaces.find((x) => x.id === id)?.labelUid),
  ];
  for (const uid of uids) {
    const dono = uid ? copias.get(uid) : undefined;
    if (dono) {
      throw new KernelError('GROUP_INSTANCE', `É instância do grupo "${dono.grupo.nome}": edite a origem (a edição propaga) ou desagrupe`);
    }
  }
}

/**
 * Re-deriva as cópias de cada instância de grupo a partir da origem, com a
 * transformação da instância. Mesma reconciliação do pavimento tipo: uid
 * determinístico por (instância, peça), cópia existente ATUALIZADA com o
 * mesmo id, nova nasce, órfã some. Idempotente.
 */
export function sincronizarGrupos(next: BlueprintModel, diff: Diff, copiasAntes: ReadonlySet<ElementUid>): void {
  const grupos = next.grupos ?? [];
  if (grupos.length === 0) return;
  const tocar = (lista: ObjectId[], id: ObjectId) => {
    if (!lista.includes(id)) lista.push(id);
  };
  // Cópias que DEVEM existir ao fim; toda cópia de grupo fora deste conjunto some.
  const esperadas = new Set<ElementUid>();
  const paredePorUid = new Map(next.walls.map((w) => [w.uid, w]));
  const estruturaPorUid = new Map(next.structures.map((s) => [s.uid, s]));
  const etiquetaPorUid = new Map((next.labels ?? []).map((l) => [l.uid, l]));
  for (const g of grupos) {
    const paredesDaOrigem = g.origem.walls.map((u) => paredePorUid.get(u)).filter((w): w is Wall => !!w);
    const idsDeParedeDaOrigem = new Set(paredesDaOrigem.map((w) => w.id));
    const aberturasDaOrigem = next.openings.filter((o) => idsDeParedeDaOrigem.has(o.wallId));
    const estruturasDaOrigem = g.origem.structures.map((u) => estruturaPorUid.get(u)).filter((s): s is Structural => !!s);
    const etiquetasDaOrigem = g.origem.labels.map((u) => etiquetaPorUid.get(u)).filter((l): l is SpaceLabel => !!l);
    for (const i of g.instancias) {
      const T = (p: Point) => transformarPontoDoGrupo(g, i, p);
      const espelhada = i.espelho !== 'NENHUM';
      const dePara = new Map<ObjectId, ObjectId>();
      // paredes
      for (const w of paredesDaOrigem) {
        const uid = uidDaCopia(i.uid, w.uid);
        esperadas.add(uid);
        const campos = {
          levelId: i.levelId,
          a: T(w.a),
          b: T(w.b),
          thicknessMm: w.thicknessMm,
          heightMm: w.heightMm,
          ...(w.alinhamento ? { alinhamento: w.alinhamento } : {}),
          ...(w.cedeSobreposicao ? { cedeSobreposicao: true } : {}),
          ...(w.fase ? { fase: w.fase } : {}),
          ...(w.camadas ? { camadas: clonarCamadas(w.camadas)! } : {}),
          ...(w.parametros ? { parametros: { ...w.parametros } } : {}),
          // PAREDE CURVA: a instância leva o centro transformado; espelho e giro
          // preservam o raio.
          ...(w.arco ? { arco: { centro: T(w.arco.centro), raioMm: w.arco.raioMm } } : {}),
          ...(w.cortina ? { cortina: { ...w.cortina } } : {}),
          ...(w.brise ? { brise: { ...w.brise } } : {}),
        };
        const existente = paredePorUid.get(uid);
        if (existente) {
          for (const k of ['alinhamento', 'cedeSobreposicao', 'fase', 'camadas', 'parametros', 'arco', 'cortina', 'brise'] as const) if (!(k in campos)) delete existente[k];
          Object.assign(existente, campos);
          dePara.set(w.id, existente.id);
          tocar(diff.updated, existente.id);
        } else {
          const id = nextId(next, 'wal');
          const nova: Wall = { id, uid, ...campos };
          next.walls.push(nova);
          paredePorUid.set(uid, nova);
          dePara.set(w.id, id);
          tocar(diff.created, id);
        }
      }
      // aberturas: offset conta da ponta `a`, que é a imagem de `a`; o lado de abrir troca no espelho.
      for (const o of aberturasDaOrigem) {
        const uid = uidDaCopia(i.uid, o.uid);
        esperadas.add(uid);
        const { id: _id, uid: _uid, wallId: _w, ...resto } = o;
        const campos = {
          ...resto,
          wallId: dePara.get(o.wallId)!,
          swingReversed: espelhada ? !o.swingReversed : o.swingReversed,
          ...(o.esquadria ? { esquadria: { ...o.esquadria } } : {}),
          ...(o.parametros ? { parametros: { ...o.parametros } } : {}),
        };
        const existente = next.openings.find((x) => x.uid === uid);
        if (existente) {
          Object.assign(existente, campos);
          if (!o.esquadria) delete existente.esquadria;
          if (!o.parametros) delete existente.parametros;
          tocar(diff.updated, existente.id);
        } else {
          const id = nextId(next, 'opn');
          next.openings.push({ id, uid, ...campos });
          tocar(diff.created, id);
        }
      }
      // estrutura
      for (const s of estruturasDaOrigem) {
        const uid = uidDaCopia(i.uid, s.uid);
        esperadas.add(uid);
        const { id: _i, uid: _u, levelId: _l, ...resto } = s;
        const campos = { ...resto, levelId: i.levelId, pontos: s.pontos.map(T), rotacaoDeg: giroTransformadoDoGrupo(i, s.rotacaoDeg), ...(s.parametros ? { parametros: { ...s.parametros } } : {}) };
        const existente = estruturaPorUid.get(uid);
        if (existente) {
          for (const k of Object.keys(existente)) if (!['id', 'uid'].includes(k) && !(k in campos)) delete (existente as unknown as Record<string, unknown>)[k];
          Object.assign(existente, campos);
          tocar(diff.updated, existente.id);
        } else {
          const id = nextId(next, 'str');
          const nova = { id, uid, ...campos } as Structural;
          next.structures.push(nova);
          estruturaPorUid.set(uid, nova);
          tocar(diff.created, id);
        }
      }
      // etiquetas
      for (const l of etiquetasDaOrigem) {
        const uid = uidDaCopia(i.uid, l.uid);
        esperadas.add(uid);
        const campos = { levelId: i.levelId, at: T(l.at), name: l.name, tipoDeAmbiente: l.tipoDeAmbiente ?? null };
        const existente = etiquetaPorUid.get(uid);
        if (existente) {
          Object.assign(existente, campos);
          tocar(diff.updated, existente.id);
        } else {
          const id = nextId(next, 'lbl');
          const nova: SpaceLabel = { id, uid, ...campos };
          next.labels.push(nova);
          etiquetaPorUid.set(uid, nova);
          tocar(diff.created, id);
        }
      }
    }
  }
  // Órfãs: cópia que existia ANTES do comando (uid derivado de uma instância) e não é mais esperada.
  apagarCopiasNaoEsperadas(next, diff, copiasAntes, esperadas);
}

/**
 * Apaga as cópias de instância que existiam antes do comando (`conhecidas`,
 * levantadas em `aplicarSemHash` antes de aplicar) e não são mais esperadas.
 * Uma cópia só é reconhecível pelo uid da instância que a gerou — por isso o
 * levantamento é ANTES: depois de `DeleteGrupo` ninguém mais sabe.
 */
function apagarCopiasNaoEsperadas(next: BlueprintModel, diff: Diff, conhecidas: ReadonlySet<ElementUid>, esperadas: Set<ElementUid>): void {
  const tocar = (lista: ObjectId[], id: ObjectId) => {
    if (!lista.includes(id)) lista.push(id);
  };
  if (conhecidas.size === 0) return;
  const apagar = (uid: ElementUid) => conhecidas.has(uid) && !esperadas.has(uid);
  for (const w of next.walls.filter((x) => apagar(x.uid))) {
    next.walls = next.walls.filter((x) => x.id !== w.id);
    for (const o of next.openings.filter((o) => o.wallId === w.id)) tocar(diff.deleted, o.id);
    next.openings = next.openings.filter((o) => o.wallId !== w.id);
    tocar(diff.deleted, w.id);
  }
  for (const o of next.openings.filter((x) => apagar(x.uid))) {
    next.openings = next.openings.filter((x) => x.id !== o.id);
    tocar(diff.deleted, o.id);
  }
  for (const s of next.structures.filter((x) => apagar(x.uid))) {
    next.structures = next.structures.filter((x) => x.id !== s.id);
    tocar(diff.deleted, s.id);
  }
  for (const l of (next.labels ?? []).filter((x) => apagar(x.uid))) {
    next.labels = next.labels.filter((x) => x.id !== l.id);
    tocar(diff.deleted, l.id);
  }
}


/**
 * Re-deriva paredes, aberturas, estrutura, telhado e etiquetas de cada
 * pavimento vinculado a partir do tipo. Reconciliação por uid determinístico:
 * a cópia que já existe é ATUALIZADA (mesmo id — seleção e histórico não
 * pulam), a nova nasce, a órfã some. Idempotente: rodar duas vezes não muda
 * nada, e o payload canônico é o mesmo em qualquer ordem de comandos.
 */
export function sincronizarPavimentosVinculados(next: BlueprintModel, diff: Diff): void {
  const vinculados = next.levels.filter((l) => l.tipoDeId !== undefined);
  if (vinculados.length === 0) return;
  const tocar = (lista: ObjectId[], id: ObjectId) => {
    if (!lista.includes(id)) lista.push(id);
  };
  for (const nivel of vinculados) {
    const tipo = next.levels.find((l) => l.id === nivel.tipoDeId);
    if (!tipo) continue;
    // ── paredes ──
    const paredesDoTipo = next.walls.filter((w) => w.levelId === tipo.id);
    const paredesDaCopia = new Map(next.walls.filter((w) => w.levelId === nivel.id).map((w) => [w.uid, w]));
    const dePara = new Map<ObjectId, ObjectId>();
    const uidsEsperados = new Set<ElementUid>();
    for (const w of paredesDoTipo) {
      const uid = uidDaCopia(nivel.uid, w.uid);
      uidsEsperados.add(uid);
      const existente = paredesDaCopia.get(uid);
      const campos = {
        a: { ...w.a },
        b: { ...w.b },
        thicknessMm: w.thicknessMm,
        heightMm: w.heightMm,
        ...(w.alinhamento ? { alinhamento: w.alinhamento } : {}),
        ...(w.cedeSobreposicao ? { cedeSobreposicao: true } : {}),
        ...(w.camadas ? { camadas: clonarCamadas(w.camadas)! } : {}),
        ...(w.parametros ? { parametros: { ...w.parametros } } : {}),
        ...(w.arco ? { arco: { centro: { x: w.arco.centro.x, y: w.arco.centro.y }, raioMm: w.arco.raioMm } } : {}),
        ...(w.cortina ? { cortina: { ...w.cortina } } : {}),
        ...(w.brise ? { brise: { ...w.brise } } : {}),
      };
      if (existente) {
        Object.assign(existente, { ...campos, alinhamento: campos.alinhamento, cedeSobreposicao: campos.cedeSobreposicao, camadas: campos.camadas, parametros: campos.parametros, arco: campos.arco, cortina: campos.cortina, brise: campos.brise });
        for (const k of ['alinhamento', 'cedeSobreposicao', 'camadas', 'parametros', 'arco', 'cortina', 'brise'] as const) if (existente[k] === undefined) delete existente[k];
        dePara.set(w.id, existente.id);
        tocar(diff.updated, existente.id);
      } else {
        const id = nextId(next, 'wal');
        next.walls.push({ id, uid, levelId: nivel.id, ...campos });
        dePara.set(w.id, id);
        tocar(diff.created, id);
      }
    }
    for (const w of [...paredesDaCopia.values()]) {
      if (uidsEsperados.has(w.uid)) continue;
      next.walls = next.walls.filter((x) => x.id !== w.id);
      const orfas = next.openings.filter((o) => o.wallId === w.id).map((o) => o.id);
      next.openings = next.openings.filter((o) => o.wallId !== w.id);
      tocar(diff.deleted, w.id);
      for (const id of orfas) tocar(diff.deleted, id);
    }
    // ── aberturas ──
    const idsDeParedeDoTipo = new Set(paredesDoTipo.map((w) => w.id));
    const idsDeParedeDaCopia = new Set([...dePara.values()]);
    const aberturasDaCopia = new Map(next.openings.filter((o) => idsDeParedeDaCopia.has(o.wallId)).map((o) => [o.uid, o]));
    const uidsAbertura = new Set<ElementUid>();
    for (const o of next.openings.filter((x) => idsDeParedeDoTipo.has(x.wallId))) {
      const uid = uidDaCopia(nivel.uid, o.uid);
      uidsAbertura.add(uid);
      const { id: _id, uid: _uid, wallId: _w, ...resto } = o;
      const campos = { ...resto, wallId: dePara.get(o.wallId)!, ...(o.esquadria ? { esquadria: { ...o.esquadria } } : {}), ...(o.parametros ? { parametros: { ...o.parametros } } : {}) };
      const existente = aberturasDaCopia.get(uid);
      if (existente) {
        Object.assign(existente, campos);
        if (!o.esquadria) delete existente.esquadria;
        if (!o.parametros) delete existente.parametros;
        tocar(diff.updated, existente.id);
      } else {
        const id = nextId(next, 'opn');
        next.openings.push({ id, uid, ...campos });
        tocar(diff.created, id);
      }
    }
    for (const o of [...aberturasDaCopia.values()]) {
      if (uidsAbertura.has(o.uid)) continue;
      next.openings = next.openings.filter((x) => x.id !== o.id);
      tocar(diff.deleted, o.id);
    }
    // ── estrutura, telhado, etiquetas: mesma reconciliação, por família ──
    const sincronizarLista = <T extends { id: ObjectId; uid: ElementUid; levelId: ObjectId }>(
      lista: T[],
      prefixo: string,
      copiar: (src: T) => Omit<T, 'id' | 'uid' | 'levelId'>,
    ): T[] => {
      const doTipo = lista.filter((x) => x.levelId === tipo.id);
      const daCopia = new Map(lista.filter((x) => x.levelId === nivel.id).map((x) => [x.uid, x]));
      const esperados = new Set<ElementUid>();
      let saida = lista;
      for (const src of doTipo) {
        const uid = uidDaCopia(nivel.uid, src.uid);
        esperados.add(uid);
        const campos = copiar(src);
        const existente = daCopia.get(uid);
        if (existente) {
          for (const k of Object.keys(existente)) if (!['id', 'uid', 'levelId'].includes(k) && !(k in campos)) delete (existente as Record<string, unknown>)[k];
          Object.assign(existente, campos);
          tocar(diff.updated, existente.id);
        } else {
          const id = nextId(next, prefixo);
          saida = [...saida, { id, uid, levelId: nivel.id, ...campos } as T];
          tocar(diff.created, id);
        }
      }
      for (const x of [...daCopia.values()]) {
        if (esperados.has(x.uid)) continue;
        saida = saida.filter((y) => y.id !== x.id);
        tocar(diff.deleted, x.id);
      }
      return saida;
    };
    next.structures = sincronizarLista(next.structures, 'str', (s) => {
      const { id: _i, uid: _u, levelId: _l, ...resto } = s;
      return { ...resto, pontos: s.pontos.map((p) => ({ ...p })), ...(s.parametros ? { parametros: { ...s.parametros } } : {}) };
    });
    next.roofs = sincronizarLista(next.roofs ?? [], 'agu', (r) => {
      const { id: _i, uid: _u, levelId: _l, ...resto } = r;
      return { ...resto, pontos: r.pontos.map((p) => ({ ...p })), ...(r.parametros ? { parametros: { ...r.parametros } } : {}) };
    });
    next.labels = sincronizarLista(next.labels ?? [], 'lbl', (l) => {
      const { id: _i, uid: _u, levelId: _l, ...resto } = l;
      return { ...resto, at: { ...l.at } };
    });
  }
}
