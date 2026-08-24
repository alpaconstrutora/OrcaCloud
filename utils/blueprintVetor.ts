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

    // ⚠️ A direção do eixo é a MÉDIA das duas faces, não a de uma delas.
    //
    // A versão anterior usava `faces[c.i]` — a face de índice menor —, o que
    // fazia o ângulo do eixo depender da ORDEM em que as faces entraram na
    // lista, que é arbitrária. Com tolerância de paralelismo de 2°, o eixo
    // podia nascer até 2° torto por sorteio.
    //
    // Medido no `ALLAN.pdf`: 71 das 133 faces do grupo de parede já estão fora
    // do ortogonal no arquivo (11 delas por mais de 3°). Num desenho assim, de
    // qual das duas se herda o ângulo deixa de ser detalhe. A média não
    // conserta o desenho — nada aqui conserta —, mas para de escolher entre as
    // duas por acidente.
    const A = faces[c.i];
    const B = faces[c.j];
    // O sinal de B pode estar invertido em relação a A (as duas direções são
    // canônicas, mas em faces quase verticais a emenda de ±90° separa as
    // duas). Somar sem alinhar devolveria a bissetriz errada.
    const mesmoSentido = A.ux * B.ux + A.uy * B.uy >= 0;
    const bx = mesmoSentido ? B.ux : -B.ux;
    const by = mesmoSentido ? B.uy : -B.uy;
    const mx = (A.ux + bx) / 2;
    const my = (A.uy + by) / 2;
    const mn = Math.hypot(mx, my) || 1;
    const ux = mx / mn;
    const uy = my / mn;

    const offMedio = (A.off + B.off) / 2;
    const pto = (u: number) => ({
      x: u * ux - offMedio * uy,
      y: u * uy + offMedio * ux,
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

// ─────────────────────────────────────────────────────────────────────────────
// PORTA PELO ARCO DE GIRO
//
// O símbolo de porta em planta é sempre o mesmo desenho: a dobradiça fica sobre
// a parede, a folha sai perpendicular, e um ARCO varre da ponta da folha até a
// outra ombreira. Logo — e é isto que torna o método exato, não heurístico:
//
//   centro do arco = DOBRADIÇA        raio do arco = LARGURA DO VÃO
//
// O Spike C (rodada 5) mediu numa prancha A0 real: das 129 curvas de uma
// região, 122 têm raio abaixo de 200 mm (cantos, símbolos, contorno de letra) e
// 5 têm raio de 730/832 mm — largura de folha. **Zero falso positivo.**
//
// ⚠️ O arco foi ENGAVETADO naquele spike, e importa saber por quê para não
// reabrir a discussão errada: ele não ajudava a DERIVAR AMBIENTE, porque fechar
// 5 portas não adianta quando janela e vão sem folha continuam abertos — basta
// UMA abertura para o preenchimento escapar. Para POSICIONAR UMA PORTA o
// critério é outro: um detector com zero falso positivo é exatamente o que se
// quer, e o que ele não detecta apenas continua sendo feito à mão.
// ─────────────────────────────────────────────────────────────────────────────

/** Uma Bézier cúbica crua do PDF, em pt. É como a curva sai do `constructPath`. */
export interface ArcoBezier {
  ini: { x: number; y: number };
  c1: { x: number; y: number };
  c2: { x: number; y: number };
  fim: { x: number; y: number };
}

/** Faixa de largura de folha que caracteriza porta. Medido: 730 e 832 mm. */
export const RAIO_PORTA_MIN_MM = 550;
export const RAIO_PORTA_MAX_MM = 1700;

/**
 * Quão longe da FACE da parede a dobradiça pode cair e ainda ser dela.
 *
 * ⚠️ Da FACE, não do eixo — e a diferença foi medida, não suposta. Na prancha
 * A0 real os cinco arcos de porta da PAV.01 têm a dobradiça a 184, 189, 205,
 * 544 e 873 mm do EIXO da parede gerada. Contra o eixo, um limite que pegasse
 * os três primeiros teria de ser 205 mm, e um número desses só vale para
 * paredes de 20 cm: numa parede de 10 cm ele alcançaria a parede vizinha de um
 * corredor. Descontando a meia espessura, os mesmos três caem para 84, 89 e
 * 105 mm — e o limite passa a significar algo que independe da espessura.
 *
 * Os outros dois (544 e 873 mm) não são erro de tolerância: são portas cuja
 * parede hospedeira não chegou a ser gerada. Afrouxar para alcançá-los seria
 * pendurar a porta numa parede que não é a dela.
 */
const FOLGA_DOBRADICA_MM = 150;

/**
 * O quanto a ponta do arco precisa acompanhar o eixo da parede para ser a
 * OMBREIRA. `cos 37°` — folgado o bastante para o arco que não fecha 90° certos,
 * apertado o bastante para nunca confundir a ombreira com a ponta da folha, que
 * é perpendicular (alinhamento ~0).
 */
const ALINHAMENTO_MINIMO = 0.8;

/**
 * Círculo que passa pela Bézier — centro e raio, em pt.
 *
 * Uso a relação corda/flecha para o raio, e a mediatriz da corda para a direção
 * do centro. Depois CONFIRO que as duas pontas distam R do centro encontrado —
 * e é essa conferência que descarta a curva que não é arco de círculo (letra,
 * spline de mobiliário): ela devolve `null` em vez de um centro inventado.
 */
export function circuloDoArco(
  a: ArcoBezier,
): { centro: { x: number; y: number }; raioPt: number } | null {
  const corda = Math.hypot(a.fim.x - a.ini.x, a.fim.y - a.ini.y);
  if (corda < 1e-6) return null;

  // Ponto do meio da Bézier (t = 0,5), pela forma de Bernstein.
  const meio = {
    x: (a.ini.x + 3 * a.c1.x + 3 * a.c2.x + a.fim.x) / 8,
    y: (a.ini.y + 3 * a.c1.y + 3 * a.c2.y + a.fim.y) / 8,
  };
  const mx = (a.ini.x + a.fim.x) / 2;
  const my = (a.ini.y + a.fim.y) / 2;
  const flecha = Math.hypot(meio.x - mx, meio.y - my);
  if (flecha < 1e-6) return null; // reta disfarçada de curva

  // R = (c²/4 + f²) / (2f)
  const raioPt = (corda * corda) / (8 * flecha) + flecha / 2;
  if (!Number.isFinite(raioPt) || raioPt <= 0) return null;

  // O centro fica na mediatriz da corda, do lado OPOSTO ao arco, à distância
  // (R − f) do meio da corda.
  const dx = meio.x - mx;
  const dy = meio.y - my;
  const n = Math.hypot(dx, dy);
  if (n < 1e-9) return null;
  const centro = {
    x: mx - (dx / n) * (raioPt - flecha),
    y: my - (dy / n) * (raioPt - flecha),
  };

  // As duas pontas têm de distar R do centro. Sem isto, qualquer curva vira
  // "arco" e o detector perde exatamente o que o torna confiável.
  const rIni = Math.hypot(a.ini.x - centro.x, a.ini.y - centro.y);
  const rFim = Math.hypot(a.fim.x - centro.x, a.fim.y - centro.y);
  const tol = Math.max(0.02 * raioPt, 1e-6);
  if (Math.abs(rIni - raioPt) > tol || Math.abs(rFim - raioPt) > tol) return null;

  return { centro, raioPt };
}

/** Uma porta derivada do arco, já pronta para virar `AddOpening`. */
export interface PortaGerada {
  wallId: string;
  offsetMm: number;
  widthMm: number;
  /** A dobradiça está na ponta `a` da parede? Decide para que lado a folha gira. */
  hingeAtStart: boolean;
}

/** A parede como o gerador precisa dela: um eixo com identidade. */
export interface ParedeAlvo {
  id: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  /**
   * Espessura, para medir a dobradiça até a FACE e não até o eixo. Ausente
   * conta como zero — a face vira o eixo, que é o comportamento conservador.
   */
  espessuraMm?: number;
}

/**
 * Portas a partir dos arcos, casadas com as paredes que as hospedam.
 *
 * Devolve só o que casou. Um arco cuja dobradiça não cai sobre nenhuma parede é
 * descartado em silêncio, porque a alternativa — inventar a parede que falta —
 * é o tipo de resultado plausível e errado que este módulo já aprendeu a
 * recusar (ver a recusa por falta de aferição, em `PainelGerarParedes`).
 */
export function gerarPortas(
  arcos: ArcoBezier[],
  paredes: ParedeAlvo[],
  underlay: Underlay,
  paraPixel: ParaPixel,
  limites?: { x0: number; y0: number; x1: number; y1: number } | null,
): PortaGerada[] {
  const escala = mmPorPt(underlay);
  const saida: PortaGerada[] = [];

  for (const arco of arcos) {
    const circulo = circuloDoArco(arco);
    if (!circulo) continue;

    // O RAIO é a largura do vão — é a medida que decide se isto é porta.
    const larguraMm = circulo.raioPt * escala;
    if (larguraMm < RAIO_PORTA_MIN_MM || larguraMm > RAIO_PORTA_MAX_MM) continue;

    const dobradica = ptParaModelo(underlay, circulo.centro, paraPixel);
    if (
      limites &&
      (dobradica.x < limites.x0 ||
        dobradica.x > limites.x1 ||
        dobradica.y < limites.y0 ||
        dobradica.y > limites.y1)
    ) {
      continue;
    }

    // As duas pontas do arco: uma é a ombreira oposta (sobre a parede), a outra
    // é a ponta da folha (perpendicular).
    const pontas = [
      ptParaModelo(underlay, arco.ini, paraPixel),
      ptParaModelo(underlay, arco.fim, paraPixel),
    ];

    // A parede hospedeira é aquela cujo EIXO passa mais perto da dobradiça.
    let melhor: { parede: ParedeAlvo; t: number; comprimento: number; dist: number } | null = null;
    for (const p of paredes) {
      const vx = p.b.x - p.a.x;
      const vy = p.b.y - p.a.y;
      const comprimento = Math.hypot(vx, vy);
      if (comprimento < 1) continue;
      // Projeção presa ao TRECHO: a porta tem de estar na parede, não no
      // prolongamento imaginário dela.
      const t = Math.max(
        0,
        Math.min(
          comprimento,
          ((dobradica.x - p.a.x) * vx + (dobradica.y - p.a.y) * vy) / comprimento,
        ),
      );
      const proj = { x: p.a.x + (vx / comprimento) * t, y: p.a.y + (vy / comprimento) * t };
      // Até a FACE: a dobradiça é desenhada na face da parede, não na linha do
      // meio. Sem descontar a meia espessura, o limite teria de crescer junto
      // com a parede — ver `FOLGA_DOBRADICA_MM`.
      const dist = Math.max(
        0,
        Math.hypot(dobradica.x - proj.x, dobradica.y - proj.y) - (p.espessuraMm ?? 0) / 2,
      );
      if (dist > FOLGA_DOBRADICA_MM) continue;
      if (!melhor || dist < melhor.dist) melhor = { parede: p, t, comprimento, dist };
    }
    if (!melhor) continue;

    const { parede, t: tDobradica, comprimento } = melhor;
    const ux = (parede.b.x - parede.a.x) / comprimento;
    const uy = (parede.b.y - parede.a.y) / comprimento;

    // Qual ponta do arco é a OMBREIRA: a que se alinha ao eixo da parede. A
    // outra é a ponta da folha, e usá-la daria um vão atravessado na parede.
    let ombreira: { x: number; y: number } | null = null;
    let melhorAlinhamento = 0;
    for (const ponta of pontas) {
      const dx = ponta.x - dobradica.x;
      const dy = ponta.y - dobradica.y;
      const n = Math.hypot(dx, dy);
      if (n < 1) continue;
      const alinhamento = Math.abs((dx / n) * ux + (dy / n) * uy);
      if (alinhamento > melhorAlinhamento) {
        melhorAlinhamento = alinhamento;
        ombreira = ponta;
      }
    }
    if (!ombreira || melhorAlinhamento < ALINHAMENTO_MINIMO) continue;

    const tOmbreira = Math.max(
      0,
      Math.min(comprimento, (ombreira.x - parede.a.x) * ux + (ombreira.y - parede.a.y) * uy),
    );

    const offsetMm = Math.round(Math.min(tDobradica, tOmbreira));
    const widthMm = Math.round(Math.abs(tOmbreira - tDobradica));
    // Prender a projeção ao trecho pode ter encolhido o vão. Um vão que não
    // cabe seria recusado pelo kernel e derrubaria o LOTE inteiro — e o lote é
    // um passo só de desfazer.
    if (widthMm < RAIO_PORTA_MIN_MM || offsetMm + widthMm > Math.round(comprimento)) continue;

    saida.push({
      wallId: parede.id,
      offsetMm,
      widthMm,
      hingeAtStart: tDobradica <= tOmbreira,
    });
  }

  return saida;
}
