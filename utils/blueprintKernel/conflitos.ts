import { cantosDaParede, pointInPolygon, type Point } from './geom';
import type { BlueprintModel, ObjectId, Trecho } from './model';
import { pegadaEmPlanta } from './sobreposicao';
import { segmentosDoEletroduto } from './caminhoDoEletroduto';

/**
 * CONFLITO — uma instalação ocupando o mesmo espaço que outra coisa.
 *
 * ─── ⚠️ ISTO NÃO É `sobreposicao.ts`, E CONFUNDIR OS DOIS SERIA CARO ────────
 *
 * `sobreposicao.ts` mede parede × pilar, e a saída dele vira DESCONTO no
 * quantitativo: o mesmo metro cúbico não pode ser pago como concreto e como
 * alvenaria. É um problema de DINHEIRO.
 *
 * Um cano atravessando uma viga é outra coisa inteiramente. Ninguém desconta
 * volume de concreto porque passou um eletroduto por dentro — o furo é
 * desprezível e, se não for, ele é decisão de projeto estrutural, não uma
 * subtração automática. É um problema de COORDENAÇÃO: alguém tem de olhar e
 * decidir se fura, se desvia ou se muda a viga.
 *
 * Reusar o caminho do desconto faria a tubulação comer concreto da estrutura —
 * exatamente o erro que `sobreposicao.ts` existe para impedir, de cabeça para
 * baixo. Por isso este arquivo tem saída PRÓPRIA e não toca no quantitativo.
 *
 * ─── ⚠️ CANO DENTRO DE PAREDE NÃO É CONFLITO ────────────────────────────────
 *
 * É onde ele mora. Eletroduto sobe embutido na alvenaria e cano de água corre
 * dentro dela; rasgo em parede é rotina de obra, não pendência de projeto.
 * Acusar cada um encheria a lista de centenas de linhas normais, e a primeira
 * consequência de uma lista assim é ninguém mais olhar — inclusive nos casos em
 * que a viga está de fato no caminho.
 *
 * O que ENTRA:
 *
 * - **trecho × ESTRUTURA** (pilar, viga, laje, fundação): furar concreto é
 *   decisão, não rotina;
 * - **trecho × trecho de OUTRA disciplina**: dois canos no mesmo lugar. Da
 *   MESMA disciplina não entra — dois trechos de água fria que se encontram são
 *   uma junção, que é a rede funcionando.
 *
 * E7.2 (29/09/2026, roadmap elétrico) — "trecho × parede/abertura sem furo
 * previsto", SEM desmentir a regra acima (parede comum continua de fora):
 *
 * - **trecho × ABERTURA**: o eixo do trecho passa DENTRO do vão de uma porta ou
 *   janela (entre peitoril e verga) — o tubo ficaria aparente no vão, e a
 *   esquadria não entra. Raspão não conta: a ombreira ao lado é parede.
 * - **trecho × PAREDE ESTRUTURAL** (camada com função ESTRUTURAL): alvenaria
 *   estrutural e parede de concreto não admitem rasgo sem previsão. Só o
 *   pedaço NÃO vertical conta (a prumada no furo do bloco é o que a norma de
 *   alvenaria estrutural prevê), e só o que corre ABAIXO do topo da parede —
 *   o eletroduto da laje passa por cima dela, não por dentro.
 */
export interface Conflito {
  trechoId: ObjectId;
  trechoUid: string;
  /** O outro lado: uma peça estrutural ou outro trecho. */
  outroId: ObjectId;
  outroUid: string;
  /** E10.2 (climatização): `EQUIPAMENTO` — o trecho atravessa a caixa de uma peça (evaporadora, condensadora…) a que NÃO se liga. */
  classe: 'ESTRUTURA' | 'REDE' | 'ABERTURA' | 'PAREDE_ESTRUTURAL' | 'EQUIPAMENTO';
  /**
   * Quanto do trecho corre DENTRO do outro corpo, em mm.
   *
   * Zero num encontro de raspão — o eixo passa por fora, mas a espessura do
   * cano alcança. Zero não é "não há conflito": há, e ele está na lista.
   */
  comprimentoDentroMm: number;
  /** A menor distância entre os EIXOS, em mm. Zero quando eles se cruzam. */
  folgaEntreEixosMm: number;
}

interface Ponto3 {
  x: number;
  y: number;
  z: number;
}

/**
 * E10.2 (climatização): o VOLUME de uma peça para o conflito trecho × equipamento.
 * As medidas vêm de quem chama (a ficha de cada tipo mora fora do kernel); a
 * cota é o CENTRO da caixa, como no IFC e no 3D.
 */
export interface VolumeDePeca {
  id: ObjectId;
  uid: string;
  levelId: ObjectId;
  at: Point;
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
  cotaMm: number;
  rotacaoGraus: number;
}

/**
 * E10.2: o ENVELOPE do trecho — o que ocupa lugar: o isolamento declarado soma
 * nos dois sentidos, o duto retangular tem meia largura em planta e meia altura
 * na vertical, e a LINHA FRIGORÍGENA são dois tubos lado a lado (`parDaLinha` do
 * IFC: cada centro a maior raio + 5 mm do eixo) — em planta ela ocupa 2r + 5.
 */
export function envelopeDoTrecho(t: Pick<Trecho, 'disciplina' | 'bitolaMm' | 'bitolaSuccaoMm' | 'alturaDutoMm' | 'isolamentoMm'>): { raioPlantaMm: number; raioVerticalMm: number } {
  const iso = t.isolamentoMm ?? 0;
  if (t.disciplina === 'FRIGORIGENA' && t.bitolaSuccaoMm != null) {
    const r = Math.max(t.bitolaMm, t.bitolaSuccaoMm) / 2 + iso;
    return { raioPlantaMm: 2 * r + 5, raioVerticalMm: r };
  }
  const raio = t.bitolaMm / 2 + iso;
  return { raioPlantaMm: raio, raioVerticalMm: t.alturaDutoMm != null ? t.alturaDutoMm / 2 + iso : raio };
}

/** As duas pontas do trecho no mundo, já com a cota do pavimento somada. */
export function pontasNoMundo(t: Trecho, elevacaoDoNivelMm: number): [Ponto3, Ponto3] {
  return [
    { x: t.a.x, y: t.a.y, z: elevacaoDoNivelMm + t.cotaAMm },
    { x: t.b.x, y: t.b.y, z: elevacaoDoNivelMm + t.cotaBMm },
  ];
}

/** Distância de um ponto a um segmento, em 2D. */
function distanciaPontoSegmento(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const den = dx * dx + dy * dy;
  if (den === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / den;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distância entre dois segmentos em 2D. Zero quando se cruzam. */
function distanciaEntreSegmentos(a: Point, b: Point, c: Point, d: Point): number {
  // Cruzamento próprio: distância zero, sem precisar de projeção.
  const s1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const s2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const s3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const s4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  if (s1 * s2 < 0 && s3 * s4 < 0) return 0;
  return Math.min(
    distanciaPontoSegmento(a, c, d),
    distanciaPontoSegmento(b, c, d),
    distanciaPontoSegmento(c, a, b),
    distanciaPontoSegmento(d, a, b),
  );
}

/**
 * O trecho contra um PRISMA — um polígono em planta extrudado entre duas cotas.
 *
 * ⚠️ A faixa vertical é alargada pelo RAIO do cano antes do corte, e a distância
 * em planta é comparada com o mesmo raio. Sem isso, um cano de 100 mm que passa
 * a 40 mm da face da viga não seria acusado — o EIXO dele está livre, e a
 * tubulação não é uma linha.
 */
function contraPrisma(
  A: Ponto3,
  B: Ponto3,
  raioMm: number,
  anel: Point[],
  zBaixoMm: number,
  zAltoMm: number,
  /** E7.1 (05/10/2026): o alcance EM PLANTA (o raspão). Ausente = o mesmo `raioMm` (seção redonda). */
  raioPlantaMm: number = raioMm,
): { dentroMm: number; folgaMm: number } | null {
  if (anel.length < 3) return null;

  const lo = zBaixoMm - raioMm;
  const hi = zAltoMm + raioMm;
  const dz = B.z - A.z;

  // O intervalo de `t` em que o trecho está dentro da faixa de cotas.
  let t0 = 0;
  let t1 = 1;
  if (dz === 0) {
    if (A.z < lo || A.z > hi) return null;
  } else {
    const ta = (lo - A.z) / dz;
    const tb = (hi - A.z) / dz;
    t0 = Math.max(0, Math.min(ta, tb));
    t1 = Math.min(1, Math.max(ta, tb));
    if (t0 > t1) return null;
  }

  const em = (t: number): Ponto3 => ({
    x: A.x + (B.x - A.x) * t,
    y: A.y + (B.y - A.y) * t,
    z: A.z + dz * t,
  });
  const P = em(t0);
  const Q = em(t1);
  const comprimentoDoPedaco = Math.hypot(Q.x - P.x, Q.y - P.y, Q.z - P.z);

  // Quanto do pedaço está DENTRO do polígono, exatamente: os pontos de
  // cruzamento com as arestas partem o segmento, e cada pedaço é classificado
  // pelo próprio meio — que é o único ponto que não está em cima de uma aresta.
  const cortes: number[] = [0, 1];
  for (let i = 0; i < anel.length; i++) {
    const c = anel[i];
    const d = anel[(i + 1) % anel.length];
    const den = (Q.x - P.x) * (d.y - c.y) - (Q.y - P.y) * (d.x - c.x);
    if (den === 0) continue;
    const u = ((c.x - P.x) * (d.y - c.y) - (c.y - P.y) * (d.x - c.x)) / den;
    const v = ((c.x - P.x) * (Q.y - P.y) - (c.y - P.y) * (Q.x - P.x)) / den;
    if (u > 0 && u < 1 && v >= 0 && v <= 1) cortes.push(u);
  }
  cortes.sort((x, y) => x - y);

  let dentro = 0;
  for (let i = 0; i + 1 < cortes.length; i++) {
    const meio = (cortes[i] + cortes[i + 1]) / 2;
    const p = { x: P.x + (Q.x - P.x) * meio, y: P.y + (Q.y - P.y) * meio };
    if (pointInPolygon(anel, p)) dentro += comprimentoDoPedaco * (cortes[i + 1] - cortes[i]);
  }

  if (dentro > 0) return { dentroMm: dentro, folgaMm: 0 };

  // Nada por dentro: sobra o encontro de raspão, em que a espessura alcança.
  let folga = Infinity;
  for (let i = 0; i < anel.length; i++) {
    folga = Math.min(
      folga,
      distanciaEntreSegmentos(P, Q, anel[i], anel[(i + 1) % anel.length]),
    );
  }
  return folga <= raioPlantaMm ? { dentroMm: 0, folgaMm: folga } : null;
}

/**
 * A menor distância entre dois segmentos NO ESPAÇO.
 *
 * ⚠️ Em 3D, e não em planta: dois canos que se cruzam vistos de cima podem estar
 * a um metro um do outro em altura, e é justamente para isso que a cota existe.
 * Medir em planta acusaria conflito em cada cruzamento de traço — o mesmo ruído
 * que a parede evita.
 */
export function distanciaEntreEixos3D(A: Ponto3, B: Ponto3, C: Ponto3, D: Ponto3): number {
  const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
  const v = { x: D.x - C.x, y: D.y - C.y, z: D.z - C.z };
  const w = { x: A.x - C.x, y: A.y - C.y, z: A.z - C.z };
  const pe = (p: Ponto3, q: Ponto3) => p.x * q.x + p.y * q.y + p.z * q.z;
  const a = pe(u, u);
  const b = pe(u, v);
  const c = pe(v, v);
  const d = pe(u, w);
  const e = pe(v, w);
  const den = a * c - b * b;

  let s: number;
  let t: number;
  if (den < 1e-9) {
    // Paralelos: fixa uma ponta e projeta na outra reta.
    s = 0;
    t = c > 0 ? e / c : 0;
  } else {
    s = (b * e - c * d) / den;
    t = (a * e - b * d) / den;
  }
  s = Math.max(0, Math.min(1, s));
  t = Math.max(0, Math.min(1, t));
  const p = { x: A.x + u.x * s, y: A.y + u.y * s, z: A.z + u.z * s };
  const q = { x: C.x + v.x * t, y: C.y + v.y * t, z: C.z + v.z * t };

  // ⚠️ E o mínimo das QUATRO pontas contra o outro segmento, sempre.
  //
  // Travar `s` e `t` em [0,1] não basta: quando o mínimo das RETAS cai fora dos
  // segmentos, o par travado não é o par mais próximo. E no ramo PARALELO, em
  // que `s` é fixado em zero por não haver solução única, o erro é grosseiro —
  // dois canos colineares e afastados davam a distância da ponta errada.
  // Medido: `[0,1]` contra `[10,11]` no eixo x dava 10, e são 9.
  return Math.min(
    Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z),
    distanciaPontoSegmento3D(A, C, D),
    distanciaPontoSegmento3D(B, C, D),
    distanciaPontoSegmento3D(C, A, B),
    distanciaPontoSegmento3D(D, A, B),
  );
}

/** Distância de um ponto a um segmento, no espaço. */
function distanciaPontoSegmento3D(p: Ponto3, a: Ponto3, b: Ponto3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const den = dx * dx + dy * dy + dz * dz;
  if (den === 0) return Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / den;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy), p.z - (a.z + t * dz));
}

/**
 * Todos os conflitos do modelo.
 *
 * A ordem é estável — por trecho, e dentro dele por id do outro lado — para a
 * tela não reordenar a lista a cada recálculo e para o teste poder afirmar.
 */
export function conflitosDoModelo(model: BlueprintModel, opcoes: { pecas?: readonly VolumeDePeca[] } = {}): Conflito[] {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const trechos = model.trechos ?? [];
  const saida: Conflito[] = [];
  // O eletroduto anda em "L" (sobe na parede, corre na laje) — o MESMO caminho
  // que o 3D, o corte e o quantitativo usam (`segmentosDoEletroduto`). Até
  // 29/09/2026 (E0.4) o clash media a DIAGONAL entre as pontas: o eletroduto
  // da tomada à luminária "passava por baixo" da viga que o 3D mostrava
  // atravessando. Tubo hidráulico continua reto — a função devolve o trecho
  // inteiro fora da elétrica.
  const peDireito = new Map(model.levels.map((l) => [l.id, l.defaultHeightMm]));
  const pedacosDe = (x: Trecho): [Ponto3, Ponto3][] =>
    segmentosDoEletroduto(x, peDireito.get(x.levelId) ?? 0).map((seg) =>
      pontasNoMundo({ ...x, a: seg.a, b: seg.b, cotaAMm: seg.cotaAMm, cotaBMm: seg.cotaBMm }, elevacao.get(x.levelId) ?? 0),
    );

  // E7.2: vãos e paredes estruturais.
  const paredePorId = new Map(model.walls.map((w) => [w.id, w]));
  const paredesEstruturais = model.walls.filter((w) => (w.camadas ?? []).some((c) => c.funcao === 'ESTRUTURAL'));

  for (const t of trechos) {
    const pedacos = pedacosDe(t);
    // E7.1 (05/10/2026): o duto RETANGULAR tem meia ALTURA na vertical e meia LARGURA em planta —
    // o cilindro de raio largura/2 acusaria a viga 20 cm acima de um duto de 30 cm de altura.
    // E10.2: e o ENVELOPE — isolamento, e a linha com os dois tubos (antes contava só o de líquido).
    const env = envelopeDoTrecho(t);
    const raio = env.raioPlantaMm;
    const raioVertical = env.raioVerticalMm;

    // ── Contra a ESTRUTURA ───────────────────────────────────────────────
    for (const s of model.structures) {
      const es = elevacao.get(s.levelId) ?? 0;
      const anel = pegadaEmPlanta(s);
      // Um conflito por par (trecho, peça): o que está DENTRO soma pelos
      // pedaços; a folga é a menor delas.
      let r: { dentroMm: number; folgaMm: number } | null = null;
      for (const [A, B] of pedacos) {
        const parte = contraPrisma(A, B, raioVertical, anel, es + s.baseMm, es + s.baseMm + s.alturaMm, raio);
        if (!parte) continue;
        r = r ? { dentroMm: r.dentroMm + parte.dentroMm, folgaMm: Math.min(r.folgaMm, parte.folgaMm) } : parte;
      }
      if (!r) continue;
      saida.push({
        trechoId: t.id,
        trechoUid: t.uid,
        outroId: s.id,
        outroUid: s.uid,
        classe: 'ESTRUTURA',
        comprimentoDentroMm: r.dentroMm,
        folgaEntreEixosMm: r.folgaMm,
      });
    }

    // ── E7.2: contra o VÃO de porta/janela (entre peitoril e verga) ──────
    const paredesComVaoAtravessado = new Set<ObjectId>();
    for (const o of model.openings) {
      const w = paredePorId.get(o.wallId);
      if (!w) continue; // o prisma do vão está em cota ABSOLUTA — o pavimento se resolve sozinho
      const anel = anelDoVao(w, o.offsetMm, o.widthMm);
      if (!anel) continue;
      const ew = elevacao.get(w.levelId) ?? 0;
      let dentro = 0;
      for (const [A, B] of pedacos) {
        // Raio zero: é o EIXO que tem de estar no vão — o raspão na ombreira é parede.
        const parte = contraPrisma(A, B, 0, anel, ew + o.sillMm, ew + o.sillMm + o.heightMm);
        if (parte) dentro += parte.dentroMm;
      }
      if (dentro <= 0) continue;
      paredesComVaoAtravessado.add(w.id);
      saida.push({ trechoId: t.id, trechoUid: t.uid, outroId: o.id, outroUid: o.uid, classe: 'ABERTURA', comprimentoDentroMm: dentro, folgaEntreEixosMm: 0 });
    }

    // ── E7.2: contra PAREDE ESTRUTURAL (rasgo não previsto) ───────────────
    for (const w of paredesEstruturais) {
      if (paredesComVaoAtravessado.has(w.id)) continue; // o vão já disse
      const ew = elevacao.get(w.levelId) ?? 0;
      const anel = cantosDaParede(w.a, w.b, w.thicknessMm);
      let dentro = 0;
      for (const [A, B] of pedacos) {
        if (A.x === B.x && A.y === B.y) continue; // a prumada no furo do bloco é prevista
        // Abaixo do topo, com o corpo do tubo inteiro: o da laje passa por cima.
        const parte = contraPrisma(A, B, 0, anel, ew + raioVertical, ew + w.heightMm - raioVertical);
        if (parte) dentro += parte.dentroMm;
      }
      if (dentro <= 0) continue;
      saida.push({ trechoId: t.id, trechoUid: t.uid, outroId: w.id, outroUid: w.uid, classe: 'PAREDE_ESTRUTURAL', comprimentoDentroMm: dentro, folgaEntreEixosMm: 0 });
    }

    // ── E10.2: contra a CAIXA de um EQUIPAMENTO a que o trecho não se liga ──
    for (const p of opcoes.pecas ?? []) {
      const ep = (elevacao.get(p.levelId) ?? 0) + p.cotaMm;
      const zLo = ep - p.alturaMm / 2;
      const zHi = ep + p.alturaMm / 2;
      const anel = caixaGirada(p.at, p.larguraMm, p.profundidadeMm, p.rotacaoGraus);
      // O trecho que NASCE ou TERMINA na peça é a ligação dela (a linha na evaporadora, o duto no difusor).
      const liga = pedacos.some(([A, B]) => [A, B].some((q) => pontoNaCaixa(q, anel, zLo - 50, zHi + 50, 50)));
      if (liga) continue;
      let r: { dentroMm: number; folgaMm: number } | null = null;
      for (const [A, B] of pedacos) {
        const parte = contraPrisma(A, B, raioVertical, anel, zLo, zHi, raio);
        if (!parte) continue;
        r = r ? { dentroMm: r.dentroMm + parte.dentroMm, folgaMm: Math.min(r.folgaMm, parte.folgaMm) } : parte;
      }
      if (!r) continue;
      saida.push({ trechoId: t.id, trechoUid: t.uid, outroId: p.id, outroUid: p.uid, classe: 'EQUIPAMENTO', comprimentoDentroMm: r.dentroMm, folgaEntreEixosMm: r.folgaMm });
    }

    // ── Contra OUTRA DISCIPLINA ──────────────────────────────────────────
    for (const u of trechos) {
      // `id` só cresce, então o par é visitado uma vez — e nunca contra si.
      if (u.id <= t.id) continue;
      if (u.disciplina === t.disciplina) continue;
      const envU = envelopeDoTrecho(u);
      const alcance = Math.max(raio, raioVertical) + Math.max(envU.raioPlantaMm, envU.raioVerticalMm);
      // E10.2: os dois que NASCEM NO MESMO NÓ (a linha e o dreno na evaporadora, o duto e a linha na dutada)
      // se encontram ali por projeto — mede-se a partir de onde eles se separam, não no nó.
      let pedT = pedacos;
      let pedU = pedacosDe(u);
      const comum = noEmComum(pedT, pedU);
      if (comum) {
        pedT = aparar(pedT, comum, alcance + 50);
        pedU = aparar(pedU, comum, alcance + 50);
      }
      let folga = Infinity;
      for (const [A, B] of pedT) for (const [C, D] of pedU) folga = Math.min(folga, distanciaEntreEixos3D(A, B, C, D));
      // E7.1: duto retangular conta pelo MAIOR meio-lado (conservador; o par de eixos não diz a orientação).
      if (folga > alcance) continue;
      saida.push({
        trechoId: t.id,
        trechoUid: t.uid,
        outroId: u.id,
        outroUid: u.uid,
        classe: 'REDE',
        comprimentoDentroMm: 0,
        folgaEntreEixosMm: folga,
      });
    }
  }

  return saida.sort(
    (x, y) => (x.trechoId < y.trechoId ? -1 : x.trechoId > y.trechoId ? 1 : 0) ||
      (x.outroId < y.outroId ? -1 : x.outroId > y.outroId ? 1 : 0),
  );
}

/** E10.2: a caixa em planta de uma peça centrada em `at`, girada de `rotacaoGraus`. */
function caixaGirada(at: Point, largura: number, profundidade: number, rotacaoGraus: number): Point[] {
  const r = (rotacaoGraus * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return [
    [-largura / 2, -profundidade / 2],
    [largura / 2, -profundidade / 2],
    [largura / 2, profundidade / 2],
    [-largura / 2, profundidade / 2],
  ].map(([x, y]) => ({ x: at.x + x * c - y * s, y: at.y + x * s + y * c }) as Point);
}

/** O ponto está na caixa (o anel em planta crescido de `folga`, entre as duas cotas)? */
function pontoNaCaixa(q: Ponto3, anel: Point[], zLo: number, zHi: number, folga: number): boolean {
  if (q.z < zLo || q.z > zHi) return false;
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [a, b] = [anel[i], anel[j]];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  if (dentro) return true;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) if (distanciaPontoSegmento({ x: q.x, y: q.y } as Point, anel[j], anel[i]) <= folga) return true;
  return false;
}

/** A ponta comum a dois trechos (± 1 mm), se houver. */
function noEmComum(a: [Ponto3, Ponto3][], b: [Ponto3, Ponto3][]): Ponto3 | null {
  for (const [p0, p1] of a) for (const p of [p0, p1]) for (const [q0, q1] of b) for (const q of [q0, q1]) if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= 1) return p;
  return null;
}

/** Os pedaços sem o trecho a menos de `d` do ponto `p` (o que fica a menos de `d` some). */
function aparar(pedacos: [Ponto3, Ponto3][], p: Ponto3, d: number): [Ponto3, Ponto3][] {
  const saida: [Ponto3, Ponto3][] = [];
  for (const [A, B] of pedacos) {
    const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    if (!(L > 0)) continue;
    const u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L, z: (B.z - A.z) / L };
    const perto = (q: Ponto3) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) <= 1;
    let [s0, s1] = [0, L];
    if (perto(A)) s0 = d;
    if (perto(B)) s1 = L - d;
    if (s1 <= s0) continue;
    saida.push([
      { x: A.x + u.x * s0, y: A.y + u.y * s0, z: A.z + u.z * s0 },
      { x: A.x + u.x * s1, y: A.y + u.y * s1, z: A.z + u.z * s1 },
    ]);
  }
  return saida;
}

/** E7.2: o retângulo em planta do VÃO — ao longo do eixo, de `offset` a `offset + largura`, na espessura da parede. */
function anelDoVao(w: { a: Point; b: Point; thicknessMm: number }, offsetMm: number, larguraMm: number): Point[] | null {
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (!(L > 0) || !(larguraMm > 0)) return null;
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  const p0 = { x: w.a.x + u.x * offsetMm, y: w.a.y + u.y * offsetMm };
  const p1 = { x: w.a.x + u.x * (offsetMm + larguraMm), y: w.a.y + u.y * (offsetMm + larguraMm) };
  return cantosDaParede(p0 as Point, p1 as Point, w.thicknessMm);
}
