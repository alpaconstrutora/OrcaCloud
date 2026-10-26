/**
 * O ELETRODUTO FLEXÍVEL NO 3D — curva contínua, sem corte (25/10/2026).
 *
 * O pedido, com print do 3D da Garden: *"o conduite e flexivel e nao deve fazer curva em 90 graus (veja Print). refaça
 * com curva continuada e sem corte"*.
 *
 * O 3D desenhava cada pedaço reto de cada trecho como um cilindro: o "L" do trecho (sobe na parede, corre no forro) e a
 * emenda de um trecho com o seguinte saíam em canto vivo, com o corte do cilindro à mostra. Aqui o caminho que o 3D
 * desenha, em mm do mundo ([x, y, z], z = elevação do pavimento + cota):
 *
 *   1. os trechos que se emendam num nó SEM caixa formam uma LINHA só (o eletroduto corre de caixa a caixa); onde vários
 *      correm juntos (os repetidos de `desdobrarDerivacoes`), cada um segue o que tem os mesmos circuitos;
 *   2. os que correm juntos saem LADO A LADO, em faixas paralelas (o feixe que sai do quadro);
 *   3. cada canto vira CURVA tangente às duas retas, começando a até `6 × Ø` do canto (nunca mais que 45 % do pedaço
 *      menor);
 *   4. cada trecho recebe a SUA parte da linha — continua selecionável sozinho, e as partes se encontram no mesmo ponto,
 *      na mesma direção (sem corte na emenda).
 *
 * Só desenho: o modelo, o quantitativo e o IFC seguem com os trechos retos.
 */

export type P3 = [number, number, number];

export interface TrechoDoTubo {
  id: string;
  levelId: string;
  /** As pontas ORIGINAIS do trecho (a identidade do nó: caixa, emenda). */
  a: { x: number; y: number };
  b: { x: number; y: number };
  cotaAMm: number;
  cotaBMm: number;
  bitolaMm: number;
  circuitoIds?: readonly string[] | null;
  /** Os pedaços retos como o 3D os desenha (já embutidos na parede), de `a` para `b`, em mm do modelo (x, y, cota). */
  segmentos: readonly { a: { x: number; y: number }; b: { x: number; y: number }; cotaAMm: number; cotaBMm: number }[];
  /** A elevação do pavimento, mm. */
  elevacaoMm: number;
}

/** A curva começa a até isto × o diâmetro do canto (o raio de curvatura do eletroduto corrugado). */
export const CURVA_EM_DIAMETROS = 6;
/** Fração máxima de cada pedaço que a curva pode tomar (sobra reta entre duas curvas seguidas). */
const FRACAO_MAXIMA_DA_CURVA = 0.45;
/** Pontos de cada curva. */
const PASSOS_DA_CURVA = 8;
/** O vão entre dois eletrodutos lado a lado, mm (além dos diâmetros). */
export const VAO_ENTRE_ELETRODUTOS_MM = 10;

const chaveDoNo = (levelId: string, x: number, y: number, cota: number) => `${levelId}|${x},${y},${cota}`;
const sub = (p: P3, q: P3): P3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const soma = (p: P3, q: P3): P3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const vezes = (p: P3, k: number): P3 => [p[0] * k, p[1] * k, p[2] * k];
const norma = (p: P3) => Math.hypot(p[0], p[1], p[2]);
const unit = (p: P3): P3 => {
  const n = norma(p);
  return n > 0 ? vezes(p, 1 / n) : [0, 0, 0];
};
const igual = (p: P3, q: P3) => Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5 && Math.abs(p[2] - q[2]) < 0.5;

/** A linha de pontos do trecho, de `a` para `b`, em mm do mundo. */
function linhaDoTrecho(t: TrechoDoTubo): P3[] {
  const pts: P3[] = [];
  for (const s of t.segmentos) {
    const a: P3 = [s.a.x, s.a.y, t.elevacaoMm + s.cotaAMm];
    const b: P3 = [s.b.x, s.b.y, t.elevacaoMm + s.cotaBMm];
    if (pts.length === 0 || !igual(pts[pts.length - 1], a)) pts.push(a);
    if (!igual(pts[pts.length - 1], b)) pts.push(b);
  }
  return pts;
}

interface Ponta {
  trecho: number;
  lado: 'a' | 'b';
}

/**
 * O caminho de cada eletroduto no 3D: por trecho, os pontos (mm do mundo) da parte dele na linha curva.
 * `ehCaixa(levelId, x, y, cota)`: há caixa nesse nó (ponto, quadro) — ali a linha termina.
 */
export function caminhosDosEletrodutos(
  trechos: readonly TrechoDoTubo[],
  ehCaixa: (levelId: string, x: number, y: number, cotaMm: number) => boolean,
): Map<string, P3[]> {
  const linhas = trechos.map(linhaDoTrecho);
  const circ = (i: number) => [...(trechos[i].circuitoIds ?? [])].sort().join('+');
  const vertical = (i: number) => trechos[i].a.x === trechos[i].b.x && trechos[i].a.y === trechos[i].b.y;

  // ── 1. As emendas: em cada nó sem caixa, quem continua em quem ─────────────
  const pontasNoNo = new Map<string, Ponta[]>();
  trechos.forEach((t, i) => {
    for (const lado of ['a', 'b'] as const) {
      const p = lado === 'a' ? t.a : t.b;
      const k = chaveDoNo(t.levelId, p.x, p.y, lado === 'a' ? t.cotaAMm : t.cotaBMm);
      pontasNoNo.set(k, [...(pontasNoNo.get(k) ?? []), { trecho: i, lado }]);
    }
  });
  const par = new Map<string, Ponta>(); // `${trecho}:${lado}` → a ponta que continua
  const id = (p: Ponta) => `${p.trecho}:${p.lado}`;
  for (const [k, pontas] of pontasNoNo) {
    const [levelId, xy] = k.split('|');
    const [x, y, cota] = xy.split(',').map(Number);
    if (ehCaixa(levelId, x, y, cota)) continue;
    const casar = (u: Ponta, v: Ponta) => {
      par.set(id(u), v);
      par.set(id(v), u);
    };
    if (pontas.length === 2) {
      casar(pontas[0], pontas[1]);
      continue;
    }
    // Vários juntos: casa quem tem os mesmos circuitos — de preferência um vertical com um que não é.
    const grupos = new Map<string, Ponta[]>();
    for (const p of pontas) grupos.set(circ(p.trecho), [...(grupos.get(circ(p.trecho)) ?? []), p]);
    for (const g of grupos.values()) {
      const livres = [...g];
      while (livres.length >= 2) {
        const u = livres.shift()!;
        const j = livres.findIndex((v) => vertical(v.trecho) !== vertical(u.trecho));
        casar(u, livres.splice(j >= 0 ? j : 0, 1)[0]);
      }
    }
  }

  // ── 2. As linhas contínuas: de ponta solta (ou caixa) a ponta solta ────────
  interface Linha {
    pontos: P3[];
    /** Por trecho da linha: o índice do ponto onde ele começa e onde termina. */
    partes: { trecho: number; de: number; ate: number }[];
  }
  const usado = new Set<number>();
  const cadeias: Linha[] = [];
  const andar = (inicio: Ponta) => {
    const linha: Linha = { pontos: [], partes: [] };
    let atual: Ponta | undefined = inicio;
    while (atual && !usado.has(atual.trecho)) {
      usado.add(atual.trecho);
      const l = atual.lado === 'a' ? linhas[atual.trecho] : [...linhas[atual.trecho]].reverse();
      const de = linha.pontos.length === 0 ? 0 : linha.pontos.length - 1;
      for (const p of l) if (linha.pontos.length === 0 || !igual(linha.pontos[linha.pontos.length - 1], p)) linha.pontos.push(p);
      linha.partes.push({ trecho: atual.trecho, de, ate: linha.pontos.length - 1 });
      const saida: Ponta = { trecho: atual.trecho, lado: atual.lado === 'a' ? 'b' : 'a' };
      atual = par.get(id(saida));
    }
    if (linha.pontos.length >= 2) cadeias.push(linha);
  };
  // Começa pelas pontas sem par (caixas, pontas soltas); o que sobra é anel — começa em qualquer um.
  trechos.forEach((_, i) => {
    for (const lado of ['a', 'b'] as const) if (!usado.has(i) && !par.has(`${i}:${lado}`)) andar({ trecho: i, lado });
  });
  trechos.forEach((_, i) => {
    if (!usado.has(i)) andar({ trecho: i, lado: 'a' });
  });

  // ── 3. Lado a lado: os pedaços que coincidem (mesmas pontas) ganham faixas ──
  const chaveDoPedaco = (p: P3, q: P3) => {
    const r = (v: P3) => v.map((c) => Math.round(c)).join(',');
    return [r(p), r(q)].sort().join('~');
  };
  const doPedaco = new Map<string, { cadeia: number; k: number; trecho: number }[]>();
  cadeias.forEach((c, ci) => {
    for (let k = 0; k + 1 < c.pontos.length; k++) {
      const parte = c.partes.find((pt) => k >= pt.de && k < pt.ate) ?? c.partes[c.partes.length - 1];
      const ch = chaveDoPedaco(c.pontos[k], c.pontos[k + 1]);
      doPedaco.set(ch, [...(doPedaco.get(ch) ?? []), { cadeia: ci, k, trecho: parte.trecho }]);
    }
  });
  /** O lado (em planta) de um pedaço horizontal — o mesmo qualquer que seja o sentido em que a linha o percorre. */
  const ladoDe = (p: P3, q: P3): P3 | null => {
    const [u, v] = [p, q].sort((m, n) => m[0] - n[0] || m[1] - n[1] || m[2] - n[2]);
    const d = unit([v[0] - u[0], v[1] - u[1], 0]);
    if (norma(d) === 0) return null;
    return [-d[1], d[0], 0];
  };
  const deslocamentos = cadeias.map((c, ci) => {
    const n = c.pontos.length - 1;
    const desloc: P3[] = [];
    for (let k = 0; k < n; k++) {
      const ch = chaveDoPedaco(c.pontos[k], c.pontos[k + 1]);
      const juntos = doPedaco.get(ch) ?? [];
      if (juntos.length < 2) {
        desloc.push([0, 0, 0]);
        continue;
      }
      const ordem = [...juntos].sort((u, v) => circ(u.trecho).localeCompare(circ(v.trecho)) || trechos[u.trecho].id.localeCompare(trechos[v.trecho].id));
      const idx = ordem.findIndex((j) => j.cadeia === ci && j.k === k);
      const vao = Math.max(...juntos.map((j) => trechos[j.trecho].bitolaMm)) + VAO_ENTRE_ELETRODUTOS_MM;
      // O lado: o do pedaço, se é horizontal; senão o do horizontal mais perto na mesma linha.
      let lado = ladoDe(c.pontos[k], c.pontos[k + 1]);
      for (let d = 1; !lado && d < n; d++) {
        for (const j of [k - d, k + d]) if (!lado && j >= 0 && j < n) lado = ladoDe(c.pontos[j], c.pontos[j + 1]);
      }
      desloc.push(vezes(lado ?? [1, 0, 0], (idx - (juntos.length - 1) / 2) * vao));
    }
    return desloc;
  });
  const deslocadas = cadeias.map((c, ci) =>
    c.pontos.map((p, k) => {
      const antes = k > 0 ? deslocamentos[ci][k - 1] : null;
      const depois = k < c.pontos.length - 1 ? deslocamentos[ci][k] : null;
      const d = antes && depois ? vezes(soma(antes, depois), 0.5) : (antes ?? depois ?? [0, 0, 0]);
      return soma(p, d);
    }),
  );

  // ── 4. Os cantos viram curva; 5. cada trecho recebe a sua parte ───────────
  const saida = new Map<string, P3[]>();
  cadeias.forEach((c, ci) => {
    const pts = deslocadas[ci];
    const raioDe = (k: number) => {
      const parte = c.partes.find((pt) => k >= pt.de && k <= pt.ate) ?? c.partes[0];
      return CURVA_EM_DIAMETROS * trechos[parte.trecho].bitolaMm;
    };
    const curva: P3[] = [];
    /** Onde cada ponto da linha ficou na curva (o canto: o meio do arco). */
    const naCurva: number[] = [];
    pts.forEach((p, k) => {
      if (k === 0 || k === pts.length - 1) {
        naCurva.push(curva.length);
        curva.push(p);
        return;
      }
      const entra = sub(p, pts[k - 1]);
      const sai = sub(pts[k + 1], p);
      const u = unit(entra);
      const v = unit(sai);
      const cos = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      if (cos > 0.9995) {
        naCurva.push(curva.length);
        curva.push(p);
        return;
      }
      const d = Math.min(raioDe(k), FRACAO_MAXIMA_DA_CURVA * norma(entra), FRACAO_MAXIMA_DA_CURVA * norma(sai));
      const ini = soma(p, vezes(u, -d));
      const fim = soma(p, vezes(v, d));
      for (let s = 0; s <= PASSOS_DA_CURVA; s++) {
        const t = s / PASSOS_DA_CURVA;
        // Bézier quadrática com o controle no canto: tangente às duas retas.
        const q = soma(soma(vezes(ini, (1 - t) * (1 - t)), vezes(p, 2 * (1 - t) * t)), vezes(fim, t * t));
        if (s === PASSOS_DA_CURVA / 2) naCurva.push(curva.length);
        curva.push(q);
      }
    });
    for (const parte of c.partes) {
      const de = naCurva[parte.de];
      const ate = naCurva[parte.ate];
      saida.set(trechos[parte.trecho].id, curva.slice(Math.min(de, ate), Math.max(de, ate) + 1));
    }
  });
  return saida;
}

/**
 * A CAIXA OCTOGONAL da luz de teto no 3D (25/10/2026, com a referência isométrica do usuário — "esse é o design para os
 * eletrodutos flexiveis (conduites) e para as caixas de iluminacao no teto" — e a foto da laje com as caixas 4×4): o
 * prisma de 8 lados, baixo, onde os eletrodutos entram pelas laterais, e a ABA embaixo, voltada para o ambiente. Era um
 * cubo de 100 mm. Medidas da caixa 4×4 comercial; só desenho.
 */
export const CAIXA_OCTOGONAL_MM = { larguraMm: 100, alturaMm: 50, abaMm: 120, espessuraDaAbaMm: 6 } as const;
