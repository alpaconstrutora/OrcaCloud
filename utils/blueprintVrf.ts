/**
 * VRF (05/10/2026, E6 do roadmap de climatização).
 *
 * O SISTEMA é a relação que já existe desde a E3: cada evaporadora (e cada
 * derivador) aponta a sua condensadora por `condensadoraId`; uma CONDENSADORA_VRF
 * com N evaporadoras É o sistema VRF. Nada novo é gravado no kernel — o nome do
 * sistema é o rótulo/número da condensadora (CD-n), e trocar a condensadora é um
 * lote de `SetTerminalProps` (`comandosTrocarCondensadora`).
 *
 *  - E6.2 PRÉ-DIMENSIONAMENTO: a taxa de combinação (Σ evaporadoras ÷
 *    condensadora), o DERIVADOR em cada nó onde a rede se divide, escolhido pelo
 *    somatório das evaporadoras a JUSANTE, e o diâmetro de cada trecho pelo
 *    mesmo somatório — tabelas típicas de catálogo (HIPÓTESE, CONFERIR).
 *  - E6.3 LIMITES E TRAÇADO: comprimento total, até a mais distante, após a 1ª
 *    derivação, desníveis (hipóteses editáveis); o traçado é UMA árvore de
 *    Steiner pelo eixo das paredes (`arvorePelasParedes` com todas as
 *    evaporadoras como pendentes), com o pilar como custo. As arestas já saem
 *    orientadas da raiz para fora, e é isso que dá o "a jusante".
 *
 * A análise lê a rede EXISTENTE (o grafo dos trechos FRIGORIGENA a partir da
 * condensadora), então confere tanto o traçado automático quanto o desenhado à
 * mão. Tudo nasce `sugerido`, com o rótulo `ROTULO_DA_LINHA_VRF` — relançar apaga
 * só o que é do VRF (a linha do split, a E5, fica).
 *
 * ⚠️ Limite desta etapa: o sistema num pavimento só. A evaporadora em outro
 * pavimento é acusada (a prumada entre pavimentos fica para depois).
 */
import type { BlueprintModel, Command, ObjectId, Terminal, Trecho } from './blueprintKernel';
import { TIPOS_DE_EVAPORADORA, applyBatch } from './blueprintKernel';
import { comprimentoMm, fazerChave, type No } from './blueprintGrafoDeRede';
import { arvorePelasParedes, chaveP, encaixarNaParede, type P2 } from './blueprintRotaPelasParedes';
import { desvioDoPilar, pegadasDePilares } from './blueprintObstaculosEstruturais';
import type { HipotesesDaLinha, HipotesesDoVrf } from './blueprintClimatizacao';
import type { ItemConferido } from './blueprintConferenciaClimatizacao';
import { ROTULO_DA_LINHA_VRF, lote } from './blueprintLinhaFrigorigena';
import { numeracaoDeClimatizacao } from './blueprintNumeracaoClimatizacao';

export { ROTULO_DA_LINHA_VRF };

// ─── As tabelas (HIPÓTESE de catálogo) ───────────────────────────────────────

export interface DiametrosDoVrf {
  /** Somatório a jusante até o qual vale, BTU/h. */
  ateBtuH: number;
  liquidoMm: number;
  succaoMm: number;
}

/** Diâmetros de líquido/sucção pelo somatório das evaporadoras a jusante (R-410A, típico). mm inteiros: 6 = 1/4", 10 = 3/8", 13 = 1/2", 16 = 5/8", 19 = 3/4", 22 = 7/8", 29 = 1 1/8", 35 = 1 3/8", 41 = 1 5/8". */
export const DIAMETROS_DO_VRF: readonly DiametrosDoVrf[] = [
  { ateBtuH: 19100, liquidoMm: 6, succaoMm: 13 },
  { ateBtuH: 54600, liquidoMm: 10, succaoMm: 16 },
  { ateBtuH: 76400, liquidoMm: 10, succaoMm: 19 },
  { ateBtuH: 112600, liquidoMm: 13, succaoMm: 22 },
  { ateBtuH: 157000, liquidoMm: 13, succaoMm: 29 },
  { ateBtuH: 238800, liquidoMm: 16, succaoMm: 29 },
  { ateBtuH: 334000, liquidoMm: 19, succaoMm: 35 },
  { ateBtuH: 1_000_000, liquidoMm: 22, succaoMm: 41 },
];

/** O derivador (refnet) pelo somatório a jusante dele. */
export const DERIVADORES_DO_VRF: readonly { ateBtuH: number; nome: string }[] = [
  { ateBtuH: 76400, nome: 'Derivador VRF até 22,4 kW' },
  { ateBtuH: 112600, nome: 'Derivador VRF até 33 kW' },
  { ateBtuH: 238800, nome: 'Derivador VRF até 70 kW' },
  { ateBtuH: 1_000_000, nome: 'Derivador VRF acima de 70 kW' },
];

export const FONTE_DO_VRF =
  'Diâmetros por somatório a jusante, derivadores e limites de comprimento/desnível/taxa são valores típicos de catálogo VRF R-410A, transcritos de memória — HIPÓTESE. CONFERIR com o fabricante. Os comprimentos aqui são de tubulação REAL; o "equivalente" do catálogo soma as conexões.';

export const diametrosDoVrf = (btu: number): DiametrosDoVrf => DIAMETROS_DO_VRF.find((d) => btu <= d.ateBtuH) ?? DIAMETROS_DO_VRF[DIAMETROS_DO_VRF.length - 1];
export const derivadorDoVrf = (btu: number): string => (DERIVADORES_DO_VRF.find((d) => btu <= d.ateBtuH) ?? DERIVADORES_DO_VRF[DERIVADORES_DO_VRF.length - 1]).nome;
const isolamentoMm = (btu: number, hip: HipotesesDaLinha) => (btu <= 24000 ? hip.isolamentoAte24kMm : hip.isolamentoAcimaMm);

// ─── O sistema ───────────────────────────────────────────────────────────────

export interface SistemaVrf {
  condensadora: Terminal;
  nome: string;
  /** As evaporadoras ligadas a ela NO pavimento dela. */
  evaporadoras: Terminal[];
  /** Ligadas a ela, mas em outro pavimento (a prumada é backlog). */
  foraDoPavimento: Terminal[];
  derivadores: Terminal[];
}

const ehEvaporadora = (t: Terminal) => !!t.tipoHidraulico && (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico);

/** As condensadoras VRF do pavimento, cada uma com o que aponta para ela. */
export function sistemasVrfDoNivel(model: BlueprintModel, levelId: ObjectId): SistemaVrf[] {
  const numeros = numeracaoDeClimatizacao(model);
  const terminais = model.terminais ?? [];
  return terminais
    .filter((t) => t.levelId === levelId && t.tipoHidraulico === 'CONDENSADORA_VRF')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => {
      const ligados = terminais.filter((t) => t.condensadoraId === c.id);
      return {
        condensadora: c,
        nome: c.rotulo?.trim() || numeros.get(c.id)?.numero || c.tipo,
        evaporadoras: ligados.filter((t) => ehEvaporadora(t) && t.levelId === levelId),
        foraDoPavimento: ligados.filter((t) => ehEvaporadora(t) && t.levelId !== levelId),
        derivadores: ligados.filter((t) => t.tipoHidraulico === 'DERIVADOR_VRF'),
      };
    });
}

/** As evaporadoras do pavimento sem condensadora nenhuma — as que "ligar ao VRF" pega. */
export const evaporadorasSemSistema = (model: BlueprintModel, levelId: ObjectId): Terminal[] =>
  (model.terminais ?? []).filter((t) => t.levelId === levelId && ehEvaporadora(t) && !t.condensadoraId).sort((a, b) => a.id.localeCompare(b.id));

/** Liga as evaporadoras à condensadora (VRF) — um lote. */
export const comandosLigarAoVrf = (condensadoraId: ObjectId, evaporadoraIds: readonly ObjectId[]): Command[] =>
  evaporadoraIds.map((terminalId) => ({ type: 'SetTerminalProps', terminalId, condensadoraId }) as Command);

/** E6.1: troca a condensadora do sistema — toda evaporadora e todo derivador que apontava `deId` passa a apontar `paraId`. */
export const comandosTrocarCondensadora = (model: BlueprintModel, deId: ObjectId, paraId: ObjectId): Command[] =>
  (model.terminais ?? []).filter((t) => t.condensadoraId === deId).map((t) => ({ type: 'SetTerminalProps', terminalId: t.id, condensadoraId: paraId }) as Command);

// ─── E6.2/E6.3: a análise da rede existente ──────────────────────────────────

export interface TrechoDoVrf {
  trechoId: ObjectId;
  jusanteBtuH: number;
  pede: DiametrosDoVrf;
  liquidoMm: number;
  succaoMm: number;
  abaixo: boolean;
}

export interface DerivacaoDoVrf {
  no: No;
  levelId: ObjectId;
  at: P2;
  cotaMm: number;
  jusanteBtuH: number;
  temDerivador: boolean;
}

export interface AnaliseDoVrf {
  sistema: SistemaVrf;
  /** Σ das evaporadoras do pavimento; `null` se alguma não tem capacidade declarada. */
  somaBtuH: number | null;
  capacidadeBtuH: number | null;
  taxaPct: number | null;
  alcancadas: ObjectId[];
  naoAlcancadas: ObjectId[];
  trechos: TrechoDoVrf[];
  derivacoes: DerivacaoDoVrf[];
  comprimentoTotalM: number | null;
  maisDistanteM: number | null;
  aposPrimeiraDerivacaoM: number | null;
  desnivelCondEvapM: number;
  desnivelEntreEvapM: number;
}

function parseNo(no: No): { levelId: ObjectId; at: P2; cotaMm: number } {
  const [levelId, xy, cota] = no.split('|');
  const [x, y] = xy.split(',').map(Number);
  return { levelId, at: { x, y }, cotaMm: Number(cota) };
}

/** A árvore do sistema na rede FRIGORIGENA existente, a partir do nó da condensadora. */
export function analisarVrf(model: BlueprintModel, sistema: SistemaVrf): AnaliseDoVrf {
  const chave = fazerChave(model.levels);
  const noDe = (t: Terminal) => chave(t.levelId, t.at.x, t.at.y, t.cotaMm);
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const absoluta = (t: Terminal) => (elevacao.get(t.levelId) ?? 0) + t.cotaMm;
  const c = sistema.condensadora;
  const evs = sistema.evaporadoras;

  // Dijkstra com o trecho de chegada de cada nó.
  const viz = new Map<No, { para: No; mm: number; trecho: Trecho }[]>();
  for (const t of (model.trechos ?? []).filter((x) => x.disciplina === 'FRIGORIGENA')) {
    const a = chave(t.levelId, t.a.x, t.a.y, t.cotaAMm);
    const b = chave(t.levelId, t.b.x, t.b.y, t.cotaBMm);
    const mm = comprimentoMm(t);
    viz.set(a, [...(viz.get(a) ?? []), { para: b, mm, trecho: t }]);
    viz.set(b, [...(viz.get(b) ?? []), { para: a, mm, trecho: t }]);
  }
  const raiz = noDe(c);
  const dist = new Map<No, number>([[raiz, 0]]);
  const veio = new Map<No, { de: No; trecho: Trecho }>();
  const fila: No[] = [raiz];
  const feitos = new Set<No>();
  while (fila.length > 0) {
    fila.sort((x, y) => dist.get(x)! - dist.get(y)! || x.localeCompare(y));
    const k = fila.shift()!;
    if (feitos.has(k)) continue;
    feitos.add(k);
    for (const v of viz.get(k) ?? []) {
      const nd = dist.get(k)! + v.mm;
      if (nd < (dist.get(v.para) ?? Infinity) - 1e-9) {
        dist.set(v.para, nd);
        veio.set(v.para, { de: k, trecho: v.trecho });
        fila.push(v.para);
      }
    }
  }

  const alcancadas: Terminal[] = [];
  const naoAlcancadas: Terminal[] = [];
  const jusantePorTrecho = new Map<ObjectId, number>();
  const trechoPorId = new Map<ObjectId, Trecho>();
  const jusantePorNo = new Map<No, number>();
  const filhos = new Map<No, Set<ObjectId>>();
  const caminhos = new Map<ObjectId, No[]>();
  for (const e of evs) {
    const fim = noDe(e);
    if (!dist.has(fim) || fim === raiz) {
      naoAlcancadas.push(e);
      continue;
    }
    alcancadas.push(e);
    const cap = e.capacidadeBtuH ?? 0;
    const nos: No[] = [fim];
    let k = fim;
    for (let guarda = 0; guarda < 100_000 && k !== raiz; guarda++) {
      const v = veio.get(k)!;
      jusantePorTrecho.set(v.trecho.id, (jusantePorTrecho.get(v.trecho.id) ?? 0) + cap);
      trechoPorId.set(v.trecho.id, v.trecho);
      const f = filhos.get(v.de) ?? new Set<ObjectId>();
      f.add(v.trecho.id);
      filhos.set(v.de, f);
      k = v.de;
      nos.push(k);
    }
    nos.reverse();
    for (const n of nos) jusantePorNo.set(n, (jusantePorNo.get(n) ?? 0) + cap);
    caminhos.set(e.id, nos);
  }

  const derivadoresPorNo = new Set((model.terminais ?? []).filter((t) => t.tipoHidraulico === 'DERIVADOR_VRF').map(noDe));
  const nosDeDerivacao = new Set([...filhos.entries()].filter(([, f]) => f.size >= 2).map(([n]) => n));
  const derivacoes: DerivacaoDoVrf[] = [...nosDeDerivacao].sort().map((no) => ({ no, ...parseNo(no), jusanteBtuH: jusantePorNo.get(no) ?? 0, temDerivador: derivadoresPorNo.has(no) }));

  const trechos: TrechoDoVrf[] = [...jusantePorTrecho.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([trechoId, jusanteBtuH]) => {
      const t = trechoPorId.get(trechoId)!;
      const pede = diametrosDoVrf(jusanteBtuH);
      const liquidoMm = t.bitolaMm;
      const succaoMm = t.bitolaSuccaoMm ?? t.bitolaMm;
      return { trechoId, jusanteBtuH, pede, liquidoMm, succaoMm, abaixo: liquidoMm < pede.liquidoMm || succaoMm < pede.succaoMm };
    });

  let maisDistante: number | null = null;
  let aposPrimeira: number | null = null;
  for (const e of alcancadas) {
    const d = dist.get(noDe(e))!;
    maisDistante = Math.max(maisDistante ?? 0, d);
    const primeira = caminhos.get(e.id)!.find((n) => nosDeDerivacao.has(n));
    if (primeira != null) aposPrimeira = Math.max(aposPrimeira ?? 0, d - dist.get(primeira)!);
  }
  const total = trechos.length ? trechos.reduce((acc, t) => acc + comprimentoMm(trechoPorId.get(t.trechoId)!), 0) : null;
  const semCapacidade = evs.some((e) => e.capacidadeBtuH == null);
  const somaBtuH = evs.length === 0 || semCapacidade ? null : evs.reduce((acc, e) => acc + (e.capacidadeBtuH ?? 0), 0);
  const capacidadeBtuH = c.capacidadeBtuH ?? null;
  const cotas = evs.map(absoluta);
  return {
    sistema,
    somaBtuH,
    capacidadeBtuH,
    taxaPct: somaBtuH != null && capacidadeBtuH ? Math.round((somaBtuH / capacidadeBtuH) * 1000) / 10 : null,
    alcancadas: alcancadas.map((e) => e.id),
    naoAlcancadas: naoAlcancadas.map((e) => e.id),
    trechos,
    derivacoes,
    comprimentoTotalM: total == null ? null : total / 1000,
    maisDistanteM: maisDistante == null ? null : maisDistante / 1000,
    aposPrimeiraDerivacaoM: aposPrimeira == null ? null : aposPrimeira / 1000,
    desnivelCondEvapM: cotas.length ? Math.max(...cotas.map((z) => Math.abs(z - absoluta(c)))) / 1000 : 0,
    desnivelEntreEvapM: cotas.length ? (Math.max(...cotas) - Math.min(...cotas)) / 1000 : 0,
  };
}

export const analisesDoNivel = (model: BlueprintModel, levelId: ObjectId): AnaliseDoVrf[] => sistemasVrfDoNivel(model, levelId).map((s) => analisarVrf(model, s));

// ─── E6.3: o traçado em árvore ───────────────────────────────────────────────

export interface VrfPlanejado {
  condensadoraId: ObjectId;
  nome: string;
  evaporadoras: number;
  derivadores: number;
  avisos: string[];
}

export interface PlanoDoVrf {
  comandos: Command[];
  aCriar: VrfPlanejado[];
  /** Sistemas cuja árvore já alcança todas as evaporadoras com trechos confirmados. */
  jaLigados: string[];
  semLugar: { nome: string; motivo: string }[];
  apagados: number;
  motivo: string | null;
  resumo: string[];
}

const mesmoP = (a: P2, b: P2) => a.x === b.x && a.y === b.y;

/** As arestas em planta, orientadas da condensadora para fora: a árvore pelas paredes, ou a estrela em reta sem parede. */
function arvoreEmPlanta(model: BlueprintModel, levelId: ObjectId, c: Terminal, evs: readonly Terminal[], hip: HipotesesDaLinha): { arestas: { de: P2; para: P2 }[]; avisos: string[] } {
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const pegadas = pegadasDePilares(model, levelId);
  const reta = (de: P2, para: P2): { de: P2; para: P2 }[] => {
    const pts = [de, ...(desvioDoPilar(de, para, pegadas) ?? []), para];
    return pts.slice(1).map((p, i) => ({ de: pts[i], para: p }));
  };
  const avisos: string[] = [];
  const raizNaParede = paredes.length ? encaixarNaParede(c.at, paredes, 1e9) : null;
  const raio = Math.max(hip.raioDeEncaixeMm, raizNaParede ? Math.ceil(raizNaParede.d) + 1 : 0);
  const arvore = paredes.length ? arvorePelasParedes({ paredes, raiz: c.at, pendentes: evs.map((e) => e.at), raioDeEncaixeMm: raio, obstaculos: pegadas }) : null;
  if (!arvore?.raiz) {
    avisos.push('sem parede ao alcance: a rede sai em estrela, em reta, da condensadora');
    return { arestas: evs.flatMap((e) => reta(c.at, e.at)), avisos };
  }
  const arestas: { de: P2; para: P2 }[] = [];
  if (!mesmoP(c.at, arvore.raiz)) arestas.push({ de: c.at, para: arvore.raiz });
  arestas.push(...arvore.arestas);
  for (const e of evs) {
    const q = arvore.encaixe.get(chaveP(e.at));
    if (q) {
      if (!mesmoP(q, e.at)) arestas.push({ de: q, para: e.at });
    } else {
      avisos.push(`${e.tipo}: sem parede perto — ramal em reta`);
      arestas.push(...reta(arvore.raiz, e.at));
    }
  }
  return { arestas, avisos };
}

/** O plano da árvore de cada sistema VRF do pavimento ainda sem rede. */
export function planejarVrf(model: BlueprintModel, levelId: ObjectId, hipLinha: HipotesesDaLinha): PlanoDoVrf {
  const vazio = (motivo: string, apagar: Command[] = []): PlanoDoVrf => ({ comandos: apagar, aCriar: [], jaLigados: [], semLugar: [], apagados: apagar.length, motivo, resumo: [] });
  // Relançar apaga só o que é do VRF: os trechos com o rótulo dele e os derivadores sugeridos.
  const trechosSugeridos = (model.trechos ?? []).filter((t) => t.levelId === levelId && !!t.sugerido && t.disciplina === 'FRIGORIGENA' && t.rotulo === ROTULO_DA_LINHA_VRF);
  const derivadoresSugeridos = (model.terminais ?? []).filter((t) => t.levelId === levelId && !!t.sugerida && t.tipoHidraulico === 'DERIVADOR_VRF');
  const apagar: Command[] = [
    ...trechosSugeridos.map((t) => ({ type: 'DeleteTrecho', trechoId: t.id }) as Command),
    ...derivadoresSugeridos.map((t) => ({ type: 'DeleteTerminal', terminalId: t.id }) as Command),
  ];
  const ids = new Set([...trechosSugeridos.map((t) => t.id), ...derivadoresSugeridos.map((t) => t.id)]);
  const base: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !ids.has(t.id)), terminais: (model.terminais ?? []).filter((t) => !ids.has(t.id)) };
  const sistemas = sistemasVrfDoNivel(base, levelId);
  if (sistemas.length === 0) return vazio('nenhuma condensadora VRF neste pavimento — insira uma (Climatização — equipamentos) e ligue as evaporadoras a ela', apagar);

  const l = lote(base);
  const derivadores: Command[] = [];
  const aCriar: VrfPlanejado[] = [];
  const jaLigados: string[] = [];
  const semLugar: { nome: string; motivo: string }[] = [];
  const cotaLinha = Math.round(hipLinha.cotaDaLinhaMm);

  for (const s of sistemas) {
    const c = s.condensadora;
    const evs = s.evaporadoras;
    if (evs.length === 0) {
      semLugar.push({ nome: s.nome, motivo: 'nenhuma evaporadora ligada a esta condensadora neste pavimento' });
      continue;
    }
    const analise = analisarVrf(base, s);
    if (analise.naoAlcancadas.length === 0) {
      jaLigados.push(s.nome);
      continue;
    }
    if (analise.alcancadas.length > 0) {
      semLugar.push({ nome: s.nome, motivo: 'rede parcial confirmada — complete à mão ou apague a rede para relançar a árvore inteira' });
      continue;
    }
    const { arestas, avisos } = arvoreEmPlanta(base, levelId, c, evs, hipLinha);
    // O somatório a jusante de cada nó em planta (pós-ordem da árvore orientada).
    const filhos = new Map<string, P2[]>();
    for (const a of arestas) filhos.set(chaveP(a.de), [...(filhos.get(chaveP(a.de)) ?? []), a.para]);
    const capNoPonto = new Map<string, number>();
    for (const e of evs) capNoPonto.set(chaveP(e.at), (capNoPonto.get(chaveP(e.at)) ?? 0) + (e.capacidadeBtuH ?? 0));
    const soma = new Map<string, number>();
    const somar = (p: P2, vistos: Set<string>): number => {
      const k = chaveP(p);
      if (soma.has(k)) return soma.get(k)!;
      if (vistos.has(k)) return 0;
      vistos.add(k);
      const s2 = (capNoPonto.get(k) ?? 0) + (filhos.get(k) ?? []).reduce((acc, f) => acc + somar(f, vistos), 0);
      soma.set(k, s2);
      return s2;
    };
    const total = somar(c.at, new Set());
    if (evs.some((e) => e.capacidadeBtuH == null)) avisos.push('evaporadora sem capacidade declarada: o diâmetro dela sai pelo mínimo');
    const baseDe = (btu: number) => {
      const d = diametrosDoVrf(btu);
      return { levelId, disciplina: 'FRIGORIGENA' as const, bitolaMm: d.liquidoMm, bitolaSuccaoMm: d.succaoMm, isolamentoMm: isolamentoMm(btu, hipLinha), rotulo: ROTULO_DA_LINHA_VRF, sugerido: true };
    };
    l.add(baseDe(total), c.at, c.cotaMm, c.at, cotaLinha);
    for (const a of arestas) l.add(baseDe(soma.get(chaveP(a.para)) ?? 0), a.de, cotaLinha, a.para, cotaLinha);
    for (const e of evs) l.add(baseDe(e.capacidadeBtuH ?? 0), e.at, cotaLinha, e.at, e.cotaMm);
    // O derivador em cada nó onde a rede se divide, pelo somatório a jusante dele.
    let nDerivadores = 0;
    for (const [k, fs] of [...filhos.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (fs.length < 2) continue;
      const [x, y] = k.split(',').map(Number);
      derivadores.push({ type: 'AddTerminal', levelId, disciplina: 'FRIGORIGENA', tipo: derivadorDoVrf(soma.get(k) ?? 0), tipoHidraulico: 'DERIVADOR_VRF', at: { x, y }, cotaMm: cotaLinha, condensadoraId: c.id, sugerida: true } as Command);
      nDerivadores++;
    }
    aCriar.push({ condensadoraId: c.id, nome: s.nome, evaporadoras: evs.length, derivadores: nDerivadores, avisos });
  }

  if (aCriar.length === 0) {
    const motivo = semLugar.length ? `nada a lançar: ${semLugar.map((x) => `${x.nome} (${x.motivo})`).join('; ')}` : jaLigados.length ? 'todos os sistemas VRF já têm a rede confirmada' : null;
    return { comandos: apagar, aCriar: [], jaLigados, semLugar, apagados: apagar.length, motivo: apagar.length && !semLugar.length ? null : motivo, resumo: [] };
  }
  const comandos = [...apagar, ...l.comandos, ...derivadores];
  let depois: BlueprintModel;
  try {
    depois = applyBatch(model, comandos).model;
  } catch (err) {
    return vazio(`o plano não aplica: ${err instanceof Error ? err.message : String(err)}`, apagar);
  }
  const m1 = (m: number | null) => (m == null ? '—' : `${m.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m`);
  const resumo = aCriar.map((p) => {
    const s = sistemasVrfDoNivel(depois, levelId).find((x) => x.condensadora.id === p.condensadoraId)!;
    const a = analisarVrf(depois, s);
    return `${p.nome}: ${p.evaporadoras} evaporadora(s), ${p.derivadores} derivador(es), ${m1(a.comprimentoTotalM)} de linha (até a mais distante ${m1(a.maisDistanteM)})${a.taxaPct != null ? `, taxa ${a.taxaPct.toLocaleString('pt-BR')} %` : ''}${p.avisos.length ? ` — ${p.avisos.join('; ')}` : ''}`;
  });
  return { comandos, aCriar, jaLigados, semLugar, apagados: apagar.length, motivo: null, resumo };
}

// ─── A conferência ───────────────────────────────────────────────────────────

/** A conferência dos sistemas VRF do pavimento, em 3 estados. */
export function conferenciaDoVrf(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDoVrf): ItemConferido[] {
  const analises = analisesDoNivel(model, levelId);
  if (analises.length === 0) return [{ codigo: 'SISTEMA', item: 'Sistema VRF (condensadora com evaporadoras)', estado: 'NAO_AVALIADO', obtido: 'nenhuma condensadora VRF no pavimento', spaceIds: [] }];
  const itens: ItemConferido[] = [];
  const nomes = (xs: AnaliseDoVrf[]) => xs.map((a) => a.sistema.nome).join(', ');
  const vazios = analises.filter((a) => a.sistema.evaporadoras.length === 0);
  const fora = analises.filter((a) => a.sistema.foraDoPavimento.length > 0);
  itens.push({
    codigo: 'SISTEMA',
    item: 'Sistema VRF (condensadora com evaporadoras)',
    estado: vazios.length ? 'FALTA' : fora.length ? 'AVISO' : 'OK',
    obtido: [vazios.length ? `sem evaporadora: ${nomes(vazios)}` : '', fora.length ? `evaporadora em outro pavimento (prumada fica para depois): ${nomes(fora)}` : ''].filter(Boolean).join('; ') || analises.map((a) => `${a.sistema.nome}: ${a.sistema.evaporadoras.length} evaporadora(s)`).join('; '),
    spaceIds: [],
  });
  const comEvap = analises.filter((a) => a.sistema.evaporadoras.length > 0);
  const semCap = comEvap.filter((a) => a.taxaPct == null);
  const foraDaTaxa = comEvap.filter((a) => a.taxaPct != null && (a.taxaPct < hip.taxaMinPct || a.taxaPct > hip.taxaMaxPct));
  itens.push({
    codigo: 'TAXA',
    item: `Taxa de combinação entre ${hip.taxaMinPct} % e ${hip.taxaMaxPct} % (hipótese — CONFERIR)`,
    estado: comEvap.length === 0 ? 'NAO_AVALIADO' : semCap.length || foraDaTaxa.length ? 'FALTA' : 'OK',
    obtido: comEvap.length === 0 ? 'sem evaporadora' : [semCap.length ? `capacidade não declarada (condensadora ou evaporadora): ${nomes(semCap)}` : '', foraDaTaxa.length ? `fora da faixa: ${foraDaTaxa.map((a) => `${a.sistema.nome} ${a.taxaPct!.toLocaleString('pt-BR')} %`).join(', ')}` : ''].filter(Boolean).join('; ') || comEvap.map((a) => `${a.sistema.nome} ${a.taxaPct!.toLocaleString('pt-BR')} %`).join('; '),
    spaceIds: [],
  });
  const incompletos = comEvap.filter((a) => a.naoAlcancadas.length > 0);
  itens.push({ codigo: 'ALCANCE', item: 'Rede da condensadora a todas as evaporadoras', estado: comEvap.length === 0 ? 'NAO_AVALIADO' : incompletos.length ? 'FALTA' : 'OK', obtido: comEvap.length === 0 ? 'sem evaporadora' : incompletos.length ? incompletos.map((a) => `${a.sistema.nome}: ${a.naoAlcancadas.length} sem rede`).join('; ') : 'todas alcançadas', spaceIds: [] });
  const comRede = comEvap.filter((a) => a.alcancadas.length > 0);
  const semDerivador = comRede.flatMap((a) => a.derivacoes.filter((d) => !d.temDerivador));
  const nDer = comRede.reduce((acc, a) => acc + a.derivacoes.length, 0);
  itens.push({ codigo: 'DERIVADORES', item: 'Derivador em cada divisão da rede', estado: comRede.length === 0 ? 'NAO_AVALIADO' : semDerivador.length ? 'FALTA' : 'OK', obtido: comRede.length === 0 ? 'sem rede' : semDerivador.length ? `${semDerivador.length} divisão(ões) sem derivador` : `${nDer} derivação(ões), todas com derivador`, spaceIds: [] });
  const abaixo = comRede.flatMap((a) => a.trechos.filter((t) => t.abaixo));
  itens.push({ codigo: 'DIAMETROS', item: 'Diâmetro de cada trecho pelo somatório a jusante', estado: comRede.length === 0 ? 'NAO_AVALIADO' : abaixo.length ? 'FALTA' : 'OK', obtido: comRede.length === 0 ? 'sem rede' : abaixo.length ? `${abaixo.length} trecho(s) abaixo do pedido` : `${comRede.reduce((acc, a) => acc + a.trechos.length, 0)} trecho(s) ok`, spaceIds: [] });
  const m = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const estouros = comRede.flatMap((a) => [
    a.comprimentoTotalM != null && a.comprimentoTotalM > hip.comprimentoTotalMaxM ? `${a.sistema.nome}: total ${m(a.comprimentoTotalM)} m > ${hip.comprimentoTotalMaxM} m` : '',
    a.maisDistanteM != null && a.maisDistanteM > hip.ateMaisDistanteMaxM ? `${a.sistema.nome}: até a mais distante ${m(a.maisDistanteM)} m > ${hip.ateMaisDistanteMaxM} m` : '',
    a.aposPrimeiraDerivacaoM != null && a.aposPrimeiraDerivacaoM > hip.aposPrimeiraDerivacaoMaxM ? `${a.sistema.nome}: após a 1ª derivação ${m(a.aposPrimeiraDerivacaoM)} m > ${hip.aposPrimeiraDerivacaoMaxM} m` : '',
    a.desnivelCondEvapM > hip.desnivelCondEvapMaxM ? `${a.sistema.nome}: desnível condensadora–evaporadora ${m(a.desnivelCondEvapM)} m > ${hip.desnivelCondEvapMaxM} m` : '',
    a.desnivelEntreEvapM > hip.desnivelEntreEvapMaxM ? `${a.sistema.nome}: desnível entre evaporadoras ${m(a.desnivelEntreEvapM)} m > ${hip.desnivelEntreEvapMaxM} m` : '',
  ]).filter(Boolean);
  itens.push({
    codigo: 'LIMITES',
    item: 'Comprimentos e desníveis dentro dos limites (tubulação real; hipótese — CONFERIR)',
    estado: comRede.length === 0 ? 'NAO_AVALIADO' : estouros.length ? 'FALTA' : 'OK',
    obtido: comRede.length === 0 ? 'sem rede' : estouros.length ? estouros.join('; ') : comRede.map((a) => `${a.sistema.nome}: total ${m(a.comprimentoTotalM)} m, mais distante ${m(a.maisDistanteM)} m, após a 1ª ${m(a.aposPrimeiraDerivacaoM)} m`).join('; '),
    spaceIds: [],
  });
  return itens;
}
