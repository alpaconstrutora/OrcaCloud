/**
 * Do vetor do PDF para a parede do modelo.
 *
 * ─── O QUE ESTE MÓDULO RESOLVE, E O QUE ELE NÃO RESOLVE ─────────────────────
 *
 * Ele deriva PAREDE. Não deriva AMBIENTE, e a distinção é a razão de ele
 * existir: o Spike C mostrou em cinco rodadas que fechar o vão de uma porta é
 * um problema SEMÂNTICO (porta, borda de terraço e guarda-corpo produzem
 * geometria parecida demais), e é ele que trava a derivação de cômodo.
 *
 * Emparelhar as duas faces de uma parede não tem esse problema: é paralelismo
 * e distância, e as duas perguntas têm resposta no desenho. Por isso a parede
 * anda enquanto o ambiente espera.
 *
 * ─── A ESTRUTURA REAL DO DESENHO ────────────────────────────────────────────
 *
 * Medido na prancha A0 de projeto (`docs/spikes/digitalizador/eixos.mjs`):
 * **140 dos 143 subpaths do grupo de parede têm UM segmento só.** A parede não
 * é um retângulo fechado que baste agrupar — cada FACE é uma linha solta e
 * independente. Agrupar por subpath foi tentado e devolveu 0 de 143.
 *
 * É por isso que aqui há pareamento geométrico, e não uma leitura de polígono.
 */
import { pixelParaModelo, type Underlay } from './blueprintUnderlay';
import type { Point } from './blueprintKernel';

/** Um traço do PDF, em pontos de papel. */
export interface SegmentoVetor {
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Espessura do traço, em pt. É o sinal que separa parede de cota e hachura. */
  larguraPt: number;
  /** Subpath de origem. Guardado para diagnóstico; o pareamento não usa. */
  subpath?: number;
}

/** Uma face já normalizada: reta infinita + o trecho ocupado nela. */
export interface Face {
  /** Direção unitária, SEM sinal — a mesma face desenhada ao contrário é a mesma face. */
  ux: number;
  uy: number;
  /** Distância com sinal da reta à origem, ao longo da normal. */
  off: number;
  /** Extremos do trecho, projetados na direção. */
  u0: number;
  u1: number;
}

/** O eixo de uma parede, ainda em pt de papel. */
export interface EixoDerivado {
  a: { x: number; y: number };
  b: { x: number; y: number };
  espessuraPt: number;
  comprimentoPt: number;
  /** Quanto da face menor o par cobre. Alto = as duas faces se acompanham. */
  cobertura: number;
}

const comp = (s: SegmentoVetor) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

/**
 * Quantos segmentos e quanto comprimento há em cada espessura de traço.
 *
 * É o que a tela oferece para o usuário escolher qual grupo é parede. A escolha
 * é HUMANA de propósito: o Spike C mostrou que heurística automática para
 * separar papéis de traço erra, e que uma decisão de um clique resolve — a
 * mesma lógica da aferição de escala.
 */
export function histogramaEspessura(
  segmentos: SegmentoVetor[],
): { larguraPt: number; n: number; comprimentoMedioPt: number; comprimentoTotalPt: number }[] {
  const por = new Map<string, { n: number; soma: number }>();
  for (const s of segmentos) {
    const c = comp(s);
    if (c <= 0) continue;
    const k = s.larguraPt.toFixed(2);
    const g = por.get(k) ?? { n: 0, soma: 0 };
    g.n += 1;
    g.soma += c;
    por.set(k, g);
  }
  return [...por.entries()]
    .map(([k, g]) => ({
      larguraPt: Number(k),
      n: g.n,
      comprimentoMedioPt: g.soma / g.n,
      comprimentoTotalPt: g.soma,
    }))
    .sort((a, b) => b.comprimentoTotalPt - a.comprimentoTotalPt);
}

/** Casas decimais ao agrupar retas. Grosso demais junta paredes vizinhas. */
const CASAS_ANGULO = 1;
const CASAS_OFFSET = 1;

/**
 * Junta pedaços colineares E ENCOSTADOS da mesma face.
 *
 * ⚠️ A folga é minúscula (0,5 pt ≈ 1,7 cm na obra) DE PROPÓSITO. Juntar com
 * folga generosa atravessaria o vão da porta e devolveria parede onde há
 * passagem — o mesmo erro que a rodada 3 do Spike C cometeu por outro caminho,
 * e que custou duas tentativas reprovadas.
 */
export function juntarColineares(segmentos: SegmentoVetor[], folgaPt = 0.5): Face[] {
  const grupos = new Map<string, { ux: number; uy: number; itens: { u0: number; u1: number; off: number }[] }>();

  for (const s of segmentos) {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const n = Math.hypot(dx, dy);
    if (n <= 0) continue;

    // DIREÇÃO CANÔNICA — o vetor é dobrado para o semiplano X positivo, e não
    // o ângulo.
    //
    // Dobrar o ângulo (`if (ang < 0) ang += π`) parece equivalente e não é:
    // a direção (−1, 0) tem ângulo exatamente π, que não é negativo, então
    // escapava da correção e ia para a chave "180.0" enquanto (1, 0) ia para
    // "0.0". A mesma face desenhada da direita para a esquerda virava duas
    // faces, e as duas ficavam órfãs no pareamento. Um teste pegou.
    //
    // ⚠️ A emenda sobra em ±90°: uma face quase vertical desenhada nos dois
    // sentidos ainda pode cair em chaves distintas. Vertical EXATA não cai,
    // porque o desempate manda `uy` para positivo — e planta de arquitetura é
    // feita de verticais exatas.
    let ux = dx / n;
    let uy = dy / n;
    if (ux < -1e-12 || (Math.abs(ux) <= 1e-12 && uy < 0)) {
      ux = -ux;
      uy = -uy;
    }
    const ang = Math.atan2(uy, ux);
    const off = -s.a.x * uy + s.a.y * ux;

    const chave = `${((ang * 180) / Math.PI).toFixed(CASAS_ANGULO)}|${off.toFixed(CASAS_OFFSET)}`;
    if (!grupos.has(chave)) grupos.set(chave, { ux, uy, itens: [] });
    const g = grupos.get(chave)!;
    const ua = s.a.x * ux + s.a.y * uy;
    const ub = s.b.x * ux + s.b.y * uy;
    g.itens.push({ u0: Math.min(ua, ub), u1: Math.max(ua, ub), off });
  }

  const saida: Face[] = [];
  for (const g of grupos.values()) {
    g.itens.sort((a, b) => a.u0 - b.u0);
    let atual: { u0: number; u1: number; off: number } | null = null;
    for (const it of g.itens) {
      if (atual && it.u0 <= atual.u1 + folgaPt) {
        atual.u1 = Math.max(atual.u1, it.u1);
      } else {
        if (atual) saida.push({ ...atual, ux: g.ux, uy: g.uy });
        atual = { ...it };
      }
    }
    if (atual) saida.push({ ...atual, ux: g.ux, uy: g.uy });
  }
  return saida;
}

export interface OpcoesPareamento {
  /** Faixa de espessura plausível para parede, em MILÍMETROS reais. */
  espessuraMinMm?: number;
  espessuraMaxMm?: number;
  /** Milímetros reais por ponto de papel — vem da escala do desenho. */
  mmPorPt: number;
  /** Sobreposição mínima entre as duas faces, em mm reais. */
  sobreposicaoMinMm?: number;
  /** Tolerância de paralelismo, em graus. */
  toleranciaGraus?: number;
}

/**
 * Empareilha faces opostas e devolve o eixo de cada parede.
 *
 * ─── A DECISÃO QUE FAZ ISTO FUNCIONAR ───────────────────────────────────────
 *
 * A face é consumida **por TRECHO, não inteira**. A primeira versão marcava a
 * face como usada de uma vez, e o resultado, desenhado, mostrou o preço: as
 * paredes longas horizontais saíam certas e as verticais ficavam órfãs. O
 * motivo é estrutural, não um ajuste de parâmetro — uma face de fachada de 8 m
 * encosta em VÁRIAS paredes internas ao longo do comprimento, e consumida pelo
 * primeiro par os outros trechos dela perdem a contraparte.
 *
 * Não é caso raro: é como toda planta é. Consumo por intervalo levou 42→52
 * eixos e 58%→68% de comprimento emparelhado na prancha real.
 */
export function parearFaces(faces: Face[], opcoes: OpcoesPareamento): EixoDerivado[] {
  const {
    mmPorPt,
    espessuraMinMm = 50,
    espessuraMaxMm = 400,
    sobreposicaoMinMm = 70,
    toleranciaGraus = 2,
  } = opcoes;

  const espMinPt = espessuraMinMm / mmPorPt;
  const espMaxPt = espessuraMaxMm / mmPorPt;
  const sobrepMinPt = sobreposicaoMinMm / mmPorPt;
  const cosLimite = Math.cos((toleranciaGraus * Math.PI) / 180);

  const candidatos: {
    i: number;
    j: number;
    dist: number;
    s0: number;
    s1: number;
    cobertura: number;
  }[] = [];

  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const A = faces[i];
      const B = faces[j];
      if (Math.abs(A.ux * B.ux + A.uy * B.uy) < cosLimite) continue;

      const dist = Math.abs(B.off - A.off);
      if (dist < espMinPt || dist > espMaxPt) continue;

      const s0 = Math.max(A.u0, B.u0);
      const s1 = Math.min(A.u1, B.u1);
      if (s1 - s0 < sobrepMinPt) continue;

      const menor = Math.min(A.u1 - A.u0, B.u1 - B.u0);
      candidatos.push({ i, j, dist, s0, s1, cobertura: menor > 0 ? (s1 - s0) / menor : 0 });
    }
  }

  // Melhor explicação primeiro. A DISTÂNCIA desempata porque duas paredes em
  // lados opostos de um corredor também são paralelas e se sobrepõem — o que
  // as separa do par verdadeiro é serem mais distantes.
  candidatos.sort((a, b) => b.cobertura - a.cobertura || a.dist - b.dist);

  const consumido: [number, number][][] = faces.map(() => []);
  const fracaoLivre = (k: number, s0: number, s1: number) => {
    const span = s1 - s0;
    if (span <= 0) return 0;
    const ocupado = consumido[k].reduce(
      (t, iv) => t + Math.max(0, Math.min(iv[1], s1) - Math.max(iv[0], s0)),
      0,
    );
    return 1 - ocupado / span;
  };

  const eixos: EixoDerivado[] = [];
  for (const c of candidatos) {
    // 60% livre nas DUAS faces: sem isso o mesmo pedaço de parede sairia duas
    // vezes, com espessuras diferentes.
    if (fracaoLivre(c.i, c.s0, c.s1) < 0.6 || fracaoLivre(c.j, c.s0, c.s1) < 0.6) continue;
    consumido[c.i].push([c.s0, c.s1]);
    consumido[c.j].push([c.s0, c.s1]);

    const A = faces[c.i];
    const offMedio = (A.off + faces[c.j].off) / 2;
    const pto = (u: number) => ({
      x: u * A.ux - offMedio * A.uy,
      y: u * A.uy + offMedio * A.ux,
    });

    eixos.push({
      a: pto(c.s0),
      b: pto(c.s1),
      espessuraPt: c.dist,
      comprimentoPt: c.s1 - c.s0,
      cobertura: c.cobertura,
    });
  }
  return eixos;
}

/** Pontos por polegada com que a planta de fundo foi rasterizada. */
export const DPI_DO_FUNDO = 150;

/**
 * A matriz do pdf.js que leva o espaço do PDF ao pixel do raster.
 *
 * `[a, b, c, d, e, f]`, aplicada como `px = a*x + c*y + e` e
 * `py = b*x + d*y + f` — a mesma convenção de `viewport.transform`.
 */
export type ParaPixel = [number, number, number, number, number, number];

/**
 * Ponto do PDF → milímetro do modelo.
 *
 * ─── POR QUE UMA MATRIZ, E NÃO UM ESPELHO DE Y ──────────────────────────────
 *
 * A primeira versão fazia `py = (alturaPagina - y) * dpi/72`, tratando a
 * conversão como uma inversão de Y. Funciona só para página sem rotação, e
 * ELA MESMA foi contradita pela prancha do usuário em 22/08/2026:
 *
 *     page.rotate = 270 · page.view = [0, 0, 2384, 3370]
 *     viewport 1x = 3370 × 2384   (girado)
 *     transform   = [0, -1, -1, 0, 3370, 2384]
 *
 * A MediaBox é RETRATO e o desenho é girado 270° para virar paisagem. Três
 * erros de uma vez: `x` e `y` estão trocados, os dois invertem, e a "altura"
 * que o espelho usava (2384, do viewport) não é a do eixo Y do espaço do PDF
 * (3370). O resultado: paredes geradas a dezenas de metros ACIMA da imagem, e
 * o recorte da tela — correto — não achava nenhuma. O painel dizia
 * "0 paredes na área visível" com a planta bem visível.
 *
 * A matriz do pdf.js já resolve rotação, deslocamento e inversão de uma vez.
 * Derivar a conta à mão é reimplementar, pior, o que a biblioteca entrega
 * pronto — e sem nenhum sinal quando erra.
 *
 * ⚠️ A rotação de página NÃO é exótica: quem plota A0 a partir de um template
 * retrato produz exatamente isso, e nenhum teste com página comum a encontra.
 */
export function ptParaModelo(
  underlay: Underlay,
  p: { x: number; y: number },
  paraPixel: ParaPixel,
): { x: number; y: number } {
  return pixelParaModelo(underlay, {
    px: paraPixel[0] * p.x + paraPixel[2] * p.y + paraPixel[4],
    py: paraPixel[1] * p.x + paraPixel[3] * p.y + paraPixel[5],
  });
}

/**
 * A matriz de uma página SEM rotação, para teste e para vetor antigo.
 *
 * É exatamente o que a versão defeituosa fazia — mantida com nome explícito
 * para que usá-la seja uma escolha visível, e não o padrão silencioso.
 */
export function paraPixelSemRotacao(alturaPaginaPt: number, dpi = DPI_DO_FUNDO): ParaPixel {
  const k = dpi / 72;
  return [k, 0, 0, -k, 0, alturaPaginaPt * k];
}

/** Milímetros reais por ponto de papel, deduzidos da aferição do fundo. */
export function mmPorPt(underlay: Underlay, dpi = DPI_DO_FUNDO): number {
  return underlay.mmPorPixel * (dpi / 72);
}

/** Arredonda para o milímetro inteiro que o kernel exige. */
const paraPonto = (p: { x: number; y: number }): Point =>
  ({ x: Math.round(p.x), y: Math.round(p.y) }) as Point;

/**
 * Encosta a espessura medida no CENTÍMETRO mais próximo.
 *
 * ─── POR QUE ARREDONDAR, SE O MILÍMETRO É MAIS PRECISO ──────────────────────
 *
 * Porque não é mais preciso — é falsamente preciso. Medido na prancha real, o
 * pareamento devolve 20,3 · 19,9 · 19,7 cm para paredes que são todas a MESMA
 * parede de 20 cm: a diferença é onde o CAD pousou o traço, não o projeto.
 *
 * Sem isto o modelo ganha uma dúzia de espessuras quase iguais, e o estrago não
 * é estético: espessura é dimensão de QUANTITATIVO. Um levantamento com 20,3 e
 * 19,7 cm produz duas linhas de orçamento para a mesma alvenaria, e quem
 * conferir vai procurar um erro que não existe.
 *
 * Centímetro e não 5 cm: parede de projeto é especificada em centímetro
 * (10, 12, 15, 20, 25), e um passo de 5 cm empurraria 12 para 10.
 */
export function espessuraDeConstrucao(mm: number): number {
  return Math.max(10, Math.round(mm / 10) * 10);
}

/**
 * Quantas vezes mais comprida que espessa uma parede precisa ser.
 *
 * ─── O QUE ESTE NÚMERO SEPARA ───────────────────────────────────────────────
 *
 * O TOPO da parede. Toda parede desenhada em planta termina numa face curta que
 * fecha o retângulo, e quando duas dessas se encontram — no fim de uma parede,
 * na quina de duas — elas são paralelas e distam uma espessura. O pareamento as
 * casa e devolve uma "parede" atravessada na ponta da parede de verdade, com o
 * comprimento igual à própria espessura.
 *
 * Foi o que o desenho mostrou: os cotocos não estavam espalhados, estavam
 * exatamente na ponta de cada parede, cruzados. Metade da contagem.
 *
 * ─── POR QUE ESBELTEZ, E NÃO COMPRIMENTO MÍNIMO ─────────────────────────────
 *
 * "Menor que 50 cm" é um número arbitrário que depende da escala e do porte da
 * obra. A razão comprimento/espessura não depende de nada: parede é comprida em
 * relação à espessura, topo de parede é quadrado. Um topo tem esbeltez ~1; uma
 * parede real, medida nesta prancha, tem mediana 4,3 e chega a 90.
 *
 * ─── O CUSTO, MEDIDO ────────────────────────────────────────────────────────
 *
 * Na folha inteira o corte descarta 109 de 259 eixos e perde **6,8 m de 381,5**
 * — 42% da contagem por 1,8% do comprimento. Numa planta isolada, 26 de 47 por
 * 2,6%. É a assinatura de quem está jogando fora ruído, não parede.
 *
 * ⚠️ Uma parede real curta (pilar, retorno de 30 cm) cai junto. É o preço, e é
 * barato: desenhar uma parede curta à mão custa dois cliques; achar 26 falsas
 * no meio de 47 custa a revisão inteira.
 */
export const ESBELTEZ_MINIMA = 2.5;

export interface ParedeGerada {
  a: Point;
  b: Point;
  espessuraMm: number;
  comprimentoMm: number;
}

/**
 * Até onde uma ponta pode ser esticada para encontrar a parede vizinha.
 *
 * ─── DE ONDE SAI ESTE NÚMERO ────────────────────────────────────────────────
 *
 * Medido na prancha real (`docs/spikes/prancha-real/autoqa.test.ts`). Cada
 * ponta solta foi comparada com a parede mais próxima:
 *
 *     PAV. 01 · mediana 15,2 cm · 29 das 42 pontas a menos de 30 cm
 *     PAV. 02 · 12 das 48 na faixa de 5 a 15 cm
 *
 * E os vãos de porta de verdade, no mesmo desenho, estão **acima de 60 cm**.
 * Há uma vala entre os dois grupos, e 30 cm cai dentro dela com folga dos dois
 * lados: pega o canto, não alcança a porta.
 *
 * ⚠️ É por isso que o limite é APERTADO. Esticar generosamente fecharia vão de
 * porta com parede — o erro que derrubou a rodada 3 do Spike C por outro
 * caminho, e que aqui seria pior, porque ninguém veria: a planta fecharia
 * bonito, com um cômodo a menos.
 */
export const MAX_MITRAGEM_MM = 300;

/**
 * Estica as pontas até encontrarem a parede vizinha.
 *
 * ─── POR QUE ISTO É NECESSÁRIO ──────────────────────────────────────────────
 *
 * O eixo derivado abrange só a SOBREPOSIÇÃO do par de faces, e num canto as
 * faces de uma parede são interrompidas pela outra — então o eixo para antes do
 * encontro. O resultado medido: 21 paredes com 42 pontas soltas. **Nenhuma
 * encostava em outra**, e por isso nenhum ambiente fechava.
 *
 * ─── AS DUAS TRAVAS ─────────────────────────────────────────────────────────
 *
 * 1. **Só ESTICA, nunca encolhe** (`t >= 0`): encurtar mudaria geometria que o
 *    pareamento derivou de traço real.
 * 2. **O encontro tem de cair no vão da outra parede**, com a folga da própria
 *    mitragem — senão duas paredes distantes que por acaso se cruzam quando
 *    prolongadas ao infinito seriam "encontradas".
 *
 * As duas paredes de um canto calculam o MESMO ponto de interseção, então
 * arredondar para milímetro inteiro devolve o mesmo vértice para as duas — é
 * isso que faz o grau do vértice virar 2 no kernel, em vez de duas pontas
 * soltas a 1 mm de distância.
 */
export function mitrarCantos(
  paredes: ParedeGerada[],
  maxMm = MAX_MITRAGEM_MM,
): ParedeGerada[] {
  const saida = paredes.map((p) => ({ ...p, a: { ...p.a } as Point, b: { ...p.b } as Point }));

  for (let i = 0; i < saida.length; i++) {
    for (const ponta of ['a', 'b'] as const) {
      const w = saida[i];
      const de = ponta === 'a' ? w.b : w.a;
      const para = ponta === 'a' ? w.a : w.b;
      const dx = para.x - de.x;
      const dy = para.y - de.y;
      const n = Math.hypot(dx, dy);
      if (n === 0) continue;
      const ux = dx / n;
      const uy = dy / n;

      let melhorT = Infinity;
      let alvo: { x: number; y: number } | null = null;

      for (let j = 0; j < saida.length; j++) {
        if (i === j) continue;
        const o = saida[j];
        const ox = o.b.x - o.a.x;
        const oy = o.b.y - o.a.y;
        const on = Math.hypot(ox, oy);
        if (on === 0) continue;

        // Interseção de duas retas. Quase paralelas não têm canto.
        const den = ux * oy - uy * ox;
        if (Math.abs(den) < 1e-9 * on) continue;

        const t = ((o.a.x - para.x) * oy - (o.a.y - para.y) * ox) / den;
        if (t < 0 || t > maxMm || t >= melhorT) continue;

        const px = para.x + ux * t;
        const py = para.y + uy * t;

        // O encontro precisa cair NO vão da outra parede — com a mesma folga
        // da mitragem, porque a outra também pode estar precisando esticar.
        const s = ((px - o.a.x) * ox + (py - o.a.y) * oy) / (on * on);
        const folga = maxMm / on;
        if (s < -folga || s > 1 + folga) continue;

        melhorT = t;
        alvo = { x: px, y: py };
      }

      if (alvo) {
        const novo = { x: Math.round(alvo.x), y: Math.round(alvo.y) } as Point;
        if (ponta === 'a') w.a = novo;
        else w.b = novo;
        w.comprimentoMm = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      }
    }
  }

  return saida;
}

/**
 * O caminho completo: segmentos do PDF → paredes em milímetro do modelo.
 *
 * `limites` recorta em espaço de MODELO, não de papel, porque é o que o usuário
 * vê: a região é o enquadramento da tela. Uma prancha tem ~23 desenhos, e gerar
 * de todos de uma vez devolveria um amontoado que ninguém consegue revisar.
 */
export function gerarParedes(
  segmentos: SegmentoVetor[],
  underlay: Underlay,
  paraPixel: ParaPixel,
  limites?: { x0: number; y0: number; x1: number; y1: number } | null,
  opcoes?: Partial<OpcoesPareamento> & { esbeltezMinima?: number; mitragemMm?: number },
): ParedeGerada[] {
  const esbeltezMinima = opcoes?.esbeltezMinima ?? ESBELTEZ_MINIMA;
  const mitragemMm = opcoes?.mitragemMm ?? MAX_MITRAGEM_MM;
  const escala = mmPorPt(underlay);
  const faces = juntarColineares(segmentos);
  const eixos = parearFaces(faces, { ...opcoes, mmPorPt: escala });

  const dentro = (p: { x: number; y: number }) =>
    !limites || (p.x >= limites.x0 && p.x <= limites.x1 && p.y >= limites.y0 && p.y <= limites.y1);

  const saida: ParedeGerada[] = [];
  for (const e of eixos) {
    const a = ptParaModelo(underlay, e.a, paraPixel);
    const b = ptParaModelo(underlay, e.b, paraPixel);
    // AMBAS as pontas dentro: uma parede metade dentro metade fora sairia
    // cortada no meio, e uma parede cortada é pior que uma parede ausente —
    // parece certa e mede errado.
    if (!dentro(a) || !dentro(b)) continue;

    const pa = paraPonto(a);
    const pb = paraPonto(b);
    const comprimentoMm = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    // O kernel recusa parede degenerada; filtrar aqui evita um lote inteiro
    // ser rejeitado por causa de uma sobra de 0 mm.
    if (comprimentoMm < 1) continue;

    const espessuraMm = espessuraDeConstrucao(e.espessuraPt * escala);
    // O TOPO da parede não é parede. Ver `ESBELTEZ_MINIMA`.
    if (comprimentoMm < esbeltezMinima * espessuraMm) continue;

    saida.push({ a: pa, b: pb, espessuraMm, comprimentoMm });
  }

  // A mitragem vem DEPOIS do recorte e do corte de esbeltez, e não antes: só
  // faz sentido encostar paredes que de fato vão existir. Esticar para um topo
  // que seria descartado logo em seguida deixaria a ponta apontando para o
  // vazio.
  return mitragemMm > 0 ? mitrarCantos(saida, mitragemMm) : saida;
}
