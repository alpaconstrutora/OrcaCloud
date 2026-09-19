/**
 * ÁGUA FRIA E ÁGUA QUENTE AUTOMÁTICAS (18/09/2026, F4 da hidráulica:
 * *"água fria: caixa d'água → pontos… água quente também"*).
 *
 * ─── O MODELO DE REDE ────────────────────────────────────────────────────────
 *
 *   1. a ORIGEM é uma peça: a caixa d'água (`RESERVATORIO`) para a água fria,
 *      o aquecedor (`AQUECEDOR`) para a quente. Sem origem não há rede.
 *   2. os PONTOS são os terminais tipados da disciplina com peso na NBR 5626
 *      (chuveiro, lavatório, pia…); na água fria, o AQUECEDOR também é ponto —
 *      alimentado pela fria, com o peso da soma dos pontos quentes que abastece.
 *   3. BARRILETE: da origem sobe/desce ao teto do pavimento dela e, no teto,
 *      corre em linha reta até a cabeça de cada COLUNA;
 *   4. COLUNAS: os pontos são agrupados por proximidade em planta
 *      (`raioDaColunaMm`, união entre pavimentos); cada grupo ganha uma prumada
 *      na posição do ponto de menor (x, y), do teto do pavimento da origem até
 *      a cota do ramal de cada pavimento que tem pontos do grupo — pela laje,
 *      quando desce de pavimento (cota 0 ≡ teto do de baixo);
 *   5. RAMAIS: em cada pavimento, na `cotaRamalMm` (2,20 m — logo abaixo do forro,
 *      acima das portas), a árvore de MENOR TUBO COM ROTA LIMITADA a partir do nó
 *      da coluna até a posição de cada ponto; de lá, a prumada até a cota do ponto.
 *   6. DIÂMETRO por trecho: o PESO acumulado a jusante (todos os pontos cujo
 *      caminho até a origem passa pelo trecho), Q = 0,3·√ΣP (L/s, NBR 5626),
 *      e o menor DN comercial com velocidade ≤ `velocidadeMaxMs` — nunca abaixo
 *      do DN mínimo da disciplina nem do sub-ramal do aparelho (ficha).
 *
 * O que já existe é respeitado: rede da disciplina ligada à origem vira aresta,
 * ponto com trecho chegando na sua posição está ligado, e rodar de novo não
 * cria nada. Trecho SUGERIDO com DN menor que o necessário ganha
 * `SetTrechoProps`; trecho CONFIRMADO vira aviso — quem aceitou decidiu.
 *
 * É PRÉ-DIMENSIONAMENTO por velocidade: sem perda de carga, sem pressão
 * disponível, sem desvio de viga ou laje. Serve ao quantitativo e ao traçado
 * de partida; o projeto executivo é do projetista.
 */
import type { BlueprintModel, Command, DisciplinaDeRede, ObjectId, Terminal, Trecho } from './blueprintKernel';
import {
  arvoreComRotaLimitada,
  caminhoEntre,
  comprimentoMm,
  distanciasDesde,
  fazerChave,
  type Aresta,
  type No,
  type Ponto2,
} from './blueprintGrafoDeRede';
import { FICHA_DO_PONTO_HIDRAULICO, ehPontoDeConsumo } from './blueprintHidraulica';
import { shaftPreferido } from './blueprintNucleoVertical';

export type TabelaDeTubo = 'PVC_SOLDAVEL' | 'CPVC';

/** DN nominal → diâmetro interno aproximado (mm). PVC soldável NBR 5648; CPVC Aquatherm. */
export const DIAMETROS: Record<TabelaDeTubo, { dn: number; internoMm: number }[]> = {
  PVC_SOLDAVEL: [
    { dn: 20, internoMm: 17 },
    { dn: 25, internoMm: 21.6 },
    { dn: 32, internoMm: 27.8 },
    { dn: 40, internoMm: 35.2 },
    { dn: 50, internoMm: 44 },
    { dn: 60, internoMm: 53.4 },
    { dn: 75, internoMm: 66.6 },
    { dn: 85, internoMm: 75.6 },
    { dn: 110, internoMm: 97.8 },
  ],
  CPVC: [
    { dn: 15, internoMm: 12.6 },
    { dn: 22, internoMm: 18.4 },
    { dn: 28, internoMm: 23.8 },
    { dn: 35, internoMm: 29.8 },
    { dn: 42, internoMm: 35.6 },
    { dn: 54, internoMm: 46 },
    { dn: 73, internoMm: 62 },
    { dn: 89, internoMm: 76 },
  ],
};

export interface HipotesesDeAgua {
  /** Velocidade máxima na tubulação, m/s (NBR 5626 limita a 3; 2 é a prática para conter perda de carga). */
  velocidadeMaxMs: number;
  /** DN mínimo da rede de água fria (PVC) e de água quente (CPVC). */
  dnMinimoAguaFriaMm: number;
  dnMinimoAguaQuenteMm: number;
  /** Cota do ramal em cada pavimento, mm do piso. */
  cotaRamalMm: number;
  /** Raio em planta que agrupa pontos numa mesma coluna. */
  raioDaColunaMm: number;
  /** Rota máxima do ramal (× a linha reta) — ver `arvoreComRotaLimitada`. */
  rotaMaximaVezes: number | null;
  /** Raio em que um SHAFT (E2.4) atrai a coluna do grupo — a prumada sobe por ele. Ausente = 3000. */
  raioDoShaftMm?: number;
}

export const HIPOTESES_AGUA_PADRAO: HipotesesDeAgua = {
  velocidadeMaxMs: 2,
  dnMinimoAguaFriaMm: 20,
  dnMinimoAguaQuenteMm: 22,
  cotaRamalMm: 2200,
  raioDaColunaMm: 1500,
  rotaMaximaVezes: 1.5,
  raioDoShaftMm: 3000,
};

/** Vazão de projeto da NBR 5626, em L/s: Q = 0,3 · √ΣP. */
export const vazaoDeProjetoLs = (somaDePesos: number) => 0.3 * Math.sqrt(Math.max(0, somaDePesos));

/**
 * O menor DN cuja velocidade fica dentro do limite, nunca abaixo de `minimoMm`.
 * Devolve também a velocidade resultante, para a gaveta mostrar.
 */
export function dimensionarDN(
  somaDePesos: number,
  tabela: TabelaDeTubo,
  hip: HipotesesDeAgua,
  minimoMm: number,
): { dn: number; velocidadeMs: number; vazaoLs: number } {
  const q = vazaoDeProjetoLs(somaDePesos);
  const linhas = DIAMETROS[tabela];
  const velocidade = (internoMm: number) => (q / 1000) / (Math.PI * (internoMm / 2000) ** 2);
  for (const l of linhas) {
    if (l.dn < minimoMm) continue;
    if (velocidade(l.internoMm) <= hip.velocidadeMaxMs) return { dn: l.dn, velocidadeMs: velocidade(l.internoMm), vazaoLs: q };
  }
  const ultimo = linhas[linhas.length - 1];
  return { dn: ultimo.dn, velocidadeMs: velocidade(ultimo.internoMm), vazaoLs: q };
}

export interface PavimentoDoPlanoDeAgua {
  levelId: ObjectId;
  nome: string;
  pontos: number;
  ligados: number;
  aLigar: number;
}

export interface PlanoDeAgua {
  disciplina: DisciplinaDeRede;
  origemId: ObjectId;
  origemNome: string;
  pavimentos: PavimentoDoPlanoDeAgua[];
  pontos: number;
  ligados: number;
  aLigar: number;
  colunas: number;
  /** Trechos SUGERIDOS da rede desta origem (o que "Relançar" apaga). */
  sugeridos: number;
  /** Todos os trechos da rede desta origem (o que "Refazer" apaga). */
  trechosDaRede: number;
  comandos: Command[];
  metrosPrevistos: number;
  /** O maior DN do tronco e a soma de pesos alimentada. */
  dnMaximoMm: number;
  somaDePesos: number;
  avisos: string[];
  motivo: string | null;
}

const HIDRAULICA_DA_ORIGEM: Record<'RESERVATORIO' | 'AQUECEDOR', DisciplinaDeRede> = {
  RESERVATORIO: 'AGUA_FRIA',
  AQUECEDOR: 'AGUA_QUENTE',
};

/** As origens do desenho: caixas d'água (água fria) e aquecedores (água quente). */
export function origensDeAgua(model: BlueprintModel): { origem: Terminal; disciplina: DisciplinaDeRede }[] {
  return (model.terminais ?? [])
    .filter((t) => (t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA') || (t.tipoHidraulico === 'AQUECEDOR' && t.disciplina === 'AGUA_QUENTE'))
    .map((t) => ({ origem: t, disciplina: HIDRAULICA_DA_ORIGEM[t.tipoHidraulico as 'RESERVATORIO' | 'AQUECEDOR'] }));
}

/** O peso NBR 5626 de um ponto da disciplina; o aquecedor na água fria vale a soma dos quentes. */
function pesoDoPonto(model: BlueprintModel, t: Terminal, disciplina: DisciplinaDeRede): number {
  if (t.tipoHidraulico === 'AQUECEDOR' && disciplina === 'AGUA_FRIA') {
    const quentes = (model.terminais ?? []).filter((x) => x.disciplina === 'AGUA_QUENTE' && ehPontoDeConsumo(x.tipoHidraulico));
    const soma = quentes.reduce((s, x) => s + (FICHA_DO_PONTO_HIDRAULICO[x.tipoHidraulico!].pesoNbr5626 ?? 0), 0);
    // Aquecedor sem ponto quente ainda: conta como um chuveiro, para o sub-ramal existir.
    return soma > 0 ? soma : 0.4;
  }
  return t.tipoHidraulico ? (FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico].pesoNbr5626 ?? 0) : 0;
}

/** Os pontos que a rede da disciplina deve alcançar, a partir desta origem. */
export function pontosDeAgua(model: BlueprintModel, origem: Terminal, disciplina: DisciplinaDeRede): Terminal[] {
  return (model.terminais ?? []).filter(
    (t) =>
      t.id !== origem.id &&
      t.disciplina === disciplina &&
      t.tipoHidraulico != null &&
      (ehPontoDeConsumo(t.tipoHidraulico) || (disciplina === 'AGUA_FRIA' && t.tipoHidraulico === 'AQUECEDOR')),
  );
}

/** A rede da disciplina LIGADA à origem (por adjacência de nós, com a laje como encontro). */
export function redeDaOrigem(model: BlueprintModel, origem: Terminal, disciplina: DisciplinaDeRede): Trecho[] {
  const chave = fazerChave(model.levels);
  const todos = (model.trechos ?? []).filter((t) => t.disciplina === disciplina);
  const noDe = (t: Trecho) => [chave(t.levelId, t.a.x, t.a.y, t.cotaAMm), chave(t.levelId, t.b.x, t.b.y, t.cotaBMm)];
  const alcancados = new Set<No>([chave(origem.levelId, origem.at.x, origem.at.y, origem.cotaMm)]);
  const ligados = new Set<ObjectId>();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const t of todos) {
      if (ligados.has(t.id)) continue;
      const [a, b] = noDe(t);
      if (alcancados.has(a) || alcancados.has(b)) {
        ligados.add(t.id);
        alcancados.add(a);
        alcancados.add(b);
        mudou = true;
      }
    }
  }
  return todos.filter((t) => ligados.has(t.id));
}

/** Agrupa pontos por proximidade em planta (união-acha), ignorando o pavimento. */
function colunasDe(pontos: readonly Terminal[], raioMm: number): Terminal[][] {
  const pai = pontos.map((_, i) => i);
  const acha = (i: number): number => (pai[i] === i ? i : (pai[i] = acha(pai[i])));
  for (let i = 0; i < pontos.length; i++) {
    for (let j = i + 1; j < pontos.length; j++) {
      if (Math.hypot(pontos[i].at.x - pontos[j].at.x, pontos[i].at.y - pontos[j].at.y) <= raioMm) pai[acha(i)] = acha(j);
    }
  }
  const grupos = new Map<number, Terminal[]>();
  pontos.forEach((p, i) => grupos.set(acha(i), [...(grupos.get(acha(i)) ?? []), p]));
  // Ordem determinística: pelo ponto de menor (x, y) de cada grupo.
  return [...grupos.values()]
    .map((g) => g.sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y))
    .sort((g, h) => g[0].at.x - h[0].at.x || g[0].at.y - h[0].at.y);
}

/**
 * O plano da rede de UMA origem. Puro: devolve os comandos para um lote só.
 */
export function planejarAgua(
  model: BlueprintModel,
  origem: Terminal,
  hip: HipotesesDeAgua = HIPOTESES_AGUA_PADRAO,
): PlanoDeAgua {
  const disciplina: DisciplinaDeRede = origem.tipoHidraulico === 'AQUECEDOR' ? 'AGUA_QUENTE' : 'AGUA_FRIA';
  const tabela: TabelaDeTubo = disciplina === 'AGUA_QUENTE' ? 'CPVC' : 'PVC_SOLDAVEL';
  const dnMinimo = disciplina === 'AGUA_QUENTE' ? hip.dnMinimoAguaQuenteMm : hip.dnMinimoAguaFriaMm;
  const origemNome = FICHA_DO_PONTO_HIDRAULICO[origem.tipoHidraulico ?? 'RESERVATORIO'].rotulo;
  const rede = redeDaOrigem(model, origem, disciplina);
  const vazio = (motivo: string | null, pavimentos: PavimentoDoPlanoDeAgua[] = [], avisos: string[] = []): PlanoDeAgua => ({
    disciplina, origemId: origem.id, origemNome, pavimentos,
    pontos: pavimentos.reduce((n, p) => n + p.pontos, 0), ligados: pavimentos.reduce((n, p) => n + p.ligados, 0), aLigar: 0,
    colunas: 0, sugeridos: rede.filter((t) => t.sugerido).length, trechosDaRede: rede.length,
    comandos: [], metrosPrevistos: 0, dnMaximoMm: 0, somaDePesos: 0, avisos, motivo,
  });

  const nivelDaOrigem = model.levels.find((l) => l.id === origem.levelId);
  if (!nivelDaOrigem) return vazio('a origem está num pavimento inexistente');
  const pontos = pontosDeAgua(model, origem, disciplina);
  if (pontos.length === 0) return vazio(disciplina === 'AGUA_QUENTE' ? 'nenhum ponto de água quente tipado' : 'nenhum ponto de água fria tipado');

  const chave = fazerChave(model.levels);
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const indice = new Map(niveis.map((l, i) => [l.id, i]));
  const avisos: string[] = [];

  // ── Rede existente ────────────────────────────────────────────────────────
  const arestas: Aresta[] = rede.map((t) => ({
    ref: { existente: t.id },
    de: chave(t.levelId, t.a.x, t.a.y, t.cotaAMm),
    para: chave(t.levelId, t.b.x, t.b.y, t.cotaBMm),
    mm: comprimentoMm(t),
  }));
  const temAresta = (de: No, para: No) => arestas.some((a) => (a.de === de && a.para === para) || (a.de === para && a.para === de));
  const novos: Extract<Command, { type: 'AddTrecho' }>[] = [];
  let mmNovos = 0;
  const addTrecho = (levelId: ObjectId, a: Ponto2, cotaA: number, b: Ponto2, cotaB: number) => {
    const de = chave(levelId, a.x, a.y, cotaA);
    const para = chave(levelId, b.x, b.y, cotaB);
    if (de === para || temAresta(de, para)) return;
    novos.push({ type: 'AddTrecho', levelId, disciplina, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: cotaA, cotaBMm: cotaB, bitolaMm: dnMinimo, sugerido: true });
    const mm = comprimentoMm({ a, b, cotaAMm: cotaA, cotaBMm: cotaB });
    arestas.push({ ref: { novo: novos.length - 1 }, de, para, mm });
    mmNovos += mm;
  };

  // ── A origem sobe/desce ao teto do pavimento dela: o barrilete ───────────
  const tetoO = nivelDaOrigem.defaultHeightMm;
  const noDaOrigem = chave(origem.levelId, origem.at.x, origem.at.y, origem.cotaMm);
  const noDaOrigemNoTeto = chave(origem.levelId, origem.at.x, origem.at.y, tetoO);
  if (origem.cotaMm !== tetoO) addTrecho(origem.levelId, origem.at, origem.cotaMm, origem.at, tetoO);
  const idxO = indice.get(origem.levelId) ?? 0;

  // ── Ligados × pendentes, por pavimento ───────────────────────────────────
  const pontasEmPlanta = new Map<ObjectId, Set<string>>();
  for (const t of rede) {
    const s = pontasEmPlanta.get(t.levelId) ?? new Set<string>();
    s.add(`${t.a.x},${t.a.y}`);
    s.add(`${t.b.x},${t.b.y}`);
    pontasEmPlanta.set(t.levelId, s);
  }
  const estaLigado = (p: Terminal) => pontasEmPlanta.get(p.levelId)?.has(`${p.at.x},${p.at.y}`) ?? false;
  const pendentes = pontos.filter((p) => !estaLigado(p));
  const niveisComPontos = niveis.filter((l) => pontos.some((p) => p.levelId === l.id));
  const pavimentos: PavimentoDoPlanoDeAgua[] = niveisComPontos.map((l) => {
    const doNivel = pontos.filter((p) => p.levelId === l.id);
    return { levelId: l.id, nome: l.name, pontos: doNivel.length, ligados: doNivel.filter(estaLigado).length, aLigar: doNivel.filter((p) => !estaLigado(p)).length };
  });

  // ── Colunas: grupos de pendentes por proximidade em planta ───────────────
  const colunas = colunasDe(pendentes, hip.raioDaColunaMm);
  // Cabeça de cada coluna no teto do pavimento da origem; o barrilete a alcança.
  const alcancadosNoBarrilete = new Map<No, Ponto2>([[noDaOrigemNoTeto, { x: origem.at.x, y: origem.at.y }]]);
  for (const t of rede) {
    if (t.levelId !== origem.levelId) continue;
    if (t.cotaAMm === tetoO) alcancadosNoBarrilete.set(chave(t.levelId, t.a.x, t.a.y, tetoO), { x: t.a.x, y: t.a.y });
    if (t.cotaBMm === tetoO) alcancadosNoBarrilete.set(chave(t.levelId, t.b.x, t.b.y, tetoO), { x: t.b.x, y: t.b.y });
  }
  const rotaBarrilete = distanciasDesde(noDaOrigemNoTeto, arestas);
  const rota = new Map<No, number>();
  for (const k of alcancadosNoBarrilete.keys()) rota.set(k, rotaBarrilete.get(k) ?? Infinity);
  rota.set(noDaOrigemNoTeto, 0);
  // NÚCLEO VERTICAL (E2.4): o grupo perto de um shaft sobe por ele.
  const posicaoDaColuna = (grupo: Terminal[]): Ponto2 => {
    const base = { x: grupo[0].at.x, y: grupo[0].at.y };
    return shaftPreferido(model, base, grupo[0].levelId, hip.raioDoShaftMm ?? 3000) ?? base;
  };
  const cabecas = new Map<No, Ponto2>();
  for (const grupo of colunas) {
    const pos = posicaoDaColuna(grupo);
    const k = chave(origem.levelId, pos.x, pos.y, tetoO);
    if (!alcancadosNoBarrilete.has(k)) cabecas.set(k, pos);
  }
  arvoreComRotaLimitada({
    alcancados: alcancadosNoBarrilete,
    rota,
    pendentes: cabecas,
    retaAteRaiz: (p) => Math.hypot(p.x - origem.at.x, p.y - origem.at.y),
    limite: hip.rotaMaximaVezes,
    ligar: (de, para) => addTrecho(origem.levelId, de.pos, tetoO, para.pos, tetoO),
  });

  // ── Cada coluna desce (ou sobe) até o ramal de cada pavimento com pontos ─
  for (const grupo of colunas) {
    const pos = posicaoDaColuna(grupo);
    const niveisDoGrupo = niveis.filter((l) => grupo.some((p) => p.levelId === l.id));
    for (const nivel of niveisDoGrupo) {
      const idx = indice.get(nivel.id) ?? 0;
      if (idx === idxO) {
        // Mesmo pavimento da origem: da cabeça (teto) ao ramal.
        addTrecho(nivel.id, pos, tetoO, pos, hip.cotaRamalMm);
      } else if (idx < idxO) {
        // Abaixo: atravessa os pavimentos intermediários do teto ao piso (a laje é o encontro)...
        for (let k = idxO; k > idx; k--) {
          const m = niveis[k];
          addTrecho(m.id, pos, m.defaultHeightMm, pos, 0);
        }
        // ...e neste, do teto ao ramal.
        addTrecho(nivel.id, pos, nivel.defaultHeightMm, pos, hip.cotaRamalMm);
      } else {
        // Acima da origem (caixa no térreo, ponto no andar): sobe piso→teto nos
        // pavimentos intermediários e piso→ramal neste.
        for (let k = idxO + 1; k < idx; k++) {
          const m = niveis[k];
          addTrecho(m.id, pos, 0, pos, m.defaultHeightMm);
        }
        addTrecho(nivel.id, pos, 0, pos, hip.cotaRamalMm);
      }

      // ── Ramais no pavimento: árvore com rota limitada a partir da coluna ──
      const teto = nivel.defaultHeightMm;
      const cotaRamal = Math.min(hip.cotaRamalMm, teto);
      const noDaColuna = chave(nivel.id, pos.x, pos.y, cotaRamal);
      const alcancados = new Map<No, Ponto2>([[noDaColuna, pos]]);
      const rotaRamal = new Map<No, number>([[noDaColuna, 0]]);
      for (const t of rede) {
        if (t.levelId !== nivel.id) continue;
        if (t.cotaAMm === cotaRamal) alcancados.set(chave(t.levelId, t.a.x, t.a.y, cotaRamal), { x: t.a.x, y: t.a.y });
        if (t.cotaBMm === cotaRamal) alcancados.set(chave(t.levelId, t.b.x, t.b.y, cotaRamal), { x: t.b.x, y: t.b.y });
      }
      const distRamal = distanciasDesde(noDaColuna, arestas);
      for (const k of alcancados.keys()) if (!rotaRamal.has(k)) rotaRamal.set(k, distRamal.get(k) ?? Infinity);
      const pendentesDoNivel = new Map<No, Ponto2>();
      for (const p of grupo) {
        if (p.levelId !== nivel.id) continue;
        // Do ramal à cota do ponto, na posição dele.
        if (p.cotaMm !== cotaRamal) addTrecho(nivel.id, p.at, cotaRamal, p.at, p.cotaMm);
        const k = chave(nivel.id, p.at.x, p.at.y, cotaRamal);
        if (!alcancados.has(k)) pendentesDoNivel.set(k, { x: p.at.x, y: p.at.y });
      }
      arvoreComRotaLimitada({
        alcancados,
        rota: rotaRamal,
        pendentes: pendentesDoNivel,
        retaAteRaiz: (p) => Math.hypot(p.x - pos.x, p.y - pos.y),
        limite: hip.rotaMaximaVezes,
        ligar: (de, para) => addTrecho(nivel.id, de.pos, cotaRamal, para.pos, cotaRamal),
      });
    }
  }

  // ── Pesos a jusante e DN por trecho ──────────────────────────────────────
  const pesoPorAresta = new Map<number, number>();
  const pontosPorAresta = new Map<number, Terminal[]>();
  let somaDePesos = 0;
  for (const p of pontos) {
    const peso = pesoDoPonto(model, p, disciplina);
    somaDePesos += peso;
    const caminho = caminhoEntre(chave(p.levelId, p.at.x, p.at.y, p.cotaMm), noDaOrigem, arestas);
    if (!caminho) continue;
    for (const i of caminho) {
      pesoPorAresta.set(i, (pesoPorAresta.get(i) ?? 0) + peso);
      pontosPorAresta.set(i, [...(pontosPorAresta.get(i) ?? []), p]);
    }
  }
  let dnMaximoMm = 0;
  const atualizacoes: Command[] = [];
  arestas.forEach((ar, i) => {
    const peso = pesoPorAresta.get(i);
    if (peso == null) return;
    // O sub-ramal de UM aparelho nunca abaixo do DN mínimo da ficha dele.
    let minimo = dnMinimo;
    const servidos = pontosPorAresta.get(i) ?? [];
    if (servidos.length === 1) {
      const ficha = servidos[0].tipoHidraulico ? FICHA_DO_PONTO_HIDRAULICO[servidos[0].tipoHidraulico] : null;
      const dnFicha = ficha?.dnMinimoMm[disciplina];
      if (dnFicha && dnFicha > minimo) minimo = dnFicha;
    }
    const { dn } = dimensionarDN(peso, tabela, hip, minimo);
    dnMaximoMm = Math.max(dnMaximoMm, dn);
    const ref = ar.ref;
    if ('novo' in ref) {
      novos[ref.novo].bitolaMm = dn;
    } else {
      const t = rede.find((x) => x.id === ref.existente);
      if (!t || t.bitolaMm >= dn) return;
      if (t.sugerido) atualizacoes.push({ type: 'SetTrechoProps', trechoId: t.id, bitolaMm: dn });
      else avisos.push(`trecho confirmado ${t.rotulo ?? t.id} está em DN ${t.bitolaMm} e o peso a jusante pede DN ${dn}`);
    }
  });

  // ── Prumadas emendadas: uma coluna que desce direto ao ponto é UM tubo ──
  //
  // Quando o grupo tem um ponto só, a coluna (teto → ramal) e a prumada final
  // (ramal → ponto) ficam na mesma vertical com o nó do meio sem mais ninguém:
  // dois trechos colineares que o quantitativo contaria como uma luva que a
  // obra não compra. Emendam-se quando o nó do meio tem grau 2 e o DN é o mesmo.
  const grau = new Map<No, number>();
  for (const ar of arestas) {
    grau.set(ar.de, (grau.get(ar.de) ?? 0) + 1);
    grau.set(ar.para, (grau.get(ar.para) ?? 0) + 1);
  }
  const emendados: Extract<Command, { type: 'AddTrecho' }>[] = [];
  const consumidos = new Set<number>();
  novos.forEach((c, i) => {
    if (consumidos.has(i)) return;
    let atual = c;
    const vertical = (x: typeof c) => x.a.x === x.b.x && x.a.y === x.b.y;
    if (vertical(atual)) {
      let mudou = true;
      while (mudou) {
        mudou = false;
        for (let j = 0; j < novos.length; j++) {
          if (j === i || consumidos.has(j)) continue;
          const o = novos[j];
          if (!vertical(o) || o.levelId !== atual.levelId || o.a.x !== atual.a.x || o.a.y !== atual.a.y || o.bitolaMm !== atual.bitolaMm) continue;
          const meio = o.cotaAMm === atual.cotaBMm ? atual.cotaBMm : o.cotaBMm === atual.cotaAMm ? atual.cotaAMm : null;
          if (meio == null) continue;
          if ((grau.get(chave(atual.levelId, atual.a.x, atual.a.y, meio)) ?? 0) !== 2) continue;
          atual = o.cotaAMm === atual.cotaBMm
            ? { ...atual, cotaBMm: o.cotaBMm }
            : { ...atual, cotaAMm: o.cotaAMm };
          consumidos.add(j);
          mudou = true;
        }
      }
    }
    emendados.push(atual);
  });

  const aLigar = pavimentos.reduce((n, p) => n + p.aLigar, 0);
  if (emendados.length === 0 && atualizacoes.length === 0) {
    return vazio('todos os pontos já estão ligados', pavimentos, avisos);
  }
  return {
    disciplina, origemId: origem.id, origemNome, pavimentos,
    pontos: pontos.length, ligados: pontos.length - pendentes.length, aLigar,
    colunas: colunas.length, sugeridos: rede.filter((t) => t.sugerido).length, trechosDaRede: rede.length,
    comandos: [...emendados, ...atualizacoes], metrosPrevistos: Math.round(mmNovos / 100) / 10,
    dnMaximoMm, somaDePesos: Math.round(somaDePesos * 10) / 10, avisos, motivo: null,
  };
}

/** RELANÇAR: apaga os trechos SUGERIDOS da rede da origem e refaz o plano com o que sobrou. */
export function relancarAgua(model: BlueprintModel, origem: Terminal, hip: HipotesesDeAgua = HIPOTESES_AGUA_PADRAO): PlanoDeAgua {
  const disciplina: DisciplinaDeRede = origem.tipoHidraulico === 'AQUECEDOR' ? 'AGUA_QUENTE' : 'AGUA_FRIA';
  const sugeridos = redeDaOrigem(model, origem, disciplina).filter((t) => t.sugerido);
  if (sugeridos.length === 0) return planejarAgua(model, origem, hip);
  const apagados = new Set(sugeridos.map((t) => t.id));
  const plano = planejarAgua({ ...model, trechos: (model.trechos ?? []).filter((t) => !apagados.has(t.id)) }, origem, hip);
  const remocoes: Command[] = sugeridos.map((t) => ({ type: 'DeleteTrecho', trechoId: t.id }));
  return { ...plano, sugeridos: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}

/** REFAZER: apaga TODA a rede da origem (sugerida e confirmada) e lança de novo. */
export function refazerAgua(model: BlueprintModel, origem: Terminal, hip: HipotesesDeAgua = HIPOTESES_AGUA_PADRAO): PlanoDeAgua {
  const disciplina: DisciplinaDeRede = origem.tipoHidraulico === 'AQUECEDOR' ? 'AGUA_QUENTE' : 'AGUA_FRIA';
  const daRede = redeDaOrigem(model, origem, disciplina);
  if (daRede.length === 0) return planejarAgua(model, origem, hip);
  const apagados = new Set(daRede.map((t) => t.id));
  const plano = planejarAgua({ ...model, trechos: (model.trechos ?? []).filter((t) => !apagados.has(t.id)) }, origem, hip);
  const remocoes: Command[] = daRede.map((t) => ({ type: 'DeleteTrecho', trechoId: t.id }));
  return { ...plano, sugeridos: 0, trechosDaRede: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}

/** Um plano por origem do desenho (caixas d'água e aquecedores), na ordem do modelo. */
export function planejarAguaDoModelo(model: BlueprintModel, hip: HipotesesDeAgua = HIPOTESES_AGUA_PADRAO): PlanoDeAgua[] {
  return origensDeAgua(model).map(({ origem }) => planejarAgua(model, origem, hip));
}
