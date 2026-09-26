/**
 * LOTEAMENTO — o que se DERIVA do desenho de quadras, lotes, vias e áreas
 * públicas (fase B1).
 *
 * Nada aqui é gravado no payload canônico. A faixa da via sai do eixo por
 * offset, a área e a testada saem do anel do lote, e o confrontante sai de
 * quem encosta em cada aresta. Guardar qualquer um desses seria guardar uma
 * cópia que envelhece: mover um vértice já muda os três.
 *
 * A convenção de lado é a da matrícula, a mesma de `blueprintTerreno`: direita
 * e esquerda são as de quem está NA RUA olhando para o lote.
 */
import {
  type Point,
  type BlueprintModel,
  type Lote,
  type Quadra,
  type Via,
  type AreaPublica,
  type TipoDeAreaPublica,
  polygonArea,
  polygonPerimeter,
  signedArea,
  intersecaoDeRetas,
  pointInPolygon,
  FICHA_DA_AREA_PUBLICA,
} from './blueprintKernel';

/** Um lado do lote, na ordem do anel. */
export interface LadoDoLote {
  /** Índice da aresta: vai de `pontos[i]` a `pontos[(i + 1) % n]`. */
  indice: number;
  de: Point;
  para: Point;
  comprimentoMm: number;
  papel: PapelDoLado;
  /** Quem está do outro lado desta aresta; null = nada encontrado. */
  confrontante: string | null;
}

export const PAPEIS_DO_LADO = ['FRENTE', 'FUNDO', 'LATERAL_DIREITA', 'LATERAL_ESQUERDA'] as const;
export type PapelDoLado = (typeof PAPEIS_DO_LADO)[number];
export const ROTULO_DO_PAPEL_DO_LADO: Record<PapelDoLado, string> = {
  FRENTE: 'Frente',
  FUNDO: 'Fundo',
  LATERAL_DIREITA: 'Lateral direita',
  LATERAL_ESQUERDA: 'Lateral esquerda',
};

export interface MedidaDoLote {
  areaMm2: number;
  perimetroMm: number;
  /** Soma das arestas de papel FRENTE. Um lote de esquina tem duas. */
  testadaMm: number;
  lados: LadoDoLote[];
  /** true quando nenhuma aresta encosta numa via. */
  encravado: boolean;
}

/**
 * Tolerância para dizer que duas arestas são a MESMA divisa. Lotes vizinhos são
 * desenhados com encaixe, então coincidem; 50 mm perdoa o clique humano sem
 * juntar dois lotes que estão de fato separados por uma faixa.
 */
export const TOLERANCIA_DE_VIZINHANCA_MM = 50;

function comprimento(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function meio(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Normal da aresta apontando para FORA do anel. O sentido do anel decide o
 * sinal, e é por isso que aqui se usa `signedArea` e nunca `polygonArea`: a
 * segunda devolve o valor absoluto, e com ela todo lote desenhado no sentido
 * contrário teria a normal invertida — o desenho fica idêntico e as laterais
 * trocam de lado, que é o bug mais difícil de enxergar deste módulo.
 */
function normalExterna(anel: Point[], i: number): Point {
  const n = anel.length;
  const a = anel[i];
  const b = anel[(i + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy) || 1;
  const horario = signedArea(anel) < 0;
  // Anel anti-horário: a normal externa é (dy, -dx). Horário: o oposto.
  return horario ? { x: -dy / comp, y: dx / comp } : { x: dy / comp, y: -dx / comp };
}

/** Ponto um pouco FORA do meio da aresta i — é lá que se procura o vizinho. */
function sondaDaAresta(anel: Point[], i: number, recuoMm: number): Point {
  const n = anel.length;
  const m = meio(anel[i], anel[(i + 1) % n]);
  const nrm = normalExterna(anel, i);
  return { x: m.x + nrm.x * recuoMm, y: m.y + nrm.y * recuoMm };
}

/** Distância de um ponto ao segmento a-b. */
function distanciaAoSegmento(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const den = dx * dx + dy * dy;
  if (den === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / den;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * FAIXA DA VIA: a caixa, derivada do eixo por offset dos dois lados.
 *
 * Em polilinha, o offset paralelo de dois trechos seguidos não se encontra na
 * bissetriz — encontra-se no CRUZAMENTO das duas paralelas. Aparar pela
 * bissetriz estreitaria a caixa no canto, e é justamente no canto que o lote
 * de esquina mede a testada.
 */
export function faixaDaVia(eixo: Point[], larguraMm: number): Point[] {
  if (eixo.length < 2 || larguraMm <= 0) return [];
  const meia = larguraMm / 2;
  const lado = (sinal: 1 | -1): Point[] => {
    const segmentos: { a: Point; b: Point }[] = [];
    for (let i = 0; i < eixo.length - 1; i++) {
      const a = eixo[i];
      const b = eixo[i + 1];
      const comp = comprimento(a, b);
      if (comp === 0) continue;
      const nx = (-(b.y - a.y) / comp) * meia * sinal;
      const ny = ((b.x - a.x) / comp) * meia * sinal;
      segmentos.push({ a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } });
    }
    if (segmentos.length === 0) return [];
    const pontos: Point[] = [segmentos[0].a];
    for (let i = 0; i < segmentos.length - 1; i++) {
      const cruz = intersecaoDeRetas(segmentos[i].a, segmentos[i].b, segmentos[i + 1].a, segmentos[i + 1].b);
      // Paralelas (eixo reto que segue reto) não se cruzam: a ponta serve.
      pontos.push(cruz ?? segmentos[i].b);
    }
    pontos.push(segmentos[segmentos.length - 1].b);
    return pontos;
  };
  const esquerda = lado(1);
  const direita = lado(-1);
  if (esquerda.length === 0 || direita.length === 0) return [];
  return [...esquerda, ...direita.reverse()];
}

/** O passeio de cada lado, como duas faixas — vazio quando `calcadaMm` é 0. */
export function calcadasDaVia(via: Via): Point[][] {
  if (via.calcadaMm <= 0) return [];
  const externa = faixaDaVia(via.eixo, via.larguraMm);
  const interna = faixaDaVia(via.eixo, via.larguraMm - via.calcadaMm * 2);
  if (externa.length === 0 || interna.length === 0) return [];
  const n = externa.length / 2;
  const m = interna.length / 2;
  const esqExterna = externa.slice(0, n);
  const dirExterna = externa.slice(n).reverse();
  const esqInterna = interna.slice(0, m);
  const dirInterna = interna.slice(m).reverse();
  return [
    [...esqExterna, ...esqInterna.slice().reverse()],
    [...dirExterna, ...dirInterna.slice().reverse()],
  ];
}

interface Vizinho {
  rotulo: string;
  /** Arestas do vizinho, para medir distância. */
  arestas: { a: Point; b: Point }[];
  anel: Point[];
}

function arestasDe(anel: Point[]): { a: Point; b: Point }[] {
  return anel.map((p, i) => ({ a: p, b: anel[(i + 1) % anel.length] }));
}

function vizinhosDoModelo(model: BlueprintModel, loteId: string): Vizinho[] {
  const vizinhos: Vizinho[] = [];
  for (const l of model.lotes ?? []) {
    if (l.id === loteId) continue;
    const q = l.quadraId != null ? (model.quadras ?? []).find((x) => x.id === l.quadraId) : undefined;
    vizinhos.push({ rotulo: q ? `Lote ${l.numero} da quadra ${q.nome}` : `Lote ${l.numero}`, arestas: arestasDe(l.pontos), anel: l.pontos });
  }
  for (const a of model.areasPublicas ?? []) {
    vizinhos.push({ rotulo: a.nome ?? FICHA_DA_AREA_PUBLICA[a.tipo].rotulo, arestas: arestasDe(a.pontos), anel: a.pontos });
  }
  for (const v of model.vias ?? []) {
    const faixa = faixaDaVia(v.eixo, v.larguraMm);
    if (faixa.length >= 3) vizinhos.push({ rotulo: v.nome, arestas: arestasDe(faixa), anel: faixa });
  }
  return vizinhos;
}

function ehVia(model: BlueprintModel, rotulo: string): boolean {
  return (model.vias ?? []).some((v) => v.nome === rotulo);
}

/**
 * MEDIDA DO LOTE: área, perímetro, papel e confrontante por lado.
 *
 * A FRENTE é a aresta que encosta em via. Sem via nenhuma, cai no
 * `testadaIndex` declarado; sem ele, no lado mais curto — a convenção de
 * loteamento, porque o lote de meio de quadra é mais fundo que largo.
 */
export function medirLote(model: BlueprintModel, lote: Lote): MedidaDoLote {
  const anel = lote.pontos;
  const n = anel.length;
  const vizinhos = vizinhosDoModelo(model, lote.id);
  const recuo = TOLERANCIA_DE_VIZINHANCA_MM * 4;

  const confrontantes: (string | null)[] = [];
  const emVia: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const sonda = sondaDaAresta(anel, i, recuo);
    let achado: string | null = null;
    let melhor = Infinity;
    for (const viz of vizinhos) {
      // Dentro do anel do vizinho, ou encostado numa aresta dele.
      const dentro = viz.anel.length >= 3 && pointInPolygon(viz.anel, sonda);
      const dist = Math.min(...viz.arestas.map((ar) => distanciaAoSegmento(sonda, ar.a, ar.b)));
      const encosta = dentro || dist <= recuo;
      if (encosta && dist < melhor) {
        melhor = dist;
        achado = viz.rotulo;
      }
    }
    confrontantes.push(achado);
    emVia.push(achado != null && ehVia(model, achado));
  }

  let frentes = emVia.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  if (frentes.length === 0) {
    if (lote.testadaIndex != null && lote.testadaIndex < n) frentes = [lote.testadaIndex];
    else {
      let curto = 0;
      for (let i = 1; i < n; i++) {
        if (comprimento(anel[i], anel[(i + 1) % n]) < comprimento(anel[curto], anel[(curto + 1) % n])) curto = i;
      }
      frentes = [curto];
    }
  }
  // Testada declarada pelo usuário manda sobre a derivada, quando é uma delas.
  if (lote.testadaIndex != null && lote.testadaIndex < n && !frentes.includes(lote.testadaIndex)) {
    frentes = [lote.testadaIndex, ...frentes];
  }

  const papeis = papeisDosLados(anel, frentes);
  const lados: LadoDoLote[] = anel.map((p, i) => ({
    indice: i,
    de: p,
    para: anel[(i + 1) % n],
    comprimentoMm: Math.round(comprimento(p, anel[(i + 1) % n])),
    papel: papeis[i],
    confrontante: confrontantes[i],
  }));

  return {
    areaMm2: n >= 3 ? Math.round(Math.abs(polygonArea(anel))) : 0,
    perimetroMm: n >= 3 ? Math.round(polygonPerimeter(anel)) : 0,
    testadaMm: lados.filter((l) => l.papel === 'FRENTE').reduce((s, l) => s + l.comprimentoMm, 0),
    lados,
    encravado: !emVia.some(Boolean),
  };
}

/**
 * Papel de cada lado a partir das frentes. FUNDO é o lado mais oposto à
 * primeira frente (normal virada para trás, > 90°); entre os que sobram, a
 * direita e a esquerda são as de quem olha da rua para o lote — ou seja, com
 * a normal da frente apontando para o observador, o produto vetorial decide.
 */
function papeisDosLados(anel: Point[], frentes: number[]): PapelDoLado[] {
  const n = anel.length;
  const papeis: PapelDoLado[] = new Array(n).fill('LATERAL_DIREITA');
  const nFrente = normalExterna(anel, frentes[0]);

  let fundo = -1;
  let melhor = -Infinity;
  for (let i = 0; i < n; i++) {
    if (frentes.includes(i)) continue;
    const nrm = normalExterna(anel, i);
    const alinhamento = nrm.x * nFrente.x + nrm.y * nFrente.y;
    if (alinhamento > -0.5) continue; // não está virado para trás
    const peso = -alinhamento * comprimento(anel[i], anel[(i + 1) % n]);
    if (peso > melhor) {
      melhor = peso;
      fundo = i;
    }
  }

  for (let i = 0; i < n; i++) {
    if (frentes.includes(i)) {
      papeis[i] = 'FRENTE';
      continue;
    }
    if (i === fundo) {
      papeis[i] = 'FUNDO';
      continue;
    }
    const nrm = normalExterna(anel, i);
    // Quem vem da rua olha na direção -nFrente; o que estiver à sua direita
    // tem produto vetorial negativo com essa direção de vista.
    const cruz = nFrente.x * nrm.y - nFrente.y * nrm.x;
    papeis[i] = cruz > 0 ? 'LATERAL_ESQUERDA' : 'LATERAL_DIREITA';
  }
  return papeis;
}

/** Área de um anel em m², arredondada a 2 casas (a unidade do memorial). */
export function areaEmM2(anel: Point[]): number {
  if (anel.length < 3) return 0;
  return Math.round((Math.abs(polygonArea(anel)) / 1_000_000) * 100) / 100;
}

export interface LinhaDeAreas {
  chave: string;
  rotulo: string;
  quantidade: number;
  areaM2: number;
  /** Sobre a área da gleba; null quando a gleba não está desenhada. */
  percentual: number | null;
}

/**
 * QUADRO DE ÁREAS do loteamento — o que a prefeitura confere: quanto virou
 * lote, quanto virou via, quanto virou área verde e institucional.
 *
 * A via entra pela FAIXA derivada, não pelo comprimento do eixo: é a caixa que
 * se doa ao município.
 */
export function areasDoLoteamento(model: BlueprintModel, areaDaGlebaMm2: number | null): LinhaDeAreas[] {
  const lotes = model.lotes ?? [];
  const vias = model.vias ?? [];
  const areas = model.areasPublicas ?? [];
  const glebaM2 = areaDaGlebaMm2 != null && areaDaGlebaMm2 > 0 ? areaDaGlebaMm2 / 1_000_000 : null;
  const pct = (m2: number): number | null => (glebaM2 ? Math.round((m2 / glebaM2) * 10000) / 100 : null);

  const linhas: LinhaDeAreas[] = [];
  const areaLotes = lotes.filter((l) => l.tipo === 'LOTE').reduce((s, l) => s + areaEmM2(l.pontos), 0);
  linhas.push({ chave: 'LOTES', rotulo: 'Lotes', quantidade: lotes.filter((l) => l.tipo === 'LOTE').length, areaM2: arredondar(areaLotes), percentual: pct(areaLotes) });

  const areaVias = vias.reduce((s, v) => s + areaEmM2(faixaDaVia(v.eixo, v.larguraMm)), 0);
  linhas.push({ chave: 'VIAS', rotulo: 'Sistema viário', quantidade: vias.length, areaM2: arredondar(areaVias), percentual: pct(areaVias) });

  for (const tipo of ['VERDE', 'INSTITUCIONAL', 'RESERVA'] as TipoDeAreaPublica[]) {
    const dosTipo = areas.filter((a) => a.tipo === tipo);
    if (dosTipo.length === 0) continue;
    const m2 = dosTipo.reduce((s, a) => s + areaEmM2(a.pontos), 0);
    linhas.push({ chave: tipo, rotulo: FICHA_DA_AREA_PUBLICA[tipo].rotulo, quantidade: dosTipo.length, areaM2: arredondar(m2), percentual: pct(m2) });
  }

  const remanescentes = lotes.filter((l) => l.tipo === 'REMANESCENTE');
  if (remanescentes.length > 0) {
    const m2 = remanescentes.reduce((s, l) => s + areaEmM2(l.pontos), 0);
    linhas.push({ chave: 'REMANESCENTE', rotulo: 'Remanescente', quantidade: remanescentes.length, areaM2: arredondar(m2), percentual: pct(m2) });
  }
  return linhas;
}

function arredondar(m2: number): number {
  return Math.round(m2 * 100) / 100;
}

/**
 * NUMERAÇÃO da quadra: sentido horário a partir do lote mais próximo do canto
 * escolhido. Determinística de propósito — numerar duas vezes o mesmo desenho
 * tem de dar a mesma coisa, senão o memorial de ontem não bate com o de hoje.
 */
export function numerarQuadra(
  model: BlueprintModel,
  quadra: Quadra,
  opcoes: { inicio?: number; prefixo?: string; cantoDePartida?: Point } = {},
): { loteId: string; numero: string }[] {
  const lotes = (model.lotes ?? []).filter((l) => l.quadraId === quadra.id && l.tipo === 'LOTE');
  if (lotes.length === 0) return [];
  const centro = centroide(quadra.pontos);
  const partida = opcoes.cantoDePartida ?? quadra.pontos[0];
  const anguloDePartida = Math.atan2(partida.y - centro.y, partida.x - centro.x);

  const comAngulo = lotes.map((l) => {
    const c = centroide(l.pontos);
    // Horário: o ângulo DIMINUI, então ordenamos pelo giro negativo.
    let giro = anguloDePartida - Math.atan2(c.y - centro.y, c.x - centro.x);
    while (giro < 0) giro += Math.PI * 2;
    while (giro >= Math.PI * 2) giro -= Math.PI * 2;
    return { lote: l, giro };
  });
  comAngulo.sort((a, b) => a.giro - b.giro || a.lote.pontos[0].x - b.lote.pontos[0].x || a.lote.pontos[0].y - b.lote.pontos[0].y);

  const inicio = opcoes.inicio ?? 1;
  const prefixo = opcoes.prefixo ?? '';
  return comAngulo.map((x, i) => ({ loteId: x.lote.id, numero: `${prefixo}${inicio + i}` }));
}

export function centroide(anel: Point[]): Point {
  if (anel.length === 0) return { x: 0, y: 0 };
  if (anel.length < 3) {
    return { x: anel.reduce((s, p) => s + p.x, 0) / anel.length, y: anel.reduce((s, p) => s + p.y, 0) / anel.length };
  }
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < anel.length; i++) {
    const p = anel[i];
    const q = anel[(i + 1) % anel.length];
    const f = p.x * q.y - q.x * p.y;
    a2 += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (a2 === 0) {
    return { x: anel.reduce((s, p) => s + p.x, 0) / anel.length, y: anel.reduce((s, p) => s + p.y, 0) / anel.length };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

/** Rótulo curto do lote, o que vai no desenho e no espelho de vendas. */
export function rotuloDoLote(model: BlueprintModel, lote: Lote): string {
  const q = lote.quadraId != null ? (model.quadras ?? []).find((x) => x.id === lote.quadraId) : undefined;
  return q ? `Quadra ${q.nome} · Lote ${lote.numero}` : `Lote ${lote.numero}`;
}

/** As áreas públicas de um tipo, para o desenho e o quadro. */
export function areasPublicasDoTipo(model: BlueprintModel, tipo: TipoDeAreaPublica): AreaPublica[] {
  return (model.areasPublicas ?? []).filter((a) => a.tipo === tipo);
}


// ─── B2: SUBDIVISÃO AUTOMÁTICA E CONFERÊNCIA DA LEI 6.766/79 ────────────

/**
 * Os mínimos do art. 4º, II da Lei 6.766/79, que valem quando a lei municipal
 * não disser outra coisa — e ela quase sempre diz. São PISO nacional: o
 * município pode exigir mais, nunca menos.
 */
export const AREA_MINIMA_LEI_6766_M2 = 125;
export const TESTADA_MINIMA_LEI_6766_MM = 5000;
/**
 * A faixa não edificável de 15 m de cada lado ao longo de águas correntes e
 * dormentes, rodovias, ferrovias e dutos (art. 4º, III). Não é derivada do
 * desenho: depende de existir uma `Boundary` de RESTRIÇÃO dizendo o que é.
 */
export const FAIXA_NAO_EDIFICAVEL_LEI_6766_MM = 15000;

export interface ParametrosDaSubdivisao {
  /** Testada de cada lote, em mm. É a medida que o loteador escolhe primeiro. */
  testadaMm: number;
  /** Profundidade, em mm. `null` = até o outro lado da quadra. */
  profundidadeMm: number | null;
  /**
   * De que lado da quadra as frentes olham: o ÍNDICE da aresta da quadra que
   * dá para a via. As fatias saem perpendiculares a ela.
   */
  frenteIndex: number;
  /**
   * Fatiar também o lado OPOSTO, de costas (a quadra dupla, com duas fileiras
   * de lotes fundo com fundo). Só faz sentido com profundidade declarada.
   */
  duasFileiras: boolean;
}

export const SUBDIVISAO_PADRAO: ParametrosDaSubdivisao = {
  testadaMm: 12000,
  profundidadeMm: 30000,
  frenteIndex: 0,
  duasFileiras: false,
};

export interface LotePropostoDaSubdivisao {
  pontos: Point[];
  areaM2: number;
  testadaM: number;
  /** A fileira: 0 = de frente para a via escolhida; 1 = a de costas. */
  fileira: number;
}

export interface PropostaDeSubdivisao {
  lotes: LotePropostoDaSubdivisao[];
  /** O que sobrou da quadra depois das fatias inteiras, em m². */
  sobraM2: number;
  /**
   * Por que a proposta não cobre tudo, quando não cobre. Texto para a tela —
   * uma sobra sem explicação parece defeito.
   */
  aviso: string | null;
}

/**
 * SUBDIVIDIR a quadra em lotes de testada fixa.
 *
 * O caso que este motor resolve é o da quadra de lados retos — que é o que
 * loteamento urbano tem. Ele fatia PERPENDICULARMENTE à aresta de frente
 * escolhida, começando pelo vértice inicial dela, e recorta cada fatia contra
 * a quadra. Não tenta ser um resolvedor geral: quadra com lado curvo ou muito
 * irregular devolve o que couber e diz na `aviso` o que ficou de fora — sobra
 * declarada é informação; sobra silenciosa é defeito.
 *
 * ⚠️ A proposta NÃO grava nada. Quem grava é o comando que a aceita, num
 * lote só de comandos (um Ctrl+Z desfaz a quadra inteira).
 */
export function subdividirQuadra(quadra: Quadra, p: ParametrosDaSubdivisao): PropostaDeSubdivisao {
  const anel = quadra.pontos;
  const n = anel.length;
  const vazia: PropostaDeSubdivisao = { lotes: [], sobraM2: areaEmM2(anel), aviso: null };
  if (n < 3 || p.testadaMm <= 0) return { ...vazia, aviso: 'Quadra ou testada inválida.' };
  const i = ((p.frenteIndex % n) + n) % n;

  const a = anel[i];
  const b = anel[(i + 1) % n];
  const compFrente = Math.hypot(b.x - a.x, b.y - a.y);
  if (compFrente < p.testadaMm) {
    return { ...vazia, aviso: `A frente escolhida tem ${(compFrente / 1000).toFixed(2).replace('.', ',')} m — menos que a testada de ${(p.testadaMm / 1000).toFixed(2).replace('.', ',')} m.` };
  }

  // Direção ao longo da frente, e a normal apontando para DENTRO da quadra.
  const ux = (b.x - a.x) / compFrente;
  const uy = (b.y - a.y) / compFrente;
  const fora = normalExterna(anel, i);
  const nx = -fora.x;
  const ny = -fora.y;

  // Profundidade: a declarada, ou a maior que a quadra comporta a partir da frente.
  const profundidadeDaQuadra = Math.max(
    0,
    ...anel.map((q) => (q.x - a.x) * nx + (q.y - a.y) * ny),
  );
  const prof = p.profundidadeMm != null && p.profundidadeMm > 0 ? Math.min(p.profundidadeMm, profundidadeDaQuadra) : profundidadeDaQuadra;
  if (prof <= 0) return { ...vazia, aviso: 'A quadra não tem profundidade a partir dessa frente.' };

  const quantos = Math.floor(compFrente / p.testadaMm);
  const lotes: LotePropostoDaSubdivisao[] = [];
  const fatiar = (deslocamento: number, fileira: number) => {
    for (let k = 0; k < quantos; k += 1) {
      const t0 = k * p.testadaMm;
      const t1 = t0 + p.testadaMm;
      const canto = (t: number, d: number): Point => ({
        x: Math.round(a.x + ux * t + nx * d),
        y: Math.round(a.y + uy * t + ny * d),
      });
      const pontos = [canto(t0, deslocamento), canto(t1, deslocamento), canto(t1, deslocamento + prof), canto(t0, deslocamento + prof)];
      lotes.push({ pontos, areaM2: areaEmM2(pontos), testadaM: Math.round((p.testadaMm / 1000) * 100) / 100, fileira });
    }
  };
  fatiar(0, 0);

  // A segunda fileira nasce de COSTAS para a primeira, ocupando o resto da
  // profundidade — e só quando ela cabe inteira. Meia fileira não é lote.
  let usado = prof;
  if (p.duasFileiras && profundidadeDaQuadra - prof >= prof) {
    fatiar(prof, 1);
    usado = prof * 2;
  }

  const sobraDaFrente = compFrente - quantos * p.testadaMm;
  const areaDosLotes = lotes.reduce((s, l) => s + l.areaM2, 0);
  const sobraM2 = Math.round((areaEmM2(anel) - areaDosLotes) * 100) / 100;

  const partes: string[] = [];
  if (sobraDaFrente >= 1) partes.push(`sobram ${(sobraDaFrente / 1000).toFixed(2).replace('.', ',')} m de testada no fim da fileira`);
  if (profundidadeDaQuadra - usado >= 1000) partes.push(`${((profundidadeDaQuadra - usado) / 1000).toFixed(2).replace('.', ',')} m de profundidade não loteados`);

  return {
    lotes,
    sobraM2,
    aviso: partes.length > 0 ? `${partes.join(' e ')} — vire área pública, remanescente ou ajuste a testada.` : null,
  };
}

export type GravidadeDoAviso = 'ERRO' | 'ATENCAO' | 'OK';

export interface AvisoDoLoteamento {
  /** A que se refere: `null` = o loteamento inteiro. */
  loteId: string | null;
  rotulo: string;
  gravidade: GravidadeDoAviso;
  texto: string;
  /** A regra que o gerou, para a tela agrupar. */
  regra: 'area_minima' | 'testada_minima' | 'encravado' | 'sem_quadra' | 'areas_publicas' | 'numero_repetido';
}

export interface RegrasDoLoteamento {
  /** Da zona (`areaMinimaDoLoteM2`) ou o piso da Lei 6.766. */
  areaMinimaM2: number;
  /** Da zona (`testadaMinimaMm`) ou o piso da Lei 6.766. */
  testadaMinimaMm: number;
  /**
   * Percentual mínimo de áreas públicas sobre a gleba. A Lei 6.766 NÃO fixa
   * número desde a Lei 9.785/99 — quem fixa é a lei municipal. `null` =
   * ninguém disse, e aí a conferência INFORMA o percentual sem reprovar.
   */
  areasPublicasMinPct: number | null;
}

export const REGRAS_PADRAO_DO_LOTEAMENTO: RegrasDoLoteamento = {
  areaMinimaM2: AREA_MINIMA_LEI_6766_M2,
  testadaMinimaMm: TESTADA_MINIMA_LEI_6766_MM,
  areasPublicasMinPct: null,
};

/**
 * CONFERIR o loteamento. Só acusa — nada trava, nada muda o desenho.
 *
 * ⚠️ O percentual de áreas públicas só REPROVA quando alguém informou o
 * mínimo. Desde a Lei 9.785/99 a Lei 6.766 não traz mais os 35% que muita
 * gente ainda cita de cabeça; exigir um número federal que não existe faria o
 * sistema reprovar projeto correto.
 */
export function conferirLoteamento(
  model: BlueprintModel,
  regras: RegrasDoLoteamento,
  areaDaGlebaMm2: number | null,
): AvisoDoLoteamento[] {
  const avisos: AvisoDoLoteamento[] = [];
  const lotes = (model.lotes ?? []).filter((l) => l.tipo === 'LOTE');
  const m2 = (v: number) => v.toFixed(2).replace('.', ',');

  for (const lote of lotes) {
    const rotulo = rotuloDoLote(model, lote);
    const medida = medirLote(model, lote);
    const areaM2 = medida.areaMm2 / 1e6;

    if (areaM2 < regras.areaMinimaM2) {
      avisos.push({
        loteId: lote.id,
        rotulo,
        gravidade: 'ERRO',
        regra: 'area_minima',
        texto: `Área ${m2(areaM2)} m² < mínimo ${m2(regras.areaMinimaM2)} m².`,
      });
    }
    if (medida.testadaMm < regras.testadaMinimaMm) {
      avisos.push({
        loteId: lote.id,
        rotulo,
        gravidade: 'ERRO',
        regra: 'testada_minima',
        texto: `Testada ${m2(medida.testadaMm / 1000)} m < mínima ${m2(regras.testadaMinimaMm / 1000)} m.`,
      });
    }
    if (medida.encravado) {
      avisos.push({
        loteId: lote.id,
        rotulo,
        gravidade: 'ERRO',
        regra: 'encravado',
        texto: 'Nenhum lado dá para via — lote encravado.',
      });
    }
    if (lote.quadraId == null && (model.quadras ?? []).length > 0) {
      avisos.push({
        loteId: lote.id,
        rotulo,
        gravidade: 'ATENCAO',
        regra: 'sem_quadra',
        texto: 'Fora de qualquer quadra — o memorial sai sem a quadra.',
      });
    }
  }

  // Número repetido DENTRO da mesma quadra. Entre quadras, repetir é o normal.
  const porQuadra = new Map<string, Map<string, number>>();
  for (const lote of lotes) {
    const chave = lote.quadraId ?? 'sem-quadra';
    const conta = porQuadra.get(chave) ?? new Map<string, number>();
    conta.set(lote.numero, (conta.get(lote.numero) ?? 0) + 1);
    porQuadra.set(chave, conta);
  }
  for (const [chave, conta] of porQuadra) {
    const quadra = (model.quadras ?? []).find((q) => q.id === chave);
    for (const [numero, vezes] of conta) {
      if (vezes > 1) {
        avisos.push({
          loteId: null,
          rotulo: quadra ? `Quadra ${quadra.nome}` : 'Lotes sem quadra',
          gravidade: 'ERRO',
          regra: 'numero_repetido',
          texto: `${vezes} lotes com o número ${numero} — use "Numerar" ou renomeie.`,
        });
      }
    }
  }

  // ÁREAS PÚBLICAS sobre a gleba.
  if (areaDaGlebaMm2 != null && areaDaGlebaMm2 > 0) {
    const glebaM2 = areaDaGlebaMm2 / 1e6;
    const publicasM2 =
      (model.areasPublicas ?? []).reduce((s, a) => s + areaEmM2(a.pontos), 0) +
      (model.vias ?? []).reduce((s, v) => s + areaEmM2(faixaDaVia(v.eixo, v.larguraMm)), 0);
    const pct = Math.round((publicasM2 / glebaM2) * 10000) / 100;
    if (regras.areasPublicasMinPct == null) {
      avisos.push({
        loteId: null,
        rotulo: 'Loteamento',
        gravidade: 'OK',
        regra: 'areas_publicas',
        texto: `Áreas públicas (vias + verde + institucional): ${m2(pct)}% da gleba. A lei municipal é que fixa o mínimo — informe na zona para conferir.`,
      });
    } else {
      const ok = pct >= regras.areasPublicasMinPct;
      avisos.push({
        loteId: null,
        rotulo: 'Loteamento',
        gravidade: ok ? 'OK' : 'ERRO',
        regra: 'areas_publicas',
        texto: `Áreas públicas ${m2(pct)}% ${ok ? '≥' : '<'} mínimo ${m2(regras.areasPublicasMinPct)}% da gleba.`,
      });
    }
  }

  return avisos;
}

/** Quantos erros e atencoes, para o botão do ribbon mostrar a contagem. */
export function resumoDaConferencia(avisos: AvisoDoLoteamento[]): { erros: number; atencoes: number } {
  return {
    erros: avisos.filter((a) => a.gravidade === 'ERRO').length,
    atencoes: avisos.filter((a) => a.gravidade === 'ATENCAO').length,
  };
}
