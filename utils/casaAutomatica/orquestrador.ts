/**
 * CASA AUTOMÁTICA (14/10/2026, plano `docs/planos/2026-10-14-casa-automatica.md`).
 *
 * Do terreno + zona do Mapa Regulatório + programa curto (F1) à casa térrea
 * completa, num lote só de comandos. Este arquivo é o motor PURO; cada fase do
 * plano acrescenta uma etapa.
 *
 * ─── F2: IMPLANTAÇÃO PELA LEI ──────────────────────────────────────────────
 *
 * O gerador E6.2 PREENCHE o retângulo que recebe, ampliando as áreas do programa
 * até caber (é como ele faz planta de apartamento: a unidade é dada). Para a
 * casa, entregar o envelope dos recuos inteiro faz a casa ocupar o lote todo e
 * estourar a TO. Por isso a implantação vem antes: ela escolhe o retângulo que o
 * programa pede, limitado por (o menor vence, e o vencedor é DITO):
 *
 *   - TO × lote, com a folga das hipóteses;
 *   - o envelope dos recuos (o maior retângulo inscrito nele);
 *   - CA × lote (térrea: a área construída inteira conta);
 *   - a permeabilidade: lote × (1 − perm. mín.) − pavimentação externa − vagas descobertas.
 *
 * A casa encosta no recuo de FRENTE e na divisa escolhida (direita/esquerda de
 * quem está na rua olhando para o lote — a convenção de `papeisSugeridos`).
 *
 * ─── O QUADRO DA FRENTE ────────────────────────────────────────────────────
 *
 * O E6.2 só trabalha com eixos alinhados. Lote girado (desenhado no mapa, por
 * azimutes) teria o maior retângulo alinhado minúsculo. A conta é feita num
 * quadro LOCAL alinhado à frente — +y é a normal interna da divisa FRENTE, +x a
 * mão direita de quem olha da rua —, e a `transformacao` leva ao mundo. Com a
 * frente num eixo do desenho a transformação é exata (cos/sin 0 ou ±1).
 */
import { HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, platoDaCasa } from '../blueprintPlatoDaCasa';
import type { ResumoDaTerraplenagem } from '../blueprintPlatoDaCasa';
import { HIPOTESES_DO_MURO_DA_CASA_PADRAO, planejarMuroDaCasa } from '../blueprintMuroDaCasa';
import type { PlanoDoMuroDaCasa } from '../blueprintMuroDaCasa';
import { TIPO_NBR5410_DO_USO, applyBatch, conflitosDoModelo, distanciaEntreEixos3D, envelopeDoTrecho, medirEscada, point, pointInPolygon, uidDeterministico } from '../blueprintKernel';
import type { BlueprintModel, Command, ObjectId, CamadaParede, Point, SpaceLabel } from '../blueprintKernel';
import { comandosDeAplicacao, gerar, HIPOTESES_DO_GERADOR_PADRAO } from '../blueprintGerador';
import type { AmbienteGerado, EntradaDoGerador, HipotesesDoGerador, Retangulo, ResultadoDoGerador } from '../blueprintGerador';
import { programaDaCasa, resumoDoPrograma, usoDoNome } from '../blueprintPrograma';
import type { Programa } from '../blueprintPrograma';
import { conferirPrograma } from '../blueprintConferenciaDoPrograma';
import { avaliarRegras, loteParaRegras, REGRAS_SEMENTE } from '../blueprintRegras';
import type { ContextoDeRegras } from '../blueprintRegras';
import { propostaDeEixos } from '../blueprintEixosAutomaticos';
import { planejarPilares } from '../blueprintPilaresAutomaticos';
import { planejarLajes, planejarVigas } from '../blueprintVigasLajesAutomaticas';
import { planejarFundacoes } from '../blueprintFundacoesAutomaticas';
import { comandosDoTelhado, HIPOTESES_DO_TELHADO_PADRAO } from '../blueprintTelhadoAutomatico';
import type { ResumoDoTelhado } from '../blueprintTelhadoAutomatico';
import { comandosDasAncoras, HIPOTESES_DAS_ANCORAS_PADRAO } from '../blueprintAncorasDaCasa';
import type { ResultadoDasAncoras } from '../blueprintAncorasDaCasa';
import { HIPOTESES_HIDRO_PADRAO } from '../blueprintMemorialHidro';
import type { HipotesesHidro } from '../blueprintMemorialHidro';
import { comandosDeMobiliario, HIPOTESES_MOBILIARIO_PADRAO, mobiliarNivel } from '../blueprintMobiliario';
import { HIPOTESES_PONTOS_PADRAO, planejarPontosDoNivel, pontosDasLoucasCriadas } from '../blueprintPontosHidraulicos';
import type { HipotesesDePontos } from '../blueprintPontosHidraulicos';
import { planejarAguaCompleta } from '../blueprintAguaCompleta';
import { cotaEnterradaAcimaDasRedes, planejarAlimentador } from '../blueprintAlimentador';
import { planejarCondutores } from '../blueprintCondutoresPluviais';
import { planejarEsgotoCompleto } from '../blueprintEsgotoCompleto';
import { planejarPluvialCompleta } from '../blueprintPluvialCompleto';
import { destinoDoEsgoto } from '../blueprintEsgotoAutomatico';
import { dimensionarTratamento, medidasDimensionadas } from '../blueprintTratamento';
import { pontoNaFrente } from '../blueprintAncorasHidro';
import { marcasDeVerificacao } from '../blueprintVerificacaoRede';
import { pressoesDoModelo } from '../blueprintPressaoDaRede';
import { comandosDePontosDoNivel } from '../blueprintPontosEletricosDoNivel';
import { comodosComForro } from '../blueprintRotaPeloForro';
import { furosPrevistos } from '../blueprintFurosPrevistos';
import { presetDeAcabamento, presetsSugeridos } from '../blueprintAcabamentos';
import { encaixarNaParede, paredesEmComum } from '../blueprintRotaPelasParedes';
import { distanciaAoTrecho3D } from '../blueprintPosicaoSplit';
import { anelDoPilar, pegadasDePilares } from '../blueprintObstaculosEstruturais';
import { centroDeCargas, comandosParaOCentro } from '../blueprintCentroDeCargas';
import { HIPOTESES_CIRCUITOS_PADRAO, planejarCircuitos } from '../blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO as HIPOTESES_ELETRICAS_PADRAO, sugerirDPS } from '../blueprintEletricaDimensionamento';
import { comandosDasSugestoesDeDR, conferirNbr5410, sugerirDRs } from '../blueprintNbr5410';
import { HIPOTESES_ELETRODUTO_PADRAO, comandosDeBitolaPelaOcupacao, planejarEletrodutosDoModelo } from '../blueprintEletrodutos';
import type { HipotesesDeEletroduto } from '../blueprintEletrodutos';
import { REGRA_DE_CAIXAS_PADRAO } from '../blueprintCaixasDePassagem';
import { escolhasDoEletroduto } from '../blueprintEscolhasDoEletroduto';
import { comandoDeRegistro, registroDe } from '../blueprintRegistroDeLancamento';
import { comandoDeRegistroDosCircuitosCriados } from '../blueprintEscolhasDosCircuitos';
import { escolhasDaAgua, escolhasDoPluvial } from '../blueprintEscolhasDaAguaEPluvial';
import { escolhasDoEsgoto } from '../blueprintEscolhasDoEsgoto';
import { gerarClimatizacao } from '../blueprintGeradorClimatizacao';
import { HIPOTESES_CLIMATIZACAO_PADRAO } from '../blueprintClimatizacao';
import { COTA_USUAL_DO_PONTO_ELETRICO, ROTULO_DO_PONTO_ELETRICO } from '../blueprintRede';
import { entradaDoQuadro, padraoDeEntrada } from '../blueprintEntradaDeEnergia';
import type { LocalDaPendencia, PendenciaDoPpci, SituacaoDaEtapa } from '../blueprintGeradorPpci';
import { localDoConflito, localDoElemento } from '../blueprintLocalDaPendencia';
import { HIPOTESES_DE_GUARDA_CORPO_PADRAO } from '../blueprintGuardaCorpo';
import { comandoDaEscada, comUidsDoPavimento, alinharSegundoAoPatamar, banheiroAlemDoNucleo, lavaboForaDoNucleo, dividirEmTres, dividirPrograma, escolherNucleo, guardaCorpoDaEscada, lajesComRebaixo, shaftDoGrupo, zonasMolhadasDoBanheiro, HIPOTESES_DO_SOBRADO_PADRAO, pavimentoComNucleo, portaParaOTerraco, contornoDoTerraco, pilaresDoTerceiro, retanguloDoSegundo, pilaresDoSobrado, semPortaDeEntrada, prumadasPeloMeioDoComodo, shaftsDoSobrado, alinharJanelasDoSuperior, trechosDeTransicao, vigasDeTransicao } from '../blueprintSobrado';
import { HIPOTESES_DA_IMPLANTACAO_PADRAO, comLocal, comLocais, m2, pct, f2, piso, ROTULO_DA_ETAPA_DA_CASA, ORDEM_DAS_ETAPAS, HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, SUBIDA_DO_ALIMENTADOR_DA_CASA, USOS_DE_PERMANENCIA, SUBIDA_DO_QUADRO_MM, HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, HIPOTESES_DA_CASA_PADRAO, ESTRUTURA_ZERADA, ELETRICA_ZERADA, CLIMATIZACAO_ZERADA, HIDRAULICA_ZERADA, MARCA_DA_REDE, ROTULO_DA_DISCIPLINA_DA_REDE, ROTULO_DA_DISCIPLINA_DO_AR } from './hipoteses';
import type { HipotesesDaImplantacao, EtapaDaCasaId, EtapaDaCasa, EntradaDaCasa, HipotesesDaCasa, PlanoDaCasa, ResumoDoSobrado, OpcoesDoPlanoDaCasa } from './hipoteses';
import { paraLocal, paraMundo, implantacaoDaCasa, resumoDaImplantacao } from './quadroEImplantacao';
import type { ImplantacaoDaCasa } from './quadroEImplantacao';
import { hipotesesDoForroDaCasa, forroDaEletrica, forroDaAguaDaCasa, rebaixoDoForroMm, decidirPressao } from './forroEPressao';
import type { DecisaoDaPressao } from './forroEPressao';
import { PASSO_DO_PLUVIAL_SOBRE_O_ESGOTO_MM, pluvialRenteAoEsgoto, motivoParaNaoGerar, GRAVE, problemasGraves, escolherSemente, norteNoQuadro, comandosNoMundo, comandosLocaisNoMundo, gruposDoTuboDeQueda, coletoresForaDoShaft, paredesSobORebaixo, LUZ_ALEM_DO_REBAIXO_MM, LUZ_FORA_DO_PILAR_MM, foraDoPoligono, FOLGA_DA_SUBIDA_DO_PRESSURIZADOR_MM } from './escolhaEShaft';
import type { ContextoDaCasa, SemContexto } from './contexto';
import { portaDaFrente as portaDaFrenteDaEtapa, lancarEscadaDeAcesso as lancarEscadaDeAcessoDaEtapa, garagemNoQuadro as garagemNoQuadroDaEtapa, lancarRampaDaGaragem as lancarRampaDaGaragemDaEtapa, lancarMuroDaCasa as lancarMuroDaCasaDaEtapa } from './etapaAcessoEMuro';
import { fechar as fecharDaEtapa, gerarTodas as gerarTodasDaEtapa } from './etapaArquitetura';
import { etapaEstrutural as etapaEstruturalDaEtapa, etapaDoTelhado as etapaDoTelhadoDaEtapa } from './etapaEstruturaETelhado';
import { instalacoes as instalacoesDaEtapa } from './etapaInstalacoes';
import { planejarOSobrado as planejarOSobradoDaEtapa } from './sobrado';

/** F22: por que a TÉRREA não comporta o programa (`null` = comporta): medida mínima de ambiente violada, ou a TO. */
export function terreaNaoComporta(p: PlanoDaCasa): string | null {
  const motivos = p.pendencias
    .filter((x) => /^Legislação: .*(largura mínima|área mínima)/.test(x.texto) || /^O programa pede .* a taxa de ocupação permite/.test(x.texto))
    .map((x) => x.texto.replace(/^Legislação: /, ''));
  return motivos.length ? motivos.join('; ') : null;
}

/** F22: os problemas que pesam na escolha entre térrea e sobrado (o menor fica). */
export const problemasDoPlano = (p: PlanoDaCasa): number =>
  p.etapas.some((e) => e.id === 'ARQUITETURA' && e.situacao === 'NAO_RODOU')
    ? Infinity
    : // O aviso sobre a ESCOLHA dos pavimentos ("Pavimentos: …") não é defeito do desenho — contado, a térrea pedida
      // levava um problema a mais que a mesma térrea comparada pelo Automático.
      ((ps) => ps.filter((x) => x.grupo === 'SEM_SOLUCAO' || x.grupo === 'CONFLITO').length * 3 + ps.filter((x) => x.grupo === 'VERIFICACAO').length)(p.pendencias.filter((x) => !/^Pavimentos/.test(x.texto))) +
      (terreaNaoComporta(p) ? 2 : 0);

/**
 * F24 (decisão do usuário, 17/10/2026): a térrea em retângulo e, se ele não comporta (limitado pelos recuos, ou ambiente
 * abaixo da medida mínima, ou acima da TO), a mesma casa em L — fica a de menos problemas (empate: a de mais área).
 */
export function planejarTerrea(original: BlueprintModel, entrada: EntradaDaCasa, hipParcial: Partial<HipotesesDaCasa>, opcoes: OpcoesDoPlanoDaCasa): PlanoDaCasa {
  const ret = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 1 }, opcoes);
  if ((hipParcial.implantacao?.forma ?? HIPOTESES_DA_IMPLANTACAO_PADRAO.forma) !== 'AUTOMATICA') return ret;
  const porque = terreaNaoComporta(ret) ?? (ret.implantacao?.limitante === 'ENVELOPE' ? 'os recuos limitam o retângulo' : null);
  if (!porque) return ret;
  // Item 9 (decisão do usuário, 19/10/2026: "alargar só o mínimo"): o cômodo abaixo da LARGURA mínima — a casa um passo
  // mais larga de cada vez, até caber (antes da casa em L). No R1-B 15 × 30, o programa mínimo pedia 9,60 m em 9,40.
  const rlDe = (x: PlanoDaCasa) => x.implantacao?.retanguloLocal ?? null;
  const r0 = rlDe(ret);
  if (r0 && /largura mínima/.test(terreaNaoComporta(ret) ?? '')) {
    const w0 = r0.x1 - r0.x0;
    const passo = hipParcial.implantacao?.alargarPassoMm ?? 200;
    const ate = hipParcial.implantacao?.alargarAteMm ?? 600;
    for (let extra = passo; extra <= ate; extra += passo) {
      const tent = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 1, implantacao: { ...(hipParcial.implantacao ?? {}), larguraMinimaMm: w0 + extra } }, opcoes);
      const r = rlDe(tent);
      if (!r || r.x1 - r.x0 < w0 + extra) break; // o envelope não deixa alargar mais
      if (!terreaNaoComporta(tent)) {
        tent.decisoes.push(`Implantação: a casa ${f2(extra / 1000)} m mais larga (${f2(w0 / 1000)} → ${f2((r.x1 - r.x0) / 1000)} m) — os mínimos do programa não cabiam.`);
        return tent;
      }
    }
  }
  const emL = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 1, implantacao: { ...(hipParcial.implantacao ?? {}), forma: 'L' } }, opcoes);
  if (!emL.implantacao?.contornoLocal) return ret;
  const [pR, pL] = [problemasDoPlano(ret), problemasDoPlano(emL)];
  const area = (x: PlanoDaCasa) => x.implantacao?.medidas.projecaoM2 ?? 0;
  const fica = pL < pR || (pL === pR && area(emL) > area(ret) + 1) ? emL : ret;
  const texto =
    fica === emL
      ? `Forma da casa: em L — o retângulo não comportava o programa (${porque}).`
      : `Forma da casa: retângulo — não comporta o programa (${porque}), mas em L a casa tinha mais problemas.`;
  fica.decisoes.push(texto);
  fica.pendencias.push({ grupo: 'CONFERIR', texto });
  return fica;
}

/** F27-D4: o gabarito da zona deixa 3 pavimentos (sem gabarito em pavimentos, deixa — a altura a implantação confere). */
export const cabemTres = (entrada: EntradaDaCasa) => entrada.ctx.zona.gabaritoPavimentos == null || entrada.ctx.zona.gabaritoPavimentos >= 3;

export function planejarCasa(original: BlueprintModel, entrada: EntradaDaCasa, hipParcial: Partial<HipotesesDaCasa> = {}, opcoes: OpcoesDoPlanoDaCasa = {}): PlanoDaCasa {
  const pav = hipParcial.pavimentos ?? HIPOTESES_DA_CASA_PADRAO.pavimentos;
  if (pav !== 'AUTOMATICO') {
    const p = pav === 1 ? planejarTerrea(original, entrada, hipParcial, opcoes) : planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: pav }, opcoes);
    // A térrea (ou o sobrado) pedida que não comporta: dito, com a saída (a escolha da pessoa fica).
    const motivo = pav === 1 || pav === 2 ? terreaNaoComporta(p) : null;
    if (motivo && pav === 1) p.pendencias.push({ grupo: 'VERIFICACAO', texto: `Pavimentos: a térrea não comporta o programa (${motivo}) — em "Automático" ou "Sobrado", a casa sobe um pavimento.` });
    if (motivo && pav === 2 && cabemTres(entrada)) p.pendencias.push({ grupo: 'VERIFICACAO', texto: `Pavimentos: o sobrado não comporta o programa (${motivo}) — em "Automático" ou "3 pavimentos", a casa sobe mais um.` });
    return p;
  }
  const terrea = planejarTerrea(original, entrada, hipParcial, opcoes);
  const motivo = terreaNaoComporta(terrea);
  if (!motivo) {
    terrea.decisoes.push('Pavimentos automático: térrea (o programa cabe nela).');
    return terrea;
  }
  const sobrado = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 2 }, opcoes);
  let fica = problemasDoPlano(sobrado) < problemasDoPlano(terrea) ? sobrado : terrea;
  let texto = fica === sobrado ? `Pavimentos automático: sobrado — a térrea não comportava o programa (${motivo}).` : `Pavimentos automático: térrea — não comporta o programa (${motivo}), mas o sobrado tinha mais problemas.`;
  // F27-D4 (decisão do usuário, 18/10/2026: "só quando o sobrado não comporta"): e o gabarito da zona deixa 3.
  const motivoDoSobrado = terreaNaoComporta(sobrado);
  if (motivoDoSobrado && cabemTres(entrada)) {
    const tres = planejarComPavimentos(original, entrada, { ...hipParcial, pavimentos: 3 }, opcoes);
    if (problemasDoPlano(tres) < problemasDoPlano(fica)) {
      fica = tres;
      texto = `Pavimentos automático: 3 pavimentos — nem a térrea (${motivo}) nem o sobrado (${motivoDoSobrado}) comportavam o programa.`;
    } else texto += ` A de 3 pavimentos (o sobrado também não comporta: ${motivoDoSobrado}) tinha mais problemas.`;
  }
  fica.decisoes.push(texto);
  fica.pendencias.push({ grupo: 'CONFERIR', texto });
  return fica;
}

// A CONFERÊNCIA e o plano — o fim comum da térrea e do sobrado. TO pela projeção; CA pela soma dos pavimentos.
export type ResumoDasDisciplinas = Omit<PlanoDaCasa['resumo'], 'areaConstruidaM2' | 'ambientesPedidos' | 'ambientesAtendidos' | 'regrasVioladas' | 'terraplenagem' | 'muro'>;

export function planejarComPavimentos(original: BlueprintModel, entrada: EntradaDaCasa, hipParcial: Partial<HipotesesDaCasa> & { pavimentos: 1 | 2 | 3 }, opcoes: OpcoesDoPlanoDaCasa = {}): PlanoDaCasa {
  const hip: HipotesesDaCasa = {
    ...HIPOTESES_DA_CASA_PADRAO,
    ...hipParcial,
    sobrado: { ...HIPOTESES_DO_SOBRADO_PADRAO, ...(hipParcial.sobrado ?? {}) },
    estrutura: { ...HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, ...(hipParcial.estrutura ?? {}) },
    terraplenagem: { ...HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, ...(hipParcial.terraplenagem ?? {}) },
    muro: { ...HIPOTESES_DO_MURO_DA_CASA_PADRAO, ...(hipParcial.muro ?? {}) },
    telhado: { ...HIPOTESES_DO_TELHADO_PADRAO, ...(hipParcial.telhado ?? {}) },
    ancoras: { ...HIPOTESES_DAS_ANCORAS_PADRAO, ...(hipParcial.ancoras ?? {}) },
    mobiliario: { ...HIPOTESES_MOBILIARIO_PADRAO, lancar: true, ...(hipParcial.mobiliario ?? {}) },
    pontos: { ...HIPOTESES_PONTOS_PADRAO, afastamentoFriaQuenteMm: 150, ...(hipParcial.pontos ?? {}) },
    hidraulica: { lancar: true, ...(hipParcial.hidraulica ?? {}) },
    eletrica: { ...HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO, ...(hipParcial.eletrica ?? {}) },
    climatizacao: { ...HIPOTESES_DA_CASA_PADRAO.climatizacao, ...(hipParcial.climatizacao ?? {}) },
    pressao: { ...HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO, ...(hipParcial.pressao ?? {}) },
    faixas: { aguaQuenteMm: 45, esgotoMm: -60, ...(hipParcial.faixas ?? {}) },
    forro: hipotesesDoForroDaCasa(hipParcial.forro ?? {}),
  };
  // Item 9 (decisão do usuário, 19/10/2026: "cozinha + serviço juntos"): no R1-B a área de serviço fica na frente, com a
  // cozinha (hipótese do gerador; a do estudo, se dada, vale).
  const hipGerador: Partial<HipotesesDoGerador> = { ...hip.gerador, servicoPodeIrAoFundo: hip.gerador?.servicoPodeIrAoFundo ?? entrada.curto?.padrao !== 'R1-B', automaticos: false };
  // A implantação usa a mesma parede externa e a mesma malha do gerador.
  const hipImplantacao: Partial<HipotesesDaImplantacao> = {
    espessuraExternaMm: hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm,
    malhaMm: hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm,
    ...hip.implantacao,
  };
  const etapas: EtapaDaCasa[] = [];
  const pendencias: PendenciaDoPpci[] = [];
  const decisoes: string[] = [];
  const comandos: Command[] = [];
  const criados: ObjectId[] = [];
  let m = original;
  // F25: a etapa de terraplenagem só existe com a topografia do estudo.
  const temTerreno = !!entrada.gradeDoTerreno && !!entrada.leitorDoTerreno && hip.terraplenagem.lancar;
  let terraplenagemDaCasa: ResumoDaTerraplenagem | null = null;
  const etapa = (id: EtapaDaCasaId, rotulo: string, situacao: SituacaoDaEtapa, n: number, nota: string | null = null) => {
    etapas.push({ id, rotulo, situacao: situacao === 'LANCOU' && n === 0 ? 'NADA_A_FAZER' : situacao, comandos: n, nota });
    opcoes.aoConcluirEtapa?.(etapas[etapas.length - 1], etapas.length, ORDEM_DAS_ETAPAS.length - (temTerreno ? 0 : 1));
  };
  const aplicar = (lote: Command[]): number => {
    if (!lote.length) return 0;
    const r = applyBatch(m, lote);
    m = r.model;
    comandos.push(...lote);
    criados.push(...r.diff.created);
    return lote.length;
  };
  // P2 (12/11/2026): o CONTEXTO que as etapas extraídas (`utils/casaAutomatica/etapa*.ts`) recebem no lugar do fechamento —
  // lido na hora (getter), e os `let` regraváveis (setter).
  const ctx: ContextoDaCasa = {
    get andarMm() {
      return andarMm;
    },
    get aplicar() {
      return aplicar;
    },
    get comandos() {
      return comandos;
    },
    get criados() {
      return criados;
    },
    get decisoes() {
      return decisoes;
    },
    get divididos() {
      return divididos;
    },
    get doCurto() {
      return doCurto;
    },
    get entrada() {
      return entrada;
    },
    get entradaDoGerador() {
      return entradaDoGerador;
    },
    get estrutura() {
      return estrutura;
    },
    get etapa() {
      return etapa;
    },
    get etapaDoTelhado() {
      return etapaDoTelhado;
    },
    get etapaEstrutural() {
      return etapaEstrutural;
    },
    get etapas() {
      return etapas;
    },
    get faixaNoMundo() {
      return faixaNoMundo;
    },
    get fechar() {
      return fechar;
    },
    get forroDoComodo() {
      return forroDoComodo;
    },
    get forroLigado() {
      return forroLigado;
    },
    get garagemNoQuadro() {
      return garagemNoQuadro;
    },
    get gerarTodas() {
      return gerarTodas;
    },
    get hip() {
      return hip;
    },
    get hipGerador() {
      return hipGerador;
    },
    get hipImplantacao() {
      return hipImplantacao;
    },
    get implantacao() {
      return implantacao;
    },
    get instalacoes() {
      return instalacoes;
    },
    get lancarEscadaDeAcesso() {
      return lancarEscadaDeAcesso;
    },
    get lancarMuroDaCasa() {
      return lancarMuroDaCasa;
    },
    get lancarRampaDaGaragem() {
      return lancarRampaDaGaragem;
    },
    get loteDasRegras() {
      return loteDasRegras;
    },
    get m() {
      return m;
    },
    set m(v) {
      m = v;
    },
    get original() {
      return original;
    },
    get pedidos() {
      return pedidos;
    },
    get peDireitoMm() {
      return peDireitoMm;
    },
    get pendencias() {
      return pendencias;
    },
    get portaDaFrente() {
      return portaDaFrente;
    },
    get programa() {
      return programa;
    },
    get q() {
      return q;
    },
    get rebaixoDoForro() {
      return rebaixoDoForro;
    },
    get resumoDoMuro() {
      return resumoDoMuro;
    },
    set resumoDoMuro(v) {
      resumoDoMuro = v;
    },
    get rl() {
      return rl;
    },
    get telhado() {
      return telhado;
    },
    set telhado(v) {
      telhado = v;
    },
    get temTerreno() {
      return temTerreno;
    },
    get terraplenagemDaCasa() {
      return terraplenagemDaCasa;
    },
    set terraplenagemDaCasa(v) {
      terraplenagemDaCasa = v;
    },
    get terreno() {
      return terreno;
    },
    get vazio() {
      return vazio;
    },
    get zonaDasRegras() {
      return zonaDasRegras;
    },
  };

  const doCurto = programaDaCasa(entrada.curto, hip.programa);
  const programa = entrada.programa && entrada.programa.itens.length ? entrada.programa : doCurto.programa;
  if (!entrada.programa) for (const a of doCurto.avisos) pendencias.push({ grupo: 'PREMISSA', texto: `Programa: ${a}` });
  const pedidos = programa.itens.filter((i) => i.uso !== 'CIRCULACAO').reduce((s, i) => s + i.quantidade, 0);
  const vazio = (motivo: string, implantacao: ImplantacaoDaCasa | null = null): PlanoDaCasa => {
    for (const id of ORDEM_DAS_ETAPAS) if (id !== 'IMPLANTACAO' && !(id === 'TERRAPLENAGEM' && !temTerreno) && !etapas.some((e) => e.id === id)) etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, id === 'ARQUITETURA' ? motivo : 'sem arquitetura');
    return { levelId: entrada.levelId, comandos: [], criados: [], etapas, pendencias, resultado: original, programa, implantacao, semente: null, escolha: null, decisoes, sobrado: null, resumo: { areaConstruidaM2: null, ambientesPedidos: pedidos, ambientesAtendidos: 0, regrasVioladas: 0, estrutura: { ...ESTRUTURA_ZERADA }, telhado: null, ancoras: null, mobiliario: { pecas: 0, pontosDasLoucas: 0, pontosDoKit: 0 }, hidraulica: HIDRAULICA_ZERADA(), eletrica: ELETRICA_ZERADA(), aberturas: {}, climatizacao: CLIMATIZACAO_ZERADA(), forro: null, furos: null, terraplenagem: null } };
  };

  const impedimento = motivoParaNaoGerar(original, entrada.levelId);
  if (impedimento) {
    etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'NAO_RODOU', 0, impedimento);
    return vazio(impedimento);
  }

  // F25/F26: o platô de uma implantação — o mesmo cálculo da etapa TERRAPLENAGEM (lá aplicado; aqui, também para
  // medir a rampa da garagem antes de fixar a implantação).
  const platoDe = (impl: ImplantacaoDaCasa, meia: number) => {
    if (!temTerreno) return null;
    const qd = impl.quadro;
    const anelDoLote = entrada.ctx.terreno?.anel ?? null;
    const loteLocal = anelDoLote?.map((p) => paraLocal(qd, p)) ?? null;
    const rlT = impl.retanguloLocal;
    const yFrente = loteLocal ? Math.min(...loteLocal.map((p) => p.y)) : rlT.y0;
    const pontoDaRua = paraMundo(qd, { x: (rlT.x0 + rlT.x1) / 2, y: yFrente });
    return platoDaCasa(entrada.gradeDoTerreno!, entrada.leitorDoTerreno!.cotaZeroM, impl.anelNoMundo, meia, anelDoLote, pontoDaRua, Math.max(0, rlT.y0 - meia - yFrente), hip.terraplenagem);
  };

  // ── IMPLANTACAO ───────────────────────────────────────────────────────────
  // F12: no sobrado, o retângulo é o do pavimento MAIOR mais o núcleo da escada; a altura conta os dois pés-direitos.
  const peDireitoMm = hipGerador.peDireitoMm ?? HIPOTESES_DO_GERADOR_PADRAO.peDireitoMm;
  const andarMm = peDireitoMm + hip.sobrado.lajeEntrePavimentosMm;
  // F27-D: em 3, o pavimento maior é o térreo ou o 1º (o 2º é recuado, com o terraço) — o retângulo é o dele.
  // F27-D: em 3, o `superior` é o 1º pavimento e o `segundo`, o de cima (recuado, com o terraço).
  const divididos: { terreo: Programa; superior: Programa; segundo: Programa | null } | null =
    hip.pavimentos === 2
      ? { ...dividirPrograma(programa), segundo: null }
      : hip.pavimentos === 3
        ? (({ terreo, primeiro, segundo }) => ({ terreo, superior: primeiro, segundo }))(dividirEmTres(programa))
        : null;
  const pavimentosDoPrograma = divididos ? [divididos.terreo, divididos.superior, ...(divididos.segundo ? [divididos.segundo] : [])] : null;
  const implantar = (h: Partial<HipotesesDaImplantacao>) => implantacaoDaCasa(
    entrada.ctx,
    programa,
    doCurto.curto,
    h,
    pavimentosDoPrograma
      ? {
          utilPorPavimentoM2: Math.max(...pavimentosDoPrograma.map((x) => resumoDoPrograma(x).areaIdealComCirculacaoM2)) + (hip.sobrado.nucleoLarguraMm * hip.sobrado.nucleoProfundidadeMm) / 1e6,
          alturaM: (pavimentosDoPrograma.length * andarMm) / 1000,
          pavimentos: pavimentosDoPrograma.length === 3 ? 3 : 2,
        }
      : null,
  );
  let imp = implantar(hipImplantacao);
  // F26 (decisão do usuário, 18/10/2026: "Automático: rampa, recuando a casa"): no terreno inclinado a garagem fica no
  // platô; a rampa de veículos até `rampaDeVeiculosMaxPct` tem de caber entre o muro e a fachada. Não cabendo, a casa
  // recua — e o platô muda com ela (no aclive, sobe): implantação e platô de novo, até fechar (4 voltas no máximo).
  // A rua é lida no meio da frente da casa (a garagem ainda não tem lugar); o lançamento da rampa confere no lugar dela.
  if (imp.ok && temTerreno && doCurto.curto.garagemCoberta && doCurto.curto.vagas > 0) {
    const meiaP = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
    const pede = (impl: ImplantacaoDaCasa): { comprimentoMm: number; disponivelMm: number } | null => {
      const t = platoDe(impl, meiaP);
      if (!t || !t.ok || t.resumo.entrada.cotaDaCalcadaMm == null) return null;
      const delta = Math.abs(t.resumo.elevacaoDoTerreoMm - t.resumo.entrada.cotaDaCalcadaMm);
      if (delta <= hip.terraplenagem.desnivelSemDegrauMm) return null;
      const yF = Math.min(...(entrada.ctx.terreno?.anel ?? []).map((p) => paraLocal(impl.quadro, p).y));
      return { comprimentoMm: Math.ceil(delta / (hip.terraplenagem.rampaDeVeiculosMaxPct / 100)), disponivelMm: impl.retanguloLocal.y0 - meiaP - (yF + hip.muro.espessuraMm) };
    };
    // O que falta (a rampa − o que há entre o muro e a fachada) cresce com o recuo no aclive (o platô sobe junto): a
    // SECANTE sobre ele acerta na segunda volta num terreno de declive constante; a primeira é o passo simples.
    let anterior: { recuo: number; falta: number } | null = null;
    const semRecuo = imp;
    for (let volta = 0; volta < 6 && imp.ok; volta++) {
      const r = pede(imp.implantacao);
      if (!r || r.comprimentoMm <= r.disponivelMm) break;
      const recuoAtual = r.disponivelMm + hip.muro.espessuraMm;
      const falta = r.comprimentoMm - r.disponivelMm;
      const secante = anterior && Math.abs(falta - anterior.falta) > 1 && recuoAtual !== anterior.recuo ? recuoAtual - (falta * (recuoAtual - anterior.recuo)) / (falta - anterior.falta) : null;
      const recuo = Math.ceil(Math.max(recuoAtual + falta, secante ?? 0) + 50);
      anterior = { recuo: recuoAtual, falta };
      const prox = implantar({ ...hipImplantacao, recuoMinimoDeFrenteMm: recuo });
      if (!prox.ok || prox.implantacao.retanguloLocal.y0 <= imp.implantacao.retanguloLocal.y0) break;
      hipImplantacao.recuoMinimoDeFrenteMm = recuo;
      imp = prox;
    }
    // Recuar e não caber (o terreno mais íngreme que a rampa: cada metro de recuo sobe mais do que a rampa vence) só
    // estragaria a casa — ela volta para onde estava, e o lançamento da rampa diz por que não.
    const depois = imp.ok ? pede(imp.implantacao) : null;
    if (imp !== semRecuo && depois && depois.comprimentoMm > depois.disponivelMm) {
      imp = semRecuo;
      hipImplantacao.recuoMinimoDeFrenteMm = 0;
    }
  }
  if (!imp.ok) {
    etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'NAO_RODOU', 0, imp.motivo);
    pendencias.push({ grupo: 'PREMISSA', texto: imp.motivo });
    return vazio('sem implantação');
  }
  const implantacao = imp.implantacao;
  etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'CALCULOU', 0, resumoDaImplantacao(implantacao));
  // F24: onde as vagas descobertas foram e a casa em L são DECISÕES da implantação — para conferir.
  for (const a of implantacao.avisos) {
    const decisao = /^(Vagas descobertas|Casa em L|Garagem):/.test(a);
    if (decisao) decisoes.push(a);
    pendencias.push({ grupo: decisao ? 'CONFERIR' : 'PREMISSA', texto: a });
  }

  // ── TERRAPLENAGEM (F25) ─────────────────────────────────────────────────
  // O platô único sob a projeção, na cota de equilíbrio do corte e do aterro; o térreo assenta nele (o lote inteiro
  // segue relativo à cota zero do desenho — a hidráulica lê o terreno contra essa cota). Talude ou muro por borda; a
  // entrada, rampa ou escada da calçada ao piso.
  if (temTerreno) {
    try {
      const qd = implantacao.quadro;
      const anelDoLote = entrada.ctx.terreno?.anel ?? null;
      const loteLocal = anelDoLote?.map((p) => paraLocal(qd, p)) ?? null;
      const rlT = implantacao.retanguloLocal;
      const yFrente = loteLocal ? Math.min(...loteLocal.map((p) => p.y)) : rlT.y0;
      const meia = (hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm) / 2;
      const pontoDaRua = paraMundo(qd, { x: (rlT.x0 + rlT.x1) / 2, y: yFrente });
      const t = platoDaCasa(entrada.gradeDoTerreno!, entrada.leitorDoTerreno!.cotaZeroM, implantacao.anelNoMundo, meia, anelDoLote, pontoDaRua, Math.max(0, rlT.y0 - meia - yFrente), hip.terraplenagem);
      if (!t.ok) {
        etapa('TERRAPLENAGEM', ROTULO_DA_ETAPA_DA_CASA.TERRAPLENAGEM, 'NAO_RODOU', 0, t.motivo);
        pendencias.push({ grupo: 'PREMISSA', texto: `Terraplenagem: ${t.motivo} — a casa fica na cota zero do desenho.` });
      } else {
        const tr = t.resumo;
        terraplenagemDaCasa = tr;
        const nivel = m.levels.find((l) => l.id === entrada.levelId);
        const n = nivel && nivel.elevationMm !== tr.elevacaoDoTerreoMm ? aplicar([{ type: 'SetLevelProps', levelId: entrada.levelId, elevationMm: tr.elevacaoDoTerreoMm }]) : 0;
        const m3 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        const muros = tr.bordas.filter((b) => b.solucao === 'MURO');
        etapa(
          'TERRAPLENAGEM',
          ROTULO_DA_ETAPA_DA_CASA.TERRAPLENAGEM,
          'LANCOU',
          Math.max(n, 1),
          `platô a ${tr.cotaDoPlatoM.toLocaleString('pt-BR')} m (${m3(tr.areaPlatoM2)} m²), térreo a ${(tr.elevacaoDoTerreoMm / 1000).toLocaleString('pt-BR')} m do zero; corte ${m3(tr.corteM3)} m³, aterro ${m3(tr.aterroM3)} m³${muros.length ? `; ${muros.length} muro(s) de arrimo (${m3(tr.murosComprimentoM)} m)` : ''}`,
        );
        decisoes.push(`Terraplenagem: platô único na cota de equilíbrio sob a projeção (${tr.cotaDoPlatoM.toLocaleString('pt-BR')} m); o térreo ${hip.terraplenagem.pisoAcimaDoPlatoMm} mm acima.`);
        pendencias.push({
          grupo: 'CONFERIR',
          texto: `Terraplenagem: corte ${m3(tr.corteM3)} m³ e aterro ${m3(tr.aterroM3)} m³ (${tr.botaForaM3 > 0 ? `bota-fora ${m3(tr.botaForaM3)} m³` : tr.emprestimoM3 > 0 ? `empréstimo ${m3(tr.emprestimoM3)} m³` : 'equilibrado'}), taludes de ${m3(tr.areaTaludeM2)} m² — estimativa da topografia do estudo; confira com o levantamento.`,
        });
        // O lado de cada borda, de quem olha da rua (no quadro da frente).
        const cx = (rlT.x0 + rlT.x1) / 2;
        const cy = (rlT.y0 + rlT.y1) / 2;
        const ladoDaBorda = (b: (typeof muros)[number]) => {
          const mL = paraLocal(qd, { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 });
          const dx = mL.x - cx;
          const dy = mL.y - cy;
          return Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'da frente' : 'dos fundos') : dx < 0 ? 'da esquerda' : 'da direita';
        };
        for (const b of muros)
          pendencias.push({ grupo: 'VERIFICACAO', texto: `Terraplenagem: muro de arrimo na borda ${ladoDaBorda(b)}, de ${b.comprimentoM.toLocaleString('pt-BR')} m e até ${b.alturaMaxM.toLocaleString('pt-BR')} m de altura (${b.lado === 'CORTE' ? 'segura o corte' : 'segura o aterro'}; ${b.motivo}) — dimensione com o calculista.`, ...comLocal({ levelId: entrada.levelId, ids: [], ponto: { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 } }) });
      }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa('TERRAPLENAGEM', ROTULO_DA_ETAPA_DA_CASA.TERRAPLENAGEM, 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Terraplenagem: ${motivo}` });
    }
  }

  // F25 (decisão do usuário, 18/10/2026: "escada partindo do terreno"): a ESCADA (ou rampa) DE ACESSO, da calçada à
  // porta de entrada — `Escada.desdeCotaMm` (kernel 0.103.0). Sai da face da fachada diante da porta, rumo à rua, com os
  // pontos do lado baixo para o alto; só quando cabe no recuo de frente (senão a pendência diz, e ela fica à mão).
  // A porta de entrada: a mais larga na parede da fachada da frente do térreo (no quadro da frente, `local`).
  const portaDaFrente = () => portaDaFrenteDaEtapa(ctx);
  const lancarEscadaDeAcesso = () => lancarEscadaDeAcessoDaEtapa(ctx);

  // A garagem coberta no quadro da frente: o ambiente de uso GARAGEM no térreo (caixa do anel).
  const garagemNoQuadro = () => garagemNoQuadroDaEtapa(ctx);
  // F26 (decisão do usuário, 18/10/2026: "Automático: rampa, recuando a casa"): a RAMPA DE VEÍCULOS (escada de acesso
  // tipo RAMPA, `veicular`, kernel 0.104.0) da calçada diante da garagem até a fachada — a implantação já recuou a casa
  // para ela caber; aqui, no lugar real da garagem, ela é lançada ou a pendência diz por que não.
  const lancarRampaDaGaragem = () => lancarRampaDaGaragemDaEtapa(ctx);

  // F26 (decisões do usuário: "muro + portão + calçada", "família nova no kernel"): o muro do lote (kernel 0.104.0), o
  // portão de pedestre diante da porta, o de garagem diante da garagem e as calçadas — depois da casa inteira, que é
  // de onde saem a porta, a garagem e a escada de acesso.
  let resumoDoMuro: PlanoDoMuroDaCasa['resumo'] | null = null;
  const lancarMuroDaCasa = (): PlanoDoMuroDaCasa['resumo'] | null => lancarMuroDaCasaDaEtapa(ctx);

  // ── ARQUITETURA ───────────────────────────────────────────────────────────
  const q = implantacao.quadro;
  // F14a: a faixa (d, d) do quadro da frente levada ao mundo — numa casa ortogonal, d mm do eixo em qualquer parede.
  const faixaNoMundo = (d: number): Point => {
    const v = paraMundo(q, { x: d, y: d });
    return { x: Math.round(v.x), y: Math.round(v.y) };
  };
  // F14b: o forro de cada cômodo (gesso; PVC nos molhados) a um rebaixo só, que acomoda as faixas das redes.
  const forroLigado = hip.forro.lancar;
  const rebaixoDoForro = rebaixoDoForroMm(hip.forro);
  const etiquetaDoComodo = (model: BlueprintModel, sp: BlueprintModel['spaces'][number]): SpaceLabel | null =>
    model.labels.find((l) => l.levelId === sp.levelId && pointInPolygon(sp.ring, l.at)) ?? null;
  const forroDoComodo = (model: BlueprintModel, sp: BlueprintModel['spaces'][number]) => {
    const etiqueta = etiquetaDoComodo(model, sp);
    const uso = etiqueta?.uso ?? usoDoNome(sp.name);
    const sugerido = presetsSugeridos(uso ? TIPO_NBR5410_DO_USO[uso] : null).forro;
    const preset = sugerido.rebaixoMm ? sugerido : presetDeAcabamento('FORRO_GESSO')!;
    const espessuraMm = preset.camadas.reduce((n, c) => n + c.espessuraMm, 0);
    const tetoMm = model.levels.find((l) => l.id === sp.levelId)?.defaultHeightMm ?? 0;
    return { etiqueta, preset, espessuraMm, faceMm: tetoMm - rebaixoDoForro - espessuraMm, minimoMm: uso && USOS_DE_PERMANENCIA.has(uso) ? hip.forro.peDireitoLivrePermanenciaMm : hip.forro.peDireitoLivreDemaisMm, tetoMm };
  };
  const rl = implantacao.retanguloLocal;
  const terreno = entrada.ctx.terreno;
  const loteDasRegras = loteParaRegras(terreno, entrada.ctx.limites);
  const zona = entrada.ctx.zona;
  const zonaDasRegras: ContextoDeRegras['zona'] = entrada.zonaDasRegras ?? {
    taxaOcupacaoMax: zona.taxaOcupacaoMaxPct,
    coeficienteMax: zona.coeficienteMax,
    gabaritoAlturaMaxM: zona.gabaritoAlturaMaxM,
    gabaritoPavimentos: zona.gabaritoPavimentos,
    taxaPermeabilidadeMin: zona.taxaPermeabilidadeMinPct,
  };
  const entradaDoGerador: EntradaDoGerador = {
    programa,
    envelope: implantacao.contornoLocal ?? [point(rl.x0, rl.y0), point(rl.x1, rl.y0), point(rl.x1, rl.y1), point(rl.x0, rl.y1)],
    direcaoDaFrente: null, // no quadro da frente, a rua é o sul (−y)
    rotacaoNorteDeg: norteNoQuadro(q, entrada.rotacaoNorteDeg),
    latitudeGraus: entrada.latitudeGraus,
    contextoDeRegras: { lote: loteDasRegras, zona: zonaDasRegras },
  };

  const fechar = (f: { projecaoM2: number; areaConstruidaM2: number; alturaM: number; semente: number; escolha: string; sobrado: ResumoDoSobrado | null; disciplinas: ResumoDasDisciplinas }): PlanoDaCasa => fecharDaEtapa(ctx, f);

  const gerarTodas = (p: Programa) => gerarTodasDaEtapa(ctx, p);

  // ── ESTRUTURA (F4) — o molde das etapas estruturais (a térrea e o sobrado) ─────
  // Os lançamentos automáticos da gaveta Estrutural, em cadeia: cada um lê o modelo com o anterior aplicado
  // (vigas apoiam nos pilares, fundações descem dos pilares). Falha ou recusa = motivo na etapa e segue.
  const estrutura = { ...ESTRUTURA_ZERADA };
  const L = entrada.levelId;
  const etapaEstrutural = <P extends { comandos: Command[]; motivo: string | null; avisos?: string[] }>(id: Exclude<EtapaDaCasaId, 'IMPLANTACAO' | 'ARQUITETURA' | 'CONFERENCIA'>, planejar: (modelo: BlueprintModel) => P, contar: (plano: P) => { nota: string; foraDoPlano?: string[] }) => etapaEstruturalDaEtapa<P>(ctx, id, planejar, contar);
  // ── TELHADO (F5) ──────────────────────────────────────────────────────────
  // Duas águas (ou uma) por extrusão sobre o retângulo da arquitetura, no quadro da frente. A parede termina
  // no pé-direito; com laje lançada, o telhado começa em cima dela. No sobrado, sobre o pavimento de cima.
  let telhado: ResumoDoTelhado | null = null;
  const etapaDoTelhado = (levelId: ObjectId, ret: Retangulo, anexos: readonly Retangulo[], comLaje: boolean) => etapaDoTelhadoDaEtapa(ctx, levelId, ret, anexos, comLaje);

  // ── INSTALAÇÕES (F6–F9) — da térrea e do sobrado: `niveis` = [térreo] ou [térreo, superior] ─────────
  // Água, esgoto, pluvial, eletrodutos e climatização já leem o modelo inteiro (colunas, tubo de queda, prumadas);
  // âncoras, mobiliário, pontos, circuitos e as conferências rodam pavimento a pavimento.
  const instalacoes = (niveis: ObjectId[], ret: Retangulo, notaDoShaft: string | null = null) => instalacoesDaEtapa(ctx, niveis, ret, notaDoShaft);

  // ── SOBRADO (F12a) ────────────────────────────────────────────────────────
  // Os dois pavimentos no MESMO retângulo, gerados cada um com a sua parte do programa; o núcleo da escada
  // recortado depois na ponta do corredor de cima (ver `blueprintSobrado.ts`). A estrutura e as instalações dos
  // dois pavimentos ainda não rodam aqui: as etapas dizem isso, e o plano fecha na conferência.
  {
    const plano = planejarOSobradoDaEtapa(ctx);
    if (plano) return plano;
  }

  const { resultados, falhas } = gerarTodas(programa);
  if (!resultados.length) {
    const motivo = `o gerador não fechou a planta (${falhas.join('; ')})`;
    etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: motivo });
    return vazio(motivo, implantacao);
  }
  const { r, texto: escolha } = escolherSemente(resultados);
  decisoes.push(...r.decisoes);
  let n = 0;
  try {
    n = aplicar(comandosNoMundo(r, entrada.levelId, q, implantacao.alinhadaAoDesenho));
  } catch (e) {
    const motivo = `as paredes geradas não entraram no desenho: ${e instanceof Error ? e.message : String(e)}`;
    etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: motivo });
    return vazio(motivo, implantacao);
  }
  const paredes = m.walls.filter((w) => w.levelId === entrada.levelId).length;
  const aberturas = m.openings.filter((o) => m.walls.some((w) => w.id === o.wallId && w.levelId === entrada.levelId)).length;
  etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'LANCOU', n, `${paredes} paredes, ${aberturas} portas e janelas, ${r.ambientes.length} ambientes — ${escolha}`);
  lancarEscadaDeAcesso();
  lancarRampaDaGaragem();
  // F26: o muro logo depois da casa — antes da água e da elétrica, que põem o hidrômetro e o medidor nele.
  resumoDoMuro = lancarMuroDaCasa();
  // F21: "sem porta direta" já sai na CONFERÊNCIA do programa (com a distância em portas) — aqui só pesa na escolha.
  for (const a of r.avisos) if (!/sem porta direta \(relação obrigatória\)/.test(a)) pendencias.push({ grupo: GRAVE.test(a) ? 'SEM_SOLUCAO' : 'VERIFICACAO', texto: `Arquitetura: ${a}` });

  // ── ESTRUTURA (F4) ────────────────────────────────────────────────────────
  etapaEstrutural(
    'PILARES',
    (x) => planejarPilares(x, L, hip.estrutura.pilares),
    (p) => {
      estrutura.pilares = p.pilares.length;
      return { nota: `${p.pilares.length} pilar(es)${p.pontasSoltas ? `; ${p.pontasSoltas} ponta(s) de parede solta(s) sem pilar` : ''}`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'VIGAS',
    (x) => planejarVigas(x, L, hip.estrutura.vigas),
    (p) => {
      estrutura.vigas = p.vigas.length;
      return { nota: `${p.vigas.length} viga(s)`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'LAJES',
    (x) => planejarLajes(x, L, hip.estrutura.lajes),
    (p) => {
      estrutura.lajes = p.lajes.length;
      return { nota: `${p.lajes.length} laje(s) de ${hip.estrutura.lajes.espessuraMm} mm`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'FUNDACOES',
    (x) => planejarFundacoes(x, L, hip.estrutura.fundacoes),
    (p) => {
      estrutura.blocos = p.blocos.length;
      estrutura.estacas = p.estacas.length;
      estrutura.baldrames = p.baldrames.length;
      return { nota: `${p.blocos.length} bloco(s), ${p.estacas.length} estaca(s), ${p.baldrames.length} baldrame(s)` };
    },
  );

  // Eixos POR ÚLTIMO: o `planejarPilares` põe pilar em todo cruzamento de eixos "com ou sem parede ali" (a malha
  // do calculista manda). Com os eixos automáticos — um por linha de parede — antes dos pilares, a malha cobria
  // a casa inteira (sonda de 15/10, casa de 157 m²: 52 pilares, 49 em cruzamento de eixo, 2 DENTRO de ambiente
  // longe de parede, 26 recusados por colidir; nesta ordem: 32, todos sobre parede). Depois, os eixos documentam
  // a estrutura lançada. Das paredes ortogonais; com paredes no pavimento, o envelope do lote não entra.
  etapaEstrutural(
    'EIXOS',
    (x) => {
      const p = propostaDeEixos(x, L, hip.estrutura.eixos);
      return { ...p, motivo: p.comandos.length ? null : p.motivoVazio && p.paredesObliquas === 0 ? p.motivoVazio : null, avisos: p.paredesObliquas ? [`${p.paredesObliquas} parede(s) oblíqua(s) ao desenho ficam fora da malha de eixos`] : [] };
    },
    (p) => {
      estrutura.eixos = p.novos;
      return { nota: `${p.novos} eixo(s)` };
    },
  );

  // ── TELHADO (F5) ──────────────────────────────────────────────────────────
  etapaDoTelhado(entrada.levelId, r.retangulo, r.anexos, estrutura.lajes > 0);

  // ── INSTALAÇÕES (F6–F9) ───────────────────────────────────────────────────
  const inst = instalacoes([entrada.levelId], r.retangulo);

  // ── CONFERENCIA ───────────────────────────────────────────────────────────
  return fechar({
    projecaoM2: r.resumo.areaConstruidaM2,
    areaConstruidaM2: r.resumo.areaConstruidaM2,
    alturaM: peDireitoMm / 1000,
    semente: r.semente,
    escolha,
    sobrado: null,
    disciplinas: { estrutura, telhado, ancoras: inst.ancoras, mobiliario: inst.mobiliario, hidraulica: inst.hidraulica, eletrica: inst.eletrica, aberturas: inst.redesEmAberturas, climatizacao: inst.climatizacao, forro: inst.forro, furos: inst.furos },
  });
}

/** F27 item 5.3b: quantas vezes o 1º recuado anda/cresce atrás do patamar da escada antes de desistir. */
export const VOLTAS_DO_PRIMEIRO_RECUADO = 8;

/** S3: o passo das bordas do 1º montado em volta do 2º, além da faixa mínima do terraço. */
export const PASSO_DO_PRIMEIRO_EM_VOLTA_DO_SEGUNDO_MM = 500;
