/**
 * DETECÇÃO E ALARME (01/10/2026, E7.4 do roadmap de incêndio).
 *
 *  - DETECTORES: com a detecção exigida (E0), todo ponto de cada ambiente
 *    (exceto banheiro e lavabo) a até o raio de cobertura de um detector DO
 *    MESMO AMBIENTE (a fumaça não atravessa parede): fumaça 6,3 m, temperatura
 *    4,2 m. Na cozinha e na garagem, o de temperatura (o de fumaça dispara à toa).
 *  - ACIONADORES: a distância a percorrer — pelas portas, contornando paredes —
 *    de qualquer ponto até um acionador manual, no máximo 30 m.
 *  - AVISADOR: ao menos um em cada pavimento com dispositivo do sistema.
 *  - LAÇO: tudo aponta uma central; dispositivo fora do laço e sistema sem
 *    central são ditos.
 * A PROPOSTA lança detectores numa malha por ambiente, acionadores pela
 * cobertura (gulosa), um avisador por pavimento e — se não há — a central
 * junto da saída, já com o laço (os ids que o lote cria são previstos e
 * conferidos), num lote só.
 *
 * NORMA: a IT 14 do CBMMG (transcrição `docs/normas/incendio-mg/it14-itens.txt`) fixa os 30 m até
 * o acionador (5.8), um acionador por pavimento (5.11), o acionador a 0,90–1,35 m (5.10) e a central
 * a 1,40–1,60 m em pé ou 0,90–1,20 m sentado (5.6.3). Os parâmetros dos detectores seguem a NBR
 * 17240 (5.21) — os raios de 6,3 e 4,2 m e o cone de chama seguem CONFERIR NA NBR 17240.
 */
import { applyBatch, pointInPolygon, type BlueprintModel, type Command, type ObjectId, type Point, type Space, type Terminal } from './blueprintKernel';
import { usoDoNome } from './blueprintPrograma';
import { construirGrafoEspacial } from './blueprintGrafoEspacial';
import { distanciaABorda, distanciaDoPonto, distanciasAosPortais, pontosDeCobertura, redeDoPavimento } from './blueprintExtintores';
import { candidatosDoAmbiente } from './blueprintRotaDeFuga';

export const FONTE_ALARME = 'IT 14 do CBMMG (5.6.3, 5.8, 5.10, 5.11) e NBR 17240 (detectores — CONFERIR)';
/** NBR 17240 (a IT 14, 5.21, remete a ela) — CONFERIR NA NBR 17240. */
export const RAIO_DO_DETECTOR_MM = { DETECTOR_FUMACA: 6300, DETECTOR_TEMPERATURA: 4200 } as const;
/** IT 14, 5.10: o acionador manual entre 0,90 e 1,35 m do piso. */
export const ALTURA_DO_ACIONADOR_MM = { min: 900, max: 1350 } as const;
/** IT 14, 5.6.3: a interface da central entre 1,40 e 1,60 m (em pé) ou 0,90 e 1,20 m (sentado). */
export const ALTURAS_DA_CENTRAL_MM = [{ min: 1400, max: 1600 }, { min: 900, max: 1200 }] as const;
/**
 * F4 (pós-roadmap, 0.89.0): o detector de CHAMA vê um CONE à frente — a rotação da peça é o eixo.
 * Alcance e abertura CONFERIR NA NBR 17240 / fabricante (o cone real depende da chama de referência).
 */
export const CONE_DO_DETECTOR_DE_CHAMA = { alcanceMm: 15000, aberturaGraus: 90 } as const;
type TipoDeDetector = 'DETECTOR_FUMACA' | 'DETECTOR_TEMPERATURA' | 'DETECTOR_CHAMA';

/**
 * O detector `d` (posição, tipo e rotação) cobre o ponto `p`? Círculo no de fumaça/temperatura,
 * cone no de chama. A MESMA função na análise e na proposta (a lei da Fase A).
 */
export function detectorCobre(d: { at: Point; tipo: string; rotacaoGraus?: number | null }, p: Point): boolean {
  const dx = p.x - d.at.x;
  const dy = p.y - d.at.y;
  const dist = Math.hypot(dx, dy);
  if (d.tipo === 'DETECTOR_CHAMA') {
    if (dist > CONE_DO_DETECTOR_DE_CHAMA.alcanceMm + 1e-6) return false;
    if (dist < 1) return true;
    const eixo = ((d.rotacaoGraus ?? 0) * Math.PI) / 180;
    const cos = (dx * Math.cos(eixo) + dy * Math.sin(eixo)) / dist;
    return cos >= Math.cos(((CONE_DO_DETECTOR_DE_CHAMA.aberturaGraus / 2) * Math.PI) / 180) - 1e-9;
  }
  const raio = RAIO_DO_DETECTOR_MM[d.tipo as keyof typeof RAIO_DO_DETECTOR_MM];
  return raio != null && dist <= raio + 1e-6;
}
/** IT 14, 5.8: de qualquer ponto até o acionador mais próximo, no máximo 30 m. */
export const DISTANCIA_ATE_ACIONADOR_MM = 30000;

const SEM_DETECCAO = new Set(['BANHEIRO', 'LAVABO']);
const PEDE_TEMPERATURA = /garagem|estacionamento/i;
/** F4: onde a chama vem antes da fumaça (líquido inflamável, combustível, gerador) — CONFERIR NA NBR 17240. */
const PEDE_CHAMA = /inflam[aá]ve|combust[ií]ve|diesel|gerador/i;
const ehTipo = (t: Terminal, tipos: readonly string[]) => t.disciplina === 'INCENDIO' && !!t.tipoHidraulico && tipos.includes(t.tipoHidraulico);
const DO_LACO = ['DETECTOR_FUMACA', 'DETECTOR_TEMPERATURA', 'DETECTOR_CHAMA', 'ACIONADOR_MANUAL', 'AVISADOR'] as const;
const DETECTORES = ['DETECTOR_FUMACA', 'DETECTOR_TEMPERATURA', 'DETECTOR_CHAMA'] as const;

/** O detector que o ambiente pede, ou `null` (banheiro, lavabo). */
export function detectorDoAmbiente(s: Space): TipoDeDetector | null {
  const u = usoDoNome(s.name);
  if (u && SEM_DETECCAO.has(u)) return null;
  if (PEDE_CHAMA.test(s.name ?? '')) return 'DETECTOR_CHAMA';
  return u === 'COZINHA' || PEDE_TEMPERATURA.test(s.name ?? '') ? 'DETECTOR_TEMPERATURA' : 'DETECTOR_FUMACA';
}

export interface AmbienteDetectado {
  spaceId: ObjectId;
  levelId: ObjectId;
  rotulo: string;
  detector: TipoDeDetector;
  /** Pontos do ambiente fora do raio de qualquer detector dele. */
  descobertos: number;
  atende: boolean;
}

export interface AnaliseDeAlarme {
  deteccaoExigida: boolean;
  alarmeExigido: boolean;
  ambientes: AmbienteDetectado[];
  /** Ambientes cujo pior ponto fica a mais de 30 m de um acionador (m; `null` = nenhum acionador no pavimento). */
  longeDoAcionador: { spaceId: ObjectId; rotulo: string; distanciaM: number | null }[];
  pavimentosSemAvisador: { levelId: ObjectId; nome: string }[];
  /** D1.2 (IT 14, 5.11): pavimentos ocupados sem acionador manual (com alarme exigido ou sistema lançado). */
  pavimentosSemAcionador?: { levelId: ObjectId; nome: string }[];
  /** D1.2 (IT 14, 5.10 e 5.6.3): acionadores e centrais fora da altura. */
  foraDaAltura?: ObjectId[];
  semCentral: boolean;
  foraDoLaco: ObjectId[];
  fonte: string;
}

export function analisarAlarme(model: BlueprintModel, deteccaoExigida: boolean, alarmeExigido: boolean): AnaliseDeAlarme {
  const ts = model.terminais ?? [];
  const detectores = ts.filter((t) => ehTipo(t, DETECTORES));
  const acionadores = ts.filter((t) => ehTipo(t, ['ACIONADOR_MANUAL']));
  const doLaco = ts.filter((t) => ehTipo(t, DO_LACO));
  const centrais = ts.filter((t) => ehTipo(t, ['CENTRAL_ALARME']));
  const temSistema = doLaco.length > 0 || centrais.length > 0;

  const ambientes: AmbienteDetectado[] = [];
  if (deteccaoExigida || detectores.length) {
    model.spaces.forEach((s, i) => {
      const tipo = detectorDoAmbiente(s);
      if (!tipo) return;
      const dele = detectores.filter((d) => d.levelId === s.levelId && pointInPolygon(s.ring, d.at));
      const descobertos = pontosDeCobertura(s).filter((p) => !dele.some((d) => detectorCobre({ at: d.at, tipo: d.tipoHidraulico!, rotacaoGraus: d.rotacaoGraus }, p))).length;
      ambientes.push({ spaceId: s.id, levelId: s.levelId, rotulo: s.name || `Ambiente ${i + 1}`, detector: tipo, descobertos, atende: descobertos === 0 });
    });
  }

  const longeDoAcionador: AnaliseDeAlarme['longeDoAcionador'] = [];
  if (alarmeExigido || acionadores.length) {
    for (const l of model.levels) {
      const rede = redeDoPavimento(model, l.id);
      if (!rede.espacos.length) continue;
      const origens = acionadores
        .filter((a) => a.levelId === l.id)
        .map((a) => ({ ponto: a.at, space: rede.espacos.find((s) => pointInPolygon(s.ring, a.at)) }))
        .filter((x): x is { ponto: Point; space: Space } => !!x.space);
      const dist = distanciasAosPortais(rede, origens);
      rede.espacos.forEach((s, i) => {
        const pior = origens.length ? Math.max(...pontosDeCobertura(s).map((p) => distanciaDoPonto(rede, s, p, origens, dist))) : Infinity;
        if (pior > DISTANCIA_ATE_ACIONADOR_MM + 1e-6) longeDoAcionador.push({ spaceId: s.id, rotulo: s.name || `Ambiente ${i + 1} (${l.name})`, distanciaM: Number.isFinite(pior) ? pior / 1000 : null });
      });
    }
  }

  const comDispositivo = new Set(doLaco.map((t) => t.levelId));
  const comAvisador = new Set(ts.filter((t) => ehTipo(t, ['AVISADOR'])).map((t) => t.levelId));
  const exigeAvisador = (id: ObjectId) => comDispositivo.has(id) || (alarmeExigido && model.spaces.some((s) => s.levelId === id));
  const pavimentosSemAvisador = model.levels.filter((l) => exigeAvisador(l.id) && !comAvisador.has(l.id)).map((l) => ({ levelId: l.id, nome: l.name }));
  // IT 14, 5.11: um acionador por pavimento ocupado.
  const comAcionador = new Set(acionadores.map((t) => t.levelId));
  const pavimentosSemAcionador =
    alarmeExigido || acionadores.length
      ? model.levels.filter((l) => model.spaces.some((s) => s.levelId === l.id) && !comAcionador.has(l.id)).map((l) => ({ levelId: l.id, nome: l.name }))
      : [];
  // IT 14, 5.10 e 5.6.3: as alturas.
  const dentro = (v: number, f: { min: number; max: number }) => v >= f.min - 1e-6 && v <= f.max + 1e-6;
  const foraDaAltura = [
    ...acionadores.filter((t) => !dentro(t.cotaMm, ALTURA_DO_ACIONADOR_MM)),
    ...centrais.filter((t) => !ALTURAS_DA_CENTRAL_MM.some((f) => dentro(t.cotaMm, f))),
  ].map((t) => t.id);
  return {
    pavimentosSemAcionador,
    foraDaAltura,
    deteccaoExigida,
    alarmeExigido,
    ambientes,
    longeDoAcionador,
    pavimentosSemAvisador,
    semCentral: (temSistema || alarmeExigido || deteccaoExigida) && centrais.length === 0,
    foraDoLaco: doLaco.filter((t) => !t.centralAlarmeId).map((t) => t.id),
    fonte: FONTE_ALARME,
  };
}

// ─── A proposta ──────────────────────────────────────────────────────────────

const novo = (levelId: ObjectId, tipo: string, at: Point, cotaMm: number, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: { x: Math.round(at.x), y: Math.round(at.y) }, cotaMm, ...extra }) as Command;

/** A malha de detectores do ambiente: células quadradas inscritas no círculo de cobertura, centro dentro. */
function malhaDeDetectores(s: Space, raio: number): Point[] {
  const lado = raio * Math.SQRT2;
  const xs = s.ring.map((p) => p.x);
  const ys = s.ring.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const nx = Math.max(1, Math.ceil((x1 - x0) / lado - 1e-9));
  const ny = Math.max(1, Math.ceil((y1 - y0) / lado - 1e-9));
  const r: Point[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const p = { x: x0 + ((i + 0.5) * (x1 - x0)) / nx, y: y0 + ((j + 0.5) * (y1 - y0)) / ny };
      if (pointInPolygon(s.ring, p)) r.push(p);
      else {
        // Célula com o centro fora (ambiente em L): o ponto interior do ambiente mais perto do centro dela.
        const q = candidatosDoAmbiente(s).candidatos.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a), candidatosDoAmbiente(s).centro);
        if (pointInPolygon(s.ring, q) && !r.some((z) => Math.hypot(z.x - q.x, z.y - q.y) < 500)) r.push(q);
      }
    }
  }
  return r;
}

export function proporAlarme(model: BlueprintModel, a: AnaliseDeAlarme): Command[] {
  const lote: Command[] = [];
  const centrais = (model.terminais ?? []).filter((t) => ehTipo(t, ['CENTRAL_ALARME']));
  // A central: a existente, ou uma nova junto da porta para fora do pavimento mais baixo com saída.
  let centralId: ObjectId | null = centrais[0]?.id ?? null;
  if (!centralId && (a.semCentral || a.ambientes.some((x) => !x.atende) || a.longeDoAcionador.length)) {
    const niveis = [...model.levels].sort((x, y) => x.elevationMm - y.elevationMm);
    for (const l of niveis) {
      const g = construirGrafoEspacial(model, l.id);
      const saida = g.saidas[0];
      const s = saida ? model.spaces.find((x) => x.id === saida.de) : null;
      if (!saida || !s) continue;
      const q = candidatosDoAmbiente(s).candidatos.reduce((m, c) => (Math.hypot(c.x - saida.ponto.x, c.y - saida.ponto.y) < Math.hypot(m.x - saida.ponto.x, m.y - saida.ponto.y) ? c : m));
      const cmd = novo(l.id, 'CENTRAL_ALARME', q, 1500);
      const antes = new Set((model.terminais ?? []).map((t) => t.id));
      centralId = (applyBatch(model, [cmd]).model.terminais ?? []).find((t) => !antes.has(t.id))?.id ?? null;
      lote.push(cmd);
      break;
    }
  }
  const laco = centralId ? { centralAlarmeId: centralId } : {};
  // Detectores: cobrir os MESMOS pontos que a análise mede (`pontosDeCobertura`), descontando os
  // detectores que já estão no ambiente — guloso, sobre posições JÁ arredondadas: a malha e os
  // próprios pontos descobertos puxados para dentro. ⚠️ A1 (plano pós-roadmap): antes a malha
  // entrava INTEIRA a cada clique; no L estreito ela não cobria, e cada clique empilhava outra.
  for (const amb of a.ambientes.filter((x) => !x.atende)) {
    const s = model.spaces.find((x) => x.id === amb.spaceId)!;
    const existentes = (model.terminais ?? []).filter((t) => ehTipo(t, DETECTORES) && t.levelId === s.levelId && pointInPolygon(s.ring, t.at));
    let faltam = pontosDeCobertura(s).filter((p) => !existentes.some((t) => detectorCobre({ at: t.at, tipo: t.tipoHidraulico!, rotacaoGraus: t.rotacaoGraus }, p)));
    const c0 = candidatosDoAmbiente(s).centro;
    const paraDentro = (p: Point): Point => {
      const d = Math.hypot(c0.x - p.x, c0.y - p.y) || 1;
      const k = Math.min(300, d) / d;
      return { x: Math.round(p.x + (c0.x - p.x) * k), y: Math.round(p.y + (c0.y - p.y) * k) };
    };
    // Candidatas: a malha (no de chama, os cantos do ambiente, olhando para o centro — o cone
    // cobre o ambiente a partir da quina) e os próprios pontos descobertos puxados para dentro.
    const chama = amb.detector === 'DETECTOR_CHAMA';
    const rumoAoCentro = (p: Point) => Math.round((Math.atan2(c0.y - p.y, c0.x - p.x) * 180) / Math.PI);
    const bases = chama ? [...s.ring.map(paraDentro), ...faltam.map(paraDentro)] : [...malhaDeDetectores(s, RAIO_DO_DETECTOR_MM[amb.detector as keyof typeof RAIO_DO_DETECTOR_MM]), ...faltam.map(paraDentro)];
    const candidatas = bases
      .map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      .filter((p) => pointInPolygon(s.ring, p))
      .map((p) => ({ at: p, tipo: amb.detector as string, rotacaoGraus: chama ? rumoAoCentro(p) : null }));
    while (faltam.length) {
      let melhor: (typeof candidatas)[number] | null = null;
      let n = 0;
      for (const c of candidatas) {
        const k = faltam.filter((p) => detectorCobre(c, p)).length;
        if (k > n) (melhor = c, n = k);
      }
      if (!melhor) break; // o que nenhuma posição cobre fica dito na análise, não relançado
      lote.push(novo(amb.levelId, amb.detector, melhor.at, chama ? 2500 : 2700, { ...laco, ...(melhor.rotacaoGraus != null ? { rotacaoGraus: melhor.rotacaoGraus } : {}) }));
      const m = melhor;
      faltam = faltam.filter((p) => !detectorCobre(m, p));
    }
  }
  // Acionadores: gulosa sobre a cobertura de 30 m, candidatos ao lado das portas.
  const porNivel = new Map<ObjectId, { spaceId: ObjectId }[]>();
  for (const x of a.longeDoAcionador) {
    const s = model.spaces.find((y) => y.id === x.spaceId)!;
    porNivel.set(s.levelId, [...(porNivel.get(s.levelId) ?? []), { spaceId: s.id }]);
  }
  for (const [levelId, lista] of porNivel) {
    const rede = redeDoPavimento(model, levelId);
    const porId = new Map(rede.espacos.map((s) => [s.id, s]));
    const unidades = new Map<string, { s: Space; p: Point }>();
    for (const { spaceId } of lista) pontosDeCobertura(porId.get(spaceId)!).forEach((p, k) => unidades.set(`${spaceId}|${k}`, { s: porId.get(spaceId)!, p }));
    // ⚠️ A1: o que os acionadores EXISTENTES já alcançam não pede outro (como nos extintores) —
    // antes o ponto inalcançável mantinha o ambiente na lista e o mesmo acionador voltava a cada clique.
    const existentes = (model.terminais ?? [])
      .filter((t) => ehTipo(t, ['ACIONADOR_MANUAL']) && t.levelId === levelId)
      .map((t) => ({ ponto: t.at, space: rede.espacos.find((s) => pointInPolygon(s.ring, t.at)) }))
      .filter((x): x is { ponto: Point; space: Space } => !!x.space);
    if (existentes.length) {
      const dist = distanciasAosPortais(rede, existentes);
      for (const [k, u] of unidades) if (distanciaDoPonto(rede, u.s, u.p, existentes, dist) <= DISTANCIA_ATE_ACIONADOR_MM + 1e-6) unidades.delete(k);
    }
    const candidatas: { ponto: Point; space: Space }[] = [];
    for (const s of rede.espacos) {
      // D1.2 (IT 14, 5.11): também o centro do ambiente — o salão aberto sem porta interna (onde só
      // chega a escada) não tinha candidato, e o pavimento ficava sem acionador.
      const c0 = candidatosDoAmbiente(s).centro;
      const centro = { x: Math.round(c0.x), y: Math.round(c0.y) };
      if (pointInPolygon(s.ring, centro) && distanciaABorda(s, centro) >= 150) candidatas.push({ ponto: centro, space: s });
      for (const pt of rede.portais.get(s.id) ?? []) {
        for (const [dx, dy] of [[600, 400], [-600, 400], [600, -400], [-600, -400], [400, 600], [-400, 600], [400, -600], [-400, -600]]) {
          const q = { x: Math.round(pt.ponto.x + dx), y: Math.round(pt.ponto.y + dy) };
          if (pointInPolygon(s.ring, q) && distanciaABorda(s, q) >= 150) candidatas.push({ ponto: q, space: s });
        }
      }
    }
    const cobre = candidatas.map((c) => {
      const dist = distanciasAosPortais(rede, [c]);
      const set = new Set<string>();
      for (const [k, u] of unidades) if (distanciaDoPonto(rede, u.s, u.p, [c], dist) <= DISTANCIA_ATE_ACIONADOR_MM + 1e-6) set.add(k);
      return set;
    });
    while (unidades.size) {
      let melhor = -1;
      let n = 0;
      cobre.forEach((set, i) => {
        let k = 0;
        for (const x of set) if (unidades.has(x)) k++;
        if (k > n) (melhor = i, n = k);
      });
      if (melhor < 0) break;
      lote.push(novo(levelId, 'ACIONADOR_MANUAL', candidatas[melhor].ponto, 1200, laco));
      for (const x of cobre[melhor]) unidades.delete(x);
    }
  }
  // Avisadores: um por pavimento que não tem, no centro do maior ambiente.
  // ⚠️ F4 (a lei da Fase A pegou): os detectores/acionadores que ESTE lote lança criam o laço no
  // pavimento, e o laço exige avisador — antes ele só vinha na 2ª proposta.
  const comAvisador = new Set((model.terminais ?? []).filter((t) => ehTipo(t, ['AVISADOR'])).map((t) => t.levelId));
  const doLote = lote.filter((c) => c.type === 'AddTerminal' && (DO_LACO as readonly string[]).includes((c as { tipoHidraulico?: string }).tipoHidraulico ?? '')).map((c) => (c as { levelId: ObjectId }).levelId);
  const pedemAvisador = [...a.pavimentosSemAvisador];
  for (const id of new Set(doLote)) {
    if (comAvisador.has(id) || pedemAvisador.some((x) => x.levelId === id)) continue;
    pedemAvisador.push({ levelId: id, nome: model.levels.find((l) => l.id === id)?.name ?? id });
  }
  for (const p of pedemAvisador) {
    const s = model.spaces.filter((x) => x.levelId === p.levelId).sort((x, y) => y.areaMm2 - x.areaMm2)[0];
    if (s) lote.push(novo(p.levelId, 'AVISADOR', candidatosDoAmbiente(s).centro, 2200, laco));
  }
  // Os que já existem fora do laço entram nele.
  if (centralId) for (const id of a.foraDoLaco) lote.push({ type: 'SetTerminalProps', terminalId: id, centralAlarmeId: centralId } as Command);
  return lote;
}
