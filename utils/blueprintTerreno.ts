/**
 * O LOTE, derivado das divisas.
 *
 * ─── POR QUE A ÁREA NÃO VEM DE `Space` ──────────────────────────────────────
 *
 * O arranjo planar já transforma um anel fechado de limites num ambiente, e
 * seria natural ler `Space.areaMm2` e pronto. Não serve, e o motivo é concreto:
 * a área do ambiente é `grossArea − holeArea` (`arrangement.ts`). Um anel de
 * terreno em volta da casa produz uma face que tem a casa como BURACO — ou seja,
 * a área do QUINTAL, não a do lote. Quanto maior a construção, menor o "terreno".
 *
 * O número que vale — o que está na matrícula, o que divide para dar taxa de
 * ocupação — é a área do polígono do lote, inteira, ignorando o que foi
 * construído dentro. Por isso ela é calculada aqui, direto do anel.
 *
 * ─── ESTE MÓDULO É PURO ─────────────────────────────────────────────────────
 *
 * Recebe limites, devolve medidas. Não conhece React, nem serviço, nem canvas —
 * é o que permite testá-lo sem navegador, e o que impede uma segunda cópia da
 * regra do anel aparecer no renderizador.
 */

import {
  anelRecuado,
  areCollinear,
  envelopeValido,
  pointKey,
  polygonArea,
  signedArea,
  type Boundary,
  type BoundaryPapel,
  type ObjectId,
  type Point,
  type Space,
} from './blueprintKernel';

export interface Terreno {
  /** Vértices na ordem do contorno, SEM repetir o primeiro no fim. */
  anel: Point[];
  /** Ids das divisas, na mesma ordem dos lados do anel. */
  ladosIds: ObjectId[];
  areaMm2: number;
  perimetroMm: number;
  fechado: boolean;
  /**
   * Distância entre a última ponta e a primeira, quando o contorno não fecha.
   *
   * Todo levantamento tem erro de fechamento — os lados medidos em campo nunca
   * voltam exatamente ao ponto de partida. Esconder isso é esconder erro de
   * medida: a área sairia de um polígono que o software fechou sozinho, e
   * ninguém saberia de quanto foi a licença que ele tomou.
   */
  erroFechamentoMm: number;
}

/** Só as divisas que formam o lote. Limite solto (`DIVISA`) não entra. */
export function divisasDoLote(limites: Boundary[]): Boundary[] {
  return limites.filter((b) => b.kind === 'TERRENO');
}

/**
 * Caminha o contorno e devolve os vértices na ordem.
 *
 * Começa por uma ponta SOLTA quando existe uma — num contorno aberto, começar
 * pelo meio devolveria metade do traçado e a área sairia de um polígono que não
 * é o desenho. Não havendo ponta solta, o contorno é um ciclo e qualquer vértice
 * serve de início.
 *
 * ⚠️ Com bifurcação (um vértice onde três divisas se encontram) o caminho é
 * ambíguo; aqui se toma a primeira aresta não usada. Um lote não tem bifurcação,
 * e forçar uma escolha é melhor que devolver nada — o erro de fechamento
 * denuncia o resultado estranho.
 */
export function anelDoTerreno(limites: Boundary[]): Point[] {
  return caminhar(divisasDoLote(limites)).vertices;
}

function caminhar(divisas: Boundary[]): {
  vertices: Point[];
  ladosIds: ObjectId[];
  voltouAoInicio: boolean;
} {
  if (divisas.length === 0) return { vertices: [], ladosIds: [], voltouAoInicio: false };

  const incidentes = new Map<string, { id: ObjectId; de: Point; para: Point }[]>();
  const registrar = (de: Point, para: Point, id: ObjectId) => {
    const chave = pointKey(de);
    const lista = incidentes.get(chave) ?? [];
    lista.push({ id, de, para });
    incidentes.set(chave, lista);
  };
  for (const b of divisas) {
    registrar(b.a, b.b, b.id);
    registrar(b.b, b.a, b.id);
  }

  // Ponta solta = vértice com uma única divisa. É por onde um contorno ABERTO
  // começa; num ciclo não existe nenhuma, e aí qualquer vértice serve.
  let inicio: Point | null = null;
  for (const b of divisas) {
    for (const p of [b.a, b.b]) {
      if ((incidentes.get(pointKey(p)) ?? []).length === 1) {
        inicio = p;
        break;
      }
    }
    if (inicio) break;
  }
  if (!inicio) inicio = divisas[0].a;

  const usadas = new Set<ObjectId>();
  const vertices: Point[] = [inicio];
  const ladosIds: ObjectId[] = [];
  let atual = inicio;

  for (let passo = 0; passo < divisas.length; passo++) {
    const saidas = incidentes.get(pointKey(atual)) ?? [];
    const proxima = saidas.find((s) => !usadas.has(s.id));
    if (!proxima) break;
    usadas.add(proxima.id);
    ladosIds.push(proxima.id);
    atual = proxima.para;
    vertices.push(atual);
  }

  // ⚠️ TESTAR O FECHAMENTO ANTES DE TIRAR A REPETIÇÃO. O último vértice repete o
  // primeiro quando o contorno fecha; removê-lo primeiro e só então comparar
  // "último com primeiro" compara o vértice ERRADO — o penúltimo do caminho — e
  // um lote perfeitamente fechado passa a ser relatado como aberto, com erro de
  // fechamento do tamanho de um lado inteiro.
  const voltouAoInicio =
    vertices.length > 1 && pointKey(vertices[vertices.length - 1]) === pointKey(vertices[0]);

  // Sem a repetição, o anel fica no formato que `polygonArea` espera — ela fecha
  // sozinha.
  if (voltouAoInicio) vertices.pop();

  return { vertices, ladosIds, voltouAoInicio };
}

/**
 * Mede o lote. `null` quando não há divisa de terreno nenhuma.
 *
 * A área só faz sentido com o contorno fechado; num contorno aberto ela é a do
 * polígono que se obtém ligando a última ponta à primeira — e é exatamente por
 * isso que `erroFechamentoMm` vem junto, dizendo de quanto foi essa licença.
 */
export function medirTerreno(limites: Boundary[]): Terreno | null {
  const divisas = divisasDoLote(limites);
  if (divisas.length === 0) return null;

  const { vertices, ladosIds, voltouAoInicio } = caminhar(divisas);
  if (vertices.length < 2) return null;

  const primeiro = vertices[0];
  const ultimo = vertices[vertices.length - 1];
  // Fechou quando TODA divisa entrou no caminho e o caminho voltou ao início.
  // Sem a primeira metade, um lote com uma divisa solta pendurada seria dado
  // como fechado — o anel fecha, mas o desenho tem um pedaço fora dele.
  const todasUsadas = ladosIds.length === divisas.length;
  const fechado = voltouAoInicio && todasUsadas && vertices.length >= 3;
  const erroFechamentoMm = voltouAoInicio
    ? 0
    : Math.round(Math.hypot(ultimo.x - primeiro.x, ultimo.y - primeiro.y));

  return {
    anel: vertices,
    ladosIds,
    areaMm2: vertices.length >= 3 ? Math.abs(polygonArea(vertices)) : 0,
    perimetroMm: divisas.reduce(
      (soma, b) => soma + Math.round(Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y)),
      0,
    ),
    fechado,
    erroFechamentoMm,
  };
}

const MM2_PARA_M2 = 1_000_000;

/** Área do lote em m², a unidade em que o mundo fala de terreno. */
export function areaEmM2(terreno: Terreno): number {
  return terreno.areaMm2 / MM2_PARA_M2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recuos e envelope construtivo
// ─────────────────────────────────────────────────────────────────────────────

/** Recuos em MILÍMETRO, por papel de divisa. Zero = sem recuo naquele lado. */
export interface Recuos {
  FRENTE: number;
  FUNDOS: number;
  LATERAL_DIREITA: number;
  LATERAL_ESQUERDA: number;
}

export const RECUOS_ZERO: Recuos = {
  FRENTE: 0,
  FUNDOS: 0,
  LATERAL_DIREITA: 0,
  LATERAL_ESQUERDA: 0,
};

export interface Envelope {
  /** Anel do que sobra para construir. Vazio quando os recuos não cabem. */
  anel: Point[];
  areaMm2: number;
  /**
   * `false` quando os recuos comem o lote inteiro — o anel se inverte ou se
   * auto-intercepta e a área que sairia dele não significa nada. É resposta de
   * projeto ("não cabe"), não erro de software, e por isso vem como campo em vez
   * de exceção.
   */
  valido: boolean;
}

/**
 * O envelope construtivo: o lote recuado por lado, segundo o papel de cada divisa.
 *
 * Divisa sem papel não recua. É deliberado: inventar um recuo padrão para um lado
 * que ninguém classificou desenharia uma restrição que não existe no projeto —
 * e restrição inventada é pior que restrição faltando, porque parece conferida.
 *
 * ⚠️ Isto é o que `plantaAiEngine.calculateEnvelope` NÃO sabe fazer: lá o terreno
 * é `frontage × depth` menos recuos, ou seja, só retângulo. Aqui o lote pode ter
 * qualquer forma, e os cantos fecham pela mitra.
 */
export function envelopeConstrutivo(
  terreno: Terreno,
  limites: Boundary[],
  recuos: Recuos,
): Envelope {
  const vazio: Envelope = { anel: [], areaMm2: 0, valido: false };
  if (terreno.anel.length < 3) return vazio;

  const porId = new Map(limites.map((b) => [b.id, b]));
  const recuoDoLado = terreno.ladosIds.map((id) => {
    const papel = porId.get(id)?.papel;
    return papel ? recuos[papel] : 0;
  });
  if (recuoDoLado.length !== terreno.anel.length) return vazio;
  if (recuoDoLado.every((r) => r === 0)) {
    // Sem nenhum recuo, o envelope É o lote — e dizer isso é mais honesto que
    // devolver vazio, que a tela leria como "não cabe".
    return { anel: terreno.anel, areaMm2: terreno.areaMm2, valido: true };
  }

  const anel = anelRecuado(terreno.anel, recuoDoLado);
  const valido = envelopeValido(terreno.anel, anel);
  return {
    anel: valido ? anel : [],
    areaMm2: valido ? Math.abs(polygonArea(anel)) : 0,
    valido,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aproveitamento — taxa de ocupação e coeficiente
// ─────────────────────────────────────────────────────────────────────────────

export interface Aproveitamento {
  /** Projeção construída ÷ área do lote, em fração (0,5 = 50%). */
  taxaOcupacao: number;
  /** Área construída total ÷ área do lote. */
  coeficienteAproveitamento: number;
  areaProjetadaM2: number;
  areaConstruidaM2: number;
}

/**
 * Quanto do lote está ocupado, e quanto se construiu em relação a ele.
 *
 * ⚠️ **TO e CA usam a MESMA área aqui, e isso é uma limitação declarada, não um
 * descuido.** Taxa de ocupação é a PROJEÇÃO no terreno; coeficiente é a soma de
 * TODOS os pavimentos. Enquanto o editor trabalha um nível de cada vez, os dois
 * números coincidem — e mentir que já somam pavimento seria pior que dizer que
 * ainda não somam. Quando o modelo passar a ter mais de um nível desenhado, o CA
 * passa a somar as áreas de todos eles e este comentário sai.
 */
export function calcularAproveitamento(
  terreno: Terreno,
  ambientes: Space[],
): Aproveitamento | null {
  if (terreno.areaMm2 <= 0) return null;
  const construidaMm2 = ambientes.reduce((soma, s) => soma + s.areaMm2, 0);
  return {
    taxaOcupacao: construidaMm2 / terreno.areaMm2,
    coeficienteAproveitamento: construidaMm2 / terreno.areaMm2,
    areaProjetadaM2: construidaMm2 / MM2_PARA_M2,
    areaConstruidaM2: construidaMm2 / MM2_PARA_M2,
  };
}

/** Papéis na ordem em que aparecem na tela. */
export const PAPEIS_DE_DIVISA: BoundaryPapel[] = [
  'FRENTE',
  'FUNDOS',
  'LATERAL_DIREITA',
  'LATERAL_ESQUERDA',
];

export const ROTULO_DO_PAPEL: Record<BoundaryPapel, string> = {
  FRENTE: 'Frente',
  FUNDOS: 'Fundos',
  LATERAL_DIREITA: 'Lateral direita',
  LATERAL_ESQUERDA: 'Lateral esquerda',
};

/** Versão curta, para caber junto da cota no desenho. */
export const ROTULO_CURTO_DO_PAPEL: Record<BoundaryPapel, string> = {
  FRENTE: 'frente',
  FUNDOS: 'fundos',
  LATERAL_DIREITA: 'lat. dir.',
  LATERAL_ESQUERDA: 'lat. esq.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Papéis derivados da frente
// ─────────────────────────────────────────────────────────────────────────────

/** Ponto médio do lado `i` do anel. */
function medioDoLado(anel: Point[], i: number): Point {
  const a = anel[i];
  const b = anel[(i + 1) % anel.length];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Versor da direção do lado `i`. `null` num lado degenerado. */
function direcaoDoLado(anel: Point[], i: number): Point | null {
  const a = anel[i];
  const b = anel[(i + 1) % anel.length];
  const comp = Math.hypot(b.x - a.x, b.y - a.y);
  if (comp === 0) return null;
  return { x: (b.x - a.x) / comp, y: (b.y - a.y) / comp };
}

const escalar = (u: Point, v: Point) => u.x * v.x + u.y * v.y;

/**
 * O lado `semente` mais os vizinhos do ciclo que continuam a MESMA reta.
 *
 * Existe porque um lado do lote com frequência chega ao desenho partido em dois
 * trechos: o vértice no meio da divisa dos fundos marca onde termina o lote do
 * vizinho, e o lado continua reto. Sem isto, o trecho de trás vira "lateral" na
 * sugestão, o recuo de fundos não se aplica a ele, e a medida que vai para a
 * ficha sai pela metade.
 *
 * ⚠️ Só COLINEAR, e colinear EXATO (`cross === 0`, sem tolerância). Um fundo com
 * ângulo de verdade é ambíguo — qual trecho é fundo e qual é lateral é decisão de
 * quem lê a matrícula, não de um limiar de graus escolhido aqui. Nesse caso sai um
 * trecho sugerido e o resto se corrige no quadro.
 */
function trechosDaMesmaReta(anel: Point[], semente: number): number[] {
  const n = anel.length;
  const trechos = [semente];
  const vertice = (i: number) => anel[i % n];
  // Dois lados consecutivos i e i+1 são a mesma reta quando o vértice que os une
  // não dobra: os três pontos são colineares.
  const continua = (i: number) => areCollinear(vertice(i), vertice(i + 1), vertice(i + 2));

  for (let i = semente; trechos.length < n && continua(i); ) {
    i = (i + 1) % n;
    if (trechos.includes(i)) break;
    trechos.push(i);
  }
  for (let i = semente; trechos.length < n && continua((i - 1 + n) % n); ) {
    i = (i - 1 + n) % n;
    if (trechos.includes(i)) break;
    trechos.push(i);
  }
  return trechos;
}

/**
 * Os papéis dos outros lados, a partir do lado que o usuário apontou como FRENTE.
 *
 * ─── O QUE SE DERIVA, E O QUE NÃO SE DERIVA ─────────────────────────────────
 *
 * A frente continua sendo informação do MUNDO — é a que dá para a rua, e nenhum
 * desenho sabe onde fica a rua. Quem aponta é o usuário. Derivar dela o resto,
 * porém, é geometria pura, e deixar quatro selects para preencher à mão é o que
 * faz um lado ficar sem papel e o envelope recuar errado sem avisar.
 *
 * ─── A CONVENÇÃO ────────────────────────────────────────────────────────────
 *
 * Direita e esquerda são as de quem está **na rua, olhando para o lote** — a
 * mesma convenção da matrícula. Olhando na direção da normal interna `n`, a mão
 * direita aponta para `(n.y, −n.x)`: giro de −90°, porque o Y do modelo cresce
 * para CIMA. Trocar o sinal aqui espelha o lote inteiro e troca as duas laterais
 * na escritura — é o tipo de erro que ninguém enxerga no desenho.
 *
 * Devolve `null` quando não há o que derivar (contorno aberto, menos de 3 lados,
 * ou frente que não é lado do anel). A saída **inclui** a própria frente, para
 * que o chamador aplique um lote só e um `undo` desfaça tudo.
 */
export function papeisSugeridos(
  terreno: Terreno,
  frenteId: ObjectId,
): Map<ObjectId, BoundaryPapel> | null {
  const anel = terreno.anel;
  const n = anel.length;
  // Contorno aberto não tem "lado oposto" com significado: o fundo poderia ser o
  // vão que falta fechar. Sugerir papel ali seria chutar.
  if (!terreno.fechado || n < 3 || terreno.ladosIds.length !== n) return null;

  const frente = terreno.ladosIds.indexOf(frenteId);
  if (frente < 0) return null;

  // ⚠️ `signedArea`, NÃO `polygonArea` — esta devolve o valor absoluto, e com ela
  // o sentido horário nunca seria detectado: a normal apontaria para FORA do lote
  // e as duas laterais sairiam trocadas em todo lote desenhado no outro sentido.
  const horario = signedArea(anel) < 0;
  const direcaoFrente = direcaoDoLado(anel, frente);
  if (!direcaoFrente) return null;

  // Normal INTERNA: num anel anti-horário o interior fica à esquerda da direção
  // do lado; num horário, à direita.
  const normal = horario
    ? { x: direcaoFrente.y, y: -direcaoFrente.x }
    : { x: -direcaoFrente.y, y: direcaoFrente.x };
  const medioFrente = medioDoLado(anel, frente);
  const naFrente = new Set(trechosDaMesmaReta(anel, frente));

  // ── FUNDOS ────────────────────────────────────────────────────────────────
  //
  // Não é "o lado oposto no índice" — num lote de 5 ou 6 lados o oposto por
  // contagem cai em qualquer lugar. São dois passos, e os DOIS são necessários:
  //
  // 1. Só concorre lado que OLHA PARA TRÁS: a normal interna dele aponta contra
  //    a da frente (`< -COSSENO_DE_FUNDO`, ou seja, mais de 60° virado para trás).
  //    Uma lateral tem normal perpendicular à da frente e fica de fora por
  //    construção.
  // 2. Entre os que concorrem, vence o que forma o GROSSO da divisa oposta:
  //    afastamento × comprimento.
  //
  // ⚠️ Nenhum dos dois basta sozinho, e os contraexemplos são lotes comuns:
  //   • Só afastamento: num lote com canto chanfrado, o chanfro — curto — pode
  //     ter o ponto médio mais afastado que o fundo inteiro e roubar o papel.
  //   • Só comprimento (mesmo ponderado): num lote estreito e profundo, 10 × 40,
  //     cada LATERAL de 40 m pontua o dobro do fundo de 10 m. O passo 1 é o que
  //     impede o caso mais comum de todos de sair errado.
  const COSSENO_DE_FUNDO = 0.5;
  const normalInterna = (i: number): Point | null => {
    const d = direcaoDoLado(anel, i);
    if (!d) return null;
    return horario ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x };
  };

  let fundos = -1;
  let melhorPeso = -Infinity;
  let melhorOposicao = Infinity;
  for (let i = 0; i < n; i++) {
    if (naFrente.has(i)) continue;
    const ni = normalInterna(i);
    if (!ni) continue;
    const oposicao = escalar(ni, normal);
    if (oposicao > -COSSENO_DE_FUNDO) continue;

    const medio = medioDoLado(anel, i);
    const afastamento = escalar({ x: medio.x - medioFrente.x, y: medio.y - medioFrente.y }, normal);
    if (afastamento <= 0) continue;
    const comprimento = Math.hypot(
      anel[(i + 1) % n].x - anel[i].x,
      anel[(i + 1) % n].y - anel[i].y,
    );
    const peso = afastamento * comprimento;

    // Empate (dois trechos iguais de um fundo partido) resolve pelo mais
    // antiparalelo e, persistindo, pelo menor índice — para a sugestão ser a
    // mesma em toda máquina.
    const empatou = Math.abs(peso - melhorPeso) < 1;
    if (peso > melhorPeso + 1 || (empatou && oposicao < melhorOposicao)) {
      if (!empatou) melhorPeso = peso;
      melhorOposicao = oposicao;
      fundos = i;
    }
  }
  // Nenhum lado olha para trás: lote em leque, ou frente apontada num lado que
  // não tem oposto. Melhor não sugerir fundo nenhum do que carimbar um lateral.
  if (fundos < 0) return null;

  const noFundo = new Set(trechosDaMesmaReta(anel, fundos).filter((i) => !naFrente.has(i)));

  // Os dois arcos entre frente e fundos são as duas laterais. Percorrer o ciclo
  // (em vez de classificar lado a lado pelo sinal) mantém cada lateral CONTÍGUA:
  // num lote de fundo quebrado em ângulo, um trecho a meio caminho não pula para a
  // outra lateral só porque o ponto médio dele caiu do outro lado da mediana.
  const arcoAdiante: number[] = [];
  const arcoAtras: number[] = [];
  let passouOFundo = false;
  for (let passo = 0; passo < n; passo++) {
    const i = (frente + passo) % n;
    if (naFrente.has(i)) continue;
    if (noFundo.has(i)) {
      passouOFundo = true;
      continue;
    }
    (passouOFundo ? arcoAtras : arcoAdiante).push(i);
  }

  const direita = { x: normal.y, y: -normal.x };
  const ladoDoArco = (arco: number[]) =>
    arco.reduce((soma, i) => {
      const medio = medioDoLado(anel, i);
      return soma + escalar({ x: medio.x - medioFrente.x, y: medio.y - medioFrente.y }, direita);
    }, 0);

  const somaAdiante = ladoDoArco(arcoAdiante);
  // Empate em zero só acontece em arco vazio ou simétrico em torno do eixo; aí
  // vale a orientação do anel, que é o mesmo resultado por outro caminho — num
  // anel anti-horário, andar para a frente a partir da frente vai para a direita.
  const adianteEhDireita = somaAdiante === 0 ? !horario : somaAdiante > 0;

  const papeis = new Map<ObjectId, BoundaryPapel>();
  for (const i of naFrente) papeis.set(terreno.ladosIds[i], 'FRENTE');
  for (const i of noFundo) papeis.set(terreno.ladosIds[i], 'FUNDOS');
  for (const i of arcoAdiante) {
    papeis.set(terreno.ladosIds[i], adianteEhDireita ? 'LATERAL_DIREITA' : 'LATERAL_ESQUERDA');
  }
  for (const i of arcoAtras) {
    papeis.set(terreno.ladosIds[i], adianteEhDireita ? 'LATERAL_ESQUERDA' : 'LATERAL_DIREITA');
  }
  return papeis;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quadro de divisas — o desenho conferido contra a escritura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Acima de quanto a diferença entre desenho e escritura vira aviso, em mm.
 *
 * Um centímetro, que é a precisão em que a própria escritura fala ("12,00 m").
 * Abaixo disso é ruído de arredondamento do traçado, e pintar um alerta ali
 * ensinaria o usuário a ignorar o alerta — que é pior do que não ter alerta.
 */
export const TOLERANCIA_ESCRITURA_MM = 10;

export interface LinhaDeDivisa {
  id: ObjectId;
  /** Posição no contorno, a partir de 1. É o número que aparece no desenho. */
  ordem: number;
  papel: BoundaryPapel | null;
  desenhadoMm: number;
  /** `null` = ninguém informou. E o que ninguém informou não se compara. */
  escrituraMm: number | null;
  /** Desenhado − escritura. `null` quando não há o que subtrair. */
  divergenciaMm: number | null;
  confrontante: string | null;
}

/** `true` quando a diferença passa da tolerância. Sem escritura, nunca. */
export function divergente(linha: LinhaDeDivisa): boolean {
  return linha.divergenciaMm !== null && Math.abs(linha.divergenciaMm) > TOLERANCIA_ESCRITURA_MM;
}

/**
 * Uma linha por lado do lote, NA ORDEM DO CONTORNO.
 *
 * A ordem importa: é o que deixa a tabela ser lida junto com o desenho ("lado 3
 * é aquele"), e é a mesma ordem em que a matrícula descreve o imóvel — partindo
 * da frente e girando. Ordenar por papel ou por medida quebraria o casamento.
 */
export function linhasDoQuadro(terreno: Terreno, limites: Boundary[]): LinhaDeDivisa[] {
  const porId = new Map(limites.map((b) => [b.id, b]));
  return terreno.ladosIds.map((id, i) => {
    const divisa = porId.get(id);
    const a = terreno.anel[i];
    const b = terreno.anel[(i + 1) % terreno.anel.length];
    const desenhadoMm = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    const escrituraMm = divisa?.medidaEscrituraMm ?? null;
    return {
      id,
      ordem: i + 1,
      papel: divisa?.papel ?? null,
      desenhadoMm,
      escrituraMm,
      divergenciaMm: escrituraMm === null ? null : desenhadoMm - escrituraMm,
      confrontante: divisa?.confrontante ?? null,
    };
  });
}

/**
 * Quanto mede cada papel, em mm — a soma dos lados que o têm.
 *
 * Soma porque um lote de esquina ou de fundo quebrado tem mais de um trecho no
 * mesmo papel, e a ficha do empreendimento guarda UM número por papel.
 *
 * ⚠️ Papel sem nenhum lado fica **ausente** do resultado, não zerado. Zero
 * significaria "medi e deu zero", e gravado na ficha apagaria um número que
 * alguém digitou à mão.
 */
export function medidasPorPapel(
  terreno: Terreno,
  limites: Boundary[],
): Partial<Record<BoundaryPapel, number>> {
  const porId = new Map(limites.map((b) => [b.id, b]));
  const soma: Partial<Record<BoundaryPapel, number>> = {};
  terreno.ladosIds.forEach((id, i) => {
    const papel = porId.get(id)?.papel;
    if (!papel) return;
    const a = terreno.anel[i];
    const b = terreno.anel[(i + 1) % terreno.anel.length];
    soma[papel] = (soma[papel] ?? 0) + Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  });
  return soma;
}
