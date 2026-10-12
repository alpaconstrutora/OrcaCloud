/**
 * RASTREAR A PLANTA DE UMA IMAGEM (12/10/2026 — F15 do plano `2026-10-11-planta-recursos-video-synaps.md`).
 *
 * Planta escaneada, foto, PDF sem vetor: o Claude (visão) LÊ a imagem e propõe paredes, aberturas e nomes em
 * pixels; ESTE módulo decide o que vira modelo. A IA é o olho, não a régua:
 *
 * - **A escala vem da calibração do fundo**, nunca da IA. Sem fundo aferido o painel nem oferece rastrear.
 * - **Toda parede proposta é CONFERIDA no próprio fundo** (`refinarNoRaster`): o eixo é puxado para a mancha
 *   escura que está sob o traço proposto e a espessura é MEDIDA nela. Parede sem mancha sob ela é descartada
 *   ("sem traço no fundo") — é assim que alucinação não entra no modelo. A IA erra a posição em alguns pixels;
 *   o fundo não erra.
 * - Depois, o MESMO acabamento do vetorizador (`blueprintVetor`): espessura no centímetro, topo de parede
 *   (esbeltez) fora, pontas encostadas no eixo da parede perpendicular.
 * - Nada é gravado aqui: o resultado é a PRÉVIA; o usuário confirma e o editor aplica `comandosDoRastreio`
 *   (AddWalls + AddOpenings por `wallUid` + PlaceSpaceLabels) num `runBatch` — um Ctrl+Z.
 *
 * Referenciais (todos em pixel, Y para baixo):
 * - IMAGEM ORIGINAL do fundo (o que `pixelParaModelo` entende);
 * - RECORTE: a região escolhida, em pixel da imagem original (`Recorte`);
 * - ANÁLISE: o recorte reamostrado por `fatorDaAnalise` (é onde o fundo é lido);
 * - IA: o recorte reamostrado por `fatorDaIa` (é a imagem enviada; a IA responde nesse referencial).
 */
import { applyBatch, novoUid, point, wallLength, type BlueprintModel, type Command, type ObjectId, type Point } from './blueprintKernel';
import { modeloParaPixel, pixelParaModelo, type Underlay } from './blueprintUnderlay';
import { ESBELTEZ_MINIMA, espessuraDeConstrucao, type ParedeGerada } from './blueprintVetor';
import { FICHA_DO_USO, usoDoNome } from './blueprintPrograma';

/** Lado maior da imagem enviada à IA: acima disso o modelo reduz por conta própria e a conta de volta desanda. */
export const MAX_LADO_PARA_IA = 1568;
/** Lado maior do raster de conferência — basta para medir parede; mais que isso só gasta memória. */
export const MAX_LADO_DA_ANALISE = 3000;
/** Menos que isto não é planta, é um borrão. */
export const MIN_LADO_DO_RECORTE_PX = 64;
/** Teto de itens aceitos de uma resposta — resposta maior é suspeita e travaria a prévia. */
export const MAX_ITENS_DA_RESPOSTA = 600;

/** Espessura plausível de parede, em mm — a faixa em que a mancha do fundo é procurada. */
export const ESPESSURA_MIN_MM = 50;
export const ESPESSURA_MAX_MM = 450;
/** Inclinação até a qual o traço é tratado como horizontal/vertical (planta escaneada sai um pouco torta). */
export const TOLERANCIA_ORTOGONAL_GRAUS = 4;
/** Fração das amostras que precisa estar escura para a linha do fundo contar como "traço". */
export const COBERTURA_MINIMA = 0.4;

export interface Recorte {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface Raster {
  largura: number;
  altura: number;
  /** Tons de cinza, 0 = preto, 255 = branco, linha a linha. */
  cinza: Uint8Array | Uint8ClampedArray;
}

// ─── Resposta da IA ──────────────────────────────────────────────────────────

export type TipoDeAberturaRastreada = 'porta' | 'janela' | 'passagem';

export interface TracadoDaIa {
  paredes: { x1: number; y1: number; x2: number; y2: number }[];
  aberturas: { tipo: TipoDeAberturaRastreada; x1: number; y1: number; x2: number; y2: number }[];
  ambientes: { nome: string; x: number; y: number }[];
  observacao: string;
}

/** A região (mm do modelo) → o retângulo de pixels da imagem do fundo. `null` = fora da imagem ou pequena demais. */
export function recorteDaRegiao(
  underlay: Underlay,
  regiao: { x0: number; y0: number; x1: number; y1: number },
  larguraImg: number,
  alturaImg: number,
): Recorte | null {
  const cantos = [
    modeloParaPixel(underlay, regiao.x0, regiao.y0),
    modeloParaPixel(underlay, regiao.x1, regiao.y0),
    modeloParaPixel(underlay, regiao.x0, regiao.y1),
    modeloParaPixel(underlay, regiao.x1, regiao.y1),
  ];
  const x0 = Math.max(0, Math.floor(Math.min(...cantos.map((c) => c.px))));
  const y0 = Math.max(0, Math.floor(Math.min(...cantos.map((c) => c.py))));
  const x1 = Math.min(larguraImg, Math.ceil(Math.max(...cantos.map((c) => c.px))));
  const y1 = Math.min(alturaImg, Math.ceil(Math.max(...cantos.map((c) => c.py))));
  if (x1 - x0 < MIN_LADO_DO_RECORTE_PX || y1 - y0 < MIN_LADO_DO_RECORTE_PX) return null;
  return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 };
}

/** O fator que leva o recorte ao lado máximo (nunca amplia). */
export function fatorParaLado(r: Recorte, maxLado: number): number {
  return Math.min(1, maxLado / Math.max(r.sw, r.sh));
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * A resposta crua da IA → o traçado SANEADO no referencial da imagem enviada. Item com número inválido ou fora
 * da imagem (com 2 % de folga, que a IA às vezes encosta na borda) é recusado e contado; o resto é limitado à
 * imagem. Tipo de abertura desconhecido vira porta? Não: vira recusa — inventar o tipo é pior que perder o item.
 */
export function tracadoDaResposta(raw: unknown, largura: number, altura: number): { tracado: TracadoDaIa; recusados: number } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const folgaX = largura * 0.02;
  const folgaY = altura * 0.02;
  let recusados = 0;
  const ponto = (x: unknown, y: unknown): { x: number; y: number } | null => {
    const a = num(x);
    const b = num(y);
    if (a === null || b === null || a < -folgaX || a > largura + folgaX || b < -folgaY || b > altura + folgaY) return null;
    return { x: Math.min(largura, Math.max(0, a)), y: Math.min(altura, Math.max(0, b)) };
  };
  const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object') : []);

  const paredes: TracadoDaIa['paredes'] = [];
  for (const p of lista(o.paredes).slice(0, MAX_ITENS_DA_RESPOSTA)) {
    const a = ponto(p.x1, p.y1);
    const b = ponto(p.x2, p.y2);
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 2) {
      recusados++;
      continue;
    }
    paredes.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  const aberturas: TracadoDaIa['aberturas'] = [];
  for (const p of lista(o.aberturas).slice(0, MAX_ITENS_DA_RESPOSTA)) {
    const tipo = p.tipo === 'porta' || p.tipo === 'janela' || p.tipo === 'passagem' ? p.tipo : null;
    const a = ponto(p.x1, p.y1);
    const b = ponto(p.x2, p.y2);
    if (!tipo || !a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 2) {
      recusados++;
      continue;
    }
    aberturas.push({ tipo, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  const ambientes: TracadoDaIa['ambientes'] = [];
  for (const p of lista(o.ambientes).slice(0, MAX_ITENS_DA_RESPOSTA)) {
    const nome = typeof p.nome === 'string' ? p.nome.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    const a = ponto(p.x, p.y);
    if (!nome || !a) {
      recusados++;
      continue;
    }
    ambientes.push({ nome, x: a.x, y: a.y });
  }
  const observacao = typeof o.observacao === 'string' ? o.observacao.trim().slice(0, 400) : '';
  return { tracado: { paredes, aberturas, ambientes, observacao }, recusados };
}

// ─── O fundo ─────────────────────────────────────────────────────────────────

/** RGBA (o `ImageData` do canvas) → tons de cinza. Transparente conta como branco (papel). */
export function cinzaDeRgba(rgba: Uint8Array | Uint8ClampedArray, largura: number, altura: number): Raster {
  const cinza = new Uint8Array(largura * altura);
  for (let i = 0, k = 0; i < cinza.length; i++, k += 4) {
    const a = rgba[k + 3] / 255;
    const l = 0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2];
    cinza[i] = Math.round(l * a + 255 * (1 - a));
  }
  return { largura, altura, cinza };
}

/**
 * O limiar entre "traço" e "papel" pelo método de Otsu (o que separa melhor os dois grupos do histograma). Num
 * escaneado o papel não é 255 nem o traço 0 — um limiar fixo de 128 erra em papel amarelado e em lápis.
 */
export function limiarDeOtsu(r: Raster): number {
  const hist = new Array<number>(256).fill(0);
  const passo = Math.max(1, Math.floor(r.cinza.length / 400_000));
  let total = 0;
  for (let i = 0; i < r.cinza.length; i += passo) {
    hist[r.cinza[i]]++;
    total++;
  }
  let soma = 0;
  for (let t = 0; t < 256; t++) soma += t * hist[t];
  let somaB = 0;
  let pesoB = 0;
  let melhor = 0;
  let limiar = 128;
  for (let t = 0; t < 256; t++) {
    pesoB += hist[t];
    if (!pesoB) continue;
    const pesoF = total - pesoB;
    if (!pesoF) break;
    somaB += t * hist[t];
    const mB = somaB / pesoB;
    const mF = (soma - somaB) / pesoF;
    const entre = pesoB * pesoF * (mB - mF) ** 2;
    if (entre > melhor) {
      melhor = entre;
      limiar = t;
    }
  }
  return limiar;
}

// ─── Segmentos no referencial da análise ─────────────────────────────────────

export type Orientacao = 'H' | 'V' | 'O';

/** Um trecho de parede durante o processamento. `H`: `c` é o y e o vão vai de `i` a `f` em x. `V`: o contrário. */
export interface TrechoDeParede {
  orientacao: Orientacao;
  /** Para `O`, os dois pontos; para H/V, derivados de c/i/f. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c: number;
  i: number;
  f: number;
  /** Espessura em pixel da análise. */
  esp: number;
}

/** Endireita o que está quase na horizontal/vertical (escaneado sai torto) e classifica a orientação. */
export function endireitar(p: { x1: number; y1: number; x2: number; y2: number }, espPadrao: number, tolGraus = TOLERANCIA_ORTOGONAL_GRAUS): TrechoDeParede {
  const dx = p.x2 - p.x1;
  const dy = p.y2 - p.y1;
  const ang = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (ang <= tolGraus) {
    const c = (p.y1 + p.y2) / 2;
    const i = Math.min(p.x1, p.x2);
    const f = Math.max(p.x1, p.x2);
    return { orientacao: 'H', x1: i, y1: c, x2: f, y2: c, c, i, f, esp: espPadrao };
  }
  if (ang >= 90 - tolGraus) {
    const c = (p.x1 + p.x2) / 2;
    const i = Math.min(p.y1, p.y2);
    const f = Math.max(p.y1, p.y2);
    return { orientacao: 'V', x1: c, y1: i, x2: c, y2: f, c, i, f, esp: espPadrao };
  }
  return { orientacao: 'O', ...p, c: 0, i: 0, f: 0, esp: espPadrao };
}

const comCoordenadas = (t: TrechoDeParede): TrechoDeParede =>
  t.orientacao === 'H'
    ? { ...t, x1: t.i, y1: t.c, x2: t.f, y2: t.c }
    : t.orientacao === 'V'
      ? { ...t, x1: t.c, y1: t.i, x2: t.c, y2: t.f }
      : t;

/** Escuro em (ao longo, através) — o eixo do trecho manda quem é x e quem é y. Fora da imagem = papel. */
function escuro(r: Raster, limiar: number, o: Orientacao, ao: number, at: number): boolean {
  const x = Math.round(o === 'H' ? ao : at);
  const y = Math.round(o === 'H' ? at : ao);
  if (x < 0 || y < 0 || x >= r.largura || y >= r.altura) return false;
  return r.cinza[y * r.largura + x] <= limiar; // Otsu: a classe escura é a dos tons ≤ limiar
}

/**
 * CONFERE o trecho no fundo: procura, ATRAVÉS do eixo proposto, a mancha escura que é a parede.
 *
 * O perfil é a fração das amostras (ao longo do vão, sem as pontas) que estão escuras a cada deslocamento. As
 * faixas com cobertura ≥ `COBERTURA_MINIMA` são os traços. Parede é: UMA faixa da espessura de parede (parede
 * cheia/preenchida) OU um PAR de faixas finas a uma espessura de parede (parede desenhada pelo contorno, com ou
 * sem hachura). Entre os candidatos, vence o mais largo que CONTÉM a linha proposta; se nenhum contém, o mais
 * perto dela. Sem candidato = a IA viu parede onde o fundo não tem traço → `confirmado: false`.
 */
export function refinarNoRaster(t: TrechoDeParede, r: Raster, limiar: number, mmPorPx: number): { trecho: TrechoDeParede; confirmado: boolean } {
  if (t.orientacao === 'O') return { trecho: t, confirmado: false };
  const L = t.f - t.i;
  if (L < 4) return { trecho: t, confirmado: false };
  const minT = Math.max(2, ESPESSURA_MIN_MM / mmPorPx);
  const maxT = Math.max(minT + 1, ESPESSURA_MAX_MM / mmPorPx);
  const R = Math.ceil(maxT / 2 + Math.max(4, 0.02 * Math.max(r.largura, r.altura)));
  const n = Math.max(3, Math.min(80, Math.floor(L * 0.8)));
  const amostras: number[] = [];
  for (let k = 0; k < n; k++) amostras.push(t.i + L * (0.1 + (0.8 * k) / Math.max(1, n - 1)));

  // O perfil é lido em LINHAS INTEIRAS do fundo a partir de `c0` — com `c` no meio-pixel, `c + d` arredondaria
  // metade das linhas para o lado errado e a faixa sairia um pixel torta.
  const c0 = Math.round(t.c);
  const perfil: number[] = [];
  for (let d = -R; d <= R; d++) {
    let esc = 0;
    for (const a of amostras) if (escuro(r, limiar, t.orientacao, a, c0 + d)) esc++;
    perfil.push(esc / amostras.length);
  }
  const faixas: { ini: number; fim: number }[] = [];
  for (let k = 0; k < perfil.length; k++) {
    if (perfil[k] < COBERTURA_MINIMA) continue;
    const ult = faixas[faixas.length - 1];
    if (ult && ult.fim === k - 1 - R) ult.fim = k - R;
    else faixas.push({ ini: k - R, fim: k - R });
  }
  const candidatos: { centro: number; esp: number }[] = [];
  for (const fx of faixas) {
    const w = fx.fim - fx.ini + 1;
    if (w >= minT && w <= maxT) candidatos.push({ centro: (fx.ini + fx.fim) / 2, esp: w });
  }
  for (let a = 0; a < faixas.length; a++) {
    for (let b = a + 1; b < faixas.length; b++) {
      const span = faixas[b].fim - faixas[a].ini + 1;
      if (span < minT || span > maxT) continue;
      candidatos.push({ centro: (faixas[a].ini + faixas[b].fim) / 2, esp: span });
    }
  }
  if (!candidatos.length) return { trecho: t, confirmado: false };
  const contem = candidatos.filter((c) => Math.abs(c0 + c.centro - t.c) <= c.esp / 2 + 1);
  const escolhido = contem.length
    ? contem.reduce((m, c) => (c.esp > m.esp ? c : m))
    : candidatos.reduce((m, c) => (Math.abs(c0 + c.centro - t.c) < Math.abs(c0 + m.centro - t.c) ? c : m));
  return { trecho: comCoordenadas({ ...t, c: c0 + escolhido.centro, esp: escolhido.esp }), confirmado: true };
}

/** Há parede no fundo nesta posição ao longo do trecho? (2 de 3: as duas faces e o eixo — vale para cheia e contorno.) */
function cobertoEm(t: TrechoDeParede, r: Raster, limiar: number, ao: number): boolean {
  // As faces são a 1ª e a última linha da faixa: com `c` no meio-pixel, ±(esp−1)/2 cai EXATAMENTE nelas.
  const meio = Math.max(0.5, (t.esp - 1) / 2);
  let n = 0;
  if (escuro(r, limiar, t.orientacao, ao, t.c - meio)) n++;
  if (escuro(r, limiar, t.orientacao, ao, t.c)) n++;
  if (escuro(r, limiar, t.orientacao, ao, t.c + meio)) n++;
  return n >= 2;
}

/**
 * As pontas, pelo fundo: estica enquanto há parede logo adiante, ou recolhe enquanto não há — até `alcance`
 * pixels e nunca mais que um terço do vão. A IA costuma parar a parede um pouco antes ou depois do fim real.
 */
export function ajustarPontas(t: TrechoDeParede, r: Raster, limiar: number, alcance: number): TrechoDeParede {
  if (t.orientacao === 'O') return t;
  const maxRecolher = (t.f - t.i) / 3;
  let i = t.i;
  let f = t.f;
  if (cobertoEm(t, r, limiar, i - 1)) {
    let k = 0;
    while (k < alcance && cobertoEm(t, r, limiar, i - 1)) {
      i--;
      k++;
    }
  } else {
    let k = 0;
    while (k < Math.min(alcance, maxRecolher) && !cobertoEm(t, r, limiar, i)) {
      i++;
      k++;
    }
  }
  if (cobertoEm(t, r, limiar, f + 1)) {
    let k = 0;
    while (k < alcance && cobertoEm(t, r, limiar, f + 1)) {
      f++;
      k++;
    }
  } else {
    let k = 0;
    while (k < Math.min(alcance, maxRecolher) && !cobertoEm(t, r, limiar, f)) {
      f--;
      k++;
    }
  }
  return comCoordenadas({ ...t, i, f });
}

/**
 * Funde trechos que são a MESMA parede: mesma orientação, eixos a menos de meia espessura e vãos que se tocam ou
 * se sobrepõem. A IA às vezes devolve a parede em pedaços, ou duas vezes. Não funde através de um vão: parede
 * interrompida por um vão livre é decisão do desenho, não ruído.
 */
export function juntarSobrepostos(trechos: TrechoDeParede[], folgaPx = 2): TrechoDeParede[] {
  const saida: TrechoDeParede[] = [];
  for (const o of ['H', 'V'] as const) {
    const grupo = trechos.filter((t) => t.orientacao === o).sort((a, b) => a.c - b.c || a.i - b.i);
    const usados = new Set<number>();
    for (let a = 0; a < grupo.length; a++) {
      if (usados.has(a)) continue;
      let atual = grupo[a];
      let mudou = true;
      while (mudou) {
        mudou = false;
        for (let b = 0; b < grupo.length; b++) {
          if (b === a || usados.has(b)) continue;
          const g = grupo[b];
          const tol = Math.max(atual.esp, g.esp) / 2;
          if (Math.abs(g.c - atual.c) > tol) continue;
          if (g.i > atual.f + folgaPx || g.f < atual.i - folgaPx) continue;
          const la = atual.f - atual.i;
          const lb = g.f - g.i;
          atual = comCoordenadas({
            ...atual,
            c: (atual.c * la + g.c * lb) / Math.max(1e-9, la + lb),
            i: Math.min(atual.i, g.i),
            f: Math.max(atual.f, g.f),
            esp: Math.max(atual.esp, g.esp),
          });
          usados.add(b);
          mudou = true;
        }
      }
      usados.add(a);
      saida.push(atual);
    }
  }
  return [...saida, ...trechos.filter((t) => t.orientacao === 'O')];
}

/**
 * Encosta cada ponta no EIXO da parede perpendicular que ela encontra (canto em L e T): estica ou recolhe até
 * lá. O fundo dá a FACE da parede vizinha; o modelo precisa do EIXO, senão o canto fica aberto ou atravessado e
 * nenhum ambiente fecha.
 */
export function encostarPontas(trechos: TrechoDeParede[], folgaPx = 6): TrechoDeParede[] {
  const saida = trechos.map((t) => ({ ...t }));
  for (const t of saida) {
    if (t.orientacao === 'O') continue;
    const perp = saida.filter((o) => o !== t && o.orientacao !== 'O' && o.orientacao !== t.orientacao);
    for (const ponta of ['i', 'f'] as const) {
      const v = t[ponta];
      let melhor: { c: number; d: number } | null = null;
      for (const o of perp) {
        const tol = Math.max(t.esp, o.esp) + folgaPx;
        // a ponta está perto do eixo do outro, e a linha deste cai dentro do vão do outro
        const d = Math.abs(o.c - v);
        if (d > tol) continue;
        if (t.c < o.i - tol || t.c > o.f + tol) continue;
        if (!melhor || d < melhor.d) melhor = { c: o.c, d };
      }
      if (melhor) t[ponta] = melhor.c;
    }
    if (t.f < t.i) [t.i, t.f] = [t.f, t.i];
    Object.assign(t, comCoordenadas(t));
  }
  return saida;
}

// ─── O processo inteiro ──────────────────────────────────────────────────────

export interface EntradaDoRastreio {
  tracado: TracadoDaIa;
  /** O fundo, no referencial da análise. `null` = não deu para ler o fundo (nada é confirmado). */
  raster: Raster | null;
  /** Pixel da IA → pixel da análise. */
  iaParaAnalise: number;
  /** Milímetros reais por pixel da ANÁLISE (da calibração). */
  mmPorPx: number;
  /** Pixel da análise → milímetro do modelo. */
  paraModelo: (x: number, y: number) => { x: number; y: number };
}

export interface AberturaRastreada {
  tipo: TipoDeAberturaRastreada;
  a: Point;
  b: Point;
}

export interface ResultadoDoRastreio {
  paredes: ParedeGerada[];
  aberturas: AberturaRastreada[];
  ambientes: { nome: string; at: Point }[];
  /** Quantas paredes a IA propôs. */
  propostas: number;
  /** O que ficou de fora, por motivo — mostrado na tela. */
  descartes: { motivo: string; n: number }[];
}

const pt = (p: { x: number; y: number }): Point => point(Math.round(p.x), Math.round(p.y));

export function rastrear(e: EntradaDoRastreio): ResultadoDoRastreio {
  const descartes = new Map<string, number>();
  const descartar = (motivo: string, n = 1) => descartes.set(motivo, (descartes.get(motivo) ?? 0) + n);
  const espPadrao = 150 / e.mmPorPx;
  const limiar = e.raster ? limiarDeOtsu(e.raster) : 0;
  const alcance = e.raster ? Math.max(4, 0.02 * Math.max(e.raster.largura, e.raster.altura)) : 0;

  const conferidos: TrechoDeParede[] = [];
  for (const p of e.tracado.paredes) {
    const t = endireitar({ x1: p.x1 * e.iaParaAnalise, y1: p.y1 * e.iaParaAnalise, x2: p.x2 * e.iaParaAnalise, y2: p.y2 * e.iaParaAnalise }, espPadrao);
    if (t.orientacao === 'O') {
      descartar('inclinada (só paredes retas na horizontal ou vertical são conferidas no fundo)');
      continue;
    }
    if (!e.raster) {
      descartar('sem o fundo para conferir');
      continue;
    }
    const { trecho, confirmado } = refinarNoRaster(t, e.raster, limiar, e.mmPorPx);
    if (!confirmado) {
      descartar('sem traço de parede no fundo sob ela');
      continue;
    }
    conferidos.push(ajustarPontas(trecho, e.raster, limiar, alcance));
  }
  const juntos = juntarSobrepostos(conferidos);
  if (conferidos.length > juntos.length) descartar('repetida (fundida com outra)', conferidos.length - juntos.length);
  const encostados = encostarPontas(juntos);

  const paredes: ParedeGerada[] = [];
  for (const t of encostados) {
    const a = pt(e.paraModelo(t.x1, t.y1));
    const b = pt(e.paraModelo(t.x2, t.y2));
    const comprimentoMm = Math.hypot(b.x - a.x, b.y - a.y);
    const espessuraMm = espessuraDeConstrucao(t.esp * e.mmPorPx);
    if (comprimentoMm < ESBELTEZ_MINIMA * espessuraMm) {
      descartar('curta demais (topo de parede)');
      continue;
    }
    paredes.push({ a, b, espessuraMm, comprimentoMm });
  }

  const aberturas = e.tracado.aberturas.map((o) => ({
    tipo: o.tipo,
    a: pt(e.paraModelo(o.x1 * e.iaParaAnalise, o.y1 * e.iaParaAnalise)),
    b: pt(e.paraModelo(o.x2 * e.iaParaAnalise, o.y2 * e.iaParaAnalise)),
  }));
  const ambientes = e.tracado.ambientes.map((m) => ({ nome: m.nome, at: pt(e.paraModelo(m.x * e.iaParaAnalise, m.y * e.iaParaAnalise)) }));

  return { paredes, aberturas, ambientes, propostas: e.tracado.paredes.length, descartes: [...descartes].map(([motivo, n]) => ({ motivo, n })) };
}

// ─── Para o modelo ───────────────────────────────────────────────────────────

/** Medidas padrão por tipo — as mesmas da ferramenta Abertura e do gerador (a imagem em planta não diz altura). */
export const PADRAO_DA_ABERTURA: Record<TipoDeAberturaRastreada, { kind: 'door' | 'window' | 'passage'; heightMm: number; sillMm: number; minMm: number }> = {
  porta: { kind: 'door', heightMm: 2100, sillMm: 0, minMm: 500 },
  janela: { kind: 'window', heightMm: 1200, sillMm: 1000, minMm: 400 },
  passagem: { kind: 'passage', heightMm: 2100, sillMm: 0, minMm: 500 },
};

/** Afastamento máximo da abertura até a face da parede para ser hospedada nela. */
export const FOLGA_DA_ABERTURA_MM = 250;

export interface ParedeHospedeira {
  uid: string;
  a: Point;
  b: Point;
  espessuraMm: number;
}

/**
 * Hospeda cada abertura na parede sob ela (perto do eixo, quase paralela), com o vão projetado nessa parede.
 * Abertura sem parede, que não cabe, ou que cairia sobre outra já hospedada na mesma parede é descartada —
 * o kernel recusaria o lote inteiro por uma só (`OPENING_OVERLAP`, `OPENING_OUT_OF_BOUNDS`).
 */
export function hospedarAberturas(
  aberturas: AberturaRastreada[],
  paredes: ParedeHospedeira[],
): { comandos: Extract<Command, { type: 'AddOpenings' }>['openings']; descartes: { motivo: string; n: number }[] } {
  const descartes = new Map<string, number>();
  const descartar = (m: string) => descartes.set(m, (descartes.get(m) ?? 0) + 1);
  const ocupado = new Map<string, { ini: number; fim: number }[]>();
  const comandos: Extract<Command, { type: 'AddOpenings' }>['openings'] = [];
  for (const o of aberturas) {
    const dx = o.b.x - o.a.x;
    const dy = o.b.y - o.a.y;
    const lo = Math.hypot(dx, dy);
    const mx = (o.a.x + o.b.x) / 2;
    const my = (o.a.y + o.b.y) / 2;
    let melhor: { w: ParedeHospedeira; d: number; t1: number; t2: number; len: number } | null = null;
    for (const w of paredes) {
      const wx = w.b.x - w.a.x;
      const wy = w.b.y - w.a.y;
      const len = Math.hypot(wx, wy);
      if (!len) continue;
      const ux = wx / len;
      const uy = wy / len;
      if (lo > 0 && Math.abs((dx * ux + dy * uy) / lo) < Math.cos((20 * Math.PI) / 180)) continue;
      const tm = (mx - w.a.x) * ux + (my - w.a.y) * uy;
      if (tm < 0 || tm > len) continue;
      const d = Math.abs((mx - w.a.x) * -uy + (my - w.a.y) * ux);
      if (d > w.espessuraMm / 2 + FOLGA_DA_ABERTURA_MM) continue;
      const t1 = (o.a.x - w.a.x) * ux + (o.a.y - w.a.y) * uy;
      const t2 = (o.b.x - w.a.x) * ux + (o.b.y - w.a.y) * uy;
      if (!melhor || d < melhor.d) melhor = { w, d, t1, t2, len };
    }
    if (!melhor) {
      descartar('abertura sem parede sob ela');
      continue;
    }
    const padrao = PADRAO_DA_ABERTURA[o.tipo];
    let ini = Math.max(0, Math.min(melhor.t1, melhor.t2));
    let largura = Math.round((Math.min(melhor.len, Math.max(melhor.t1, melhor.t2)) - ini) / 10) * 10;
    if (largura < padrao.minMm) largura = padrao.minMm;
    ini = Math.round(Math.min(ini, melhor.len - largura));
    if (ini < 0 || largura > Math.floor(melhor.len)) {
      descartar('abertura maior que a parede');
      continue;
    }
    const lista = ocupado.get(melhor.w.uid) ?? [];
    if (lista.some((s) => ini < s.fim && ini + largura > s.ini)) {
      descartar('abertura sobre outra na mesma parede');
      continue;
    }
    lista.push({ ini, fim: ini + largura });
    ocupado.set(melhor.w.uid, lista);
    comandos.push({ wallId: '', wallUid: melhor.w.uid, kind: padrao.kind, offsetMm: ini, widthMm: largura, heightMm: padrao.heightMm, sillMm: padrao.sillMm });
  }
  return { comandos, descartes: [...descartes].map(([motivo, n]) => ({ motivo, n })) };
}

/** As paredes do rastreio como `AddWalls`, cada uma com o uid já escolhido (a abertura é hospedada por ele). */
export function comandoDasParedes(paredes: ParedeGerada[], levelId: ObjectId, alturaMm: number, uids: string[] = paredes.map(() => novoUid())): Extract<Command, { type: 'AddWalls' }> {
  return {
    type: 'AddWalls',
    walls: paredes.map((p, k) => ({ levelId, a: p.a, b: p.b, thicknessMm: p.espessuraMm, heightMm: alturaMm, uid: uids[k] })),
  };
}

/** Os nomes como `PlaceSpaceLabels`, com o tipo de ambiente sugerido pelo nome (como no clique da F2). */
export function comandoDosNomes(ambientes: ResultadoDoRastreio['ambientes'], levelId: ObjectId): Extract<Command, { type: 'PlaceSpaceLabels' }> | null {
  if (!ambientes.length) return null;
  return {
    type: 'PlaceSpaceLabels',
    labels: ambientes.map((m) => {
      const uso = usoDoNome(m.nome);
      return { levelId, at: m.at, name: m.nome, ...(uso ? { tipoDeAmbiente: FICHA_DO_USO[uso].tipoNbr5410 } : {}) };
    }),
  };
}

/**
 * O lote inteiro, na ordem certa: paredes → `correcoes` (as conexões em T que o editor calcula sobre o modelo
 * simulado) → aberturas, hospedadas nas paredes JÁ CORRIGIDAS (a correção mexe nas pontas, e o vão é medido a
 * partir da ponta `a`) → nomes. Um `runBatch`, um Ctrl+Z.
 */
export function comandosDoRastreio(
  r: ResultadoDoRastreio,
  modelo: BlueprintModel,
  levelId: ObjectId,
  opcoes: { alturaMm: number; correcoes?: (simulado: BlueprintModel) => Command[]; uids?: string[] },
): { comandos: Command[]; descartes: { motivo: string; n: number }[] } {
  if (!r.paredes.length) {
    const nomes = comandoDosNomes(r.ambientes, levelId);
    return { comandos: nomes ? [nomes] : [], descartes: r.aberturas.length ? [{ motivo: 'abertura sem parede sob ela', n: r.aberturas.length }] : [] };
  }
  const paredes = comandoDasParedes(r.paredes, levelId, opcoes.alturaMm, opcoes.uids);
  let simulado = applyBatch(modelo, [paredes]).model;
  const correcoes = opcoes.correcoes ? opcoes.correcoes(simulado) : [];
  if (correcoes.length) simulado = applyBatch(simulado, correcoes).model;
  const uids = new Set(paredes.walls.map((w) => w.uid));
  const hospedeiras = simulado.walls
    .filter((w) => uids.has(w.uid) && wallLength(w) > 0)
    .map((w) => ({ uid: w.uid, a: w.a, b: w.b, espessuraMm: w.thicknessMm }));
  const { comandos: aberturas, descartes } = hospedarAberturas(r.aberturas, hospedeiras);
  const nomes = comandoDosNomes(r.ambientes, levelId);
  const comandos: Command[] = [paredes, ...correcoes];
  if (aberturas.length) comandos.push({ type: 'AddOpenings', openings: aberturas });
  if (nomes) comandos.push(nomes);
  return { comandos, descartes };
}
