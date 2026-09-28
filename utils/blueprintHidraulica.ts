/**
 * A FICHA de cada ponto HIDRÁULICO (18/09/2026: *"Hidráulica (MEP) estão
 * faltando componentes como: conexões, caixa d'água, ralo etc."*).
 *
 * UMA tabela para os seis lugares que precisam da mesma resposta: o menu de
 * inserir (grupo, rótulo), o símbolo no canvas (sigla), o inventário e o
 * quantitativo (grupo, contagem), o painel da peça (peso, UHC, DN mínimo) e o
 * lançamento automático (as fases seguintes: água pela NBR 5626, esgoto pela
 * NBR 8160). Quem cria um tipo novo em `TIPOS_DE_PONTO_HIDRAULICO` é obrigado
 * pelo `Record` a preencher a ficha — e o teste confere que nenhuma tabela
 * ficou para trás.
 *
 * Números de norma são de PRÉ-DIMENSIONAMENTO: pesos relativos da NBR 5626
 * (tabela A.1 da versão de 1998 / anexo da de 2020) e unidades Hunter de
 * contribuição da NBR 8160 (tabela 5). Servem para dar o diâmetro provável e
 * o quantitativo; o projeto executivo é do projetista.
 */
import type { BlueprintModel, DisciplinaDeRede, Point, Terminal, TipoDePontoHidraulico, Trecho } from './blueprintKernel';
import { DISCIPLINAS_DO_PONTO_HIDRAULICO, TIPOS_DE_PONTO_HIDRAULICO } from './blueprintKernel';
import { TOLERANCIA_ENCAIXE_MM } from './blueprintRede';

export type GrupoHidraulico =
  | 'Hidráulica — pontos de consumo'
  | 'Hidráulica — reservação'
  | 'Hidráulica — esgoto'
  | 'Hidráulica — registros e válvulas'
  | 'Hidráulica — conexões';

export interface FichaDoPontoHidraulico {
  rotulo: string;
  /** Texto curto, escrito ao lado do símbolo e na lista. */
  sigla: string;
  grupo: GrupoHidraulico;
  /** Cota usual, em mm do piso, por disciplina admitida. */
  cotaMm: Partial<Record<DisciplinaDeRede, number>>;
  /** DN mínimo do sub-ramal (água) e do ramal de descarga (esgoto), em mm. */
  dnMinimoMm: Partial<Record<DisciplinaDeRede, number>>;
  /** Peso relativo NBR 5626 (água). Ausente = não é ponto de consumo. */
  pesoNbr5626?: number;
  /** Unidades Hunter de contribuição NBR 8160 (esgoto). Ausente = não contribui. */
  uhcNbr8160?: number;
  /** Medidas padrão em planta/altura (mm) quando diferem do cubo de 100. */
  medidasMm?: { larguraMm: number; profundidadeMm: number; alturaMm: number };
  /** Volume padrão em litros — só o reservatório. */
  volumeL?: number;
  /** Peça que vive SOBRE um trecho (registro, válvula, hidrômetro, conexão manual). */
  sobreOTrecho?: boolean;
  /**
   * Pressão DINÂMICA mínima no ponto, kPa, quando o aparelho pede mais que a
   * regra geral da NBR 5626:2020 (10 kPa) — E1.3. Ausente = a regra geral.
   */
  pressaoMinimaKpa?: number;
  ajuda: string;
}

const CONSUMO: GrupoHidraulico = 'Hidráulica — pontos de consumo';
const RESERVA: GrupoHidraulico = 'Hidráulica — reservação';
const ESGOTO: GrupoHidraulico = 'Hidráulica — esgoto';
const REGISTROS: GrupoHidraulico = 'Hidráulica — registros e válvulas';
const CONEXOES: GrupoHidraulico = 'Hidráulica — conexões';

export const FICHA_DO_PONTO_HIDRAULICO: Record<TipoDePontoHidraulico, FichaDoPontoHidraulico> = {
  TORNEIRA: {
    rotulo: 'Torneira',
    sigla: 'TR',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    pesoNbr5626: 0.4,
    ajuda: 'Torneira de uso geral (área de serviço, garagem). Peso 0,4 na NBR 5626.',
  },
  TORNEIRA_JARDIM: {
    rotulo: 'Torneira de jardim',
    sigla: 'TJ',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 600 },
    dnMinimoMm: { AGUA_FRIA: 20 },
    pesoNbr5626: 0.4,
    ajuda: 'Torneira externa, só água fria. Peso 0,4.',
  },
  CHUVEIRO: {
    rotulo: 'Chuveiro',
    sigla: 'CH',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 2100, AGUA_QUENTE: 2100, ESGOTO: 0 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40 },
    pesoNbr5626: 0.4,
    uhcNbr8160: 2,
    ajuda: 'Ponto de água a 2,10 m; o esgoto do box vai por ralo/caixa sifonada. Peso 0,4 · 2 UHC.',
  },
  LAVATORIO: {
    rotulo: 'Lavatório',
    sigla: 'LV',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 600, AGUA_QUENTE: 600, ESGOTO: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40 },
    pesoNbr5626: 0.3,
    uhcNbr8160: 1,
    ajuda: 'Água a 0,60 m, esgoto a 0,50 m (sifão). Peso 0,3 · 1 UHC.',
  },
  PIA_COZINHA: {
    rotulo: 'Pia de cozinha',
    sigla: 'PIA',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100, ESGOTO: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 50 },
    pesoNbr5626: 0.7,
    uhcNbr8160: 3,
    ajuda: 'Água a 1,10 m, esgoto a 0,50 m — passa pela caixa de gordura. Peso 0,7 · 3 UHC.',
  },
  TANQUE: {
    rotulo: 'Tanque',
    sigla: 'TQ',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100, ESGOTO: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 50 },
    pesoNbr5626: 0.7,
    uhcNbr8160: 3,
    ajuda: 'Tanque da área de serviço. Peso 0,7 · 3 UHC.',
  },
  MAQUINA_LAVAR: {
    rotulo: 'Máquina de lavar',
    sigla: 'ML',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100, ESGOTO: 700 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 50 },
    pesoNbr5626: 1.0,
    uhcNbr8160: 3,
    ajuda: 'Ponto de máquina de lavar roupa/louça. Peso 1,0 · 3 UHC.',
  },
  VASO_SANITARIO: {
    rotulo: 'Vaso sanitário',
    sigla: 'VS',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 300, ESGOTO: 0 },
    dnMinimoMm: { AGUA_FRIA: 20, ESGOTO: 100 },
    pesoNbr5626: 0.3,
    uhcNbr8160: 6,
    ajuda: 'Com caixa acoplada: água a 0,30 m, saída de esgoto DN 100 no piso. Peso 0,3 · 6 UHC.',
  },
  DUCHA_HIGIENICA: {
    rotulo: 'Ducha higiênica',
    sigla: 'DH',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 500, AGUA_QUENTE: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    pesoNbr5626: 0.1,
    ajuda: 'Ao lado do vaso, a 0,50 m. Peso 0,1.',
  },
  // ── 28/09/2026 (E0.4): as peças que o benchmark AltoQi achou faltando ─────
  // Pesos: NBR 5626 (tabela de pesos relativos). UHC e DN de descarga: NBR 8160
  // (tabela de UHC por aparelho). Cotas: as usuais de projeto, editáveis.
  BIDE: {
    rotulo: 'Bidê',
    sigla: 'BD',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 250, AGUA_QUENTE: 250, ESGOTO: 0 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40 },
    pesoNbr5626: 0.1,
    uhcNbr8160: 1,
    ajuda: 'Bidê: água fria e quente a 0,25 m, descarga DN 40 no piso. Peso 0,1 · 1 UHC.',
  },
  BANHEIRA: {
    rotulo: 'Banheira',
    sigla: 'BH',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 550, AGUA_QUENTE: 550, ESGOTO: 0 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40 },
    pesoNbr5626: 1.0,
    uhcNbr8160: 2,
    ajuda: 'Banheira: misturador a 0,55 m, descarga DN 40. Peso 1,0 · 2 UHC.',
  },
  MICTORIO: {
    rotulo: 'Mictório',
    sigla: 'MC',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100, ESGOTO: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, ESGOTO: 40 },
    pesoNbr5626: 0.5,
    uhcNbr8160: 2,
    ajuda: 'Mictório com registro/descarga automática: água a 1,10 m, descarga DN 40 a 0,50 m. Peso 0,5 · 2 UHC (com válvula de descarga a NBR 8160 dá 6 — troque se for o caso).',
  },
  VALVULA_DESCARGA: {
    rotulo: 'Válvula de descarga',
    sigla: 'VD',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 1100 },
    dnMinimoMm: { AGUA_FRIA: 32 },
    pesoNbr5626: 32,
    // A válvula de descarga precisa de mais pressão que a regra geral: 20 kPa
    // (2 mca) é o mínimo usual dos fabricantes para a válvula de baixa pressão.
    pressaoMinimaKpa: 20,
    ajuda: 'Válvula de descarga da bacia SEM caixa acoplada: a 1,10 m, sub-ramal DN 32. Peso 32 na NBR 5626 — é ela que costuma mandar no diâmetro do ramal. O esgoto é o da bacia (vaso sanitário).',
  },
  PONTO_ESPERA: {
    rotulo: 'Ponto de espera',
    sigla: 'PE',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 600, AGUA_QUENTE: 600, ESGOTO: 0 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40 },
    pesoNbr5626: 0.3,
    uhcNbr8160: 1,
    ajuda: 'Ponto tampado para uso futuro (filtro, aparelho a definir). Entra na rede com a hipótese de um lavatório — peso 0,3 e 1 UHC — até se saber o aparelho.',
  },
  RESERVATORIO: {
    rotulo: "Caixa d'água",
    sigla: 'CX',
    grupo: RESERVA,
    // A cota é a do FUNDO da caixa: é de onde a rede sai.
    cotaMm: { AGUA_FRIA: 2800 },
    dnMinimoMm: { AGUA_FRIA: 25 },
    medidasMm: { larguraMm: 1200, profundidadeMm: 1200, alturaMm: 800 },
    volumeL: 1000,
    ajuda: "Reservatório superior. A cota é a do fundo; o volume, em litros, é o da caixa comercial. É de onde a água fria automática parte.",
  },
  BOMBA: {
    rotulo: 'Bomba / pressurizador',
    sigla: 'BB',
    grupo: RESERVA,
    cotaMm: { AGUA_FRIA: 300 },
    dnMinimoMm: { AGUA_FRIA: 25 },
    medidasMm: { larguraMm: 300, profundidadeMm: 200, alturaMm: 250 },
    ajuda: 'Bomba de recalque ou pressurizador. Não é dimensionada pelo lançamento automático.',
  },
  AQUECEDOR: {
    rotulo: 'Aquecedor',
    sigla: 'AQ',
    grupo: RESERVA,
    cotaMm: { AGUA_FRIA: 1600, AGUA_QUENTE: 1600 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 22 },
    medidasMm: { larguraMm: 400, profundidadeMm: 200, alturaMm: 600 },
    ajuda: 'Aquecedor de passagem ou acumulação: recebe água fria e é a origem da rede de água quente.',
  },
  TORNEIRA_BOIA: {
    rotulo: 'Torneira de boia',
    sigla: 'TB',
    grupo: RESERVA,
    cotaMm: { AGUA_FRIA: 3500 },
    dnMinimoMm: { AGUA_FRIA: 25 },
    ajuda: "Entrada da caixa d'água: fecha quando o nível sobe. Fica no alto da caixa (a cota usual supõe a caixa de 800 mm apoiada na laje a 2,80 m).",
  },
  RALO_SECO: {
    rotulo: 'Ralo seco',
    sigla: 'RS',
    grupo: ESGOTO,
    cotaMm: { ESGOTO: 0 },
    dnMinimoMm: { ESGOTO: 40 },
    uhcNbr8160: 1,
    medidasMm: { larguraMm: 100, profundidadeMm: 100, alturaMm: 60 },
    ajuda: 'Ralo sem fecho hídrico (área de serviço, varanda). 1 UHC.',
  },
  RALO_SIFONADO: {
    rotulo: 'Ralo sifonado',
    sigla: 'RSf',
    grupo: ESGOTO,
    cotaMm: { ESGOTO: 0 },
    dnMinimoMm: { ESGOTO: 50 },
    uhcNbr8160: 1,
    medidasMm: { larguraMm: 100, profundidadeMm: 100, alturaMm: 150 },
    ajuda: 'Ralo com fecho hídrico — recebe o chuveiro. 1 UHC.',
  },
  RALO_LINEAR: {
    rotulo: 'Ralo linear',
    sigla: 'RL',
    grupo: ESGOTO,
    cotaMm: { ESGOTO: 0 },
    dnMinimoMm: { ESGOTO: 50 },
    uhcNbr8160: 1,
    medidasMm: { larguraMm: 700, profundidadeMm: 70, alturaMm: 100 },
    ajuda: 'Ralo linear (com sifão) no box: recebe o chuveiro como a caixa sifonada. 1 UHC.',
  },
  CAIXA_SIFONADA: {
    rotulo: 'Caixa sifonada',
    sigla: 'CS',
    grupo: ESGOTO,
    cotaMm: { ESGOTO: 0 },
    dnMinimoMm: { ESGOTO: 50 },
    uhcNbr8160: 1,
    medidasMm: { larguraMm: 150, profundidadeMm: 150, alturaMm: 200 },
    ajuda: 'Coletor do banheiro: recebe lavatório, chuveiro e ralo e sai em DN 50 (o vaso vai direto). 1 UHC própria.',
  },
  CAIXA_INSPECAO: {
    rotulo: 'Caixa de inspeção',
    sigla: 'CI',
    grupo: ESGOTO,
    cotaMm: { ESGOTO: -600 },
    dnMinimoMm: { ESGOTO: 100 },
    medidasMm: { larguraMm: 600, profundidadeMm: 600, alturaMm: 600 },
    ajuda: 'Caixa enterrada onde os ramais se juntam antes do coletor. A cota é a do fundo. É o destino do esgoto automático.',
  },
  CAIXA_GORDURA: {
    rotulo: 'Caixa de gordura',
    sigla: 'CG',
    grupo: ESGOTO,
    cotaMm: { ESGOTO: -400 },
    dnMinimoMm: { ESGOTO: 75 },
    medidasMm: { larguraMm: 400, profundidadeMm: 400, alturaMm: 500 },
    ajuda: 'Recebe o esgoto da pia de cozinha antes da caixa de inspeção. A cota é a do fundo.',
  },
  REGISTRO_GAVETA: {
    rotulo: 'Registro de gaveta',
    sigla: 'RG',
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 1800, AGUA_QUENTE: 1800 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    sobreOTrecho: true,
    ajuda: 'Fecha o ramal do ambiente. Insere-se SOBRE um trecho de água — clique perto dele.',
  },
  REGISTRO_PRESSAO: {
    rotulo: 'Registro de pressão',
    sigla: 'RP',
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 1100, AGUA_QUENTE: 1100 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    sobreOTrecho: true,
    ajuda: 'O registro do chuveiro. Insere-se sobre um trecho de água.',
  },
  VALVULA_RETENCAO: {
    rotulo: 'Válvula de retenção',
    sigla: 'VR',
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 1800, AGUA_QUENTE: 1800 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15 },
    sobreOTrecho: true,
    ajuda: 'Impede o retorno. Insere-se sobre um trecho de água.',
  },
  REGISTRO_ESFERA: {
    rotulo: 'Registro de esfera',
    sigla: 'RE',
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Registro de esfera (abre/fecha em ¼ de volta) sobre o trecho — fica no DN dele.',
  },
  VRP: {
    rotulo: 'Válvula redutora de pressão',
    sigla: 'VRP',
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'VRP sobre o trecho: limita a pressão a jusante (NBR 5626: estática máxima 400 kPa). O cálculo de pressão entra na Etapa 1 do roadmap.',
  },
  HIDROMETRO: {
    rotulo: 'Hidrômetro',
    sigla: 'H',
    grupo: REGISTROS,
    cotaMm: { AGUA_FRIA: 600 },
    dnMinimoMm: { AGUA_FRIA: 20 },
    sobreOTrecho: true,
    medidasMm: { larguraMm: 200, profundidadeMm: 100, alturaMm: 100 },
    ajuda: 'Medidor na entrada. Insere-se sobre o trecho de alimentação.',
  },
  CONEXAO_JOELHO_90: {
    rotulo: 'Joelho 90°',
    sigla: 'J90',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força um joelho de 90° neste nó. As conexões dos encontros de trechos são contadas sozinhas — só lance à mão o que o desenho não deduz.',
  },
  CONEXAO_JOELHO_45: {
    rotulo: 'Joelho 45°',
    sigla: 'J45',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força um joelho de 45° neste nó.',
  },
  CONEXAO_TE: {
    rotulo: 'Tê',
    sigla: 'T',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força um tê neste nó.',
  },
  CONEXAO_LUVA: {
    rotulo: 'Luva',
    sigla: 'L',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força uma luva (emenda reta) neste ponto.',
  },
  CONEXAO_REDUCAO: {
    rotulo: 'Redução',
    sigla: 'R',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força uma redução (mudança de diâmetro) neste ponto.',
  },
};

export const ROTULO_DO_PONTO_HIDRAULICO = Object.fromEntries(
  TIPOS_DE_PONTO_HIDRAULICO.map((t) => [t, FICHA_DO_PONTO_HIDRAULICO[t].rotulo]),
) as Record<TipoDePontoHidraulico, string>;
export const SIGLA_DO_PONTO_HIDRAULICO = Object.fromEntries(
  TIPOS_DE_PONTO_HIDRAULICO.map((t) => [t, FICHA_DO_PONTO_HIDRAULICO[t].sigla]),
) as Record<TipoDePontoHidraulico, string>;
export const GRUPO_DO_PONTO_HIDRAULICO = Object.fromEntries(
  TIPOS_DE_PONTO_HIDRAULICO.map((t) => [t, FICHA_DO_PONTO_HIDRAULICO[t].grupo]),
) as Record<TipoDePontoHidraulico, GrupoHidraulico>;

/** O grupo do ponto hidráulico SEM classificação — visível, como "a classificar" elétrico. */
export const GRUPO_HIDRAULICO_A_CLASSIFICAR = 'Hidráulica — a classificar';

/** Os tipos que uma disciplina admite, na ordem da taxonomia. */
export function tiposHidraulicosDa(disciplina: DisciplinaDeRede): TipoDePontoHidraulico[] {
  return TIPOS_DE_PONTO_HIDRAULICO.filter((t) => DISCIPLINAS_DO_PONTO_HIDRAULICO[t].includes(disciplina));
}

export const ehRegistro = (t: TipoDePontoHidraulico | null | undefined) =>
  !!t && FICHA_DO_PONTO_HIDRAULICO[t].grupo === REGISTROS;
export const ehConexaoManual = (t: TipoDePontoHidraulico | null | undefined) => !!t && t.startsWith('CONEXAO_');
export const ehSobreOTrecho = (t: TipoDePontoHidraulico | null | undefined) =>
  !!t && !!FICHA_DO_PONTO_HIDRAULICO[t].sobreOTrecho;
export const ehPontoDeConsumo = (t: TipoDePontoHidraulico | null | undefined) =>
  !!t && FICHA_DO_PONTO_HIDRAULICO[t].grupo === CONSUMO;

/** A cota usual do tipo na disciplina, ou `null` quando a combinação não existe. */
export function cotaUsualDoPontoHidraulico(t: TipoDePontoHidraulico, disciplina: DisciplinaDeRede): number | null {
  return FICHA_DO_PONTO_HIDRAULICO[t].cotaMm[disciplina] ?? null;
}

/** A classificação legível de um terminal — hidráulica, elétrica ou o texto livre. */
export function classificacaoDoTerminal(t: Pick<Terminal, 'tipo' | 'tipoEletrico' | 'tipoHidraulico'>): string {
  if (t.tipoHidraulico) return t.tipoHidraulico;
  if (t.tipoEletrico) return t.tipoEletrico;
  return t.tipo;
}

/**
 * PROJETA um clique no trecho mais próximo da disciplina — é como registro,
 * válvula, hidrômetro e conexão manual acham o lugar deles.
 *
 * Devolve o ponto sobre o eixo (mm inteiros), a cota interpolada entre as duas
 * pontas (o registro de um esgoto com caimento fica na altura do cano ali) e o
 * trecho. `null` fora da tolerância: uma peça "sobre o trecho" longe de qualquer
 * trecho seria um símbolo solto que o quantitativo contaria como instalado.
 */
export function projetarNoTrecho(
  p: Point,
  trechos: readonly Trecho[],
  disciplina: DisciplinaDeRede,
  levelId: string | null,
  toleranciaMm = TOLERANCIA_ENCAIXE_MM,
): { ponto: Point; cotaMm: number; trecho: Trecho } | null {
  let melhor: { ponto: Point; cotaMm: number; trecho: Trecho; d: number } | null = null;
  for (const t of trechos) {
    if (t.disciplina !== disciplina) continue;
    if (levelId && t.levelId !== levelId) continue;
    const dx = t.b.x - t.a.x;
    const dy = t.b.y - t.a.y;
    const comp2 = dx * dx + dy * dy;
    // Prumada (a === b): o ponto é a própria posição; a cota fica a do meio.
    const u = comp2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - t.a.x) * dx + (p.y - t.a.y) * dy) / comp2));
    const ponto = { x: Math.round(t.a.x + u * dx), y: Math.round(t.a.y + u * dy) };
    const d = Math.hypot(p.x - ponto.x, p.y - ponto.y);
    if (d > toleranciaMm) continue;
    if (melhor && d >= melhor.d) continue;
    const cotaMm = comp2 === 0 ? Math.round((t.cotaAMm + t.cotaBMm) / 2) : Math.round(t.cotaAMm + u * (t.cotaBMm - t.cotaAMm));
    melhor = { ponto, cotaMm, trecho: t, d };
  }
  return melhor ? { ponto: melhor.ponto, cotaMm: melhor.cotaMm, trecho: melhor.trecho } : null;
}

/** Os terminais hidráulicos tipados do modelo (com filtro opcional de disciplina). */
export function terminaisHidraulicos(model: BlueprintModel, disciplina?: DisciplinaDeRede): Terminal[] {
  return (model.terminais ?? []).filter(
    (t) => t.tipoHidraulico != null && (!disciplina || t.disciplina === disciplina),
  );
}
