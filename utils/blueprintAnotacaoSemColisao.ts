/**
 * Onde escrever CADA texto da planta sem cobrir outro (22/10/2026, pedido com dois prints da
 * planta Garden, elétrica ligada: *"Veja a total confusão de sobreposicões de testos e
 * componentes."*).
 *
 * O canvas e a prancha escreviam cada texto elétrico a uma distância FIXA do próprio símbolo —
 * "Luz teto · C3" acima e à direita, a potência da tomada embaixo, o "N cond." ao lado do
 * círculo do trecho — sem olhar o vizinho. Num banheiro com luz, interruptor e três tomadas, os
 * textos caíam uns sobre os outros. `posicionarRotulos` (blueprintRotulosSemColisao) já evitava
 * colisão, mas só para as siglas hidráulicas, e sem lugar livre devolvia a 1ª posição — por cima.
 *
 * Aqui todos os textos entram JUNTOS, e a regra é:
 *  1. ordem de PRIORIDADE (menor primeiro: a pendência "?" escolhe antes da potência), e na
 *     mesma prioridade a ordem de entrada — estável, o desenho não "pula" entre quadros;
 *  2. posições COLADAS ao símbolo (as preferidas do chamador, depois as oito de sempre), livres
 *     de texto, de símbolo e de eletroduto;
 *  3. coladas cruzando só eletroduto (texto sobre o traço, com o fundo branco, ainda se lê — e
 *     perto do dono se lê melhor que longe);
 *  4. ANÉIS crescentes em volta do símbolo, primeiro livres de tudo, depois cruzando só
 *     eletroduto — e o texto afastado sai com LINHA DE CHAMADA até o símbolo (decisão do usuário,
 *     22/10: quando não cabe ao lado, chamada; nunca some);
 *  5. nada livre até o raio máximo: a posição de MENOR sobreposição (melhor esforço).
 *
 * Unidade livre: pixels de tela no canvas (y para baixo), milímetros de papel na prancha. Puro —
 * quem chama só desenha o que sai daqui.
 */
export interface CaixaNaTela {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PontoNaTela {
  x: number;
  y: number;
}

export interface AnotacaoAPosicionar {
  id: string;
  /** O símbolo dono do texto: o obstáculo com este id não conta (a âncora já conta). */
  donoId: string;
  largura: number;
  altura: number;
  /** A caixa do símbolo dono — o texto nunca a cobre, e a chamada chega nela. */
  ancora: CaixaNaTela;
  /** Menor escolhe primeiro. */
  prioridade: number;
  /** Cantos superiores esquerdos a tentar ANTES das oito posições de sempre (contam como coladas). */
  preferidas?: readonly PontoNaTela[];
}

export interface ObstaculoNaTela {
  id: string;
  caixa: CaixaNaTela;
}

/** Um traço (eletroduto, tubo) que o texto prefere não cruzar. */
export interface SegmentoNaTela {
  id: string;
  a: PontoNaTela;
  b: PontoNaTela;
}

/** O canto superior esquerdo do texto; `chamada` quando ele saiu de perto do símbolo. */
export interface AnotacaoPosicionada {
  id: string;
  x: number;
  y: number;
  chamada?: { de: PontoNaTela; ate: PontoNaTela };
}

export interface OpcoesDoPosicionamento {
  /** Folga entre o texto e o símbolo nas posições coladas (default 3). */
  folga?: number;
  /** Até onde os anéis vão, contado da borda da âncora (default 6 alturas do texto). */
  raioMaximo?: number;
  /** Passo entre anéis (default a altura do texto). */
  passo?: number;
  segmentos?: readonly SegmentoNaTela[];
}

const cruza = (a: CaixaNaTela, b: CaixaNaTela) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const areaComum = (a: CaixaNaTela, b: CaixaNaTela) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** O segmento passa pela caixa? (Liang–Barsky: recorta o parâmetro t ∈ [0, 1] pelos quatro lados.) */
function segmentoCruza(s: SegmentoNaTela, c: CaixaNaTela): boolean {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  let t0 = 0;
  let t1 = 1;
  const lados: [number, number][] = [
    [-dx, s.a.x - c.x0],
    [dx, c.x1 - s.a.x],
    [-dy, s.a.y - c.y0],
    [dy, c.y1 - s.a.y],
  ];
  for (const [p, q] of lados) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 < t1;
}

/** Grade espacial: cada item entra nas células que a caixa dele toca. */
class Grade<T> {
  private celulas = new Map<string, T[]>();
  constructor(private lado: number) {}
  private faixa(c: CaixaNaTela) {
    const l = this.lado;
    return { i0: Math.floor(c.x0 / l), i1: Math.floor(c.x1 / l), j0: Math.floor(c.y0 / l), j1: Math.floor(c.y1 / l) };
  }
  inserir(c: CaixaNaTela, item: T) {
    const { i0, i1, j0, j1 } = this.faixa(c);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = `${i},${j}`;
        const lista = this.celulas.get(k);
        if (lista) lista.push(item);
        else this.celulas.set(k, [item]);
      }
  }
  perto(c: CaixaNaTela): Set<T> {
    const { i0, i1, j0, j1 } = this.faixa(c);
    const saida = new Set<T>();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const item of this.celulas.get(`${i},${j}`) ?? []) saida.add(item);
    return saida;
  }
}

/** As oito posições coladas, na ordem de sempre (a mesma de `posicionarRotulos`). */
function coladas(anc: CaixaNaTela, w: number, h: number, folga: number): PontoNaTela[] {
  const { x0, y0, x1, y1 } = anc;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [
    { x: x1 + folga, y: y0 - h }, // acima, à direita
    { x: x0 - folga - w, y: y0 - h }, // acima, à esquerda
    { x: x1 + folga, y: y1 }, // abaixo, à direita
    { x: x0 - folga - w, y: y1 }, // abaixo, à esquerda
    { x: cx - w / 2, y: y0 - h - folga }, // acima, no meio
    { x: cx - w / 2, y: y1 + folga }, // abaixo, no meio
    { x: x1 + folga, y: cy - h / 2 }, // à direita, no meio
    { x: x0 - folga - w, y: cy - h / 2 }, // à esquerda, no meio
  ];
}

/**
 * Um anel: dezesseis direções a partir do centro da âncora, e em cada uma o texto encosta na
 * âncora alargada de `d` — a distância entre as duas caixas é `d` no eixo que manda.
 */
function anel(anc: CaixaNaTela, w: number, h: number, d: number): PontoNaTela[] {
  const cx = (anc.x0 + anc.x1) / 2;
  const cy = (anc.y0 + anc.y1) / 2;
  const mx = (anc.x1 - anc.x0) / 2 + w / 2 + d;
  const my = (anc.y1 - anc.y0) / 2 + h / 2 + d;
  const saida: PontoNaTela[] = [];
  for (let k = 0; k < 16; k++) {
    // Começa em cima (−90°) e gira no sentido horário — o "acima" vence os empates.
    const ang = -Math.PI / 2 + (k * Math.PI) / 8;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const t = Math.min(Math.abs(c) > 1e-9 ? mx / Math.abs(c) : Infinity, Math.abs(s) > 1e-9 ? my / Math.abs(s) : Infinity);
    saida.push({ x: cx + c * t - w / 2, y: cy + s * t - h / 2 });
  }
  return saida;
}

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** A chamada: do ponto do texto mais perto do centro do símbolo até a borda do símbolo. */
function chamada(texto: CaixaNaTela, anc: CaixaNaTela): { de: PontoNaTela; ate: PontoNaTela } {
  const cx = (anc.x0 + anc.x1) / 2;
  const cy = (anc.y0 + anc.y1) / 2;
  const de = { x: limitar(cx, texto.x0, texto.x1), y: limitar(cy, texto.y0, texto.y1) };
  return { de, ate: { x: limitar(de.x, anc.x0, anc.x1), y: limitar(de.y, anc.y0, anc.y1) } };
}

type Item = { tipo: 'texto'; caixa: CaixaNaTela } | { tipo: 'simbolo'; id: string; caixa: CaixaNaTela } | { tipo: 'segmento'; seg: SegmentoNaTela };

/**
 * Posiciona as anotações (ver o cabeçalho). A saída vem na ORDEM DE ENTRADA, uma por anotação.
 * `obstaculos` são as caixas dos símbolos (com o id do dono, para o texto não fugir do próprio).
 */
export function posicionarAnotacoes(
  anotacoes: readonly AnotacaoAPosicionar[],
  obstaculos: readonly ObstaculoNaTela[],
  opcoes: OpcoesDoPosicionamento = {},
): AnotacaoPosicionada[] {
  if (anotacoes.length === 0) return [];
  const folga = opcoes.folga ?? 3;
  const alturas = anotacoes.map((a) => a.altura).sort((x, y) => x - y);
  const mediana = alturas[Math.floor(alturas.length / 2)] || 1;
  const grade = new Grade<Item>(Math.max(mediana * 4, 1e-6));
  for (const o of obstaculos) grade.inserir(o.caixa, { tipo: 'simbolo', id: o.id, caixa: o.caixa });
  for (const s of opcoes.segmentos ?? []) {
    const c = { x0: Math.min(s.a.x, s.b.x), y0: Math.min(s.a.y, s.b.y), x1: Math.max(s.a.x, s.b.x), y1: Math.max(s.a.y, s.b.y) };
    grade.inserir(c, { tipo: 'segmento', seg: s });
  }

  const ordem = anotacoes.map((a, i) => ({ a, i })).sort((p, q) => p.a.prioridade - q.a.prioridade || p.i - q.i);
  const saida = new Array<AnotacaoPosicionada>(anotacoes.length);

  for (const { a, i } of ordem) {
    const w = a.largura;
    const h = a.altura;
    const caixaEm = (p: PontoNaTela): CaixaNaTela => ({ x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h });
    /** 0 = livre de tudo; 1 = cruza só eletroduto; 2 = cobre texto/símbolo (com a área coberta). */
    const avaliar = (c: CaixaNaTela): { nivel: 0 | 1 | 2; area: number } => {
      if (cruza(c, a.ancora)) return { nivel: 2, area: areaComum(c, a.ancora) };
      let area = 0;
      let segmento = false;
      for (const it of grade.perto(c)) {
        if (it.tipo === 'segmento') {
          if (!segmento && segmentoCruza(it.seg, c)) segmento = true;
        } else if (it.tipo === 'simbolo' && it.id === a.donoId) {
          continue;
        } else if (cruza(c, it.caixa)) {
          area += areaComum(c, it.caixa);
        }
      }
      if (area > 0) return { nivel: 2, area };
      return { nivel: segmento ? 1 : 0, area: 0 };
    };

    const perto = [...(a.preferidas ?? []), ...coladas(a.ancora, w, h, folga)];
    const raioMaximo = opcoes.raioMaximo ?? 6 * h;
    const passo = Math.max(opcoes.passo ?? h, 1e-6);
    const longe: PontoNaTela[] = [];
    for (let d = passo; d <= raioMaximo + 1e-9; d += passo) longe.push(...anel(a.ancora, w, h, d));

    const avPerto = perto.map((p) => ({ p, ...avaliar(caixaEm(p)) }));
    let escolha: { p: PontoNaTela; longe: boolean } | null = null;
    const achar = (lista: { p: PontoNaTela; nivel: number }[], nivel: number) => lista.find((x) => x.nivel === nivel)?.p ?? null;
    let p = achar(avPerto, 0) ?? achar(avPerto, 1);
    if (p) escolha = { p, longe: false };
    else {
      const avLonge = longe.map((q) => ({ p: q, ...avaliar(caixaEm(q)) }));
      p = achar(avLonge, 0) ?? achar(avLonge, 1);
      if (p) escolha = { p, longe: true };
      else {
        // Melhor esforço: a menor área coberta; no empate, a primeira (a de sempre).
        let melhor = { p: avPerto[0].p, area: avPerto[0].area, longe: false };
        for (const x of avPerto) if (x.area < melhor.area - 1e-6) melhor = { p: x.p, area: x.area, longe: false };
        for (const x of avLonge) if (x.area < melhor.area - 1e-6) melhor = { p: x.p, area: x.area, longe: true };
        escolha = { p: melhor.p, longe: melhor.longe };
      }
    }

    const c = caixaEm(escolha.p);
    grade.inserir(c, { tipo: 'texto', caixa: c });
    if (escolha.longe) {
      const ch = chamada(c, a.ancora);
      // A chamada vira traço para os próximos: preferem não cruzá-la, como a um eletroduto.
      const caixaDaChamada = { x0: Math.min(ch.de.x, ch.ate.x), y0: Math.min(ch.de.y, ch.ate.y), x1: Math.max(ch.de.x, ch.ate.x), y1: Math.max(ch.de.y, ch.ate.y) };
      grade.inserir(caixaDaChamada, { tipo: 'segmento', seg: { id: `chamada:${a.id}`, a: ch.de, b: ch.ate } });
      saida[i] = { id: a.id, x: escolha.p.x, y: escolha.p.y, chamada: ch };
    } else {
      saida[i] = { id: a.id, x: escolha.p.x, y: escolha.p.y };
    }
  }
  return saida;
}
