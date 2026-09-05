/**
 * Modelo canônico do kernel — as entidades do PRD §12.1.
 *
 * Regra estrutural: IDs são atribuídos por um contador determinístico do próprio
 * modelo, NUNCA por `crypto.randomUUID()`. Um UUID aleatório mudaria o payload
 * canônico a cada execução e tornaria o critério do Spike A (igualdade bit a bit)
 * impossível de satisfazer por construção.
 *
 * ─── `id` × `uid` (04/09/2026) ──────────────────────────────────────────────
 *
 * A regra acima vale para o `id`, e continua valendo. O `uid` é OUTRA coisa:
 * um UUID que nasce na criação e sobrevive a autosave, publish e reload — a
 * identidade pela qual o mundo de fora (IFC, cronograma, ferragem, comentário)
 * conhece a peça. Ele PODE ser aleatório porque fica FORA do hash do snapshot
 * (`canonical.ts`, seção `identity`): dois desenhos iguais com uids diferentes
 * são o mesmo desenho. Ver `identity.ts` para o porquê e para o que acontece
 * com snapshot gravado antes dele existir.
 *
 * Quem cria elemento novo chama `novoUid()`; quem COPIA (duplicar nível, colar,
 * dividir parede) dá uid novo à cópia — dois elementos com o mesmo uid é
 * `DUPLICATE_UID` nos invariantes. Nenhum comando aceita `uid` como argumento.
 */

import { DEFAULT_TOLERANCE_MM, KernelError, assertIntegerMm, roundToMm } from './units';
import { EH_UID, type ElementUid } from './identity';
import {
  cantoEntreEixos,
  cantosDaParede,
  componenteNoEixo,
  pointKey,
  polygonArea,
  projecaoNoSegmento,
  type AlinhamentoParede,
  type Point,
} from './geom';
// `telhado.ts` importa só `units` e `geom`, então não há ciclo: o teto de
// inclinação mora junto da geometria que o consome, e o invariante o lê de lá em
// vez de manter uma segunda cópia do número.
import { AGUA_INCLINACAO_MAX_PCT } from './telhado';

export type ObjectId = string;

export interface Level {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  name: string;
  elevationMm: number;
  defaultHeightMm: number;
}

/**
 * O que a camada FAZ na parede. Decide cor no desenho e agrupamento no
 * quantitativo — não decide nada de geometria.
 *
 * Fechada de propósito, como `StructuralKind`: é o que permite pintar e agrupar
 * sem perguntar ao catálogo. Um texto livre no lugar disto obrigaria a resolver
 * o item no banco para saber que cor usar, e o kernel não fala com o banco.
 */
export type FuncaoCamada =
  | 'ESTRUTURAL'
  | 'VEDACAO'
  | 'REVESTIMENTO'
  | 'ISOLAMENTO'
  | 'ACABAMENTO'
  | 'CAMARA_AR';

/**
 * Uma faixa de material dentro da espessura da parede.
 *
 * ─── POR QUE O MATERIAL É UM CÓDIGO OPACO ───────────────────────────────────
 *
 * `itemCode` é o código no catálogo — SINAPI ou base própria, o mesmo espaço de
 * códigos de `blueprint_budget_mappings.item_code`, porque `custom_items`
 * sobrepõe `sinapi_items` por código e não há decisão de "qual catálogo" a tomar.
 *
 * O kernel guarda o código e NUNCA o resolve. Resolver exigiria consultar o
 * banco, e o payload canônico deixaria de ser função só do desenho: o mesmo
 * traço geraria hashes diferentes conforme o catálogo do dia, e o critério de
 * igualdade bit a bit do Spike A cairia. Quem resolve é a UI, na hora de
 * mostrar, e o de-para, na hora de orçar.
 *
 * `descricao` é CACHE de rótulo pela mesma razão do parágrafo acima: sem ela, um
 * estudo reaberto mostraria "74209/001" onde antes se lia "Alvenaria de bloco
 * cerâmico". É texto para ler, nunca para decidir — quem decide é o código.
 *
 * `itemCode` vazio é legítimo: a camada existe no desenho e ainda não foi
 * vinculada. Ela conta área e volume normalmente e simplesmente não gera linha
 * de orçamento — que é melhor do que impedir de desenhar antes de escolher o
 * material.
 */
export interface CamadaParede {
  /** Milímetro inteiro, estritamente positivo. */
  espessuraMm: number;
  /** Código no catálogo (SINAPI ou base própria). `''` = ainda sem vínculo. */
  itemCode: string;
  /** Descrição em CACHE — rótulo de tela. O kernel nunca a interpreta. */
  descricao: string;
  funcao: FuncaoCamada;
}

/**
 * Parede pelo EIXO, não pelas faces. Espessura é propriedade, não geometria —
 * é o que permite mudar a espessura sem reconstruir a topologia.
 */
export interface Wall {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  levelId: ObjectId;
  a: Point;
  b: Point;
  thicknessMm: number;
  heightMm: number;
  /**
   * De que lado do EIXO estava o traço que o usuário clicou.
   *
   * ─── O QUE ELE NÃO É ────────────────────────────────────────────────────
   *
   * Não muda a geometria da parede: o eixo já está gravado em `a`/`b`, e a
   * conexão no modelo continua sendo pelo EIXO (decisão de 27/08/2026 — ponta
   * que pare na face deixa vértice de grau 1, o anel não fecha e o ambiente
   * some com área e quantitativo junto). Este campo é MEMÓRIA da autoria.
   *
   * ─── PARA QUE ELE EXISTE ────────────────────────────────────────────────
   *
   * Sem ele, o alinhamento era estado só da ferramenta de desenho: aplicado uma
   * vez no clique por `eixoDaParede` e esquecido em seguida. A consequência
   * chegava depois e longe: mudar a espessura fazia a parede crescer para os
   * DOIS lados a partir do eixo, então a face que o usuário havia apontado
   * andava meia espessura — ele mirou numa face e o desenho mexeu nas duas.
   * Com o lado gravado, `deslocamentoParaManterFace` sabe para onde levar o
   * eixo para que a face escolhida fique onde está.
   *
   * ─── AUSENTE = `'EIXO'` ─────────────────────────────────────────────────
   *
   * Parede de desenho antigo não diz de que lado foi traçada, e `'EIXO'` é
   * exatamente o que ela significava: crescer para os dois lados. Por isso o
   * campo é opcional e o padrão preserva o comportamento de sempre.
   *
   * ⚠️ `DIREITA`/`ESQUERDA` são relativos ao sentido `a → b`. Comando que
   * INVERTA esse sentido tem de inverter o lado junto (ver `MergeWalls`).
   */
  alinhamento?: AlinhamentoParede;
  /**
   * Esta parede CEDE o volume que divide com uma peça de concreto?
   *
   * `true` = onde um pilar (ou viga, ou laje) atravessa esta parede, o pedaço
   * disputado sai da alvenaria e fica só no concreto. Ausente/`false` = a
   * parede é medida cheia, e o quantitativo AVISA que há volume contado duas
   * vezes em vez de escolher sozinho.
   *
   * É decisão de quem orça, não do desenho: o pilar embutido é normal na obra,
   * e o que não pode é ser pago duas vezes. Ver `sobreposicao.ts`.
   */
  cedeSobreposicao?: boolean;
  /**
   * A COMPOSIÇÃO da parede: as faixas de material dentro da espessura.
   *
   * ─── AUSENTE = PAREDE HOMOGÊNEA ─────────────────────────────────────────
   *
   * É o que toda parede do acervo sempre significou, e continua significando:
   * uma espessura, um material implícito, um volume de alvenaria. O campo é
   * opcional para que nenhum desenho antigo mude de forma canônica.
   *
   * Lista presente e VAZIA é erro (`EMPTY_LAYERS`), não sinônimo de ausente —
   * senão haveria duas escritas para o mesmo estado e o round-trip do payload
   * deixaria de fechar byte a byte.
   *
   * ─── A SOMA É A ESPESSURA ───────────────────────────────────────────────
   *
   * `Σ espessuraMm === thicknessMm` é INVARIANTE (`LAYERS_THICKNESS_MISMATCH`).
   * Não é preciosismo: `thicknessMm` continua sendo a única espessura que a
   * geometria lê — cotas, recuo da área de piso, imã, canto mitrado, perfil do
   * IFC. Se as duas pudessem divergir, a parede seria desenhada com uma medida
   * e orçada com outra, e nada na tela diria qual das duas está errada.
   *
   * Quem manda, para o usuário, é a soma: `SetWallLayers` recalcula
   * `thicknessMm` a partir das camadas, e `SetThickness` numa parede que tem
   * camadas é RECUSADO em vez de escalar as faixas em silêncio.
   *
   * ─── A ORDEM É DA FACE ESQUERDA PARA A DIREITA ──────────────────────────
   *
   * Esquerda e direita relativas ao sentido `a → b`, exatamente como
   * `alinhamento` e como a normal de `deslocamentoParaManterFace`. A convenção
   * precisa estar escrita em um lugar só: sem ela, "camada 1" seria um lado no
   * canvas, outro no 3D e um terceiro no IFC, e ninguém perceberia — reboco
   * externo e interno têm a mesma espessura, então o desenho sairia plausível.
   *
   * ⚠️ Comando que INVERTA o sentido `a → b` tem de inverter a ordem das
   * camadas junto, pela mesma razão que já inverte `alinhamento`. Ver
   * `MergeWalls`.
   */
  camadas?: CamadaParede[];
}

/** O lado oposto. `EIXO` não tem oposto: continua `EIXO`. */
export function ladoOposto(a: AlinhamentoParede | undefined): AlinhamentoParede {
  if (a === 'DIREITA') return 'ESQUERDA';
  if (a === 'ESQUERDA') return 'DIREITA';
  return 'EIXO';
}

/** Espessura total de uma composição, em mm. Vazia ou ausente dá 0. */
export function somaDasCamadas(camadas: CamadaParede[] | undefined): number {
  return (camadas ?? []).reduce((s, c) => s + c.espessuraMm, 0);
}

/**
 * Cópia PROFUNDA de uma composição.
 *
 * Existe porque `{ ...wall }` copia a REFERÊNCIA do array: dois lugares que
 * espalham a mesma parede (`cloneModel`, `SplitWall`) ficariam com a mesma
 * lista, e uma delas reescreveria a outra. É o mesmo cuidado que
 * `Structural.pontos` já documenta em `cloneModel`.
 */
export function clonarCamadas(
  camadas: CamadaParede[] | undefined,
): CamadaParede[] | undefined {
  return camadas ? camadas.map((c) => ({ ...c })) : undefined;
}

/**
 * Identidade da composição, como texto comparável.
 *
 * Uma parede homogênea devolve `''` — e é isso que faz duas paredes sem camadas
 * continuarem indistinguíveis por este critério, como sempre foram.
 *
 * A `descricao` FICA DE FORA de propósito: ela é cache de rótulo, e incluí-la
 * faria duas paredes com o mesmo material parecerem diferentes só porque o
 * catálogo mudou a grafia da descrição entre um estudo e outro. Compara-se o
 * que decide (espessura, código, função), nunca o que se lê.
 *
 * Usada em três lugares que precisam da MESMA resposta: o desempate da ordem
 * canônica, a recusa do `MergeWalls` e a detecção de alteração no diff.
 */
export function assinaturaDasCamadas(camadas: CamadaParede[] | undefined): string {
  if (!camadas || camadas.length === 0) return '';
  return camadas.map((c) => `${c.espessuraMm}|${c.itemCode}|${c.funcao}`).join(';');
}

/**
 * Quanto o EIXO precisa andar para a face traçada ficar parada quando a
 * espessura muda de `wall.thicknessMm` para `novaEspessuraMm`.
 *
 * `eixoDaParede` põe o eixo a meia espessura do traço, do lado escolhido:
 * `eixo = traço + n · t/2`. O traço não muda, então com a espessura nova o eixo
 * tem de ir para `traço + n · t'/2` — ou seja, andar `n · (t' − t)/2`.
 *
 * Devolve `{x: 0, y: 0}` no alinhamento `EIXO` (o eixo É o traço, não anda) e em
 * parede degenerada. Quem chama aplica isto como uma TRANSLAÇÃO da parede, no
 * mesmo lote da troca de espessura — e com `manterJuncoes`, senão o eixo sai do
 * vértice que compartilhava com a vizinha e o anel abre.
 */
export function deslocamentoParaManterFace(wall: Wall, novaEspessuraMm: number): Point {
  const lado = wall.alinhamento ?? 'EIXO';
  if (lado === 'EIXO') return { x: 0, y: 0 };

  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return { x: 0, y: 0 };

  // A MESMA normal de `normalDoLado` em geom.ts. Ela é privada lá, e duplicar
  // duas linhas é melhor do que exportar uma primitiva de deslocamento que
  // convidaria outros a reimplementar o traçado pela face por fora do kernel.
  const n =
    lado === 'DIREITA'
      ? { x: dy / comp, y: -dx / comp }
      : { x: -dy / comp, y: dx / comp };

  const meio = (novaEspessuraMm - wall.thicknessMm) / 2;
  return { x: roundToMm(n.x * meio), y: roundToMm(n.y * meio) };
}

/**
 * O TIPO de uma esquadria — o que se compra, e como o projeto a chama.
 *
 * ─── É VALOR COPIADO, NÃO REFERÊNCIA ────────────────────────────────────────
 *
 * Mesma decisão de `CamadaParede`, pela mesma razão: o snapshot é imutável, e
 * um `tipoId` apontando para o catálogo da organização faria "a porta P1 da
 * revisão 3" mudar de material quando alguém editasse o catálogo hoje. O
 * catálogo (`blueprint_opening_types`) é MOLDE; o que a abertura carrega é a
 * cópia, e apagar o molde não mexe em planta nenhuma.
 *
 * ─── O QUE FAZ DUAS PORTAS SEREM "A MESMA" É A ASSINATURA ───────────────────
 *
 * Não há id de tipo. `assinaturaDaEsquadria` — kind, largura, altura, nome e
 * item — é o que agrupa o quadro de esquadrias, emite um `IfcDoorType` por
 * grupo e gera uma linha de orçamento por tipo. É `assinaturaDasCamadas`, para
 * a abertura.
 */
export interface Esquadria {
  /** Como o projeto chama: "P1", "J3". Nunca vazio quando há esquadria. */
  nome: string;
  /** Código no catálogo (SINAPI ou base própria). `''` = ainda sem vínculo. */
  itemCode: string;
  /** Descrição em CACHE — rótulo de tela. O kernel nunca a interpreta. */
  descricao: string;
}

/** Abertura hospedada numa parede. `offsetMm` é medido a partir de `wall.a`. */
export interface Opening {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  wallId: ObjectId;
  /**
   * `passage` é o vão SEM ESQUADRIA — "vão livre" na tela. Não é decoração de
   * porta: ele muda o orçamento em dois lugares. Não entra em área de
   * esquadrias (não há caixilho para comprar) e, quando nasce no piso,
   * interrompe o rodapé como uma porta interrompe.
   */
  kind: 'door' | 'window' | 'passage' | 'sliding';
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  sillMm: number;
  /**
   * Só o SÍMBOLO da porta lê estes dois campos — janela não tem dobradiça nem
   * lado de giro, e continua desenhada como uma linha simétrica através da
   * parede. Existem em toda abertura mesmo assim, pela mesma razão de `sillMm`
   * estar presente em porta: um campo condicional ao `kind` bifurcaria o tipo
   * sem necessidade.
   *
   * Os dois são EIXOS INDEPENDENTES, não um único "girar 180°": um vão de porta
   * tem 4 variações válidas de símbolo (a mesma convenção do Revit/ArchiCAD —
   * "flip hand" e "flip facing" — dois botões, quatro estados), e colapsar os
   * dois numa única ação impediria alcançar metade delas sem combinar botões.
   */
  /** De qual ponta do vão sai o eixo de giro. `true` = `wall.a` + `offsetMm`. */
  hingeAtStart: boolean;
  /** Para qual lado da parede a folha abre. `false` = normal positiva (padrão). */
  swingReversed: boolean;
  /**
   * Só para `sliding`: a folha corre DENTRO da parede (bolso) ou sobre a face.
   *
   * ─── POR QUE UM BOOLEANO, E NÃO DOIS `kind` ─────────────────────────────
   *
   * Dois tipos duplicariam todo `switch` do desenho e do orçamento por uma
   * diferença que não muda o que se COMPRA — folha, trilho e puxador são os
   * mesmos. O que muda é onde a folha vai parar, e isso é um eixo, não uma
   * família.
   *
   * ─── OS DOIS BOOLEANOS DE CIMA SERVEM SEM MUDAR DE SIGNIFICADO ──────────
   *
   * `hingeAtStart` já diz "de qual ponta do vão": na de correr, para qual
   * ponta a folha recolhe. `swingReversed` já diz "para qual lado da parede":
   * na de correr POR FORA, sobre qual face ela desliza. Na EMBUTIDA ele não se
   * aplica, porque a folha vai para dentro — e não se aplica é diferente de
   * não existir, pela mesma razão que `sillMm` existe em porta.
   */
  embutida: boolean;
  /**
   * O tipo da esquadria, quando declarado. Ausente = abertura sem tipo, que é
   * o que toda abertura do acervo era — e a chave é OMITIDA do payload
   * canônico, para que o hash delas não mude. Ver `Esquadria`.
   */
  esquadria?: Esquadria;
}

/**
 * O que identifica um TIPO de esquadria — o critério de "é a mesma porta".
 *
 * Kind, largura e altura entram porque são o que se compra; nome e item entram
 * porque distinguem duas portas 80×210 de fornecedores diferentes. `descricao`
 * fica FORA, como em `assinaturaDasCamadas`: é cache de rótulo, e recadastrar o
 * item com outra grafia não pode separar um grupo em dois.
 *
 * Duas aberturas SEM esquadria de mesmo kind e medidas também formam um grupo:
 * é assim que o Revit pensa uma família, e é melhor do que um quadro em que só
 * as nomeadas aparecem agrupadas.
 */
export function assinaturaDaEsquadria(o: Pick<Opening, 'kind' | 'widthMm' | 'heightMm' | 'esquadria'>): string {
  return `${o.kind}|${o.widthMm}|${o.heightMm}|${o.esquadria?.nome ?? ''}|${o.esquadria?.itemCode ?? ''}`;
}

/** "P1", ou "Porta 80×210" quando não há tipo declarado. */
export function nomeDaEsquadria(o: Pick<Opening, 'kind' | 'widthMm' | 'heightMm' | 'esquadria' | 'embutida'>): string {
  return o.esquadria?.nome || `${nomeDoTipoDeAbertura(o.kind, o.embutida)} ${o.widthMm}×${o.heightMm}`;
}

/**
 * Como cada tipo de abertura se chama na tela.
 *
 * FONTE ÚNICA. O rótulo era escrito à mão em quatro lugares (painel, diff,
 * de-para do orçamento, barra), todos com o mesmo ternário `door ? 'Porta' :
 * 'Janela'` — que, com um terceiro tipo, passa a chamar vão livre de "Janela"
 * em cada um deles. Um ternário de dois ramos não sobrevive a um tipo novo, e
 * quatro cópias dele são quatro lugares para esquecer.
 */
export function nomeDoTipoDeAbertura(kind: Opening['kind'], embutida = false): string {
  if (kind === 'door') return 'Porta';
  if (kind === 'window') return 'Janela';
  if (kind === 'sliding') return embutida ? 'Porta de correr embutida' : 'Porta de correr';
  return 'Vão livre';
}

/**
 * Que tipo de limite este é.
 *
 * `TERRENO` participa do anel do LOTE — é dele que saem área, perímetro e
 * recuos. `DIVISA` é um limite solto: alinhamento, servidão, divisão interna
 * sem material. A distinção existe porque só o anel do lote tem área com
 * significado jurídico, e misturar os dois faria a área do terreno mudar quando
 * alguém traçasse uma divisória qualquer.
 */
export type BoundaryKind = 'TERRENO' | 'DIVISA';

/**
 * Papel da divisa no lote, para os recuos.
 *
 * Recuo de frente, de fundos e de lateral são medidas DIFERENTES, e não há como
 * inferir qual é qual só pela geometria — a frente é a que dá para a rua, e isso
 * é informação do mundo, não do desenho.
 */
export type BoundaryPapel = 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';

/** Limite sem material físico — divide ambiente sem existir como parede. */
export interface Boundary {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  levelId: ObjectId;
  a: Point;
  b: Point;
  /**
   * Omitido em payload gravado sob kernel ≤ 0.4.0, quando o campo não existia.
   * Lido como `DIVISA` na volta — o comportamento de antes, que é o que aquele
   * desenho significava.
   */
  kind: BoundaryKind;
  papel?: BoundaryPapel | null;
  /**
   * A medida deste lado COMO ESTÁ NA MATRÍCULA, em mm inteiro.
   *
   * Deliberadamente separada da medida desenhada (que sai de `a` e `b`): a
   * divergência entre as duas É o produto. Guardar uma só, ou "corrigir" o
   * desenho para a escritura, apagaria justamente a informação que se quer ver —
   * levantamento e título discordam com frequência, e quem decide o que fazer
   * com isso é o incorporador, não o software.
   *
   * `null` = ninguém informou. Nada é comparado, nada é acusado.
   */
  medidaEscrituraMm?: number | null;
  /**
   * Com quem este lado confronta, como a escritura descreve: "Rua das Acácias",
   * "lote 12", "Córrego do Meio". Texto livre porque a matrícula é texto livre —
   * um catálogo de confrontantes obrigaria a cadastrar a rua antes de desenhar.
   */
  confrontante?: string | null;
}

/** Ambiente derivado do arranjo planar. Contorno NUNCA é declarado pelo usuário. */
export interface Space {
  id: ObjectId;
  levelId: ObjectId;
  ring: Point[];
  holes: Point[][];
  areaMm2: number;
  perimeterMm: number;
  name?: string;
  /**
   * uid da ETIQUETA que nomeia este ambiente, quando há uma. Ambiente é
   * derivado e não tem uid próprio; a identidade que ele carrega para fora
   * (IFC, `blueprint_objects`) é a da etiqueta, religada por conter o ponto a
   * cada rederivação — exatamente como `name`.
   */
  labelUid?: ElementUid;
}

/**
 * Nome de ambiente ancorado num PONTO, não no id do ambiente.
 *
 * Ambiente é derivado: mover uma parede recria todos os `Space`, com ids novos.
 * Um nome guardado por `spaceId` sobreviveria a zero edições — ou pior,
 * reapareceria colado no ambiente errado quando a ordem de derivação mudasse.
 *
 * Ancorar num ponto é o que os CAD fazem com etiqueta de ambiente: o nome fica
 * onde o usuário clicou e, a cada rederivação, vai para o ambiente que contém
 * aquele ponto. Se uma reforma engolir o ambiente, a etiqueta fica órfã e
 * visível — que é melhor do que sumir em silêncio.
 */
export interface SpaceLabel {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  levelId: ObjectId;
  at: Point;
  name: string;
}

/**
 * Os seis elementos de ESTRUTURA que a planta sabe desenhar.
 *
 * São concreto — esqueleto —, não vedação. A distinção não é taxonomia: parede
 * vira alvenaria no orçamento, estrutura vira volume de concreto e área de
 * fôrma, que são itens de catálogo completamente diferentes. Desenhar pilar com
 * a ferramenta Parede poria a seção dele no orçamento como bloco cerâmico.
 */
export type StructuralKind =
  | 'PILAR'
  | 'VIGA'
  | 'LAJE'
  | 'ESTACA'
  | 'BLOCO_COROAMENTO'
  | 'VIGA_FUNDACAO';

/**
 * A forma geométrica de cada tipo. FONTE ÚNICA.
 *
 * Seis tipos, três formas — e é a FORMA que decide quantos pontos o gesto
 * coleta, como o volume é calculado e o que o painel de propriedades mostra.
 * Espalhar essa decisão em `switch (kind)` por canvas, quantitativo e painel
 * daria três lugares para esquecer o sétimo tipo. É a mesma razão de
 * `DIMENSAO_POR_TIPO` existir em `blueprintMedicoes.ts`.
 */
export const FORMA_ESTRUTURAL: Record<StructuralKind, 'PONTO' | 'LINHA' | 'AREA'> = {
  PILAR: 'PONTO',
  ESTACA: 'PONTO',
  BLOCO_COROAMENTO: 'PONTO',
  VIGA: 'LINHA',
  VIGA_FUNDACAO: 'LINHA',
  LAJE: 'AREA',
};

/**
 * Como cada tipo se chama na tela. FONTE ÚNICA.
 *
 * Existe pela lição de `nomeDoTipoDeAbertura`: o rótulo escrito à mão em cada
 * tela é o que faz um tipo novo aparecer com o nome do antigo em metade delas.
 */
export function nomeDoTipoEstrutural(kind: StructuralKind): string {
  if (kind === 'PILAR') return 'Pilar';
  if (kind === 'VIGA') return 'Viga';
  if (kind === 'LAJE') return 'Laje';
  if (kind === 'ESTACA') return 'Estaca';
  if (kind === 'BLOCO_COROAMENTO') return 'Bloco de coroamento';
  return 'Viga de fundação';
}

/**
 * A letra com que a prancha costuma numerar cada tipo: P1, V3, L2, E5, B2.
 *
 * FONTE ÚNICA, pela mesma razão de `nomeDoTipoEstrutural`. Nasceu de uma
 * divergência real vista em tela em 30/08/2026: a barra sugeria "L1" para a
 * laje e o painel lateral sugeria "P1" para a mesma peça, porque cada um tinha
 * o seu ternário. Duas sugestões diferentes para o mesmo campo ensinam a
 * ignorar as duas.
 */
export function prefixoDeRotulo(kind: StructuralKind): string {
  if (kind === 'VIGA' || kind === 'VIGA_FUNDACAO') return 'V';
  if (kind === 'LAJE') return 'L';
  if (kind === 'ESTACA') return 'E';
  if (kind === 'BLOCO_COROAMENTO') return 'B';
  return 'P';
}

/** Quantos vértices a forma exige. `AREA` é mínimo, as outras são exatas. */
export function pontosEsperados(kind: StructuralKind): number {
  const forma = FORMA_ESTRUTURAL[kind];
  return forma === 'PONTO' ? 1 : forma === 'LINHA' ? 2 : 3;
}

/**
 * Elemento estrutural de concreto.
 *
 * ─── UMA FAMÍLIA, SEIS TIPOS ────────────────────────────────────────────────
 *
 * Seis interfaces separadas — `Column`, `Beam`, `Slab`… — multiplicariam por
 * seis o `cloneModel`, os invariantes, a emissão canônica e o `CHECK` do banco
 * por uma diferença que é de SEÇÃO, não de estrutura de dados. `Opening` já é
 * uma família com quatro `kind` pelo mesmo motivo.
 *
 * ─── O QUE CADA MEDIDA SIGNIFICA, POR FORMA ─────────────────────────────────
 *
 *   PONTO (pilar, estaca, bloco): `pontos` tem o CENTRO. A seção em planta é
 *     `larguraMm × profundidadeMm`, girada de `rotacaoDeg`; circular, é o
 *     diâmetro `larguraMm`. `alturaMm` é a extensão VERTICAL — pé-direito do
 *     pilar, profundidade da estaca, altura do bloco.
 *
 *   LINHA (viga, viga de fundação): `pontos` tem o EIXO, como a parede.
 *     `larguraMm` é a base da seção (b) e `alturaMm` é a altura dela (h).
 *     `profundidadeMm` não se aplica — o comprimento sai do próprio eixo.
 *
 *   AREA (laje): `pontos` é o anel, sem repetir o primeiro vértice no fim.
 *     `alturaMm` é a ESPESSURA. `larguraMm` e `profundidadeMm` não se aplicam.
 *
 * ─── `baseMm` É O QUE PÕE A FUNDAÇÃO ABAIXO DO PISO ─────────────────────────
 *
 * Cota da face INFERIOR, relativa ao piso do pavimento. Negativa em estaca,
 * bloco e viga de fundação. É o que permite os três conviverem no mesmo nível
 * que o pilar, em vez de exigir um pavimento "Fundação" só para eles — e é o
 * que o 3D lê para empilhar as peças na altura certa.
 */
export interface Structural {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  levelId: ObjectId;
  kind: StructuralKind;
  /** Vértices em mm inteiro. Cardinalidade governada por `FORMA_ESTRUTURAL`. */
  pontos: Point[];
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
  baseMm: number;
  /** Seção redonda: `larguraMm` é o diâmetro e `profundidadeMm` é ignorada. */
  circular: boolean;
  /** Giro da seção em planta, em graus inteiros. Só `PONTO` usa. */
  rotacaoDeg: number;
  /**
   * Como o projeto estrutural chama a peça: "P1", "V3", "L2".
   *
   * Texto livre, e não um contador automático, porque a numeração vem da
   * prancha do calculista — inventar "P7" para uma peça que a prancha chama de
   * "P12" faria a planta e o projeto discordarem justamente onde alguém vai
   * conferir. `null` = sem rótulo.
   */
  rotulo?: string | null;
  /**
   * Esta peça CEDE o volume que divide com outro componente?
   *
   * O inverso do campo homônimo da parede, e existe porque a escolha é do
   * usuário: às vezes o que se quer é a alvenaria cheia e o concreto abatido —
   * um pilar de canto que o construtor vai executar depois da alvenaria, por
   * exemplo. Ausente/`false` = a peça é medida cheia.
   */
  cedeSobreposicao?: boolean;
}

/**
 * A pegada da peça EM PLANTA, como polígono fechado.
 *
 * FONTE ÚNICA das três formas. O canvas precisa dela para desenhar e para o
 * acerto do cursor, o quantitativo para a área da laje, o 3D para a extrusão —
 * e as três reimplementariam a mesma trigonometria de seção girada, cada uma
 * com o seu jeito de errar o sinal do seno.
 *
 * ⚠️ Numa peça CIRCULAR o que sai daqui é o QUADRADO que a envolve, não o
 * círculo: polígono é o contrato desta função. Quem desenha e quem calcula
 * volume consultam `circular` e tratam o caso redondo por fora — aproximar o
 * círculo por polígono aqui poria erro de discretização dentro do volume de
 * concreto, que é justamente o número que se compra.
 */
export function contornoEmPlanta(s: Structural): Point[] {
  const forma = FORMA_ESTRUTURAL[s.kind];
  if (forma === 'AREA') return s.pontos.map((p) => ({ ...p }));
  if (forma === 'LINHA') return cantosDaParede(s.pontos[0], s.pontos[1], s.larguraMm);

  const c = s.pontos[0];
  // Circular: `larguraMm` é o diâmetro nos DOIS eixos, e `profundidadeMm` não
  // é lida — é o que faz uma estaca redonda não depender de um campo que o
  // painel dela nem mostra.
  const meiaL = s.larguraMm / 2;
  const meiaP = (s.circular ? s.larguraMm : s.profundidadeMm) / 2;
  const rad = (s.rotacaoDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sen = Math.sin(rad);

  return [
    { dx: -meiaL, dy: -meiaP },
    { dx: meiaL, dy: -meiaP },
    { dx: meiaL, dy: meiaP },
    { dx: -meiaL, dy: meiaP },
  ].map(({ dx, dy }) => ({
    x: roundToMm(c.x + dx * cos - dy * sen),
    y: roundToMm(c.y + dx * sen + dy * cos),
  }));
}

/**
 * Os pontos em que outra geometria se CONECTA a uma peça estrutural.
 *
 * ─── POR QUE O EIXO NÃO BASTA ───────────────────────────────────────────────
 *
 * Pedido do usuário (31/08/2026), com print de uma viga selecionada: *"os
 * pontos de conexão para os componentes estruturais são apenas no eixo. deve
 * ser também nos cantos"*.
 *
 * É exatamente a lacuna que a PAREDE já tinha resolvido, e pelo mesmo motivo:
 * a ponta do eixo fica no MEIO da espessura, onde não há nada desenhado. Quem
 * está copiando uma prancha aponta o canto que enxerga na tela — o encontro da
 * face da viga com a face do pilar —, e ali não havia ponto nenhum para o ímã
 * pegar. Ver o cabeçalho de `capturar` em `BlueprintCanvas`, que descreve a
 * mesma história do lado da alvenaria.
 *
 * ─── AS DUAS FAMÍLIAS SAEM SEPARADAS ────────────────────────────────────────
 *
 * `eixo` e `cantos` voltam em campos distintos porque quem captura precisa
 * escolher entre eles conforme o que está desenhando (o `preferirCanto` do
 * canvas): desenhando pelo eixo, o eixo ganha; desenhando pela face, o canto
 * ganha. Fundidos numa lista só, o ímã puxaria para um tipo de ponto diferente
 * do que o traçado está produzindo.
 *
 * ⚠️ Peça CIRCULAR não tem canto — e o quadrado envolvente que
 * `contornoEmPlanta` devolve para ela **não** entra aqui: o vértice desse
 * quadrado fica a 60 mm fora do concreto numa estaca ⌀300, e encaixar ali seria
 * conectar a peça a um ponto onde não há peça. É o mesmo corte que
 * `estruturaSob` faz para o acerto do cursor.
 *
 * ⚠️ Na LAJE os dois conjuntos coincidem (o contorno É o eixo dela), então
 * `cantos` volta vazio para não oferecer o mesmo ponto duas vezes.
 */
export function pontosDeConexaoEstrutural(s: Structural): { eixo: Point[]; cantos: Point[] } {
  const forma = FORMA_ESTRUTURAL[s.kind];
  const eixo = s.pontos.map((p) => ({ ...p }));
  if (forma === 'AREA') return { eixo, cantos: [] };
  if (forma === 'PONTO' && s.circular) return { eixo, cantos: [] };
  return { eixo, cantos: contornoEmPlanta(s) };
}

/**
 * Uma ÁGUA de telhado — um plano inclinado de cobertura.
 *
 * "Água" é o termo de obra e não tem equivalente curto em inglês ("roof plane"
 * descreve, não nomeia). A família no modelo chama-se `roofs`, como as demais
 * chaves, mas o TIPO carrega o nome que o projetista usa — a mesma escolha de
 * `CamadaParede`.
 *
 * ─── UMA ÁGUA, UM ELEMENTO ──────────────────────────────────────────────────
 *
 * Um telhado de duas águas são DOIS elementos que compartilham a cumeeira; um
 * de quatro, quatro. Não há entidade "telhado" agrupando-os, e a ausência é
 * deliberada: agrupar exigiria decidir o que fazer quando as águas não fecham
 * entre si, e o desenho é a resposta certa para isso — quem olha a planta vê.
 * O IFC agrega por PAVIMENTO na hora de exportar, que é onde o agrupamento
 * significa alguma coisa para quem recebe.
 *
 * ─── NÃO PARTICIPA DO ARRANJO PLANAR ────────────────────────────────────────
 *
 * Como a estrutura (decisão de 30/08/2026): uma água sobre a sala não parte o
 * ambiente nem desconta área de piso. Telhado é cobertura, não divisória.
 *
 * ─── PLATIBANDA NÃO ENTRA AQUI ──────────────────────────────────────────────
 *
 * Platibanda é uma PAREDE mais alta que o pé-direito, e a `Wall` já faz isso.
 * Um tipo próprio para ela poria a mesma alvenaria em duas linhas do orçamento.
 *
 * A geometria (cota, área real, normal do plano) vive em `telhado.ts` — aqui
 * ficam só os campos que o payload canônico persiste.
 */
export interface Agua {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  levelId: ObjectId;
  /**
   * Contorno em PLANTA, em mm inteiro, no mínimo 3 vértices.
   *
   * Inclui o BEIRAL: o polígono é onde o telhado de fato está, não onde a
   * parede está. Guardar o contorno da parede mais um "avanço de beiral" faria
   * a mesma pergunta duas vezes (o desenho e o campo), e as duas respostas
   * divergiriam no primeiro arraste de vértice.
   */
  pontos: Point[];
  /**
   * Qual lado é o BEIRAL — o lado BAIXO, por onde a água escorre. O lado `i`
   * vai de `pontos[i]` a `pontos[(i+1) % n]`.
   *
   * É um ÍNDICE DE LADO, e não um vetor de direção de caimento: lado é o que o
   * usuário aponta na tela, e um vetor livre permitiria gravar um caimento que
   * não corresponde a nenhum lado do polígono desenhado.
   */
  beiralIndex: number;
  /**
   * Inclinação em POR CENTO — "telhado 30%", como a obra fala.
   *
   * Graus é DERIVADO (`medirAgua`), nunca gravado: dois campos para a mesma
   * grandeza divergem no primeiro arredondamento, e aí não há como saber qual
   * dos dois o telhado tem. `0` é legítimo — laje impermeabilizada.
   */
  inclinacaoPct: number;
  /** Cota da linha do BEIRAL, relativa ao piso do pavimento, em mm. */
  baseMm: number;
  /** Espessura do pacote de cobertura (telha + trama), em mm. */
  espessuraMm: number;
}

/**
 * Uma LINHA DE CORTE — o plano vertical por onde a edificação é seccionada.
 *
 * ─── POR QUE ELA MORA NO PAYLOAD, E A ELEVAÇÃO NÃO ──────────────────────────
 *
 * A direção de uma elevação é DERIVADA (a divisa marcada como frente, ou os
 * eixos fixos). Onde CORTAR é escolha, e escolha do usuário é conteúdo.
 *
 * O motivo decisivo, porém, é o SNAPSHOT: ele é imutável e reprodutível. Uma
 * linha de corte guardada fora do payload faria "o corte AA da versão 3" mudar
 * de lugar assim que alguém movesse a linha hoje — o desenho publicado deixaria
 * de ser o desenho publicado. É a mesma razão que pôs a escritura do lote
 * dentro do canônico, e não numa tabela ao lado.
 *
 * ─── UM SEGMENTO RETO ───────────────────────────────────────────────────────
 *
 * Corte em DESVIO (atravessa a porta aqui, dá um passo, pega a janela ali) fica
 * de fora: desdobrar os trechos num desenho só é ambíguo — não há resposta
 * única para onde o degrau aparece —, e um desdobramento errado produz um corte
 * PLAUSÍVEL. Um segmento cobre o estudo preliminar, que é o escopo do módulo.
 *
 * ─── O PLANO É INFINITO; O SEGMENTO É A MARCA ───────────────────────────────
 *
 * `a` e `b` desenham em planta a marca com as setas e a letra. A classificação
 * do que é cortado usa o plano INFINITO que passa por eles — é o que "corte"
 * significa, e é a regra que não depende de o usuário ter esticado a linha até
 * o fim da casa.
 */
export interface Corte {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  /**
   * O corte é do DESENHO, não de um pavimento: o plano atravessa a edificação
   * inteira, e a vista empilha os pavimentos como a elevação faz. Por isso não
   * há `levelId` aqui — e por isso `RemoveLevel` não leva corte nenhum junto.
   */
  a: Point;
  b: Point;
  /**
   * De que lado de `a → b` está quem OLHA.
   *
   * Campo explícito, e não a ordem dos pontos: inverter a vista trocando `a` e
   * `b` espelharia o desenho da esquerda para a direita junto, e o usuário que
   * queria só virar a vista veria a fachada trocar de mão. Com o campo, o botão
   * "inverter" troca só o lado.
   *
   * `ESQUERDA` = a normal esquerda de `a → b`, que é a convenção em que o eixo
   * horizontal do desenho cai exatamente sobre `a → b`.
   */
  olharPara: 'ESQUERDA' | 'DIREITA';
  /**
   * A letra da marca: "A", "B". Texto livre, como o rótulo da peça estrutural —
   * a numeração vem da prancha, e inventar "C" para o corte que o projeto chama
   * de "BB" faria os dois discordarem onde alguém vai conferir.
   */
  rotulo: string;
}

/**
 * ESCADA ou RAMPA — um percurso em planta que vence um desnível.
 *
 * ─── POR QUE UMA FAMÍLIA SÓ ─────────────────────────────────────────────────
 *
 * As duas são a MESMA coisa geométrica: um caminho de largura constante que
 * sobe de um piso ao outro. Diferem em como a superfície é resolvida (degraus
 * ou plano contínuo), no que se confere (espelho ou inclinação) e na entidade
 * IFC. Isso cabe num campo.
 *
 * Duas famílias duplicariam o percurso, o acerto do cursor, o painel, as quatro
 * vistas e as cinco exportações para render uma diferença de uma linha. É o
 * mesmo argumento que fez `Agua.inclinacaoPct = 0` ser um caso legítimo (laje
 * impermeabilizada) em vez de nascer uma família "laje plana".
 *
 * ─── O NÚMERO DE DEGRAUS É DERIVADO ─────────────────────────────────────────
 *
 * O que se grava é o ALVO de espelho; o número de degraus e o espelho REAL saem
 * do desnível, em `medirEscada`. Gravar os dois como campos independentes é o
 * erro que `Agua` já documenta ("graus é DERIVADO, nunca gravado") — só que
 * aqui a consequência é pior que um arredondamento: espelho e contagem que não
 * multiplicam o desnível produzem uma escada que CHEGA ABAIXO DO PISO, e o
 * desenho não denuncia, porque os degraus aparecem todos.
 *
 * ─── O DESNÍVEL VEM DO PAVIMENTO DE CIMA ────────────────────────────────────
 *
 * E não do pé-direito deste. A escada tem de CHEGAR ao piso de cima; medir pelo
 * pé-direito daria certo só enquanto os dois números coincidissem. Consequência
 * aceita: acrescentar um pavimento depois muda o número de degraus da escada
 * que já existe — o que é o correto, e o painel diz em palavras qual desnível
 * está sendo vencido e até onde.
 */
export type TipoCirculacao = 'ESCADA' | 'RAMPA';

export interface Escada {
  id: ObjectId;
  /** Identidade persistente — ver `identity.ts`. Fora do hash. */
  uid: ElementUid;
  /** O pavimento de PARTIDA. Removê-lo leva a escada junto. */
  levelId: ObjectId;
  tipo: TipoCirculacao;
  /**
   * O EIXO do percurso, em mm inteiro, no mínimo 2 vértices.
   *
   * 2 pontos = lance reto; 3 = um patamar em L; 4 = U. A FORMA não é campo: ela
   * é lida da contagem, como `FORMA_ESTRUTURAL` faz com pilar/viga/laje. Um
   * campo `forma` ao lado do desenho seria a mesma pergunta feita duas vezes, e
   * as duas respostas divergiriam no primeiro arraste de vértice — o argumento
   * que `Agua.pontos` já carrega sobre o beiral.
   *
   * Fora do escopo: curva, leque e caracol. Nesses o degrau deixa de ser
   * retângulo, e um degrau em leque desenhado como retângulo é um desenho
   * plausível e errado.
   */
  pontos: Point[];
  larguraMm: number;
  /**
   * O espelho que se QUER, em mm. O real sai do desnível (`medirEscada`).
   *
   * 175 mm é o padrão da casa brasileira. Na rampa este campo é ignorado — ela
   * não tem degrau —, e continua aqui em vez de virar um campo opcional porque
   * alternar o tipo de ida e volta não pode apagar o que o usuário ajustou.
   */
  alvoEspelhoMm: number;
  /**
   * Como o projeto chama a peça: "E1", "Rampa de acesso". Texto livre, pela
   * mesma razão do rótulo da peça estrutural. `null` = sem rótulo.
   */
  rotulo?: string | null;
}

export interface BlueprintModel {
  levels: Level[];
  walls: Wall[];
  openings: Opening[];
  boundaries: Boundary[];
  /**
   * Estrutura de concreto. NÃO participa do arranjo planar (decisão de
   * 30/08/2026): um pilar dentro da sala não parte o ambiente nem desconta área
   * de piso. Se entrasse no grafo, o `Space` se fragmentaria e área, rodapé e
   * revestimento mudariam junto — uma peça de esqueleto reescrevendo o
   * quantitativo de acabamento.
   */
  structures: Structural[];
  /**
   * Águas de telhado. Como a estrutura, NÃO participam do arranjo planar — ver
   * o cabeçalho de `Agua`.
   */
  roofs: Agua[];
  /**
   * Linhas de corte. NÃO têm pavimento: o plano atravessa a edificação
   * inteira — ver o cabeçalho de `Corte`.
   */
  sections: Corte[];
  /**
   * Escadas e rampas. Como a estrutura e o telhado, NÃO participam do arranjo
   * planar: uma escada dentro da sala não parte o ambiente. O que ela faz ao
   * quantitativo é DESCONTAR a laje que atravessa, e isso acontece em
   * `sobreposicao.ts`, na leitura — não no grafo.
   */
  stairs: Escada[];
  /** Etiquetas de ambiente. Persistidas; o `Space.name` é que é derivado delas. */
  labels: SpaceLabel[];
  /** Derivado. Recalculado por `recomputeSpaces`, jamais editado à mão. */
  spaces: Space[];
  /**
   * Área do lote NA ESCRITURA, em mm² inteiro. `null` = ninguém informou.
   *
   * Mora no modelo, e não em estado local da tela como os recuos, porque não é
   * parâmetro urbanístico do município — é CONTEÚDO do lote. Mudá-la muda o que
   * o desenho afirma, e portanto tem que mudar o hash; é o mesmo argumento que
   * pôs os nomes de ambiente (`labels`) no payload canônico.
   *
   * Em mm², não em m², pela disciplina do kernel: 0,01 m² são exatos 10.000 mm²,
   * então a conversão não perde nada e o número continua inteiro. A faixa de
   * `assertIntegerMm` não se aplica — ela limita COORDENADA a ±1.000.000 mm, e um
   * lote modesto de 360 m² já são 360.000.000 mm².
   */
  areaEscrituraMm2?: number | null;
  /** Contador determinístico de IDs, por prefixo. */
  seq: Record<string, number>;
}

export function emptyModel(): BlueprintModel {
  return {
    levels: [],
    walls: [],
    openings: [],
    boundaries: [],
    structures: [],
    roofs: [],
    sections: [],
    stairs: [],
    labels: [],
    spaces: [],
    areaEscrituraMm2: null,
    seq: {},
  };
}

/**
 * Próximo ID de um prefixo. Determinístico: o mesmo roteiro de comandos produz
 * exatamente os mesmos IDs, em qualquer máquina.
 */
export function nextId(model: BlueprintModel, prefix: string): ObjectId {
  const n = (model.seq[prefix] ?? 0) + 1;
  model.seq[prefix] = n;
  return `${prefix}_${String(n).padStart(4, '0')}`;
}

export function cloneModel(model: BlueprintModel): BlueprintModel {
  return {
    levels: model.levels.map((l) => ({ ...l })),
    // `camadas` entra na cópia profunda pelo motivo que `structures.pontos`
    // explica logo abaixo: um `...w` cru deixaria a lista compartilhada entre o
    // modelo novo e o antigo, e editar a composição reescreveria o estado que o
    // desfazer guardou.
    walls: model.walls.map((w) => ({
      ...w,
      a: { ...w.a },
      b: { ...w.b },
      ...(w.camadas ? { camadas: clonarCamadas(w.camadas)! } : {}),
    })),
    // `esquadria` copiada a fundo pela razão de `camadas`: um `...o` cru deixaria
    // o objeto compartilhado entre o modelo novo e o antigo, e aplicar um tipo
    // reescreveria o estado que o desfazer guardou.
    openings: model.openings.map((o) => ({
      ...o,
      ...(o.esquadria ? { esquadria: { ...o.esquadria } } : {}),
    })),
    boundaries: model.boundaries.map((b) => ({ ...b, a: { ...b.a }, b: { ...b.b } })),
    // `pontos` é copiado ponto a ponto, não por referência: um `...s` cru
    // deixaria o array compartilhado entre o modelo novo e o antigo, e mover um
    // vértice reescreveria o estado que o desfazer guardou. É a mesma cópia
    // profunda que `spaces.ring` faz logo abaixo, pelo mesmo motivo.
    structures: (model.structures ?? []).map((s) => ({
      ...s,
      pontos: s.pontos.map((p) => ({ ...p })),
    })),
    // Mesma cópia profunda de `structures.pontos`, pelo mesmo motivo.
    roofs: (model.roofs ?? []).map((r) => ({
      ...r,
      pontos: r.pontos.map((p) => ({ ...p })),
    })),
    sections: (model.sections ?? []).map((c) => ({ ...c, a: { ...c.a }, b: { ...c.b } })),
    // Mesma cópia profunda de `structures.pontos`, pelo mesmo motivo.
    stairs: (model.stairs ?? []).map((e) => ({
      ...e,
      pontos: e.pontos.map((p) => ({ ...p })),
    })),
    labels: (model.labels ?? []).map((l) => ({ ...l, at: { ...l.at } })),
    spaces: model.spaces.map((s) => ({
      ...s,
      ring: s.ring.map((p) => ({ ...p })),
      holes: s.holes.map((h) => h.map((p) => ({ ...p }))),
    })),
    areaEscrituraMm2: model.areaEscrituraMm2 ?? null,
    seq: { ...model.seq },
  };
}

export function findWall(model: BlueprintModel, id: ObjectId): Wall {
  const wall = model.walls.find((w) => w.id === id);
  if (!wall) throw new KernelError('WALL_NOT_FOUND', `Parede inexistente: ${id}`);
  return wall;
}

export function findLevel(model: BlueprintModel, id: ObjectId): Level {
  const level = model.levels.find((l) => l.id === id);
  if (!level) throw new KernelError('LEVEL_NOT_FOUND', `Nível inexistente: ${id}`);
  return level;
}

export function findBoundary(model: BlueprintModel, id: ObjectId): Boundary {
  const boundary = model.boundaries.find((b) => b.id === id);
  if (!boundary) throw new KernelError('BOUNDARY_NOT_FOUND', `Limite inexistente: ${id}`);
  return boundary;
}

export function findStructural(model: BlueprintModel, id: ObjectId): Structural {
  const s = model.structures.find((e) => e.id === id);
  if (!s) throw new KernelError('STRUCTURAL_NOT_FOUND', `Estrutura inexistente: ${id}`);
  return s;
}

export function findCorte(model: BlueprintModel, id: ObjectId): Corte {
  const c = (model.sections ?? []).find((e) => e.id === id);
  if (!c) throw new KernelError('SECTION_NOT_FOUND', `Corte inexistente: ${id}`);
  return c;
}

export function findEscada(model: BlueprintModel, id: ObjectId): Escada {
  // `?? []` como no resto do módulo: modelo construído à mão em teste (e
  // payload anterior a 0.14.0) não tem a família.
  const e = (model.stairs ?? []).find((x) => x.id === id);
  if (!e) throw new KernelError('STAIR_NOT_FOUND', `Escada inexistente: ${id}`);
  return e;
}

export function findAgua(model: BlueprintModel, id: ObjectId): Agua {
  // `?? []` como no resto do módulo: modelo construído à mão em teste (e payload
  // anterior a 0.12.0) não tem a família, e procurar nela não pode explodir.
  const r = (model.roofs ?? []).find((e) => e.id === id);
  if (!r) throw new KernelError('ROOF_NOT_FOUND', `Água de telhado inexistente: ${id}`);
  return r;
}

/** O mínimo que `pontasDeslocadas` precisa saber: um id e duas pontas. */
export interface SegmentoIdentificado {
  id: ObjectId;
  a: Point;
  b: Point;
}

/**
 * A que distância uma ponta ainda conta como PRESA a um segmento.
 *
 * É `DEFAULT_TOLERANCE_MM` de propósito, e não meia espessura da parede: a
 * autoridade sobre "quem está ligado a quem" neste kernel é o arranjo planar, e
 * ele funde vértices exatamente nessa tolerância. Meia espessura é a régua das
 * ferramentas de REPARO (`encostosSemJuncao`, `cantosEncostados`), que são
 * generosas de propósito porque o usuário pediu para consertar. Um gesto de
 * arraste não pediu nada: usar a régua generosa aqui arrastaria junto uma parede
 * que passa a 7 cm da outra e que ninguém considera encostada.
 */
const FAIXA_DE_PRESA_MM = DEFAULT_TOLERANCE_MM;

/** Uma ponta que perdeu o encontro que tinha. */
export interface PontaDesencostada {
  id: ObjectId;
  end: 'a' | 'b';
}

export interface DeslocamentoDeSegmentos {
  /** Só os segmentos que se mexem, com as pontas novas. */
  destinos: Map<ObjectId, { a: Point; b: Point }>;
  /**
   * Junções que o deslocamento NÃO conseguiu manter. A prévia do arraste desenha
   * um anel de alerta nelas, para o desencosto aparecer ANTES de largar o botão —
   * hoje o usuário só descobre depois, pelo aviso no painel lateral, e às vezes
   * várias edições depois.
   */
  soltas: PontaDesencostada[];
}

/**
 * Distância de um ponto à RETA que passa por `a` e `b` — não ao segmento.
 *
 * A vizinha colinear continua a reta PARA ALÉM da ponta do hospedeiro, então
 * medir contra o segmento a rejeitaria justamente no caso que interessa.
 */
function distanciaAReta(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return Infinity;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / comp;
}

/**
 * Onde cada ponta PARA depois de deslocar um conjunto de segmentos.
 *
 * Devolve só os que se mexem, com as pontas novas. Não altera nada: é a conta,
 * separada de quem a aplica.
 *
 * Existe separada do comando `TranslateEntities` para que a PRÉVIA do arraste e
 * o COMANDO gravado sejam a mesma geometria. Uma prévia que não bate com o
 * resultado ensina o usuário a não confiar nela — e a alternativa, reimplementar
 * a regra no renderizador, é a cópia que diverge em silêncio (foi assim que a
 * regra de ponta livre ficou certa na tela e errada no papel).
 *
 * ⚠️ **Recebe PAREDES E LIMITES juntos, e isso não é generalização gratuita.**
 * Enquanto só olhava paredes, arrastar um bloco com junção mantida deixava para
 * trás qualquer divisa encostada nele — o anel do lote abria e o ambiente
 * derivado sumia, sem erro nenhum na tela. As duas famílias têm de estar na
 * MESMA conta para que a vizinhança seja vista.
 *
 * ## `manterJuncoes` — a diferença entre MANTER e SOLTAR
 *
 * Desligado, o bloco se desprende, mantendo as próprias medidas (o MOVE do CAD).
 * Ligado, a ponta de um segmento NÃO selecionado que estava presa ao bloco
 * acompanha — e **acompanha só pela componente de `delta` paralela ao eixo dela
 * mesma** (`componenteNoEixo`).
 *
 * Essa projeção é a regra inteira, e o motivo é este: projetada no próprio eixo,
 * a vizinha só pode mudar de COMPRIMENTO, nunca de direção. A versão anterior
 * transladava a vizinha pelo `delta` cru, e bastava arrastar uma parede ao longo
 * de si mesma para as perpendiculares presas nas pontas virarem diagonal — o que
 * é PIOR que desencostar, porque o anel continua fechado, nenhum diagnóstico
 * dispara, e a área do ambiente sai calculada num cômodo torto.
 *
 * Duas consequências, ambas desejadas:
 *
 * - Arrastar uma parede **perpendicular a si mesma** (o caso comum, "afasta 30
 *   cm") preserva toda junção: as vizinhas encurtam ou alongam, a 90°.
 * - Arrastar uma parede **paralela a si mesma** não move as perpendiculares, e um
 *   canto em L acaba se soltando. Isso é geometricamente forçado — não existe
 *   resposta que mantenha o canto sem deformar alguém — e por isso a ponta entra
 *   em `soltas` em vez de sumir em silêncio. Já um T sobre um corpo longo
 *   sobrevive: o pé só desliza para outro ponto do mesmo corpo.
 *
 * **Vizinha presa pelas DUAS pontas** (parede que faz ponte entre dois segmentos
 * selecionados) é a exceção: translada pelo `delta` cheio, porque está sendo
 * carregada rigidamente entre dois hospedeiros que andam juntos.
 *
 * "Presa" cobre o vértice compartilhado E o **encosto em T** — ponta que morre no
 * meio do corpo do outro. Casar só por coordenada exata (`pointKey`) era o furo
 * que fazia o modo ESTICAR desencostar justamente nos T, que é o caso para o qual
 * `encostosSemJuncao` existe.
 *
 * ⚠️ **Os selecionados andam sempre rígidos.** Se a ponta de um segmento
 * SELECIONADO repousava no corpo de um não selecionado e o bloco saiu de cima
 * dele, aquela ponta solta — adaptar o selecionado quebraria a garantia de que o
 * comprimento é preservado e as aberturas não saem de posição.
 */
export function pontasDeslocadas(
  segmentos: SegmentoIdentificado[],
  idsSelecionados: ObjectId[],
  delta: Point,
  manterJuncoes: boolean,
): DeslocamentoDeSegmentos {
  const selecionados = new Set(idsSelecionados);
  const alvos = segmentos.filter((s) => selecionados.has(s.id));

  const andar = (p: Point): Point => ({ x: p.x + delta.x, y: p.y + delta.y });
  const destinos = new Map<ObjectId, { a: Point; b: Point }>();
  const soltas: PontaDesencostada[] = [];

  for (const s of alvos) destinos.set(s.id, { a: andar(s.a), b: andar(s.b) });

  if (!manterJuncoes || alvos.length === 0) return { destinos, soltas };

  // OS ALVOS COMO ESTAVAM, ANTES DE QUALQUER DESLOCAMENTO. Procurar a vizinhança
  // no lugar novo casaria com onde a vizinha justamente NÃO está.
  const alvoDe = new Map(alvos.map((s) => [s.id, s]));

  /**
   * A qual selecionado esta ponta está presa — o mais próximo, e em empate o de
   * menor id. Determinismo não é preciosismo aqui: dois arrastes iguais têm de
   * produzir o mesmo modelo, ou o hash do rascunho passa a variar sozinho.
   */
  const hospedeiroDe = (p: Point): SegmentoIdentificado | null => {
    let melhor: { host: SegmentoIdentificado; d: number } | null = null;
    for (const alvo of alvos) {
      const proj = projecaoNoSegmento(p, alvo.a, alvo.b);
      if (!proj || proj.distanciaMm > FAIXA_DE_PRESA_MM) continue;
      if (!melhor || proj.distanciaMm < melhor.d || (proj.distanciaMm === melhor.d && alvo.id < melhor.host.id)) {
        melhor = { host: alvo, d: proj.distanciaMm };
      }
    }
    return melhor?.host ?? null;
  };

  /** A junção sobreviveu? Isto é: a ponta nova ainda encosta no hospedeiro deslocado. */
  const aindaEncosta = (p: Point, host: SegmentoIdentificado): boolean => {
    const proj = projecaoNoSegmento(p, andar(host.a), andar(host.b));
    return !!proj && proj.distanciaMm <= FAIXA_DE_PRESA_MM;
  };

  for (const s of segmentos) {
    if (selecionados.has(s.id)) continue;

    const hostA = hospedeiroDe(s.a);
    const hostB = hospedeiroDe(s.b);
    if (!hostA && !hostB) continue;

    // PONTE entre dois selecionados: os dois hospedeiros andaram o mesmo delta,
    // então a ponte é carregada inteira. Projetar cada ponta no eixo dela a
    // encolheria sem que ninguém tenha pedido.
    if (hostA && hostB) {
      destinos.set(s.id, { a: andar(s.a), b: andar(s.b) });
      continue;
    }

    const end: 'a' | 'b' = hostA ? 'a' : 'b';
    const host = (hostA ?? hostB) as SegmentoIdentificado;
    const movel = s[end];
    const fixo = end === 'a' ? s.b : s.a;

    // ── VIZINHA COLINEAR ANDA INTEIRA ────────────────────────────────────────
    //
    // Ela é a CONTINUAÇÃO do segmento movido, na mesma reta. A projeção no
    // próprio eixo não a leva a lugar nenhum quando o deslocamento é
    // perpendicular — e o encontro se desfaz.
    //
    // Não dá para resolver movendo só a ponta: a colinear ficaria DIAGONAL, e
    // quando ela é uma DIVISA isso muda a medida e o rumo de uma linha da
    // escritura. Andando inteira, comprimento e rumo ficam exatos e a junta se
    // preserva.
    //
    // ⚠️ UM SALTO SÓ, de propósito. A outra ponta dela pode se soltar de quem
    // estiver lá, e isso é reportado em `soltas` como qualquer outro desencosto.
    // Propagar seria empurrar o desenho inteiro a partir de um gesto local, sem
    // regra de parada.
    const colinear =
      projecaoNoSegmento(s.a, host.a, host.b) !== null &&
      distanciaAReta(s.a, host.a, host.b) <= FAIXA_DE_PRESA_MM &&
      distanciaAReta(s.b, host.a, host.b) <= FAIXA_DE_PRESA_MM;
    if (colinear) {
      destinos.set(s.id, { a: andar(s.a), b: andar(s.b) });
      continue;
    }

    const passo = componenteNoEixo(delta, fixo, movel);
    const novo: Point = { x: movel.x + passo.x, y: movel.y + passo.y };

    // COLAPSO. A vizinha encolheria até o comprimento zero, que
    // `assertModelInvariants` recusa com `DEGENERATE_WALL`. Lançar aqui abortaria
    // o gesto inteiro — inclusive a parte que estava certa. A ponta fica onde
    // está e o desencosto é reportado, que é o que o usuário pode agir.
    if (novo.x === fixo.x && novo.y === fixo.y) {
      soltas.push({ id: s.id, end });
      continue;
    }

    destinos.set(s.id, {
      a: end === 'a' ? novo : s.a,
      b: end === 'b' ? novo : s.b,
    });
    if (!aindaEncosta(novo, host)) soltas.push({ id: s.id, end });
  }

  // Ordem determinística, pelo mesmo motivo do `hospedeiroDe`.
  soltas.sort((x, y) => (x.id === y.id ? x.end.localeCompare(y.end) : x.id.localeCompare(y.id)));
  return { destinos, soltas };
}

/**
 * Onde as pontas param quando se move UM VÉRTICE, e não um corpo.
 *
 * É outra regra, de propósito. Arrastar o corpo de uma parede exige RECONSTRUIR a
 * junta (a vizinha se ajusta pelo próprio eixo); arrastar um vértice MOVE a
 * junta, e então tudo que estava nele simplesmente vai junto para o lugar novo.
 * Tratar os dois gestos com a mesma conta faria o canto de um retângulo abrir ao
 * ser esticado pela alça — que é exatamente o que o campo de comprimento do
 * painel já evitava à mão, e o gesto não.
 *
 * `de` é o vértice como estava; `para`, onde ele fica. Acompanham:
 *
 * - toda ponta de outro segmento que estava em `de` (dentro da faixa de encosto);
 * - toda ponta que repousava no CORPO do segmento movido, reprojetada no corpo
 *   novo — o T que o casamento por coordenada exata nunca via.
 *
 * Não devolve `soltas`: mover um vértice não desfaz junção nenhuma por
 * construção, ao contrário de mover um corpo.
 */
export function pontasNoVerticeMovido(
  segmentos: SegmentoIdentificado[],
  movidoId: ObjectId,
  de: Point,
  para: Point,
  corpoNovo: { a: Point; b: Point },
): Map<ObjectId, { a: Point; b: Point }> {
  const movido = segmentos.find((s) => s.id === movidoId);
  const faixa = FAIXA_DE_PRESA_MM;
  const saida = new Map<ObjectId, { a: Point; b: Point }>();
  if (de.x === para.x && de.y === para.y) return saida;

  for (const s of segmentos) {
    if (s.id === movidoId) continue;

    const novo: { a?: Point; b?: Point } = {};
    for (const end of ['a', 'b'] as const) {
      const p = s[end];

      // 1. Estava no vértice que se moveu → vai para o lugar novo.
      if (pointKey(p) === pointKey(de) || Math.hypot(p.x - de.x, p.y - de.y) <= faixa) {
        novo[end] = { x: para.x, y: para.y };
        continue;
      }

      // 2. Repousava no CORPO do segmento movido → reencontra o corpo novo. Sem
      //    isto, esticar uma parede que hospeda uma divisória em T deixa a
      //    divisória pendurada no ar — a limitação que o painel documentava.
      if (!movido) continue;
      const antes = projecaoNoSegmento(p, movido.a, movido.b);
      if (!antes || antes.distanciaMm > faixa) continue;
      const depois = projecaoNoSegmento(p, corpoNovo.a, corpoNovo.b);
      if (!depois || depois.distanciaMm <= faixa) continue; // ainda encosta: nada a fazer

      // O pé desliza pelo PRÓPRIO EIXO até o corpo novo — não é o pé da
      // perpendicular. O pé da perpendicular é o ponto mais PRÓXIMO, e ao movê-lo
      // para lá a divisória sai do prumo: uma parede vertical hospedada numa
      // parede que foi inclinada viraria oblíqua também, que é justamente a
      // deformação silenciosa que esta regra existe para não cometer.
      const oposta = end === 'a' ? s.b : s.a;
      const encontro = cantoEntreEixos(oposta, p, corpoNovo.a, corpoNovo.b);
      // Eixos quase paralelos, ou encontro fora do corpo: não há para onde
      // deslizar sem inventar geometria. A ponta fica, e o arranjo passa a
      // acusá-la como solta — que é a verdade.
      if (!encontro) continue;
      const dentro = projecaoNoSegmento(encontro, corpoNovo.a, corpoNovo.b);
      if (!dentro || dentro.distanciaMm > faixa) continue;
      novo[end] = encontro;
    }

    if (!novo.a && !novo.b) continue;
    const a = novo.a ?? s.a;
    const b = novo.b ?? s.b;
    // Ponta que colapsaria o segmento fica onde está: o kernel recusaria o
    // modelo inteiro por comprimento zero, e o gesto do usuário não pediu isso.
    if (a.x === b.x && a.y === b.y) continue;
    saida.set(s.id, { a, b });
  }

  return saida;
}

/** Comprimento do eixo da parede, em mm inteiros. */
export function wallLength(wall: Wall): number {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

/**
 * Uma ponta de parede é LIVRE quando nada a encosta.
 *
 * Serve ao desenho: em ponta que encontra outra parede, a pincelada precisa ser
 * ESTENDIDA em meia espessura, senão sobra um quadrado vazio no canto externo —
 * o degrau que já apareceu em uso duas vezes, uma na tela e outra no papel.
 *
 * Contar só PONTAS não basta: numa junção em T a divisória termina no MEIO da
 * parede que a recebe, e aquele ponto não é ponta de ninguém. Sem o teste de
 * pertinência ao corpo das outras, ela seria classificada como livre e ganharia
 * um tampo, desenhando uma linha atravessada dentro da junção.
 *
 * Vive no kernel, e não em cada renderizador, porque é GEOMETRIA — não estilo.
 * Duas cópias divergem: foi exatamente o que aconteceu quando a exportação
 * nasceu sem esta regra e o canto voltou a falhar só no papel.
 */
export function isFreeWallEnd(walls: Wall[], p: Point, exceptId: ObjectId): boolean {
  let encontros = 0;
  for (const w of walls) {
    if (w.a.x === p.x && w.a.y === p.y) encontros++;
    if (w.b.x === p.x && w.b.y === p.y) encontros++;
  }
  if (encontros > 1) return false;

  for (const o of walls) {
    if (o.id === exceptId) continue;
    const dx = o.b.x - o.a.x;
    const dy = o.b.y - o.a.y;
    const comp2 = dx * dx + dy * dy;
    if (comp2 === 0) continue;
    let t = ((p.x - o.a.x) * dx + (p.y - o.a.y) * dy) / comp2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(o.a.x + t * dx - p.x, o.a.y + t * dy - p.y);
    if (d <= o.thicknessMm / 2) return false;
  }
  return true;
}

/**
 * Teto do avanço, em múltiplos de meia espessura. Canto muito agudo pede avanço
 * que tende ao infinito; sem teto vira farpa. Mesmo espírito da mitra do eixo.
 */
const AVANCO_MAX = 4;

/**
 * Quanto a pincelada da parede avança ALÉM do eixo, na ponta que encontra
 * outra — em milímetros.
 *
 * ─── POR QUE NÃO É SEMPRE MEIA ESPESSURA ────────────────────────────────────
 *
 * Era. E meia espessura fecha o canto EXATAMENTE em 90°, que é o ângulo de
 * quase toda planta — por isso passou despercebido. Em qualquer outro ângulo a
 * conta erra: no canto obtuso (o hexágono tem 120°) a pincelada ultrapassa o
 * canto verdadeiro e sobra uma farpa; no agudo, falta e abre um degrau.
 *
 * A conta certa sai da geometria do canto. Com as duas paredes formando ângulo
 * θ no vértice, as faces externas se cruzam a `(t/2)/sen(θ/2)` dele; para a
 * tampa da pincelada passar por esse cruzamento, ela tem de avançar
 * `(t/2)/tg(θ/2)`. Em θ = 90° isso dá meia espessura — ou seja, toda planta
 * ortogonal desenha exatamente como desenhava.
 *
 * ─── ONDE ELA NÃO SE APLICA ─────────────────────────────────────────────────
 *
 * Só há canto quando DUAS paredes se encontram na ponta. Junção em X (três ou
 * mais) não tem um canto único para mitrar, e junção em T (a ponta morre no
 * meio da outra) não tem vértice compartilhado. Nos dois casos fica meia
 * espessura, que é o comportamento já verificado em uso.
 *
 * Vive no kernel, e não em cada renderizador, porque é GEOMETRIA. A regra
 * estava COPIADA na tela e na exportação, com a mesma conta errada nas duas —
 * e cópia de regra geométrica é o que já deixou o canto certo na tela e aberto
 * no papel uma vez.
 */
export function extensaoDeCanto(walls: Wall[], wall: Wall, end: 'a' | 'b'): number {
  const p = wall[end];
  if (isFreeWallEnd(walls, p, wall.id)) return 0;

  const meia = wall.thicknessMm / 2;

  const vizinhas = walls.filter(
    (o) =>
      o.id !== wall.id &&
      ((o.a.x === p.x && o.a.y === p.y) || (o.b.x === p.x && o.b.y === p.y)),
  );
  if (vizinhas.length !== 1) return meia;

  /** Direção que sai do vértice ao longo do eixo. */
  const versor = (w: Wall) => {
    const longe = w.a.x === p.x && w.a.y === p.y ? w.b : w.a;
    const dx = longe.x - p.x;
    const dy = longe.y - p.y;
    const comp = Math.hypot(dx, dy);
    return comp === 0 ? null : { x: dx / comp, y: dy / comp };
  };

  const u1 = versor(wall);
  const u2 = versor(vizinhas[0]);
  if (!u1 || !u2) return meia;

  const cos = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
  const tg = Math.tan(Math.acos(cos) / 2);
  if (!Number.isFinite(tg) || tg <= 1e-9) return meia * AVANCO_MAX;
  return Math.min(meia / tg, meia * AVANCO_MAX);
}

/**
 * Seno mínimo para uma vizinha CORTAR a face desta parede.
 *
 * O recuo de canto é `(t/2)/sen(θ)`, e isso diverge quando θ→0. Abaixo deste
 * piso as duas paredes são continuação uma da outra, não formam canto, e nada é
 * cortado — recuo zero.
 *
 * 0,14 ≈ 8°. O valor NÃO é novo: era a trava que `recuoDoCanto` (cadeia de
 * cotas) já aplicava, enquanto esta função aqui só barrava colinearidade exata.
 * As duas medem a mesma coisa por caminhos diferentes — a cota da cadeia e o
 * número por parede — e o comentário de `recuoDoCanto` sempre disse que elas não
 * podem divergir. Agora a régua é uma só, e mora aqui.
 */
export const SENO_MINIMO_MITRA = 0.14;

/**
 * RECUO ATÉ A FACE DA VIZINHA — quanto desta parede é engolido pela junção.
 *
 * ⚠️ NÃO confundir com `extensaoDeCanto`. São duas grandezas diferentes, e
 * confundi-las foi um defeito real (reportado em 27/08/2026, com print):
 *
 * | | fórmula | depende de |
 * |---|---|---|
 * | avanço de mitra (DESENHO) | `(t_própria/2) / tg(θ/2)` | espessura PRÓPRIA |
 * | recuo até a face (MEDIDA) | `(t_vizinha/2) / sen(θ)` | espessura da VIZINHA |
 *
 * Com espessura uniforme e canto reto as duas valem `t/2` e coincidem — foi por
 * isso que o erro passou por toda uma bateria de testes: todos usavam espessura
 * uniforme. Numa divisória de 10 cm morrendo numa parede de 30 cm, o recuo é
 * 15 cm (metade DA OUTRA), não 5.
 *
 * Acha a vizinha das duas formas que a junção existe: **vértice compartilhado**
 * (canto) e **pertinência ao corpo** (junção em T, onde a divisória morre no
 * meio da hospedeira e aquele ponto não é ponta de ninguém).
 *
 * Vizinha COLINEAR não conta: sem ângulo não há face atravessada, e dividir por
 * `sen(0)` estouraria.
 */
export function recuoAteFace(walls: Wall[], wall: Wall, end: 'a' | 'b'): number {
  const p = wall[end];
  if (isFreeWallEnd(walls, p, wall.id)) return 0;

  const longe = end === 'a' ? wall.b : wall.a;
  const dx = longe.x - p.x;
  const dy = longe.y - p.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return 0;
  const ux = dx / comp;
  const uy = dy / comp;

  let maior = 0;
  for (const o of walls) {
    if (o.id === wall.id) continue;

    const compartilhaVertice =
      (o.a.x === p.x && o.a.y === p.y) || (o.b.x === p.x && o.b.y === p.y);

    // Junção em T: o vértice cai DENTRO da faixa desenhada da hospedeira.
    const odx = o.b.x - o.a.x;
    const ody = o.b.y - o.a.y;
    const ocomp2 = odx * odx + ody * ody;
    if (ocomp2 === 0) continue;
    let t = ((p.x - o.a.x) * odx + (p.y - o.a.y) * ody) / ocomp2;
    t = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(o.a.x + t * odx - p.x, o.a.y + t * ody - p.y);
    const noCorpo = dist <= o.thicknessMm / 2;

    if (!compartilhaVertice && !noCorpo) continue;

    const ocomp = Math.sqrt(ocomp2);
    // |u × v| = sen do ângulo entre os eixos.
    const sen = Math.abs(ux * (ody / ocomp) - uy * (odx / ocomp));
    // RASANTE NÃO FECHA CANTO — e sem este piso a conta explode.
    //
    // A trava antiga era `sen < 1e-6`, isto é, só colinearidade EXATA. Mas o
    // recuo é `(t/2)/sen`, então ele cresce sem limite quando o ângulo diminui:
    // medido numa parede de 9,00 m com espessura 150, uma vizinha a 1° come
    // 4,29 m e a 0,5° come 8,57 m — sobra "int. 0,43 m" numa parede de nove
    // metros. Em planta gerada de PDF, parede que deveria ser continuação da
    // outra chega com décimos de grau de desvio o tempo todo, e o número
    // interno saía absurdo sem nada na tela denunciando.
    if (sen < SENO_MINIMO_MITRA) continue;

    const recuo = o.thicknessMm / 2 / sen;
    if (recuo > maior) maior = recuo;
  }
  return maior;
}

/**
 * Comprimento da FACE INTERNA da parede — o vão livre entre as faces vizinhas.
 *
 * É o que se constrói e o que se confere com a trena: a parede vai da face de
 * uma vizinha até a face da outra, não de eixo a eixo.
 *
 * ⚠️ Usa `recuoAteFace`, e NÃO `extensaoDeCanto`. A primeira versão desta
 * função usava a segunda, o que fazia o desconto sair pela espessura da própria
 * parede em vez da vizinha — certo só quando todas as paredes têm a mesma
 * espessura. Ver o quadro em `recuoAteFace`.
 *
 * Nunca negativa: numa parede mais curta que os próprios recuos (fragmento
 * entre duas aberturas) o vão livre é zero, não um número negativo.
 */
export function faceInternaMm(walls: Wall[], wall: Wall): number {
  const bruto =
    wallLength(wall) - recuoAteFace(walls, wall, 'a') - recuoAteFace(walls, wall, 'b');
  return Math.max(0, roundToMm(bruto));
}

/** Tolerância de ortogonalidade do laço, em cosseno. ~0,6° de folga. */
const COS_RETO = 0.01;

/**
 * O laço FECHADO de quatro paredes com os quatro cantos retos que contém esta
 * parede — em ordem de percurso. `null` quando não há.
 *
 * Serve ao vínculo entre lados opostos do retângulo: editar um lado tem de
 * mover o LADO inteiro do outro extremo, senão o canto abre e o retângulo vira
 * um quadrilátero irregular.
 *
 * ⚠️ **Só retângulo, e isso é decisão de produto, não preguiça.** Num laço de
 * quatro lados não retos "manter a geometria" não tem definição única — dá
 * para preservar os ângulos, os lados opostos ou a área, e as três dão
 * resultados diferentes. Fora do retângulo, o comportamento antigo continua.
 */
export function retanguloDoLaco(walls: Wall[], wall: Wall): Wall[] | null {
  const doNivel = walls.filter((w) => w.levelId === wall.levelId);
  const mesmo = (p: Point, q: Point) => p.x === q.x && p.y === q.y;

  // Caminha a partir de `wall`, sempre para a ponta ainda não visitada.
  const laco: Wall[] = [wall];
  let atual = wall;
  let vertice = wall.b;

  for (let i = 0; i < 4; i++) {
    const vizinhas = doNivel.filter(
      (o) => o.id !== atual.id && (mesmo(o.a, vertice) || mesmo(o.b, vertice)),
    );
    // Vértice com zero ou mais de uma continuação não é canto de retângulo: é
    // ponta solta ou junção em X, e nos dois casos não há laço único.
    if (vizinhas.length !== 1) return null;
    const proxima = vizinhas[0];
    if (proxima.id === wall.id) {
      // Voltou ao início: o laço fecha aqui.
      return laco.length === 4 && cantosRetos(laco) ? laco : null;
    }
    if (laco.length >= 4) return null;
    laco.push(proxima);
    vertice = mesmo(proxima.a, vertice) ? proxima.b : proxima.a;
    atual = proxima;
  }
  return null;
}

/** Os quatro cantos do laço são retos? */
function cantosRetos(laco: Wall[]): boolean {
  for (let i = 0; i < laco.length; i++) {
    const w = laco[i];
    const prox = laco[(i + 1) % laco.length];
    const u1 = versorDaParede(w);
    const u2 = versorDaParede(prox);
    if (!u1 || !u2) return false;
    if (Math.abs(u1.x * u2.x + u1.y * u2.y) > COS_RETO) return false;
  }
  return true;
}

function versorDaParede(w: Wall): { x: number; y: number } | null {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const comp = Math.hypot(dx, dy);
  return comp === 0 ? null : { x: dx / comp, y: dy / comp };
}

/**
 * O vértice que precisa andar JUNTO para o retângulo continuar retângulo.
 *
 * Movendo a ponta `ponta` de `wall`, o canto que ela forma anda. Sozinho, isso
 * inclina o lado perpendicular. Transladando também o OUTRO extremo desse lado
 * pelo mesmo vetor, o lado inteiro anda: os dois lados paralelos ao editado
 * ficam com o mesmo comprimento novo e os quatro ângulos seguem retos.
 *
 * `null` quando a parede não está num retângulo — e aí o chamador mantém o
 * comportamento antigo.
 */
export function verticeDeAcompanhamento(
  walls: Wall[],
  wall: Wall,
  ponta: 'a' | 'b',
): Point | null {
  const laco = retanguloDoLaco(walls, wall);
  if (!laco) return null;

  const p = wall[ponta];
  const mesmo = (x: Point, y: Point) => x.x === y.x && x.y === y.y;

  // O lado perpendicular que nasce no vértice que vai andar.
  const perpendicular = laco.find(
    (o) => o.id !== wall.id && (mesmo(o.a, p) || mesmo(o.b, p)),
  );
  if (!perpendicular) return null;

  // O outro extremo desse lado — é ele que translada junto.
  return mesmo(perpendicular.a, p) ? perpendicular.b : perpendicular.a;
}

/**
 * Invariantes do PRD §9.1 que o kernel se recusa a violar.
 * Roda a cada comando aplicado — barato, e transforma bug silencioso em erro.
 */
export function assertModelInvariants(model: BlueprintModel): void {
  // ── Identidade ────────────────────────────────────────────────────────────
  //
  // Um uid, um elemento. É a rede que pega o `{ ...original, id }` que copiou
  // uma peça e esqueceu de trocar o uid — o erro que faria duas paredes
  // reivindicarem o mesmo GUID no IFC e a mesma linha em `blueprint_objects`.
  //
  // Elemento SEM uid é tolerado aqui de propósito: o tipo exige o campo (todo
  // caminho de criação do kernel o preenche), mas modelo construído à mão em
  // teste não passa pelos comandos. Na serialização ele sai como `null` e a
  // leitura deriva um — degradação conhecida, nunca silêncio sobre duplicata.
  const uids = new Set<ElementUid>();
  const familias: [string, { id: ObjectId; uid?: ElementUid }[]][] = [
    ['Pavimento', model.levels],
    ['Parede', model.walls],
    ['Abertura', model.openings],
    ['Limite', model.boundaries],
    ['Peça estrutural', model.structures ?? []],
    ['Água de telhado', model.roofs ?? []],
    ['Corte', model.sections ?? []],
    ['Etiqueta', model.labels ?? []],
  ];
  for (const [nome, itens] of familias) {
    for (const item of itens) {
      if (!item.uid) continue;
      if (!EH_UID.test(item.uid)) {
        throw new KernelError('BAD_UID', `${nome} ${item.id} com uid fora do formato: ${item.uid}`);
      }
      if (uids.has(item.uid)) {
        throw new KernelError('DUPLICATE_UID', `${nome} ${item.id} repete o uid ${item.uid}`);
      }
      uids.add(item.uid);
    }
  }

  for (const wall of model.walls) {
    if (wall.a.x === wall.b.x && wall.a.y === wall.b.y) {
      throw new KernelError('DEGENERATE_WALL', `Parede de comprimento zero: ${wall.id}`);
    }
    // ── A COMPOSIÇÃO ────────────────────────────────────────────────────────
    //
    // Só quando existe: parede sem camadas é homogênea e não tem o que checar.
    //
    // ANTES da checagem de espessura, de propósito: numa parede com camadas a
    // espessura é DERIVADA da soma, então uma lista vazia chega aqui com
    // `thicknessMm` zerado e sairia como `BAD_THICKNESS` — uma mensagem que
    // manda o leitor procurar a espessura, que é justamente o campo que não tem
    // problema nenhum. Parede homogênea de espessura zero continua caindo em
    // `BAD_THICKNESS` logo abaixo, porque este bloco é pulado.
    if (wall.camadas !== undefined) {
      // Lista vazia é ERRO, e não sinônimo de ausente. Duas escritas para o
      // mesmo estado fariam o round-trip do payload parar de fechar byte a byte:
      // `[]` não é emitido no canônico, então voltaria como ausente e o modelo
      // relido não seria idêntico ao que o gravou.
      if (wall.camadas.length === 0) {
        throw new KernelError(
          'EMPTY_LAYERS',
          `Parede ${wall.id} com lista de camadas vazia — use ausente para homogênea`,
        );
      }

      for (const [i, c] of wall.camadas.entries()) {
        if (c.espessuraMm <= 0) {
          throw new KernelError(
            'BAD_LAYER_THICKNESS',
            `Camada ${i + 1} de ${wall.id} com espessura não positiva`,
          );
        }
        assertIntegerMm(c.espessuraMm, `${wall.id}.camadas[${i}].espessuraMm`);
      }

      // O INVARIANTE QUE SUSTENTA TUDO. `thicknessMm` continua sendo a única
      // espessura que a geometria lê (cotas, recuo da área de piso, imã, canto
      // mitrado, perfil do IFC); as camadas são a decomposição dela. Se as duas
      // pudessem divergir, a parede seria desenhada com uma medida e orçada com
      // outra, e nada na tela diria qual das duas está errada.
      const soma = somaDasCamadas(wall.camadas);
      if (soma !== wall.thicknessMm) {
        throw new KernelError(
          'LAYERS_THICKNESS_MISMATCH',
          `Camadas de ${wall.id} somam ${soma} mm, mas a parede tem ${wall.thicknessMm} mm`,
        );
      }
    }

    if (wall.thicknessMm <= 0) {
      throw new KernelError('BAD_THICKNESS', `Espessura não positiva em ${wall.id}`);
    }
    assertIntegerMm(wall.thicknessMm, `${wall.id}.thicknessMm`);
  }

  const seen = new Set<ObjectId>();
  for (const opening of model.openings) {
    if (seen.has(opening.id)) {
      throw new KernelError('DUPLICATE_ID', `Abertura duplicada: ${opening.id}`);
    }
    seen.add(opening.id);

    const wall = model.walls.find((w) => w.id === opening.wallId);
    if (!wall) {
      // §9.1: cada abertura tem no máximo uma parede hospedeira na mesma versão.
      throw new KernelError('ORPHAN_OPENING', `Abertura ${opening.id} sem parede hospedeira`);
    }

    const limit = wallLength(wall);
    if (opening.offsetMm < 0 || opening.offsetMm + opening.widthMm > limit) {
      throw new KernelError(
        'OPENING_OUT_OF_BOUNDS',
        `Abertura ${opening.id} excede a parede ${wall.id} (${opening.offsetMm}+${opening.widthMm} > ${limit})`,
      );
    }

    // A abertura também tem que caber na ALTURA da parede, e isso não é
    // preciosismo: o quantitativo desconta `largura × altura` da face
    // (`quantities.ts`), então uma porta mais alta que a parede produziria área
    // líquida e VOLUME NEGATIVOS — número absurdo saindo calado, no orçamento.
    //
    // A trava nasce agora porque só agora a altura virou editável. Enquanto ela
    // era um 2100 fixo dentro de uma parede de 2800, o caso era inalcançável.
    if (opening.heightMm <= 0) {
      throw new KernelError('BAD_OPENING_HEIGHT', `Altura não positiva em ${opening.id}`);
    }
    if (opening.sillMm < 0) {
      throw new KernelError('BAD_SILL', `Peitoril negativo em ${opening.id}`);
    }
    if (opening.sillMm + opening.heightMm > wall.heightMm) {
      throw new KernelError(
        'OPENING_TALLER_THAN_WALL',
        `Abertura ${opening.id} não cabe na altura da parede ${wall.id} (${opening.sillMm}+${opening.heightMm} > ${wall.heightMm})`,
      );
    }

    // Esquadria sem NOME não é tipo — é um item solto sem como ser chamado no
    // quadro. `itemCode` vazio é legítimo (tipo nomeado antes de escolher o
    // item, como a camada sem material); nome vazio não. E vão livre não tem
    // esquadria por definição: não há caixilho a comprar.
    if (opening.esquadria) {
      if (!opening.esquadria.nome.trim()) {
        throw new KernelError('BAD_ESQUADRIA', `Esquadria de ${opening.id} sem nome`);
      }
      if (opening.kind === 'passage') {
        throw new KernelError('BAD_ESQUADRIA', `Vão livre ${opening.id} não tem esquadria`);
      }
    }
  }

  // Duas aberturas não podem ocupar o mesmo trecho da mesma parede.
  const byWall = new Map<ObjectId, Opening[]>();
  for (const opening of model.openings) {
    const list = byWall.get(opening.wallId) ?? [];
    list.push(opening);
    byWall.set(opening.wallId, list);
  }
  for (const [wallId, list] of byWall) {
    const sorted = [...list].sort((x, y) => x.offsetMm - y.offsetMm);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.offsetMm + prev.widthMm > curr.offsetMm) {
        throw new KernelError(
          'OPENING_OVERLAP',
          `Aberturas ${prev.id} e ${curr.id} se sobrepõem na parede ${wallId}`,
        );
      }
    }
  }

  // ── Limites ──────────────────────────────────────────────────────────────
  //
  // Este laço faltava. Enquanto `AddBoundary` não tinha chamador na UI, um
  // limite degenerado era inalcançável; agora que se desenha terreno, ele passa
  // a ser um clique duplo no mesmo vértice. Limite de comprimento zero entra no
  // arranjo planar como aresta nula e some do anel do lote SEM ERRO — a área
  // sairia menor e nada na tela explicaria por quê.
  const idsDeLimite = new Set<ObjectId>();
  for (const b of model.boundaries) {
    if (idsDeLimite.has(b.id)) {
      throw new KernelError('DUPLICATE_ID', `Limite duplicado: ${b.id}`);
    }
    idsDeLimite.add(b.id);

    if (b.a.x === b.b.x && b.a.y === b.b.y) {
      throw new KernelError('DEGENERATE_BOUNDARY', `Limite de comprimento zero: ${b.id}`);
    }
    for (const [ponta, p] of [
      ['a', b.a],
      ['b', b.b],
    ] as const) {
      assertIntegerMm(p.x, `${b.id}.${ponta}.x`);
      assertIntegerMm(p.y, `${b.id}.${ponta}.y`);
    }
    if (!model.levels.some((l) => l.id === b.levelId)) {
      throw new KernelError('LEVEL_NOT_FOUND', `Limite ${b.id} num nível inexistente: ${b.levelId}`);
    }

    // Medida de escritura: mesma disciplina de milímetro inteiro do resto do
    // kernel. Não é preciosismo — ela é SUBTRAÍDA da medida desenhada para dar a
    // divergência, e um 12000,4 ali produziria um Δ fracionário que nenhuma das
    // duas medidas tem. `null` é ausência e passa direto: não se compara desenho
    // com escritura que ninguém informou.
    if (b.medidaEscrituraMm !== null && b.medidaEscrituraMm !== undefined) {
      assertIntegerMm(b.medidaEscrituraMm, `${b.id}.medidaEscrituraMm`);
      if (b.medidaEscrituraMm <= 0) {
        throw new KernelError(
          'BAD_MEDIDA_ESCRITURA',
          `Medida de escritura não positiva em ${b.id}: ${b.medidaEscrituraMm}`,
        );
      }
    }
  }

  // ── Estrutura ────────────────────────────────────────────────────────────
  //
  // As três travas daqui existem porque as três produzem NÚMERO ERRADO CALADO
  // no orçamento, não erro na tela: cardinalidade errada faz o volume ler um
  // ponto que não existe e sair `NaN`; medida não positiva devolve volume zero
  // ou negativo numa peça desenhada; e nível inexistente tira a peça do
  // quantitativo sem tirá-la do desenho.
  const idsDeEstrutura = new Set<ObjectId>();
  for (const s of model.structures ?? []) {
    if (idsDeEstrutura.has(s.id)) {
      throw new KernelError('DUPLICATE_ID', `Estrutura duplicada: ${s.id}`);
    }
    idsDeEstrutura.add(s.id);

    const forma = FORMA_ESTRUTURAL[s.kind];
    if (!forma) {
      throw new KernelError('BAD_STRUCTURAL_KIND', `Tipo estrutural desconhecido em ${s.id}: ${s.kind}`);
    }

    const minimo = pontosEsperados(s.kind);
    const cardinalidadeOk = forma === 'AREA' ? s.pontos.length >= minimo : s.pontos.length === minimo;
    if (!cardinalidadeOk) {
      throw new KernelError(
        'BAD_STRUCTURAL_POINTS',
        `${nomeDoTipoEstrutural(s.kind)} ${s.id} tem ${s.pontos.length} vértice(s); a forma ${forma} exige ${forma === 'AREA' ? `pelo menos ${minimo}` : minimo}`,
      );
    }

    s.pontos.forEach((p, i) => {
      assertIntegerMm(p.x, `${s.id}.pontos[${i}].x`);
      assertIntegerMm(p.y, `${s.id}.pontos[${i}].y`);
    });

    // Eixo de comprimento zero: a viga sairia com volume zero e continuaria
    // desenhada. Mesma armadilha que `DEGENERATE_BOUNDARY` cobre no limite.
    if (forma === 'LINHA' && pointKey(s.pontos[0]) === pointKey(s.pontos[1])) {
      throw new KernelError('DEGENERATE_STRUCTURAL', `${s.id} tem eixo de comprimento zero`);
    }

    // `larguraMm` não se aplica à laje (a área sai do anel), então só é exigida
    // nas outras duas formas. `alturaMm` é exigida sempre: é espessura na laje.
    if (s.alturaMm <= 0) {
      throw new KernelError('BAD_STRUCTURAL_SIZE', `Altura não positiva em ${s.id}`);
    }
    assertIntegerMm(s.alturaMm, `${s.id}.alturaMm`);
    assertIntegerMm(s.baseMm, `${s.id}.baseMm`);

    if (forma !== 'AREA') {
      if (s.larguraMm <= 0) {
        throw new KernelError('BAD_STRUCTURAL_SIZE', `Largura não positiva em ${s.id}`);
      }
      assertIntegerMm(s.larguraMm, `${s.id}.larguraMm`);
    }
    if (forma === 'PONTO' && !s.circular) {
      if (s.profundidadeMm <= 0) {
        throw new KernelError('BAD_STRUCTURAL_SIZE', `Profundidade não positiva em ${s.id}`);
      }
      assertIntegerMm(s.profundidadeMm, `${s.id}.profundidadeMm`);
    }

    if (!model.levels.some((l) => l.id === s.levelId)) {
      throw new KernelError(
        'LEVEL_NOT_FOUND',
        `Estrutura ${s.id} num nível inexistente: ${s.levelId}`,
      );
    }
  }

  // ── Telhado ──────────────────────────────────────────────────────────────
  //
  // Todas as travas daqui são da mesma família das da estrutura: produzem
  // NÚMERO ERRADO CALADO, não erro na tela. Um `beiralIndex` fora da faixa faz
  // `planoDaAgua` ler `pontos[undefined]` e a cota inteira sair `NaN`; área
  // projetada zero (vértices colineares) dá telhado sem área que continua
  // desenhado; e inclinação absurda por erro de digitação — 300 em vez de 30 —
  // produz um telhado de doze metros de altura que o 3D mostra e o quantitativo
  // aceita.
  const idsDeAgua = new Set<ObjectId>();
  for (const r of model.roofs ?? []) {
    if (idsDeAgua.has(r.id)) {
      throw new KernelError('DUPLICATE_ID', `Água de telhado duplicada: ${r.id}`);
    }
    idsDeAgua.add(r.id);

    if (r.pontos.length < 3) {
      throw new KernelError(
        'BAD_ROOF_POINTS',
        `Água ${r.id} tem ${r.pontos.length} vértice(s); um plano exige pelo menos 3`,
      );
    }
    r.pontos.forEach((p, i) => {
      assertIntegerMm(p.x, `${r.id}.pontos[${i}].x`);
      assertIntegerMm(p.y, `${r.id}.pontos[${i}].y`);
    });

    if (!Number.isInteger(r.beiralIndex) || r.beiralIndex < 0 || r.beiralIndex >= r.pontos.length) {
      throw new KernelError(
        'BAD_ROOF_EDGE',
        `Água ${r.id} aponta o beiral no lado ${r.beiralIndex}, e ela tem ${r.pontos.length} lados`,
      );
    }

    // O lado do beiral precisa ter comprimento: é dele que sai a direção do
    // caimento, e um lado nulo deixaria a água sem para onde subir.
    const proximo = r.pontos[(r.beiralIndex + 1) % r.pontos.length];
    if (pointKey(r.pontos[r.beiralIndex]) === pointKey(proximo)) {
      throw new KernelError('DEGENERATE_ROOF', `Água ${r.id} tem beiral de comprimento zero`);
    }

    // Área zero = todos os vértices colineares. O polígono não fecha superfície
    // nenhuma, e o telhado entraria no orçamento com 0,00 m².
    if (polygonArea(r.pontos) <= 0) {
      throw new KernelError('DEGENERATE_ROOF', `Água ${r.id} tem área projetada zero`);
    }

    if (!Number.isFinite(r.inclinacaoPct) || r.inclinacaoPct < 0) {
      throw new KernelError(
        'BAD_ROOF_SLOPE',
        `Inclinação negativa em ${r.id}: ${r.inclinacaoPct}%`,
      );
    }
    if (r.inclinacaoPct > AGUA_INCLINACAO_MAX_PCT) {
      throw new KernelError(
        'BAD_ROOF_SLOPE',
        `Inclinação de ${r.inclinacaoPct}% em ${r.id} passa do teto de ${AGUA_INCLINACAO_MAX_PCT}% — confira se não faltou dividir por 10`,
      );
    }

    if (r.espessuraMm <= 0) {
      throw new KernelError('BAD_ROOF_SIZE', `Espessura não positiva em ${r.id}`);
    }
    assertIntegerMm(r.espessuraMm, `${r.id}.espessuraMm`);
    assertIntegerMm(r.baseMm, `${r.id}.baseMm`);

    if (!model.levels.some((l) => l.id === r.levelId)) {
      throw new KernelError('LEVEL_NOT_FOUND', `Água ${r.id} num nível inexistente: ${r.levelId}`);
    }
  }

  // ── Corte ────────────────────────────────────────────────────────────────
  //
  // Duas travas, e as duas produzem desenho vazio em vez de erro: linha de
  // comprimento zero não define plano nenhum (a normal sai indefinida e a vista
  // inteira some), e um lado que não é 'ESQUERDA' nem 'DIREITA' faria a
  // classificação cair no ramo errado e mostrar a metade que devia ser
  // descartada — um corte que parece um corte e mostra a casa ao contrário.
  const idsDeCorte = new Set<ObjectId>();
  for (const c of model.sections ?? []) {
    if (idsDeCorte.has(c.id)) {
      throw new KernelError('DUPLICATE_ID', `Corte duplicado: ${c.id}`);
    }
    idsDeCorte.add(c.id);

    if (c.a.x === c.b.x && c.a.y === c.b.y) {
      throw new KernelError('DEGENERATE_SECTION', `Corte ${c.id} tem comprimento zero`);
    }
    for (const [ponta, p] of [
      ['a', c.a],
      ['b', c.b],
    ] as const) {
      assertIntegerMm(p.x, `${c.id}.${ponta}.x`);
      assertIntegerMm(p.y, `${c.id}.${ponta}.y`);
    }

    if (c.olharPara !== 'ESQUERDA' && c.olharPara !== 'DIREITA') {
      throw new KernelError(
        'BAD_SECTION_SIDE',
        `Corte ${c.id} olha para "${c.olharPara}" — só ESQUERDA ou DIREITA`,
      );
    }
  }


  // ── Escada e rampa ───────────────────────────────────────────────────────
  //
  // As travas param o que produziria DESENHO PLAUSÍVEL E ERRADO, e nada além
  // disso. Percurso de um ponto só não define direção nenhuma; largura não
  // positiva desenha uma escada de espessura zero que o 3D some e o
  // quantitativo aceita com 0,00 m²; alvo de espelho zero faz a contagem de
  // degraus dividir por zero e sair infinita.
  //
  // ⚠️ O que NÃO está aqui é proposital: Blondel (2·espelho + piso entre 630 e
  // 650 mm) e o espelho de 160–180 mm da NBR 9050 são AVISO no painel, não
  // recusa. Uma escada fora dessa faixa é ruim, não é indesenhável — e recusar
  // travaria o usuário no meio do traçado, quando o percurso ainda está curto
  // porque ele ainda está desenhando. É a mesma escolha das pontas soltas.
  const idsDeEscada = new Set<ObjectId>();
  for (const e of model.stairs ?? []) {
    if (idsDeEscada.has(e.id)) {
      throw new KernelError('DUPLICATE_ID', `Escada duplicada: ${e.id}`);
    }
    idsDeEscada.add(e.id);

    if (e.pontos.length < 2) {
      throw new KernelError(
        'BAD_STAIR_POINTS',
        `${e.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${e.id} tem ${e.pontos.length} vértice(s); um percurso exige pelo menos 2`,
      );
    }
    e.pontos.forEach((p, i) => {
      assertIntegerMm(p.x, `${e.id}.pontos[${i}].x`);
      assertIntegerMm(p.y, `${e.id}.pontos[${i}].y`);
    });

    // Comprimento zero = todos os vértices no mesmo lugar. Não há por onde
    // subir, e o desenho sairia como um retângulo parado no chão.
    let comprimento = 0;
    for (let i = 0; i + 1 < e.pontos.length; i++) {
      comprimento += Math.hypot(
        e.pontos[i + 1].x - e.pontos[i].x,
        e.pontos[i + 1].y - e.pontos[i].y,
      );
    }
    if (comprimento <= 0) {
      throw new KernelError(
        'DEGENERATE_STAIR',
        `${e.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${e.id} tem percurso de comprimento zero`,
      );
    }

    if (e.larguraMm <= 0) {
      throw new KernelError('BAD_STAIR_WIDTH', `Largura não positiva em ${e.id}`);
    }
    assertIntegerMm(e.larguraMm, `${e.id}.larguraMm`);

    if (!Number.isFinite(e.alvoEspelhoMm) || e.alvoEspelhoMm <= 0 || e.alvoEspelhoMm > 1000) {
      throw new KernelError(
        'BAD_STAIR_RISER',
        `Alvo de espelho de ${e.alvoEspelhoMm} mm em ${e.id} — o campo é o espelho de UM degrau, em milímetro`,
      );
    }
    assertIntegerMm(e.alvoEspelhoMm, `${e.id}.alvoEspelhoMm`);

    if (e.tipo !== 'ESCADA' && e.tipo !== 'RAMPA') {
      throw new KernelError('BAD_STAIR_KIND', `Tipo "${e.tipo}" em ${e.id} — só ESCADA ou RAMPA`);
    }

    if (!model.levels.some((l) => l.id === e.levelId)) {
      throw new KernelError('LEVEL_NOT_FOUND', `Escada ${e.id} num nível inexistente: ${e.levelId}`);
    }
  }

  // Área da escritura, quando informada. Inteira porque é mm², e positiva porque
  // lote de área zero não existe em matrícula nenhuma. Sem o teto de
  // `assertIntegerMm`: aquele limite é de COORDENADA, e uma área o ultrapassa
  // por construção.
  const areaEscritura = model.areaEscrituraMm2;
  if (areaEscritura !== null && areaEscritura !== undefined) {
    if (!Number.isSafeInteger(areaEscritura) || areaEscritura <= 0) {
      throw new KernelError(
        'BAD_AREA_ESCRITURA',
        `Área de escritura deve ser mm² inteiro positivo; recebido ${areaEscritura}`,
      );
    }
  }
}
