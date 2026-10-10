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
 * Pendências C2/C3/C4 (10/10/2026):
 *  - C2 o VRF ENTRE PAVIMENTOS: o sistema é a condensadora e TODAS as
 *    evaporadoras ligadas a ela, de qualquer pavimento. O tronco desce/sobe por
 *    uma prumada (num shaft perto da condensadora, ou sob/sobre ela —
 *    `blueprintPrumadaClimatizacao.ts`), com uma derivação na cota da linha de
 *    cada pavimento atendido, e cada pavimento ganha a sua árvore pelas paredes a
 *    partir da prumada. Lança-se do pavimento da condensadora; relançar apaga o
 *    que é do sistema ONDE estiver.
 *  - C3 o COMPRIMENTO EQUIVALENTE até a evaporadora mais distante: o real mais
 *    curvas, derivadores e coletores do caminho, pelos metros de cada peça das
 *    premissas (hipótese, CONFERIR).
 *  - C4 o COLETOR (header): a divisão em 3 ou mais ramais num ponto só leva
 *    coletor, não derivador "Y".
 */
import type { BlueprintModel, Command, Level, ObjectId, Terminal, Trecho } from './blueprintKernel';
import { TIPOS_DE_DIVISAO_DO_VRF, TIPOS_DE_EVAPORADORA, applyBatch } from './blueprintKernel';
import { comprimentoMm, fazerChave, type No } from './blueprintGrafoDeRede';
import { arvorePelasParedes, chaveP, encaixarNaParede, type P2 } from './blueprintRotaPelasParedes';
import { desvioDoPilar, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { HIPOTESES_DO_VRF_PADRAO, type HipotesesDaLinha, type HipotesesDoVrf } from './blueprintClimatizacao';
import { componentesSugeridos, lancesDaPrumada, pavimentosEntre, pontoDaPrumada } from './blueprintPrumadaClimatizacao';
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
/** C4: o coletor pelo número de ramais (o nome que vai na peça e no quantitativo). */
export const coletorDoVrf = (ramais: number): string => `Coletor VRF de ${ramais} ramais`;
const isolamentoMm = (btu: number, hip: HipotesesDaLinha) => (btu <= 24000 ? hip.isolamentoAte24kMm : hip.isolamentoAcimaMm);

// ─── O sistema ───────────────────────────────────────────────────────────────

export interface SistemaVrf {
  condensadora: Terminal;
  nome: string;
  /** As evaporadoras ligadas a ela — C2 (10/10/2026): de QUALQUER pavimento (a prumada as alcança). */
  evaporadoras: Terminal[];
  /** As peças de divisão (derivadores e coletores) do sistema. */
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
        evaporadoras: ligados.filter(ehEvaporadora),
        derivadores: ligados.filter((t) => !!t.tipoHidraulico && (TIPOS_DE_DIVISAO_DO_VRF as readonly string[]).includes(t.tipoHidraulico)),
      };
    });
}

/**
 * C2: os sistemas VRF de OUTROS pavimentos que atendem evaporadoras deste — o
 * painel do pavimento delas diz de onde lançar (a árvore sai do pavimento da
 * condensadora).
 */
export function vrfDeOutrosPavimentos(model: BlueprintModel, levelId: ObjectId): { nome: string; pavimento: string }[] {
  const evs = (model.terminais ?? []).filter((t) => t.levelId === levelId && ehEvaporadora(t) && !!t.condensadoraId);
  const conds = new Set(evs.map((e) => e.condensadoraId!));
  const nomeDoNivel = new Map(model.levels.map((l) => [l.id, l.name]));
  return [...conds]
    .map((id) => (model.terminais ?? []).find((t) => t.id === id))
    .filter((c): c is Terminal => !!c && c.tipoHidraulico === 'CONDENSADORA_VRF' && c.levelId !== levelId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => ({ nome: sistemasVrfDoNivel(model, c.levelId).find((s) => s.condensadora.id === c.id)?.nome ?? c.tipo, pavimento: nomeDoNivel.get(c.levelId) ?? c.levelId }));
}

/**
 * C2: o que o VRF lançado DESTE pavimento sugeriu, onde estiver — os grupos de
 * trechos sugeridos do VRF que tocam uma condensadora daqui (e os sem
 * condensadora com trecho aqui) e as peças de divisão sugeridas dos sistemas
 * daqui (e as órfãs deste pavimento). É o que relançar apaga e o que aceitar fixa.
 */
export function sugeridosDoVrf(model: BlueprintModel, levelId: ObjectId): { trechos: ObjectId[]; terminais: ObjectId[] } {
  const chave = fazerChave(model.levels);
  const conds = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'CONDENSADORA_VRF');
  const nivelDaCond = new Map(conds.map((c) => [c.id, c.levelId]));
  const nivelNoNo = new Map<No, ObjectId>(conds.map((c) => [chave(c.levelId, c.at.x, c.at.y, c.cotaMm), c.levelId]));
  const candidatos = (model.trechos ?? []).filter((t) => !!t.sugerido && t.disciplina === 'FRIGORIGENA' && t.rotulo === ROTULO_DA_LINHA_VRF);
  const trechos = componentesSugeridos(model, candidatos).flatMap((g) => {
    const donos = new Set([...g.nos].map((n) => nivelNoNo.get(n)).filter((x): x is ObjectId => !!x));
    return donos.has(levelId) || (donos.size === 0 && g.trechos.some((t) => t.levelId === levelId)) ? g.trechos.map((t) => t.id) : [];
  });
  const terminais = (model.terminais ?? [])
    .filter((t) => !!t.sugerida && !!t.tipoHidraulico && (TIPOS_DE_DIVISAO_DO_VRF as readonly string[]).includes(t.tipoHidraulico))
    .filter((t) => {
      const nivel = t.condensadoraId ? nivelDaCond.get(t.condensadoraId) : undefined;
      return nivel === levelId || (nivel === undefined && t.levelId === levelId);
    })
    .map((t) => t.id);
  return { trechos, terminais };
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
  /** C4: quantos ramais saem do nó (2 = derivador; 3 ou mais = coletor). */
  ramais: number;
  /** A peça de divisão que está no nó, se alguma. */
  peca: 'DERIVADOR_VRF' | 'COLETOR_VRF' | null;
  /** A peça CERTA está no nó: derivador em 2 ramais; coletor em 2 ou mais. */
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
  /** C3: até a mais distante em comprimento EQUIVALENTE (real + curvas, derivadores e coletores do caminho). */
  maisDistanteEquivalenteM: number | null;
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
export function analisarVrf(model: BlueprintModel, sistema: SistemaVrf, hip: HipotesesDoVrf = HIPOTESES_DO_VRF_PADRAO): AnaliseDoVrf {
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

  const pecaPorNo = new Map<No, 'DERIVADOR_VRF' | 'COLETOR_VRF'>();
  for (const t of model.terminais ?? []) if (t.tipoHidraulico === 'DERIVADOR_VRF' || t.tipoHidraulico === 'COLETOR_VRF') pecaPorNo.set(noDe(t), t.tipoHidraulico);
  const nosDeDerivacao = new Set([...filhos.entries()].filter(([, f]) => f.size >= 2).map(([n]) => n));
  const derivacoes: DerivacaoDoVrf[] = [...nosDeDerivacao].sort().map((no) => {
    const ramais = filhos.get(no)!.size;
    const peca = pecaPorNo.get(no) ?? null;
    // C4: o "Y" divide em dois; três ou mais ramais pedem o coletor (que também serve a dois).
    return { no, ...parseNo(no), jusanteBtuH: jusantePorNo.get(no) ?? 0, ramais, peca, temDerivador: peca === 'COLETOR_VRF' || (peca === 'DERIVADOR_VRF' && ramais === 2) };
  });

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
  let maisDistanteEquivalente: number | null = null;
  let aposPrimeira: number | null = null;
  // C3: a posição de MUNDO de cada nó (elevação do pavimento + cota), para achar as curvas do caminho.
  const mundo = (no: No) => {
    const p = parseNo(no);
    return { x: p.at.x, y: p.at.y, z: (elevacao.get(p.levelId) ?? 0) + p.cotaMm };
  };
  for (const e of alcancadas) {
    const d = dist.get(noDe(e))!;
    maisDistante = Math.max(maisDistante ?? 0, d);
    const nos = caminhos.get(e.id)!;
    const primeira = nos.find((n) => nosDeDerivacao.has(n));
    if (primeira != null) aposPrimeira = Math.max(aposPrimeira ?? 0, d - dist.get(primeira)!);
    // Cada nó do meio do caminho: a peça de divisão vale a dela; sem peça, a mudança de direção é uma curva.
    let pecasMm = 0;
    for (let i = 1; i + 1 < nos.length; i++) {
      const peca = pecaPorNo.get(nos[i]);
      if (peca === 'COLETOR_VRF') pecasMm += hip.equivalenteColetorM * 1000;
      else if (peca === 'DERIVADOR_VRF' || nosDeDerivacao.has(nos[i])) pecasMm += hip.equivalenteDerivadorM * 1000;
      else {
        const [a, b, c2] = [mundo(nos[i - 1]), mundo(nos[i]), mundo(nos[i + 1])];
        const u = [b.x - a.x, b.y - a.y, b.z - a.z];
        const v = [c2.x - b.x, c2.y - b.y, c2.z - b.z];
        const nu = Math.hypot(u[0], u[1], u[2]);
        const nv = Math.hypot(v[0], v[1], v[2]);
        if (nu > 0 && nv > 0 && (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv) < 0.9998) pecasMm += hip.equivalenteCurvaM * 1000;
      }
    }
    maisDistanteEquivalente = Math.max(maisDistanteEquivalente ?? 0, d + pecasMm);
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
    maisDistanteEquivalenteM: maisDistanteEquivalente == null ? null : maisDistanteEquivalente / 1000,
    aposPrimeiraDerivacaoM: aposPrimeira == null ? null : aposPrimeira / 1000,
    desnivelCondEvapM: cotas.length ? Math.max(...cotas.map((z) => Math.abs(z - absoluta(c)))) / 1000 : 0,
    desnivelEntreEvapM: cotas.length ? (Math.max(...cotas) - Math.min(...cotas)) / 1000 : 0,
  };
}

export const analisesDoNivel = (model: BlueprintModel, levelId: ObjectId, hip: HipotesesDoVrf = HIPOTESES_DO_VRF_PADRAO): AnaliseDoVrf[] => sistemasVrfDoNivel(model, levelId).map((s) => analisarVrf(model, s, hip));

// ─── E6.3: o traçado em árvore ───────────────────────────────────────────────

export interface VrfPlanejado {
  condensadoraId: ObjectId;
  nome: string;
  evaporadoras: number;
  derivadores: number;
  /** C4: as divisões em 3 ou mais ramais, com coletor. */
  coletores: number;
  /** C2: os pavimentos que a rede alcança além do da condensadora. */
  outrosPavimentos: number;
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

/** As arestas em planta, orientadas da raiz para fora: a árvore pelas paredes, ou a estrela em reta sem parede. */
function arvoreEmPlanta(model: BlueprintModel, levelId: ObjectId, raiz: P2, pendentes: readonly { at: P2; nome: string }[], hip: HipotesesDaLinha): { arestas: { de: P2; para: P2 }[]; avisos: string[] } {
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const pegadas = pegadasDePilares(model, levelId);
  const reta = (de: P2, para: P2): { de: P2; para: P2 }[] => {
    const pts = [de, ...(desvioDoPilar(de, para, pegadas) ?? []), para];
    return pts.slice(1).map((p, i) => ({ de: pts[i], para: p }));
  };
  const avisos: string[] = [];
  const raizNaParede = paredes.length ? encaixarNaParede(raiz, paredes, 1e9) : null;
  const raio = Math.max(hip.raioDeEncaixeMm, raizNaParede ? Math.ceil(raizNaParede.d) + 1 : 0);
  const arvore = paredes.length ? arvorePelasParedes({ paredes, raiz, pendentes: pendentes.map((e) => e.at), raioDeEncaixeMm: raio, obstaculos: pegadas }) : null;
  if (!arvore?.raiz) {
    avisos.push('sem parede ao alcance: a rede sai em estrela, em reta, da condensadora');
    return { arestas: pendentes.flatMap((e) => reta(raiz, e.at)), avisos };
  }
  const arestas: { de: P2; para: P2 }[] = [];
  if (!mesmoP(raiz, arvore.raiz)) arestas.push({ de: raiz, para: arvore.raiz });
  arestas.push(...arvore.arestas);
  for (const e of pendentes) {
    const q = arvore.encaixe.get(chaveP(e.at));
    if (q) {
      if (!mesmoP(q, e.at)) arestas.push({ de: q, para: e.at });
    } else {
      avisos.push(`${e.nome}: sem parede perto — ramal em reta`);
      arestas.push(...reta(arvore.raiz, e.at));
    }
  }
  return { arestas, avisos };
}

/** Uma aresta da árvore em 3D, orientada da condensadora para fora, no referencial do pavimento dela. */
interface Aresta3D {
  levelId: ObjectId;
  de: P2;
  cotaDe: number;
  para: P2;
  cotaPara: number;
}

/** O plano da árvore de cada sistema VRF do pavimento ainda sem rede. */
export function planejarVrf(model: BlueprintModel, levelId: ObjectId, hipLinha: HipotesesDaLinha): PlanoDoVrf {
  const vazio = (motivo: string, apagar: Command[] = []): PlanoDoVrf => ({ comandos: apagar, aCriar: [], jaLigados: [], semLugar: [], apagados: apagar.length, motivo, resumo: [] });
  // Relançar apaga só o que é do VRF deste pavimento — C2: onde estiver (a prumada e as árvores dos outros pavimentos).
  const sug = sugeridosDoVrf(model, levelId);
  const apagar: Command[] = [
    ...sug.trechos.map((trechoId) => ({ type: 'DeleteTrecho', trechoId }) as Command),
    ...sug.terminais.map((terminalId) => ({ type: 'DeleteTerminal', terminalId }) as Command),
  ];
  const ids = new Set([...sug.trechos, ...sug.terminais]);
  const base: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !ids.has(t.id)), terminais: (model.terminais ?? []).filter((t) => !ids.has(t.id)) };
  const sistemas = sistemasVrfDoNivel(base, levelId);
  if (sistemas.length === 0) {
    const outros = vrfDeOutrosPavimentos(base, levelId);
    return vazio(
      outros.length
        ? `as evaporadoras deste pavimento são do VRF ${outros.map((o) => `${o.nome} (em ${o.pavimento})`).join(', ')} — lance a rede do pavimento da condensadora`
        : 'nenhuma condensadora VRF neste pavimento — insira uma (Climatização — equipamentos) e ligue as evaporadoras a ela',
      apagar,
    );
  }

  const chave = fazerChave(base.levels);
  const l = lote(base);
  const divisoes: Command[] = [];
  const aCriar: VrfPlanejado[] = [];
  const jaLigados: string[] = [];
  const semLugar: { nome: string; motivo: string }[] = [];
  const cotaLinha = Math.round(hipLinha.cotaDaLinhaMm);
  const nomeDoNivel = new Map(base.levels.map((x) => [x.id, x.name]));
  const elevacao = (id: ObjectId) => base.levels.find((x) => x.id === id)?.elevationMm ?? 0;

  for (const s of sistemas) {
    const c = s.condensadora;
    const evs = s.evaporadoras;
    if (evs.length === 0) {
      semLugar.push({ nome: s.nome, motivo: 'nenhuma evaporadora ligada a esta condensadora' });
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
    const avisos: string[] = [];
    if (evs.some((e) => e.capacidadeBtuH == null)) avisos.push('evaporadora sem capacidade declarada: o diâmetro dela sai pelo mínimo');
    // C2: os pavimentos atendidos além do da condensadora, e a PRUMADA que os alcança.
    const outrosNiveis = [...new Set(evs.map((e) => e.levelId))].filter((id) => id !== levelId).sort((a, b) => elevacao(a) - elevacao(b));
    const acima = outrosNiveis.filter((id) => elevacao(id) > elevacao(levelId));
    const abaixo = outrosNiveis.filter((id) => elevacao(id) < elevacao(levelId)).reverse();
    const extremos = [acima[acima.length - 1], abaixo[abaixo.length - 1]].filter((x): x is ObjectId => !!x);
    const niveisDaPrumada = [...new Set([levelId, ...extremos.flatMap((x) => pavimentosEntre(base, levelId, x).map((n: Level) => n.id))])];
    const prumada = outrosNiveis.length ? pontoDaPrumada(base, c.at, niveisDaPrumada, hipLinha.raioDoShaftMm) : null;
    const R = prumada?.at ?? c.at;
    if (prumada) avisos.push(`prumada ${prumada.shaft ? 'pelo shaft' : 'na posição da condensadora (sem shaft ao alcance)'} até ${outrosNiveis.map((id) => nomeDoNivel.get(id) ?? id).join(', ')}`);

    // As arestas 3D, da condensadora para fora.
    const arestas: Aresta3D[] = [];
    const naCota = (lv: ObjectId, xs: { de: P2; para: P2 }[]) => xs.forEach((a) => arestas.push({ levelId: lv, de: a.de, cotaDe: cotaLinha, para: a.para, cotaPara: cotaLinha }));
    arestas.push({ levelId, de: c.at, cotaDe: c.cotaMm, para: c.at, cotaPara: cotaLinha });
    const doNivel = evs.filter((e) => e.levelId === levelId);
    const pendentes = [...doNivel.map((e) => ({ at: e.at, nome: e.tipo })), ...(prumada && !mesmoP(R, c.at) ? [{ at: R, nome: 'a prumada' }] : [])];
    if (pendentes.length) {
      const arv = arvoreEmPlanta(base, levelId, c.at, pendentes, hipLinha);
      avisos.push(...arv.avisos);
      naCota(levelId, arv.arestas);
    }
    for (const e of doNivel) arestas.push({ levelId, de: e.at, cotaDe: cotaLinha, para: e.at, cotaPara: e.cotaMm });
    // A prumada: para cima e para baixo, parando na cota da linha de cada pavimento atendido.
    for (const sentido of [acima, abaixo]) {
      let de = { levelId, cotaMm: cotaLinha };
      for (const alvo of sentido) {
        for (const lance of lancesDaPrumada(base, de, { levelId: alvo, cotaMm: cotaLinha })) arestas.push({ levelId: lance.levelId, de: R, cotaDe: lance.cotaAMm, para: R, cotaPara: lance.cotaBMm });
        de = { levelId: alvo, cotaMm: cotaLinha };
      }
    }
    // A árvore de cada outro pavimento, a partir da prumada.
    for (const lv of outrosNiveis) {
      const daqui = evs.filter((e) => e.levelId === lv);
      const arv = arvoreEmPlanta(base, lv, R, daqui.map((e) => ({ at: e.at, nome: e.tipo })), hipLinha);
      avisos.push(...arv.avisos.map((x) => `${nomeDoNivel.get(lv) ?? lv}: ${x}`));
      naCota(lv, arv.arestas);
      for (const e of daqui) arestas.push({ levelId: lv, de: e.at, cotaDe: cotaLinha, para: e.at, cotaPara: e.cotaMm });
    }

    // O somatório a jusante de cada nó (pós-ordem da árvore orientada), pela chave de mundo.
    const k = (lv: ObjectId, p: P2, cota: number) => chave(lv, p.x, p.y, cota);
    const filhos = new Map<No, No[]>();
    const lugar = new Map<No, { levelId: ObjectId; at: P2; cotaMm: number }>();
    for (const a of arestas) {
      if (mesmoP(a.de, a.para) && a.cotaDe === a.cotaPara) continue;
      const de = k(a.levelId, a.de, a.cotaDe);
      const para = k(a.levelId, a.para, a.cotaPara);
      if (!lugar.has(de)) lugar.set(de, { levelId: a.levelId, at: a.de, cotaMm: a.cotaDe });
      if (!lugar.has(para)) lugar.set(para, { levelId: a.levelId, at: a.para, cotaMm: a.cotaPara });
      const f = filhos.get(de) ?? [];
      if (!f.includes(para)) f.push(para);
      filhos.set(de, f);
    }
    const capNoNo = new Map<No, number>();
    for (const e of evs) capNoNo.set(k(e.levelId, e.at, e.cotaMm), (capNoNo.get(k(e.levelId, e.at, e.cotaMm)) ?? 0) + (e.capacidadeBtuH ?? 0));
    const soma = new Map<No, number>();
    const somar = (n: No, vistos: Set<No>): number => {
      if (soma.has(n)) return soma.get(n)!;
      if (vistos.has(n)) return 0;
      vistos.add(n);
      const v = (capNoNo.get(n) ?? 0) + (filhos.get(n) ?? []).reduce((acc, f) => acc + somar(f, vistos), 0);
      soma.set(n, v);
      return v;
    };
    somar(k(levelId, c.at, c.cotaMm), new Set());
    const baseDe = (lv: ObjectId, btu: number) => {
      const d = diametrosDoVrf(btu);
      return { levelId: lv, disciplina: 'FRIGORIGENA' as const, bitolaMm: d.liquidoMm, bitolaSuccaoMm: d.succaoMm, isolamentoMm: isolamentoMm(btu, hipLinha), rotulo: ROTULO_DA_LINHA_VRF, sugerido: true };
    };
    for (const a of arestas) l.add(baseDe(a.levelId, soma.get(k(a.levelId, a.para, a.cotaPara)) ?? 0), a.de, a.cotaDe, a.para, a.cotaPara);
    // A peça em cada nó onde a rede se divide: derivador em 2 ramais, coletor em 3 ou mais (C4).
    let nDerivadores = 0;
    let nColetores = 0;
    for (const [n, fs] of [...filhos.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (fs.length < 2) continue;
      const p = lugar.get(n)!;
      const coletor = fs.length >= 3;
      divisoes.push({ type: 'AddTerminal', levelId: p.levelId, disciplina: 'FRIGORIGENA', tipo: coletor ? coletorDoVrf(fs.length) : derivadorDoVrf(soma.get(n) ?? 0), tipoHidraulico: coletor ? 'COLETOR_VRF' : 'DERIVADOR_VRF', at: { x: p.at.x, y: p.at.y }, cotaMm: p.cotaMm, condensadoraId: c.id, sugerida: true } as Command);
      if (coletor) nColetores++;
      else nDerivadores++;
    }
    aCriar.push({ condensadoraId: c.id, nome: s.nome, evaporadoras: evs.length, derivadores: nDerivadores, coletores: nColetores, outrosPavimentos: outrosNiveis.length, avisos });
  }

  if (aCriar.length === 0) {
    const motivo = semLugar.length ? `nada a lançar: ${semLugar.map((x) => `${x.nome} (${x.motivo})`).join('; ')}` : jaLigados.length ? 'todos os sistemas VRF já têm a rede confirmada' : null;
    return { comandos: apagar, aCriar: [], jaLigados, semLugar, apagados: apagar.length, motivo: apagar.length && !semLugar.length ? null : motivo, resumo: [] };
  }
  const comandos = [...apagar, ...l.comandos, ...divisoes];
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
    const pecas = [`${p.derivadores} derivador(es)`, p.coletores ? `${p.coletores} coletor(es)` : ''].filter(Boolean).join(', ');
    return `${p.nome}: ${p.evaporadoras} evaporadora(s)${p.outrosPavimentos ? ` em ${p.outrosPavimentos + 1} pavimentos` : ''}, ${pecas}, ${m1(a.comprimentoTotalM)} de linha (até a mais distante ${m1(a.maisDistanteM)})${a.taxaPct != null ? `, taxa ${a.taxaPct.toLocaleString('pt-BR')} %` : ''}${p.avisos.length ? ` — ${p.avisos.join('; ')}` : ''}`;
  });
  return { comandos, aCriar, jaLigados, semLugar, apagados: apagar.length, motivo: null, resumo };
}

// ─── A conferência ───────────────────────────────────────────────────────────

/** A conferência dos sistemas VRF do pavimento, em 3 estados. */
export function conferenciaDoVrf(model: BlueprintModel, levelId: ObjectId, hip: HipotesesDoVrf): ItemConferido[] {
  const analises = analisesDoNivel(model, levelId, hip);
  if (analises.length === 0) return [{ codigo: 'SISTEMA', item: 'Sistema VRF (condensadora com evaporadoras)', estado: 'NAO_AVALIADO', obtido: 'nenhuma condensadora VRF no pavimento', spaceIds: [] }];
  const itens: ItemConferido[] = [];
  const nomes = (xs: AnaliseDoVrf[]) => xs.map((a) => a.sistema.nome).join(', ');
  const vazios = analises.filter((a) => a.sistema.evaporadoras.length === 0);
  // C2: a evaporadora de outro pavimento é do sistema (a prumada a alcança) — não é mais aviso.
  const pavimentos = (a: AnaliseDoVrf) => new Set(a.sistema.evaporadoras.map((e) => e.levelId)).size;
  itens.push({
    codigo: 'SISTEMA',
    item: 'Sistema VRF (condensadora com evaporadoras)',
    estado: vazios.length ? 'FALTA' : 'OK',
    obtido: vazios.length ? `sem evaporadora: ${nomes(vazios)}` : analises.map((a) => `${a.sistema.nome}: ${a.sistema.evaporadoras.length} evaporadora(s)${pavimentos(a) > 1 ? ` em ${pavimentos(a)} pavimentos` : ''}`).join('; '),
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
  const semPeca = comRede.flatMap((a) => a.derivacoes.filter((d) => !d.temDerivador));
  // C4: três ou mais ramais com o "Y" no nó é peça errada — pede coletor.
  const pedemColetor = semPeca.filter((d) => d.ramais >= 3);
  const semDerivador = semPeca.filter((d) => d.ramais < 3);
  const nDer = comRede.reduce((acc, a) => acc + a.derivacoes.length, 0);
  const nCol = comRede.reduce((acc, a) => acc + a.derivacoes.filter((d) => d.peca === 'COLETOR_VRF').length, 0);
  itens.push({
    codigo: 'DERIVADORES',
    item: 'Derivador (2 ramais) ou coletor (3 ou mais) em cada divisão da rede',
    estado: comRede.length === 0 ? 'NAO_AVALIADO' : semPeca.length ? 'FALTA' : 'OK',
    obtido: comRede.length === 0 ? 'sem rede' : semPeca.length ? [semDerivador.length ? `${semDerivador.length} divisão(ões) sem derivador` : '', pedemColetor.length ? `${pedemColetor.length} divisão(ões) de 3 ou mais ramais sem coletor` : ''].filter(Boolean).join('; ') : nCol ? `${nDer} derivação(ões), todas com a peça (${nCol} com coletor)` : `${nDer} derivação(ões), todas com derivador`,
    spaceIds: [],
  });
  const abaixo = comRede.flatMap((a) => a.trechos.filter((t) => t.abaixo));
  itens.push({ codigo: 'DIAMETROS', item: 'Diâmetro de cada trecho pelo somatório a jusante', estado: comRede.length === 0 ? 'NAO_AVALIADO' : abaixo.length ? 'FALTA' : 'OK', obtido: comRede.length === 0 ? 'sem rede' : abaixo.length ? `${abaixo.length} trecho(s) abaixo do pedido` : `${comRede.reduce((acc, a) => acc + a.trechos.length, 0)} trecho(s) ok`, spaceIds: [] });
  const m = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const estouros = comRede.flatMap((a) => [
    a.comprimentoTotalM != null && a.comprimentoTotalM > hip.comprimentoTotalMaxM ? `${a.sistema.nome}: total ${m(a.comprimentoTotalM)} m > ${hip.comprimentoTotalMaxM} m` : '',
    a.maisDistanteM != null && a.maisDistanteM > hip.ateMaisDistanteMaxM ? `${a.sistema.nome}: até a mais distante ${m(a.maisDistanteM)} m > ${hip.ateMaisDistanteMaxM} m` : '',
    a.maisDistanteEquivalenteM != null && a.maisDistanteEquivalenteM > hip.ateMaisDistanteEquivalenteMaxM ? `${a.sistema.nome}: até a mais distante, equivalente, ${m(a.maisDistanteEquivalenteM)} m > ${hip.ateMaisDistanteEquivalenteMaxM} m` : '',
    a.aposPrimeiraDerivacaoM != null && a.aposPrimeiraDerivacaoM > hip.aposPrimeiraDerivacaoMaxM ? `${a.sistema.nome}: após a 1ª derivação ${m(a.aposPrimeiraDerivacaoM)} m > ${hip.aposPrimeiraDerivacaoMaxM} m` : '',
    a.desnivelCondEvapM > hip.desnivelCondEvapMaxM ? `${a.sistema.nome}: desnível condensadora–evaporadora ${m(a.desnivelCondEvapM)} m > ${hip.desnivelCondEvapMaxM} m` : '',
    a.desnivelEntreEvapM > hip.desnivelEntreEvapMaxM ? `${a.sistema.nome}: desnível entre evaporadoras ${m(a.desnivelEntreEvapM)} m > ${hip.desnivelEntreEvapMaxM} m` : '',
  ]).filter(Boolean);
  itens.push({
    codigo: 'LIMITES',
    item: 'Comprimentos e desníveis dentro dos limites (tubulação real e equivalente; hipótese — CONFERIR)',
    estado: comRede.length === 0 ? 'NAO_AVALIADO' : estouros.length ? 'FALTA' : 'OK',
    obtido: comRede.length === 0 ? 'sem rede' : estouros.length ? estouros.join('; ') : comRede.map((a) => `${a.sistema.nome}: total ${m(a.comprimentoTotalM)} m, mais distante ${m(a.maisDistanteM)} m (equivalente ${m(a.maisDistanteEquivalenteM)} m), após a 1ª ${m(a.aposPrimeiraDerivacaoM)} m`).join('; '),
    spaceIds: [],
  });
  return itens;
}
