/**
 * ELETRODUTOS SOBREPOSTOS EM PLANTA — a leve curva e a entrada no quadro
 * (14–15/09/2026).
 *
 * Pedido: *"veja print que alguns eletrodutos estão se sobrepondo. uma solução
 * é fazer uma leve curva no eletroduto."* E, com a primeira versão no ar:
 * *"ainda estão próximos, principalmente próximo ao quadro de distribuição."*
 *
 * Na prancha elétrica é assim que se lê: dois eletrodutos pela mesma linha
 * viram um só traço, e a contagem de condutores de um cobre a do outro. E no
 * quadro TODOS os circuitos chegam ao mesmo ponto — o leque que sai dele é o
 * lugar mais denso da planta. A convenção resolve as duas coisas: os repetidos
 * ganham um arco leve, cada um para um lado; e cada circuito ENTRA no quadro
 * por um ponto diferente da frente dele, em vez de todos no centro.
 *
 * Isto é DESENHO, não modelo: o trecho continua reto e ancorado no centro do
 * quadro no kernel, no 3D, no quantitativo e no hash. Só a planta 2D curva o
 * traço e espalha as entradas — e o acerto do clique segue a geometria
 * DESENHADA (`geometriaDesenhada`), para o que se vê ser o que se pega.
 *
 * O que conta como "confundível" (mesmo grupo de curvas):
 *   - COLINEARES que se cobrem: as quatro pontas a até `tolMm` da reta um do
 *     outro e intervalos que se sobrepõem por mais que `tolMm`;
 *   - saem do MESMO NÓ em direções a menos de `ANGULO_CONFUNDIVEL_GRAUS`: dois
 *     troncos do quadro para pontos na mesma parede, a meio metro um do outro.
 * Dois que só se tocam na ponta em ângulo aberto são continuação, não
 * sobreposição; dois que se cruzam não estão na mesma reta. A prumada (a = b
 * em planta) não tem direção — fica de fora.
 */
export interface Ponto2D {
  x: number;
  y: number;
}

/** Quanto do lado uma ponta pode estar da reta do outro e ainda ser "a mesma linha". */
export const TOLERANCIA_DE_SOBREPOSICAO_MM = 20;
/** Abaixo disto, dois trechos que saem do mesmo nó se confundem a olho. */
export const ANGULO_CONFUNDIVEL_GRAUS = 12;
/** Afastamento do ponto de controle da curva por nível, em px de tela (a curva passa à metade disso). */
export const PASSO_DA_CURVA_PX = 14;

function distanciaAReta(p: Ponto2D, a: Ponto2D, b: Ponto2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / comp;
}

/** Posição de `p` ao longo de a→b, em mm a partir de `a` (pode ser negativa ou passar do fim). */
function aoLongo(p: Ponto2D, a: Ponto2D, b: Ponto2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / comp;
}

const perto = (p: Ponto2D, q: Ponto2D, tolMm: number) => Math.hypot(p.x - q.x, p.y - q.y) <= tolMm;

/** Os dois trechos correm pela mesma reta e se cobrem por mais que a tolerância? */
export function sobrepostos(
  s: { a: Ponto2D; b: Ponto2D },
  t: { a: Ponto2D; b: Ponto2D },
  tolMm = TOLERANCIA_DE_SOBREPOSICAO_MM,
): boolean {
  const compS = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const compT = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
  if (compS === 0 || compT === 0) return false;
  if (distanciaAReta(t.a, s.a, s.b) > tolMm || distanciaAReta(t.b, s.a, s.b) > tolMm) return false;
  if (distanciaAReta(s.a, t.a, t.b) > tolMm || distanciaAReta(s.b, t.a, t.b) > tolMm) return false;
  const u1 = aoLongo(t.a, s.a, s.b);
  const u2 = aoLongo(t.b, s.a, s.b);
  const ini = Math.max(0, Math.min(u1, u2));
  const fim = Math.min(compS, Math.max(u1, u2));
  return fim - ini > tolMm;
}

/**
 * Os dois trechos saem do MESMO nó (uma ponta de cada, a até `tolMm`) em
 * direções a menos de `ANGULO_CONFUNDIVEL_GRAUS`? É o leque do quadro: perto
 * dele os traços se fundem mesmo sem estarem na mesma reta.
 */
export function mesmoLeque(
  s: { a: Ponto2D; b: Ponto2D },
  t: { a: Ponto2D; b: Ponto2D },
  tolMm = TOLERANCIA_DE_SOBREPOSICAO_MM,
  anguloGraus = ANGULO_CONFUNDIVEL_GRAUS,
): boolean {
  const compS = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const compT = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
  if (compS === 0 || compT === 0) return false;
  for (const [ns, outroS] of [
    [s.a, s.b],
    [s.b, s.a],
  ] as const) {
    for (const [nt, outroT] of [
      [t.a, t.b],
      [t.b, t.a],
    ] as const) {
      if (!perto(ns, nt, tolMm)) continue;
      const ux = (outroS.x - ns.x) / compS;
      const uy = (outroS.y - ns.y) / compS;
      const vx = (outroT.x - nt.x) / compT;
      const vy = (outroT.y - nt.y) / compT;
      const cos = Math.max(-1, Math.min(1, ux * vx + uy * vy));
      if ((Math.acos(cos) * 180) / Math.PI < anguloGraus) return true;
    }
  }
  return false;
}

/**
 * O desvio de cada trecho, em "níveis" de curva: `0` = reto (o primeiro de
 * cada grupo, e todo trecho sem par); `+1, −1, +2, −2…` para os demais do
 * grupo, alternando os lados. Só os que se curvam entram no mapa.
 *
 * O sinal já vem ajustado a uma ORIENTAÇÃO CANÔNICA da reta (da esquerda para
 * a direita; de cima para baixo quando vertical), para dois trechos do mesmo
 * grupo desenhados em sentidos opostos não caírem do mesmo lado. Quem desenha
 * aplica o desvio à normal de a→b do próprio trecho, como está.
 *
 * Grupos são componentes conexas da relação "confundível": A com B e B com C
 * põem os três no mesmo grupo mesmo que A e C não se confundam — é o leque, e
 * é o tronco comprido com dois ramais. Determinístico: a ordem dentro do
 * grupo é a dos ids.
 */
export function desviosDeSobreposicao<T extends { id: string; a: Ponto2D; b: Ponto2D }>(
  trechos: readonly T[],
  tolMm = TOLERANCIA_DE_SOBREPOSICAO_MM,
): Map<string, number> {
  const n = trechos.length;
  const pai = Array.from({ length: n }, (_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  const unir = (i: number, j: number) => {
    const a = raiz(i);
    const b = raiz(j);
    if (a !== b) pai[Math.max(a, b)] = Math.min(a, b);
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sobrepostos(trechos[i], trechos[j], tolMm) || mesmoLeque(trechos[i], trechos[j], tolMm)) unir(i, j);
    }
  }
  const grupos = new Map<number, T[]>();
  for (let i = 0; i < n; i++) {
    const r = raiz(i);
    const g = grupos.get(r) ?? [];
    g.push(trechos[i]);
    grupos.set(r, g);
  }
  const desvios = new Map<string, number>();
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    const ordenados = [...g].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    ordenados.forEach((t, k) => {
      if (k === 0) return;
      const nivel = Math.ceil(k / 2) * (k % 2 === 1 ? 1 : -1);
      const invertido = t.b.x < t.a.x || (t.b.x === t.a.x && t.b.y < t.a.y);
      desvios.set(t.id, invertido ? -nivel : nivel);
    });
  }
  return desvios;
}

/**
 * Por onde cada trecho ENTRA no quadro, em coordenadas do MODELO.
 *
 * Os trechos ancorados no centro do quadro (`at`) são espalhados pela largura
 * dele, na ordem do ângulo em que chegam (para não se cruzarem na entrada),
 * ocupando 80 % da frente. Só quando há dois ou mais: um só entra pelo
 * centro. A prumada do quadro (a = b) fica no centro, que é onde ela está.
 *
 * Devolve, por trecho, a ponta substituída (`a` e/ou `b`). É desenho: o modelo
 * continua ancorado no centro — é o que `pontasPresasAsPecas` e o 3D leem.
 */
export function entradasNoQuadro<T extends { id: string; a: Ponto2D; b: Ponto2D }>(
  trechos: readonly T[],
  quadros: readonly { id: string; at: Ponto2D; larguraMm: number; rotacaoGraus: number }[],
  tolMm = TOLERANCIA_DE_SOBREPOSICAO_MM,
): Map<string, { a?: Ponto2D; b?: Ponto2D }> {
  const saida = new Map<string, { a?: Ponto2D; b?: Ponto2D }>();
  for (const q of quadros) {
    const chegam: { t: T; end: 'a' | 'b'; angulo: number }[] = [];
    for (const t of trechos) {
      if (t.a.x === t.b.x && t.a.y === t.b.y) continue;
      for (const end of ['a', 'b'] as const) {
        if (!perto(t[end], q.at, tolMm)) continue;
        const outro = end === 'a' ? t.b : t.a;
        chegam.push({ t, end, angulo: Math.atan2(outro.y - q.at.y, outro.x - q.at.x) });
      }
    }
    if (chegam.length < 2) continue;
    // Ordem pelo ângulo de chegada, do lado esquerdo do quadro para o direito
    // no referencial dele: assim as entradas não se cruzam.
    const rad = (q.rotacaoGraus * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sen = Math.sin(rad);
    // O ângulo relativo ao eixo local x do quadro, em (−π, π]; ordenar por ele
    // percorre o leque de um lado ao outro.
    const relativo = (a: number) => {
      let r = a - rad;
      while (r <= -Math.PI) r += 2 * Math.PI;
      while (r > Math.PI) r -= 2 * Math.PI;
      return r;
    };
    // Da esquerda para a direita no referencial do quadro: o cosseno do ângulo
    // relativo é a componente da direção de chegada no eixo local x — quem vem
    // da esquerda (cos −1) entra pela esquerda, quem vem da direita (cos +1)
    // pela direita, e os dois lados (por cima / por baixo) saem ordenados de
    // uma vez, sem cruzamento na entrada.
    chegam.sort((p, r) => Math.cos(relativo(p.angulo)) - Math.cos(relativo(r.angulo)) || (p.t.id < r.t.id ? -1 : 1));
    const n = chegam.length;
    const util = q.larguraMm * 0.8;
    chegam.forEach((c, i) => {
      const dx = ((i + 0.5) / n - 0.5) * util;
      // `+ 0` desfaz o −0 que `Math.round` devolve quando cos(90°) é 6e-17.
      const ponto = { x: Math.round(q.at.x + dx * cos) + 0, y: Math.round(q.at.y + dx * sen) + 0 };
      const atual = saida.get(c.t.id) ?? {};
      atual[c.end] = ponto;
      saida.set(c.t.id, atual);
    });
  }
  return saida;
}

/**
 * O ponto de controle da curva quadrática e o ponto MÉDIO dela (onde os
 * rótulos e as marcas de condutor devem ficar), em coordenadas de tela, para
 * um desvio de `nivel` × `passoPx`. A curva passa a `passoPx × nivel / 2` do
 * traço reto no meio — o "leve" do pedido: separa sem parecer torto.
 */
export function curvaDoTrecho(
  p: Ponto2D,
  q: Ponto2D,
  nivel: number,
  passoPx = PASSO_DA_CURVA_PX,
): { controle: Ponto2D; meio: Ponto2D } {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const comp = Math.hypot(dx, dy);
  const meioReto = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  if (comp === 0 || nivel === 0) return { controle: meioReto, meio: meioReto };
  const nx = -dy / comp;
  const ny = dx / comp;
  const d = nivel * passoPx;
  return {
    controle: { x: meioReto.x + nx * d, y: meioReto.y + ny * d },
    meio: { x: meioReto.x + (nx * d) / 2, y: meioReto.y + (ny * d) / 2 },
  };
}

/**
 * A geometria DESENHADA de cada trecho, em coordenadas do MODELO: as pontas
 * já espalhadas na entrada do quadro e a curva amostrada em segmentos — é
 * contra isto que o acerto do clique mede, para o que se vê ser o que se
 * pega. `escala` (px por mm) converte o passo da curva, que é em px de tela.
 */
export function geometriaDesenhada<T extends { id: string; a: Ponto2D; b: Ponto2D }>(
  trechos: readonly T[],
  desvios: Map<string, number>,
  entradas: Map<string, { a?: Ponto2D; b?: Ponto2D }>,
  escala: number,
  passoPx = PASSO_DA_CURVA_PX,
): { id: string; pontos: Ponto2D[] }[] {
  return trechos.map((t) => {
    const e = entradas.get(t.id);
    const a = e?.a ?? t.a;
    const b = e?.b ?? t.b;
    const nivel = desvios.get(t.id) ?? 0;
    if (nivel === 0 || escala <= 0) return { id: t.id, pontos: [a, b] };
    const { controle } = curvaDoTrecho(a, b, nivel, passoPx / escala);
    const pontos: Ponto2D[] = [];
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const w0 = (1 - u) * (1 - u);
      const w1 = 2 * (1 - u) * u;
      const w2 = u * u;
      pontos.push({ x: w0 * a.x + w1 * controle.x + w2 * b.x, y: w0 * a.y + w1 * controle.y + w2 * b.y });
    }
    return { id: t.id, pontos };
  });
}
