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
  | 'Hidráulica — águas pluviais'
  | 'Hidráulica — registros e válvulas'
  | 'Hidráulica — conexões'
  // Incêndio E1.1 (30/09/2026): a rede de combate.
  | 'Incêndio — hidrantes e chuveiros'
  | 'Incêndio — bombas e válvulas'
  // Incêndio E7.1 (01/10/2026): os preventivos — não ligam em tubo.
  | 'Incêndio — preventivos'
  // Climatização E3.1/E3.3 (04/10/2026): equipamentos (linha), dreno e terminais de ar (duto).
  | 'Climatização — equipamentos'
  | 'Climatização — dreno'
  | 'Climatização — terminais de ar';

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
  /** Fator K padrão do sprinkler, L/min/bar^½ (incêndio E1.1). `Terminal.fatorK` declarado vence. */
  fatorK?: number;
  ajuda: string;
}

const CONSUMO: GrupoHidraulico = 'Hidráulica — pontos de consumo';
const RESERVA: GrupoHidraulico = 'Hidráulica — reservação';
const ESGOTO: GrupoHidraulico = 'Hidráulica — esgoto';
const PLUVIAL: GrupoHidraulico = 'Hidráulica — águas pluviais';
const REGISTROS: GrupoHidraulico = 'Hidráulica — registros e válvulas';
const CONEXOES: GrupoHidraulico = 'Hidráulica — conexões';
const COMBATE: GrupoHidraulico = 'Incêndio — hidrantes e chuveiros';
const CASA_DE_BOMBAS: GrupoHidraulico = 'Incêndio — bombas e válvulas';
const PREVENTIVOS: GrupoHidraulico = 'Incêndio — preventivos';
const CLIMA_EQUIP: GrupoHidraulico = 'Climatização — equipamentos';
const CLIMA_DRENO: GrupoHidraulico = 'Climatização — dreno';
const CLIMA_AR: GrupoHidraulico = 'Climatização — terminais de ar';

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
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40, PLUVIAL: 75 },
    pesoNbr5626: 0.4,
    uhcNbr8160: 2,
    ajuda: 'Ponto de água a 2,10 m; o esgoto do box vai por ralo/caixa sifonada. Peso 0,4 · 2 UHC.',
  },
  LAVATORIO: {
    rotulo: 'Lavatório',
    sigla: 'LV',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 600, AGUA_QUENTE: 600, ESGOTO: 500 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40, PLUVIAL: 75 },
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
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40, PLUVIAL: 75 },
    pesoNbr5626: 0.1,
    uhcNbr8160: 1,
    ajuda: 'Bidê: água fria e quente a 0,25 m, descarga DN 40 no piso. Peso 0,1 · 1 UHC.',
  },
  BANHEIRA: {
    rotulo: 'Banheira',
    sigla: 'BH',
    grupo: CONSUMO,
    cotaMm: { AGUA_FRIA: 550, AGUA_QUENTE: 550, ESGOTO: 0 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40, PLUVIAL: 75 },
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
    cotaMm: { AGUA_FRIA: 600, AGUA_QUENTE: 600, ESGOTO: 0, PLUVIAL: 0, INCENDIO: 1300 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, ESGOTO: 40, PLUVIAL: 75, INCENDIO: 65 },
    pesoNbr5626: 0.3,
    uhcNbr8160: 1,
    ajuda: 'Ponto tampado para uso futuro (filtro, aparelho a definir). Entra na rede com a hipótese de um lavatório — peso 0,3 e 1 UHC — até se saber o aparelho.',
  },
  RESERVATORIO: {
    rotulo: "Caixa d'água",
    sigla: 'CX',
    grupo: RESERVA,
    // A cota é a do FUNDO da caixa: é de onde a rede sai.
    // Incêndio E3.2: a caixa SÓ de incêndio também — o fundo dela é a fonte por gravidade.
    cotaMm: { AGUA_FRIA: 2800, INCENDIO: 2800 },
    dnMinimoMm: { AGUA_FRIA: 25, INCENDIO: 65 },
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
  LIGACAO_ESGOTO: {
    rotulo: 'Ligação à rede pública',
    sigla: 'LR',
    grupo: ESGOTO,
    // A cota é a da GERATRIZ INFERIOR do coletor público no ponto de ligação.
    cotaMm: { ESGOTO: -1500 },
    dnMinimoMm: { ESGOTO: 100 },
    medidasMm: { larguraMm: 300, profundidadeMm: 300, alturaMm: 300 },
    ajuda: 'Onde o coletor predial encontra a rede pública, no limite do lote. A cota é a da rede (geratriz inferior): é ela que diz se o esgoto chega por gravidade.',
  },
  RALO_PLUVIAL: {
    rotulo: 'Ralo pluvial',
    sigla: 'RP',
    grupo: PLUVIAL,
    cotaMm: { PLUVIAL: 0 },
    dnMinimoMm: { PLUVIAL: 75 },
    medidasMm: { larguraMm: 150, profundidadeMm: 150, alturaMm: 150 },
    ajuda: 'Ralo de águas pluviais — no piso descoberto (grelha) ou no fundo da calha (bocal com ralo hemisférico). Rede independente do esgoto (NBR 10844).',
  },
  CAIXA_AREIA: {
    rotulo: 'Caixa de areia',
    sigla: 'CA',
    grupo: PLUVIAL,
    cotaMm: { PLUVIAL: -600 },
    dnMinimoMm: { PLUVIAL: 100 },
    medidasMm: { larguraMm: 600, profundidadeMm: 600, alturaMm: 600 },
    ajuda: 'Caixa enterrada da rede pluvial: junta os condutores e retém a areia antes da saída. A cota é a do fundo.',
  },
  LIGACAO_PLUVIAL: {
    rotulo: 'Saída pluvial (sarjeta ou rede)',
    sigla: 'SP',
    grupo: PLUVIAL,
    // A cota é a da saída: sob a calçada para a sarjeta, ou a geratriz da galeria pluvial.
    cotaMm: { PLUVIAL: -300 },
    dnMinimoMm: { PLUVIAL: 100 },
    medidasMm: { larguraMm: 300, profundidadeMm: 300, alturaMm: 300 },
    ajuda: 'Onde a água da chuva deixa o lote — na sarjeta, sob a calçada, ou na galeria pluvial. Nunca na rede de esgoto.',
  },
  TANQUE_SEPTICO: {
    rotulo: 'Tanque séptico',
    sigla: 'TS',
    grupo: ESGOTO,
    // A cota é a do TUBO (entrada e saída); a tampa fica 40 cm acima dela.
    cotaMm: { ESGOTO: -800 },
    dnMinimoMm: { ESGOTO: 100 },
    medidasMm: { larguraMm: 1200, profundidadeMm: 2400, alturaMm: 1800 },
    ajuda: 'Tratamento primário do esgoto onde não há rede pública (NBR 7229). A cota é a do tubo de entrada e de saída. Volume pela NBR 7229 na gaveta de esgoto.',
  },
  FILTRO_ANAEROBIO: {
    rotulo: 'Filtro anaeróbio',
    sigla: 'FA',
    grupo: ESGOTO,
    cotaMm: { ESGOTO: -900 },
    dnMinimoMm: { ESGOTO: 100 },
    medidasMm: { larguraMm: 1500, profundidadeMm: 1500, alturaMm: 1800 },
    ajuda: 'Tratamento complementar do efluente do tanque séptico (NBR 13969), antes do sumidouro. A cota é a do tubo.',
  },
  SUMIDOURO: {
    rotulo: 'Sumidouro',
    sigla: 'SU',
    grupo: ESGOTO,
    cotaMm: { ESGOTO: -1000 },
    dnMinimoMm: { ESGOTO: 100 },
    medidasMm: { larguraMm: 1500, profundidadeMm: 1500, alturaMm: 3000 },
    ajuda: 'Infiltração do efluente tratado no solo (NBR 13969) — o destino final do esgoto sem rede pública. A cota é a do tubo de entrada.',
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
    cotaMm: { AGUA_FRIA: 1800, AGUA_QUENTE: 1800, INCENDIO: 2600 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, INCENDIO: 65 },
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
    cotaMm: { AGUA_FRIA: 1800, AGUA_QUENTE: 1800, INCENDIO: 2600 },
    dnMinimoMm: { AGUA_FRIA: 20, AGUA_QUENTE: 15, INCENDIO: 65 },
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
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150, PLUVIAL: -300, INCENDIO: 2600 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força um joelho de 90° neste nó. As conexões dos encontros de trechos são contadas sozinhas — só lance à mão o que o desenho não deduz.',
  },
  CONEXAO_JOELHO_45: {
    rotulo: 'Joelho 45°',
    sigla: 'J45',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150, PLUVIAL: -300, INCENDIO: 2600 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força um joelho de 45° neste nó.',
  },
  CONEXAO_TE: {
    rotulo: 'Tê',
    sigla: 'T',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150, PLUVIAL: -300, INCENDIO: 2600 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força um tê neste nó.',
  },
  CONEXAO_LUVA: {
    rotulo: 'Luva',
    sigla: 'L',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150, PLUVIAL: -300, INCENDIO: 2600 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força uma luva (emenda reta) neste ponto.',
  },
  CONEXAO_REDUCAO: {
    rotulo: 'Redução',
    sigla: 'R',
    grupo: CONEXOES,
    cotaMm: { AGUA_FRIA: 2200, AGUA_QUENTE: 2200, ESGOTO: -150, PLUVIAL: -300, INCENDIO: 2600 },
    dnMinimoMm: {},
    sobreOTrecho: true,
    ajuda: 'Força uma redução (mudança de diâmetro) neste ponto.',
  },
  // ─── INCÊNDIO (30/09/2026, E1.1 do roadmap de incêndio) ───────────────────
  // Cotas, DN e medidas são PONTOS DE PARTIDA usuais (abrigo comercial, válvula
  // na altura de manobra), não norma: os limites da NBR 13714/10897 e da IT do
  // CBMMG entram na E2/E3/E5 com a fonte — CONFERIR NA NORMA.
  HIDRANTE_SIMPLES: {
    rotulo: 'Hidrante simples',
    sigla: 'H',
    grupo: COMBATE,
    cotaMm: { INCENDIO: 1300 },
    dnMinimoMm: { INCENDIO: 65 },
    medidasMm: { larguraMm: 900, profundidadeMm: 170, alturaMm: 600 },
    ajuda: 'Abrigo com uma válvula angular, mangueira e esguicho. A cota é a da válvula (altura de manobra); as medidas são as do abrigo.',
  },
  HIDRANTE_DUPLO: {
    rotulo: 'Hidrante duplo',
    sigla: 'HD',
    grupo: COMBATE,
    cotaMm: { INCENDIO: 1300 },
    dnMinimoMm: { INCENDIO: 65 },
    medidasMm: { larguraMm: 900, profundidadeMm: 250, alturaMm: 900 },
    ajuda: 'Abrigo com duas saídas (duas válvulas e duas linhas de mangueira).',
  },
  MANGOTINHO: {
    rotulo: 'Mangotinho',
    sigla: 'MG',
    grupo: COMBATE,
    cotaMm: { INCENDIO: 1300 },
    dnMinimoMm: { INCENDIO: 25 },
    medidasMm: { larguraMm: 700, profundidadeMm: 250, alturaMm: 700 },
    ajuda: 'Mangueira semirrígida em carretel, sempre conectada à rede — operável por uma pessoa.',
  },
  HIDRANTE_RECALQUE: {
    rotulo: 'Registro de recalque (passeio)',
    sigla: 'RR',
    grupo: COMBATE,
    // Caixa no passeio, com a tampa no nível do piso; a cota é a da conexão.
    cotaMm: { INCENDIO: -300 },
    dnMinimoMm: { INCENDIO: 65 },
    medidasMm: { larguraMm: 400, profundidadeMm: 600, alturaMm: 400 },
    ajuda: 'Por onde o caminhão do Corpo de Bombeiros alimenta a rede: caixa no passeio ou registro na fachada.',
  },
  SPRINKLER: {
    rotulo: 'Chuveiro automático (sprinkler)',
    sigla: 'SPK',
    grupo: COMBATE,
    cotaMm: { INCENDIO: 2700 },
    dnMinimoMm: { INCENDIO: 15 },
    medidasMm: { larguraMm: 80, profundidadeMm: 80, alturaMm: 80 },
    fatorK: 80,
    ajuda: 'Chuveiro automático: abre sozinho no calor do fogo. O fator K (padrão 80 L/min/bar^½, rosca ½") liga vazão e pressão — Q = K·√P; a posição padrão é pendente.',
  },
  VGA: {
    rotulo: 'Válvula de governo e alarme (VGA)',
    sigla: 'VGA',
    grupo: CASA_DE_BOMBAS,
    cotaMm: { INCENDIO: 1200 },
    dnMinimoMm: { INCENDIO: 100 },
    medidasMm: { larguraMm: 400, profundidadeMm: 400, alturaMm: 800 },
    ajuda: 'Controla e anuncia a abertura da rede de sprinklers: todo sprinkler a jusante dela pertence a ela.',
  },
  CHAVE_FLUXO: {
    rotulo: 'Chave de fluxo',
    sigla: 'CF',
    grupo: CASA_DE_BOMBAS,
    cotaMm: { INCENDIO: 2600 },
    dnMinimoMm: { INCENDIO: 50 },
    sobreOTrecho: true,
    ajuda: 'Sinaliza água correndo no trecho (setor de sprinklers aberto). Insere-se sobre um trecho de incêndio.',
  },
  BOMBA_INCENDIO: {
    rotulo: 'Bomba de incêndio (principal)',
    sigla: 'BI',
    grupo: CASA_DE_BOMBAS,
    cotaMm: { INCENDIO: 300 },
    dnMinimoMm: { INCENDIO: 65 },
    medidasMm: { larguraMm: 1000, profundidadeMm: 500, alturaMm: 600 },
    ajuda: 'A bomba principal da rede de incêndio. A escolha pela curva (vazão × altura manométrica) vem na E4 do roadmap.',
  },
  BOMBA_JOCKEY: {
    rotulo: 'Bomba jockey',
    sigla: 'BJ',
    grupo: CASA_DE_BOMBAS,
    cotaMm: { INCENDIO: 300 },
    dnMinimoMm: { INCENDIO: 25 },
    medidasMm: { larguraMm: 500, profundidadeMm: 300, alturaMm: 400 },
    ajuda: 'Bomba pequena que mantém a rede pressurizada e evita a partida da principal por vazamento.',
  },
  PRESSOSTATO: {
    rotulo: 'Pressostato',
    sigla: 'PS',
    grupo: CASA_DE_BOMBAS,
    cotaMm: { INCENDIO: 300 },
    dnMinimoMm: { INCENDIO: 15 },
    sobreOTrecho: true,
    ajuda: 'Liga a bomba quando a pressão da rede cai. Insere-se sobre um trecho de incêndio, junto às bombas.',
  },
  EXTINTOR: {
    rotulo: 'Extintor',
    sigla: 'EXT',
    grupo: PREVENTIVOS,
    // A cota é a da ALÇA — até 1,60 m do piso (CONFERIR NA IT).
    cotaMm: { INCENDIO: 1600 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 200, profundidadeMm: 200, alturaMm: 600 },
    ajuda: 'Extintor portátil: o agente (água, espuma, pó BC/ABC, CO₂), a carga e a capacidade extintora ficam no painel da peça. Não liga em tubo; a distância a percorrer até ele é conferida na tarefa Incêndio.',
  },
  PLACA: {
    rotulo: 'Placa de sinalização',
    sigla: 'PL',
    grupo: PREVENTIVOS,
    // A base da placa a 1,80 m do piso (CONFERIR NA IT de sinalização).
    cotaMm: { INCENDIO: 1800 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 300, profundidadeMm: 20, alturaMm: 200 },
    ajuda: 'Placa de sinalização (NBR 13434): de equipamento (aponta para o extintor ou o hidrante dela) ou de rota de fuga (a direção é a rotação da peça). O código fica no painel da peça.',
  },
  LUMINARIA_EMERGENCIA: {
    rotulo: 'Luminária de emergência',
    sigla: 'LE',
    grupo: PREVENTIVOS,
    // Acima das portas e ao longo da rota — CONFERIR NA NBR 10898.
    cotaMm: { INCENDIO: 2200 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 300, profundidadeMm: 60, alturaMm: 100 },
    ajuda: 'Bloco autônomo de iluminação de emergência (NBR 10898): ao longo da rota de fuga, nas mudanças de direção, escadas e saídas. A autonomia (padrão 60 min) fica no painel da peça.',
  },
  // E7.4 (01/10/2026): detecção e alarme — alturas CONFERIR NA NBR 17240.
  DETECTOR_FUMACA: {
    rotulo: 'Detector de fumaça',
    sigla: 'DF',
    grupo: PREVENTIVOS,
    cotaMm: { INCENDIO: 2700 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 100, profundidadeMm: 100, alturaMm: 60 },
    ajuda: 'Detector pontual de fumaça, no teto. Entra no laço de uma central (painel da peça); a cobertura é conferida na tarefa Incêndio.',
  },
  // Fase F (pós-roadmap, 0.89.0): o detector de chama — óptico, na parede, olhando para o risco.
  DETECTOR_CHAMA: {
    rotulo: 'Detector de chama',
    sigla: 'DC',
    grupo: PREVENTIVOS,
    cotaMm: { INCENDIO: 2500 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 120, profundidadeMm: 100, alturaMm: 120 },
    ajuda: 'Detector óptico de chama (depósito de inflamáveis, gerador, casa de máquinas com combustível): vê um CONE à frente — a rotação da peça é a direção. Alcance e abertura CONFERIR NA NBR 17240 / fabricante.',
  },
  // Fase F (pós-roadmap, 0.89.0): o manômetro — no kit da VGA (montante e jusante) e na casa de bombas.
  MANOMETRO: {
    rotulo: 'Manômetro',
    sigla: 'MN',
    grupo: CASA_DE_BOMBAS,
    cotaMm: { INCENDIO: 1500 },
    dnMinimoMm: { INCENDIO: 15 },
    sobreOTrecho: true,
    ajuda: 'Mostra a pressão no trecho (antes e depois da VGA, no barrilete das bombas). Insere-se sobre um trecho de incêndio.',
  },
  DETECTOR_TEMPERATURA: {
    rotulo: 'Detector de temperatura',
    sigla: 'DT',
    grupo: PREVENTIVOS,
    cotaMm: { INCENDIO: 2700 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 100, profundidadeMm: 100, alturaMm: 60 },
    ajuda: 'Detector pontual de temperatura (cozinha, garagem — onde a fumaça normal dispararia o de fumaça). Cobre menos área que o de fumaça.',
  },
  ACIONADOR_MANUAL: {
    rotulo: 'Acionador manual',
    sigla: 'AM',
    grupo: PREVENTIVOS,
    cotaMm: { INCENDIO: 1200 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 100, profundidadeMm: 50, alturaMm: 100 },
    ajuda: 'Botoeira de alarme, à altura da mão, junto às saídas e ao longo da rota. A distância a percorrer até um é conferida na tarefa Incêndio.',
  },
  AVISADOR: {
    rotulo: 'Avisador sonoro e visual',
    sigla: 'AV',
    grupo: PREVENTIVOS,
    cotaMm: { INCENDIO: 2200 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 120, profundidadeMm: 60, alturaMm: 120 },
    ajuda: 'Sirene com flash: ao menos um por pavimento, no laço da central.',
  },
  CENTRAL_ALARME: {
    rotulo: 'Central de alarme',
    sigla: 'CA',
    grupo: PREVENTIVOS,
    cotaMm: { INCENDIO: 1500 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 400, profundidadeMm: 120, alturaMm: 400 },
    ajuda: 'A central do sistema de detecção e alarme: os detectores, acionadores e avisadores apontam para ela (o laço).',
  },
  PREVENTIVO_PERSONALIZADO: {
    rotulo: 'Preventivo personalizado',
    sigla: 'PP',
    grupo: PREVENTIVOS,
    cotaMm: { INCENDIO: 1500 },
    dnMinimoMm: {},
    medidasMm: { larguraMm: 400, profundidadeMm: 400, alturaMm: 400 },
    ajuda: 'Equipamento de incêndio fora da lista (ventilador de pressurização da escada, motor, damper…). Nome e item comercial vêm do cadastro de tipos.',
  },
  // ─── CLIMATIZAÇÃO (04/10/2026, E3.1/E3.3 do roadmap, kernel 0.92.0) ─────────
  // Medidas e cotas são as da reserva de espaço da E11.1 (a peça herda o lugar);
  // a CAPACIDADE é declarada por instância (`Terminal.capacidadeBtuH`) — a E4 a
  // sugere pela carga térmica. DN mínimo da linha = líquido 6 mm (1/4").
  EVAPORADORA_HI_WALL: { rotulo: 'Evaporadora hi-wall', sigla: 'EV', grupo: CLIMA_EQUIP, cotaMm: { FRIGORIGENA: 2200 }, dnMinimoMm: { FRIGORIGENA: 6 }, medidasMm: { larguraMm: 900, profundidadeMm: 220, alturaMm: 300 }, ajuda: 'Unidade interna de parede, a 2,20 m; liga à condensadora pela linha frigorígena e ao dreno. A capacidade (BTU/h) se declara no painel ou vem da carga térmica (E4).' },
  EVAPORADORA_PISO_TETO: { rotulo: 'Evaporadora piso-teto', sigla: 'EV', grupo: CLIMA_EQUIP, cotaMm: { FRIGORIGENA: 2300 }, dnMinimoMm: { FRIGORIGENA: 6 }, medidasMm: { larguraMm: 1200, profundidadeMm: 650, alturaMm: 240 }, ajuda: 'Unidade interna junto ao teto ou ao piso, para salões maiores.' },
  EVAPORADORA_CASSETE: { rotulo: 'Evaporadora cassete', sigla: 'EV', grupo: CLIMA_EQUIP, cotaMm: { FRIGORIGENA: 2600 }, dnMinimoMm: { FRIGORIGENA: 6 }, medidasMm: { larguraMm: 840, profundidadeMm: 840, alturaMm: 250 }, ajuda: 'Unidade interna embutida no forro, com insuflamento em quatro vias.' },
  EVAPORADORA_DUTADA: { rotulo: 'Evaporadora dutada', sigla: 'EV', grupo: CLIMA_EQUIP, cotaMm: { FRIGORIGENA: 2600, MECANICA: 2600 }, dnMinimoMm: { FRIGORIGENA: 6, MECANICA: 200 }, medidasMm: { larguraMm: 1100, profundidadeMm: 700, alturaMm: 280 }, ajuda: 'Unidade interna no forro, que insufla por dutos e difusores (E7).' },
  CONDENSADORA_SPLIT: { rotulo: 'Condensadora (split)', sigla: 'CD', grupo: CLIMA_EQUIP, cotaMm: { FRIGORIGENA: 0 }, dnMinimoMm: { FRIGORIGENA: 6 }, medidasMm: { larguraMm: 850, profundidadeMm: 330, alturaMm: 700 }, ajuda: 'Unidade externa de um split; fica na fachada ou na área técnica, com folga de ar. Capacidade = a da evaporadora que serve.' },
  CONDENSADORA_VRF: { rotulo: 'Condensadora VRF', sigla: 'CD', grupo: CLIMA_EQUIP, cotaMm: { FRIGORIGENA: 0 }, dnMinimoMm: { FRIGORIGENA: 10 }, medidasMm: { larguraMm: 1240, profundidadeMm: 760, alturaMm: 1700 }, ajuda: 'Unidade externa de fluxo de refrigerante variável, que serve várias evaporadoras pelos derivadores (E6).' },
  DERIVADOR_VRF: { rotulo: 'Derivador VRF', sigla: 'DV', grupo: CLIMA_EQUIP, cotaMm: { FRIGORIGENA: 2500 }, dnMinimoMm: { FRIGORIGENA: 6 }, sobreOTrecho: true, ajuda: 'A derivação (refnet) da linha do VRF para um ramo; sobre o trecho.' },
  EXAUSTOR_AR: { rotulo: 'Exaustor', sigla: 'EX', grupo: CLIMA_AR, cotaMm: { MECANICA: 2300 }, dnMinimoMm: { MECANICA: 100 }, medidasMm: { larguraMm: 400, profundidadeMm: 400, alturaMm: 400 }, ajuda: 'Exaustor de banheiro, cozinha ou garagem; a vazão e a renovação de ar entram na E7.' },
  BOMBA_DRENO: { rotulo: 'Bomba de dreno', sigla: 'BD', grupo: CLIMA_DRENO, cotaMm: { DRENO_AC: 2100 }, dnMinimoMm: { DRENO_AC: 20 }, medidasMm: { larguraMm: 200, profundidadeMm: 100, alturaMm: 100 }, ajuda: 'Quando o condensado não escoa por gravidade: a bomba junto da evaporadora, recalcando ao ponto de descarte (E5.4).' },
  PONTO_DRENO: { rotulo: 'Ponto de dreno', sigla: 'PD', grupo: CLIMA_DRENO, cotaMm: { DRENO_AC: 0 }, dnMinimoMm: { DRENO_AC: 25 }, ajuda: 'Onde o condensado é descartado: ralo, caixa sifonada, esgoto ou a fachada.' },
  CAIXA_DISTRIBUICAO_AR: { rotulo: 'Caixa de distribuição de ar', sigla: 'CX', grupo: CLIMA_AR, cotaMm: { MECANICA: 2600 }, dnMinimoMm: { MECANICA: 200 }, medidasMm: { larguraMm: 600, profundidadeMm: 600, alturaMm: 300 }, ajuda: 'A caixa que recebe o duto principal e distribui aos ramais.' },
  DIFUSOR: { rotulo: 'Difusor', sigla: 'DF', grupo: CLIMA_AR, cotaMm: { MECANICA: 2600 }, dnMinimoMm: { MECANICA: 150 }, medidasMm: { larguraMm: 300, profundidadeMm: 300, alturaMm: 50 }, ajuda: 'Insuflamento no forro (quadrado, de 1 a 4 vias). A vazão por terminal entra na E7.' },
  GRELHA_INSUFLAMENTO: { rotulo: 'Grelha de insuflamento', sigla: 'GI', grupo: CLIMA_AR, cotaMm: { MECANICA: 2400 }, dnMinimoMm: { MECANICA: 150 }, medidasMm: { larguraMm: 400, profundidadeMm: 50, alturaMm: 200 }, ajuda: 'Insuflamento na parede, com aletas.' },
  GRELHA_RETORNO: { rotulo: 'Grelha de retorno', sigla: 'GR', grupo: CLIMA_AR, cotaMm: { MECANICA: 2400 }, dnMinimoMm: { MECANICA: 200 }, medidasMm: { larguraMm: 500, profundidadeMm: 50, alturaMm: 300 }, ajuda: 'O ar que volta ao equipamento.' },
  BOCAL_AR: { rotulo: 'Bocal de insuflamento', sigla: 'BC', grupo: CLIMA_AR, cotaMm: { MECANICA: 2600 }, dnMinimoMm: { MECANICA: 150 }, medidasMm: { larguraMm: 200, profundidadeMm: 200, alturaMm: 100 }, ajuda: 'Jato de longo alcance, para pé-direito alto.' },
  TOMADA_AR_EXTERIOR: { rotulo: 'Tomada de ar exterior', sigla: 'TA', grupo: CLIMA_AR, cotaMm: { MECANICA: 2400 }, dnMinimoMm: { MECANICA: 150 }, medidasMm: { larguraMm: 400, profundidadeMm: 50, alturaMm: 300 }, ajuda: 'A renovação de ar (NBR 16401-3) entra por aqui — vazão na E7.3.' },
  VENEZIANA_AR: { rotulo: 'Veneziana', sigla: 'VN', grupo: CLIMA_AR, cotaMm: { MECANICA: 2400 }, dnMinimoMm: { MECANICA: 150 }, medidasMm: { larguraMm: 400, profundidadeMm: 50, alturaMm: 300 }, ajuda: 'Veneziana de exaustão ou de tomada de ar na fachada.' },
  CAIXA_PLENUM: { rotulo: 'Caixa plenum', sigla: 'PL', grupo: CLIMA_AR, cotaMm: { MECANICA: 2600 }, dnMinimoMm: { MECANICA: 200 }, medidasMm: { larguraMm: 400, profundidadeMm: 400, alturaMm: 300 }, ajuda: 'A caixa atrás do difusor, onde o duto flexível chega.' },
  DAMPER: { rotulo: 'Damper', sigla: 'DP', grupo: CLIMA_AR, cotaMm: { MECANICA: 2600 }, dnMinimoMm: { MECANICA: 150 }, sobreOTrecho: true, ajuda: 'Registro de vazão ou corta-fogo no duto; sobre o trecho.' },
  EQUIPAMENTO_CLIMATIZACAO: { rotulo: 'Equipamento de climatização personalizado', sigla: 'EQ', grupo: CLIMA_EQUIP, cotaMm: { FRIGORIGENA: 1500, DRENO_AC: 1500, MECANICA: 1500 }, dnMinimoMm: {}, medidasMm: { larguraMm: 600, profundidadeMm: 600, alturaMm: 600 }, ajuda: 'O que a lista não tem (cortina de ar, umidificador, trocador…). Nome e item comercial vêm do cadastro de tipos; a capacidade se declara.' },
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

/**
 * O grupo do ponto NA DISCIPLINA (incêndio E3.2): o tipo de água que também vale
 * na rede de incêndio (a caixa, a espera) vai para o grupo de incêndio quando é
 * de incêndio — no menu e no inventário, pela mesma regra. Registro e conexão
 * (sobre o trecho) ficam no grupo da ficha.
 */
export function grupoDoPontoNaDisciplina(t: TipoDePontoHidraulico, d: DisciplinaDeRede): GrupoHidraulico {
  const f = FICHA_DO_PONTO_HIDRAULICO[t];
  // A peça SOBRE O TRECHO tem um item só: a disciplina vem do tubo, o grupo é o da ficha.
  if (f.sobreOTrecho) return f.grupo;
  return d === 'INCENDIO' && !f.grupo.startsWith('Incêndio') ? 'Incêndio — bombas e válvulas' : f.grupo;
}

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
