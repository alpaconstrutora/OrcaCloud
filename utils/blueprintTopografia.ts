/**
 * TOPOGRAFIA do lote — grade de elevação, curvas de nível, perfil e malha.
 *
 * ─── O QUE ESTE MÓDULO É ────────────────────────────────────────────────────
 *
 * O motor do PRD "Mapas Topográficos" (RF-008…RF-013), reduzido ao que a Planta
 * Inteligente precisa: uma GRADE regular de cotas sobre a caixa do lote, as
 * ISOLINHAS dessa grade (marching squares), o recorte no anel do lote, as
 * estatísticas, e as duas leituras derivadas — o PERFIL ao longo de uma linha
 * (para o corte) e a MALHA triangulada (para o 3D).
 *
 * ─── ESTE MÓDULO É PURO ─────────────────────────────────────────────────────
 *
 * Recebe números, devolve números. Não conhece React, fetch, Supabase nem
 * `THREE` — é o que permite testá-lo com as fixtures do PRD (§20.2: plano,
 * rampa, cone, sela, `nodata`) sem navegador, e o que impede uma segunda cópia
 * do marching squares nascer dentro do canvas ou do viewer 3D, que está sob
 * `@ts-nocheck` e já escondeu quatro defeitos.
 *
 * ─── UNIDADES ───────────────────────────────────────────────────────────────
 *
 * Posição em MILÍMETRO no plano do desenho (o mesmo `Point` do kernel — os nós
 * da grade e as curvas saem em ponto flutuante de propósito: uma curva de nível
 * arredondada ao mm ganharia degraus visíveis). COTA em METRO, absoluta, no
 * referencial vertical da fonte. A ponte entre cota absoluta e o zero do
 * desenho é `Georreferencia.elevacaoM`; quem a aplica é quem projeta (corte,
 * 3D), não este módulo.
 *
 * ─── O QUE ELE NÃO INVENTA ──────────────────────────────────────────────────
 *
 * Célula com `nodata` não gera curva nem triângulo. Grade mais densa que a
 * resolução da fonte é permitida (suaviza o desenho) mas AVISADA, e nunca mais
 * fina que meia célula da fonte. Lote com menos de 3 células da fonte no lado
 * menor é RECUSADO — com um DEM de 90 m, curva de 1 m num lote de 12 × 30 m é
 * ficção gráfica (DR-08 da reconciliação de 30/08).
 */

import {
  pointInPolygon,
  polygonArea,
  sha256,
  stableStringify,
  type Georreferencia,
  type Point,
} from './blueprintKernel';

// ── Constantes declaradas ──────────────────────────────────────────────────

/** Nome e versão do algoritmo — vão na proveniência de toda versão gerada. */
export const ALGORITMO_TOPOGRAFIA = { nome: 'opura-curvas-de-nivel', versao: '1.0.0' } as const;

/**
 * Teto de nós por grade.
 *
 * Medido em 11/09/2026 (Node, lote de 100 × 100 m, 40 pontos cotados): o motor
 * inteiro — TIN, curvas, estatísticas e hashes, terraplenagem, declividade,
 * hipsometria e malha 3D — roda em 55 ms a 10 mil nós, 70 ms a 40 mil, 160 ms
 * a 94 mil e 230 ms a 162 mil. O que cresce de verdade é a LINHA gravada:
 * 280 KB, 830 KB, 1,9 MB e 2,8 MB. O teto fica em 40 mil, onde a versão
 * ainda cabe com folga numa requisição e o quadro redesenha sem engasgar.
 */
export const TETO_DE_NOS = 40_000;

/** Quantas células da FONTE o lado menor do lote precisa ter para o DEM valer. */
export const CELULAS_MINIMAS_DA_FONTE = 3;

/** Mais níveis que isto é equidistância errada, não terreno. */
export const MAX_NIVEIS = 200;

/** Toda quinta curva é mestra (mais grossa, com a cota escrita). */
export const MESTRA_A_CADA = 5;

/** Passo mínimo da grade, em mm. Abaixo disso o desenho não distingue. */
const ESPACAMENTO_MINIMO_MM = 100;

export const AVISO_PRELIMINAR =
  'Estudo preliminar gerado a partir de modelo de elevação remoto. Não substitui ' +
  'levantamento topográfico realizado e validado por profissional habilitado.';

export const AVISO_LEVANTAMENTO =
  'Curvas geradas a partir de pontos cotados informados à mão. A precisão é a do ' +
  'levantamento de origem — confira contra o documento do topógrafo.';

// ── Tipos ─────────────────────────────────────────────────────────────────

export type ClasseDeQualidade = 'PRELIMINAR_REMOTO' | 'LEVANTAMENTO_IMPORTADO';

export type QualidadeDaGrade = 'RAPIDA' | 'EQUILIBRADA' | 'DETALHADA';

/** Cota conhecida num ponto do desenho — o que o topógrafo entrega. */
export interface PontoCotado {
  x: number;
  y: number;
  cotaM: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Grade regular de cotas. `cotasM[linha * colunas + coluna]`; `null` = `nodata`.
 * Nó (l, c) fica em `(origem.x + c·espacamento, origem.y + l·espacamento)`.
 */
export interface GradeDeElevacao {
  origem: Point;
  espacamentoMm: number;
  colunas: number;
  linhas: number;
  cotasM: (number | null)[];
}

export interface CurvaDeNivel {
  cotaM: number;
  mestra: boolean;
  /** Em mm, ponto flutuante. Curva fechada repete o primeiro ponto no fim. */
  pontos: Point[];
  fechada: boolean;
}

export interface EstatisticasDoTerreno {
  cotaMinM: number;
  cotaMaxM: number;
  cotaMediaM: number;
  amplitudeM: number;
  amostrasValidas: number;
  amostrasAusentes: number;
  /** Nós da grade que caem dentro do lote — a base das cotas acima. */
  amostrasNoLote: number;
  areaM2: number;
  espacamentoM: number;
  curvas: number;
  comprimentoDasCurvasM: number;
}

export interface Caixa {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ── Caixa e grade ─────────────────────────────────────────────────────────

export function caixaDoAnel(anel: Point[]): Caixa {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of anel) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * A grade que cobre o lote, com UMA célula de folga em volta.
 *
 * A folga não é enfeite: o marching squares só produz segmento entre nós, e uma
 * grade que terminasse exatamente na divisa deixaria a curva parar meia célula
 * antes dela. Com a folga, a curva atravessa a divisa e o recorte a corta no
 * lugar certo.
 */
export function planejarGrade(anel: Point[], espacamentoMm: number): GradeDeElevacao {
  if (espacamentoMm <= 0) throw new Error('espaçamento da grade tem de ser positivo');
  const caixa = caixaDoAnel(anel);
  const origem = { x: caixa.minX - espacamentoMm, y: caixa.minY - espacamentoMm };
  const colunas = Math.ceil((caixa.maxX - origem.x) / espacamentoMm) + 2;
  const linhas = Math.ceil((caixa.maxY - origem.y) / espacamentoMm) + 2;
  return {
    origem,
    espacamentoMm,
    colunas,
    linhas,
    cotasM: new Array<number | null>(colunas * linhas).fill(null),
  };
}

/** Os nós da grade, na ordem de `cotasM`. */
export function nosDaGrade(grade: GradeDeElevacao): Point[] {
  const nos: Point[] = [];
  for (let l = 0; l < grade.linhas; l++) {
    for (let c = 0; c < grade.colunas; c++) {
      nos.push({
        x: grade.origem.x + c * grade.espacamentoMm,
        y: grade.origem.y + l * grade.espacamentoMm,
      });
    }
  }
  return nos;
}

/** Quantas células cabem no lado MAIOR da caixa, por preset de qualidade. */
const CELULAS_POR_QUALIDADE: Record<QualidadeDaGrade, number> = {
  RAPIDA: 20,
  EQUILIBRADA: 40,
  DETALHADA: 80,
};

/**
 * Traduz a qualidade pedida em espaçamento, respeitando a fonte e o teto.
 *
 * Três limites, nesta ordem:
 * 1. nunca mais fino que meia célula da fonte — abaixo disso é só interpolação
 *    da interpolação;
 * 2. nunca mais que `TETO_DE_NOS`;
 * 3. nunca abaixo de `ESPACAMENTO_MINIMO_MM`.
 *
 * Grade mais densa que a resolução nominal ainda é permitida (RF-008: suaviza o
 * desenho), mas sai com aviso — o produto não pode deixar a densidade da grade
 * passar por precisão da fonte (RN-003).
 */
export function espacamentoPorQualidade(
  anel: Point[],
  qualidade: QualidadeDaGrade,
  resolucaoFonteM: number | null,
): { espacamentoMm: number; avisos: string[] } {
  const caixa = caixaDoAnel(anel);
  const ladoMaior = Math.max(caixa.maxX - caixa.minX, caixa.maxY - caixa.minY);
  const avisos: string[] = [];

  let esp = Math.max(
    ESPACAMENTO_MINIMO_MM,
    Math.ceil(ladoMaior / CELULAS_POR_QUALIDADE[qualidade] / 10) * 10,
  );

  if (resolucaoFonteM !== null) {
    const meiaCelula = (resolucaoFonteM * 1000) / 2;
    if (esp < meiaCelula) esp = Math.ceil(meiaCelula / 10) * 10;
  }

  // Teto de nós: engrossa o passo até caber. Cresce em 10 % por volta para não
  // pular de 1 m para 5 m num salto.
  while (nosEstimados(caixa, esp) > TETO_DE_NOS) esp = Math.ceil((esp * 1.1) / 10) * 10;

  if (resolucaoFonteM !== null && esp < resolucaoFonteM * 1000) {
    avisos.push(
      `A grade (${(esp / 1000).toFixed(1).replace('.', ',')} m) é mais densa que a fonte ` +
        `(${resolucaoFonteM} m): o desenho fica mais suave, mas a precisão continua a da fonte.`,
    );
  }

  return { espacamentoMm: esp, avisos };
}

function nosEstimados(caixa: Caixa, esp: number): number {
  const colunas = Math.ceil((caixa.maxX - caixa.minX) / esp) + 3;
  const linhas = Math.ceil((caixa.maxY - caixa.minY) / esp) + 3;
  return colunas * linhas;
}

/**
 * DR-08: a fonte remota é RECUSADA quando o lote é pequeno demais para ela.
 *
 * Com DEM de 90 m, o lado menor precisa de 270 m. Um lote urbano de 12 × 30 m
 * cabe dentro de UM pixel — a curva de 1 m que sairia dali seria a interpolação
 * entre quatro números que nem são do lote. A mensagem diz o que fazer em vez
 * de só dizer não.
 */
export function verificarResolucao(
  anel: Point[],
  resolucaoFonteM: number,
): { ok: boolean; celulasNoLadoMenor: number; mensagem: string | null } {
  const caixa = caixaDoAnel(anel);
  const ladoMenorM = Math.min(caixa.maxX - caixa.minX, caixa.maxY - caixa.minY) / 1000;
  const celulas = ladoMenorM / resolucaoFonteM;
  if (celulas >= CELULAS_MINIMAS_DA_FONTE) {
    return { ok: true, celulasNoLadoMenor: celulas, mensagem: null };
  }
  const minimoM = CELULAS_MINIMAS_DA_FONTE * resolucaoFonteM;
  return {
    ok: false,
    celulasNoLadoMenor: celulas,
    mensagem:
      `O lado menor do lote tem ${ladoMenorM.toFixed(0)} m e esta fonte resolve ${resolucaoFonteM} m: ` +
      `cabem ${celulas.toFixed(1).replace('.', ',')} células, e o mínimo é ${CELULAS_MINIMAS_DA_FONTE} ` +
      `(${minimoM} m). Para um lote deste tamanho, use os pontos cotados do levantamento.`,
  };
}

// ── Georreferência ────────────────────────────────────────────────────────

/** Metros por grau de latitude, na latitude dada (série do elipsoide WGS 84). */
export function metrosPorGrauLatitude(latDeg: number): number {
  const f = (latDeg * Math.PI) / 180;
  return 111132.954 - 559.822 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f);
}

/** Metros por grau de longitude, na latitude dada. */
export function metrosPorGrauLongitude(latDeg: number): number {
  const f = (latDeg * Math.PI) / 180;
  return 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) + 0.118 * Math.cos(5 * f);
}

/**
 * Ponto do desenho (mm, origem em `georreferencia`) → latitude/longitude.
 *
 * `rotacaoNorteDeg` é quanto o +Y do desenho está girado em relação ao NORTE,
 * anti-horário. Então o +Y aponta para `(−sen θ, cos θ)` em (Leste, Norte) e o
 * +X, 90° à direita dele, para `(cos θ, sen θ)`:
 *
 *   E = x·cos θ − y·sen θ        N = x·sen θ + y·cos θ
 *
 * Plano tangente local, não projeção: a poucos quilômetros da origem o erro é
 * de centímetros, muito abaixo da célula de qualquer DEM público. Não serve
 * para o `IfcMapConversion` — aquele exige E/N medidos por topógrafo, e o
 * kernel já recusa calculá-los (ver `Georreferencia.projetada`).
 */
/** O inverso exato de `localParaGeo`: latitude/longitude → ponto do desenho (mm). */
export function geoParaLocal(c: LatLon, geo: Georreferencia): Point {
  const theta = ((geo.rotacaoNorteDeg ?? 0) * Math.PI) / 180;
  const lesteM = (c.lon - geo.longitude) * metrosPorGrauLongitude(geo.latitude);
  const norteM = (c.lat - geo.latitude) * metrosPorGrauLatitude(geo.latitude);
  // E = x·cos θ − y·sen θ ; N = x·sen θ + y·cos θ  ⇒  x = E·cos θ + N·sen θ ; y = −E·sen θ + N·cos θ
  const xM = lesteM * Math.cos(theta) + norteM * Math.sin(theta);
  const yM = -lesteM * Math.sin(theta) + norteM * Math.cos(theta);
  return { x: xM * 1000, y: yM * 1000 };
}

export function localParaGeo(p: Point, geo: Georreferencia): LatLon {
  const theta = ((geo.rotacaoNorteDeg ?? 0) * Math.PI) / 180;
  const xM = p.x / 1000;
  const yM = p.y / 1000;
  const lesteM = xM * Math.cos(theta) - yM * Math.sin(theta);
  const norteM = xM * Math.sin(theta) + yM * Math.cos(theta);
  return {
    lat: geo.latitude + norteM / metrosPorGrauLatitude(geo.latitude),
    lon: geo.longitude + lesteM / metrosPorGrauLongitude(geo.latitude),
  };
}

// ── Pontos cotados → TIN ──────────────────────────────────────────────────

interface Triangulo {
  a: number;
  b: number;
  c: number;
}

interface Vertice2 {
  x: number;
  y: number;
}

/**
 * Triangulação de Delaunay (Bowyer–Watson). `n` é pequeno — dezenas de pontos
 * cotados — então o algoritmo simples basta; o que importa é ser determinístico.
 * Devolve índices sobre `pontos`. Pontos colineares dão lista vazia.
 */
export function triangular(pontos: Vertice2[]): Triangulo[] {
  if (pontos.length < 3) return [];

  const caixa = caixaDoAnel(pontos as Point[]);
  const dx = Math.max(caixa.maxX - caixa.minX, 1);
  const dy = Math.max(caixa.maxY - caixa.minY, 1);
  const dMax = Math.max(dx, dy) * 20;
  const midX = (caixa.minX + caixa.maxX) / 2;
  const midY = (caixa.minY + caixa.maxY) / 2;

  const n = pontos.length;
  // Super-triângulo nos índices n, n+1, n+2.
  const vs: Vertice2[] = [
    ...pontos,
    { x: midX - dMax, y: midY - dMax },
    { x: midX, y: midY + dMax },
    { x: midX + dMax, y: midY - dMax },
  ];

  let tris: Triangulo[] = [{ a: n, b: n + 1, c: n + 2 }];

  for (let i = 0; i < n; i++) {
    const p = vs[i];
    const ruins: Triangulo[] = [];
    const bons: Triangulo[] = [];
    for (const t of tris) {
      if (dentroDoCircuncirculo(p, vs[t.a], vs[t.b], vs[t.c])) ruins.push(t);
      else bons.push(t);
    }

    // Arestas do buraco: as que aparecem em UM só triângulo ruim.
    const contagem = new Map<string, [number, number]>();
    for (const t of ruins) {
      for (const [u, v] of [
        [t.a, t.b],
        [t.b, t.c],
        [t.c, t.a],
      ] as [number, number][]) {
        const chave = u < v ? `${u}-${v}` : `${v}-${u}`;
        const antes = contagem.get(chave);
        if (antes) contagem.delete(chave);
        else contagem.set(chave, [u, v]);
      }
    }

    tris = bons;
    for (const [u, v] of contagem.values()) tris.push({ a: u, b: v, c: i });
  }

  return tris.filter((t) => t.a < n && t.b < n && t.c < n);
}

function dentroDoCircuncirculo(p: Vertice2, a: Vertice2, b: Vertice2, c: Vertice2): boolean {
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const bx = b.x - p.x;
  const by = b.y - p.y;
  const cx = c.x - p.x;
  const cy = c.y - p.y;
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  // Sinal depende da orientação do triângulo.
  const orient = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return orient > 0 ? det > 0 : det < 0;
}

/**
 * Um amostrador linear por facetas sobre os pontos cotados, ou `null` quando
 * não há três pontos não colineares. Fora da envoltória convexa devolve `null`:
 * extrapolar um levantamento é inventar terreno.
 */
export function interpoladorDaTin(pontos: PontoCotado[]): ((p: Point) => number | null) | null {
  // Ponto repetido (mesmo x, y) fica com a primeira cota — duplicata quebra o
  // circuncírculo (raio zero) e não acrescenta informação.
  const vistos = new Set<string>();
  const unicos: PontoCotado[] = [];
  for (const p of pontos) {
    const chave = `${p.x},${p.y}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(p);
  }
  const tris = triangular(unicos);
  if (tris.length === 0) return null;

  return (p: Point) => {
    for (const t of tris) {
      const a = unicos[t.a];
      const b = unicos[t.b];
      const c = unicos[t.c];
      const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (det === 0) continue;
      const l1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det;
      const l2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det;
      const l3 = 1 - l1 - l2;
      const eps = -1e-9;
      if (l1 >= eps && l2 >= eps && l3 >= eps) {
        return l1 * a.cotaM + l2 * b.cotaM + l3 * c.cotaM;
      }
    }
    return null;
  };
}

/** Preenche a grade a partir dos pontos cotados. Fora da TIN fica `nodata`. */
export function amostrarPontosCotados(
  grade: GradeDeElevacao,
  pontos: PontoCotado[],
): GradeDeElevacao {
  const f = interpoladorDaTin(pontos);
  if (!f) throw new Error('São precisos ao menos três pontos cotados não alinhados.');
  const nos = nosDaGrade(grade);
  return { ...grade, cotasM: nos.map((n) => f(n)) };
}

// ── Amostrador da grade (corte e 3D leem daqui) ────────────────────────────

/**
 * Cota bilinear em qualquer ponto do plano; `null` fora da grade ou numa célula
 * com `nodata`. É a ÚNICA leitura da grade que o corte e o 3D fazem — o perfil
 * e a malha não reimplementam a interpolação.
 */
export function amostradorDaGrade(grade: GradeDeElevacao): (p: Point) => number | null {
  const { origem, espacamentoMm: esp, colunas, linhas, cotasM } = grade;
  return (p: Point) => {
    const cf = (p.x - origem.x) / esp;
    const lf = (p.y - origem.y) / esp;
    if (cf < 0 || lf < 0 || cf > colunas - 1 || lf > linhas - 1) return null;
    const c0 = Math.min(Math.floor(cf), colunas - 2);
    const l0 = Math.min(Math.floor(lf), linhas - 2);
    const tx = cf - c0;
    const ty = lf - l0;
    const v00 = cotasM[l0 * colunas + c0];
    const v10 = cotasM[l0 * colunas + c0 + 1];
    const v01 = cotasM[(l0 + 1) * colunas + c0];
    const v11 = cotasM[(l0 + 1) * colunas + c0 + 1];
    if (v00 === null || v10 === null || v01 === null || v11 === null) return null;
    return (
      v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty
    );
  };
}

// ── Níveis ────────────────────────────────────────────────────────────────

/**
 * Sugestão de equidistância pela amplitude (RF-009). As faixas são as do PRD;
 * a escolha dentro da faixa é a que dá entre ~5 e ~20 curvas.
 */
export function sugerirEquidistancia(amplitudeM: number): { sugestaoM: number; opcoesM: number[] } {
  if (amplitudeM <= 10) return { sugestaoM: amplitudeM <= 2 ? 0.25 : 0.5, opcoesM: [0.25, 0.5, 1] };
  if (amplitudeM <= 50) return { sugestaoM: 2, opcoesM: [1, 2, 5] };
  return { sugestaoM: 5, opcoesM: [5, 10] };
}

/** Os múltiplos de `intervaloM` estritamente entre a cota mínima e a máxima. */
export function niveisDasCurvas(minM: number, maxM: number, intervaloM: number): number[] {
  if (!(intervaloM > 0)) throw new Error('equidistância tem de ser positiva');
  const niveis: number[] = [];
  const k0 = Math.floor(minM / intervaloM) + 1;
  const k1 = Math.ceil(maxM / intervaloM) - 1;
  if (k1 - k0 + 1 > MAX_NIVEIS) {
    throw new Error(
      `Equidistância de ${intervaloM} m daria ${k1 - k0 + 1} curvas — o máximo é ${MAX_NIVEIS}. Aumente o intervalo.`,
    );
  }
  for (let k = k0; k <= k1; k++) {
    const n = Number((k * intervaloM).toFixed(6));
    if (n > minM && n < maxM) niveis.push(n);
  }
  return niveis;
}

// ── Marching squares ──────────────────────────────────────────────────────

type Segmento = [Point, Point];

/**
 * Os segmentos da isolinha `nivel` na grade, célula a célula.
 *
 * ⚠️ O ponto de cruzamento numa aresta é calculado SEMPRE do nó de menor índice
 * para o de maior, independente de qual célula pediu. Duas células vizinhas
 * dividem a aresta, e se cada uma interpolasse no seu sentido o mesmo
 * cruzamento sairia com dois floats diferentes — e a união por chave de ponto
 * deixaria a curva partida em cada célula.
 */
function segmentosDoNivel(grade: GradeDeElevacao, nivel: number): Segmento[] {
  const { origem, espacamentoMm: esp, colunas, linhas, cotasM } = grade;
  const segs: Segmento[] = [];

  const valor = (l: number, c: number) => cotasM[l * colunas + c];

  // ⚠️ Nó com cota EXATAMENTE igual ao nível é o caso degenerado do marching
  // squares: o cruzamento cai em cima do nó, e as quatro células que o
  // compartilham produzem "lascas" de micrômetros em volta dele — que a união
  // transforma em mini-laços separados do anel. Arredondar o cruzamento ao
  // MICRÔMETRO colapsa as lascas no próprio nó; o segmento de comprimento zero
  // que sobra é descartado abaixo, e o anel passa pelo nó inteiro. Um micrômetro
  // não muda nada visível: o desenho é em mm e a fonte mede em metros.
  const arred = (v: number) => Math.round(v * 1000) / 1000;
  const cruz = (l1: number, c1: number, l2: number, c2: number): Point => {
    // Ordem canônica: menor (l, c) primeiro.
    if (l1 > l2 || (l1 === l2 && c1 > c2)) {
      [l1, c1, l2, c2] = [l2, c2, l1, c1];
    }
    const vA = valor(l1, c1) as number;
    const vB = valor(l2, c2) as number;
    const t = vB === vA ? 0.5 : (nivel - vA) / (vB - vA);
    return {
      x: arred(origem.x + (c1 + (c2 - c1) * t) * esp),
      y: arred(origem.y + (l1 + (l2 - l1) * t) * esp),
    };
  };

  for (let l = 0; l < linhas - 1; l++) {
    for (let c = 0; c < colunas - 1; c++) {
      const bl = valor(l, c);
      const br = valor(l, c + 1);
      const tr = valor(l + 1, c + 1);
      const tl = valor(l + 1, c);
      if (bl === null || br === null || tr === null || tl === null) continue;

      const caso =
        (tl >= nivel ? 8 : 0) | (tr >= nivel ? 4 : 0) | (br >= nivel ? 2 : 0) | (bl >= nivel ? 1 : 0);
      if (caso === 0 || caso === 15) continue;

      const topo = () => cruz(l + 1, c, l + 1, c + 1);
      const direita = () => cruz(l, c + 1, l + 1, c + 1);
      const base = () => cruz(l, c, l, c + 1);
      const esquerda = () => cruz(l, c, l + 1, c);

      switch (caso) {
        case 1:
          segs.push([esquerda(), base()]);
          break;
        case 2:
          segs.push([base(), direita()]);
          break;
        case 3:
          segs.push([esquerda(), direita()]);
          break;
        case 4:
          segs.push([topo(), direita()]);
          break;
        case 5: {
          // Sela: o centro decide se os dois cantos "dentro" se ligam.
          const centro = (bl + br + tr + tl) / 4;
          if (centro >= nivel) {
            segs.push([esquerda(), topo()], [base(), direita()]);
          } else {
            segs.push([esquerda(), base()], [topo(), direita()]);
          }
          break;
        }
        case 6:
          segs.push([topo(), base()]);
          break;
        case 7:
          segs.push([esquerda(), topo()]);
          break;
        case 8:
          segs.push([esquerda(), topo()]);
          break;
        case 9:
          segs.push([topo(), base()]);
          break;
        case 10: {
          const centro = (bl + br + tr + tl) / 4;
          if (centro >= nivel) {
            segs.push([topo(), direita()], [esquerda(), base()]);
          } else {
            segs.push([esquerda(), topo()], [base(), direita()]);
          }
          break;
        }
        case 11:
          segs.push([topo(), direita()]);
          break;
        case 12:
          segs.push([esquerda(), direita()]);
          break;
        case 13:
          segs.push([base(), direita()]);
          break;
        case 14:
          segs.push([esquerda(), base()]);
          break;
      }
    }
  }
  return segs.filter(([p, q]) => p.x !== q.x || p.y !== q.y);
}

const chaveDoPonto = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

/** Encadeia segmentos que compartilham ponta em polilinhas. */
export function unirSegmentos(segs: Segmento[]): { pontos: Point[]; fechada: boolean }[] {
  const porPonta = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = chaveDoPonto(p);
      const lista = porPonta.get(k);
      if (lista) lista.push(i);
      else porPonta.set(k, [i]);
    }
  });

  const usados = new Array<boolean>(segs.length).fill(false);
  const saida: { pontos: Point[]; fechada: boolean }[] = [];

  const proximo = (ponta: Point, excluir: number): number | null => {
    for (const i of porPonta.get(chaveDoPonto(ponta)) ?? []) {
      if (i !== excluir && !usados[i]) return i;
    }
    return null;
  };

  for (let i = 0; i < segs.length; i++) {
    if (usados[i]) continue;
    usados[i] = true;
    const pontos: Point[] = [segs[i][0], segs[i][1]];

    // Para a frente.
    let atual = i;
    for (;;) {
      const fim = pontos[pontos.length - 1];
      const j = proximo(fim, atual);
      if (j === null) break;
      usados[j] = true;
      const s = segs[j];
      pontos.push(chaveDoPonto(s[0]) === chaveDoPonto(fim) ? s[1] : s[0]);
      atual = j;
    }
    // Para trás.
    atual = i;
    for (;;) {
      const inicio = pontos[0];
      const j = proximo(inicio, atual);
      if (j === null) break;
      usados[j] = true;
      const s = segs[j];
      pontos.unshift(chaveDoPonto(s[0]) === chaveDoPonto(inicio) ? s[1] : s[0]);
      atual = j;
    }

    const fechada =
      pontos.length > 2 && chaveDoPonto(pontos[0]) === chaveDoPonto(pontos[pontos.length - 1]);
    saida.push({ pontos, fechada });
  }
  return saida;
}

/** Parâmetros `t ∈ (0,1)` onde o segmento `p→q` cruza as arestas do anel. */
function cruzamentosComOAnel(p: Point, q: Point, anel: Point[]): number[] {
  const ts: number[] = [];
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const denom = rx * sy - ry * sx;
    if (denom === 0) continue;
    const apx = a.x - p.x;
    const apy = a.y - p.y;
    const t = (apx * sy - apy * sx) / denom;
    const u = (apx * ry - apy * rx) / denom;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  return ts.sort((m, n) => m - n);
}

/**
 * Recorta a polilinha no anel do lote. Parte um segmento em cada cruzamento com
 * a divisa e mantém só os pedaços cujo meio está dentro — a curva termina
 * EXATAMENTE na divisa, não meia célula antes nem depois.
 */
export function recortarNoAnel(pontos: Point[], anel: Point[]): Point[][] {
  if (anel.length < 3) return [pontos];
  const saida: Point[][] = [];
  let atual: Point[] | null = null;

  for (let i = 0; i + 1 < pontos.length; i++) {
    const p = pontos[i];
    const q = pontos[i + 1];
    const ts = [0, ...cruzamentosComOAnel(p, q, anel), 1];
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k];
      const t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      const ini = { x: p.x + (q.x - p.x) * t0, y: p.y + (q.y - p.y) * t0 };
      const fim = { x: p.x + (q.x - p.x) * t1, y: p.y + (q.y - p.y) * t1 };
      const meio = { x: (ini.x + fim.x) / 2, y: (ini.y + fim.y) / 2 };
      if (pointInPolygon(anel, meio)) {
        if (!atual) atual = [ini];
        atual.push(fim);
      } else if (atual) {
        saida.push(atual);
        atual = null;
      }
    }
  }
  if (atual) saida.push(atual);
  return saida;
}

/**
 * As curvas de nível da grade, recortadas no lote.
 *
 * Os níveis vêm das cotas DENTRO do lote (não da grade inteira, que tem a folga
 * de uma célula em volta): a curva mais alta da gleba vizinha não interessa.
 */
export function gerarCurvas(
  grade: GradeDeElevacao,
  anel: Point[],
  intervaloM: number,
  mestraACada = MESTRA_A_CADA,
): CurvaDeNivel[] {
  const { minM, maxM } = faixaNoLote(grade, anel);
  if (minM === null || maxM === null) return [];
  const niveis = niveisDasCurvas(minM, maxM, intervaloM);
  return gerarCurvasNosNiveis(grade, anel, niveis, (nivel) => Math.round(nivel / intervaloM) % mestraACada === 0);
}

/**
 * Como os níveis das curvas são escolhidos (fase 12, o que o Contour Map
 * Creator oferece): por EQUIDISTÂNCIA (cotas redondas, múltiplas do
 * intervalo — o padrão topográfico), por NÚMERO de níveis (N cotas igualmente
 * espaçadas entre o mínimo e o máximo do terreno), uma lista PERSONALIZADA ou,
 * desde a fase 13, por INTERVALO (passo fixo a partir do MÍNIMO do terreno —
 * o "Interval" do site, que não dá cotas redondas).
 */
export type ModoDeNiveis = 'EQUIDISTANCIA' | 'NUMERO' | 'PERSONALIZADO' | 'INTERVALO';

/**
 * Passo fixo a partir do mínimo do terreno: min + passo·i, i = 1, 2, … enquanto
 * < max — o "Interval" do Contour Map Creator. O próprio mínimo fica de fora
 * (uma curva na cota mínima é um ponto). Diferente da EQUIDISTÂNCIA, que
 * ancora em múltiplos do passo (cotas redondas).
 */
export function niveisPorIntervalo(minM: number, maxM: number, passoM: number): number[] {
  if (!(maxM > minM) || !(passoM > 0)) return [];
  const quantos = Math.floor((maxM - minM) / passoM - 1e-9);
  if (quantos > MAX_NIVEIS) {
    throw new Error(`Intervalo de ${passoM} m daria ${quantos} curvas — o máximo é ${MAX_NIVEIS}. Aumente o intervalo.`);
  }
  const niveis: number[] = [];
  for (let i = 1; i <= quantos; i++) {
    const nivel = Number((minM + passoM * i).toFixed(6));
    if (nivel < maxM) niveis.push(nivel);
  }
  return niveis;
}

/**
 * N níveis entre o mínimo e o máximo, estritamente dentro: passo =
 * (max − min) / (N + 1), níveis em min + passo·i, i = 1…N — a mesma conta do
 * Contour Map Creator ("Number of levels").
 */
export function niveisPorNumero(minM: number, maxM: number, n: number): number[] {
  const N = Math.max(1, Math.min(MAX_NIVEIS, Math.floor(n)));
  if (!(maxM > minM)) return [];
  const passo = (maxM - minM) / (N + 1);
  return Array.from({ length: N }, (_, i) => Number((minM + passo * (i + 1)).toFixed(6)));
}

/** Uma lista digitada ("380, 400, 420"): só o que cai dentro do terreno, sem repetição, crescente. */
export function niveisPersonalizados(lista: readonly number[], minM: number, maxM: number): number[] {
  const dentro = [...new Set(lista.filter((v) => Number.isFinite(v) && v > minM && v < maxM))].sort((a, b) => a - b);
  if (dentro.length > MAX_NIVEIS) throw new Error(`${dentro.length} níveis — o máximo é ${MAX_NIVEIS}.`);
  return dentro;
}

/** Lê "380, 400; 420" ou "380\n400" — vírgula, ponto e vírgula, espaço ou quebra; vírgula decimal só quando não separa. */
export function lerListaDeNiveis(texto: string): number[] {
  const t = texto.trim();
  if (!t) return [];
  // Quando há espaço ou ponto e vírgula entre números, ELES separam e a
  // vírgula é decimal ("101,5 102,0"); senão a vírgula separa ("380, 400" e
  // "101.5,102"). Vírgula decimal E separadora ao mesmo tempo não dá para
  // distinguir — o rótulo do campo pede vírgula entre níveis.
  const outroSeparador = /\d\s*;\s*[\d-]/.test(t) || /\d\s+[\d-]/.test(t);
  const pedacos = outroSeparador ? t.split(/[;\s]+/) : t.split(/\s*,\s*/);
  return pedacos
    .map((p) => Number(p.replace(',', '.')))
    .filter((v) => Number.isFinite(v));
}

/** A equidistância "equivalente" de uma lista de níveis: o menor passo entre vizinhos (para o hipsométrico e a proveniência). */
export function equidistanciaEquivalente(niveis: readonly number[], minM: number, maxM: number): number {
  if (niveis.length >= 2) {
    let menor = Infinity;
    for (let i = 1; i < niveis.length; i++) menor = Math.min(menor, niveis[i] - niveis[i - 1]);
    if (Number.isFinite(menor) && menor > 0) return Number(menor.toFixed(6));
  }
  return Number(Math.max(0.01, (maxM - minM) / (niveis.length + 1)).toFixed(6));
}

/** As curvas nos níveis dados; `mestra` decide quais saem grossas e com a cota escrita. */
export function gerarCurvasNosNiveis(
  grade: GradeDeElevacao,
  anel: Point[],
  niveis: readonly number[],
  mestra: (nivel: number) => boolean = () => true,
): CurvaDeNivel[] {
  const curvas: CurvaDeNivel[] = [];
  for (const nivel of niveis) {
    const ehMestra = mestra(nivel);
    for (const linha of unirSegmentos(segmentosDoNivel(grade, nivel))) {
      for (const pedaco of recortarNoAnel(linha.pontos, anel)) {
        if (pedaco.length < 2) continue;
        const fechada =
          linha.fechada && chaveDoPonto(pedaco[0]) === chaveDoPonto(pedaco[pedaco.length - 1]);
        curvas.push({ cotaM: nivel, mestra: ehMestra, pontos: pedaco, fechada });
      }
    }
  }
  return curvas;
}

/** O mínimo e o máximo do terreno DENTRO do anel — o que decide os níveis. */
export function faixaDeCotas(grade: GradeDeElevacao, anel: Point[]): { minM: number; maxM: number } | null {
  const { minM, maxM } = faixaNoLote(grade, anel);
  return minM === null || maxM === null ? null : { minM, maxM };
}

function faixaNoLote(
  grade: GradeDeElevacao,
  anel: Point[],
): { minM: number | null; maxM: number | null } {
  let minM: number | null = null;
  let maxM: number | null = null;
  const nos = nosDaGrade(grade);
  nos.forEach((n, i) => {
    const v = grade.cotasM[i];
    if (v === null || !pointInPolygon(anel, n)) return;
    if (minM === null || v < minM) minM = v;
    if (maxM === null || v > maxM) maxM = v;
  });
  return { minM, maxM };
}

// ── Estatísticas ──────────────────────────────────────────────────────────

export function estatisticasDoTerreno(
  grade: GradeDeElevacao,
  anel: Point[],
  curvas: CurvaDeNivel[],
): EstatisticasDoTerreno {
  const nos = nosDaGrade(grade);
  let validas = 0;
  let ausentes = 0;
  let noLote = 0;
  let soma = 0;
  let minM = Infinity;
  let maxM = -Infinity;

  nos.forEach((n, i) => {
    if (!pointInPolygon(anel, n)) return;
    noLote++;
    const v = grade.cotasM[i];
    if (v === null) {
      ausentes++;
      return;
    }
    validas++;
    soma += v;
    if (v < minM) minM = v;
    if (v > maxM) maxM = v;
  });

  let comprimento = 0;
  for (const c of curvas) {
    for (let i = 0; i + 1 < c.pontos.length; i++) {
      comprimento += Math.hypot(
        c.pontos[i + 1].x - c.pontos[i].x,
        c.pontos[i + 1].y - c.pontos[i].y,
      );
    }
  }

  const temValidas = validas > 0;
  return {
    cotaMinM: temValidas ? minM : 0,
    cotaMaxM: temValidas ? maxM : 0,
    cotaMediaM: temValidas ? soma / validas : 0,
    amplitudeM: temValidas ? maxM - minM : 0,
    amostrasValidas: validas,
    amostrasAusentes: ausentes,
    amostrasNoLote: noLote,
    areaM2: polygonArea(anel) / 1_000_000,
    espacamentoM: grade.espacamentoMm / 1000,
    curvas: curvas.length,
    comprimentoDasCurvasM: comprimento / 1000,
  };
}

// ── Hashes (RN-005 / CA-010) ──────────────────────────────────────────────

export interface EntradaDaGeracao {
  fonteCodigo: string;
  datasetVersao: string;
  anel: Point[];
  georreferencia: Georreferencia | null;
  espacamentoMm: number;
  equidistanciaM: number;
  pontosCotados: PontoCotado[];
  /** Fase 12: como os níveis foram escolhidos e quais são (quando não é por equidistância). */
  modoNiveis?: ModoDeNiveis;
  niveisM?: number[] | null;
}

/** Mesma entrada, mesmo hash — é o que faz "gerar de novo" ser conferível. */
export function hashDaEntrada(entrada: EntradaDaGeracao): string {
  return sha256(
    stableStringify({
      algoritmo: ALGORITMO_TOPOGRAFIA,
      ...entrada,
      georreferencia: entrada.georreferencia
        ? {
            latitude: entrada.georreferencia.latitude,
            longitude: entrada.georreferencia.longitude,
            rotacaoNorteDeg: entrada.georreferencia.rotacaoNorteDeg ?? null,
          }
        : null,
    }),
  );
}

/** Hash das cotas e das curvas (mm inteiro, cota ao milímetro). */
export function hashDoResultado(grade: GradeDeElevacao, curvas: CurvaDeNivel[]): string {
  return sha256(
    stableStringify({
      cotas: grade.cotasM.map((v) => (v === null ? null : Math.round(v * 1000))),
      curvas: curvas.map((c) => ({
        cotaM: c.cotaM,
        pontos: c.pontos.map((p) => [Math.round(p.x), Math.round(p.y)]),
      })),
    }),
  );
}

// ── Malha para o 3D ───────────────────────────────────────────────────────

/**
 * Malha triangulada da grade, em números crus para o viewer montar um
 * `BufferGeometry`. Coordenadas de MUNDO do viewer, em metros:
 * `X = x·escala`, `Y = cota − cotaZero`, `Z = y·escala` — SEM negar `y`, como
 * `geometriaDaAgua` faz; a rota `shapeDoAnel` + `rotateX` só vale para plano
 * horizontal e este não é.
 */
export interface MalhaDoTerreno {
  posicoes: Float32Array;
  indices: Uint32Array;
  minY: number;
  maxY: number;
  triangulos: number;
}

export function malhaDaGrade(
  grade: GradeDeElevacao,
  cotaZeroM: number,
  escala = 0.001,
  maxTriangulos = 20_000,
): MalhaDoTerreno | null {
  const { origem, espacamentoMm: esp, colunas, linhas, cotasM } = grade;
  if (colunas < 2 || linhas < 2) return null;

  // Decimação: cada célula da grade dá 2 triângulos; o passo cresce até caber.
  const celulas = (colunas - 1) * (linhas - 1);
  const passo = Math.max(1, Math.ceil(Math.sqrt((celulas * 2) / maxTriangulos)));

  const colunasAmostradas = indicesAmostrados(colunas, passo);
  const linhasAmostradas = indicesAmostrados(linhas, passo);

  const posicoes: number[] = [];
  const indiceDoVertice = new Int32Array(colunasAmostradas.length * linhasAmostradas.length).fill(-1);
  let minY = Infinity;
  let maxY = -Infinity;

  linhasAmostradas.forEach((l, li) => {
    colunasAmostradas.forEach((c, ci) => {
      const v = cotasM[l * colunas + c];
      if (v === null) return;
      const y = v - cotaZeroM;
      indiceDoVertice[li * colunasAmostradas.length + ci] = posicoes.length / 3;
      posicoes.push((origem.x + c * esp) * escala, y, (origem.y + l * esp) * escala);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  });

  const indices: number[] = [];
  const nc = colunasAmostradas.length;
  for (let li = 0; li + 1 < linhasAmostradas.length; li++) {
    for (let ci = 0; ci + 1 < nc; ci++) {
      const i00 = indiceDoVertice[li * nc + ci];
      const i10 = indiceDoVertice[li * nc + ci + 1];
      const i01 = indiceDoVertice[(li + 1) * nc + ci];
      const i11 = indiceDoVertice[(li + 1) * nc + ci + 1];
      if (i00 < 0 || i10 < 0 || i01 < 0 || i11 < 0) continue;
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }

  if (indices.length === 0) return null;
  return {
    posicoes: new Float32Array(posicoes),
    indices: new Uint32Array(indices),
    minY,
    maxY,
    triangulos: indices.length / 3,
  };
}

/** `0, passo, 2·passo, …` mais o último índice, para a borda não sumir. */
function indicesAmostrados(n: number, passo: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += passo) out.push(i);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}
