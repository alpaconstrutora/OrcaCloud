import {
  applyBatch,
  contornoEmPlanta,
  intersectSegments,
  paredeEhExterna,
  pointInPolygon,
  projecaoNoSegmento,
  wallLength,
  DEFAULT_TOLERANCE_MM,
  SENO_MINIMO_CANTO,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Opening,
  type Point,
  type Structural,
  type StructuralKind,
  type Wall,
} from './blueprintKernel';

/**
 * LANÇAMENTO AUTOMÁTICO DE PILARES (15/09/2026).
 *
 * Pedido: *"implememte Lançamento automático de pilares"*.
 *
 * O mesmo molde dos Circuitos automáticos: o sistema PROPÕE, quem projeta
 * confirma, Ctrl+Z desfaz o lote inteiro. A proposta é uma PRÉVIA — tabela na
 * gaveta e contornos tracejados no desenho — e gravar é um único `runBatch`.
 * Não há campo "sugerido" no pilar: ele existe ou não existe.
 *
 * ─── ONDE NASCE UM PILAR (decidido com o usuário em 15/09/2026) ────────────
 *
 *  1. Em cada ENCONTRO de paredes: canto (L), T e cruzamento (X). Os nós são
 *     os do grafo de EIXOS (`Wall.a`/`Wall.b`). O pilar nasce no nó e, quando é
 *     mais grosso que a parede, é EMPURRADO para dentro até a face dele coincidir
 *     com a face externa da parede (16/09/2026, print do usuário: *"alguns
 *     pilares estão ultrapassando os limites das paredes, principalmente nos
 *     cantos"*): no canto, para o quadrante onde as duas paredes seguem; no T,
 *     para o lado do ramo; no intermediário, para o lado do ambiente. O
 *     deslocamento é de poucos cm — `pontesEstruturais` continua reconhecendo
 *     o pilar (a ponta da parede cai dentro da pegada), e ambiente, área e
 *     perímetro não mudam.
 *  2. INTERMEDIÁRIOS ao longo da parede sempre que a distância entre dois
 *     apoios consecutivos (pilar proposto ou existente, canto, ponta) passa do
 *     vão máximo: o trecho é dividido em vãos iguais. O intermediário desvia
 *     de porta, janela e vão livre.
 *  3. Emenda em linha reta NÃO é encontro (é desenho, não estrutura) — as duas
 *     paredes contam como uma só para o vão. Ponta solta não ganha pilar.
 *  4. Pilar EXISTENTE é respeitado: o nó dele não recebe outro, e ele conta
 *     como apoio para o vão.
 *  5. As paredes que o pilar atravessa passam a CEDER o volume ao concreto
 *     (`SetCedeSobreposicao`), no mesmo lote — o quantitativo não paga duas vezes.
 *
 * ─── O QUE É NORMA E O QUE É HIPÓTESE ───────────────────────────────────────
 *
 * NBR 6118 (13.2.3): a menor dimensão de um pilar é 19 cm — é o padrão da
 * seção aqui. TODO O RESTO é hipótese nomeada na gaveta: o vão máximo (5 m,
 * faixa usual do concreto convencional residencial), a seção, as paredes que
 * entram. Nada disto é dimensionamento: carga, armadura e verificação são do
 * responsável técnico.
 *
 * ─── O QUE FICA DE FORA, E POR QUÊ ──────────────────────────────────────────
 *
 *  - Viga entre os pilares: outro lançamento, outra decisão (altura, apoio).
 *  - Outros pavimentos: a extensão é o pé-direito do pavimento ativo; repetir
 *    é rodar no outro pavimento — pilar contínuo exigiria alinhar plantas.
 *  - Pilar em ponta solta (mureta): hipótese futura, não retrabalho.
 */

export interface HipotesesDePilares {
  /** Distância máxima entre apoios consecutivos, em mm; acima disso entra intermediário. */
  vaoMaximoMm: number;
  /** Seção (b × h) em mm — o lado MAIOR vai ao longo da parede (ver `normalizarSecao`). */
  larguraMm: number;
  profundidadeMm: number;
  /** `false` = só paredes externas (contorno da edificação). */
  incluirInternas: boolean;
  /** Intermediário desvia de porta/janela/vão livre. */
  evitarAberturas: boolean;
}

export const HIPOTESES_PILARES_PADRAO: HipotesesDePilares = {
  vaoMaximoMm: 5000,
  larguraMm: 190,
  profundidadeMm: 190,
  incluirInternas: true,
  evitarAberturas: true,
};

/** NBR 6118 13.2.3 — menor dimensão da seção de um pilar. */
export const SECAO_MINIMA_NBR6118_MM = 190;

/** Os vãos máximos oferecidos na gaveta, em mm. */
export const VAOS_MAXIMOS = [4000, 5000, 6000] as const;

export const SECOES_SUGERIDAS = [
  { id: '190x190', rotulo: '19 × 19 cm (mínimo NBR 6118)', larguraMm: 190, profundidadeMm: 190 },
  { id: '140x400', rotulo: '14 × 40 cm', larguraMm: 400, profundidadeMm: 140 },
  { id: '200x400', rotulo: '20 × 40 cm', larguraMm: 400, profundidadeMm: 200 },
  { id: '250x250', rotulo: '25 × 25 cm', larguraMm: 250, profundidadeMm: 250 },
] as const;
export type SecaoSugeridaId = (typeof SECOES_SUGERIDAS)[number]['id'];

/** Folga entre a face do pilar intermediário e a lateral da abertura, em mm. */
export const FOLGA_DA_ABERTURA_MM = 50;

/**
 * Acima disto, o pilar que sobressai da parede ganha aviso na linha. 19 cm numa
 * parede de 15 cm sobressai 2 cm por lado — normal, dito uma vez na gaveta,
 * não em cada linha.
 */
const SOBRESSAI_AVISO_MM = 50;

export type TipoDeNo = 'CANTO' | 'T' | 'CRUZAMENTO' | 'EMENDA' | 'PONTA';
export type OndeDoPilar = 'CANTO' | 'T' | 'CRUZAMENTO' | 'INTERMEDIARIO';

export const ROTULO_DO_ONDE: Record<OndeDoPilar, string> = {
  CANTO: 'canto',
  T: 'T',
  CRUZAMENTO: 'cruzamento',
  INTERMEDIARIO: 'intermediário',
};

export interface IncidenciaNoNo {
  wallId: ObjectId;
  /** Ponta da parede que cai no nó, ou `meio` quando o nó corta o corpo dela. */
  end: 'a' | 'b' | 'meio';
  /** Posição do nó ao longo de a→b, em mm. */
  tMm: number;
}

export interface NoDeParede {
  /** O representante do agrupamento por tolerância — sempre um ponto inteiro que existia. */
  at: Point;
  tipo: TipoDeNo;
  incidencias: IncidenciaNoNo[];
  /** Direções distintas que saem do nó (rad, deduplicadas a ~10°) — o "grau" estrutural. */
  bracos: number[];
}

export interface PilarPrevisto {
  /** `str_000N`, previsto de `model.seq.str` — ver `idsPrevistosDeEstrutura`. */
  idPrevisto: ObjectId;
  rotulo: string;
  onde: OndeDoPilar;
  at: Point;
  /** Já normalizado: o lado ao longo da parede. */
  larguraMm: number;
  profundidadeMm: number;
  /** Inteiro, 0..179 — o eixo da parede hospedeira. */
  rotacaoDeg: number;
  alturaMm: number;
  /** As paredes que passam a ceder por causa deste pilar. */
  wallIds: ObjectId[];
  aviso: string | null;
}

export interface ForaDoPlanoDePilares {
  onde: OndeDoPilar | 'PONTA' | 'EMENDA';
  at: Point;
  wallIds: ObjectId[];
  motivo: string;
}

export interface PlanoDePilares {
  levelId: ObjectId;
  pilares: PilarPrevisto[];
  /** Todos os `AddStructural` (na ordem de `pilares`) e depois um `SetCedeSobreposicao` por parede. */
  comandos: Command[];
  paredesQueCedem: ObjectId[];
  foraDoPlano: ForaDoPlanoDePilares[];
  /** Encontros que já tinham pilar — mantidos, contam como apoio. */
  nosComPilarExistente: number;
  /** Pontas de parede sem outra parede — não ganham pilar. */
  pontasSoltas: number;
  /** Avisos globais: paredes sobrepostas, sem ambientes fechados… */
  avisos: string[];
  /** Por que não há plano; `null` quando há. */
  motivo: string | null;
}

// ─── Leitura do modelo ──────────────────────────────────────────────────────

/** As paredes do pavimento; com `incluirInternas=false`, só as externas (sem ambiente fechado = externa). */
export function paredesDoNivel(model: BlueprintModel, levelId: ObjectId, incluirInternas: boolean): Wall[] {
  const todas = model.walls.filter((w) => w.levelId === levelId && wallLength(w) > 0);
  if (incluirInternas) return todas;
  return todas.filter((w) => paredeEhExterna(model, w) !== false);
}

/** Pilares que cruzam o piso do pavimento — os que um novo pilar respeita. */
export function pilaresExistentesNoNivel(model: BlueprintModel, levelId: ObjectId): Structural[] {
  return (model.structures ?? []).filter(
    (s) => s.levelId === levelId && s.kind === 'PILAR' && s.baseMm <= 0 && s.baseMm + s.alturaMm > 0,
  );
}

/** O próximo número livre de "<prefixo><n>" no modelo inteiro — a prancha numera o edifício. */
export function proximoNumeroDoRotulo(model: BlueprintModel, prefixo: string): number {
  const re = new RegExp(`^${prefixo}\\s*0*(\\d+)$`, 'i');
  let maior = 0;
  for (const s of model.structures ?? []) {
    const m = re.exec((s.rotulo ?? '').trim());
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return maior + 1;
}

/** "P<n>" — ver `proximoNumeroDoRotulo`. */
export function proximoNumeroDePilar(model: BlueprintModel): number {
  return proximoNumeroDoRotulo(model, 'P');
}

/**
 * Os ids que `applyBatch` vai dar a N `AddStructural` seguidos. Espelha
 * `nextId` do kernel (`str_${n em 4 dígitos}`, sequencial por `model.seq`).
 * `conferirPlanoDePilares` prova antes de gravar que a previsão bate.
 */
export function idsPrevistosDeEstrutura(model: BlueprintModel, quantos: number): ObjectId[] {
  const base = model.seq['str'] ?? 0;
  return Array.from({ length: quantos }, (_, k) => `str_${String(base + k + 1).padStart(4, '0')}`);
}

/** O lado MAIOR vai ao longo da parede (eixo X local, que `contornoEmPlanta` gira por `rotacaoDeg`). */
export function normalizarSecao(hip: Pick<HipotesesDePilares, 'larguraMm' | 'profundidadeMm'>): {
  larguraMm: number;
  profundidadeMm: number;
} {
  const a = Math.max(1, Math.round(hip.larguraMm));
  const b = Math.max(1, Math.round(hip.profundidadeMm));
  return { larguraMm: Math.max(a, b), profundidadeMm: Math.min(a, b) };
}

/** Uma peça PREVISTA (pilar, viga ou laje) — o bastante para desenhar a pegada dela. */
export interface PecaPrevista {
  kind: StructuralKind;
  pontos: Point[];
  larguraMm: number;
  profundidadeMm: number;
  rotacaoDeg: number;
  rotulo?: string;
  /** Estaca: `larguraMm` é o diâmetro; a pegada polígono é o quadrado envolvente (ver `contornoEmPlanta`). */
  circular?: boolean;
}

/** O contorno em planta de uma peça prevista — o mesmo cálculo da peça de verdade (`contornoEmPlanta`). */
export function pegadaDaPecaPrevista(p: PecaPrevista): Point[] {
  const s: Structural = {
    id: 'previsto',
    uid: 'previsto',
    levelId: 'previsto',
    kind: p.kind,
    pontos: p.pontos,
    larguraMm: p.larguraMm,
    profundidadeMm: p.profundidadeMm,
    alturaMm: 1,
    baseMm: 0,
    circular: p.circular ?? false,
    rotacaoDeg: p.rotacaoDeg,
  };
  return contornoEmPlanta(s);
}

/** O contorno em planta de um pilar previsto — ver `pegadaDaPecaPrevista`. */
export function pegadaDoPilarPrevisto(
  p: Pick<PilarPrevisto, 'at' | 'larguraMm' | 'profundidadeMm' | 'rotacaoDeg'>,
): Point[] {
  return pegadaDaPecaPrevista({ kind: 'PILAR', pontos: [p.at], larguraMm: p.larguraMm, profundidadeMm: p.profundidadeMm, rotacaoDeg: p.rotacaoDeg });
}

// ─── Geometria de apoio ─────────────────────────────────────────────────────

const dist = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

/** Ângulo do eixo a→b em graus inteiros, normalizado a [0, 180). */
function anguloDaParedeDeg(w: Wall): number {
  const g = Math.round((Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI);
  return ((g % 180) + 180) % 180;
}

/** Duas direções (rad) são a mesma reta e o mesmo sentido? (|sen| pequeno e cos > 0) */
function mesmaDirecao(a: number, b: number): boolean {
  const d = a - b;
  return Math.abs(Math.sin(d)) < SENO_MINIMO_CANTO && Math.cos(d) > 0;
}

/** Duas direções (rad) são opostas na mesma reta? */
function opostas(a: number, b: number): boolean {
  const d = a - b;
  return Math.abs(Math.sin(d)) < SENO_MINIMO_CANTO && Math.cos(d) < 0;
}

function ordemXY(p: Point, q: Point): number {
  return p.x - q.x || p.y - q.y;
}

/** Meia diagonal da pegada de um pilar existente — o raio em que "é o mesmo lugar". */
function meiaDiagonal(s: Structural): number {
  const b = s.larguraMm;
  const h = s.circular ? s.larguraMm : s.profundidadeMm;
  return Math.hypot(b, h) / 2;
}

/** Meia extensão da pegada do pilar (centrada na origem) projetada numa direção unitária. */
function meiaExtensaoNaDirecao(
  secao: { larguraMm: number; profundidadeMm: number; rotacaoDeg: number },
  n: Point,
): number {
  const anel = pegadaDoPilarPrevisto({ at: { x: 0, y: 0 }, ...secao });
  return Math.max(...anel.map((c) => Math.abs(c.x * n.x + c.y * n.y)));
}

/** Normal esquerda unitária do sentido a→b da parede. */
function normalDaParede(w: Wall): Point {
  const L = wallLength(w);
  return { x: -(w.b.y - w.a.y) / L, y: (w.b.x - w.a.x) / L };
}

/**
 * Para que lado da parede fica o AMBIENTE (+1 = normal esquerda, −1 = direita,
 * 0 = não se sabe: dos dois lados ou de nenhum) — a mesma amostragem de
 * `paredeEhExterna`, só que devolvendo o lado.
 */
function ladoDoAmbiente(model: BlueprintModel, w: Wall, tol: number): -1 | 0 | 1 {
  const n = normalDaParede(w);
  const mx = (w.a.x + w.b.x) / 2;
  const my = (w.a.y + w.b.y) / 2;
  const d = w.thicknessMm / 2 + 2 * tol + 1;
  const dentro = (p: Point) =>
    model.spaces.some(
      (sp) => sp.levelId === w.levelId && pointInPolygon(sp.ring, p) && !sp.holes.some((h) => pointInPolygon(h, p)),
    );
  const esq = dentro({ x: mx + n.x * d, y: my + n.y * d });
  const dir = dentro({ x: mx - n.x * d, y: my - n.y * d });
  if (esq === dir) return 0;
  return esq ? 1 : -1;
}

/**
 * O EMPURRÃO que tira o pilar de fora da parede: para cada parede `w` que o
 * pilar atravessa, se a meia extensão dele através de `w` passa da meia
 * espessura, desloca o centro pelo excesso na direção `paraDentro` (unitária,
 * perpendicular a `w`). O que sobra do pilar fica todo do lado de dentro.
 */
function empurraoParaDentro(
  secao: { larguraMm: number; profundidadeMm: number; rotacaoDeg: number },
  w: Wall,
  paraDentro: Point,
): Point {
  const n = normalDaParede(w);
  const meia = meiaExtensaoNaDirecao(secao, n);
  const excesso = meia - w.thicknessMm / 2;
  if (excesso <= 0) return { x: 0, y: 0 };
  // `paraDentro` pode não ser exatamente perpendicular (canto oblíquo): usa a
  // componente ao longo da normal, com o sinal do lado de dentro.
  const sinal = Math.sign(paraDentro.x * n.x + paraDentro.y * n.y) || 0;
  return { x: n.x * sinal * excesso, y: n.y * sinal * excesso };
}

// ─── Os nós do grafo de paredes ─────────────────────────────────────────────

/**
 * Os nós (canto, T, cruzamento, emenda, ponta) das paredes do pavimento, sem
 * mexer no arranjo planar: pontas de parede + interseções par a par, agrupadas
 * pela tolerância do kernel, e a cada nó as paredes que incidem nele e as
 * direções que dele saem.
 *
 * Determinístico: os candidatos são ordenados por (x, y) e o PRIMEIRO dentro
 * da tolerância é o representante — a mesma regra do `snapVertices` do arranjo.
 */
export function nosDeParede(
  model: BlueprintModel,
  levelId: ObjectId,
  tol = DEFAULT_TOLERANCE_MM,
  walls: Wall[] = paredesDoNivel(model, levelId, true),
): { nos: NoDeParede[]; sobrepostas: [ObjectId, ObjectId][] } {
  const candidatos: Point[] = [];
  const sobrepostas: [ObjectId, ObjectId][] = [];
  for (const w of walls) candidatos.push(w.a, w.b);

  // Interseções par a par, com varredura por x para não comparar o que não se toca.
  const caixas = walls
    .map((w) => ({
      w,
      minX: Math.min(w.a.x, w.b.x) - tol,
      maxX: Math.max(w.a.x, w.b.x) + tol,
      minY: Math.min(w.a.y, w.b.y) - tol,
      maxY: Math.max(w.a.y, w.b.y) + tol,
    }))
    .sort((p, q) => p.minX - q.minX);
  for (let i = 0; i < caixas.length; i++) {
    const ci = caixas[i];
    for (let j = i + 1; j < caixas.length; j++) {
      const cj = caixas[j];
      if (cj.minX > ci.maxX) break;
      if (cj.minY > ci.maxY || cj.maxY < ci.minY) continue;
      const r = intersectSegments({ a: ci.w.a, b: ci.w.b }, { a: cj.w.a, b: cj.w.b });
      if (r.kind === 'point' && r.at) {
        candidatos.push({ x: r.at.x, y: r.at.y });
      } else if (r.kind === 'overlap') {
        sobrepostas.push([ci.w.id, cj.w.id]);
      } else {
        // Junção tolerada: a ponta de uma parou a poucos mm do corpo da outra.
        for (const [de, para] of [
          [ci.w, cj.w],
          [cj.w, ci.w],
        ] as const) {
          for (const ponta of [de.a, de.b]) {
            const pr = projecaoNoSegmento(ponta, para.a, para.b);
            if (pr && pr.distanciaMm <= tol && pr.distanciaMm > 0) candidatos.push({ x: pr.ponto.x, y: pr.ponto.y });
          }
        }
      }
    }
  }

  // Agrupamento por tolerância, determinístico.
  candidatos.sort(ordemXY);
  const reps: Point[] = [];
  for (const p of candidatos) {
    if (reps.some((r) => dist(r, p) <= tol)) continue;
    reps.push({ x: p.x, y: p.y });
  }

  const nos: NoDeParede[] = [];
  for (const rep of reps) {
    const incidencias: IncidenciaNoNo[] = [];
    const direcoes: number[] = [];
    for (const w of walls) {
      const L = wallLength(w);
      const angAB = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
      const angBA = Math.atan2(w.a.y - w.b.y, w.a.x - w.b.x);
      if (dist(rep, w.a) <= tol) {
        incidencias.push({ wallId: w.id, end: 'a', tMm: 0 });
        direcoes.push(angAB);
      } else if (dist(rep, w.b) <= tol) {
        incidencias.push({ wallId: w.id, end: 'b', tMm: L });
        direcoes.push(angBA);
      } else {
        const pr = projecaoNoSegmento(rep, w.a, w.b);
        if (pr && pr.distanciaMm <= tol) {
          const t = pr.u * L;
          if (t > tol && t < L - tol) {
            incidencias.push({ wallId: w.id, end: 'meio', tMm: Math.round(t) });
            direcoes.push(angAB, angBA);
          }
        }
      }
    }
    if (incidencias.length === 0) continue;
    const bracos: number[] = [];
    for (const d of direcoes) if (!bracos.some((b) => mesmaDirecao(b, d))) bracos.push(d);
    let tipo: TipoDeNo;
    if (bracos.length <= 1) tipo = 'PONTA';
    else if (bracos.length === 2) tipo = opostas(bracos[0], bracos[1]) ? 'EMENDA' : 'CANTO';
    else if (bracos.length === 3) tipo = 'T';
    else tipo = 'CRUZAMENTO';
    nos.push({ at: rep, tipo, incidencias, bracos });
  }
  nos.sort((p, q) => ordemXY(p.at, q.at));
  return { nos, sobrepostas };
}

// ─── Cadeias colineares ─────────────────────────────────────────────────────

export interface EloDaCadeia {
  wall: Wall;
  /** `true` quando a parede é percorrida de b para a dentro da cadeia. */
  invertida: boolean;
  /** Distância do início da cadeia ao início desta parede (no sentido da cadeia), em mm. */
  offsetMm: number;
}

export interface Cadeia {
  elos: EloDaCadeia[];
  comprimentoMm: number;
}

/**
 * Paredes emendadas ponta com ponta em linha reta viram UMA cadeia — é ela que
 * se divide em vãos. Só a emenda de grau 2 entre duas pontas encadeia; `meio`,
 * cantos e Ts fecham a cadeia.
 */
export function cadeiasDeParedes(walls: Wall[], nos: NoDeParede[]): Cadeia[] {
  const porId = new Map(walls.map((w) => [w.id, w]));
  // Ligações: para cada emenda, o par (parede, ponta) ↔ (parede, ponta).
  const vizinho = new Map<string, { wallId: ObjectId; end: 'a' | 'b' }>();
  for (const no of nos) {
    if (no.tipo !== 'EMENDA' || no.incidencias.length !== 2) continue;
    const [p, q] = no.incidencias;
    if (p.end === 'meio' || q.end === 'meio') continue;
    vizinho.set(`${p.wallId}:${p.end}`, { wallId: q.wallId, end: q.end });
    vizinho.set(`${q.wallId}:${q.end}`, { wallId: p.wallId, end: p.end });
  }
  const usadas = new Set<ObjectId>();
  const cadeias: Cadeia[] = [];
  const ordenadas = [...walls].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  for (const inicio of ordenadas) {
    if (usadas.has(inicio.id)) continue;
    // Anda para trás até a ponta livre da cadeia (ou volta ao início, se fechada).
    let w = inicio;
    let entradaLivre: 'a' | 'b' = 'a';
    const vistos = new Set<ObjectId>([w.id]);
    for (;;) {
      const v = vizinho.get(`${w.id}:${entradaLivre}`);
      if (!v || vistos.has(v.wallId)) break;
      vistos.add(v.wallId);
      w = porId.get(v.wallId)!;
      // Entramos por `v.end`; a próxima ponta livre a explorar é a oposta.
      entradaLivre = v.end === 'a' ? 'b' : 'a';
    }
    // Agora `w`/`entradaLivre` é a ponta inicial; percorre para a frente.
    const elos: EloDaCadeia[] = [];
    let offset = 0;
    let atual: Wall | null = w;
    let entrada: 'a' | 'b' = entradaLivre;
    while (atual && !usadas.has(atual.id)) {
      usadas.add(atual.id);
      const invertida = entrada === 'b';
      elos.push({ wall: atual, invertida, offsetMm: offset });
      offset += wallLength(atual);
      const saida: 'a' | 'b' = invertida ? 'a' : 'b';
      const v = vizinho.get(`${atual.id}:${saida}`);
      if (!v) break;
      atual = porId.get(v.wallId) ?? null;
      entrada = v.end;
    }
    cadeias.push({ elos, comprimentoMm: offset });
  }
  return cadeias;
}

/** Posição (mm ao longo de a→b) de uma coordenada `s` da cadeia dentro da parede que a contém. */
export function paredeEm(cadeia: Cadeia, s: number): { elo: EloDaCadeia; tMm: number } {
  let escolhido = cadeia.elos[0];
  for (const elo of cadeia.elos) {
    if (s >= elo.offsetMm) escolhido = elo;
  }
  const local = s - escolhido.offsetMm;
  const L = wallLength(escolhido.wall);
  const tMm = escolhido.invertida ? L - local : local;
  return { elo: escolhido, tMm: Math.min(L, Math.max(0, tMm)) };
}

/** A coordenada de cadeia de um ponto que está sobre uma das paredes dela (ou `null`). */
export function coordenadaNaCadeia(cadeia: Cadeia, wallId: ObjectId, tMm: number): number | null {
  const elo = cadeia.elos.find((e) => e.wall.id === wallId);
  if (!elo) return null;
  const L = wallLength(elo.wall);
  return elo.offsetMm + (elo.invertida ? L - tMm : tMm);
}

export function pontoNaParede(w: Wall, tMm: number): Point {
  const L = wallLength(w);
  if (L === 0) return { x: w.a.x, y: w.a.y };
  const u = tMm / L;
  return { x: Math.round(w.a.x + (w.b.x - w.a.x) * u), y: Math.round(w.a.y + (w.b.y - w.a.y) * u) };
}

/** As faixas [lo, hi] (mm ao longo de a→b) em que o centro de um pilar não pode cair por causa das aberturas. */
function faixasProibidas(openings: readonly Opening[], w: Wall, metadeAoLongo: number): [number, number][] {
  const faixas = openings
    .filter((o) => o.wallId === w.id)
    .map((o): [number, number] => [
      o.offsetMm - metadeAoLongo - FOLGA_DA_ABERTURA_MM,
      o.offsetMm + o.widthMm + metadeAoLongo + FOLGA_DA_ABERTURA_MM,
    ])
    .sort((p, q) => p[0] - q[0]);
  const fundidas: [number, number][] = [];
  for (const f of faixas) {
    const ultima = fundidas[fundidas.length - 1];
    if (ultima && f[0] <= ultima[1]) ultima[1] = Math.max(ultima[1], f[1]);
    else fundidas.push([f[0], f[1]]);
  }
  return fundidas;
}

// ─── O planejador ───────────────────────────────────────────────────────────

interface Candidato {
  onde: OndeDoPilar;
  at: Point;
  wallIds: ObjectId[];
  rotacaoDeg: number;
  aviso: string | null;
}

const pesoDoOnde: Record<OndeDoPilar, number> = { CANTO: 0, T: 0, CRUZAMENTO: 0, INTERMEDIARIO: 1 };

const m = (mm: number) => `${(mm / 1000).toFixed(2).replace('.', ',')} m`;

export function planejarPilares(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDePilares = HIPOTESES_PILARES_PADRAO,
): PlanoDePilares {
  const vazio = (motivo: string, extras: Partial<PlanoDePilares> = {}): PlanoDePilares => ({
    levelId,
    pilares: [],
    comandos: [],
    paredesQueCedem: [],
    foraDoPlano: [],
    nosComPilarExistente: 0,
    pontasSoltas: 0,
    avisos: [],
    motivo,
    ...extras,
  });
  const level = model.levels.find((l) => l.id === levelId);
  if (!level) return vazio('pavimento não encontrado');
  const todas = paredesDoNivel(model, levelId, true);
  if (todas.length === 0) return vazio('sem parede no pavimento');

  const avisos: string[] = [];
  const walls = hip.incluirInternas ? todas : paredesDoNivel(model, levelId, false);
  if (!hip.incluirInternas && todas.some((w) => paredeEhExterna(model, w) === null)) {
    avisos.push('sem ambientes fechados, toda parede conta como externa');
  }
  if (walls.length === 0) return vazio('nenhuma parede externa no pavimento', { avisos });

  const tol = DEFAULT_TOLERANCE_MM;
  const secao = normalizarSecao(hip);
  const aoLongo = secao.larguraMm;
  const atraves = secao.profundidadeMm;
  const vaoMax = Math.max(500, Math.round(hip.vaoMaximoMm));
  const porId = new Map(walls.map((w) => [w.id, w]));
  const existentes = pilaresExistentesNoNivel(model, levelId);
  /** Dois nós a menos de uma seção um do outro dividem um pilar só. */
  const raioDeOcupacao = Math.max(aoLongo, atraves);

  const { nos, sobrepostas } = nosDeParede(model, levelId, tol, walls);
  for (const [p, q] of sobrepostas) avisos.push(`paredes ${p} e ${q} sobrepostas — confira o desenho`);
  const cadeias = cadeiasDeParedes(walls, nos);

  const candidatos: Candidato[] = [];
  const foraDoPlano: ForaDoPlanoDePilares[] = [];
  let nosComPilarExistente = 0;
  let pontasSoltas = 0;
  /** Apoios por cadeia: coordenadas `s` onde há pilar (proposto ou existente) ou fim de cadeia. */
  const apoios = new Map<Cadeia, number[]>();
  for (const c of cadeias) apoios.set(c, [0, c.comprimentoMm]);
  const apoiar = (wallId: ObjectId, tMm: number) => {
    for (const c of cadeias) {
      const s = coordenadaNaCadeia(c, wallId, tMm);
      if (s != null) apoios.get(c)!.push(s);
    }
  };

  const avisoDeSobressair = (espessuras: number[]): string | null => {
    const fina = Math.min(...espessuras);
    const porLado = (atraves - fina) / 2;
    return porLado > SOBRESSAI_AVISO_MM
      ? `${atraves - fina} mm mais grosso que a parede de ${fina} mm — encostado na face externa, avança para dentro`
      : null;
  };

  // 1. Pilares de nó.
  for (const no of nos) {
    if (no.tipo === 'PONTA') {
      pontasSoltas++;
      continue;
    }
    if (no.tipo === 'EMENDA') continue;
    const incidentes = no.incidencias.map((i) => porId.get(i.wallId)!).filter(Boolean);
    // ⚠️ O MESMO raio para pilar existente e para candidato desta rodada
    // (uma seção): se o existente fosse medido só pela meia diagonal, um T a
    // 15 cm de um canto ficaria fora do plano na primeira rodada e voltaria
    // na segunda — o botão nunca zerava depois de "Lançar".
    const existente = existentes.find(
      (s) => dist(s.pontos[0], no.at) <= Math.max(meiaDiagonal(s) + tol, raioDeOcupacao),
    );
    if (existente) {
      nosComPilarExistente++;
      for (const i of no.incidencias) apoiar(i.wallId, i.tMm);
      continue;
    }
    const perto = candidatos.find((c) => dist(c.at, no.at) < raioDeOcupacao);
    if (perto) {
      foraDoPlano.push({
        onde: no.tipo,
        at: no.at,
        wallIds: incidentes.map((w) => w.id),
        motivo: 'a menos de uma seção de outro pilar',
      });
      continue;
    }
    const hospedeira = [...incidentes].sort(
      (p, q) => q.thicknessMm - p.thicknessMm || wallLength(q) - wallLength(p) || (p.id < q.id ? -1 : 1),
    )[0];
    const rotacaoDeg = anguloDaParedeDeg(hospedeira);
    const secaoAqui = { larguraMm: aoLongo, profundidadeMm: atraves, rotacaoDeg };
    // O empurrão para dentro (ver cabeçalho). Canto: cada parede empurra o
    // pilar para o lado em que a OUTRA segue. T: a parede atravessada empurra
    // para o lado do ramo. Cruzamento: fica no nó.
    let dx = 0;
    let dy = 0;
    if (no.tipo === 'CANTO' || no.tipo === 'T') {
      const braco = (i: IncidenciaNoNo): Point | null => {
        const w = porId.get(i.wallId)!;
        const L = wallLength(w);
        if (i.end === 'meio') return null;
        const sx = (w.b.x - w.a.x) / L;
        const sy = (w.b.y - w.a.y) / L;
        return i.end === 'a' ? { x: sx, y: sy } : { x: -sx, y: -sy };
      };
      for (const i of no.incidencias) {
        const w = porId.get(i.wallId)!;
        // Para dentro = para onde as OUTRAS pontas seguem (soma dos outros braços).
        let px = 0;
        let py = 0;
        for (const j of no.incidencias) {
          if (j === i) continue;
          const b = braco(j);
          if (b) {
            px += b.x;
            py += b.y;
          }
        }
        if (px === 0 && py === 0) continue;
        const e = empurraoParaDentro(secaoAqui, w, { x: px, y: py });
        dx += e.x;
        dy += e.y;
      }
    }
    candidatos.push({
      onde: no.tipo,
      at: { x: Math.round(no.at.x + dx), y: Math.round(no.at.y + dy) },
      wallIds: incidentes.map((w) => w.id),
      rotacaoDeg,
      aviso: avisoDeSobressair(incidentes.map((w) => w.thicknessMm)),
    });
    for (const i of no.incidencias) apoiar(i.wallId, i.tMm);
  }

  // Pilares existentes que estão sobre uma parede (sem ser num nó) também apoiam.
  for (const s of existentes) {
    for (const w of walls) {
      const pr = projecaoNoSegmento(s.pontos[0], w.a, w.b);
      if (!pr || pr.u < 0 || pr.u > 1 || pr.distanciaMm > meiaDiagonal(s) + tol) continue;
      apoiar(w.id, Math.round(pr.u * wallLength(w)));
    }
  }

  // 2. Intermediários por cadeia.
  const openings = model.openings ?? [];
  for (const cadeia of cadeias) {
    const lista = [...new Set(apoios.get(cadeia)!.map((s) => Math.round(s)))].sort((p, q) => p - q);
    // Funde apoios a menos da tolerância.
    const s0s: number[] = [];
    for (const s of lista) if (s0s.length === 0 || s - s0s[s0s.length - 1] > tol) s0s.push(s);
    for (let k = 0; k + 1 < s0s.length; k++) {
      const s0 = s0s[k];
      const s1 = s0s[k + 1];
      const vao = s1 - s0;
      const n = Math.ceil(vao / vaoMax);
      if (n <= 1) continue;
      for (let j = 1; j < n; j++) {
        let s = s0 + (vao * j) / n;
        let aviso: string | null = null;
        const { elo, tMm } = paredeEm(cadeia, s);
        const w = elo.wall;
        let t = tMm;
        if (hip.evitarAberturas) {
          const faixa = faixasProibidas(openings, w, aoLongo / 2).find(([lo, hi]) => t > lo && t < hi);
          if (faixa) {
            // Os limites do vão em coordenada da PAREDE (t), para não colar noutro apoio.
            const sParaT = (sc: number) => {
              const local = sc - elo.offsetMm;
              return elo.invertida ? wallLength(w) - local : local;
            };
            const tMin = Math.min(sParaT(s0), sParaT(s1)) + aoLongo;
            const tMax = Math.max(sParaT(s0), sParaT(s1)) - aoLongo;
            const opcoes = faixa.filter((x) => x > tMin && x < tMax && x >= 0 && x <= wallLength(w));
            if (opcoes.length === 0) {
              foraDoPlano.push({
                onde: 'INTERMEDIARIO',
                at: pontoNaParede(w, t),
                wallIds: [w.id],
                motivo: 'sem posição livre entre aberturas',
              });
              continue;
            }
            t = opcoes.reduce((melhor, x) => (Math.abs(x - t) < Math.abs(melhor - t) ? x : melhor), opcoes[0]);
            s = elo.offsetMm + (elo.invertida ? wallLength(w) - t : t);
            const maiorVao = Math.max(s - s0, s1 - s);
            if (maiorVao > vaoMax) aviso = `vão ${m(maiorVao)} > ${m(vaoMax)} após desviar da abertura`;
          }
        }
        const sobressai = avisoDeSobressair([w.thicknessMm]);
        const rotacaoDeg = anguloDaParedeDeg(w);
        // Para o lado do ambiente, quando se sabe qual é; senão fica no eixo.
        const lado = ladoDoAmbiente(model, w, tol);
        const normal = normalDaParede(w);
        const e =
          lado === 0
            ? { x: 0, y: 0 }
            : empurraoParaDentro(
                { larguraMm: aoLongo, profundidadeMm: atraves, rotacaoDeg },
                w,
                { x: normal.x * lado, y: normal.y * lado },
              );
        const noEixo = pontoNaParede(w, Math.round(t));
        candidatos.push({
          onde: 'INTERMEDIARIO',
          at: { x: Math.round(noEixo.x + e.x), y: Math.round(noEixo.y + e.y) },
          wallIds: [w.id],
          rotacaoDeg,
          aviso: [aviso, sobressai].filter(Boolean).join(' · ') || null,
        });
      }
    }
  }

  if (candidatos.length === 0) {
    return vazio(
      nosComPilarExistente > 0 ? 'todos os encontros já têm pilar' : 'nenhum encontro de paredes no pavimento',
      { foraDoPlano, nosComPilarExistente, pontasSoltas, avisos },
    );
  }

  // 3. Ordem, rótulos, ids, comandos.
  candidatos.sort((p, q) => ordemXY(p.at, q.at) || pesoDoOnde[p.onde] - pesoDoOnde[q.onde]);
  const n0 = proximoNumeroDePilar(model);
  const ids = idsPrevistosDeEstrutura(model, candidatos.length);
  const pilares: PilarPrevisto[] = candidatos.map((c, k) => ({
    idPrevisto: ids[k],
    rotulo: `P${n0 + k}`,
    onde: c.onde,
    at: c.at,
    larguraMm: aoLongo,
    profundidadeMm: atraves,
    rotacaoDeg: c.rotacaoDeg,
    alturaMm: level.defaultHeightMm,
    wallIds: c.wallIds,
    aviso: c.aviso,
  }));
  const paredesQueCedem = [...new Set(pilares.flatMap((p) => p.wallIds))]
    .filter((id) => porId.get(id)?.cedeSobreposicao !== true)
    .sort();
  const comandos: Command[] = [
    ...pilares.map(
      (p): Command => ({
        type: 'AddStructural',
        levelId,
        kind: 'PILAR',
        pontos: [p.at],
        larguraMm: p.larguraMm,
        profundidadeMm: p.profundidadeMm,
        alturaMm: p.alturaMm,
        baseMm: 0,
        circular: false,
        rotacaoDeg: p.rotacaoDeg,
        rotulo: p.rotulo,
      }),
    ),
    ...paredesQueCedem.map((id): Command => ({ type: 'SetCedeSobreposicao', id, cede: true })),
  ];
  return {
    levelId,
    pilares,
    comandos,
    paredesQueCedem,
    foraDoPlano,
    nosComPilarExistente,
    pontasSoltas,
    avisos,
    motivo: null,
  };
}

/**
 * RELANÇAR (16/09/2026, pedido: *"caso o usuário queira alterar as dimensões
 * dos pilares ele precisa que o botão de relançar esteja sempre disponível"*).
 *
 * O pilar não carrega marca de "automático" (decisão de 15/09: sem campo no
 * kernel), então não há como apagar "só os que o lançamento pôs". O que existe
 * é o mesmo gesto do "Refazer" dos eletrodutos: apagar os pilares DO PAVIMENTO
 * — inclusive os desenhados à mão, dito na confirmação — e lançar de novo com
 * as hipóteses atuais (seção, vão, internas). Um lote só: `DeleteStructural`
 * dos existentes e depois o plano; Ctrl+Z devolve tudo.
 *
 * Os ids previstos continuam certos: apagar não recua `model.seq.str`.
 */
export function relancarPilares(
  model: BlueprintModel,
  levelId: ObjectId,
  hip: HipotesesDePilares = HIPOTESES_PILARES_PADRAO,
): PlanoDePilares & { apagados: ObjectId[] } {
  const apagados = pilaresExistentesNoNivel(model, levelId).map((s) => s.id);
  if (apagados.length === 0) return { ...planejarPilares(model, levelId, hip), apagados };
  const semPilares: BlueprintModel = {
    ...model,
    structures: (model.structures ?? []).filter((s) => !apagados.includes(s.id)),
  };
  const plano = planejarPilares(semPilares, levelId, hip);
  const deletes: Command[] = apagados.map((structuralId) => ({ type: 'DeleteStructural', structuralId }));
  return { ...plano, comandos: plano.comandos.length > 0 ? [...deletes, ...plano.comandos] : [], apagados };
}

/**
 * Prova, antes de gravar, que o lote faz o que a prévia diz: os ids criados
 * são os previstos, na ordem, e cada parede do lote passou a ceder.
 */
export function conferirPlanoDePilares(
  model: BlueprintModel,
  plano: PlanoDePilares,
): { ok: true } | { ok: false; motivo: string } {
  if (plano.comandos.length === 0) return { ok: false, motivo: plano.motivo ?? 'nada a lançar' };
  try {
    const r = applyBatch(model, plano.comandos);
    const criados = r.diff.created.filter((id) => id.startsWith('str_'));
    const previstos = plano.pilares.map((p) => p.idPrevisto);
    if (criados.length !== previstos.length || criados.some((id, i) => id !== previstos[i])) {
      return {
        ok: false,
        motivo: `ids previstos (${previstos.join(', ')}) diferem dos criados (${criados.join(', ')})`,
      };
    }
    for (const id of plano.paredesQueCedem) {
      const w = r.model.walls.find((x) => x.id === id);
      if (!w) return { ok: false, motivo: `parede ${id} não existe` };
      if (w.cedeSobreposicao !== true) return { ok: false, motivo: `parede ${id} não passou a ceder` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
