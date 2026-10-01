/**
 * EXTINTORES (01/10/2026, E7.1 do roadmap de incêndio).
 *
 * Cada ambiente pede CLASSES de fogo (A sempre; B na cozinha e na garagem; C
 * onde há quadro elétrico ou casa de máquinas) e, do ponto mais desfavorável
 * dele, a DISTÂNCIA A PERCORRER — pelas portas, contornando paredes, no mesmo
 * pavimento — até um extintor que combata cada classe tem de caber no limite
 * do risco (a carga de incêndio da E0). Cada pavimento ocupado tem ao menos um
 * extintor; a capacidade extintora declarada é conferida contra a mínima do
 * risco. A PROPOSTA automática cobre o que falta (gulosa: a posição que cobre
 * mais pares ambiente × classe primeiro), num lote só.
 *
 * NORMA: desde a D1.2 (01/10/2026), a IT 16 do CBMMG (transcrição em
 * `docs/normas/incendio-mg/it16-tabelas.txt`): a distância máxima é POR CLASSE de fogo
 * (Tabelas 4, 5 e 6 — A 20 m, B 15 m, C 20 m; no risco alto, o extintor mais forte alcança mais),
 * a capacidade mínima pelo risco, um extintor a até 10 m da entrada do pavimento (5.2.2.9) e uma
 * unidade de pó ABC (ou A + BC) por pavimento (6.2.1). O rascunho de memória (25/20/15 m por
 * risco) foi trocado.
 */
import { pointInPolygon, type AgenteExtintor, type BlueprintModel, type Command, type ObjectId, type Point, type Space, type Terminal } from './blueprintKernel';
import { construirGrafoEspacial } from './blueprintGrafoEspacial';
import { usoDoNome } from './blueprintPrograma';
import { caminhoDentro, candidatosDoAmbiente } from './blueprintRotaDeFuga';

export const FONTE_EXTINTORES = 'IT 16 do CBMMG (Portaria 69/2022), Tabelas 4 a 6';

export type ClasseDeFogo = 'A' | 'B' | 'C';
export const CLASSES_DO_AGENTE: Record<AgenteExtintor, readonly ClasseDeFogo[]> = {
  AGUA: ['A'],
  ESPUMA: ['A', 'B'],
  PQS_BC: ['B', 'C'],
  PQS_ABC: ['A', 'B', 'C'],
  CO2: ['B', 'C'],
};
export const ROTULO_DO_AGENTE: Record<AgenteExtintor, string> = { AGUA: 'Água', ESPUMA: 'Espuma', PQS_BC: 'Pó BC', PQS_ABC: 'Pó ABC', CO2: 'CO₂' };

export type RiscoDeExtintor = 'BAIXO' | 'MEDIO' | 'ALTO';
/**
 * IT 16, Tabelas 4 (classe A) e 5 (classe B): por risco, as linhas capacidade mínima → distância
 * máxima a percorrer (m). No risco ALTO há duas: o extintor mais forte alcança mais longe.
 */
export const TABELA_4_IT16: Record<RiscoDeExtintor, readonly { capacidade: number; distanciaM: number }[]> = {
  BAIXO: [{ capacidade: 2, distanciaM: 20 }],
  MEDIO: [{ capacidade: 3, distanciaM: 20 }],
  ALTO: [{ capacidade: 3, distanciaM: 15 }, { capacidade: 4, distanciaM: 20 }],
};
export const TABELA_5_IT16: Record<RiscoDeExtintor, readonly { capacidade: number; distanciaM: number }[]> = {
  BAIXO: [{ capacidade: 20, distanciaM: 15 }],
  MEDIO: [{ capacidade: 40, distanciaM: 15 }],
  ALTO: [{ capacidade: 40, distanciaM: 10 }, { capacidade: 80, distanciaM: 15 }],
};
/** IT 16, Tabela 6: classe C (e D), 20 m; K, 15 m. */
export const DISTANCIA_CLASSE_C_M = 20;
/** IT 16, 5.2.2.9: um extintor a até 10 m da porta de entrada da edificação ou do pavimento. */
export const DISTANCIA_DA_ENTRADA_M = 10;

/** A mínima do risco (a 1ª linha de cada tabela) — o que a proposta lança e o que conta como unidade. */
export const TABELA_DO_RISCO_DE_EXTINTOR: Record<RiscoDeExtintor, { minimaA: number; minimaB: number }> = {
  BAIXO: { minimaA: TABELA_4_IT16.BAIXO[0].capacidade, minimaB: TABELA_5_IT16.BAIXO[0].capacidade },
  MEDIO: { minimaA: TABELA_4_IT16.MEDIO[0].capacidade, minimaB: TABELA_5_IT16.MEDIO[0].capacidade },
  ALTO: { minimaA: TABELA_4_IT16.ALTO[0].capacidade, minimaB: TABELA_5_IT16.ALTO[0].capacidade },
};

/**
 * Até onde o extintor de capacidade `cap` protege a classe `c` no `risco`, m — a maior distância
 * das linhas que a capacidade alcança. `null` = abaixo da mínima: não é unidade extintora dessa
 * classe. Capacidade não declarada conta como a mínima (a análise acusa a falta de declaração).
 */
export function limiteDaClasse(c: ClasseDeFogo, risco: RiscoDeExtintor, cap: { A: number | null; B: number | null; C: boolean } | null): number | null {
  if (c === 'C') return cap && !cap.C ? null : DISTANCIA_CLASSE_C_M;
  const linhas = c === 'A' ? TABELA_4_IT16[risco] : TABELA_5_IT16[risco];
  if (!cap) return linhas[0].distanciaM;
  const valor = c === 'A' ? cap.A : cap.B;
  const ok = linhas.filter((l) => (valor ?? 0) >= l.capacidade);
  return ok.length ? Math.max(...ok.map((l) => l.distanciaM)) : null;
}

// ─── Premissas ───────────────────────────────────────────────────────────────

export interface HipotesesDeExtintores {
  /** Declarada vence a do risco. `null` = da tabela. */
  distanciaMaximaM: number | null;
  /** O extintor que a proposta lança. */
  agentePadrao: AgenteExtintor;
  cargaPadraoKg: number;
  capacidadePadrao: string;
}
export const HIPOTESES_EXTINTORES_PADRAO: HipotesesDeExtintores = { distanciaMaximaM: null, agentePadrao: 'PQS_ABC', cargaPadraoKg: 4, capacidadePadrao: '2-A:20-B:C' };

const AGENTES: readonly AgenteExtintor[] = ['AGUA', 'ESPUMA', 'PQS_BC', 'PQS_ABC', 'CO2'];
export function hipotesesDeExtintoresDaColuna(raw: unknown): HipotesesDeExtintores {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = HIPOTESES_EXTINTORES_PADRAO;
  const pos = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
  return {
    distanciaMaximaM: pos(r.distanciaMaximaM),
    agentePadrao: AGENTES.includes(r.agentePadrao as AgenteExtintor) ? (r.agentePadrao as AgenteExtintor) : p.agentePadrao,
    cargaPadraoKg: pos(r.cargaPadraoKg) ?? p.cargaPadraoKg,
    capacidadePadrao: typeof r.capacidadePadrao === 'string' && r.capacidadePadrao.trim() ? r.capacidadePadrao.trim().toUpperCase() : p.capacidadePadrao,
  };
}

// ─── Classes por ambiente ────────────────────────────────────────────────────

const CASA_DE_MAQUINAS = /casa\s+de\s+m[aá]quinas|subesta[cç][aã]o|gerador|\bqd\b|quadro|el[eé]tric|medidores/i;
const GARAGEM = /garagem|estacionamento|vagas?\b/i;

/** As classes que o ambiente pede, e por quê. */
export function classesDoAmbiente(model: BlueprintModel, s: Space): { classes: ClasseDeFogo[]; motivo: string } {
  const nome = s.name ?? '';
  const classes: ClasseDeFogo[] = ['A'];
  const motivos: string[] = [];
  if (usoDoNome(nome) === 'COZINHA' || GARAGEM.test(nome)) {
    classes.push('B');
    motivos.push(usoDoNome(nome) === 'COZINHA' ? 'cozinha (B)' : 'garagem (B)');
  }
  const temQuadro = (model.quadros ?? []).some((q) => q.levelId === s.levelId && pointInPolygon(s.ring, q.at));
  if (temQuadro || CASA_DE_MAQUINAS.test(nome)) {
    classes.push('C');
    motivos.push(temQuadro ? 'quadro elétrico (C)' : 'equipamento elétrico (C)');
  }
  return { classes, motivo: motivos.length ? motivos.join(', ') : 'ocupação comum (A)' };
}

/** "2-A:20-B:C" → { A: 2, B: 20, C: true }; `null` se não se lê. */
export function lerCapacidade(s: string | null | undefined): { A: number | null; B: number | null; C: boolean } | null {
  if (!s) return null;
  const r = { A: null as number | null, B: null as number | null, C: false };
  for (const p of s.split(':')) {
    const a = /^(\d+)-A$/.exec(p);
    const b = /^(\d+)-B$/.exec(p);
    if (a) r.A = Number(a[1]);
    else if (b) r.B = Number(b[1]);
    else if (p === 'C') r.C = true;
    else return null;
  }
  return r;
}

// ─── Distância a percorrer no pavimento ──────────────────────────────────────

interface Portal {
  /** O id da abertura. */
  chave: string;
  ponto: Point;
  parede: ObjectId;
}

/** A menor distância do ponto ao contorno do ambiente, mm. */
export function distanciaABorda(s: Space, p: Point): number {
  let d = Infinity;
  for (const anel of [s.ring, ...s.holes]) {
    for (let i = 0; i < anel.length; i++) {
      const a = anel[i];
      const b = anel[(i + 1) % anel.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const c2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / c2));
      d = Math.min(d, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
  }
  return d;
}

/** O pavimento como rede de portas: os portais de cada ambiente e o caminho entre eles por dentro. */
export function redeDoPavimento(model: BlueprintModel, levelId: ObjectId) {
  const g = construirGrafoEspacial(model, levelId);
  const portais = new Map<ObjectId, Portal[]>();
  for (const a of g.arestas) {
    if (!a.openingId) continue;
    const p = { chave: a.openingId, ponto: a.ponto, parede: a.wallId };
    for (const lado of [a.de, a.para]) if (lado) portais.set(lado, [...(portais.get(lado) ?? []), p]);
  }
  const espacos = model.spaces.filter((s) => s.levelId === levelId);
  const adj = new Map<string, { para: string; mm: number }[]>();
  for (const s of espacos) {
    const ps = portais.get(s.id) ?? [];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const c = caminhoDentro(s, ps[i].ponto, ps[j].ponto);
        if (!c) continue;
        adj.set(ps[i].chave, [...(adj.get(ps[i].chave) ?? []), { para: ps[j].chave, mm: c.mm }]);
        adj.set(ps[j].chave, [...(adj.get(ps[j].chave) ?? []), { para: ps[i].chave, mm: c.mm }]);
      }
    }
  }
  return { portais, adj, espacos };
}

/**
 * As distâncias, a partir de um conjunto de ORIGENS (pontos com o ambiente
 * deles), a cada portal do pavimento — Dijkstra de várias origens.
 */
export function distanciasAosPortais(rede: ReturnType<typeof redeDoPavimento>, origens: { ponto: Point; space: Space }[]): Map<string, number> {
  const dist = new Map<string, number>();
  for (const o of origens) {
    for (const p of rede.portais.get(o.space.id) ?? []) {
      const c = caminhoDentro(o.space, o.ponto, p.ponto);
      if (c && c.mm < (dist.get(p.chave) ?? Infinity)) dist.set(p.chave, c.mm);
    }
  }
  const feitos = new Set<string>();
  for (;;) {
    let u: string | null = null;
    for (const [k, v] of dist) if (!feitos.has(k) && (u === null || v < dist.get(u)!)) u = k;
    if (u === null) break;
    feitos.add(u);
    for (const a of rede.adj.get(u) ?? []) {
      const nd = dist.get(u)! + a.mm;
      if (nd < (dist.get(a.para) ?? Infinity)) dist.set(a.para, nd);
    }
  }
  return dist;
}

/**
 * Os pontos em que a cobertura é conferida: os cantos recuados e o centro (os
 * da rota de fuga) e uma malha a cada 3 m por dentro.
 *
 * ⚠️ Só cantos e centro não bastam: num corredor de 60 m com extintores a 10 e
 * a 50 m, o ponto pior está ENTRE eles, e nenhum canto o pega. E a proposta
 * cobre ponto a ponto — por ambiente inteiro, o corredor longo (que precisa de
 * mais de um extintor) ficava sem cobertura; o teste do corredor pegou.
 */
export function pontosDeCobertura(s: Space): Point[] {
  const { candidatos } = candidatosDoAmbiente(s);
  const xs = s.ring.map((p) => p.x);
  const ys = s.ring.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const nx = Math.max(1, Math.ceil((x1 - x0) / 3000));
  const ny = Math.max(1, Math.ceil((y1 - y0) / 3000));
  const malha: Point[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const p = { x: x0 + ((i + 0.5) * (x1 - x0)) / nx, y: y0 + ((j + 0.5) * (y1 - y0)) / ny };
      if (pointInPolygon(s.ring, p) && !s.holes.some((h) => pointInPolygon(h, p))) malha.push(p);
    }
  }
  return [...candidatos, ...malha];
}

/** A distância de UM ponto do ambiente às origens, pelo menor caminho. */
export function distanciaDoPonto(rede: ReturnType<typeof redeDoPavimento>, s: Space, c: Point, origens: { ponto: Point; space: Space }[], dist: Map<string, number>): number {
  let melhor = Infinity;
  for (const o of origens) if (o.space.id === s.id) melhor = Math.min(melhor, caminhoDentro(s, c, o.ponto)?.mm ?? Infinity);
  for (const p of rede.portais.get(s.id) ?? []) {
    const d = dist.get(p.chave);
    if (d == null) continue;
    melhor = Math.min(melhor, (caminhoDentro(s, c, p.ponto)?.mm ?? Infinity) + d);
  }
  return melhor;
}

// ─── A análise ───────────────────────────────────────────────────────────────

export interface AmbienteDoExtintor {
  spaceId: ObjectId;
  levelId: ObjectId;
  rotulo: string;
  classes: ClasseDeFogo[];
  motivo: string;
  /** A pior distância até um extintor de cada classe pedida, m; `null` = não há extintor dessa classe no pavimento. */
  distanciaM: number | null;
  /** D1.2: o limite da IT 16 que vale para o ambiente — o menor entre as classes, com a capacidade mínima. */
  limiteM?: number;
  atende: boolean;
}

export interface ExtintorConferido {
  terminalId: ObjectId;
  agente: AgenteExtintor | null;
  classes: readonly ClasseDeFogo[];
  capacidade: string | null;
  /** A capacidade alcança a mínima do risco nas classes do agente? `null` = sem agente ou capacidade declarada. */
  capacidadeAtende: boolean | null;
}

export interface AnaliseDeExtintores {
  risco: RiscoDeExtintor;
  /** De onde veio o risco. */
  motivoDoRisco: string;
  distanciaMaximaM: number;
  ambientes: AmbienteDoExtintor[];
  extintores: ExtintorConferido[];
  /** Pavimentos ocupados sem nenhum extintor. */
  pavimentosSemExtintor: { levelId: ObjectId; nome: string }[];
  /** D1.2 (IT 16, 6.2.1): pavimentos com extintor mas sem uma unidade de pó ABC (nem A + BC). */
  pavimentosSemABC: { levelId: ObjectId; nome: string }[];
  /** D1.2 (IT 16, 5.2.2.9): pavimentos sem extintor a até 10 m da entrada (porta para fora ou chegada da escada). */
  entradasLonge: { levelId: ObjectId; nome: string; distanciaM: number | null }[];
  pendencias: string[];
  fonte: string;
}

const ehExtintor = (t: Terminal) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'EXTINTOR';

/** O risco pelo nível de carga de incêndio da E0 (BAIXA/MEDIA/ALTA); sem carga, o médio. */
export function riscoDoExtintor(nivelDeCarga: 'BAIXA' | 'MEDIA' | 'ALTA' | null): { risco: RiscoDeExtintor; motivo: string } {
  if (nivelDeCarga === 'BAIXA') return { risco: 'BAIXO', motivo: 'carga de incêndio baixa' };
  if (nivelDeCarga === 'ALTA') return { risco: 'ALTO', motivo: 'carga de incêndio alta' };
  if (nivelDeCarga === 'MEDIA') return { risco: 'MEDIO', motivo: 'carga de incêndio média' };
  return { risco: 'MEDIO', motivo: 'carga de incêndio não definida — usado o risco médio' };
}

/** As ENTRADAS do pavimento (5.2.2.9): as portas para fora; sem elas, a chegada de cada escada. */
export function entradasDoPavimento(model: BlueprintModel, levelId: ObjectId, rede: ReturnType<typeof redeDoPavimento>): { ponto: Point; space: Space }[] {
  const porId = new Map(rede.espacos.map((s) => [s.id, s]));
  const portas = construirGrafoEspacial(model, levelId)
    .saidas.map((a) => ({ ponto: a.ponto, space: porId.get(a.de)! }))
    .filter((x) => !!x.space);
  if (portas.length) return portas;
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm || a.id.localeCompare(b.id));
  const out: { ponto: Point; space: Space }[] = [];
  for (const e of model.stairs ?? []) {
    const i = niveis.findIndex((l) => l.id === e.levelId);
    const j = e.ateLevelId ? niveis.findIndex((l) => l.id === e.ateLevelId) : i + 1;
    const servidos = niveis.slice(i, Math.max(i, Math.min(j, niveis.length - 1)) + 1).map((l) => l.id);
    if (!servidos.includes(levelId)) continue;
    const boca = levelId === e.levelId ? e.pontos[0] : e.pontos[e.pontos.length - 1];
    const space = rede.espacos.find((x) => pointInPolygon(x.ring, boca));
    if (space) out.push({ ponto: boca, space });
  }
  return out;
}

/** Os extintores do pavimento que são unidade da classe `c`, agrupados pelo alcance (m) que a IT 16 lhes dá. */
function gruposDaClasse(doNivel: { t: Terminal; space: Space }[], c: ClasseDeFogo, risco: RiscoDeExtintor, declaradaM: number | null): Map<number, { ponto: Point; space: Space }[]> {
  const grupos = new Map<number, { ponto: Point; space: Space }[]>();
  for (const x of doNivel) {
    // Sem agente: "a declarar", vale só para A (como antes).
    const classes = x.t.agenteExtintor ? CLASSES_DO_AGENTE[x.t.agenteExtintor] : (['A'] as const);
    if (!(classes as readonly string[]).includes(c)) continue;
    const lim = declaradaM ?? limiteDaClasse(c, risco, lerCapacidade(x.t.capacidadeExtintora));
    if (lim == null) continue; // abaixo da mínima do risco: não é unidade dessa classe
    grupos.set(lim, [...(grupos.get(lim) ?? []), { ponto: x.t.at, space: x.space }]);
  }
  return grupos;
}

export function analisarExtintores(model: BlueprintModel, nivelDeCarga: 'BAIXA' | 'MEDIA' | 'ALTA' | null, hip: HipotesesDeExtintores): AnaliseDeExtintores {
  const { risco, motivo: motivoDoRisco } = riscoDoExtintor(nivelDeCarga);
  const linha = TABELA_DO_RISCO_DE_EXTINTOR[risco];
  const declaradaM = hip.distanciaMaximaM;
  // O limite de cada classe com a capacidade MÍNIMA do risco (o que a proposta lança).
  const minimo = { A: linha.minimaA, B: linha.minimaB, C: true };
  const limiteMinimo = (c: ClasseDeFogo) => declaradaM ?? limiteDaClasse(c, risco, minimo)!;
  const distanciaMaximaM = declaradaM ?? Math.min(limiteMinimo('A'), limiteMinimo('B'), limiteMinimo('C'));
  const pendencias: string[] = [];
  if (!nivelDeCarga) pendencias.push(motivoDoRisco);
  const extintores = (model.terminais ?? []).filter(ehExtintor);
  const ambientes: AmbienteDoExtintor[] = [];
  const entradasLonge: AnaliseDeExtintores['entradasLonge'] = [];
  for (const l of model.levels) {
    const rede = redeDoPavimento(model, l.id);
    if (!rede.espacos.length) continue;
    const doNivel = extintores
      .map((t) => ({ t, space: rede.espacos.find((s) => pointInPolygon(s.ring, t.at)) ?? null }))
      .filter((x): x is { t: Terminal; space: Space } => !!x.space);
    // Por classe, os grupos de extintores com o mesmo alcance, e a rede de distâncias de cada grupo.
    const porClasse = new Map<ClasseDeFogo, { limiteMm: number; origens: { ponto: Point; space: Space }[]; dist: Map<string, number> }[]>();
    for (const c of ['A', 'B', 'C'] as const) {
      porClasse.set(c, [...gruposDaClasse(doNivel, c, risco, declaradaM)].map(([lim, origens]) => ({ limiteMm: lim * 1000, origens, dist: distanciasAosPortais(rede, origens) })));
    }
    rede.espacos.forEach((s, i) => {
      const { classes, motivo } = classesDoAmbiente(model, s);
      let pior = 0;
      let folgaPior = -Infinity;
      for (const c of classes) {
        const grupos = porClasse.get(c)!;
        for (const p of pontosDeCobertura(s)) {
          let d = Infinity;
          let folga = Infinity;
          for (const g of grupos) {
            const x = distanciaDoPonto(rede, s, p, g.origens, g.dist);
            d = Math.min(d, x);
            folga = Math.min(folga, x - g.limiteMm);
          }
          pior = Math.max(pior, d);
          folgaPior = Math.max(folgaPior, folga);
        }
      }
      const distanciaM = Number.isFinite(pior) ? pior / 1000 : null;
      const limiteM = classes.length ? Math.min(...classes.map(limiteMinimo)) : distanciaMaximaM;
      ambientes.push({ spaceId: s.id, levelId: l.id, rotulo: s.name || `Ambiente ${i + 1} (${l.name})`, classes, motivo, distanciaM, limiteM, atende: classes.length === 0 || folgaPior <= 1e-6 });
    });
    // 5.2.2.9: algum extintor (de qualquer classe) a até 10 m de uma entrada do pavimento.
    const ocupado = model.spaces.some((x) => x.levelId === l.id);
    const entradas = entradasDoPavimento(model, l.id, rede);
    if (ocupado && entradas.length) {
      const todos = doNivel.map((x) => ({ ponto: x.t.at, space: x.space }));
      const dist = distanciasAosPortais(rede, todos);
      const melhor = todos.length ? Math.min(...entradas.map((e) => distanciaDoPonto(rede, e.space, e.ponto, todos, dist))) : Infinity;
      if (!(melhor <= DISTANCIA_DA_ENTRADA_M * 1000 + 1e-6)) entradasLonge.push({ levelId: l.id, nome: l.name, distanciaM: Number.isFinite(melhor) ? melhor / 1000 : null });
    }
  }
  const conferidos: ExtintorConferido[] = extintores.map((t) => {
    const classes = t.agenteExtintor ? CLASSES_DO_AGENTE[t.agenteExtintor] : [];
    const cap = lerCapacidade(t.capacidadeExtintora);
    const capacidadeAtende = !t.agenteExtintor || !cap ? null : (!classes.includes('A') || (cap.A ?? 0) >= linha.minimaA) && (!classes.includes('B') || (cap.B ?? 0) >= linha.minimaB) && (!classes.includes('C') || cap.C);
    return { terminalId: t.id, agente: t.agenteExtintor ?? null, classes, capacidade: t.capacidadeExtintora ?? null, capacidadeAtende };
  });
  if (extintores.some((t) => !t.agenteExtintor)) pendencias.push('há extintor sem agente declarado — conta só para a classe A');
  if (extintores.some((t) => t.agenteExtintor && t.agenteExtintor !== 'PQS_ABC')) pendencias.push('IT 16, 6.2.1.2: em garagens e em edificações sem brigada de incêndio, o extintor tem de ser de pó ABC — confira onde há outro agente');
  const ocupados = new Set(model.spaces.map((s) => s.levelId));
  const comExtintor = new Set(extintores.map((t) => t.levelId));
  const pavimentosSemExtintor = model.levels.filter((l) => ocupados.has(l.id) && !comExtintor.has(l.id)).map((l) => ({ levelId: l.id, nome: l.name }));
  // 6.2.1: uma unidade de pó ABC, ou duas (uma A e uma BC), por pavimento.
  const pavimentosSemABC = model.levels
    .filter((l) => comExtintor.has(l.id))
    .filter((l) => {
      const ag = extintores.filter((t) => t.levelId === l.id).map((t) => t.agenteExtintor);
      const temA = ag.some((a) => a && CLASSES_DO_AGENTE[a].includes('A'));
      const temBC = ag.some((a) => a && CLASSES_DO_AGENTE[a].includes('B') && CLASSES_DO_AGENTE[a].includes('C'));
      return !ag.includes('PQS_ABC') && !(temA && temBC);
    })
    .map((l) => ({ levelId: l.id, nome: l.name }));
  return { risco, motivoDoRisco, distanciaMaximaM, ambientes, extintores: conferidos, pavimentosSemExtintor, pavimentosSemABC, entradasLonge, pendencias, fonte: FONTE_EXTINTORES };
}

// ─── A proposta ──────────────────────────────────────────────────────────────

export interface PropostaDeExtintores {
  comandos: Command[];
  pontos: { levelId: ObjectId; at: Point }[];
  /** Pares ambiente × classe que nem a proposta cobre (ambiente sem porta, longe demais de qualquer posição). */
  semCobertura: string[];
  motivo: string | null;
}

/**
 * Cobre os ambientes que não atendem: em cada pavimento, posições candidatas
 * (junto de cada porta, 30 cm para dentro de cada lado, e o centro de cada
 * ambiente) e, gulosamente, a que cobre mais ambientes descobertos primeiro —
 * com o extintor padrão das premissas (que cobre as classes do agente dele).
 */
/**
 * A capacidade que a proposta lança: a do padrão, ou — se ela fica abaixo da mínima do risco nas
 * classes do agente — a mínima do risco (TABELA_DO_RISCO_DE_EXTINTOR, CONFERIR NA IT). A carga do
 * padrão só acompanha quando a capacidade não precisou subir.
 */
export function capacidadeDoRisco(hip: HipotesesDeExtintores, risco: RiscoDeExtintor): { capacidade: string; carga: number | null } {
  const linha = TABELA_DO_RISCO_DE_EXTINTOR[risco];
  const classes = CLASSES_DO_AGENTE[hip.agentePadrao];
  const cap = lerCapacidade(hip.capacidadePadrao) ?? { A: null, B: null, C: false };
  const A = classes.includes('A') ? Math.max(cap.A ?? 0, linha.minimaA) : null;
  const B = classes.includes('B') ? Math.max(cap.B ?? 0, linha.minimaB) : null;
  const subiu = (A != null && A !== cap.A) || (B != null && B !== cap.B);
  if (!subiu) return { capacidade: hip.capacidadePadrao, carga: hip.cargaPadraoKg };
  const partes = [A != null ? `${A}-A` : null, B != null ? `${B}-B` : null, classes.includes('C') ? 'C' : null].filter(Boolean);
  return { capacidade: partes.join(':'), carga: null };
}

export function proporExtintores(model: BlueprintModel, analise: AnaliseDeExtintores, hip: HipotesesDeExtintores): PropostaDeExtintores {
  const classesDoPadrao = CLASSES_DO_AGENTE[hip.agentePadrao];
  const faltam = analise.ambientes.filter((a) => !a.atende);
  // D1.2 (IT 16, 5.2.2.9): o pavimento com a entrada longe de extintor também pede um.
  const entradas = new Set((analise.entradasLonge ?? []).map((e) => e.levelId));
  if (!faltam.length && !entradas.size) return { comandos: [], pontos: [], semCobertura: [], motivo: 'todos os ambientes já estão cobertos' };
  // D1.2: o alcance é POR CLASSE e pela capacidade (IT 16, Tabelas 4 a 6) — o do extintor lançado
  // (a capacidade mínima do risco) e, nos existentes, o da capacidade de cada um.
  const { capacidade, carga } = capacidadeDoRisco(hip, analise.risco);
  const capProposta = lerCapacidade(capacidade);
  const alcanceMm = (classes: readonly ClasseDeFogo[], cap: ReturnType<typeof lerCapacidade>) =>
    hip.distanciaMaximaM != null ? hip.distanciaMaximaM * 1000 : Math.min(...classes.map((c) => (limiteDaClasse(c, analise.risco, cap) ?? 0) * 1000));
  const pontos: { levelId: ObjectId; at: Point }[] = [];
  const semCobertura: string[] = [];
  for (const levelId of [...new Set([...faltam.map((a) => a.levelId), ...entradas])]) {
    const rede = redeDoPavimento(model, levelId);
    const porId = new Map(rede.espacos.map((s) => [s.id, s]));
    // As que faltam, e só nas classes que o extintor padrão combate.
    const alvo = faltam.filter((a) => a.levelId === levelId);
    const pendentes = new Set(alvo.filter((a) => a.classes.every((c) => classesDoPadrao.includes(c))).map((a) => a.spaceId));
    for (const a of alvo) if (!pendentes.has(a.spaceId)) semCobertura.push(`${a.rotulo}: o extintor padrão não combate ${a.classes.filter((c) => !classesDoPadrao.includes(c)).join(', ')}`);
    // Candidatas: o centro de cada ambiente e, junto de cada porta, AO LADO DO BATENTE (meia porta + 30 cm
    // ao longo da parede) e 40 cm para dentro de cada lado.
    // ⚠️ "30 cm ao lado do centro da porta" ainda caía DENTRO do vão (porta de 90 cm) e no eixo da parede —
    // o harness `extintores` mostrou dois extintores no meio da porta. Agora: fora do vão e com folga da parede.
    const candidatas: { ponto: Point; space: Space }[] = [];
    const comFolga = (s: Space, q: Point) => pointInPolygon(s.ring, q) && distanciaABorda(s, q) >= 150;
    for (const s of rede.espacos) {
      // ⚠️ A1 (plano pós-roadmap): o centro ARREDONDADO, como o kernel vai pô-lo. Medido sem
      // arredondar, um centro em meio mm "cobria" a 0,7 mm do limite e a peça caía fora.
      const c0 = candidatosDoAmbiente(s).centro;
      const centro = { x: Math.round(c0.x), y: Math.round(c0.y) };
      if (comFolga(s, centro)) candidatas.push({ ponto: centro, space: s });
      for (const p of rede.portais.get(s.id) ?? []) {
        const w = model.walls.find((x) => x.id === p.parede);
        const o = model.openings.find((x) => x.id === p.chave);
        if (!w || !o) continue;
        const c = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
        const u = { x: (w.b.x - w.a.x) / c, y: (w.b.y - w.a.y) / c };
        const nrm = { x: -u.y, y: u.x };
        const lado = o.widthMm / 2 + 300;
        for (const sl of [1, -1]) {
          for (const sn of [1, -1]) {
            const q = { x: Math.round(p.ponto.x + u.x * lado * sl + nrm.x * 400 * sn), y: Math.round(p.ponto.y + u.y * lado * sl + nrm.y * 400 * sn) };
            if (comFolga(s, q)) candidatas.push({ ponto: q, space: s });
          }
        }
      }
    }
    // ⚠️ A1: também os próprios pontos dos ambientes pendentes, 30 cm para dentro rumo ao centro —
    // sem eles, o braço de um L (ou o fundo de um salão) além do alcance da porta e do centro ficava
    // sem posição, e a proposta não fechava a própria análise.
    for (const id of pendentes) {
      const s = porId.get(id)!;
      const c0 = candidatosDoAmbiente(s).centro;
      for (const p of pontosDeCobertura(s)) {
        const d = Math.hypot(c0.x - p.x, c0.y - p.y) || 1;
        const k = Math.min(300, d) / d;
        const q = { x: Math.round(p.x + (c0.x - p.x) * k), y: Math.round(p.y + (c0.y - p.y) * k) };
        if (comFolga(s, q)) candidatas.push({ ponto: q, space: s });
      }
    }
    // A cobertura é por PONTO (ver `pontosDeCobertura`): um corredor longo precisa de mais de um extintor.
    const unidades = new Map<string, { spaceId: ObjectId; ponto: Point }>();
    for (const id of pendentes) pontosDeCobertura(porId.get(id)!).forEach((p, k) => unidades.set(`${id}|${k}`, { spaceId: id, ponto: p }));
    // O que JÁ está coberto pelos extintores existentes não precisa de outro — mas só conta o que
    // combate TODAS as classes do ambiente daquela unidade, com a MESMA regra da análise (sem agente:
    // só A). ⚠️ A1: antes o sem agente valia para tudo aqui e só para A lá — a cozinha ao lado dele
    // ficava reprovada e a proposta nunca a cobria.
    const classesDoExistente = (t: Terminal) => (t.agenteExtintor ? CLASSES_DO_AGENTE[t.agenteExtintor] : (['A'] as const));
    const existentesDoNivel = (model.terminais ?? [])
      .filter((t) => ehExtintor(t) && t.levelId === levelId)
      .map((t) => ({ t, ponto: t.at, space: rede.espacos.find((s) => pointInPolygon(s.ring, t.at)) }))
      .filter((x): x is { t: Terminal; ponto: Point; space: Space } => !!x.space);
    const classesDaSala = new Map(alvo.map((a) => [a.spaceId, a.classes]));
    // Os existentes que combatem todas as classes da sala, agrupados pelo alcance que a capacidade lhes dá.
    const gruposPorConjunto = new Map<string, { limiteMm: number; origens: { ponto: Point; space: Space }[]; dist: Map<string, number> }[]>();
    for (const [k, u] of unidades) {
      const precisa = classesDaSala.get(u.spaceId) ?? ['A'];
      const chave = [...precisa].sort().join('');
      let grupos = gruposPorConjunto.get(chave);
      if (!grupos) {
        const porLimite = new Map<number, { ponto: Point; space: Space }[]>();
        for (const x of existentesDoNivel) {
          if (!precisa.every((c) => (classesDoExistente(x.t) as readonly string[]).includes(c))) continue;
          const lim = alcanceMm(precisa, lerCapacidade(x.t.capacidadeExtintora));
          if (lim > 0) porLimite.set(lim, [...(porLimite.get(lim) ?? []), { ponto: x.ponto, space: x.space }]);
        }
        grupos = [...porLimite].map(([limiteMm, origens]) => ({ limiteMm, origens, dist: distanciasAosPortais(rede, origens) }));
        gruposPorConjunto.set(chave, grupos);
      }
      if (grupos.some((g) => distanciaDoPonto(rede, porId.get(u.spaceId)!, u.ponto, g.origens, g.dist) <= g.limiteMm + 1e-6)) unidades.delete(k);
    }
    // O alcance do extintor LANÇADO em cada sala pendente: o menor entre as classes dela.
    const alcanceDaSala = new Map([...pendentes].map((id) => [id, alcanceMm(classesDaSala.get(id) ?? ['A'], capProposta)]));
    const cobre = new Map<number, Set<string>>();
    candidatas.forEach((c, i) => {
      const dist = distanciasAosPortais(rede, [c]);
      const set = new Set<string>();
      for (const [k, u] of unidades) if (distanciaDoPonto(rede, porId.get(u.spaceId)!, u.ponto, [c], dist) <= (alcanceDaSala.get(u.spaceId) ?? 0) + 1e-6) set.add(k);
      cobre.set(i, set);
    });
    while (unidades.size) {
      let melhor = -1;
      let quantos = 0;
      for (const [i, set] of cobre) {
        let n = 0;
        for (const k of set) if (unidades.has(k)) n++;
        if (n > quantos) (melhor = i, quantos = n);
      }
      if (melhor < 0) break;
      pontos.push({ levelId, at: candidatas[melhor].ponto });
      for (const k of cobre.get(melhor)!) unidades.delete(k);
    }
    for (const id of new Set([...unidades.values()].map((u) => u.spaceId))) semCobertura.push(`${porId.get(id)?.name || id}: nenhuma posição cobre (ambiente sem porta, ou maior que o alcance)`);
    // D1.2 (IT 16, 5.2.2.9): um extintor a até 10 m da entrada do pavimento — se nem os existentes nem
    // os lançados agora chegam, um junto da entrada (meio metro para dentro, rumo ao centro do ambiente).
    const doPavimento = [...existentesDoNivel.map((x) => ({ ponto: x.ponto, space: x.space })), ...pontos.filter((p) => p.levelId === levelId).map((p) => ({ ponto: p.at, space: rede.espacos.find((x) => pointInPolygon(x.ring, p.at))! })).filter((x) => !!x.space)];
    const ents = entradasDoPavimento(model, levelId, rede);
    if (ents.length && model.spaces.some((x) => x.levelId === levelId)) {
      const dist = distanciasAosPortais(rede, doPavimento);
      const perto = doPavimento.length && ents.some((e) => distanciaDoPonto(rede, e.space, e.ponto, doPavimento, dist) <= DISTANCIA_DA_ENTRADA_M * 1000 + 1e-6);
      if (!perto) {
        const e = ents[0];
        const c0 = candidatosDoAmbiente(e.space).centro;
        const d = Math.hypot(c0.x - e.ponto.x, c0.y - e.ponto.y) || 1;
        const k = Math.min(500, d) / d;
        const q = { x: Math.round(e.ponto.x + (c0.x - e.ponto.x) * k), y: Math.round(e.ponto.y + (c0.y - e.ponto.y) * k) };
        if (comFolga(e.space, q)) pontos.push({ levelId, at: q });
        else semCobertura.push(`${e.space.name || 'Entrada'}: sem lugar para o extintor junto da entrada (IT 16, 5.2.2.9)`);
      }
    }
  }
  // ⚠️ A1: a capacidade lançada é a que a ANÁLISE aceita no risco. O padrão (2-A:20-B:C) abaixo da
  // mínima do risco (médio: 3-A, 40-B) era lançado e reprovado pela própria análise. Subindo a
  // capacidade, a carga declarada do padrão deixa de valer (a carga de um 3-A é do fabricante) e
  // a peça sai sem ela.
  const comandos = pontos.map(
    (p) =>
      ({
        type: 'AddTerminal',
        levelId: p.levelId,
        disciplina: 'INCENDIO',
        tipo: 'EXTINTOR',
        tipoHidraulico: 'EXTINTOR',
        at: { ...p.at },
        cotaMm: 1600,
        agenteExtintor: hip.agentePadrao,
        ...(carga != null ? { cargaExtintorKg: carga } : {}),
        capacidadeExtintora: capacidade,
      }) as Command,
  );
  return { comandos, pontos, semCobertura, motivo: comandos.length ? null : 'nenhuma posição cobre os ambientes que faltam' };
}
