/**
 * O CONTEXTO da casa automática (P2, 12/11/2026 — plano docs/planos/2026-11-12-casa-automatica-pendencias.md): o que as
 * etapas de `planejarComPavimentos` liam do fechamento, agora explícito. Os `readonly` são lidos na hora; os outros (o
 * modelo `m`, o contador `n`, o telhado, o muro, a terraplenagem) são regravados pelas etapas.
 */
import type { HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, platoDaCasa } from '../blueprintPlatoDaCasa';
import type { ResumoDaTerraplenagem } from '../blueprintPlatoDaCasa';
import type { HIPOTESES_DO_MURO_DA_CASA_PADRAO, planejarMuroDaCasa } from '../blueprintMuroDaCasa';
import type { PlanoDoMuroDaCasa } from '../blueprintMuroDaCasa';
import type { TIPO_NBR5410_DO_USO, applyBatch, conflitosDoModelo, distanciaEntreEixos3D, envelopeDoTrecho, medirEscada, point, pointInPolygon, uidDeterministico } from '../blueprintKernel';
import type { BlueprintModel, Command, ObjectId, CamadaParede, Point, SpaceLabel } from '../blueprintKernel';
import type { comandosDeAplicacao, gerar, HIPOTESES_DO_GERADOR_PADRAO } from '../blueprintGerador';
import type { AmbienteGerado, EntradaDoGerador, HipotesesDoGerador, Retangulo, ResultadoDoGerador } from '../blueprintGerador';
import type { programaDaCasa, resumoDoPrograma, usoDoNome } from '../blueprintPrograma';
import type { Programa } from '../blueprintPrograma';
import type { conferirPrograma } from '../blueprintConferenciaDoPrograma';
import type { avaliarRegras, loteParaRegras, REGRAS_SEMENTE } from '../blueprintRegras';
import type { ContextoDeRegras } from '../blueprintRegras';
import type { propostaDeEixos } from '../blueprintEixosAutomaticos';
import type { planejarPilares } from '../blueprintPilaresAutomaticos';
import type { planejarLajes, planejarVigas } from '../blueprintVigasLajesAutomaticas';
import type { planejarFundacoes } from '../blueprintFundacoesAutomaticas';
import type { comandosDoTelhado, HIPOTESES_DO_TELHADO_PADRAO } from '../blueprintTelhadoAutomatico';
import type { ResumoDoTelhado } from '../blueprintTelhadoAutomatico';
import type { comandosDasAncoras, HIPOTESES_DAS_ANCORAS_PADRAO } from '../blueprintAncorasDaCasa';
import type { ResultadoDasAncoras } from '../blueprintAncorasDaCasa';
import type { HIPOTESES_HIDRO_PADRAO } from '../blueprintMemorialHidro';
import type { HipotesesHidro } from '../blueprintMemorialHidro';
import type { comandosDeMobiliario, HIPOTESES_MOBILIARIO_PADRAO, mobiliarNivel } from '../blueprintMobiliario';
import type { HIPOTESES_PONTOS_PADRAO, planejarPontosDoNivel, pontosDasLoucasCriadas } from '../blueprintPontosHidraulicos';
import type { HipotesesDePontos } from '../blueprintPontosHidraulicos';
import type { planejarAguaCompleta } from '../blueprintAguaCompleta';
import type { cotaEnterradaAcimaDasRedes, planejarAlimentador } from '../blueprintAlimentador';
import type { planejarCondutores } from '../blueprintCondutoresPluviais';
import type { planejarEsgotoCompleto } from '../blueprintEsgotoCompleto';
import type { planejarPluvialCompleta } from '../blueprintPluvialCompleto';
import type { destinoDoEsgoto } from '../blueprintEsgotoAutomatico';
import type { dimensionarTratamento, medidasDimensionadas } from '../blueprintTratamento';
import type { pontoNaFrente } from '../blueprintAncorasHidro';
import type { marcasDeVerificacao } from '../blueprintVerificacaoRede';
import type { pressoesDoModelo } from '../blueprintPressaoDaRede';
import type { comandosDePontosDoNivel } from '../blueprintPontosEletricosDoNivel';
import type { comodosComForro } from '../blueprintRotaPeloForro';
import type { furosPrevistos } from '../blueprintFurosPrevistos';
import type { presetDeAcabamento, presetsSugeridos } from '../blueprintAcabamentos';
import type { encaixarNaParede, paredesEmComum } from '../blueprintRotaPelasParedes';
import type { distanciaAoTrecho3D } from '../blueprintPosicaoSplit';
import type { anelDoPilar, pegadasDePilares } from '../blueprintObstaculosEstruturais';
import type { centroDeCargas, comandosParaOCentro } from '../blueprintCentroDeCargas';
import type { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos } from '../blueprintCircuitosAutomaticos';
import type { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO, sugerirDPS } from '../blueprintEletricaDimensionamento';
import type { comandosDasSugestoesDeDR, conferirNbr5410, sugerirDRs } from '../blueprintNbr5410';
import type { HIPOTESES_ELETRODUTO_PADRAO, comandosDeBitolaPelaOcupacao, planejarEletrodutosDoModelo } from '../blueprintEletrodutos';
import type { HipotesesDeEletroduto } from '../blueprintEletrodutos';
import type { REGRA_DE_CAIXAS_PADRAO } from '../blueprintCaixasDePassagem';
import type { escolhasDoEletroduto } from '../blueprintEscolhasDoEletroduto';
import type { comandoDeRegistro, registroDe } from '../blueprintRegistroDeLancamento';
import type { comandoDeRegistroDosCircuitosCriados } from '../blueprintEscolhasDosCircuitos';
import type { escolhasDaAgua, escolhasDoPluvial } from '../blueprintEscolhasDaAguaEPluvial';
import type { escolhasDoEsgoto } from '../blueprintEscolhasDoEsgoto';
import type { gerarClimatizacao } from '../blueprintGeradorClimatizacao';
import type { HIPOTESES_CLIMATIZACAO_PADRAO } from '../blueprintClimatizacao';
import type { COTA_USUAL_DO_PONTO_ELETRICO, ROTULO_DO_PONTO_ELETRICO } from '../blueprintRede';
import type { entradaDoQuadro, padraoDeEntrada } from '../blueprintEntradaDeEnergia';
import type { LocalDaPendencia, PendenciaDoPpci, SituacaoDaEtapa } from '../blueprintGeradorPpci';
import type { localDoConflito, localDoElemento } from '../blueprintLocalDaPendencia';
import type { HIPOTESES_DE_GUARDA_CORPO_PADRAO } from '../blueprintGuardaCorpo';
import type { comandoDaEscada, comUidsDoPavimento, alinharSegundoAoPatamar, banheiroAlemDoNucleo, lavaboForaDoNucleo, dividirEmTres, dividirPrograma, escolherNucleo, guardaCorpoDaEscada, lajesComRebaixo, shaftDoGrupo, zonasMolhadasDoBanheiro, HIPOTESES_DO_SOBRADO_PADRAO, pavimentoComNucleo, portaParaOTerraco, contornoDoTerraco, pilaresDoTerceiro, retanguloDoSegundo, pilaresDoSobrado, semPortaDeEntrada, prumadasPeloMeioDoComodo, shaftsDoSobrado, alinharJanelasDoSuperior, trechosDeTransicao, vigasDeTransicao } from '../blueprintSobrado';
import type { HIPOTESES_DA_IMPLANTACAO_PADRAO, comLocal, comLocais, m2, pct, f2, piso, ROTULO_DA_ETAPA_DA_CASA, ORDEM_DAS_ETAPAS, HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, SUBIDA_DO_ALIMENTADOR_DA_CASA, USOS_DE_PERMANENCIA, SUBIDA_DO_QUADRO_MM, HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, HIPOTESES_DA_CASA_PADRAO, ESTRUTURA_ZERADA, ELETRICA_ZERADA, CLIMATIZACAO_ZERADA, HIDRAULICA_ZERADA, MARCA_DA_REDE, ROTULO_DA_DISCIPLINA_DA_REDE, ROTULO_DA_DISCIPLINA_DO_AR } from './hipoteses';
import type { HipotesesDaImplantacao, EtapaDaCasaId, EtapaDaCasa, EntradaDaCasa, HipotesesDaCasa, PlanoDaCasa, ResumoDoSobrado, OpcoesDoPlanoDaCasa } from './hipoteses';
import type { paraLocal, paraMundo, implantacaoDaCasa, resumoDaImplantacao } from './quadroEImplantacao';
import type { ImplantacaoDaCasa } from './quadroEImplantacao';
import type { hipotesesDoForroDaCasa, forroDaEletrica, forroDaAguaDaCasa, rebaixoDoForroMm, decidirPressao } from './forroEPressao';
import type { DecisaoDaPressao } from './forroEPressao';
import type { PASSO_DO_PLUVIAL_SOBRE_O_ESGOTO_MM, pluvialRenteAoEsgoto, motivoParaNaoGerar, GRAVE, problemasGraves, escolherSemente, norteNoQuadro, comandosNoMundo, comandosLocaisNoMundo, gruposDoTuboDeQueda, coletoresForaDoShaft, paredesSobORebaixo, LUZ_ALEM_DO_REBAIXO_MM, LUZ_FORA_DO_PILAR_MM, foraDoPoligono, FOLGA_DA_SUBIDA_DO_PRESSURIZADOR_MM } from './escolhaEShaft';
import type { ResumoDasDisciplinas } from './orquestrador';
import type { Opening } from '../blueprintKernel';

export interface ContextoDaCasa {
  readonly aplicar: (lote: Command[]) => number;
  readonly entrada: EntradaDaCasa;
  readonly etapa: (id: EtapaDaCasaId, rotulo: string, situacao: SituacaoDaEtapa, n: number, nota?: string | null) => void;
  readonly garagemNoQuadro: () => { x0: number; x1: number; } | null;
  readonly hip: HipotesesDaCasa;
  readonly hipGerador: Partial<HipotesesDoGerador>;
  readonly implantacao: ImplantacaoDaCasa;
  m: BlueprintModel;
  readonly pendencias: PendenciaDoPpci[];
  readonly portaDaFrente: () => { o: Opening; meioDaPorta: { x: number; y: number; }; local: Point; };
  readonly temTerreno: boolean;
  terraplenagemDaCasa: ResumoDaTerraplenagem | null;
}

/** A função de etapa sem o contexto — o que o orquestrador chama. */
export type SemContexto<F> = F extends (ctx: ContextoDaCasa, ...a: infer A) => infer R ? (...a: A) => R : never;
