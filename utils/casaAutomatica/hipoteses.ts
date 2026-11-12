/**
 * Casa automática — parte `hipoteses` do motor (etapa D2, 11/11/2026: `utils/blueprintCasaAutomatica.ts` dividido sem mudar
 * o que gera; o marco das casas de referência prova). Ver o cabeçalho de `orquestrador.ts`.
 */
import { HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO } from '../blueprintPlatoDaCasa';
import type { HipotesesDaTerraplenagemDaCasa, ResumoDaTerraplenagem } from '../blueprintPlatoDaCasa';
import { HIPOTESES_DO_MURO_DA_CASA_PADRAO } from '../blueprintMuroDaCasa';
import type { HipotesesDoMuroDaCasa, PlanoDoMuroDaCasa } from '../blueprintMuroDaCasa';
import type { BlueprintModel, Command, ObjectId } from '../blueprintKernel';
import type { ContextoDaMassa } from '../blueprintMassa';
import type { HipotesesDoGerador, Retangulo } from '../blueprintGerador';
import { HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO } from '../blueprintPrograma';
import type { HipotesesDoProgramaDaCasa, Programa, ProgramaCurtoDaCasa } from '../blueprintPrograma';
import type { ContextoDeRegras } from '../blueprintRegras';
import { HIPOTESES_EIXOS_PADRAO } from '../blueprintEixosAutomaticos';
import type { HipotesesDeEixos } from '../blueprintEixosAutomaticos';
import { HIPOTESES_PILARES_PADRAO } from '../blueprintPilaresAutomaticos';
import type { HipotesesDePilares } from '../blueprintPilaresAutomaticos';
import { HIPOTESES_LAJES_PADRAO, HIPOTESES_VIGAS_PADRAO } from '../blueprintVigasLajesAutomaticas';
import type { HipotesesDeLajes, HipotesesDeVigas } from '../blueprintVigasLajesAutomaticas';
import { HIPOTESES_FUNDACOES_PADRAO } from '../blueprintFundacoesAutomaticas';
import type { HipotesesDeFundacoes } from '../blueprintFundacoesAutomaticas';
import { HIPOTESES_DO_TELHADO_PADRAO } from '../blueprintTelhadoAutomatico';
import type { HipotesesDoTelhado, ResumoDoTelhado } from '../blueprintTelhadoAutomatico';
import { HIPOTESES_DAS_ANCORAS_PADRAO } from '../blueprintAncorasDaCasa';
import type { HipotesesDasAncoras, ResultadoDasAncoras } from '../blueprintAncorasDaCasa';
import type { HipotesesHidro } from '../blueprintMemorialHidro';
import { HIPOTESES_MOBILIARIO_PADRAO } from '../blueprintMobiliario';
import type { HipotesesDeMobiliario } from '../blueprintMobiliario';
import { HIPOTESES_PONTOS_PADRAO } from '../blueprintPontosHidraulicos';
import type { HipotesesDePontos } from '../blueprintPontosHidraulicos';
import type { LeitorDoTerreno } from '../blueprintAncorasHidro';
import type { GradeDeElevacao } from '../blueprintTopografia';
import type { FaixaDoForro } from '../blueprintRotaPeloForro';
import type { FuroPrevisto } from '../blueprintFurosPrevistos';
import type { HipotesesDeCircuitos } from '../blueprintCircuitosAutomaticos';
import type { HipotesesEletricas } from '../blueprintEletricaDimensionamento';
import type { CaixasDePassagem } from '../preferencias/catalogoLancamento';
import type { ContextoDoGeradorDeClimatizacao } from '../blueprintGeradorClimatizacao';
import type { HipotesesClimatizacao } from '../blueprintClimatizacao';
import type { ModeloDoCatalogo } from '../blueprintSelecaoClimatizacao';
import type { LocalDaPendencia, PendenciaDoPpci, SituacaoDaEtapa } from '../blueprintGeradorPpci';
import { HIPOTESES_DO_SOBRADO_PADRAO } from '../blueprintSobrado';
import type { HipotesesDoSobrado, NucleoDaEscada } from '../blueprintSobrado';
import type { ImplantacaoDaCasa } from './quadroEImplantacao';

// ─── Hipóteses ──────────────────────────────────────────────────────────────

export type DivisaDeEncosto = 'ESQUERDA' | 'DIREITA' | 'CENTRO';

export interface HipotesesDaImplantacao {
  /**
   * Item 9 da casa automática (decisão do usuário, 19/10/2026: "alargar só o mínimo"): a largura (eixos) abaixo da qual a
   * casa não fica — o retângulo alarga até ela mantendo a profundidade (cede só o que a TO pedir). Ausente = a da forma.
   */
  larguraMinimaMm?: number | null;
  /** Item 9: o passo e o máximo do alargamento quando a térrea sai com cômodo abaixo da largura mínima, mm. Ausentes = 200 e 600. */
  alargarPassoMm?: number;
  alargarAteMm?: number;
  /** Fica esta porcentagem ABAIXO da TO máxima (folga para beiral, ajuste de obra). */
  folgaDaTOPct: number;
  encostarNaDivisa: DivisaDeEncosto;
  /** Largura (ao longo da frente) ÷ profundidade do retângulo da casa. */
  proporcaoFrenteFundo: number;
  /** Calçadas, acesso e quintal pavimentado, em % do lote — conta como impermeável. */
  pavimentacaoExternaPctDoLote: number;
  /** Área de cada vaga descoberta (impermeável), m². */
  areaPorVagaDescobertaM2: number;
  /** Retângulo (eixos das paredes) ÷ área útil do programa: as paredes internas comem área. */
  fatorDoRetanguloSobreUtil: number;
  /** Espessura da parede externa (a mesma do gerador) — a projeção conta meia de cada lado. */
  espessuraExternaMm: number;
  /** A malha do gerador: as medidas do retângulo são múltiplas dela. */
  malhaMm: number;
  /**
   * F24 (decisão do usuário, 17/10/2026: "Automático"): as vagas descobertas que não cabem no recuo de frente. RECUAR = a
   * casa vai para trás até caberem; AO_LADO = uma faixa da largura da vaga, da rua para dentro, ao lado da casa (que
   * estreita); AUTOMATICO = recua quando a profundidade deixa sem perder área, senão a opção que perde menos.
   */
  vagaDescoberta: 'AUTOMATICO' | 'RECUAR' | 'AO_LADO';
  /**
   * F24 (decisão do usuário, 17/10/2026: "só quando o retângulo não comporta"): AUTOMATICA = retângulo, e a casa tenta o
   * L quando o retângulo não comporta o programa (limitado pelos recuos, ou ambiente abaixo da medida mínima) e fica com
   * o de menos problemas; RETANGULO = nunca L; L = o retângulo da frente (mais raso) e um anexo colado atrás dele.
   */
  forma: 'AUTOMATICA' | 'RETANGULO' | 'L';
  /**
   * F26 (decisão do usuário, 18/10/2026: "Automático: rampa, recuando a casa"): da frente do lote à FACE da fachada, no
   * mínimo — o que a rampa de veículos da garagem pede no terreno inclinado. 0 = só os recuos da zona.
   */
  recuoMinimoDeFrenteMm: number;
}

export const HIPOTESES_DA_IMPLANTACAO_PADRAO: HipotesesDaImplantacao = {
  folgaDaTOPct: 5,
  encostarNaDivisa: 'ESQUERDA',
  proporcaoFrenteFundo: 0.7,
  pavimentacaoExternaPctDoLote: 10,
  areaPorVagaDescobertaM2: 12.5,
  fatorDoRetanguloSobreUtil: 1.08,
  espessuraExternaMm: 200,
  malhaMm: 50,
  vagaDescoberta: 'AUTOMATICO',
  forma: 'AUTOMATICA',
  recuoMinimoDeFrenteMm: 0,
};

// ─── Etapa C (11/11/2026): o local de uma pendência, só quando há ─────────────
/** `{ locais: [l] }` com local; `{}` sem — a pendência sem origem continua só texto. */
export const comLocal = (l: LocalDaPendencia | null): Pick<PendenciaDoPpci, 'locais'> => (l ? { locais: [l] } : {});

export const comLocais = (ls: LocalDaPendencia[] | undefined): Pick<PendenciaDoPpci, 'locais'> => (ls?.length ? { locais: ls } : {});

export const exato = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v);

export const m2 = (v: number) => Math.round(v * 100) / 100;

export const pct = (v: number) => Math.round(v * 10) / 10;

export const f2 = (v: number) => v.toFixed(2).replace('.', ',');

export const f1 = (v: number) => v.toFixed(1).replace('.', ',');

export const piso = (v: number, malha: number) => Math.floor(v / malha + 1e-9) * malha;

export type EtapaDaCasaId =
  | 'IMPLANTACAO'
  | 'TERRAPLENAGEM'
  | 'ARQUITETURA'
  | 'PILARES'
  | 'VIGAS'
  | 'LAJES'
  | 'FUNDACOES'
  | 'EIXOS'
  | 'TELHADO'
  | 'ANCORAS'
  | 'MOBILIARIO'
  | 'LOUCAS'
  | 'PONTOS_HIDRAULICOS'
  | 'AGUA'
  | 'ESGOTO'
  | 'PLUVIAL'
  | 'PONTOS_ELETRICOS'
  | 'QUADRO'
  | 'CIRCUITOS'
  | 'CLIMATIZACAO'
  | 'DR_DPS'
  | 'ELETRODUTOS'
  | 'FORRO'
  | 'MURO'
  | 'CONFERENCIA';

/** Rótulo de cada etapa, na ordem em que rodam (a tela e o relatório leem daqui). */
export const ROTULO_DA_ETAPA_DA_CASA: Record<EtapaDaCasaId, string> = {
  IMPLANTACAO: 'Implantação pela lei',
  TERRAPLENAGEM: 'Terraplenagem (o platô da casa no terreno inclinado)',
  ARQUITETURA: 'Arquitetura (gerador E6.2)',
  MURO: 'Muro, portões e calçadas',
  PILARES: 'Pilares',
  VIGAS: 'Vigas',
  LAJES: 'Lajes',
  FUNDACOES: 'Fundações (blocos, estacas, baldrame)',
  EIXOS: 'Eixos (documentam a estrutura)',
  TELHADO: 'Telhado',
  ANCORAS: "Peças-âncora (caixa d'água, aquecedor, caixa de gordura, vagas)",
  MOBILIARIO: 'Mobiliário e louças',
  LOUCAS: 'Pontos das louças (água e esgoto)',
  PONTOS_HIDRAULICOS: 'Pontos que completam o kit (caixa sifonada, ralo…)',
  AGUA: 'Água fria e quente (hidrômetro, alimentador, barrilete, colunas, ramais)',
  ESGOTO: 'Esgoto (caixas, ramais, ventilação, ligação ou tratamento)',
  PLUVIAL: 'Águas pluviais (calhas, condutores, saída)',
  PONTOS_ELETRICOS: 'Pontos elétricos pela norma (tomadas, luz, interruptores, chuveiro elétrico)',
  QUADRO: 'Quadro no centro de cargas e entrada de energia (medidor na frente)',
  CIRCUITOS: 'Circuitos',
  CLIMATIZACAO: 'Climatização (carga térmica, splits, linhas, circuitos)',
  DR_DPS: 'Proteção (DR e DPS) e ligação da entrada',
  ELETRODUTOS: 'Eletrodutos',
  FORRO: 'Forro dos cômodos (as redes nas faixas do plenum)',
  CONFERENCIA: 'Conferência (programa e legislação)',
};

export const ORDEM_DAS_ETAPAS = Object.keys(ROTULO_DA_ETAPA_DA_CASA) as EtapaDaCasaId[];

/** F4: as hipóteses da ESTRUTURA — as mesmas das gavetas de lançamento automático (padrões de lá). */
export interface HipotesesDaEstruturaDaCasa {
  /** `false` = a casa sai só com a arquitetura. */
  lancar: boolean;
  eixos: Partial<HipotesesDeEixos>;
  pilares: HipotesesDePilares;
  vigas: HipotesesDeVigas;
  lajes: HipotesesDeLajes;
  fundacoes: HipotesesDeFundacoes;
}

export const HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO: HipotesesDaEstruturaDaCasa = {
  lancar: true,
  eixos: HIPOTESES_EIXOS_PADRAO,
  pilares: HIPOTESES_PILARES_PADRAO,
  vigas: HIPOTESES_VIGAS_PADRAO,
  lajes: HIPOTESES_LAJES_PADRAO,
  fundacoes: HIPOTESES_FUNDACOES_PADRAO,
};

export interface EtapaDaCasa {
  id: EtapaDaCasaId;
  rotulo: string;
  situacao: SituacaoDaEtapa;
  comandos: number;
  nota: string | null;
}

export interface EntradaDaCasa {
  /** O pavimento onde a casa nasce — precisa estar sem paredes. */
  levelId: ObjectId;
  /** Terreno, divisas com papel, recuos e índices da zona (o contexto do estudo de massa). */
  ctx: ContextoDaMassa;
  curto: ProgramaCurtoDaCasa;
  /** Programa já editado pelo usuário; ausente = `programaDaCasa(curto)`. */
  programa?: Programa | null;
  /** A zona inteira para as regras (testada mínima, área mínima do lote…). Ausente = só o que `ctx.zona` tem. */
  zonaDasRegras?: ContextoDeRegras['zona'];
  rotacaoNorteDeg: number | null;
  latitudeGraus: number;
  /**
   * F6: as premissas hidrossanitárias do ESTUDO (`blueprint_study_hidro`) — reservação, esgoto (destino: rede
   * pública × tratamento), pluvial. Ausente = `HIPOTESES_HIDRO_PADRAO`.
   */
  hidro?: HipotesesHidro | null;
  /**
   * F8: a cota do terreno em cada ponto (a topografia do estudo) — a caixa de inspeção, a ligação e o
   * hidrômetro na frente do lote leem a cota dali. Ausente = terreno plano na cota zero. (Não é clonável: a F10
   * passa a grade ao worker e monta o leitor lá.)
   */
  leitorDoTerreno?: LeitorDoTerreno | null;
  /**
   * F25: a GRADE da topografia do estudo (o leitor acima é feito dela) — a terraplenagem do platô precisa dela inteira.
   * Ausente = a casa fica na cota zero do desenho (sem a etapa de terraplenagem).
   */
  gradeDoTerreno?: GradeDeElevacao | null;
  /** F9: as hipóteses de circuitos do estudo (a gaveta de circuitos). Ausente = `HIPOTESES_CIRCUITOS_PADRAO`. */
  circuitos?: HipotesesDeCircuitos | null;
  /** F9: as hipóteses elétricas do estudo (`blueprint_study_eletrica`). Ausente = o padrão. */
  eletricas?: HipotesesEletricas | null;
  /**
   * 24/10/2026 (plano 2026-10-24-relancar-quando-escolha-muda.md, F2): a preferência do USUÁRIO de caixas de passagem
   * (`planta.lancamento.caixasDePassagem`) — a mesma do painel dos eletrodutos. Ausente = o padrão dela, `PELA_LUZ`
   * (sem caixas). Antes a casa forçava `HIPOTESES_ELETRODUTO_PADRAO`, que tem caixas.
   */
  caixasDePassagem?: CaixasDePassagem | null;
  /** F9: as premissas de climatização do estudo — o clima (TBS/TBU externas) e as condições internas. */
  climatizacao?: HipotesesClimatizacao | null;
  /** F9: o catálogo de evaporadoras (`modelosDoCatalogo`). Vazio ou ausente = a climatização não roda, e diz. */
  modelosDeClimatizacao?: readonly ModeloDoCatalogo[] | null;
  /**
   * F10: o contexto da carga térmica que o editor dá ao gerador de climatização dele — os materiais da biblioteca
   * (o U das paredes e do teto) e a cidade da zona (o clima). Ausente = o padrão do gerador.
   */
  cargaDaClimatizacao?: ContextoDoGeradorDeClimatizacao['carga'] | null;
}

export interface HipotesesDaCasa {
  /** F12: 1 = térrea; 2 = sobrado (social e serviço embaixo, íntimo em cima, escada em U num núcleo). */
  /**
   * F12: 1 = térrea; 2 = sobrado. F22 (decisão do usuário, 17/10/2026: "opção Automático"): 'AUTOMATICO' gera a térrea e,
   * se ela não comporta o programa (medida mínima de ambiente violada ou o programa acima da TO), também o sobrado — e fica
   * com o de menos problemas. F27-D (decisão do usuário, 18/10/2026): 3 = térreo social, 1º íntimo, 2º recuado com a
   * suíte principal, o escritório e o terraço — em subfases; até a D2 o 3 só calcula a implantação.
   */
  pavimentos: 1 | 2 | 3 | 'AUTOMATICO';
  /** F12: o núcleo da escada, a laje entre os pavimentos e a escada. */
  sobrado: HipotesesDoSobrado;
  programa: HipotesesDoProgramaDaCasa;
  implantacao: Partial<HipotesesDaImplantacao>;
  /** F25: o platô no terreno inclinado (decisão do usuário: platô único). */
  terraplenagem: HipotesesDaTerraplenagemDaCasa;
  /** F26: o muro, os portões e as calçadas (decisão do usuário: muro + portão + calçada; família nova no kernel). */
  muro: HipotesesDoMuroDaCasa;
  gerador: Partial<HipotesesDoGerador>;
  /** As sementes que o E6.2 tenta; fica a de menos problemas graves. */
  sementes: number[];
  estrutura: HipotesesDaEstruturaDaCasa;
  /** F5: a cobertura (`lancar: false` = sem telhado). */
  telhado: HipotesesDoTelhado;
  /** F6: caixa d'água, aquecedor, caixa de gordura e vagas. */
  ancoras: HipotesesDasAncoras;
  /** F7: o mobiliário mínimo (as louças lançam os pontos) e os pontos do kit hidráulico. */
  mobiliario: HipotesesDeMobiliario & { lancar: boolean };
  pontos: HipotesesDePontos;
  /** F8: lançar as redes de água, esgoto e pluvial (as premissas são as do estudo, em `EntradaDaCasa.hidro`). */
  hidraulica: { lancar: boolean };
  /** F9: a elétrica. */
  eletrica: HipotesesDaEletricaDaCasa;
  /** F9: lançar a climatização (premissas e catálogo na `EntradaDaCasa`). */
  /**
   * F14d (decisão do usuário, 16/10/2026: "Evaporadora na parede externa"): a evaporadora na parede externa, mesmo
   * sobre a janela, com o topo a `folgaDaEvaporadoraAoForroMm` do forro; a linha e o dreno saem juntos pela parede.
   */
  climatizacao: { lancar: boolean; naParedeExterna: boolean; folgaDaEvaporadoraAoForroMm: number };
  /** F13: como garantir a pressão nos pontos — caixa elevada até um limite, senão pressurizador. */
  pressao: HipotesesDaPressaoDaCasa;
  /**
   * F14a (decisão do usuário: "forro com faixas"): o afastamento lateral de cada rede em relação ao eixo das paredes
   * (e ao centro do shaft), mm — a água fria fica no eixo. Igual nas duas direções do quadro da frente.
   */
  faixas: { aguaQuenteMm: number; esgotoMm: number };
  /**
   * F14b (decisões do usuário: "forro com faixas", 15/10, e "manter 2,80 m, furar vigas", 16/10): o forro dos cômodos e
   * a faixa de cada rede no plenum acima dele. `lancar: false` = como até a F14a (as redes 10 cm sob a viga, sem forro).
   */
  forro: HipotesesDoForroDaCasa;
}

/** F14b — o forro e as faixas das redes no plenum. */
export interface HipotesesDoForroDaCasa {
  lancar: boolean;
  /** Pé-direito livre mínimo (do piso acabado à face do forro), mm: cômodos de permanência (sala, dormitório, suíte, cozinha, escritório) e os demais. */
  peDireitoLivrePermanenciaMm: number;
  peDireitoLivreDemaisMm: number;
  /** A espessura do piso acabado na conta do pé-direito livre (a casa não lança o piso), mm. */
  pisoAcabadoMm: number;
  /** O forro fica a esta folga abaixo do tubo mais baixo do plenum, mm. */
  folgaSobAFaixaMm: number;
  /** A descida até o ponto entra na parede a esta folga do fundo da viga, mm. */
  folgaSobAVigaMm: number;
  /** A faixa de cada rede: cota (abaixo da laje) e afastamento da face da parede ou da viga. */
  eletrica: FaixaDoForro;
  frigorigena: FaixaDoForro;
  aguaQuente: FaixaDoForro;
  aguaFria: FaixaDoForro;
}

/**
 * As faixas, de cima para baixo: eletroduto, linha frigorígena, água quente, água fria. Entre duas faixas, a soma dos
 * MAIORES raios das duas (a conferência de conflitos mede o tubo como esfera: a linha frigorígena, com os dois tubos
 * lado a lado, conta 39 mm) mais 5 mm; o eletroduto de 75 mm do quadro ainda passa sob a laje. Para dentro do cômodo,
 * cada uma ~60 mm além da anterior: a descida de uma não cruza o ramal da outra (afastamento ≥ soma dos raios). Com
 * pé-direito de 2,80 m, o forro fica a 2,55 m — o pé-direito livre de 2,50 m com 5 cm de piso.
 */
export const HIPOTESES_DO_FORRO_DA_CASA_PADRAO: HipotesesDoForroDaCasa = {
  lancar: true,
  peDireitoLivrePermanenciaMm: 2500,
  peDireitoLivreDemaisMm: 2300,
  pisoAcabadoMm: 50,
  folgaSobAFaixaMm: 15,
  folgaSobAVigaMm: 50,
  eletrica: { abaixoDoTetoMm: 45, afastamentoDaFaceMm: 50, degrauNaParedeMm: 0 },
  frigorigena: { abaixoDoTetoMm: 115, afastamentoDaFaceMm: 140, degrauNaParedeMm: 0 },
  // F14c: dentro da parede, abaixo da viga, cada rede no seu degrau — a elétrica logo abaixo, a fria 6 cm mais baixo,
  // a quente 12 cm (os dois raios e 2 cm entre cada par).
  aguaQuente: { abaixoDoTetoMm: 170, afastamentoDaFaceMm: 200, degrauNaParedeMm: 120 },
  aguaFria: { abaixoDoTetoMm: 202, afastamentoDaFaceMm: 250, degrauNaParedeMm: 60 },
};

export const FAIXAS_DO_FORRO = ['eletrica', 'frigorigena', 'aguaQuente', 'aguaFria'] as const;

/** O raio do tubo da faixa mais baixa (a água fria) na conta do rebaixo — DN 32 de PVC, o maior ramal da casa. */
export const RAIO_NO_PLENUM_MM = 16;

/**
 * F17 (decisão do usuário, "sobe pela fachada"): onde o alimentador da casa sobe quando o estudo não diz. Exportado na
 * correção 2 da F3: a água antiga relançada sem registro usa o mesmo (sob a caixa, cruzava o baldrame — +3 conflitos).
 */
export const SUBIDA_DO_ALIMENTADOR_DA_CASA = 'FACHADA' as const;

export const USOS_DE_PERMANENCIA = new Set(['SALA', 'COZINHA', 'DORMITORIO', 'SUITE', 'ESCRITORIO']);

/** F14b: o raio dos eletrodutos que sobem do quadro (o tronco chega a DN 75). */
export const SUBIDA_DO_QUADRO_MM = 37.5;

/** F13 (decisão do usuário, 15/10/2026: "escolher por caso"). */
export interface HipotesesDaPressaoDaCasa {
  /** Resolver a pressão (desligado = só a pendência, como antes). */
  resolver: boolean;
  /** Quanto a caixa d'água pode SUBIR além da posição dela (a base elevada / torre), mm; acima disso, pressurizador. */
  caixaElevadaAteMm: number;
  /** A potência do pressurizador (o ponto elétrico dele, ligação direta), W. */
  potenciaDoPressurizadorW: number;
}

export const HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO: HipotesesDaPressaoDaCasa = { resolver: true, caixaElevadaAteMm: 2000, potenciaDoPressurizadorW: 370 };

/** F9: as hipóteses da elétrica da casa. */
export interface HipotesesDaEletricaDaCasa {
  lancar: boolean;
  /** Uma luz de teto a cada tantos m² (null = uma por ambiente — a da norma). */
  areaPorLuminariaM2: number | null;
  /** A potência do chuveiro elétrico (a ligação direta no banheiro), W. */
  chuveiroEletricoVA: number;
  /** Lançar a entrada de serviço e o medidor na frente do lote, ligados ao quadro. */
  medidor: boolean;
  /**
   * S3 (20/10/2026): no sobrado, o trecho de parede do térreo com parede em cima (por onde a prumada do eletroduto sobe)
   * mais curto que aceita o quadro, mm. O cruzamento com uma parede perpendicular de cima (200 mm) não é parede para o
   * quadro: ele caía ali, dentro da porta do térreo, e a prumada subia pela janela do 1º recuado. Ausente = o padrão.
   */
  paredeMinimaDoQuadroMm?: number;
}

export const HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO: HipotesesDaEletricaDaCasa = {
  lancar: true,
  areaPorLuminariaM2: null,
  chuveiroEletricoVA: 5500,
  medidor: true,
  paredeMinimaDoQuadroMm: 600,
};

export const HIPOTESES_DA_CASA_PADRAO: HipotesesDaCasa = {
  pavimentos: 1,
  sobrado: HIPOTESES_DO_SOBRADO_PADRAO,
  programa: HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO,
  implantacao: {},
  terraplenagem: HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO,
  muro: HIPOTESES_DO_MURO_DA_CASA_PADRAO,
  gerador: {},
  sementes: [1, 2, 3, 4, 5, 6, 7, 8],
  estrutura: HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO,
  telhado: HIPOTESES_DO_TELHADO_PADRAO,
  ancoras: HIPOTESES_DAS_ANCORAS_PADRAO,
  mobiliario: { ...HIPOTESES_MOBILIARIO_PADRAO, lancar: true },
  // F14a: fria e quente da mesma louça lado a lado (15 cm, como o misturador).
  pontos: { ...HIPOTESES_PONTOS_PADRAO, afastamentoFriaQuenteMm: 150 },
  hidraulica: { lancar: true },
  eletrica: HIPOTESES_DA_ELETRICA_DA_CASA_PADRAO,
  climatizacao: { lancar: true, naParedeExterna: true, folgaDaEvaporadoraAoForroMm: 30 },
  pressao: HIPOTESES_DA_PRESSAO_DA_CASA_PADRAO,
  faixas: { aguaQuenteMm: 45, esgotoMm: -60 },
  forro: HIPOTESES_DO_FORRO_DA_CASA_PADRAO,
};

export interface PlanoDaCasa {
  levelId: ObjectId;
  /** O LOTE: aplicado no modelo original de uma vez, um Ctrl+Z. */
  comandos: Command[];
  /** Os ids que o lote cria, na ordem — para conferir a reaplicação. */
  criados: ObjectId[];
  etapas: EtapaDaCasa[];
  pendencias: PendenciaDoPpci[];
  /** O modelo DEPOIS do lote (a prévia). */
  resultado: BlueprintModel;
  programa: Programa;
  implantacao: ImplantacaoDaCasa | null;
  /** A alternativa do E6.2 escolhida (no quadro da frente). */
  semente: number | null;
  /** Por que esta semente: "2 de 4 sem problema grave; nota 71". */
  escolha: string | null;
  decisoes: string[];
  /** F12: o pavimento de cima, o núcleo e a escada; `null` na térrea. */
  sobrado: ResumoDoSobrado | null;
  resumo: {
    areaConstruidaM2: number | null;
    ambientesPedidos: number;
    ambientesAtendidos: number;
    regrasVioladas: number;
    /** F4: peças de estrutura lançadas. */
    estrutura: { eixos: number; pilares: number; vigas: number; lajes: number; blocos: number; estacas: number; baldrames: number };
    /** F5: a cobertura lançada; `null` sem telhado. */
    telhado: ResumoDoTelhado | null;
    /** F6: as peças-âncora postas; `null` quando a etapa não rodou. */
    ancoras: ResultadoDasAncoras['resumo'] | null;
    /** F7: peças de mobiliário e pontos hidráulicos lançados. */
    mobiliario: { pecas: number; pontosDasLoucas: number; pontosDoKit: number };
    /** F8: o que cada rede lançou (peças = terminais; tubos = trechos) e o destino do esgoto. */
    hidraulica: {
      agua: { pecas: number; tubos: number };
      esgoto: { pecas: number; tubos: number; destino: 'REDE_PUBLICA' | 'TRATAMENTO' };
      pluvial: { pecas: number; tubos: number };
      /** A verificação de rede do app sobre o resultado (`marcasDeVerificacao`), por tipo de marca. */
      verificacao: { erros: number; avisos: number; porTipo: Record<string, number> };
      /** Pontos com pressão disponível abaixo do mínimo (`pressoesDoModelo`), por rede. */
      pressaoInsuficiente: { fria: number; quente: number };
    };
    /** F9: a elétrica lançada e a conferência NBR 5410 sobre o resultado. */
    eletrica: ResumoDaEletricaDaCasa;
    /**
     * F9: as redes (água, esgoto, eletroduto, linha e dreno do ar) que passam por PORTA ou JANELA, por disciplina
     * (`conflitosDoModelo`, classe ABERTURA, com o eixo dentro do vão). Compatibilização entre redes e aberturas
     * é fase à parte; aqui ela fica à vista.
     */
    aberturas: Record<string, number>;
    /** F9: a climatização — as etapas do gerador de climatização e o que ele lançou. */
    climatizacao: { equipamentos: number; etapas: Record<string, SituacaoDaEtapa>; verificacao: { erros: number; avisos: number; porTipo: Record<string, number> } };
    /** F14b: o forro lançado — cômodos, rebaixo e o menor pé-direito livre; `null` sem forro. */
    forro: { comodos: number; rebaixoMm: number; peDireitoLivreMinimoMm: number | null } | null;
    /**
     * F14c: os FUROS PREVISTOS na estrutura (a lista para o calculista) — em viga, quantos dispensam a verificação
     * pelos critérios (NBR 6118, 13.2.5.1, hipóteses) e quantos ficam para verificar; em baldrame e em laje.
     */
    furos: { emViga: number; dispensa: number; verificar: number; emBaldrame: number; emLaje: number; lista: FuroPrevisto[] } | null;
    /** F25: o platô no terreno inclinado; `null` sem topografia (a casa na cota zero). */
    terraplenagem: ResumoDaTerraplenagem | null;
    /** F26: o muro, os portões e as calçadas; `null` sem muro (desligado ou não rodou). */
    muro?: PlanoDoMuroDaCasa['resumo'] | null;
  };
}

export const ESTRUTURA_ZERADA = { eixos: 0, pilares: 0, vigas: 0, lajes: 0, blocos: 0, estacas: 0, baldrames: 0 };

/** F12: o que o sobrado lançou além da térrea. */
export interface ResumoDoSobrado {
  nivelSuperiorId: ObjectId;
  nucleo: NucleoDaEscada;
  escada: { degraus: number; espelhoMm: number; pisoMm: number; blondelMm: number };
  /** O ambiente para o qual o núcleo abre em cada pavimento (`null` = sem porta — vira pendência). */
  portas: { terreo: string | null; superior: string | null };
  /**
   * F27-D2: na casa de 3 pavimentos, o 2º — o nível, o retângulo recuado (no quadro da casa), o ambiente para o qual o
   * núcleo abre e a área do terraço (a laje do 1º descoberta). Ausente/null = sobrado.
   */
  segundo?: { nivelId: ObjectId; retangulo: Retangulo; porta: string | null; terracoM2: number } | null;
  /** F27 item 5.3: o 1º recuado (o excedente do térreo é o terraço dele); ausente/null = o 1º na pegada do térreo. */
  primeiro?: { retangulo: Retangulo; terracoM2: number } | null;
}

/** F9: o resumo da elétrica. */
export interface ResumoDaEletricaDaCasa {
  pontos: { tomadas: number; luzes: number; interruptores: number; ligacoesDiretas: number };
  quadro: string | null;
  medidor: boolean;
  circuitos: number;
  drs: number;
  dps: boolean;
  /** A categoria do padrão de entrada pela demanda, e a ligação que ela dá ao quadro. */
  entrada: { categoria: string; ligacao: string; demandaKva: number } | null;
  eletrodutos: number;
  /** `conferirNbr5410` do pavimento: faltas e avisos, e por regra (código → contagem). */
  conferencia: { faltas: number; avisos: number; porRegra: Record<string, { faltas: number; avisos: number }> };
}

export const ELETRICA_ZERADA = (): ResumoDaEletricaDaCasa => ({
  pontos: { tomadas: 0, luzes: 0, interruptores: 0, ligacoesDiretas: 0 }, quadro: null, medidor: false, circuitos: 0, drs: 0, dps: false, entrada: null, eletrodutos: 0,
  conferencia: { faltas: 0, avisos: 0, porRegra: {} },
});

export const CLIMATIZACAO_ZERADA = (): PlanoDaCasa['resumo']['climatizacao'] => ({ equipamentos: 0, etapas: {}, verificacao: { erros: 0, avisos: 0, porTipo: {} } });

export const HIDRAULICA_ZERADA = (): PlanoDaCasa['resumo']['hidraulica'] => ({ agua: { pecas: 0, tubos: 0 }, esgoto: { pecas: 0, tubos: 0, destino: 'REDE_PUBLICA' }, pluvial: { pecas: 0, tubos: 0 }, verificacao: { erros: 0, avisos: 0, porTipo: {} }, pressaoInsuficiente: { fria: 0, quente: 0 } });

/** As marcas da verificação de rede ditas em português, pelo tipo (as demais saem com o texto da marca). */
export const MARCA_DA_REDE: Record<string, string> = {
  PONTA_ABERTA: 'ponta(s) aberta(s)',
  SEM_DESTINO: 'trecho(s) sem destino',
  CONTRAFLUXO: 'trecho(s) em contrafluxo',
  DECLIVIDADE_BAIXA: 'trecho(s) com declividade baixa',
  SEM_VENTILACAO: 'desconector(es) sem ventilação',
  ATRAVESSA_PILAR: 'trecho(s) atravessando pilar',
  // F14b ("furar vigas"): a travessia da viga no forro é furo previsto — a lista vai ao calculista na F14c.
  CRUZA_VIGA: 'travessia(s) de viga — furo a aprovar com o calculista (F14c)',
  DN_MENOR: 'trecho(s) com DN abaixo do necessário',
  CALHA_INSUFICIENTE: 'calha(s) insuficiente(s)',
  CONDUTOR_INSUFICIENTE: 'condutor(es) insuficiente(s)',
};

export const ROTULO_DA_DISCIPLINA_DA_REDE: Record<string, string> = { AGUA_FRIA: 'água fria', AGUA_QUENTE: 'água quente', ESGOTO: 'esgoto', PLUVIAL: 'pluvial' };

/** F9: as redes da climatização na mesma verificação. */
export const ROTULO_DA_DISCIPLINA_DO_AR: Record<string, string> = { FRIGORIGENA: 'linha frigorígena', DRENO_AC: 'dreno do ar-condicionado', MECANICA: 'dutos' };

/** F10: o aviso de progresso — cada etapa concluída, na ordem (a tela mostra "etapa N de M"). */
export interface OpcoesDoPlanoDaCasa {
  aoConcluirEtapa?: (e: EtapaDaCasa, indice: number, total: number) => void;
}
