import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Boxes,
  Cable,
  CircuitBoard,
  Calculator,
  FileText,
  FileUp,
  RectangleVertical,
  SquareStack,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  MoveRight,
  RotateCw,
  Link2,
  AlignStartVertical,
  LayoutGrid,
  History,
  KeyRound,
  Webhook,
  Users,
  Lock,
  Hammer,
  Landmark,
  Merge,
  MessageSquare,
  MessagesSquare,
  PenTool,
  Plug,
  Split,
  Table2,
  CheckCircle2,
  ClipboardPaste,
  Contrast,
  Copy,
  CopyPlus,
  Combine,
  CornerDownRight,
  DoorOpen,
  Building2,
  CarFront,
  Scale,
  ClipboardList,
  Footprints,
  Sun,
  Gauge,
  GitBranch,
  Wand2,
  Bot,
  Eye,
  EyeOff,
  FileDown,
  Activity,
  Waves,
  Grid2x2,
  Grid3x3,
  Hash,
  Hexagon,
  LandPlot,
  Layers,
  Fence,
  BookOpen,
  Type,
  MessageSquareText,
  Slash,
  Highlighter,
  Cloud,
  Crop,
  Trees, Route, TreePine, ListOrdered,
  TriangleRight,
  Grip,
  Hand,
  ShoppingCart,
  Wind,
  BookMarked,
  Sigma,
  Magnet,
  Blocks,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Move,
  Network,
  MoveDiagonal,
  MoveHorizontal,
  Mountain,
  PaintBucket,
  Palette,
  Pencil,
  Puzzle,
  Plus,
  RectangleHorizontal,
  Redo2,
  Ruler,
  Scan,
  Scissors,
  ShowerHead,
  Droplets,
  Spline,
  Square,
  Tag,
  Trash2,
  TrendingUp,
  Undo2,
  Upload,
  Waypoints,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import MenuExibir, { type ItemDeExibicao } from './MenuExibir';
import MenuEncaixe from './MenuEncaixe';
import { TIPOS_DE_ENCAIXE, ROTULO_DO_ENCAIXE } from '../../utils/blueprintEncaixe';
import { casasEmCm, cmParaMm, mmParaCm, textoEmCm } from '../../utils/blueprintMedidaCm';
import {
  alvosDeEncosto,
  encostoDaPonta,
  guardaCorposSoltos,
  pontosCorrigidos,
  MAX_ENCOSTO_MM,
} from '../../utils/blueprintGuardaCorpoEncosto';
import type { TipoDePontoEletrico, AcabamentosDoAmbiente, ObjectId, TipoDeAreaPublica, TipoDeLote } from '../../utils/blueprintKernel';
import { TIPOS_DE_AREA_PUBLICA, FICHA_DA_AREA_PUBLICA, TIPOS_DE_LOTE } from '../../utils/blueprintKernel';
import {
  numerarQuadra,
  centroide,
  medirLote,
  areasDoLoteamento,
  ROTULO_DO_PAPEL_DO_LADO,
  subdividirQuadra,
  conferirLoteamento,
  resumoDaConferencia,
  SUBDIVISAO_PADRAO,
  AREA_MINIMA_LEI_6766_M2,
  TESTADA_MINIMA_LEI_6766_MM,
  type ParametrosDaSubdivisao,
} from '../../utils/blueprintLoteamento';
import { blueprintEmpreendimentoSync } from '../../services/blueprintEmpreendimentoSync';
import { montarDocumentosDoLoteamento, previaDosDocumentos } from '../../services/blueprintLoteamentoDocsService';
import { pendenciasDosMemoriais } from '../../utils/blueprintMemorialLote';
import {
  MATERIAIS_DE_SUB_REGIAO,
  FICHA_DO_MATERIAL_DE_SUB_REGIAO,
  type MaterialDeSubRegiao,
  ehConjunto,
  filhosDoConjunto,
  paiDoComponente,
  CATALOGO_DE_COMPONENTES,
  aguasDaMesmaExtrusao,
  perfilDeCobertura,
  TIPOS_DE_PERFIL_DE_COBERTURA,
  ROTULO_DO_PERFIL_DE_COBERTURA,
  type ParametrosDoPerfil,
  type TipoDePerfilDeCobertura,
  segmentosDoMesmoArco, acabamentosDoAmbiente, pointInPolygon } from '../../utils/blueprintKernel';
import type { Quantitativos } from '../../utils/blueprintKernel/quantities';
import MenuComponentes, { type EscolhaComponente } from './MenuComponentes';
import ModalSobreposicao, { type EscolhaSobreposicao } from './ModalSobreposicao';
import PainelComponentes from './PainelComponentes';
import { linhasDeComponentesPorNivel } from '../../utils/blueprintComponentes';
import PainelParametros from './PainelParametros';
import { parametrosCalculadosDoModelo, variaveisDaPeca } from '../../utils/blueprintFormulas';
import { etiquetasDasAberturas, rotuloDeNivelDoPavimento } from '../../utils/blueprintNumeracao';
import { assinaturaDoTipo, camposDaEstrutura, camposDoTerminal, propriedadesDaEstrutura, propriedadesDoTerminal } from '../../utils/blueprintTipos';
import { AJUSTE_DA_VISTA, ehVistaDePlanta, idsOcultosNaVista, nivelDaVista } from '../../utils/blueprintVistasDePlanta';
import { forrosDoNivel, resumoDaPlantaDeForro } from '../../utils/blueprintPlantaDeForro';
import { quadroDeSubRegioes } from '../../utils/blueprintSubRegioes';
import PainelEstruturaSelecionada from './PainelEstruturaSelecionada';
import PainelTrechoSelecionado from './PainelTrechoSelecionado';
import PainelQuadroSelecionado from './PainelQuadroSelecionado';
import PainelConflitos from './PainelConflitos';
import { blueprintConflitoStatusService } from '../../services/blueprintConflitoStatusService';
import { classificarArq, classificarMep, contarStatus, indexarAceites, type AceiteDeConflito } from '../../utils/blueprintConflitoStatus';
import PainelEletrica from './PainelEletrica';
import PainelAguaSelecionada from './PainelAguaSelecionada';
import PainelEscadaSelecionada from './PainelEscadaSelecionada';
import PainelNucleoSelecionado from './PainelNucleoSelecionado';
import PainelSubRegiaoSelecionada from './PainelSubRegiaoSelecionada';
import PainelVagaSelecionada from './PainelVagaSelecionada';
import PainelComponenteSelecionado from './PainelComponenteSelecionado';
import SeletorDeTipo from './SeletorDeTipo';
import { camposDoComponente, propriedadesDoComponente, type PropriedadesDeComponente } from '../../utils/blueprintTipos';
import { comandosDeMobiliario } from '../../utils/blueprintMobiliario';
import PainelVagas from './PainelVagas';
import PainelLotear from './PainelLotear';
import PainelConferenciaDoLoteamento from './PainelConferenciaDoLoteamento';
import { comandosDeAceite as aceitarVagas, comandosDeLimpeza as limparVagas, HIPOTESES_VAGAS_PADRAO, planejarVagas, type HipotesesDeVagas, type RegiaoDeVagas } from '../../utils/blueprintVagasAutomaticas';
import { nucleosDoNivel } from '../../utils/blueprintNucleoVertical';
import PainelEsquadria from './PainelEsquadria';
import PainelEsquadrias from './PainelEsquadrias';
import { comandosDaUnificacao, unificacoesPropostas, TOLERANCIA_PADRAO_MM } from '../../utils/blueprintUnificarEsquadrias';
import { medidasNaDescricao } from '../../utils/blueprintItemPorMedida';
import { sinapiService } from '../../services/sinapiService';
import { comandosDeJuntarParalelas, juncoesParalelasProximas, LATERAL_MAXIMA_MM } from '../../utils/blueprintJuntarParalelas';
import PainelRevisaoDePontas from './PainelRevisaoDePontas';
import { chaveDaPonta, pontasParaRevisar, type PontaEmRevisao } from '../../utils/blueprintRevisaoDePontas';
import { comandoDeEstender, extensoesDaParede } from '../../utils/blueprintEstenderAteFace';
import PainelImportarIfc from './PainelImportarIfc';
import PainelImportarDxf from './PainelImportarDxf';
import PainelImportarBcf from './PainelImportarBcf';
import PainelComentarios from './PainelComentarios';
import { listarComentarios } from '../../services/blueprintCommentService';
import { artefatoDeTabelaXlsx, baixarArtefatos, exportarBcf } from '../../services/blueprintExportService';
import { blueprintTabelaService } from '../../services/blueprintTabelaService';
import TelaTabelas from './TelaTabelas';
import type { DefinicaoDeTabela, TabelaSalva } from '../../utils/blueprintTabelas';
import { topicosDeComentarios, topicosDeConflitos, topicosDeConflitosArquitetonicos } from '../../utils/blueprintBcf';
import { ESCALAS, PAPEIS } from '../../utils/blueprintExport';
import { useStore } from '../../store/useStore';
import { posicoesPorUid } from '../../utils/blueprintComentarios';
import {
  listOpeningTypes,
  type TipoDeEsquadria,
} from '../../services/blueprintOpeningTypeService';
import PainelCorteSelecionado from './PainelCorteSelecionado';
import PainelEixoSelecionado from './PainelEixoSelecionado';
import PainelRestricoes from './PainelRestricoes';
import FichaDoElemento from './FichaDoElemento';
import { fichaDoElemento } from '../../utils/blueprintFicha';
import { deleteParameterDefinition, listParameterDefinitions, updateParameterDefinition, type DefinicaoDeParametro } from '../../services/blueprintParameterDefinitionService';
import { camposDaEscada, camposDoTelhado, propriedadesDaEscada, propriedadesDoTelhado } from '../../utils/blueprintTipos';
import { conferirRestricoes, violacoes } from '../../utils/blueprintRestricoes';
import { conferirLote, ordinalDoPavimento, recuosEfetivos } from '../../utils/blueprintZonaUrbanistica';
import { envelopePorPavimentoParaRegras, envelopeVertical } from '../../utils/blueprintEnvelope3d';
import { contornosParaTelhado } from '../../utils/blueprintTelhadoContorno';
import { useBlueprintEditor, type BlueprintTool } from '../../hooks/useBlueprintEditor';
import BlueprintCanvas, { rotuloPasso, type AjustePonta, type AcaoDeNavegacao } from './BlueprintCanvas';
import ElevationCanvas from './ElevationCanvas';
import Blueprint3DTab from './Blueprint3DTab';
import PainelPavimentos from './PainelPavimentos';
import SeletorDeVista, {
  dependenteDaVista,
  type VistaBlueprint,
  VISTAS_FIXAS,
  DIRECAO_DA_VISTA,
  ehVistaDeElevacao,
  ehVistaDeProjecao,
  corteDaVista,
} from './SeletorDeVista';
import PainelOrcamento from './PainelOrcamento';
import { custoPorElemento } from '../../utils/blueprintBudget';
import { COR_DO_STATUS, situacaoPorElemento } from '../../utils/blueprint4d';
import ReguaDoTempo from './ReguaDoTempo';
import type { PreviaOrcamento } from '../../services/blueprintBudgetService';
import PainelVersoes from './PainelVersoes';
import ControlesDeFundo, { ResumoDaAfericao } from './ControlesDeFundo';
import Ribbon, { BarraDeOpcoes, BotaoDoRibbon, GrupoDoRibbon, MenuDoRibbon, abaEfetiva } from './Ribbon';
import DockDeRelatorios, { useAlturaDoDock } from './DockDeRelatorios';
import PainelDeTarefa from './PainelDeTarefa';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import {
  aplicarPotenciaPadrao,
  comandosDePotenciaPadrao,
  contextoDoAmbiente,
  potenciaPadraoVA,
  conjuntoMolhadoPassaDeSeis,
} from '../../utils/blueprintPotenciaPadrao';
import {
  BITOLAS_DE_ELETRODUTO_MM,
  HIPOTESES_ELETRODUTO_PADRAO,
  ROTAS_MAXIMAS,
  eletrodutosSugeridos,
  planejarEletrodutosDoModelo,
  refazerEletrodutos,
  relancarEletrodutos,
  pontosSemCircuito,
  type PlanoDeEletrodutos,
} from '../../utils/blueprintEletrodutos';
import {
  CRITERIOS_DE_CIRCUITO,
  HIPOTESES_CIRCUITOS_PADRAO,
  ROTULO_DA_FUNCAO,
  ROTULO_DO_CRITERIO_DE_CIRCUITO,
  conferirPlano,
  planejarCircuitos,
  pontosElegiveis,
  quadrosDoNivel,
  pavimentoDoQuadro,
  type HipotesesDeCircuitos,
} from '../../utils/blueprintCircuitosAutomaticos';
import {
  HIPOTESES_PILARES_PADRAO,
  ROTULO_DO_ONDE,
  SECOES_SUGERIDAS,
  VAOS_MAXIMOS,
  conferirPlanoDePilares,
  pilaresExistentesNoNivel,
  planejarPilares,
  relancarPilares,
  type HipotesesDePilares,
  type PecaPrevista,
  type SecaoSugeridaId,
  cruzamentosDeEixos,
} from '../../utils/blueprintPilaresAutomaticos';
import {
  ALTURAS_MINIMAS_DE_VIGA,
  DIVISORES_DA_ALTURA,
  ESPESSURAS_DE_LAJE,
  HIPOTESES_LAJES_PADRAO,
  HIPOTESES_VIGAS_PADRAO,
  conferirPlanoDeLajes,
  conferirPlanoDeVigas,
  lajesExistentesNoNivel,
  planejarLajes,
  planejarVigas,
  relancarLajes,
  relancarVigas,
  vigasExistentesNoNivel,
  type HipotesesDeLajes,
  type HipotesesDeVigas,
} from '../../utils/blueprintVigasLajesAutomaticas';
import {
  ALTURAS_DE_BALDRAME,
  ALTURAS_DE_BLOCO,
  ARRASAMENTOS,
  COMPRIMENTOS_DE_ESTACA,
  POSICOES_DA_BALDRAME,
  ROTULO_DA_POSICAO_DA_BALDRAME,
  nomeDoArranjo,
  DIAMETROS_DE_ESTACA,
  ESTACAS_POR_BLOCO,
  HIPOTESES_FUNDACOES_PADRAO,
  conferirPlanoDeFundacoes,
  fundacoesExistentesNoNivel,
  planejarFundacoes,
  relancarFundacoes,
  type HipotesesDeFundacoes,
} from '../../utils/blueprintFundacoesAutomaticas';
import SecaoAccordion from './SecaoAccordion';
import SecaoOrdenavel from './SecaoOrdenavel';
import AcessoRapido, { type GrupoDoAcessoRapido } from './AcessoRapido';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { usePainelRedimensionavel } from './LarguraDoPainel';
import PainelMedicoes from './PainelMedicoes';
import PainelUnifilar from './PainelUnifilar';
import PainelParedeSelecionada from './PainelParedeSelecionada';
import PainelCamadasParede from './PainelCamadasParede';
import PainelSelecaoMultipla from './PainelSelecaoMultipla';
import PainelGrupoDeFundacao from './PainelGrupoDeFundacao';
import { grupoDaSelecao, grupoDeFundacao, idsDoGrupo, planejarEstacasDoBloco } from '../../utils/blueprintGrupoDeFundacao';
import PainelGerarParedes from './PainelGerarParedes';
import PainelTerreno from './PainelTerreno';
import PainelZonaUrbanistica from './PainelZonaUrbanistica';
import PainelTopografia from './PainelTopografia';
import QuadroDeDivisas from './QuadroDeDivisas';
import { useConfirm } from '../ui/confirm';
import { usePersistedState } from '../ui/TableUtils';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg } from '../../hooks/useOrgContext';
import { useBlueprintMateriais } from '../../hooks/useBlueprintMateriais';
import TelaMateriais from './TelaMateriais';
import TelaChavesDeApi from './TelaChavesDeApi';
import TelaCompras from './TelaCompras';
import TelaCatalogoDeTipos from './TelaCatalogoDeTipos';
import TelaParametros, { usosPorChave } from './TelaParametros';
import { deleteElementType, listAllElementTypes, renameElementType, setElementTypeActive, upsertElementTypes, type TipoDeElemento } from '../../services/blueprintElementTypeService';
import { usosPorAssinatura } from '../../utils/blueprintCatalogoDeTipos';
import { abrirCotacao, lancarNoPlano, nomeDaObra, preverCompras, type PreviaDeCompras } from '../../services/blueprintComprasService';
import { somarDias } from '../../utils/blueprintCompras';
import TelaWebhooks from './TelaWebhooks';
import TelaPlugins from './TelaPlugins';
import PainelPlugin from './PainelPlugin';
import { blueprintPluginService } from '../../services/blueprintPluginService';
import type { PluginDaPlanta } from '../../utils/blueprintPlugins';
import TelaAcessoDoEstudo from './TelaAcessoDoEstudo';
import TelaTravas from './TelaTravas';
import { blueprintTravaService } from '../../services/blueprintTravaService';
import { bloqueioDasTravas, idsTravados, type TravaExplicita } from '../../utils/blueprintColaboracao';
import TelaAntesDepois from './TelaAntesDepois';
import { contagemPorFase, faseDaSelecao, fasePorId, idsOcultosPelaFase, type FiltroDeFase } from '../../utils/blueprintFases';
import { useBlueprintColaboracao, type UsoDaColaboracao } from '../../hooks/useBlueprintColaboracao';
import { blueprintStudyPermissionService, type PermissaoGravada } from '../../services/blueprintStudyPermissionService';
import { iniciais, papelNoEstudo, travaDoComando } from '../../utils/blueprintColaboracao';
import { supabase } from '../../lib/supabase';
import { blueprintWebhookService, type EntregaDeWebhook, type Webhook as WebhookDaOrg } from '../../services/blueprintWebhookService';
import { blueprintApiTokenService, urlBaseDaApi, type TokenDaApi } from '../../services/blueprintApiTokenService';
import type { UsoDeMaterial } from '../../utils/blueprintMateriais';
import { empreendimentoService } from '../../services/empreendimentoService';
import type { Empreendimento } from '../../types/empreendimento';
import {
  areaEmM2,
  calcularAproveitamento,
  divergente,
  envelopeConstrutivo,
  faixasRestritas,
  linhasDoQuadro,
  medidasPorPapel,
  medirTerreno,
  papeisSugeridos,
  ROTULO_DO_PAPEL,
} from '../../utils/blueprintTerreno';
import {
  comandoDeColagem,
  copiarSelecao,
  type AreaDeTransferencia,
  type DestinoDeColagem,
} from '../../utils/blueprintAreaDeTransferencia';
import {
  comandoDeDuplicacao,
  comandoDeEspelhamento,
  comandoDeRotacao,
  comandosDeAlinhamento,
  comandosDeMatriz,
  idsParaIsolar,
  type ParametrosDaMatriz,
} from '../../utils/blueprintSelecao';
import type { PranchaExport } from '../../services/blueprintExportService';
import { useBlueprintMedicoes } from '../../hooks/useBlueprintMedicoes';
import { useBlueprintZonaUrbanistica } from '../../hooks/useBlueprintZonaUrbanistica';
import { useBlueprintTopografia } from '../../hooks/useBlueprintTopografia';
import { amostradorDaGrade, amostradorDoChao, malhaDaGrade } from '../../utils/blueprintTopografia';
import {
  comprimentoDaCurvaM,
  cotaDeEquilibrio,
  declividadeDaGrade,
  estatisticasDoPerfil,
  corArcoIrisDaCota,
  hipsometriaDaGrade,
  analisarDrenagem,
  canaletasDoPlato,
  cotaDeProjeto,
  type AnaliseDaDrenagem,
  perfilAoLongo,
  terraplenagemComTalude,
} from '../../utils/blueprintTopografiaAnalises';
import {
  csvDoPerfil,
  nomeDoArquivoDeTopografia,
  svgDoPerfil,
} from '../../utils/blueprintTopografiaExport';
import { novoIdDeDrenagem, useBlueprintTerraplenagem } from '../../hooks/useBlueprintTerraplenagem';
import { useBlueprintProjetoExecutivo } from '../../hooks/useBlueprintProjetoExecutivo';
import {
  EXECUTIVO_PADRAO,
  hashDaBaseExecutiva,
  memorialExecutivo,
  verificacoesExecutivas,
  type EmissaoExecutiva,
} from '../../utils/blueprintTopografiaExecutivo';
import { blueprintSnapshotTopografiaService } from '../../services/blueprintSnapshotTopografiaService';
import { linhasDeDrenagem3d, murosDeArrimo3d, type ExtrasDoRelevo3d } from '../../utils/blueprintTopografia3dExtras';
import {
  areasDeContribuicao,
  dimensionarDrenagem,
  dimensionarMuro,
  type DimensionamentoHidraulico,
} from '../../utils/blueprintTopografiaDimensionamento';
import type { TerrenoParaCorte } from '../../utils/blueprintCorte';
import { useBlueprintUnderlay } from '../../hooks/useBlueprintUnderlay';
import type { PontoPx } from '../../utils/blueprintUnderlay';
import type { ParedeGerada, PortaGerada } from '../../utils/blueprintVetor';
import { extrairSegmentosPdf } from '../../services/blueprintUnderlayService';
import type { BlueprintBranch, BlueprintQuantitySnapshot, BlueprintStudy } from '../../types/blueprint';
import {
  computeAndStoreQuantities,
  createAlternative,
  deleteBranch,
  getQuantitySnapshot,
  listBranches,
  listSnapshots,
  loadBranchModel,
  renameBranch,
  setPrincipalBranch,
  tarefasDoCronograma,
} from '../../services/blueprintService';
import TelaAlternativas from './TelaAlternativas';
import TelaGerador from './TelaGerador';
import PainelMobiliario from './PainelMobiliario';
import PainelAcabamentos, { type AmbienteComAcabamento } from './PainelAcabamentos';
import PainelGuardaCorpoSelecionado from './PainelGuardaCorpoSelecionado';
import PainelAnotacaoSelecionada from './PainelAnotacaoSelecionada';
import MenuVista from './MenuVista';
import { coresDaVista, type ModoDeCor } from '../../utils/blueprintPaletas';
import { TEMPLATES_DE_FABRICA, type ConfiguracaoDeVista, type Estilo3d, type EstiloDaPlanta, type TemplateDeVista } from '../../utils/blueprintTemplatesDeVista';
import { pisosHumanizados, resumirPisos, vegetacaoSimbolica } from '../../utils/blueprintHumanizada';
import { blueprintViewTemplateService } from '../../services/blueprintViewTemplateService';
import { proximaRevisao, revisoesDoModelo, resumirAnotacoes } from '../../utils/blueprintAnotacoes';
import PainelGuardaCorpos from './PainelGuardaCorpos';
import PainelRodapes from './PainelRodapes';
import PainelDepartamentos from './PainelDepartamentos';
import PainelEtapas from './PainelEtapas';
import { etapasOrdenadas, pecasNaLinhaDoTempo, pecasSemEtapa, quadroDeEtapas, vistaDaEtapa } from '../../utils/blueprintEtapas';
import PainelImportarCollada from './PainelImportarCollada';
import PainelLod from './PainelLod';
import { ALVO_DE_LOD_PADRAO, lodDosElementos, pendenciasDeLod, quadroDeLod, type AlvoDeLod } from '../../utils/blueprintLod';
import { quadroDeDepartamentos, sugestoesDeDepartamento } from '../../utils/blueprintDepartamentos';
import PainelRodapeSelecionado from './PainelRodapeSelecionado';
import { HIPOTESES_DE_RODAPE_PADRAO, resumirRodapes, sugerirRodapes, type HipotesesDeRodape } from '../../utils/blueprintRodape';
import { HIPOTESES_DE_GUARDA_CORPO_PADRAO, resumirGuardaCorpos, sugerirGuardaCorpos, type HipotesesDeGuardaCorpo } from '../../utils/blueprintGuardaCorpo';
import { resumirAcabamentos } from '../../utils/blueprintAcabamentos';
import PainelIa, { concluirTurno, novoTurno, turnoComMudancas, type TurnoDaConversa } from './PainelIa';
import { aplicarMudancas, interpretarPedidoLocal } from '../../utils/blueprintIa';
import { pedirMudancasAIa } from '../../services/plantaIaService';
import { HIPOTESES_MOBILIARIO_PADRAO, mobiliarNivel, sugerirShaft, type HipotesesDeMobiliario } from '../../utils/blueprintMobiliario';
import { useGerador } from '../../hooks/useGerador';
import { comandosDeGeometria, HIPOTESES_DO_GERADOR_PADRAO, nomesParaOModelo, type HipotesesDoGerador, type ResultadoDoGerador } from '../../utils/blueprintGerador';
import { conferirPrograma as conferirProgramaDeOutro } from '../../utils/blueprintConferenciaDoPrograma';
import {
  POLITICA_PADRAO,
  KernelError,
  applyBatch,
  areCollinear,
  cantoEntreEixos,
  cantosEncostados,
  pontasSoltasDoNivel,
  extensoesAteEncontrar,
  juntasParalelasSemCanto,
  computeQuantities,
  deslocamentoParaManterFace,
  somaDasCamadas,
  type CamadaParede,
  encostosSemJuncao,
  isFreeWallEnd,
  faceInternaMm,
  areaRecuada,
  areaConstruidaMm2,
  pontaEsticada,
  point,
  roundToMm,
  verticeDeAcompanhamento,
  FORMA_ESTRUTURAL,
  nomeDoTipoEstrutural,
  nomeDoTipoDeAbertura,
  pontasEncurtadasPorEstrutura,
  sobreposicoesDe,
  prefixoDeRotulo,
  type BoundaryKind,
  type AlinhamentoParede,
  type Command,
  type FamiliaComParametros,
  type Parametros,
  type Opening,
  type Point,
  type StructuralKind,
  conflitosDoModelo,
  conflitosArquitetonicos,
  type DisciplinaDeRede,
  type TipoCirculacao,
  type TipoDeNucleo,
  type TipoDeVaga,
  type TipoDeComponente,
  type TipoDeGuardaCorpo,
  type TipoDeAnotacao,
  ROTULO_DO_TIPO_DE_ANOTACAO,
  pontoHidraulicoDoComponente,
  type TipoDeRestricaoDoLote,
  TIPOS_DE_RESTRICAO_DO_LOTE,
  ROTULO_DA_RESTRICAO_DO_LOTE,
  FAIXA_PADRAO_DA_RESTRICAO,
  type TipoDeAmbiente,
  type TipoDeInterruptor,
  type Wall,
  type TipoDePontoHidraulico,
  TIPOS_DE_AMBIENTE,
  DISCIPLINAS_DO_PONTO_HIDRAULICO,
  rotuloCurto,
  polygonArea,
  type BlueprintModel,
} from '../../utils/blueprintKernel';
import {
  BITOLA_PADRAO_MM,
  COTA_PADRAO_MM,
  COTA_USUAL_DO_PONTO_ELETRICO,
  ROTULO_DO_PONTO_ELETRICO,
  COTA_TERMINAL_PADRAO_MM,
  MEDIDAS_PADRAO_TERMINAL_MECANICO,
  TIPOS_DE_TERMINAL_MECANICO,
  ROTULO_DA_DISCIPLINA,
  TOLERANCIA_ENCAIXE_MM,
  encaixarEmPecaEletrica,
} from '../../utils/blueprintRede';
import {
  FICHA_DO_PONTO_HIDRAULICO,
  SIGLA_DO_PONTO_HIDRAULICO,
  cotaUsualDoPontoHidraulico,
  ehSobreOTrecho,
  projetarNoTrecho,
} from '../../utils/blueprintHidraulica';
import {
  HIPOTESES_PONTOS_PADRAO,
  ROTULO_DO_KIT,
  planejarPontosDoNivel,
  type HipotesesDePontos,
  type KitHidraulico,
} from '../../utils/blueprintPontosHidraulicos';
import {
  HIPOTESES_AGUA_PADRAO,
  planejarAguaDoModelo,
  refazerAgua,
  relancarAgua,
  type HipotesesDeAgua,
  type PlanoDeAgua,
} from '../../utils/blueprintAguaAutomatica';
import {
  HIPOTESES_ESGOTO_PADRAO,
  planejarEsgoto,
  refazerEsgoto,
  relancarEsgoto,
  type HipotesesDeEsgoto,
} from '../../utils/blueprintEsgotoAutomatico';
import {
  ROTULO_DO_TIPO_DE_AMBIENTE,
  comandosDeIluminacao,
  comandosDeTomadasSugeridas,
  comandosParaCompletar,
  conferirIluminacao,
  conferirTomadas,
  distribuirAoLongo,
  etiquetaDoAmbiente,
  ladosDaParede,
  ladosDePiso,
  perimetroInternoM,
  type LadoDoAmbiente,
} from '../../utils/blueprintDistribuicao';
import DistribuirTomadas, { ConferenciaDoAmbiente, TomadasNaParede } from './DistribuirTomadas';
import PainelConferenciaNbr from './PainelConferenciaNbr';
import { conferirNbr5410 } from '../../utils/blueprintNbr5410';
import { useBlueprintEletrica } from '../../hooks/useBlueprintEletrica';
import { useBlueprintArmadura } from '../../hooks/useBlueprintArmadura';
import { armaduraDoModelo, armaduraManualDe } from '../../utils/blueprintArmadura';
import TelaArmadura from './TelaArmadura';
import TelaQuantitativos from './TelaQuantitativos';
import TelaUnidades from './TelaUnidades';
import TelaLegislacao from './TelaLegislacao';
import TelaPrograma from './TelaPrograma';
import PainelGrafoEspacial from './PainelGrafoEspacial';
import PainelInsolacao, { HIPOTESES_DE_INSOLACAO_PADRAO, type HipotesesDeInsolacao } from './PainelInsolacao';
import TelaAvaliacao from './TelaAvaliacao';
import { avaliar, hipotesesDaAvaliacaoDaColuna, HIPOTESES_DA_AVALIACAO_PADRAO, type HipotesesDaAvaliacao } from '../../utils/blueprintAvaliacao';
import { analisarInsolacao, diaDoAno, direcaoDoSol, insolacaoParaRegras, posicaoSolar, prismasDoEntorno } from '../../utils/blueprintInsolacao';
import { conferirPrograma, linhasParaLegislacao } from '../../utils/blueprintConferenciaDoPrograma';
import { construirGrafoEspacial, descreverFachadas, percursoAteASaida, vizinhosDe } from '../../utils/blueprintGrafoEspacial';
import { useBlueprintPrograma } from '../../hooks/useBlueprintPrograma';
import { avaliarRegras, REGRAS_SEMENTE, type Regra, type ResultadoDeRegra } from '../../utils/blueprintRegras';
import { blueprintRuleSetService, type ConjuntoDeRegras } from '../../services/blueprintRuleSetService';
import PainelGrupo from './PainelGrupo';
import { quadroDeUnidades, rotuloDaUnidade, unidadePorEtiqueta } from '../../utils/blueprintUnidades';
import { blueprintUnidadesPlantaAiService } from '../../services/blueprintUnidadesPlantaAiService';
import { hashDaBaseEletrica, memorialEletrico, verificacoesEletricas } from '../../utils/blueprintEletricaExecutivo';
import { ocupacaoDoTrecho } from '../../utils/blueprintEletricaDimensionamento';
import PainelEletricaExecutivo from './PainelEletricaExecutivo';

/**
 * Tela do editor de plantas (épico E3).
 *
 * A camada FOCÁVEL do "híbrido" do Spike B mora aqui: o canvas é opaco para
 * leitor de tela, então a barra de ferramentas, a lista de ambientes e o estado
 * do salvamento são DOM de verdade — navegáveis por teclado e anunciáveis. O
 * canvas cuida da massa de geometria; o DOM cuida de tudo que precisa ter foco.
 */

/**
 * Inverte o lado do traçado. Do EIXO ele passa a desenhar pela face, porque "o
 * outro lado do eixo" não existe: quem aperta a tecla está pedindo um lado, e
 * devolver o mesmo estado faria a tecla parecer quebrada.
 */
function inverterLado(atual: AlinhamentoParede): AlinhamentoParede {
  return atual === 'ESQUERDA' ? 'DIREITA' : atual === 'DIREITA' ? 'ESQUERDA' : 'DIREITA';
}

/** Os três tipos de abertura, na ordem em que a barra os oferece. */
type TipoAbertura = Opening['kind'];

/**
 * Um vão candidato: o par de pontas soltas e as paredes donas delas.
 *
 * `wallIds` existe para o vão da LISTA saber apontar o que lhe corresponde no
 * DESENHO. Sem ele a linha "Vão 3" era um texto solto — media, oferecia fechar,
 * e não dizia onde fica.
 */
type Vao = { a: Point; b: Point; mm: number; wallIds: string[] };

/**
 * Ponta solta: onde ela está, de quem é, QUAL extremo é e onde fica o outro.
 *
 * `end` existe para `MoveVertex`, que move um extremo nomeado — sem ele a junção
 * de canto teria de redescobrir por comparação de coordenada qual das duas pontas
 * da parede é esta. `oposta` dá a direção do eixo, que é o que a junção segue e o
 * que o detector de vãos usa para exigir que as duas pontas estejam na mesma
 * linha.
 */
type PontaSolta = { p: Point; wallId: string; end: 'a' | 'b'; oposta: Point };


/**
 * Quanto a ponta parceira pode sair da linha da parede e ainda contar como
 * continuação dela, em milímetro.
 *
 * Uma espessura de parede. Dois trechos da mesma parede saem do vetorizador
 * deslocados alguns centímetros um do outro (as faces do PDF não são exatas), e
 * recusar isso mataria vãos legítimos.
 */
const DESALINHO_MAX_MM = 150;

/**
 * A ponta `outra` está na LINHA da parede de `de`, adiante dela?
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * O detector emparelhava pontas soltas só por DISTÂNCIA. Numa planta real
 * (23/08/2026) o resultado foi um leque de diagonais: a ombreira de cima de uma
 * porta oferecida como "vão" contra o canto de uma parede a 1,86 m dali, do
 * outro lado do arco de abertura. Duas das três ofertas eram geometricamente
 * impossíveis, e aceitar qualquer uma criava uma PAREDE DIAGONAL atravessando o
 * cômodo — foi assim que o usuário topou com isto, lendo o desenho como bug da
 * geração de paredes.
 *
 * Abertura é interrupção de uma LINHA de parede: as duas pontas são as duas
 * ombreiras, e o vão entre elas continua o eixo das duas. O que não continua
 * eixo nenhum é canto aberto — e canto se resolve movendo a ponta, não fechando
 * com um trecho enviesado.
 *
 * ⚠️ Isto NÃO é o "fechar por colinearidade" que o Spike C reprovou. Lá a
 * máquina DECIDIA fechar sozinha, e fechava a borda de terraço que devia ficar
 * aberta. Aqui ela só deixa de OFERECER o que não pode ser abertura; a borda do
 * terraço continua na lista, e quem decide continua sendo quem conhece o
 * projeto.
 */
function naMesmaLinha(de: PontaSolta, outra: PontaSolta): boolean {
  const ux = de.p.x - de.oposta.x;
  const uy = de.p.y - de.oposta.y;
  const comp = Math.hypot(ux, uy) || 1;
  const vx = outra.p.x - de.p.x;
  const vy = outra.p.y - de.p.y;

  // Para FRENTE: o vão continua a parede ALÉM da ponta. Sem este teste, uma
  // parede que corre rente a outra e termina antes dela emparelharia para trás,
  // por cima de si mesma.
  if ((vx * ux + vy * uy) / comp <= 0) return false;

  // Desvio LATERAL, não angular. Dois trechos deslocados 5 cm um do outro são a
  // mesma linha em qualquer tamanho de vão; em ângulo, esses mesmos 5 cm são 7°
  // num vão de 40 cm e 1° num de 3 m — o mesmo desenho seria aceito ou recusado
  // conforme o tamanho do vão, que é justamente o que não pode variar.
  return Math.abs((vx * uy - vy * ux) / comp) <= DESALINHO_MAX_MM;
}

const ESPESSURA_PADRAO_MM = 150;
const ALTURA_PADRAO_MM = 2800;

/** O que a barra edita numa peça estrutural. Tudo em milímetro inteiro. */
export interface MedidasEstruturais {
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
  baseMm: number;
  circular: boolean;
}

/**
 * Com que medidas cada peça NASCE.
 *
 * Números de obra corrente, não de norma: pilar 20×40, viga 15×50, laje maciça
 * de 12 cm, estaca ⌀30 de 8 m, bloco 80×80×60, baldrame 20×40. Servem para o
 * primeiro clique não exigir preencher cinco campos — todos continuam
 * editáveis na barra antes do clique e no painel depois dele.
 *
 * `baseMm` NEGATIVO é o que põe a fundação abaixo do piso sem exigir um
 * pavimento "Fundação" só para ela. O bloco começa a 1,10 m de profundidade e
 * tem 60 cm de altura, então seu topo fica a −0,50 m; a estaca desce 8 m a
 * partir de −1,10 m, que é onde o bloco a encontra. Os dois números conversam
 * de propósito: um deles isolado poria a estaca boiando.
 */
const PADRAO_ESTRUTURAL: Record<StructuralKind, MedidasEstruturais> = {
  PILAR: { larguraMm: 200, profundidadeMm: 400, alturaMm: ALTURA_PADRAO_MM, baseMm: 0, circular: false },
  VIGA: { larguraMm: 150, profundidadeMm: 0, alturaMm: 500, baseMm: ALTURA_PADRAO_MM - 500, circular: false },
  LAJE: { larguraMm: 0, profundidadeMm: 0, alturaMm: 120, baseMm: ALTURA_PADRAO_MM, circular: false },
  ESTACA: { larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true },
  BLOCO_COROAMENTO: { larguraMm: 800, profundidadeMm: 800, alturaMm: 600, baseMm: -1100, circular: false },
  VIGA_FUNDACAO: { larguraMm: 200, profundidadeMm: 0, alturaMm: 400, baseMm: -900, circular: false },
};

/**
 * As seções do painel lateral.
 *
 * Foram abas até 29/08/2026 — uma barra de navegação e um corpo que trocava de
 * conteúdo. Viraram seções irmãs de accordion a pedido do usuário: o painel é
 * multi-aberto, então "ver as medições SEM perder os ambientes de vista" deixou
 * de exigir ir e voltar. O nome de cada uma é o rótulo que a aba tinha.
 *
 * `naVista` = a seção sobrevive fora da planta baixa. As que editam o modelo
 * somem na elevação/3D, que são read-only — é o mesmo recorte que a barra de
 * abas fazia (só Quantitativos e Versões).
 *
 * `no3d` = sobrevive SÓ no 3D. Um segundo eixo, e não um `naVista: true`, porque
 * "Componentes" no 3D não é a mesma seção de sempre reaparecendo: ela vira uma
 * lista read-only com o olho de exibir/ocultar (pedido de 01/09/2026), e isso só
 * faz sentido onde há volume para esconder. Na elevação a peça já é filtrada
 * pelos toggles próprios da vista (paredes internas, estrutura), e uma terceira
 * régua de visibilidade ali seria duas fontes para a mesma pergunta.
 *
 * "Do PDF" nomeia a ORIGEM, não a ação: um verbo no meio dos substantivos
 * ("Gerar") leria como botão perdido entre cabeçalhos de seção.
 */
const SECOES_DO_PAINEL = [
  { id: 'pavimentos', rotulo: 'Pavimentos', naVista: true, no3d: false },
  // Antes de "Ambientes" porque é a ordem do trabalho e a do vocabulário: aqui
  // está o que se DESENHA, ali o que a topologia DERIVA do desenho.
  { id: 'componentes', rotulo: 'Componentes', naVista: false, no3d: true },
  { id: 'ambientes', rotulo: 'Ambientes', naVista: false, no3d: false },
  // Até 13/09/2026 havia mais doze aqui — Do PDF, Do IFC, Do DXF, Do BCF,
  // Comentários, Conflitos, Elétrica, Medições, Quantitativos, Orçamento,
  // Versões. Viraram TAREFAS abertas pelo ribbon (`ROTULO_DA_TAREFA`) e
  // RELATÓRIOS no dock (`RELATORIOS_DO_DOCK`): o painel ficou com o que é
  // navegação, e só isso.
] as const;

type SecaoDoPainel = (typeof SECOES_DO_PAINEL)[number]['id'];

/**
 * As abas do ribbon (13/09/2026), na ordem de leitura — o trabalho começa pela
 * arquitetura e termina em como olhar para ele. `naVista`: quais existem fora
 * da planta baixa (elevação, corte, 3D), onde não se desenha.
 *
 * Aba VAZIA não aparece — é por isso que Colaborar ainda não está aqui: entra
 * quando os relatórios e a emissão saírem do painel (F3 do plano
 * `docs/planos/2026-09-13-planta-ribbon-painel-enxuto-dock.md`).
 */
/**
 * PROXIMO nome de quadra: A -> B -> ... -> Z -> AA. Quadra costuma ser letra no
 * Brasil; se o usuario escreveu numero ("01"), a sequencia segue em numero.
 */
function proximaQuadra(atual: string): string {
  const t = atual.trim();
  if (/^\d+$/.test(t)) return proximoNumero(t);
  if (!/^[A-Za-z]+$/.test(t)) return t;
  const letras = t.toUpperCase().split('');
  let i = letras.length - 1;
  for (;;) {
    if (letras[i] !== 'Z') {
      letras[i] = String.fromCharCode(letras[i].charCodeAt(0) + 1);
      return letras.join('');
    }
    letras[i] = 'A';
    if (i === 0) return 'A' + letras.join('');
    i -= 1;
  }
}

/**
 * PROXIMO numero, preservando o zero a esquerda e o texto em volta: "1" -> "2",
 * "09" -> "10", "Rua 3" -> "Rua 4", "12-A" -> "13-A". Sem digito nenhum, devolve
 * o que recebeu -- inventar sequencia onde nao ha seria pior que repetir.
 */
function proximoNumero(atual: string): string {
  const m = atual.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return atual;
  const [, antes, digitos, depois] = m;
  const seguinte = String(Number(digitos) + 1);
  const comZeros = digitos.length > seguinte.length ? seguinte.padStart(digitos.length, '0') : seguinte;
  return `${antes}${comZeros}${depois}`;
}

const ABAS_DO_RIBBON = [
  { id: 'arquitetura', rotulo: 'Arquitetura', naVista: false },
  { id: 'terreno', rotulo: 'Terreno', naVista: false },
  // UMA ABA POR DISCIPLINA MEP (17/09/2026: *"menubar Instalações está
  // agrupando todas as disciplinas. Melhor separar um menu para cada disciplina
  // MEP: Elétrica; Hidráulica; Mecânica"*). Mecânica entra quando houver
  // componente mecânico no kernel — aba vazia não aparece (regra acima).
  // Fora da planta, da Elétrica sobra o Quadro de cargas — que já se lia no 3D.
  { id: 'eletrica', rotulo: 'Elétrica', naVista: true },
  { id: 'hidraulica', rotulo: 'Hidráulica', naVista: false },
  // MECÂNICA (20/09/2026, roadmap E11.1): nasceu com a disciplina no kernel —
  // reservas de espaço de equipamento (climatização) e o shaft mecânico.
  { id: 'mecanica', rotulo: 'Mecânica', naVista: false },
  { id: 'inserir', rotulo: 'Inserir', naVista: false },
  // Conflitos e quantitativos também se leem na elevação e no 3D.
  { id: 'analisar', rotulo: 'Analisar', naVista: true },
  { id: 'colaborar', rotulo: 'Colaborar', naVista: true },
  { id: 'vista', rotulo: 'Vista', naVista: true },
  // A CONTEXTUAL (a "Modificar" do Revit): só existe com algo selecionado na
  // planta, por último e em verde. Nunca é persistida — ver `emModificar`.
  { id: 'modificar', rotulo: 'Modificar', naVista: false, contextual: true },
] as const;
type AbaDoRibbonDoEditor = (typeof ABAS_DO_RIBBON)[number]['id'];

/**
 * As TAREFAS que o ribbon abre na metade de baixo do painel lateral (F2). Cada
 * uma era uma seção do acordeão; agora é um comando com começo e fim, no lugar
 * onde as propriedades da seleção ficam quando não há tarefa.
 */
const ROTULO_DA_TAREFA = {
  terreno: 'Dados do lote, zona e topografia',
  // Todos os ambientes num lugar só: tipo, conferência 9.5.2 e a distribuição
  // automática. O mesmo controle continua em cada cartão do navegador — aqui
  // é a porta de quem procura "lançamento automático de tomadas" no ribbon.
  tomadas: 'Tomadas pela NBR 5410',
  // O lançamento automático de eletrodutos (13/09/2026): por circuito, prumada
  // em cada ponto e árvore no teto a partir do quadro — sugerido, desfazível.
  eletrodutos: 'Eletrodutos por circuito',
  // A criação automática de circuitos (14/09/2026): luz, TUG e TUE sempre
  // separados; o critério só divide luz e TUG. Prévia em tabela, um lote.
  circuitos: 'Circuitos automáticos',
  // O lançamento automático de pilares (15/09/2026): um pilar por encontro de
  // paredes e nos vãos longos; prévia tracejada no desenho, um lote, Ctrl+Z.
  pilares: 'Pilares automáticos',
  // Vigas e lajes (16/09/2026): o mesmo molde, uma gaveta cada.
  vigas: 'Vigas automáticas',
  lajes: 'Lajes automáticas',
  // Fundações (16/09/2026): bloco + estaca(s) sob cada pilar, uma gaveta.
  fundacoes: 'Fundações automáticas',
  // Pontos hidráulicos por ambiente (18/09/2026, F3 da hidráulica): o kit do
  // banheiro/cozinha/serviço em posições sugeridas — mover confirma.
  pontosHidraulicos: 'Pontos hidráulicos por ambiente',
  // Água fria e quente automáticas (18/09/2026, F4): caixa d'água → barrilete →
  // colunas → ramais; aquecedor → pontos quentes. DN pelos pesos da NBR 5626.
  agua: 'Água fria e quente automáticas',
  // Esgoto automático (18/09/2026, F5): aparelhos → coletores → caixa de
  // inspeção, com caimento por DN, tubo de queda e ventilação.
  esgoto: 'Esgoto automático',
  // Matriz (18/09/2026, roadmap E0.1): N cópias da seleção a k·passo — a
  // fileira de pilares, a bateria de banheiros. Um lote, um Ctrl+Z.
  matriz: 'Matriz — repetir a seleção',
  // Grupo com origem (19/09/2026, roadmap E2.3): agrupar a seleção e instanciar
  // espelhado/girado/deslocado; editar a origem propaga às cópias.
  grupo: 'Grupo com origem — agrupar e instanciar',
  // Vagas automáticas (19/09/2026, roadmap E2.5): fileiras com circulação na garagem.
  vagas: 'Vagas de garagem — lançamento automático',
  // LOTEAR QUADRA (25/09/2026, B2): a quadra vira N lotes de testada fixa —
  // prévia tracejada, um lote de comandos, um Ctrl+Z.
  lotear: 'Lotear quadra — subdivisão automática',
  // GRAFO ESPACIAL (19/09/2026, E4.2): a planta como rede de ambientes —
  // vizinhos por porta e por parede, percursos, circulação %, fachadas.
  grafo: 'Grafo espacial — vizinhos, percursos e fachadas',
  // INSOLAÇÃO (19/09/2026, E5.1): sol por data/hora solar, horas por fachada e
  // ambiente, sombra do entorno, ventilação cruzada; sol no 3D.
  insolacao: 'Insolação e ventilação',
  // MOBILIÁRIO mínimo e circulação livre (19/09/2026, E6.3): kit por uso,
  // circulação de 0,90/1,20 verificada; vagas e shaft quando o programa pede.
  mobiliario: 'Mobiliário e circulação',
  // PISO, FORRO E RODAPÉ (19/09/2026, E7.2): camadas por ambiente na etiqueta, tipos da organização, material por camada.
  acabamentos: 'Piso, forro e rodapé por ambiente',
  // GUARDA-CORPOS (19/09/2026, E7.3): borda livre de laje e escada → sugestão; conferência NBR 14718/9050.
  guardaCorpos: 'Guarda-corpos e corrimãos',
  rodapes: 'Rodapés por ambiente',
  // ESQUADRIAS EM LOTE (24/09/2026, P2.49): o quadro do desenho vira tipos
  // nomeados com item — sem isto, esquadria sem nome nao entra no orcamento.
  esquadrias: 'Esquadrias — tipos e itens em lote',
  // DEPARTAMENTO (21/09/2026, P2.22): setor por ambiente na etiqueta; quadro por setor e a planta colorida.
  departamentos: 'Departamentos (setores) por ambiente',
  // LOD (21/09/2026, P2): nível de desenvolvimento derivado por família; alvo por família; pendências.
  lod: 'LOD — nível de desenvolvimento por família',
  // ETAPAS DE OBRA (21/09/2026, P2): linha do tempo, nasce em / demolida em, etapa em vista.
  etapas: 'Etapas de obra (fases personalizadas)',
  // IA conversacional (19/09/2026, E6.4): pedido → mudanças no programa/hipóteses → re-geração → delta.
  ia: 'Conversar com a planta',
  'gerar-paredes': 'Gerar paredes do PDF',
  'importar-ifc': 'Importar do IFC',
  'importar-dxf': 'Importar do DXF / DWG',
  // IMPORTAR DO SKETCHUP (21/09/2026, backlog P2): COLLADA .dae → paredes reconhecidas nas faces.
  'importar-collada': 'Importar do SketchUp (COLLADA)',
  'importar-bcf': 'Importar do BCF',
} as const;
type TarefaDoPainel = keyof typeof ROTULO_DA_TAREFA;

/**
 * Os RELATÓRIOS que o ribbon abre no dock embaixo do canvas (F3): tabelas e
 * listas, um por vez, na largura da área de desenho. `naVista`/`no3d` são os
 * mesmos recortes que as seções tinham — o que se lia na elevação e no 3D
 * continua se lendo lá.
 */
const RELATORIOS_DO_DOCK = {
  // CONFERÊNCIA DO LOTEAMENTO (25/09/2026, B2): área e testada mínimas, lote
  // encravado, número repetido e o percentual de áreas públicas. Só acusa.
  loteamento: { rotulo: 'Conferência do loteamento', naVista: false, no3d: false },
  conflitos: { rotulo: 'Conflitos', naVista: true, no3d: true },
  // Restrições (E1.4b): a conferência das intenções declaradas, com o ajuste.
  restricoes: { rotulo: 'Restrições', naVista: true, no3d: true },
  comentarios: { rotulo: 'Comentários', naVista: true, no3d: true },
  'quadro-de-cargas': { rotulo: 'Quadro de cargas e NBR 5410', naVista: true, no3d: true },
  // Separado do quadro de cargas (14/09/2026): "no mesmo drawer não tem
  // necessidade além de tornar o drawer excessivamente longo". Emite-se uma
  // vez por revisão; o quadro se consulta o tempo todo.
  'executivo-eletrico': { rotulo: 'Projeto executivo elétrico (ART)', naVista: true, no3d: true },
  // O diagrama unifilar (15/09/2026): a leitura do quadro em uma linha —
  // geral, barramento, um ramal por circuito. Só consulta; o que se edita é
  // no quadro de cargas, e o desenho acompanha.
  unifilar: { rotulo: 'Diagrama unifilar', naVista: true, no3d: true },
  medicoes: { rotulo: 'Medições', naVista: false, no3d: false },
  quantitativos: { rotulo: 'Quantitativos', naVista: true, no3d: false },
  orcamento: { rotulo: 'Orçamento', naVista: false, no3d: false },
  versoes: { rotulo: 'Versões', naVista: true, no3d: false },
} as const;
type RelatorioDoDock = keyof typeof RELATORIOS_DO_DOCK;

/**
 * O nome da ferramenta para a barra de opções — é o que responde "por que
 * está saindo janela?" quando o ribbon está noutra aba. Os tipos com subtipo
 * (abertura, estrutura, escada) são resolvidos no chamador.
 */
/** Distância de um ponto a um segmento, em mm — para contar os cruzamentos de um eixo. */
function distanciaPontoSegmento(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const den = dx * dx + dy * dy;
  if (den === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const ROTULO_DA_FERRAMENTA: Partial<Record<BlueprintTool, string>> = {
  selecionar: 'Selecionar',
  mover: 'Mover a vista',
  parede: 'Parede',
  retangulo: 'Parede em retângulo',
  poligono: 'Parede em polígono',
  juntar: 'Juntar',
  calibrar: 'Calibrar a planta de fundo',
  'medir-area': 'Medir área',
  'medir-linha': 'Medir linha',
  contar: 'Contar',
  terreno: 'Terreno',
  divisa: 'Divisa',
  perfil: 'Perfil altimétrico',
  drenagem: 'Drenagem',
  corte: 'Corte',
  eixo: 'Eixo da malha',
  telhado: 'Água de telhado',
  rede: 'Trecho de rede',
  terminal: 'Ponto',
  quadro: 'Quadro de distribuição',
  // LOTEAMENTO (B1)
  quadra: 'Quadra',
  lote: 'Lote',
  via: 'Via',
  'area-publica': 'Área pública',
};

/**
 * Os dois recortes, resolvidos uma vez.
 *
 * Conjuntos e não um `.find()` dentro do callback: com a tabela `as const`, o
 * `find` devolve a UNIÃO dos oito literais, e encadear `secao?.naVista || …`
 * estreita essa união a cada operando até o compilador perder a propriedade
 * seguinte. Filtrar aqui só toca `id`, que existe em todas as entradas.
 */
const SECOES_NA_VISTA = new Set<SecaoDoPainel>(
  SECOES_DO_PAINEL.filter((s) => s.naVista).map((s) => s.id),
);
const SECOES_NO_3D = new Set<SecaoDoPainel>(
  SECOES_DO_PAINEL.filter((s) => s.no3d).map((s) => s.id),
);

/**
 * Quais nascem abertas. As três — o navegador é curto o bastante para isso
 * desde que comandos e relatórios saíram dele (13/09/2026). A chave persistida
 * continua `:v2`: as chaves das seções extintas que sobraram no armazenado
 * são ignoradas pelo spread.
 */
const SECOES_ABERTAS_PADRAO: Record<SecaoDoPainel, boolean> = {
  pavimentos: true,
  // O editor também a abre sozinho ao selecionar um componente.
  componentes: true,
  ambientes: true,
};

interface Props {
  study: BlueprintStudy;
  branchId: string;
  onBack: () => void;
  /** DESIGN OPTIONS (E6.1): abrir outra alternativa (ramo) do estudo — quem monta o editor troca o `branchId`. */
  onTrocarRamo?: (branchId: string) => void;
}

export default function BlueprintEditor({ study, branchId, onBack, onTrocarRamo }: Props) {
  // MULTIUSUÁRIO (E10.1): o editor pergunta aos ganchos ANTES de aplicar (trava de
  // outra pessoa, somente leitura) e difunde DEPOIS. Os ganchos leem refs porque o
  // canal e as permissões nascem mais abaixo, depois do próprio editor.
  const colabRef = useRef<UsoDaColaboracao | null>(null);
  const somenteLeituraRef = useRef(false);
  // TRAVAS EXPLÍCITAS (21/09/2026, backlog P2 "lock fino"): as do ramo, lidas do banco; o portão lê a ref.
  const travasRef = useRef<{ travas: TravaExplicita[]; meuUserId: string | null }>({ travas: [], meuUserId: null });
  const editor = useBlueprintEditor(branchId, {
    antesDeAplicar: (comandos) => {
      if (somenteLeituraRef.current) return 'Você é leitor deste estudo: pode ver tudo, mas não alterar. Peça a um editor para mudar seu papel em Colaborar › Acesso.';
      const trava = colabRef.current ? travaDoComando(comandos, colabRef.current.travas) : null;
      if (trava) return `"${trava.id}" está em edição por ${trava.por.nome} — espere a seleção dela ser solta.`;
      const bloqueio = bloqueioDasTravas(comandos, travasRef.current.travas, editorRef.current.model, travasRef.current.meuUserId);
      if (bloqueio) return `${bloqueio.motivo} Veja em Colaborar › Travas.`;
      return null;
    },
    depoisDeAplicar: (comandos, hashDepois) => colabRef.current?.difundir(comandos, hashDepois),
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;
  /** Quem sou eu no canal: o usuário da sessão (id + e-mail); o nome vem da organização. */
  const [sessaoAtual, setSessaoAtual] = useState<{ id: string; email: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (vivo && data.user) setSessaoAtual({ id: data.user.id, email: data.user.email ?? '' });
    });
    return () => {
      vivo = false;
    };
  }, []);
  const organizacoesParaNome = useStore((e) => e.organizations);
  const meuNome = useMemo(() => {
    const email = sessaoAtual?.email?.toLowerCase();
    if (!email) return null;
    for (const o of organizacoesParaNome) for (const m of o.members ?? []) if (m.email?.toLowerCase() === email && m.name) return m.name;
    return email.split('@')[0];
  }, [organizacoesParaNome, sessaoAtual?.email]);
  const colab = useBlueprintColaboracao({
    branchId,
    userId: sessaoAtual?.id ?? null,
    email: sessaoAtual?.email ?? null,
    nome: meuNome,
    aoReceber: (msg) => editorRef.current.aplicarExterno(msg),
    aoMudarTravas: (autorNome, texto) => {
      recarregarTravasRef.current?.();
      if (texto) setAvisoDeTrava(`${autorNome}: ${texto}`);
    },
  });
  colabRef.current = colab;
  const [travasDoRamo, setTravasDoRamo] = useState<TravaExplicita[]>([]);
  const [travasCarregando, setTravasCarregando] = useState(false);
  const [travasIndisponiveis, setTravasIndisponiveis] = useState<string | null>(null);
  const [avisoDeTrava, setAvisoDeTrava] = useState<string | null>(null);
  const recarregarTravasRef = useRef<(() => void) | null>(null);
  const recarregarTravas = useCallback(() => {
    setTravasCarregando(true);
    blueprintTravaService
      .list(branchId)
      .then((lista) => {
        setTravasDoRamo(lista);
        setTravasIndisponiveis(null);
      })
      .catch((e: unknown) => {
        console.warn('[travas] indisponíveis:', e);
        setTravasIndisponiveis(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setTravasCarregando(false));
  }, [branchId]);
  recarregarTravasRef.current = recarregarTravas;
  useEffect(() => {
    recarregarTravas();
  }, [recarregarTravas]);
  travasRef.current = { travas: travasDoRamo, meuUserId: sessaoAtual?.id ?? null };
  /** PERMISSÕES POR ESTUDO (E10.1): sem linha = editor. Leitor trava os comandos aqui e a RLS recusa a gravação lá. */
  const [permissoesDoEstudo, setPermissoesDoEstudo] = useState<PermissaoGravada[]>([]);
  const [permissoesIndisponiveis, setPermissoesIndisponiveis] = useState<string | null>(null);
  const [permissoesCarregando, setPermissoesCarregando] = useState(false);
  const recarregarPermissoes = useCallback(() => {
    setPermissoesCarregando(true);
    blueprintStudyPermissionService
      .list(study.id)
      .then((lista) => {
        setPermissoesDoEstudo(lista);
        setPermissoesIndisponiveis(null);
      })
      .catch((e: unknown) => {
        console.warn('[acesso] permissões indisponíveis:', e);
        setPermissoesIndisponiveis(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setPermissoesCarregando(false));
  }, [study.id]);
  useEffect(() => {
    recarregarPermissoes();
  }, [recarregarPermissoes]);
  const meuPapel = papelNoEstudo(permissoesDoEstudo, study.id, sessaoAtual?.email);
  const somenteLeitura = meuPapel === 'LEITOR';
  somenteLeituraRef.current = somenteLeitura;
  /** Com outra pessoa no ramo, desfazer/refazer ficam desligados: desfazer localmente o comando dela divergiria os desenhos. */
  const desfazerBloqueado = colab.participantes.length > 0;
  /** As seleções dos outros, para o canvas mostrar quem está em quê. */
  const selecoesRemotas = useMemo(
    () => [
      ...colab.participantes.flatMap((p) => p.selecionados.map((id) => ({ id, cor: p.cor, nome: p.nome }))),
      // TRAVAS EXPLÍCITAS: crachá quadrado, cinza, com as iniciais de quem travou.
      ...idsTravados(travasDoRamo, editor.model).map(({ id, trava }) => ({ id, cor: '#475569', nome: trava.holderNome || trava.holderEmail, travado: true })),
    ],
    [colab.participantes, travasDoRamo, editor.model],
  );
  /** Os membros da organização do ESTUDO (para papéis e @menções). */
  const membrosDaOrgDoEstudo = useMemo(() => {
    const org = organizacoesParaNome.find((o) => o.id === study.organization_id);
    return (org?.members ?? []).filter((m) => m.email).map((m) => ({ email: m.email, nome: m.name || m.email, papelNaOrg: String(m.role ?? '') }));
  }, [organizacoesParaNome, study.organization_id]);
  const [espessura, setEspessura] = useState(ESPESSURA_PADRAO_MM);
  // `null` = automatico: o passo acompanha o zoom. Qualquer numero fixa o passo.
  const [passoGrade, setPassoGrade] = useState<number | null>(null);
  /** Parâmetros da matriz (E0.1). Lembrados entre sessões: quem repete pilar a 5 m repete de novo. */
  const [parametrosDaMatriz, setParametrosDaMatriz] = usePersistedState<ParametrosDaMatriz>('blueprint:matriz', {
    quantidade: 3,
    passoXMm: 3000,
    passoYMm: 0,
  });
  const [passoEmVigor, setPassoEmVigor] = useState(100);
  const [larguraAbertura, setLarguraAbertura] = useState(900);
  /**
   * O TIPO SALVO escolhido para a PRÓXIMA abertura. Estado da barra, como a
   * largura. Com ele, a porta nasce com kind, medidas e esquadria do tipo —
   * é onde o ganho de fluxo do catálogo está: quem põe doze P1 escolhe uma vez.
   *
   * `null` = sem tipo: a barra volta a valer largura + padrões, como sempre.
   */
  const [tipoDaBarra, setTipoDaBarra] = useState<TipoDeEsquadria | null>(null);
  const [tiposDeEsquadria, setTiposDeEsquadria] = useState<TipoDeEsquadria[]>([]);
  const [renomeando, setRenomeando] = useState<string | null>(null);

  // ── Seções do painel lateral (accordion multi-aberto) ─────────────────────
  // Persistido porque quem trabalha na planta reabre o editor dezenas de vezes
  // ao dia; refazer o arranjo do painel a cada carga é atrito puro.
  //
  // A chave carrega `:v2` porque a forma do objeto mudou quando as abas viraram
  // seções: o `:v1` guardava `{pavimentos, navegacao, conteudo}`, e reaproveitar
  // a chave faria o painel de quem já usou o editor nascer com as seis seções
  // novas em `undefined` — todas fechadas, o painel aparentemente vazio.
  const [secoesSalvas, setSecoes] = usePersistedState(
    'blueprint:secoesDoPainel:v2',
    SECOES_ABERTAS_PADRAO,
  );
  // Mesclado com o padrão a cada leitura: assim, acrescentar uma seção no futuro
  // não exige outro `:v3` — a que faltar no armazenado cai no default.
  const secoes: Record<SecaoDoPainel, boolean> = {
    ...SECOES_ABERTAS_PADRAO,
    ...secoesSalvas,
  };
  const alternarSecao = useCallback(
    (qual: SecaoDoPainel) => setSecoes((s) => ({ ...s, [qual]: !(s[qual] ?? false) })),
    [setSecoes],
  );
  /** O formulário de novo pavimento — o botão que o abre mora no cabeçalho da seção. */
  const [adicionandoPavimento, setAdicionandoPavimento] = useState(false);

  // Largura arrastável do painel. Persistida, com limites e duplo clique para
  // voltar ao padrão — mesmo gesto da régua de coluna das tabelas.
  const {
    largura: larguraDoPainel,
    caixaRef: caixaDoPainel,
    Puxador: PuxadorDeLargura,
  } = usePainelRedimensionavel();

  // ── Vista: planta baixa (editável) ou uma das derivadas (read-only) ───────
  const [vista, setVista] = usePersistedState<VistaBlueprint>('blueprint:vista', 'planta');
  /**
   * A aba do ribbon. Persistida como a vista: quem passa o dia em Instalações
   * não quer reabrir a aba a cada carga. A aba EFETIVA é resolvida adiante,
   * depois de `emVista` existir — em elevação/3D a salva pode não existir.
   */
  const [abaSalva, setAbaSalva] = usePersistedState<AbaDoRibbonDoEditor>(
    'blueprint:abaDoRibbon',
    'arquitetura',
  );
  /**
   * RIBBON RECOLHIDO (24/09/2026). Persistido junto da aba: quem trabalha num
   * notebook recolhe uma vez e não quer recolher de novo a cada carga.
   */
  const [ribbonRecolhido, setRibbonRecolhido] = usePersistedState<boolean>(
    'blueprint:ribbonRecolhido',
    false,
  );
  /** Nível que as ferramentas de desenho editam. `null` = o primeiro. */
  const [nivelAtivoId, setNivelAtivoId] = usePersistedState<string | null>(
    'blueprint:nivelAtivo',
    null,
  );
  /** Ids dos níveis que a elevação/3D empilham. Sincronizado com os níveis reais. */
  const [niveisVisiveis, setNiveisVisiveis] = useState<string[]>([]);
  const [enquadrarVistaToken, setEnquadrarVistaToken] = useState(0);
  /**
   * NAVEGAÇÃO pela barra (17/09/2026): enquadrar, zoom ±, 1:100 na planta
   * baixa. Objeto com número de série — ver a prop `navegacao` do canvas.
   */
  const [navegacao, setNavegacao] = useState<{ seq: number; acao: AcaoDeNavegacao } | null>(null);
  const navegar = useCallback(
    (acao: AcaoDeNavegacao) => setNavegacao((n) => ({ seq: (n?.seq ?? 0) + 1, acao })),
    [],
  );
  /**
   * ONDE O DESENHO COMEÇA (17/09/2026): a borda inferior do ribbon, em px da
   * viewport. O painel de propriedades (Sheet sem véu) nasce abaixo dela para
   * não cobrir o acesso rápido — duplicar/espelhar/isolar agem sobre a seleção,
   * e é com seleção que o painel está aberto.
   */
  /**
   * O nome da planta na ABA DO NAVEGADOR (25/09/2026, P2.63). Ele saiu da barra;
   * com duas plantas abertas em abas diferentes, é aqui que se distingue uma da
   * outra. Devolve o título anterior ao sair — o resto do app não mexe nisto.
   */
  useEffect(() => {
    const anterior = document.title;
    document.title = `${study.name} · Planta Inteligente`;
    return () => {
      document.title = anterior;
    };
  }, [study.name]);

  const ribbonRef = useRef<HTMLDivElement>(null);
  const [topoDoDesenhoPx, setTopoDoDesenhoPx] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ribbonRef.current;
    if (!el) return;
    const medir = () => setTopoDoDesenhoPx(Math.round(el.getBoundingClientRect().bottom));
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, []);
  /** A prancha que "Exportar a vista atual" deixa marcada ao abrir Versões. */
  const [pranchaParaExportar, setPranchaParaExportar] = useState<PranchaExport[] | undefined>(undefined);
  const [mostrarCotasAltura, setMostrarCotasAltura] = usePersistedState(
    'blueprint:vistaCotasAltura',
    true,
  );
  const [mostrarRotulosEsquadria, setMostrarRotulosEsquadria] = usePersistedState(
    'blueprint:vistaRotulosEsquadria',
    true,
  );
  const [mostrarParedesInternas, setMostrarParedesInternas] = usePersistedState(
    'blueprint:vistaParedesInternas',
    false,
  );
  /**
   * LIGADO por padrão, ao contrário das paredes internas.
   *
   * Paredes internas nascem desligadas porque poluem a fachada com linhas que a
   * fachada não mostra. A estrutura é o oposto: quem desenhou um pilar quer
   * vê-lo, e uma elevação que esconde por padrão o que acabou de ser desenhado
   * parece defeito, não preferência.
   */
  const [mostrarEstruturaVista, setMostrarEstruturaVista] = usePersistedState(
    'blueprint:vistaEstrutura',
    true,
  );
  const [mostrarLaje3d, setMostrarLaje3d] = usePersistedState('blueprint:vista3dLaje', false);
  /**
   * Hipóteses do pré-dimensionamento elétrico — do ESTUDO, em
   * `blueprint_study_eletrica` (F7, 13/09/2026). Moravam no navegador, e duas
   * pessoas viam cálculos diferentes do mesmo estudo; a emissão executiva
   * amarra o hash delas, então têm de ser do estudo.
   */
  const eletricaDoEstudo = useBlueprintEletrica(study.id, study.organization_id);
  const hipotesesEletricas = eletricaDoEstudo.hipoteses;
  const setHipotesesEletricas = eletricaDoEstudo.setHipoteses;
  /**
   * ARMADURA ESQUEMÁTICA (16/09/2026): as hipóteses são do ESTUDO pela mesma
   * razão das elétricas — o kg entra no quantitativo e no orçamento, e duas
   * pessoas no mesmo estudo têm de ver o mesmo aço.
   */
  const armaduraDoEstudo = useBlueprintArmadura(study.id, study.organization_id);
  /** PROGRAMA DE NECESSIDADES (E4.1): do estudo, fora do payload. */
  const programaDoEstudo = useBlueprintPrograma(study.id, study.organization_id);
  const hipotesesDeArmadura = armaduraDoEstudo.hipoteses;
  /** ARMADURA no 3D (16/09/2026): as barras do esquema, com o concreto translúcido. Nasce desligada. */
  const [mostrarArmadura3d, setMostrarArmadura3d] = usePersistedState<boolean>('blueprint:vista3dArmadura', false);
  const [mostrarArestas3d, setMostrarArestas3d] = usePersistedState(
    'blueprint:vista3dArestas',
    true,
  );
  const [mostrarTerreno3d, setMostrarTerreno3d] = usePersistedState(
    'blueprint:vista3dTerreno',
    false,
  );
  /** ENVELOPE 3D (E3.3): os prismas edificáveis por pavimento, translúcidos. */
  const [mostrarEnvelope3d, setMostrarEnvelope3d] = usePersistedState('blueprint:vista3dEnvelope', true);

  /**
   * VISTA DEPENDENTE (P2.17): o recorte nomeado que está aberto. É a planta
   * EDITÁVEL vista por uma janela — por isso NÃO conta como "em vista": abas,
   * ferramentas e painéis são os da planta; o canvas só esmaece o que está fora.
   */
  const vistaDependenteAtual = (editor.model.vistasDependentes ?? []).find((v) => v.id === dependenteDaVista(vista)) ?? null;
  const emVista = vista !== 'planta' && !vistaDependenteAtual;
  const vistaEhElevacao = ehVistaDeElevacao(vista);
  /** Vista dependente apagada com a vista aberta nela: volta à planta. */
  useEffect(() => {
    if (dependenteDaVista(vista) && !vistaDependenteAtual) setVista('planta');
  }, [vista, vistaDependenteAtual, setVista]);
  /** A vista dependente é de UM pavimento: abri-la ativa o pavimento dela e enquadra o recorte. */
  useEffect(() => {
    if (!vistaDependenteAtual) return;
    if (nivelAtivoId !== vistaDependenteAtual.levelId) setNivelAtivoId(vistaDependenteAtual.levelId);
    navegar('ENQUADRAR');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaDependenteAtual?.id]);
  /** Armar o arraste do recorte: `null` = desarmado; `'nova'` = cria; id = redefine o recorte dessa vista. */
  const [recorteArmado, setRecorteArmado] = useState<null | 'nova' | string>(null);
  /**
   * SITUAÇÃO · IMPLANTAÇÃO · COBERTURA (E0.3): a planta baixa com o pavimento e
   * o recorte que o módulo decide. O canvas é o mesmo; o que muda são o
   * `levelId`, os `ocultos` e as anotações forçadas — por cima do estado do
   * usuário, sem gravá-lo (voltar à Planta devolve tudo como estava).
   */
  const vistaDePlanta = ehVistaDePlanta(vista) ? vista : null;
  const nivelDaVistaDePlanta = useMemo(
    // `ATUAL` (planta de forro): o pavimento ativo — `levelId` só nasce mais
    // abaixo, então a mesma resolução (guardado, senão o primeiro) é refeita aqui.
    () => (vistaDePlanta ? nivelDaVista(editor.model, vistaDePlanta) ?? editor.model.levels.find((l) => l.id === nivelAtivoId) ?? editor.model.levels[0] ?? null : null),
    [vistaDePlanta, editor.model, nivelAtivoId],
  );
  /** PLANTA DE FORRO (P2.14): o forro de cada ambiente do pavimento em vista, e a hachura de quem tem forro. */
  const plantaDeForro = useMemo(() => {
    if (vistaDePlanta !== 'forro' || !nivelDaVistaDePlanta) return null;
    const forros = forrosDoNivel(editor.model, nivelDaVistaDePlanta);
    return { forros, comForro: new Set(forros.filter((f) => f.material !== null).map((f) => f.spaceId)), resumo: resumoDaPlantaDeForro(editor.model, nivelDaVistaDePlanta) };
  }, [vistaDePlanta, nivelDaVistaDePlanta, editor.model]);
  /** PLANTA DE DEPARTAMENTOS (P2.22): o quadro por setor do pavimento em vista — a faixa e o rótulo saem dele. */
  const plantaDeDepartamentos = useMemo(() => {
    if (vistaDePlanta !== 'departamentos' || !nivelDaVistaDePlanta) return null;
    return { quadro: quadroDeDepartamentos(editor.model, nivelDaVistaDePlanta.id) };
  }, [vistaDePlanta, nivelDaVistaDePlanta, editor.model]);
  const ajusteDaVista = vistaDePlanta ? AJUSTE_DA_VISTA[vistaDePlanta] : null;
  /**
   * O corte que esta SENDO VISTO, quando a vista e um.
   *
   * `null` quando a vista e outra - e tambem quando o corte foi APAGADO com a
   * vista aberta nele. Sem esse segundo caso o editor ficaria numa vista sem
   * objeto; aqui ele cai de volta na planta, que e o comportamento de quem
   * apaga justamente o desenho que estava olhando.
   */
  const corteAtual =
    (editor.model.sections ?? []).find((c) => c.id === corteDaVista(vista)) ?? null;
  /** Elevacao OU corte - as duas vistas que o `ElevationCanvas` desenha. */
  const vistaEhProjecao = ehVistaDeProjecao(vista) && (!corteDaVista(vista) || !!corteAtual);
  const em3d = vista === '3d';
  // As abas que esta vista admite, e a que está aberta de fato. "Modificar" só
  // com seleção na planta.
  const modificarDisponivel = !emVista && editor.selectedIds.length > 0;
  const abasDoRibbon = ABAS_DO_RIBBON.filter(
    (a) => (!emVista || a.naVista) && (a.id !== 'modificar' || modificarDisponivel),
  );
  /**
   * Se a pessoa está na aba contextual. Estado de sessão, separado da aba
   * salva: quando a seleção some, volta-se à aba de trabalho sem perdê-la; e
   * na próxima seleção Modificar reabre sozinha — é o que faz a aba ser
   * "contextual" e não só mais uma aba. Não é auto-aberta na PRIMEIRA
   * seleção: quem está em Instalações clicando pontos não quer o ribbon
   * pulando a cada clique. Quem a escolheu uma vez, a recebe.
   */
  const [emModificar, setEmModificar] = useState(false);
  // Fora da planta, a aba de Arquitetura não existe — e o que se quer ali é
  // olhar (Exibir, Enquadrar, Inverter o lado), então a preferida é Vista.
  const aba: AbaDoRibbonDoEditor =
    emModificar && modificarDisponivel
      ? 'modificar'
      : abaEfetiva(
          abasDoRibbon.filter((a) => a.id !== 'modificar'),
          abaSalva,
          'vista',
        );
  const escolherAba = (id: AbaDoRibbonDoEditor) => {
    if (id === 'modificar') {
      setEmModificar(true);
      return;
    }
    setEmModificar(false);
    setAbaSalva(id);
  };

  /**
   * A TAREFA aberta no painel e o RELATÓRIO aberto no dock. Estado de sessão,
   * não preferência: reabrir o editor com "Importar do IFC" aberto seria
   * estranho. Fora da planta não há tarefa; o relatório que a vista não admite
   * some (e volta quando se volta), sem apagar a escolha.
   */
  const [tarefa, setTarefa] = useState<TarefaDoPainel | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioDoDock | null>(null);
  /**
   * TELAS PRÓPRIAS (15/09/2026, pedido: *"quadro de cargas e unifilar em drawer
   * ficou muito ruim visualização. vamos criar uma tela nova para cada um"*).
   *
   * O quadro de cargas é uma tabela larga (circuito × tensão × VA × seção ×
   * disjuntor × conferência) e o unifilar é um desenho que só cresce para o
   * lado — os dois brigavam com os 672 px do drawer. Cada um vira uma TELA em
   * fluxo (título + botão Voltar, sidebar e casca visíveis), no lugar do
   * editor, que fica montado mas escondido — zoom, seleção e histórico
   * sobrevivem ao ir e voltar. Nada de `fixed inset-0`, nada de Sheet.
   * "Projeto executivo (ART)" foi junto em 15/09/2026 ("transformar drawer
   * Projeto executivo elétrico (ART) também em tela"): a lista de verificações
   * e as emissões anteriores são leitura longa, não um formulário curto.
   */
  const [telaAberta, setTelaAberta] = useState<TelaDaEletrica | null>(null);
  const alternarTela = (id: TelaDaEletrica) => setTelaAberta((t) => (t === id ? null : id));
  const tarefaAberta = emVista ? null : tarefa;
  /**
   * MODO TELA CHEIA (14/09/2026, pedido: *"Modo tela cheia"*). O editor sai do
   * miolo do shell e ocupa a janela inteira — a sidebar e o topo do ÒPURA
   * somem, o desenho ganha ~330 px de largura e 60 px de altura. Estado de
   * SESSÃO, não preferência: reabrir a planta já em tela cheia esconderia o
   * shell sem o usuário ter pedido desta vez.
   *
   * Dois níveis, um sobre o outro: a raiz vira `fixed inset-0` (z-40 — abaixo
   * dos Sheets em z-50, do confirm em 200 e dos toasts em 300; acima da
   * sidebar z-20 e do topo z-30) e, quando o navegador deixa, a janela entra
   * em Fullscreen de verdade. Sair por Esc/F11 do navegador dispara
   * `fullscreenchange`, e o editor acompanha — senão o shell voltaria a
   * aparecer atrás de um editor que ainda se acha em tela cheia.
   *
   * Tela cheia aqui é EXPRESSAMENTE pedida e é um modo de um editor CAD, não
   * o layout de um painel — ver a regra de nunca usar tela cheia para painéis.
   */
  const [telaCheia, setTelaCheia] = useState(false);
  const alternarTelaCheia = useCallback(() => {
    setTelaCheia((v) => {
      const proximo = !v;
      const doc = typeof document !== 'undefined' ? document : null;
      if (proximo) {
        void doc?.documentElement.requestFullscreen?.().catch(() => undefined);
      } else if (doc?.fullscreenElement) {
        void doc.exitFullscreen?.().catch(() => undefined);
      }
      return proximo;
    });
  }, []);
  useEffect(() => {
    if (!telaCheia || typeof document === 'undefined') return;
    // Só reage à SAÍDA feita pelo navegador. Se `requestFullscreen` nem
    // chegou a entrar (iframe, permissão), não há evento e o modo interno
    // segue valendo sozinho — que é o que o botão promete.
    const aoMudar = () => {
      if (!document.fullscreenElement) setTelaCheia(false);
    };
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, [telaCheia]);
  /**
   * TAREFA EM DRAWER (13/09/2026). Primeiro como teste em "Distribuir
   * tomadas" (*"o painel ainda está com bastante informação. Vamos adotar
   * drawer para teste"*), depois estendido às outras cinco (*"migrar as outras
   * quatro tarefas"*): toda tarefa abre num `Sheet` (§26 do guia) por cima da
   * tela; a metade de baixo do painel fica só com as Propriedades da seleção.
   *
   * O drawer é MODAL — e duas tarefas precisam do canvas no meio do caminho:
   * "Do PDF" marca uma região por arraste, e o terreno traça perfil/drenagem.
   * `drawerRecolhido` resolve a primeira: armar a região recolhe o drawer,
   * marcar a região (ou desistir com Esc) o traz de volta, com a tarefa
   * intacta. Traçar perfil/drenagem FECHA a tarefa — é um gesto longo, com
   * ferramenta própria, e a pessoa volta pelo ribbon quando terminar.
   */
  const [drawerRecolhido, setDrawerRecolhido] = useState(false);
  const relatorioVisivel = useCallback(
    (id: RelatorioDoDock) =>
      !emVista ||
      RELATORIOS_DO_DOCK[id].naVista ||
      (vista === '3d' && RELATORIOS_DO_DOCK[id].no3d),
    [emVista, vista],
  );
  const relatorioAberto = relatorio && relatorioVisivel(relatorio) ? relatorio : null;
  /**
   * O QUADRO DE CARGAS abre em DRAWER, não no dock (pedido de 13/09/2026:
   * *"implementar drawer também no quadro de cargas que hoje abre painel
   * embaixo"*). É o relatório em que se EDITA — circuitos, ligação, DR,
   * hipóteses, emissão — e o formato de tarefa serviu melhor a isso. Os
   * demais relatórios (listas e tabelas de leitura) seguem no dock.
   */
  /**
   * O que abre em DRAWER (13/09–14/09/2026): primeiro o quadro de cargas
   * (onde se edita); depois, a pedido, os quatro de Analisar — *"Converter em
   * drawer: analisar < conflitos; medições; quantitativos; orçamento"*. O dock
   * fica só com Comentários e Versões (Colaborar), que se leem olhando o
   * desenho ao lado.
   */
  // "Armadura" entrou aqui em 16/09/2026 (*"criar tela própria para armadura"*): é da aba Analisar, não da elétrica — o nome do tipo ficou pelo histórico.
  // "Quantitativos" virou TELA em 17/09/2026 (*"criar nova tela também em vez de drawer"*).
  type TelaDaEletrica = 'quadro-de-cargas' | 'unifilar' | 'executivo-eletrico' | 'armadura' | 'quantitativos' | 'unidades' | 'legislacao' | 'programa' | 'avaliacao' | 'alternativas' | 'gerar' | 'materiais' | 'api' | 'webhooks' | 'plugins' | 'plugin' | 'acesso' | 'travas' | 'antes-depois' | 'compras' | 'tipos' | 'parametros' | 'tabelas';
  const RELATORIOS_EM_DRAWER: ReadonlySet<RelatorioDoDock> = new Set([
    'conflitos',
    'restricoes',
    // B2: é tabela de consulta, e o critério vigente manda tabela para o drawer.
    'loteamento',
    'medicoes',
    'orcamento',
  ]);
  const relatorioNoDock = relatorioAberto && !RELATORIOS_EM_DRAWER.has(relatorioAberto) ? relatorioAberto : null;
  const relatorioNoDrawer = relatorioAberto && RELATORIOS_EM_DRAWER.has(relatorioAberto) ? relatorioAberto : null;
  const alternarTarefa = (id: TarefaDoPainel) => {
    setDrawerRecolhido(false);
    setTarefa((t) => (t === id ? null : id));
  };
  /**
   * IMPORTAR LEVANTAMENTO (25/09/2026, P2.64) — *"planta inteligente < terreno:
   * implemente importar levantamento topográfico"*.
   *
   * A importação existe desde 11/09 e lê nove formatos; o que faltava era o
   * CAMINHO. Estava a quatro passos: Dados do lote › fonte "Pontos cotados" ›
   * botãozinho "Importar" na linha dos pontos. Aqui vira um clique.
   *
   * Três coisas, nesta ordem: a fonte precisa ser "Pontos cotados" (nas fontes
   * remotas a importação nem aparece), a gaveta precisa estar aberta, e o
   * pedido — um número de SÉRIE — atravessa até o `<input type="file">` que já
   * mora no painel. `setTarefa` e não `alternarTarefa`: alternar FECHARIA a
   * gaveta se ela já estivesse aberta.
   */
  const [pedidoDeImportacaoDeLevantamento, setPedidoDeImportacaoDeLevantamento] = useState(0);
  /**
   * LANÇAR O LOTE DO ARQUIVO (25/09/2026, P2.65) — *"o levantamento topográfico
   * já vem com o contorno do lote"*.
   *
   * O anel vem do importador já convertido e ancorado como os pontos; aqui ele
   * só vira divisa: um `AddBoundary` por lado, fechando no primeiro, num lote
   * só — um passo de desfazer. Papel de cada lado e medida da escritura ficam
   * para o Quadro de divisas, que abre sozinho quando o contorno fecha.
   */
  function lancarLoteDoArquivo(pontos: { x: number; y: number }[]) {
    if (pontos.length < 3 || !levelId) return;
    try {
      editor.runBatch(
        pontos.map((a, i) => ({
          type: 'AddBoundary' as const,
          levelId,
          a: { x: Math.round(a.x), y: Math.round(a.y) },
          b: { x: Math.round(pontos[(i + 1) % pontos.length].x), y: Math.round(pontos[(i + 1) % pontos.length].y) },
          kind: 'TERRENO' as const,
        })),
      );
    } catch (e) {
      setAvisoConexaoT(
        e instanceof Error ? `O desenho recusou o contorno do arquivo: ${e.message}` : 'O desenho recusou o contorno do arquivo.',
      );
    }
  }
  function importarLevantamento() {
    topografia.setFonteCodigo('PONTOS_COTADOS');
    setDrawerRecolhido(false);
    setTarefa('terreno');
    setPedidoDeImportacaoDeLevantamento((n) => n + 1);
  }

  const alternarRelatorio = (id: RelatorioDoDock) => setRelatorio((r) => (r === id ? null : id));
  const dock = useAlturaDoDock();
  const [ortogonal, setOrtogonal] = useState(true);
  /**
   * O que acontece nas junções quando se move PARTE do desenho.
   *
   * `MANTER` é o padrão, e a razão não é preferência de CAD: aqui a topologia É o
   * dado. Ambiente, área, perímetro e o de-para do orçamento derivam do anel
   * fechado — desencostar uma junção apaga tudo isso sem erro nenhum na tela. A
   * conexão é INTENÇÃO; o comprimento da vizinha é consequência. O padrão antigo
   * (`MOVER`) descartava a intenção para preservar a consequência, e ainda exigia
   * "Conectar automaticamente" depois para desfazer o estrago.
   *
   * O custo do erro também é assimétrico: quem queria soltar e manteve desfaz com
   * um Ctrl+Z sobre um modelo que nunca ficou inválido; quem queria manter e
   * soltou pode só descobrir várias edições depois.
   *
   * `SOLTAR` continua existindo porque desprender um bloco é legítimo — só não é
   * o que se quer na maioria das vezes.
   */
  const [modoJuncao, setModoJuncao] = usePersistedState<'MANTER' | 'SOLTAR'>(
    'blueprint:modoJuncao',
    'MANTER',
  );
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [gravandoArea, setGravandoArea] = useState(false);
  const [erroArea, setErroArea] = useState<string | null>(null);
  // ── O QUE APARECE NO DESENHO ─────────────────────────────────────────────
  //
  // Todos em `usePersistedState`, e não em `useState`: são preferências de
  // trabalho, não estado de gesto. Quem trabalha com Cotas ligado as ligava de
  // novo a cada vez que voltava ao editor, porque remontar o componente zerava
  // tudo. A chave `blueprint:*` é a mesma família de `blueprint:modoJuncao`.

  /**
   * Quais tipos de ENCAIXE valem — a barra de osnap.
   *
   * ⚠️ Guardado como LISTA, e não como `Set`: `usePersistedState` serializa em
   * JSON, e um `Set` volta do `localStorage` como `{}`. O sintoma seria o ímã
   * parar de funcionar por inteiro depois de recarregar a página — e só depois
   * de recarregar, que é o pior lugar para procurar.
   *
   * Padrão: TODOS ligados. É o comportamento de antes deste controle existir, e
   * quem nunca ouviu falar dele não pode notar que ele nasceu.
   */
  const [encaixesLigados, setEncaixesLigados] = usePersistedState<string[]>(
    'blueprint:encaixes',
    [...TIPOS_DE_ENCAIXE],
  );
  const encaixesAtivos = useMemo(() => new Set(encaixesLigados), [encaixesLigados]);
  const alternarEncaixe = useCallback(
    (chave: string) =>
      setEncaixesLigados((atual) =>
        atual.includes(chave) ? atual.filter((k) => k !== chave) : [...atual, chave],
      ),
    [setEncaixesLigados],
  );

  /**
   * O circuito escrito ao lado de cada ponto elétrico.
   *
   * LIGADO por padrão: é informação de projeto, e a ausência dela é que era o
   * defeito. Quem desenha só arquitetura desliga uma vez e a escolha fica.
   */
  const [mostrarCircuitos, setMostrarCircuitos] = usePersistedState(
    'blueprint:mostrarCircuitos',
    true,
  );

  /** Mostra o comprimento de cada parede no desenho, como uma cota de planta. */
  const [mostrarMedidas, setMostrarMedidas] = usePersistedState(
    'blueprint:mostrarMedidas',
    false,
  );
  /**
   * Pinta as faixas de material dentro da espessura de cada parede.
   *
   * Desligado por padrão: numa vista geral a composição vira listra sobre
   * listra e come a leitura do partido. Quem está detalhando a parede liga, e a
   * escolha sobrevive à navegação como as demais desta família.
   */
  const [mostrarCamadas, setMostrarCamadas] = usePersistedState(
    'blueprint:mostrarCamadas',
    false,
  );
  /** Cadeias de cota por lado — total/parcial/interna, a convenção de prancha. */
  const [mostrarCotas, setMostrarCotas] = usePersistedState('blueprint:mostrarCotas', false);
  /**
   * Só a cadeia INTERNA — cada ambiente de face a face.
   *
   * Botão próprio porque é a medida que se lê numa planta ("quanto tem esta
   * cozinha?") e a cadeia completa é densa demais para ficar ligada sempre.
   * Também é o que desfaz a confusão com o `livre` do botão Medidas, que mede a
   * PAREDE inteira e ignora as divisórias que a cortam.
   */
  const [mostrarCotaInterna, setMostrarCotaInterna] = usePersistedState(
    'blueprint:mostrarCotaInterna',
    false,
  );
  /** Nome, área e perímetro escritos dentro de cada ambiente. */
  const [mostrarRotulos, setMostrarRotulos] = usePersistedState(
    'blueprint:mostrarRotulos',
    false,
  );
  /**
   * A grade.
   *
   * ⚠️ Liga e desliga o DESENHO da grade, não o ENCAIXE. Quem esconde a grade
   * quer conferir o traçado contra a planta de fundo sem o quadriculado por
   * cima — não quer desenhar fora de medida.
   */
  const [mostrarGrade, setMostrarGrade] = usePersistedState('blueprint:mostrarGrade', true);
  /** O azul claro por dentro dos ambientes derivados. */
  const [mostrarPreenchimento, setMostrarPreenchimento] = usePersistedState(
    'blueprint:mostrarPreenchimento',
    true,
  );
  /**
   * O verde fraco por dentro do anel do LOTE.
   *
   * Chave própria, separada da do preenchimento dos ambientes: o lote é o chão
   * sob tudo, e apagá-lo é justamente o gesto de quem vai conferir o traçado
   * contra o levantamento topográfico. Um toggle só para os dois obrigaria a
   * perder a cor dos cômodos junto.
   */
  const [mostrarPreenchimentoTerreno, setMostrarPreenchimentoTerreno] = usePersistedState(
    'blueprint:mostrarPreenchimentoTerreno',
    true,
  );
  /**
   * As curvas de nível da versão de topografia exibida (e os pontos cotados em
   * edição). Chave própria: quem confere o traçado contra a planta de fundo
   * apaga o lote e quer as curvas; quem cota a alvenaria quer o contrário.
   */
  const [mostrarCurvasDeNivel, setMostrarCurvasDeNivel] = usePersistedState(
    'blueprint:mostrarCurvasDeNivel',
    true,
  );
  /** Faixas de declividade pintadas sob as curvas. Nasce desligado: é leitura, não desenho. */
  const [mostrarDeclividade, setMostrarDeclividade] = usePersistedState(
    'blueprint:mostrarDeclividade',
    false,
  );
  /** Hachura de corte/aterro do platô, na planta e no corte. */
  const [mostrarTerraplenagem, setMostrarTerraplenagem] = usePersistedState(
    'blueprint:mostrarTerraplenagem',
    true,
  );
  /** Mapa hipsométrico (fase 3). Exclusivo com a declividade: duas pinturas não se leem. */
  const [mostrarHipsometria, setMostrarHipsometria] = usePersistedState(
    'blueprint:mostrarHipsometria',
    false,
  );
  /** Fase 4: classes hipsométricas iguais (8) ou em cotas redondas por equidistância. */
  const [hipsometriaModo, setHipsometriaModo] = usePersistedState<'IGUAIS' | 'EQUIDISTANCIA' | 'CONTINUO'>(
    'blueprint:hipsometriaModo',
    'IGUAIS',
  );
  /** Fase 12 (Contour Map Creator): curvas coloridas pela cota, nós da grade, casas da legenda. */
  const [curvasPelaCota, setCurvasPelaCota] = usePersistedState<boolean>('blueprint:curvasPelaCota', false);
  const [mostrarNosDaGrade, setMostrarNosDaGrade] = usePersistedState<boolean>('blueprint:nosDaGrade', false);
  const [casasDaLegenda, setCasasDaLegenda] = usePersistedState<number>('blueprint:casasDaLegenda', 2);
  /** Intervalo do modo por equidistância; `null` = a equidistância da versão. */
  const [hipsometriaIntervaloM, setHipsometriaIntervaloM] = usePersistedState<number | null>(
    'blueprint:hipsometriaIntervaloM',
    null,
  );
  /** De onde vem a linha do perfil: um corte, ou a linha desenhada com a ferramenta Perfil. */
  const [origemDoPerfil, setOrigemDoPerfil] = usePersistedState<'CORTE' | 'LINHA'>(
    'blueprint:origemDoPerfil',
    'CORTE',
  );
  /** Qual das linhas desenhadas é a do perfil (fase 5: várias por estudo). */
  const [linhaDoPerfilIndice, setLinhaDoPerfilIndice] = usePersistedState<number>(
    'blueprint:linhaDoPerfilIndice',
    0,
  );
  /**
   * A hachura do envelope construtivo (área construível, terreno menos recuos).
   *
   * Chave própria: é uma restrição calculada, diferente do preenchimento do
   * lote. Antes desligava-se junto com "Preenchimento do terreno" sem querer,
   * porque não tinha item nenhum no menu — a hachura ficava desenhada por
   * cima mesmo com tudo desligado.
   */
  const [mostrarEnvelope, setMostrarEnvelope] = usePersistedState(
    'blueprint:mostrarEnvelope',
    true,
  );
  /** Uma cor por ambiente em vez do azul único — separa cômodos vizinhos. (Legado: hoje é o modo AMBIENTE de `modoDeCor`.) */
  const [coresPorAmbiente, setCoresPorAmbiente] = usePersistedState(
    'blueprint:coresPorAmbiente',
    false,
  );
  /** COLORIR POR (E8.2): a paleta dos ambientes. Nasce do legado: quem tinha "uma cor por ambiente" ligado segue em AMBIENTE. */
  const [modoDeCor, setModoDeCor] = usePersistedState<ModoDeCor>('blueprint:modoDeCor', coresPorAmbiente ? 'AMBIENTE' : 'NENHUM');
  /** ESTILO DO 3D (E8.2): sombreado, linha oculta ou transparente. */
  const [estilo3d, setEstilo3d] = usePersistedState<Estilo3d>('blueprint:vista3dEstilo', 'SOMBREADO');
  /** ESTILO DA PLANTA (E8.4): técnica ou humanizada (pisos por material, sombra, mobiliário colorido, vegetação). */
  const [estiloPlanta, setEstiloPlanta] = usePersistedState<EstiloDaPlanta>('blueprint:estiloPlanta', 'TECNICA');
  /** FASES DE REFORMA (E10.2): o filtro da vista (tudo / antes / depois / só demolição). */
  const [filtroDeFase, setFiltroDeFase] = usePersistedState<FiltroDeFase>('blueprint:filtroDeFase', 'TUDO');
  /** TEMPLATES DE VISTA da organização (E8.2), além dos de fábrica. */
  const [templatesDaOrg, setTemplatesDaOrg] = useState<TemplateDeVista[]>([]);
  const [templatesIndisponiveis, setTemplatesIndisponiveis] = useState<string | null>(null);
  const [templatesCarregando, setTemplatesCarregando] = useState(false);
  /** Cota em preto sobre fundo opaco, para planta de fundo escaneada carregada. */
  const [cotaAltoContraste, setCotaAltoContraste] = usePersistedState(
    'blueprint:cotaAltoContraste',
    false,
  );
  /**
   * Passo do MOVER. `'grade'` = segue o seletor de Grade (que em automático
   * segue o zoom); qualquer número fixa o passo em mm, independente do zoom.
   *
   * Nasce em `'grade'` para não mudar o comportamento de quem já usava o editor:
   * quem quer precisão fixa agora tem onde pedir, e quem não pediu segue igual.
   */
  const [passoMover, setPassoMover] = usePersistedState<number | 'grade'>(
    'blueprint:passoMover',
    'grade',
  );
  /** Lados da ferramenta Polígono. 6 porque quem escolhe a ferramenta quer o
   * que o traçado manual não dá de graça — retângulo já sai fácil à mão. */
  const [ladosPoligono, setLadosPoligono] = useState(6);
  /**
   * Onde o clique cai: no eixo ou na face da parede.
   *
   * O padrão é a FACE À DIREITA porque o trabalho real aqui é copiar planta de
   * fundo: quem copia aponta o canto que está desenhado, e contornando o perímetro
   * no sentido do relógio a parede nasce para dentro. Desenhar pelo eixo continua
   * a um clique de distância, para quem está criando planta nova.
   */
  const [alinhamento, setAlinhamento] = useState<AlinhamentoParede>('DIREITA');
  /** Aferição em curso: os dois pontos já clicados, esperando a distância. */
  const [afericao, setAfericao] = useState<{ p1: PontoPx; p2: PontoPx } | null>(null);
  const [distanciaDigitada, setDistanciaDigitada] = useState('');
  const [alinharNaAfericao, setAlinharNaAfericao] = useState(false);
  const [qtdOficial, setQtdOficial] = useState<BlueprintQuantitySnapshot | null>(null);
  const [gerando, setGerando] = useState(false);
  const [tipoAbertura, setTipoAbertura] = useState<TipoAbertura>('door');
  /**
   * Vão sob o cursor na LISTA, aceso no desenho.
   *
   * Sem isso, casar a linha "Vão 3" com o vão certo na planta dependia da
   * medida — e a medida se repete: numa planta real havia quatro vãos de
   * 0,98 m. O número no desenho resolve o caso parado; acender resolve o caso
   * em movimento, que é o de quem está revisando a lista de cima a baixo.
   */
  const [vaoEmDestaque, setVaoEmDestaque] = useState<number | null>(null);
  /**
   * Só vale para porta de correr: a folha entra na parede (bolso) ou corre
   * sobre a face.
   *
   * Nasce em POR FORA porque é a forma comum, e porque bolso exige parede
   * preparada — quem tem bolso sabe que tem; quem não pensou no assunto não
   * tem, e o padrão não pode inventar uma parede oca que ninguém construiu.
   */
  const [correrEmbutida, setCorrerEmbutida] = useState(false);

  /**
   * Que peça o menu Estrutural está apontando, e com que medidas ela nasce.
   *
   * O TIPO é estado da barra, não valor de `BlueprintTool` — a mesma decisão do
   * `tipoAbertura` logo acima, e pelo mesmo motivo: seis ferramentas para uma
   * família obrigariam todo `switch` de gesto no canvas a enumerá-las.
   *
   * As MEDIDAS são um estado só, trocado inteiro quando o tipo muda
   * (`PADRAO_ESTRUTURAL`). Guardar uma seção por tipo pareceria mais gentil e
   * seria pior: quem ajustou a viga para 15×60, foi lançar um pilar e voltou,
   * encontraria a viga em 20×40 de novo se o estado fosse compartilhado — e
   * encontraria seis conjuntos para conferir se fossem separados. Um estado que
   * o menu reinicia é previsível: o tipo novo vem como o tipo novo nasce.
   */
  const [tipoEstrutural, setTipoEstrutural] = useState<StructuralKind>('PILAR');
  /**
   * A PRÓXIMA água: inclinação em % e beiral em mm. Estado da barra, como as
   * medidas da estrutura — a peça já lançada se edita no painel lateral.
   */
  const [inclinacaoTelhado, setInclinacaoTelhado] = useState(30);
  /** COBERTURA POR EXTRUSÃO (P2.13): o perfil da PRÓXIMA extrusão — persistido, como a vista. */
  const [perfilDaExtrusao, setPerfilDaExtrusao] = usePersistedState<ParametrosDoPerfil & { espessuraMm: number }>('blueprint:cobertura-extrusao', {
    tipo: 'DUAS_AGUAS',
    vaoMm: 8000,
    alturaBeiralMm: 3000,
    alturaCumeeiraMm: 4200,
    flechaMm: 2000,
    dentes: 3,
    espessuraMm: 120,
  });
  const [beiralTelhado, setBeiralTelhado] = useState(500);
  /**
   * A PROXIMA escada: tipo, largura e alvo de espelho. Estado da barra, como o
   * telhado. O numero de degraus NAO esta aqui, e nao por esquecimento: ele sai
   * do desnivel, e um campo de degraus na barra abriria a porta que a familia
   * fechou (ver `escada.ts`).
   */
  const [tipoCirculacao, setTipoCirculacao] = useState<TipoCirculacao>('ESCADA');
  /** NÚCLEO VERTICAL (E2.4): shaft ou elevador na próxima caixa desenhada. */
  const [tipoDeNucleo, setTipoDeNucleo] = useState<TipoDeNucleo>('SHAFT');
  /** SUB-REGIÃO DO TERRENO (P2.19): o material da próxima; persistido. */
  const [materialDaSubRegiao, setMaterialDaSubRegiao] = usePersistedState<MaterialDeSubRegiao>('blueprint:subregiao-material', 'GRAMA');
  // LOTEAMENTO (B1). O nome da quadra e o numero do lote andam SOZINHOS depois
  // de cada peca: desenhar 20 lotes digitando o numero de cada um seria o
  // trabalho que a ferramenta existe para tirar. Numerar de novo pelo comando
  // "Numerar" reescreve tudo em ordem.
  const [nomeDaQuadra, setNomeDaQuadra] = usePersistedState<string>('blueprint:loteamento-quadra', 'A');
  // B2: a tarefa de lotear. A quadra escolhida NÃO é persistida (é do desenho
  // aberto); os parâmetros sim — quem lotea um bairro repete a mesma testada.
  const [quadraALotear, setQuadraALotear] = useState<ObjectId | null>(null);
  const [parametrosDaSubdivisao, setParametrosDaSubdivisao] = usePersistedState<ParametrosDaSubdivisao>('blueprint:subdivisao', SUBDIVISAO_PADRAO);
  const [resultadoDeLotear, setResultadoDeLotear] = useState<string | null>(null);
  const [numeroDoLote, setNumeroDoLote] = usePersistedState<string>('blueprint:loteamento-lote', '1');
  const [larguraDaVia, setLarguraDaVia] = usePersistedState<number>('blueprint:loteamento-via-largura', 12000);
  const [calcadaDaVia, setCalcadaDaVia] = usePersistedState<number>('blueprint:loteamento-via-calcada', 2000);
  const [nomeDaVia, setNomeDaVia] = usePersistedState<string>('blueprint:loteamento-via-nome', 'Rua 1');
  const [tipoDeAreaPublica, setTipoDeAreaPublica] = usePersistedState<TipoDeAreaPublica>('blueprint:loteamento-area-tipo', 'VERDE');
  /** MECÂNICA (E11.1): o shaft nasce com a disciplina escolhida no menu (`MECANICA`) ou geral (`null`). */
  const [disciplinaDoNucleo, setDisciplinaDoNucleo] = useState<DisciplinaDeRede | null>(null);
  /** VAGA (E2.5): o tipo do próximo clique; hipóteses do lançamento lembradas entre sessões. */
  const [tipoDeVaga, setTipoDeVaga] = useState<TipoDeVaga>('COMUM');
  /** COMPONENTE (E7.1): o tipo do catálogo do próximo clique. */
  const [tipoDeComponente, setTipoDeComponente] = useState<TipoDeComponente>('CAMA_CASAL');
  /** GUARDA-CORPO (E7.3): o tipo do próximo par de cliques; hipóteses da sugestão lembradas entre sessões. */
  const [tipoDeGuardaCorpo, setTipoDeGuardaCorpo] = useState<TipoDeGuardaCorpo>('GUARDA_CORPO');
  /** ANOTAÇÃO (E8.1): o tipo do próximo traçado. */
  const [tipoDeAnotacao, setTipoDeAnotacao] = useState<TipoDeAnotacao>('TEXTO');
  /** NUVEM DE REVISÃO (P2.15): a revisão em que as PRÓXIMAS nuvens nascem; null = a próxima livre. */
  const [numeroDaRevisaoEscolhido, setNumeroDaRevisaoEscolhido] = useState<number | null>(null);
  const numeroDaRevisao = numeroDaRevisaoEscolhido ?? proximaRevisao(editor.model);
  const [hipotesesDeGuardaCorpo, setHipotesesDeGuardaCorpo] = usePersistedState<HipotesesDeGuardaCorpo>('blueprint:guardaCorpos', HIPOTESES_DE_GUARDA_CORPO_PADRAO);
  /** RODAPÉ COMO ELEMENTO (P2.21): altura/item padrão do gerador. */
  const [hipotesesDeRodape, setHipotesesDeRodape] = usePersistedState<HipotesesDeRodape>('blueprint:rodapes', HIPOTESES_DE_RODAPE_PADRAO);
  /** LOD (P2): o alvo por família é da pessoa (persistido); o LOD de cada peça é lido do desenho. */
  const [alvoDeLod, setAlvoDeLod] = usePersistedState<AlvoDeLod>('blueprint:lod-alvo', ALVO_DE_LOD_PADRAO);
  /** ETAPAS (P2): a etapa em vista (por estudo não — é de tela; some se a etapa sumir). */
  const [etapaEmVista, setEtapaEmVista] = usePersistedState<string | null>('blueprint:etapaEmVista', null);
  const [hipotesesDeVagas, setHipotesesDeVagas] = usePersistedState<HipotesesDeVagas>('blueprint:vagas', HIPOTESES_VAGAS_PADRAO);
  const [regiaoDeVagasPedida, setRegiaoDeVagasPedida] = useState<RegiaoDeVagas | null>(null);
  /** ACABAMENTOS (E7.2): o ambiente que a gaveta abre já expandido (vindo do cartão). */
  const [ambienteDeAcabamentos, setAmbienteDeAcabamentos] = useState<ObjectId | null>(null);
  const [resultadoDeVagas, setResultadoDeVagas] = useState<string | null>(null);

  /**
   * INSTALAÇÕES: disciplina, cota e bitola do que está sendo desenhado.
   *
   * Estado da BARRA, como o tipo de esquadria e a inclinação do telhado — e não
   * da ferramenta, que é uma só para as quatro disciplinas (ver `BlueprintTool`).
   */
  const [disciplinaDeRede, setDisciplinaDeRede] = useState<DisciplinaDeRede>('ELETRICA');
  const [cotaDeRede, setCotaDeRede] = useState(COTA_PADRAO_MM.ELETRICA);
  /**
   * A CLASSIFICAÇÃO que a ferramenta vai aplicar ao próximo ponto elétrico.
   *
   * Estado da BARRA, como a disciplina: escolher "arandela" no menu e desenhar
   * três seguidas é o gesto — reabrir o menu a cada peça seria pior que não ter
   * a taxonomia.
   */
  const [tipoDePontoEletrico, setTipoDePontoEletrico] =
    useState<TipoDePontoEletrico | null>(null);
  /** A variante do interruptor escolhida no menu — só vale com `INTERRUPTOR`. */
  const [tipoDeInterruptor, setTipoDeInterruptor] = useState<TipoDeInterruptor | null>(null);
  /** A classificação HIDRÁULICA do próximo ponto (18/09/2026) — irmã da elétrica. */
  const [tipoDePontoHidraulico, setTipoDePontoHidraulico] = useState<TipoDePontoHidraulico | null>(null);
  /** A prumada de esgoto que a ferramenta `rede` cria num clique (tubo de queda / ventilação). */
  const [prumadaDeRede, setPrumadaDeRede] = useState<'QUEDA' | 'VENTILACAO' | null>(null);
  const [bitolaDeRede, setBitolaDeRede] = useState(BITOLA_PADRAO_MM.ELETRICA);
  const [tipoDeTerminal, setTipoDeTerminal] = useState('Tomada baixa');
  const [larguraEscada, setLarguraEscada] = useState(1200);
  const [alvoEspelho, setAlvoEspelho] = useState(175);
  const [medidasEstruturais, setMedidasEstruturais] = useState<MedidasEstruturais>(
    PADRAO_ESTRUTURAL.PILAR,
  );
  /** Rótulo da PRÓXIMA peça ("P1"). Some ao lançar — ver `adicionarEstrutural`. */
  const [rotuloEstrutural, setRotuloEstrutural] = useState('');

  /**
   * ─── SOBREPOSIÇÃO ENTRE COMPONENTES (01/09/2026) ────────────────────────────
   *
   * Pedido do usuário, com print do 3D: peça criada em cima de outra tem de
   * AVISAR, oferecendo desfazer ou descontar o volume de um dos dois lados.
   *
   * Dois estados, e a separação é o que faz o aviso funcionar: `recemCriado`
   * guarda o id até o modelo novo chegar (o `run` agenda o estado, não devolve
   * o modelo), e `disputa` é o que abre o modal.
   */
  const [recemCriado, setRecemCriado] = useState<string | null>(null);
  /** Recado quando o kernel recusa o corte. `null` = nada a dizer. */
  const [erroDoCorte, setErroDoCorte] = useState<string | null>(null);
  const [disputa, setDisputa] = useState<{
    pecaId: string;
    nome: string;
    paredeIds: string[];
    volumeM3: number;
    quantos: number;
  } | null>(null);

  /**
   * O nível que as ferramentas de desenho editam. Era fixo em `levels[0]`; agora
   * segue o pavimento escolhido no `PainelPavimentos` e volta ao primeiro quando
   * o escolhido é removido.
   */
  const levelId = useMemo(() => {
    const ids = editor.model.levels.map((l) => l.id);
    if (nivelAtivoId && ids.includes(nivelAtivoId)) return nivelAtivoId;
    return ids[0] ?? null;
  }, [editor.model.levels, nivelAtivoId]);
  /** O pavimento ativo, quando é cópia viva de um tipo (E2.1). */
  const nivelAtivoVinculado = useMemo(() => {
    const l = editor.model.levels.find((x) => x.id === levelId);
    const tipo = l?.tipoDeId ? editor.model.levels.find((x) => x.id === l.tipoDeId) : null;
    return l && tipo ? { id: l.id, name: l.name, tipo } : null;
  }, [editor.model.levels, levelId]);

  // Persiste o nível resolvido quando ele diverge do guardado (remoção, primeira
  // abertura do estudo).
  useEffect(() => {
    if (levelId && levelId !== nivelAtivoId) setNivelAtivoId(levelId);
  }, [levelId, nivelAtivoId, setNivelAtivoId]);

  // Mantém `niveisVisiveis` alinhado aos níveis reais: tira os que sumiram e, se
  // ficar vazio, volta a mostrar todos.
  useEffect(() => {
    const ids = editor.model.levels.map((l) => l.id);
    setNiveisVisiveis((prev) => {
      const filtrado = prev.filter((id) => ids.includes(id));
      return filtrado.length ? filtrado : ids;
    });
  }, [editor.model.levels]);

  /** `undefined` = todos (é o que `projetarElevacao`/3D entendem). */
  const levelIdsDaVista = niveisVisiveis.length ? niveisVisiveis : undefined;

  /**
   * Quais seções a vista atual comporta.
   *
   * Fora da planta baixa só sobrevivem Pavimentos, Quantitativos e Versões — as
   * demais editam o modelo, e elevação/3D são read-only. Antes esse recorte
   * apagava abas da barra; agora apaga seções inteiras, que é a mesma regra
   * dita no vocabulário novo.
   *
   * O 3D ganha ainda as marcadas `no3d` — hoje só "Componentes", que ali serve
   * de régua de visibilidade da cena e não de editor (ver `SECOES_DO_PAINEL`).
   */
  /**
   * ORDEM das seções do painel (17/09/2026). Persistida no navegador, como o
   * aberto/fechado: é preferência de leitura, não dado do estudo. Saneada na
   * leitura — id desconhecido cai fora, seção nova entra no fim.
   */
  const [ordemSalva, setOrdemSalva] = usePersistedState<string[]>(
    'blueprint:ordemDasSecoes',
    SECOES_DO_PAINEL.map((s) => s.id),
  );
  /** A ordem dos GRUPOS do acesso rápido (17/09/2026) — mesma natureza: preferência de leitura. */
  const [ordemDoAcessoRapido, setOrdemDoAcessoRapido] = usePersistedState<string[]>(
    'blueprint:ordemDoAcessoRapido',
    ['ferramenta', 'vistas', 'zoom', 'modos', 'editar', 'selecao', 'exibir', 'saida'],
  );
  const ordemDasSecoes = useMemo<SecaoDoPainel[]>(() => {
    const conhecidas = SECOES_DO_PAINEL.map((s) => s.id) as SecaoDoPainel[];
    const validas = (Array.isArray(ordemSalva) ? ordemSalva : []).filter((id): id is SecaoDoPainel => (conhecidas as string[]).includes(id));
    return [...new Set([...validas, ...conhecidas])];
  }, [ordemSalva]);
  const sensoresDasSecoes = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const aoSoltarSecao = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = ordemDasSecoes.indexOf(active.id as SecaoDoPainel);
    const para = ordemDasSecoes.indexOf(over.id as SecaoDoPainel);
    if (de < 0 || para < 0) return;
    setOrdemSalva(arrayMove(ordemDasSecoes, de, para));
  };

  const secaoVisivel = useCallback(
    (id: SecaoDoPainel) =>
      !emVista || SECOES_NA_VISTA.has(id) || (vista === '3d' && SECOES_NO_3D.has(id)),
    [emVista, vista],
  );
  /** As seções na ordem escolhida, só as que existem nesta vista. */
  const ordemVisivel = ordemDasSecoes.filter((id) => secaoVisivel(id));


  /**
   * O retângulo visível, em milímetro do modelo — a região da geração de
   * paredes. Vem do canvas porque é ele que tem a vista.
   */
  const [limitesDaVista, setLimitesDaVista] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  /**
   * A JANELA marcada à mão, e a arma que a define.
   *
   * Separada de `limitesDaVista` de propósito: o enquadramento muda a cada
   * rolagem de zoom, sem intenção; a janela é afirmada e sobrevive ao zoom. É
   * ela que permite escolher a espessura por tentativa e erro sem o conjunto
   * mudar por baixo.
   */
  const [regiao, setRegiao] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [regiaoArmada, setRegiaoArmada] = useState(false);

  /**
   * Aplica as paredes derivadas do PDF em UM passo de histórico.
   *
   * `runBatch` e não N chamadas de `run`: gerar 58 paredes com um comando cada
   * encheria o histórico de 58 passos, e desfazer uma escolha errada de
   * espessura viraria 58 Ctrl+Z. O painel promete que um desfazer remove tudo,
   * e é esta linha que cumpre a promessa.
   */
  const aplicarParedesGeradas = useCallback(
    (paredes: ParedeGerada[]) => {
      if (!levelId || paredes.length === 0) return;
      const novas = paredes.map((p) => ({
        type: 'AddWall' as const,
        levelId,
        a: p.a,
        b: p.b,
        // A espessura vem MEDIDA do desenho, não do seletor da barra: é o
        // dado que o pareamento produz, e ignorá-lo em favor do padrão de
        // 15 cm jogaria fora a informação mais confiável da extração.
        thicknessMm: p.espessuraMm,
        heightMm: ALTURA_PADRAO_MM,
      }));

      // A GERAÇÃO É A ORIGEM DO PROBLEMA DO T. O vetorizador deriva cada eixo do
      // par de faces que o desenha, e cada parede sai com o comprimento das faces
      // DELA — então o montante termina onde a face da hospedeira começa, e não no
      // eixo dela. Em planta o T fica perfeito; no modelo a ponta está solta, e
      // nenhum ambiente fecha. Medido na planta de um usuário: 13 pontas assim, e
      // zero ambientes até corrigi-las.
      //
      // ⚠️ SIMULAR ANTES DE GRAVAR, e não chamar a correção depois do `runBatch`.
      // `editor.model` é estado do React: logo depois de gravar ele ainda é o
      // modelo ANTIGO, sem as paredes novas — a correção rodaria sobre um arranjo
      // onde os T nem existem ainda, e não acharia nada. `applyBatch` do kernel dá
      // o modelo resultante na hora, e os IDs batem porque o contador de ids é
      // determinístico: o mesmo roteiro de comandos produz os mesmos ids.
      let correcoes: Command[] = [];
      try {
        correcoes = comandosDeConexao(applyBatch(editor.model, novas).model);
      } catch {
        // Se a simulação for recusada, o `runBatch` abaixo recusa igual e mostra o
        // erro. Gravar sem a correção é melhor que não gravar nada.
        correcoes = [];
      }

      // UM lote só: as paredes já nascem conectadas, e um Desfazer devolve o
      // estado anterior à geração inteira. Dois lotes deixariam um passo
      // intermediário — "geradas mas soltas" — que ninguém quer visitar.
      editor.runBatch([...novas, ...correcoes]);
      if (correcoes.length > 0) {
        setAvisoConexaoT(
          `${correcoes.length} ponta(s) das paredes geradas paravam na face da parede vizinha, sem alcançar ` +
            'o eixo — foram encostadas. Sem isso o desenho parece ligado e nenhum ambiente fecha.',
        );
      }
    },
    // `comandosDeConexao` fica FORA da lista de propósito: ele é declarado mais
    // abaixo no corpo, e citá-lo aqui seria lê-lo antes da inicialização — erro em
    // tempo de render. Não pode ficar obsoleto: ele é memoizado em `[levelId]`, que
    // já está nesta lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, levelId],
  );

  /**
   * As paredes do nível, como o gerador de portas precisa delas.
   *
   * A porta é hospedada numa parede QUE JÁ EXISTE — `AddOpening` exige
   * `wallId`. Por isso a ordem é parede primeiro, porta depois, e o painel diz
   * isso em vez de deixar o usuário descobrir com uma lista vazia.
   */
  const paredesParaPortas = useMemo(
    () =>
      editor.model.walls
        .filter((w) => w.levelId === levelId)
        // A espessura vai junto porque a dobradiça é medida até a FACE da
        // parede, não até o eixo — sem ela, três das cinco portas da prancha
        // real não casavam. Ver `FOLGA_DOBRADICA_MM`.
        .map((w) => ({ id: w.id, a: w.a, b: w.b, espessuraMm: w.thicknessMm })),
    [editor.model.walls, levelId],
  );

  /**
   * Aplica as portas derivadas dos arcos, em UM passo de histórico.
   *
   * Mesmo motivo do lote das paredes: gerar 12 portas com um comando cada
   * encheria o histórico de 12 passos e desfazer viraria 12 Ctrl+Z.
   *
   * Altura e peitoril são os mesmos que a ferramenta Abertura usa para porta
   * (2100 / 0). O arco do PDF é uma planta baixa: ele diz largura e posição, e
   * não sabe nada sobre altura — inventar um número diferente aqui criaria uma
   * porta que não se parece com as feitas à mão, sem nenhuma razão.
   */
  const aplicarPortasGeradas = useCallback(
    (portas: PortaGerada[]) => {
      if (portas.length === 0) return;
      editor.runBatch(
        portas.map((p) => ({
          type: 'AddOpening' as const,
          wallId: p.wallId,
          kind: 'door' as const,
          offsetMm: p.offsetMm,
          widthMm: p.widthMm,
          heightMm: 2100,
          sillMm: 0,
          hingeAtStart: p.hingeAtStart,
        })),
      );
    },
    [editor],
  );

  const confirmar = useConfirm();
  const { orgId } = useOrgContext();
  /** BIBLIOTECA DE MATERIAIS (E7.4): carregada uma vez; resolve `itemCode` nas camadas, acabamentos, guarda-corpos e quantitativos. */
  const biblioteca = useBlueprintMateriais(orgId);
  const { resolveWriteOrg: resolverOrgDeEscrita, orgTargetModal: modalDeOrgDosMateriais } = useOrgWriteTarget();
  /** API PÚBLICA (E9.2): os tokens da organização (ou de todas, com o topo em "Todas" — a RLS filtra). Carregados só quando a tela abre. */
  const [tokensDaApi, setTokensDaApi] = useState<TokenDaApi[]>([]);
  const [tokensDaApiCarregando, setTokensDaApiCarregando] = useState(false);
  const [tokensDaApiIndisponiveis, setTokensDaApiIndisponiveis] = useState<string | null>(null);
  const organizacoesDaLoja = useStore((e) => e.organizations);
  /** CATÁLOGO DE TIPOS (P2.3): todos os tipos da organização (inativos inclusive), carregados quando a tela abre. */
  const [tiposDoCatalogo, setTiposDoCatalogo] = useState<TipoDeElemento[]>([]);
  const [catalogoCarregando, setCatalogoCarregando] = useState(false);
  const [catalogoIndisponivel, setCatalogoIndisponivel] = useState<string | null>(null);
  const recarregarCatalogoDeTipos = useCallback(() => {
    setCatalogoCarregando(true);
    listAllElementTypes(orgId)
      .then((lista) => {
        setTiposDoCatalogo(lista);
        setCatalogoIndisponivel(null);
      })
      .catch((e: unknown) => {
        console.warn('[tipos] catálogo indisponível:', e);
        setTiposDoCatalogo([]);
        setCatalogoIndisponivel(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setCatalogoCarregando(false));
  }, [orgId]);
  const usosDeTipos = useMemo(() => usosPorAssinatura(editor.model), [editor.model]);
  /** DEFINIÇÕES DE PARÂMETRO (P2.5): quantas peças carregam cada chave. */
  const usosDeParametros = useMemo(() => usosPorChave(editor.model), [editor.model]);
  /** PLANTA → COMPRAS (E10.3): prévia, lançamento no Plano de Aquisições da obra e cotação. Vive enquanto o editor vive; a prévia cai quando a data padrão muda. */
  const [dataPadraoDeCompras, setDataPadraoDeCompras] = useState(() => somarDias(new Date().toISOString().slice(0, 10), 30));
  const [previaDeCompras, setPreviaDeCompras] = useState<PreviaDeCompras | null>(null);
  const [comprasOcupado, setComprasOcupado] = useState(false);
  const [erroDeCompras, setErroDeCompras] = useState<string | null>(null);
  const [idsLancados, setIdsLancados] = useState<string[]>([]);
  const [nomeDaObraDeCompras, setNomeDaObraDeCompras] = useState<string | null>(null);
  useEffect(() => {
    if (telaAberta !== 'compras' || !study.project_id) return;
    let vivo = true;
    nomeDaObra(study.project_id)
      .then((n) => vivo && setNomeDaObraDeCompras(n))
      .catch(() => vivo && setNomeDaObraDeCompras(null));
    return () => {
      vivo = false;
    };
  }, [telaAberta, study.project_id]);
  const preverComprasDaPlanta = useCallback(async () => {
    if (!study.project_id) return;
    setComprasOcupado(true);
    setErroDeCompras(null);
    setIdsLancados([]);
    try {
      const snaps = await listSnapshots(study.id);
      if (snaps.length === 0) {
        setErroDeCompras('Publique uma versão antes — insumo não sai de rascunho.');
        return;
      }
      setPreviaDeCompras(await preverCompras(snaps[0].id, study.project_id, dataPadraoDeCompras));
    } catch (e) {
      setErroDeCompras(e instanceof Error ? e.message : String(e));
    } finally {
      setComprasOcupado(false);
    }
  }, [study.id, study.project_id, dataPadraoDeCompras]);
  /** WEBHOOKS (E9.3): assinaturas da organização + as últimas entregas. Carregados quando a tela abre. */
  const [webhooksDaOrg, setWebhooksDaOrg] = useState<WebhookDaOrg[]>([]);
  const [entregasDeWebhook, setEntregasDeWebhook] = useState<EntregaDeWebhook[]>([]);
  const [webhooksCarregando, setWebhooksCarregando] = useState(false);
  const [webhooksIndisponiveis, setWebhooksIndisponiveis] = useState<string | null>(null);
  // PLUGINS (21/09/2026, backlog P2): cadastro por organização + o plugin em execução (iframe com sandbox).
  const [pluginsDaOrg, setPluginsDaOrg] = useState<PluginDaPlanta[]>([]);
  const [pluginsCarregando, setPluginsCarregando] = useState(false);
  const [pluginsIndisponiveis, setPluginsIndisponiveis] = useState<string | null>(null);
  const [pluginEmExecucao, setPluginEmExecucao] = useState<PluginDaPlanta | null>(null);
  const recarregarPlugins = useCallback(() => {
    setPluginsCarregando(true);
    blueprintPluginService
      .list(orgId)
      .then((lista) => {
        setPluginsDaOrg(lista);
        setPluginsIndisponiveis(null);
      })
      .catch((e) => {
        console.warn('[plugins] indisponíveis:', e);
        setPluginsDaOrg([]);
        setPluginsIndisponiveis(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setPluginsCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);
  const recarregarWebhooks = useCallback(() => {
    setWebhooksCarregando(true);
    Promise.all([blueprintWebhookService.list(orgId), blueprintWebhookService.listEntregas(null)])
      .then(([lista, entregas]) => {
        setWebhooksDaOrg(lista);
        setEntregasDeWebhook(entregas);
        setWebhooksIndisponiveis(null);
      })
      .catch((e: unknown) => {
        console.warn('[webhooks] indisponíveis:', e);
        setWebhooksDaOrg([]);
        setEntregasDeWebhook([]);
        setWebhooksIndisponiveis(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setWebhooksCarregando(false));
  }, [orgId]);
  const recarregarTokensDaApi = useCallback(() => {
    setTokensDaApiCarregando(true);
    blueprintApiTokenService
      .list(orgId)
      .then((lista) => {
        setTokensDaApi(lista);
        setTokensDaApiIndisponiveis(null);
      })
      .catch((e: unknown) => {
        console.warn('[api] tokens indisponíveis:', e);
        setTokensDaApi([]);
        setTokensDaApiIndisponiveis(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setTokensDaApiCarregando(false));
  }, [orgId]);

  // O catálogo de tipos de esquadria da organização, para a BARRA. REGRA #5:
  // `null` ("Todas") não bloqueia — vem o que a RLS deixar ver. Falhar não
  // derruba o editor: o seletor fica vazio e a largura continua servindo.
  useEffect(() => {
    let vivo = true;
    listOpeningTypes(orgId)
      .then((t) => vivo && setTiposDeEsquadria(t))
      .catch(() => vivo && setTiposDeEsquadria([]));
    return () => {
      vivo = false;
    };
  }, [orgId]);
  /**
   * As DEFINIÇÕES de parâmetro da organização (E1.5): carregadas uma vez aqui
   * e entregues ao painel de parâmetros e à ficha. Falhar = lista vazia.
   */
  const [definicoesDeParametro, setDefinicoesDeParametro] = useState<DefinicaoDeParametro[]>([]);
  const recarregarDefinicoes = useCallback(() => {
    listParameterDefinitions(orgId)
      .then(setDefinicoesDeParametro)
      .catch(() => setDefinicoesDeParametro([]));
  }, [orgId]);
  /** TABELAS PERSONALIZADAS (P2.16): as da organização; carregadas ao abrir a tela. */
  const [tabelasSalvas, setTabelasSalvas] = useState<TabelaSalva[]>([]);
  const [tabelasCarregando, setTabelasCarregando] = useState(false);
  const [tabelasIndisponiveis, setTabelasIndisponiveis] = useState(false);
  const recarregarTabelas = useCallback(() => {
    setTabelasCarregando(true);
    blueprintTabelaService
      .list(orgId)
      .then((lista) => {
        setTabelasSalvas(lista);
        setTabelasIndisponiveis(false);
      })
      .catch(() => {
        setTabelasSalvas([]);
        setTabelasIndisponiveis(true);
      })
      .finally(() => setTabelasCarregando(false));
  }, [orgId]);
  useEffect(() => {
    recarregarDefinicoes();
  }, [recarregarDefinicoes]);
  /** CONJUNTOS DE REGRAS da organização (E3.2), somados à semente. */
  const [conjuntosDeRegras, setConjuntosDeRegras] = useState<ConjuntoDeRegras[]>([]);
  const [regrasIndisponiveis, setRegrasIndisponiveis] = useState(false);
  const recarregarRegras = useCallback(() => {
    blueprintRuleSetService
      .list(orgId)
      .then((c) => {
        setConjuntosDeRegras(c);
        setRegrasIndisponiveis(false);
      })
      .catch(() => {
        setConjuntosDeRegras([]);
        setRegrasIndisponiveis(true);
      });
  }, [orgId]);
  useEffect(() => {
    recarregarRegras();
  }, [recarregarRegras]);
  const regrasDaOrganizacao = useMemo(() => conjuntosDeRegras.flatMap((c) => c.regras), [conjuntosDeRegras]);
  const NOME_DO_CONJUNTO_DA_ORG = 'Regras da organização';
  const salvarRegraDaOrganizacao = orgId
    ? async (regra: Regra) => {
        const atual = conjuntosDeRegras.find((c) => c.nome === NOME_DO_CONJUNTO_DA_ORG && c.organizationId === orgId);
        await blueprintRuleSetService.save(orgId, NOME_DO_CONJUNTO_DA_ORG, [...(atual?.regras ?? []), regra]);
        recarregarRegras();
      }
    : null;
  const removerRegraDaOrganizacao = orgId
    ? async (regraId: string) => {
        const dono = conjuntosDeRegras.find((c) => c.regras.some((r) => r.id === regraId));
        if (!dono) return;
        await blueprintRuleSetService.save(dono.organizationId, dono.nome, dono.regras.filter((r) => r.id !== regraId), { municipio: dono.municipio, leiReferencia: dono.leiReferencia });
        recarregarRegras();
      }
    : null;

  /**
   * Empreendimentos do CONTEXTO DO TOPO — para a zona urbanística e para o
   * write-back da área do terreno.
   *
   * ⚠️ `orgId` do `useOrgContext`, NÃO `study.organization_id`. O seletor do topo
   * é a autoridade (REGRA #5): em "Todas as organizações" ele vale `null`, o
   * service não aplica `.eq()` e a RLS recorta o resto. Filtrar pela org DO
   * ESTUDO parecia certo — o estudo pertence a uma org só — mas escondia
   * empreendimentos que o usuário estava vendo no topo, e o incorporador que
   * mantém a obra numa org e a incorporação em outra não achava o alvo.
   *
   * Carregados aqui, e não no painel, porque o painel é apresentacional — a
   * mesma divisão de `PainelParedeSelecionada`, que é o que permitiu testá-lo
   * sem canvas.
   */
  useEffect(() => {
    let vivo = true;
    empreendimentoService
      .list(orgId ?? undefined)
      .then((lista) => vivo && setEmpreendimentos(lista))
      // Silencioso de propósito: não poder listar empreendimento não pode
      // impedir de desenhar. O bloco de gravação simplesmente não aparece.
      .catch(() => vivo && setEmpreendimentos([]));
    return () => {
      vivo = false;
    };
  }, [orgId]);

  /**
   * O empreendimento sugerido pela OBRA do estudo.
   *
   * `blueprint_studies.project_id` aponta para a obra, e `empreendimentos`
   * também guarda `project_id`. É por aí que se sugere — e é só sugestão: quem
   * grava é o usuário, escolhendo na lista. Inferir e gravar calado poria a área
   * do terreno na ficha errada, e isso só apareceria no memorial de incorporação.
   */
  const empreendimentoSugerido = useMemo(() => {
    if (!study.project_id) return null;
    return empreendimentos.find((e) => e.project_id === study.project_id)?.id ?? null;
  }, [empreendimentos, study.project_id]);

  /**
   * Recuos e limites — agora vindos do Mapa Regulatório, não mais digitados do zero.
   *
   * Continuam FORA do payload canônico pela razão de sempre: são parâmetro
   * urbanístico do município, não geometria, e gravá-los no snapshot faria o
   * hash da planta mudar porque alguém digitou um recuo. O que mudou é que
   * agora eles têm casa própria (`blueprint_study_urban_context`) e sobrevivem
   * ao recarregar. O que É do desenho — qual lado é a frente — segue no modelo,
   * em `Boundary.papel`.
   */
  const zona = useBlueprintZonaUrbanistica(
    study.id,
    study.organization_id,
    empreendimentoSugerido,
    orgId,
  );

  /**
   * Altura do que está desenhado, em metros — para confrontar com o gabarito.
   *
   * Topo do nível mais alto: `elevationMm + defaultHeightMm`. Usar só a maior
   * `elevationMm` mediria até o PISO do último pavimento e deixaria a última
   * altura de pé-direito de fora, o que subestima justamente onde o gabarito
   * costuma apertar.
   */
  const alturaDesenhadaM = useMemo(() => {
    if (editor.model.levels.length === 0) return null;
    const topoMm = Math.max(...editor.model.levels.map((l) => l.elevationMm + l.defaultHeightMm));
    return Number((topoMm / 1000).toFixed(2));
  }, [editor.model.levels]);
  /**
   * RECUOS EFETIVOS (E3.1): os da zona, mais o afastamento progressivo pela
   * altura desenhada quando ele supera o recuo fixo. É o que o envelope usa.
   */
  const recuosEfetivosDaZona = useMemo(
    // P2.10: o recuo de frente escalonado vale pelo ORDINAL do pavimento ativo (o envelope 2D é o dele).
    () => recuosEfetivos(zona.recuos, { afastamentoProgressivo: zona.afastamentoProgressivo, recuoFrenteEscalonado: zona.recuoFrenteEscalonado }, alturaDesenhadaM, ordinalDoPavimento(editor.model.levels, levelId)),
    [zona.recuos, zona.afastamentoProgressivo, zona.recuoFrenteEscalonado, alturaDesenhadaM, editor.model.levels, levelId],
  );
  const recuos = recuosEfetivosDaZona.recuos;

  const fundo = useBlueprintUnderlay(study.id, study.organization_id, levelId);
  const [camadaAtiva, setCamadaAtiva] = useState('Geral');
  /** Camadas desligadas. Estado de TELA — preferência de quem olha, não do dado. */
  const [camadasOcultas, setCamadasOcultas] = useState<Set<string>>(new Set());
  const medicoes = useBlueprintMedicoes(
    study.id,
    study.organization_id,
    levelId,
    fundo.ativaId,
    camadaAtiva,
  );

  /**
   * O que aparece na tela: a prancha ativa, menos as camadas desligadas.
   *
   * O recorte por prancha não é cosmético. As coordenadas de uma forma só fazem
   * sentido sob a aferição da prancha em que foi traçada; mostrar as do térreo
   * sobre a cobertura desenharia contornos no lugar errado, com o número certo
   * ao lado — que é o pior jeito de errar.
   *
   * A FORMA SEM PRANCHA aparece em TODAS. Ela foi traçada sem fundo nenhum, então
   * não há aferição de outra prancha que a contradiga — e escondê-la a deixaria
   * inalcançável: some da lista, e não sobra nenhum controle para religá-la a
   * coisa alguma. O banco tem duas assim (`orfas=2` na conferência da 000014).
   */
  const medicoesVisiveis = useMemo(
    () =>
      medicoes.formas.filter(
        (f) =>
          (f.underlayId === null || f.underlayId === fundo.ativaId) &&
          !camadasOcultas.has(f.camada || 'Geral'),
      ),
    [medicoes.formas, fundo.ativaId, camadasOcultas],
  );

  const alternarCamada = (camada: string) =>
    setCamadasOcultas((atual) => {
      const nova = new Set(atual);
      if (nova.has(camada)) nova.delete(camada);
      else nova.add(camada);
      return nova;
    });

  // Atalhos de desfazer/refazer. Ctrl+Z / Ctrl+Shift+Z, como todo editor.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // F8 alterna a trava ortogonal — é a tecla que todo CAD usa, e quem
      // desenha planta chega aqui com o dedo já treinado nela.
      if (e.key === 'F8') {
        e.preventDefault();
        setOrtogonal((v) => !v);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      // Ctrl+D duplica a seleção ao lado (17/09/2026) — o navegador usaria a
      // tecla para "adicionar aos favoritos", daí o preventDefault.
      if (e.key.toLowerCase() === 'd') {
        const alvo = e.target as HTMLElement | null;
        if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
        e.preventDefault();
        duplicarRef.current();
        return;
      }
      if (e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (desfazerBloqueado) return;
      if (e.shiftKey) editor.redo();
      else editor.undo();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [editor.undo, editor.redo, desfazerBloqueado]);

  /** UNIDADES (E2.2): medidas, fração ideal e paredes geminadas — derivadas do desenho. */
  const quadroDeUnidadesDoModelo = useMemo(() => quadroDeUnidades(editor.model), [editor.model]);
  /**
   * GRAFO ESPACIAL (E4.2) do pavimento ativo: adjacência, portas, saídas,
   * fachadas com orientação, circulação %. Derivado; alimenta o cartão do
   * ambiente, a gaveta e (E4.3) a conferência do programa.
   */
  const grafoDoNivel = useMemo(() => (levelId ? construirGrafoEspacial(editor.model, levelId) : null), [editor.model, levelId]);
  // MULTIUSUÁRIO: publica onde estou e o que tenho selecionado (= o que está travado para os outros).
  useEffect(() => {
    colab.atualizarPresenca({ levelId, selecionados: editor.selectedIds });
  }, [colab.atualizarPresenca, levelId, editor.selectedIds]);
  /** MOBILIÁRIO (E6.3): sugestão por ambiente do pavimento ativo; overlay opcional no canvas. */
  const [hipotesesDeMobiliario, setHipotesesDeMobiliario] = usePersistedState<HipotesesDeMobiliario>('blueprint:mobiliario', HIPOTESES_MOBILIARIO_PADRAO);
  const [mostrarMobiliario, setMostrarMobiliario] = usePersistedState('blueprint:mostrarMobiliario', false);
  const mobiliarioDoNivel = useMemo(() => (levelId ? mobiliarNivel(editor.model, levelId, hipotesesDeMobiliario) : []), [editor.model, levelId, hipotesesDeMobiliario]);
  const mobiliarioParaOCanvas = useMemo(
    () =>
      mostrarMobiliario
        ? mobiliarioDoNivel.flatMap((a) => {
            const ok = hipotesesDeMobiliario.acessivel ? a.circulacao.ok120 : a.circulacao.ok90;
            return a.pecas.map((p) => ({ ret: p.ret, rotulo: p.peca.rotulo, ok }));
          })
        : undefined,
    [mostrarMobiliario, mobiliarioDoNivel, hipotesesDeMobiliario.acessivel],
  );
  const shaftSugerido = useMemo(() => (levelId ? sugerirShaft(editor.model, levelId) : { comando: null, motivo: 'sem pavimento' }), [editor.model, levelId]);
  /**
   * INSOLAÇÃO (E5.1): hipóteses do navegador (data, hora solar, latitude
   * suposta, vizinhos, sol no 3D); a análise do pavimento ativo pelo grafo.
   */
  const [hipotesesDeInsolacao, setHipotesesDeInsolacao] = usePersistedState<HipotesesDeInsolacao>('blueprint:insolacao', HIPOTESES_DE_INSOLACAO_PADRAO);
  const latitudeDoEstudo = editor.model.georreferencia?.latitude ?? null;
  const norteDoDesenho = editor.model.georreferencia?.rotacaoNorteDeg ?? null;
  const posicaoDoSol = useMemo(
    () => posicaoSolar(latitudeDoEstudo ?? hipotesesDeInsolacao.latitudeManual, diaDoAno(hipotesesDeInsolacao.data), hipotesesDeInsolacao.horaSolar),
    [latitudeDoEstudo, hipotesesDeInsolacao.latitudeManual, hipotesesDeInsolacao.data, hipotesesDeInsolacao.horaSolar],
  );
  const ambientes = useMemo(
    () => {
    const unidadeDe = unidadePorEtiqueta(editor.model);
    return editor.model.spaces
        .filter((s) => !levelId || s.levelId === levelId)
        .map((s, i) => ({
          id: s.id,
          nome: s.name ?? '',
          rotulo: s.name ?? `Ambiente ${i + 1}`,
          /** A unidade a que o ambiente pertence (pela etiqueta), ou `null` (área comum / por compor). */
          unidadeId: (s.labelUid ? unidadeDe.get(s.labelUid)?.id : null) ?? null,
          // O TIPO mora na etiqueta (o ambiente é derivado) — ver `TIPOS_DE_AMBIENTE`.
          etiquetaId: etiquetaDoAmbiente(s, editor.model.labels)?.id ?? null,
          tipoDeAmbiente: etiquetaDoAmbiente(s, editor.model.labels)?.tipoDeAmbiente ?? null,
          // DEPARTAMENTO (P2.22): também na etiqueta.
          departamento: etiquetaDoAmbiente(s, editor.model.labels)?.departamento ?? null,
          // A iluminação (9.5.2.1) vale para todo cômodo, com ou sem tipo.
          luz: conferirIluminacao(
            s,
            editor.model.terminais ?? [],
            areaRecuada(
              s.ring,
              editor.model.walls.filter((w) => w.levelId === s.levelId),
            ).areaMm2 / 1_000_000,
            // O tipo decide se a luz na parede vale por luz de teto (nota 2 de 9.5.2.1.1).
            etiquetaDoAmbiente(s, editor.model.labels)?.tipoDeAmbiente,
          ),
          // O mínimo da NBR 5410 (9.5.2.2.1) frente ao que há — `null` sem tipo.
          conferencia: conferirTomadas(
            s,
            etiquetaDoAmbiente(s, editor.model.labels)?.tipoDeAmbiente,
            editor.model.walls.filter((w) => w.levelId === s.levelId),
            editor.model.terminais ?? [],
            areaRecuada(
              s.ring,
              editor.model.walls.filter((w) => w.levelId === s.levelId),
            ).areaMm2 / 1_000_000,
          ),
          // ÁREA ÚTIL, pela face interna — é a que se habita e a que se
          // reveste. A de EIXO (`s.areaMm2`) continua existindo: ela é a
          // primitiva do arranjo planar e entra no payload canônico, logo no
          // HASH da versão publicada, então não pode ser substituída. Quem
          // quiser vê-la tem a aba Quantitativos, que mostra as duas lado a
          // lado.
          areaM2:
            areaRecuada(
              s.ring,
              editor.model.walls.filter((w) => w.levelId === s.levelId),
            ).areaMm2 / 1_000_000,
          // PERÍMETRO INTERNO, pelas faces — o par da área útil acima, e o que a
          // NBR 5410 mede (9.5.2.2.1). Antes era o de EIXO, e a linha da norma
          // logo abaixo dizia "19,4 m" ao lado de um "Perímetro 20,00 m": dois
          // números para a mesma sala, sem regra visível. O de eixo segue no
          // canônico (`s.perimeterMm`), como a área de eixo.
          perimetroM: perimetroInternoM(
            s,
            editor.model.walls.filter((w) => w.levelId === s.levelId),
          ),
        }));
    },
    [editor.model.spaces, editor.model.walls, editor.model.labels, editor.model.terminais, levelId],
  );

  /**
   * DISTRIBUIR TOMADAS ao longo de lados de piso — do ambiente inteiro ou de uma
   * face de parede. Nascem SUGERIDAS (tracejadas, contadas como pendência) e
   * num lote só: "distribuir 4" é um Ctrl+Z. Devolve quantas nasceram.
   */
  function distribuirTomadas(lados: readonly LadoDoAmbiente[], n: number): number {
    if (!levelId) return 0;
    const pontos = distribuirAoLongo(lados, n, editor.model.walls, editor.model.openings);
    if (pontos.length === 0) return 0;
    // Com a potência da norma já preenchida — 600 VA nas três primeiras de
    // cozinha/banheiro, 100 VA nas demais e nos outros cômodos.
    const criados = editor.runBatch(aplicarPotenciaPadrao(editor.model, comandosDeTomadasSugeridas(levelId, pontos)));
    if (criados.length > 0) selecionar(criados);
    return criados.length;
  }

  /**
   * COMPLETAR PELA NORMA: só o déficit, como sugeridas, fora de portas, janelas
   * e das tomadas que já existem. As de altura média (bancada, lavatório)
   * nascem a 1,30 m com o rótulo de onde levá-las.
   */
  function completarPelaNorma(spaceId: string): number {
    if (!levelId) return 0;
    const a = ambientes.find((x) => x.id === spaceId);
    const space = editor.model.spaces.find((s) => s.id === spaceId);
    if (!a || !space) return 0;
    const paredes = editor.model.walls.filter((w) => w.levelId === space.levelId);
    const terminais = editor.model.terminais ?? [];
    const comandos: Command[] = [];
    // Tomadas (9.5.2.2.1) — só com o ambiente classificado.
    if (a.conferencia) {
      const ocupados = terminais
        .filter((t) => t.levelId === space.levelId && t.disciplina === 'ELETRICA')
        .map((t) => t.at);
      const total = Math.max(a.conferencia.deficit, a.conferencia.deficitMedias);
      const pontos = distribuirAoLongo(
        ladosDePiso(space, paredes),
        total,
        editor.model.walls,
        editor.model.openings,
        150,
        ocupados,
      );
      comandos.push(...comandosParaCompletar(levelId, pontos, a.conferencia));
    }
    // Iluminação (9.5.2.1) — todo cômodo.
    const nivel = editor.model.levels.find((l) => l.id === space.levelId);
    comandos.push(
      ...comandosDeIluminacao(
        levelId,
        space,
        editor.model.walls,
        editor.model.openings,
        nivel?.defaultHeightMm ?? 2800,
        a.luz,
        terminais,
      ),
    );
    if (comandos.length === 0) return 0;
    // A luz sugerida já traz o mínimo; as tomadas ganham a potência da norma aqui.
    const criados = editor.runBatch(aplicarPotenciaPadrao(editor.model, comandos));
    if (criados.length > 0) selecionar(criados);
    return criados.length;
  }

  /** Aceita todas as sugeridas do nível: a marca some, o ponto fica onde está. */
  function aceitarSugeridas() {
    const alvo = (editor.model.terminais ?? []).filter(
      (t) => t.sugerida && (!levelId || t.levelId === levelId),
    );
    editor.runBatch(
      alvo.map((t) => ({ type: 'SetTerminalProps' as const, terminalId: t.id, sugerida: false })),
    );
  }

  const areaTotal = ambientes.reduce((soma, a) => soma + a.areaM2, 0);

  /**
   * Os rótulos escritos DENTRO de cada ambiente no desenho.
   *
   * Derivados de `ambientes` — a MESMA lista que o painel mostra —, e não de um
   * cálculo próprio. É a disciplina que `pontoDaCota` já impõe às cotas: o
   * mesmo cômodo não pode ter um número na lista e outro no desenho. Se a área
   * da lista mudar de definição amanhã, o desenho acompanha sozinho.
   */
  const rotulosDeAmbiente = useMemo(() => {
    // A COTA DE NÍVEL (E0.2) é a do pavimento: "±0,00" no térreo, "+2,80" no
    // andar. Vai na última linha, como a prancha escreve — abaixo do nome e da
    // área, onde o olho procura o nível do piso.
    const nivel = levelId ? rotuloDeNivelDoPavimento(editor.model.levels, levelId) : null;
    // PLANTA DE FORRO (P2.14): o rótulo diz o forro, não a área.
    if (plantaDeForro) return plantaDeForro.forros.map((f) => ({ spaceId: f.spaceId, linhas: f.linhas }));
    // PLANTA DE DEPARTAMENTOS (P2.22): nome, setor e área.
    if (plantaDeDepartamentos) return ambientes.map((a) => ({ spaceId: a.id, linhas: [a.rotulo, a.departamento ?? 'sem departamento', `${a.areaM2.toFixed(2).replace('.', ',')} m²`] }));
    return ambientes.map((a) => ({
      spaceId: a.id,
      linhas: [
        a.rotulo,
        // UNIDADE (E2.2): "Un. 101 · PCD" logo abaixo do nome — a etiqueta da prancha de vendas.
        ...(a.unidadeId ? [rotuloDaUnidade(editor.model.unidades.find((u) => u.id === a.unidadeId)!, true)] : []),
        `${a.areaM2.toFixed(2).replace('.', ',')} m²`,
        `${a.perimetroM.toFixed(2).replace('.', ',')} m`,
        ...(nivel ? [nivel] : []),
      ],
    }));
  }, [ambientes, editor.model.levels, editor.model.unidades, levelId, plantaDeForro, plantaDeDepartamentos]);
  /** "PT1", "J2" ao lado de cada vão — a mesma numeração do navegador. */
  const etiquetasDeAbertura = useMemo(() => {
    const paredes = editor.model.walls.filter((w) => !levelId || w.levelId === levelId);
    return new Map([...etiquetasDasAberturas(paredes, editor.model.openings)].map(([id, e]) => [id, e.texto]));
  }, [editor.model.walls, editor.model.openings, levelId]);

  /**
   * ÁREA CONSTRUÍDA do nível — pela face externa.
   *
   * Não é a soma das áreas úteis: entre elas está a alvenaria, que ocupa lugar
   * e é justamente o que separa "o que se habita" de "o que se constrói".
   */
  const areaConstruidaM2 = useMemo(() => {
    const nivel = editor.model.levels.find((l) => l.id === levelId);
    if (!nivel) return 0;
    return areaConstruidaMm2(editor.model, nivel) / 1_000_000;
  }, [editor.model, levelId]);

  const quantRef = useRef<Quantitativos | null>(null);
  /**
   * ACABAMENTOS (E7.2): os ambientes do pavimento com o que a etiqueta declarou
   * e a medida do quantitativo ao vivo (área de piso líquida, rodapé derivado).
   */
  const ambientesParaAcabamento = useMemo<AmbienteComAcabamento[]>(() => {
    const nivel = editor.model.levels.find((l) => l.id === levelId);
    return ambientes.map((a) => {
      const s = editor.model.spaces.find((x) => x.id === a.id)!;
      const q = quantRef.current?.ambientes.find((x) => x.spaceId === a.id);
      return {
        spaceId: a.id,
        rotulo: a.rotulo,
        tipoDeAmbiente: a.tipoDeAmbiente,
        areaPisoM2: q?.areaPisoM2 ?? a.areaM2,
        comprimentoRodapeM: q ? (q.rodapeDeclarado === null ? q.comprimentoRodapeM : q.comprimentoRodapeM) : a.perimetroM,
        peDireitoMm: nivel?.defaultHeightMm ?? 2800,
        acabamentos: acabamentosDoAmbiente(editor.model, s),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientes, editor.model, levelId]);

  /** Grava os acabamentos de UM ambiente: pela etiqueta se ela existe, criando-a pelo nome exibido se não. */
  const aplicarAcabamentos = useCallback(
    (spaceId: ObjectId, acabamentos: AcabamentosDoAmbiente | null) => {
      const a = ambientes.find((x) => x.id === spaceId);
      if (!a) return;
      if (a.etiquetaId) editor.run({ type: 'SetSpaceLabelProps', labelId: a.etiquetaId, acabamentos });
      else if (acabamentos) editor.run({ type: 'NameSpace', spaceId, name: a.rotulo, acabamentos });
    },
    [ambientes, editor],
  );

  const quant = useMemo(
    () => computeQuantities(editor.model, POLITICA_PADRAO),
    [editor.model],
  );
  /**
   * Quantas esquadrias estao FORA do orcamento por nao terem tipo (P2.49).
   *
   * Vai no numerinho do botão porque era invisível: `blueprintBudget` pula a
   * esquadria sem nome antes de gerar linha OU divergência, então 104 peças
   * sem tipo não produziam orçamento nem aviso.
   */
  /** Tolerância da unificação de tipos (P2.50), em milímetro. */
  const [toleranciaDeUnificacao, setToleranciaDeUnificacao] = useState(TOLERANCIA_PADRAO_MM);
  /**
   * Mirar a medida de CATÁLOGO na unificação (P2.54), e as medidas comerciais.
   *
   * O catálogo só é lido quando o modo liga: são duas buscas no Supabase, e
   * fazer isso ao abrir a planta custaria rede em quem nunca vai unificar.
   */
  const [mirarCatalogo, setMirarCatalogo] = useState(false);
  const [medidasComerciais, setMedidasComerciais] = useState<{ larguraMm: number; alturaMm: number }[]>([]);
  useEffect(() => {
    if (!mirarCatalogo || medidasComerciais.length > 0) return;
    let vivo = true;
    void Promise.all([sinapiService.search('PORTA').catch(() => []), sinapiService.search('JANELA').catch(() => [])])
      .then((r) => {
        if (!vivo) return;
        const vistas = new Map<string, { larguraMm: number; alturaMm: number }>();
        for (const item of r.flat()) {
          for (const m of medidasNaDescricao(item.description)) vistas.set(`${m.larguraMm}x${m.alturaMm}`, m);
        }
        setMedidasComerciais([...vistas.values()]);
      });
    return () => {
      vivo = false;
    };
  }, [mirarCatalogo, medidasComerciais.length]);
  /**
   * O que daria para unificar no pavimento ativo (P2.50).
   *
   * Mora aqui, e não no painel, porque a conta precisa do MODELO: decidir se a
   * medida nova cabe na parede exige o comprimento dela e o offset da abertura,
   * que o quadro de esquadrias não carrega.
   */
  const unificacoesDeEsquadria = useMemo(
    () =>
      levelId
        ? unificacoesPropostas(editor.model, levelId, toleranciaDeUnificacao, mirarCatalogo ? medidasComerciais : [])
        : [],
    [editor.model, levelId, toleranciaDeUnificacao, mirarCatalogo, medidasComerciais],
  );
  /**
   * Estende a parede selecionada até a face, pelo botão de ícone da barra (P2.59).
   *
   * ⚠️ TODAS as pontas com alvo, num lote só. O painel da parede oferece ponta
   * a ponta (e o atalho "até o eixo"); o botão da barra é o gesto rápido de quem
   * já sabe o que quer — um clique, um passo de desfazer. Sem alvo ele nem
   * habilita, então não há clique que não faça nada.
   */
  function estenderSelecionadaAteAFace() {
    if (extensoesDaParedeSelecionada.length === 0) return;
    try {
      editor.runBatch(extensoesDaParedeSelecionada.map((e) => comandoDeEstender(e, false)));
    } catch (err) {
      setAvisoConexaoT(err instanceof Error ? `O desenho recusou: ${err.message}` : 'O desenho recusou a extensão.');
    }
  }

  const esquadriasSemTipo = useMemo(
    () => (quant.totais.porEsquadria ?? []).filter((e) => !e.declarada).reduce((soma, e) => soma + e.quantidade, 0),
    [quant],
  );
  quantRef.current = quant;
  /** COLORIR POR (E8.2): cor por ambiente e legenda do recorte atual. */
  // PLANTA DE DEPARTAMENTOS (P2.22): a vista força o modo DEPARTAMENTO por cima do escolhido, sem gravá-lo.
  const coresDoDesenho = useMemo(() => coresDaVista(editor.model, vistaDePlanta === 'departamentos' ? 'DEPARTAMENTO' : modoDeCor, levelId), [editor.model, modoDeCor, levelId, vistaDePlanta]);
  /** PLANTA HUMANIZADA (E8.4): piso por ambiente e vegetação do pavimento — só quando o estilo pede (é derivação sobre todos os ambientes). */
  const humanizada = estiloPlanta === 'HUMANIZADA';
  const pisosDoDesenho = useMemo(() => (humanizada ? pisosHumanizados(editor.model, levelId) : undefined), [humanizada, editor.model, levelId]);
  const vegetacaoDoDesenho = useMemo(() => (humanizada && levelId ? vegetacaoSimbolica(editor.model, levelId) : undefined), [humanizada, editor.model, levelId]);
  const resumoDosPisos = useMemo(() => (pisosDoDesenho ? resumirPisos(pisosDoDesenho) : []), [pisosDoDesenho]);
  /** A CONFIGURAÇÃO DE VISTA atual — o que um template salva e aplica. */
  const configuracaoDeVista = useMemo<ConfiguracaoDeVista>(
    () => ({
      planta: {
        medidas: mostrarMedidas,
        camadas: mostrarCamadas,
        cotas: mostrarCotas,
        cotaInterna: mostrarCotaInterna,
        circuitos: mostrarCircuitos,
        rotulos: mostrarRotulos,
        grade: mostrarGrade,
        preenchimento: mostrarPreenchimento,
        preenchimentoTerreno: mostrarPreenchimentoTerreno,
        curvasDeNivel: mostrarCurvasDeNivel,
        envelope: mostrarEnvelope,
        cotaAltoContraste,
        mobiliario: mostrarMobiliario,
      },
      modoDeCor,
      vista3d: { laje: mostrarLaje3d, arestas: mostrarArestas3d, armadura: mostrarArmadura3d, terreno: mostrarTerreno3d, envelope: mostrarEnvelope3d },
      estilo3d,
      estiloPlanta,
      fase: filtroDeFase,
    }),
    [mostrarMedidas, mostrarCamadas, mostrarCotas, mostrarCotaInterna, mostrarCircuitos, mostrarRotulos, mostrarGrade, mostrarPreenchimento, mostrarPreenchimentoTerreno, mostrarCurvasDeNivel, mostrarEnvelope, cotaAltoContraste, mostrarMobiliario, modoDeCor, mostrarLaje3d, mostrarArestas3d, mostrarArmadura3d, mostrarTerreno3d, mostrarEnvelope3d, estilo3d, estiloPlanta, filtroDeFase],
  );
  const aplicarConfiguracaoDeVista = useCallback(
    (c: ConfiguracaoDeVista) => {
      setMostrarMedidas(c.planta.medidas);
      setMostrarCamadas(c.planta.camadas);
      setMostrarCotas(c.planta.cotas);
      setMostrarCotaInterna(c.planta.cotaInterna);
      setMostrarCircuitos(c.planta.circuitos);
      setMostrarRotulos(c.planta.rotulos);
      setMostrarGrade(c.planta.grade);
      setMostrarPreenchimento(c.planta.preenchimento);
      setMostrarPreenchimentoTerreno(c.planta.preenchimentoTerreno);
      setMostrarCurvasDeNivel(c.planta.curvasDeNivel);
      setMostrarEnvelope(c.planta.envelope);
      setCotaAltoContraste(c.planta.cotaAltoContraste);
      setMostrarMobiliario(c.planta.mobiliario);
      setModoDeCor(c.modoDeCor);
      setCoresPorAmbiente(c.modoDeCor === 'AMBIENTE');
      setMostrarLaje3d(c.vista3d.laje);
      setMostrarArestas3d(c.vista3d.arestas);
      setMostrarArmadura3d(c.vista3d.armadura);
      setMostrarTerreno3d(c.vista3d.terreno);
      setMostrarEnvelope3d(c.vista3d.envelope);
      setEstilo3d(c.estilo3d);
      setEstiloPlanta(c.estiloPlanta);
      setFiltroDeFase(c.fase);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const recarregarTemplates = useCallback(() => {
    setTemplatesCarregando(true);
    blueprintViewTemplateService
      .list(orgId)
      .then((lista) => {
        setTemplatesDaOrg(lista);
        setTemplatesIndisponiveis(null);
      })
      .catch((e: unknown) => {
        console.warn('[vista] templates indisponíveis:', e);
        setTemplatesDaOrg([]);
        setTemplatesIndisponiveis(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setTemplatesCarregando(false));
  }, [orgId]);
  useEffect(() => {
    recarregarTemplates();
  }, [recarregarTemplates]);
  const templatesDeVista = useMemo(() => [...TEMPLATES_DE_FABRICA, ...templatesDaOrg], [templatesDaOrg]);
  const menuVista = (
    <MenuVista
      em3d={em3d}
      configuracaoAtual={configuracaoDeVista}
      templates={templatesDeVista}
      carregando={templatesCarregando}
      indisponivel={templatesIndisponiveis}
      legenda={coresDoDesenho.legenda}
      onModoDeCor={(m) => {
        setModoDeCor(m);
        setCoresPorAmbiente(m === 'AMBIENTE');
        if (m !== 'NENHUM' && !mostrarPreenchimento) setMostrarPreenchimento(true);
      }}
      onEstilo3d={setEstilo3d}
      onEstiloPlanta={(e) => {
        setEstiloPlanta(e);
        // Humanizada sem preenchimento não mostra piso nenhum: ligar junto, como o "Colorir por" faz.
        if (e === 'HUMANIZADA' && !mostrarPreenchimento) setMostrarPreenchimento(true);
      }}
      resumoDosPisos={resumoDosPisos}
      onFase={setFiltroDeFase}
      onAplicar={aplicarConfiguracaoDeVista}
      onSalvar={async (nome) => {
        const alvo = await resolverOrgDeEscrita('all-allowed');
        if (!alvo) throw new Error('Escolha a organização em que o template será gravado.');
        const { failed } = await forEachTargetOrg(alvo, (org) => blueprintViewTemplateService.create(org, nome, configuracaoDeVista));
        if (failed.length) throw new Error(failed.map((f) => (f.error instanceof Error ? f.error.message : String(f.error))).join('; '));
        recarregarTemplates();
      }}
      onRemover={async (id) => {
        await blueprintViewTemplateService.remove(id);
        recarregarTemplates();
      }}
    />
  );
  /** USO de cada código no desenho (E7.4): o que a tela Materiais mostra ao lado de cada material. */
  const usosPorCodigo = useMemo(() => {
    const mapa = new Map<string, UsoDeMaterial[]>();
    const add = (u: UsoDeMaterial) => {
      if (!u.codigo) return;
      mapa.set(u.codigo, [...(mapa.get(u.codigo) ?? []), u]);
    };
    for (const m of quant.totais.porMaterial ?? []) add({ codigo: m.itemCode, descricao: m.descricao, origem: 'PAREDE', areaM2: m.areaFaceM2, volumeM3: m.volumeM3, comprimentoM: 0 });
    for (const m of quant.totais.porAcabamento ?? []) add({ codigo: m.itemCode, descricao: m.descricao, origem: m.escopo, areaM2: m.areaM2, volumeM3: m.volumeM3, comprimentoM: m.comprimentoM });
    for (const m of quant.totais.porGuardaCorpo ?? []) add({ codigo: m.itemCode, descricao: m.descricao, origem: 'GUARDA_CORPO', areaM2: m.areaM2, volumeM3: 0, comprimentoM: m.comprimentoM });
    return mapa;
  }, [quant]);
  /** O aço de cada peça e por família — a mesma conta do orçamento e da planilha. */
  const armadura = useMemo(
    () => armaduraDoModelo(editor.model, quant, hipotesesDeArmadura),
    [editor.model, quant, hipotesesDeArmadura],
  );
  const armaduraPorId = useMemo(() => new Map(armadura.pecas.map((p) => [p.structuralId, p])), [armadura]);

  /**
   * Quantitativo OFICIAL da última versão publicada.
   *
   * O painel calcula ao vivo enquanto se desenha, e isso é útil — mas número que
   * o orçamento vai citar não pode vir de geometria que ainda muda. O oficial sai
   * do snapshot publicado e fica gravado com a política que o produziu.
   */
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (editor.baseRevision === 0) {
        setQtdOficial(null);
        return;
      }
      try {
        const snaps = await listSnapshots(study.id);
        if (cancelado || snaps.length === 0) return;
        setQtdOficial(await getQuantitySnapshot(snaps[0].id, POLITICA_PADRAO.version));
      } catch {
        /* silencioso: a ausência do oficial não impede desenhar */
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [study.id, editor.baseRevision]);

  async function gerarQuantitativoOficial() {
    setGerando(true);
    try {
      const snaps = await listSnapshots(study.id);
      if (snaps.length === 0) return;
      setQtdOficial(await computeAndStoreQuantities(snaps[0].id, POLITICA_PADRAO));
    } catch (e) {
      console.error('falha ao gerar quantitativo:', e);
    } finally {
      setGerando(false);
    }
  }

  /**
   * Grava o trecho de parede e as correções de canto que ele exige.
   *
   * UM passo de histórico para o gesto todo (`runBatch`): a parede nova e a ponta
   * mitrada da anterior são o mesmo ato do usuário, e desfazer metade dele
   * deixaria um canto que ninguém desenhou.
   *
   * Se o lote for recusado — o caso real é abertura que não caberia mais na parede
   * encurtada — a parede entra SEM a mitra. O canto fica com folga visível, que se
   * arruma arrastando a ponta; perder o clique inteiro em silêncio seria pior.
   */
  function adicionarParede(a: Point, b: Point, ajustes?: AjustePonta[]): string | null {
    if (!levelId) return null;
    const nova: Command = {
      type: 'AddWall',
      levelId,
      a,
      b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
      // `a`/`b` JÁ são o eixo resolvido por `eixoDaParede`. Isto aqui não move
      // nada: grava de que lado estava o traço, para que uma troca de espessura
      // depois saiba qual face o usuário apontou. Sem isso o lado era esquecido
      // no instante do clique.
      alinhamento,
    };
    const correcoes: Command[] = (ajustes ?? []).map((aj) => ({
      type: 'MoveVertex',
      wallId: aj.wallId,
      end: aj.end,
      to: aj.to,
    }));

    const lote: Command[] = [...correcoes, nova];

    // ── ENCOSTAR A PONTA NOVA, NO MESMO LOTE ────────────────────────────────
    //
    // Uma parede desenhada terminando DENTRO do corpo de outra parece ligada na
    // tela e não está no modelo: o arranjo planar monta o grafo pelos EIXOS, a
    // ponta fica com grau 1, o anel não fecha e o ambiente some — junto com a
    // área e o quantitativo. Reportado em 27/08/2026, com print: a alça da ponta
    // aparecia solta no vão entre as paredes.
    //
    // O passe de conexão já existia e já rodava em três lugares — ao ABRIR a
    // planta, no botão, e nas paredes geradas do PDF — mas NÃO depois de um
    // traçado manual. Quem desenhava ficava com a ponta pendurada até recarregar.
    //
    // ⚠️ Recortado ao que ACABOU de ser desenhado. `comandosDeConexao` varre o
    // modelo inteiro; aplicá-lo cru aqui mexeria também em pontas soltas antigas
    // que o usuário não tocou — mudança silenciosa longe de onde ele clicou. O
    // botão "conectar agora" existe justamente para o passe completo, e ali é
    // pedido.
    let conexoes: Command[] = [];
    try {
      const simulado = applyBatch(editor.model, lote);
      const novaId = simulado.diff.created.find((id) => id.startsWith('wal'));
      if (novaId) {
        conexoes = comandosDeConexao(simulado.model).filter(
          (c) => c.type === 'MoveVertex' && c.wallId === novaId,
        );
      }
    } catch {
      // Simulação recusada: o `runBatch` abaixo recusa igual e mostra o erro.
      conexoes = [];
    }

    const criados = editor.runBatch([...lote, ...conexoes]);
    if (criados.length === 0 && correcoes.length > 0) return adicionarParede(a, b);
    return criados.find((id) => id.startsWith('wal')) ?? null;
  }

  /**
   * Troca a espessura MANTENDO PARADA a face que o usuário traçou.
   *
   * ─── O DEFEITO QUE ISTO RESOLVE ─────────────────────────────────────────────
   *
   * `SetThickness` mexe só na espessura, e a parede cresce simetricamente a
   * partir do EIXO — as duas faces andam meia espessura cada. Quem desenhou
   * clicando NA FACE (o padrão da barra) mirou numa delas: engrossar a parede
   * tirava do lugar exatamente a face que ele havia apontado. O lado do traço
   * não sobrevivia ao clique; agora sobrevive (`Wall.alinhamento`), e o eixo
   * pode ser levado para onde a face fique parada.
   *
   * ─── POR QUE UM LOTE, E POR QUE `manterJuncoes` ─────────────────────────────
   *
   * São dois comandos e um gesto só: espessura + translação do eixo. Separados,
   * "desfazer" desfaria meio ato e deixaria a parede grossa no lugar errado.
   *
   * `TranslateEntities` com `manterJuncoes` é o que torna isto SEGURO. Mover o
   * eixo de lado desencaixaria o vértice compartilhado com a vizinha, o anel
   * abriria e o ambiente sumiria com área e quantitativo junto — o mesmo modo de
   * falha que a decisão de 27/08/2026 descreve. Com ele ligado, a ponta da
   * vizinha acompanha pela componente paralela ao EIXO DELA: a vizinha muda de
   * comprimento, nunca de direção, e a junta continua fechada.
   *
   * No alinhamento `EIXO` (parede antiga, ou traçada pelo eixo) o deslocamento é
   * zero e sobra só o `SetThickness` — o comportamento de sempre, intacto.
   */
  function mudarEspessura(parede: Wall, mm: number) {
    const delta = deslocamentoParaManterFace(parede, mm);
    const lote: Command[] = [{ type: 'SetThickness', wallId: parede.id, thicknessMm: mm }];
    if (delta.x !== 0 || delta.y !== 0) {
      lote.push({
        type: 'TranslateEntities',
        wallIds: [parede.id],
        boundaryIds: [],
        // Estrutura não acompanha a troca de espessura: quem mudou a parede de
        // grossura não pediu para mover o pilar embutido nela.
        structuralIds: [],
        delta,
        manterJuncoes: true,
      });
    }
    editor.runBatch(lote);
  }

  /**
   * Troca a COMPOSIÇÃO da parede — e, com ela, a espessura.
   *
   * Espelha `mudarEspessura` linha a linha, e pelo MESMO motivo: mexer nas
   * camadas muda a espessura total (a soma), e numa parede traçada pela face o
   * eixo precisa andar para que a face apontada fique parada. Sem o
   * `TranslateEntities` com `manterJuncoes`, o eixo sai do vértice
   * compartilhado, o anel abre e o ambiente some com área e quantitativo junto.
   *
   * `camadas: null` volta a parede a homogênea preservando a espessura — a soma
   * não muda, o deslocamento dá zero e sobra só o `SetWallLayers`.
   */
  function mudarCamadas(parede: Wall, camadas: CamadaParede[] | null) {
    const novaEspessura = camadas ? somaDasCamadas(camadas) : parede.thicknessMm;
    const delta = deslocamentoParaManterFace(parede, novaEspessura);
    const lote: Command[] = [{ type: 'SetWallLayers', wallId: parede.id, camadas }];
    if (delta.x !== 0 || delta.y !== 0) {
      lote.push({
        type: 'TranslateEntities',
        wallIds: [parede.id],
        boundaryIds: [],
        structuralIds: [],
        delta,
        manterJuncoes: true,
      });
    }
    editor.runBatch(lote);
  }

  /**
   * Grava o polígono inteiro: N paredes num ÚNICO passo de histórico.
   *
   * Um lote, e não N comandos: o polígono é um gesto só, e desfazê-lo tem que
   * devolver a planta ao que era — não tirar um lado por vez, deixando um
   * contorno aberto que ninguém desenhou. Os cantos já vêm mitrados do canvas.
   */
  /** PAREDE CURVA (P2.12): o kernel discretiza e grava as facetas com o arco. */
  function adicionarParedeCurva(a: Point, b: Point, passandoPor: Point) {
    if (!levelId) return;
    editor.runBatch([{ type: 'AddCurvedWall', levelId, a, b, passandoPor, thicknessMm: espessura, heightMm: ALTURA_PADRAO_MM, alinhamento }]);
  }

  function adicionarPoligono(eixos: { a: Point; b: Point }[]) {
    if (!levelId || eixos.length < 3) return;
    editor.runBatch(
      eixos.map((e): Command => ({
        type: 'AddWall',
        levelId,
        a: e.a,
        b: e.b,
        thicknessMm: espessura,
        heightMm: ALTURA_PADRAO_MM,
      })),
    );
  }

  // Cardinalidade 1: `selectedId` é `null` quando há mais de um selecionado, e
  // é isso que faz o painel de parede sumir sozinho em favor do de conjunto.
  const paredeSel = editor.model.walls.find((w) => w.id === editor.selectedId) ?? null;

  // ⚠️ DEPOIS de `paredeSel`, e não junto dos outros diagnósticos: `const` não
  // é içado, e declarar este memo antes derruba a aba com "used before its
  // declaration" — o mesmo TDZ que já derrubou a vista 3D e o canônico do
  // circuito nesta base.
  /**
   * Até onde cada ponta da parede selecionada pode ir (P2.58).
   *
   * Depende da seleção, então só custa quando há uma parede escolhida — e a
   * conta é um raio contra as faces do pavimento, barata o bastante para o memo.
   */
  const extensoesDaParedeSelecionada = useMemo(() => {
    const level = editor.model.levels.find((l) => l.id === levelId);
    if (!level || !paredeSel) return [];
    return extensoesDaParede(editor.model, level, paredeSel.id);
  }, [editor.model, levelId, paredeSel]);

  const aberturaSel = editor.model.openings.find((o) => o.id === editor.selectedId) ?? null;

  const selecionados = useMemo(() => new Set(editor.selectedIds), [editor.selectedIds]);
  const paredesSelecionadas = editor.model.walls.filter((w) => selecionados.has(w.id));
  const limitesSelecionados = editor.model.boundaries.filter((b) => selecionados.has(b.id));
  const aberturasSelecionadas = editor.model.openings.filter((o) => selecionados.has(o.id));
  const medicoesSelecionadas = medicoes.formas.filter((f) => selecionados.has(f.id));

  const estruturasSelecionadas = editor.model.structures.filter((s) => selecionados.has(s.id));

  /** A divisa sozinha na seleção — cardinalidade 1, como `paredeSel`. */
  const limiteSel = editor.model.boundaries.find((b) => b.id === editor.selectedId) ?? null;
  /** A peça estrutural sozinha na seleção — mesma cardinalidade 1. */
  const estruturaSel = editor.model.structures.find((s) => s.id === editor.selectedId) ?? null;
  /**
   * Os conflitos, DERIVADOS a cada mudança do modelo.
   *
   * ⚠️ Nada é gravado: um conflito resolvido some sozinho quando o desenho deixa
   * de tê-lo. Persistir a lista criaria um estado "conhecido" que sobreviveria à
   * correção — e ela passaria a mentir nos dois sentidos.
   */
  /** Quem exporta — vai como autor do tópico BCF. */
  const perfil = useStore((e) => e.currentProfile);

  const conflitos = useMemo(() => conflitosDoModelo(editor.model), [editor.model]);
  /** Os arquitetônicos (E0.4): pilar no vão, pilar na escada, viga baixa sobre o degrau. */
  const conflitosArq = useMemo(() => conflitosArquitetonicos(editor.model), [editor.model]);
  /** MECÂNICA (E11.1): quantos conflitos são de reserva de equipamento, e quais shafts são mecânicos. */
  const conflitosDeReservas = useMemo(() => conflitosArq.filter((c) => c.classe.startsWith('RESERVA_X_')).length, [conflitosArq]);
  const shaftsMecanicos = useMemo(() => (editor.model.nucleos ?? []).filter((n) => n.tipo === 'SHAFT' && n.disciplina === 'MECANICA'), [editor.model.nucleos]);
  /**
   * STATUS DO CONFLITO (P2.1): os aceites gravados do estudo. A lista continua
   * derivada; o aceite só tira o par da contagem (e cai se o encontro crescer).
   * Carregados uma vez por estudo; falhar (migration ausente) = sem status.
   */
  const [aceitesDeConflito, setAceitesDeConflito] = useState<AceiteDeConflito[]>([]);
  useEffect(() => {
    let vivo = true;
    blueprintConflitoStatusService
      .list(study.id)
      .then((l) => vivo && setAceitesDeConflito(l))
      .catch((e: unknown) => {
        console.warn('[conflitos] aceites indisponíveis:', e);
        if (vivo) setAceitesDeConflito([]);
      });
    return () => {
      vivo = false;
    };
  }, [study.id]);
  const mapaDeAceites = useMemo(() => indexarAceites(aceitesDeConflito), [aceitesDeConflito]);
  const statusDosConflitos = useMemo(
    () => contarStatus([...classificarMep(conflitos, mapaDeAceites), ...classificarArq(conflitosArq, mapaDeAceites)]),
    [conflitos, conflitosArq, mapaDeAceites],
  );
  /** O que o ribbon conta: só os ABERTOS (aceito com justificativa não é pendência). */
  const totalDeConflitos = statusDosConflitos.abertos;
  const aceitesParaBcf = useMemo(() => new Map(aceitesDeConflito.map((a) => [a.chave, { justificativa: a.justificativa, acceptedEmail: a.acceptedEmail }])), [aceitesDeConflito]);
  /** As restrições conferidas (E1.4b) — derivadas a cada mudança do modelo. */
  const conferenciaDeRestricoes = useMemo(() => conferirRestricoes(editor.model), [editor.model]);
  const restricoesVioladas = violacoes(conferenciaDeRestricoes).length;

  /**
   * O `.bcfzip` com TODA a pendência do estudo — conflitos e comentários.
   *
   * ⚠️ Os comentários são buscados na hora, e não mantidos em estado: eles vivem
   * no banco e o painel de Comentários já os carrega por conta própria.
   * Duplicar a lista aqui criaria duas verdades sobre o que está resolvido, e a
   * exportação sairia com o estado velho.
   */
  async function exportarBcfDoEstudo() {
    const comentarios = await listarComentarios(study.id);
    const autor = perfil?.email || 'ÒPURA';
    const agora = new Date();
    const topicos = [
      ...topicosDeConflitos(editor.model, conflitos, autor, agora, aceitesParaBcf),
      ...topicosDeConflitosArquitetonicos(editor.model, conflitosArq, autor, agora, aceitesParaBcf),
      ...topicosDeComentarios(
        comentarios.map((c) => ({
          id: c.id,
          elementUid: c.element_uid,
          texto: c.texto,
          autorEmail: c.autor_email,
          criadoEm: c.created_at,
          resolvidoEm: c.resolvido_em,
          ponto:
            c.ponto_x_mm != null && c.ponto_y_mm != null
              ? { x: c.ponto_x_mm, y: c.ponto_y_mm, z: 0 }
              : null,
        })),
      ),
    ];
    await exportarBcf(topicos, {
      denominador: 100,
      papel: PAPEIS[0],
      titulo: study.name,
      revisao: 0,
      hash: '',
      data: agora,
      // ⚠️ O `studyId` é o que faz o `Header/File` sair, dizendo a qual IFC as
      // pendências pertencem. Sem ele o pacote vai mudo sobre o modelo.
      studyId: study.id,
    });
  }

  /** Os circuitos com o nome do quadro junto — "QDC · C1" é o que se reconhece. */
  const circuitosParaEscolher = useMemo(
    () =>
      (editor.model.circuitos ?? []).map((c) => ({
        id: c.id,
        nome: c.nome,
        quadroNome: (editor.model.quadros ?? []).find((q) => q.id === c.quadroId)?.nome ?? '',
      })),
    [editor.model.circuitos, editor.model.quadros],
  );

  const trechoSel = (editor.model.trechos ?? []).find((t) => t.id === editor.selectedId) ?? null;
  const terminalSel =
    (editor.model.terminais ?? []).find((t) => t.id === editor.selectedId) ?? null;
  const quadroSel = (editor.model.quadros ?? []).find((q) => q.id === editor.selectedId) ?? null;

  /**
   * O que o painel de comentários precisa saber da seleção.
   *
   * A âncora do comentário é o `uid`, e não o `id`: o id é renumerado a cada
   * publicação, e um comentário ancorado nele mudaria de parede sozinho na
   * revisão seguinte. Ver `utils/blueprintComentarios.ts`.
   */
  const uidDoSelecionado =
    paredeSel?.uid ?? aberturaSel?.uid ?? estruturaSel?.uid ?? null;
  /**
   * GRUPO DE FUNDAÇÃO selecionado (16/09/2026): a seleção é exatamente o bloco
   * e as estacas dele. Um clique em qualquer um deles seleciona o grupo (ver
   * `selecionar`); o painel de propriedades vira o do grupo.
   */
  const grupoSel = useMemo(() => grupoDaSelecao(editor.model, editor.selectedIds), [editor.model, editor.selectedIds]);
  const [selecaoPendente, setSelecaoPendente] = useState<string | null>(null);
  /**
   * Propriedades num SHEET modal (17/09/2026). Só quem seleciona PELA LISTA de
   * Componentes abre assim — a lista é estreita, e as propriedades embaixo dela
   * ficavam apertadas; quem clica no desenho continua com a metade de baixo do
   * painel, olhando o desenho ao lado. Fecha ao fechar o Sheet, ao esvaziar a
   * seleção (Esc) ou ao abrir uma tarefa.
   */
  const [propriedadesEmSheet, setPropriedadesEmSheet] = useState(false);
  useEffect(() => {
    if (editor.selectedIds.length === 0 && propriedadesEmSheet) setPropriedadesEmSheet(false);
  }, [editor.selectedIds.length, propriedadesEmSheet]);
  /**
   * Seleção feita PELA MÃO do usuário (clique no desenho 2D, na cena 3D ou na
   * lista): abre as propriedades no Sheet. Seleções programáticas (o lote que
   * acabou de ser lançado) não abrem — o painel lateral as mostra, como sempre.
   */
  function selecionarEAbrir(ids: string[]) {
    selecionar(ids);
    setPropriedadesEmSheet(ids.length > 0);
  }
  /**
   * Grava (ou apaga, com `null`) o lançamento manual de armadura de um ou mais
   * uids nas hipóteses do estudo — mesma persistência, mesma leitura em todo
   * lugar. Vários uids de uma vez é o caso das estacas de um bloco.
   */
  const gravarArmaduraManual = (uids: string[], spec: import('../../utils/blueprintArmadura').ArmaduraManual | null) => {
    const porPeca = { ...(hipotesesDeArmadura.porPeca ?? {}) };
    for (const uid of uids) {
      if (spec) porPeca[uid] = spec;
      else delete porPeca[uid];
    }
    const { porPeca: _antigo, ...resto } = hipotesesDeArmadura;
    void _antigo;
    armaduraDoEstudo.setHipoteses(Object.keys(porPeca).length ? { ...resto, porPeca } : resto);
  };
  /** Fecha o Sheet E desmarca: as propriedades não voltam para o painel lateral. */
  const fecharPropriedades = useCallback(() => {
    setPropriedadesEmSheet(false);
    editor.setSelectedIds([]);
    medicoes.setSelecionada(null);
  }, [editor, medicoes]);
  useEffect(() => {
    if (!selecaoPendente) return;
    const ids = idsDoGrupo(editor.model, selecaoPendente);
    editor.setSelectedIds(ids ?? [selecaoPendente]);
    setSelecaoPendente(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecaoPendente, editor.model]);
  const planoDoGrupoSel = useMemo(
    () => (grupoSel ? planejarEstacasDoBloco(editor.model, grupoSel.bloco.id, { quantidade: Math.max(1, grupoSel.estacas.length) }) : null),
    [editor.model, grupoSel],
  );
  const rotuloDoSelecionado = grupoSel
    ? `${grupoSel.bloco.rotulo?.trim() || 'Bloco'} · ${grupoSel.estacas.length} estaca${grupoSel.estacas.length === 1 ? '' : 's'}`
    : uidDoSelecionado
      ? rotuloCurto(
          uidDoSelecionado,
          paredeSel ? 'wall' : aberturaSel ? 'opening' : 'structural',
        )
      : null;
  // O ponto vai junto do comentário mesmo quando há elemento: se a peça for
  // apagada depois, é ele que diz onde o assunto era.
  const pontoDoSelecionado = useMemo(() => {
    if (!uidDoSelecionado) return null;
    return posicoesPorUid(editor.model).get(uidDoSelecionado) ?? null;
  }, [editor.model, uidDoSelecionado]);
  const aguaSel = (editor.model.roofs ?? []).find((r) => r.id === editor.selectedId) ?? null;
  const corteSel = (editor.model.sections ?? []).find((c) => c.id === editor.selectedId) ?? null;
  const eixoSel = (editor.model.eixos ?? []).find((e) => e.id === editor.selectedId) ?? null;

  /**
   * O custo por elemento, quando a aba Orçamento já calculou uma prévia.
   *
   * ⚠️ VEM DA VERSÃO PUBLICADA, não do que está na tela. O quantitativo sai do
   * payload do snapshot — é o que torna a linha conferível contra a versão que
   * ela cita. Enquanto houver rascunho não publicado, o número pode não
   * corresponder ao desenho atual, e quem mostra tem de dizer isso: um custo
   * plausível e desatualizado é pior que nenhum.
   *
   * Só existe depois que alguém pediu a prévia. Calcular sozinho ao abrir o
   * estudo seria uma ida ao banco e ao catálogo que ninguém pediu.
   */
  const [previaOrcamento, setPreviaOrcamento] = useState<PreviaOrcamento | null>(null);
  const custoPorUid = useMemo(
    () => custoPorElemento(previaOrcamento?.entries ?? []),
    [previaOrcamento],
  );

  /**
   * O 4D: as tarefas do cronograma da obra, e a data que a régua mostra.
   *
   * As tarefas vêm da OBRA vinculada (`study.project_id`) — é lá que as linhas
   * geradas por esta planta foram aplicadas, e é o id dessas linhas que casa
   * com o id da tarefa. Sem obra vinculada não há cronograma a consultar.
   *
   * A data começa em HOJE: é a pergunta que se faz primeiro ao abrir.
   */
  const [tarefas4d, setTarefas4d] = useState<
    { id: string; startDate?: string; endDate?: string; manualRealPct?: number }[]
  >([]);
  const [data4d, setData4d] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const obra = study.project_id;
    if (!obra) {
      setTarefas4d([]);
      return;
    }
    let vivo = true;
    tarefasDoCronograma(obra)
      .then((t) => vivo && setTarefas4d(t))
      // Falhar a leitura não derruba o editor: sem tarefas a régua não aparece,
      // que é o mesmo estado de uma obra sem cronograma.
      .catch(() => vivo && setTarefas4d([]));
    return () => {
      vivo = false;
    };
  }, [study.project_id]);

  const situacao4d = useMemo(() => situacaoPorElemento(tarefas4d, data4d), [tarefas4d, data4d]);
  const coresPorUid = useMemo(() => {
    const m = new Map<string, string>();
    for (const [uid, s] of situacao4d) m.set(uid, COR_DO_STATUS[s.status]);
    return m;
  }, [situacao4d]);
  const escadaSel = (editor.model.stairs ?? []).find((e) => e.id === editor.selectedId) ?? null;
  const nucleoSel = (editor.model.nucleos ?? []).find((n) => n.id === editor.selectedId) ?? null;
  const subRegiaoSel = (editor.model.subRegioes ?? []).find((s) => s.id === editor.selectedId) ?? null;
  const vagaSel = (editor.model.vagas ?? []).find((v) => v.id === editor.selectedId) ?? null;
  const componenteSel = (editor.model.componentes ?? []).find((c) => c.id === editor.selectedId) ?? null;
  const guardaCorpoSel = (editor.model.guardaCorpos ?? []).find((g) => g.id === editor.selectedId) ?? null;
  const anotacaoSel = (editor.model.anotacoes ?? []).find((a) => a.id === editor.selectedId) ?? null;
  const anotacoesDoNivelAtivo = useMemo(() => (editor.model.anotacoes ?? []).filter((a) => a.vista.tipo === 'PLANTA' && (!levelId || a.vista.levelId === levelId)), [editor.model.anotacoes, levelId]);
  const resumoDeAnotacoes = useMemo(() => resumirAnotacoes(editor.model), [editor.model]);
  const guardaCorposDoNivelAtivo = useMemo(() => (editor.model.guardaCorpos ?? []).filter((g) => !levelId || g.levelId === levelId), [editor.model.guardaCorpos, levelId]);
  const sugestaoDeGuardaCorpos = useMemo(() => (levelId ? sugerirGuardaCorpos(editor.model, levelId, hipotesesDeGuardaCorpo) : { sugestoes: [], motivos: [], jaExistentes: 0 }), [editor.model, levelId, hipotesesDeGuardaCorpo]);
  const resumoDeGuardaCorpos = useMemo(() => resumirGuardaCorpos(editor.model, levelId), [editor.model, levelId]);
  const rodapesDoNivelAtivo = useMemo(() => (editor.model.rodapes ?? []).filter((r) => !levelId || r.levelId === levelId), [editor.model.rodapes, levelId]);
  const sugestaoDeRodapes = useMemo(() => (levelId ? sugerirRodapes(editor.model, levelId, hipotesesDeRodape) : { sugestoes: [], pulados: [] }), [editor.model, levelId, hipotesesDeRodape]);
  const resumoDeRodapes = useMemo(() => resumirRodapes(editor.model, levelId), [editor.model, levelId]);
  /** DEPARTAMENTOS (P2.22): quadro e sugestões do pavimento ativo. */
  const quadroDeDepartamentosDoNivel = useMemo(() => quadroDeDepartamentos(editor.model, levelId), [editor.model, levelId]);
  const sugestoesDeDepartamentoDoNivel = useMemo(() => sugestoesDeDepartamento(editor.model, levelId), [editor.model, levelId]);
  /** LOD (P2): elementos do pavimento com o nível derivado; quadro e pendências contra o alvo. */
  // LOD (P2.30): a estrutura sobe a 350/400 pela armadura por peça — o memo `armadura` já existe.
  const contextoDeLod = useMemo(() => ({ armaduraPorUid: new Map(armadura.pecas.map((p) => [p.uid, p])), manualPorUid: hipotesesDeArmadura.porPeca ?? {} }), [armadura, hipotesesDeArmadura]);
  const lodDoNivel = useMemo(() => lodDosElementos(editor.model, levelId, contextoDeLod), [editor.model, levelId, contextoDeLod]);
  const quadroDeLodDoNivel = useMemo(() => quadroDeLod(lodDoNivel, { ...ALVO_DE_LOD_PADRAO, ...alvoDeLod }), [lodDoNivel, alvoDeLod]);
  const pendenciasDeLodDoNivel = useMemo(() => pendenciasDeLod(lodDoNivel, { ...ALVO_DE_LOD_PADRAO, ...alvoDeLod }), [lodDoNivel, alvoDeLod]);
  const rodapeSel = (editor.model.rodapes ?? []).find((r) => r.id === editor.selectedId) ?? null;
  const componentesDoNivelAtivo = useMemo(() => (editor.model.componentes ?? []).filter((c) => !levelId || c.levelId === levelId), [editor.model.componentes, levelId]);
  const vagasDoNivelAtivo = useMemo(() => (editor.model.vagas ?? []).filter((v) => !levelId || v.levelId === levelId), [editor.model.vagas, levelId]);
  const vagasSugeridasNoNivel = vagasDoNivelAtivo.filter((v) => v.sugerida).length;
  /** O plano das vagas automáticas (E2.5), derivado a cada mudança — a gaveta só mostra. */
  const planoDeVagas = useMemo(
    () => (levelId ? planejarVagas(editor.model, levelId, zona.vagasPorUnidade != null ? { ...hipotesesDeVagas, vagasPorUnidade: zona.vagasPorUnidade } : hipotesesDeVagas, regiaoDeVagasPedida) : null),
    [editor.model, levelId, hipotesesDeVagas, regiaoDeVagasPedida, zona.vagasPorUnidade],
  );
  const lancarVagas = () => {
    if (!planoDeVagas || planoDeVagas.comandos.length === 0) return;
    const criados = editor.runBatch(planoDeVagas.comandos);
    setResultadoDeVagas(`${planoDeVagas.vagas.length} vaga(s) lançada(s) como sugeridas${planoDeVagas.substituidas.length ? `, ${planoDeVagas.substituidas.length} substituída(s)` : ''} — aceite, mova ou Ctrl+Z.`);
    if (criados.length > 0) selecionar(criados);
  };
  /** Os núcleos que atravessam o pavimento ativo (E2.4) — o canvas os desenha em cada um. */
  const nucleosDoNivelAtivo = useMemo(() => nucleosDoNivel(editor.model, levelId), [editor.model, levelId]);
  /** A peça selecionada que carrega parâmetros personalizados (E1.2), com a chave da família. */
  const pecaComParametros = useMemo((): { familia: FamiliaComParametros; id: string; parametros: Parametros | undefined } | null => {
    if (paredeSel) return { familia: 'wall', id: paredeSel.id, parametros: paredeSel.parametros };
    if (aberturaSel) return { familia: 'opening', id: aberturaSel.id, parametros: aberturaSel.parametros };
    if (estruturaSel) return { familia: 'structural', id: estruturaSel.id, parametros: estruturaSel.parametros };
    if (aguaSel) return { familia: 'roof', id: aguaSel.id, parametros: aguaSel.parametros };
    if (escadaSel) return { familia: 'stair', id: escadaSel.id, parametros: escadaSel.parametros };
    if (trechoSel) return { familia: 'trecho', id: trechoSel.id, parametros: trechoSel.parametros };
    if (terminalSel) return { familia: 'terminal', id: terminalSel.id, parametros: terminalSel.parametros };
    if (quadroSel) return { familia: 'quadro', id: quadroSel.id, parametros: quadroSel.parametros };
    return null;
  }, [paredeSel, aberturaSel, estruturaSel, aguaSel, escadaSel, trechoSel, terminalSel, quadroSel]);
  /** As variáveis das FÓRMULAS (E1.3) para a peça selecionada — derivadas do modelo. */
  const variaveisDaSelecao = useMemo(() => {
    if (paredeSel) return variaveisDaPeca(editor.model, { familia: 'wall', peca: paredeSel });
    if (aberturaSel) return variaveisDaPeca(editor.model, { familia: 'opening', peca: aberturaSel });
    if (estruturaSel) return variaveisDaPeca(editor.model, { familia: 'structural', peca: estruturaSel });
    if (aguaSel) return variaveisDaPeca(editor.model, { familia: 'roof', peca: aguaSel });
    if (escadaSel) return variaveisDaPeca(editor.model, { familia: 'stair', peca: escadaSel });
    if (trechoSel) return variaveisDaPeca(editor.model, { familia: 'trecho', peca: trechoSel });
    if (terminalSel) return variaveisDaPeca(editor.model, { familia: 'terminal', peca: terminalSel });
    if (quadroSel) return variaveisDaPeca(editor.model, { familia: 'quadro', peca: quadroSel });
    return undefined;
  }, [editor.model, paredeSel, aberturaSel, estruturaSel, aguaSel, escadaSel, trechoSel, terminalSel, quadroSel]);

  /**
   * Quanto volume a peça selecionada divide com outra, em m³. `0` = nenhuma.
   *
   * É o que decide se o controle "cede o volume sobreposto" aparece no painel:
   * um interruptor em toda parede seria ruído, e ruído que não faz nada — sem
   * sobreposição não há volume a ceder.
   */
  const sobreposicaoDoSelecionado = useMemo(() => {
    const id = estruturaSel?.id ?? paredeSel?.id ?? null;
    if (!id) return 0;
    return (
      sobreposicoesDe(editor.model, id).reduce((t, s) => t + s.volumeMm3, 0) / 1_000_000_000
    );
  }, [editor.model, estruturaSel, paredeSel]);

  /**
   * As PAREDES que a peça selecionada atravessa e que dá para cortar.
   *
   * ⚠️ Só peça de PONTO que cruza o piso entra: é ela que empresta a ponte ao
   * arranjo planar (`pontesEstruturais`). Cortar a parede por causa de uma viga
   * — que passa por cima da alvenaria — abriria o anel sem nada para fechá-lo, e
   * o ambiente sumiria. Oferecer o botão ali seria oferecer a destruição do
   * cômodo com outro nome.
   */
  const paredesQueAPecaAtravessa = useMemo(() => {
    const nada = { aCortar: [] as string[], jaInterrompidas: 0 };
    if (!estruturaSel) return nada;
    if (FORMA_ESTRUTURAL[estruturaSel.kind] !== 'PONTO') return nada;
    if (!(estruturaSel.baseMm <= 0 && estruturaSel.baseMm + estruturaSel.alturaMm > 0)) return nada;

    const atravessadas = sobreposicoesDe(editor.model, estruturaSel.id)
      .map((so) => (so.aId === estruturaSel.id ? so.bId : so.aId))
      .map((id) => editor.model.walls.find((w) => w.id === id))
      .filter((w): w is NonNullable<typeof w> => !!w);

    // ⚠️ SEPARADO entre o que FALTA e o que JÁ ESTÁ. Sem esse corte, o botão
    // aparecia oferecendo cortar paredes que já cediam — e o clique mandava um
    // comando que não mudava nada. Botão morto, e foi assim que o usuário o
    // encontrou em 01/09/2026: "botao cortar paredes nao esta funcionando".
    //
    // As duas paredes do estudo dele já estavam marcadas desde a versão
    // anterior, então NADA podia acontecer — e a tela não dizia isso em lugar
    // nenhum.
    return {
      aCortar: atravessadas.filter((w) => !w.cedeSobreposicao).map((w) => w.id),
      jaInterrompidas: atravessadas.filter((w) => w.cedeSobreposicao).length,
    };
  }, [editor.model, estruturaSel]);

  /**
   * PONTAS que o corte destrutivo deixou curtas em volta da peça selecionada.
   *
   * O corte deixou de ser destrutivo, mas os desenhos já cortados continuam por
   * aí — o do usuário inclusive, com uma parede parando 100 mm antes da face do
   * pilar. Sem esta ação, aquele vão só sairia arrastando a ponta à mão, e ele
   * nem sabe que a parede está curta: o buraco parece parte do desenho.
   */
  const pontasCurtasDaSelecionada = useMemo(() => {
    if (!estruturaSel) return [];
    return pontasEncurtadasPorEstrutura(
      editor.model.walls.filter((w) => w.levelId === estruturaSel.levelId),
      estruturaSel,
    );
  }, [editor.model, estruturaSel]);

  /** Devolve cada ponta curta ao lugar de onde o corte a tirou. */
  function emendarPontasDaSelecionada() {
    if (pontasCurtasDaSelecionada.length === 0) return;
    editor.runBatch(
      pontasCurtasDaSelecionada.map(
        (p) => ({ type: 'MoveVertex', wallId: p.wallId, end: p.end, to: p.ate }) as const,
      ),
    );
  }

  /**
   * Corta TODAS as paredes que a peça selecionada atravessa, num lote só.
   *
   * Mesmo caminho que o aviso da criação usa — e existe porque aquele aviso só
   * aparece uma vez, na criação. Sem esta ação, a planta que JÁ estava desenhada
   * não tinha como ser cortada: foi exatamente o que aconteceu com o usuário,
   * que relatou a sobreposição três vezes com a peça já criada em cena.
   */
  function cortarParedesDaSelecionada() {
    if (!estruturaSel || paredesQueAPecaAtravessa.aCortar.length === 0) return;
    try {
      // Mesma decisão do aviso: grava a RELAÇÃO, não o corte. Ver o comentário
      // em `resolverDisputa`.
      editor.runBatch(
        paredesQueAPecaAtravessa.aCortar.map(
          (id) => ({ type: 'SetCedeSobreposicao', id, cede: true }) as const,
        ),
      );
    } catch (e) {
      setErroDoCorte(
        e instanceof Error && /abertura/i.test(e.message)
          ? 'O corte partiria uma porta ou janela. Mova a esquadria ou o pilar e tente de novo.'
          : 'Não foi possível cortar a parede neste ponto.',
      );
    }
  }

  /**
   * O inventário do pavimento ativo — o que a seção "Componentes" gerencia.
   *
   * O recorte por nível é feito AQUI e não dentro do painel porque a abertura
   * não guarda `levelId`: ela mora numa parede, e é a parede que diz de que
   * pavimento ela é. Quem recorta precisa do modelo inteiro.
   */
  const componentesDoNivel = useMemo(() => {
    const paredes = editor.model.walls.filter((w) => !levelId || w.levelId === levelId);
    const idsDeParede = new Set(paredes.map((w) => w.id));
    const aberturas = editor.model.openings.filter((o) => idsDeParede.has(o.wallId));
    const estruturas = editor.model.structures.filter(
      (s) => !levelId || s.levelId === levelId,
    );
    const aguas = (editor.model.roofs ?? []).filter((r) => !levelId || r.levelId === levelId);
    const escadas = (editor.model.stairs ?? []).filter((e) => !levelId || e.levelId === levelId);
    const rede = {
      trechos: (editor.model.trechos ?? []).filter((t) => !levelId || t.levelId === levelId),
      terminais: (editor.model.terminais ?? []).filter((t) => !levelId || t.levelId === levelId),
      quadros: (editor.model.quadros ?? []).filter((q) => !levelId || q.levelId === levelId),
    };
    return { paredes, aberturas, estruturas, aguas, escadas, rede };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editor.model.walls,
    editor.model.openings,
    editor.model.structures,
    editor.model.roofs,
    editor.model.stairs,
    editor.model.trechos,
    editor.model.terminais,
    editor.model.quadros,
    levelId,
  ]);

  /**
   * O inventário da vista 3D — os pavimentos EMPILHADOS na cena, não o ativo.
   *
   * Recorte diferente do de cima porque a pergunta é outra: na planta baixa a
   * lista serve ao pavimento que se edita; no 3D ela serve ao que se VÊ, e a
   * cena empilha todos os níveis marcados. Listar só o ativo deixaria a parede
   * do 2º piso visível na tela sem nenhuma linha capaz de escondê-la.
   *
   * Só calcula em 3D: nas outras vistas o resultado seria jogado fora a cada
   * comando do editor.
   */
  const componentesDo3d = useMemo(
    () => (vista === '3d' ? linhasDeComponentesPorNivel(editor.model, levelIdsDaVista) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vista, editor.model, levelIdsDaVista?.join(',')],
  );

  /**
   * Peças escondidas no DESENHO — 3D (pedido de 01/09/2026) e planta baixa
   * (16/09/2026: *"os botões de exibir e ocultar presentes nos componentes na
   * visualização 3D devem estar disponíveis na visualização em planta"*). Um
   * conjunto só para as duas vistas: o que se esconde na planta some do 3D e
   * vice-versa — é a mesma peça.
   *
   * `useState` e NÃO `usePersistedState`, pela mesma razão já documentada em
   * `camadasOcultas`: são ids de peça, e id não sobrevive a troca de branch nem
   * a publicação de versão. Um conjunto persistido apontaria para peças que não
   * existem mais e, pior, faria o usuário abrir outro estudo com metade do
   * desenho escondido sem lembrar de tê-lo escondido.
   *
   * Filtra o DESENHO e nada mais: não é comando de kernel, não entra no
   * histórico, não muda quantitativo.
   */
  const [ocultosNoDesenho, setOcultosNoDesenho] = useState<Set<string>>(new Set());
  /** O olho do usuário + o recorte da vista de planta (E0.3). */
  /** ETAPAS (P2): o desenho como está na etapa em vista — status derivado e o que ainda não existe/já saiu. */
  const vistaDaEtapaAtual = useMemo(() => (etapaEmVista ? vistaDaEtapa(editor.model, etapaEmVista) : null), [editor.model, etapaEmVista]);
  const ocultosNoCanvas = useMemo(() => {
    // FASES DE REFORMA (E10.2): o filtro da vista esconde o que não é daquela fase.
    const daFase = idsOcultosPelaFase(editor.model, filtroDeFase);
    // ETAPAS (P2): o que não existe na etapa em vista.
    for (const id of vistaDaEtapaAtual?.ocultos ?? []) daFase.add(id);
    if (!vistaDePlanta) {
      if (daFase.size === 0) return ocultosNoDesenho;
      for (const id of ocultosNoDesenho) daFase.add(id);
      return daFase;
    }
    const daVista = idsOcultosNaVista(editor.model, vistaDePlanta, nivelDaVistaDePlanta);
    for (const id of ocultosNoDesenho) daVista.add(id);
    for (const id of daFase) daVista.add(id);
    return daVista;
  }, [ocultosNoDesenho, vistaDePlanta, editor.model, nivelDaVistaDePlanta, filtroDeFase, vistaDaEtapaAtual]);
  /** id → fase (só existente/a demolir), para o canvas colorir; e a fase da seleção, para os botões do ribbon. Com etapa em vista, o status é o DERIVADO dela. */
  const fasesDoDesenho = useMemo(() => vistaDaEtapaAtual?.fases ?? fasePorId(editor.model), [editor.model, vistaDaEtapaAtual]);
  const etapasDoEstudo = useMemo(() => etapasOrdenadas(editor.model), [editor.model]);
  const quadroDeEtapasDoEstudo = useMemo(() => quadroDeEtapas(editor.model, quant), [editor.model, quant]);
  const selecaoNaLinhaDoTempo = useMemo(() => {
    const sel = new Set(editor.selectedIds);
    return pecasNaLinhaDoTempo(editor.model).filter((p) => sel.has(p.id));
  }, [editor.model, editor.selectedIds]);
  const contagemDeFases = useMemo(() => contagemPorFase(editor.model), [editor.model]);
  const faseSelecionada = useMemo(() => faseDaSelecao(editor.model, editor.selectedIds), [editor.model, editor.selectedIds]);

  /**
   * Alterna em LOTE — a linha manda um id, o cabeçalho da família manda todos os
   * dela. Um `setState` por id faria o clique em "Alvenaria" numa planta de
   * quarenta paredes disparar quarenta atualizações em sequência.
   */
  const alternarOcultoNoDesenho = useCallback(
    (ids: string[], ocultar: boolean) => {
      setOcultosNoDesenho((atual) => {
        const proximo = new Set(atual);
        for (const id of ids) {
          if (ocultar) proximo.add(id);
          else proximo.delete(id);
        }
        return proximo;
      });
      // Peça escondida sai da seleção: um painel de propriedades de algo que
      // não está na tela, com alças invisíveis, é a seleção fantasma.
      if (ocultar) {
        const escondidos = new Set(ids);
        if (editor.selectedIds.some((id) => escondidos.has(id))) {
          editor.setSelectedIds(editor.selectedIds.filter((id) => !escondidos.has(id)));
        }
      }
    },
    [editor.selectedIds, editor.setSelectedIds],
  );

  /**
   * Selecionar uma peça no canvas ABRE a seção que mostra as propriedades dela.
   *
   * O corpo de uma seção fechada é desmontado (ver `SecaoAccordion`), então sem
   * isto o clique numa parede com "Componentes" fechado não teria resposta
   * visível nenhuma — o mesmo defeito que a barra de abas tinha quando o painel
   * de propriedades vivia atrás de uma aba.
   *
   * A dependência é um BOOLEANO, não a seleção: assim o efeito só dispara na
   * virada "nada selecionado → algum componente", e não a cada troca de peça,
   * que reabriria a seção que o usuário acabou de fechar de propósito.
   */
  const selecaoTemComponente =
    paredesSelecionadas.length > 0 ||
    aberturasSelecionadas.length > 0 ||
    estruturasSelecionadas.length > 0 ||
    // ⚠️ A REDE faltava aqui, e o painel dela vive nesta MESMA seção.
    //
    // Com a seção fechada, selecionar um ponto elétrico não mostrava nada — nem
    // as propriedades, nem o circuito, nem um sinal de que havia algo para ver.
    // Parede abria, tomada não, e a diferença é invisível: a peça fica destacada
    // no desenho e a lateral segue muda. Relato de uso em 09/09/2026:
    // *"onde fica a edição dos pontos elétricos?"*.
    (editor.model.trechos ?? []).some((t) => editor.selectedIds.includes(t.id)) ||
    (editor.model.terminais ?? []).some((t) => editor.selectedIds.includes(t.id)) ||
    (editor.model.quadros ?? []).some((q) => editor.selectedIds.includes(q.id));
  useEffect(() => {
    if (!selecaoTemComponente) return;
    setSecoes((s) => (s.componentes ? s : { ...s, componentes: true }));
  }, [selecaoTemComponente, setSecoes]);

  /**
   * O lote medido a partir das divisas. `null` enquanto não houver nenhuma.
   *
   * A área NÃO vem de `Space`: um anel em volta da casa daria a área do quintal,
   * porque ambiente desconta buraco. Ver o cabeçalho de `blueprintTerreno`.
   */
  const limitesDoNivel = useMemo(
    () => editor.model.boundaries.filter((b) => !levelId || b.levelId === levelId),
    [editor.model.boundaries, levelId],
  );
  const terreno = useMemo(() => medirTerreno(limitesDoNivel), [limitesDoNivel]);
  const prismasDoEntornoDoEstudo = useMemo(() => {
    return prismasDoEntorno(hipotesesDeInsolacao.vizinhos, limitesDoNivel, terreno?.anel ?? null);
  }, [limitesDoNivel, terreno, hipotesesDeInsolacao.vizinhos]);
  const insolacaoDoNivel = useMemo(() => {
    if (!grafoDoNivel) return [];
    const piso = editor.model.levels.find((l) => l.id === levelId)?.elevationMm ?? 0;
    return analisarInsolacao(
      grafoDoNivel,
      { latitudeGraus: latitudeDoEstudo ?? hipotesesDeInsolacao.latitudeManual, rotacaoNorteDeg: norteDoDesenho, prismas: prismasDoEntornoDoEstudo, pisoMm: piso },
      { dia: diaDoAno(hipotesesDeInsolacao.data), horaSolar: hipotesesDeInsolacao.horaSolar },
    );
  }, [grafoDoNivel, editor.model.levels, levelId, latitudeDoEstudo, hipotesesDeInsolacao.latitudeManual, hipotesesDeInsolacao.data, hipotesesDeInsolacao.horaSolar, norteDoDesenho, prismasDoEntornoDoEstudo]);
  /** A direção do sol para o 3D, quando ligado e acima do horizonte. */
  const solNo3d = useMemo(() => (hipotesesDeInsolacao.solNo3d ? direcaoDoSol(posicaoDoSol, norteDoDesenho) : null), [hipotesesDeInsolacao.solNo3d, posicaoDoSol, norteDoDesenho]);

  /**
   * A topografia do estudo — fora do payload canônico, como a zona urbanística
   * (`blueprint_study_topografia`). Só recebe o anel quando o lote está FECHADO:
   * curva de nível sobre contorno aberto seria recortada num polígono que o
   * software fechou sozinho.
   */
  const anelDoLoteFechado = useMemo(
    () => (terreno?.fechado ? terreno.anel : null),
    [terreno],
  );
  const topografia = useBlueprintTopografia(
    study.id,
    study.organization_id,
    study.name,
    anelDoLoteFechado,
    editor.model.georreferencia ?? null,
  );

  /**
   * A cota absoluta do ZERO do desenho — o que põe a cota 1.083 m do terreno no
   * mesmo eixo que a parede de 2,80 m, no corte e no 3D. Vem de "Onde fica"
   * (`georreferencia.elevacaoM`); sem ela, a cota média do levantamento, e o
   * painel diz isso — um zero inventado calado poria a casa 700 m abaixo do chão.
   */
  const cotaDeOrigemInformada = typeof editor.model.georreferencia?.elevacaoM === 'number';
  const cotaZeroDoTerrenoM = topografia.selecionada
    ? (editor.model.georreferencia?.elevacaoM ?? topografia.selecionada.estatisticas.cotaMediaM)
    : 0;
  /** Hash da versão exibida: a dependência dos memos abaixo e dos canvases. */
  const chaveDaTopografia = topografia.selecionada?.hash_resultado ?? '';
  const terrenoParaCorte = useMemo<TerrenoParaCorte | null>(() => {
    const v = topografia.selecionada;
    if (!v) return null;
    return { cotaEmM: amostradorDaGrade(v.grade), cotaZeroM: cotaZeroDoTerrenoM, vertices: v.anel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, cotaZeroDoTerrenoM]);
  const relevo3d = useMemo(() => {
    const v = topografia.selecionada;
    return v ? malhaDaGrade(v.grade, cotaZeroDoTerrenoM) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, cotaZeroDoTerrenoM]);

  /**
   * O chão sob a pessoa no modo de percorrer, em metros de mundo: o 3D usa
   * X = x·S e Z = y·S, então o ponto do desenho é (x / S, z / S). Fora da
   * grade vale a cota da borda (fase 14) — sem degrau ao sair do lote; `null`
   * só onde a grade não tem dado.
   */
  const alturaDoChao3d = useMemo(() => {
    const v = topografia.selecionada;
    if (!v) return undefined;
    const amostrar = amostradorDoChao(v.grade);
    return (x: number, z: number) => {
      const cota = amostrar({ x: x * 1000, y: z * 1000 });
      return cota === null ? null : cota - cotaZeroDoTerrenoM;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, cotaZeroDoTerrenoM]);

  // ── Fase 2: declividade, corte/aterro e a curva clicada ──────────────────
  const declividade = useMemo(() => {
    const v = topografia.selecionada;
    return v ? declividadeDaGrade(v.grade, v.anel) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia]);

  const terraplenagem = useBlueprintTerraplenagem(study.id, study.organization_id);
  // Fase 17: o projeto executivo com ART (responsável, sondagem, emissões).
  const executivo = useBlueprintProjetoExecutivo(study.id, study.organization_id);

  // ── Elétrica F7: projeto executivo elétrico com ART ────────────────────────
  const executivoEletrico = useBlueprintProjetoExecutivo(study.id, study.organization_id, 'ELETRICA');
  /** A conferência que o painel mostra (o nível atual) — e a que a emissão exige (o modelo inteiro). */
  const conferenciaNbr = useMemo(
    () => conferirNbr5410(editor.model, levelId ?? null, hipotesesEletricas),
    [editor.model, levelId, hipotesesEletricas],
  );
  const resultadoEletrico = useMemo(
    () =>
      verificacoesEletricas(
        editor.model,
        hipotesesEletricas,
        executivoEletrico.responsavel,
        conferirNbr5410(editor.model, null, hipotesesEletricas),
      ),
    [editor.model, hipotesesEletricas, executivoEletrico.responsavel],
  );
  /** Desenho (canônico do kernel) + hipóteses: mudou um, a emissão não vale mais. */
  const hashEletrico = useMemo(() => hashDaBaseEletrica(editor.model, hipotesesEletricas), [editor.model, hipotesesEletricas]);
  const emissaoEletricaValida = useMemo<EmissaoExecutiva | null>(() => {
    const row = executivoEletrico.emitidos.find((r) => r.hash_da_base === hashEletrico.base && r.emitido_em);
    if (!row) return null;
    return { artNumero: row.responsavel.artNumero, responsavel: row.responsavel.nome, conselho: row.responsavel.conselho, registro: row.responsavel.registro, emitidoEm: row.emitido_em! };
  }, [executivoEletrico.emitidos, hashEletrico.base]);
  const emitirEletrico = useCallback(async () => {
    if (!resultadoEletrico.podeEmitir) return;
    const emitidoEm = new Date().toISOString();
    const linhas = memorialEletrico(executivoEletrico.responsavel, hipotesesEletricas, resultadoEletrico, {
      nomeDoEstudo: study.name,
      hashDoDesenho: hashEletrico.desenho,
      hashDaBase: hashEletrico.base,
      emitidoEm,
    });
    await executivoEletrico.emitir({
      topografia_id: null,
      topografia_versao: null,
      topografia_hash: null,
      hash_da_base: hashEletrico.base,
      verificacoes: resultadoEletrico.verificacoes,
      memorial: linhas.join('\n'),
      emitido_em: emitidoEm,
    });
  }, [resultadoEletrico, executivoEletrico, hipotesesEletricas, study.name, hashEletrico]);

  /** A curva clicada na planta: índice na versão exibida + o ponto do clique. */
  const [curvaEmDestaque, setCurvaEmDestaque] = useState<{ indice: number; ponto: Point } | null>(null);
  useEffect(() => setCurvaEmDestaque(null), [chaveDaTopografia]);
  const curvaSelecionada = useMemo(() => {
    const c = curvaEmDestaque ? topografia.selecionada?.curvas[curvaEmDestaque.indice] : undefined;
    return c ? { cotaM: c.cotaM, comprimentoM: comprimentoDaCurvaM(c), mestra: c.mestra } : null;
  }, [curvaEmDestaque, topografia.selecionada]);


  /**
   * Há lote desenhado — a guarda do toggle "Terreno" da vista 3D.
   *
   * Olha `model.boundaries` INTEIRO, e não `limitesDoNivel`, porque é isso que o
   * viewer 3D projeta: o lote é um só, e não uma divisa por pavimento. Ligar o
   * toggle sem divisa nenhuma não desenharia nada e pareceria falha.
   */
  const temTerreno = useMemo(
    () => editor.model.boundaries.some((b) => b.kind === 'TERRENO'),
    [editor.model.boundaries],
  );

  /** O que sobra para construir depois dos recuos. `null` sem lote. */
  const envelope = useMemo(
    () => (terreno ? envelopeConstrutivo(terreno, limitesDoNivel, recuos) : null),
    [terreno, limitesDoNivel, recuos],
  );
  /**
   * ENVELOPE 3D (E3.3): um prisma por pavimento com os recuos efetivos no topo
   * dele (afastamento progressivo), o gabarito e o "cabe?" pelo contorno.
   * Parte dos recuos FIXOS da zona — o progressivo entra por pavimento.
   */
  const envelope3d = useMemo(
    () => envelopeVertical(editor.model, terreno, limitesDoNivel, zona.recuos, { afastamentoProgressivo: zona.afastamentoProgressivo, recuoFrenteEscalonado: zona.recuoFrenteEscalonado, gabaritoAlturaMaxM: zona.gabaritoAlturaMaxM, gabaritoPavimentos: zona.gabaritoPavimentos }),
    [editor.model, terreno, limitesDoNivel, zona.recuos, zona.afastamentoProgressivo, zona.recuoFrenteEscalonado, zona.gabaritoAlturaMaxM, zona.gabaritoPavimentos],
  );
  /** FAIXAS RESTRITAS (E3.1) do pavimento, para o canvas hachurar. */
  const faixasRestritasDoNivel = useMemo(
    () => faixasRestritas(terreno, limitesDoNivel).map((f) => ({ boundaryId: f.boundaryId, anel: f.anel, rotulo: `${ROTULO_DA_RESTRICAO_DO_LOTE[f.tipo]} · ${(f.faixaMm / 1000).toFixed(2).replace('.', ',')} m` })),
    [terreno, limitesDoNivel],
  );
  /** Conferência do lote contra o vocabulário da zona (E3.1): testada e área mínimas. */
  const avisosDoLote = useMemo(() => {
    if (!terreno) return [];
    const frentes = limitesDoNivel.filter((b) => b.kind === 'TERRENO' && b.papel === 'FRENTE');
    const testadaMm = frentes.length ? Math.round(frentes.reduce((s, b) => s + Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y), 0)) : null;
    return conferirLote({ areaM2: terreno.areaMm2 / 1_000_000, testadaMm }, { testadaMinimaMm: zona.testadaMinimaMm, areaMinimaDoLoteM2: zona.areaMinimaDoLoteM2 });
  }, [terreno, limitesDoNivel, zona.testadaMinimaMm, zona.areaMinimaDoLoteM2]);
  /** O que a ferramenta Divisa desenha (E3.1): limite solto ou faixa restrita, com o tipo. */
  const [kindDaDivisa, setKindDaDivisa] = useState<'DIVISA' | 'RESTRICAO'>('DIVISA');
  const [tipoDeRestricaoDoLote, setTipoDeRestricaoDoLote] = useState<TipoDeRestricaoDoLote>('APP');

  /**
   * Onde o platô de terraplenagem se apoia. ENVELOPE só vale com envelope
   * válido — sem recuos (ou com recuos que não cabem) cai no lote inteiro, e o
   * painel diz isso. Depois do `envelope` de propósito: é dele que depende.
   */
  const anelDoPlato = useMemo(
    () =>
      terraplenagem.base === 'ENVELOPE' && envelope?.valido ? envelope.anel : anelDoLoteFechado,
    [terraplenagem.base, envelope, anelDoLoteFechado],
  );
  const cotaDeEquilibrioM = useMemo(() => {
    const v = topografia.selecionada;
    return v && anelDoPlato ? cotaDeEquilibrio(v.grade, anelDoPlato) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, anelDoPlato]);
  const cotaDoPlatoM = terraplenagem.cotaPlatoM ?? cotaDeEquilibrioM;
  const terraplenagemCalc = useMemo(() => {
    const v = topografia.selecionada;
    return v && anelDoPlato && cotaDoPlatoM !== null
      ? terraplenagemComTalude(v.grade, anelDoPlato, cotaDoPlatoM, terraplenagem.parametros)
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, anelDoPlato, cotaDoPlatoM, terraplenagem.parametros]);
  /** O corte recebe o platô (com os taludes) junto do terreno — o projeto contra o chão. */
  const terrenoParaCorteComPlato = useMemo<TerrenoParaCorte | null>(() => {
    if (!terrenoParaCorte) return null;
    if (!mostrarTerraplenagem || !anelDoPlato || cotaDoPlatoM === null) return terrenoParaCorte;
    return {
      ...terrenoParaCorte,
      plato: {
        cotaM: cotaDoPlatoM,
        anel: anelDoPlato,
        taludeCorteH: terraplenagem.parametros.taludeCorteH,
        taludeAterroH: terraplenagem.parametros.taludeAterroH,
        parametros: terraplenagem.parametros,
      },
    };
  }, [terrenoParaCorte, mostrarTerraplenagem, anelDoPlato, cotaDoPlatoM, terraplenagem.parametros]);
  // ── Fase 6: drenagem traçada sobre a superfície de projeto ────────────────
  /** A linha de drenagem em foco no painel e na planta (id), se alguma. */
  const [drenagemAtiva, setDrenagemAtiva] = useState<string | null>(null);
  const cotaDeProjetoFn = useMemo(() => {
    const v = topografia.selecionada;
    return v ? cotaDeProjeto(v.grade, anelDoPlato, cotaDoPlatoM, terraplenagem.parametros) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, anelDoPlato, cotaDoPlatoM, terraplenagem.parametros]);
  const analisesDeDrenagem = useMemo(() => {
    const saida: Record<string, AnaliseDaDrenagem> = {};
    if (!cotaDeProjetoFn) return saida;
    for (const l of terraplenagem.drenagem) {
      saida[l.id] = analisarDrenagem(l, cotaDeProjetoFn, terraplenagem.parametros.caimentoMinPct ?? 0.5);
    }
    return saida;
  }, [cotaDeProjetoFn, terraplenagem.drenagem, terraplenagem.parametros.caimentoMinPct]);
  const atendeDrenagem = useMemo(() => {
    const saida: Record<string, boolean> = {};
    for (const [id, a] of Object.entries(analisesDeDrenagem)) saida[id] = a.atende;
    return saida;
  }, [analisesDeDrenagem]);
  const gerarCanaletasDoPlato = useCallback(() => {
    const v = topografia.selecionada;
    if (!v || !terraplenagemCalc || !anelDoPlato || !cotaDeProjetoFn) return;
    const linhas = canaletasDoPlato(terraplenagemCalc, v.grade, anelDoPlato, terraplenagem.parametros, cotaDeProjetoFn, novoIdDeDrenagem);
    terraplenagem.adicionarDrenagens(linhas);
    if (linhas.length > 0) setDrenagemAtiva(linhas[0].id);
  }, [topografia.selecionada, terraplenagemCalc, anelDoPlato, cotaDeProjetoFn, terraplenagem]);
  // ── Fase 7: pré-dimensionamento hidráulico e estrutural ────────────────────
  const areasSugeridasM2 = useMemo(() => {
    const v = topografia.selecionada;
    return v && anelDoLoteFechado ? areasDeContribuicao(v.grade, anelDoLoteFechado, terraplenagem.drenagem) : {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, anelDoLoteFechado, terraplenagem.drenagem]);
  const dimensionamentosDeDrenagem = useMemo(() => {
    const saida: Record<string, DimensionamentoHidraulico> = {};
    for (const l of terraplenagem.drenagem) {
      const a = analisesDeDrenagem[l.id];
      if (!a) continue;
      saida[l.id] = dimensionarDrenagem(l, a, l.areaContribuinteM2 ?? areasSugeridasM2[l.id] ?? 0, terraplenagem.hidraulica);
    }
    return saida;
  }, [terraplenagem.drenagem, analisesDeDrenagem, areasSugeridasM2, terraplenagem.hidraulica]);
  const murosDimensionados = useMemo(
    () => (terraplenagemCalc ? terraplenagemCalc.muros.map((m) => dimensionarMuro(m, terraplenagem.estrutura)) : []),
    [terraplenagemCalc, terraplenagem.estrutura],
  );

  // ── Fase 17: projeto executivo com ART ─────────────────────────────────────
  /** A drenagem redimensionada para o tempo de retorno EXECUTIVO (25 anos), não o preliminar. */
  const drenagemExecutiva = useMemo(() => {
    const hid = { ...terraplenagem.hidraulica, tempoDeRetornoAnos: EXECUTIVO_PADRAO.tempoDeRetornoAnos };
    const saida = [];
    for (const l of terraplenagem.drenagem) {
      const a = analisesDeDrenagem[l.id];
      if (!a) continue;
      saida.push(dimensionarDrenagem(l, a, l.areaContribuinteM2 ?? areasSugeridasM2[l.id] ?? 0, hid));
    }
    return saida;
  }, [terraplenagem.drenagem, analisesDeDrenagem, areasSugeridasM2, terraplenagem.hidraulica]);
  /** O que a emissão fica amarrada: mudou, a emissão deixa de valer para o que está na tela. */
  const hashDaBaseExecutivaAtual = useMemo(
    () =>
      hashDaBaseExecutiva({
        topografiaHash: topografia.selecionada?.hash_resultado ?? '',
        terraplenagem: terraplenagem.parametros,
        estrutura: terraplenagem.estrutura,
        hidraulica: terraplenagem.hidraulica,
        cotaPlatoM: terraplenagem.cotaPlatoM,
        basePlato: terraplenagem.base,
        sondagem: executivo.sondagem,
      }),
    [topografia.selecionada, terraplenagem.parametros, terraplenagem.estrutura, terraplenagem.hidraulica, terraplenagem.cotaPlatoM, terraplenagem.base, executivo.sondagem],
  );
  const resultadoExecutivo = useMemo(
    () =>
      topografia.selecionada
        ? verificacoesExecutivas({
            responsavel: executivo.responsavel,
            sondagem: executivo.sondagem,
            areaDoLoteM2: (terreno?.areaMm2 ?? 0) / 1e6,
            estrutura: terraplenagem.estrutura,
            hidraulica: terraplenagem.hidraulica,
            terraplenagem: terraplenagem.parametros,
            muros: murosDimensionados,
            drenagemExecutiva,
            alturaMaxDeTaludeM: terraplenagemCalc ? Math.max(terraplenagemCalc.alturaMaxCorteM, terraplenagemCalc.alturaMaxAterroM) : null,
          })
        : null,
    [topografia.selecionada, executivo.responsavel, executivo.sondagem, terreno, terraplenagem.estrutura, terraplenagem.hidraulica, terraplenagem.parametros, murosDimensionados, drenagemExecutiva, terraplenagemCalc],
  );
  /** A emissão que vale para a base atual, se houver — é ela que troca o aviso das exportações. */
  const emissaoValida = useMemo<EmissaoExecutiva | null>(() => {
    const row = executivo.emitidos.find((r) => r.hash_da_base === hashDaBaseExecutivaAtual && r.emitido_em);
    if (!row) return null;
    return { artNumero: row.responsavel.artNumero, responsavel: row.responsavel.nome, conselho: row.responsavel.conselho, registro: row.responsavel.registro, emitidoEm: row.emitido_em! };
  }, [executivo.emitidos, hashDaBaseExecutivaAtual]);
  const emitirProjetoExecutivo = useCallback(async () => {
    const v = topografia.selecionada;
    if (!v || !resultadoExecutivo || !resultadoExecutivo.podeEmitir) return;
    const emitidoEm = new Date().toISOString();
    const linhas = memorialExecutivo(
      {
        responsavel: executivo.responsavel,
        sondagem: executivo.sondagem,
        areaDoLoteM2: (terreno?.areaMm2 ?? 0) / 1e6,
        estrutura: terraplenagem.estrutura,
        hidraulica: terraplenagem.hidraulica,
        terraplenagem: terraplenagem.parametros,
        muros: murosDimensionados,
        drenagemExecutiva,
        alturaMaxDeTaludeM: terraplenagemCalc ? Math.max(terraplenagemCalc.alturaMaxCorteM, terraplenagemCalc.alturaMaxAterroM) : null,
      },
      resultadoExecutivo,
      { nomeDoEstudo: study.name, topografiaVersao: v.versao, topografiaHash: v.hash_resultado, fonte: v.fonte_nome, emitidoEm, hashDaBase: hashDaBaseExecutivaAtual },
    );
    await executivo.emitir({
      topografia_id: v.id.startsWith('local-') ? null : v.id,
      topografia_versao: v.versao,
      topografia_hash: v.hash_resultado,
      hash_da_base: hashDaBaseExecutivaAtual,
      verificacoes: resultadoExecutivo.verificacoes,
      memorial: linhas.join('\n'),
      emitido_em: emitidoEm,
    });
  }, [topografia.selecionada, resultadoExecutivo, executivo, terreno, terraplenagem.estrutura, terraplenagem.hidraulica, terraplenagem.parametros, murosDimensionados, drenagemExecutiva, terraplenagemCalc, study.name, hashDaBaseExecutivaAtual]);
  /**
   * Publicar grava o vínculo com a versão de topografia em uso — a topografia
   * fica fora do hash do desenho, e este é o rastro de qual relevo a versão
   * publicada olhava. Falha no vínculo não desfaz a publicação: avisa.
   */
  const publicarComTopografia = useCallback(async () => {
    const snapshotId = await editor.publish();
    if (!snapshotId || !topografia.selecionada) return;
    try {
      await blueprintSnapshotTopografiaService.vincular(snapshotId, topografia.selecionada);
    } catch (e) {
      console.warn('[topografia] versão publicada sem o vínculo com a topografia:', e);
    }
  }, [editor, topografia.selecionada]);
  // ── Fase 8: drenagem e muros no 3D ─────────────────────────────────────────
  const extrasDoRelevo3d = useMemo<ExtrasDoRelevo3d | null>(() => {
    const v = topografia.selecionada;
    if (!v) return null;
    const drenagem = cotaDeProjetoFn
      ? linhasDeDrenagem3d(terraplenagem.drenagem, atendeDrenagem, cotaDeProjetoFn, cotaZeroDoTerrenoM)
      : [];
    const muros =
      terraplenagemCalc && cotaDoPlatoM !== null
        ? murosDeArrimo3d(terraplenagemCalc.muros, cotaDoPlatoM, amostradorDaGrade(v.grade), cotaZeroDoTerrenoM)
        : [];
    return drenagem.length === 0 && muros.length === 0 ? null : { drenagem, muros };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, cotaDeProjetoFn, terraplenagem.drenagem, atendeDrenagem, terraplenagemCalc, cotaDoPlatoM, cotaZeroDoTerrenoM]);
  const extrasDoRelevo3dChave = extrasDoRelevo3d
    ? `${chaveDaTopografia}:${cotaZeroDoTerrenoM}:${extrasDoRelevo3d.drenagem.map((d) => `${d.id}${d.atende ? 1 : 0}${d.posicoes.length}`).join(',')}:${extrasDoRelevo3d.muros.map((m) => `${m.aresta}${m.posicoes.length}`).join(',')}:${cotaDoPlatoM}`
    : '';
  /** Comprimento de cada aresta do platô, em m — para o talude por trecho no painel. */
  const arestasDoPlatoM = useMemo(
    () =>
      (anelDoPlato ?? []).map((p, i, anel) => {
        const q = anel[(i + 1) % anel.length];
        return Math.hypot(q.x - p.x, q.y - p.y) / 1000;
      }),
    [anelDoPlato],
  );

  // ── Fase 3: hipsometria e perfil altimétrico ──────────────────────────────
  const intervaloHipsometricoM = hipsometriaIntervaloM ?? topografia.selecionada?.equidistancia_m ?? 1;
  /**
   * Os níveis das curvas da versão, do menor ao maior — a rampa arco-íris se
   * normaliza por eles (primeiro = azul, último = vermelho), como no Contour
   * Map Creator, e não pelo mínimo e máximo do terreno.
   */
  const niveisDaVersao = useMemo(() => {
    const v = topografia.selecionada;
    if (!v) return [];
    return [...new Set(v.curvas.map((c) => c.cotaM))].sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia]);
  const faixaDaRampa = useMemo<{ deM: number; ateM: number } | null>(() => {
    const v = topografia.selecionada;
    if (!v) return null;
    if (niveisDaVersao.length >= 2) return { deM: niveisDaVersao[0], ateM: niveisDaVersao[niveisDaVersao.length - 1] };
    return { deM: v.estatisticas.cotaMinM, ateM: v.estatisticas.cotaMaxM };
  }, [topografia.selecionada, niveisDaVersao]);
  const corDaCota = useCallback(
    (cotaM: number) => (faixaDaRampa ? corArcoIrisDaCota(cotaM, faixaDaRampa.deM, faixaDaRampa.ateM) : '#000000'),
    [faixaDaRampa],
  );
  const hipsometria = useMemo(() => {
    const v = topografia.selecionada;
    if (!v) return null;
    return hipsometriaDaGrade(
      v.grade,
      v.anel,
      hipsometriaModo === 'EQUIDISTANCIA'
        ? { modo: 'EQUIDISTANCIA', intervaloM: intervaloHipsometricoM }
        : hipsometriaModo === 'CONTINUO'
          ? { modo: 'CONTINUO', deM: faixaDaRampa?.deM, ateM: faixaDaRampa?.ateM, bandas: 48 }
          : { modo: 'IGUAIS', n: 8 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, hipsometriaModo, intervaloHipsometricoM, faixaDaRampa]);

  /**
   * A linha do perfil é a linha de um CORTE — a ferramenta que já existe, dois
   * cliques em qualquer direção. Sem escolha explícita, o corte que está sendo
   * visto; senão, o primeiro.
   */
  const [perfilCorteId, setPerfilCorteId] = useState<string | null>(null);
  const corteDoPerfil = useMemo(() => {
    const cortes = editor.model.sections ?? [];
    return (
      cortes.find((c) => c.id === perfilCorteId) ??
      (corteAtual && cortes.find((c) => c.id === corteAtual.id)) ??
      cortes[0] ??
      null
    );
  }, [editor.model.sections, perfilCorteId, corteAtual]);
  /**
   * A linha do perfil: a desenhada (fase 4) quando escolhida e existente;
   * senão a do corte. Tem de ser uma polilinha, e a função pura aceita N pontos.
   */
  const linhasDoPerfil = terraplenagem.linhasDoPerfil;
  // Índice gravado pode apontar além da lista (linha apagada): cai na última.
  const indiceDaLinha = linhasDoPerfil.length === 0 ? -1 : Math.min(Math.max(0, linhaDoPerfilIndice), linhasDoPerfil.length - 1);
  const usaLinhaDesenhada = origemDoPerfil === 'LINHA' && indiceDaLinha >= 0;
  const linhaDoPerfil = useMemo<Point[] | null>(
    () =>
      usaLinhaDesenhada
        ? linhasDoPerfil[indiceDaLinha]
        : corteDoPerfil
          ? [corteDoPerfil.a, corteDoPerfil.b]
          : null,
    [usaLinhaDesenhada, linhasDoPerfil, indiceDaLinha, corteDoPerfil],
  );
  const rotuloDoPerfil = usaLinhaDesenhada
    ? linhasDoPerfil.length > 1
      ? `linha ${indiceDaLinha + 1}`
      : 'linha desenhada'
    : corteDoPerfil
      ? `corte ${corteDoPerfil.rotulo}`
      : '';
  // `perfilDoTerreno`, e não `perfil`: `perfil` já é o perfil do USUÁRIO neste arquivo.
  const perfilDoTerreno = useMemo(() => {
    const v = topografia.selecionada;
    if (!v || !linhaDoPerfil) return null;
    const pontos = perfilAoLongo(amostradorDaGrade(v.grade), linhaDoPerfil);
    return { pontos, estatisticas: estatisticasDoPerfil(pontos) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaTopografia, linhaDoPerfil]);
  const exportarPerfil = useCallback(
    (formato: 'svg' | 'csv') => {
      if (!perfilDoTerreno) return;
      const titulo = `${study.name} — perfil (${rotuloDoPerfil})`;
      const conteudo =
        formato === 'svg'
          ? svgDoPerfil(perfilDoTerreno.pontos, perfilDoTerreno.estatisticas, { titulo })
          : csvDoPerfil(perfilDoTerreno.pontos, perfilDoTerreno.estatisticas, titulo);
      baixarArtefatos([
        {
          blob: new Blob([conteudo], { type: `${formato === 'svg' ? 'image/svg+xml' : 'text/csv'};charset=utf-8` }),
          nome: nomeDoArquivoDeTopografia(`${study.name} - perfil ${rotuloDoPerfil}`, topografia.selecionada?.versao ?? 0, formato),
          tipo: formato,
        },
      ]);
    },
    [perfilDoTerreno, rotuloDoPerfil, study.name, topografia.selecionada?.versao],
  );

  const aproveitamento = useMemo(
    () =>
      terreno
        ? calcularAproveitamento(
            terreno,
            editor.model.spaces.filter((sp) => !levelId || sp.levelId === levelId),
          )
        : null,
    [terreno, editor.model.spaces, levelId],
  );

  /**
   * VERIFICAR LEGISLAÇÃO (E3.2): semente + regras da organização avaliadas
   * contra o desenho, mais a NBR 5410 adaptada das conferências do ambiente.
   */
  /**
   * CONFERÊNCIA DO PROGRAMA (E4.3): programa do estudo × desenho, pelo grafo
   * espacial. `null` enquanto o estudo não tem programa.
   */
  const conferenciaDoPrograma = useMemo(
    () => (programaDoEstudo.programa.itens.length > 0 ? conferirPrograma(editor.model, programaDoEstudo.programa) : null),
    [editor.model, programaDoEstudo.programa],
  );
  const resultadosDeRegras = useMemo((): ResultadoDeRegra[] => {
    const frentes = limitesDoNivel.filter((b) => b.kind === 'TERRENO' && b.papel === 'FRENTE');
    const testadaM = frentes.length ? Math.round(frentes.reduce((s, b) => s + Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y), 0)) / 1000 : null;
    const doMotor = avaliarRegras(editor.model, [...REGRAS_SEMENTE, ...regrasDaOrganizacao], {
      lote: terreno ? { areaM2: terreno.areaMm2 / 1_000_000, perimetroM: terreno.perimetroMm / 1000, testadaM } : null,
      taxaOcupacaoPct: aproveitamento ? Math.round(aproveitamento.taxaOcupacao * 1000) / 10 : null,
      coeficiente: aproveitamento ? Math.round(aproveitamento.coeficienteAproveitamento * 100) / 100 : null,
      alturaM: alturaDesenhadaM,
      zona: {
        taxaOcupacaoMax: zona.taxaOcupacaoMax,
        coeficienteMax: zona.coeficienteMax,
        gabaritoAlturaMaxM: zona.gabaritoAlturaMaxM,
        gabaritoPavimentos: zona.gabaritoPavimentos,
        taxaPermeabilidadeMin: zona.taxaPermeabilidadeMin,
        testadaMinimaMm: zona.testadaMinimaMm,
        areaMinimaDoLoteM2: zona.areaMinimaDoLoteM2,
        insolacaoMinimaH: zona.insolacaoMinimaH,
        vagasPorUnidade: zona.vagasPorUnidade,
      },
      envelopePorPavimento: envelopePorPavimentoParaRegras(envelope3d),
      insolacaoPorAmbiente: insolacaoParaRegras(insolacaoDoNivel),
    });
    // NBR 5410 como fonte da lista: as conferências do painel do ambiente, sem
    // segunda conta — tomadas mínimas (9.5.2.2.1) e luz de teto/interruptor (9.5.2.1).
    const regraTomadas: Regra = { id: 'nbr5410-tomadas', nome: 'Tomadas mínimas por ambiente', escopo: 'AMBIENTE', expressao: 'existentes >= minimo', severidade: 'ERRO', fonte: 'NBR 5410:2004', artigo: '9.5.2.2.1' };
    const regraLuz: Regra = { id: 'nbr5410-luz', nome: 'Ponto de luz de teto e interruptor', escopo: 'AMBIENTE', expressao: 'luz_de_teto e interruptor', severidade: 'ERRO', fonte: 'NBR 5410:2004', artigo: '9.5.2.1' };
    const da5410: ResultadoDeRegra[] = ambientes.flatMap((a) => {
      const base = { alvoId: a.id, alvoRotulo: a.rotulo, levelId: levelId ?? null, selecionarId: a.etiquetaId };
      const linhas: ResultadoDeRegra[] = [];
      if (a.conferencia) {
        linhas.push({ regraId: regraTomadas.id, regra: regraTomadas, ...base, estado: a.conferencia.deficit > 0 ? 'VIOLADA' : 'CONFORME', valores: `existentes = ${a.conferencia.existentes} · minimo = ${a.conferencia.minimo} (${a.conferencia.regra})`, motivo: null });
      } else {
        linhas.push({ regraId: regraTomadas.id, regra: regraTomadas, ...base, estado: 'NAO_AVALIADA', valores: '', motivo: 'ambiente sem tipo (NBR 5410) — classifique no cartão do ambiente' });
      }
      const luzOk = !a.luz.faltaLuzDeTeto && !a.luz.faltaInterruptor;
      linhas.push({ regraId: regraLuz.id, regra: regraLuz, ...base, estado: luzOk ? 'CONFORME' : 'VIOLADA', valores: `luzes de teto = ${a.luz.luzesDeTeto} · interruptores = ${a.luz.interruptores}`, motivo: null });
      return linhas;
    });
    // O programa de necessidades (E4.3) entra como fonte, pelas mesmas linhas.
    const doPrograma = conferenciaDoPrograma ? linhasParaLegislacao(conferenciaDoPrograma, programaDoEstudo.programa) : [];
    return [...doMotor, ...da5410, ...doPrograma];
  }, [editor.model, regrasDaOrganizacao, conferenciaDoPrograma, programaDoEstudo.programa, insolacaoDoNivel, zona.insolacaoMinimaH, limitesDoNivel, terreno, aproveitamento, alturaDesenhadaM, envelope3d, zona.taxaOcupacaoMax, zona.coeficienteMax, zona.gabaritoAlturaMaxM, zona.gabaritoPavimentos, zona.taxaPermeabilidadeMin, zona.testadaMinimaMm, zona.areaMinimaDoLoteM2, ambientes, levelId]);
  const errosDeLegislacao = useMemo(() => resultadosDeRegras.filter((r) => r.estado === 'VIOLADA' && r.regra.severidade === 'ERRO').length, [resultadosDeRegras]);
  /**
   * SCORE (E5.2): os dezoito indicadores com explicação, pesos do navegador.
   * O custo vem da prévia do orçamento (só depois que alguém a pediu).
   */
  const [hipotesesDaAvaliacaoCruas, setHipotesesDaAvaliacao] = usePersistedState<HipotesesDaAvaliacao>('blueprint:avaliacao', HIPOTESES_DA_AVALIACAO_PADRAO);
  const hipotesesDaAvaliacao = useMemo(() => hipotesesDaAvaliacaoDaColuna(hipotesesDaAvaliacaoCruas), [hipotesesDaAvaliacaoCruas]);
  const custoTotalDaPrevia = useMemo(() => (previaOrcamento ? previaOrcamento.entries.reduce((s, en) => s + en.quantity * (en.sinapiItem?.price ?? 0), 0) : null), [previaOrcamento]);
  /**
   * DESIGN OPTIONS (E6.1): as alternativas do estudo são os ramos. Lista ao
   * montar e depois de cada mudança; a comparação avalia a outra com o mesmo
   * programa, regras e hipóteses (sem custo — a prévia do orçamento é desta).
   */
  const [ramos, setRamos] = useState<BlueprintBranch[]>([]);
  const [ramosCarregando, setRamosCarregando] = useState(true);
  const [ramosErro, setRamosErro] = useState<string | null>(null);
  const recarregarRamos = useCallback(async () => {
    try {
      setRamos(await listBranches(study.id));
      setRamosErro(null);
    } catch (e) {
      setRamosErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRamosCarregando(false);
    }
  }, [study.id]);
  useEffect(() => {
    void recarregarRamos();
  }, [recarregarRamos]);
  const avaliarOutroModelo = useCallback(
    (m: BlueprintModel) =>
      avaliar(
        {
          model: m,
          programa: programaDoEstudo.programa,
          conferencia: programaDoEstudo.programa.itens.length > 0 ? conferirProgramaDeOutro(m, programaDoEstudo.programa) : null,
          resultadosDeRegras: avaliarRegras(m, [...REGRAS_SEMENTE, ...regrasDaOrganizacao], {
            zona: { taxaOcupacaoMax: zona.taxaOcupacaoMax, coeficienteMax: zona.coeficienteMax, gabaritoAlturaMaxM: zona.gabaritoAlturaMaxM, gabaritoPavimentos: zona.gabaritoPavimentos, taxaPermeabilidadeMin: zona.taxaPermeabilidadeMin, testadaMinimaMm: zona.testadaMinimaMm, areaMinimaDoLoteM2: zona.areaMinimaDoLoteM2, insolacaoMinimaH: zona.insolacaoMinimaH },
          }),
          insolacao: { latitudeGraus: latitudeDoEstudo ?? hipotesesDeInsolacao.latitudeManual, rotacaoNorteDeg: norteDoDesenho, prismas: prismasDoEntornoDoEstudo },
          insolacaoMinimaH: zona.insolacaoMinimaH,
          custoTotalBRL: null,
        },
        hipotesesDaAvaliacao,
      ),
    [programaDoEstudo.programa, regrasDaOrganizacao, zona, latitudeDoEstudo, hipotesesDeInsolacao.latitudeManual, norteDoDesenho, prismasDoEntornoDoEstudo, hipotesesDaAvaliacao],
  );
  /**
   * GERADOR (E6.2): hipóteses do navegador; a entrada é o envelope do pavimento
   * ativo (E3.3), a frente pela divisa FRENTE (direção do meio dela a partir
   * do centro do lote), o norte e a latitude da georreferência, o programa.
   */
  const gerador = useGerador();
  const [hipotesesDoGerador, setHipotesesDoGerador] = usePersistedState<HipotesesDoGerador>('blueprint:gerador', HIPOTESES_DO_GERADOR_PADRAO);
  const entradaDoGerador = useMemo(() => {
    const prisma = envelope3d?.prismas.find((p) => p.levelId === levelId) ?? null;
    const anel = prisma && prisma.anel.length >= 3 ? prisma.anel : envelope?.valido ? envelope.anel : null;
    let direcaoDaFrente: { x: number; y: number } | null = null;
    const frentes = limitesDoNivel.filter((b) => b.kind === 'TERRENO' && b.papel === 'FRENTE');
    if (terreno && frentes.length) {
      const c = { x: terreno.anel.reduce((s, p) => s + p.x, 0) / terreno.anel.length, y: terreno.anel.reduce((s, p) => s + p.y, 0) / terreno.anel.length };
      const m = { x: frentes.reduce((s, b) => s + (b.a.x + b.b.x) / 2, 0) / frentes.length, y: frentes.reduce((s, b) => s + (b.a.y + b.b.y) / 2, 0) / frentes.length };
      const d = { x: m.x - c.x, y: m.y - c.y };
      const n = Math.hypot(d.x, d.y);
      if (n > 1) direcaoDaFrente = { x: d.x / n, y: d.y / n };
    }
    return {
      entrada: { programa: programaDoEstudo.programa, envelope: anel, direcaoDaFrente, rotacaoNorteDeg: norteDoDesenho, latitudeGraus: latitudeDoEstudo ?? hipotesesDeInsolacao.latitudeManual },
      contexto: { temPrograma: programaDoEstudo.programa.itens.length > 0, temEnvelope: !!anel, frenteDeclarada: !!direcaoDaFrente, envelopeM2: anel ? Math.round(Math.abs(polygonArea(anel)) / 10_000) / 100 : null },
    };
  }, [envelope3d, envelope, levelId, limitesDoNivel, terreno, programaDoEstudo.programa, norteDoDesenho, latitudeDoEstudo, hipotesesDeInsolacao.latitudeManual]);
  /** "Aplicar neste pavimento": geometria num lote (paredes por uid + aberturas por wallUid), nomes no segundo. */
  const aplicarAlternativaGerada = async (r: ResultadoDoGerador) => {
    if (!levelId) throw new Error('Abra um pavimento para aplicar.');
    const geo = comandosDeGeometria(r, levelId);
    // O kernel é determinístico: simular o lote dá os mesmos ids que o editor vai criar.
    const simulado = applyBatch(editor.model, geo).model;
    const nomes = nomesParaOModelo(r, simulado, levelId);
    editor.runBatch(geo);
    if (nomes.length) editor.runBatch(nomes);
    setTelaAberta(null);
  };
  /**
   * CONVERSA (E6.4): cada pedido vira mudanças estruturadas (IA ou intérprete
   * local), aplicadas ao programa/hipóteses; o gerador re-gera com as mesmas
   * sementes e o turno fecha com o delta contra a melhor alternativa anterior.
   */
  const [turnos, setTurnos] = useState<TurnoDaConversa[]>([]);
  const [pensando, setPensando] = useState(false);
  const [iaDisponivel, setIaDisponivel] = useState<boolean | null>(null);
  const regeracaoPendente = useRef<{ turnoId: string; antes: ResultadoDoGerador | null } | null>(null);
  const melhorGerada = useMemo(() => [...gerador.resultados].sort((a, b) => (b.avaliacao.notaGeral ?? -1) - (a.avaliacao.notaGeral ?? -1) || a.resumo.objetivoFinal - b.resumo.objetivoFinal || a.semente - b.semente)[0] ?? null, [gerador.resultados]);
  useEffect(() => {
    const pend = regeracaoPendente.current;
    if (!pend || gerador.rodando) return;
    regeracaoPendente.current = null;
    setTurnos((ts) => ts.map((t) => (t.id === pend.turnoId ? concluirTurno(t, pend.antes, melhorGerada) : t)));
  }, [gerador.rodando, melhorGerada]);
  const pedirAIa = async (pedido: string) => {
    const turno = novoTurno(pedido);
    setTurnos((ts) => [...ts, turno]);
    setPensando(true);
    try {
      const contexto = {
        programa: programaDoEstudo.programa,
        hipotesesDoGerador,
        pesos: hipotesesDaAvaliacao.pesos,
        indicadores: (melhorGerada?.avaliacao ?? avaliacao).indicadores.map((i) => ({ chave: i.chave, nota: i.nota, explicacao: i.explicacao })),
        decisoes: melhorGerada?.decisoes ?? [],
      };
      const resposta = await pedirMudancasAIa(pedido, contexto);
      let origem: 'IA' | 'LOCAL' = 'IA';
      let mudancas = resposta.mudancas;
      if (!mudancas) {
        setIaDisponivel(false);
        origem = 'LOCAL';
        mudancas = interpretarPedidoLocal(pedido, programaDoEstudo.programa);
      } else setIaDisponivel(true);
      if (!mudancas) {
        setTurnos((ts) => ts.map((t) => (t.id === turno.id ? { ...t, origem, entendimento: `Não entendi o pedido${resposta.indisponivel ? ` (${resposta.indisponivel})` : ''}.`, estado: 'SEM_MUDANCA' } : t)));
        return;
      }
      const r = aplicarMudancas(mudancas, programaDoEstudo.programa, hipotesesDoGerador, hipotesesDaAvaliacao);
      programaDoEstudo.setPrograma(r.programa);
      setHipotesesDoGerador(r.gerador);
      setHipotesesDaAvaliacao(r.avaliacao);
      setTurnos((ts) => ts.map((t) => (t.id === turno.id ? turnoComMudancas(t, origem, mudancas!, r) : t)));
      if (r.aplicadas.length > 0) {
        regeracaoPendente.current = { turnoId: turno.id, antes: melhorGerada };
        gerador.gerar({ ...entradaDoGerador.entrada, programa: r.programa }, r.gerador, Array.from({ length: r.gerador.sementes }, (_, i) => i + 1));
      }
    } catch (e) {
      setTurnos((ts) => ts.map((t) => (t.id === turno.id ? { ...t, estado: 'ERRO', erro: e instanceof Error ? e.message : String(e), origem: t.origem ?? 'LOCAL' } : t)));
    } finally {
      setPensando(false);
    }
  };
  const avaliacao = useMemo(
    () =>
      avaliar(
        {
          model: editor.model,
          programa: programaDoEstudo.programa,
          conferencia: conferenciaDoPrograma,
          resultadosDeRegras,
          insolacao: { latitudeGraus: latitudeDoEstudo ?? hipotesesDeInsolacao.latitudeManual, rotacaoNorteDeg: norteDoDesenho, prismas: prismasDoEntornoDoEstudo },
          insolacaoMinimaH: zona.insolacaoMinimaH,
          custoTotalBRL: custoTotalDaPrevia,
        },
        hipotesesDaAvaliacao,
      ),
    [editor.model, programaDoEstudo.programa, conferenciaDoPrograma, resultadosDeRegras, latitudeDoEstudo, hipotesesDeInsolacao.latitudeManual, norteDoDesenho, prismasDoEntornoDoEstudo, zona.insolacaoMinimaH, custoTotalDaPrevia, hipotesesDaAvaliacao],
  );

  // ── Quadro de divisas — papéis, medidas da escritura e confrontantes ──────

  const [quadroAberto, setQuadroAberto] = useState(false);
  /** Lado aceso pelo foco no quadro. Destacar não é selecionar — ver o canvas. */
  const [limiteEmDestaque, setLimiteEmDestaque] = useState<string | null>(null);

  const linhasDoLote = useMemo(
    () => (terreno ? linhasDoQuadro(terreno, limitesDoNivel) : []),
    [terreno, limitesDoNivel],
  );
  const ladosSemPapel = linhasDoLote.filter((l) => l.papel === null).length;
  const ladosDivergentes = linhasDoLote.filter(divergente).length;

  /**
   * O quadro abre SOZINHO quando o contorno acabou de fechar sem papel nenhum.
   *
   * É o "ao criar um terreno" do pedido: sem isso, classificar os lados continua
   * sendo uma coisa que dá para esquecer — e lado sem papel não recua, produzindo
   * um envelope errado sem nenhum aviso na tela.
   *
   * ⚠️ A guarda `jaAbriuOQuadro` é o que impede o painel de reabrir a cada
   * edição. Sem ela, apagar o papel dos quatro lados (ou desfazer até antes da
   * classificação) traria o painel de volta por cima do desenho, no meio de outro
   * trabalho.
   */
  const jaAbriuOQuadro = useRef(false);
  useEffect(() => {
    if (!terreno?.fechado) return;
    if (jaAbriuOQuadro.current) return;
    if (linhasDoLote.some((l) => l.papel !== null)) {
      // Lote que veio de um snapshot já classificado não precisa do passo de
      // criação — mas também não pode disparar depois, se alguém limpar tudo.
      jaAbriuOQuadro.current = true;
      return;
    }
    jaAbriuOQuadro.current = true;
    setQuadroAberto(true);
  }, [terreno?.fechado, linhasDoLote]);

  /** Aplica a frente apontada e deriva os demais — UM passo de histórico. */
  function apontarFrente(boundaryId: string) {
    if (!terreno) return;
    const papeis = papeisSugeridos(terreno, boundaryId);
    if (!papeis) return;
    editor.runBatch(
      [...papeis].map(([id, papel]) => ({ type: 'SetBoundaryPapel' as const, boundaryId: id, papel })),
    );
  }

  function adicionarAbertura(wallId: string, offsetMm: number) {
    // Vão livre nasce como porta: do piso (peitoril zero) até a altura de verga.
    // Passa-prato — vão sem esquadria com peitoril alto — se faz subindo o
    // peitoril depois, no painel.
    const comoPorta =
      tipoAbertura === 'door' || tipoAbertura === 'passage' || tipoAbertura === 'sliding';
    // Com um TIPO escolhido na barra, ele manda em tudo: kind, medidas e a
    // esquadria copiada. Sem tipo, os padrões de sempre.
    const t = tipoDaBarra && tipoDaBarra.kind === tipoAbertura ? tipoDaBarra : null;
    const [id] = editor.run({
      type: 'AddOpening',
      wallId,
      kind: tipoAbertura,
      embutida: tipoAbertura === 'sliding' ? (t ? t.embutida : correrEmbutida) : undefined,
      offsetMm,
      widthMm: t ? t.widthMm : larguraAbertura,
      heightMm: t ? t.heightMm : comoPorta ? 2100 : 1200,
      sillMm: t ? t.sillMm : comoPorta ? 0 : 900,
      ...(t ? { esquadria: { nome: t.nome, itemCode: t.itemCode, descricao: t.descricao } } : {}),
    });
    // JÁ NASCE SELECIONADA.
    //
    // Tudo que se faz com uma abertura logo depois de inserir — girar, espelhar,
    // acertar a largura, subir o peitoril, trocar o tipo — mora no painel do
    // selecionado. Sem isto, cada porta custava um clique a mais só para dizer
    // "esta que acabei de pôr", e esse clique tem que acertar o vão: perto da
    // ombreira ele pega a PAREDE, e o painel mostra a coisa errada.
    //
    // A ferramenta continua sendo Abertura: quem está pondo uma fileira de portas
    // segue pondo, e a seleção acompanha a última. Trocar para Selecionar aqui
    // interromperia justamente o trabalho em série.
    if (id) selecionar([id]);
  }

  /**
   * Gira ou espelha a folha da porta selecionada — de abrir ou de correr.
   *
   * Um comando só para as duas: na de abrir, `hinge` é a dobradiça e `swing` é o
   * lado para onde abre; na de correr, `hinge` é a ponta para onde a folha
   * recolhe e `swing` é a face por onde ela desliza. O painel escolhe as
   * palavras; o eixo é o mesmo.
   */
  function flipAbertura(axis: 'hinge' | 'swing') {
    if (!aberturaSel) return;
    editor.run({ type: 'FlipOpening', openingId: aberturaSel.id, axis });
  }

  /**
   * Muda largura/altura/peitoril da abertura selecionada.
   *
   * Sem tratamento de erro aqui de propósito: o kernel recusa o que não couber
   * (largura além da parede, altura além do pé-direito, sobreposição com outra
   * abertura) e `editor.run` transforma o `KernelError` na faixa de aviso do
   * topo — que já traz a medida máxima no texto.
   */
  /**
   * Aplica um tipo salvo à abertura selecionada — kind, medidas e esquadria —
   * num LOTE: um passo de desfazer. Aplicar só a esquadria e deixar a porta em
   * 90×210 quando o tipo diz 80×210 produziria uma P1 que não é P1.
   */
  function aplicarTipoDeEsquadria(abertura: Opening, tipo: TipoDeEsquadria) {
    editor.runBatch([
      { type: 'SetOpeningKind', openingId: abertura.id, kind: tipo.kind, embutida: tipo.embutida },
      {
        type: 'SetOpeningSize',
        openingId: abertura.id,
        widthMm: tipo.widthMm,
        heightMm: tipo.heightMm,
        sillMm: tipo.sillMm,
      },
      {
        type: 'SetOpeningEsquadria',
        openingId: abertura.id,
        esquadria: { nome: tipo.nome, itemCode: tipo.itemCode, descricao: tipo.descricao },
      },
    ]);
  }

  /**
   * Importa a estrutura lida de um IFC — UM lote, um passo de desfazer.
   *
   * `runBatch` aplica sobre uma cópia e propaga a exceção do kernel: ou entram
   * todas as peças, ou nenhuma. Metade de uma importação de 393 peças seria
   * pior que nenhuma, e desfazer teria de ser 393 vezes.
   *
   * A seleção fica no que entrou: é o que a pessoa vai conferir em seguida, e
   * sem isso 393 peças novas nasceriam invisíveis no meio do desenho.
   */
  function importarDoIfc(comandos: Command[]) {
    if (comandos.length === 0) return;
    try {
      const criados = editor.runBatch(comandos);
      if (criados.length > 0) selecionar(criados);
    } catch (e) {
      // A mensagem do kernel diz QUAL peça recusou e por quê — é mais útil que
      // "falha ao importar", e é a única pista de um IFC com geometria que
      // passou pela tradução e ainda assim viola um invariante.
      setErroDoCorte(
        e instanceof Error
          ? `A importação foi recusada pelo desenho: ${e.message}`
          : 'A importação foi recusada pelo desenho.',
      );
    }
  }

  function redimensionarAbertura(campos: {
    widthMm?: number;
    heightMm?: number;
    sillMm?: number;
  }) {
    if (!aberturaSel) return;
    editor.run({ type: 'SetOpeningSize', openingId: aberturaSel.id, ...campos });
  }

  function dividirSelecionada() {
    if (!paredeSel) return;
    // Divide no meio: e o unico ponto que sempre existe e nunca coincide com
    // ponta, entao nao depende de o usuario acertar um clique no eixo.
    editor.run({
      type: 'SplitWall',
      wallId: paredeSel.id,
      at: {
        x: Math.round((paredeSel.a.x + paredeSel.b.x) / 2),
        y: Math.round((paredeSel.a.y + paredeSel.b.y) / 2),
      },
    });
    editor.setSelectedId(null);
  }

  /**
   * A vizinha que pode ser unida à selecionada.
   *
   * Precisa ser COLINEAR, e não só encostada. A primeira versão pegava qualquer
   * parede que compartilhasse uma ponta — mas numa sala retangular toda vizinha
   * é perpendicular, então ela escolhia a errada e o kernel recusava com
   * "Paredes não são colineares". O botão ficava quebrado no caso mais comum, e
   * o erro aparecia depois do clique em vez de antes.
   *
   * Calculado como memo para a UI poder DESABILITAR o botão quando não houver
   * candidata, em vez de deixar o usuário descobrir clicando.
   */
  const vizinhaParaUnir = useMemo(() => {
    if (!paredeSel) return null;
    const mesmaPonta = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
    return (
      editor.model.walls.find((o) => {
        if (o.id === paredeSel.id || o.levelId !== paredeSel.levelId) return false;
        if (o.thicknessMm !== paredeSel.thicknessMm) return false;
        const encosta =
          mesmaPonta(o.a, paredeSel.b) ||
          mesmaPonta(o.b, paredeSel.a) ||
          mesmaPonta(o.a, paredeSel.a) ||
          mesmaPonta(o.b, paredeSel.b);
        if (!encosta) return false;
        // Os quatro pontos têm que estar na mesma reta — testado com os dois
        // extremos da vizinha, senão uma parede que só toca de raspão passa.
        return (
          areCollinear(paredeSel.a, paredeSel.b, o.a) &&
          areCollinear(paredeSel.a, paredeSel.b, o.b)
        );
      }) ?? null
    );
  }, [paredeSel, editor.model.walls]);

  function unirSelecionada() {
    if (!paredeSel || !vizinhaParaUnir) return;
    editor.run({ type: 'MergeWalls', firstId: paredeSel.id, secondId: vizinhaParaUnir.id });
    editor.setSelectedId(null);
  }

  /**
   * A ponta escolhida À MÃO no painel, se houver.
   *
   * Guarda o `wallId` junto de propósito: assim a escolha morre sozinha ao
   * trocar de parede, sem `useEffect` de limpeza. Escolha que vazasse para a
   * parede seguinte seria pior que não ter escolha nenhuma — o campo passaria a
   * esticar a ponta errada em silêncio.
   */
  const [ancoraManual, setAncoraManual] = useState<{ wallId: string; end: 'a' | 'b' } | null>(null);
  /** Ponta apontada no painel agora, para o desenho mostrar QUAL é. */
  const [pontaDestacada, setPontaDestacada] = useState<'a' | 'b' | null>(null);

  /**
   * Qual ponta anda ao digitar um novo comprimento, e se isso arrasta o canto.
   *
   * Decisão de produto (12/08/2026): se uma das pontas está LIVRE, é ela que
   * anda — a correção feita à mão, logo depois de desenhar, não deve mexer em
   * nada já encaixado. Se as duas estão livres, ou as duas presas, anda a
   * FINAL (`b`, a última clicada ao desenhar): é a regra mais fácil de prever
   * quando não há uma ponta obviamente "solta".
   *
   * Isso é o PADRÃO, não a sentença (28/08/2026). Numa parede com os dois cantos
   * fechados a regra sempre puxava a final, e "final" depende de qual ponta foi
   * clicada primeiro ao desenhar — informação que não aparece em lugar nenhum
   * depois. Os botões Início/Fim do painel sobrepõem a escolha.
   */
  const esticamento = useMemo(() => {
    if (!paredeSel) {
      return {
        pontaQueAnda: null as 'a' | 'b' | null,
        arrastaCanto: false,
        aLivre: false,
        bLivre: false,
        escolhidaAMao: false,
      };
    }
    const nivel = editor.model.walls.filter((w) => w.levelId === paredeSel.levelId);
    const aLivre = isFreeWallEnd(nivel, paredeSel.a, paredeSel.id);
    const bLivre = isFreeWallEnd(nivel, paredeSel.b, paredeSel.id);
    const automatica: 'a' | 'b' = aLivre && !bLivre ? 'a' : 'b';
    const manual = ancoraManual?.wallId === paredeSel.id ? ancoraManual.end : null;
    const pontaQueAnda = manual ?? automatica;
    return {
      pontaQueAnda,
      arrastaCanto: !(pontaQueAnda === 'a' ? aLivre : bLivre),
      aLivre,
      bLivre,
      escolhidaAMao: manual !== null,
    };
  }, [paredeSel, editor.model.walls, ancoraManual]);

  /**
   * Aplica o comprimento digitado no painel.
   *
   * A ponta escolhida (`esticamento.pontaQueAnda`) anda ao longo do PRÓPRIO
   * EIXO — `pontaEsticada` preserva a direção, a parede nunca gira.
   *
   * Se aquela ponta ENCONTRA outras paredes, elas andam JUNTO, no MESMO lote de
   * histórico (`runBatch`): mover só a nossa abriria o canto e apagaria o
   * ambiente e o quantitativo em silêncio — a mesma razão pela qual o traçado
   * pela face mitra o canto num lote só. `runBatch` aborta o lote inteiro se
   * alguma correção for recusada, então o canto nunca fica pior do que estava.
   *
   * O acompanhamento é do KERNEL (`MoveVertex` com `manterJuncoes`), não um laço
   * daqui. Enquanto era um laço, ele casava vizinha por coordenada EXATA, e numa
   * junção em T a ponta que morre no meio do corpo de outra parede não é vértice
   * de ninguém — não havia `MoveVertex` de vizinha para disparar e o encontro
   * simplesmente desencostava. No kernel a mesma conta cobre vértice e T, e o
   * gesto de arrastar a alça passa a fazer exatamente isto.
   */
  function esticarParede(comprimentoMm: number) {
    if (!paredeSel) return;
    // `esticamento.pontaQueAnda` só é `null` quando `paredeSel` é `null` — mas o
    // memo devolve um tipo próprio, e o TypeScript não enxerga essa relação
    // entre as duas variáveis. A guarda é redundante em runtime, não em tipo.
    const { pontaQueAnda } = esticamento;
    if (!pontaQueAnda) return;
    const nivel = editor.model.walls.filter((w) => w.levelId === paredeSel.levelId);
    const ancora = pontaQueAnda === 'a' ? paredeSel.b : paredeSel.a;
    const pontaAtual = pontaQueAnda === 'a' ? paredeSel.a : paredeSel.b;

    let novaPonta: Point;
    try {
      novaPonta = pontaEsticada(ancora, pontaAtual, comprimentoMm);
    } catch (e) {
      // Coordenada fora de ±1.000.000 mm (alguém digitou metros achando que
      // eram milímetros). Recusa silenciosa: o campo já ressincroniza com o
      // valor atual no próximo render, então não há necessidade de expor o
      // erro do kernel para um dígito a mais.
      if (e instanceof KernelError) return;
      throw e;
    }

    const lote: Command[] = [
      {
        type: 'MoveVertex',
        wallId: paredeSel.id,
        end: pontaQueAnda,
        to: novaPonta,
        manterJuncoes: true,
      },
    ];

    // ── O LADO OPOSTO ACOMPANHA, quando isto é um retângulo ─────────────────
    //
    // Sem isto, mover a ponta arrasta UM canto: a parede perpendicular fica
    // oblíqua e o retângulo vira um quadrilátero irregular. Transladando também
    // o outro extremo do lado perpendicular, o LADO INTEIRO anda — os dois
    // lados paralelos ao editado ficam com o comprimento novo e os quatro
    // ângulos seguem retos.
    //
    // Vai no MESMO lote: um Desfazer devolve o retângulo inteiro. Em dois
    // lotes existiria um passo intermediário com a planta torta, que ninguém
    // quer visitar.
    const acompanha = verticeDeAcompanhamento(nivel, paredeSel, pontaQueAnda);
    if (acompanha) {
      const dx = novaPonta.x - pontaAtual.x;
      const dy = novaPonta.y - pontaAtual.y;
      let destino: Point;
      try {
        destino = point(roundToMm(acompanha.x + dx), roundToMm(acompanha.y + dy));
      } catch (e) {
        if (e instanceof KernelError) return;
        throw e;
      }
      for (const w of nivel) {
        for (const end of ['a', 'b'] as const) {
          if (w[end].x === acompanha.x && w[end].y === acompanha.y) {
            lote.push({ type: 'MoveVertex', wallId: w.id, end, to: destino });
          }
        }
      }
    }

    editor.runBatch(lote);
  }

  /**
   * Vãos candidatos: pares de pontas de parede que não encontram nada e estão
   * perto o bastante para ser abertura.
   *
   * O sistema NÃO decide qual fechar — só apresenta. Cinco rodadas do Spike C
   * mostraram que essa decisão é justamente a que a máquina erra: fechar por
   * proximidade junta parede com guarda-corpo; fechar por colinearidade fecha a
   * borda de terraço, que devia ficar aberta. Porta, guarda-corpo e limite do
   * envelope têm geometria parecida demais.
   *
   * O que a máquina faz bem é ACHAR os candidatos e medir. Quem sabe se aquele
   * vão de 90 cm é porta ou passagem é quem conhece o projeto.
   */
  const vaosCandidatos = useMemo(() => {
    // ⚠️ A VERDADE É O ARRANJO, não a contagem de coordenadas repetidas.
    //
    // Aqui havia um mapa de "quantas paredes terminam exatamente neste ponto", e
    // grau 1 virava bolinha âmbar. Isso erra na junção em T, que é a mais comum
    // de todas: o montante morre no MEIO da hospedeira, não divide vértice com
    // ninguém, e a contagem o declarava solto — enquanto o arranjo planar, que
    // divide a hospedeira na interseção, já o via com grau 3 e ligado.
    //
    // O ESTRAGO FOI REAL. Numa planta do usuário com 9 ambientes fechados e UMA
    // ponta solta de verdade, este painel desenhava QUINZE círculos. Quatorze
    // eram junções em T perfeitas. Ele passou quatro rodadas de correção olhando
    // para marcações que não deviam existir — e a cada rodada a geometria era
    // mexida, porque o marcador é que estava mentindo.
    //
    // O critério tem de ser o do arranjo porque é ele que responde a pergunta
    // que o aviso faz — "o contorno fecha?" —, e é dele que saem área, piso e
    // rodapé.
    const level = editor.model.levels.find((l) => l.id === levelId);
    const soltas: PontaSolta[] = level
      ? pontasSoltasDoNivel(editor.model, level).map((s) => ({
          p: s.p,
          wallId: s.wallId,
          end: s.end,
          oposta: s.oposta,
        }))
      : [];
    const pontas = soltas;

    // Faixa de abertura de verdade: de 40 cm (passagem estreita) a 3 m (vão de
    // sala). Fora disso não é abertura — é parede faltando ou desenho separado.
    const MIN = 400;
    const MAX = 3000;
    const pares: Vao[] = [];
    for (let i = 0; i < pontas.length; i++) {
      for (let j = i + 1; j < pontas.length; j++) {
        const a = pontas[i];
        const b = pontas[j];
        const mm = Math.round(Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y));
        if (mm < MIN || mm > MAX) continue;
        // Perto NÃO basta — as duas pontas têm que estar na mesma linha.
        if (!naMesmaLinha(a, b) || !naMesmaLinha(b, a)) continue;
        // `Set` porque as duas pontas podem ser da MESMA parede — um trecho
        // curto e solto, com os dois extremos livres. Selecionar o id repetido
        // faria o painel anunciar "2 paredes" onde há uma.
        pares.push({ a: a.p, b: b.p, mm, wallIds: [...new Set([a.wallId, b.wallId])] });
      }
    }
    // Cada ponta entra num par só: o mais curto ganha.
    pares.sort((p, q) => p.mm - q.mm);
    const usada = new Set<string>();
    const escolhidos: Vao[] = [];
    for (const par of pares) {
      const ka = `${par.a.x},${par.a.y}`;
      const kb = `${par.b.x},${par.b.y}`;
      if (usada.has(ka) || usada.has(kb)) continue;
      usada.add(ka);
      usada.add(kb);
      escolhidos.push(par);
    }
    return { soltas, vaos: escolhidos };
  }, [editor.model.walls, levelId]);

  /**
   * O beco sem saída, nomeado: pontas soltas contra um segmento PARALELO.
   *
   * A conta mora no kernel (`juntasParalelasSemCanto`), junto de
   * `encostosSemJuncao` e `cantosEncostados` — é diagnóstico de topologia, e a
   * régua de paralelismo tem de ser a MESMA que `cantoEntreEixos` usa para
   * recusar. Reimplementada aqui, o aviso apareceria em casos que a ferramenta
   * Juntar resolve, ou calaria em casos que ela recusa.
   */
  const juntasParalelas = useMemo(() => {
    const level = editor.model.levels.find((l) => l.id === levelId);
    return level ? juntasParalelasSemCanto(editor.model, level) : [];
  }, [editor.model, levelId]);

  /**
   * ─── CONEXÃO EM T, AUTOMÁTICA ───────────────────────────────────────────────
   *
   * Pedido de 23/08/2026, com print: "a conexão de paredes em T aparentemente não
   * está acontecendo". Estava certo, e o defeito era pior do que o print mostrava.
   *
   * MEDIDO NA PLANTA DO USUÁRIO (gerada de PDF): 35 paredes, 22 vértices de grau 1
   * e ZERO ambientes. Treze pontas paravam a 11–100 mm do eixo da parede que
   * deveriam encontrar — meia espessura dela. Em planta o T parecia perfeito,
   * porque as faixas de espessura se sobrepõem; no modelo, feito de eixos, a ponta
   * estava solta. Levando as treze ao eixo: 0 → 5 ambientes.
   *
   * ─── POR QUE AUTOMÁTICO ─────────────────────────────────────────────────────
   *
   * Decisão do usuário, escolhida contra a alternativa de um botão no painel. O
   * risco que eu levantei — mover parede sem ninguém pedir — está mitigado por
   * três coisas, e não some:
   *
   *   1. entra pelo HISTÓRICO (`runBatch`), então Desfazer reverte o lote inteiro;
   *   2. avisa DEPOIS, na faixa de status: "sem perguntar" não é "sem contar";
   *   3. o critério é estreito — a ponta tem de estar DENTRO da faixa de espessura
   *      desenhada da outra parede. É essa a definição de "parece ligado".
   *
   * Roda UMA vez por carregamento. Rodar a cada mudança do modelo brigaria com
   * quem está editando: bastaria arrastar uma ponta para perto de outra parede
   * para ela ser puxada para o eixo no meio do gesto.
   *
   * ─── DUAS FORMAS, E POR QUE ITERA ───────────────────────────────────────────
   *
   * `encostosSemJuncao` pega a ponta que morre contra outra parede; `cantosEncostados`
   * pega as duas pontas que se sobrepõem num CANTO. As duas são o mesmo defeito —
   * desenho afirmando ligação que o modelo não tem — e o usuário não distingue uma
   * da outra olhando a tela.
   *
   * O LAÇO não é zelo: corrigir muda a topologia, e a topologia é o critério.
   * Na planta do usuário a primeira passada resolveu 13 pontas e, ao mudar o
   * arranjo, revelou uma 14ª que antes nem aparecia como solta. Rodando uma vez
   * só, ela sobrava na tela — e foi exatamente o "não funcionou" que ele reportou.
   */
  const [avisoConexaoT, setAvisoConexaoT] = useState<string | null>(null);
  const conexaoTFeitaEm = useRef<string | null>(null);

  /**
   * Os comandos que faltam para o modelo afirmar o que o desenho já afirma.
   *
   * Itera sobre uma cópia SIMULADA (`applyBatch`), e não sobre o estado do React:
   * `editor.model` só muda no próximo render, então um laço que dependesse dele
   * releria o mesmo modelo a cada volta e nunca convergiria.
   */
  const comandosDeConexao = useCallback(
    (partida: typeof editor.model): Command[] => {
      const todos: Command[] = [];
      let atual = partida;
      // Teto de segurança. Cada volta só é dada se a anterior mudou alguma coisa,
      // então convergir é o caso normal; o teto existe para o caso patológico em
      // que duas correções se desfazem mutuamente, e vale mais parar com o que já
      // deu certo do que travar a abertura da planta.
      for (let volta = 0; volta < 6; volta++) {
        const level = atual.levels.find((l) => l.id === levelId);
        if (!level) break;
        const lote: Command[] = [
          ...encostosSemJuncao(atual, level).map((e) => ({
            type: 'MoveVertex' as const,
            wallId: e.wallId,
            end: e.end,
            to: e.to,
          })),
          ...cantosEncostados(atual, level).flatMap((c) =>
            c.movimentos.map((m) => ({
              type: 'MoveVertex' as const,
              wallId: m.wallId,
              end: m.end,
              to: m.to,
            })),
          ),
        ];
        if (lote.length === 0) break;
        try {
          atual = applyBatch(atual, lote).model;
        } catch {
          // Uma correção recusada pelo kernel (uma porta que cairia fora da parede
          // encurtada, por exemplo) não pode derrubar as que já deram certo.
          break;
        }
        todos.push(...lote);
      }
      return todos;
    },
    [levelId],
  );

  /**
   * O mesmo passe, agora sob demanda.
   *
   * Diz o que fez — inclusive quando não fez nada, que é o caso em que o usuário
   * mais precisa de resposta: um botão que aceita o clique e fica em silêncio
   * ensina a desconfiar do botão.
   */
  /**
   * PAREDE QUE TERMINA NO VAZIO (P2.42): as pontas soltas que encontrariam outra
   * parede se continuassem retas. Fica fora do passe automático de propósito —
   * esticar meio metro não é "parece ligado", é uma decisão sobre o projeto.
   */
  const extensoes = useMemo(() => {
    const level = editor.model.levels.find((l) => l.id === levelId);
    return level ? extensoesAteEncontrar(editor.model, level) : [];
  }, [editor.model, levelId]);

  function estenderAgora() {
    if (extensoes.length === 0) return;
    const comandos: Command[] = extensoes.map((e) => ({ type: 'MoveVertex', wallId: e.wallId, end: e.end, to: e.to }));
    try {
      editor.runBatch(comandos);
      const maior = Math.max(...extensoes.map((e) => e.distanciaMm));
      setAvisoConexaoT(`${comandos.length} parede(s) esticada(s) até encontrar (a maior andou ${(maior / 1000).toFixed(2).replace('.', ',')} m). Desfazer reverte tudo de uma vez.`);
    } catch (e) {
      setAvisoConexaoT(e instanceof Error ? `O desenho recusou: ${e.message}` : 'O desenho recusou a extensão.');
    }
  }

  /**
   * As pontas de guarda-corpo que deveriam encostar e não encostam (P2.45).
   *
   * Guarda-corpo não entra no arranjo planar — não fecha ambiente, não aparece
   * em `pontasSoltasDoNivel` —, então nada no app olhava para ele. Este é o
   * único aviso que existe sobre a peça, e a conta é a MESMA que o traçado usa
   * para encostar: o que o aviso lista é exatamente o que o botão conserta.
   */
  const guardaCorposSoltosDoNivel = useMemo(
    () => (levelId ? guardaCorposSoltos(editor.model, levelId) : []),
    [editor.model, levelId],
  );

  function encostarGuardaCorposAgora() {
    if (guardaCorposSoltosDoNivel.length === 0) return;
    const porPeca = new Map<ObjectId, typeof guardaCorposSoltosDoNivel>();
    for (const s of guardaCorposSoltosDoNivel) {
      porPeca.set(s.guardaCorpoId, [...(porPeca.get(s.guardaCorpoId) ?? []), s]);
    }
    const comandos: Command[] = [];
    for (const [guardaCorpoId, correcoes] of porPeca) {
      const g = (editor.model.guardaCorpos ?? []).find((x) => x.id === guardaCorpoId);
      if (!g) continue;
      const pontos = pontosCorrigidos(g.pontos, correcoes);
      // Trecho que virou nulo não vai: o kernel recusaria o lote inteiro.
      if (pontos.some((p, i) => i > 0 && p.x === pontos[i - 1].x && p.y === pontos[i - 1].y)) continue;
      comandos.push({ type: 'SetGuardaCorpoProps', guardaCorpoId, pontos });
    }
    if (comandos.length === 0) return;
    try {
      const maior = Math.max(...guardaCorposSoltosDoNivel.map((s) => s.folgaMm));
      editor.runBatch(comandos);
      setAvisoConexaoT(
        `${guardaCorposSoltosDoNivel.length} ponta(s) de guarda-corpo encostada(s) (a maior andou ${maior} mm). Desfazer reverte tudo de uma vez.`,
      );
    } catch (e) {
      setAvisoConexaoT(e instanceof Error ? `O desenho recusou: ${e.message}` : 'O desenho recusou o encosto.');
    }
  }

  /**
   * Junta as pontas paralelas que estão a um empurrão de fechar (P2.51).
   *
   * ⚠️ Calculado NO CLIQUE, e não em `useMemo`, porque a conta mede o efeito
   * de cada junta no arranjo do pavimento: 100 ms na planta real (195 paredes).
   * Num memo sobre `editor.model` isso rodaria a cada comando — a cada clique de
   * desenho — e travaria o traçado. É o mesmo caminho de `conectarAgora`.
   */
  /**
   * Pontas que o usuário marcou como INTENCIONAIS (varanda, limite externo).
   *
   * ⚠️ No navegador, por estudo — não no modelo. É juízo de quem revisa, não
   * geometria: gravá-lo no payload mudaria o hash do desenho, e duas pessoas
   * revisando a mesma planta produziriam versões diferentes sem uma linha ter
   * mudado de lugar.
   */
  const [pontasIgnoradas, setPontasIgnoradas] = usePersistedState<string[]>(
    `blueprint:pontas-intencionais:${study.id}`,
    [],
  );
  const ignoradasSet = useMemo(() => new Set(pontasIgnoradas), [pontasIgnoradas]);
  /**
   * A fila da revisão guiada (P2.52).
   *
   * Depende de `editor.model`, como os outros diagnósticos do bloco — e pode,
   * porque a conta é barata: lista as pontas soltas e, para cada uma, olha a
   * vizinhança. O caro (medir o efeito de cada conserto no arranjo) é da P2.51,
   * e por isso lá o cálculo mora no clique.
   */
  const pontasEmRevisao = useMemo(() => {
    const level = editor.model.levels.find((l) => l.id === levelId);
    return level ? pontasParaRevisar(editor.model, level, ignoradasSet) : [];
  }, [editor.model, levelId, ignoradasSet]);

  function aplicarOpcaoDaPonta(ponta: PontaEmRevisao, indice: number) {
    const opcao = ponta.opcoes[indice];
    if (!opcao) return;
    try {
      editor.runBatch(opcao.comandos);
      setAvisoConexaoT(`${opcao.rotulo}. Desfazer reverte.`);
    } catch (e) {
      setAvisoConexaoT(e instanceof Error ? `O desenho recusou: ${e.message}` : 'O desenho recusou a ação.');
    }
  }

  function juntarParalelasAgora() {
    const level = editor.model.levels.find((l) => l.id === levelId);
    if (!level) return;
    const juntas = juncoesParalelasProximas(editor.model, level);
    if (juntas.length === 0) {
      setAvisoConexaoT(
        `Nenhuma junta paralela a menos de ${LATERAL_MAXIMA_MM / 10} cm que feche o contorno. ` +
          'As que sobram estão longe demais para serem junta desfeita — são paredes distintas, e encostá-las inventaria geometria.',
      );
      return;
    }
    try {
      const maiorLateral = Math.max(...juntas.map((j) => j.lateralMm));
      const maiorAndou = Math.max(...juntas.map((j) => j.distanciaMm));
      editor.runBatch(comandosDeJuntarParalelas(juntas));
      // As DUAS medidas: o desalinho (que a tolerância limita) e o quanto a ponta
      // andou (que inclui o deslize no próprio eixo, e por isso pode ser maior).
      setAvisoConexaoT(
        `${juntas.length} ponta(s) paralela(s) juntadas — desalinho de até ${maiorLateral} mm; ` +
          `a que mais andou percorreu ${maiorAndou} mm, deslizando no próprio eixo até a ponta da outra parede. ` +
          'Desfazer reverte tudo de uma vez.',
      );
    } catch (e) {
      setAvisoConexaoT(e instanceof Error ? `O desenho recusou: ${e.message}` : 'O desenho recusou a junção.');
    }
  }

  function conectarAgora() {
    const comandos = comandosDeConexao(editor.model);
    if (comandos.length === 0) {
      setAvisoConexaoT(
        'Nenhuma ponta se sobrepõe a outra parede no desenho — não há o que encostar sem adivinhar. ' +
          'As que sobram estão longe o bastante para serem vão de verdade: use a ferramenta Juntar, ' +
          'que deixa a decisão com você.',
      );
      return;
    }
    editor.runBatch(comandos);
    setAvisoConexaoT(
      `${comandos.length} ponta(s) encostadas. Desfazer reverte tudo de uma vez.`,
    );
  }

  useEffect(() => {
    if (editor.loading || !branchId || !levelId) return;
    if (conexaoTFeitaEm.current === branchId) return;
    conexaoTFeitaEm.current = branchId;

    const comandos = comandosDeConexao(editor.model);
    if (comandos.length === 0) return;
    editor.runBatch(comandos);
    setAvisoConexaoT(
      `${comandos.length} ponta(s) encostavam noutra parede sem alcançar o eixo dela — o desenho parecia ` +
        'ligado, o modelo não estava, e por isso os ambientes não fechavam. Foram encostadas. ' +
        'Desfazer reverte tudo de uma vez.',
    );
    // `editor` muda a cada render; incluí-lo faria o efeito disparar de novo logo
    // depois de mexer no modelo. A trava real é `conexaoTFeitaEm`, e a identidade
    // do carregamento é `branchId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.loading, branchId, levelId]);

  /**
   * ─── JUNTAR DUAS PONTAS SOLTAS NUM CANTO ────────────────────────────────────
   *
   * Pedido de 23/08/2026: clicar num círculo âmbar, clicar no outro, e as duas
   * paredes se encontrarem sozinhas. Até aqui a ponta solta era só AVISO — fechar
   * o canto exigia selecionar a parede, pegar a alça e arrastar a olho, em pixel.
   *
   * O detector de vãos não cobre este caso de propósito: ele só oferece pares na
   * MESMA LINHA, e canto aberto por definição não está (ver `naMesmaLinha`).
   */
  const [pontaEmJuncao, setPontaEmJuncao] = useState<PontaSolta | null>(null);
  const [avisoJuncao, setAvisoJuncao] = useState<string | null>(null);

  /**
   * O que está copiado. Estado, e não `ref`: a barra mostra "Colar" habilitado
   * ou não a partir dele, e um `ref` não redesenharia o botão.
   *
   * NÃO usa a área de transferência do sistema operacional. O que se copia aqui
   * são ids de um modelo de kernel, não texto — e passar por `navigator
   * .clipboard` exigiria permissão do navegador para colar o que o próprio
   * editor acabou de guardar.
   */
  const [areaDeTransferencia, setAreaDeTransferencia] = useState<AreaDeTransferencia | null>(null);
  const [avisoColar, setAvisoColar] = useState<string | null>(null);

  /**
   * Trocar de ferramenta esquece a ponta escolhida.
   *
   * Uma escolha que sobrevive à troca volta a agir num clique que o usuário já
   * esqueceu ter dado — e o que ela faz é mover geometria.
   */
  useEffect(() => {
    if (editor.tool !== 'juntar') {
      setPontaEmJuncao(null);
      setAvisoJuncao(null);
    }
  }, [editor.tool]);

  /**
   * Leva as duas pontas ao cruzamento dos próprios eixos.
   *
   * NENHUMA parede gira: cada uma anda no eixo em que já está, uma encurtando e a
   * outra esticando, até o ponto onde as duas retas se cruzam. Se a planta veio
   * torta do PDF o canto sai com 89° — e sai FECHADO, que é o que decide se o
   * ambiente aparece e se o quantitativo sai. Endireitar o desenho é outro
   * problema; resolvê-lo aqui giraria uma parede que ninguém mandou girar.
   *
   * `runBatch`, e não dois `run`: UM passo de desfazer, e o lote inteiro aborta se
   * o kernel recusar qualquer um dos dois — o canto nunca fica pior do que estava.
   * Mesmo argumento de `esticarParede`. A recusa do kernel (uma porta que cairia
   * fora da parede encurtada) aparece sozinha na faixa vermelha.
   */
  function juntarPontas(primeira: PontaSolta, segunda: PontaSolta) {
    setAvisoJuncao(null);

    if (primeira.wallId === segunda.wallId) {
      setAvisoJuncao('São as duas pontas da MESMA parede — uma parede não faz canto consigo mesma.');
      setPontaEmJuncao(null);
      return;
    }

    const canto = cantoEntreEixos(primeira.oposta, primeira.p, segunda.oposta, segunda.p);
    if (!canto) {
      setAvisoJuncao(
        'Estas duas não formam canto: os eixos são paralelos (ou quase), ou se cruzariam longe demais. ' +
          'Se elas estão na MESMA LINHA, o caso é vão — use a lista do painel âmbar.',
      );
      setPontaEmJuncao(null);
      return;
    }

    editor.runBatch([
      { type: 'MoveVertex', wallId: primeira.wallId, end: primeira.end, to: canto },
      { type: 'MoveVertex', wallId: segunda.wallId, end: segunda.end, to: canto },
    ]);
    setPontaEmJuncao(null);
  }

  /**
   * Da SELEÇÃO no desenho de volta para a linha da lista — o caminho inverso do
   * clique.
   *
   * Sem ele o casamento só funcionava num sentido: quem achasse a ponta solta na
   * planta (que é onde ela salta aos olhos, em âmbar) tinha de descobrir sozinho
   * qual das linhas "Vão N" oferecia fechá-la, e numa planta real as medidas se
   * repetem — havia quatro vãos de 0,98 m.
   *
   * É um conjunto, e não um índice: uma parede com as DUAS pontas soltas
   * participa de dois vãos, e apagar um deles da lista seria mentir sobre o que
   * a seleção alcança. Para o desenho e para a rolagem vale o primeiro.
   */
  const vaosDaSelecao = useMemo(() => {
    const sel = new Set(editor.selectedIds);
    const marcados = new Set<number>();
    if (sel.size === 0) return marcados;
    vaosCandidatos.vaos.forEach((v, i) => {
      if (v.wallIds.some((id) => sel.has(id))) marcados.add(i);
    });
    return marcados;
  }, [editor.selectedIds, vaosCandidatos.vaos]);

  const primeiroVaoDaSelecao = vaosDaSelecao.size > 0 ? Math.min(...vaosDaSelecao) : null;

  /**
   * Traz a linha correspondente para dentro da vista.
   *
   * `'nearest'` de propósito: se a linha já está visível, nada se mexe. Rolar o
   * painel a cada clique no desenho embaralharia a leitura de quem está
   * revisando a lista de cima a baixo.
   */
  const linhasDeVao = useRef(new Map<number, HTMLLIElement>());
  useEffect(() => {
    if (primeiroVaoDaSelecao === null) return;
    linhasDeVao.current.get(primeiroVaoDaSelecao)?.scrollIntoView({ block: 'nearest' });
  }, [primeiroVaoDaSelecao]);

  /**
   * Da linha da lista para o desenho: seleciona as paredes das duas pontas.
   *
   * Passa pelo funil `selecionar` como qualquer outra seleção — a lista não tem
   * um estado de seleção próprio, senão painel e canvas voltariam a mostrar
   * coisas diferentes.
   */
  function selecionarParedesDoVao(vao: Vao) {
    if (vao.wallIds.length === 0) return;
    selecionar(vao.wallIds);
  }

  /** Fecha o vão com parede cheia. Use quando a interrupção era só desenho. */
  function fecharComParede(vao: { a: Point; b: Point }) {
    if (!levelId) return;
    editor.run({
      type: 'AddWall',
      levelId,
      a: vao.a,
      b: vao.b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
  }

  /**
   * Fecha o vão e marca que ali existe uma porta.
   *
   * Duas operações porque são dois fatos: o contorno passa a fechar (e o
   * ambiente aparece com a área certa) E fica registrado que aquele trecho é
   * abertura, não alvenaria. Sem a segunda, o quantitativo contaria parede onde
   * há porta.
   */
  /**
   * Fecha o vão com uma abertura do tipo escolhido.
   *
   * ─── POR QUE NÃO SÃO SÓ "PORTA" E "PAREDE" ──────────────────────────────
   *
   * Era assim, e o usuário topou com o limite na revisão de uma planta gerada:
   * em planta, JANELA interrompe a face da parede exatamente como porta, então
   * o detector oferece o vão dela junto com os outros. Sem "é janela" na lista,
   * a única saída era fechar como porta (e ganhar uma porta que não existe, com
   * peitoril zero interrompendo o rodapé) ou como parede (e perder a janela do
   * quantitativo de esquadrias).
   *
   * As duas erram, e erram calado. A lista precisa oferecer o que o desenho
   * pode ser.
   *
   * ⚠️ Janela nasce com peitoril: é o que a distingue de porta no rodapé —
   * `quantities.ts` interrompe o rodapé por peitoril ZERO, não por tipo.
   */
  function fecharComAbertura(
    vao: { a: Point; b: Point; mm: number },
    kind: 'door' | 'window' | 'passage' | 'sliding',
    embutida?: boolean,
  ) {
    if (!levelId) return;
    // O ID VEM DO COMANDO, não de `editor.model`.
    //
    // Aqui estava `editor.model.walls[antes]` depois do `run`, e `editor.model` é
    // estado de React: dentro deste mesmo tratador ele ainda é o modelo ANTERIOR,
    // então a leitura devolvia `undefined`, o `if` não entrava e a porta nunca era
    // criada. O vão fechava com alvenaria cheia e o quantitativo contava parede
    // onde havia porta — em silêncio, que é o pior jeito de errar.
    const [idParede] = editor.run({
      type: 'AddWall',
      levelId,
      a: vao.a,
      b: vao.b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
    if (!idParede) return;
    const comoPorta = kind !== 'window';
    const [idAbertura] = editor.run({
      type: 'AddOpening',
      wallId: idParede,
      kind,
      embutida: kind === 'sliding' ? embutida : undefined,
      offsetMm: 0,
      widthMm: vao.mm,
      heightMm: comoPorta ? 2100 : 1200,
      sillMm: comoPorta ? 0 : 900,
    });
    // A abertura, não a parede que a hospeda: quem clicou "É porta" na lista de
    // vãos decidiu sobre a ESQUADRIA, e é o painel dela que traz girar, espelhar
    // e o tamanho. Selecionar a parede aqui responderia outra pergunta.
    if (idAbertura) selecionar([idAbertura]);
  }

  /**
   * Move a ponta de uma parede.
   *
   * O comando já existia no kernel desde o Spike A — com undo e rederivação de
   * ambientes — e nenhuma parte da tela o acionava. Consertar uma parede torta
   * exigia apagar e redesenhar, e redesenhar é justamente onde o erro nasce.
   */
  /**
   * Fecha a aferição com a distância digitada.
   *
   * O valor entra em METROS porque é assim que a cota vem escrita na planta, e
   * vai para o serviço em milímetros — a conversão fica num lugar só, aqui.
   */
  function aplicarAfericao() {
    const metros = Number(distanciaDigitada);
    if (!afericao || !(metros > 0)) return;

    // A escala ANTERIOR precisa ser capturada antes de aplicar a nova: é dela
    // que as medições já traçadas são transformadas. Sem isso, corrigir a
    // escala deixaria cada contorno flutuando fora do que foi traçado.
    const escalaAnterior = fundo.underlay;

    void fundo
      .aplicarCalibracao(afericao.p1, afericao.p2, Math.round(metros * 1000), alinharNaAfericao)
      .then((nova) => {
        // `nova` VEM DA CHAMADA, não do estado: ler `fundo.underlay` aqui
        // devolveria o valor velho, porque o React só atualiza o closure na
        // renderização seguinte — e as medições seriam transformadas de uma
        // escala para ela mesma, ou seja, não seriam transformadas.
        if (escalaAnterior && nova)
          void medicoes.reposicionar(escalaAnterior, nova, fundo.ativaId);
      });
    setAfericao(null);
    setDistanciaDigitada('');
    editor.setTool('selecionar');
  }

  /**
   * Arrastar a ALÇA de uma ponta. Leva as vizinhas junto quando o modo é MANTER.
   *
   * Até aqui este era o único gesto de junção que NUNCA levava ninguém, enquanto
   * digitar o comprimento no painel sempre levava — a mesma parede se comportava
   * de dois jeitos conforme o caminho, e a alça é justamente o gesto que mais
   * desfazia junção.
   */
  function moverPonta(wallId: string, end: 'a' | 'b', to: Point) {
    editor.run({ type: 'MoveVertex', wallId, end, to, manterJuncoes: modoJuncao === 'MANTER' });
  }

  /** Nasce uma divisa. `TERRENO` entra no anel do lote; `DIVISA` fica solta. */
  function adicionarLimite(a: Point, b: Point, kind: BoundaryKind) {
    editor.run({ type: 'AddBoundary', levelId: levelId ?? '', a, b, kind, ...(kind === 'RESTRICAO' ? { restricao: { tipo: tipoDeRestricaoDoLote } } : {}) });
  }

  /**
   * Nasce uma peça estrutural, com as medidas que a barra está mostrando.
   *
   * O canvas manda só os PONTOS — ele é quem conta os cliques e sabe quando o
   * contorno fechou. As medidas ficam aqui, exatamente como a espessura da
   * parede fica: são estado da barra, e passá-las pelo canvas obrigaria o
   * renderer a saber de seção e de cota, que não são assunto dele (ADR-01).
   *
   * ⚠️ O RÓTULO É CONSUMIDO ao lançar. Sem isso, digitar "P1" e clicar cinco
   * vezes criaria cinco peças chamadas "P1" — cinco linhas idênticas no
   * quantitativo e no orçamento, impossíveis de conferir contra a prancha. O
   * campo esvaziar depois do clique é o que torna óbvio que o rótulo é da
   * PRÓXIMA peça, não da ferramenta.
   */
  function adicionarEstrutural(kind: StructuralKind, pontos: Point[]) {
    const criados = editor.run({
      type: 'AddStructural',
      levelId: levelId ?? '',
      kind,
      pontos,
      ...medidasEstruturais,
      rotulo: rotuloEstrutural.trim() || null,
    });
    if (rotuloEstrutural.trim()) setRotuloEstrutural('');
    // A peça nasce SELECIONADA — é ela que se ajusta em seguida, e é o mesmo
    // comportamento que colar já tem.
    if (criados.length > 0) {
      selecionar(criados);
      // A conferência de sobreposição fica para o efeito abaixo, e não aqui:
      // `editor.model` ainda é o modelo ANTERIOR neste ponto — `run` agenda o
      // estado novo, não o devolve. Perguntar agora acharia zero sempre.
      setRecemCriado(criados[0]);
    }
  }

  /**
   * A peça que acabou de nascer atravessa alguém? — a conferência do aviso.
   *
   * Roda no efeito porque só aqui o modelo novo existe. E limpa `recemCriado`
   * em qualquer desfecho, inclusive quando não há sobreposição: deixar o id
   * pendurado faria o aviso reaparecer na próxima mudança de modelo, apontando
   * uma peça que o usuário já esqueceu.
   */
  useEffect(() => {
    if (!recemCriado) return;
    const peca = editor.model.structures.find((s) => s.id === recemCriado);
    setRecemCriado(null);
    if (!peca) return;

    const achadas = sobreposicoesDe(editor.model, peca.id);
    if (achadas.length === 0) return;

    const paredeIds = achadas
      .map((s) => (s.aId === peca.id ? s.bId : s.aId))
      .filter((id) => editor.model.walls.some((w) => w.id === id));

    setDisputa({
      pecaId: peca.id,
      nome: nomeDoTipoEstrutural(peca.kind),
      paredeIds,
      volumeM3: achadas.reduce((t, s) => t + s.volumeMm3, 0) / 1_000_000_000,
      quantos: achadas.length,
    });
  }, [recemCriado, editor.model]);

  /**
   * O que fazer com a disputa. Cada saída é um comando só, e nenhuma delas
   * grava volume: o quantitativo recalcula a interseção a cada leitura, então
   * mover o pilar depois corrige o desconto sozinho.
   */
  function resolverDisputa(escolha: EscolhaSobreposicao) {
    const atual = disputa;
    setDisputa(null);
    if (!atual) return;

    if (escolha === 'DESFAZER') {
      // `undo` e não `DeleteStructural`: a criação foi UM passo de histórico, e
      // desfazer é literalmente o que o usuário pediu — some também o rótulo
      // consumido e a seleção que nasceu com ela.
      editor.undo();
      return;
    }
    if (escolha === 'CORTAR_PAREDE') {
      // TODAS as paredes atravessadas, não só a primeira: um pilar no encontro
      // de duas paredes atravessa as duas, e cortar uma só deixaria metade do
      // problema de pé, em silêncio.
      //
      // Um LOTE, e não um comando por parede: o corte é um gesto, e desfazê-lo
      // tem de ser um Ctrl+Z, não três. E o kernel recusa o lote inteiro se uma
      // das paredes tiver abertura no caminho — o que é melhor do que cortar
      // metade e parar.
      // ─── NÃO É MAIS CORTE DESTRUTIVO (01/09/2026) ────────────────────────
      //
      // Era `CutWallAtStructural`, que partia a parede de verdade. O usuário
      // achou o defeito de projeto: *"o recorte acontece no momento que o pilar
      // é inserido, mas muitas vezes o pilar precisa de reajuste de posição com
      // snap, e o recorte acaba ficando no local errado. E como o recorte é
      // destrutivo fica um vão onde não deveria e ainda com sobreposição"*.
      //
      // Medido no estudo dele: a parede #18 acabou 100 mm ANTES da face do
      // pilar (cortada mais de uma vez, cada vez pela posição do instante) e a
      // #31 terminou no CENTRO do pilar — o snap a levou até lá depois do corte.
      //
      // "Esta parede é interrompida por este pilar" é uma RELAÇÃO VIVA, e
      // gravá-la como coordenada morta é o que produz vão órfão. Agora só a
      // decisão é gravada; a interrupção é recalculada a cada leitura, então
      // mover o pilar leva o vão junto.
      try {
        editor.runBatch(
          atual.paredeIds.map((id) => ({ type: 'SetCedeSobreposicao', id, cede: true }) as const),
        );
      } catch (e) {
        // A recusa mais provável é abertura partida, e ela precisa CHEGAR ao
        // usuário: um corte que não aconteceu e não avisou é pior do que o
        // desenho sobreposto que ele já estava vendo.
        setErroDoCorte(
          e instanceof Error && /abertura/i.test(e.message)
            ? 'O corte partiria uma porta ou janela. Mova a esquadria ou o pilar e tente de novo.'
            : 'Não foi possível cortar a parede neste ponto.',
        );
      }
      return;
    }
    if (escolha === 'PECA_CEDE') {
      editor.run({ type: 'SetCedeSobreposicao', id: atual.pecaId, cede: true });
    }
    // 'MANTER' não emite comando nenhum: o estado sem decisão já é o padrão, e
    // a disputa continua listada no quantitativo com `quemCede: 'NINGUEM'`.
  }

  /**
   * Move um vértice de uma peça estrutural.
   *
   * SEM o arrasto de vizinha que `moverPontaLimite` faz: estrutura não forma
   * anel com ninguém e não entra no arranjo planar, então não há canto para
   * abrir. Mover o vértice de um pilar reposiciona o pilar, e é só isso.
   */
  /**
   * Lança uma ÁGUA com o contorno que o canvas fechou. A cota do beiral nasce no
   * PÉ-DIREITO do pavimento — a água apoiada no topo da parede é o caso comum, e
   * quem quer platibanda ou beiral rebaixado ajusta no painel.
   */
  function adicionarAgua(pontos: Point[]) {
    const nivel = editor.model.levels.find((l) => l.id === levelId);
    const criados = editor.run({
      type: 'AddAgua',
      levelId: levelId ?? '',
      pontos,
      inclinacaoPct: inclinacaoTelhado,
      baseMm: nivel?.defaultHeightMm ?? 0,
    });
    if (criados.length > 0) selecionar(criados);
  }

  /** COBERTURA POR EXTRUSÃO (P2.13): o perfil da barra extrudado ao longo do eixo clicado. */
  function adicionarCoberturaExtrusao(eixoA: Point, eixoB: Point) {
    if (!levelId) return;
    const criados = editor.runBatch([
      { type: 'AddRoofByExtrusion', levelId, eixoA, eixoB, perfil: perfilDeCobertura(perfilDaExtrusao), espessuraMm: perfilDaExtrusao.espessuraMm },
    ]);
    if (criados.length > 0) selecionar(criados);
  }

  /**
   * "Gerar do contorno": uma água por construção do pavimento, pela face das
   * paredes mais o beiral (ver `blueprintTelhadoContorno.ts`). É atalho de
   * desenho, não gerador de telhado — nasce com um caimento só, beiral no lado
   * 0, e o usuário ajusta ou divide.
   */
  function gerarTelhadoDoContorno() {
    const nivel = editor.model.levels.find((l) => l.id === levelId);
    if (!nivel) return;
    const contornos = contornosParaTelhado(editor.model, nivel, beiralTelhado).filter(
      (c) => c.valido,
    );
    if (contornos.length === 0) return;
    const criados = editor.runBatch(
      contornos.map(
        (c) =>
          ({
            type: 'AddAgua',
            levelId: nivel.id,
            pontos: c.pontos,
            inclinacaoPct: inclinacaoTelhado,
            baseMm: nivel.defaultHeightMm,
          }) as const,
      ),
    );
    if (criados.length > 0) selecionar(criados);
  }

  function moverPontaAgua(aguaId: string, index: number, to: Point) {
    editor.run({ type: 'MoveAguaVertex', aguaId, index, to });
  }

  /** Lanca a escada/rampa pelo eixo que o canvas fechou. */
  /** A vaga avulsa nasce com as medidas do tipo, de pé; o painel gira e ajusta. */
  function adicionarVaga(at: Point) {
    if (!levelId) return;
    const criados = editor.run({ type: 'AddVaga', levelId, at, tipo: tipoDeVaga });
    if (criados.length > 0) selecionar(criados);
  }

  /** A anotação nasce na PLANTA do pavimento ativo; o painel edita texto, altura, traço, hachura. */
  function adicionarAnotacao(tipo: TipoDeAnotacao, pontos: Point[]) {
    if (!levelId) return;
    // NUVEM DE REVISÃO (P2.15): nasce na revisão da barra, com a data de hoje.
    const revisao = tipo === 'NUVEM' ? { numero: numeroDaRevisao, data: new Date().toISOString().slice(0, 10) } : undefined;
    const criados = editor.run({ type: 'AddAnotacao', vista: { tipo: 'PLANTA', levelId }, tipo, pontos, ...(revisao ? { revisao } : {}) });
    if (criados.length > 0) selecionar(criados);
  }
  /**
   * O guarda-corpo/corrimão nasce de dois cliques, com a altura padrão do tipo;
   * o painel ajusta.
   *
   * ⚠️ AS PONTAS ENCOSTAM ANTES DE NASCER (P2.45). O ímã do traçado já puxa para
   * parede e canto, mas o alcance dele é `SNAP_PX / escala`: no zoom de trabalho
   * não chega a 16 cm. Foi assim que o guarda-corpo real do usuário nasceu com
   * uma ponta a 0 mm da parede e a outra a 163 mm da ponta da parede que
   * continua o mesmo eixo — um buraco de 16 cm no peitoril, invisível em planta.
   * Aqui a régua é o milímetro do modelo (300 mm), não o pixel da tela.
   */
  function adicionarGuardaCorpo(a: Point, b: Point) {
    if (!levelId) return;
    const alvos = alvosDeEncosto(editor.model, levelId);
    const encostar = (p: Point, vizinho: Point): Point => {
      const e = encostoDaPonta(p, { x: p.x - vizinho.x, y: p.y - vizinho.y }, alvos);
      return e ? point(e.to.x, e.to.y) : p;
    };
    const pa = encostar(a, b);
    const pb = encostar(b, a);
    // Encostar as duas pontas no mesmo lugar anularia o trecho — o kernel recusa,
    // e recusar um clique é pior do que deixar a segunda ponta onde ela estava.
    const pontos = pa.x === pb.x && pa.y === pb.y ? [a, b] : [pa, pb];
    const criados = editor.run({ type: 'AddGuardaCorpo', levelId, tipo: tipoDeGuardaCorpo, pontos });
    if (criados.length > 0) selecionar(criados);
  }
  /** O componente nasce com as medidas do catálogo, de pé; o painel gira e ajusta. */
  function adicionarComponente(at: Point) {
    if (!levelId) return;
    // FAMÍLIAS ANINHADAS (P2.18): um conjunto entra pai + filhos; a seleção fica no pai.
    const criados = editor.run(ehConjunto(tipoDeComponente) ? { type: 'AddConjunto', levelId, at, tipoId: tipoDeComponente } : { type: 'AddComponente', levelId, at, tipoId: tipoDeComponente });
    if (criados.length > 0) selecionar([criados[0]]);
  }

  /** O núcleo nasce do pavimento ativo até o mais alto; o painel ajusta a chegada. */
  /** RODAPÉ (P2.21): o trecho nasce com a altura/item padrão do gerador; o painel ajusta. */
  function adicionarRodape(a: Point, b: Point) {
    if (!levelId) return;
    const criados = editor.run({ type: 'AddRodape', levelId, pontos: [a, b], alturaMm: hipotesesDeRodape.alturaMm, itemCode: hipotesesDeRodape.itemCode, descricao: hipotesesDeRodape.descricao });
    if (criados.length > 0) selecionar(criados);
  }

  /** SUB-REGIÃO DO TERRENO (P2.19): o polígono fechado vira sub-região com o material da barra. */
  function adicionarSubRegiao(pontos: Point[]) {
    if (!levelId) return;
    const criados = editor.run({ type: 'AddSubRegiao', levelId, material: materialDaSubRegiao, pontos });
    if (criados.length > 0) selecionar(criados);
  }

  /**
   * LOTEAMENTO (B1). Quadra, lote, via e area publica nascem com o que esta na
   * barra de opcoes, e o proximo nome/numero e sugerido sozinho. A quadra do
   * lote e a ULTIMA desenhada que contem o centro do lote -- pedir a quadra num
   * campo faria o usuario repetir o que o desenho ja diz.
   */
  function adicionarQuadra(pontos: Point[]) {
    if (!levelId) return;
    const criados = editor.run({ type: 'AddQuadra', levelId, nome: nomeDaQuadra, pontos });
    if (criados.length > 0) {
      selecionar(criados);
      setNomeDaQuadra(proximaQuadra(nomeDaQuadra));
      // Lote volta a 1: e a numeracao da quadra nova.
      setNumeroDoLote('1');
    }
  }

  function adicionarLote(pontos: Point[]) {
    if (!levelId) return;
    const centro = centroide(pontos);
    const daVez = (editor.model.quadras ?? [])
      .filter((q) => q.levelId === levelId && q.pontos.length >= 3 && pointInPolygon(q.pontos, centro))
      .slice(-1)[0];
    const criados = editor.run({ type: 'AddLote', levelId, quadraId: daVez?.id ?? null, numero: numeroDoLote, pontos });
    if (criados.length > 0) {
      selecionar(criados);
      setNumeroDoLote(proximoNumero(numeroDoLote));
    }
  }

  function adicionarVia(eixo: Point[]) {
    if (!levelId) return;
    const criados = editor.run({ type: 'AddVia', levelId, nome: nomeDaVia, eixo, larguraMm: larguraDaVia, calcadaMm: calcadaDaVia });
    if (criados.length > 0) {
      selecionar(criados);
      setNomeDaVia(proximoNumero(nomeDaVia));
    }
  }

  function adicionarAreaPublica(pontos: Point[]) {
    if (!levelId) return;
    const criados = editor.run({ type: 'AddAreaPublica', levelId, tipo: tipoDeAreaPublica, pontos });
    if (criados.length > 0) selecionar(criados);
  }

  /**
   * B2 — a PROPOSTA de subdivisão, derivada. Nunca gravada: recalcula a cada
   * mudança de parâmetro e some quando a tarefa fecha.
   */
  const quadrasDoNivel = useMemo(
    () => (editor.model.quadras ?? []).filter((q) => q.levelId === levelId),
    [editor.model.quadras, levelId],
  );
  const propostaDeSubdivisao = useMemo(() => {
    const q = quadrasDoNivel.find((x) => x.id === quadraALotear);
    return q ? subdividirQuadra(q, parametrosDaSubdivisao) : null;
  }, [quadrasDoNivel, quadraALotear, parametrosDaSubdivisao]);

  /**
   * B2 — as regras da conferência. A ZONA do estudo manda quando informou; o
   * piso da Lei 6.766 entra só como rede de segurança, e a tela diz de onde
   * veio cada número — conferir contra a lei errada é pior que não conferir.
   */
  const regrasDoLoteamento = useMemo(
    () => ({
      areaMinimaM2: zona.areaMinimaDoLoteM2 ?? AREA_MINIMA_LEI_6766_M2,
      testadaMinimaMm: zona.testadaMinimaMm ?? TESTADA_MINIMA_LEI_6766_MM,
      areasPublicasMinPct: null,
    }),
    [zona.areaMinimaDoLoteM2, zona.testadaMinimaMm],
  );
  const origemDasRegrasDoLoteamento = useMemo(
    () => ({
      area: (zona.areaMinimaDoLoteM2 != null ? 'ZONA' : 'LEI') as 'ZONA' | 'LEI',
      testada: (zona.testadaMinimaMm != null ? 'ZONA' : 'LEI') as 'ZONA' | 'LEI',
    }),
    [zona.areaMinimaDoLoteM2, zona.testadaMinimaMm],
  );
  const avisosDoLoteamento = useMemo(
    () => conferirLoteamento(editor.model, regrasDoLoteamento, terreno?.areaMm2 ?? null),
    [editor.model, regrasDoLoteamento, terreno?.areaMm2],
  );
  const errosDoLoteamento = useMemo(() => resumoDaConferencia(avisosDoLoteamento).erros, [avisosDoLoteamento]);

  /**
   * B3 — enviar o loteamento ao Empreendimento.
   *
   * O envio parte da versão PUBLICADA, nunca do rascunho: o rascunho muda a cada
   * gesto, e sincronizar dele faria o espelho de vendas mudar debaixo do corretor
   * enquanto alguém arrasta um vértice. Publicar é o ato que diz "este vale".
   */
  const [enviandoAoEmpreendimento, setEnviandoAoEmpreendimento] = useState(false);
  const empreendimentoDoLoteamento = zona.empreendimentoId || empreendimentoSugerido;

  async function enviarLoteamentoAoEmpreendimento() {
    if (!empreendimentoDoLoteamento) return;
    setEnviandoAoEmpreendimento(true);
    try {
      // Vincula o estudo na primeira vez; nas seguintes é idempotente.
      await blueprintEmpreendimentoSync.linkStudy(empreendimentoDoLoteamento, study.id);
      const previa = await blueprintEmpreendimentoSync.previewSync(empreendimentoDoLoteamento);
      const total = previa.towersCreated + previa.towersUpdated + previa.unitsCreated + previa.unitsUpdated;
      if (total === 0) {
        setAvisoConexaoT(
          previa.warnings[0] ??
            'O empreendimento já reflete a versão publicada deste desenho — nada a enviar.',
        );
        return;
      }
      const ok = await confirmar({
        title: 'Enviar o loteamento ao empreendimento?',
        message: `${previa.towersCreated + previa.towersUpdated} quadra(s) e ${previa.unitsCreated + previa.unitsUpdated} lote(s) da versão PUBLICADA vão para o cadastro, onde viram unidades do espelho de vendas.\n\nPreço e status de venda dos lotes que já existem lá não são tocados.`,
        confirmLabel: 'Enviar',
        variant: 'warning',
      });
      if (!ok) return;
      const feito = await blueprintEmpreendimentoSync.syncToEmpreendimento(empreendimentoDoLoteamento);
      setAvisoConexaoT(
        `Loteamento enviado: ${feito.towersCreated} quadra(s) e ${feito.unitsCreated} lote(s) criados, ${feito.unitsUpdated} lote(s) atualizado(s). Veja em Empreendimentos › Torres & Unidades.`,
      );
    } catch (e) {
      setAvisoConexaoT(`Não consegui enviar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnviandoAoEmpreendimento(false);
    }
  }

  /**
   * B4 — emite os documentos do loteamento: pranchas (planta geral, uma folha
   * por lote e o quadro de áreas), o memorial descritivo e os pontos de locação.
   *
   * Sai como download, não como gravação: o memorial é peça que o responsável
   * técnico revisa e assina antes de ir ao cartório — publicar direto no GED
   * daria ao rascunho a aparência de documento emitido.
   */
  const [emitindoDocumentos, setEmitindoDocumentos] = useState(false);

  async function emitirDocumentosDoLoteamento() {
    if (!levelId) return;
    const previa = previaDosDocumentos(editor.model);
    const pendencias = pendenciasDosMemoriais(editor.model);
    const ok = await confirmar({
      title: 'Emitir os documentos do loteamento?',
      message:
        `${previa.folhas} folha(s) de prancha, ${previa.memoriais} memorial(is) e ${previa.pontosDeLocacao} ponto(s) de locação.` +
        (pendencias.comAviso > 0
          ? `\n\n⚠️ ${pendencias.comAviso} lote(s) com pendência no desenho (lado sem confrontante, encravado ou fora de quadra). Os documentos saem assim mesmo, com a pendência escrita no memorial.`
          : '') +
        '\n\nO memorial descreve por medidas e confrontantes. Coordenadas e azimutes dependem de georreferenciamento, que este estudo ainda não tem.',
      confirmLabel: 'Emitir',
      variant: 'warning',
    });
    if (!ok) return;
    setEmitindoDocumentos(true);
    try {
      const artefatos = montarDocumentosDoLoteamento(editor.model, {
        dados: {
          nome: study.name || 'Loteamento',
          matricula: null,
          cartorio: null,
        },
        areaDaGlebaMm2: terreno?.areaMm2 ?? null,
      });
      for (const a of artefatos) {
        const url = URL.createObjectURL(a.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.nome;
        link.click();
        URL.revokeObjectURL(url);
      }
      setAvisoConexaoT(`${artefatos.length} arquivo(s) gerado(s): pranchas em PDF, memorial em texto e os pontos de locação em CSV.`);
    } catch (e) {
      setAvisoConexaoT(`Não consegui emitir: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEmitindoDocumentos(false);
    }
  }

  /** B2 — lança a proposta num lote só de comandos. */
  function aceitarSubdivisao() {
    if (!levelId || !propostaDeSubdivisao || propostaDeSubdivisao.lotes.length === 0) return;
    const quadra = quadrasDoNivel.find((q) => q.id === quadraALotear);
    if (!quadra) return;
    // Continua a numeração da quadra em vez de recomeçar do 1: lotear duas
    // vezes a mesma quadra não pode gerar dois lotes "1".
    const existentes = (editor.model.lotes ?? []).filter((l) => l.quadraId === quadra.id);
    const maior = existentes.reduce((max, l) => {
      const n = Number(String(l.numero).replace(/\D/g, ''));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    const criados = editor.runBatch(
      propostaDeSubdivisao.lotes.map((l, i) => ({
        type: 'AddLote' as const,
        levelId,
        quadraId: quadra.id,
        numero: String(maior + i + 1),
        pontos: l.pontos,
      })),
    );
    setResultadoDeLotear(
      `${propostaDeSubdivisao.lotes.length} lote${propostaDeSubdivisao.lotes.length > 1 ? 's' : ''} lançado${propostaDeSubdivisao.lotes.length > 1 ? 's' : ''} na quadra ${quadra.nome}. Ctrl+Z desfaz todos.`,
    );
    if (criados.length > 0) selecionar(criados);
  }

  /** NUMERAR a quadra selecionada (ou a unica) em um lote de comandos: um Ctrl+Z desfaz. */
  function numerarQuadraSelecionada() {
    const doNivel = (editor.model.quadras ?? []).filter((q) => q.levelId === levelId);
    const alvo = doNivel.find((q) => editor.selectedIds.includes(q.id)) ?? (doNivel.length === 1 ? doNivel[0] : null);
    if (!alvo) {
      setAvisoConexaoT('Selecione no desenho a quadra a numerar. Com uma só quadra no pavimento, ela é usada sozinha.');
      return;
    }
    const plano = numerarQuadra(editor.model, alvo);
    if (plano.length === 0) {
      setAvisoConexaoT('Nenhum lote dentro dessa quadra ainda. Desenhe os lotes antes de numerar.');
      return;
    }
    editor.runBatch(plano.map((p) => ({ type: 'SetLoteProps' as const, loteId: p.loteId, numero: p.numero })));
    setAvisoConexaoT(`${plano.length} lote${plano.length > 1 ? 's' : ''} numerado${plano.length > 1 ? 's' : ''} na quadra ${alvo.nome}, no sentido horário. Ctrl+Z desfaz tudo.`);
  }

  function adicionarNucleo(ring: Point[]) {
    if (!levelId) return;
    const criados = editor.run({ type: 'AddNucleo', levelId, tipo: tipoDeNucleo, ring, ...(tipoDeNucleo === 'SHAFT' && disciplinaDoNucleo ? { disciplina: disciplinaDoNucleo } : {}) });
    if (criados.length > 0) selecionar(criados);
  }

  function adicionarEscada(pontos: Point[]) {
    if (!levelId) return;
    const criados = editor.run({
      type: 'AddEscada',
      levelId,
      pontos,
      tipo: tipoCirculacao,
      larguraMm: larguraEscada,
      alvoEspelhoMm: alvoEspelho,
    });
    if (criados.length > 0) selecionar(criados);
  }

  /**
   * Cria o TRECHO de rede.
   *
   * ⚠️ O encaixe no terminal decide a COTA de cada ponta, e não só o lugar em
   * planta. Encaixar em planta e deixar a cota da barra faria o cano passar
   * exatamente por cima da tomada, dois metros acima dela — e o desenho
   * pareceria ligado. Ver `cotaAoEncaixar`.
   */
  function adicionarTrecho(a: Point, b: Point) {
    if (!levelId) return;
    // ⚠️ `encaixarEmPecaEletrica`, e não `encaixarNoTerminal`: agarra também o
    // QUADRO, e pela PEGADA da peça em vez de um raio fixo na âncora. Clicar em
    // cima do componente passa a ser clicar no componente — ver o pedido de
    // 09/09/2026, "clicar em um componente elétrico e outro".
    // PRUMADA num clique (18/09/2026): tubo de queda desce do teto ao piso
    // (−150, onde o esgoto corre); a ventilação sobe do ramal ao teto.
    if (prumadaDeRede) {
      const nivel = editor.model.levels.find((l) => l.id === levelId);
      const teto = nivel?.defaultHeightMm ?? 2800;
      const piso = COTA_PADRAO_MM.ESGOTO;
      const criados = editor.run({
        type: 'AddTrecho',
        levelId,
        disciplina: 'ESGOTO',
        a,
        b: a,
        cotaAMm: prumadaDeRede === 'QUEDA' ? teto : piso,
        cotaBMm: prumadaDeRede === 'QUEDA' ? piso : teto,
        bitolaMm: prumadaDeRede === 'QUEDA' ? 100 : 50,
        rotulo: prumadaDeRede === 'QUEDA' ? 'TQ' : 'Ventilação',
      });
      if (criados.length > 0) selecionar(criados);
      return;
    }
    const ancoraA = encaixarEmPecaEletrica(a, editor.model, levelId, TOLERANCIA_ENCAIXE_MM);
    const ancoraB = encaixarEmPecaEletrica(b, editor.model, levelId, TOLERANCIA_ENCAIXE_MM);
    const criados = editor.run({
      type: 'AddTrecho',
      levelId,
      disciplina: disciplinaDeRede,
      a: ancoraA.ponto,
      b: ancoraB.ponto,
      cotaAMm: ancoraA.cotaMm ?? cotaDeRede,
      cotaBMm: ancoraB.cotaMm ?? cotaDeRede,
      bitolaMm: bitolaDeRede,
    });
    if (criados.length > 0) selecionar(criados);
  }

  function adicionarTerminal(at: Point) {
    if (!levelId) return;
    // PONTO HIDRÁULICO TIPADO (18/09/2026): tipo, cota, medidas e volume vêm da
    // ficha; registro/válvula/hidrômetro/conexão caem SOBRE o trecho mais
    // próximo (a disciplina é a dele) e são recusados longe de qualquer trecho.
    if (disciplinaDeRede !== 'ELETRICA' && tipoDePontoHidraulico) {
      const ficha = FICHA_DO_PONTO_HIDRAULICO[tipoDePontoHidraulico];
      const admitidas = DISCIPLINAS_DO_PONTO_HIDRAULICO[tipoDePontoHidraulico];
      let disciplina: DisciplinaDeRede = disciplinaDeRede;
      let ponto = at;
      let cotaMm = cotaUsualDoPontoHidraulico(tipoDePontoHidraulico, disciplina) ?? cotaDeRede;
      if (ehSobreOTrecho(tipoDePontoHidraulico)) {
        const trechos = (editor.model.trechos ?? []).filter((t) => admitidas.includes(t.disciplina));
        const candidatos = admitidas
          .map((d) => projetarNoTrecho(at, trechos, d, levelId))
          .filter((x): x is NonNullable<typeof x> => !!x);
        const melhor = candidatos.sort(
          (x, y) => Math.hypot(x.ponto.x - at.x, x.ponto.y - at.y) - Math.hypot(y.ponto.x - at.x, y.ponto.y - at.y),
        )[0];
        if (!melhor) {
          setAvisoColar(`${ficha.rotulo} fica SOBRE um trecho de ${admitidas.map((d) => ROTULO_DA_DISCIPLINA[d].toLowerCase()).join(' ou ')} — clique perto de um.`);
          return;
        }
        disciplina = melhor.trecho.disciplina;
        ponto = melhor.ponto;
        cotaMm = melhor.cotaMm;
      }
      const criados = editor.run({
        type: 'AddTerminal',
        levelId,
        disciplina,
        tipo: ficha.rotulo,
        at: ponto,
        cotaMm,
        tipoHidraulico: tipoDePontoHidraulico,
        volumeL: ficha.volumeL ?? null,
      });
      // As medidas padrão da ficha (caixa d'água, caixas, hidrômetro) entram
      // num segundo comando do mesmo lote: `AddTerminal` não as recebe.
      if (criados.length > 0 && ficha.medidasMm) {
        editor.run({ type: 'SetTerminalProps', terminalId: criados[0], ...ficha.medidasMm });
      }
      if (criados.length > 0) selecionar(criados);
      return;
    }
    // A POTÊNCIA da norma já vem preenchida (13/09/2026: "ao incluir os pontos
    // trazer essas características por padrão") — ver `blueprintPotenciaPadrao`.
    const [comando] = aplicarPotenciaPadrao(editor.model, [{
      type: 'AddTerminal',
      levelId,
      disciplina: disciplinaDeRede,
      tipo:
        // O texto do projetista quando ele digitou um; senão, o nome do tipo
        // escolhido no menu. Os dois convivem: `tipo` é como a peça se chama,
        // `tipoEletrico` é o que ela É.
        tipoDeTerminal.trim() ||
        (tipoDePontoEletrico ? ROTULO_DO_PONTO_ELETRICO[tipoDePontoEletrico] : 'Ponto'),
      at,
      // O terminal fica na cota DELE, não na do trecho: uma tomada está a
      // 300 mm do piso e o eletroduto que a alimenta corre no forro.
      cotaMm: tipoDePontoEletrico
        ? COTA_USUAL_DO_PONTO_ELETRICO[tipoDePontoEletrico]
        : COTA_TERMINAL_PADRAO_MM[disciplinaDeRede],
      tipoEletrico: disciplinaDeRede === 'ELETRICA' ? tipoDePontoEletrico : null,
      interruptor: tipoDePontoEletrico === 'INTERRUPTOR' ? tipoDeInterruptor : null,
    }]);
    const criados = editor.run(comando);
    // O difusor/grelha (P2.2) nasce com a medida da peça, como as caixas hidráulicas.
    if (criados.length > 0 && disciplinaDeRede === 'MECANICA') editor.run({ type: 'SetTerminalProps', terminalId: criados[0], ...MEDIDAS_PADRAO_TERMINAL_MECANICO });
    if (criados.length > 0) selecionar(criados);
  }

  function adicionarQuadro(at: Point) {
    if (!levelId) return;
    // O nome nasce sequencial e é editável no painel: um quadro sem nome seria
    // recusado pelo kernel, e pedir o nome antes de deixar clicar interromperia
    // o gesto no meio.
    const n = (editor.model.quadros ?? []).length + 1;
    const criados = editor.run({
      type: 'AddQuadro',
      levelId,
      nome: n === 1 ? 'QDC' : `QDC ${n}`,
      at,
    });
    if (criados.length > 0) selecionar(criados);
  }

  function moverPontaEscada(escadaId: string, index: number, to: Point) {
    editor.run({ type: 'MoveEscadaVertex', escadaId, index, to });
  }

  /**
   * Lanca uma LINHA DE CORTE e ja abre a vista dela.
   *
   * Abrir a vista e o ponto: o corte nao e uma peca que se admira em planta -
   * ele existe para ser OLHADO, e quem acabou de escolher por onde o plano passa
   * esta perguntando "o que aparece aqui?". Deixa-lo na planta obrigaria a um
   * segundo passo no seletor de vista para responder a pergunta que o gesto fez.
   *
   * A letra vem do comando (A, B, C sozinho), e nao daqui: quem sabe quais letras
   * ja existem e o modelo.
   */
  function adicionarCorte(a: Point, b: Point) {
    const criados = editor.run({ type: 'AddCorte', a, b });
    if (criados.length > 0) {
      selecionar(criados);
      setVista(`corte:${criados[0]}`);
    }
  }

  /** EIXO da malha (E1.4): dois cliques; o nome é palpite (letra/número) e se troca no painel. */
  function adicionarEixo(a: Point, b: Point) {
    const criados = editor.run({ type: 'AddEixo', a, b });
    if (criados.length > 0) selecionar(criados);
  }

  function moverPontaCorte(corteId: string, end: 'a' | 'b', to: Point) {
    editor.run({ type: 'MoveCorteVertex', corteId, end, to });
  }

  function moverPontaEstrutural(structuralId: string, index: number, to: Point) {
    editor.run({ type: 'MoveStructuralVertex', structuralId, index, to });
  }

  /**
   * Move a ponta de uma divisa E ARRASTA A VIZINHA JUNTO.
   *
   * O lote é um anel: mexer numa ponta sem levar a divisa que compartilha aquele
   * vértice abre o canto, e um contorno aberto não tem área — o painel passaria
   * a acusar erro de fechamento por causa de um gesto que parecia inofensivo.
   * Mesmo lote de comandos, mesma disciplina de `esticarParede`.
   */
  function moverPontaLimite(boundaryId: string, end: 'a' | 'b', to: Point) {
    const divisa = editor.model.boundaries.find((b) => b.id === boundaryId);
    if (!divisa) return;
    const pontaAtual = divisa[end];

    const lote: Command[] = [{ type: 'MoveBoundaryVertex', boundaryId, end, to }];
    for (const outra of editor.model.boundaries) {
      if (outra.id === boundaryId || outra.levelId !== divisa.levelId) continue;
      if (outra.a.x === pontaAtual.x && outra.a.y === pontaAtual.y) {
        lote.push({ type: 'MoveBoundaryVertex', boundaryId: outra.id, end: 'a', to });
      }
      if (outra.b.x === pontaAtual.x && outra.b.y === pontaAtual.y) {
        lote.push({ type: 'MoveBoundaryVertex', boundaryId: outra.id, end: 'b', to });
      }
    }
    editor.runBatch(lote);
  }

  /**
   * Muda o COMPRIMENTO da divisa selecionada, digitando.
   *
   * Anda a ponta `b` sobre o mesmo eixo, com `pontaEsticada` — a mesma função
   * que estica parede. Qual ponta anda importa menos aqui do que na parede:
   * numa divisa de lote as duas costumam estar presas ao anel, e o arraste da
   * vizinha (acima) mantém o contorno fechado de qualquer jeito.
   */
  function esticarDivisa(comprimentoMm: number) {
    if (!limiteSel) return;
    let nova: Point;
    try {
      nova = pontaEsticada(limiteSel.a, limiteSel.b, comprimentoMm);
    } catch (e) {
      // Coordenada fora de ±1.000.000 mm (alguém digitou metros achando que eram
      // milímetros). Recusa silenciosa: o campo ressincroniza no próximo render.
      if (e instanceof KernelError) return;
      throw e;
    }
    moverPontaLimite(limiteSel.id, 'b', nova);
  }

  /**
   * O funil ÚNICO da seleção.
   *
   * A seleção do desenho e a da lista de medições são dois estados diferentes —
   * medição vive fora do modelo canônico e fora do histórico. Passar as duas por
   * aqui é o que impede que a lista lateral mostre uma coisa e o canvas outra.
   * A lista destaca uma medição só, então só a seleção de UMA a alimenta.
   */
  function selecionar(ids: string[]) {
    // Um clique numa estaca ou num bloco pega o GRUPO de fundação (16/09/2026:
    // *"a estaca e seu bloco deve estar agrupado"*) — é assim que mover e
    // excluir levam o conjunto sem comando novo. A peça sozinha é o duplo
    // clique (`selecionarSoAPeca`).
    const grupo = ids.length === 1 ? idsDoGrupo(editor.model, ids[0]) : null;
    const efetivos = grupo ?? ids;
    editor.setSelectedIds(efetivos);
    const unica = efetivos.length === 1 ? efetivos[0] : null;
    medicoes.setSelecionada(unica && medicoes.formas.some((f) => f.id === unica) ? unica : null);
  }

  /** Seleciona SÓ a peça, sem expandir para o grupo — o duplo clique. */
  function selecionarSoAPeca(id: string) {
    editor.setSelectedIds([id]);
    medicoes.setSelecionada(null);
  }

  /** Refaz as estacas do grupo selecionado num lote e mantém o grupo selecionado. */
  function redistribuirEstacasDoGrupo(opts: { quantidade: number; diametroMm?: number; comprimentoMm?: number }) {
    if (!grupoSel) return;
    const plano = planejarEstacasDoBloco(editor.model, grupoSel.bloco.id, opts);
    if (plano.motivo || plano.comandos.length === 0) return;
    editor.runBatch(plano.comandos);
    // A seleção reexpande com as estacas novas na próxima renderização: os ids
    // antigos morreram no lote, e `selecionar([bloco])` os troca pelos atuais.
    setSelecaoPendente(grupoSel.bloco.id);
  }

  /**
   * Desloca paredes E limites selecionados — o gesto que faltava no módulo.
   *
   * UM comando, e não um lote de `MoveVertex`: o lote recomputaria o arranjo
   * planar a cada ponta e, pior, passaria por estados intermediários em que a
   * parede está mais curta — o bastante para uma porta colada no limite cair
   * fora e derrubar o gesto inteiro. Ver o cabeçalho de `TranslateEntities`.
   *
   * As duas famílias vão no MESMO comando porque a vizinhança do modo Manter
   * junções precisa enxergar as duas: dividindo, uma divisa encostada numa parede
   * ficaria para trás e o anel do lote abriria em silêncio.
   */
  function moverSelecao(
    wallIds: string[],
    boundaryIds: string[],
    structuralIds: string[],
    aguaIds: string[],
    delta: Point,
    rede?: { trechoIds: string[]; terminalIds: string[]; quadroIds: string[] },
    pecas?: { nucleoIds: string[]; vagaIds: string[]; componenteIds: string[] },
  ) {
    editor.run({
      type: 'TranslateEntities',
      wallIds,
      boundaryIds,
      structuralIds,
      aguaIds,
      // Núcleos, vagas e componentes (P2.4) — rígidos, no mesmo passo de desfazer.
      nucleoIds: pecas?.nucleoIds ?? [],
      vagaIds: pecas?.vagaIds ?? [],
      componenteIds: pecas?.componenteIds ?? [],
      // Instalações no MESMO comando, e não num segundo: arrastar a parede e a
      // rede em dois passos deixaria um estado intermediário em que o cano
      // atravessa a parede, e o desfazer teria de ser dado duas vezes.
      trechoIds: rede?.trechoIds ?? [],
      terminalIds: rede?.terminalIds ?? [],
      quadroIds: rede?.quadroIds ?? [],
      delta,
      manterJuncoes: modoJuncao === 'MANTER',
    });
  }

  /**
   * Desloca as medições selecionadas.
   *
   * ⚠️ Camada separada, gravação separada: medição NÃO entra no histórico de
   * desfazer (a decisão está em `useBlueprintMedicoes` — Ctrl+Z apagando um
   * levantamento seria irrecuperável). Movendo paredes e medições juntas, um
   * Ctrl+Z reverte só as paredes. Avisar é mais honesto que disfarçar: duas
   * pilhas coordenadas por uma tecla se desalinham no terceiro desfazer.
   */
  function moverMedicoes(ids: string[], delta: Point) {
    void medicoes.deslocar(ids, delta);
  }

  /**
   * Leva a área medida na planta para a ficha do empreendimento.
   *
   * Mostra o valor ATUAL antes de trocar. Substituir um número que alguém
   * digitou, sem dizer qual era, é o tipo de gravação que só se descobre quando
   * já não dá para voltar — a ficha não tem histórico.
   */
  /**
   * Leva o lote desenhado para a ficha do empreendimento: área e as quatro medidas.
   *
   * ⚠️ Grava o DESENHADO, não o escriturado. É o que este botão sempre afirmou
   * levar, e o quadro de divisas é onde se prova que os dois batem. Divergência
   * **avisa e não bloqueia** — o dono do número é o usuário, e travar a gravação
   * por causa de uma diferença de campo é o erro que já custou uma reversão.
   *
   * ⚠️ Papel sem nenhum lado fica FORA do update, não vai como zero: as colunas
   * também são preenchidas à mão na ficha, e zero apagaria o que alguém digitou.
   */
  async function gravarAreaNoEmpreendimento(empreendimentoId: string) {
    if (!terreno || !terreno.fechado) return;
    const alvo = empreendimentos.find((e) => e.id === empreendimentoId);
    if (!alvo) return;

    const nova = Number(areaEmM2(terreno).toFixed(2));
    const atual = alvo.terreno_area ?? null;
    const emMetros = (mm: number) => Number((mm / 1000).toFixed(2));

    const medidas = medidasPorPapel(terreno, limitesDoNivel);
    const campoDoPapel = {
      FRENTE: 'terreno_frente',
      FUNDOS: 'terreno_fundos',
      LATERAL_DIREITA: 'terreno_lateral_direita',
      LATERAL_ESQUERDA: 'terreno_lateral_esquerda',
    } as const;

    const patch: Partial<Empreendimento> = { terreno_area: nova };
    const linhasDaConfirmacao = [
      atual === null
        ? `Área: ${nova.toFixed(2).replace('.', ',')} m² (hoje sem registro)`
        : `Área: ${Number(atual).toFixed(2).replace('.', ',')} → ${nova.toFixed(2).replace('.', ',')} m²`,
    ];

    for (const [papel, campo] of Object.entries(campoDoPapel) as [
      keyof typeof campoDoPapel,
      (typeof campoDoPapel)[keyof typeof campoDoPapel],
    ][]) {
      const mm = medidas[papel];
      if (mm === undefined) continue;
      const valor = emMetros(mm);
      (patch as Record<string, unknown>)[campo] = valor;
      const antes = alvo[campo] ?? null;
      linhasDaConfirmacao.push(
        antes === null
          ? `${ROTULO_DO_PAPEL[papel]}: ${valor.toFixed(2).replace('.', ',')} m (hoje sem registro)`
          : `${ROTULO_DO_PAPEL[papel]}: ${Number(antes).toFixed(2).replace('.', ',')} → ${valor
              .toFixed(2)
              .replace('.', ',')} m`,
      );
    }

    const semPapel = ladosSemPapel > 0 ? `\n\n${ladosSemPapel} lado(s) sem papel não entram.` : '';
    const divergem =
      ladosDivergentes > 0
        ? `\n\n⚠️ ${ladosDivergentes} lado(s) divergem da escritura — o valor gravado é o DESENHADO.`
        : '';

    const ok = await confirmar({
      title: `Gravar as medidas do lote em ${alvo.name}?`,
      message: `${linhasDaConfirmacao.join('\n')}${semPapel}${divergem}`,
      confirmLabel: 'Gravar',
      variant: atual === null && linhasDaConfirmacao.length === 1 ? 'default' : 'warning',
    });
    if (!ok) return;

    setGravandoArea(true);
    setErroArea(null);
    try {
      const salvo = await empreendimentoService.update(empreendimentoId, patch);
      // §22 do guia: atualiza o array local, sem recarregar a lista inteira.
      setEmpreendimentos((lista) => lista.map((e) => (e.id === salvo.id ? salvo : e)));
    } catch (e) {
      // A falha aparece ONDE a ação foi pedida. Mandá-la para a faixa de erro do
      // kernel, no topo, misturaria "o desenho é inválido" com "a rede caiu".
      setErroArea(e instanceof Error ? e.message : String(e));
    } finally {
      setGravandoArea(false);
    }
  }

  /**
   * Desliza a abertura ao longo da parede. O canvas já grampeia o arraste entre
   * as vizinhas, então a recusa do kernel aqui é rede de segurança — e, se vier,
   * já aparece na faixa de aviso do topo com a distância máxima no texto.
   */
  function moverAbertura(openingId: string, offsetMm: number) {
    editor.run({ type: 'MoveOpening', openingId, offsetMm });
  }

  function removerSelecionada() {
    const ids = editor.selectedIds;
    if (ids.length === 0) return;

    const paredes = ids.filter((id) => editor.model.walls.some((w) => w.id === id));
    const naSelecao = new Set(paredes);
    // ⚠️ `DeleteWall` JÁ APAGA as aberturas que a parede hospeda. Mandar
    // `DeleteOpening` depois procuraria uma abertura que não existe mais e
    // abortaria o lote inteiro — levando junto as exclusões que já estavam
    // certas. Só entram no lote as aberturas cuja parede FICA.
    const aberturas = ids.filter((id) => {
      const o = editor.model.openings.find((x) => x.id === id);
      return o ? !naSelecao.has(o.wallId) : false;
    });

    const limites = ids.filter((id) => editor.model.boundaries.some((b) => b.id === id));
    const estruturas = ids.filter((id) => editor.model.structures.some((s) => s.id === id));
    const aguas = ids.filter((id) => (editor.model.roofs ?? []).some((r) => r.id === id));
    const cortes = ids.filter((id) => (editor.model.sections ?? []).some((c) => c.id === id));
    const eixos = ids.filter((id) => (editor.model.eixos ?? []).some((e) => e.id === id));
    const escadas = ids.filter((id) => (editor.model.stairs ?? []).some((e) => e.id === id));
    const nucleos = ids.filter((id) => (editor.model.nucleos ?? []).some((n) => n.id === id));
    const subRegioesSel = ids.filter((id) => (editor.model.subRegioes ?? []).some((s) => s.id === id));
    const vagas = ids.filter((id) => (editor.model.vagas ?? []).some((v) => v.id === id));
    const componentesSel = ids.filter((id) => (editor.model.componentes ?? []).some((c) => c.id === id));
    const guardaCorposSel = ids.filter((id) => (editor.model.guardaCorpos ?? []).some((g) => g.id === id));
    const rodapesSel = ids.filter((id) => (editor.model.rodapes ?? []).some((r) => r.id === id));
    const anotacoesSel = ids.filter((id) => (editor.model.anotacoes ?? []).some((a) => a.id === id));
    // Instalações. ⚠️ O QUADRO sai por último no lote e leva os circuitos dele
    // junto (ver `DeleteQuadro`); os pontos que os citavam ficam sem circuito,
    // e não apagados — quem tirou o quadro não decidiu tirar as tomadas.
    const trechos = ids.filter((id) => (editor.model.trechos ?? []).some((t) => t.id === id));
    const terminais = ids.filter((id) => (editor.model.terminais ?? []).some((t) => t.id === id));
    const quadros = ids.filter((id) => (editor.model.quadros ?? []).some((q) => q.id === id));

    const lote: Command[] = [
      ...aberturas.map((openingId) => ({ type: 'DeleteOpening', openingId }) as const),
      ...paredes.map((wallId) => ({ type: 'DeleteWall', wallId }) as const),
      ...limites.map((boundaryId) => ({ type: 'DeleteBoundary', boundaryId }) as const),
      // Estrutura não depende de parede nem hospeda nada, então a ordem dentro
      // do lote é indiferente para ela — ao contrário da abertura, que tem de
      // sair antes da parede que a segura.
      ...estruturas.map((structuralId) => ({ type: 'DeleteStructural', structuralId }) as const),
      ...aguas.map((aguaId) => ({ type: 'DeleteAgua', aguaId }) as const),
      // A linha de corte sai junto com o resto da selecao. Ela nao hospeda
      // nada e nada a hospeda, entao a ordem dela no lote e indiferente.
      ...cortes.map((corteId) => ({ type: 'DeleteCorte', corteId }) as const),
      ...eixos.map((eixoId) => ({ type: 'DeleteEixo', eixoId }) as const),
      ...escadas.map((escadaId) => ({ type: 'DeleteEscada', escadaId }) as const),
      ...nucleos.map((nucleoId) => ({ type: 'DeleteNucleo', nucleoId }) as const),
      ...subRegioesSel.map((subRegiaoId) => ({ type: 'DeleteSubRegiao', subRegiaoId }) as const),
      ...vagas.map((vagaId) => ({ type: 'DeleteVaga', vagaId }) as const),
      ...componentesSel.map((componenteId) => ({ type: 'DeleteComponente', componenteId }) as const),
      ...guardaCorposSel.map((guardaCorpoId) => ({ type: 'DeleteGuardaCorpo', guardaCorpoId }) as const),
      ...rodapesSel.map((rodapeId) => ({ type: 'DeleteRodape', rodapeId }) as const),
      ...anotacoesSel.map((anotacaoId) => ({ type: 'DeleteAnotacao', anotacaoId }) as const),
      ...trechos.map((trechoId) => ({ type: 'DeleteTrecho', trechoId }) as const),
      ...terminais.map((terminalId) => ({ type: 'DeleteTerminal', terminalId }) as const),
      ...quadros.map((quadroId) => ({ type: 'DeleteQuadro', quadroId }) as const),
    ];
    if (lote.length > 0) editor.runBatch(lote);

    // Medições são de outra camada e de outro serviço — apagar uma parede não
    // pode apagar um levantamento por tabela, então elas saem por fora do lote.
    for (const id of ids) {
      if (medicoes.formas.some((f) => f.id === id)) void medicoes.remover(id);
    }

    selecionar([]);
  }

  /**
   * Exclui UMA peça, pela lixeira da lista de Componentes.
   *
   * Separado de `removerSelecionada` de propósito: lá o alvo é a SELEÇÃO, e usar
   * aquele caminho obrigaria a lista a selecionar a peça antes de apagá-la —
   * trocando a seleção do usuário por efeito colateral de um clique que ele deu
   * na lixeira, não na linha.
   *
   * `DeleteWall` já apaga as aberturas hospedadas (ver `removerSelecionada`),
   * então elas só saem da SELEÇÃO aqui; mandar `DeleteOpening` para elas
   * procuraria algo que não existe mais.
   */
  function excluirComponente(id: string) {
    const parede = editor.model.walls.find((w) => w.id === id);
    const abertura = editor.model.openings.find((o) => o.id === id);
    const estrutura = editor.model.structures.find((s) => s.id === id);
    const agua = (editor.model.roofs ?? []).find((r) => r.id === id);
    const escada = (editor.model.stairs ?? []).find((e) => e.id === id);
    // ⚠️ As INSTALAÇÕES entram aqui também (13/09/2026: "o botão excluir no
    // painel lateral não está funcionando, não consigo excluir TUG"). A lista
    // já mostrava a lixeira em trecho, ponto e quadro, mas esta função caía
    // num `return` mudo para os três — o clique não fazia nada e nada dizia.
    const trecho = (editor.model.trechos ?? []).find((t) => t.id === id);
    const terminal = (editor.model.terminais ?? []).find((t) => t.id === id);
    const quadro = (editor.model.quadros ?? []).find((q) => q.id === id);

    if (parede) editor.run({ type: 'DeleteWall', wallId: parede.id });
    else if (abertura) editor.run({ type: 'DeleteOpening', openingId: abertura.id });
    else if (estrutura) editor.run({ type: 'DeleteStructural', structuralId: estrutura.id });
    else if (agua) editor.run({ type: 'DeleteAgua', aguaId: agua.id });
    else if (escada) editor.run({ type: 'DeleteEscada', escadaId: escada.id });
    else if (trecho) editor.run({ type: 'DeleteTrecho', trechoId: trecho.id });
    else if (terminal) editor.run({ type: 'DeleteTerminal', terminalId: terminal.id });
    // O quadro leva os circuitos dele; os pontos ficam sem circuito, não apagados.
    else if (quadro) editor.run({ type: 'DeleteQuadro', quadroId: quadro.id });
    else return;

    const some = new Set<string>([id]);
    if (parede) {
      for (const o of editor.model.openings) if (o.wallId === parede.id) some.add(o.id);
    }
    if (editor.selectedIds.some((x) => some.has(x))) {
      selecionar(editor.selectedIds.filter((x) => !some.has(x)));
    }
  }

  /**
   * ─── COPIAR E COLAR ────────────────────────────────────────────────────────
   *
   * Pedido de 29/08/2026: copiar e colar objetos (paredes, portas, janelas…).
   *
   * A REGRA vive em `utils/blueprintAreaDeTransferencia.ts`, e não aqui: o que
   * entra na cópia, onde fica a âncora e em que offset a porta cai é decisão
   * pura, testável sem navegador. Aqui fica só o que é deste componente — o
   * estado, o recado na tela e a seleção do que acabou de nascer.
   */
  function copiar() {
    const r = copiarSelecao(editor.model, editor.selectedIds);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      return;
    }
    setAreaDeTransferencia(r.area);
    setAvisoColar(null);
  }

  /** Cola no cursor. O canvas entrega o ponto e a parede que estiver embaixo. */
  function colar(destino: DestinoDeColagem) {
    if (!areaDeTransferencia || !levelId) return;
    const r = comandoDeColagem(editor.model, areaDeTransferencia, destino, levelId);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      // O que sumiu, sumiu: manter a área de transferência apontando para ids
      // apagados só faria o mesmo aviso reaparecer a cada Ctrl+V.
      setAreaDeTransferencia(null);
      return;
    }
    const criados = editor.run(r.comando);
    setAvisoColar(r.aviso);
    // A cópia nasce SELECIONADA — é ela que a pessoa quer ajustar em seguida,
    // e sem isso o próximo arraste pegaria o original de volta.
    if (criados.length > 0) selecionar(criados);
  }

  /**
   * ─── DUPLICAR · ESPELHAR · ISOLAR (17/09/2026) ─────────────────────────────
   *
   * Os botões do acesso rápido. A regra de cada um está em
   * `utils/blueprintSelecao.ts`; aqui só o estado, o aviso e a seleção.
   */
  function duplicar() {
    if (!levelId) return;
    // Um passo de grade para o lado e para baixo; com a grade automática, 50 cm.
    const r = comandoDeDuplicacao(editor.model, editor.selectedIds, levelId, passoGrade ?? 500);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      return;
    }
    const criados = editor.run(r.comando);
    setAvisoColar(r.aviso);
    if (criados.length > 0) selecionar(criados);
  }
  function espelhar(eixo: 'VERTICAL' | 'HORIZONTAL') {
    const r = comandoDeEspelhamento(editor.model, editor.selectedIds, eixo);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      return;
    }
    editor.run(r.comando);
    setAvisoColar(r.aviso);
  }
  /**
   * ─── GIRAR · ALINHAR · MATRIZ (18/09/2026, roadmap E0.1) ────────────────────
   *
   * Os P0 de edição básica que faltavam. Mesma divisão: a regra em
   * `utils/blueprintSelecao.ts`, aqui o estado, o aviso e a seleção.
   */
  function girar(anguloGraus: number) {
    const r = comandoDeRotacao(editor.model, editor.selectedIds, anguloGraus);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      return;
    }
    editor.run(r.comando);
    setAvisoColar(r.aviso);
  }
  /** A referência é a ÚLTIMA parede/divisa selecionada — é a que a pessoa acabou de apontar. */
  const referenciaDoAlinhamento = [...editor.selectedIds]
    .reverse()
    .find((id) => editor.model.walls.some((w) => w.id === id) || editor.model.boundaries.some((b) => b.id === id));
  function alinhar() {
    if (!referenciaDoAlinhamento) {
      setAvisoColar('Selecione as peças e, por último, a parede (ou divisa) que serve de referência.');
      return;
    }
    const r = comandosDeAlinhamento(editor.model, editor.selectedIds, referenciaDoAlinhamento);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      return;
    }
    editor.runBatch(r.comandos);
    setAvisoColar(r.aviso);
  }
  function criarMatriz() {
    if (!levelId) return;
    const r = comandosDeMatriz(editor.model, editor.selectedIds, levelId, parametrosDaMatriz);
    if (!r.ok) {
      setAvisoColar(r.aviso);
      return;
    }
    const criados = editor.runBatch(r.comandos);
    setAvisoColar(r.aviso);
    if (criados.length > 0) selecionar(criados);
    // A gaveta fecha: o que a pessoa quer ver agora é a matriz na planta, e a
    // gaveta com seleção aberta cobre o desenho.
    setTarefa(null);
  }
  const isolado = ocultosNoDesenho.size > 0;
  function isolarOuMostrarTudo() {
    if (isolado) {
      setOcultosNoDesenho(new Set());
      return;
    }
    if (editor.selectedIds.length === 0) return;
    setOcultosNoDesenho(new Set(idsParaIsolar(editor.model, levelId, editor.selectedIds)));
  }
  /** Abre Versões com a vista em que se está já marcada como prancha. */
  function exportarAVistaAtual() {
    const prancha: PranchaExport = vista === '3d' || vistaDePlanta ? 'planta' : (vista as PranchaExport);
    setPranchaParaExportar([prancha]);
    setRelatorio('versoes');
  }
  const duplicarRef = useRef(duplicar);
  duplicarRef.current = duplicar;


  /**
   * O menu Componentes escolhe o par (ferramenta, subtipo) — ver `MenuComponentes`.
   * Uma função só para as DUAS portas do catálogo (Arquitetura e Instalações):
   * a regra de "trocar de disciplina traz cota e bitola junto" não pode divergir.
   */
  const escolherComponente = (e: EscolhaComponente) => {
    editor.setTool(e.tool);
    if (e.tool === 'abertura') setTipoAbertura(e.abertura);
    if (e.tool === 'escada') setTipoCirculacao(e.circulacao);
    if (e.tool === 'nucleo') {
      setTipoDeNucleo(e.nucleo);
      setDisciplinaDoNucleo(e.nucleo === 'SHAFT' ? (e.disciplina ?? null) : null);
    }
    if (e.tool === 'vaga') setTipoDeVaga(e.vaga);
    if (e.tool === 'componente') setTipoDeComponente(e.componente);
    if (e.tool === 'guardacorpo') setTipoDeGuardaCorpo(e.guardaCorpo);
    // A disciplina é estado da BARRA, e trocá-la traz cota e bitola usuais
    // junto: escolher "esgoto" e continuar desenhando na cota do eletroduto
    // seria pior que não ter padrão nenhum.
    if (e.tool === 'rede' || e.tool === 'terminal') {
      setDisciplinaDeRede(e.disciplina);
      setBitolaDeRede(BITOLA_PADRAO_MM[e.disciplina]);
      // ⚠️ A COTA vem do TIPO quando há um: luz de teto no pé-direito e TUG a
      // 300 mm são o que se digitaria de qualquer jeito. Sem isto, escolher
      // "luz de teto" e desenhar na cota da tomada seria pior que não ter
      // padrão nenhum — a peça sairia plausível e errada.
      const tipo = e.tool === 'terminal' ? e.tipoEletrico : undefined;
      setTipoDePontoEletrico(tipo ?? null);
      setTipoDeInterruptor((e.tool === 'terminal' && e.interruptor) || null);
      // O tipo HIDRÁULICO (18/09/2026): cota usual da ficha; o texto do tipo
      // passa a ser o rótulo dela, para o ponto não nascer "Tomada baixa".
      const hidraulico = e.tool === 'terminal' ? (e.tipoHidraulico ?? null) : null;
      setTipoDePontoHidraulico(hidraulico);
      if (hidraulico) setTipoDeTerminal(FICHA_DO_PONTO_HIDRAULICO[hidraulico].rotulo);
      // O TERMINAL MECÂNICO (P2.2) traz o nome no item ("Difusor"); ao sair da
      // mecânica esse nome não pode vazar para a tomada seguinte.
      if (e.tool === 'terminal' && e.tipoTexto) setTipoDeTerminal(e.tipoTexto);
      else if (e.tool === 'terminal' && e.disciplina !== 'MECANICA' && (TIPOS_DE_TERMINAL_MECANICO as readonly string[]).includes(tipoDeTerminal)) setTipoDeTerminal('');
      setPrumadaDeRede(e.tool === 'rede' ? (e.prumada ?? null) : null);
      setCotaDeRede(
        tipo
          ? COTA_USUAL_DO_PONTO_ELETRICO[tipo]
          : hidraulico
            ? (cotaUsualDoPontoHidraulico(hidraulico, e.disciplina) ?? COTA_PADRAO_MM[e.disciplina])
            : COTA_PADRAO_MM[e.disciplina],
      );
    }
    if (e.tool === 'estrutural') {
      setTipoEstrutural(e.estrutural);
      // As medidas do tipo novo vêm inteiras — ver `PADRAO_ESTRUTURAL`.
      setMedidasEstruturais(PADRAO_ESTRUTURAL[e.estrutural]);
    }
  };

  /** Os ambientes classificados que ainda devem tomada (9.5.2.2.1) — a contagem do botão. */
  const ambientesComDeficit = ambientes.filter(
    (a) => !!a.conferencia && (a.conferencia.deficit > 0 || a.conferencia.deficitMedias > 0),
  );
  /**
   * O LANÇAMENTO AUTOMÁTICO DE ELETRODUTOS — ver `blueprintEletrodutos.ts`.
   * A bitola é a única hipótese que se troca aqui; as outras (rede no teto,
   * prumada no ponto, árvore a partir do quadro, condutores por ligação) estão
   * escritas no drawer. Os planos são derivados a cada render: mudam com o
   * desenho e com a bitola, e planejar é barato (dezenas de pontos).
   */
  const [bitolaDeEletroduto, setBitolaDeEletroduto] = useState<number>(HIPOTESES_ELETRODUTO_PADRAO.bitolaMm);
  // ROTA MÁXIMA (15/09/2026): preferência de trabalho, persistida — quem quer
  // a árvore mínima ou o leque não quer escolher de novo a cada planta.
  const [rotaMaxima, setRotaMaxima] = usePersistedState<number | null>(
    'blueprint:eletrodutosRotaMaxima',
    HIPOTESES_ELETRODUTO_PADRAO.rotaMaximaVezes,
  );
  const hipotesesDeEletroduto = useMemo(
    () => ({ ...HIPOTESES_ELETRODUTO_PADRAO, bitolaMm: bitolaDeEletroduto, rotaMaximaVezes: rotaMaxima }),
    [bitolaDeEletroduto, rotaMaxima],
  );
  // POR QUADRO, todos os pavimentos (15/09/2026): a rede é uma por quadro,
  // compartilhada entre os circuitos, e atravessa a laje na posição do quadro.
  const planosDeEletrodutos = useMemo(
    () => planejarEletrodutosDoModelo(editor.model, hipotesesDeEletroduto, hipotesesEletricas),
    [editor.model, hipotesesDeEletroduto, hipotesesEletricas],
  );
  const pontosALigar = planosDeEletrodutos.reduce((n, p) => n + p.aLigar, 0);
  const pontosEletricosSemCircuito = levelId ? pontosSemCircuito(editor.model, levelId) : [];
  const eletrodutosSugeridosNoNivel = eletrodutosSugeridos(editor.model, levelId);
  /** Aplica UM plano (ou todos) num lote só — Ctrl+Z desfaz o lote; os trechos nascem selecionados. */
  /**
   * Lança (ou RELANÇA) os quadros pedidos num lote só. Quadro com plano novo
   * recebe o plano; quadro sem nada a ligar mas com trechos SUGERIDOS tem os
   * sugeridos apagados e a rede refeita — é o que devolve o botão depois de
   * mover um ponto ou o quadro (15/09/2026). Confirmados nunca são tocados.
   */
  const lancarEletrodutos = (planos: PlanoDeEletrodutos[]) => {
    const comandos = planos.flatMap((p) => {
      if (p.comandos.length > 0) return p.comandos;
      if (p.sugeridos === 0) return [];
      const quadro = (editor.model.quadros ?? []).find((q) => q.id === p.quadroId);
      return quadro ? relancarEletrodutos(editor.model, quadro, hipotesesDeEletroduto, hipotesesEletricas).comandos : [];
    });
    if (comandos.length === 0) return;
    const criados = editor.runBatch(comandos);
    if (criados.length > 0) selecionar(criados);
  };
  /** REFAZER a rede de um quadro: apaga tudo (confirmados também) e lança de novo — com confirmação. */
  const refazerRedeDoQuadro = async (plano: PlanoDeEletrodutos) => {
    const quadro = (editor.model.quadros ?? []).find((q) => q.id === plano.quadroId);
    if (!quadro) return;
    const ok = await confirmar({
      title: `Refazer os eletrodutos de ${quadro.nome}?`,
      message: `Apaga os ${plano.trechosDoQuadro} eletroduto(s) deste quadro — inclusive os que você já confirmou — e lança de novo com as hipóteses atuais (bitola mínima, rota máxima). Ctrl+Z desfaz.`,
      confirmLabel: 'Refazer',
      variant: 'warning',
    });
    if (!ok) return;
    const re = refazerEletrodutos(editor.model, quadro, hipotesesDeEletroduto, hipotesesEletricas);
    if (re.comandos.length === 0) return;
    const criados = editor.runBatch(re.comandos);
    if (criados.length > 0) selecionar(criados);
  };
  /** Há o que lançar ou relançar em algum quadro? */
  const haOQueLancar = planosDeEletrodutos.some((p) => p.comandos.length > 0 || p.sugeridos > 0);
  const aceitarEletrodutos = () =>
    editor.runBatch(
      eletrodutosSugeridosNoNivel.map((t) => ({ type: 'SetTrechoProps' as const, trechoId: t.id, sugerido: false })),
    );

  /**
   * A CRIAÇÃO AUTOMÁTICA DE CIRCUITOS (14/09/2026) — ver
   * `blueprintCircuitosAutomaticos.ts`. Critério e carga máxima são
   * preferência (persistidas); o quadro escolhido é do modelo (não persiste —
   * o id muda de estudo para estudo) e cai no primeiro do pavimento. O plano é
   * derivado a cada render, como o dos eletrodutos: é uma PRÉVIA, e a prévia
   * tem de acompanhar o desenho. Gravar é um `runBatch` só — Ctrl+Z desfaz.
   */
  const [hipDeCircuitosSalvas, setHipDeCircuitosSalvas] = usePersistedState<
    Pick<HipotesesDeCircuitos, 'criterio' | 'cargaMaximaVA'>
  >('blueprint:circuitosAutomaticos', {
    criterio: HIPOTESES_CIRCUITOS_PADRAO.criterio,
    cargaMaximaVA: HIPOTESES_CIRCUITOS_PADRAO.cargaMaximaVA,
  });
  const hipotesesDeCircuitos = useMemo<HipotesesDeCircuitos>(
    () => ({
      ...HIPOTESES_CIRCUITOS_PADRAO,
      criterio: (CRITERIOS_DE_CIRCUITO as readonly string[]).includes(hipDeCircuitosSalvas.criterio)
        ? hipDeCircuitosSalvas.criterio
        : HIPOTESES_CIRCUITOS_PADRAO.criterio,
      cargaMaximaVA:
        typeof hipDeCircuitosSalvas.cargaMaximaVA === 'number' && hipDeCircuitosSalvas.cargaMaximaVA > 0
          ? hipDeCircuitosSalvas.cargaMaximaVA
          : null,
    }),
    [hipDeCircuitosSalvas],
  );
  const quadrosDoNivelAtivo = useMemo(() => (levelId ? quadrosDoNivel(editor.model, levelId) : []), [editor.model, levelId]);
  const [quadroParaCircuitos, setQuadroParaCircuitos] = useState<string | null>(null);
  const quadroDosCircuitos = quadrosDoNivelAtivo.find((q) => q.id === quadroParaCircuitos) ?? quadrosDoNivelAtivo[0] ?? null;
  const planoDeCircuitos = useMemo(
    () =>
      levelId
        ? planejarCircuitos(editor.model, levelId, quadroDosCircuitos?.id ?? null, hipotesesDeCircuitos, hipotesesEletricas)
        : null,
    [editor.model, levelId, quadroDosCircuitos?.id, hipotesesDeCircuitos, hipotesesEletricas],
  );
  const pontosParaCircuitos = levelId ? pontosElegiveis(editor.model, levelId).length : 0;

  /**
   * ─── PONTOS HIDRÁULICOS POR AMBIENTE (18/09/2026, F3) ─────────────────────
   * Hipóteses no navegador (molde dos eletrodutos); o kit de cada ambiente pode
   * ser trocado na gaveta (`kitsForcados`, estado de sessão — decisão do gesto).
   */
  const [hipDePontosSalvas, setHipDePontosSalvas] = usePersistedState<HipotesesDePontos>(
    'blueprint:pontosHidraulicos',
    HIPOTESES_PONTOS_PADRAO,
  );
  const hipotesesDePontos = useMemo<HipotesesDePontos>(
    () => ({ ...HIPOTESES_PONTOS_PADRAO, ...(hipDePontosSalvas ?? {}) }),
    [hipDePontosSalvas],
  );
  const [kitsForcados, setKitsForcados] = useState<Record<string, KitHidraulico | null>>({});
  const planosDePontos = useMemo(
    () => planejarPontosDoNivel(editor.model, levelId, hipotesesDePontos, kitsForcados),
    [editor.model, levelId, hipotesesDePontos, kitsForcados],
  );
  const ambientesComPontosACriar = planosDePontos.filter((p) => p.aCriar > 0).length;

  /**
   * ─── ÁGUA FRIA E QUENTE AUTOMÁTICAS (18/09/2026, F4) ─────────────────────────
   * Um plano por ORIGEM (caixa d'água → água fria; aquecedor → água quente).
   * Hipóteses no navegador, escritas na gaveta. O molde é o dos eletrodutos:
   * lançar (sugeridos), relançar (refaz os sugeridos) e refazer (apaga tudo,
   * com confirmação).
   */
  const [hipDeAguaSalvas, setHipDeAguaSalvas] = usePersistedState<HipotesesDeAgua>('blueprint:aguaAutomatica', HIPOTESES_AGUA_PADRAO);
  const hipotesesDeAgua = useMemo<HipotesesDeAgua>(() => ({ ...HIPOTESES_AGUA_PADRAO, ...(hipDeAguaSalvas ?? {}) }), [hipDeAguaSalvas]);
  const planosDeAgua = useMemo(() => planejarAguaDoModelo(editor.model, hipotesesDeAgua), [editor.model, hipotesesDeAgua]);
  const pontosDeAguaALigar = planosDeAgua.reduce((n, p) => n + p.aLigar, 0);
  const origemDoPlano = (p: PlanoDeAgua) => (editor.model.terminais ?? []).find((t) => t.id === p.origemId) ?? null;
  const lancarAgua = (planos: PlanoDeAgua[]) => {
    const comandos = planos.flatMap((p) => {
      if (p.comandos.length > 0) return p.comandos;
      if (p.sugeridos === 0) return [];
      const origem = origemDoPlano(p);
      return origem ? relancarAgua(editor.model, origem, hipotesesDeAgua).comandos : [];
    });
    if (comandos.length === 0) return;
    const criados = editor.runBatch(comandos);
    if (criados.length > 0) selecionar(criados);
  };
  const refazerRedeDeAgua = async (plano: PlanoDeAgua) => {
    const origem = origemDoPlano(plano);
    if (!origem) return;
    const ok = await confirmar({
      title: `Refazer a rede de ${ROTULO_DA_DISCIPLINA[plano.disciplina].toLowerCase()}?`,
      message: `Apaga os ${plano.trechosDaRede} trecho(s) ligados a ${plano.origemNome.toLowerCase()} — inclusive os que você já confirmou — e lança de novo com as hipóteses atuais. Ctrl+Z desfaz.`,
      confirmLabel: 'Refazer',
      variant: 'warning',
    });
    if (!ok) return;
    const re = refazerAgua(editor.model, origem, hipotesesDeAgua);
    if (re.comandos.length === 0) return;
    const criados = editor.runBatch(re.comandos);
    if (criados.length > 0) selecionar(criados);
  };
  const haAguaALancar = planosDeAgua.some((p) => p.comandos.length > 0 || p.sugeridos > 0);

  /** ─── ESGOTO AUTOMÁTICO (18/09/2026, F5) ─────────────────────────────────── */
  const [hipDeEsgotoSalvas, setHipDeEsgotoSalvas] = usePersistedState<HipotesesDeEsgoto>('blueprint:esgotoAutomatico', HIPOTESES_ESGOTO_PADRAO);
  const hipotesesDeEsgoto = useMemo<HipotesesDeEsgoto>(() => ({ ...HIPOTESES_ESGOTO_PADRAO, ...(hipDeEsgotoSalvas ?? {}) }), [hipDeEsgotoSalvas]);
  const planoDeEsgoto = useMemo(() => planejarEsgoto(editor.model, hipotesesDeEsgoto), [editor.model, hipotesesDeEsgoto]);
  const lancarEsgoto = () => {
    const comandos = planoDeEsgoto.comandos.length > 0
      ? planoDeEsgoto.comandos
      : planoDeEsgoto.sugeridos > 0
        ? relancarEsgoto(editor.model, hipotesesDeEsgoto).comandos
        : [];
    if (comandos.length === 0) return;
    const criados = editor.runBatch(comandos);
    if (criados.length > 0) selecionar(criados);
  };
  const refazerRedeDeEsgoto = async () => {
    const ok = await confirmar({
      title: 'Refazer a rede de esgoto?',
      message: `Apaga os ${planoDeEsgoto.trechosDaRede} trecho(s) ligados à caixa de inspeção — inclusive os que você já confirmou — e lança de novo com as hipóteses atuais. Ctrl+Z desfaz.`,
      confirmLabel: 'Refazer',
      variant: 'warning',
    });
    if (!ok) return;
    const re = refazerEsgoto(editor.model, hipotesesDeEsgoto);
    if (re.comandos.length === 0) return;
    const criados = editor.runBatch(re.comandos);
    if (criados.length > 0) selecionar(criados);
  };
  const lancarPontos = (planos: typeof planosDePontos) => {
    const lote = planos.flatMap((p) => p.comandos);
    if (lote.length === 0) return;
    const criados = editor.runBatch(lote);
    if (criados.length > 0) selecionar(criados);
  };
  /** O que aconteceu no último "Criar": sucesso (para o drawer dizer) ou a recusa da conferência. */
  const [resultadoDeCircuitos, setResultadoDeCircuitos] = useState<{ ok: boolean; texto: string } | null>(null);
  const criarCircuitos = () => {
    if (!planoDeCircuitos || planoDeCircuitos.comandos.length === 0) return;
    // A trava: simula o lote e confere que os ids previstos batem. Se não
    // batem, nada é gravado — melhor recusar do que ligar ponto no circuito errado.
    const prova = conferirPlano(editor.model, planoDeCircuitos);
    if (!prova.ok) {
      setResultadoDeCircuitos({ ok: false, texto: `Nada foi criado: ${prova.motivo}` });
      return;
    }
    const n = planoDeCircuitos.circuitos.length;
    const m = planoDeCircuitos.circuitos.reduce((s, c) => s + c.terminalIds.length, 0);
    editor.runBatch(planoDeCircuitos.comandos);
    setResultadoDeCircuitos({ ok: true, texto: `${n} circuito(s) criado(s) para ${m} ponto(s) — Ctrl+Z desfaz.` });
  };

  /**
   * O LANÇAMENTO AUTOMÁTICO DE PILARES (15/09/2026) — ver `blueprintPilaresAutomaticos.ts`.
   *
   * Vão máximo, seção e "incluir internas" são preferência de trabalho
   * (persistidas); o plano é derivado a cada render — muda com o desenho e com
   * as hipóteses, e planejar é barato (dezenas de paredes). Enquanto a gaveta
   * está aberta, o canvas desenha os pilares propostos tracejados; gravar é um
   * `runBatch` só, provado antes por `conferirPlanoDePilares`.
   */
  const [hipDePilaresSalvas, setHipDePilaresSalvas] = usePersistedState<{
    vaoMaximoMm: number;
    secao: SecaoSugeridaId;
    incluirInternas: boolean;
  }>('blueprint:pilaresAutomaticos', {
    vaoMaximoMm: HIPOTESES_PILARES_PADRAO.vaoMaximoMm,
    secao: '190x190',
    incluirInternas: HIPOTESES_PILARES_PADRAO.incluirInternas,
  });
  const hipotesesDePilares = useMemo<HipotesesDePilares>(() => {
    // O que veio do localStorage é validado campo a campo — o hook não valida nada.
    const secao = SECOES_SUGERIDAS.find((x) => x.id === hipDePilaresSalvas.secao) ?? SECOES_SUGERIDAS[0];
    const vao =
      typeof hipDePilaresSalvas.vaoMaximoMm === 'number' &&
      hipDePilaresSalvas.vaoMaximoMm >= 1000 &&
      hipDePilaresSalvas.vaoMaximoMm <= 20000
        ? hipDePilaresSalvas.vaoMaximoMm
        : HIPOTESES_PILARES_PADRAO.vaoMaximoMm;
    return {
      ...HIPOTESES_PILARES_PADRAO,
      vaoMaximoMm: vao,
      larguraMm: secao.larguraMm,
      profundidadeMm: secao.profundidadeMm,
      incluirInternas: hipDePilaresSalvas.incluirInternas !== false,
    };
  }, [hipDePilaresSalvas]);
  const secaoDePilarEscolhida =
    SECOES_SUGERIDAS.find((x) => x.id === hipDePilaresSalvas.secao)?.id ?? SECOES_SUGERIDAS[0].id;
  const planoDePilares = useMemo(
    () => (levelId ? planejarPilares(editor.model, levelId, hipotesesDePilares) : null),
    [editor.model, levelId, hipotesesDePilares],
  );
  const [resultadoDePilares, setResultadoDePilares] = useState<{ ok: boolean; texto: string } | null>(null);
  const lancarPilares = () => {
    if (!planoDePilares || planoDePilares.comandos.length === 0) return;
    const prova = conferirPlanoDePilares(editor.model, planoDePilares);
    if (!prova.ok) {
      setResultadoDePilares({ ok: false, texto: `Nada foi lançado: ${prova.motivo}` });
      return;
    }
    const n = planoDePilares.pilares.length;
    const m = planoDePilares.paredesQueCedem.length;
    const criados = editor.runBatch(planoDePilares.comandos);
    if (criados.length > 0) selecionar(criados);
    setResultadoDePilares({
      ok: true,
      texto: `${n} pilar(es) lançado(s) · ${m} parede(s) passaram a ceder — Ctrl+Z desfaz.`,
    });
  };
  const peDireitoDoNivelAtivo = editor.model.levels.find((l) => l.id === levelId)?.defaultHeightMm ?? null;

  /**
   * VIGAS E LAJES AUTOMÁTICAS (16/09/2026) — ver `blueprintVigasLajesAutomaticas.ts`.
   * O mesmo molde dos pilares: hipóteses persistidas, plano derivado a cada
   * render, prévia tracejada, um `runBatch`, "Relançar" sempre que há peça do
   * tipo no pavimento.
   */
  const [hipDeVigasSalvas, setHipDeVigasSalvas] = usePersistedState<{
    divisorDaAltura: number;
    alturaMinimaMm: number;
    incluirInternas: boolean;
  }>('blueprint:vigasAutomaticas', {
    divisorDaAltura: HIPOTESES_VIGAS_PADRAO.divisorDaAltura,
    alturaMinimaMm: HIPOTESES_VIGAS_PADRAO.alturaMinimaMm,
    incluirInternas: HIPOTESES_VIGAS_PADRAO.incluirInternas,
  });
  const hipotesesDeVigas = useMemo<HipotesesDeVigas>(
    () => ({
      ...HIPOTESES_VIGAS_PADRAO,
      divisorDaAltura: (DIVISORES_DA_ALTURA as readonly number[]).includes(hipDeVigasSalvas.divisorDaAltura)
        ? hipDeVigasSalvas.divisorDaAltura
        : HIPOTESES_VIGAS_PADRAO.divisorDaAltura,
      alturaMinimaMm: (ALTURAS_MINIMAS_DE_VIGA as readonly number[]).includes(hipDeVigasSalvas.alturaMinimaMm)
        ? hipDeVigasSalvas.alturaMinimaMm
        : HIPOTESES_VIGAS_PADRAO.alturaMinimaMm,
      incluirInternas: hipDeVigasSalvas.incluirInternas !== false,
    }),
    [hipDeVigasSalvas],
  );
  const [hipDeLajesSalvas, setHipDeLajesSalvas] = usePersistedState<{ espessuraMm: number }>('blueprint:lajesAutomaticas', {
    espessuraMm: HIPOTESES_LAJES_PADRAO.espessuraMm,
  });
  const hipotesesDeLajes = useMemo<HipotesesDeLajes>(
    () => ({
      espessuraMm: (ESPESSURAS_DE_LAJE as readonly number[]).includes(hipDeLajesSalvas.espessuraMm)
        ? hipDeLajesSalvas.espessuraMm
        : HIPOTESES_LAJES_PADRAO.espessuraMm,
    }),
    [hipDeLajesSalvas],
  );
  const planoDeVigas = useMemo(
    () => (levelId ? planejarVigas(editor.model, levelId, hipotesesDeVigas) : null),
    [editor.model, levelId, hipotesesDeVigas],
  );
  const planoDeLajes = useMemo(
    () => (levelId ? planejarLajes(editor.model, levelId, hipotesesDeLajes) : null),
    [editor.model, levelId, hipotesesDeLajes],
  );
  const vigasNoNivel = levelId ? vigasExistentesNoNivel(editor.model, levelId).length : 0;
  const lajesNoNivel = levelId ? lajesExistentesNoNivel(editor.model, levelId).length : 0;
  const planoDeRelancamentoDeVigas = useMemo(
    () => (levelId && vigasNoNivel > 0 ? relancarVigas(editor.model, levelId, hipotesesDeVigas) : null),
    [editor.model, levelId, hipotesesDeVigas, vigasNoNivel],
  );
  const planoDeRelancamentoDeLajes = useMemo(
    () => (levelId && lajesNoNivel > 0 ? relancarLajes(editor.model, levelId, hipotesesDeLajes) : null),
    [editor.model, levelId, hipotesesDeLajes, lajesNoNivel],
  );
  const [resultadoDeVigas, setResultadoDeVigas] = useState<{ ok: boolean; texto: string } | null>(null);
  const [resultadoDeLajes, setResultadoDeLajes] = useState<{ ok: boolean; texto: string } | null>(null);
  const lancarVigas = () => {
    if (!planoDeVigas || planoDeVigas.comandos.length === 0) return;
    const prova = conferirPlanoDeVigas(editor.model, planoDeVigas);
    if (!prova.ok) {
      setResultadoDeVigas({ ok: false, texto: `Nada foi lançado: ${prova.motivo}` });
      return;
    }
    const criados = editor.runBatch(planoDeVigas.comandos);
    if (criados.length > 0) selecionar(criados);
    setResultadoDeVigas({
      ok: true,
      texto: `${planoDeVigas.vigas.length} viga(s) lançada(s) · ${planoDeVigas.paredesQueCedem.length} parede(s) passaram a ceder — Ctrl+Z desfaz.`,
    });
  };
  const relancarVigasDoNivel = async () => {
    if (!planoDeRelancamentoDeVigas || planoDeRelancamentoDeVigas.comandos.length === 0) return;
    const ok = await confirmar({
      title: 'Relançar as vigas deste pavimento?',
      message: `Apaga as ${planoDeRelancamentoDeVigas.apagados.length} viga(s) do pavimento — inclusive as desenhadas à mão — e lança ${planoDeRelancamentoDeVigas.vigas.length} de novo com as hipóteses atuais (h = vão ÷ ${hipotesesDeVigas.divisorDaAltura}, mín. ${hipotesesDeVigas.alturaMinimaMm / 10} cm). Ctrl+Z desfaz.`,
      confirmLabel: 'Relançar',
      variant: 'warning',
    });
    if (!ok) return;
    const prova = conferirPlanoDeVigas(editor.model, planoDeRelancamentoDeVigas);
    if (!prova.ok) {
      setResultadoDeVigas({ ok: false, texto: `Nada foi relançado: ${prova.motivo}` });
      return;
    }
    const criados = editor.runBatch(planoDeRelancamentoDeVigas.comandos);
    if (criados.length > 0) selecionar(criados);
    setResultadoDeVigas({
      ok: true,
      texto: `${planoDeRelancamentoDeVigas.apagados.length} viga(s) apagada(s) e ${planoDeRelancamentoDeVigas.vigas.length} lançada(s) — Ctrl+Z desfaz.`,
    });
  };
  const lancarLajes = () => {
    if (!planoDeLajes || planoDeLajes.comandos.length === 0) return;
    const prova = conferirPlanoDeLajes(editor.model, planoDeLajes);
    if (!prova.ok) {
      setResultadoDeLajes({ ok: false, texto: `Nada foi lançado: ${prova.motivo}` });
      return;
    }
    const criados = editor.runBatch(planoDeLajes.comandos);
    if (criados.length > 0) selecionar(criados);
    const area = planoDeLajes.lajes.reduce((a, l) => a + l.areaMm2, 0) / 1_000_000;
    setResultadoDeLajes({
      ok: true,
      texto: `${planoDeLajes.lajes.length} laje(s) lançada(s) · ${area.toFixed(2).replace('.', ',')} m² — Ctrl+Z desfaz.`,
    });
  };
  const relancarLajesDoNivel = async () => {
    if (!planoDeRelancamentoDeLajes || planoDeRelancamentoDeLajes.comandos.length === 0) return;
    const ok = await confirmar({
      title: 'Relançar as lajes deste pavimento?',
      message: `Apaga as ${planoDeRelancamentoDeLajes.apagados.length} laje(s) do pavimento — inclusive as desenhadas à mão — e lança ${planoDeRelancamentoDeLajes.lajes.length} de novo com ${hipotesesDeLajes.espessuraMm / 10} cm. Ctrl+Z desfaz.`,
      confirmLabel: 'Relançar',
      variant: 'warning',
    });
    if (!ok) return;
    const prova = conferirPlanoDeLajes(editor.model, planoDeRelancamentoDeLajes);
    if (!prova.ok) {
      setResultadoDeLajes({ ok: false, texto: `Nada foi relançado: ${prova.motivo}` });
      return;
    }
    const criados = editor.runBatch(planoDeRelancamentoDeLajes.comandos);
    if (criados.length > 0) selecionar(criados);
    setResultadoDeLajes({
      ok: true,
      texto: `${planoDeRelancamentoDeLajes.apagados.length} laje(s) apagada(s) e ${planoDeRelancamentoDeLajes.lajes.length} lançada(s) com ${hipotesesDeLajes.espessuraMm / 10} cm — Ctrl+Z desfaz.`,
    });
  };
  /**
   * FUNDAÇÕES AUTOMÁTICAS (16/09/2026) — ver `blueprintFundacoesAutomaticas.ts`.
   * Um bloco por pilar do pavimento e a(s) estaca(s) dele, num lote.
   */
  const [hipDeFundacoesSalvas, setHipDeFundacoesSalvas] = usePersistedState<HipotesesDeFundacoes>(
    'blueprint:fundacoesAutomaticas',
    HIPOTESES_FUNDACOES_PADRAO,
  );
  const hipotesesDeFundacoes = useMemo<HipotesesDeFundacoes>(() => {
    const em = (lista: readonly number[], v: unknown, padrao: number) =>
      typeof v === 'number' && lista.includes(v) ? v : padrao;
    const h = hipDeFundacoesSalvas ?? HIPOTESES_FUNDACOES_PADRAO;
    return {
      estacasPorBloco: em(ESTACAS_POR_BLOCO, h.estacasPorBloco, HIPOTESES_FUNDACOES_PADRAO.estacasPorBloco),
      diametroDaEstacaMm: em(DIAMETROS_DE_ESTACA, h.diametroDaEstacaMm, HIPOTESES_FUNDACOES_PADRAO.diametroDaEstacaMm),
      comprimentoDaEstacaMm: em(COMPRIMENTOS_DE_ESTACA, h.comprimentoDaEstacaMm, HIPOTESES_FUNDACOES_PADRAO.comprimentoDaEstacaMm),
      alturaDoBlocoMm: em(ALTURAS_DE_BLOCO, h.alturaDoBlocoMm, HIPOTESES_FUNDACOES_PADRAO.alturaDoBlocoMm),
      arrasamentoMm: em(ARRASAMENTOS, h.arrasamentoMm, HIPOTESES_FUNDACOES_PADRAO.arrasamentoMm),
      // Hipótese nova (16/09/2026): quem já tinha as fundações salvas ganha a baldrame ligada.
      vigaBaldrame: typeof h.vigaBaldrame === 'boolean' ? h.vigaBaldrame : HIPOTESES_FUNDACOES_PADRAO.vigaBaldrame,
      posicaoDaBaldrame: POSICOES_DA_BALDRAME.includes(h.posicaoDaBaldrame) ? h.posicaoDaBaldrame : HIPOTESES_FUNDACOES_PADRAO.posicaoDaBaldrame,
      alturaDaBaldrameMm: em(ALTURAS_DE_BALDRAME, h.alturaDaBaldrameMm, HIPOTESES_FUNDACOES_PADRAO.alturaDaBaldrameMm),
    };
  }, [hipDeFundacoesSalvas]);
  const planoDeFundacoes = useMemo(
    () => (levelId ? planejarFundacoes(editor.model, levelId, hipotesesDeFundacoes) : null),
    [editor.model, levelId, hipotesesDeFundacoes],
  );
  const fundacoesNoNivel = levelId ? fundacoesExistentesNoNivel(editor.model, levelId).length : 0;
  const planoDeRelancamentoDeFundacoes = useMemo(
    () => (levelId && fundacoesNoNivel > 0 ? relancarFundacoes(editor.model, levelId, hipotesesDeFundacoes) : null),
    [editor.model, levelId, hipotesesDeFundacoes, fundacoesNoNivel],
  );
  /** "4 bloco(s), 8 estaca(s) e 5 baldrame(s)" — a baldrame só entra quando há alguma. */
  const resumoDeFundacoes = (p: { blocos: unknown[]; estacas: unknown[]; baldrames: unknown[] }) =>
    p.baldrames.length > 0
      ? `${p.blocos.length} bloco(s), ${p.estacas.length} estaca(s) e ${p.baldrames.length} baldrame(s)`
      : `${p.blocos.length} bloco(s) e ${p.estacas.length} estaca(s)`;
  const [resultadoDeFundacoes, setResultadoDeFundacoes] = useState<{ ok: boolean; texto: string } | null>(null);
  const lancarFundacoes = () => {
    if (!planoDeFundacoes || planoDeFundacoes.comandos.length === 0) return;
    const prova = conferirPlanoDeFundacoes(editor.model, planoDeFundacoes);
    if (!prova.ok) {
      setResultadoDeFundacoes({ ok: false, texto: `Nada foi lançado: ${prova.motivo}` });
      return;
    }
    const criados = editor.runBatch(planoDeFundacoes.comandos);
    if (criados.length > 0) selecionar(criados);
    setResultadoDeFundacoes({
      ok: true,
      texto: `${resumoDeFundacoes(planoDeFundacoes)} lançado(s)${planoDeFundacoes.pilaresQueDescem.length ? ` · ${planoDeFundacoes.pilaresQueDescem.length} pilar(es) desceram até o bloco` : ''} — Ctrl+Z desfaz.`,
    });
  };
  const relancarFundacoesDoNivel = async () => {
    if (!planoDeRelancamentoDeFundacoes || planoDeRelancamentoDeFundacoes.comandos.length === 0) return;
    const ok = await confirmar({
      title: 'Relançar as fundações deste pavimento?',
      message: `Apaga ${planoDeRelancamentoDeFundacoes.apagados.length} bloco(s)/estaca(s)/baldrame(s) do pavimento — inclusive os desenhados à mão — e lança ${resumoDeFundacoes(planoDeRelancamentoDeFundacoes)} com as hipóteses atuais (Ø ${hipotesesDeFundacoes.diametroDaEstacaMm / 10} cm × ${hipotesesDeFundacoes.comprimentoDaEstacaMm / 1000} m, bloco h ${hipotesesDeFundacoes.alturaDoBlocoMm / 10} cm). Ctrl+Z desfaz.`,
      confirmLabel: 'Relançar',
      variant: 'warning',
    });
    if (!ok) return;
    const prova = conferirPlanoDeFundacoes(editor.model, planoDeRelancamentoDeFundacoes);
    if (!prova.ok) {
      setResultadoDeFundacoes({ ok: false, texto: `Nada foi relançado: ${prova.motivo}` });
      return;
    }
    const criados = editor.runBatch(planoDeRelancamentoDeFundacoes.comandos);
    if (criados.length > 0) selecionar(criados);
    setResultadoDeFundacoes({
      ok: true,
      texto: `${planoDeRelancamentoDeFundacoes.apagados.length} peça(s) apagada(s); ${resumoDeFundacoes(planoDeRelancamentoDeFundacoes)} lançado(s) — Ctrl+Z desfaz.`,
    });
  };
  /**
   * As PEÇAS PREVISTAS que o canvas desenha tracejadas: as da tarefa aberta.
   * Memoizado para o canvas não redesenhar em loop (identidade estável).
   */
  const pecasPrevistas = useMemo<readonly PecaPrevista[] | undefined>(() => {
    if (tarefaAberta === 'pilares' && planoDePilares) {
      return planoDePilares.pilares.map((p) => ({
        kind: 'PILAR' as const,
        pontos: [p.at],
        larguraMm: p.larguraMm,
        profundidadeMm: p.profundidadeMm,
        rotacaoDeg: p.rotacaoDeg,
        rotulo: p.rotulo,
      }));
    }
    if (tarefaAberta === 'vigas' && planoDeVigas) {
      return planoDeVigas.vigas.map((v) => ({
        kind: 'VIGA' as const,
        pontos: [v.a, v.b],
        larguraMm: v.larguraMm,
        profundidadeMm: 0,
        rotacaoDeg: 0,
        rotulo: v.rotulo,
      }));
    }
    if (tarefaAberta === 'lajes' && planoDeLajes) {
      return planoDeLajes.lajes.map((l) => ({
        kind: 'LAJE' as const,
        pontos: l.pontos,
        larguraMm: 0,
        profundidadeMm: 0,
        rotacaoDeg: 0,
        rotulo: l.rotulo,
      }));
    }
    if (tarefaAberta === 'fundacoes' && planoDeFundacoes) {
      return [
        ...planoDeFundacoes.blocos.map((b) => ({
          kind: 'BLOCO_COROAMENTO' as const,
          pontos: [b.at],
          larguraMm: b.larguraMm,
          profundidadeMm: b.profundidadeMm,
          rotacaoDeg: b.rotacaoDeg,
          rotulo: b.rotulo,
        })),
        ...planoDeFundacoes.estacas.map((e) => ({
          kind: 'ESTACA' as const,
          pontos: [e.at],
          larguraMm: e.diametroMm,
          profundidadeMm: e.diametroMm,
          rotacaoDeg: 0,
          circular: true,
        })),
        ...planoDeFundacoes.baldrames.map((v) => ({
          kind: 'VIGA_FUNDACAO' as const,
          pontos: [v.a, v.b],
          larguraMm: v.larguraMm,
          profundidadeMm: 0,
          rotacaoDeg: 0,
          rotulo: v.rotulo,
        })),
      ];
    }
    return undefined;
  }, [tarefaAberta, planoDePilares, planoDeVigas, planoDeLajes, planoDeFundacoes]);
  /** A pílula sobre o desenho quando a gaveta está recolhida: o que está em prévia e como lançar. */
  const previaRecolhida =
    drawerRecolhido && tarefaAberta === 'pilares' && planoDePilares
      ? { n: planoDePilares.pilares.length, nome: 'pilar(es)', lancar: lancarPilares, Icone: RectangleVertical }
      : drawerRecolhido && tarefaAberta === 'vigas' && planoDeVigas
        ? { n: planoDeVigas.vigas.length, nome: 'viga(s)', lancar: lancarVigas, Icone: RectangleHorizontal }
        : drawerRecolhido && tarefaAberta === 'lajes' && planoDeLajes
          ? { n: planoDeLajes.lajes.length, nome: 'laje(s)', lancar: lancarLajes, Icone: Layers }
          : drawerRecolhido && tarefaAberta === 'fundacoes' && planoDeFundacoes
            ? {
                n: planoDeFundacoes.blocos.length + planoDeFundacoes.baldrames.length,
                nome: planoDeFundacoes.baldrames.length > 0 ? 'bloco(s), estaca(s) e baldrame(s)' : 'bloco(s) com estaca(s)',
                lancar: lancarFundacoes,
                Icone: SquareStack,
              }
            : null;
  /**
   * RELANÇAR (16/09/2026): mudou a seção ou o vão depois de lançar? O pilar não
   * tem marca de "automático", então relançar é apagar os pilares do pavimento
   * e lançar de novo — dito na confirmação, um lote só, Ctrl+Z devolve tudo.
   */
  const pilaresNoNivel = levelId ? pilaresExistentesNoNivel(editor.model, levelId).length : 0;
  const planoDeRelancamento = useMemo(
    () => (levelId && pilaresNoNivel > 0 ? relancarPilares(editor.model, levelId, hipotesesDePilares) : null),
    [editor.model, levelId, hipotesesDePilares, pilaresNoNivel],
  );
  const relancarPilaresDoNivel = async () => {
    if (!planoDeRelancamento || planoDeRelancamento.comandos.length === 0) return;
    const secao = `${hipotesesDePilares.larguraMm / 10} × ${hipotesesDePilares.profundidadeMm / 10} cm`;
    const ok = await confirmar({
      title: `Relançar os pilares deste pavimento?`,
      message: `Apaga os ${planoDeRelancamento.apagados.length} pilar(es) do pavimento — inclusive os desenhados à mão — e lança ${planoDeRelancamento.pilares.length} de novo com as hipóteses atuais (${secao}, vão de ${hipotesesDePilares.vaoMaximoMm / 1000} m). Ctrl+Z desfaz.`,
      confirmLabel: 'Relançar',
      variant: 'warning',
    });
    if (!ok) return;
    const prova = conferirPlanoDePilares(editor.model, planoDeRelancamento);
    if (!prova.ok) {
      setResultadoDePilares({ ok: false, texto: `Nada foi relançado: ${prova.motivo}` });
      return;
    }
    const criados = editor.runBatch(planoDeRelancamento.comandos);
    if (criados.length > 0) selecionar(criados);
    setResultadoDePilares({
      ok: true,
      texto: `${planoDeRelancamento.apagados.length} pilar(es) apagado(s) e ${planoDeRelancamento.pilares.length} lançado(s) com ${secao} — Ctrl+Z desfaz.`,
    });
  };

  /** O que está selecionado, para rodapé de drawer: a peça, ou "N selecionados". */
  const rotuloDaSelecao =
    editor.selectedIds.length > 1
      ? `${editor.selectedIds.length} selecionados`
      : editor.selectedIds.length === 1
        ? rotuloDoSelecionado
        : null;
  /** Quantas tomadas sugeridas ainda esperam confirmação neste pavimento. */
  const sugeridasNoNivel = (editor.model.terminais ?? []).filter(
    (t) => t.sugerida && (!levelId || t.levelId === levelId),
  ).length;

  /**
   * Os controles de TOMADAS de um ambiente — tipo do cômodo, conferência 9.5.2
   * e distribuição automática. Uma função porque aparecem em DOIS lugares: no
   * cartão do ambiente (navegador) e na tarefa "Tomadas pela NBR 5410"
   * (ribbon › Instalações). Duas cópias divergiriam na primeira correção.
   */
  const controlesDeTomadas = (a: (typeof ambientes)[number]) => (
    <>
      {/* O TIPO do ambiente é o que a NBR 5410 usa para contar tomadas
          (9.5.2.2.1) — banheiro, cozinha, varanda, sala/dormitório. Sem
          tipo, o ambiente fica "a classificar": estado legítimo, visível. */}
      <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
        Tipo
        <select
          value={a.tipoDeAmbiente ?? ''}
          onChange={(e) => {
            const tipoDeAmbiente = (e.target.value || null) as TipoDeAmbiente | null;
            if (a.etiquetaId) {
              editor.run({ type: 'SetSpaceLabelProps', labelId: a.etiquetaId, tipoDeAmbiente });
            } else {
              // Sem etiqueta ainda: classificar cria uma, com o nome que a
              // lista já mostra — o tipo mora na etiqueta.
              editor.run({ type: 'NameSpace', spaceId: a.id, name: a.rotulo, tipoDeAmbiente });
            }
          }}
          aria-label={`Tipo do ambiente ${a.rotulo}`}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="">A classificar</option>
          {TIPOS_DE_AMBIENTE.map((t) => (
            <option key={t} value={t}>
              {ROTULO_DO_TIPO_DE_AMBIENTE[t]}
            </option>
          ))}
        </select>
      </label>
      <ConferenciaDoAmbiente
        conferencia={a.conferencia}
        luz={a.luz}
        onCompletar={() => completarPelaNorma(a.id)}
      />
      <DistribuirTomadas
        escopo="neste ambiente"
        onDistribuir={(n) => {
          const space = editor.model.spaces.find((s) => s.id === a.id);
          if (!space) return 0;
          const paredes = editor.model.walls.filter((w) => w.levelId === space.levelId);
          return distribuirTomadas(ladosDePiso(space, paredes), n);
        }}
      />
    </>
  );

  /** Espessura e alinhamento só fazem sentido para o que nasce parede. */
  const ehFerramentaDeParede =
    editor.tool === 'parede' || editor.tool === 'parede-curva' || editor.tool === 'retangulo' || editor.tool === 'poligono';

  /** O nome da ferramenta ativa, para a barra de opções — com o subtipo quando há. */
  const rotuloDaFerramentaAtiva =
    editor.tool === 'abertura'
      ? nomeDoTipoDeAbertura(tipoAbertura)
      : editor.tool === 'terminal' && disciplinaDeRede !== 'ELETRICA' && tipoDePontoHidraulico
        ? FICHA_DO_PONTO_HIDRAULICO[tipoDePontoHidraulico].rotulo
        : editor.tool === 'rede' && prumadaDeRede
          ? prumadaDeRede === 'QUEDA' ? 'Tubo de queda' : 'Coluna de ventilação'
      : editor.tool === 'estrutural'
        ? nomeDoTipoEstrutural(tipoEstrutural)
        : editor.tool === 'escada'
          ? tipoCirculacao === 'RAMPA'
            ? 'Rampa'
            : 'Escada'
          : (ROTULO_DA_FERRAMENTA[editor.tool] ?? editor.tool);

  /**
   * O painel do TERRENO — escritura, papel das divisas, recuos, zona,
   * topografia, terraplenagem, emissão. Montado uma vez e usado em dois
   * lugares: como TAREFA "Dados do lote" (aba Terreno do ribbon) e como
   * PROPRIEDADES da divisa selecionada. Era o miolo da seção "Ambientes".
   */
  /**
   * ⚠️ FUNÇÃO, e não constante (P2.64): este painel é montado em DOIS lugares —
   * no dock quando há divisa selecionada e na gaveta "Dados do lote". Só a
   * gaveta recebe o pedido de importação; com o token nos dois, o clique no
   * ribbon abriria DUAS caixas de arquivo.
   */
  const painelDoTerreno = (pedidoDeImportacao?: number) => (
    <PainelTerreno
      terreno={terreno}
      subRegioes={quadroDeSubRegioes(editor.model, terreno?.areaMm2 ?? null, levelId)}
      taxaPermeabilidadeMinPct={zona.taxaPermeabilidadeMin ?? null}
      georreferencia={editor.model.georreferencia ?? null}
      onGeorreferencia={(georreferencia) =>
        editor.run({ type: 'SetGeorreferencia', georreferencia })
      }
      divisaSelecionada={limiteSel}
      onComprimento={esticarDivisa}
      onPapel={(papel) =>
        limiteSel && editor.run({ type: 'SetBoundaryPapel', boundaryId: limiteSel.id, papel })
      }
      onRestricao={(campos) => limiteSel && editor.run({ type: 'SetBoundaryRestricao', boundaryId: limiteSel.id, ...campos })}
      afastamentoProgressivoMm={recuosEfetivosDaZona.afastamentoMm}
      avisosDoLote={avisosDoLote}
      recuos={recuos}
      onRecuo={zona.ajustarRecuo}
      envelope={envelope}
      aproveitamento={aproveitamento}
      envelopeVertical={envelope3d}
      taxaOcupacaoMax={zona.taxaOcupacaoMax}
      coeficienteMax={zona.coeficienteMax}
      onTaxaOcupacaoMax={zona.ajustarTaxaOcupacaoMax}
      onCoeficienteMax={zona.ajustarCoeficienteMax}
      empreendimentos={empreendimentos.map((e) => ({
        id: e.id,
        nome: e.name,
        areaAtualM2: e.terreno_area ?? null,
      }))}
      empreendimentoId={zona.empreendimentoId}
      onEmpreendimento={zona.setEmpreendimentoId}
      onGravarArea={(id) => void gravarAreaNoEmpreendimento(id)}
      gravando={gravandoArea}
      erro={erroArea}
      onAbrirQuadro={() => setQuadroAberto(true)}
      ladosSemPapel={ladosSemPapel}
      ladosDivergentes={ladosDivergentes}
      gabaritoAlturaMaxM={zona.gabaritoAlturaMaxM}
      gabaritoPavimentos={zona.gabaritoPavimentos}
      taxaPermeabilidadeMin={zona.taxaPermeabilidadeMin}
      pavimentosDesenhados={editor.model.levels.length}
      alturaDesenhadaM={alturaDesenhadaM}
      topografiaSlot={
        <PainelTopografia
          topografia={topografia}
          temLoteFechado={anelDoLoteFechado !== null}
          pedidoDeImportacao={pedidoDeImportacao}
          // Só se oferece lançar o lote quando ainda não há um: trocar um
          // contorno existente por outro é destruir divisa desenhada, e isso
          // tem de passar pela ferramenta Terreno, não por um checkbox.
          onLancarLote={anelDoLoteFechado === null ? lancarLoteDoArquivo : undefined}
          temGeorreferencia={!!editor.model.georreferencia}
          cotaDeOrigemInformada={cotaDeOrigemInformada}
          declividade={declividade}
          terraplenagem={{
            base: terraplenagem.base,
            onBase: terraplenagem.setBase,
            temEnvelope: !!envelope?.valido,
            cotaPlatoM: terraplenagem.cotaPlatoM,
            onCotaPlatoM: terraplenagem.setCotaPlatoM,
            cotaDeEquilibrioM,
            resultado: terraplenagemCalc,
            parametros: terraplenagem.parametros,
            onParametros: terraplenagem.setParametros,
            arestasM: arestasDoPlatoM,
            murosDimensionados,
            estrutura: terraplenagem.estrutura,
            onEstrutura: terraplenagem.setEstrutura,
            persistenciaIndisponivel: terraplenagem.persistenciaIndisponivel,
          }}
          curvaSelecionada={curvaSelecionada}
          onLimparCurva={() => setCurvaEmDestaque(null)}
          hipsometria={mostrarHipsometria ? hipsometria : null}
          hipsometriaOpcoes={{
            modo: hipsometriaModo,
            onModo: setHipsometriaModo,
            intervaloM: hipsometriaIntervaloM,
            intervaloEfetivoM: intervaloHipsometricoM,
            onIntervalo: setHipsometriaIntervaloM,
            niveis: niveisDaVersao,
            corDaCota,
            curvasPelaCota,
            onCurvasPelaCota: setCurvasPelaCota,
            casas: casasDaLegenda,
            onCasas: setCasasDaLegenda,
          }}
          perfil={{
            origem: usaLinhaDesenhada ? 'LINHA' : 'CORTE',
            onOrigem: setOrigemDoPerfil,
            linhas: linhasDoPerfil.length,
            linhaIndice: indiceDaLinha,
            onLinha: setLinhaDoPerfilIndice,
            // Traçar é gesto longo no canvas, que o drawer modal cobre: a tarefa
          // fecha e a pessoa volta por Terreno › Dados do lote ao terminar.
          onTracarLinha: () => {
            setTarefa(null);
            editor.setTool('perfil');
          },
            onApagarLinha: () => {
              terraplenagem.removerLinhaDoPerfil(indiceDaLinha);
              if (linhasDoPerfil.length <= 1) setOrigemDoPerfil('CORTE');
              else setLinhaDoPerfilIndice(Math.max(0, indiceDaLinha - 1));
            },
            cortes: (editor.model.sections ?? []).map((c) => ({ id: c.id, rotulo: c.rotulo })),
            corteId: corteDoPerfil?.id ?? '',
            onCorte: setPerfilCorteId,
            pontos: perfilDoTerreno?.pontos ?? null,
            estatisticas: perfilDoTerreno?.estatisticas ?? null,
            svg: perfilDoTerreno
              ? svgDoPerfil(perfilDoTerreno.pontos, perfilDoTerreno.estatisticas, { largura: 280, altura: 150 })
              : null,
            onExportar: exportarPerfil,
          }}
          drenagem={{
            linhas: terraplenagem.drenagem,
            analises: analisesDeDrenagem,
            ativa: drenagemAtiva,
            onAtiva: setDrenagemAtiva,
            onTracar: () => {
            setTarefa(null);
            editor.setTool('drenagem');
          },
            temPlato: !!terraplenagemCalc,
            onGerarDoPlato: gerarCanaletasDoPlato,
            onAlterar: terraplenagem.alterarDrenagem,
            onRemover: (id) => {
              terraplenagem.removerDrenagem(id);
              if (drenagemAtiva === id) setDrenagemAtiva(null);
            },
            caimentoMinPct: terraplenagem.parametros.caimentoMinPct ?? 0.5,
            onCaimentoMin: (v) => terraplenagem.setParametros({ caimentoMinPct: v }),
            dimensionamentos: dimensionamentosDeDrenagem,
            areasSugeridasM2,
            hidraulica: terraplenagem.hidraulica,
            onHidraulica: terraplenagem.setHidraulica,
          }}
          executivo={{
            responsavel: executivo.responsavel,
            onResponsavel: executivo.setResponsavel,
            sondagem: executivo.sondagem,
            onSondagem: executivo.setSondagem,
            resultado: resultadoExecutivo,
            emitidos: executivo.emitidos,
            emissaoValida,
            hashDaBaseAtual: hashDaBaseExecutivaAtual,
            onEmitir: () => void emitirProjetoExecutivo(),
            emitindo: executivo.emitindo,
            erro: executivo.erro,
            onBaixarMemorial: (row) => executivo.baixarMemorial(row, study.name),
            persistenciaIndisponivel: executivo.persistenciaIndisponivel,
          }}
        />
      }
      zonaSlot={
        <PainelZonaUrbanistica
          origemDaZona={zona.origemDaZona}
          onOrigemDaZona={zona.setOrigemDaZona}
          empreendimentos={empreendimentos.map((e) => ({ id: e.id, nome: e.name }))}
          empreendimentoId={zona.empreendimentoId}
          onEmpreendimento={zona.setEmpreendimentoId}
          cidade={zona.cidade}
          onCidade={zona.setCidade}
          mapas={zona.mapas}
          mapaId={zona.mapaId}
          onMapa={zona.setMapaId}
          carregandoMapas={zona.carregandoMapas}
          zonas={zona.zonas}
          carregandoZonas={zona.carregandoZonas}
          zonaAplicadaId={zona.zonaAplicadaId}
          zonaRotuloSalvo={zona.zonaRotuloSalvo}
          ajustadoAMao={zona.ajustadoAMao}
          derivou={zona.derivou}
          onAplicar={zona.aplicarZona}
          onDesligar={zona.desligar}
          salvando={zona.salvando}
          vocabulario={{ testadaMinimaMm: zona.testadaMinimaMm, areaMinimaDoLoteM2: zona.areaMinimaDoLoteM2, vagasPorUnidade: zona.vagasPorUnidade, insolacaoMinimaH: zona.insolacaoMinimaH, afastamentoProgressivo: zona.afastamentoProgressivo, recuoFrenteEscalonado: zona.recuoFrenteEscalonado }}
          onVocabulario={zona.ajustarVocabulario}
        />
      }
    />
  );

  const rotuloSalvamento: Record<string, string> = {
    limpo: 'Sem alterações',
    pendente: 'Alterações não salvas',
    salvando: 'Salvando…',
    salvo: 'Rascunho salvo',
    erro: 'Falha ao salvar',
  };

  /**
   * OS PAINÉIS DA SELEÇÃO — um JSX só, montado em dois lugares: na metade de
   * baixo do painel lateral (seleção pelo desenho) ou num Sheet modal
   * (17/09/2026: *"ao clicar em um componente [na lista] o Propriedades deve
   * abrir em Modal para melhorar a visualização"*). Duas cópias divergiriam no
   * primeiro campo novo; por isso é uma variável, não dois blocos.
   */
  const paineisDaSelecao =
    editor.selectedIds.length > 0 ? (
      <>
      {grupoSel && planoDoGrupoSel ? (
        <PainelGrupoDeFundacao
          grupo={grupoSel}
          plano={planoDoGrupoSel}
          onQuantidade={(n) => redistribuirEstacasDoGrupo({ quantidade: n })}
          onDiametro={(mm) => redistribuirEstacasDoGrupo({ quantidade: Math.max(1, grupoSel.estacas.length), diametroMm: mm })}
          onComprimento={(mm) => redistribuirEstacasDoGrupo({ quantidade: Math.max(1, grupoSel.estacas.length), comprimentoMm: mm })}
          onMover={(dx, dy) => moverSelecao([], [], editor.selectedIds, [], { x: dx, y: dy } as Point)}
          onExcluirGrupo={removerSelecionada}
          onSelecionarPeca={selecionarSoAPeca}
          armadura={{
            bloco: armaduraPorId.get(grupoSel.bloco.id),
            estaca: grupoSel.estacas[0] ? armaduraPorId.get(grupoSel.estacas[0].id) : undefined,
            manualDoBloco: armaduraManualDe(hipotesesDeArmadura, grupoSel.bloco.uid),
            manualDasEstacas: grupoSel.estacas[0] ? armaduraManualDe(hipotesesDeArmadura, grupoSel.estacas[0].uid) : null,
            onManualDoBloco: (spec) => gravarArmaduraManual([grupoSel.bloco.uid], spec),
            onManualDasEstacas: (spec) =>
              gravarArmaduraManual(
                grupoSel.estacas.map((e) => e.uid),
                spec,
              ),
          }}
        />
      ) : editor.selectedIds.length > 1 ? (
        <PainelSelecaoMultipla
          paredes={paredesSelecionadas}
          limites={limitesSelecionados.length}
          aberturas={aberturasSelecionadas.length}
          medicoes={medicoesSelecionadas}
          modo={modoJuncao}
          onMover={(dx, dy) => {
            const aguasSelecionadas = (editor.model.roofs ?? []).filter((r) =>
              editor.selectedIds.includes(r.id),
            );
            if (
              paredesSelecionadas.length > 0 ||
              limitesSelecionados.length > 0 ||
              estruturasSelecionadas.length > 0 ||
              aguasSelecionadas.length > 0
            ) {
              moverSelecao(
                paredesSelecionadas.map((w) => w.id),
                limitesSelecionados.map((b) => b.id),
                estruturasSelecionadas.map((s) => s.id),
                aguasSelecionadas.map((r) => r.id),
                { x: dx, y: dy } as Point,
              );
            }
            if (medicoesSelecionadas.length > 0) {
              moverMedicoes(medicoesSelecionadas.map((f) => f.id), {
                x: dx,
                y: dy,
              } as Point);
            }
          }}
          onExcluir={removerSelecionada}
        />
      ) : null}

      <PainelQuadroSelecionado
        quadro={quadroSel}
        onQuadro={(campos) =>
          quadroSel &&
          editor.run({ type: 'SetQuadroProps', quadroId: quadroSel.id, ...campos })
        }
      />

      <PainelTrechoSelecionado
        trecho={trechoSel}
        terminal={terminalSel}
        circuitos={circuitosParaEscolher}
        ocupacao={
          trechoSel && trechoSel.disciplina === 'ELETRICA'
            ? ocupacaoDoTrecho(editor.model, trechoSel, hipotesesEletricas)
            : undefined
        }
        onTrecho={(campos) =>
          trechoSel &&
          editor.run({ type: 'SetTrechoProps', trechoId: trechoSel.id, ...campos })
        }
        onExcluir={removerSelecionada}
        onAplicarTipoDoTerminal={(p) => {
          if (!terminalSel) return;
          if (p.disciplina !== terminalSel.disciplina) {
            setAvisoColar(`Este tipo é de ${ROTULO_DA_DISCIPLINA[p.disciplina].toLowerCase()}; o ponto selecionado é de ${ROTULO_DA_DISCIPLINA[terminalSel.disciplina].toLowerCase()}.`);
            return;
          }
          editor.run({ type: 'SetTerminalProps', terminalId: terminalSel.id, ...camposDoTerminal(p) });
        }}
        comAMesmaAssinatura={
          terminalSel
            ? (editor.model.terminais ?? []).filter((t) => assinaturaDoTipo(propriedadesDoTerminal(t)) === assinaturaDoTipo(propriedadesDoTerminal(terminalSel))).length
            : undefined
        }
        onTerminal={(campos) => {
          if (!terminalSel) return;
          // CLASSIFICAR um ponto que ainda não tem potência é uma
          // forma de incluí-lo: a potência da norma vem junto do
          // tipo, e o projetista troca se quiser.
          const padrao =
            campos.tipoEletrico && campos.potenciaW === undefined && terminalSel.potenciaW == null
              ? potenciaPadraoVA(
                  campos.tipoEletrico,
                  contextoDoAmbiente(editor.model, terminalSel.levelId, terminalSel.at),
                  conjuntoMolhadoPassaDeSeis(editor.model, terminalSel.levelId),
                )
              : null;
          editor.run({
            type: 'SetTerminalProps',
            terminalId: terminalSel.id,
            ...campos,
            ...(padrao != null ? { potenciaW: padrao } : {}),
          });
        }}
      />

      <PainelEstruturaSelecionada
        custo={estruturaSel ? custoPorUid.get(estruturaSel.uid) : undefined}
        custoDesatualizado={editor.dirtySincePublish}
        estrutura={grupoSel ? null : estruturaSel}
        armadura={estruturaSel ? armaduraPorId.get(estruturaSel.id) : undefined}
        armaduraManual={estruturaSel ? armaduraManualDe(hipotesesDeArmadura, estruturaSel.uid) : null}
        onArmaduraManual={(spec) => estruturaSel && gravarArmaduraManual([estruturaSel.uid], spec)}
        grupo={
          estruturaSel && !grupoSel
            ? (() => {
                const g = grupoDeFundacao(editor.model, estruturaSel.id);
                return g
                  ? {
                      rotuloDoBloco: g.bloco.rotulo?.trim() || 'Bloco',
                      estacas: g.estacas.length,
                      onEditarGrupo: () => selecionar([g.bloco.id]),
                    }
                  : undefined;
              })()
            : undefined
        }
        onMedidas={(campos) =>
          estruturaSel &&
          editor.run({
            type: 'SetStructuralProps',
            structuralId: estruturaSel.id,
            ...campos,
          })
        }
        onTipo={(kind) =>
          estruturaSel &&
          editor.run({
            type: 'SetStructuralKind',
            structuralId: estruturaSel.id,
            kind,
          })
        }
        // TIPO × INSTÂNCIA (E1.1): um lote — troca de família (se a forma
        // permitir) e medidas — um passo de desfazer.
        onAplicarTipo={(p) => {
          if (!estruturaSel) return;
          editor.runBatch([
            ...(p.kind !== estruturaSel.kind ? [{ type: 'SetStructuralKind' as const, structuralId: estruturaSel.id, kind: p.kind }] : []),
            { type: 'SetStructuralProps', structuralId: estruturaSel.id, ...camposDaEstrutura(p) },
          ]);
        }}
        comAMesmaAssinatura={
          estruturaSel
            ? editor.model.structures.filter((s) => assinaturaDoTipo(propriedadesDaEstrutura(s)) === assinaturaDoTipo(propriedadesDaEstrutura(estruturaSel))).length
            : undefined
        }
        onExcluir={removerSelecionada}
        sobreposicaoM3={sobreposicaoDoSelecionado}
        onCedeSobreposicao={(cede) =>
          estruturaSel &&
          editor.run({ type: 'SetCedeSobreposicao', id: estruturaSel.id, cede })
        }
        paredesParaCortar={paredesQueAPecaAtravessa.aCortar.length}
        paredesJaInterrompidas={paredesQueAPecaAtravessa.jaInterrompidas}
        onCortarParedes={cortarParedesDaSelecionada}
        pontasCurtas={pontasCurtasDaSelecionada.length}
        onEmendarPontas={emendarPontasDaSelecionada}
      />

      <PainelEscadaSelecionada
        model={editor.model}
        escada={escadaSel}
        onProps={(campos) =>
          escadaSel &&
          editor.run({ type: 'SetEscadaProps', escadaId: escadaSel.id, ...campos })
        }
        onExcluir={removerSelecionada}
        onAplicarTipo={(p) => escadaSel && editor.run({ type: 'SetEscadaProps', escadaId: escadaSel.id, ...camposDaEscada(p) })}
        comAMesmaAssinatura={escadaSel ? (editor.model.stairs ?? []).filter((e) => assinaturaDoTipo(propriedadesDaEscada(e)) === assinaturaDoTipo(propriedadesDaEscada(escadaSel))).length : undefined}
      />

      <PainelSubRegiaoSelecionada
        subRegiao={subRegiaoSel}
        onProps={(campos) => subRegiaoSel && editor.run({ type: 'SetSubRegiaoProps', subRegiaoId: subRegiaoSel.id, ...campos })}
        onExcluir={removerSelecionada}
      />

      <PainelNucleoSelecionado
        model={editor.model}
        nucleo={nucleoSel}
        onProps={(campos) => nucleoSel && editor.run({ type: 'SetNucleoProps', nucleoId: nucleoSel.id, ...campos })}
        onExcluir={removerSelecionada}
      />

      <PainelVagaSelecionada
        vaga={vagaSel}
        onProps={(campos) => vagaSel && editor.run({ type: 'SetVagaProps', vagaId: vagaSel.id, ...campos })}
        onExcluir={removerSelecionada}
      />

      <PainelComponenteSelecionado
        componente={componenteSel}
        pontoLigado={componenteSel ? pontoHidraulicoDoComponente(editor.model, componenteSel) : null}
        onProps={(campos) => componenteSel && editor.run({ type: 'SetComponenteProps', componenteId: componenteSel.id, ...campos })}
        onExcluir={removerSelecionada}
        onSelecionarPonto={(id) => selecionarEAbrir([id])}
        conjunto={
          componenteSel
            ? ehConjunto(componenteSel.tipoId)
              ? { papel: 'PAI', pecas: filhosDoConjunto(editor.model, componenteSel).length, nome: null, onSelecionar: () => editor.setSelectedIds(filhosDoConjunto(editor.model, componenteSel).map((f) => f.id)) }
              : paiDoComponente(editor.model, componenteSel)
                ? { papel: 'FILHO', pecas: filhosDoConjunto(editor.model, paiDoComponente(editor.model, componenteSel)!).length, nome: paiDoComponente(editor.model, componenteSel)!.rotulo || CATALOGO_DE_COMPONENTES[paiDoComponente(editor.model, componenteSel)!.tipoId].rotulo, onSelecionar: () => selecionar([paiDoComponente(editor.model, componenteSel)!.id]) }
                : null
            : null
        }
        seletorDeTipo={
          componenteSel ? (
            <SeletorDeTipo
              familia="COMPONENTE"
              atual={propriedadesDoComponente(componenteSel)}
              onAplicar={(p) => editor.run({ type: 'SetComponenteProps', componenteId: componenteSel.id, ...camposDoComponente(p as PropriedadesDeComponente) })}
              comAMesmaAssinatura={(editor.model.componentes ?? []).filter((c) => c.tipoId === componenteSel.tipoId && c.larguraMm === componenteSel.larguraMm && c.profundidadeMm === componenteSel.profundidadeMm && c.alturaMm === componenteSel.alturaMm).length}
            />
          ) : null
        }
      />

      <PainelAnotacaoSelecionada
        anotacao={anotacaoSel}
        onProps={(campos) => anotacaoSel && editor.run({ type: 'SetAnotacaoProps', anotacaoId: anotacaoSel.id, ...campos })}
        onExcluir={removerSelecionada}
      />
      <PainelRodapeSelecionado
        rodape={rodapeSel}
        onProps={(campos) => rodapeSel && editor.run({ type: 'SetRodapeProps', rodapeId: rodapeSel.id, ...campos })}
        onExcluir={removerSelecionada}
        materiais={biblioteca.materiais}
      />

      <PainelGuardaCorpoSelecionado
        guardaCorpo={guardaCorpoSel}
        onProps={(campos) => guardaCorpoSel && editor.run({ type: 'SetGuardaCorpoProps', guardaCorpoId: guardaCorpoSel.id, ...campos })}
        onExcluir={removerSelecionada}
        materiais={biblioteca.materiais}
      />

      <PainelEixoSelecionado
        eixo={eixoSel}
        onProps={(campos) => eixoSel && editor.run({ type: 'SetEixoProps', eixoId: eixoSel.id, ...campos })}
        onExcluir={removerSelecionada}
        cruzamentos={eixoSel ? cruzamentosDeEixos(editor.model).filter((p) => distanciaPontoSegmento(p, eixoSel.a, eixoSel.b) <= 1).length : undefined}
      />

      <PainelCorteSelecionado
        corte={corteSel}
        onProps={(campos) =>
          corteSel &&
          editor.run({ type: 'SetCorteProps', corteId: corteSel.id, ...campos })
        }
        onVer={() => corteSel && setVista(`corte:${corteSel.id}`)}
        onExcluir={removerSelecionada}
      />

      <PainelAguaSelecionada
        agua={aguaSel}
        onProps={(campos) =>
          aguaSel && editor.run({ type: 'SetAguaProps', aguaId: aguaSel.id, ...campos })
        }
        onExcluir={removerSelecionada}
        onAplicarTipo={(p) => aguaSel && editor.run({ type: 'SetAguaProps', aguaId: aguaSel.id, ...camposDoTelhado(p) })}
        comAMesmaAssinatura={aguaSel ? (editor.model.roofs ?? []).filter((r) => assinaturaDoTipo(propriedadesDoTelhado(r)) === assinaturaDoTipo(propriedadesDoTelhado(aguaSel))).length : undefined}
        extrusao={aguaSel?.extrusao ? { aguas: aguasDaMesmaExtrusao(editor.model.roofs ?? [], aguaSel).length } : null}
        onSelecionarCobertura={() => aguaSel && editor.setSelectedIds(aguasDaMesmaExtrusao(editor.model.roofs ?? [], aguaSel).map((r) => r.id))}
      />

      <PainelParedeSelecionada
        custo={
          // A abertura tem uid próprio e pode ter linha própria
          // (esquadria por elemento); a parede é o caso comum.
          custoPorUid.get((paredeSel ?? aberturaSel)?.uid ?? '')
        }
        custoDesatualizado={editor.dirtySincePublish}
        parede={paredeSel}
        arco={paredeSel?.arco ? { raioMm: paredeSel.arco.raioMm, facetas: segmentosDoMesmoArco(editor.model.walls, paredeSel).length } : null}
        onSelecionarArco={() => paredeSel && editor.setSelectedIds(segmentosDoMesmoArco(editor.model.walls, paredeSel).map((w) => w.id))}
        onCortina={(cortina) => paredeSel && editor.run({ type: 'SetWallCortina', wallId: paredeSel.id, cortina })}
        onBrise={(brise) => paredeSel && editor.run({ type: 'SetWallBrise', wallId: paredeSel.id, brise })}
        abertura={aberturaSel}
        pontaQueAnda={esticamento.pontaQueAnda}
        arrastaCanto={esticamento.arrastaCanto}
        aLivre={esticamento.aLivre}
        bLivre={esticamento.bLivre}
        onEscolherPonta={(end) =>
          paredeSel && setAncoraManual({ wallId: paredeSel.id, end })
        }
        onDestacarPonta={setPontaDestacada}
        onComprimento={esticarParede}
        onEspessura={(mm) => paredeSel && mudarEspessura(paredeSel, mm)}
        // As camadas MEDIDAS saem do quantitativo que já roda ao
        // vivo aqui. Refazer a conta dentro do painel seria uma
        // segunda fórmula de área de face — e a primeira a
        // divergir no dia em que o desconto de vão mudar.
        camadasSlot={
          paredeSel ? (
            <PainelCamadasParede
              parede={paredeSel}
              medidas={
                quant.paredes.find((p) => p.wallId === paredeSel.id)
                  ?.camadas ?? []
              }
              aoMudar={(camadas) => mudarCamadas(paredeSel, camadas)}
              materiais={biblioteca.materiais}
            />
          ) : null
        }
        podeUnir={!!vizinhaParaUnir}
        // ESTENDER ATÉ A FACE (P2.58): achar a face exige percorrer o contorno de
        // todas as paredes e estruturas do pavimento — conta que só quem tem o
        // modelo pode fazer. Só roda com uma parede selecionada.
        extensoes={extensoesDaParedeSelecionada}
        onEstender={(end, ateOEixo) => {
          const e = extensoesDaParedeSelecionada.find((x) => x.end === end);
          if (!e) return;
          try {
            editor.run(comandoDeEstender(e, ateOEixo));
          } catch (err) {
            setAvisoConexaoT(err instanceof Error ? `O desenho recusou: ${err.message}` : 'O desenho recusou a extensão.');
          }
        }}
        // O comprimento LIVRE depende da espessura das VIZINHAS, então sai
        // daqui, que conhece o nível inteiro — o painel só vê a selecionada.
        livreMm={
          paredeSel
            ? faceInternaMm(
                editor.model.walls.filter((w) => w.levelId === paredeSel.levelId),
                paredeSel,
              )
            : null
        }
        onDividir={dividirSelecionada}
        onUnir={unirSelecionada}
        onFlipAbertura={flipAbertura}
        onTamanhoAbertura={redimensionarAbertura}
        onTipoAbertura={(kind, embutida) => {
          if (!aberturaSel) return;
          editor.run({
            type: 'SetOpeningKind',
            openingId: aberturaSel.id,
            kind,
            embutida,
          });
        }}
        tomadasSlot={
          paredeSel && levelId ? (
            <TomadasNaParede
              lados={ladosDaParede(editor.model, paredeSel.id, levelId)}
              onDistribuir={distribuirTomadas}
            />
          ) : null
        }
        sobreposicaoM3={sobreposicaoDoSelecionado}
        onCedeSobreposicao={(cede) =>
          paredeSel &&
          editor.run({ type: 'SetCedeSobreposicao', id: paredeSel.id, cede })
        }
        esquadriaSlot={
          aberturaSel ? (
            <PainelEsquadria
              abertura={aberturaSel}
              onEsquadria={(esquadria) =>
                editor.run({
                  type: 'SetOpeningEsquadria',
                  openingId: aberturaSel.id,
                  esquadria,
                })
              }
              onAplicarTipo={(tipo) => aplicarTipoDeEsquadria(aberturaSel, tipo)}
            />
          ) : null
        }
      />

      {/* PARÂMETROS PERSONALIZADOS (E1.2): abaixo do painel da família, para
          qualquer peça que os carregue. Um comando por campo. */}
      {pecaComParametros && (
        <PainelParametros
          familia={pecaComParametros.familia}
          pecaId={pecaComParametros.id}
          parametros={pecaComParametros.parametros}
          onSet={(valores) => editor.run({ type: 'SetParametros', familia: pecaComParametros.familia, id: pecaComParametros.id, valores })}
          variaveis={variaveisDaSelecao}
          definicoes={definicoesDeParametro}
          onDefinicoesMudaram={recarregarDefinicoes}
        />
      )}

      {/* A FICHA (E1.5): tudo o que o desenho sabe da peça, numa ordem só,
          copiável. Depois dos painéis de edição — primeiro se edita, depois se lê. */}
      {pecaComParametros && (
        <FichaDoElemento
          ficha={fichaDoElemento(editor.model, pecaComParametros.id, {
            definicoes: definicoesDeParametro,
            conferencias: conferenciaDeRestricoes,
            custo: custoPorUid.get(
              (editor.model.walls.find((w) => w.id === pecaComParametros.id) ??
                editor.model.openings.find((o) => o.id === pecaComParametros.id) ??
                (editor.model.structures ?? []).find((s) => s.id === pecaComParametros.id))?.uid ?? '',
            ),
          })}
        />
      )}

      {/* RESTRIÇÕES da peça (E1.4b): parede e estrutura declaram intenção aqui;
          a conferência e o Ajustar vivem na mesma lista. */}
      {(paredeSel || estruturaSel) && (
        <PainelRestricoes
          model={editor.model}
          conferencias={conferenciaDeRestricoes}
          onComando={(c) => editor.run(c)}
          onSelecionar={(id) => id && selecionar([id])}
          peca={
            paredeSel
              ? { familia: 'wall', id: paredeSel.id, uid: paredeSel.uid, ehLinear: true }
              : { familia: 'structural', id: estruturaSel!.id, uid: estruturaSel!.uid, ehLinear: estruturaSel!.pontos.length === 2 }
          }
        />
      )}

      {/* A DIVISA selecionada se edita no painel do terreno (comprimento,
          papel na escritura) — o mesmo que a tarefa "Dados do lote" abre. */}
      {limiteSel && painelDoTerreno()}
      </>
    ) : null;

  const cabecalhoDaTela = (titulo: string, subtitulo: string, Icone: React.ElementType, secao = 'Elétrica') => (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => setTelaAberta(null)}
        className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group"
        title="Voltar ao editor"
        aria-label="Voltar ao editor"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
      </button>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-blue-600">{study.name}</span>
          <span className="w-1 h-1 bg-gray-300 rounded-full" />
          <span className="text-xs font-medium text-gray-400">Planta Inteligente · {secao}</span>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-gray-900 tracking-tight">
          <Icone className="h-6 w-6 text-blue-700" />
          {titulo}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{subtitulo}</p>
      </div>
    </div>
  );

  /**
   * ─── OS GRUPOS DO ACESSO RÁPIDO (17/09/2026) ─────────────────────────────
   *
   * Cada família de botões é um grupo com alça; o usuário arrasta os grupos
   * para a ordem que preferir (`AcessoRapido`), e a ordem fica no navegador.
   * Grupo que a vista não admite não entra na lista — Selecionar/Mover, zoom,
   * modos, duplicar/espelhar, isolar/medir só existem na planta baixa ("nada
   * de desenhar fora da planta"); as vistas, desfazer/refazer e tela cheia
   * valem em qualquer lugar. Cada comentário de "por que este botão existe"
   * ficou junto do botão.
   */
  const gruposDoAcessoRapido: GrupoDoAcessoRapido[] = [
    ...(!emVista
      ? [
          {
            id: 'ferramenta',
            rotulo: 'Ferramenta',
            botoes: (
              <>
                {/* Selecionar volta à seta; Mover é a mão do CAD (o botão esquerdo
                    faz a panorâmica que o direito já faz em qualquer ferramenta). */}
                <BotaoBarra
                  icone={MousePointer2}
                  rotulo="Ferramenta: Selecionar"
                  onClick={() => editor.setTool('selecionar')}
                  ativo={editor.tool === 'selecionar'}
                />
                <BotaoBarra
                  icone={Hand}
                  rotulo="Ferramenta: Mover a vista — arraste com o botão esquerdo (o direito arrasta em qualquer ferramenta)"
                  onClick={() => editor.setTool('mover')}
                  ativo={editor.tool === 'mover'}
                />
              </>
            ),
          },
        ]
      : []),
    {
      id: 'vistas',
      rotulo: 'Vistas',
      botoes: (
        <>
          {/* As SEIS vistas em ícone (VISTAS_FIXAS, a mesma lista do seletor à
              esquerda — que continua, porque nomeia a vista atual e lista os cortes). */}
          {VISTAS_FIXAS.map((v) => (
            <BotaoBarra key={v.id} icone={v.icone} rotulo={`Vista: ${v.rotulo}`} onClick={() => setVista(v.id)} ativo={vista === v.id} />
          ))}
        </>
      ),
    },
    ...(!emVista || vistaEhProjecao
      ? [
          {
            id: 'zoom',
            rotulo: 'Zoom',
            botoes: (
              <>
                {/* Enquadrar vale na planta e nas elevações/cortes (o token do grupo
                    Navegar); zoom ± pelo centro e 1:100 só existem na planta baixa. */}
                <BotaoBarra
                  icone={Scan}
                  rotulo="Enquadrar — o desenho inteiro na tela"
                  onClick={() => (emVista ? setEnquadrarVistaToken((t) => t + 1) : navegar('ENQUADRAR'))}
                />
                {!emVista && (
                  <>
                    <BotaoBarra icone={ZoomOut} rotulo="Afastar (zoom −)" onClick={() => navegar('ZOOM_MENOS')} />
                    <BotaoBarra icone={ZoomIn} rotulo="Aproximar (zoom +)" onClick={() => navegar('ZOOM_MAIS')} />
                    <BotaoBarra
                      texto="1:100"
                      rotulo="Escala 1:100 na tela — 1 m do desenho = 1 cm no monitor"
                      onClick={() => navegar('ESCALA_1_100')}
                    />
                  </>
                )}
              </>
            ),
          },
        ]
      : []),
    ...(!emVista
      ? [
          {
            id: 'modos',
            rotulo: 'Modos',
            botoes: (
              <>
                {/* MODOS globais: a trava ortogonal (F8; o mesmo estado do Orto da barra
                    de opções) e o ímã dos encaixes (liga/desliga TODOS; a escolha fina
                    continua no menu Encaixe). */}
                <BotaoBarra
                  icone={Grid3x3}
                  rotulo={ortogonal ? 'Trava 90° ligada — Shift libera (F8 alterna)' : 'Trava 90° desligada — Shift trava (F8 alterna)'}
                  onClick={() => setOrtogonal((v) => !v)}
                  ativo={ortogonal}
                />
                <BotaoBarra
                  icone={Magnet}
                  rotulo={encaixesAtivos.size > 0 ? 'Encaixe ligado — desliga todos os ímãs' : 'Encaixe desligado — liga todos os ímãs'}
                  onClick={() => setEncaixesLigados(encaixesAtivos.size > 0 ? [] : [...TIPOS_DE_ENCAIXE])}
                  ativo={encaixesAtivos.size > 0}
                />
              </>
            ),
          },
        ]
      : []),
    {
      id: 'editar',
      rotulo: 'Editar',
      botoes: (
        <>
          <BotaoBarra icone={Undo2} rotulo={desfazerBloqueado ? 'Desfazer — desligado enquanto há outra pessoa neste ramo' : 'Desfazer (Ctrl+Z)'} onClick={editor.undo} disabled={!editor.canUndo || desfazerBloqueado} />
          <BotaoBarra icone={Redo2} rotulo={desfazerBloqueado ? 'Refazer — desligado enquanto há outra pessoa neste ramo' : 'Refazer (Ctrl+Shift+Z)'} onClick={editor.redo} disabled={!editor.canRedo || desfazerBloqueado} />
          {/* COPIAR / COLAR ficam com desfazer/refazer porque são da mesma família —
              editam o desenho sem desenhar nada. Colar acontece SOB O CURSOR (Ctrl+V);
              o botão anuncia o recurso e instrui, em vez de colar num lugar arbitrário. */}
          <BotaoBarra icone={Copy} rotulo="Copiar seleção (Ctrl+C)" onClick={copiar} disabled={editor.selectedIds.length === 0} />
          <BotaoBarra
            icone={ClipboardPaste}
            rotulo={
              areaDeTransferencia
                ? 'Colar no cursor (Ctrl+V) — mova o mouse sobre a planta e use o atalho'
                : 'Colar (Ctrl+V) — nada copiado'
            }
            onClick={() => {
              setAvisoColar('Passe o cursor sobre a planta e pressione Ctrl+V — a cópia cai ali.');
            }}
            disabled={!areaDeTransferencia}
          />
          {/* Excluir é ação de linha no vocabulário do ActionIconButton, então usa
              o componente padrão. Desfazer/refazer não estão na taxonomia dele. */}
          <ActionIconButton kind="delete" title="Excluir parede selecionada (Delete)" onClick={removerSelecionada} disabled={!editor.selectedId} />
        </>
      ),
    },
    ...(!emVista
      ? [
          {
            id: 'selecao',
            rotulo: 'Seleção',
            botoes: (
              <>
                {/* DUPLICAR cai ao lado, sem depender do cursor — é a diferença para
                    Colar. ESPELHAR vira a seleção em torno do próprio centro. */}
                <BotaoBarra icone={CopyPlus} rotulo="Duplicar seleção ao lado (Ctrl+D)" onClick={duplicar} disabled={editor.selectedIds.length === 0} />
                <BotaoBarra
                  icone={FlipHorizontal2}
                  rotulo="Espelho horizontal — esquerda ↔ direita"
                  onClick={() => espelhar('VERTICAL')}
                  disabled={editor.selectedIds.length === 0}
                />
                <BotaoBarra
                  icone={FlipVertical2}
                  rotulo="Espelho vertical — frente ↔ fundos"
                  onClick={() => espelhar('HORIZONTAL')}
                  disabled={editor.selectedIds.length === 0}
                />
                {/* GIRAR em passos de 90° em torno do centro da seleção — exato no
                    kernel. ALINHAR leva as peças à reta da última parede selecionada.
                    MATRIZ abre a gaveta com quantidade e passo. */}
                <BotaoBarra
                  icone={RotateCcw}
                  rotulo="Rotacionar 90° à esquerda (anti-horário)"
                  onClick={() => girar(90)}
                  disabled={editor.selectedIds.length === 0}
                />
                <BotaoBarra
                  icone={RotateCw}
                  rotulo="Rotacionar 90° à direita (horário)"
                  onClick={() => girar(-90)}
                  disabled={editor.selectedIds.length === 0}
                />
                <BotaoBarra
                  icone={AlignStartVertical}
                  rotulo="Alinhar à referência — a última parede selecionada"
                  onClick={alinhar}
                  disabled={editor.selectedIds.length < 2}
                />
                {/* ESTENDER ATÉ A FACE (P2.59). O usuário perguntou onde estava a
                    ferramenta: ela nascera no rodapé do painel da parede, abaixo da
                    dobra. Aqui ela fica à vista, no grupo de quem edita o que já
                    está desenhado — e o título diz quanto vai andar antes do clique. */}
                <BotaoBarra
                  icone={MoveRight}
                  rotulo={
                    extensoesDaParedeSelecionada.length === 0
                      ? 'Estender até a face — selecione uma parede que tenha parede ou pilar à frente (até 3 m)'
                      : `Estender até a face: ${extensoesDaParedeSelecionada
                          .map((e) => `${e.end === 'a' ? 'início' : 'fim'} ${e.distanciaMm} mm`)
                          .join(' e ')}`
                  }
                  onClick={estenderSelecionadaAteAFace}
                  disabled={extensoesDaParedeSelecionada.length === 0}
                />
                <BotaoBarra
                  icone={LayoutGrid}
                  rotulo="Matriz — repetir a seleção N vezes a um passo"
                  onClick={() => alternarTarefa('matriz')}
                  ativo={tarefaAberta === 'matriz'}
                  disabled={editor.selectedIds.length === 0 && tarefaAberta !== 'matriz'}
                />
                <BotaoBarra
                  icone={Boxes}
                  rotulo="Grupo com origem — agrupar a seleção e instanciar espelhado, girado ou deslocado"
                  onClick={() => alternarTarefa('grupo')}
                  ativo={tarefaAberta === 'grupo'}
                />
              </>
            ),
          },
          {
            id: 'exibir',
            rotulo: 'Isolar e medir',
            botoes: (
              <>
                {/* ISOLAR esconde tudo menos a seleção (o `ocultosNoDesenho` do olho da
                    lista); vira "Reexibir tudo" enquanto há algo escondido. MEDIR é a
                    régua de Analisar, à mão sem trocar de aba. */}
                <BotaoBarra
                  icone={isolado ? Eye : EyeOff}
                  rotulo={isolado ? 'Reexibir tudo — desfaz o isolar/ocultar' : 'Isolar seleção — esconde o resto do pavimento'}
                  onClick={isolarOuMostrarTudo}
                  disabled={!isolado && editor.selectedIds.length === 0}
                  ativo={isolado}
                />
                <BotaoBarra icone={Ruler} rotulo="Medir linha — dois cliques na planta" onClick={() => editor.setTool('medir-linha')} ativo={editor.tool === 'medir-linha'} />
              </>
            ),
          },
        ]
      : []),
    {
      id: 'saida',
      rotulo: 'Arquivo',
      botoes: (
        <>
          {/* EXPORTAR abre Versões com a vista atual marcada — a exportação continua
              saindo da versão publicada. TELA CHEIA fica no acesso rápido porque é o
              único botão que precisa estar à vista em qualquer aba para SAIR do modo. */}
          {vista !== '3d' && (
            <BotaoBarra
              icone={FileDown}
              rotulo="Exportar a vista atual (PDF/DXF) — abre Versões com esta prancha marcada"
              onClick={exportarAVistaAtual}
              ativo={relatorioAberto === 'versoes'}
            />
          )}
          <BotaoBarra icone={telaCheia ? Minimize2 : Maximize2} rotulo={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'} onClick={alternarTelaCheia} ativo={telaCheia} />
        </>
      ),
    },
  ];

  return (
    <>
      {telaAberta === 'quadro-de-cargas' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="quadro-de-cargas">
        {/* Sem padding nem largura máxima próprios: o gutter (p-4 md:p-6) é do
            <main> do Layout — §20.2 do guia. A raiz da tela é `space-y-6 pb-20`,
            como as demais telas do app. */}
          {cabecalhoDaTela(
            RELATORIOS_DO_DOCK['quadro-de-cargas'].rotulo,
            `${(editor.model.circuitos ?? []).length} circuito(s) · pré-dimensionamento com hipóteses declaradas e conferência da NBR 5410. Cada campo grava na hora; Ctrl+Z desfaz no editor. A emissão com ART fica em "Projeto executivo (ART)".`,
            Zap,
          )}
          {/* Sem cartão em volta: o painel é TabsBar + StandardTable, cada um
              com o próprio cartão (§19.1 / §5.2) — como as telas de RH. */}
          <div>
              <PainelEletrica
                model={editor.model}
                onAddCircuito={(quadroId, nome) => editor.run({ type: 'AddCircuito', quadroId, nome })}
                onCircuitoProps={(circuitoId, campos) =>
                  editor.run({ type: 'SetCircuitoProps', circuitoId, ...campos })
                }
                onSelecionar={(id) => {
            selecionar([id]);
            setTelaAberta(null);
          }}
                onLigarAoCircuito={(terminalId, circuitoId) =>
                  editor.run({ type: 'SetTerminalProps', terminalId, circuitoId })
                }
                // Excluir circuito: com pontos ou eletrodutos ligados, confirma antes —
                // eles ficam sem circuito e voltam para a lista de pendências.
                onExcluirCircuito={async (circuitoId) => {
                  const c = (editor.model.circuitos ?? []).find((x) => x.id === circuitoId);
                  if (!c) return;
                  const pontos = (editor.model.terminais ?? []).filter((t) => t.circuitoId === circuitoId).length;
                  const trechos = (editor.model.trechos ?? []).filter((t) => (t.circuitoIds ?? []).includes(circuitoId)).length;
                  if (pontos > 0 || trechos > 0) {
                    const partes = [
                      pontos > 0 ? `${pontos} ${pontos === 1 ? 'ponto' : 'pontos'}` : null,
                      trechos > 0 ? `${trechos} ${trechos === 1 ? 'eletroduto' : 'eletrodutos'}` : null,
                    ].filter(Boolean);
                    const ok = await confirmar({
                      title: `Excluir o circuito ${c.nome}?`,
                      message: `${partes.join(' e ')} ligados a ele ficam sem circuito — nada é apagado do desenho. Ctrl+Z desfaz.`,
                      confirmLabel: 'Excluir circuito',
                      variant: 'warning',
                    });
                    if (!ok) return;
                  }
                  editor.run({ type: 'DeleteCircuito', circuitoId });
                }}
                // "Criar novo…" no seletor: o circuito nasce e os pontos entram nele.
                // Dois passos de histórico (o id do circuito só existe depois do
                // primeiro) — Ctrl+Z duas vezes desfaz tudo.
                onCriarCircuitoELigar={(quadroId, nome, terminalIds) => {
                  const [circuitoId] = editor.run({ type: 'AddCircuito', quadroId, nome });
                  if (!circuitoId) return;
                  editor.runBatch(
                    terminalIds.map((terminalId) => ({ type: 'SetTerminalProps' as const, terminalId, circuitoId })),
                  );
                }}
                onAceitarSugeridas={aceitarSugeridas}
                // O legado: pontos sem potência recebem o padrão da norma, num lote (Ctrl+Z desfaz).
                // Todos os pavimentos (`null`): o botão mostra a conta do modelo inteiro.
                onPreencherPotencias={() => {
                  const cmds = comandosDePotenciaPadrao(editor.model, null);
                  if (cmds.length > 0) editor.runBatch(cmds);
                }}
                hipoteses={hipotesesEletricas}
                onHipoteses={setHipotesesEletricas}
                onQuadroProps={(quadroId, campos) => editor.run({ type: 'SetQuadroProps', quadroId, ...campos })}
                // A CONFERÊNCIA da norma vive junto do quadro de cargas (aba
                // própria): é a mesma leitura — o que foi declarado — vista pelas
                // regras da NBR 5410, e o usuário pediu tudo de elétrica num só lugar.
                conferenciaPendencias={{ faltas: conferenciaNbr.faltas, avisos: conferenciaNbr.avisos }}
                conferenciaSlot={
                  <PainelConferenciaNbr
                    conferencia={conferenciaNbr}
                    onSelecionar={(ids) => {
                      selecionar(ids);
                      setTelaAberta(null);
                    }}
                    onConverterLigacaoDireta={(ids) =>
                      editor.runBatch(
                        ids.map((terminalId) => ({
                          type: 'SetTerminalProps' as const,
                          terminalId,
                          tipoEletrico: 'LIGACAO_DIRETA' as const,
                        })),
                      )
                    }
                  />
                }
              />
          </div>
        </div>
      )}
      {telaAberta === 'quantitativos' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="quantitativos">
          {cabecalhoDaTela(
            'Quantitativos',
            'Áreas, volumes e comprimentos derivados do desenho atual — e o quantitativo oficial da versão publicada, que é o que o orçamento cita. Clique numa peça estrutural para selecioná-la no desenho.',
            Table2,
            'Analisar',
          )}
          <div>
            <TelaQuantitativos
              model={editor.model}
              quant={quant}
              armadura={armadura}
              porCodigoDeMaterial={biblioteca.porCodigo}
              revisao={editor.baseRevision}
              oficial={qtdOficial}
              gerando={gerando}
              onGerar={gerarQuantitativoOficial}
              dirty={editor.dirtySincePublish}
              onSelecionarPeca={(id) => {
                // Como o clique na lista e no desenho: seleciona E abre as propriedades.
                selecionarEAbrir([id]);
                setTelaAberta(null);
              }}
              avaliacao={avaliacao}
              onAbrirAvaliacao={() => setTelaAberta('avaliacao')}
            />
          </div>
        </div>
      )}
      {telaAberta === 'materiais' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="materiais">
          {cabecalhoDaTela(
            'Biblioteca de materiais',
            'Os materiais da organização — código (SINAPI ou interno), nome, unidade, custo, fabricante, densidade e condutividade. O código é o mesmo que a camada, o piso, o rodapé e o guarda-corpo carregam no desenho; a biblioteca o resolve na tela e no orçamento.',
            BookOpen,
            'Arquitetura',
          )}
          <div>
            <TelaMateriais
              materiais={biblioteca.materiais}
              carregando={biblioteca.carregando}
              indisponivel={biblioteca.indisponivel}
              usosPorCodigo={usosPorCodigo}
              onCriar={async (m) => {
                const alvo = await resolverOrgDeEscrita('all-allowed');
                if (!alvo) throw new Error('Escolha a organização em que o material será gravado.');
                const { failed } = await forEachTargetOrg(alvo, (org) => biblioteca.criar(org, m));
                if (failed.length) throw new Error(failed.map((f) => (f.error instanceof Error ? f.error.message : String(f.error))).join('; '));
              }}
              onAtualizar={async (id, m) => {
                await biblioteca.atualizar(id, m);
              }}
              onDesativar={(id) => biblioteca.desativar(id)}
              onSemear={async (lista) => {
                const alvo = await resolverOrgDeEscrita('all-allowed');
                if (!alvo) return;
                await forEachTargetOrg(alvo, async (org) => {
                  for (const m of lista) await biblioteca.criar(org, m);
                });
              }}
            />
          </div>
        </div>
      )}

      {telaAberta === 'gerar' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="gerar">
          {cabecalhoDaTela(
            'Gerar plantas',
            'Do programa e do envelope, N alternativas determinísticas: zona por fluxo (social à frente, íntimo protegido), alocação por treemap, recozimento simulado com semente, paredes na malha, portas e janelas, automáticos e avaliação. Cada semente é uma planta; a frente de Pareto separa as não dominadas.',
            Wand2,
            'Analisar',
          )}
          <div>
            <TelaGerador
              gerador={gerador}
              entrada={entradaDoGerador.entrada}
              hipoteses={hipotesesDoGerador}
              onHipoteses={setHipotesesDoGerador}
              contexto={entradaDoGerador.contexto}
              pavimentoTemParedes={editor.model.walls.some((w) => w.levelId === levelId)}
              onAbrirPrograma={() => setTelaAberta('programa')}
              onCriarAlternativa={async (r) => {
                await createAlternative({ studyId: study.id, organizationId: study.organization_id, fromBranchId: branchId, nome: `Gerada #${r.semente} (nota ${r.avaliacao.notaGeral ?? '—'})`, descricao: r.decisoes.slice(2, 4).join(' '), model: r.model });
                await recarregarRamos();
                setTelaAberta('alternativas');
              }}
              onAplicarAqui={aplicarAlternativaGerada}
            />
          </div>
        </div>
      )}
      {telaAberta === 'tipos' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="tipos">
          {cabecalhoDaTela(
            'Catálogo de tipos',
            'Os tipos de elemento da organização — estrutura, ponto de instalação, escada, telhado, componente, piso e forro — que o painel de cada peça aplica e salva. Renomear, desativar, excluir, quantas peças do desenho têm cada assinatura, semear os padrões e copiar para outra organização.',
            BookMarked,
            'Arquitetura',
          )}
          <div>
            <TelaCatalogoDeTipos
              tipos={tiposDoCatalogo}
              carregando={catalogoCarregando}
              indisponivel={catalogoIndisponivel}
              usos={usosDeTipos}
              mostrarOrg={!orgId}
              nomeDaOrg={(id) => organizacoesDaLoja.find((o) => o.id === id)?.name ?? id.slice(0, 8)}
              onRenomear={async (id, nome) => {
                const t = await renameElementType(id, nome);
                setTiposDoCatalogo((lista) => lista.map((x) => (x.id === id ? t : x)));
              }}
              onAtivar={async (id, active) => {
                const t = await setElementTypeActive(id, active);
                setTiposDoCatalogo((lista) => lista.map((x) => (x.id === id ? t : x)));
              }}
              onExcluir={async (id) => {
                await deleteElementType(id);
                setTiposDoCatalogo((lista) => lista.filter((x) => x.id !== id));
              }}
              onSemear={async (lista) => {
                const alvo = await resolverOrgDeEscrita('all-allowed');
                if (!alvo) throw new Error('Escolha a organização que recebe os tipos padrão.');
                const { failed } = await forEachTargetOrg(alvo, (org) => upsertElementTypes(org, lista));
                if (failed.length) throw new Error(failed.map((f) => (f.error instanceof Error ? f.error.message : String(f.error))).join('; '));
                recarregarCatalogoDeTipos();
              }}
              onCopiar={async (lista) => {
                const alvo = await resolverOrgDeEscrita('all-allowed');
                if (!alvo) return;
                const { failed } = await forEachTargetOrg(alvo, (org) => upsertElementTypes(org, lista));
                if (failed.length) throw new Error(failed.map((f) => (f.error instanceof Error ? f.error.message : String(f.error))).join('; '));
                recarregarCatalogoDeTipos();
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'parametros' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="parametros">
          {cabecalhoDaTela(
            'Definições de parâmetro',
            'Os parâmetros personalizados da organização (E1.2) e as fórmulas (E1.3): editar nome, família, unidade, opções e fórmula, marcar o que sai no IFC e na planilha, excluir. A chave não muda — é o que a peça carrega.',
            Sigma,
            'Arquitetura',
          )}
          <div>
            <TelaParametros
              definicoes={definicoesDeParametro}
              carregando={false}
              usos={usosDeParametros}
              mostrarOrg={!orgId}
              nomeDaOrg={(id) => organizacoesDaLoja.find((o) => o.id === id)?.name ?? id.slice(0, 8)}
              onEditar={async (id, patch) => {
                const d = await updateParameterDefinition(id, patch);
                setDefinicoesDeParametro((lista) => lista.map((x) => (x.id === id ? d : x)));
              }}
              onExcluir={async (id) => {
                await deleteParameterDefinition(id);
                setDefinicoesDeParametro((lista) => lista.filter((x) => x.id !== id));
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'tabelas' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="tabelas">
          {cabecalhoDaTela(
            'Tabelas personalizadas',
            'Os quadros do projeto do seu jeito: família, colunas (as variáveis das fórmulas), filtro, agrupamento e totais. A definição fica na organização; a tabela é montada sobre este desenho e sai em .xlsx.',
            Table2,
            'Analisar',
          )}
          <div>
            <TelaTabelas
              model={editor.model}
              tabelas={tabelasSalvas}
              carregando={tabelasCarregando}
              indisponivel={tabelasIndisponiveis}
              definicoesDeParametro={definicoesDeParametro}
              calculados={definicoesDeParametro.length ? parametrosCalculadosDoModelo(editor.model, definicoesDeParametro) : undefined}
              mostrarOrg={!orgId}
              nomeDaOrg={(id) => organizacoesDaLoja.find((o) => o.id === id)?.name ?? id.slice(0, 8)}
              onCriar={async (d) => {
                const alvo = await resolverOrgDeEscrita('all-allowed');
                if (!alvo) throw new Error('Escolha a organização em que a tabela será gravada.');
                const { failed } = await forEachTargetOrg(alvo, (org) => blueprintTabelaService.create(org, d));
                if (failed.length) throw new Error(failed.map((f) => (f.error instanceof Error ? f.error.message : String(f.error))).join('; '));
                recarregarTabelas();
              }}
              onAtualizar={async (id, d) => {
                const t = await blueprintTabelaService.update(id, d);
                setTabelasSalvas((lista) => lista.map((x) => (x.id === id ? t : x)));
              }}
              onExcluir={async (id) => {
                await blueprintTabelaService.remove(id);
                setTabelasSalvas((lista) => lista.filter((x) => x.id !== id));
              }}
              onSemear={async (lista) => {
                const alvo = await resolverOrgDeEscrita('all-allowed');
                if (!alvo) return;
                await forEachTargetOrg(alvo, async (org) => {
                  for (const d of lista) await blueprintTabelaService.create(org, d);
                });
                recarregarTabelas();
              }}
              onExportar={(nome, linhas) => baixarArtefatos([artefatoDeTabelaXlsx(nome, linhas)])}
              onSelecionarPeca={(id) => selecionar([id])}
            />
          </div>
        </div>
      )}

      {telaAberta === 'compras' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="compras">
          {cabecalhoDaTela(
            'Planta → compras',
            'As linhas que a planta gera no orçamento, abertas em insumos (materiais e equipamentos da composição), datadas pelo cronograma da obra e lançadas no Plano de Aquisições — o mesmo plano de Suprimentos, com a linha da planta como origem. Dali, uma cotação num clique.',
            ShoppingCart,
            'Analisar',
          )}
          <div>
            <TelaCompras
              obra={study.project_id ? { id: study.project_id, nome: nomeDaObraDeCompras ?? 'Obra vinculada' } : null}
              temVersaoPublicada={editor.baseRevision > 0}
              dataPadrao={dataPadraoDeCompras}
              onDataPadrao={(d) => {
                setDataPadraoDeCompras(d);
                setPreviaDeCompras(null);
                setIdsLancados([]);
              }}
              previa={previaDeCompras}
              ocupado={comprasOcupado}
              erro={erroDeCompras}
              onPrever={preverComprasDaPlanta}
              lancados={idsLancados.length}
              onLancar={async () => {
                if (!previaDeCompras) throw new Error('Faça a prévia antes.');
                setComprasOcupado(true);
                try {
                  const r = await lancarNoPlano(previaDeCompras);
                  setIdsLancados(r.ids);
                  setPreviaDeCompras({ ...previaDeCompras, noPlano: { ...previaDeCompras.noPlano, pendentes: r.inseridas } });
                  return r;
                } finally {
                  setComprasOcupado(false);
                }
              }}
              onCotar={async () => {
                if (!previaDeCompras || idsLancados.length === 0) throw new Error('Lance no plano antes.');
                setComprasOcupado(true);
                try {
                  const r = await abrirCotacao(previaDeCompras, idsLancados);
                  setIdsLancados([]);
                  setPreviaDeCompras({ ...previaDeCompras, noPlano: { pendentes: 0, emAndamento: previaDeCompras.noPlano.emAndamento + idsLancados.length } });
                  return r;
                } finally {
                  setComprasOcupado(false);
                }
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'api' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="api">
          {cabecalhoDaTela(
            'API pública',
            'Tokens de leitura da organização para ligar BI, ERP ou planilha à Planta Inteligente: estudos, versões publicadas (payload canônico + hash), quantitativos, planilha CSV, IFC e unidades/áreas. Somente leitura; só o que foi publicado. O token aparece uma vez, ao criar.',
            KeyRound,
            'Colaborar',
          )}
          <div>
            <TelaChavesDeApi
              tokens={tokensDaApi}
              carregando={tokensDaApiCarregando}
              indisponivel={tokensDaApiIndisponiveis}
              mostrarOrg={!orgId}
              nomeDaOrg={(id) => organizacoesDaLoja.find((o) => o.id === id)?.name ?? id.slice(0, 8)}
              urlBase={urlBaseDaApi()}
              onCriar={async (nome, expiresAt) => {
                // REGRA #5: a organização vem do seletor do topo; em "Todas", o modal pergunta. Um token é de UMA organização — nunca "todas".
                const alvo = await resolverOrgDeEscrita('single');
                if (!alvo) throw new Error('Escolha a organização dona do token.');
                if (alvo.kind !== 'org') throw new Error('Um token pertence a UMA organização: escolha uma.');
                const criado = await blueprintApiTokenService.create(alvo.orgId, nome, expiresAt);
                recarregarTokensDaApi();
                return criado;
              }}
              onRevogar={async (id) => {
                await blueprintApiTokenService.revoke(id);
                recarregarTokensDaApi();
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'antes-depois' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="antes-depois">
          {cabecalhoDaTela(
            'Antes e depois',
            'A reforma em duas plantas na mesma escala: o que existe hoje (com o que se demole em vermelho tracejado) e o que fica (existente em cinza, novo como sempre). Os quantitativos contam só o novo; a demolição sai à parte.',
            Hammer,
            'Arquitetura',
          )}
          <div>
            <TelaAntesDepois
              model={editor.model}
              quant={quant}
              levelId={levelId}
              niveis={editor.model.levels.map((l) => ({ id: l.id, nome: l.name }))}
              onSelecionar={(ids) => {
                editor.setSelectedIds(ids);
                setTelaAberta(null);
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'acesso' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="acesso">
          {cabecalhoDaTela(
            'Acesso e presença',
            'Quem está neste ramo agora (e o que cada um está editando) e o papel de cada membro da organização neste estudo: editor (padrão) ou leitor — que vê tudo, mas não grava rascunho nem publica.',
            Users,
            'Colaborar',
          )}
          <div>
            <TelaAcessoDoEstudo
              membros={membrosDaOrgDoEstudo.map((m) => ({ email: m.email, nome: m.nome, papelNaOrg: m.papelNaOrg }))}
              permissoes={permissoesDoEstudo}
              participantes={colab.participantes}
              conectado={colab.conectado}
              meuEmail={sessaoAtual?.email ?? null}
              carregando={permissoesCarregando}
              indisponivel={permissoesIndisponiveis}
              onDefinir={async (email, papel) => {
                await blueprintStudyPermissionService.definir(study.id, study.organization_id, email, papel);
                recarregarPermissoes();
              }}
              onVoltarAoPadrao={async (id) => {
                await blueprintStudyPermissionService.remover(id);
                recarregarPermissoes();
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'travas' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="travas">
          {cabecalhoDaTela(
            'Travas',
            'Exclusividade por um tempo: trave a seleção, o pavimento atual ou uma disciplina, com nota e prazo. Complementa a trava automática por seleção; fica mesmo com você fora do ramo, até soltar, alguém forçar ou vencer.',
            Lock,
            'Colaborar',
          )}
          <div>
            <TelaTravas
              model={editor.model}
              travas={travasDoRamo}
              carregando={travasCarregando}
              indisponivel={travasIndisponiveis}
              meuUserId={sessaoAtual?.id ?? null}
              selecionados={editor.selectedIds}
              nivelAtivo={(() => {
                const l = editor.model.levels.find((x) => x.id === levelId);
                return l ? { id: l.id, uid: l.uid, name: l.name } : null;
              })()}
              onTravar={async (escopo, alvos, nota, validadeHoras) => {
                if (!sessaoAtual) throw new Error('Sem sessão.');
                await blueprintTravaService.criar({ branchId, organizationId: study.organization_id, escopo, alvos, holderUserId: sessaoAtual.id, holderEmail: sessaoAtual.email, holderNome: meuNome ?? '', nota, validadeHoras });
                recarregarTravas();
                colab.avisarTravas();
              }}
              onSoltar={async (t, forcada) => {
                await blueprintTravaService.soltar(t.id);
                recarregarTravas();
                colab.avisarTravas(forcada ? `forçou a liberação da trava de ${t.holderNome || t.holderEmail} (${t.nota || t.escopo})` : undefined);
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'webhooks' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="webhooks">
          {cabecalhoDaTela(
            'Webhooks',
            'Avise seu ERP, BI ou canal quando algo acontecer na Planta: versão publicada, versão aprovada, comentário novo, alternativa tornada principal. O servidor faz um POST assinado (HMAC) na sua URL, com retentativa e log de cada entrega.',
            Webhook,
            'Colaborar',
          )}
          <div>
            <TelaWebhooks
              webhooks={webhooksDaOrg}
              entregas={entregasDeWebhook}
              carregando={webhooksCarregando}
              indisponivel={webhooksIndisponiveis}
              mostrarOrg={!orgId}
              nomeDaOrg={(id) => organizacoesDaLoja.find((o) => o.id === id)?.name ?? id.slice(0, 8)}
              onCriar={async (w) => {
                // REGRA #5: um webhook é de UMA organização — a do topo, ou a escolhida no modal.
                const alvo = await resolverOrgDeEscrita('single');
                if (!alvo) throw new Error('Escolha a organização dona do webhook.');
                if (alvo.kind !== 'org') throw new Error('Um webhook pertence a UMA organização: escolha uma.');
                await blueprintWebhookService.create(alvo.orgId, w);
                recarregarWebhooks();
              }}
              onAtualizar={async (id, w) => {
                await blueprintWebhookService.update(id, w);
                recarregarWebhooks();
              }}
              onApagar={async (id) => {
                await blueprintWebhookService.remove(id);
                recarregarWebhooks();
              }}
              onTestar={async (id) => {
                await blueprintWebhookService.testar(id);
                // O despachante responde em segundos: recarrega uma vez agora e outra logo depois.
                recarregarWebhooks();
                window.setTimeout(recarregarWebhooks, 4000);
              }}
              onReenviar={async (id) => {
                await blueprintWebhookService.reenviar(id);
                recarregarWebhooks();
                window.setTimeout(recarregarWebhooks, 4000);
              }}
              onRecarregarEntregas={recarregarWebhooks}
            />
          </div>
        </div>
      )}
      {telaAberta === 'plugins' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="plugins">
          {cabecalhoDaTela(
            'Plugins',
            'Estenda a Planta com páginas suas: cada plugin roda num quadro isolado, recebe o desenho (modelo, hash e, se permitido, quantitativos) e propõe comandos do kernel que você aprova antes de aplicar. Nada de terceiros roda nesta página.',
            Puzzle,
            'Colaborar',
          )}
          <div>
            <TelaPlugins
              plugins={pluginsDaOrg}
              carregando={pluginsCarregando}
              indisponivel={pluginsIndisponiveis}
              mostrarOrg={!orgId}
              nomeDaOrg={(id) => organizacoesDaLoja.find((o) => o.id === id)?.name ?? id.slice(0, 8)}
              onCriar={async (p) => {
                // REGRA #5: um plugin é de UMA organização — a do topo, ou a escolhida no modal.
                const alvo = await resolverOrgDeEscrita('single');
                if (!alvo) throw new Error('Escolha a organização dona do plugin.');
                if (alvo.kind !== 'org') throw new Error('Um plugin pertence a UMA organização: escolha uma.');
                await blueprintPluginService.create(alvo.orgId, p);
                recarregarPlugins();
              }}
              onAtualizar={async (id, p) => {
                await blueprintPluginService.update(id, p);
                recarregarPlugins();
              }}
              onApagar={async (id) => {
                await blueprintPluginService.remove(id);
                recarregarPlugins();
              }}
              onExecutar={(p) => {
                setPluginEmExecucao(p);
                setTelaAberta('plugin');
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'plugin' && pluginEmExecucao && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="plugin">
          {cabecalhoDaTela(
            `Plugin: ${pluginEmExecucao.nome}`,
            'O plugin roda no quadro à esquerda e recebe o desenho a cada mudança. O que ele propõe aparece à direita, ensaiado pelo kernel; só entra no desenho quando você clica Aplicar.',
            Puzzle,
            'Colaborar',
          )}
          <PainelPlugin
            plugin={pluginEmExecucao}
            model={editor.model}
            estudo={{ id: study.id, titulo: study.name, revisao: null, hash: '' }}
            nivelAtivoId={levelId ?? null}
            selecao={editor.selectedIds}
            onAplicar={(comandos) => {
              const criados = editor.runBatch(comandos);
              if (criados.length > 0) selecionar(criados);
            }}
            onSelecionar={(uids) => {
              // uid → id em toda família do modelo que tem os dois.
              const quer = new Set(uids);
              const ids: string[] = [];
              for (const lista of Object.values(editor.model)) {
                if (!Array.isArray(lista)) continue;
                for (const x of lista as { id?: string; uid?: string }[]) if (x && x.uid && x.id && quer.has(x.uid)) ids.push(x.id);
              }
              selecionar(ids);
            }}
            onFechar={() => {
              setPluginEmExecucao(null);
              setTelaAberta('plugins');
            }}
          />
        </div>
      )}
      {telaAberta === 'alternativas' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="alternativas">
          {cabecalhoDaTela(
            'Alternativas',
            'Design Options: cada alternativa é um ramo do estudo com rascunho, versões e histórico próprios. Abra outra, crie uma a partir da atual, compare duas (mesma escala, o que muda, indicadores lado a lado) e promova a melhor a principal.',
            GitBranch,
            'Colaborar',
          )}
          <div>
            <TelaAlternativas
              ramos={ramos}
              ramoAtualId={branchId}
              model={editor.model}
              avaliacaoAtual={avaliacao}
              carregando={ramosCarregando}
              erro={ramosErro}
              onAbrir={(id) => {
                setTelaAberta(null);
                onTrocarRamo?.(id);
              }}
              onCriar={async (nome, descricao) => {
                await createAlternative({ studyId: study.id, organizationId: study.organization_id, fromBranchId: branchId, nome, descricao, model: editor.model });
                await recarregarRamos();
              }}
              onRenomear={async (id, nome, descricao) => {
                await renameBranch(id, nome, descricao);
                await recarregarRamos();
              }}
              onPromover={async (id) => {
                await setPrincipalBranch(study.id, id, study.organization_id);
                await recarregarRamos();
              }}
              onExcluir={async (id) => {
                await deleteBranch(id);
                await recarregarRamos();
              }}
              carregarModelo={loadBranchModel}
              avaliarModelo={avaliarOutroModelo}
            />
          </div>
        </div>
      )}
      {telaAberta === 'avaliacao' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="avaliacao">
          {cabecalhoDaTela(
            'Avaliação',
            'Dezoito indicadores de 0 a 100 com a explicação de cada nota — programa, legislação, eficiência, circulação, compacidade, insolação, ventilação, corredores, adjacências, privacidade, acessibilidade, estrutura, modulação, custo, paredes, fachada, shafts e hidráulica. Pesos editáveis; o que falta dado fica "não avaliado".',
            Gauge,
            'Analisar',
          )}
          <div>
            <TelaAvaliacao
              avaliacao={avaliacao}
              hipoteses={hipotesesDaAvaliacao}
              onHipoteses={setHipotesesDaAvaliacao}
              onSelecionar={(id) => {
                selecionarEAbrir([id]);
                setTelaAberta(null);
              }}
              onNavegar={(destino) => {
                // Sugestão (E5.3) aponta a porta de entrada: tela própria ou gaveta.
                if (destino === 'programa' || destino === 'legislacao' || destino === 'quantitativos') {
                  setTelaAberta(destino);
                  return;
                }
                setTelaAberta(null);
                if (destino === 'orcamento') alternarRelatorio('orcamento');
                else alternarTarefa(destino);
              }}
            />
          </div>
        </div>
      )}
      {telaAberta === 'programa' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="programa">
          {cabecalhoDaTela(
            'Programa de necessidades',
            'O que a planta tem de ter: cada ambiente pedido (uso, quantidade, áreas, largura, pé-direito, exigências, privacidade) e a matriz de proximidade entre eles. É do estudo, e alimenta a conferência do programa e o gerador.',
            ClipboardList,
            'Analisar',
          )}
          <div>
            <TelaPrograma
              programa={programaDoEstudo.programa}
              onChange={programaDoEstudo.setPrograma}
              carregando={programaDoEstudo.carregando}
              aviso={
                programaDoEstudo.persistenciaIndisponivel
                  ? 'Programa sem persistência (migration ausente ou sem permissão): vale só nesta sessão.'
                  : programaDoEstudo.erroDeGravacao
                    ? `Não gravou o programa: ${programaDoEstudo.erroDeGravacao}`
                    : null
              }
            />
          </div>
        </div>
      )}
      {telaAberta === 'legislacao' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="legislacao">
          {cabecalhoDaTela(
            'Verificar legislação',
            'Cada regra do código de obras, das normas e da organização avaliada contra o desenho: violada, conforme ou não avaliada (falta dado). Clique numa linha para ir ao elemento. A NBR 5410 entra como fonte, com as conferências do painel do ambiente.',
            Scale,
            'Analisar',
          )}
          <div>
            <TelaLegislacao
              resultados={resultadosDeRegras}
              regrasDaOrganizacao={regrasDaOrganizacao}
              nomeDoPavimento={(id) => (id ? editor.model.levels.find((l) => l.id === id)?.name ?? '—' : '—')}
              onSelecionar={(id) => {
                selecionarEAbrir([id]);
                setTelaAberta(null);
              }}
              onSalvarRegra={regrasIndisponiveis ? null : salvarRegraDaOrganizacao}
              onRemoverRegra={regrasIndisponiveis ? null : removerRegraDaOrganizacao}
              avisoDePersistencia={regrasIndisponiveis ? 'Catálogo de regras indisponível (migration ausente ou sem permissão).' : null}
              conferencia={conferenciaDoPrograma}
              onAbrirPrograma={() => setTelaAberta('programa')}
            />
          </div>
        </div>
      )}
      {telaAberta === 'unidades' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="unidades">
          {cabecalhoDaTela(
            'Unidades',
            'A unidade autônoma como objeto: número, tipologia e PCD; os ambientes que a compõem (escolhidos no cartão de cada ambiente); área privativa pela NBR 12721, área comum por pavimento e fração ideal — derivadas do desenho, sempre atuais. A parede geminada aparece tracejada na planta.',
            Building2,
            'Analisar',
          )}
          <div>
            <TelaUnidades
              model={editor.model}
              quadro={quadroDeUnidadesDoModelo}
              onRun={(c) => editor.run(c)}
              onRunBatch={(cs) => editor.runBatch(cs)}
              erro={editor.lastError}
              carregarDoPlantaAi={
                zona.empreendimentoId || empreendimentoSugerido
                  ? () => blueprintUnidadesPlantaAiService.listar((zona.empreendimentoId || empreendimentoSugerido)!)
                  : null
              }
            />
          </div>
        </div>
      )}
      {telaAberta === 'armadura' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="armadura">
          {cabecalhoDaTela(
            'Armadura',
            `${armadura.pecas.length} peça(s) · ${armadura.totais.totalKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg de aço pelo esquema mínimo da NBR 6118 com piso por taxa de referência — pré-quantitativo, não detalhamento. Hipóteses gravadas no estudo; o kg vai ao painel da peça, aos Quantitativos, à planilha e ao orçamento. Lançamento manual por peça fica no painel dela.`,
            Grip,
            'Analisar',
          )}
          <div>
            <TelaArmadura
              hipoteses={hipotesesDeArmadura}
              onHipoteses={armaduraDoEstudo.setHipoteses}
              armadura={armadura}
              onSelecionarPeca={(id) => {
                selecionar([id]);
                setTelaAberta(null);
              }}
              carregando={armaduraDoEstudo.carregando}
              persistenciaIndisponivel={armaduraDoEstudo.persistenciaIndisponivel}
            />
          </div>
        </div>
      )}
      {telaAberta === 'unifilar' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="unifilar">
          {cabecalhoDaTela(
            RELATORIOS_DO_DOCK.unifilar.rotulo,
            'A leitura do quadro em uma linha: alimentação, disjuntor geral, barramento e um ramal por circuito — disjuntor, DR, condutores e carga. Os valores vêm do quadro de cargas; "sug." é o pré-dimensionamento ainda não declarado.',
            Network,
          )}
          <div className="rounded-[6px] border border-gray-200 bg-white p-5">
            <PainelUnifilar model={editor.model} hipoteses={hipotesesEletricas} />
          </div>
        </div>
      )}
      {telaAberta === 'executivo-eletrico' && (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300" data-tela="executivo-eletrico">
          {cabecalhoDaTela(
            RELATORIOS_DO_DOCK['executivo-eletrico'].rotulo,
            'A emissão é do responsável técnico. O programa reúne a conferência NBR 5410 e o pré-dimensionamento de cada circuito e quadro, registra a emissão e a amarra ao hash do desenho e das hipóteses.',
            FileText,
          )}
          <div className="rounded-[6px] border border-gray-200 bg-white p-5">
            <PainelEletricaExecutivo
              semCabecalho
              e={{
                responsavel: executivoEletrico.responsavel,
                onResponsavel: executivoEletrico.setResponsavel,
                resultado: resultadoEletrico,
                emitidos: executivoEletrico.emitidos,
                emissaoValida: emissaoEletricaValida,
                hashDaBaseAtual: hashEletrico.base,
                onEmitir: () => void emitirEletrico(),
                emitindo: executivoEletrico.emitindo,
                erro: executivoEletrico.erro,
                onBaixarMemorial: (row) => executivoEletrico.baixarMemorial(row, study.name),
                persistenciaIndisponivel: executivoEletrico.persistenciaIndisponivel,
              }}
            />
          </div>
        </div>
      )}
    <div
      className={`flex h-full flex-col bg-slate-50 ${telaCheia ? 'fixed inset-0 z-40' : ''}`}
      data-tela-cheia={telaCheia ? '' : undefined}
      hidden={telaAberta != null}
    >

      {/* ─── O RIBBON (13/09/2026) ─────────────────────────────────────────────
          Era UMA barra com ~25 controles que quebrava em duas ou três linhas.
          Agora são abas por disciplina (Arquitetura · Terreno · Instalações ·
          Inserir · Analisar · Vista), o seletor de vista fora delas à esquerda
          (troca-se de vista o tempo todo) e o acesso rápido à direita (desfazer,
          refazer, copiar, colar, excluir — sempre visíveis). Abaixo, a BARRA DE
          OPÇÕES da ferramenta ativa: só o que ela pergunta.

          Cada comentário de "por que este botão fica aqui" da barra antiga foi
          mantido junto do botão — a razão de cada vizinhança não mudou, só o
          arranjo em abas. Ver `Ribbon.tsx` e o plano
          `docs/planos/2026-09-13-planta-ribbon-painel-enxuto-dock.md`. */}
      <div ref={ribbonRef}>
      <Ribbon
        abas={abasDoRibbon}
        ativa={aba}
        onEscolher={escolherAba}
        recolhido={ribbonRecolhido}
        onRecolher={setRibbonRecolhido}
        ariaLabel="Ferramentas de desenho"
        esquerda={
          <>
            {/* O CABEÇALHO DISSOLVIDO (24/09/2026, P2.62). Voltar, o nome da
                planta e o estado de salvamento eram uma faixa própria de 40 px
                acima do ribbon — *"botão voltar topo a esquerda e botão publicar
                no topo direito está ocupando espaço vertical sem necessidade"*.
                São três coisas pequenas: cabem na fileira das abas, que já tem
                altura para elas.

                ⚠️ O ESTADO DE SALVAMENTO continua VISÍVEL, e isso não é
                inconsistência com esconder comandos em menu: é retorno de ação.
                "Falha ao salvar" dentro de um tooltip seria esconder justamente
                o que precisa interromper quem está desenhando. */}
            <BotaoBarra
              icone={ArrowLeft}
              rotulo={`Voltar para a lista — ${study.name}`}
              onClick={onBack}
            />
            {/* ⚠️ O NOME DA PLANTA SAIU DA BARRA (25/09/2026, P2.63): *"o botão de
                voltar não precisa de texto, somente o ícone"* — colado na seta, o
                nome era lido como rótulo dela. Some da tela, não do app: continua
                no `title` da seta, na ABA DO NAVEGADOR e como `h1` para leitor de
                tela, que precisa de um título de nível 1 para saber onde está. */}
            <h1
              className="sr-only"
              title={`${study.name} · Revisão publicada ${editor.baseRevision} · unidades em milímetros`}
            >
              {study.name}
            </h1>
            <SeletorDeVista
              vista={vista}
              onEscolher={setVista}
              cortes={(editor.model.sections ?? []).map((c) => ({ id: c.id, rotulo: c.rotulo }))}
              vistasDependentes={(editor.model.vistasDependentes ?? []).map((v) => ({ id: v.id, nome: v.nome }))}
            />
          </>
        }
        direita={
          <>
            {/* O ESTADO DE SALVAMENTO mora AQUI, e não colado na seta de voltar
                (25/09/2026, P2.63): ao lado da seta, qualquer texto vira rótulo
                dela — foi o que gerou o pedido *"o botão de voltar não precisa de
                texto"*. Junto do Publicar ele está onde faz sentido: rascunho
                salvo × versão publicada é a mesma conversa.

                ⚠️ VISÍVEL, sempre: é retorno de ação, não comando. "Falha ao
                salvar" num tooltip seria esconder o que precisa interromper. */}
            <span
              className={`shrink-0 text-xs ${
                editor.saveState === 'erro'
                  ? 'text-red-600'
                  : editor.saveState === 'salvo'
                    ? 'text-emerald-600'
                    : 'text-slate-500'
              }`}
            >
              {rotuloSalvamento[editor.saveState]}
            </span>
            {/* PUBLICAR encostado à direita: é o fim do fluxo, clicado uma vez
                por sessão — e continua o único botão azul da tela. */}
            <button
              type="button"
              onClick={() => void publicarComTopografia()}
              disabled={editor.publishing || !editor.dirtySincePublish}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              title={
                editor.dirtySincePublish
                  ? 'Publica uma versão imutável desta planta'
                  : 'Nada mudou desde a última publicação'
              }
            >
              {editor.publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Publicar versão
            </button>
          </>
        }
        acessoRapido={
          <AcessoRapido
            ordem={Array.isArray(ordemDoAcessoRapido) ? ordemDoAcessoRapido : []}
            onOrdem={setOrdemDoAcessoRapido}
            grupos={gruposDoAcessoRapido}
            cauda={
              <span className="hidden whitespace-nowrap text-xs text-slate-500 2xl:inline">
                {editor.model.walls.length} parede(s) · {ambientes.length} ambiente(s)
              </span>
            }
          />
        }
      >
        {aba === 'arquitetura' && (
          <>
            <GrupoDoRibbon rotulo="Construir">
              <Ferramenta
                atual={editor.tool}
                valor="selecionar"
                icone={MousePointer2}
                rotulo="Selecionar"
                onClick={editor.setTool}
              />
              <Ferramenta
                atual={editor.tool}
                valor="mover"
                icone={Hand}
                rotulo="Mover"
                onClick={editor.setTool}
              />
              {/* COMPONENTES — parede, esquadria, estrutura e fundação num menu só.
                  (Decisão do usuário, 31/08/2026.) Com o ribbon, o menu ficou com a
                  família do que se CONSTRÓI; trechos, pontos e quadro estão na aba
                  Instalações, no mesmo menu filtrado — um catálogo, duas portas. */}
              <MenuComponentes
                tool={editor.tool}
                tipoAbertura={tipoAbertura}
                tipoEstrutural={tipoEstrutural}
                tipoCirculacao={tipoCirculacao}
                tipoDeNucleo={tipoDeNucleo}
                disciplinaDoNucleo={disciplinaDoNucleo}
                tipoDeVaga={tipoDeVaga}
                tipoDeGuardaCorpo={tipoDeGuardaCorpo}
                familia="CONSTRUCAO"
                onEscolher={escolherComponente}
              />
              {/* MOBILIÁRIO (19/09/2026, E7.1): o catálogo de componentes — mobiliário,
                  louças, bancadas, armários, equipamentos — a mesma porta, outra família. */}
              <MenuComponentes
                tool={editor.tool}
                tipoAbertura={tipoAbertura}
                tipoEstrutural={tipoEstrutural}
                tipoDeComponente={tipoDeComponente}
                familia="MOBILIARIO"
                rotulo="Mobiliário"
                onEscolher={escolherComponente}
              />
              {/* JUNTAR não desenha — CORRIGE. Fica junto das de desenho mesmo assim
                  porque é onde o erro que ela conserta nasce: contorno traçado à mão,
                  ou gerado do PDF, com o canto passando do encontro. */}
              <Ferramenta
                atual={editor.tool}
                valor="juntar"
                icone={CornerDownRight}
                rotulo="Juntar"
                onClick={editor.setTool}
              />
            </GrupoDoRibbon>

            {/* PROJETO (24/09/2026). Os quatro grupos desta aba — Estrutural,
                Reforma, Acabamentos e Vistas — eram 20 botões em DUAS fileiras.
                O usuário mandou o print: *"o menubar está com 4 linhas. Ocupando
                muito da tela"*. Viraram quatro menus numa fileira só; o que se usa
                a cada minuto (Construir) ficou de fora, à vista. */}
            <GrupoDoRibbon rotulo="Projeto">
              {/* ESTRUTURAL (15/09/2026): o lançamento automático de pilares. O
                  pilar avulso continua no menu Componentes; aqui é a proposta em
                  lote — prévia tracejada no desenho, um passo de desfazer. */}
              {!emVista && (
                <MenuDoRibbon
                  rotulo="Estrutural"
                  icone={RectangleVertical}
                  ajuda="Eixos da malha e lançamento automático de pilares, vigas, lajes e fundações — sempre com prévia tracejada antes de gravar"
                >
                  {/* EIXO da malha (E1.4): a linha nomeada que o calculista risca
                      antes do pilar. Dois cliques; o ímã e os pilares automáticos
                      passam a olhar para ela. */}
                  <Ferramenta atual={editor.tool} valor="eixo" icone={Hash} rotulo="Eixo" onClick={editor.setTool} />
                  <BotaoDoRibbon
                    icone={RectangleVertical}
                    rotulo="Pilares automáticos"
                    contagem={planoDePilares?.pilares.length || undefined}
                    ativo={tarefaAberta === 'pilares'}
                    onClick={() => alternarTarefa('pilares')}
                    ajuda="Um pilar em cada encontro de paredes (canto, T, cruzamento) e intermediários quando o vão passa do máximo — prévia antes de gravar, Ctrl+Z desfaz"
                  />
                  <BotaoDoRibbon
                    icone={RectangleHorizontal}
                    rotulo="Vigas automáticas"
                    contagem={planoDeVigas?.vigas.length || undefined}
                    ativo={tarefaAberta === 'vigas'}
                    onClick={() => alternarTarefa('vigas')}
                    ajuda="Uma viga por parede, de pilar a pilar, com a largura da parede e altura pelo maior vão (L/10) — prévia antes de gravar, Ctrl+Z desfaz"
                  />
                  <BotaoDoRibbon
                    icone={Layers}
                    rotulo="Lajes automáticas"
                    contagem={planoDeLajes?.lajes.length || undefined}
                    ativo={tarefaAberta === 'lajes'}
                    onClick={() => alternarTarefa('lajes')}
                    ajuda="Uma laje por ambiente fechado, apoiada no topo das paredes — prévia antes de gravar, Ctrl+Z desfaz"
                  />
                  <BotaoDoRibbon
                    icone={SquareStack}
                    rotulo="Fundações automáticas"
                    contagem={planoDeFundacoes ? planoDeFundacoes.blocos.length + planoDeFundacoes.baldrames.length || undefined : undefined}
                    ativo={tarefaAberta === 'fundacoes'}
                    onClick={() => alternarTarefa('fundacoes')}
                    ajuda="Um bloco de coroamento sob cada pilar do pavimento, com uma ou duas estacas — prévia antes de gravar, Ctrl+Z desfaz"
                  />
                </MenuDoRibbon>
              )}

              {/* FASES DE REFORMA (20/09/2026, E10.2): marca a seleção como existente,
                  a demolir ou novo (kernel 0.46.0); o filtro da vista está no menu
                  Vista; Antes/Depois é tela com as duas miniaturas. */}
              {!emVista && (
                <MenuDoRibbon
                  rotulo="Reforma"
                  icone={Hammer}
                  ajuda="Marca a seleção como existente, a demolir ou novo; compara antes e depois; etapas da obra"
                >
                  {(['EXISTENTE', 'DEMOLIR', 'NOVO'] as const).map((fase) => (
                    <BotaoDoRibbon
                      key={fase}
                      icone={Hammer}
                      rotulo={fase === 'EXISTENTE' ? 'Existente' : fase === 'DEMOLIR' ? 'A demolir' : 'Novo'}
                      contagem={fase === 'NOVO' ? undefined : contagemDeFases[fase] || undefined}
                      ativo={faseSelecionada.ids.length > 0 && faseSelecionada.fase === fase}
                      disabled={faseSelecionada.ids.length === 0}
                      onClick={() => editor.run({ type: 'SetFase', ids: faseSelecionada.ids, fase: fase === 'NOVO' ? null : fase })}
                      ajuda={
                        fase === 'EXISTENTE'
                          ? 'Marca a seleção (paredes, aberturas, estrutura, mobiliário) como EXISTENTE: fica na obra; fora do quantitativo de construção e do de demolição; cinza no desenho. O número é quantas peças estão assim.'
                          : fase === 'DEMOLIR'
                            ? 'Marca a seleção como A DEMOLIR: sai da obra; entra nas medidas "Demolição — …" do orçamento; vermelho tracejado no desenho. O número é quantas peças estão assim.'
                            : 'Volta a seleção a NOVO (o padrão): é o que se constrói e se orça.'
                      }
                    />
                  ))}
                  <BotaoDoRibbon
                    icone={Hammer}
                    rotulo="Antes / depois"
                    ativo={telaAberta === 'antes-depois'}
                    onClick={() => alternarTela('antes-depois')}
                    ajuda="Duas plantas na mesma escala: antes (existente + a demolir) e depois (existente + novo), com o resumo do que se demole e do que se constrói."
                  />
                  <BotaoDoRibbon
                    icone={History}
                    rotulo="Etapas"
                    contagem={etapasDoEstudo.length ? pecasSemEtapa(editor.model) || undefined : undefined}
                    ativo={tarefaAberta === 'etapas' || !!etapaEmVista}
                    onClick={() => alternarTarefa('etapas')}
                    ajuda="Fases personalizadas: a linha do tempo da obra (Existente, Fase 1, Fase 2…), em que etapa cada peça nasce e em qual é demolida, a etapa em vista no desenho e o quadro do que entra e sai por etapa. O número é quantas peças ainda não têm etapa."
                  />
                </MenuDoRibbon>
              )}

              {/* ACABAMENTOS (19/09/2026, E7.2): piso, forro e rodapé por ambiente —
                  camadas na etiqueta (kernel 0.43.0), tipos da organização, material
                  por camada; o quantitativo e o orçamento saem por material. */}
              {!emVista && (
                <MenuDoRibbon
                  rotulo="Acabamentos"
                  icone={Layers}
                  contagem={esquadriasSemTipo || undefined}
                  ajuda="Piso e forro, esquadrias, guarda-corpos, rodapés, materiais, tipos e parâmetros"
                >
                  <BotaoDoRibbon
                    icone={Layers}
                    rotulo="Piso e forro"
                    contagem={ambientesParaAcabamento.filter((a) => !a.acabamentos).length || undefined}
                    ativo={tarefaAberta === 'acabamentos'}
                    onClick={() => {
                      setAmbienteDeAcabamentos(null);
                      alternarTarefa('acabamentos');
                    }}
                    ajuda="Piso (camadas de baixo para cima), forro (camadas + rebaixo) e rodapé (pela política, declarado ou sem) por ambiente; presets, tipos salvos na organização e material por camada — quantitativo e orçamento por material"
                  />
                  <BotaoDoRibbon
                    icone={BookMarked}
                    rotulo="Esquadrias"
                    contagem={esquadriasSemTipo || undefined}
                    ativo={tarefaAberta === 'esquadrias'}
                    onClick={() => alternarTarefa('esquadrias')}
                    ajuda="Quadro de esquadrias do desenho como LOTE: nomeia os tipos (P1, J1…), vincula item de catálogo e aplica a todas as aberturas do grupo de uma vez. Esquadria sem nome de tipo não entra no orçamento — nem como divergência."
                  />
                  <BotaoDoRibbon
                    icone={Fence}
                    rotulo="Guarda-corpos"
                    contagem={sugestaoDeGuardaCorpos.sugestoes.length + resumoDeGuardaCorpos.erros || undefined}
                    ativo={tarefaAberta === 'guardaCorpos'}
                    onClick={() => alternarTarefa('guardaCorpos')}
                    ajuda="Guarda-corpo (1,10 m, NBR 14718) sobre borda livre de laje em pavimento elevado e corrimão (0,92 m, NBR 9050) dos dois lados da escada — sugestão com prévia, material e item por peça, metros no quantitativo e no orçamento"
                  />
                  <BotaoDoRibbon
                    icone={Minus}
                    rotulo="Rodapés"
                    contagem={sugestaoDeRodapes.sugestoes.length || resumoDeRodapes.sugeridos || undefined}
                    ativo={tarefaAberta === 'rodapes'}
                    onClick={() => alternarTarefa('rodapes')}
                    ajuda="Rodapé como elemento (P2.21): trechos ao pé das paredes por ambiente, descontadas as portas; altura e item por trecho; com trechos, o quantitativo soma os trechos e não o perímetro"
                  />
                  <BotaoDoRibbon
                    icone={BookOpen}
                    rotulo="Materiais"
                    contagem={[...usosPorCodigo.keys()].filter((c) => !biblioteca.porCodigo.has(c)).length || undefined}
                    ativo={telaAberta === 'materiais'}
                    onClick={() => alternarTela('materiais')}
                    ajuda="Biblioteca de materiais da organização: código (SINAPI/interno), custo, fabricante, densidade e condutividade; resolve o código das camadas, pisos, rodapés e guarda-corpos na tela e no orçamento. O número é quantos códigos do desenho ainda não estão nela."
                  />
                  <BotaoDoRibbon
                    icone={BookMarked}
                    rotulo="Tipos"
                    contagem={tiposDoCatalogo.filter((t) => t.active).length || undefined}
                    ativo={telaAberta === 'tipos'}
                    onClick={() => {
                      if (telaAberta !== 'tipos') recarregarCatalogoDeTipos();
                      alternarTela('tipos');
                    }}
                    ajuda="Catálogo de tipos da organização (estrutura, ponto, escada, telhado, componente, piso, forro): renomear, desativar, excluir, usos no desenho, semear padrões e copiar para outra organização"
                  />
                  <BotaoDoRibbon
                    icone={Sigma}
                    rotulo="Parâmetros"
                    contagem={definicoesDeParametro.length || undefined}
                    ativo={telaAberta === 'parametros'}
                    onClick={() => {
                      if (telaAberta !== 'parametros') recarregarDefinicoes();
                      alternarTela('parametros');
                    }}
                    ajuda="Definições de parâmetro personalizado e fórmulas da organização: editar, marcar o que sai nas saídas, excluir; usos no desenho"
                  />
                </MenuDoRibbon>
              )}

              {/* CORTE. Não é construção nem medida: o que sai daqui é uma VISTA.
                  Grupo próprio, e não o menu Componentes — a lista de componentes é
                  o que se constrói, e uma linha de corte não se constrói. */}
              <MenuDoRibbon
                rotulo="Vistas"
                icone={Scissors}
                ajuda="Linha de corte e vista dependente — o recorte da planta com nome e escala próprios"
              >
                <Ferramenta
                  atual={editor.tool}
                  valor="corte"
                  icone={Scissors}
                  rotulo="Corte"
                  onClick={editor.setTool}
                />
                {/* INVERTER, TAMBÉM NA PLANTA (pedido de 06/09/2026): é onde se vê a
                    MARCA com as setas e onde se percebe que apontam para o lado
                    errado. Ligado ao corte SELECIONADO, não a "o último". */}
                {corteSel && (
                  <button
                    type="button"
                    onClick={() =>
                      editor.run({
                        type: 'SetCorteProps',
                        corteId: corteSel.id,
                        olharPara: corteSel.olharPara === 'ESQUERDA' ? 'DIREITA' : 'ESQUERDA',
                      })
                    }
                    title="Vira o corte para o outro lado. As setas na planta acompanham."
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Inverter o lado
                  </button>
                )}
                <BotaoDoRibbon
                  icone={Crop}
                  rotulo="Vista dependente"
                  contagem={(editor.model.vistasDependentes ?? []).filter((v) => v.levelId === levelId).length || undefined}
                  ativo={recorteArmado === 'nova'}
                  onClick={() => setRecorteArmado((r) => (r === 'nova' ? null : 'nova'))}
                  ajuda="Arraste um retângulo na planta: vira uma vista com nome e escala próprios (recorte da planta-mãe), que sai como prancha"
                />
              </MenuDoRibbon>
            </GrupoDoRibbon>
          </>
        )}

        {aba === 'terreno' && (
          <>
            {/* TERRENO. Separado das ferramentas de desenho porque o que sai daqui
                NÃO é construção: é divisa, sem espessura e sem custo. Desenhar lote
                com a ferramenta Parede poria o perímetro do terreno no orçamento
                como alvenaria. */}
            <GrupoDoRibbon rotulo="Lote">
              <Ferramenta
                atual={editor.tool}
                valor="terreno"
                icone={LandPlot}
                rotulo="Terreno"
                onClick={editor.setTool}
              />
              <Ferramenta
                atual={editor.tool}
                valor="subregiao"
                icone={Trees}
                rotulo="Sub-região"
                onClick={editor.setTool}
              />
              <Ferramenta
                atual={editor.tool}
                valor="divisa"
                icone={Waypoints}
                rotulo="Divisa"
                onClick={editor.setTool}
              />
              {/* O que a escritura e a lei dizem do lote — área, papel de cada
                  lado, recuos, zona, topografia, terraplenagem, emissão. Era o
                  miolo da seção "Ambientes"; é TAREFA, não navegação. */}
              <BotaoDoRibbon
                icone={Landmark}
                rotulo="Dados do lote"
                ativo={tarefaAberta === 'terreno'}
                onClick={() => alternarTarefa('terreno')}
                ajuda="Área da escritura, papel de cada divisa, recuos e zona urbanística, topografia, corte e aterro, projeto executivo de terraplenagem"
              />
            </GrupoDoRibbon>
            {/* LOTEAMENTO (B1, 25/09/2026): o parcelamento do solo. Separado do grupo
                Lote porque ali o assunto é UM imóvel (a gleba, a escritura, os
                recuos); aqui são as N unidades que nascem dele e vão virar
                matícula, espelho de vendas e memória descritiva cada uma. */}
            <GrupoDoRibbon rotulo="Loteamento">
              <Ferramenta
                atual={editor.tool}
                valor="quadra"
                icone={Grid3x3}
                rotulo="Quadra"
                onClick={editor.setTool}
              />
              <Ferramenta
                atual={editor.tool}
                valor="lote"
                icone={Scan}
                rotulo="Lote"
                onClick={editor.setTool}
              />
              <Ferramenta
                atual={editor.tool}
                valor="via"
                icone={Route}
                rotulo="Via"
                onClick={editor.setTool}
              />
              <Ferramenta
                atual={editor.tool}
                valor="area-publica"
                icone={TreePine}
                rotulo="Área pública"
                onClick={editor.setTool}
              />
              <BotaoDoRibbon
                icone={Grid2x2}
                rotulo="Lotear"
                ativo={tarefaAberta === 'lotear'}
                onClick={() => alternarTarefa('lotear')}
                disabled={quadrasDoNivel.length === 0}
                ajuda={
                  quadrasDoNivel.length === 0
                    ? 'Desenhe uma quadra primeiro: é ela que se subdivide em lotes'
                    : 'Fatia a quadra em lotes de testada fixa — prévia antes de lançar, e um Ctrl+Z desfaz'
                }
              />
              <BotaoDoRibbon
                icone={ListOrdered}
                rotulo="Numerar"
                onClick={numerarQuadraSelecionada}
                disabled={(editor.model.quadras ?? []).filter((q) => q.levelId === levelId).length === 0}
                ajuda={
                  (editor.model.quadras ?? []).filter((q) => q.levelId === levelId).length === 0
                    ? 'Desenhe uma quadra primeiro: a numeração corre no sentido horário dentro dela'
                    : 'Renumera os lotes da quadra selecionada no sentido horário, a partir do 1º vértice dela · um Ctrl+Z desfaz tudo'
                }
              />
            </GrupoDoRibbon>
            {/* GARAGEM (19/09/2026, E2.5): vagas em fileiras com circulação, por ambiente
                ou pelo contorno do pavimento; os mínimos PCD/idoso e a exigência conferidos. */}
            <GrupoDoRibbon rotulo="Garagem">
              <BotaoDoRibbon
                icone={CarFront}
                rotulo="Vagas"
                contagem={vagasSugeridasNoNivel || undefined}
                ativo={tarefaAberta === 'vagas'}
                onClick={() => alternarTarefa('vagas')}
                ajuda="Lança vagas em fileiras (2,50 × 5,00 m) com faixa de circulação, desviando de pilares e paredes; PCD e idoso nos mínimos legais; confere com a exigência — sugeridas até aceitar"
              />
            </GrupoDoRibbon>
            {/* PERFIL altimétrico e DRENAGEM traçada (fases 4 e 6 da topografia):
                uma VISTA do terreno e uma premissa de terraplenagem — nenhuma das
                duas passa pelo kernel. */}
            <GrupoDoRibbon rotulo="Topografia">
              {/* IMPORTAR LEVANTAMENTO (P2.64): o arquivo do topógrafo em um
                  clique. Primeiro do grupo porque é o primeiro passo real de
                  quem tem topografia — antes de traçar perfil ou drenagem,
                  alguém precisa pôr as cotas no desenho. */}
              <BotaoDoRibbon
                icone={FileUp}
                rotulo="Importar levantamento"
                onClick={importarLevantamento}
                ajuda="Arquivo do topógrafo — CSV/TXT de estação total (PNEZD), GeoJSON, KML, DXF, SVG ou LandXML. Traz os pontos cotados e, quando o arquivo tem o perímetro, lança as divisas do lote junto. Prévia antes de entrar; o sha256 do arquivo vai na proveniência da versão."
              />
              <Ferramenta
                atual={editor.tool}
                valor="perfil"
                icone={Activity}
                rotulo="Perfil"
                onClick={editor.setTool}
              />
              <Ferramenta
                atual={editor.tool}
                valor="drenagem"
                icone={Waves}
                rotulo="Drenagem"
                onClick={editor.setTool}
              />
            </GrupoDoRibbon>
          </>
        )}

        {aba === 'hidraulica' && !emVista && (
          <>
            <GrupoDoRibbon rotulo="Redes e pontos">
              <MenuComponentes
                tool={editor.tool}
                tipoAbertura={tipoAbertura}
                tipoEstrutural={tipoEstrutural}
                tipoCirculacao={tipoCirculacao}
                tipoDeNucleo={tipoDeNucleo}
                disciplinaDoNucleo={disciplinaDoNucleo}
                tipoDeVaga={tipoDeVaga}
                disciplinaDeRede={disciplinaDeRede}
                tipoDePontoEletrico={tipoDePontoEletrico}
                tipoDeInterruptor={tipoDeInterruptor}
                tipoDePontoHidraulico={tipoDePontoHidraulico}
                prumadaDeRede={prumadaDeRede}
                familia="HIDRAULICA"
                rotulo="Hidráulica"
                onEscolher={escolherComponente}
              />
            </GrupoDoRibbon>
            {/* LANÇAMENTO automático hidráulico (18/09/2026): os pontos por ambiente
                (F3); água fria/quente e esgoto entram nas fases seguintes. */}
            <GrupoDoRibbon rotulo="Lançamento">
              <BotaoDoRibbon
                icone={ShowerHead}
                rotulo="Distribuir pontos"
                contagem={ambientesComPontosACriar || undefined}
                ativo={tarefaAberta === 'pontosHidraulicos'}
                onClick={() => alternarTarefa('pontosHidraulicos')}
                ajuda="Por ambiente classificado: o kit do banheiro (vaso, lavatório, chuveiro, caixa sifonada), da cozinha (pia) e da área de serviço (tanque, máquina, ralo) em posições sugeridas — mover confirma, Ctrl+Z desfaz"
              />
              <BotaoDoRibbon
                icone={Droplets}
                rotulo="Água automática"
                contagem={pontosDeAguaALigar || undefined}
                ativo={tarefaAberta === 'agua'}
                onClick={() => alternarTarefa('agua')}
                ajuda="Da caixa d'água aos pontos de água fria e do aquecedor aos de água quente: barrilete no forro, colunas, ramais a 2,20 m e o DN pelos pesos da NBR 5626 — sugerido; mover ou aceitar confirma"
              />
              <BotaoDoRibbon
                icone={Waves}
                rotulo="Esgoto automático"
                contagem={planoDeEsgoto.aLigar || undefined}
                ativo={tarefaAberta === 'esgoto'}
                onClick={() => alternarTarefa('esgoto')}
                ajuda="Dos aparelhos aos coletores (caixa sifonada, caixa de gordura) e à caixa de inspeção, com caimento por DN (NBR 8160), tubo de queda e ventilação no sobrado — sugerido; mover ou aceitar confirma"
              />
              <BotaoDoRibbon
                icone={CheckCircle2}
                rotulo="Aceitar sugeridas"
                contagem={sugeridasNoNivel}
                disabled={sugeridasNoNivel === 0}
                onClick={aceitarSugeridas}
                ajuda="Confirma todas as peças sugeridas do pavimento (tomadas e pontos hidráulicos) de uma vez."
              />
            </GrupoDoRibbon>
          </>
        )}
        {aba === 'mecanica' && !emVista && (
          <>
            {/* HVAC MÍNIMO (E11.1): o LUGAR do equipamento, não o equipamento —
                reservas com folga de manutenção, o shaft mecânico e o clash
                que pega pilar, parede ou móvel dentro delas. Dutos ficam fora. */}
            <GrupoDoRibbon rotulo="Reservas e shaft">
              <MenuComponentes
                tool={editor.tool}
                tipoAbertura={tipoAbertura}
                tipoEstrutural={tipoEstrutural}
                tipoCirculacao={tipoCirculacao}
                tipoDeNucleo={tipoDeNucleo}
                disciplinaDoNucleo={disciplinaDoNucleo}
                tipoDeVaga={tipoDeVaga}
                tipoDeComponente={tipoDeComponente}
                disciplinaDeRede={disciplinaDeRede}
                tipoDePontoEletrico={tipoDePontoEletrico}
                tipoDeInterruptor={tipoDeInterruptor}
                familia="MECANICA"
                rotulo="Mecânica"
                onEscolher={escolherComponente}
              />
            </GrupoDoRibbon>
            <GrupoDoRibbon rotulo="Conferência">
              <BotaoDoRibbon
                icone={AlertTriangle}
                rotulo="Conflitos das reservas"
                contagem={conflitosDeReservas || undefined}
                ativo={relatorioAberto === 'conflitos'}
                onClick={() => alternarRelatorio('conflitos')}
                ajuda="Pilar ou parede dentro da reserva do equipamento, ou outra peça dentro da folga de manutenção — na lista de conflitos, com BCF"
              />
              <BotaoDoRibbon
                icone={Wind}
                rotulo="Shafts mecânicos"
                contagem={shaftsMecanicos.length || undefined}
                disabled={shaftsMecanicos.length === 0}
                onClick={() => selecionar(shaftsMecanicos.map((n) => n.id))}
                ajuda="Seleciona os shafts com disciplina Mecânica do desenho"
              />
            </GrupoDoRibbon>
          </>
        )}
        {aba === 'eletrica' && (
          <>
            {!emVista && (
              <GrupoDoRibbon rotulo="Pontos e redes">
                <MenuComponentes
                  tool={editor.tool}
                  tipoAbertura={tipoAbertura}
                  tipoEstrutural={tipoEstrutural}
                  tipoCirculacao={tipoCirculacao}
                  tipoDeNucleo={tipoDeNucleo}
                  disciplinaDoNucleo={disciplinaDoNucleo}
                  tipoDeVaga={tipoDeVaga}
                  disciplinaDeRede={disciplinaDeRede}
                  tipoDePontoEletrico={tipoDePontoEletrico}
                  tipoDeInterruptor={tipoDeInterruptor}
                  familia="ELETRICA"
                  rotulo="Elétrica"
                  onEscolher={escolherComponente}
                />
              </GrupoDoRibbon>
            )}
            {/* TOMADAS PELA NORMA — a distribuição automática (fatias 1–3 de
                10/09) e o "completar pela norma". Já existiam em cada cartão de
                ambiente e na parede selecionada; aqui é onde se PROCURA por
                elas (13/09/2026: "não encontrei a funcionalidade de lançamento
                automático de tomadas"). */}
            {!emVista && (
              <GrupoDoRibbon rotulo="Tomadas">
                <BotaoDoRibbon
                  icone={Plug}
                  rotulo="Distribuir tomadas"
                  contagem={ambientesComDeficit.length || undefined}
                  ativo={tarefaAberta === 'tomadas'}
                  onClick={() => alternarTarefa('tomadas')}
                  ajuda="Por ambiente: tipo do cômodo, conferência NBR 5410 9.5.2 e distribuição automática — completar pela norma ou N tomadas ao longo das paredes"
                />
                <BotaoDoRibbon
                  icone={CheckCircle2}
                  rotulo="Aceitar sugeridas"
                  contagem={sugeridasNoNivel}
                  disabled={sugeridasNoNivel === 0}
                  onClick={aceitarSugeridas}
                  ajuda="As tomadas distribuídas nascem SUGERIDAS (anel tracejado); mover uma confirma. Isto confirma todas as do pavimento de uma vez."
                />
              </GrupoDoRibbon>
            )}
            <GrupoDoRibbon rotulo="Elétrica">
              {/* CIRCUITOS ANTES DE ELETRODUTOS: o eletroduto é por circuito, e um
                  ponto sem circuito fica de fora dele. A ordem dos botões é a
                  ordem do trabalho. */}
              {!emVista && (
                <BotaoDoRibbon
                  icone={CircuitBoard}
                  rotulo="Circuitos automáticos"
                  contagem={pontosParaCircuitos || undefined}
                  ativo={tarefaAberta === 'circuitos'}
                  onClick={() => alternarTarefa('circuitos')}
                  ajuda="Cria circuitos para os pontos sem circuito do pavimento: luz, TUG e TUE sempre separados; TUE um por ponto; luz e TUG por ambiente, por carga máxima ou um por função — prévia antes de gravar, Ctrl+Z desfaz"
                />
              )}
              {!emVista && (
                <BotaoDoRibbon
                  icone={Cable}
                  rotulo="Lançar eletrodutos"
                  contagem={pontosALigar || undefined}
                  ativo={tarefaAberta === 'eletrodutos'}
                  onClick={() => alternarTarefa('eletrodutos')}
                  ajuda="Por circuito: prumada em cada ponto e rede no teto a partir do quadro, pelo menor caminho — sugerido; mover ou aceitar confirma"
                />
              )}
              <BotaoDoRibbon
                icone={Zap}
                rotulo="Quadro de cargas"
                contagem={(editor.model.circuitos ?? []).length}
                ativo={telaAberta === 'quadro-de-cargas'}
                onClick={() => alternarTela('quadro-de-cargas')}
                ajuda="Circuitos por quadro, pré-dimensionamento com hipóteses declaradas e conferência NBR 5410"
              />
              <BotaoDoRibbon
                icone={FileText}
                rotulo="Projeto executivo (ART)"
                contagem={executivoEletrico.emitidos.length || undefined}
                ativo={telaAberta === 'executivo-eletrico'}
                onClick={() => alternarTela('executivo-eletrico')}
                ajuda="Responsável técnico, ART, verificações e emissão do projeto executivo elétrico — separado do quadro de cargas porque se emite uma vez por revisão"
              />
              <BotaoDoRibbon
                icone={Network}
                rotulo="Diagrama unifilar"
                contagem={(editor.model.quadros ?? []).length || undefined}
                ativo={telaAberta === 'unifilar'}
                onClick={() => alternarTela('unifilar')}
                ajuda="O quadro em uma linha: alimentação, disjuntor geral, barramento e um ramal por circuito com disjuntor, DR, condutores e carga — o mesmo traçado que sai na prancha elétrica"
              />
            </GrupoDoRibbon>
          </>
        )}

        {aba === 'inserir' && (
          <>
          {/* INSERIR (24/09/2026, P2.61). Anotações (6 comandos) e Importar (5) eram
              duas fileiras. Viraram menus, como os da Arquitetura na P2.60 —
              *"menus inserir e analisar não foi possível agrupamento?"*.
              ⚠️ REFERÊNCIA fica ABERTA: o controle de opacidade mostra o estado
              do fundo (e a aferição da escala), e estado que se lê de relance
              não vai para dentro de um menu. */}
          <GrupoDoRibbon rotulo="Inserir">
            {/* ANOTAÇÕES (19/09/2026, E8.1): o que se escreve sobre a vista — texto,
                texto com seta, linha, região hachurada, cota angular. Vão para o
                PDF e o DXF; não são construção. Cada botão arma a ferramenta com
                o tipo; clicar de novo desarma. */}
            <MenuDoRibbon
              rotulo="Anotações"
              icone={Type}
              ajuda="Texto, texto com seta, linha, região hachurada, cota angular e nuvem de revisão — sobre a vista, não são construção; saem no PDF e no DXF"
            >
                {([
                  ['TEXTO', Type, '1 clique: o texto entra no ponto; edite no painel'],
                  ['LEADER', MessageSquareText, '2 cliques: a ponta da seta e onde o texto fica'],
                  ['LINHA', Slash, 'Cliques ao longo da linha; duplo clique encerra'],
                  ['HACHURA', Highlighter, 'Cliques no contorno da região; duplo clique fecha (diagonal, cruzada, pontos ou sólida)'],
                  ['COTA_ANGULAR', TriangleRight, '3 cliques: o vértice e as duas pontas — o ângulo é derivado'],
                  ['NUVEM', Cloud, 'Cliques no contorno da área alterada; duplo clique fecha. Leva o número e a data da revisão (barra) e a descrição (painel) — sai na tabela de revisões do carimbo'],
                ] as const).map(([tipo, Icone, ajuda]) => (
                  <BotaoDoRibbon
                    key={tipo}
                    icone={Icone}
                    rotulo={ROTULO_DO_TIPO_DE_ANOTACAO[tipo]}
                    contagem={resumoDeAnotacoes.porTipo[tipo] || undefined}
                    ativo={editor.tool === 'anotacao' && tipoDeAnotacao === tipo}
                    onClick={() => {
                      if (editor.tool === 'anotacao' && tipoDeAnotacao === tipo) editor.setTool('selecionar');
                      else {
                        setTipoDeAnotacao(tipo);
                        editor.setTool('anotacao');
                      }
                    }}
                    ajuda={`${ROTULO_DO_TIPO_DE_ANOTACAO[tipo]} na planta do pavimento ativo — ${ajuda}. Sai no PDF e no DXF.`}
                  />
                ))}
            </MenuDoRibbon>
            {/* IMPORTAR — trazer para dentro o que outra pessoa desenhou. O PDF
                vira parede por reconhecimento; o IFC e o DXF, por medida
                declarada; o BCF é a única que traz PENDÊNCIA em vez de geometria.
                Cada uma abre como tarefa no painel lateral. */}
            <MenuDoRibbon
              rotulo="Importar"
              icone={Boxes}
              ajuda="Trazer para dentro o que outra pessoa desenhou: PDF, IFC, DXF/DWG, SketchUp e BCF"
            >
                <BotaoDoRibbon
                  icone={FileText}
                  rotulo="Do PDF"
                  ativo={tarefaAberta === 'gerar-paredes'}
                  onClick={() => alternarTarefa('gerar-paredes')}
                  ajuda="Gerar paredes e portas a partir da planta de fundo em PDF"
                />
                <BotaoDoRibbon
                  icone={Boxes}
                  rotulo="Do IFC"
                  ativo={tarefaAberta === 'importar-ifc'}
                  onClick={() => alternarTarefa('importar-ifc')}
                  ajuda="Importar paredes, aberturas e estrutura de um modelo IFC"
                />
                <BotaoDoRibbon
                  icone={PenTool}
                  rotulo="Do DXF/DWG"
                  ativo={tarefaAberta === 'importar-dxf'}
                  onClick={() => alternarTarefa('importar-dxf')}
                  ajuda="Importar paredes de um desenho DXF ou DWG (o DWG é convertido no servidor)"
                />
                <BotaoDoRibbon
                  icone={Boxes}
                  rotulo="Do SketchUp"
                  ativo={tarefaAberta === 'importar-collada'}
                  onClick={() => alternarTarefa('importar-collada')}
                  ajuda="Importar paredes de um modelo do SketchUp exportado como COLLADA (.dae): o leitor reconhece parede onde há duas faces verticais paralelas; o .skp (binário fechado) não pode ser lido diretamente"
                />
                <BotaoDoRibbon
                  icone={MessagesSquare}
                  rotulo="Do BCF"
                  ativo={tarefaAberta === 'importar-bcf'}
                  onClick={() => alternarTarefa('importar-bcf')}
                  ajuda="Importar os tópicos de coordenação (BCF) que o projetista devolveu"
                />
                {/* O LEVANTAMENTO também mora aqui (P2.64), embora o painel dele
                    seja o do terreno: "Importar" é onde se procura importar. O que
                    ele traz não é geometria — são as cotas do lote. */}
                <BotaoDoRibbon
                  icone={Mountain}
                  rotulo="Do levantamento topográfico"
                  onClick={importarLevantamento}
                  ajuda="Pontos cotados do topógrafo (CSV/TXT PNEZD, GeoJSON, KML, DXF, SVG, LandXML) e, quando o arquivo traz o perímetro, as divisas do lote: abre em Terreno › Dados do lote, com prévia antes de entrar"
                />
            </MenuDoRibbon>
          </GrupoDoRibbon>
          <GrupoDoRibbon rotulo="Referência">
            <ControlesDeFundo
              linhas={fundo.linhas}
              linha={fundo.linha}
              underlay={fundo.underlay}
              opacidade={fundo.opacidade}
              calibrando={editor.tool === 'calibrar'}
              ocupado={fundo.ocupado}
              totalPaginas={fundo.totalPaginas}
              onSelecionar={fundo.selecionar}
              onImportar={(arquivo, pagina) => void fundo.importar(arquivo, pagina)}
              // A escala declarada NÃO passa por `reposicionar` das medições como a
              // recalibração passa: quem declara a escala está corrigindo o número,
              // e as formas devem acompanhar. `declararEscala` pivota no mesmo
              // ponto de referência da aferição anterior, então o traçado fica.
              onDeclararEscala={(n) => void fundo.declararEscala(n)}
              onCalibrar={() => {
                setAfericao(null);
                editor.setTool(editor.tool === 'calibrar' ? 'selecionar' : 'calibrar');
              }}
              onOpacidade={fundo.setOpacidade}
              onRemover={() => void fundo.remover()}
            />
          </GrupoDoRibbon>
          </>
        )}

        {aba === 'analisar' && (
          <>
            {/* MEDIR ≠ DESENHAR. Estas três não produzem geometria: produzem uma
                AFIRMAÇÃO sobre a planta de fundo — por isso moram em Analisar, e
                não em Arquitetura. Só na planta: fora dela não se mede. */}
            {!emVista && (
              <GrupoDoRibbon rotulo="Medir">
                <Ferramenta
                  atual={editor.tool}
                  valor="medir-area"
                  icone={Square}
                  rotulo="Área"
                  onClick={editor.setTool}
                />
                <Ferramenta
                  atual={editor.tool}
                  valor="medir-linha"
                  icone={Spline}
                  rotulo="Linha"
                  onClick={editor.setTool}
                />
                <Ferramenta
                  atual={editor.tool}
                  valor="contar"
                  icone={Hash}
                  rotulo="Contar"
                  onClick={editor.setTool}
                />
              </GrupoDoRibbon>
            )}
            {/* RELATÓRIOS — o que o desenho DIZ: pendências da geometria,
                formas medidas, quantidades, custo. Abrem no dock. */}
            <GrupoDoRibbon rotulo="Relatórios">
              <MenuDoRibbon
                rotulo="Conferência"
                icone={AlertTriangle}
                contagem={totalDeConflitos + restricoesVioladas + errosDeLegislacao || undefined}
                ajuda="O que está errado ou falta: conflitos, restrições, legislação, LOD, programa, departamentos, grafo, avaliação e insolação. O número soma as três violações — conflitos, restrições violadas e erros de legislação; cada uma tem a sua dentro."
              >
                <BotaoDoRibbon
                  icone={AlertTriangle}
                  rotulo="Conflitos"
                  contagem={totalDeConflitos}
                  ativo={relatorioAberto === 'conflitos'}
                  onClick={() => alternarRelatorio('conflitos')}
                  ajuda="Interferências entre disciplinas, com a estrutura e da estrutura com vãos e escadas; exportar BCF"
                />
                <BotaoDoRibbon
                  icone={LandPlot}
                  rotulo="Loteamento"
                  contagem={errosDoLoteamento || undefined}
                  ativo={relatorioAberto === 'loteamento'}
                  onClick={() => alternarRelatorio('loteamento')}
                  disabled={(editor.model.lotes ?? []).length === 0}
                  ajuda={
                    (editor.model.lotes ?? []).length === 0
                      ? 'Sem lote desenhado não há o que conferir — use Lotear ou a ferramenta Lote, na aba Terreno'
                      : 'Área e testada mínimas, lote encravado, número repetido e o percentual de áreas públicas (Lei 6.766/79 e a zona do estudo)'
                  }
                />
                <BotaoDoRibbon
                  icone={Link2}
                  rotulo="Restrições"
                  contagem={restricoesVioladas || undefined}
                  ativo={relatorioAberto === 'restricoes'}
                  onClick={() => alternarRelatorio('restricoes')}
                  ajuda="As restrições declaradas (sobre o eixo, distância, comprimento, paralela) conferidas contra o desenho; a violada oferece Ajustar"
                />
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Scale}
                    rotulo="Legislação"
                    contagem={errosDeLegislacao || undefined}
                    ativo={telaAberta === 'legislacao'}
                    onClick={() => alternarTela('legislacao')}
                    ajuda="Verificar legislação: código de obras (semente), NBR 9050/5410, zona e regras da organização — violada, conforme ou não avaliada"
                  />
                )}
                {relatorioVisivel('quantitativos') && !emVista && (
                  <BotaoDoRibbon
                    icone={Gauge}
                    rotulo="LOD"
                    contagem={pendenciasDeLodDoNivel.length || undefined}
                    ativo={tarefaAberta === 'lod'}
                    onClick={() => alternarTarefa('lod')}
                    ajuda="Nível de desenvolvimento (LOD 200/300/350) lido de cada peça — camadas, esquadria, rótulo, tipo, circuito, item de catálogo —, alvo por família e a lista do que falta para chegar lá. Vai no IFC como LevelOfDevelopment. O número é quantas peças estão abaixo do alvo."
                  />
                )}
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={ClipboardList}
                    rotulo="Programa"
                    contagem={programaDoEstudo.programa.itens.length || undefined}
                    ativo={telaAberta === 'programa'}
                    onClick={() => alternarTela('programa')}
                    ajuda="Programa de necessidades do estudo: ambientes pedidos, áreas, exigências e matriz de proximidade; sementes por tipologia"
                  />
                )}
                {relatorioVisivel('quantitativos') && !emVista && (
                  <BotaoDoRibbon
                    icone={Palette}
                    rotulo="Departamentos"
                    contagem={ambientes.filter((a) => !a.departamento).length || undefined}
                    ativo={tarefaAberta === 'departamentos'}
                    onClick={() => alternarTarefa('departamentos')}
                    ajuda="Departamento (setor) de cada ambiente — Social, Íntimo, Serviço, Circulação, Técnico — gravado na etiqueta; quadro de áreas por setor, sugestão pelo nome/tipo e a planta de departamentos colorida com legenda. O número é quantos ambientes ainda não têm setor."
                  />
                )}
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Footprints}
                    rotulo="Grafo"
                    contagem={grafoDoNivel?.nos.length || undefined}
                    ativo={tarefaAberta === 'grafo'}
                    onClick={() => alternarTarefa('grafo')}
                    ajuda="Grafo espacial do pavimento: quem se liga a quem por porta e por parede, percursos pelas portas, circulação %, fachada e orientação de cada ambiente"
                  />
                )}
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Gauge}
                    rotulo="Avaliação"
                    contagem={avaliacao.notaGeral ?? undefined}
                    ativo={telaAberta === 'avaliacao'}
                    onClick={() => alternarTela('avaliacao')}
                    ajuda="Avaliação: nota geral 0–100 e dezoito indicadores com explicação (programa, legislação, eficiência, circulação, insolação, acessibilidade, custo…); pesos editáveis"
                  />
                )}
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Sun}
                    rotulo="Insolação"
                    contagem={insolacaoDoNivel.filter((a) => a.temJanela && a.horas.INVERNO === 0).length || undefined}
                    ativo={tarefaAberta === 'insolacao'}
                    onClick={() => alternarTarefa('insolacao')}
                    ajuda="Insolação e ventilação: posição do sol por data e hora solar, horas de sol por fachada e ambiente (21/06, 21/03, 21/12), sombra do entorno, ventilação cruzada; sol e sombras no 3D"
                  />
                )}
              </MenuDoRibbon>
              <MenuDoRibbon
                rotulo="Quantidades"
                icone={Calculator}
                ajuda="O que vira número e dinheiro: medições, quantitativos, unidades, armadura, tabelas, orçamento e compras"
              >
                {relatorioVisivel('medicoes') && (
                  <BotaoDoRibbon
                    icone={Ruler}
                    rotulo="Medições"
                    contagem={medicoes.formas.length}
                    ativo={relatorioAberto === 'medicoes'}
                    onClick={() => alternarRelatorio('medicoes')}
                    ajuda="As formas medidas sobre a planta de fundo e o envio ao orçamento"
                  />
                )}
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Table2}
                    rotulo="Quantitativos"
                    ativo={telaAberta === 'quantitativos'}
                    onClick={() => alternarTela('quantitativos')}
                    ajuda="Áreas, volumes e comprimentos derivados do desenho; o quantitativo oficial da versão"
                  />
                )}
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Building2}
                    rotulo="Unidades"
                    contagem={editor.model.unidades.length || undefined}
                    ativo={telaAberta === 'unidades'}
                    onClick={() => alternarTela('unidades')}
                    ajuda="Unidades autônomas: composição por ambiente, área privativa NBR 12721, área comum e fração ideal"
                  />
                )}
                {(!emVista || em3d) && (
                  <BotaoDoRibbon
                    icone={Grip}
                    rotulo="Armadura"
                    contagem={armadura.pecas.length || undefined}
                    ativo={telaAberta === 'armadura'}
                    onClick={() => alternarTela('armadura')}
                    ajuda="Aço por peça e por família — mínimos da NBR 6118 + taxa de referência; hipóteses do estudo"
                  />
                )}
                <BotaoDoRibbon
                  icone={Table2}
                  rotulo="Tabelas"
                  contagem={tabelasSalvas.length || undefined}
                  ativo={telaAberta === 'tabelas'}
                  onClick={() => {
                    if (telaAberta !== 'tabelas') recarregarTabelas();
                    alternarTela('tabelas');
                  }}
                  ajuda="Tabelas personalizadas (schedules): família, colunas, filtro, agrupamento e totais — sobre este desenho, em .xlsx"
                />
                {relatorioVisivel('orcamento') && (
                  <BotaoDoRibbon
                    icone={Calculator}
                    rotulo="Orçamento"
                    ativo={relatorioAberto === 'orcamento'}
                    onClick={() => alternarRelatorio('orcamento')}
                    ajuda="A ponte com o orçamento da obra: prévia e aplicação por elemento"
                  />
                )}
                <BotaoDoRibbon
                  icone={ShoppingCart}
                  rotulo="Compras"
                  ativo={telaAberta === 'compras'}
                  onClick={() => alternarTela('compras')}
                  ajuda="Da planta ao Plano de Aquisições da obra: insumos das linhas do orçamento, datados pelo cronograma; cotação num clique"
                />

              </MenuDoRibbon>
              <MenuDoRibbon
                rotulo="Gerar"
                icone={Wand2}
                ajuda="Do programa ao desenho: alternativas geradas, conversar com a planta e o mobiliário mínimo conferido"
              >
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Wand2}
                    rotulo="Gerar"
                    contagem={gerador.resultados.length || undefined}
                    ativo={telaAberta === 'gerar'}
                    onClick={() => alternarTela('gerar')}
                    ajuda="Gerar plantas: do programa e do envelope, N alternativas determinísticas (zona por fluxo, treemap, recozimento com semente, paredes, portas, janelas, automáticos, avaliação)"
                  />
                )}
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Bot}
                    rotulo="Conversar"
                    contagem={turnos.length || undefined}
                    ativo={tarefaAberta === 'ia'}
                    onClick={() => alternarTarefa('ia')}
                    ajuda="Conversar com a planta: pedido em linguagem natural → mudanças no programa/hipóteses (nunca geometria) → re-geração → delta dos indicadores; explicar a solução"
                  />
                )}
                {relatorioVisivel('quantitativos') && (
                  <BotaoDoRibbon
                    icone={Grid2x2}
                    rotulo="Mobiliário"
                    contagem={mobiliarioDoNivel.filter((a) => a.pecas.length > 0 && !(hipotesesDeMobiliario.acessivel ? a.circulacao.ok120 : a.circulacao.ok90)).length || undefined}
                    ativo={tarefaAberta === 'mobiliario'}
                    onClick={() => alternarTarefa('mobiliario')}
                    ajuda="Mobiliário mínimo por ambiente (cama/armário, sofá/mesa, bancada/geladeira/fogão, tanque/máquina, box/vaso/lavatório) e circulação livre de 0,90/1,20 m verificada; vagas e shaft quando o programa pede"
                  />
                )}
              </MenuDoRibbon>
            </GrupoDoRibbon>
          </>
        )}

        {aba === 'modificar' && modificarDisponivel && (
          <>
            {/* ─── MODIFICAR (F4): o que se faz COM a seleção ─────────────────
                As mesmas ações dos painéis de propriedades, à mão no ribbon —
                a aba contextual do Revit. Cada grupo só existe para a peça que
                o tem: parede divide e une; porta gira e espelha; estrutura
                corta parede e emenda ponta; corte vira e se vê. */}
            <GrupoDoRibbon
              rotulo={
                editor.selectedIds.length > 1
                  ? `${editor.selectedIds.length} selecionados`
                  : (rotuloDoSelecionado ?? 'Seleção')
              }
            >
              <BotaoDoRibbon
                icone={Copy}
                rotulo="Copiar"
                onClick={copiar}
                ajuda="Copiar seleção (Ctrl+C) — cole com Ctrl+V sob o cursor"
              />
              <BotaoDoRibbon
                icone={Trash2}
                rotulo="Excluir"
                perigo
                onClick={removerSelecionada}
                ajuda="Excluir a seleção (Delete)"
              />
            </GrupoDoRibbon>

            {paredeSel && (
              <GrupoDoRibbon rotulo="Parede">
                <BotaoDoRibbon
                  icone={Split}
                  rotulo="Dividir"
                  onClick={dividirSelecionada}
                  ajuda="Divide a parede ao meio, em duas com o mesmo eixo"
                />
                <BotaoDoRibbon
                  icone={Merge}
                  rotulo="Unir"
                  onClick={unirSelecionada}
                  disabled={!vizinhaParaUnir}
                  ajuda={
                    vizinhaParaUnir
                      ? 'Une com a vizinha colinear que encosta na ponta'
                      : 'Não há parede colinear encostada numa ponta para unir'
                  }
                />
              </GrupoDoRibbon>
            )}

            {aberturaSel && (aberturaSel.kind === 'door' || aberturaSel.kind === 'sliding') && (
              <GrupoDoRibbon rotulo={nomeDoTipoDeAbertura(aberturaSel.kind)}>
                <BotaoDoRibbon
                  icone={FlipHorizontal2}
                  rotulo="Girar"
                  onClick={() => flipAbertura('hinge')}
                  ajuda={
                    aberturaSel.kind === 'sliding'
                      ? 'Recolhe a folha para a outra ponta do vão'
                      : 'Move a dobradiça para a outra ponta do vão'
                  }
                />
                {/* ESPELHAR só onde há duas faces: na de correr EMBUTIDA a
                    folha vai no eixo e o botão não mudaria um pixel. */}
                {!(aberturaSel.kind === 'sliding' && aberturaSel.embutida) && (
                  <BotaoDoRibbon
                    icone={FlipVertical2}
                    rotulo="Espelhar"
                    onClick={() => flipAbertura('swing')}
                    ajuda={
                      aberturaSel.kind === 'sliding'
                        ? 'Faz a folha correr pela outra face da parede'
                        : 'Abre para o outro lado da parede'
                    }
                  />
                )}
              </GrupoDoRibbon>
            )}

            {estruturaSel && (
              <GrupoDoRibbon rotulo="Estrutura">
                <BotaoDoRibbon
                  icone={Scissors}
                  rotulo="Cortar paredes"
                  contagem={paredesQueAPecaAtravessa.aCortar.length}
                  onClick={cortarParedesDaSelecionada}
                  disabled={paredesQueAPecaAtravessa.aCortar.length === 0}
                  ajuda="Interrompe na peça as paredes que ela atravessa"
                />
                <BotaoDoRibbon
                  icone={CornerDownRight}
                  rotulo="Emendar pontas"
                  contagem={pontasCurtasDaSelecionada.length}
                  onClick={emendarPontasDaSelecionada}
                  disabled={pontasCurtasDaSelecionada.length === 0}
                  ajuda="Leva até a peça as pontas de parede que pararam antes dela"
                />
              </GrupoDoRibbon>
            )}

            {corteSel && (
              <GrupoDoRibbon rotulo="Corte">
                <BotaoDoRibbon
                  icone={Eye}
                  rotulo="Ver o corte"
                  onClick={() => setVista(`corte:${corteSel.id}`)}
                  ajuda="Abre a vista deste corte"
                />
                <BotaoDoRibbon
                  icone={ArrowLeftRight}
                  rotulo="Inverter o lado"
                  onClick={() =>
                    editor.run({
                      type: 'SetCorteProps',
                      corteId: corteSel.id,
                      olharPara: corteSel.olharPara === 'ESQUERDA' ? 'DIREITA' : 'ESQUERDA',
                    })
                  }
                  ajuda="Vira o corte para o outro lado. As setas na planta acompanham."
                />
              </GrupoDoRibbon>
            )}
          </>
        )}

        {aba === 'colaborar' && (
          <GrupoDoRibbon rotulo="Coordenação">
            <BotaoDoRibbon
              icone={MessageSquare}
              rotulo="Comentários"
              ativo={relatorioAberto === 'comentarios'}
              onClick={() => alternarRelatorio('comentarios')}
              ajuda="Comentários ancorados em elementos do desenho"
            />
            {relatorioVisivel('versoes') && (
              <BotaoDoRibbon
                icone={History}
                rotulo="Versões"
                ativo={relatorioAberto === 'versoes'}
                onClick={() => alternarRelatorio('versoes')}
                ajuda="Versões publicadas, diferenças entre elas e as pranchas (PDF, PNG, DXF, IFC)"
              />
            )}
            <BotaoDoRibbon
              icone={GitBranch}
              rotulo="Alternativas"
              contagem={ramos.length > 1 ? ramos.length : undefined}
              ativo={telaAberta === 'alternativas'}
              onClick={() => alternarTela('alternativas')}
              ajuda="Design Options: alternativas do estudo (ramos) — abrir, criar a partir da atual, comparar lado a lado e tornar principal"
            />
          </GrupoDoRibbon>
        )}
        {aba === 'colaborar' && (
          <GrupoDoRibbon rotulo="Equipe">
            {/* PRESENÇA (E10.1): um chip por pessoa no ramo, na cor dela; o título diz o que ela edita. */}
            {colab.participantes.length > 0 && (
              <div className="flex items-center gap-1 px-1" data-testid="presenca-no-ribbon" title="Quem está neste ramo agora">
                {colab.participantes.slice(0, 6).map((p) => (
                  <span key={p.userId} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: p.cor }} title={`${p.nome}${p.selecionados.length ? ` · editando ${p.selecionados.length} elemento(s)` : ''}`} aria-label={`Presente: ${p.nome}`}>
                    {iniciais(p.nome)}
                  </span>
                ))}
                {colab.participantes.length > 6 && <span className="text-[10px] text-slate-500">+{colab.participantes.length - 6}</span>}
              </div>
            )}
            <BotaoDoRibbon
              icone={Users}
              rotulo={somenteLeitura ? 'Acesso (leitor)' : 'Acesso'}
              contagem={colab.participantes.length || undefined}
              ativo={telaAberta === 'acesso'}
              onClick={() => {
                if (telaAberta !== 'acesso') recarregarPermissoes();
                alternarTela('acesso');
              }}
              ajuda="Quem está neste ramo agora e o papel de cada membro da organização neste estudo (editor / leitor). O número é quantas outras pessoas estão no ramo."
            />
            <BotaoDoRibbon
              icone={Lock}
              rotulo="Travas"
              contagem={travasDoRamo.filter((t) => new Date(t.expiresAt).getTime() > Date.now()).length || undefined}
              ativo={telaAberta === 'travas'}
              onClick={() => {
                if (telaAberta !== 'travas') recarregarTravas();
                alternarTela('travas');
              }}
              ajuda="Travas explícitas do ramo: trave a seleção, o pavimento atual ou uma disciplina por um prazo, com nota; os outros veem quem e por quê ao tentar editar. Soltar a sua; forçar a liberação de outra com confirmação. O número é quantas estão vigentes."
            />
          </GrupoDoRibbon>
        )}
        {aba === 'colaborar' && (
          <>
          {/* LOTEAMENTO → EMPREENDIMENTO (B3). Fica em Colaborar porque é
              entrega: o desenho sai da planta e vira cadastro comercial. */}
          <GrupoDoRibbon rotulo="Empreendimento">
            <BotaoDoRibbon
              icone={Building2}
              rotulo="Enviar loteamento"
              onClick={() => void enviarLoteamentoAoEmpreendimento()}
              disabled={enviandoAoEmpreendimento || !empreendimentoDoLoteamento || (editor.model.lotes ?? []).length === 0}
              ajuda={
                !empreendimentoDoLoteamento
                  ? 'Este estudo não tem empreendimento: vincule a obra ao empreendimento para enviar os lotes'
                  : (editor.model.lotes ?? []).length === 0
                    ? 'Desenhe os lotes primeiro (aba Terreno › Lotear)'
                    : 'Manda as quadras e os lotes da versão PUBLICADA para o cadastro do empreendimento, onde viram unidades do espelho de vendas'
              }
            />
            {/* B4: as peças que acompanham o loteamento na prefeitura e no
                cartório. Download, não GED: o memorial é revisado e assinado
                pelo responsável técnico antes de virar documento. */}
            <BotaoDoRibbon
              icone={FileText}
              rotulo="Documentos"
              onClick={() => void emitirDocumentosDoLoteamento()}
              disabled={emitindoDocumentos || (editor.model.lotes ?? []).length === 0}
              ajuda={
                (editor.model.lotes ?? []).length === 0
                  ? 'Desenhe os lotes primeiro (aba Terreno › Lotear)'
                  : 'Planta geral, uma planta por lote, quadro de áreas, memorial descritivo e os pontos de locação em CSV'
              }
            />
          </GrupoDoRibbon>
          <GrupoDoRibbon rotulo="Integração">
            <BotaoDoRibbon
              icone={KeyRound}
              rotulo="API"
              contagem={tokensDaApi.filter((t) => t.active).length || undefined}
              ativo={telaAberta === 'api'}
              onClick={() => {
                if (telaAberta !== 'api') recarregarTokensDaApi();
                alternarTela('api');
              }}
              ajuda="API pública de leitura: tokens da organização, documentação publicada (OpenAPI) — estudos, versões com hash, quantitativos, planilha, IFC e unidades. O número é quantos tokens estão ativos."
            />
            <BotaoDoRibbon
              icone={Webhook}
              rotulo="Webhooks"
              contagem={webhooksDaOrg.filter((w) => w.active).length || undefined}
              ativo={telaAberta === 'webhooks'}
              onClick={() => {
                if (telaAberta !== 'webhooks') recarregarWebhooks();
                alternarTela('webhooks');
              }}
              ajuda="Webhooks da organização: POST assinado (HMAC) na sua URL quando uma versão é publicada ou aprovada, um comentário é criado ou uma alternativa vira principal; retentativa e log. O número é quantos estão ativos."
            />
            <BotaoDoRibbon
              icone={Puzzle}
              rotulo="Plugins"
              contagem={pluginsDaOrg.filter((p) => p.active).length || undefined}
              ativo={telaAberta === 'plugins' || telaAberta === 'plugin'}
              onClick={() => {
                if (telaAberta !== 'plugins') recarregarPlugins();
                alternarTela('plugins');
              }}
              ajuda="Plugins da organização: páginas https suas abertas num quadro isolado (sandbox) que recebem o desenho por postMessage e propõem comandos do kernel — você aprova antes de entrar no desenho. Inclui um plugin de exemplo e o protocolo. O número é quantos estão ativos."
            />
          </GrupoDoRibbon>
          </>
        )}

        {aba === 'vista' && emVista && (
          <>
            <GrupoDoRibbon rotulo="Exibir">
              {menuVista}
              <MenuExibir
                grupos={[
                  vistaEhProjecao
                    ? [
                        {
                          chave: 'cotas-altura',
                          rotulo: 'Cotas de altura',
                          icone: MoveHorizontal,
                          ligado: mostrarCotasAltura,
                          alternar: () => setMostrarCotasAltura((v) => !v),
                          ajuda: 'A cadeia vertical à esquerda, do piso ao topo da edificação.',
                        },
                        {
                          chave: 'rotulos-esquadria',
                          rotulo: 'Rótulos de esquadria',
                          icone: Tag,
                          ligado: mostrarRotulosEsquadria,
                          alternar: () => setMostrarRotulosEsquadria((v) => !v),
                          ajuda: 'Escreve "Porta"/"Janela" dentro de cada vão.',
                        },
                        {
                          chave: 'paredes-internas',
                          rotulo: 'Paredes internas',
                          icone: Grid2x2,
                          ligado: mostrarParedesInternas,
                          alternar: () => setMostrarParedesInternas((v) => !v),
                          ajuda:
                            'Desligado, a elevação mostra só a silhueta e os vãos de fachada — o caso comum. Ligado, desenha também as paredes do miolo (sem remoção de linha oculta).',
                        },
                        {
                          chave: 'estrutura-elevacao',
                          rotulo: 'Estrutura',
                          icone: Square,
                          ligado: mostrarEstruturaVista,
                          alternar: () => setMostrarEstruturaVista((v) => !v),
                          desabilitado: editor.model.structures.length === 0,
                          ajuda:
                            editor.model.structures.length === 0
                              ? 'Não há peça estrutural desenhada — use o menu Componentes na planta baixa.'
                              : 'Pilares, vigas e lajes na fachada. A fundação aparece tracejada, abaixo da linha do solo.',
                        },
                      ]
                    : vistaDePlanta
                      ? [
                          {
                            chave: 'preenchimento-terreno-vista',
                            rotulo: 'Preenchimento do terreno',
                            icone: PaintBucket,
                            ligado: mostrarPreenchimentoTerreno,
                            alternar: () => setMostrarPreenchimentoTerreno((v) => !v),
                            ajuda: 'A hachura do lote. O resto do recorte desta vista é fixo — volte à Planta para ligar interiores, instalações e rótulos.',
                          },
                        ]
                      : [
                        {
                          chave: 'laje-3d',
                          rotulo: 'Piso / laje',
                          icone: RectangleHorizontal,
                          ligado: mostrarLaje3d,
                          alternar: () => setMostrarLaje3d((v) => !v),
                          ajuda: 'Uma laje fina no contorno externo de cada pavimento.',
                        },
                        {
                          chave: 'arestas-3d',
                          rotulo: 'Arestas',
                          icone: Spline,
                          ligado: mostrarArestas3d,
                          alternar: () => setMostrarArestas3d((v) => !v),
                          ajuda: 'Realça as quinas das paredes com um traço.',
                        },
                        {
                          chave: 'armadura-3d',
                          rotulo: 'Armadura',
                          icone: Grip,
                          ligado: mostrarArmadura3d,
                          alternar: () => setMostrarArmadura3d((v) => !v),
                          ajuda:
                            'As barras do esquema de armadura (mínimos NBR 6118 + taxa) dentro do concreto, que fica translúcido. Pré-quantitativo: sem dobras nem ancoragem.',
                        },
                        {
                          chave: 'terreno-3d',
                          rotulo: 'Terreno',
                          icone: LandPlot,
                          ligado: mostrarTerreno3d,
                          alternar: () => setMostrarTerreno3d((v) => !v),
                          desabilitado: !temTerreno,
                          ajuda: temTerreno
                            ? 'O polígono do lote como plano de chão, sob a edificação. O enquadramento passa a incluir o lote inteiro.'
                            : 'Não há divisa de terreno desenhada — use a ferramenta Terreno na planta baixa.',
                        },
                        {
                          chave: 'envelope-3d',
                          rotulo: 'Envelope edificável',
                          icone: Scale,
                          ligado: mostrarEnvelope3d,
                          alternar: () => setMostrarEnvelope3d((v) => !v),
                          desabilitado: !temTerreno,
                          ajuda: temTerreno
                            ? 'O prisma que a lei deixa construir, pavimento a pavimento: recuos, afastamento progressivo, faixas restritas e gabarito (vermelho acima dele). Translúcido, por cima da edificação.'
                            : 'Não há divisa de terreno desenhada — o envelope parte do lote.',
                        },
                      ],
                ]}
              />
            </GrupoDoRibbon>
            {/* Só quando há o que navegar: no 3D não há Enquadrar nem corte, e
                um grupo vazio com rótulo é uma promessa sem botão. */}
            {(vistaEhProjecao || corteAtual) && (
            <GrupoDoRibbon rotulo="Navegar">
              {vistaEhProjecao && (
                <button
                  type="button"
                  onClick={() => setEnquadrarVistaToken((t) => t + 1)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <MoveDiagonal className="h-3.5 w-3.5" />
                  Enquadrar
                </button>
              )}

              {/* INVERTER O LADO, AQUI — onde a pessoa descobre que precisa. O lado
                  errado só se percebe OLHANDO o corte; obrigar a voltar para a
                  planta e caçar a linha é pedir que se saia de onde está a
                  evidência (06/09/2026). */}
              {corteAtual && (
                <button
                  type="button"
                  onClick={() =>
                    editor.run({
                      type: 'SetCorteProps',
                      corteId: corteAtual.id,
                      olharPara: corteAtual.olharPara === 'ESQUERDA' ? 'DIREITA' : 'ESQUERDA',
                    })
                  }
                  title="Vira o corte para o outro lado. As setas na planta acompanham."
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Inverter o lado
                </button>
              )}
            </GrupoDoRibbon>
            )}
          </>
        )}

        {aba === 'vista' && !emVista && (
          <>
            {/* O QUE APARECE NO DESENHO. Um menu, e não onze botões: a explicação
                de cada item virou o `title`, porque a diferença entre Medidas,
                Cotas e Interna é exatamente o que se confunde. */}
            <GrupoDoRibbon rotulo="Exibir">
              {menuVista}
              <MenuExibir
                grupos={[
                  [
                    {
                      chave: 'medidas',
                      rotulo: 'Medidas das paredes',
                      icone: Ruler,
                      ligado: mostrarMedidas,
                      alternar: () => setMostrarMedidas((v) => !v),
                      ajuda:
                        'O comprimento de cada PAREDE, escrito junto dela. Mede a parede entre as faces das pontas DELA e ignora as divisórias que a cortam no meio — numa fachada que atravessa três cômodos, dá os três somados.',
                    },
                    {
                      chave: 'camadas',
                      rotulo: 'Camadas das paredes',
                      icone: Layers,
                      ligado: mostrarCamadas,
                      alternar: () => setMostrarCamadas((v) => !v),
                      ajuda:
                        'Pinta as faixas de material dentro da espessura — bloco, reboco, isolamento. Só aparece com zoom suficiente: em vista geral as faixas somariam menos de 12 px e virariam um borrão cinza. Parede sem composição continua sólida.',
                    },
                    {
                      chave: 'cotas',
                      rotulo: 'Cadeias de cota',
                      icone: MoveHorizontal,
                      ligado: mostrarCotas,
                      alternar: () => setMostrarCotas((v) => !v),
                      ajuda:
                        'Cota os LADOS da edificação, na borda do desenho: total pela face externa, parcial nos eixos das divisórias. Parede do miolo que não encosta no contorno não aparece aqui.',
                    },
                    {
                      chave: 'interna',
                      rotulo: 'Cota interna dos ambientes',
                      icone: MoveHorizontal,
                      ligado: mostrarCotaInterna,
                      alternar: () => setMostrarCotaInterna((v) => !v),
                      ajuda:
                        'Cota cada AMBIENTE por dentro, de face a face, desenhada no próprio cômodo. É a que responde "quanto tem esta cozinha?".',
                    },
                    {
                      chave: 'circuitos',
                      rotulo: 'Circuito nos pontos',
                      icone: Zap,
                      ligado: mostrarCircuitos,
                      alternar: () => setMostrarCircuitos((v) => !v),
                      ajuda:
                        'Escreve o circuito ao lado de cada ponto elétrico, e marca com um anel âmbar o ponto que ainda não está em circuito nenhum. É como uma prancha elétrica identifica a divisão — sem isto, saber a que circuito uma tomada pertence exige selecionar uma por uma.',
                    },
                    {
                      chave: 'nomes',
                      rotulo: 'Nome, área, nível e etiquetas',
                      icone: Tag,
                      ligado: mostrarRotulos,
                      alternar: () => setMostrarRotulos((v) => !v),
                      ajuda: 'Escreve nome, área, perímetro e cota de nível (±0,00) dentro de cada ambiente, e a etiqueta de cada esquadria (PT1, J2) ao lado do vão — a mesma numeração do navegador.',
                    },
                  ],
                  [
                    {
                      chave: 'grade',
                      rotulo: 'Grade',
                      icone: Grid2x2,
                      ligado: mostrarGrade,
                      alternar: () => setMostrarGrade((v) => !v),
                      ajuda:
                        'Desenha o quadriculado. ⚠️ Esconder a grade NÃO desliga o encaixe: o ponto continua caindo no passo escolhido em "Grade".',
                    },
                    {
                      chave: 'preenchimento',
                      rotulo: 'Preenchimento dos ambientes',
                      icone: PaintBucket,
                      ligado: mostrarPreenchimento,
                      alternar: () => setMostrarPreenchimento((v) => !v),
                      ajuda:
                        'A cor por dentro de cada ambiente derivado. Desligado, sobra só a geometria — útil para conferir o traçado contra a planta de fundo.',
                    },
                    {
                      chave: 'preenchimento-terreno',
                      rotulo: 'Preenchimento do terreno',
                      icone: LandPlot,
                      ligado: mostrarPreenchimentoTerreno,
                      alternar: () => setMostrarPreenchimentoTerreno((v) => !v),
                      // Desabilitado por AUSÊNCIA DE DIVISA, não por "lote não
                      // fechado": a prévia do traçado também é preenchida, então o
                      // toggle precisa estar vivo enquanto o lote está nascendo.
                      desabilitado: !limitesDoNivel.some((b) => b.kind === 'TERRENO'),
                      ajuda: limitesDoNivel.some((b) => b.kind === 'TERRENO')
                        ? 'O verde fraco por dentro do lote. Desligado, restam as divisas — é como se confere o traçado contra o levantamento topográfico ou a planta de fundo, sem perder a cor dos ambientes.'
                        : 'Não há divisa de terreno desenhada — use a ferramenta Terreno para criar o lote.',
                    },
                    {
                      chave: 'curvas-de-nivel',
                      rotulo: 'Curvas de nível',
                      icone: Mountain,
                      ligado: mostrarCurvasDeNivel,
                      alternar: () => setMostrarCurvasDeNivel((v) => !v),
                      desabilitado: !topografia.selecionada && topografia.pontosCotados.length === 0,
                      ajuda: topografia.selecionada
                        ? `Curvas da versão v${topografia.selecionada.versao} e os pontos cotados em edição. Mestras mais grossas, com a cota escrita.`
                        : 'Não há topografia gerada — em Ambientes › Terreno › Curvas de nível.',
                    },
                    {
                      chave: 'declividade',
                      rotulo: 'Declividade',
                      icone: TrendingUp,
                      ligado: mostrarDeclividade,
                      alternar: () => {
                        setMostrarDeclividade((v) => !v);
                        setMostrarHipsometria(false);
                      },
                      desabilitado: !topografia.selecionada,
                      ajuda: topografia.selecionada
                        ? 'Pinta cada célula da grade com a faixa de inclinação: verde até 5 %, amarelo até 15 %, laranja até 30 %, vermelho acima. A legenda com as áreas está no painel.'
                        : 'Não há topografia gerada.',
                    },
                    {
                      chave: 'hipsometria',
                      rotulo: 'Hipsométrico',
                      icone: Palette,
                      ligado: mostrarHipsometria,
                      alternar: () => {
                        setMostrarHipsometria((v) => !v);
                        setMostrarDeclividade(false);
                      },
                      desabilitado: !topografia.selecionada,
                      ajuda: topografia.selecionada
                        ? 'Pinta cada célula pela cota: 8 faixas iguais, faixas por equidistância, ou a rampa contínua arco-íris (azul no nível mais baixo, vermelho no mais alto). Desliga a declividade: as duas pinturas juntas não se leem.'
                        : 'Não há topografia gerada.',
                    },
                    {
                      chave: 'nos-da-grade',
                      rotulo: 'Nós da grade',
                      icone: Grid3x3,
                      ligado: mostrarNosDaGrade,
                      alternar: () => setMostrarNosDaGrade((v) => !v),
                      desabilitado: !topografia.selecionada,
                      ajuda: topografia.selecionada
                        ? 'Um pontinho em cada nó amostrado da grade, na cor da cota — onde a fonte foi lida (como o "plot sampling points" do Contour Map Creator).'
                        : 'Não há topografia gerada.',
                    },
                    {
                      chave: 'terraplenagem',
                      rotulo: 'Corte e aterro',
                      icone: Layers,
                      ligado: mostrarTerraplenagem,
                      alternar: () => setMostrarTerraplenagem((v) => !v),
                      desabilitado: !terraplenagemCalc,
                      ajuda: terraplenagemCalc
                        ? 'Hachura do platô: vermelho onde o terreno está acima da cota (corte), azul onde está abaixo (aterro). No corte, a linha tracejada azul é o platô.'
                        : 'Defina a cota do platô em Terreno › Corte e aterro.',
                    },
                    {
                      chave: 'envelope',
                      rotulo: 'Envelope construtivo',
                      icone: Hexagon,
                      ligado: mostrarEnvelope,
                      alternar: () => setMostrarEnvelope((v) => !v),
                      ajuda:
                        'A hachura diagonal da área construível — o terreno já descontado os recuos. É uma restrição calculada, separada do preenchimento do lote.',
                    },
                    {
                      chave: 'cores',
                      rotulo: 'Uma cor por ambiente',
                      icone: Palette,
                      ligado: modoDeCor === 'AMBIENTE',
                      // Atalho para o modo AMBIENTE do menu Vista; outras paletas ficam lá.
                      alternar: () => {
                        setCoresPorAmbiente(modoDeCor !== 'AMBIENTE');
                        setModoDeCor(modoDeCor === 'AMBIENTE' ? 'NENHUM' : 'AMBIENTE');
                      },
                      desabilitado: !mostrarPreenchimento,
                      ajuda: mostrarPreenchimento
                        ? 'Cada ambiente ganha uma cor da paleta, em vez do azul único — separa cômodos vizinhos de relance. A cor não significa tipo de cômodo: ela distingue.'
                        : 'Ligue "Preenchimento dos ambientes" primeiro — sem preenchimento não há o que colorir.',
                    },
                  ],
                  [
                    {
                      chave: 'contraste',
                      rotulo: 'Cota em alto contraste',
                      icone: Contrast,
                      ligado: cotaAltoContraste,
                      alternar: () => setCotaAltoContraste((v) => !v),
                      ajuda:
                        'Cota em preto sobre fundo branco opaco. Para planta de fundo escaneada carregada, em que até o cinza escuro se mistura ao desenho por baixo.',
                    },
                  ],
                ]}
              />
            </GrupoDoRibbon>

            <GrupoDoRibbon rotulo="Encaixe">
              <MenuEncaixe ativos={encaixesAtivos} onAlternar={alternarEncaixe} />
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Grade
                <select
                  value={passoGrade === null ? 'auto' : String(passoGrade)}
                  onChange={(e) =>
                    setPassoGrade(e.target.value === 'auto' ? null : Number(e.target.value))
                  }
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  title="Passo de encaixe. Em automático, acompanha o zoom."
                >
                  <option value="auto">Automática ({rotuloPasso(passoEmVigor)})</option>
                  {[10, 50, 100, 250, 500, 1000].map((mm) => (
                    <option key={mm} value={mm}>
                      {rotuloPasso(mm)}
                    </option>
                  ))}
                </select>
              </label>

              {/* PRECISÃO DO MOVER — separada da Grade de propósito.
                  A Grade em automático amarra o passo ao ZOOM: afastar a vista fazia o
                  arraste andar de 500 mm ou 1 m por vez, e nada na tela dizia por quê.
                  Fixando aqui, o passo do mover para de depender do zoom — e traçar
                  parede nova continua no passo da Grade. */}
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Precisão
                <select
                  value={passoMover === 'grade' ? 'grade' : String(passoMover)}
                  onChange={(e) =>
                    setPassoMover(e.target.value === 'grade' ? 'grade' : Number(e.target.value))
                  }
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  title="De quanto em quanto o que já está desenhado se desloca — arraste, alça de ponta e setas do teclado. Fixando um valor, deixa de depender do zoom."
                >
                  <option value="grade">Igual à grade ({rotuloPasso(passoEmVigor)})</option>
                  {/* 1 mm é o piso: o kernel só aceita coordenada inteira em mm. */}
                  {[1, 5, 10, 25, 50, 100, 500, 1000].map((mm) => (
                    <option key={mm} value={mm}>
                      {rotuloPasso(mm)}
                    </option>
                  ))}
                </select>
              </label>
            </GrupoDoRibbon>
          </>
        )}
      </Ribbon>
      </div>

      {/* ─── A BARRA DE OPÇÕES DA FERRAMENTA (a Options Bar do Revit) ──────────
          Só na planta baixa — em elevação, corte e 3D não se desenha. O que era
          "estado da barra" (as medidas da PRÓXIMA peça) continua aqui, com a
          mesma regra: o que já está lançado se edita no painel lateral. */}
      {!emVista && (
        <BarraDeOpcoes rotulo={rotuloDaFerramentaAtiva}>
          {editor.tool === 'quadra' ? (
            /* LOTEAMENTO (B1): o nome da PRÓXIMA quadra. Anda sozinho depois de
               cada uma (A, B, C…) — desenhar dez quadras digitando o nome de
               cada uma seria o trabalho que a ferramenta existe para tirar. */
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Quadra
              <input
                type="text"
                value={nomeDaQuadra}
                onChange={(e) => setNomeDaQuadra(e.target.value.slice(0, 30))}
                aria-label="Nome da próxima quadra"
                className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
              />
              <span className="text-slate-400">cliques nos vértices; volte ao 1º para fechar · a próxima segue a sequência</span>
            </label>
          ) : editor.tool === 'lote' ? (
            /* LOTEAMENTO (B1): o número do PRÓXIMO lote, e o tipo. A quadra não
               é campo: sai do desenho (a quadra que contém o lote). */
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                Lote nº
                <input
                  type="text"
                  value={numeroDoLote}
                  onChange={(e) => setNumeroDoLote(e.target.value.slice(0, 30))}
                  aria-label="Número do próximo lote"
                  className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
                />
              </label>
              <span className="text-slate-400">
                a quadra vem do desenho (a que contém o lote) · a testada é o lado que encosta na via · o próximo número segue a sequência
              </span>
            </div>
          ) : editor.tool === 'via' ? (
            /* LOTEAMENTO (B1): a CAIXA da via e o passeio. A prévia desenha a
               faixa, não só o eixo — é a largura que diz se a rua cabe. */
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                Via
                <input
                  type="text"
                  value={nomeDaVia}
                  onChange={(e) => setNomeDaVia(e.target.value.slice(0, 60))}
                  aria-label="Nome da próxima via"
                  className="w-24 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
                />
              </label>
              <label className="flex items-center gap-2">
                Caixa
                <select
                  value={larguraDaVia}
                  onChange={(e) => setLarguraDaVia(Number(e.target.value))}
                  aria-label="Largura da caixa da via"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  title="De alinhamento a alinhamento, passeio incluído. 12 m é o mínimo usual de via local em loteamento."
                >
                  {[8000, 10000, 12000, 14000, 16000, 20000, 25000, 30000].map((mm) => (
                    <option key={mm} value={mm}>
                      {(mm / 1000).toFixed(2).replace('.', ',')} m
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Passeio
                <select
                  value={calcadaDaVia}
                  onChange={(e) => setCalcadaDaVia(Number(e.target.value))}
                  aria-label="Largura do passeio de cada lado"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  title="De cada lado, DENTRO da caixa. 1,50 m é o mínimo acessível da NBR 9050; 2,00 m é o usual."
                >
                  {[0, 1500, 2000, 2500, 3000].map((mm) => (
                    <option key={mm} value={mm}>
                      {mm === 0 ? 'sem passeio' : `${(mm / 1000).toFixed(2).replace('.', ',')} m`}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-slate-400">cliques no EIXO; clique de novo no último vértice para terminar</span>
            </div>
          ) : editor.tool === 'area-publica' ? (
            /* LOTEAMENTO (B1): o tipo da próxima área pública. */
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Tipo
              <select
                value={tipoDeAreaPublica}
                onChange={(e) => setTipoDeAreaPublica(e.target.value as TipoDeAreaPublica)}
                aria-label="Tipo da próxima área pública"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                {TIPOS_DE_AREA_PUBLICA.map((t) => (
                  <option key={t} value={t}>
                    {FICHA_DA_AREA_PUBLICA[t].rotulo}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">cliques nos vértices; volte ao 1º para fechar</span>
            </label>
          ) : editor.tool === 'subregiao' ? (
            /* SUB-REGIÃO DO TERRENO (P2.19): o material da próxima. */
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Material
              <select value={materialDaSubRegiao} onChange={(e) => setMaterialDaSubRegiao(e.target.value as MaterialDeSubRegiao)} aria-label="Material da próxima sub-região" className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800">
                {MATERIAIS_DE_SUB_REGIAO.map((m) => (
                  <option key={m} value={m}>
                    {FICHA_DO_MATERIAL_DE_SUB_REGIAO[m].rotulo}
                    {FICHA_DO_MATERIAL_DE_SUB_REGIAO[m].permeavel ? ' · permeável' : ''}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">cliques nos vértices; volte ao 1º para fechar</span>
            </label>
          ) : editor.tool === 'anotacao' && tipoDeAnotacao === 'NUVEM' ? (
            /* NUVEM DE REVISÃO (P2.15): em que revisão a próxima nuvem nasce. */
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-1">
                Revisão nº
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={numeroDaRevisao}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (Number.isFinite(v) && v >= 1) setNumeroDaRevisaoEscolhido(v);
                  }}
                  aria-label="Número da revisão das próximas nuvens"
                  className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
                />
              </label>
              <span className="text-slate-400">
                {revisoesDoModelo(editor.model).length > 0
                  ? `revisões no desenho: ${revisoesDoModelo(editor.model).map((r) => `Δ${r.numero} (${r.nuvens})`).join(' · ')} · a descrição vai no painel da nuvem`
                  : 'primeira revisão do desenho · a descrição vai no painel da nuvem'}
              </span>
            </div>
          ) : editor.tool === 'escada' ? (
            /* A PROXIMA escada: largura e alvo de espelho. Sem campo de degraus,
               de proposito (ver `escada.ts`). */
            <CamposDaEscada
              tipo={tipoCirculacao}
              larguraMm={larguraEscada}
              onLargura={setLarguraEscada}
              alvoEspelhoMm={alvoEspelho}
              onAlvoEspelho={setAlvoEspelho}
            />
          ) : editor.tool === 'divisa' ? (
            /* O que a linha É (E3.1): limite solto que divide ambiente, ou faixa
               restrita do lote (APP, servidão…) com a largura padrão do tipo. */
            <>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                A linha é
                <select
                  value={kindDaDivisa}
                  onChange={(e) => setKindDaDivisa(e.target.value as 'DIVISA' | 'RESTRICAO')}
                  aria-label="O que a ferramenta Divisa desenha"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
                >
                  <option value="DIVISA">Limite solto</option>
                  <option value="RESTRICAO">Faixa restrita do lote</option>
                </select>
              </label>
              {kindDaDivisa === 'RESTRICAO' && (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  Tipo
                  <select
                    value={tipoDeRestricaoDoLote}
                    onChange={(e) => setTipoDeRestricaoDoLote(e.target.value as TipoDeRestricaoDoLote)}
                    aria-label="Tipo da faixa restrita a desenhar"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
                  >
                    {TIPOS_DE_RESTRICAO_DO_LOTE.map((t) => (
                      <option key={t} value={t}>
                        {ROTULO_DA_RESTRICAO_DO_LOTE[t]} · {(FAIXA_PADRAO_DA_RESTRICAO[t] / 1000).toFixed(0)} m
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : editor.tool === 'telhado' ? (
            /* A PRÓXIMA água: inclinação e beiral, mais o atalho do contorno. */
            <CamposDoTelhado
              inclinacaoPct={inclinacaoTelhado}
              onInclinacao={setInclinacaoTelhado}
              beiralMm={beiralTelhado}
              onBeiral={setBeiralTelhado}
              onGerarDoContorno={gerarTelhadoDoContorno}
              temParedes={componentesDoNivel.paredes.length > 0}
            />
          ) : editor.tool === 'cobertura-extrusao' ? (
            <CamposDaExtrusao valor={perfilDaExtrusao} onChange={setPerfilDaExtrusao} />
          ) : editor.tool === 'estrutural' ? (
            /* As medidas da PRÓXIMA peça. O que cada campo mostra depende da
               FORMA, não do tipo: profundidade só existe no PONTO, e nem lá
               quando a seção é redonda. */
            <CamposDaEstrutura
              kind={tipoEstrutural}
              medidas={medidasEstruturais}
              onMedidas={setMedidasEstruturais}
              rotulo={rotuloEstrutural}
              onRotulo={setRotuloEstrutural}
            />
          ) : editor.tool === 'abertura' ? (
            <>
              {/* O select "Tipo" saiu daqui em 31/08/2026: escolher entre porta,
                  janela e vão é o menu Componentes. O que fica é só o que o menu
                  NÃO diz — o tipo salvo, a folha da correr e a largura. */}
              {tipoAbertura !== 'passage' && (
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Tipo salvo
                  <select
                    value={tipoDaBarra?.id ?? ''}
                    onChange={(e) =>
                      setTipoDaBarra(tiposDeEsquadria.find((t) => t.id === e.target.value) ?? null)
                    }
                    aria-label="Tipo de esquadria salvo para a próxima abertura"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">Sem tipo</option>
                    {tiposDeEsquadria
                      .filter((t) => t.kind === tipoAbertura)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome} · {textoEmCm(t.widthMm)}×{textoEmCm(t.heightMm)} cm
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {/* O SUB-TIPO só aparece com correr escolhida. Um controle sempre
                  visível que não faz nada em três dos quatro tipos ensina o
                  usuário a ignorá-lo. */}
              {tipoAbertura === 'sliding' && (
                <label
                  className="flex items-center gap-2 text-xs text-slate-600"
                  title="Embutida: a folha entra num vão dentro da parede — exige parede preparada. Por fora: a folha corre sobre a face, e essa faixa de parede precisa ficar livre de armário, quadro e interruptor."
                >
                  Folha
                  <select
                    value={correrEmbutida ? 'embutida' : 'fora'}
                    onChange={(e) => setCorrerEmbutida(e.target.value === 'embutida')}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="fora">Corre por fora</option>
                    <option value="embutida">Embutida na parede</option>
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Largura
                <select
                  value={larguraAbertura}
                  onChange={(e) => setLarguraAbertura(Number(e.target.value))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {/* Em CENTÍMETROS (P2.46): a largura de vão se fala em cm
                      ("porta de 80"), e este seletor tem de dizer o mesmo que o
                      painel da abertura selecionada. O valor guardado continua
                      em milímetro — é o que o kernel aceita. */}
                  {[600, 700, 800, 900, 1000, 1200, 1500, 2000].map((mm) => (
                    <option key={mm} value={mm}>
                      {textoEmCm(mm)} cm
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : ehFerramentaDeParede ? (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Espessura
                <select
                  value={espessura}
                  onChange={(e) => setEspessura(Number(e.target.value))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {[100, 150, 200, 250].map((mm) => (
                    <option key={mm} value={mm}>
                      {mm} mm
                    </option>
                  ))}
                </select>
              </label>

              {/* ONDE O CLIQUE CAI. O kernel guarda a parede pelo EIXO, mas quem copia
                  uma planta de fundo aponta o CANTO — e com o clique no eixo a parede
                  nascia meia espessura para fora do que estava desenhado. */}
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Clique
                <select
                  value={alinhamento}
                  onChange={(e) => setAlinhamento(e.target.value as AlinhamentoParede)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  title="Onde o ponto clicado cai na parede. Pela face, o clique é o canto da parede e ela cresce toda para o lado escolhido — contorne no sentido do relógio com 'à direita' para a parede nascer para dentro. A BARRA DE ESPAÇO inverte o lado sem sair do desenho."
                >
                  <option value="DIREITA">Na face · parede à direita</option>
                  <option value="ESQUERDA">Na face · parede à esquerda</option>
                  <option value="EIXO">No eixo (meio da parede)</option>
                </select>
              </label>

              {editor.tool === 'poligono' && (
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  Lados
                  <select
                    value={ladosPoligono}
                    onChange={(e) => setLadosPoligono(Number(e.target.value))}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    title="Clique no centro e arraste até o MEIO DE UM LADO: o lado nasce perpendicular ao arraste, então com o orto ligado o polígono sai alinhado à planta. Os cantos saem mitrados e o contorno já fecha, derivando o ambiente."
                  >
                    {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : null}

          <span className="ml-auto flex items-center gap-2">
            {/* ORTO. Encaixar na grade NÃO impede parede torta: impede só que a
                ponta pare fora da grade. Um desvio de um passo é invisível na escala
                da tela e só aparece no CAD — ou na obra. Foi assim que uma parede
                saiu 200 mm fora do esquadro sem ninguém notar. */}
            <button
              type="button"
              onClick={() => setOrtogonal((v) => !v)}
              aria-pressed={ortogonal}
              title={
                ortogonal
                  ? 'Orto LIGADO: as paredes travam em 90°. Shift libera; F8 alterna.'
                  : 'Orto desligado: a parede segue o cursor. Shift trava; F8 alterna.'
              }
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                ortogonal
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
              Orto
            </button>

            {/* MANTER JUNÇÕES × SOLTAR. Só aparece na ferramenta de seleção: fora
                dela não há conjunto para mover, e um botão que não faz nada na
                ferramenta em uso é ruído. */}
            {editor.tool === 'selecionar' ? (
              <button
                type="button"
                onClick={() => setModoJuncao((v) => (v === 'MANTER' ? 'SOLTAR' : 'MANTER'))}
                aria-pressed={modoJuncao === 'MANTER'}
                title={
                  modoJuncao === 'MANTER'
                    ? 'MANTER JUNÇÕES: o que estava preso ao bloco acompanha, mudando de comprimento sem sair do esquadro. Onde a junção não puder ser mantida, um anel âmbar avisa durante o arraste.'
                    : 'SOLTAR: o bloco anda inteiro, mantendo as medidas. Onde encostava em parede não selecionada, desencosta — e o ambiente derivado dali some.'
                }
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  modoJuncao === 'MANTER'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {modoJuncao === 'MANTER' ? (
                  <MoveDiagonal className="h-3.5 w-3.5" />
                ) : (
                  <Move className="h-3.5 w-3.5" />
                )}
                {modoJuncao === 'MANTER' ? 'Manter junções' : 'Soltar'}
              </button>
            ) : null}
          </span>
        </BarraDeOpcoes>
      )}

      {somenteLeitura && (
        <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800" data-testid="aviso-somente-leitura">
          <Eye className="h-3.5 w-3.5" /> Você é <strong>leitor</strong> deste estudo: vê tudo, não altera nem publica. Um editor muda isso em Colaborar › Acesso.
        </div>
      )}
      {colab.avisos.length > 0 && (
        <div role="alert" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" data-testid="avisos-de-colaboracao">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{colab.avisos[0].texto}{colab.avisos.length > 1 ? ` (+${colab.avisos.length - 1})` : ''}</span>
          <button type="button" onClick={editor.reload} className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700">Recarregar do servidor</button>
          <button type="button" onClick={colab.dispensarAvisos} className="text-xs font-medium underline">dispensar</button>
        </div>
      )}
      {vistaDaEtapaAtual && (
        <div role="status" data-testid="faixa-etapa" className="flex items-start gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span className="flex-1">
            <strong>Etapa em vista: {vistaDaEtapaAtual.etapa.nome}</strong> — {vistaDaEtapaAtual.contagem.NOVO} nova(s), {vistaDaEtapaAtual.contagem.EXISTENTE} existente(s), {vistaDaEtapaAtual.contagem.DEMOLIR} a demolir; {vistaDaEtapaAtual.ocultos.size} peça(s) fora desta etapa.
          </span>
          <button type="button" onClick={() => setEtapaEmVista(null)} className="shrink-0 text-xs font-medium underline">
            todas as etapas
          </button>
        </div>
      )}
      {avisoDeTrava && (
        <div role="status" className="flex items-start gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700" data-testid="aviso-de-trava">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span className="flex-1">{avisoDeTrava}</span>
          <button type="button" onClick={() => setAvisoDeTrava(null)} className="text-xs font-medium underline">dispensar</button>
        </div>
      )}
      {editor.lastError && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{editor.lastError}</span>
          {editor.hasConflict ? (
            <button
              type="button"
              onClick={editor.reload}
              className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Recarregar do servidor
            </button>
          ) : (
            <button
              type="button"
              onClick={editor.clearError}
              className="text-xs font-medium underline"
            >
              dispensar
            </button>
          )}
        </div>
      )}

      {/* A conexão em T aconteceu SOZINHA, então ela tem de se anunciar.
          "Sem perguntar" foi decisão do usuário; "sem contar" seria outra coisa —
          o editor teria movido parede dele e nada na tela diria isso. AZUL, e não
          âmbar: não é problema pendente, é trabalho já feito. */}
      {/* PAVIMENTO TIPO (E2.1): no pavimento cópia, a arquitetura é do tipo —
          a faixa diz isso antes que o kernel recuse o primeiro clique. */}
      {nivelAtivoVinculado && (
        <div role="status" data-testid="faixa-pavimento-vinculado" className="flex items-start gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <Layers className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>{nivelAtivoVinculado.name}</strong> é cópia viva do pavimento tipo <strong>{nivelAtivoVinculado.tipo.name}</strong>: paredes, esquadrias,
            estrutura e telhado se editam no tipo e propagam para cá. Instalações e as propriedades do pavimento são próprias.
          </span>
          <button type="button" onClick={() => setNivelAtivoId(nivelAtivoVinculado.tipo.id)} className="shrink-0 text-xs font-medium underline">
            editar o tipo
          </button>
          <button
            type="button"
            onClick={() => editor.run({ type: 'SetLevelProps', levelId: nivelAtivoVinculado.id, tipoDeId: null })}
            className="shrink-0 text-xs font-medium underline"
          >
            desvincular
          </button>
        </div>
      )}

      {/* VISTA DEPENDENTE (P2.17): a faixa diz o recorte e deixa renomear, trocar a escala, redefinir o recorte e excluir. */}
      {vistaDependenteAtual && (
        <div role="status" data-testid="faixa-vista-dependente" className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-violet-50/60 px-4 py-2 text-sm text-slate-700">
          <Crop className="h-4 w-4 shrink-0 text-violet-600" />
          <strong>Vista dependente</strong>
          <span className="text-xs text-slate-500">
            · {editor.model.levels.find((l) => l.id === vistaDependenteAtual.levelId)?.name ?? ''} · recorte {((vistaDependenteAtual.recorte.maxX - vistaDependenteAtual.recorte.minX) / 1000).toFixed(2).replace('.', ',')} × {((vistaDependenteAtual.recorte.maxY - vistaDependenteAtual.recorte.minY) / 1000).toFixed(2).replace('.', ',')} m · o desenho continua editável; fora do recorte fica esmaecido
          </span>
          <label className="ml-2 flex items-center gap-1 text-xs">
            Nome
            <input
              key={vistaDependenteAtual.id}
              defaultValue={vistaDependenteAtual.nome}
              maxLength={60}
              aria-label="Nome da vista dependente"
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== vistaDependenteAtual.nome && editor.run({ type: 'SetVistaDependenteProps', vistaId: vistaDependenteAtual.id, nome: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="h-7 w-40 rounded-md border border-slate-300 px-2 text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-xs">
            Escala
            <select
              value={vistaDependenteAtual.denominador}
              onChange={(e) => editor.run({ type: 'SetVistaDependenteProps', vistaId: vistaDependenteAtual.id, denominador: Number(e.target.value) })}
              aria-label="Escala da vista dependente"
              className="h-7 rounded-md border border-slate-300 px-1 text-xs"
            >
              {ESCALAS.filter((d) => d >= 10).map((d) => (
                <option key={d} value={d}>
                  1:{d}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setRecorteArmado(vistaDependenteAtual.id)} className={`h-7 rounded-md border px-2 text-xs ${recorteArmado === vistaDependenteAtual.id ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {recorteArmado === vistaDependenteAtual.id ? 'Arraste o novo recorte…' : 'Redefinir recorte'}
          </button>
          <button
            type="button"
            onClick={async () => {
              const ok = await confirmar({ title: 'Excluir vista dependente', message: `Excluir a vista "${vistaDependenteAtual.nome}"? O desenho não muda — só o recorte some (e a prancha dele).`, confirmLabel: 'Excluir', variant: 'danger' });
              if (!ok) return;
              editor.run({ type: 'DeleteVistaDependente', vistaId: vistaDependenteAtual.id });
              setVista('planta');
            }}
            className="h-7 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700"
          >
            Excluir
          </button>
          <button type="button" onClick={() => setVista('planta')} className="ml-auto shrink-0 text-xs font-medium underline">
            voltar à planta
          </button>
        </div>
      )}

      {/* A VISTA DE PLANTA se anuncia (E0.3): qual é, o que esconde e em que
          pavimento — senão a pessoa procura a porta que "sumiu". */}
      {ajusteDaVista && (
        <div
          role="status"
          data-testid="faixa-vista-de-planta"
          className="flex items-start gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700"
        >
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span className="flex-1">
            <strong>{ajusteDaVista.rotulo}</strong>
            {nivelDaVistaDePlanta ? ` · ${nivelDaVistaDePlanta.name}` : ''} — {ajusteDaVista.descricao}
            {plantaDeDepartamentos && (
              <span className="ml-1 text-slate-500" data-testid="resumo-planta-de-departamentos">
                · {plantaDeDepartamentos.quadro.map((l) => `${l.departamento ?? 'sem departamento'} ${l.areaM2.toFixed(2).replace('.', ',')} m² (${l.pct.toFixed(1).replace('.', ',')} %)`).join(' · ') || 'nenhum ambiente fechado'}
              </span>
            )}
            {plantaDeForro && (
              <span className="ml-1 text-slate-500" data-testid="resumo-planta-de-forro">
                · {plantaDeForro.resumo.comForro} de {plantaDeForro.resumo.ambientes} ambiente(s) com forro declarado · {plantaDeForro.resumo.luminarias} luminária(s) de teto · {plantaDeForro.resumo.difusores} difusor(es)/grelha(s)
              </span>
            )}
          </span>
          <button type="button" onClick={() => setVista('planta')} className="shrink-0 text-xs font-medium underline">
            voltar à planta
          </button>
        </div>
      )}

      {avisoConexaoT && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{avisoConexaoT}</span>
          <button
            type="button"
            onClick={() => setAvisoConexaoT(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            dispensar
          </button>
        </div>
      )}

      {/* Recusa da junção. ÂMBAR e não vermelho: nada quebrou — o par apontado
          simplesmente não forma canto, e o texto diz para onde ir. Faixa própria,
          separada de `lastError`, porque `clearError` é do kernel e limpar um
          apagaria o outro. */}
      {avisoJuncao && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{avisoJuncao}</span>
          <button
            type="button"
            onClick={() => setAvisoJuncao(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            dispensar
          </button>
        </div>
      )}

      {/* Recado da colagem. Faixa própria pelo mesmo motivo da de junção: quem
          limpa uma não pode apagar a outra. Âmbar porque nada quebrou — ou não
          havia onde colar a abertura, ou o original já não existe. */}
      {avisoColar && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{avisoColar}</span>
          <button
            type="button"
            onClick={() => setAvisoColar(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            dispensar
          </button>
        </div>
      )}

      {/* A RECUSA DO CORTE, na mesma faixa do aviso de colar.
          Um corte que não aconteceu precisa dizer isso: sem o recado, o usuário
          escolhe "Cortar a parede", nada muda na tela, e ele conclui que o
          botão não funciona. */}
      {erroDoCorte && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{erroDoCorte}</span>
          <button
            type="button"
            onClick={() => setErroDoCorte(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            dispensar
          </button>
        </div>
      )}

      {/* Corpo */}
      {fundo.linha && fundo.underlay && (
        <ResumoDaAfericao
          linha={fundo.linha}
          underlay={fundo.underlay}
          onDeclararMmPorPixel={(mm) => void fundo.declararMmPorPixel(mm)}
        />
      )}
      {fundo.erro && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {fundo.erro}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* A coluna do desenho: o canvas em cima e, quando há, o DOCK de
            relatórios embaixo — na largura do canvas, que é a que tabela
            precisa (ver `DockDeRelatorios.tsx`). */}
        <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 min-w-0 flex-1">
          {/* Aferição: os dois pontos já foram clicados, falta a distância real.
              O diálogo aparece SOBRE o desenho, junto de onde o usuário acabou
              de clicar — mandá-lo procurar um campo na lateral quebraria o
              gesto no meio. */}
          {afericao && (
            <div className="absolute left-1/2 top-4 z-10 w-80 -translate-x-1/2 rounded-lg border border-amber-300 bg-white p-3 shadow-lg">
              <p className="text-xs font-semibold text-slate-800">
                Qual a distância real entre os dois pontos?
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Use uma cota escrita na planta. Quanto mais longa, melhor a aferição.
              </p>

              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  min="0"
                  value={distanciaDigitada}
                  onChange={(e) => setDistanciaDigitada(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') aplicarAfericao();
                    if (e.key === 'Escape') setAfericao(null);
                  }}
                  aria-label="Distância real em metros"
                  placeholder="0,00"
                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <span className="text-xs text-slate-600">metros</span>

                <button
                  type="button"
                  onClick={aplicarAfericao}
                  disabled={!(Number(distanciaDigitada) > 0)}
                  className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Aferir
                </button>
                <button
                  type="button"
                  onClick={() => setAfericao(null)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>

              <label className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={alinharNaAfericao}
                  onChange={(e) => setAlinharNaAfericao(e.target.checked)}
                />
                Estes dois pontos são horizontais (endireita a planta torta)
              </label>
            </div>
          )}

          {editor.loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando planta…
            </div>
          ) : vista === '3d' ? (
            <Blueprint3DTab
              model={editor.model}
              levelIds={levelIdsDaVista}
              mostrarLaje={mostrarLaje3d}
              mostrarArestas={mostrarArestas3d || estilo3d === 'LINHA_OCULTA'}
              estilo={estilo3d}
              armadura={mostrarArmadura3d ? { pecas: armadura.pecas, hipoteses: hipotesesDeArmadura } : undefined}
              // A guarda vive aqui, e não só no menu: o estado é persistido, e
              // ligar o terreno num estudo que tem lote e depois abrir outro que
              // não tem deixaria a combinação gravada no localStorage.
              mostrarTerreno={mostrarTerreno3d && temTerreno}
              envelope={mostrarEnvelope3d && temTerreno ? envelope3d?.prismas : undefined}
              sol={solNo3d}
              entorno={hipotesesDeInsolacao.solNo3d ? prismasDoEntornoDoEstudo : undefined}
              relevo={mostrarTerreno3d ? relevo3d : null}
              relevoChave={`${chaveDaTopografia}:${cotaZeroDoTerrenoM}`}
              alturaDoChao={mostrarTerreno3d ? alturaDoChao3d : undefined}
              extrasDoRelevo={mostrarTerreno3d ? extrasDoRelevo3d : null}
              extrasChave={extrasDoRelevo3dChave}
              ocultos={ocultosNoDesenho}
              coresPorUid={coresPorUid.size > 0 ? coresPorUid : undefined}
              // A MESMA seleção do canvas 2D, e o mesmo `selecionar`: escolher
              // uma parede no 3D e voltar para a planta tem de mostrar a mesma
              // peça marcada. Duas seleções paralelas seriam duas verdades.
              selecionados={new Set(editor.selectedIds)}
              onSelecionar={selecionarEAbrir}
            />
          ) : vistaEhProjecao ? (
            <ElevationCanvas
              model={editor.model}
              // No corte a direcao sai da LINHA e esta prop e ignorada; a de
              // frente entra so para satisfazer o tipo.
              direcao={DIRECAO_DA_VISTA[vista] ?? 'FRENTE'}
              corte={corteAtual}
              levelIds={levelIdsDaVista}
              mostrarCotasAltura={mostrarCotasAltura}
              mostrarRotulosEsquadria={mostrarRotulosEsquadria}
              mostrarParedesInternas={mostrarParedesInternas}
              mostrarEstrutura={mostrarEstruturaVista}
              enquadrarToken={enquadrarVistaToken}
              // O mesmo toggle "Curvas de nível" da planta governa o perfil no
              // corte: é uma camada só, vista de dois jeitos.
              terreno={mostrarCurvasDeNivel ? terrenoParaCorteComPlato : null}
              terrenoChave={`${chaveDaTopografia}:${cotaZeroDoTerrenoM}:${mostrarTerraplenagem ? cotaDoPlatoM : ''}:${terraplenagem.base}:${JSON.stringify(terraplenagem.parametros)}`}
            />
          ) : (
            <BlueprintCanvas
              encaixesAtivos={encaixesAtivos}
              mostrarCircuitos={ajusteDaVista ? false : mostrarCircuitos}
              model={editor.model}
              tool={vistaDePlanta ? 'selecionar' : editor.tool}
              levelId={nivelDaVistaDePlanta ? nivelDaVistaDePlanta.id : levelId}
              selectedIds={editor.selectedIds}
              // Clique no desenho abre as propriedades no Sheet sem véu
              // (17/09/2026: *"o mesmo comportamento deve ocorrer quando eu
              // clico em um componente na planta"*); o desenho segue vivo.
              onSelecionar={selecionarEAbrir}
              onSelecionarPeca={(id) => {
                selecionarSoAPeca(id);
                setPropriedadesEmSheet(true);
              }}
              onMoverSelecao={moverSelecao}
              onMoverMedicoes={moverMedicoes}
              manterJuncoes={modoJuncao === 'MANTER'}
              destaqueDePonta={
                paredeSel && pontaDestacada ? { wallId: paredeSel.id, end: pontaDestacada } : null
              }
              onAddWall={adicionarParede}
              alinhamento={alinhamento}
              ladosPoligono={ladosPoligono}
              onAddPoligono={adicionarPoligono}
              onInverterLado={() => setAlinhamento(inverterLado)}
              onAddOpening={adicionarAbertura}
              larguraAberturaMm={larguraAbertura}
              onDelete={removerSelecionada}
              onCopiar={copiar}
              onColar={colar}
              espessuraMm={espessura}
              passoGradeMm={passoGrade}
              onPassoEfetivo={setPassoEmVigor}
              vaos={vaosCandidatos.vaos}
              // O cursor na lista manda; na falta dele, quem acende é a
              // SELEÇÃO. Sem a segunda metade, clicar "Vão 3" selecionava as
              // duas paredes e o vão entre elas — que é justamente o assunto da
              // linha — continuava apagado no desenho.
              vaoEmDestaque={vaoEmDestaque ?? primeiroVaoDaSelecao}
              pontasSoltas={vaosCandidatos.soltas}
              pontaEmJuncao={pontaEmJuncao}
              onEscolherPontaJuncao={(ponta) => {
                setPontaEmJuncao(ponta);
                // Escolher de novo limpa a recusa anterior: o aviso é sobre o par
                // que falhou, e ele deixou de existir.
                setAvisoJuncao(null);
              }}
              onJuntarPontas={juntarPontas}
              ortogonal={ortogonal}
              mostrarMedidasParedes={ajusteDaVista ? false : mostrarMedidas}
              mostrarCamadasParedes={ajusteDaVista ? false : mostrarCamadas}
              mostrarCotas={ajusteDaVista ? ajusteDaVista.mostrarCotas : mostrarCotas}
              mostrarCotaInterna={ajusteDaVista ? false : mostrarCotaInterna}
              mostrarRotulosAmbiente={ajusteDaVista ? vistaDePlanta === 'departamentos' : mostrarRotulos}
              rotulosDeAmbiente={rotulosDeAmbiente}
              ambientesComForro={plantaDeForro?.comForro}
              etiquetasDeAbertura={etiquetasDeAbertura}
              paredesGeminadas={quadroDeUnidadesDoModelo.paredesGeminadas}
              mobiliario={mobiliarioParaOCanvas}
              mostrarGrade={ajusteDaVista ? false : mostrarGrade}
              mostrarPreenchimentoAmbientes={ajusteDaVista ? vistaDePlanta === 'departamentos' : mostrarPreenchimento}
              mostrarPreenchimentoTerreno={mostrarPreenchimentoTerreno}
              curvasDeNivel={mostrarCurvasDeNivel ? topografia.selecionada?.curvas : undefined}
              // Os pontos aparecem enquanto se digita, só na fonte que os usa:
              // com o DEM escolhido, pontos antigos na tela seriam ruído.
              pontosCotados={
                mostrarCurvasDeNivel && topografia.fonte.tipo === 'LOCAL'
                  ? topografia.pontosCotados
                  : undefined
              }
              declividade={
                mostrarDeclividade && declividade && topografia.selecionada
                  ? { grade: topografia.selecionada.grade, faixaDaCelula: declividade.faixaDaCelula }
                  : null
              }
              terraplenagem={
                mostrarTerraplenagem && terraplenagemCalc && topografia.selecionada
                  ? {
                      grade: topografia.selecionada.grade,
                      ladoDaCelula: terraplenagemCalc.ladoDaCelula,
                      muros: terraplenagemCalc.muros.map((m) => ({ a: m.a, b: m.b, normal: m.normal })),
                    }
                  : null
              }
              drenagem={
                mostrarCurvasDeNivel && terraplenagem.drenagem.length > 0
                  ? { linhas: terraplenagem.drenagem, ativa: drenagemAtiva, atende: atendeDrenagem }
                  : null
              }
              onDrenagemTracada={(pontos) => {
                const id = terraplenagem.adicionarDrenagem(pontos);
                if (id) setDrenagemAtiva(id);
                editor.setTool('selecionar');
              }}
              hipsometria={
                mostrarHipsometria && hipsometria && topografia.selecionada
                  ? {
                      grade: topografia.selecionada.grade,
                      classeDaCelula: hipsometria.classeDaCelula,
                      cores: hipsometria.classes.map((c) => c.cor),
                    }
                  : null
              }
              corDaCurva={mostrarCurvasDeNivel && curvasPelaCota && topografia.selecionada ? corDaCota : null}
              nosDaGrade={
                mostrarNosDaGrade && topografia.selecionada ? { grade: topografia.selecionada.grade, cor: corDaCota } : null
              }
              curvaEmDestaque={mostrarCurvasDeNivel ? curvaEmDestaque : null}
              onClicarCurva={(indice, ponto) =>
                setCurvaEmDestaque(indice === null ? null : { indice, ponto })
              }
              linhasDoPerfil={mostrarCurvasDeNivel ? linhasDoPerfil : null}
              linhaDoPerfilAtiva={usaLinhaDesenhada ? indiceDaLinha : null}
              onPerfilTracado={(pontos) => {
                const indice = terraplenagem.adicionarLinhaDoPerfil(pontos);
                if (indice >= 0) {
                  setLinhaDoPerfilIndice(indice);
                  setOrigemDoPerfil('LINHA');
                }
                // A linha nasceu: volta à seleção, como fecha-se o lote.
                editor.setTool('selecionar');
              }}
              // Só colore se houver preenchimento. A guarda vive aqui, e não só
              // no menu: o estado é persistido, e ligar Cores e depois desligar
              // Preenchimento deixaria a combinação gravada no localStorage.
              coresPorAmbiente={mostrarPreenchimento && modoDeCor === 'AMBIENTE'}
              coresDosAmbientes={vistaDePlanta === 'departamentos' || (mostrarPreenchimento && modoDeCor !== 'NENHUM') ? coresDoDesenho.porAmbiente : undefined}
              humanizada={humanizada}
              fases={fasesDoDesenho}
              selecoesRemotas={selecoesRemotas}
              pisosHumanizados={mostrarPreenchimento ? pisosDoDesenho : undefined}
              vegetacao={vegetacaoDoDesenho}
              cotaAltoContraste={cotaAltoContraste}
              passoMoverMm={passoMover === 'grade' ? null : passoMover}
              onMoveVertex={moverPonta}
              envelope={envelope?.valido ? envelope.anel : []}
              envelopePecas={envelope?.valido ? envelope.pecas : undefined}
              mostrarEnvelope={ajusteDaVista ? ajusteDaVista.mostrarEnvelope : mostrarEnvelope}
              onAddLimite={adicionarLimite}
              kindDaDivisa={kindDaDivisa}
              faixasRestritas={faixasRestritasDoNivel}
              onMoveBoundaryVertex={moverPontaLimite}
              limiteEmDestaque={limiteEmDestaque}
              onMoveOpening={moverAbertura}
              estruturalKind={tipoEstrutural}
              onAddEstrutural={adicionarEstrutural}
              onMoveStructuralVertex={moverPontaEstrutural}
              onAddAgua={adicionarAgua}
              onMoveAguaVertex={moverPontaAgua}
              onAddCorte={adicionarCorte}
              onAddEixo={adicionarEixo}
              onMoveCorteVertex={moverPontaCorte}
              onAddEscada={adicionarEscada}
              nucleos={nucleosDoNivelAtivo}
              onAddNucleo={adicionarNucleo}
              rodapes={editor.model.rodapes ?? []}
              onAddRodape={adicionarRodape}
              subRegioes={(editor.model.subRegioes ?? []).filter((s) => s.levelId === levelId)}
              materialDaSubRegiao={materialDaSubRegiao}
              onAddSubRegiao={adicionarSubRegiao}
              larguraDaVia={larguraDaVia}
              lotesPropostos={tarefaAberta === 'lotear' ? (propostaDeSubdivisao?.lotes.map((l) => l.pontos) ?? null) : null}
              onAddQuadra={adicionarQuadra}
              onAddLote={adicionarLote}
              onAddVia={adicionarVia}
              onAddAreaPublica={adicionarAreaPublica}
              vagas={vagasDoNivelAtivo}
              tipoDeVaga={tipoDeVaga}
              onAddVaga={adicionarVaga}
              componentes={componentesDoNivelAtivo}
              tipoDeComponente={tipoDeComponente}
              onAddComponente={adicionarComponente}
              tipoDeGuardaCorpo={tipoDeGuardaCorpo}
              onAddGuardaCorpo={adicionarGuardaCorpo}
              onAddParedeCurva={adicionarParedeCurva}
              onAddCoberturaExtrusao={adicionarCoberturaExtrusao}
              vaoDaExtrusaoMm={perfilDaExtrusao.vaoMm}
              anotacoes={anotacoesDoNivelAtivo}
              tipoDeAnotacao={tipoDeAnotacao}
              onAddAnotacao={adicionarAnotacao}
              onAddTrecho={adicionarTrecho}
              redeEmUmClique={prumadaDeRede != null}
              onAddTerminal={adicionarTerminal}
              onAddQuadro={adicionarQuadro}
              onMoveEscadaVertex={moverPontaEscada}
              fundo={
                fundo.imagem && fundo.underlay
                  ? {
                      imagem: fundo.imagem,
                      underlay: fundo.underlay,
                      opacidade: fundo.opacidade,
                    }
                  : null
              }
              // O id da prancha ATIVA, e não um gatilho de "enquadre agora":
              // importar e trocar de prancha mudam o id (e devem enquadrar),
              // aferir a escala mantém o id (e não deve — recalibrar pivota
              // em `p1` justamente para o traçado não se mexer).
              enquadrarPrancha={fundo.ativaId}
              navegacao={navegacao}
              onVistaMudou={setLimitesDaVista}
              // A arma morre junto com a TAREFA (era: junto com a seção; antes,
              // com a aba). Sem este recorte, armar e fechar "Do PDF" deixaria
              // o próximo arraste em QUALQUER ferramenta virar uma marcação de
              // região invisível — o botão que a armou não está mais na tela
              // para explicar o que aconteceu.
              regiaoArmada={((tarefaAberta === 'gerar-paredes' || tarefaAberta === 'importar-dxf') && regiaoArmada) || recorteArmado !== null}
              recorteDaVista={vistaDependenteAtual ? { ...vistaDependenteAtual.recorte, nome: vistaDependenteAtual.nome, denominador: vistaDependenteAtual.denominador } : null}
              vistasDependentesDoNivel={vistaDependenteAtual ? [] : (editor.model.vistasDependentes ?? []).filter((v) => v.levelId === levelId)}
              // A região só aparece com a tarefa que a usa aberta. Desenhá-la
              // sempre deixaria um retângulo violeta sobre a planta enquanto se
              // traça parede, sem nada na tela explicando de onde ele veio.
              regiao={tarefaAberta === 'gerar-paredes' || tarefaAberta === 'importar-dxf' ? regiao : null}
              pecasPrevistas={pecasPrevistas}
              ocultos={ocultosNoCanvas}
              onRegiaoDefinida={(r) => {
                // VISTA DEPENDENTE (P2.17): o arraste armado pelo botão cria (ou
                // redefine) o recorte; nada a ver com a região de geração.
                if (recorteArmado !== null) {
                  const alvo = recorteArmado;
                  setRecorteArmado(null);
                  if (!r || !levelId) return;
                  const recorte = { minX: Math.round(r.x0), minY: Math.round(r.y0), maxX: Math.round(r.x1), maxY: Math.round(r.y1) };
                  if (alvo === 'nova') {
                    const n = (editor.model.vistasDependentes ?? []).length + 1;
                    const criados = editor.run({ type: 'AddVistaDependente', levelId, nome: `Vista ${n}`, recorte, denominador: 50 });
                    const id = criados.find((x) => x.startsWith('vdp'));
                    if (id) setVista(`dependente:${id}`);
                  } else {
                    editor.run({ type: 'SetVistaDependenteProps', vistaId: alvo, recorte });
                  }
                  return;
                }
                // `null` = desistiu do gesto. Só desarma — apagar a região
                // confirmada por causa de um Escape seria perder trabalho.
                setRegiaoArmada(false);
                if (r) setRegiao(r);
                // O drawer do "Do PDF" volta, com ou sem região marcada.
                setDrawerRecolhido(false);
              }}
              onCalibrar={(p1, p2) => setAfericao({ p1, p2 })}
              medicoes={medicoesVisiveis}
              medicaoSelecionada={medicoes.selecionada}
              onMedicaoPronta={(tipo, pontos) => void medicoes.criar(tipo, pontos)}
            />
          )}

          {/* PRÉVIA DOS PILARES NO DESENHO (15/09/2026). A gaveta é modal e
              cobre o canvas com o véu; "Ver prévia no desenho" a recolhe, e
              esta pílula é o caminho de volta — ou de lançar dali mesmo. */}
          {previaRecolhida && (
            <div
              role="status"
              className="absolute bottom-14 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[10px] border border-blue-200 bg-white/95 px-3 py-2 text-sm text-slate-700 shadow-lg"
            >
              <previaRecolhida.Icone className="h-4 w-4 text-blue-700" />
              <span>
                Prévia: <strong>{previaRecolhida.n}</strong> {previaRecolhida.nome} em azul tracejado.
              </span>
              <button
                type="button"
                onClick={() => setDrawerRecolhido(false)}
                className="rounded-[6px] border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar à gaveta
              </button>
              <button
                type="button"
                onClick={() => {
                  previaRecolhida.lancar();
                  setDrawerRecolhido(false);
                }}
                disabled={previaRecolhida.n === 0}
                className="rounded-[6px] bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Lançar {previaRecolhida.n} {previaRecolhida.nome}
              </button>
            </div>
          )}
        </div>

        {/* ─── O DOCK DE RELATÓRIOS (F3) ──────────────────────────────────────
            Um por vez, aberto pelo ribbon (Analisar, Colaborar, Instalações).
            Cada painel aqui é o MESMO que morava no acordeão lateral; só a
            morada mudou — e a largura, que agora é a do canvas. */}
        {relatorioNoDock && (
          <DockDeRelatorios
            titulo={RELATORIOS_DO_DOCK[relatorioNoDock].rotulo}
            dock={dock}
            onFechar={() => setRelatorio(null)}
          >
            {relatorioAberto === 'comentarios' && (
              <PainelComentarios
                model={editor.model}
                studyId={study.id}
                // ⚠️ `orgId` do seletor do topo, e NÃO `study.organization_id` —
                // a mesma regra que o resto do editor segue (REGRA #5).
                organizationId={orgId ?? study.organization_id}
                selecionadoUid={uidDoSelecionado}
                selecionadoRotulo={rotuloDoSelecionado}
                pontoPadrao={pontoDoSelecionado}
                membros={membrosDaOrgDoEstudo}
              />
            )}

            {relatorioAberto === 'versoes' && (
              <PainelVersoes
                // A chave reinicia o painel quando "Exportar a vista atual" é
                // clicado noutra vista: o estado inicial é lido uma vez só.
                key={pranchaParaExportar?.join('|') ?? 'versoes'}
                pranchasIniciais={pranchaParaExportar}
                study={study}
                custoPorUid={custoPorUid}
                hipotesesEletricas={hipotesesEletricas}
                hipotesesDeArmadura={hipotesesDeArmadura}
                // As curvas vão para o DXF da prancha nas camadas TOPO-*, no
                // mesmo mm da planta — a versão EXIBIDA, que é a que se vê.
                topografia={
                  topografia.selecionada
                    ? {
                        curvas: topografia.selecionada.curvas,
                        pontosCotados: topografia.selecionada.pontos_cotados,
                        // Fase 8: drenagem e muros nas camadas TOPO-DRENAGEM / TOPO-MURO.
                        drenagem: terraplenagem.drenagem.map((l) => ({ nome: l.nome, pontos: l.pontos })),
                        muros: (terraplenagemCalc?.muros ?? []).map((m) => ({ a: m.a, b: m.b, normal: m.normal })),
                      }
                    : undefined
                }
              />
            )}
          </DockDeRelatorios>
        )}
        </div>

        {/* Painel lateral — é aqui que a planta vira navegável por teclado. */}
        {/* 307 px = 384 × 0,8. Encolhido em 20% a pedido (27/08/2026): a área de
            desenho é o produto desta tela, e o painel é referência. Desde
            29/08/2026 esse número é só o PADRÃO: a largura é arrastável pelo
            puxador da borda esquerda (`LarguraDoPainel.tsx`), e o duplo clique
            nele volta para cá. */}
        {/* ROLAGEM ÚNICA, e é consequência do accordion multi-aberto: antes
            Pavimentos e a barra de abas eram `shrink-0` e só o conteúdo rolava.
            Com SETE seções irmãs podendo estar abertas ao mesmo tempo, a soma
            passa da altura da tela, e um `overflow-hidden` aqui recortaria a
            última — o mesmo defeito que a antiga barra de abas já teve duas
            vezes (ver `AbasDoPainel`, ainda usado pelo spike de medições). */}
        {/* A caixa é quem tem a largura; o puxador se ancora nela por `absolute`
            e o `<aside>` rola por dentro. Pôr o puxador DENTRO do `<aside>` o
            faria rolar junto com o conteúdo e sumir da vista. */}
        <div ref={caixaDoPainel} className="relative shrink-0" style={{ width: larguraDoPainel }}>
          <PuxadorDeLargura />
          {/* ─── O PAINEL ENXUTO (F2) ─────────────────────────────────────────
              Duas metades, como Project Browser + Properties do Revit:
              em cima o NAVEGADOR (pavimentos, componentes, ambientes — o que
              existe no desenho), embaixo as PROPRIEDADES da seleção ou a
              TAREFA aberta pelo ribbon. Comandos foram para o ribbon;
              relatórios, para o dock. As quinze seções viraram três. */}
          <aside
            className="flex h-full min-h-0 flex-col border-l border-slate-200 bg-white"
            aria-label="Navegador e propriedades"
          >
          <div role="region" aria-label="Navegador" className="min-h-0 flex-1 overflow-y-auto">
          {/* SEÇÕES ORDENÁVEIS (17/09/2026: *"implemente sortable no painel
              lateral"*): a alça no cabeçalho arrasta a seção; a ordem fica no
              navegador (`blueprint:ordemDasSecoes`), como o aberto/fechado. Os
              blocos são os mesmos de antes — só a ORDEM em que aparecem mudou de
              lugar: sai do JSX fixo e vai para `ordemDasSecoes`. */}
          <DndContext sensors={sensoresDasSecoes} collisionDetection={closestCenter} onDragEnd={aoSoltarSecao}>
            <SortableContext items={ordemVisivel} strategy={verticalListSortingStrategy}>
              {ordemVisivel.map((idDaSecao) => (
                <SecaoOrdenavel key={idDaSecao} id={idDaSecao}>
                  {(alca) => (
                    <>
          {idDaSecao === 'pavimentos' && (
          <SecaoAccordion alca={alca}
            titulo="Pavimentos"
            contagem={editor.model.levels.length}
            aberta={secoes.pavimentos}
            onAlternar={() => alternarSecao('pavimentos')}
            acoes={
              !adicionandoPavimento && (
                <button
                  type="button"
                  onClick={() => {
                    // Abre a seção junto: pedir um pavimento novo com a seção
                    // fechada esconderia o formulário que acabou de nascer.
                    setSecoes((s) => ({ ...s, pavimentos: true }));
                    setAdicionandoPavimento(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              )
            }
          >
            <PainelPavimentos
              model={editor.model}
              modoVista={emVista}
              nivelAtivoId={levelId}
              onEscolherAtivo={setNivelAtivoId}
              niveisVisiveis={niveisVisiveis}
              onNiveisVisiveis={setNiveisVisiveis}
              run={editor.run}
              adicionando={adicionandoPavimento}
              onAdicionando={setAdicionandoPavimento}
            />
          </SecaoAccordion>
          )}
          {idDaSecao === 'componentes' && secaoVisivel('componentes') && (
            <SecaoAccordion alca={alca}
              titulo="Componentes"
              contagem={
                em3d
                  ? componentesDo3d.reduce((n, b) => n + b.linhas.length, 0)
                  : // O mesmo total que o painel escreve ("161 peças neste pavimento"):
                    // contar só parede/abertura/estrutura deixava o cabeçalho em 79
                    // ao lado de um corpo que dizia 161 (visto em 16/09/2026).
                    componentesDoNivel.paredes.length +
                    componentesDoNivel.aberturas.length +
                    componentesDoNivel.estruturas.length +
                    componentesDoNivel.aguas.length +
                    componentesDoNivel.escadas.length +
                    componentesDoNivel.rede.trechos.length +
                    componentesDoNivel.rede.terminais.length +
                    componentesDoNivel.rede.quadros.length
              }
              aberta={secoes.componentes}
              onAlternar={() => alternarSecao('componentes')}
              acoes={
                // A saída de emergência de quem escondeu trinta peças e não quer
                // reacender uma a uma. Só aparece quando há o que devolver.
                ocultosNoDesenho.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOcultosNoDesenho(new Set())}
                    className="inline-flex items-center gap-1 rounded-[6px] border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <Eye className="h-3 w-3" /> Mostrar tudo
                  </button>
                ) : undefined
              }
            >
              {/* Só o INVENTÁRIO: as propriedades da peça selecionada moram na
                  metade de baixo do painel desde o F2 — o slot `propriedades`
                  deixou de ser passado. */}
              <PainelComponentes
                paredes={componentesDoNivel.paredes}
                aberturas={componentesDoNivel.aberturas}
                estruturas={componentesDoNivel.estruturas}
                aguas={componentesDoNivel.aguas}
                escadas={{ model: editor.model, itens: componentesDoNivel.escadas, nucleos: nucleosDoNivelAtivo, vagas: vagasDoNivelAtivo, componentes: componentesDoNivelAtivo, guardaCorpos: guardaCorposDoNivelAtivo }}
                rede={componentesDoNivel.rede}
                selecionados={editor.selectedIds}
                // Pela LISTA, as propriedades abrem em Sheet (17/09/2026).
                onSelecionar={selecionarEAbrir}
                onSelecionarPeca={(id) => {
                  selecionarSoAPeca(id);
                  setPropriedadesEmSheet(true);
                }}
                onExcluir={excluirComponente}
                // No 3D a lista troca de fonte (os pavimentos empilhados); o olho
                // vale nas duas vistas, e desde 16/09/2026 a linha também
                // SELECIONA no 3D — a peça acende na cena e as propriedades
                // abrem embaixo, como na planta.
                blocos={em3d ? componentesDo3d : undefined}
                ocultos={ocultosNoDesenho}
                onAlternarOculto={alternarOcultoNoDesenho}
              />
            </SecaoAccordion>
          )}

          {idDaSecao === 'ambientes' && secaoVisivel('ambientes') && (
          <SecaoAccordion alca={alca}
            titulo="Ambientes"
            contagem={ambientes.length}
            aberta={secoes.ambientes}
            onAlternar={() => alternarSecao('ambientes')}
          >
          <div>
          <div className="border-b border-slate-200 px-4 py-2">
            {/* Sem <h2> "Ambientes": o cabeçalho da seção já o diz. Sobra o
                subtítulo, que carrega o que o título não conta. */}
            <p className="text-xs text-slate-500">
              Derivados da topologia — não são desenhados à mão.
            </p>
          </div>

          {/* O TERRENO saiu daqui (F2): é tarefa — "Dados do lote", na aba
              Terreno do ribbon — e propriedade da divisa selecionada. Aqui
              ficou o que a topologia DERIVA do desenho: os vãos que impedem o
              anel de fechar e a lista de ambientes. */}
          {vaosCandidatos.soltas.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800">
                <strong>{vaosCandidatos.soltas.length} ponta(s) solta(s).</strong> Enquanto
                houver ponta sem encontro, o contorno não fecha e o ambiente não aparece.
              </p>

              {/* CONECTAR SOB DEMANDA.
                  O passe automático roda uma vez, no carregamento — de propósito,
                  porque rodar a cada mudança puxaria a ponta para o eixo no meio
                  do gesto de quem está arrastando. Só que EDITAR CRIA ENCOSTO
                  NOVO, e sem este botão não havia como pegá-lo: a planta ia
                  acumulando junção falsa até o próximo carregamento.

                  E a ferramenta Juntar não substitui isto. Numa planta real as
                  duas pontas de um canto ficavam a 10 mm uma da outra; o raio de
                  clique é 9 px, então em zoom de trabalho as duas bolinhas SÃO o
                  mesmo pixel. O usuário teve de ampliar ao extremo para vê-las
                  separadas, e ainda assim errar o alvo cancelava a escolha. Um
                  botão não erra a mira. */}
              <button
                type="button"
                onClick={conectarAgora}
                title="Encosta as pontas que já se sobrepõem no desenho, sem precisar mirar"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                <CornerDownRight className="h-3.5 w-3.5" />
                Conectar automaticamente
              </button>

              {/* A PAREDE QUE TERMINA NO VAZIO (P2.42).
                  "Conectar automaticamente" só encosta o que já se sobrepõe — a ponta
                  tem de estar dentro da faixa desenhada da outra parede. A parede que
                  morre a meio metro do encontro não é alcançada por ele, e no desenho
                  ela nem parece ligada: é a situação do print de 23/09/2026. Aqui a
                  ponta é esticada NA PRÓPRIA DIREÇÃO até cruzar a parede que estava à
                  frente, com teto de 1,2 m — acima disso é vão, não canto mal fechado. */}
              {extensoes.length > 0 && (
                <button
                  type="button"
                  onClick={estenderAgora}
                  title="Estica a ponta na direção da própria parede até encontrar a parede que está à frente (até 1,2 m)"
                  className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  data-testid="estender-pontas"
                >
                  <MoveHorizontal className="h-3.5 w-3.5" />
                  Terminar {extensoes.length} parede(s) até encontrar
                </button>
              )}

              {/* O BECO SEM SAÍDA, nomeado.
                  Sem isto o usuário vê a bolinha âmbar, clica no botão acima,
                  nada acontece, e o painel não diz por quê — porque eixos
                  paralelos não se cruzam e não há canto para calcular. */}
              {juntasParalelas.length > 0 && (
                <p className="mt-2 border-t border-amber-200 pt-2 text-xs text-amber-800">
                  <strong>
                    {juntasParalelas.length}{' '}
                    {juntasParalelas.length === 1 ? 'ponta encostava' : 'pontas encostavam'} em algo{' '}
                    <span className="whitespace-nowrap">PARALELO</span>
                  </strong>{' '}
                  — o botão acima e a ferramenta Juntar não refazem esse encontro: dois eixos
                  paralelos não se cruzam, então não há canto para calcular.
                  {juntasParalelas.some((j) => j.temDivisa) ? (
                    <>
                      {' '}
                      Há uma <strong>divisa</strong> envolvida, e ela não acompanha a parede sozinha
                      de propósito: entortá-la mudaria a medida e o rumo de uma linha da escritura.
                      Para levá-la junto, <strong>selecione a divisa com a parede</strong> (Ctrl+clique,
                      ou laço em volta das duas) e mova as duas — aí as duas andam rígidas e o
                      encontro se mantém.
                    </>
                  ) : (
                    <>
                      {' '}
                      Para as duas andarem juntas, <strong>selecione as duas</strong> (Ctrl+clique, ou
                      laço em volta) e mova o conjunto. Se a intenção era outra, arraste a ponta até
                      encostar ou desenhe o trecho que falta.
                    </>
                  )}
                </p>
              )}

              {/* AS QUE ESTÃO A UM EMPURRÃO (P2.51).
                  O parágrafo acima nasceu do caso da DIVISA, em que a recusa é
                  deliberada. Medido na planta real em 24/09: 56 juntas paralelas,
                  ZERO com divisa — são parede contra parede, do DXF, e 26 delas
                  estão a menos de 5 cm. Essas têm conserto, e a conta mede o efeito
                  de cada uma antes de propor: só entra o que faz o número de pontas
                  soltas CAIR. Na planta real: 71 → 58 soltas e 58 → 62 ambientes. */}
              {juntasParalelas.length > 0 && (
                <button
                  type="button"
                  onClick={juntarParalelasAgora}
                  title={`Junta a ponta cujo DESALINHO lateral é menor que ${LATERAL_MAXIMA_MM / 10} cm — e só as que fazem o número de pontas soltas cair. A ponta também desliza no próprio eixo até a outra parede, então pode andar mais que isso. Quem está solto anda; com as duas soltas, anda a mais curta.`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  data-testid="juntar-paralelas"
                >
                  <Combine className="h-3.5 w-3.5" />
                  Juntar as desalinhadas por menos de {LATERAL_MAXIMA_MM / 10} cm
                </button>
              )}

              {/* REVISÃO GUIADA (P2.52). O que sobra depois dos passes
                  automáticos não é automátizavel — é decisão de desenho. Em vez
                  de 58 bolinhas espalhadas, uma ponta por vez, com a vista indo
                  até ela e só as saídas que existem naquele ponto. */}
              <PainelRevisaoDePontas
                pontas={pontasEmRevisao}
                ignoradas={pontasIgnoradas.length}
                onFocar={(em) => setNavegacao((n) => ({ seq: (n?.seq ?? 0) + 1, acao: 'CENTRALIZAR', em, escalaMinima: 0.03 }))}
                onAplicar={aplicarOpcaoDaPonta}
                onIgnorar={(ponta) => setPontasIgnoradas([...pontasIgnoradas, chaveDaPonta(ponta.wallId, ponta.end)])}
                onLimparIgnoradas={() => setPontasIgnoradas([])}
              />

              {vaosCandidatos.vaos.length === 0 ? (
                <p className="mt-2 text-xs text-amber-700">
                  Nenhum par de pontas <strong>na mesma linha</strong>, na faixa de
                  abertura (40 cm a 300 cm). Ponta que não continua o eixo de outra parede é
                  canto aberto, não vão: arraste a ponta até encostar, ou desenhe o
                  trecho que falta. Fechar na diagonal criaria uma parede enviesada.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-amber-700">
                    {vaosCandidatos.vaos.length} vão(s) encontrado(s). O sistema não decide
                    qual fechar — porta, guarda-corpo e limite externo têm a mesma
                    geometria. Você decide:
                  </p>
                  <ul className="mt-2 space-y-2">
                    {vaosCandidatos.vaos.map((v, i) => (
                      <li
                        key={`${v.a.x},${v.a.y}-${v.b.x},${v.b.y}`}
                        ref={(el) => {
                          if (el) linhasDeVao.current.set(i, el);
                          else linhasDeVao.current.delete(i);
                        }}
                        // Acende o vão no desenho enquanto o cursor está na
                        // linha. `onFocus`/`onBlur` junto porque a lista é
                        // percorrível por Tab — quem navega por teclado precisa
                        // do mesmo retorno que quem usa mouse.
                        onMouseEnter={() => setVaoEmDestaque(i)}
                        onMouseLeave={() => setVaoEmDestaque((atual) => (atual === i ? null : atual))}
                        onFocus={() => setVaoEmDestaque(i)}
                        onBlur={() => setVaoEmDestaque((atual) => (atual === i ? null : atual))}
                        // Três estados, e a ordem importa: o SELECIONADO é o mais
                        // forte porque persiste depois que o cursor sai da linha
                        // — é ele que responde "qual vão é este que acabei de
                        // clicar na planta".
                        className={`rounded-md border p-2 transition-colors ${
                          vaosDaSelecao.has(i)
                            ? 'border-amber-600 bg-amber-100 ring-1 ring-amber-500'
                            : vaoEmDestaque === i
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-amber-300 bg-white'
                        }`}
                      >
                        {/* Botão, e não parágrafo: clicar na linha SELECIONA no
                            desenho as paredes das duas pontas. Fica no título e
                            não no `<li>` inteiro porque a linha já tem cinco
                            botões de decisão — um clique que fizesse as duas
                            coisas escolheria por engano. */}
                        <button
                          type="button"
                          onClick={() => selecionarParedesDoVao(v)}
                          aria-pressed={vaosDaSelecao.has(i)}
                          title="Selecionar na planta as paredes deste vão"
                          className="w-full rounded text-left text-xs font-medium text-slate-700 hover:text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        >
                          Vão {i + 1} · {textoEmCm(v.mm)} cm
                        </button>
                        {/* CINCO saídas, porque são cinco as coisas que o vão
                            pode ser. Com duas — porta ou parede — a janela não
                            tinha para onde ir, e as duas saídas disponíveis
                            erravam calado: porta ganha peitoril zero e come o
                            rodapé, parede perde a esquadria do orçamento. */}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => fecharComAbertura(v, 'door')}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <DoorOpen className="h-3 w-3" /> É porta
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComAbertura(v, 'sliding')}
                            title="Porta de correr que desliza sobre a face da parede. Depois dá para trocar para embutida no painel da abertura."
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <DoorOpen className="h-3 w-3" /> É de correr
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComAbertura(v, 'window')}
                            title="Janela: nasce com peitoril de 90 cm, que é o que a distingue da porta no rodapé."
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <RectangleHorizontal className="h-3 w-3" /> É janela
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComAbertura(v, 'passage')}
                            title="Vão livre: passagem sem esquadria. Não entra em área de esquadrias, mas interrompe o rodapé."
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Hash className="h-3 w-3" /> É vão livre
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComParede(v)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Minus className="h-3 w-3" /> É parede
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-amber-700">
                    Vão que é limite externo (varanda, terraço) deve ficar aberto — não
                    feche.
                  </p>
                </>
              )}
            </div>
          )}

          {/* O GUARDA-CORPO QUE NÃO ENCOSTA (P2.45).
              Bloco IRMÃO, e não dentro do de pontas soltas: guarda-corpo não
              entra no arranjo planar — não fecha ambiente e nunca apareceu em
              `pontasSoltasDoNivel` —, então uma planta com todos os contornos
              fechados esconderia o aviso justamente quando ele é o único que
              existe sobre a peça. No guarda-corpo real do usuário a ponta ficou
              a 163 mm da parede que continua o mesmo eixo: em planta, com a
              peça desenhada como linha fina, não se vê; no 3D é um buraco de
              16 cm no peitoril, que é o oposto do que um guarda-corpo faz. */}
          {guardaCorposSoltosDoNivel.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3" data-testid="guarda-corpos-soltos">
              <p className="text-xs text-amber-800">
                <strong>
                  {guardaCorposSoltosDoNivel.length} ponta(s) de guarda-corpo sem encostar.
                </strong>{' '}
                A maior folga é de {Math.max(...guardaCorposSoltosDoNivel.map((s) => s.folgaMm))} mm —
                em planta a peça é uma linha fina e a folga não se vê, mas no 3D ela é um vão
                aberto no peitoril.
              </p>
              <button
                type="button"
                onClick={encostarGuardaCorposAgora}
                title={`Leva cada ponta até a parede (ou o guarda-corpo) mais próximo, no máximo ${MAX_ENCOSTO_MM} mm`}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                data-testid="encostar-guarda-corpos"
              >
                <CornerDownRight className="h-3.5 w-3.5" />
                Encostar {guardaCorposSoltosDoNivel.length} ponta(s)
              </button>
            </div>
          )}

          <div aria-live="polite" className="px-4 py-2 text-xs text-slate-600">
            {ambientes.length === 0 ? (
              'Nenhum ambiente fechado ainda.'
            ) : (
              <>
                {ambientes.length} ambiente(s) ·{' '}
                <strong className="font-medium text-slate-700">
                  {areaTotal.toFixed(2).replace('.', ',')} m²
                </strong>{' '}
                <span title="Soma das áreas úteis, medidas pela face interna">úteis</span>
                {areaConstruidaM2 > 0 && (
                  <>
                    {' · '}
                    <strong className="font-medium text-slate-700">
                      {areaConstruidaM2.toFixed(2).replace('.', ',')} m²
                    </strong>{' '}
                    <span title="Contorno externo da edificação, medido pela face externa das paredes">
                      construídos
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          <ul className="divide-y divide-slate-100">
            {ambientes.map((a) => (
              <li key={a.id}>
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    {renomeando === a.id ? (
                      // O nome é ancorado num PONTO dentro do ambiente, não no id
                      // dele: ambiente é derivado e o id muda a cada rederivação.
                      <input
                        autoFocus
                        defaultValue={a.nome}
                        aria-label={`Nome do ambiente ${a.rotulo}`}
                        onBlur={(e) => {
                          editor.run({ type: 'NameSpace', spaceId: a.id, name: e.target.value });
                          setRenomeando(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenomeando(null);
                        }}
                        className="w-full rounded border border-blue-400 px-1.5 py-0.5 text-sm"
                      />
                    ) : (
                      <>
                        <span className="truncate text-sm font-medium text-slate-700">
                          {a.rotulo}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRenomeando(a.id)}
                          title="Renomear ambiente"
                          aria-label={`Renomear ${a.rotulo}`}
                          className="ml-auto shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                  {controlesDeTomadas(a)}
                  {/* UNIDADE (E2.2): a que este ambiente pertence. "Nova…" cria pelo
                      número e já põe o ambiente nela — um gesto, um Ctrl+Z por passo. */}
                  <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                    Unidade
                    <select
                      value={a.unidadeId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__nova__') {
                          const numero = window.prompt('Número da nova unidade (ex.: 101):', '');
                          if (!numero?.trim()) return;
                          try {
                            const criados = editor.runBatch([{ type: 'AddUnidade', numero: numero.trim() }]);
                            if (criados[0]) editor.run({ type: 'SetUnidadeDoAmbiente', spaceId: a.id, unidadeId: criados[0], nome: a.rotulo });
                          } catch (err) {
                            window.alert(err instanceof Error ? err.message : String(err));
                          }
                          return;
                        }
                        editor.run({ type: 'SetUnidadeDoAmbiente', spaceId: a.id, unidadeId: v || null, nome: a.rotulo });
                      }}
                      aria-label={`Unidade do ambiente ${a.rotulo}`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="">Área comum / sem unidade</option>
                      {quadroDeUnidadesDoModelo.unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {rotuloDaUnidade(u)}
                        </option>
                      ))}
                      <option value="__nova__">+ Nova unidade…</option>
                    </select>
                  </label>
                  <dl className="mt-1 flex gap-4 text-xs text-slate-500">
                    <div>
                      <dt className="inline">Área </dt>
                      <dd className="inline font-medium text-slate-700">
                        {/* Vírgula: a linha da norma logo acima diz "20,7 m", e
                            "20.69 m" ao lado dela parecia de outro sistema. */}
                        {a.areaM2.toFixed(2).replace('.', ',')} m²
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Perímetro </dt>
                      <dd className="inline font-medium text-slate-700">
                        {a.perimetroM.toFixed(2).replace('.', ',')} m
                      </dd>
                    </div>
                  </dl>
                  {/* ACABAMENTOS (E7.2): o que a etiqueta declarou; o botão abre a gaveta neste ambiente. */}
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500" data-testid={`acabamentos-do-ambiente-${a.id}`}>
                    <span className="truncate">{resumirAcabamentos(ambientesParaAcabamento.find((x) => x.spaceId === a.id)?.acabamentos)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAmbienteDeAcabamentos(a.id);
                        setTarefa('acabamentos');
                      }}
                      aria-label={`Acabamentos de ${a.rotulo}`}
                      className="ml-auto shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
                    >
                      Piso/forro
                    </button>
                  </p>
                  {/* GRAFO ESPACIAL (E4.2): com quem se liga, o que dá para fora, quão longe da saída. */}
                  {grafoDoNivel && (() => {
                    const no = grafoDoNivel.nos.find((n) => n.spaceId === a.id);
                    if (!no) return null;
                    const porPorta = vizinhosDe(grafoDoNivel, a.id).filter((v) => v.arestas.some((x) => x.tipo !== 'PAREDE'));
                    const saida = percursoAteASaida(grafoDoNivel, a.id);
                    return (
                      <p className="mt-1 text-xs text-slate-500" data-testid={`grafo-do-ambiente-${a.id}`}>
                        <span className={no.ilhado ? 'text-red-700' : ''}>Liga-se a: {porPorta.length ? porPorta.map((v) => v.no?.rotulo ?? 'exterior').join(', ') : 'ninguém (sem porta)'}</span>
                        {' · '}
                        <span className={no.fachadas.length === 0 ? 'text-amber-800' : ''}>Fachada: {descreverFachadas(no.fachadas)}</span>
                        {saida && <> · Saída: {(saida.mm / 1000).toFixed(2).replace('.', ',')} m</>}
                      </p>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>

          {ambientes.length === 0 && !editor.loading && (
            <p className="px-4 py-3 text-xs text-slate-400">
              Feche um contorno de paredes para que um ambiente apareça. Pontas soltas
              não fecham área.
            </p>
          )}
          </div>
          </SecaoAccordion>
          )}
                    </>
                  )}
                </SecaoOrdenavel>
              ))}
            </SortableContext>
          </DndContext>


          {/* A RÉGUA DO TEMPO fica FORA de accordion, e só na vista 3D.
              Fora porque ela muda o que se está vendo na hora — esconder num
              acordeão recolhido repetiria o que aconteceu com o "Inverter o
              lado" do corte, que existia e ninguém achava. Só no 3D porque é
              lá que a cor aparece; na planta ela não teria efeito visível. */}
          {em3d && (
            <ReguaDoTempo
              data={data4d}
              onData={setData4d}
              tarefas={tarefas4d.length}
              pecasColoridas={situacao4d.size}
              algumRealConhecido={[...situacao4d.values()].some((s) => s.realConhecido)}
            />
          )}
          </div>

          {/* ─── PROPRIEDADES OU TAREFA ───────────────────────────────────────
              A metade de baixo. Na planta e no 3D (16/09/2026: *"ao clicar em
              um componente estrutural é possível editá-lo no painel lateral,
              porém não consigo fazer o mesmo no modo de visualização em 3D"*) —
              a seleção do 3D é a MESMA da planta (`selecionar`), e os painéis
              de propriedades só dependem do modelo, então o que se edita aqui
              muda a cena na hora. Elevação e corte seguem sem (não há clique em
              peça ali). Tarefa aberta vence; a seleção continua anunciada na
              faixa azul do cabeçalho, com o caminho de volta. Sem tarefa e sem
              seleção, a metade não existe — o navegador fica com o painel
              inteiro, como antes. */}
          {(!emVista || em3d) && editor.selectedIds.length > 0 && !propriedadesEmSheet && (
            <div className="flex max-h-[62%] shrink-0 flex-col border-t-2 border-slate-200">
                <PainelDeTarefa titulo="Propriedades" subtitulo={rotuloDoSelecionado}>
                  {paineisDaSelecao}
                </PainelDeTarefa>
            </div>
          )}
          </aside>
        </div>
      </div>

      {/* Fora da coluna do painel de propriedades: é um Sheet sobre a tela
          inteira, e aninhá-lo numa `aside` com `overflow` recortaria o painel. */}
      {/* Fora da coluna do painel, como o Quadro de Divisas: é camada sobre a
          tela inteira, e aninhá-la numa `aside` com `overflow` a recortaria. */}
      <ModalSobreposicao
        aberto={disputa !== null}
        nomeDaPeca={disputa?.nome ?? ''}
        quantos={disputa?.quantos ?? 0}
        volumeM3={disputa?.volumeM3 ?? 0}
        temParede={(disputa?.paredeIds.length ?? 0) > 0}
        onEscolher={resolverDisputa}
      />

      {/* ─── A TAREFA, EM DRAWER (13/09/2026) ──────────────────────────────────
          Fora da coluna do painel, como o Quadro de Divisas: é camada sobre a
          tela inteira. Sem "Salvar": cada clique aplica um comando do kernel na
          hora e Ctrl+Z desfaz. Um Sheet só, com o conteúdo trocando pela
          tarefa — assim a geometria, o cabeçalho e o rodapé são um lugar. */}
      {/* Montado só COM tarefa (o `Sheet` fica no DOM mesmo fechado): sem
          tarefa não há dialog na árvore. Enquanto a tarefa existe ele fica
          montado, e "recolher" é só `open=false` — é o que preserva o estado
          do "Do PDF" (arquivo lido, segmentos extraídos) enquanto a região é
          marcada no desenho. */}
      {tarefaAberta && (
      <Sheet
        open={!drawerRecolhido}
        onClose={() => setTarefa(null)}
        size={tarefaAberta === 'terreno' ? '2xl' : 'xl'}
      >
        <SheetHeader onClose={() => setTarefa(null)}>
          <SheetTitle>
            <span className="flex items-center gap-2">
              {tarefaAberta === 'tomadas' && <Plug className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'eletrodutos' && <Cable className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'circuitos' && <CircuitBoard className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'pilares' && <RectangleVertical className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'vigas' && <RectangleHorizontal className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'lajes' && <Layers className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'acabamentos' && <Layers className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'guardaCorpos' && <Fence className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'rodapes' && <Minus className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'departamentos' && <Palette className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'lod' && <Gauge className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'etapas' && <History className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'fundacoes' && <SquareStack className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'pontosHidraulicos' && <ShowerHead className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'agua' && <Droplets className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'esgoto' && <Waves className="h-5 w-5 text-slate-700" />}
              {tarefaAberta === 'terreno' && <Landmark className="h-5 w-5 text-emerald-700" />}
              {tarefaAberta === 'gerar-paredes' && <FileText className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'importar-ifc' && <Boxes className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'importar-dxf' && <PenTool className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'importar-collada' && <Boxes className="h-5 w-5 text-blue-700" />}
              {tarefaAberta === 'importar-bcf' && <MessagesSquare className="h-5 w-5 text-blue-700" />}
              {tarefaAberta ? ROTULO_DA_TAREFA[tarefaAberta] : ''}
            </span>
          </SheetTitle>
          <SheetDescription>
            {tarefaAberta === 'ia' &&
              'Peça em português: "suíte +2 m²", "3 dormitórios", "corredor de 1,20 m". O pedido vira mudança no programa ou nas hipóteses, o gerador re-gera e você lê o delta dos indicadores. Nunca desenha direto.'}
            {tarefaAberta === 'etapas' &&
              'A linha do tempo da obra. Cada peça diz em que etapa nasce e em qual é demolida; com uma etapa em vista o desenho mostra o que existe nela. Cada mudança é um passo de desfazer; a etapa entra na versão publicada.'}
            {tarefaAberta === 'lod' &&
              'O LOD de cada peça é derivado do que ela já tem (não se declara): 200 aproximado, 300 preciso, 350 coordenação. Você declara o alvo por família; a lista mostra o que falta, peça a peça. O sistema não avalia LOD 400.'}
            {tarefaAberta === 'departamentos' &&
              'O setor de cada ambiente, gravado na etiqueta. O quadro soma a área útil por setor; a sugestão lê nome e tipo e só grava quando você manda; a planta de departamentos pinta pelo setor com legenda.'}
            {tarefaAberta === 'rodapes' &&
              'Cada ambiente vira trechos de rodapé ao pé das paredes, descontadas as portas — sugeridos (tracejados) até aceitar. O ambiente que declarou rodapé usa a altura e o item dele. Com trechos no desenho, o quantitativo soma os trechos.'}
            {tarefaAberta === 'guardaCorpos' &&
              'Onde falta proteção: borda de laje sem parede em pavimento elevado e escadas sem corrimão. Lançar grava peças sugeridas (tracejadas); mover ou Aceitar confirma. A altura mínima da norma é conferida peça a peça.'}
            {tarefaAberta === 'acabamentos' &&
              'Piso, forro e rodapé de cada ambiente, gravados na etiqueta do ambiente. Cada mudança é um passo de desfazer; o material é item do catálogo (SINAPI ou base própria) e é ele que leva a camada ao orçamento.'}
            {tarefaAberta === 'mobiliario' &&
              'O kit mínimo de cada ambiente colocado no retângulo interno (porta e janelas respeitadas) e a circulação livre medida da porta à frente de cada peça. Sugestão desenhada; vagas e shaft entram no modelo pelo kernel.'}
            {tarefaAberta === 'insolacao' &&
              'Sol por data e hora solar (latitude da georreferência), horas de sol por fachada e por ambiente nas três datas de referência, sombra dos vizinhos declarados e ventilação cruzada. Ligue "Sol e sombras no 3D" e mude a hora para ver a sombra andar.'}
            {tarefaAberta === 'grafo' &&
              'A planta do pavimento como rede: cada ambiente é um nó; parede dividida e porta são as arestas. Percursos medidos pelos centros das portas; fachada e orientação pelo norte do desenho. Só leitura.'}
            {tarefaAberta === 'pilares' &&
              'Pilar em cada encontro de paredes e nos vãos longos, no pavimento ativo. Prévia tracejada no desenho; gravar é um passo só, e Ctrl+Z desfaz.'}
            {tarefaAberta === 'vigas' &&
              'Uma viga por parede, de pilar a pilar, no topo da alvenaria do pavimento ativo. Prévia tracejada no desenho; gravar é um passo só, e Ctrl+Z desfaz.'}
            {tarefaAberta === 'lajes' &&
              'Uma laje por ambiente fechado, apoiada no topo das paredes do pavimento ativo. Prévia tracejada no desenho; gravar é um passo só, e Ctrl+Z desfaz.'}
            {tarefaAberta === 'fundacoes' &&
              'Um bloco de coroamento sob cada pilar do pavimento ativo, com a(s) estaca(s) dele, e a viga baldrame sobre os blocos ao longo de cada parede. Prévia tracejada no desenho; gravar é um passo só, e Ctrl+Z desfaz.'}
            {tarefaAberta === 'tomadas' && (
              <>
                Por ambiente: classifique o cômodo, veja o que a norma (9.5.2) pede e distribua.{' '}
                <strong>Completar pela norma</strong> lança só o que falta;{' '}
                <strong>Distribuir</strong> lança N ao longo das paredes. As tomadas nascem{' '}
                <em>sugeridas</em> — mover uma confirma.
              </>
            )}
            {tarefaAberta === 'esgoto' && (
              <>
                Lavatório, chuveiro, ralo, tanque e máquina vão ao <strong>coletor do ambiente</strong> (caixa
                sifonada); o vaso vai <strong>direto</strong>; a pia passa pela <strong>caixa de gordura</strong>; tudo
                termina na <strong>caixa de inspeção</strong>. Os ramais correm sob o piso e descem com o caimento
                da NBR 8160; no sobrado, um tubo de queda desce ao térreo e uma coluna de ventilação sobe ao teto. Os
                trechos nascem <em>sugeridos</em>.
              </>
            )}
            {tarefaAberta === 'agua' && (
              <>
                Para cada <strong>caixa d'água</strong> (água fria) e cada <strong>aquecedor</strong> (água quente), o
                sistema propõe a rede: barrilete no forro do pavimento da origem, uma coluna por grupo de
                pontos próximos, ramais a 2,20 m e a prumada até cada ponto. O DN de cada trecho sai do peso
                acumulado (NBR 5626, Q = 0,3·√ΣP) pela velocidade máxima. Os trechos nascem <em>sugeridos</em>.
              </>
            )}
            {tarefaAberta === 'pontosHidraulicos' && (
              <>
                Por ambiente classificado, o KIT do seu tipo em posições provisórias: vaso, lavatório,
                chuveiro e coletor no banheiro; pia na cozinha; tanque, máquina e ralo na área de
                serviço. Cada aparelho gera um ponto por disciplina (água fria, quente, esgoto) no
                mesmo lugar. As peças nascem <em>sugeridas</em> — mover confirma; rodar de novo não
                duplica.
              </>
            )}
            {tarefaAberta === 'eletrodutos' && (
              <>
                Para cada circuito, o sistema <strong>propõe</strong> o caminho: prumada na posição
                de cada ponto até o teto e, no teto, a árvore de menor comprimento a partir do
                quadro. Os trechos nascem <em>sugeridos</em> (pontilhado fino) — mover um confirma;
                "Aceitar sugeridos" confirma todos. Ctrl+Z desfaz o lote.
              </>
            )}
            {tarefaAberta === 'circuitos' && (
              <>
                Para os pontos <strong>sem circuito</strong> deste pavimento, o sistema{' '}
                <strong>propõe</strong> os circuitos: luz, TUG e TUE sempre separados; TUE um por ponto;
                luz e TUG divididas pelo critério que você escolher. A tabela é a prévia — nada é gravado
                até "Criar". Ctrl+Z desfaz o lote.
              </>
            )}
            {tarefaAberta === 'terreno' &&
              'Área da escritura, papel de cada divisa, recuos e zona urbanística, topografia, corte e aterro, projeto executivo de terraplenagem. Traçar perfil ou drenagem fecha este painel — volte por Terreno › Dados do lote.'}
            {tarefaAberta === 'gerar-paredes' &&
              'Paredes e portas a partir da planta de fundo em PDF. Ao marcar a região, este painel se recolhe para você arrastar sobre o desenho e volta em seguida.'}
            {tarefaAberta === 'importar-ifc' &&
              'Paredes, aberturas e estrutura de um modelo IFC, por medida declarada.'}
            {tarefaAberta === 'importar-dxf' && 'Paredes de um desenho DXF ou DWG, por camada — com portas (arco), janelas (símbolo) e vãos.'}
            {tarefaAberta === 'importar-collada' && 'Paredes de um modelo do SketchUp exportado como COLLADA (.dae): reconhecidas onde há duas faces verticais paralelas a uma distância de parede. O que foi recusado aparece com o motivo.'}
            {tarefaAberta === 'importar-bcf' &&
              'Os tópicos de coordenação (BCF) que o projetista devolveu — pendência, não geometria. Clicar num tópico seleciona a peça no desenho.'}
          </SheetDescription>
        </SheetHeader>

        <SheetPanel
          className={`drawer-legivel ${tarefaAberta === 'tomadas' || tarefaAberta === 'eletrodutos' || tarefaAberta === 'circuitos' || tarefaAberta === 'pilares' || tarefaAberta === 'vigas' || tarefaAberta === 'lajes' || tarefaAberta === 'fundacoes' || tarefaAberta === 'pontosHidraulicos' || tarefaAberta === 'agua' || tarefaAberta === 'esgoto' || tarefaAberta === 'grupo' || tarefaAberta === 'vagas' || tarefaAberta === 'lotear' || tarefaAberta === 'grafo' || tarefaAberta === 'insolacao' || tarefaAberta === 'mobiliario' || tarefaAberta === 'ia' || tarefaAberta === 'acabamentos' || tarefaAberta === 'esquadrias' || tarefaAberta === 'guardaCorpos' || tarefaAberta === 'rodapes' || tarefaAberta === 'departamentos' || tarefaAberta === 'lod' || tarefaAberta === 'etapas' ? 'px-6 py-4' : 'p-0'}`}
        >
          {tarefaAberta === 'terreno' && painelDoTerreno(pedidoDeImportacaoDeLevantamento)}

          {tarefaAberta === 'ia' && (
            <PainelIa
              turnos={turnos}
              pensando={pensando}
              gerando={gerador.rodando}
              temPrograma={programaDoEstudo.programa.itens.length > 0}
              iaDisponivel={iaDisponivel}
              onPedir={(p) => void pedirAIa(p)}
              melhor={melhorGerada}
              avaliacaoAtual={avaliacao}
              onAbrirPrograma={() => {
                setTarefa(null);
                setTelaAberta('programa');
              }}
              onAbrirGerador={() => {
                setTarefa(null);
                setTelaAberta('gerar');
              }}
            />
          )}

          {tarefaAberta === 'etapas' && (
            <PainelEtapas
              etapas={etapasDoEstudo}
              quadro={quadroDeEtapasDoEstudo}
              selecao={selecaoNaLinhaDoTempo}
              semEtapa={pecasSemEtapa(editor.model)}
              etapaEmVista={vistaDaEtapaAtual ? etapaEmVista : null}
              contagemEmVista={vistaDaEtapaAtual ? { ...vistaDaEtapaAtual.contagem, ocultas: vistaDaEtapaAtual.ocultos.size } : null}
              onEtapaEmVista={setEtapaEmVista}
              onCriar={(nomes) => {
                const criados = editor.runBatch(nomes.map((nome) => ({ type: 'AddEtapa', nome }) as Command));
                void criados;
              }}
              onRenomear={(etapaId, nome) => editor.run({ type: 'SetEtapaProps', etapaId, nome })}
              onMover={(etapaId, direcao) => {
                // Troca de posição na lista ordenada e renumera 1..N — um lote, um desfazer.
                const lista = [...etapasDoEstudo];
                const i = lista.findIndex((e) => e.id === etapaId);
                const j = i + direcao;
                if (i < 0 || j < 0 || j >= lista.length) return;
                [lista[i], lista[j]] = [lista[j], lista[i]];
                const cmds = lista.map((e, k) => ({ type: 'SetEtapaProps', etapaId: e.id, ordem: k + 1 }) as Command).filter((c, k) => lista[k].ordem !== k + 1);
                if (cmds.length) editor.runBatch(cmds);
              }}
              onApagar={(etapaId) => {
                if (etapaEmVista === etapaId) setEtapaEmVista(null);
                editor.run({ type: 'DeleteEtapa', etapaId });
              }}
              onAtribuir={(ids, campos) => {
                if (ids.length === 0) return;
                editor.run({ type: 'SetEtapaDasPecas', ids, ...campos });
              }}
            />
          )}
          {tarefaAberta === 'lod' && (
            <PainelLod
              nomeDoPavimento={editor.model.levels.find((l) => l.id === levelId)?.name ?? 'pavimento'}
              quadro={quadroDeLodDoNivel}
              pendencias={pendenciasDeLodDoNivel}
              alvo={{ ...ALVO_DE_LOD_PADRAO, ...alvoDeLod }}
              onAlvo={setAlvoDeLod}
              onSelecionar={(_familia, id) => {
                setTarefa(null);
                selecionar([id]);
              }}
            />
          )}
          {tarefaAberta === 'departamentos' && (
            <PainelDepartamentos
              nomeDoPavimento={editor.model.levels.find((l) => l.id === levelId)?.name ?? 'pavimento'}
              ambientes={ambientes.map((a) => ({ spaceId: a.id, rotulo: a.rotulo, departamento: a.departamento, areaM2: a.areaM2 }))}
              quadro={quadroDeDepartamentosDoNivel}
              sugestoes={sugestoesDeDepartamentoDoNivel}
              onDepartamento={(spaceId, departamento) => {
                const a = ambientes.find((x) => x.id === spaceId);
                if (!a) return;
                // Pela etiqueta se existe; criando-a pelo nome exibido se não — como o tipo e os acabamentos.
                if (a.etiquetaId) editor.run({ type: 'SetSpaceLabelProps', labelId: a.etiquetaId, departamento });
                else if (departamento) editor.run({ type: 'NameSpace', spaceId, name: a.rotulo, departamento });
              }}
              onLancarSugestoes={(quais) => {
                const cmds = quais.map((s) => s.comando);
                if (cmds.length) editor.runBatch(cmds);
              }}
              onAbrirPlanta={() => {
                setTarefa(null);
                setVista(vista === 'departamentos' ? 'planta' : 'departamentos');
              }}
              emPlanta={vista === 'departamentos'}
            />
          )}
          {tarefaAberta === 'rodapes' && (
            <PainelRodapes
              nomeDoPavimento={editor.model.levels.find((l) => l.id === levelId)?.name ?? 'pavimento'}
              pecas={rodapesDoNivelAtivo}
              sugestao={sugestaoDeRodapes}
              hipoteses={hipotesesDeRodape}
              onHipoteses={setHipotesesDeRodape}
              onLancar={(quais) => {
                const cmds = quais.map((s) => s.comando);
                if (cmds.length === 0) return;
                const criados = editor.runBatch(cmds);
                if (criados.length > 0) selecionar(criados);
              }}
              onAceitarTodos={() => {
                const cmds: Command[] = rodapesDoNivelAtivo.filter((r) => r.sugerido).map((r) => ({ type: 'SetRodapeProps', rodapeId: r.id, sugerido: false }));
                if (cmds.length) editor.runBatch(cmds);
              }}
              onLimparSugeridos={() => {
                const cmds: Command[] = rodapesDoNivelAtivo.filter((r) => r.sugerido).map((r) => ({ type: 'DeleteRodape', rodapeId: r.id }));
                if (cmds.length) editor.runBatch(cmds);
              }}
              onSelecionar={(id) => {
                setTarefa(null);
                selecionar([id]);
              }}
            />
          )}

          {tarefaAberta === 'esquadrias' && (
            <PainelEsquadrias
              grupos={quant.totais.porEsquadria ?? []}
              onAplicar={(mudancas) => {
                // UM lote para tudo: um passo de desfazer para o quadro inteiro.
                const cmds: Command[] = mudancas.flatMap((m) =>
                  m.openingIds.map((openingId): Command => ({ type: 'SetOpeningEsquadria', openingId, esquadria: m.esquadria })),
                );
                if (cmds.length > 0) editor.runBatch(cmds);
              }}
              onSelecionar={(ids) => {
                if (ids.length > 0) selecionar([...ids]);
              }}
              unificacoes={unificacoesDeEsquadria}
              toleranciaMm={toleranciaDeUnificacao}
              onTolerancia={setToleranciaDeUnificacao}
              mirarCatalogo={mirarCatalogo}
              onMirarCatalogo={setMirarCatalogo}
              onUnificar={(quais) => {
                const cmds = comandosDaUnificacao(quais);
                if (cmds.length > 0) editor.runBatch(cmds);
              }}
            />
          )}

          {tarefaAberta === 'guardaCorpos' && (
            <PainelGuardaCorpos
              nomeDoPavimento={editor.model.levels.find((l) => l.id === levelId)?.name ?? 'pavimento'}
              pecas={guardaCorposDoNivelAtivo}
              resumo={resumoDeGuardaCorpos}
              sugestao={sugestaoDeGuardaCorpos}
              hipoteses={hipotesesDeGuardaCorpo}
              onHipoteses={setHipotesesDeGuardaCorpo}
              onLancar={(quais) => {
                const cmds = quais.map((s) => s.comando);
                if (cmds.length === 0) return;
                const criados = editor.runBatch(cmds);
                if (criados.length > 0) selecionar(criados);
              }}
              onAceitarTodos={() => {
                const cmds: Command[] = guardaCorposDoNivelAtivo.filter((g) => g.sugerido).map((g) => ({ type: 'SetGuardaCorpoProps', guardaCorpoId: g.id, sugerido: false }));
                if (cmds.length) editor.runBatch(cmds);
              }}
              onSelecionar={(id) => {
                setTarefa(null);
                selecionar([id]);
              }}
            />
          )}

          {tarefaAberta === 'acabamentos' && (
            <PainelAcabamentos
              ambientes={ambientesParaAcabamento}
              nomeDoPavimento={editor.model.levels.find((l) => l.id === levelId)?.name ?? 'pavimento'}
              alturaRodapePoliticaMm={POLITICA_PADRAO.alturaRodapeMm}
              porAcabamento={quant.totais.porAcabamento ?? []}
              foco={ambienteDeAcabamentos}
              onAplicar={aplicarAcabamentos}
              onAplicarEmVarios={(ids, acabamentos) => {
                // Um lote, um Ctrl+Z: etiqueta existente recebe as props; ambiente
                // sem etiqueta ganha uma pelo nome exibido.
                const cmds: Command[] = [];
                for (const id of ids) {
                  const a = ambientes.find((x) => x.id === id);
                  if (!a) continue;
                  cmds.push(a.etiquetaId ? { type: 'SetSpaceLabelProps', labelId: a.etiquetaId, acabamentos } : { type: 'NameSpace', spaceId: id, name: a.rotulo, acabamentos });
                }
                if (cmds.length) editor.runBatch(cmds);
              }}
              onSelecionar={(spaceId) => {
                setTarefa(null);
                selecionar([spaceId]);
              }}
              materiais={biblioteca.materiais}
            />
          )}

          {tarefaAberta === 'mobiliario' && (
            <PainelMobiliario
              lista={mobiliarioDoNivel}
              hipoteses={hipotesesDeMobiliario}
              onHipoteses={setHipotesesDeMobiliario}
              mostrarNoDesenho={mostrarMobiliario}
              onMostrarNoDesenho={setMostrarMobiliario}
              nomeDoPavimento={editor.model.levels.find((l) => l.id === levelId)?.name ?? 'pavimento'}
              onSelecionar={(spaceId) => {
                const etiqueta = ambientes.find((a) => a.id === spaceId)?.etiquetaId;
                if (etiqueta) {
                  setTarefa(null);
                  selecionar([etiqueta]);
                }
              }}
              garagens={mobiliarioDoNivel.filter((a) => a.uso === 'GARAGEM').map((a) => ({ spaceId: a.spaceId, rotulo: a.rotulo }))}
              onLancarVagas={(spaceId) => {
                setRegiaoDeVagasPedida({ tipo: 'AMBIENTE', spaceId });
                setTarefa('vagas');
              }}
              vagasResultado={resultadoDeVagas}
              onAceitarMobiliario={(spaceId) => {
                const lista = spaceId ? mobiliarioDoNivel.filter((a) => a.spaceId === spaceId) : mobiliarioDoNivel;
                const cmds = levelId ? comandosDeMobiliario(lista, levelId, editor.model) : [];
                if (cmds.length === 0) return;
                const criados = editor.runBatch(cmds);
                if (criados.length > 0) selecionar(criados);
              }}
              componentesExistentes={componentesDoNivelAtivo.length}
              shaft={{ possivel: !!shaftSugerido.comando, motivo: shaftSugerido.motivo }}
              onSugerirShaft={() => {
                if (!shaftSugerido.comando) return;
                const criados = editor.runBatch([shaftSugerido.comando]);
                if (criados.length > 0) {
                  setTarefa(null);
                  selecionarEAbrir(criados);
                }
              }}
            />
          )}

          {tarefaAberta === 'insolacao' && (
            <PainelInsolacao
              hipoteses={hipotesesDeInsolacao}
              onHipoteses={setHipotesesDeInsolacao}
              latitudeDoEstudo={latitudeDoEstudo}
              norteGraus={norteDoDesenho}
              analise={insolacaoDoNivel}
              insolacaoMinimaH={zona.insolacaoMinimaH}
              temLote={temTerreno}
              nomeDoPavimento={editor.model.levels.find((l) => l.id === levelId)?.name ?? 'pavimento'}
              onSelecionar={(id) => {
                setTarefa(null);
                selecionar([id]);
              }}
            />
          )}

          {tarefaAberta === 'grafo' && (
            <PainelGrafoEspacial
              grafo={grafoDoNivel}
              nomeDoPavimento={editor.model.levels.find((l) => l.id === levelId)?.name ?? 'pavimento'}
              onSelecionar={(id) => {
                setTarefa(null);
                selecionar([id]);
              }}
            />
          )}

          {tarefaAberta === 'lotear' && (
            <PainelLotear
              model={editor.model}
              levelId={levelId}
              quadras={quadrasDoNivel}
              quadraId={quadraALotear}
              onQuadra={(id) => {
                setQuadraALotear(id);
                setResultadoDeLotear(null);
              }}
              parametros={parametrosDaSubdivisao}
              onParametros={(p) => {
                setParametrosDaSubdivisao(p);
                setResultadoDeLotear(null);
              }}
              proposta={propostaDeSubdivisao}
              onAceitar={aceitarSubdivisao}
              resultado={resultadoDeLotear}
            />
          )}

          {tarefaAberta === 'vagas' && planoDeVagas && (
            <PainelVagas
              model={editor.model}
              levelId={levelId}
              hipoteses={hipotesesDeVagas}
              onHipoteses={setHipotesesDeVagas}
              regiao={regiaoDeVagasPedida}
              onRegiao={setRegiaoDeVagasPedida}
              plano={planoDeVagas}
              sugeridasNoNivel={vagasSugeridasNoNivel}
              onLancar={lancarVagas}
              onAceitar={() => {
                editor.runBatch(aceitarVagas(editor.model, levelId));
                setResultadoDeVagas('Sugeridas aceitas — agora são vagas do projeto.');
              }}
              onApagarSugeridas={() => {
                editor.runBatch(limparVagas(editor.model, levelId));
                setResultadoDeVagas('Sugeridas apagadas.');
              }}
              resultado={resultadoDeVagas}
            />
          )}

          {tarefaAberta === 'grupo' && (
            <PainelGrupo
              model={editor.model}
              selectedIds={editor.selectedIds}
              levelId={levelId}
              onRun={(c) => editor.run(c)}
              onSelecionar={(ids) => selecionar(ids)}
              erro={editor.lastError}
            />
          )}

          {tarefaAberta === 'matriz' && (
            <div className="space-y-3" data-testid="tarefa-matriz">
              <p className="text-xs text-slate-600">
                Repete a seleção atual <strong>{parametrosDaMatriz.quantidade}×</strong> (o original conta), cada
                exemplar deslocado do anterior pelo passo em X e em Y. Paredes levam as esquadrias; instalações e
                esquadria avulsa ficam de fora. Um lote — um Ctrl+Z desfaz tudo.
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <label className="flex flex-col gap-1">
                  Exemplares
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={parametrosDaMatriz.quantidade}
                    onChange={(e) => setParametrosDaMatriz({ ...parametrosDaMatriz, quantidade: Math.max(2, Math.min(200, Number(e.target.value) || 2)) })}
                    aria-label="Exemplares da matriz"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Passo X (mm)
                  <input
                    type="number"
                    step={50}
                    value={parametrosDaMatriz.passoXMm}
                    onChange={(e) => setParametrosDaMatriz({ ...parametrosDaMatriz, passoXMm: Number(e.target.value) || 0 })}
                    aria-label="Passo X da matriz (mm)"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Passo Y (mm)
                  <input
                    type="number"
                    step={50}
                    value={parametrosDaMatriz.passoYMm}
                    onChange={(e) => setParametrosDaMatriz({ ...parametrosDaMatriz, passoYMm: Number(e.target.value) || 0 })}
                    aria-label="Passo Y da matriz (mm)"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  {editor.selectedIds.length === 0 ? 'Selecione o que repetir na planta.' : `${editor.selectedIds.length} peça(s) selecionada(s).`}
                </span>
                <button
                  type="button"
                  onClick={criarMatriz}
                  disabled={editor.selectedIds.length === 0 || !levelId}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Criar matriz
                </button>
              </div>
            </div>
          )}

          {tarefaAberta === 'esgoto' && (
            <div className="space-y-4" data-testid="tarefa-esgoto">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses do lançamento</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    DN pelas <strong>UHC</strong> da NBR 8160 acumuladas (lavatório 1 · chuveiro 2 · pia/tanque/máquina 3 ·
                    vaso 6): ≤3 → 40 · ≤6 → 50 · ≤20 → 75 · acima → 100 — nunca abaixo do ramal de descarga do aparelho
                    (vaso 100, pia 50).
                  </li>
                  <li>
                    Ramais sob o piso, a partir de {hipotesesDeEsgoto.cotaMinimaSobPisoMm} mm, descendo{' '}
                    <strong>{hipotesesDeEsgoto.caimentoPctAte75} %</strong> até DN 75 e{' '}
                    <strong>{hipotesesDeEsgoto.caimentoPctDe100} %</strong> em DN 100; a cota de um nó é a menor das
                    chegadas.
                  </li>
                  <li>
                    Sobrado: tubo de queda DN {hipotesesDeEsgoto.dnTuboQuedaMm} na posição do ponto de maior UHC do andar,
                    ventilação DN {hipotesesDeEsgoto.dnVentilacaoMm} até o teto. <strong>Pré-dimensionamento</strong>: não
                    desvia de fundação, viga ou laje.
                  </li>
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2">
                    Caimento até DN 75
                    <select value={String(hipotesesDeEsgoto.caimentoPctAte75)} onChange={(e) => setHipDeEsgotoSalvas({ ...hipotesesDeEsgoto, caimentoPctAte75: Number(e.target.value) })} aria-label="Caimento até DN 75" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                      {[1, 1.5, 2, 3].map((v) => <option key={v} value={v}>{String(v).replace('.', ',')} %</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Caimento DN 100
                    <select value={String(hipotesesDeEsgoto.caimentoPctDe100)} onChange={(e) => setHipDeEsgotoSalvas({ ...hipotesesDeEsgoto, caimentoPctDe100: Number(e.target.value) })} aria-label="Caimento DN 100" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                      {[1, 1.5, 2].map((v) => <option key={v} value={v}>{String(v).replace('.', ',')} %</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Sob o piso
                    <input type="number" max={0} step={50} value={hipotesesDeEsgoto.cotaMinimaSobPisoMm} onChange={(e) => setHipDeEsgotoSalvas({ ...hipotesesDeEsgoto, cotaMinimaSobPisoMm: Math.min(0, Math.round(Number(e.target.value) || -150)) })} aria-label="Cota do ramal sob o piso em mm" className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums" />
                    mm
                  </label>
                </div>
              </div>

              {planoDeEsgoto.motivo && planoDeEsgoto.pavimentos.length === 0 ? (
                <p className="text-sm text-slate-500">{planoDeEsgoto.motivo}</p>
              ) : (
                <>
                  <table className="w-full table-fixed text-xs" aria-label="Esgoto por pavimento">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-2 font-medium">Pavimento</th>
                        <th className="w-24 py-1.5 pr-2 font-medium">Fontes</th>
                        <th className="w-24 py-1.5 pr-2 font-medium">Ligadas</th>
                        <th className="w-24 py-1.5 pr-2 font-medium">A ligar</th>
                        <th className="w-28 py-1.5 font-medium">Tubo de queda</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {planoDeEsgoto.pavimentos.map((p) => (
                        <tr key={p.levelId}>
                          <td className="py-1.5 pr-2 font-medium text-slate-700">{p.nome}</td>
                          <td className="py-1.5 pr-2 text-slate-600">{p.fontes}</td>
                          <td className="py-1.5 pr-2 text-slate-600">{p.ligadas}</td>
                          <td className="py-1.5 pr-2 text-slate-600">{p.aLigar}</td>
                          <td className="py-1.5 text-slate-600">{p.tuboDeQueda ? 'sim' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-slate-600">
                    {planoDeEsgoto.motivo
                      ? planoDeEsgoto.motivo
                      : <>
                          {planoDeEsgoto.metrosPrevistos.toLocaleString('pt-BR')} m · {planoDeEsgoto.uhcTotal} UHC · DN máx. {planoDeEsgoto.dnMaximoMm}
                          {planoDeEsgoto.cotaDeChegadaMm != null ? ` · chega à caixa de inspeção a ${planoDeEsgoto.cotaDeChegadaMm} mm` : ''}
                        </>}
                  </p>
                  {planoDeEsgoto.avisos.map((a, i) => (
                    <p key={i} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{a}</p>
                  ))}
                </>
              )}
            </div>
          )}

          {tarefaAberta === 'agua' && (
            <div className="space-y-4" data-testid="tarefa-agua">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses do lançamento</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    Pesos da NBR 5626 pela ficha de cada ponto (chuveiro 0,4 · lavatório 0,3 · pia 0,7 · máquina 1,0…);
                    vazão <strong>Q = 0,3·√ΣP</strong> L/s; DN = o menor comercial com velocidade ≤ limite, nunca abaixo
                    do mínimo. Água fria em PVC soldável; água quente em CPVC.
                  </li>
                  <li>Barrilete no forro do pavimento da origem; colunas por grupo de pontos; ramais na cota abaixo; o aquecedor é ponto da água fria com o peso dos pontos quentes.</li>
                  <li><strong>Pré-dimensionamento</strong> por velocidade: sem perda de carga nem pressão disponível; não desvia de viga ou laje.</li>
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2">
                    Velocidade máx.
                    <select
                      value={String(hipotesesDeAgua.velocidadeMaxMs)}
                      onChange={(e) => setHipDeAguaSalvas({ ...hipotesesDeAgua, velocidadeMaxMs: Number(e.target.value) })}
                      aria-label="Velocidade máxima na tubulação"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {[1.5, 2, 2.5, 3].map((v) => (
                        <option key={v} value={v}>{String(v).replace('.', ',')} m/s</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    DN mín. AF
                    <select value={hipotesesDeAgua.dnMinimoAguaFriaMm} onChange={(e) => setHipDeAguaSalvas({ ...hipotesesDeAgua, dnMinimoAguaFriaMm: Number(e.target.value) })} aria-label="DN mínimo da água fria" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                      {[20, 25, 32].map((v) => <option key={v} value={v}>{v} mm</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    DN mín. AQ
                    <select value={hipotesesDeAgua.dnMinimoAguaQuenteMm} onChange={(e) => setHipDeAguaSalvas({ ...hipotesesDeAgua, dnMinimoAguaQuenteMm: Number(e.target.value) })} aria-label="DN mínimo da água quente" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                      {[15, 22, 28].map((v) => <option key={v} value={v}>{v} mm</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Ramal a
                    <input type="number" min={1500} step={100} value={hipotesesDeAgua.cotaRamalMm} onChange={(e) => setHipDeAguaSalvas({ ...hipotesesDeAgua, cotaRamalMm: Math.max(500, Math.round(Number(e.target.value) || 2200)) })} aria-label="Cota do ramal em mm" className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums" />
                    mm
                  </label>
                  <label className="flex items-center gap-2">
                    Raio da coluna
                    <input type="number" min={500} step={250} value={hipotesesDeAgua.raioDaColunaMm} onChange={(e) => setHipDeAguaSalvas({ ...hipotesesDeAgua, raioDaColunaMm: Math.max(250, Math.round(Number(e.target.value) || 1500)) })} aria-label="Raio da coluna em mm" className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums" />
                    mm
                  </label>
                </div>
              </div>

              {planosDeAgua.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Insira uma <strong>caixa d'água</strong> (Hidráulica › reservação) — é de onde a água fria parte. Para a
                  água quente, um <strong>aquecedor</strong> com ponto de água quente.
                </p>
              ) : (
                <table className="w-full table-fixed text-xs" aria-label="Rede de água por origem">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-2 font-medium">Origem</th>
                      <th className="w-28 py-1.5 pr-2 font-medium">Pontos</th>
                      <th className="py-1.5 pr-2 font-medium">Previsto</th>
                      <th className="w-36 py-1.5 text-right font-medium">Lançar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planosDeAgua.map((p) => (
                      <tr key={p.origemId}>
                        <td className="py-1.5 pr-2">
                          <span className="font-medium text-slate-700">{p.origemNome}</span>
                          <span className="block text-slate-500">{ROTULO_DA_DISCIPLINA[p.disciplina]}</span>
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {p.pontos} ponto(s) · {p.ligados} ligado(s)
                          {p.pavimentos.length > 1 ? <span className="block text-slate-400">{p.pavimentos.length} pavimentos</span> : null}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {p.motivo ? (
                            <span className="text-slate-500">{p.motivo}</span>
                          ) : (
                            <>
                              {p.metrosPrevistos.toLocaleString('pt-BR')} m · {p.colunas} coluna(s) · ΣP {p.somaDePesos.toLocaleString('pt-BR')} · DN máx. {p.dnMaximoMm}
                            </>
                          )}
                          {p.avisos.map((a, i) => (
                            <span key={i} className="block text-amber-700">{a}</span>
                          ))}
                        </td>
                        <td className="py-1.5 text-right">
                          <span className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => lancarAgua([p])}
                              disabled={p.comandos.length === 0 && p.sugeridos === 0}
                              className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {p.comandos.length > 0 ? `Lançar ${p.aLigar || ''}`.trim() : p.sugeridos > 0 ? 'Relançar' : 'Ligado'}
                            </button>
                            {p.trechosDaRede > 0 && (
                              <button
                                type="button"
                                onClick={() => void refazerRedeDeAgua(p)}
                                title="Apaga a rede desta origem, inclusive o confirmado, e lança de novo"
                                className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Refazer
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tarefaAberta === 'pontosHidraulicos' && (
            <div className="space-y-4" data-testid="tarefa-pontos-hidraulicos">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses da distribuição</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    <strong>Banheiro</strong>: vaso no maior lado sem porta, lavatório junto à porta, chuveiro
                    no canto mais longe da porta, coletor a 30 cm do chuveiro. <strong>Cozinha</strong>: pia no
                    maior lado oposto à porta. <strong>Área de serviço</strong>: tanque e máquina lado a lado,
                    ralo seco perto do tanque.
                  </li>
                  <li>Cozinha × área de serviço decide pelo nome do ambiente ("serviço", "lavanderia") — troque na tabela.</li>
                  <li>Cotas pela ficha (NBR 5626/8160); o esgoto do chuveiro vai pelo coletor; a caixa de gordura fica fora do ambiente e é sua.</li>
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex items-center gap-2">
                    Água quente em
                    {(['CHUVEIRO', 'LAVATORIO', 'PIA_COZINHA', 'TANQUE', 'MAQUINA_LAVAR', 'DUCHA_HIGIENICA'] as const).map((t) => (
                      <label key={t} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={hipotesesDePontos.aguaQuenteEm.includes(t)}
                          onChange={(e) =>
                            setHipDePontosSalvas({
                              ...hipotesesDePontos,
                              aguaQuenteEm: e.target.checked
                                ? [...hipotesesDePontos.aguaQuenteEm, t]
                                : hipotesesDePontos.aguaQuenteEm.filter((x) => x !== t),
                            })
                          }
                          aria-label={`Água quente em ${FICHA_DO_PONTO_HIDRAULICO[t].rotulo}`}
                        />
                        {SIGLA_DO_PONTO_HIDRAULICO[t]}
                      </label>
                    ))}
                  </span>
                  <label className="flex items-center gap-2">
                    Coletor do banheiro
                    <select
                      value={hipotesesDePontos.coletorDoBanheiro}
                      onChange={(e) => setHipDePontosSalvas({ ...hipotesesDePontos, coletorDoBanheiro: e.target.value as HipotesesDePontos['coletorDoBanheiro'] })}
                      aria-label="Coletor do banheiro"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="CAIXA_SIFONADA">Caixa sifonada</option>
                      <option value="RALO_SIFONADO">Ralo sifonado</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Recuo da parede
                    <input
                      type="number"
                      min={50}
                      step={50}
                      value={hipotesesDePontos.recuoDaParedeMm}
                      onChange={(e) => setHipDePontosSalvas({ ...hipotesesDePontos, recuoDaParedeMm: Math.max(50, Math.round(Number(e.target.value) || 150)) })}
                      aria-label="Recuo da parede em mm"
                      className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums"
                    />
                    mm
                  </label>
                </div>
              </div>

              {planosDePontos.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum ambiente classificado como banheiro ou cozinha/serviço neste pavimento. Classifique o
                  tipo do cômodo (Tomadas pela NBR 5410 ou o cartão do ambiente) — o kit depende dele.
                </p>
              ) : (
                <table className="w-full table-fixed text-xs" aria-label="Pontos hidráulicos por ambiente">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-2 font-medium">Ambiente</th>
                      <th className="w-36 py-1.5 pr-2 font-medium">Kit</th>
                      <th className="py-1.5 pr-2 font-medium">A criar</th>
                      <th className="w-20 py-1.5 text-right font-medium">Lançar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planosDePontos.map((p) => (
                      <tr key={p.spaceId}>
                        <td className="py-1.5 pr-2 font-medium text-slate-700">{p.nome}</td>
                        <td className="py-1.5 pr-2">
                          <select
                            value={p.kit ?? ''}
                            onChange={(e) => setKitsForcados((k) => ({ ...k, [p.spaceId]: (e.target.value || null) as KitHidraulico | null }))}
                            aria-label={`Kit de ${p.nome}`}
                            className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
                          >
                            <option value="">Nenhum</option>
                            {(Object.keys(ROTULO_DO_KIT) as KitHidraulico[]).map((k) => (
                              <option key={k} value={k}>
                                {ROTULO_DO_KIT[k]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {p.aCriar > 0
                            ? p.pecas
                                .filter((x) => x.disciplinas.some((d) => !x.existentes.includes(d)))
                                .map((x) => `${SIGLA_DO_PONTO_HIDRAULICO[x.tipo]} (${x.disciplinas.filter((d) => !x.existentes.includes(d)).map((d) => ROTULO_DA_DISCIPLINA[d].replace('Água ', '')).join('/')})`)
                                .join(' · ')
                            : (p.motivo ?? '—')}
                        </td>
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => lancarPontos([p])}
                            disabled={p.aCriar === 0}
                            className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {p.aCriar > 0 ? `Lançar ${p.aCriar}` : 'Completo'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tarefaAberta === 'eletrodutos' && (
            <div className="space-y-4">
              {/* As HIPÓTESES, escritas — o molde da topografia e do pré-dimensionamento. */}
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses do lançamento</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    <strong>Uma rede por quadro</strong>, compartilhada pelos circuitos dele (NBR 5410 6.2.5.6 / 6.2.11):
                    cada trecho carrega os circuitos que passam por ele; o tronco que sai do quadro é comum.
                  </li>
                  <li>
                    Rede embutida no <strong>teto</strong> de cada pavimento (cota do pé-direito); prumada vertical na
                    posição de cada ponto e do quadro. Pavimentos acima ou abaixo do quadro são alcançados por uma{' '}
                    <strong>prumada na posição do quadro</strong>, atravessando a laje.
                  </li>
                  <li>
                    Por pavimento, árvore de <strong>menor eletroduto</strong> com todos os pontos do quadro, em linha
                    reta, com <strong>rota limitada</strong>: nenhum ponto faz até o quadro um caminho maior que a rota
                    máxima abaixo × a linha reta — sem isso a árvore mínima encadeava pontos distantes e o cabo dava a
                    volta na casa. Não desvia de viga nem de laje, que o desenho não conhece.
                  </li>
                  <li>
                    Condutores por circuito: FN e FF <strong>3</strong> · FFF <strong>4</strong>, somados no trecho. A{' '}
                    <strong>bitola</strong> é a menor comercial que respeita a taxa de ocupação (6.2.11.1.6), nunca abaixo
                    da mínima abaixo; o agrupamento medido entra na Tabela 42 do pré-dimensionamento.
                  </li>
                  <li>Ponto <strong>sem circuito</strong> não entra — atribuir circuito é decisão do projetista (Circuitos automáticos).</li>
                </ul>
                <label className="mt-2 flex items-center gap-2">
                  Bitola mínima do eletroduto
                  <select
                    value={bitolaDeEletroduto}
                    onChange={(e) => setBitolaDeEletroduto(Number(e.target.value))}
                    aria-label="Bitola do eletroduto lançado"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    {BITOLAS_DE_ELETRODUTO_MM.map((mm) => (
                      <option key={mm} value={mm}>
                        {mm} mm
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-1.5 flex items-center gap-2">
                  Rota máxima até o quadro
                  <select
                    value={rotaMaxima == null ? 'sem' : String(rotaMaxima)}
                    onChange={(e) => setRotaMaxima(e.target.value === 'sem' ? null : Number(e.target.value))}
                    aria-label="Rota máxima do eletroduto até o quadro"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                  >
                    {ROTAS_MAXIMAS.map((r) => (
                      <option key={r.rotulo} value={r.valor == null ? 'sem' : String(r.valor)}>
                        {r.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {planosDeEletrodutos.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum quadro ainda. Coloque um quadro de distribuição (Instalações › Componentes) e crie os
                  circuitos em Circuitos automáticos ou no Quadro de cargas.
                </p>
              ) : (
                <table className="w-full table-fixed text-xs" aria-label="Eletrodutos por quadro">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="w-24 py-1.5 pr-2 font-medium">Quadro</th>
                      <th className="py-1.5 pr-2 font-medium">Pavimentos · pontos ligados</th>
                      <th className="w-20 py-1.5 pr-2 font-medium">Previsto</th>
                      <th className="w-28 py-1.5 text-right font-medium">Lançar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planosDeEletrodutos.map((plano) => {
                      const temComandos = plano.comandos.length > 0;
                      return (
                        <tr key={plano.quadroId}>
                          <td className="truncate py-1.5 pr-2 font-medium text-slate-700">{plano.nome}</td>
                          <td className="py-1.5 pr-2 text-slate-600">
                            {plano.pavimentos.length === 0 ? (
                              <span className="text-slate-400">{plano.motivo ?? '—'}</span>
                            ) : (
                              <>
                                {plano.pavimentos.map((pv) => (
                                  <span key={pv.levelId} className="mr-2 inline-block whitespace-nowrap">
                                    {pv.nome}: {pv.ligados}/{pv.pontos}
                                  </span>
                                ))}
                                {plano.prumadasEntrePavimentos > 0 && (
                                  <span className="text-slate-400">· {plano.prumadasEntrePavimentos} prumada(s) entre pavimentos</span>
                                )}
                                {plano.trechosAtualizados > 0 && (
                                  <span className="text-slate-400"> · {plano.trechosAtualizados} trecho(s) ganham circuitos</span>
                                )}
                                {plano.motivo && !temComandos && <span className="text-slate-400"> · {plano.motivo}</span>}
                              </>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-slate-600">
                            {temComandos && plano.metrosPrevistos > 0 ? `${plano.metrosPrevistos.toFixed(1).replace('.', ',')} m` : '—'}
                          </td>
                          <td className="py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                !temComandos && plano.sugeridos === 0 && plano.trechosDoQuadro > 0
                                  ? void refazerRedeDoQuadro(plano)
                                  : lancarEletrodutos([plano])
                              }
                              disabled={!temComandos && plano.sugeridos === 0 && plano.trechosDoQuadro === 0}
                              title={
                                !temComandos && plano.sugeridos > 0
                                  ? `Apaga os ${plano.sugeridos} trecho(s) sugerido(s) deste quadro e refaz a rede — os confirmados ficam`
                                  : !temComandos && plano.trechosDoQuadro > 0
                                    ? `Apaga os ${plano.trechosDoQuadro} eletroduto(s) deste quadro, inclusive os confirmados, e lança de novo com as hipóteses atuais — pede confirmação`
                                    : undefined
                              }
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Cable className="h-3.5 w-3.5" />
                              {temComandos
                                ? plano.aLigar > 0
                                  ? `${plano.aLigar} ponto(s)`
                                  : 'atualizar'
                                : plano.sugeridos > 0
                                  ? `Relançar (${plano.sugeridos})`
                                  : plano.trechosDoQuadro > 0
                                    ? `Refazer (${plano.trechosDoQuadro})`
                                    : 'Nada'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {pontosEletricosSemCircuito.length > 0 && (
                <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="flex-1">
                    <strong>{pontosEletricosSemCircuito.length} ponto(s) sem circuito</strong> — o
                    eletroduto carrega o circuito, então ficam de fora até serem atribuídos (no
                    painel do ponto, no Quadro de cargas ou em Circuitos automáticos).
                  </span>
                  <button
                    type="button"
                    onClick={() => setTarefa('circuitos')}
                    className="shrink-0 rounded-[6px] border border-amber-400 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                  >
                    criar circuitos
                  </button>
                  <button
                    type="button"
                    onClick={() => selecionar(pontosEletricosSemCircuito.map((p) => p.id))}
                    className="shrink-0 rounded-[6px] border border-amber-400 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                  >
                    ver
                  </button>
                </p>
              )}
            </div>
          )}

          {tarefaAberta === 'fundacoes' && planoDeFundacoes && (
            <div className="space-y-4">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses do lançamento</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    <strong>Um bloco por pilar</strong> do pavimento, centrado e girado com ele — <strong>lance os pilares
                    antes</strong>. Pilar que já tem bloco é respeitado.
                  </li>
                  <li>
                    <strong>{hipotesesDeFundacoes.estacasPorBloco} estaca(s)</strong> por bloco em{' '}
                    <strong>{nomeDoArranjo(hipotesesDeFundacoes.estacasPorBloco)}</strong>, Ø{' '}
                    {hipotesesDeFundacoes.diametroDaEstacaMm / 10} cm × {hipotesesDeFundacoes.comprimentoDaEstacaMm / 1000} m
                    {hipotesesDeFundacoes.estacasPorBloco > 1
                      ? ` — centro de carga no eixo do pilar, 3Ø (${(3 * hipotesesDeFundacoes.diametroDaEstacaMm) / 10} cm) entre eixos, arranjo simétrico`
                      : ', no eixo do pilar'}
                    .
                  </li>
                  <li>
                    Lado do bloco = o maior entre Ø + 30 cm e lado do pilar + 20 cm, a cada 5 cm; altura{' '}
                    {hipotesesDeFundacoes.alturaDoBlocoMm / 10} cm; topo{' '}
                    {hipotesesDeFundacoes.vigaBaldrame && hipotesesDeFundacoes.posicaoDaBaldrame === 'NO_NIVEL_DO_BLOCO'
                      ? 'no piso (baldrame no nível do bloco)'
                      : `${hipotesesDeFundacoes.arrasamentoMm / 10} cm abaixo do piso (arrasamento)`}
                    . A estaca começa na base do bloco.
                  </li>
                  <li>
                    O <strong>pilar desce até o topo do bloco</strong> no mesmo lote. Peça enterrada não sobrepõe parede nem
                    muda ambiente. No canto, o bloco avança além da parede — é o normal.
                  </li>
                  <li>
                    <strong>Viga baldrame</strong>
                    {hipotesesDeFundacoes.vigaBaldrame ? '' : ' (desligada)'}: uma por parede, largura da parede (mín. 15 cm).{' '}
                    {hipotesesDeFundacoes.posicaoDaBaldrame === 'NO_NIVEL_DO_BLOCO' ? (
                      <>
                        <strong>No nível do bloco</strong>: a casa assenta na face superior da viga — topo da baldrame e do bloco{' '}
                        <strong>no piso</strong> (o arrasamento não se aplica), h {hipotesesDeFundacoes.alturaDaBaldrameMm / 10} cm, entrando
                        no bloco até o eixo do encontro; o pilar começa no piso.
                      </>
                    ) : (
                      <>
                        <strong>Sobre o bloco</strong>: apoiada no topo dos blocos e subindo até o piso (h = arrasamento,{' '}
                        {hipotesesDeFundacoes.arrasamentoMm / 10} cm), de face a face de pilar.
                      </>
                    )}{' '}
                    Não cruza o piso — a parede não cede.
                  </li>
                  <li>
                    <strong>Não dimensiona</strong>: fundação se define com a sondagem (NBR 6122) — capacidade de carga,
                    comprimento útil e armadura são do responsável técnico.
                  </li>
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2">
                    Estacas
                    <select
                      value={hipotesesDeFundacoes.estacasPorBloco}
                      onChange={(e) => setHipDeFundacoesSalvas((h) => ({ ...h, estacasPorBloco: Number(e.target.value) }))}
                      aria-label="Estacas por bloco"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {ESTACAS_POR_BLOCO.map((n) => (
                        <option key={n} value={n}>
                          {n} por bloco · {nomeDoArranjo(n)}{n === HIPOTESES_FUNDACOES_PADRAO.estacasPorBloco ? ' (sugerido)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Ø
                    <select
                      value={hipotesesDeFundacoes.diametroDaEstacaMm}
                      onChange={(e) => setHipDeFundacoesSalvas((h) => ({ ...h, diametroDaEstacaMm: Number(e.target.value) }))}
                      aria-label="Diâmetro da estaca"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {DIAMETROS_DE_ESTACA.map((d) => (
                        <option key={d} value={d}>
                          {d / 10} cm
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Comprimento
                    <select
                      value={hipotesesDeFundacoes.comprimentoDaEstacaMm}
                      onChange={(e) => setHipDeFundacoesSalvas((h) => ({ ...h, comprimentoDaEstacaMm: Number(e.target.value) }))}
                      aria-label="Comprimento da estaca"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {COMPRIMENTOS_DE_ESTACA.map((c) => (
                        <option key={c} value={c}>
                          {c / 1000} m
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Bloco h
                    <select
                      value={hipotesesDeFundacoes.alturaDoBlocoMm}
                      onChange={(e) => setHipDeFundacoesSalvas((h) => ({ ...h, alturaDoBlocoMm: Number(e.target.value) }))}
                      aria-label="Altura do bloco"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {ALTURAS_DE_BLOCO.map((a) => (
                        <option key={a} value={a}>
                          {a / 10} cm
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Arrasamento
                    <select
                      value={hipotesesDeFundacoes.arrasamentoMm}
                      onChange={(e) => setHipDeFundacoesSalvas((h) => ({ ...h, arrasamentoMm: Number(e.target.value) }))}
                      aria-label="Arrasamento do bloco"
                      disabled={hipotesesDeFundacoes.vigaBaldrame && hipotesesDeFundacoes.posicaoDaBaldrame === 'NO_NIVEL_DO_BLOCO'}
                      title={
                        hipotesesDeFundacoes.vigaBaldrame && hipotesesDeFundacoes.posicaoDaBaldrame === 'NO_NIVEL_DO_BLOCO'
                          ? 'Com a baldrame no nível do bloco, o topo do bloco fica no piso — o arrasamento não se aplica'
                          : undefined
                      }
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {ARRASAMENTOS.map((a) => (
                        <option key={a} value={a}>
                          {a / 10} cm
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hipotesesDeFundacoes.vigaBaldrame}
                      onChange={(e) => setHipDeFundacoesSalvas((h) => ({ ...h, vigaBaldrame: e.target.checked }))}
                      aria-label="Lançar viga baldrame"
                    />
                    Viga baldrame
                  </label>
                  {hipotesesDeFundacoes.vigaBaldrame && (
                    <label className="flex items-center gap-2">
                      Posição
                      <select
                        value={hipotesesDeFundacoes.posicaoDaBaldrame}
                        onChange={(e) =>
                          setHipDeFundacoesSalvas((h) => ({
                            ...h,
                            posicaoDaBaldrame: e.target.value === 'NO_NIVEL_DO_BLOCO' ? 'NO_NIVEL_DO_BLOCO' : 'SOBRE_O_BLOCO',
                          }))
                        }
                        aria-label="Posição da baldrame"
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {POSICOES_DA_BALDRAME.map((p) => (
                          <option key={p} value={p}>
                            {ROTULO_DA_POSICAO_DA_BALDRAME[p]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {hipotesesDeFundacoes.vigaBaldrame && hipotesesDeFundacoes.posicaoDaBaldrame === 'NO_NIVEL_DO_BLOCO' && (
                    <label className="flex items-center gap-2">
                      Altura da baldrame
                      <select
                        value={hipotesesDeFundacoes.alturaDaBaldrameMm}
                        onChange={(e) => setHipDeFundacoesSalvas((h) => ({ ...h, alturaDaBaldrameMm: Number(e.target.value) }))}
                        aria-label="Altura da baldrame"
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {ALTURAS_DE_BALDRAME.map((a) => (
                          <option key={a} value={a}>
                            {a / 10} cm{a === HIPOTESES_FUNDACOES_PADRAO.alturaDaBaldrameMm ? ' (sugerido)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {planoDeFundacoes.comandos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDrawerRecolhido(true)}
                      title="Recolhe a gaveta para ver blocos, estacas e baldrames propostos, tracejados em azul, sobre o desenho"
                      className="rounded-[6px] border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Ver prévia no desenho
                    </button>
                  )}
                </div>
              </div>

              {planoDeFundacoes.motivo ? (
                <p className="text-sm text-slate-500">
                  {planoDeFundacoes.motivo === 'lance os pilares antes'
                    ? 'Nenhum pilar neste pavimento — lance os pilares antes: a fundação nasce embaixo deles.'
                    : planoDeFundacoes.motivo === 'todos os pilares já têm bloco'
                      ? 'Todos os pilares já têm bloco. Para mudar Ø, comprimento ou bloco, ajuste as hipóteses e use Relançar.'
                      : `Nada a lançar: ${planoDeFundacoes.motivo}.`}
                </p>
              ) : planoDeFundacoes.blocos.length === 0 ? null : (
                <table className="w-full table-fixed text-xs" aria-label="Prévia das fundações">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="w-16 py-1.5 pr-2 font-medium">Pilar</th>
                      <th className="py-1.5 pr-2 font-medium">Bloco (cm)</th>
                      <th className="py-1.5 pr-2 font-medium">Estacas</th>
                      <th className="w-24 py-1.5 text-right font-medium">Topo (m)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planoDeFundacoes.blocos.map((b) => (
                      <tr key={b.idPrevisto}>
                        <td className="py-1.5 pr-2 font-medium text-slate-700">
                          {b.pilarRotulo ?? '—'}
                          {b.aviso && <span className="block font-normal text-amber-800">{b.aviso}</span>}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-600">
                          {b.rotulo} · {b.larguraMm / 10} × {b.profundidadeMm / 10} × {b.alturaMm / 10}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-600">
                          {b.estacas.length} × Ø {b.estacas[0].diametroMm / 10} · {(b.estacas[0].comprimentoMm / 1000).toFixed(2).replace('.', ',')} m
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {((b.baseMm + b.alturaMm) / 1000).toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {planoDeFundacoes.baldrames.length > 0 && (
                <table className="w-full table-fixed text-xs" aria-label="Prévia das vigas baldrame">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="w-16 py-1.5 pr-2 font-medium">Viga</th>
                      <th className="py-1.5 pr-2 font-medium">Seção (cm)</th>
                      <th className="py-1.5 pr-2 font-medium">Paredes</th>
                      <th className="w-24 py-1.5 text-right font-medium">Compr. (m)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planoDeFundacoes.baldrames.map((v) => (
                      <tr key={v.idPrevisto}>
                        <td className="py-1.5 pr-2 font-medium text-slate-700">{v.rotulo}</td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-600">
                          {v.larguraMm / 10} × {v.alturaMm / 10} ·{' '}
                          {v.baseMm + v.alturaMm === 0
                            ? 'topo no piso'
                            : `topo ${((v.baseMm + v.alturaMm) / 1000).toFixed(2).replace('.', ',')} m`}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">{v.wallIds.length}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {(v.comprimentoMm / 1000).toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {planoDeFundacoes.pilaresComBloco > 0 && (
                <p className="text-xs text-slate-500">
                  {planoDeFundacoes.pilaresComBloco} pilar(es) já com bloco
                  {planoDeFundacoes.cadeiasComBaldrame > 0 ? ` e ${planoDeFundacoes.cadeiasComBaldrame} parede(s) já com baldrame` : ''} — mantidos.
                </p>
              )}
              {planoDeFundacoes.avisos.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                  {planoDeFundacoes.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              {resultadoDeFundacoes && (
                <p
                  role="status"
                  className={`rounded-md border px-3 py-2 text-xs ${
                    resultadoDeFundacoes.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {resultadoDeFundacoes.texto}
                </p>
              )}
            </div>
          )}

          {tarefaAberta === 'vigas' && planoDeVigas && (
            <div className="space-y-4">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses do lançamento</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    <strong>Uma viga por parede</strong>, de pilar a pilar — paredes emendadas em linha reta viram uma viga
                    só; canto, T e cruzamento terminam a viga.
                  </li>
                  <li>
                    Altura por pré-dimensionamento: <strong>h = maior vão ÷ {hipotesesDeVigas.divisorDaAltura}</strong>, a
                    cada 5 cm, nunca abaixo de {hipotesesDeVigas.alturaMinimaMm / 10} cm. Apoios: pontas, encontros e
                    pilares já desenhados — <strong>lance os pilares antes</strong>: um pilar no meio da parede baixa a viga.
                  </li>
                  <li>Largura = espessura da parede (mín. 12 cm, NBR 6118 13.2.2), no eixo da alvenaria.</li>
                  <li>
                    As pontas <strong>recuam até a face do pilar</strong>; onde a viga passa por cima de um pilar
                    intermediário, o volume disputado sai da viga (o pilar é contínuo).
                  </li>
                  <li>
                    Topo no pé-direito
                    {peDireitoDoNivelAtivo != null ? ` (${(peDireitoDoNivelAtivo / 1000).toFixed(2).replace('.', ',')} m)` : ''}; as
                    paredes passam a <strong>ceder</strong> o volume à viga.
                  </li>
                  <li>
                    <strong>Não dimensiona</strong>: L/10 é regra de lançamento; cálculo, armadura e flecha são do responsável
                    técnico. Viga já desenhada na parede é respeitada.
                  </li>
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2">
                    Altura
                    <select
                      value={hipotesesDeVigas.divisorDaAltura}
                      onChange={(e) => setHipDeVigasSalvas((h) => ({ ...h, divisorDaAltura: Number(e.target.value) }))}
                      aria-label="Divisor da altura da viga"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {DIVISORES_DA_ALTURA.map((d) => (
                        <option key={d} value={d}>
                          vão ÷ {d}{d === HIPOTESES_VIGAS_PADRAO.divisorDaAltura ? ' (sugerido)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Mínimo
                    <select
                      value={hipotesesDeVigas.alturaMinimaMm}
                      onChange={(e) => setHipDeVigasSalvas((h) => ({ ...h, alturaMinimaMm: Number(e.target.value) }))}
                      aria-label="Altura mínima da viga"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {ALTURAS_MINIMAS_DE_VIGA.map((a) => (
                        <option key={a} value={a}>
                          {a / 10} cm
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hipotesesDeVigas.incluirInternas}
                      onChange={(e) => setHipDeVigasSalvas((h) => ({ ...h, incluirInternas: e.target.checked }))}
                      aria-label="Incluir paredes internas nas vigas"
                    />
                    Incluir paredes internas
                  </label>
                  {planoDeVigas.vigas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDrawerRecolhido(true)}
                      title="Recolhe a gaveta para ver as vigas propostas, tracejadas em azul, sobre o desenho"
                      className="rounded-[6px] border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Ver prévia no desenho
                    </button>
                  )}
                </div>
              </div>

              {planoDeVigas.motivo ? (
                <p className="text-sm text-slate-500">
                  {planoDeVigas.motivo === 'sem parede no pavimento'
                    ? 'Desenhe paredes neste pavimento — a viga nasce sobre elas.'
                    : planoDeVigas.motivo === 'todas as paredes já têm viga'
                      ? 'Todas as paredes já têm viga. Para mudar a altura, ajuste as hipóteses e use Relançar.'
                      : `Nada a lançar: ${planoDeVigas.motivo}.`}
                </p>
              ) : (
                <table className="w-full table-fixed text-xs" aria-label="Prévia das vigas">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="w-12 py-1.5 pr-2 font-medium">Viga</th>
                      <th className="w-16 py-1.5 pr-2 font-medium">Paredes</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Compr. (m)</th>
                      <th className="w-24 py-1.5 pr-2 text-right font-medium">Seção (cm)</th>
                      <th className="w-24 py-1.5 text-right font-medium">Maior vão (m)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planoDeVigas.vigas.map((v) => (
                      <tr key={v.idPrevisto}>
                        <td className="py-1.5 pr-2 font-medium text-slate-700">
                          {v.rotulo}
                          {v.aviso && <span className="block font-normal text-amber-800">{v.aviso}</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">{v.wallIds.length}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">
                          {(v.comprimentoMm / 1000).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">
                          {v.larguraMm / 10} × {v.alturaMm / 10}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {(v.maiorVaoMm / 1000).toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {planoDeVigas.cadeiasComViga > 0 && (
                <p className="text-xs text-slate-500">{planoDeVigas.cadeiasComViga} parede(s) já com viga — mantidas.</p>
              )}
              {planoDeVigas.foraDoPlano.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">{planoDeVigas.foraDoPlano.length} parede(s) fora do plano</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {[...new Set(planoDeVigas.foraDoPlano.map((f) => f.motivo))].map((motivo) => (
                      <li key={motivo}>{motivo}</li>
                    ))}
                  </ul>
                </div>
              )}
              {planoDeVigas.avisos.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                  {planoDeVigas.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              {resultadoDeVigas && (
                <p
                  role="status"
                  className={`rounded-md border px-3 py-2 text-xs ${
                    resultadoDeVigas.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {resultadoDeVigas.texto}
                </p>
              )}
            </div>
          )}

          {tarefaAberta === 'lajes' && planoDeLajes && (
            <div className="space-y-4">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses do lançamento</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    <strong>Uma laje por ambiente fechado</strong> — o anel do cômodo, no eixo das paredes: o painel entre
                    vigas.
                  </li>
                  <li>
                    Espessura <strong>{hipotesesDeLajes.espessuraMm / 10} cm</strong> (NBR 6118 13.2.4.1 pede de 7 a 10 cm
                    conforme o uso), apoiada no topo das paredes
                    {peDireitoDoNivelAtivo != null ? ` (${(peDireitoDoNivelAtivo / 1000).toFixed(2).replace('.', ',')} m)` : ''}.
                  </li>
                  <li>Ambiente com ilha: a laje cobre a ilha (dito na linha). Ambientes com menos de 0,5 m² ficam de fora.</li>
                  <li>
                    <strong>Não dimensiona</strong>: espessura é hipótese; cálculo, armadura e flecha são do responsável técnico.
                    Laje já desenhada no ambiente é respeitada.
                  </li>
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2">
                    Espessura
                    <select
                      value={hipotesesDeLajes.espessuraMm}
                      onChange={(e) => setHipDeLajesSalvas({ espessuraMm: Number(e.target.value) })}
                      aria-label="Espessura da laje"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {ESPESSURAS_DE_LAJE.map((x) => (
                        <option key={x} value={x}>
                          {x / 10} cm{x === HIPOTESES_LAJES_PADRAO.espessuraMm ? ' (sugerido)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {planoDeLajes.lajes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDrawerRecolhido(true)}
                      title="Recolhe a gaveta para ver as lajes propostas, tracejadas em azul, sobre o desenho"
                      className="rounded-[6px] border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Ver prévia no desenho
                    </button>
                  )}
                </div>
              </div>

              {planoDeLajes.motivo ? (
                <p className="text-sm text-slate-500">
                  {planoDeLajes.motivo === 'nenhum ambiente fechado no pavimento'
                    ? 'Feche os ambientes com paredes — a laje nasce de cada cômodo fechado.'
                    : planoDeLajes.motivo === 'todos os ambientes já têm laje'
                      ? 'Todos os ambientes já têm laje. Para mudar a espessura, ajuste a hipótese e use Relançar.'
                      : `Nada a lançar: ${planoDeLajes.motivo}.`}
                </p>
              ) : (
                <table className="w-full table-fixed text-xs" aria-label="Prévia das lajes">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="w-12 py-1.5 pr-2 font-medium">Laje</th>
                      <th className="py-1.5 pr-2 font-medium">Ambiente</th>
                      <th className="w-24 py-1.5 pr-2 text-right font-medium">Área (m²)</th>
                      <th className="w-24 py-1.5 text-right font-medium">Espessura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planoDeLajes.lajes.map((l) => (
                      <tr key={l.idPrevisto}>
                        <td className="py-1.5 pr-2 font-medium text-slate-700">
                          {l.rotulo}
                          {l.aviso && <span className="block font-normal text-amber-800">{l.aviso}</span>}
                        </td>
                        <td className="truncate py-1.5 pr-2 text-slate-600">{l.ambiente ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">
                          {(l.areaMm2 / 1_000_000).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">{l.espessuraMm / 10} cm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {planoDeLajes.ambientesComLaje > 0 && (
                <p className="text-xs text-slate-500">{planoDeLajes.ambientesComLaje} ambiente(s) já com laje — mantidos.</p>
              )}
              {planoDeLajes.foraDoPlano.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">{planoDeLajes.foraDoPlano.length} ambiente(s) fora do plano</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {[...new Set(planoDeLajes.foraDoPlano.map((f) => f.motivo))].map((motivo) => (
                      <li key={motivo}>{motivo}</li>
                    ))}
                  </ul>
                </div>
              )}
              {resultadoDeLajes && (
                <p
                  role="status"
                  className={`rounded-md border px-3 py-2 text-xs ${
                    resultadoDeLajes.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {resultadoDeLajes.texto}
                </p>
              )}
            </div>
          )}

          {tarefaAberta === 'pilares' && planoDePilares && (
            <div className="space-y-4">
              {/* As HIPÓTESES, escritas — o que é norma e o que é escolha, separados. */}
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses do lançamento</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    Um pilar em cada <strong>encontro de paredes</strong> — canto, T e cruzamento. Emenda em linha reta
                    e ponta solta não contam.
                  </li>
                  <li>
                    <strong>Intermediários</strong> quando a distância entre apoios passa do vão máximo: o trecho é
                    dividido em vãos iguais, desviando de porta, janela e vão livre.
                  </li>
                  <li>
                    Seção com o lado maior ao longo da parede; em parede mais fina que a seção o pilar sobressai
                    (19 cm numa parede de 15 cm: 2 cm por lado).
                  </li>
                  <li>
                    Altura = pé-direito do pavimento
                    {peDireitoDoNivelAtivo != null ? ` (${(peDireitoDoNivelAtivo / 1000).toFixed(2).replace('.', ',')} m)` : ''}, base no
                    piso. Outro pavimento: rode lá.
                  </li>
                  <li>As paredes atravessadas passam a <strong>ceder</strong> o volume ao pilar — o quantitativo não paga duas vezes.</li>
                  <li>
                    <strong>Não dimensiona</strong>: 19 cm é o mínimo da NBR 6118 (13.2.3); seção, armadura e verificação
                    são do responsável técnico. Pilar já desenhado é respeitado e conta como apoio.
                  </li>
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2">
                    Vão máximo
                    <select
                      value={hipotesesDePilares.vaoMaximoMm}
                      onChange={(e) => setHipDePilaresSalvas((h) => ({ ...h, vaoMaximoMm: Number(e.target.value) }))}
                      aria-label="Vão máximo entre pilares"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {VAOS_MAXIMOS.map((v) => (
                        <option key={v} value={v}>
                          {v / 1000} m{v === HIPOTESES_PILARES_PADRAO.vaoMaximoMm ? ' (sugerido)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Seção
                    <select
                      value={secaoDePilarEscolhida}
                      onChange={(e) => setHipDePilaresSalvas((h) => ({ ...h, secao: e.target.value as SecaoSugeridaId }))}
                      aria-label="Seção do pilar"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {SECOES_SUGERIDAS.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hipotesesDePilares.incluirInternas}
                      onChange={(e) => setHipDePilaresSalvas((h) => ({ ...h, incluirInternas: e.target.checked }))}
                      aria-label="Incluir paredes internas"
                    />
                    Incluir paredes internas
                  </label>
                  {planoDePilares.pilares.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDrawerRecolhido(true)}
                      title="Recolhe a gaveta para ver os pilares propostos, tracejados em azul, sobre o desenho"
                      className="rounded-[6px] border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Ver prévia no desenho
                    </button>
                  )}
                </div>
              </div>

              {planoDePilares.motivo ? (
                <p className="text-sm text-slate-500">
                  {planoDePilares.motivo === 'sem parede no pavimento'
                    ? 'Desenhe paredes neste pavimento — o pilar nasce no encontro delas.'
                    : planoDePilares.motivo === 'todos os encontros já têm pilar'
                      ? 'Todos os encontros de paredes já têm pilar. Para mudar a seção ou o vão, ajuste as hipóteses e use Relançar.'
                      : `Nada a lançar: ${planoDePilares.motivo}.`}
                </p>
              ) : (
                <table className="w-full table-fixed text-xs" aria-label="Prévia dos pilares">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="w-14 py-1.5 pr-2 font-medium">Pilar</th>
                      <th className="w-24 py-1.5 pr-2 font-medium">Onde</th>
                      <th className="w-20 py-1.5 pr-2 font-medium">Paredes</th>
                      <th className="py-1.5 pr-2 font-medium">Posição (m)</th>
                      <th className="w-24 py-1.5 text-right font-medium">Seção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planoDePilares.pilares.map((p) => (
                      <tr key={p.idPrevisto}>
                        <td className="py-1.5 pr-2 font-medium text-slate-700">{p.rotulo}</td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {ROTULO_DO_ONDE[p.onde]}
                          {p.aviso && <span className="block text-amber-800">{p.aviso}</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-600">{p.wallIds.length}</td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-600">
                          {(p.at.x / 1000).toFixed(2).replace('.', ',')} · {(p.at.y / 1000).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {p.larguraMm / 10} × {p.profundidadeMm / 10} cm
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {(planoDePilares.nosComPilarExistente > 0 || planoDePilares.pontasSoltas > 0) && (
                <p className="text-xs text-slate-500">
                  {planoDePilares.nosComPilarExistente > 0 &&
                    `${planoDePilares.nosComPilarExistente} encontro(s) já com pilar — mantidos. `}
                  {planoDePilares.pontasSoltas > 0 && `${planoDePilares.pontasSoltas} ponta(s) solta(s) sem pilar.`}
                </p>
              )}

              {planoDePilares.foraDoPlano.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">{planoDePilares.foraDoPlano.length} posição(ões) fora do plano</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {[...new Set(planoDePilares.foraDoPlano.map((f) => f.motivo))].map((motivo) => (
                      <li key={motivo}>{motivo}</li>
                    ))}
                  </ul>
                </div>
              )}

              {planoDePilares.avisos.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                  {planoDePilares.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}

              {resultadoDePilares && (
                <p
                  role="status"
                  className={`rounded-md border px-3 py-2 text-xs ${
                    resultadoDePilares.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {resultadoDePilares.texto}
                </p>
              )}
            </div>
          )}

          {tarefaAberta === 'circuitos' && planoDeCircuitos && (
            <div className="space-y-4">
              {/* As HIPÓTESES, escritas — o que é norma e o que é escolha, separados. */}
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-700">Hipóteses da criação</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    Luz, TUG e TUE <strong>nunca</strong> no mesmo circuito (NBR 5410 9.5.3.1 / 9.5.3.3); tomadas de
                    cozinha / área de serviço em circuito próprio (9.5.3.2). O critério só divide luz e TUG.
                  </li>
                  <li>TUE e ligação direta: <strong>um circuito por ponto</strong>.</li>
                  <li>Interruptor acompanha a luz do ambiente; pontos de dados ficam de fora.</li>
                  <li>Só pontos <strong>sem circuito</strong> deste pavimento — nada é religado.</li>
                  <li>
                    Cada circuito nasce com a seção mínima da função: luz <strong>1,5</strong> · TUG{' '}
                    <strong>2,5</strong> (Tab. 47) · TUE{' '}
                    <strong>{String(hipotesesEletricas.secaoMinimaTueMm2).replace('.', ',')}</strong> mm² (hipótese do
                    pré-dimensionamento). Tensão e ligação vêm do quadro.
                  </li>
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {/* O seletor mostra TODOS os quadros do desenho, com o pavimento de
                      cada um (17/09/2026): o QDC do térreo pode receber os circuitos
                      do andar de cima. Com um só, o nome aparece sem seletor. */}
                  {quadrosDoNivelAtivo.length > 1 ? (
                    <label className="flex items-center gap-2">
                      Quadro
                      <select
                        value={quadroDosCircuitos?.id ?? ''}
                        onChange={(e) => setQuadroParaCircuitos(e.target.value)}
                        aria-label="Quadro dos circuitos"
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {quadrosDoNivelAtivo.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.nome}
                            {q.levelId !== levelId ? ` (${pavimentoDoQuadro(editor.model, q)})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : quadroDosCircuitos && quadroDosCircuitos.levelId !== levelId ? (
                    <span>
                      Quadro <strong>{quadroDosCircuitos.nome}</strong> ({pavimentoDoQuadro(editor.model, quadroDosCircuitos)})
                    </span>
                  ) : null}
                  <label className="flex items-center gap-2">
                    Dividir luz e TUG
                    <select
                      value={hipotesesDeCircuitos.criterio}
                      onChange={(e) =>
                        setHipDeCircuitosSalvas({
                          ...hipDeCircuitosSalvas,
                          criterio: e.target.value as HipotesesDeCircuitos['criterio'],
                        })
                      }
                      aria-label="Critério de divisão dos circuitos"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {CRITERIOS_DE_CIRCUITO.map((c) => (
                        <option key={c} value={c}>
                          {ROTULO_DO_CRITERIO_DE_CIRCUITO[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Carga máxima por circuito
                    <input
                      type="number"
                      min={100}
                      step={10}
                      value={hipotesesDeCircuitos.cargaMaximaVA ?? ''}
                      placeholder={planoDeCircuitos.cargaMaxima ? String(planoDeCircuitos.cargaMaxima.va) : '—'}
                      disabled={hipotesesDeCircuitos.criterio === 'funcao'}
                      onChange={(e) =>
                        setHipDeCircuitosSalvas({
                          ...hipDeCircuitosSalvas,
                          cargaMaximaVA: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      aria-label="Carga máxima por circuito"
                      className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    VA
                  </label>
                  {planoDeCircuitos.cargaMaxima && (
                    <span className="text-slate-500">
                      {planoDeCircuitos.cargaMaxima.origem === 'CALCULADA'
                        ? `padrão ${hipotesesDeCircuitos.correnteMaximaA} A × ${planoDeCircuitos.cargaMaxima.tensaoV} V`
                        : `declarada (padrão seria ${hipotesesDeCircuitos.correnteMaximaA} A × ${planoDeCircuitos.cargaMaxima.tensaoV} V)`}
                      {planoDeCircuitos.cargaMaxima.tensaoAssumida ? ' — quadro sem tensão, assumida' : ''}
                    </span>
                  )}
                </div>
              </div>

              {!quadroDosCircuitos ? (
                <p className="text-sm text-slate-500">
                  Insira um Quadro de distribuição no desenho (Instalações › Componentes) — o circuito nasce
                  nele, em qualquer pavimento.
                </p>
              ) : planoDeCircuitos.circuitos.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum ponto sem circuito neste pavimento.</p>
              ) : (
                <table className="w-full table-fixed text-xs" aria-label="Prévia dos circuitos">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-1.5 pr-2 font-medium">Circuito</th>
                      <th className="w-24 py-1.5 pr-2 font-medium">Ambiente</th>
                      <th className="w-16 py-1.5 pr-2 font-medium">Pontos</th>
                      <th className="w-20 py-1.5 pr-2 text-right font-medium">VA</th>
                      <th className="w-16 py-1.5 text-right font-medium">Seção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {planoDeCircuitos.circuitos.map((c) => (
                      <tr
                        key={c.idPrevisto}
                        onClick={() => selecionar(c.terminalIds)}
                        title="Clique para selecionar os pontos deste circuito no desenho"
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="py-1.5 pr-2 font-medium text-slate-700">
                          {c.nome}
                          {c.aviso && <span className="block font-normal text-amber-800">{c.aviso}</span>}
                        </td>
                        <td className="truncate py-1.5 pr-2 text-slate-600">{c.ambiente ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-slate-600">
                          {c.terminalIds.length}
                          {c.pontosSemPotencia > 0 && (
                            <span className="text-amber-700" title="ponto(s) sem potência declarada — contam 0 VA">
                              {' '}· {c.pontosSemPotencia} sem VA
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-slate-600">{c.somaVA}</td>
                        <td className="py-1.5 text-right text-slate-600">
                          {String(c.secaoMm2).replace('.', ',')} mm²
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {planoDeCircuitos.circuitos.some((c) => c.pontosSemPotencia > 0) && (
                <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="flex-1">
                    Há ponto <strong>sem potência</strong> — entra contando 0 VA. Preencher pela norma antes dá
                    circuitos divididos pela carga real.
                  </span>
                  <button
                    type="button"
                    onClick={() => editor.runBatch(comandosDePotenciaPadrao(editor.model, levelId))}
                    className="shrink-0 rounded-[6px] border border-amber-400 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                  >
                    Preencher potências pela norma
                  </button>
                </p>
              )}

              {planoDeCircuitos.foraDoPlano.length > 0 && (
                <p className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="flex-1">
                    <strong>{planoDeCircuitos.foraDoPlano.length} ponto(s) fora do plano</strong> —{' '}
                    {[...new Set(planoDeCircuitos.foraDoPlano.map((f) => f.motivo))].join('; ')}.
                  </span>
                  <button
                    type="button"
                    onClick={() => selecionar(planoDeCircuitos.foraDoPlano.map((f) => f.terminalId))}
                    className="shrink-0 rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 font-medium hover:bg-slate-100"
                  >
                    ver
                  </button>
                </p>
              )}

              {resultadoDeCircuitos && (
                <p
                  role="status"
                  className={`rounded-md border px-3 py-2 text-xs ${
                    resultadoDeCircuitos.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {resultadoDeCircuitos.texto}
                </p>
              )}
            </div>
          )}

          {tarefaAberta === 'gerar-paredes' && (
            <PainelGerarParedes
              underlay={fundo.underlay}
              temFundo={!!fundo.linha}
              semAfericao={fundo.semAfericao}
              pranchaId={fundo.ativaId}
              limitesDaVista={limitesDaVista}
              regiao={regiao}
              regiaoArmada={regiaoArmada}
              onArmarRegiao={() => {
                // Armar RECOLHE o drawer: a região se marca arrastando no
                // desenho, que o drawer modal cobre. Desarmar o traz de volta.
                setRegiaoArmada((a) => {
                  setDrawerRecolhido(!a);
                  return !a;
                });
              }}
              onLimparRegiao={() => setRegiao(null)}
              ocupado={fundo.ocupado}
              onExtrair={(arquivo, pag) => extrairSegmentosPdf(arquivo, pag)}
              onVetorGuardado={fundo.vetorDaPranchaAtiva}
              onRegravar={(segs, larg, alt, m, arcos) =>
                void fundo.regravarVetor(segs, larg, alt, m, arcos)
              }
              onGerar={aplicarParedesGeradas}
              paredesDoNivel={paredesParaPortas}
              onGerarPortas={aplicarPortasGeradas}
            />
          )}

          {tarefaAberta === 'importar-ifc' && (
            <PainelImportarIfc model={editor.model} levelIdAtivo={levelId} onImportar={importarDoIfc} />
          )}

          {tarefaAberta === 'importar-dxf' && (
            <PainelImportarDxf
              model={editor.model}
              levelIdAtivo={levelId}
              onImportar={importarDoIfc}
              // FUNDO DO DXF (P2.36): o desenho original rasterizado e já aferido, por baixo das paredes geradas.
              onFundo={async (blob, nome, u, larguraPx, desenho) => (await fundo.importarRaster(blob, nome, u, larguraPx, desenho)) !== null}
              fundoAtivo={!!fundo.linha}
              // GERAR DE NOVO (P2.38): o desenho guardado na prancha, e a mesma região do "Do PDF".
              onDesenhoGuardado={fundo.desenhoDaPranchaAtiva}
              regiao={regiao}
              regiaoArmada={regiaoArmada}
              onArmarRegiao={() => {
                setRegiaoArmada((a) => {
                  setDrawerRecolhido(!a);
                  return !a;
                });
              }}
              onLimparRegiao={() => setRegiao(null)}
            />
          )}
          {tarefaAberta === 'importar-collada' && (
            <PainelImportarCollada model={editor.model} levelIdAtivo={levelId} onImportar={importarDoIfc} />
          )}

          {tarefaAberta === 'importar-bcf' && (
            <PainelImportarBcf
              model={editor.model}
              // ⚠️ `orgId` do seletor do topo, e não `study.organization_id`
              // — a mesma regra que o resto do editor segue (REGRA #5).
              organizationId={orgId ?? study.organization_id}
              studyId={study.id}
              onSelecionar={(uid) => {
                // O tópico aponta por `uid`; a seleção do editor é por `id`.
                // A ponte é o modelo — e ela existe porque o uid é estável.
                const alvo = [
                  ...editor.model.walls,
                  ...editor.model.openings,
                  ...editor.model.structures,
                  ...(editor.model.trechos ?? []),
                  ...(editor.model.terminais ?? []),
                  ...(editor.model.quadros ?? []),
                  ...(editor.model.roofs ?? []),
                  ...(editor.model.stairs ?? []),
                ].find((x) => x.uid === uid);
                if (alvo) selecionar([alvo.id]);
              }}
            />
          )}

          {tarefaAberta === 'tomadas' && ambientes.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhum ambiente fechado ainda. Feche um contorno de paredes — a norma conta
              tomadas por cômodo.
            </p>
          ) : tarefaAberta === 'tomadas' ? (
            <ul className="divide-y divide-slate-100">
              {ambientes.map((a) => (
                <li key={a.id} className="py-3 first:pt-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-700">{a.rotulo}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-500">
                      {a.areaM2.toFixed(2).replace('.', ',')} m² ·{' '}
                      {a.perimetroM.toFixed(2).replace('.', ',')} m
                    </span>
                  </div>
                  {controlesDeTomadas(a)}
                </li>
              ))}
            </ul>
          ) : null}
        </SheetPanel>

        <SheetFooter>
          {tarefaAberta === 'esgoto' && (
            <>
              <span className="mr-auto text-xs text-slate-500">
                {planoDeEsgoto.destinoId == null ? 'Sem caixa de inspeção no desenho.' : `${planoDeEsgoto.aLigar} fonte(s) a ligar.`}
              </span>
              {planoDeEsgoto.trechosDaRede > 0 && (
                <button
                  type="button"
                  onClick={() => void refazerRedeDeEsgoto()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Refazer
                </button>
              )}
              <button
                type="button"
                onClick={lancarEsgoto}
                disabled={planoDeEsgoto.comandos.length === 0 && planoDeEsgoto.sugeridos === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Waves className="h-4 w-4" />
                {planoDeEsgoto.comandos.length > 0 ? `Lançar (${planoDeEsgoto.aLigar})` : planoDeEsgoto.sugeridos > 0 ? 'Relançar' : 'Lançar'}
              </button>
            </>
          )}
          {tarefaAberta === 'agua' && (
            <>
              <span className="mr-auto text-xs text-slate-500">
                {planosDeAgua.length === 0 ? 'Sem origem de água no desenho.' : `${pontosDeAguaALigar} ponto(s) a ligar.`}
              </span>
              <button
                type="button"
                onClick={() => lancarAgua(planosDeAgua)}
                disabled={!haAguaALancar}
                className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Droplets className="h-4 w-4" />
                Lançar em todas as origens
              </button>
            </>
          )}
          {tarefaAberta === 'pontosHidraulicos' && (
            <>
              <span className="mr-auto text-xs text-slate-500">
                {sugeridasNoNivel === 0
                  ? 'Nenhuma peça sugerida pendente neste pavimento.'
                  : `${sugeridasNoNivel} sugerida(s) aguardando confirmação.`}
              </span>
              <button
                type="button"
                onClick={aceitarSugeridas}
                disabled={sugeridasNoNivel === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                Aceitar sugeridas
              </button>
              <button
                type="button"
                onClick={() => lancarPontos(planosDePontos)}
                disabled={ambientesComPontosACriar === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <ShowerHead className="h-4 w-4" />
                Lançar em todos ({planosDePontos.reduce((n, p) => n + p.aCriar, 0)})
              </button>
            </>
          )}
          {tarefaAberta === 'tomadas' && (
            <>
              <span className="mr-auto text-xs text-slate-500">
                {sugeridasNoNivel === 0
                  ? 'Nenhuma tomada sugerida pendente neste pavimento.'
                  : `${sugeridasNoNivel} sugerida(s) aguardando confirmação.`}
              </span>
              <button
                type="button"
                onClick={aceitarSugeridas}
                disabled={sugeridasNoNivel === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                Aceitar sugeridas
              </button>
            </>
          )}
          {tarefaAberta === 'eletrodutos' && (
            <>
              <span className="mr-auto whitespace-nowrap text-xs text-slate-500">
                {eletrodutosSugeridosNoNivel.length === 0
                  ? 'Nenhum pendente.'
                  : `${eletrodutosSugeridosNoNivel.length} pendente(s).`}
              </span>
              <button
                type="button"
                onClick={() => lancarEletrodutos(planosDeEletrodutos)}
                disabled={!haOQueLancar}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Cable className="h-4 w-4" />
                Lançar em todos ({pontosALigar})
              </button>
              <button
                type="button"
                onClick={aceitarEletrodutos}
                disabled={eletrodutosSugeridosNoNivel.length === 0}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                Aceitar sugeridos
              </button>
            </>
          )}
          {tarefaAberta === 'fundacoes' && planoDeFundacoes && (
            <>
              <span className="mr-auto whitespace-nowrap text-xs text-slate-500">
                {planoDeFundacoes.comandos.length === 0
                  ? 'Nada a lançar.'
                  : `${planoDeFundacoes.blocos.length} bloco(s) · ${planoDeFundacoes.estacas.length} estaca(s)${planoDeFundacoes.baldrames.length ? ` · ${planoDeFundacoes.baldrames.length} baldrame(s)` : ''}.`}
              </span>
              {planoDeRelancamentoDeFundacoes && (
                <button
                  type="button"
                  onClick={() => void relancarFundacoesDoNivel()}
                  disabled={planoDeRelancamentoDeFundacoes.comandos.length === 0}
                  title="Apaga blocos, estacas e baldrames deste pavimento e lança de novo com as hipóteses atuais — confirma antes; Ctrl+Z desfaz"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-amber-300 bg-white px-3.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Relançar {planoDeRelancamentoDeFundacoes.blocos.length + planoDeRelancamentoDeFundacoes.baldrames.length}
                </button>
              )}
              <button
                type="button"
                onClick={lancarFundacoes}
                disabled={planoDeFundacoes.comandos.length === 0}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SquareStack className="h-4 w-4" />
                Lançar {resumoDeFundacoes(planoDeFundacoes)}
              </button>
            </>
          )}
          {tarefaAberta === 'vigas' && planoDeVigas && (
            <>
              <span className="mr-auto whitespace-nowrap text-xs text-slate-500">
                {planoDeVigas.vigas.length === 0
                  ? 'Nada a lançar.'
                  : `${planoDeVigas.vigas.length} viga(s) · ${planoDeVigas.paredesQueCedem.length} parede(s) cedem.`}
              </span>
              {planoDeRelancamentoDeVigas && (
                <button
                  type="button"
                  onClick={() => void relancarVigasDoNivel()}
                  disabled={planoDeRelancamentoDeVigas.comandos.length === 0}
                  title="Apaga as vigas deste pavimento e lança de novo com as hipóteses atuais — confirma antes; Ctrl+Z desfaz"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-amber-300 bg-white px-3.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Relançar {planoDeRelancamentoDeVigas.vigas.length}
                </button>
              )}
              <button
                type="button"
                onClick={lancarVigas}
                disabled={planoDeVigas.vigas.length === 0}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RectangleHorizontal className="h-4 w-4" />
                Lançar {planoDeVigas.vigas.length} viga(s)
              </button>
            </>
          )}
          {tarefaAberta === 'lajes' && planoDeLajes && (
            <>
              <span className="mr-auto whitespace-nowrap text-xs text-slate-500">
                {planoDeLajes.lajes.length === 0
                  ? 'Nada a lançar.'
                  : `${planoDeLajes.lajes.length} laje(s) · ${(planoDeLajes.lajes.reduce((a, l) => a + l.areaMm2, 0) / 1_000_000).toFixed(2).replace('.', ',')} m².`}
              </span>
              {planoDeRelancamentoDeLajes && (
                <button
                  type="button"
                  onClick={() => void relancarLajesDoNivel()}
                  disabled={planoDeRelancamentoDeLajes.comandos.length === 0}
                  title="Apaga as lajes deste pavimento e lança de novo com a espessura atual — confirma antes; Ctrl+Z desfaz"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-amber-300 bg-white px-3.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Relançar {planoDeRelancamentoDeLajes.lajes.length}
                </button>
              )}
              <button
                type="button"
                onClick={lancarLajes}
                disabled={planoDeLajes.lajes.length === 0}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Layers className="h-4 w-4" />
                Lançar {planoDeLajes.lajes.length} laje(s)
              </button>
            </>
          )}
          {tarefaAberta === 'pilares' && planoDePilares && (
            <>
              <span className="mr-auto whitespace-nowrap text-xs text-slate-500">
                {planoDePilares.pilares.length === 0
                  ? 'Nada a lançar.'
                  : `${planoDePilares.pilares.length} pilar(es) · ${planoDePilares.paredesQueCedem.length} parede(s) cedem.`}
              </span>
              {planoDeRelancamento && (
                <button
                  type="button"
                  onClick={() => void relancarPilaresDoNivel()}
                  disabled={planoDeRelancamento.comandos.length === 0}
                  title="Apaga os pilares deste pavimento e lança de novo com a seção e o vão atuais — confirma antes; Ctrl+Z desfaz"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-amber-300 bg-white px-3.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Relançar {planoDeRelancamento.pilares.length}
                </button>
              )}
              <button
                type="button"
                onClick={lancarPilares}
                disabled={planoDePilares.pilares.length === 0}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RectangleVertical className="h-4 w-4" />
                Lançar {planoDePilares.pilares.length} pilar(es)
              </button>
            </>
          )}
          {tarefaAberta === 'circuitos' && planoDeCircuitos && (
            <>
              <span className="mr-auto whitespace-nowrap text-xs text-slate-500">
                {planoDeCircuitos.circuitos.length === 0
                  ? 'Nada a criar.'
                  : `${planoDeCircuitos.circuitos.length} circuito(s) para ${planoDeCircuitos.circuitos.reduce((s, c) => s + c.terminalIds.length, 0)} ponto(s).`}
              </span>
              <button
                type="button"
                onClick={criarCircuitos}
                disabled={!quadroDosCircuitos || planoDeCircuitos.circuitos.length === 0}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CircuitBoard className="h-4 w-4" />
                Criar {planoDeCircuitos.circuitos.length} circuito(s)
              </button>
            </>
          )}
          {tarefaAberta !== 'tomadas' && tarefaAberta !== 'eletrodutos' && tarefaAberta !== 'circuitos' && tarefaAberta !== 'pilares' && tarefaAberta !== 'vigas' && tarefaAberta !== 'lajes' && tarefaAberta !== 'fundacoes' && rotuloDaSelecao && (
            <span className="mr-auto truncate text-xs text-slate-500">
              Selecionado: {rotuloDaSelecao}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTarefa(null)}
            className="inline-flex h-9 items-center rounded-[6px] bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Fechar
          </button>
        </SheetFooter>
      </Sheet>
      )}

      {/* ─── QUADRO DE CARGAS E NBR 5410, EM DRAWER (13/09/2026) ──────────────
          Era relatório no dock; virou drawer porque aqui se EDITA (circuito,
          ligação, DR, hipóteses, emissão). Largo (2xl) porque é tabela — a
          coluna Carga já sumiu uma vez por falta de largura. */}
      {propriedadesEmSheet && !tarefaAberta && (!emVista || em3d) && paineisDaSelecao && (
        // Fechar DESMARCA a peça (17/09/2026: *"continua abrindo no próprio
        // painel lateral e não fecha mais"*): com a seleção mantida, as
        // propriedades reapareciam embaixo da lista e só sumiam clicando no
        // vazio do desenho. Quem veio pela lista volta para a lista.
        <Sheet open onClose={fecharPropriedades} size="lg" modal={false} topPx={topoDoDesenhoPx}>
          <SheetHeader onClose={fecharPropriedades}>
            <SheetTitle>
              <span className="flex items-center gap-2">
                <Blocks className="h-5 w-5 text-blue-700" />
                Propriedades
              </span>
            </SheetTitle>
            <SheetDescription>
              {rotuloDoSelecionado ?? `${editor.selectedIds.length} selecionado(s)`} · o que se edita aqui grava na hora; Ctrl+Z desfaz.
              O desenho continua ativo: clicar noutra peça troca; clicar no vazio ou fechar desmarca.
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="p-0">
            <div data-testid="propriedades-sheet">{paineisDaSelecao}</div>
          </SheetPanel>
        </Sheet>
      )}
      {relatorioNoDrawer && (
      <Sheet open onClose={() => setRelatorio(null)} size="2xl">
        <SheetHeader onClose={() => setRelatorio(null)}>
          <SheetTitle>
            <span className="flex items-center gap-2">
              {relatorioNoDrawer === 'conflitos' && <AlertTriangle className="h-5 w-5 text-amber-600" />}
              {relatorioNoDrawer === 'restricoes' && <Link2 className="h-5 w-5 text-blue-700" />}
              {relatorioNoDrawer === 'loteamento' && <LandPlot className="h-5 w-5 text-blue-700" />}
              {relatorioNoDrawer === 'medicoes' && <Ruler className="h-5 w-5 text-blue-700" />}
              {relatorioNoDrawer === 'orcamento' && <Calculator className="h-5 w-5 text-blue-700" />}
              {RELATORIOS_DO_DOCK[relatorioNoDrawer].rotulo}
              {relatorioNoDrawer === 'conflitos' && (
                <span className="rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                  {totalDeConflitos}
                </span>
              )}
              {relatorioNoDrawer === 'medicoes' && (
                <span className="rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                  {medicoes.formas.length}
                </span>
              )}
              {relatorioNoDrawer === 'restricoes' && (
                <span className="rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                  {restricoesVioladas}/{conferenciaDeRestricoes.length}
                </span>
              )}
              {relatorioNoDrawer === 'loteamento' && (
                <span className="rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                  {errosDoLoteamento}/{(editor.model.lotes ?? []).length}
                </span>
              )}
            </span>
          </SheetTitle>
          <SheetDescription>
            {relatorioNoDrawer === 'conflitos' &&
              'Interferências de instalações com a estrutura e entre disciplinas, e da estrutura com vãos e escadas. Clicar num conflito seleciona a peça no desenho; exporte em BCF para o projetista.'}
            {relatorioNoDrawer === 'medicoes' &&
              'As formas medidas sobre a planta de fundo — área, linha e contagem — por camada, com o envio ao orçamento.'}
            {relatorioNoDrawer === 'restricoes' &&
              'As intenções declaradas — sobre o eixo, distância ao eixo, comprimento travado, mesmo comprimento, paralela — conferidas contra o desenho. A restrição não trava o gesto: a violada mostra o desvio e oferece Ajustar (um comando, Ctrl+Z desfaz).'}
            {relatorioNoDrawer === 'orcamento' &&
              'A ponte com o orçamento da obra: o de-para dos itens e a prévia do que a versão publicada gera.'}
            {relatorioNoDrawer === 'loteamento' &&
              'Área e testada mínimas, lote encravado, número repetido na quadra e o percentual de áreas públicas. Os mínimos vêm da zona do estudo quando informados; senão, do piso da Lei 6.766/79. Só acusa — nada trava o desenho.'}
          </SheetDescription>
        </SheetHeader>

        <SheetPanel className="drawer-legivel p-0">
          {relatorioNoDrawer === 'loteamento' && (
            <div className="px-4 py-3">
              <PainelConferenciaDoLoteamento
                avisos={avisosDoLoteamento}
                regras={regrasDoLoteamento}
                origemDasRegras={origemDasRegrasDoLoteamento}
                totalDeLotes={(editor.model.lotes ?? []).length}
                onSelecionar={(id) => {
                  setRelatorio(null);
                  selecionar([id]);
                }}
              />
            </div>
          )}

          {relatorioNoDrawer === 'conflitos' && (
            <PainelConflitos
              model={editor.model}
              conflitos={conflitos}
              arquitetonicos={conflitosArq}
              aceites={mapaDeAceites}
              podeDecidir={!somenteLeitura}
              onAceitar={async (e) => {
                const a = await blueprintConflitoStatusService.aceitar({ studyId: study.id, organizationId: study.organization_id, ...e });
                setAceitesDeConflito((lista) => [...lista.filter((x) => x.chave !== a.chave), a]);
              }}
              onReabrir={async (a) => {
                await blueprintConflitoStatusService.reabrir(a.id);
                setAceitesDeConflito((lista) => lista.filter((x) => x.id !== a.id));
              }}
              onSelecionar={(id) => selecionar([id])}
              onExportarBcf={exportarBcfDoEstudo}
            />
          )}

          {relatorioNoDrawer === 'restricoes' && (
            <div className="p-3">
              <PainelRestricoes model={editor.model} conferencias={conferenciaDeRestricoes} onComando={(c) => editor.run(c)} onSelecionar={(id) => id && selecionar([id])} />
            </div>
          )}

          {relatorioNoDrawer === 'medicoes' && (
            <PainelMedicoes
              formas={medicoesVisiveis}
              todas={medicoes.formas}
              selecionada={medicoes.selecionada}
              temFundo={!!fundo.linha}
              ocupado={medicoes.ocupado}
              camadasOcultas={camadasOcultas}
              camadaAtiva={camadaAtiva}
              onAlternarCamada={alternarCamada}
              onCamadaAtiva={setCamadaAtiva}
              onSelecionar={medicoes.setSelecionada}
              onRenomear={(id, nome) => void medicoes.atualizar(id, { nome })}
              onEditarItem={(id, campos) => void medicoes.atualizar(id, campos)}
              onRemover={(id) => void medicoes.remover(id)}
              onEnviarOrcamento={() =>
                void medicoes.enviarAoOrcamento(
                  study.project_id,
                  study.name,
                  fundo.linha?.file_sha256 ?? null,
                  fundo.underlay?.mmPorPixel ?? null,
                )
              }
              aviso={medicoes.aviso}
              erro={medicoes.erro}
            />
          )}

          {relatorioNoDrawer === 'orcamento' && (
            <PainelOrcamento
              study={study}
              revisao={editor.baseRevision}
              dirty={editor.dirtySincePublish}
              onPrevia={setPreviaOrcamento}
            />
          )}

        </SheetPanel>

        <SheetFooter>
          {rotuloDaSelecao && (
            <span className="mr-auto truncate text-xs text-slate-500">
              Selecionado: {rotuloDaSelecao}
            </span>
          )}
          <button
            type="button"
            onClick={() => setRelatorio(null)}
            className="inline-flex h-9 items-center rounded-[6px] bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Fechar
          </button>
        </SheetFooter>
      </Sheet>
      )}

      <QuadroDeDivisas
        aberto={quadroAberto}
        onFechar={() => {
          setQuadroAberto(false);
          setLimiteEmDestaque(null);
        }}
        terreno={terreno}
        limites={limitesDoNivel}
        areaEscrituraMm2={editor.model.areaEscrituraMm2 ?? null}
        onAreaEscritura={(areaMm2) => editor.run({ type: 'SetAreaEscritura', areaMm2 })}
        onPapel={(boundaryId, papel) => editor.run({ type: 'SetBoundaryPapel', boundaryId, papel })}
        onApontarFrente={apontarFrente}
        onEscritura={(boundaryId, medidaMm, confrontante) =>
          editor.run({ type: 'SetBoundaryEscritura', boundaryId, medidaMm, confrontante })
        }
        onDestacar={setLimiteEmDestaque}
      />
    </div>
      {/* Modal de escolha de organização (REGRA #5) para as gravações de configuração
          da organização (materiais, templates de vista, tokens da API): FORA do container
          do editor, que fica `hidden` enquanto uma tela está aberta — dentro dele o
          modal existia mas não aparecia (a tela API mostrou isso em 20/09/2026). */}
      {modalDeOrgDosMateriais}
    </>
  );
}

/** Controle de barra: voltar, desfazer, refazer. `title` + `aria-label` porque
 *  botão só com ícone não tem nome acessível nenhum sem isso. */
function BotaoBarra({
  icone: Icone,
  texto,
  rotulo,
  onClick,
  disabled,
  ativo,
}: {
  icone?: React.ElementType;
  /** Em vez do ícone, um texto curto ("1:100") — para o que não tem símbolo. */
  texto?: string;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  /** Botão de MODO (tela cheia): aceso enquanto o modo vale, com `aria-pressed`. */
  ativo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ativo === undefined ? undefined : ativo}
      className={`rounded-md border p-1.5 shadow-sm transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        ativo ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {Icone ? (
        <Icone className="h-4 w-4" />
      ) : (
        <span className="block h-4 min-w-4 text-[10px] font-semibold leading-4 tabular-nums">{texto}</span>
      )}
    </button>
  );
}

/**
 * Um campo numérico em milímetro, para a barra.
 *
 * `<input type="number">` e não `<select>`, ao contrário da espessura da parede:
 * a espessura tem quatro valores de catálogo (10, 15, 20, 25 cm) e a seção
 * estrutural não tem catálogo nenhum — ela vem da prancha do calculista, e uma
 * lista fechada obrigaria a arredondar 17×42 para o valor mais próximo, o que
 * é exatamente o erro que este módulo existe para não cometer.
 */
function CampoMm({
  rotulo,
  valor,
  onChange,
  titulo,
  permiteNegativo = false,
}: {
  rotulo: string;
  valor: number;
  onChange: (mm: number) => void;
  titulo?: string;
  permiteNegativo?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-600" title={titulo}>
      {rotulo}
      <input
        type="number"
        value={valor}
        step={10}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (!Number.isFinite(n)) return;
          // Zero e negativo são recusados pelos invariantes do kernel, mas a
          // cota (`baseMm`) É negativa em fundação — por isso a trava é por
          // campo, e não uma regra só para todos.
          onChange(permiteNegativo ? n : Math.max(1, n));
        }}
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
    </label>
  );
}

/**
 * As medidas da próxima peça estrutural, na barra.
 *
 * Os campos seguem a FORMA (ver `FORMA_ESTRUTURAL`), não o tipo: é o que faz um
 * sétimo tipo não precisar tocar neste componente.
 */
/**
 * Os campos da PRÓXIMA água, na barra: inclinação em %, beiral em mm e o atalho
 * "Do contorno". Espelha `CamposDaEstrutura` — estado da barra, editado antes do
 * gesto; a peça lançada se edita no painel.
 */
function CamposDaEscada({
  tipo,
  larguraMm,
  onLargura,
  alvoEspelhoMm,
  onAlvoEspelho,
}: {
  tipo: TipoCirculacao;
  larguraMm: number;
  onLargura: (v: number) => void;
  alvoEspelhoMm: number;
  onAlvoEspelho: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <label className="flex items-center gap-1">
        Largura
        <input
          type="number"
          min={600}
          step={50}
          value={larguraMm}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onLargura(Math.max(1, Math.round(v)));
          }}
          aria-label={`Largura da proxima ${tipo === 'RAMPA' ? 'rampa' : 'escada'}, em milimetros`}
          className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
        />
        mm
      </label>
      {/* O ALVO de espelho some na rampa, que nao tem degrau. Fica guardado. */}
      {tipo === 'ESCADA' && (
        <label className="flex items-center gap-1">
          Espelho
          <input
            type="number"
            min={100}
            max={250}
            step={5}
            value={alvoEspelhoMm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onAlvoEspelho(Math.max(1, Math.round(v)));
            }}
            aria-label="Espelho que se quer, em milimetros. O numero de degraus sai dele e do desnivel."
            title="O espelho que voce QUER. O numero de degraus e o espelho real saem do desnivel ate o pavimento de cima."
            className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
          />
          mm
        </label>
      )}
    </div>
  );
}

function CamposDoTelhado({
  inclinacaoPct,
  onInclinacao,
  beiralMm,
  onBeiral,
  onGerarDoContorno,
  temParedes,
}: {
  inclinacaoPct: number;
  onInclinacao: (v: number) => void;
  beiralMm: number;
  onBeiral: (v: number) => void;
  onGerarDoContorno: () => void;
  temParedes: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <label className="flex items-center gap-1">
        Inclinação
        <input
          type="number"
          min={0}
          max={300}
          step={1}
          value={inclinacaoPct}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onInclinacao(v);
          }}
          aria-label="Inclinação da próxima água, em por cento"
          className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
        />
        %
      </label>
      <label className="flex items-center gap-1">
        Beiral
        <input
          type="number"
          min={0}
          step={50}
          value={beiralMm}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onBeiral(Math.max(0, Math.round(v)));
          }}
          aria-label="Beiral da água gerada do contorno, em milímetros a partir da face da parede"
          title="Só o atalho 'Do contorno' usa o beiral: no traçado à mão, o contorno que você desenha já é a ponta da telha."
          className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
        />
        mm
      </label>
      <button
        type="button"
        onClick={onGerarDoContorno}
        disabled={!temParedes}
        title={
          temParedes
            ? 'Uma água por construção do pavimento: face das paredes + beiral, cantos mitrados. Ajuste o lado do beiral e a inclinação no painel.'
            : 'Desenhe paredes primeiro — o contorno sai delas.'
        }
        className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        Do contorno
      </button>
    </div>
  );
}

/** COBERTURA POR EXTRUSÃO (P2.13): o perfil da próxima extrusão, na barra de opções. */
function CamposDaExtrusao({
  valor,
  onChange,
}: {
  valor: ParametrosDoPerfil & { espessuraMm: number };
  onChange: (v: ParametrosDoPerfil & { espessuraMm: number }) => void;
}) {
  const campoM = (rotulo: string, chave: 'vaoMm' | 'alturaBeiralMm' | 'alturaCumeeiraMm' | 'flechaMm', ariaLabel: string) => (
    <label className="flex items-center gap-1">
      {rotulo}
      <input
        type="number"
        min={0}
        step={0.1}
        value={(valor[chave] / 1000).toFixed(2)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange({ ...valor, [chave]: Math.max(0, Math.round(v * 1000)) });
        }}
        aria-label={ariaLabel}
        className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
      />
      m
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <label className="flex items-center gap-1">
        Perfil
        <select
          value={valor.tipo}
          onChange={(e) => onChange({ ...valor, tipo: e.target.value as TipoDePerfilDeCobertura })}
          aria-label="Perfil da cobertura por extrusão"
          className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
        >
          {TIPOS_DE_PERFIL_DE_COBERTURA.map((t) => (
            <option key={t} value={t}>
              {ROTULO_DO_PERFIL_DE_COBERTURA[t]}
            </option>
          ))}
        </select>
      </label>
      {campoM('Vão', 'vaoMm', 'Vão do perfil, através do eixo, em metros')}
      {campoM('Beiral a', 'alturaBeiralMm', 'Altura do beiral sobre o piso do pavimento, em metros')}
      {valor.tipo === 'ABOBADA'
        ? campoM('Flecha', 'flechaMm', 'Flecha da abóbada acima do beiral, em metros')
        : campoM(valor.tipo === 'UMA_AGUA' ? 'Lado alto a' : 'Cumeeira a', 'alturaCumeeiraMm', 'Altura da cumeeira ou do lado alto sobre o piso, em metros')}
      {valor.tipo === 'DENTE_DE_SERRA' && (
        <label className="flex items-center gap-1">
          Dentes
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            value={valor.dentes}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange({ ...valor, dentes: Math.max(1, Math.min(20, Math.round(v))) });
            }}
            aria-label="Número de dentes do perfil dente de serra"
            className="w-12 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
          />
        </label>
      )}
      <label className="flex items-center gap-1">
        Espessura
        <input
          type="number"
          min={10}
          step={10}
          value={valor.espessuraMm}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange({ ...valor, espessuraMm: Math.max(10, Math.round(v)) });
          }}
          aria-label="Espessura do pacote de cobertura, em milímetros"
          className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
        />
        mm
      </label>
      <span className="text-slate-400" title="Trechos verticais do perfil (o vidro do dente de serra) não viram água: feche-os com parede ou cortina.">
        face vertical não vira água
      </span>
    </div>
  );
}

function CamposDaEstrutura({
  kind,
  medidas,
  onMedidas,
  rotulo,
  onRotulo,
}: {
  kind: StructuralKind;
  medidas: MedidasEstruturais;
  onMedidas: (m: MedidasEstruturais) => void;
  rotulo: string;
  onRotulo: (v: string) => void;
}) {
  const forma = FORMA_ESTRUTURAL[kind];
  const mudar = (parcial: Partial<MedidasEstruturais>) => onMedidas({ ...medidas, ...parcial });

  return (
    <>
      {forma === 'PONTO' ? (
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Seção
          <select
            value={medidas.circular ? 'redonda' : 'retangular'}
            onChange={(e) => mudar({ circular: e.target.value === 'redonda' })}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="retangular">Retangular</option>
            <option value="redonda">Redonda</option>
          </select>
        </label>
      ) : null}

      {forma !== 'AREA' ? (
        <CampoMm
          rotulo={medidas.circular && forma === 'PONTO' ? 'Diâmetro' : 'Largura'}
          valor={medidas.larguraMm}
          onChange={(mm) => mudar({ larguraMm: mm })}
          titulo={
            forma === 'LINHA'
              ? 'A base da seção (b), perpendicular ao eixo, em mm.'
              : 'A primeira dimensão da seção em planta, em mm.'
          }
        />
      ) : null}

      {forma === 'PONTO' && !medidas.circular ? (
        <CampoMm
          rotulo="Profundidade"
          valor={medidas.profundidadeMm}
          onChange={(mm) => mudar({ profundidadeMm: mm })}
          titulo="A segunda dimensão da seção em planta, em mm."
        />
      ) : null}

      <CampoMm
        rotulo={forma === 'AREA' ? 'Espessura' : 'Altura'}
        valor={medidas.alturaMm}
        onChange={(mm) => mudar({ alturaMm: mm })}
        titulo={
          forma === 'AREA'
            ? 'A espessura da laje, em mm.'
            : forma === 'LINHA'
              ? 'A altura da seção (h), em mm.'
              : 'A extensão vertical: pé-direito do pilar, profundidade da estaca.'
        }
      />

      <CampoMm
        rotulo="Cota"
        valor={medidas.baseMm}
        onChange={(mm) => mudar({ baseMm: mm })}
        permiteNegativo
        titulo="Cota da face INFERIOR, medida do piso do pavimento. Negativa em fundação."
      />

      <label
        className="flex items-center gap-1.5 text-xs text-slate-600"
        title="Como a prancha do calculista chama a peça: P1, V3, L2. Some depois de lançar — o rótulo é da PRÓXIMA peça."
      >
        Rótulo
        <input
          type="text"
          value={rotulo}
          onChange={(e) => onRotulo(e.target.value)}
          placeholder={`${prefixoDeRotulo(kind)}1`}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
      </label>
    </>
  );
}

function Ferramenta({
  atual,
  valor,
  icone: Icone,
  rotulo,
  onClick,
}: {
  atual: BlueprintTool;
  valor: BlueprintTool;
  icone: React.ElementType;
  rotulo: string;
  onClick: (t: BlueprintTool) => void;
}) {
  const ativo = atual === valor;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={() => onClick(valor)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        ativo ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icone className="h-4 w-4" />
      {rotulo}
    </button>
  );
}
