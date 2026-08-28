/**
 * Cotas da planta.
 *
 * ─── O QUE COTAR É A DECISÃO, NÃO COMO DESENHAR ─────────────────────────────
 *
 * Cotar tudo é o mesmo que não cotar: a folha vira ilegível e ninguém confere.
 * A convenção de planta baixa resolve isso com CADEIAS: uma linha de cota
 * externa por direção, quebrada nos eixos de parede, mais a cota TOTAL por fora
 * dela. Quem lê soma a cadeia e confere contra o total — se não fecha, o desenho
 * está errado, e isso aparece sem precisar de ferramenta nenhuma.
 *
 * ─── DE ONDE CADA COTA É MEDIDA ─────────────────────────────────────────────
 *
 * Até 24/08/2026 tudo saía do EIXO das paredes, porque é o eixo que o kernel
 * conhece — e a legenda declarava isso. Funcionava no papel e não era o que a
 * prancha de arquitetura faz nem o que se confere com a trena. A régua passou a
 * ser a do desenho técnico:
 *
 *   extremos do lado  → face EXTERNA
 *   divisória interna → EIXO
 *   cota de ambiente  → face INTERNA
 *
 * A razão do aviso antigo continua valendo, e por isso `AVISO_COTA_POR_FACE`
 * existe: cota sem dizer de onde é medida é cota que engana.
 *
 * ─── UMA FONTE PARA OS TRÊS DESTINOS ────────────────────────────────────────
 *
 * Canvas, PDF/SVG e DXF consomem as MESMAS cadeias, e a conversão local→mundo
 * mora só em `pontoDaCota`. Cota que diverge entre a tela, o papel e o arquivo
 * do CAD é pior que cota nenhuma — e divergiria no dia em que um dos três
 * fizesse a conta sozinho.
 */

import type { BlueprintModel, Level, Point, Space, Wall } from './blueprintKernel';
import {
  areCollinear,
  contornoExternoDoNivel,
  pointInPolygon,
  SENO_MINIMO_MITRA,
} from './blueprintKernel';

export interface SegmentoDeCota {
  /**
   * Este trecho é um VÃO (porta/janela), não parede.
   *
   * Só a cadeia de aberturas preenche. Serve ao renderizador, que dá destaque
   * ao vão — numa cadeia de esquadria o que se procura é onde estão os vãos, e
   * sem distinção eles se perdem no meio dos trechos de parede.
   */
  vao?: boolean;
  /** Posição inicial e final ao longo do eixo cotado, em mm reais. */
  de: number;
  ate: number;
  /** Rótulo já formatado, em metros — a convenção brasileira em planta baixa. */
  rotulo: string;
}

/**
 * Metros com dois decimais e vírgula. `4000` → `"4,00"`.
 *
 * Arredonda METADE PARA CIMA à mão, e não por `toFixed`. Em ponto flutuante
 * 0,075 é guardado como 0,07499999…, e `toFixed(2)` devolve "0,07" — meio
 * centímetro a menos numa cota, sem aviso. É a mesma convenção do `roundToMm`
 * do kernel; divergir dela faria a cota discordar do quantitativo.
 */
export function rotuloDeCota(mm: number): string {
  const cm = Math.sign(mm) * Math.round(Math.abs(mm) / 10);
  return (cm / 100).toFixed(2).replace('.', ',');
}

// ─────────────────────────────────────────────────────────────────────────────
// CADEIAS POR LADO — a convenção de prancha
//
// A cadeia global por eixo (acima) junta TODAS as coordenadas do modelo numa
// linha só. Numa planta em L isso produz uma cadeia que não corresponde a
// nenhum lado real da edificação, e cota tudo pelo eixo.
//
// Aqui a cadeia é por LADO do contorno externo, com a régua que o usuário pediu
// em 24/08/2026:
//
//   extremos do lado  → face EXTERNA
//   divisória interna → EIXO
//   cota de ambiente  → face INTERNA a face INTERNA
//
// A cadeia parcial é a do pedido, literal: "dos dois ambientes da extremidade
// uma cota começando na face externa e a outra terminando no eixo do ambiente
// do centro".
// ─────────────────────────────────────────────────────────────────────────────

/** Um lado do contorno: trecho reto, com os vértices que caem no meio dele. */
export interface LadoDoContorno {
  a: Point;
  b: Point;
  /**
   * Vértices colineares entre `a` e `b`, em ordem.
   *
   * NÃO são ruído a limpar: cada um é onde uma divisória encosta na fachada, e
   * é exatamente onde a cadeia parcial quebra.
   */
  intermediarios: Point[];
}

export interface CadeiasDoLado {
  lado: LadoDoContorno;
  /** Comprimento de EIXO do lado, em mm. */
  comprimentoMm: number;
  /** Face externa a face externa. */
  total: SegmentoDeCota;
  /** Face externa → eixo → … → face externa. */
  parcial: SegmentoDeCota[];
  /** Uma por ambiente ao longo do lado, de face interna a face interna. */
  internas: SegmentoDeCota[];
  /**
   * A cadeia de ESQUADRIAS: os vãos deste lado e os trechos de parede entre
   * eles, particionando o lado inteiro.
   *
   * Cadeia PRÓPRIA, e não misturada à da estrutura. A razão estava escrita
   * neste módulo desde o começo — "cotar vão de porta na mesma cadeia da
   * estrutura dobra o número de segmentos" —, e ela vale contra MISTURAR, não
   * contra existir: na prancha a esquadria tem a sua linha, mais perto do
   * desenho.
   *
   * Vazia quando o lado não tem abertura, e aí o renderizador não gasta linha.
   */
  aberturas: SegmentoDeCota[];
}

/** Funde arestas colineares consecutivas do anel em lados. */
export function ladosDoContorno(anel: Point[]): LadoDoContorno[] {
  const n = anel.length;
  if (n < 3) return [];

  const mesmaDirecao = (p: Point, q: Point, r: Point) => {
    const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
    return Math.abs(cross) < 1; // mm² — o kernel trabalha em mm inteiro
  };

  // Começa num vértice que seja CANTO de verdade, senão um lado seria cortado
  // ao meio só porque o anel começou no meio dele.
  let inicio = 0;
  for (let i = 0; i < n; i++) {
    const p = anel[(i + n - 1) % n];
    const c = anel[i];
    const q = anel[(i + 1) % n];
    if (!mesmaDirecao(p, c, q)) {
      inicio = i;
      break;
    }
  }

  const lados: LadoDoContorno[] = [];
  let a = anel[inicio];
  let intermediarios: Point[] = [];

  for (let k = 1; k <= n; k++) {
    const atual = anel[(inicio + k) % n];
    const proximo = anel[(inicio + k + 1) % n];
    if (mesmaDirecao(a, atual, proximo) && k < n) {
      intermediarios.push(atual);
      continue;
    }
    lados.push({ a, b: atual, intermediarios });
    a = atual;
    intermediarios = [];
  }

  return lados;
}

/**
 * RECUO até a face da parede que fecha o lado em `p`, ao longo do lado.
 *
 * ⚠️ Não é "meia espessura da vizinha": é `(t/2) / sen(θ)`. Num canto reto os
 * dois coincidem, mas num lado oblíquo a face é atravessada mais longe. Sem o
 * fator, a cadeia divergiria da medida por parede (`recuoAteFace`, no kernel) —
 * e dois números diferentes para a mesma distância é o defeito que este módulo
 * inteiro existe para não ter.
 */
function recuoDoCanto(walls: Wall[], p: Point, ux: number, uy: number): number {
  let maior = 0;
  for (const w of walls) {
    const tocaA = w.a.x === p.x && w.a.y === p.y;
    const tocaB = w.b.x === p.x && w.b.y === p.y;
    if (!tocaA && !tocaB) continue;
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const comp = Math.hypot(dx, dy);
    if (comp === 0) continue;
    // Paralela ao lado é a própria fachada — não é a que fecha o canto.
    const sen = Math.abs(ux * (dy / comp) - uy * (dx / comp));
    // A MESMA régua do kernel (`SENO_MINIMO_MITRA`): rasante não fecha canto.
    // Duplicar o número aqui era o começo da divergência que este módulo existe
    // para não ter.
    if (sen < SENO_MINIMO_MITRA) continue;
    const recuo = w.thicknessMm / 2 / sen;
    if (recuo > maior) maior = recuo;
  }
  return maior;
}

/**
 * As três cadeias de um lado, em coordenada LOCAL ao lado.
 *
 * `de`/`ate` são medidos ao longo da direção do lado, a partir do canto de
 * eixo `lado.a`. Um valor negativo é o quanto a face externa avança para fora
 * do canto — é assim que a cota total fica maior que o eixo.
 *
 * Coordenada local, e não X/Y, é o que faz LADO OBLÍQUO funcionar sem caso
 * especial: a cadeia é unidimensional ao longo do lado, e quem gira o texto é o
 * renderizador.
 */
export function cadeiasDoLado(
  model: BlueprintModel,
  level: Level,
  lado: LadoDoContorno,
): CadeiasDoLado | null {
  const paredes = model.walls.filter((w) => w.levelId === level.id);
  const dx = lado.b.x - lado.a.x;
  const dy = lado.b.y - lado.a.y;
  const comprimentoMm = Math.hypot(dx, dy);
  if (comprimentoMm < 1) return null;
  const ux = dx / comprimentoMm;
  const uy = dy / comprimentoMm;

  /** Posição de um ponto do anel na régua do lado. */
  const t = (p: Point) => (p.x - lado.a.x) * ux + (p.y - lado.a.y) * uy;

  // Quanto a face externa avança além do canto de eixo: meia espessura da
  // parede que fecha aquele canto.
  const avancoInicio = recuoDoCanto(paredes, lado.a, ux, uy);
  const avancoFim = recuoDoCanto(paredes, lado.b, ux, uy);

  const inicioExterno = -avancoInicio;
  const fimExterno = comprimentoMm + avancoFim;

  const total: SegmentoDeCota = {
    de: inicioExterno,
    ate: fimExterno,
    rotulo: rotuloDeCota(fimExterno - inicioExterno),
  };

  // Eixos das divisórias que encostam neste lado, em ordem.
  const eixos = lado.intermediarios.map(t).sort((x, y) => x - y);

  // PARCIAL: face externa → eixo → … → face externa.
  const pontosParcial = [inicioExterno, ...eixos, fimExterno];
  const parcial: SegmentoDeCota[] = pontosParcial.slice(0, -1).map((de, i) => ({
    de,
    ate: pontosParcial[i + 1],
    rotulo: rotuloDeCota(pontosParcial[i + 1] - de),
  }));

  // INTERNAS: face interna a face interna, ambiente a ambiente.
  //
  // No extremo, a face interna recua meia espessura da parede que fecha o
  // canto; numa divisória, recua meia espessura DELA para cada lado.
  const meiaDivisoria = lado.intermediarios.map((p) => recuoDoCanto(paredes, p, ux, uy));
  const internas: SegmentoDeCota[] = [];
  let cursor = avancoInicio; // face interna do canto inicial
  for (let i = 0; i < eixos.length; i++) {
    const ate = eixos[i] - meiaDivisoria[i];
    if (ate > cursor) internas.push({ de: cursor, ate, rotulo: rotuloDeCota(ate - cursor) });
    cursor = eixos[i] + meiaDivisoria[i];
  }
  const ultimo = comprimentoMm - avancoFim;
  if (ultimo > cursor) {
    internas.push({ de: cursor, ate: ultimo, rotulo: rotuloDeCota(ultimo - cursor) });
  }

  // ── ABERTURAS: os vãos deste lado, e a parede entre eles ────────────────
  //
  // A abertura mora numa PAREDE (`wallId` + `offsetMm` + `widthMm`), não no
  // lado. As duas bordas do vão vão para a régua do lado por projeção — o que
  // resolve de graça a parede desenhada no sentido contrário ao do lado, que
  // daria offset "de trás para frente" se fosse lido cru.
  const vaos: { de: number; ate: number }[] = [];
  for (const o of model.openings) {
    const w = paredes.find((x) => x.id === o.wallId);
    if (!w) continue;
    // Só as aberturas de paredes que compõem ESTE lado.
    if (!areCollinear(lado.a, lado.b, w.a) || !areCollinear(lado.a, lado.b, w.b)) continue;

    const comp = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (comp === 0) continue;
    const wx = (w.b.x - w.a.x) / comp;
    const wy = (w.b.y - w.a.y) / comp;

    const borda = (d: number) => t({ x: w.a.x + wx * d, y: w.a.y + wy * d } as Point);
    const t1 = borda(o.offsetMm);
    const t2 = borda(o.offsetMm + o.widthMm);
    const de = Math.min(t1, t2);
    const ate = Math.max(t1, t2);
    // Fora do trecho do lado: é abertura de outra parede colinear, adiante.
    if (ate < 0 || de > comprimentoMm) continue;
    vaos.push({ de, ate });
  }
  vaos.sort((a, b) => a.de - b.de);

  const aberturas: SegmentoDeCota[] = [];
  if (vaos.length > 0) {
    // Particiona o lado inteiro, do mesmo extremo da parcial: assim a cadeia de
    // esquadria FECHA contra o total, e quem soma na mão confere as duas.
    let cursor = inicioExterno;
    for (const v of vaos) {
      if (v.de > cursor) {
        aberturas.push({ de: cursor, ate: v.de, rotulo: rotuloDeCota(v.de - cursor) });
      }
      aberturas.push({ de: v.de, ate: v.ate, rotulo: rotuloDeCota(v.ate - v.de), vao: true });
      cursor = v.ate;
    }
    if (fimExterno > cursor) {
      aberturas.push({ de: cursor, ate: fimExterno, rotulo: rotuloDeCota(fimExterno - cursor) });
    }
  }

  return { lado, comprimentoMm, total, parcial, internas, aberturas };
}

/** Todas as cadeias de todos os lados do nível. */
export function cadeiasPorLado(model: BlueprintModel, level: Level): CadeiasDoLado[] {
  return contornoExternoDoNivel(model, level)
    .flatMap((anel) => ladosDoContorno(anel))
    .map((lado) => cadeiasDoLado(model, level, lado))
    .filter((c): c is CadeiasDoLado => c !== null);
}

/**
 * A cadeia parcial fecha contra o total?
 *
 * Mesma conferência que quem lê a planta faz somando os números na mão — e é
 * ela que transforma desenho errado em erro, em vez de folha impressa.
 */
export function parcialFecha(c: CadeiasDoLado): boolean {
  const soma = c.parcial.reduce((s, seg) => s + (seg.ate - seg.de), 0);
  return Math.abs(soma - (c.total.ate - c.total.de)) < 1;
}

export const AVISO_COTA_POR_FACE =
  'Cotas: total e parciais pela FACE EXTERNA nos extremos e pelo EIXO nas ' +
  'divisórias; cota de ambiente pela FACE INTERNA.';

/**
 * Referencial de um lado: direção ao longo e normal para FORA.
 *
 * ⚠️ A normal para fora depende do SENTIDO DE GIRO do anel, e a garantia mora
 * em `canonicalizeRing` (kernel), que força anti-horário. Num anel
 * anti-horário o interior fica à ESQUERDA de cada aresta dirigida, logo o
 * exterior fica à direita — e a normal para fora é `(uy, −ux)`.
 *
 * Se algum dia o contorno deixar de vir anti-horário, a cota inteira sai
 * desenhada POR DENTRO da planta. É o tipo de defeito que passa em teste de
 * unidade (os números continuam certos) e salta aos olhos no print — por isso
 * há um teste de invariante, e não só de valor.
 */
export function referencialDoLado(lado: LadoDoContorno): {
  ux: number;
  uy: number;
  /** Normal unitária apontando para FORA da edificação. */
  nx: number;
  ny: number;
} {
  const dx = lado.b.x - lado.a.x;
  const dy = lado.b.y - lado.a.y;
  const comp = Math.hypot(dx, dy) || 1;
  const ux = dx / comp;
  const uy = dy / comp;
  return { ux, uy, nx: uy, ny: -ux };
}

/**
 * Ponto do mundo de uma posição na régua do lado, já afastado para fora.
 *
 * É a única conversão local→mundo do módulo, e os TRÊS renderizadores (canvas,
 * PDF/SVG e DXF) passam por ela. Cota que diverge entre a tela e o CAD é pior
 * que cota nenhuma — e divergiria no dia em que um deles fizesse a conta
 * sozinho.
 */
export function pontoDaCota(
  lado: LadoDoContorno,
  t: number,
  afastamentoMm: number,
): { x: number; y: number } {
  const { ux, uy, nx, ny } = referencialDoLado(lado);
  return {
    x: lado.a.x + ux * t + nx * afastamentoMm,
    y: lado.a.y + uy * t + ny * afastamentoMm,
  };
}

/**
 * Afastamento de cada linha de cota, em mm REAIS do modelo.
 *
 * A ordem é a da prancha: o que descreve o miolo fica perto do desenho, o que
 * descreve o todo fica por fora. Quem converte para papel/tela é o
 * renderizador, que aplica a própria escala.
 */
export const AFASTAMENTO_COTA = {
  /** Esquadria é o que se lê junto do desenho — fica na linha mais interna. */
  aberturas: 1,
  internas: 2,
  parcial: 3,
  total: 4,
} as const;

/**
 * Cadeias de TODOS os níveis do modelo.
 *
 * A exportação (PDF/SVG e DXF) desenha o modelo inteiro e não tem noção de
 * nível — era por isso que a cadeia antiga era do modelo, não do nível. Este
 * atalho preserva esse contrato sem obrigar cada renderizador a percorrer
 * níveis por conta própria.
 */
export function cadeiasDoModelo(model: BlueprintModel): CadeiasDoLado[] {
  return model.levels.flatMap((nivel) => cadeiasPorLado(model, nivel));
}

/** O que existe de cada lado de uma parede. */
export interface AmbientesNaParede {
  /** Normal unitária do eixo. Define qual lado é o "positivo". */
  normal: Point;
  /** Há ambiente derivado do lado positivo da normal? */
  positivo: boolean;
  /** E do lado negativo? */
  negativo: boolean;
}

/**
 * De que lados desta parede há AMBIENTE, em coordenadas do modelo.
 *
 * ─── POR QUE ISTO PRECISA EXISTIR ───────────────────────────────────────────
 *
 * A cota de face interna ("int. 2,70 m") era jogada para o lado OPOSTO ao da
 * cota de eixo, e o lado da cota de eixo é escolhido por uma normal normalizada
 * pela direção da TELA — para o rótulo não depender do sentido em que a parede
 * foi desenhada. A consequência estava escrita no código como limitação aceita:
 * o lado oposto não é necessariamente o interior.
 *
 * Num retângulo isso erra em DUAS das quatro paredes, e na tela o número interno
 * aparece por fora enquanto o da parede vizinha aparece por dentro. Lido junto,
 * parece que as duas medidas foram trocadas.
 *
 * ⚠️ **Saber só "para onde é o dentro" não basta**, e essa foi a primeira
 * tentativa: numa DIVISÓRIA os dois lados são dentro, ela devolvia `null`, e o
 * lado voltava a ser o da tela. Numa planta real a maioria das paredes é
 * divisória — então a correção não alcançava justamente o caso comum, e um
 * cômodo continuava lendo o número de EIXO onde o vizinho lia o interno.
 *
 * Por isso a função devolve os FATOS dos dois lados, e quem desenha decide:
 * perímetro ganha interno para dentro e eixo para fora; divisória ganha o
 * interno repetido nos dois lados, e nenhum eixo — o eixo é o número "de fora",
 * e divisória não tem lado de fora.
 *
 * `null` só para parede degenerada.
 */
export function ambientesNaParede(spaces: Space[], wall: Wall): AmbientesNaParede | null {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return null;

  // Normal unitária do eixo, e o passo que sai da faixa desenhada da parede.
  // `+1` mm além da meia espessura: em cima da face o teste de pertinência fica
  // na fronteira do polígono, e fronteira é onde predicado de ponto-em-polígono
  // não tem resposta estável.
  const normal = { x: -dy / comp, y: dx / comp };
  const passo = wall.thicknessMm / 2 + 1;
  const meio = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };

  const temAmbiente = (sinal: 1 | -1) => {
    const p = {
      x: Math.round(meio.x + normal.x * passo * sinal),
      y: Math.round(meio.y + normal.y * passo * sinal),
    };
    return spaces.some((s) => pointInPolygon(s.ring, p));
  };

  return { normal, positivo: temAmbiente(1), negativo: temAmbiente(-1) };
}

/**
 * Para que lado desta parede fica o AMBIENTE, quando há um só.
 *
 * `null` quando a pergunta não tem resposta única — parede entre dois ambientes
 * ou parede que não fecha nenhum. Quem precisa distinguir esses dois casos usa
 * `ambientesNaParede`, que devolve os fatos crus.
 */
export function normalParaODentro(spaces: Space[], wall: Wall): Point | null {
  const amb = ambientesNaParede(spaces, wall);
  if (!amb || amb.positivo === amb.negativo) return null;
  return amb.positivo ? amb.normal : { x: -amb.normal.x, y: -amb.normal.y };
}
