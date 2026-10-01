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
 * ⚠️ NORMA (CONFERIR NA IT de extintores do CBMMG / NBR 12693): distâncias 25,
 * 20 e 15 m (risco baixo, médio e alto) e capacidades mínimas 2-A/20-B,
 * 3-A/40-B e 4-A/80-B transcritas de memória.
 */
import { pointInPolygon, type AgenteExtintor, type BlueprintModel, type Command, type ObjectId, type Point, type Space, type Terminal } from './blueprintKernel';
import { construirGrafoEspacial } from './blueprintGrafoEspacial';
import { usoDoNome } from './blueprintPrograma';
import { caminhoDentro, candidatosDoAmbiente } from './blueprintRotaDeFuga';

export const FONTE_EXTINTORES = 'IT de extintores do CBMMG / NBR 12693 — CONFERIR NA IT (transcrito de memória)';

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
/** Distância máxima a percorrer, m, e capacidade mínima por unidade — CONFERIR NA IT. */
export const TABELA_DO_RISCO_DE_EXTINTOR: Record<RiscoDeExtintor, { distanciaM: number; minimaA: number; minimaB: number }> = {
  BAIXO: { distanciaM: 25, minimaA: 2, minimaB: 20 },
  MEDIO: { distanciaM: 20, minimaA: 3, minimaB: 40 },
  ALTO: { distanciaM: 15, minimaA: 4, minimaB: 80 },
};

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

/** A pior distância do ambiente às origens: o máximo, entre os pontos de cobertura, do menor caminho. */
function piorDistancia(rede: ReturnType<typeof redeDoPavimento>, s: Space, origens: { ponto: Point; space: Space }[], dist: Map<string, number>): number {
  let pior = 0;
  for (const c of pontosDeCobertura(s)) {
    let melhor = Infinity;
    for (const o of origens) if (o.space.id === s.id) melhor = Math.min(melhor, caminhoDentro(s, c, o.ponto)?.mm ?? Infinity);
    for (const p of rede.portais.get(s.id) ?? []) {
      const d = dist.get(p.chave);
      if (d == null) continue;
      melhor = Math.min(melhor, (caminhoDentro(s, c, p.ponto)?.mm ?? Infinity) + d);
    }
    pior = Math.max(pior, melhor);
  }
  return pior;
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

export function analisarExtintores(model: BlueprintModel, nivelDeCarga: 'BAIXA' | 'MEDIA' | 'ALTA' | null, hip: HipotesesDeExtintores): AnaliseDeExtintores {
  const { risco, motivo: motivoDoRisco } = riscoDoExtintor(nivelDeCarga);
  const linha = TABELA_DO_RISCO_DE_EXTINTOR[risco];
  const distanciaMaximaM = hip.distanciaMaximaM ?? linha.distanciaM;
  const pendencias: string[] = [];
  if (!nivelDeCarga) pendencias.push(motivoDoRisco);
  const extintores = (model.terminais ?? []).filter(ehExtintor);
  const ambientes: AmbienteDoExtintor[] = [];
  for (const l of model.levels) {
    const rede = redeDoPavimento(model, l.id);
    if (!rede.espacos.length) continue;
    const doNivel = extintores
      .map((t) => ({ t, space: rede.espacos.find((s) => pointInPolygon(s.ring, t.at)) ?? null }))
      .filter((x): x is { t: Terminal; space: Space } => !!x.space);
    // Uma rede de distâncias por classe — o extintor só conta para as classes do agente (sem agente: "a declarar", vale A).
    const porClasse = new Map<ClasseDeFogo, { origens: { ponto: Point; space: Space }[]; dist: Map<string, number> }>();
    for (const c of ['A', 'B', 'C'] as const) {
      const origens = doNivel.filter((x) => (x.t.agenteExtintor ? CLASSES_DO_AGENTE[x.t.agenteExtintor].includes(c) : c === 'A')).map((x) => ({ ponto: x.t.at, space: x.space }));
      porClasse.set(c, { origens, dist: distanciasAosPortais(rede, origens) });
    }
    rede.espacos.forEach((s, i) => {
      const { classes, motivo } = classesDoAmbiente(model, s);
      let pior = 0;
      for (const c of classes) {
        const r = porClasse.get(c)!;
        pior = Math.max(pior, r.origens.length ? piorDistancia(rede, s, r.origens, r.dist) : Infinity);
      }
      const distanciaM = Number.isFinite(pior) ? pior / 1000 : null;
      ambientes.push({ spaceId: s.id, levelId: l.id, rotulo: s.name || `Ambiente ${i + 1} (${l.name})`, classes, motivo, distanciaM, atende: distanciaM != null && distanciaM <= distanciaMaximaM + 1e-9 });
    });
  }
  const conferidos: ExtintorConferido[] = extintores.map((t) => {
    const classes = t.agenteExtintor ? CLASSES_DO_AGENTE[t.agenteExtintor] : [];
    const cap = lerCapacidade(t.capacidadeExtintora);
    const capacidadeAtende = !t.agenteExtintor || !cap ? null : (!classes.includes('A') || (cap.A ?? 0) >= linha.minimaA) && (!classes.includes('B') || (cap.B ?? 0) >= linha.minimaB) && (!classes.includes('C') || cap.C);
    return { terminalId: t.id, agente: t.agenteExtintor ?? null, classes, capacidade: t.capacidadeExtintora ?? null, capacidadeAtende };
  });
  if (extintores.some((t) => !t.agenteExtintor)) pendencias.push('há extintor sem agente declarado — conta só para a classe A');
  const ocupados = new Set(model.spaces.map((s) => s.levelId));
  const comExtintor = new Set(extintores.map((t) => t.levelId));
  const pavimentosSemExtintor = model.levels.filter((l) => ocupados.has(l.id) && !comExtintor.has(l.id)).map((l) => ({ levelId: l.id, nome: l.name }));
  return { risco, motivoDoRisco, distanciaMaximaM, ambientes, extintores: conferidos, pavimentosSemExtintor, pendencias, fonte: FONTE_EXTINTORES };
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
export function proporExtintores(model: BlueprintModel, analise: AnaliseDeExtintores, hip: HipotesesDeExtintores): PropostaDeExtintores {
  const classesDoPadrao = CLASSES_DO_AGENTE[hip.agentePadrao];
  const faltam = analise.ambientes.filter((a) => !a.atende);
  if (!faltam.length) return { comandos: [], pontos: [], semCobertura: [], motivo: 'todos os ambientes já estão cobertos' };
  const limiteMm = analise.distanciaMaximaM * 1000;
  const pontos: { levelId: ObjectId; at: Point }[] = [];
  const semCobertura: string[] = [];
  for (const levelId of [...new Set(faltam.map((a) => a.levelId))]) {
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
      const { centro } = candidatosDoAmbiente(s);
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
    // A cobertura é por PONTO (ver `pontosDeCobertura`): um corredor longo precisa de mais de um extintor.
    const unidades = new Map<string, { spaceId: ObjectId; ponto: Point }>();
    for (const id of pendentes) pontosDeCobertura(porId.get(id)!).forEach((p, k) => unidades.set(`${id}|${k}`, { spaceId: id, ponto: p }));
    // O que JÁ está coberto pelos extintores existentes não precisa de outro.
    const existentes = (model.terminais ?? [])
      .filter((t) => t.levelId === levelId && t.tipoHidraulico === 'EXTINTOR' && (!t.agenteExtintor || classesDoPadrao.every((c) => CLASSES_DO_AGENTE[t.agenteExtintor!].includes(c))))
      .map((t) => ({ ponto: t.at, space: rede.espacos.find((s) => pointInPolygon(s.ring, t.at)) }))
      .filter((x): x is { ponto: Point; space: Space } => !!x.space);
    if (existentes.length) {
      const dist = distanciasAosPortais(rede, existentes);
      for (const [k, u] of unidades) if (distanciaDoPonto(rede, porId.get(u.spaceId)!, u.ponto, existentes, dist) <= limiteMm + 1e-6) unidades.delete(k);
    }
    const cobre = new Map<number, Set<string>>();
    candidatas.forEach((c, i) => {
      const dist = distanciasAosPortais(rede, [c]);
      const set = new Set<string>();
      for (const [k, u] of unidades) if (distanciaDoPonto(rede, porId.get(u.spaceId)!, u.ponto, [c], dist) <= limiteMm + 1e-6) set.add(k);
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
  }
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
        cargaExtintorKg: hip.cargaPadraoKg,
        capacidadeExtintora: hip.capacidadePadrao,
      }) as Command,
  );
  return { comandos, pontos, semCobertura, motivo: comandos.length ? null : 'nenhuma posição cobre os ambientes que faltam' };
}
