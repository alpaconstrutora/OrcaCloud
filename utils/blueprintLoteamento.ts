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
