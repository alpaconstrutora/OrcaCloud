/**
 * PRÉ-DIMENSIONAMENTO da drenagem e dos muros de arrimo (fase 7 da topografia).
 *
 * ─── O QUE É, E O QUE NÃO É ─────────────────────────────────────────────────
 *
 * Métodos de manual, com as hipóteses declaradas e editáveis:
 *
 * - Hidráulica: Método Racional (Q = C · i · A) com a chuva de projeto de uma
 *   equação IDF `i = k · T^a / (t + b)^c` (padrão: São Paulo), e a seção pela
 *   fórmula de Manning com lâmina máxima de 80 % — catálogo de canaletas
 *   retangulares e tubos de diâmetro comercial.
 * - Estrutural: muro de GRAVIDADE (seção trapezoidal) até 3 m, de FLEXÃO (L
 *   em concreto armado) acima; empuxo ativo de Rankine com sobrecarga;
 *   verificação de tombamento, deslizamento (atrito tan φ na base + metade
 *   do passivo do embutimento) e tensão na base; a base cresce até as três
 *   passarem. Quantitativos com a seção da altura máxima.
 *
 * É o que um engenheiro faz na primeira folha, antes do projeto executivo — e
 * por isso a tela chama de pré-dimensionamento e mostra as hipóteses. Não
 * substitui o projeto com responsabilidade técnica.
 *
 * Puro, como o resto: números entram, números saem.
 */

import { pointInPolygon, type Point } from './blueprintKernel';
import type { GradeDeElevacao } from './blueprintTopografia';
import type { AnaliseDaDrenagem, LinhaDeDrenagem, MuroDeArrimo, TipoDeDrenagem } from './blueprintTopografiaAnalises';

// ── Hidráulica ────────────────────────────────────────────────────────────

export interface ParametrosHidraulicos {
  /** Coeficiente de escoamento superficial C (0–1). Platô e área urbanizada: 0,9. */
  coeficienteDeEscoamento: number;
  /** Tempo de retorno T, em anos (microdrenagem: 10). */
  tempoDeRetornoAnos: number;
  /** Tempo de concentração t, em minutos (mínimo usual: 10) — usado quando `tempoDeConcentracao` é INFORMADO. */
  tempoDeConcentracaoMin: number;
  /**
   * Fase 8: `KIRPICH` calcula t por linha — t = 0,0195 · L^0,77 · S^−0,385 (min),
   * L = comprimento da linha em m (o talvegue é a própria canaleta), S = declividade
   * de projeto (m/m), mínimo de 5 min. `INFORMADO` usa `tempoDeConcentracaoMin`.
   */
  tempoDeConcentracao: 'INFORMADO' | 'KIRPICH';
  /** Equação IDF `i = k · T^a / (t + b)^c`, i em mm/h. */
  idf: { k: number; a: number; b: number; c: number };
  /** Intensidade informada diretamente (mm/h); `null` usa a IDF. */
  intensidadeMmH: number | null;
  /** Coeficiente de rugosidade de Manning (concreto: 0,013). */
  manningN: number;
  /** Lâmina máxima como fração da altura/diâmetro. */
  laminaMax: number;
}

/** IDF de São Paulo (forma clássica): i = 3462,7 · T^0,172 / (t + 22)^1,025. */
export const HIDRAULICA_PADRAO: ParametrosHidraulicos = {
  coeficienteDeEscoamento: 0.9,
  tempoDeRetornoAnos: 10,
  tempoDeConcentracaoMin: 10,
  tempoDeConcentracao: 'KIRPICH',
  idf: { k: 3462.7, a: 0.172, b: 22, c: 1.025 },
  intensidadeMmH: null,
  manningN: 0.013,
  laminaMax: 0.8,
};

/** Tempo de concentração mínimo: abaixo disto a IDF explode e a chuva vira irreal. */
export const TC_MINIMO_MIN = 5;

/** Kirpich (1940): t = 0,0195 · L^0,77 · S^−0,385, L em m, S em m/m, t em minutos. */
export function tempoDeConcentracaoKirpich(comprimentoM: number, declividadeMm: number): number {
  const L = Math.max(1, comprimentoM);
  const S = Math.max(0.001, declividadeMm);
  return Math.max(TC_MINIMO_MIN, 0.0195 * Math.pow(L, 0.77) * Math.pow(S, -0.385));
}

/** A intensidade da chuva de projeto, em mm/h. `tcMin` sobrepõe o t das hipóteses (Kirpich por linha). */
export function intensidadeDeChuva(p: ParametrosHidraulicos, tcMin?: number): number {
  if (p.intensidadeMmH !== null && p.intensidadeMmH > 0) return p.intensidadeMmH;
  const { k, a, b, c } = p.idf;
  const T = Math.max(1, p.tempoDeRetornoAnos);
  const t = Math.max(1, tcMin ?? p.tempoDeConcentracaoMin);
  return (k * Math.pow(T, a)) / Math.pow(t + b, c);
}

/** Método Racional: Q = C · i · A, com i em mm/h e A em m² → m³/s. */
export function vazaoRacional(coeficiente: number, intensidadeMmH: number, areaM2: number): number {
  return (Math.max(0, coeficiente) * Math.max(0, intensidadeMmH) * Math.max(0, areaM2)) / 3_600_000;
}

export interface SecaoDeDrenagem {
  forma: 'RETANGULAR' | 'CIRCULAR';
  /** Retangular: largura × altura em m. */
  larguraM?: number;
  alturaM?: number;
  /** Circular: diâmetro nominal em mm. */
  diametroMm?: number;
  rotulo: string;
}

/** Canaletas retangulares b × h (h = b) e tubos comerciais. */
export const CANALETAS_CATALOGO: readonly SecaoDeDrenagem[] = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0].map((b) => ({
  forma: 'RETANGULAR' as const,
  larguraM: b,
  alturaM: b,
  rotulo: `${Math.round(b * 100)} × ${Math.round(b * 100)} cm`,
}));
export const TUBOS_CATALOGO: readonly SecaoDeDrenagem[] = [150, 200, 300, 400, 500, 600, 800, 1000].map((d) => ({
  forma: 'CIRCULAR' as const,
  diametroMm: d,
  rotulo: `DN ${d}`,
}));

/** Vazão (m³/s) e velocidade (m/s) de uma seção pela fórmula de Manning, na lâmina dada. */
export function capacidadeDaSecao(
  secao: SecaoDeDrenagem,
  declividadeP: number,
  manningN: number,
  laminaMax: number,
): { vazaoM3s: number; velocidadeMs: number; areaMolhadaM2: number } {
  const S = Math.max(1e-6, declividadeP / 100);
  const n = Math.max(0.005, manningN);
  const lam = Math.min(1, Math.max(0.1, laminaMax));
  let A: number;
  let P: number;
  if (secao.forma === 'RETANGULAR') {
    const b = secao.larguraM ?? 0;
    const y = (secao.alturaM ?? 0) * lam;
    A = b * y;
    P = b + 2 * y;
  } else {
    const D = (secao.diametroMm ?? 0) / 1000;
    const y = D * lam;
    const theta = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - (2 * y) / D)));
    A = ((D * D) / 8) * (theta - Math.sin(theta));
    P = (D * theta) / 2;
  }
  if (A <= 0 || P <= 0) return { vazaoM3s: 0, velocidadeMs: 0, areaMolhadaM2: 0 };
  const R = A / P;
  const v = (Math.pow(R, 2 / 3) * Math.sqrt(S)) / n;
  return { vazaoM3s: A * v, velocidadeMs: v, areaMolhadaM2: A };
}

export interface DimensionamentoHidraulico {
  id: string;
  areaContribuinteM2: number;
  /** O t usado nesta linha (Kirpich ou informado), em minutos. */
  tempoDeConcentracaoMin: number;
  intensidadeMmH: number;
  vazaoM3s: number;
  /** Declividade de projeto do fundo: a maior entre o caimento mínimo e a queda de execução ÷ comprimento. */
  declividadeP: number;
  secao: SecaoDeDrenagem | null;
  capacidadeM3s: number;
  /** Q / capacidade da seção escolhida. */
  ocupacao: number;
  velocidadeMs: number;
  /** Achou seção no catálogo e a velocidade está entre 0,6 e 5 m/s. */
  atende: boolean;
  avisos: string[];
}

/** Velocidades de manual para concreto: abaixo assoreia, acima erode. */
const VELOCIDADE_MIN = 0.6;
const VELOCIDADE_MAX = 5;

/**
 * A seção mínima do catálogo que leva a vazão da linha na declividade de
 * projeto. Descida d'água e canaleta usam o catálogo retangular; tubo, o de
 * diâmetros.
 */
export function dimensionarDrenagem(
  linha: LinhaDeDrenagem,
  analise: AnaliseDaDrenagem,
  areaContribuinteM2: number,
  p: ParametrosHidraulicos,
): DimensionamentoHidraulico {
  const declividade = Math.max(
    analise.caimentoMinP,
    analise.comprimentoM > 0 ? (analise.quedaDeExecucaoM / analise.comprimentoM) * 100 : 0,
  );
  const tc =
    p.tempoDeConcentracao === 'KIRPICH'
      ? tempoDeConcentracaoKirpich(analise.comprimentoM, declividade / 100)
      : Math.max(1, p.tempoDeConcentracaoMin);
  const intensidade = intensidadeDeChuva(p, tc);
  const vazao = vazaoRacional(p.coeficienteDeEscoamento, intensidade, areaContribuinteM2);
  const catalogo = linha.tipo === 'TUBO' ? TUBOS_CATALOGO : CANALETAS_CATALOGO;
  const avisos: string[] = [];
  let escolhida: SecaoDeDrenagem | null = null;
  let cap = { vazaoM3s: 0, velocidadeMs: 0, areaMolhadaM2: 0 };
  for (const s of catalogo) {
    const c = capacidadeDaSecao(s, declividade, p.manningN, p.laminaMax);
    if (c.vazaoM3s >= vazao) {
      escolhida = s;
      cap = c;
      break;
    }
  }
  if (!escolhida) {
    const maior = catalogo[catalogo.length - 1];
    cap = capacidadeDaSecao(maior, declividade, p.manningN, p.laminaMax);
    avisos.push(`A vazão passa da maior seção do catálogo (${maior.rotulo}): dividir a área ou aumentar a declividade.`);
  }
  // A velocidade que interessa é a da vazão de projeto, não a da seção cheia:
  // aproxima pela área molhada proporcional.
  const velocidade = escolhida && cap.areaMolhadaM2 > 0 ? Math.min(cap.velocidadeMs, vazao / (cap.areaMolhadaM2 * Math.max(0.05, vazao / cap.vazaoM3s))) : cap.velocidadeMs;
  if (escolhida && vazao > 0 && velocidade < VELOCIDADE_MIN) avisos.push(`Velocidade ${velocidade.toFixed(2)} m/s abaixo de ${VELOCIDADE_MIN} m/s: tende a assorear — aumentar a declividade ou reduzir a seção.`);
  if (velocidade > VELOCIDADE_MAX) avisos.push(`Velocidade ${velocidade.toFixed(2)} m/s acima de ${VELOCIDADE_MAX} m/s: erode o concreto — prever degraus ou dissipador.`);
  if (areaContribuinteM2 <= 0) avisos.push('Sem área contribuinte: informe a área que drena para esta linha.');
  return {
    id: linha.id,
    areaContribuinteM2,
    tempoDeConcentracaoMin: tc,
    intensidadeMmH: intensidade,
    vazaoM3s: vazao,
    declividadeP: declividade,
    secao: escolhida,
    capacidadeM3s: cap.vazaoM3s,
    ocupacao: cap.vazaoM3s > 0 ? vazao / cap.vazaoM3s : 0,
    velocidadeMs: velocidade,
    atende: escolhida !== null && areaContribuinteM2 > 0 && velocidade >= VELOCIDADE_MIN && velocidade <= VELOCIDADE_MAX,
    avisos,
  };
}

function distanciaAPolilinha(p: Point, pontos: Point[]): number {
  let menor = Infinity;
  for (let i = 0; i + 1 < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < menor) menor = d;
  }
  return menor;
}

/**
 * Área contribuinte SUGERIDA por linha: cada célula da grade dentro do lote vai
 * para a linha de drenagem mais próxima (partição de Voronoi). É a primeira
 * aproximação; a tela deixa sobrescrever por linha.
 */
export function areasDeContribuicao(
  grade: GradeDeElevacao,
  anelDoLote: Point[],
  linhas: LinhaDeDrenagem[],
): Record<string, number> {
  const saida: Record<string, number> = {};
  const validas = linhas.filter((l) => l.pontos.length >= 2);
  for (const l of validas) saida[l.id] = 0;
  if (validas.length === 0 || anelDoLote.length < 3) return saida;
  const { origem, espacamentoMm: esp, colunas, linhas: nLinhas } = grade;
  const areaCel = (esp / 1000) ** 2;
  for (let l = 0; l + 1 < nLinhas; l++) {
    for (let c = 0; c + 1 < colunas; c++) {
      const centro = { x: origem.x + (c + 0.5) * esp, y: origem.y + (l + 0.5) * esp };
      if (!pointInPolygon(anelDoLote, centro)) continue;
      let melhor = validas[0];
      let menor = Infinity;
      for (const linha of validas) {
        const d = distanciaAPolilinha(centro, linha.pontos);
        if (d < menor) {
          menor = d;
          melhor = linha;
        }
      }
      saida[melhor.id] += areaCel;
    }
  }
  return saida;
}

// ── Estrutural: muro de arrimo ────────────────────────────────────────────

export type TipoDeMuro = 'AUTO' | 'GRAVIDADE' | 'FLEXAO';

export interface ParametrosEstruturais {
  tipo: TipoDeMuro;
  /** Peso específico do solo, kN/m³ (18). */
  pesoDoSoloKNm3: number;
  /** Ângulo de atrito interno φ, graus (30). */
  anguloDeAtritoGraus: number;
  /** Sobrecarga uniforme no terrapleno, kN/m² (10). */
  sobrecargaKNm2: number;
  /** Tensão admissível do solo de fundação, kPa (200). */
  tensaoAdmissivelKPa: number;
  /** Concreto armado 25, ciclópico 22 kN/m³. */
  pesoDoConcretoKNm3: number;
  pesoDoCiclopicoKNm3: number;
  /** Ficha: quanto o muro entra no terreno abaixo da altura vista, m (0,5). */
  embutimentoM: number;
  /** Taxa de armadura para o muro de flexão, kg por m³ de concreto (80). */
  taxaDeArmaduraKgM3: number;
  /** Coesão do solo, kPa (fase 8; 0 = areia, conservador) — só a estabilidade global usa. */
  coesaoKPa: number;
}

export const ESTRUTURA_PADRAO: ParametrosEstruturais = {
  tipo: 'AUTO',
  pesoDoSoloKNm3: 18,
  anguloDeAtritoGraus: 30,
  sobrecargaKNm2: 10,
  tensaoAdmissivelKPa: 200,
  pesoDoConcretoKNm3: 25,
  pesoDoCiclopicoKNm3: 22,
  embutimentoM: 0.5,
  taxaDeArmaduraKgM3: 80,
  coesaoKPa: 0,
};

/** Estabilidade global mínima (ruptura profunda por baixo do muro). */
const FS_GLOBAL_MIN = 1.5;

const FS_TOMBAMENTO_MIN = { GRAVIDADE: 2.0, FLEXAO: 1.5 } as const;
const FS_DESLIZAMENTO_MIN = 1.5;
/** Acima disto o pré-dimensionamento de manual não vale: contenção especial. */
const ALTURA_MAX_PRE_DIMENSIONAMENTO_M = 8;

export interface DimensionamentoDoMuro {
  aresta: number;
  tipo: 'GRAVIDADE' | 'FLEXAO';
  /** Altura total, da base ao topo (altura vista + embutimento), m. */
  alturaM: number;
  baseM: number;
  /** Gravidade: largura do topo; flexão: espessura do fuste. */
  topoM: number;
  /** Flexão: espessura da sapata. */
  sapataM: number | null;
  empuxoKNm: number;
  fsTombamento: number;
  fsDeslizamento: number;
  tensaoMaxKPa: number;
  /** Fase 8: dente (chave) na base, em m — 0 = sem; entra quando só o deslizamento não fecha. */
  denteM: number;
  /** Fase 8: estabilidade global por Bishop simplificado, o menor FS entre os círculos tentados. */
  fsGlobal: number;
  /** As quatro verificações passam com a base final. */
  atende: boolean;
  /** Seção da altura máxima × comprimento. */
  areaDaSecaoM2: number;
  volumeDeConcretoM3: number;
  armaduraKg: number;
  /** Barbacãs Ø75 a cada 1,5 m em quincôncio, e dreno de pé ao longo do muro. */
  barbacas: number;
  drenoDePeM: number;
  avisos: string[];
}

/** Dentes tentados quando só o deslizamento falha, em m. */
const DENTES_M = [0.3, 0.5, 0.8, 1.0];

/**
 * Estabilidade GLOBAL — ruptura por um círculo que passa por baixo da base do
 * muro. Bishop simplificado, fatias verticais, sem água:
 *
 *   FS = Σ [ (c·b + W·tan φ) / mα ] / Σ W·sin α,   mα = cos α + sin α·tan φ / FS
 *
 * Geometria em 2D (x para a frente = pé do muro em x = 0, y para cima, base do
 * muro em y = 0): terrapleno em y = H atrás (x > B) com sobrecarga q, solo na
 * frente em y = d (embutimento), o muro como bloco B × H com o peso do
 * concreto. Só valem círculos que passam ABAIXO da base (o muro é rígido) e
 * saem na frente do pé; o centro varre uma grade acima do muro e o raio é
 * dado pelo ponto de saída. Devolve o menor FS. É a verificação de manual —
 * a de projeto usa o perfil real do solo e a água.
 */
export function estabilidadeGlobal(
  H: number,
  B: number,
  d: number,
  gamaSolo: number,
  gamaMuro: number,
  phiRad: number,
  cKPa: number,
  q: number,
): number {
  const tanPhi = Math.tan(phiRad);
  let menor = Infinity;
  const superficie = (x: number) => (x < 0 ? d : H);
  const pesoEspecifico = (x: number, y: number) => (x >= 0 && x <= B && y >= 0 ? gamaMuro : gamaSolo);
  for (const fx of [0.5, 1, 1.5, 2]) {
    for (const fy of [0.5, 1, 1.5, 2, 3]) {
      for (const fs of [0.5, 1, 1.5, 2]) {
        const xc = fx * B;
        const yc = H + fy * H;
        const xSaida = -fs * B;
        const R = Math.hypot(xc - xSaida, yc - d);
        // O círculo tem de ficar abaixo da base ao longo do muro.
        const yBaseNoMuro = (x: number) => yc - Math.sqrt(Math.max(0, R * R - (x - xc) * (x - xc)));
        if (yBaseNoMuro(0) > 0.01 || yBaseNoMuro(B) > 0.01) continue;
        const dx = R * R - (H - yc) * (H - yc);
        if (dx <= 0) continue;
        const xEntrada = xc + Math.sqrt(dx);
        if (xEntrada <= B) continue;
        const n = 40;
        const largura = (xEntrada - xSaida) / n;
        let somaW = [] as { W: number; alpha: number; b: number }[];
        for (let i = 0; i < n; i++) {
          const x = xSaida + (i + 0.5) * largura;
          const yb = yc - Math.sqrt(Math.max(0, R * R - (x - xc) * (x - xc)));
          const ys = superficie(x);
          if (ys <= yb) continue;
          // Peso: coluna de solo (e de muro, quando a fatia atravessa o bloco).
          let W = 0;
          if (x >= 0 && x <= B) {
            W += Math.max(0, ys - Math.max(yb, 0)) * pesoEspecifico(x, 0.5) * largura; // bloco do muro
            W += Math.max(0, 0 - yb) * gamaSolo * largura; // solo sob a base
          } else {
            W += (ys - yb) * gamaSolo * largura;
          }
          if (x > B) W += q * largura;
          const alpha = Math.asin(Math.max(-1, Math.min(1, (x - xc) / R)));
          somaW.push({ W, alpha, b: largura });
        }
        const driving = somaW.reduce((s, f) => s + f.W * Math.sin(f.alpha), 0);
        if (driving <= 0) continue;
        let FS = 1.5;
        for (let it = 0; it < 30; it++) {
          const resist = somaW.reduce((s, f) => {
            const m = Math.cos(f.alpha) + (Math.sin(f.alpha) * tanPhi) / FS;
            return s + (cKPa * f.b + f.W * tanPhi) / Math.max(0.05, m);
          }, 0);
          const novo = resist / driving;
          if (Math.abs(novo - FS) < 1e-4) {
            FS = novo;
            break;
          }
          FS = novo;
        }
        if (FS < menor) menor = FS;
        somaW = [];
      }
    }
  }
  return menor;
}

function verificar(
  W: number,
  xW: number,
  B: number,
  Ea: number,
  Mo: number,
  tanDelta: number,
  passivoKN: number,
): { fsT: number; fsD: number; sigma: number } {
  const Mr = W * xW;
  const fsT = Mo > 0 ? Mr / Mo : Infinity;
  const fsD = Ea > 0 ? (W * tanDelta + passivoKN) / Ea : Infinity;
  const e = B / 2 - (Mr - Mo) / W;
  const sigma =
    Math.abs(e) <= B / 6 ? (W / B) * (1 + (6 * Math.abs(e)) / B) : (2 * W) / (3 * (B / 2 - Math.abs(e)));
  return { fsT, fsD, sigma: Number.isFinite(sigma) && sigma > 0 ? sigma : Infinity };
}

/**
 * Pré-dimensiona UM muro: escolhe o tipo pela altura (ou o pedido), parte de
 * uma base de 0,6·H e a engrossa de 5 em 5 cm até tombamento, deslizamento e
 * tensão na base passarem (ou até 1,2·H, quando desiste e avisa).
 */
export function dimensionarMuro(muro: MuroDeArrimo, p: ParametrosEstruturais): DimensionamentoDoMuro {
  const alturaVista = Math.max(muro.alturaMaxCorteM, muro.alturaMaxAterroM);
  const H = Math.max(0.5, alturaVista + Math.max(0, p.embutimentoM));
  const tipo: 'GRAVIDADE' | 'FLEXAO' = p.tipo === 'AUTO' ? (H <= 3 ? 'GRAVIDADE' : 'FLEXAO') : p.tipo;
  const avisos: string[] = [];
  if (alturaVista <= 0.01) avisos.push('Terreno na cota do platô ao longo deste lado: o muro não contém nada.');
  if (H > ALTURA_MAX_PRE_DIMENSIONAMENTO_M) avisos.push(`Altura de ${H.toFixed(2)} m passa de ${ALTURA_MAX_PRE_DIMENSIONAMENTO_M} m: contenção especial (cortina, solo grampeado), fora deste pré-dimensionamento.`);

  const phi = (Math.max(5, Math.min(45, p.anguloDeAtritoGraus)) * Math.PI) / 180;
  const Ka = Math.tan(Math.PI / 4 - phi / 2) ** 2;
  const gamma = Math.max(10, p.pesoDoSoloKNm3);
  const q = Math.max(0, p.sobrecargaKNm2);
  const EaSolo = 0.5 * Ka * gamma * H * H;
  const EaQ = Ka * q * H;
  const Ea = EaSolo + EaQ;
  const Mo = EaSolo * (H / 3) + EaQ * (H / 2);
  // Atrito na base: concreto moldado contra o solo mobiliza tan φ (2/3 φ é
  // a interface de peça pré-moldada). O embutimento dá empuxo passivo na
  // frente; conta-se METADE dele, porque exige deslocamento para mobilizar.
  const tanDelta = Math.tan(phi);
  const Kp = Math.tan(Math.PI / 4 + phi / 2) ** 2;
  const d = Math.max(0, p.embutimentoM);
  // Sem dente: metade do passivo do embutimento. Com dente (chave) de altura
  // `hd` sob a base, o passivo vale na frente do dente, na profundidade d + hd,
  // e conta inteiro — é para isso que o dente existe.
  const passivoCom = (dente: number) =>
    dente > 0 ? 0.5 * Kp * gamma * (d + dente) * (d + dente) : 0.5 * (0.5 * Kp * gamma * d * d);
  const fsTmin = FS_TOMBAMENTO_MIN[tipo];

  let B = Math.max(0.5, Math.round((0.6 * H) / 0.05) * 0.05);
  const Bmax = Math.max(B, 1.2 * H);
  let topo: number;
  let sapata: number | null = null;
  let W = 0;
  let xW = 0;
  let area = 0;
  let res = { fsT: 0, fsD: 0, sigma: Infinity };
  let ok = false;
  let dente = 0;

  for (; B <= Bmax + 1e-9; B = Math.round((B + 0.05) / 0.05) * 0.05) {
    if (tipo === 'GRAVIDADE') {
      // Trapézio: face do solo (tardoz) vertical no fundo x = B, face vista
      // inclinada; topo de 0,30 m. Pé (x = 0) na frente, para onde tomba.
      topo = Math.min(B, 0.3);
      const gc = Math.max(15, p.pesoDoCiclopicoKNm3);
      const aRet = topo * H;
      const aTri = (B - topo) * H * 0.5;
      area = aRet + aTri;
      W = area * gc;
      xW = (aRet * (B - topo / 2) + aTri * ((2 * (B - topo)) / 3)) / area;
    } else {
      // L: fuste de espessura ts na frente (x de 0 a ts), sapata de espessura
      // tf em toda a base, talão sob o solo (x de ts a B) — o peso do solo
      // sobre o talão e a sobrecarga ajudam a estabilizar.
      const ts = Math.max(0.2, Math.round((H / 12) / 0.05) * 0.05);
      const tf = Math.max(0.25, Math.round((H / 10) / 0.05) * 0.05);
      topo = ts;
      sapata = tf;
      const gc = Math.max(15, p.pesoDoConcretoKNm3);
      const Lh = Math.max(0, B - ts);
      const aFuste = ts * (H - tf);
      const aSapata = B * tf;
      area = aFuste + aSapata;
      const Wc = (aFuste + aSapata) * gc;
      const Ws = Lh * (H - tf) * gamma;
      const Wq = Lh * q;
      W = Wc + Ws + Wq;
      xW = (aFuste * gc * (ts / 2) + aSapata * gc * (B / 2) + (Ws + Wq) * (ts + Lh / 2)) / W;
    }
    dente = 0;
    res = verificar(W, xW, B, Ea, Mo, tanDelta, passivoCom(0));
    const outrasOk = res.fsT >= fsTmin && res.sigma <= Math.max(50, p.tensaoAdmissivelKPa);
    ok = outrasOk && res.fsD >= FS_DESLIZAMENTO_MIN;
    if (ok) break;
    // Só o deslizamento falha e a base já está em 0,8·H (a faixa de manual):
    // antes de engrossar mais, tenta o dente — mais barato que base larga.
    if (outrasOk && B >= 0.8 * H - 1e-9) {
      for (const hd of DENTES_M) {
        const comDente = verificar(W, xW, B, Ea, Mo, tanDelta, passivoCom(hd));
        if (comDente.fsD >= FS_DESLIZAMENTO_MIN) {
          res = comDente;
          dente = hd;
          ok = true;
          break;
        }
      }
      if (ok) break;
    }
  }
  if (!ok) {
    B = Math.min(B, Bmax);
    avisos.push('Mesmo com a base a 1,2·H as verificações não fecham: rever solo, sobrecarga ou tipo de contenção.');
  }
  if (dente > 0) avisos.push(`Dente de ${dente.toFixed(2)} m sob a base para o deslizamento fechar.`);
  if (tipo === 'GRAVIDADE' && H > 4) avisos.push('Muro de gravidade acima de 4 m sai pesado: considere flexão.');

  // Estabilidade global: círculo por baixo da base. Independe do dente.
  const gamaMuro = tipo === 'GRAVIDADE' ? Math.max(15, p.pesoDoCiclopicoKNm3) : Math.max(15, p.pesoDoConcretoKNm3);
  const fsGlobal = alturaVista > 0.01 ? estabilidadeGlobal(H, B, d, gamma, gamaMuro, phi, Math.max(0, p.coesaoKPa), q) : Infinity;
  if (Number.isFinite(fsGlobal) && fsGlobal < FS_GLOBAL_MIN) {
    avisos.push(`Estabilidade global ${fsGlobal.toFixed(2)} < ${FS_GLOBAL_MIN.toFixed(1)}: ruptura por baixo do muro — solo fraco para este muro; investigar (sondagem, coesão).`);
  }

  const comprimento = muro.comprimentoM;
  const larguraDoDente = tipo === 'GRAVIDADE' ? Math.min(B, 0.3) : Math.max(0.2, Math.round(H / 12 / 0.05) * 0.05);
  const areaComDente = area + dente * larguraDoDente;
  const volume = areaComDente * comprimento;
  return {
    aresta: muro.aresta,
    tipo,
    alturaM: H,
    baseM: B,
    topoM: topo!,
    sapataM: sapata,
    empuxoKNm: Ea,
    fsTombamento: res.fsT,
    fsDeslizamento: res.fsD,
    tensaoMaxKPa: res.sigma,
    denteM: dente,
    fsGlobal,
    atende: ok && H <= ALTURA_MAX_PRE_DIMENSIONAMENTO_M && (!Number.isFinite(fsGlobal) || fsGlobal >= FS_GLOBAL_MIN),
    areaDaSecaoM2: areaComDente,
    volumeDeConcretoM3: volume,
    armaduraKg: tipo === 'FLEXAO' ? volume * Math.max(0, p.taxaDeArmaduraKgM3) : 0,
    barbacas: alturaVista > 0.01 ? Math.ceil(comprimento / 1.5) * Math.max(1, Math.ceil((alturaVista - 0.3) / 1.5)) : 0,
    drenoDePeM: alturaVista > 0.01 ? comprimento : 0,
    avisos,
  };
}

/** Só o que o tipo pede: descida e canaleta são retangulares, tubo é circular. */
export function catalogoDe(tipo: TipoDeDrenagem): readonly SecaoDeDrenagem[] {
  return tipo === 'TUBO' ? TUBOS_CATALOGO : CANALETAS_CATALOGO;
}
