/**
 * LANÇAMENTO AUTOMÁTICO DE ELETRODUTOS — por QUADRO, compartilhado, entre
 * pavimentos (13/09/2026; reescrito em 15/09/2026).
 *
 * Pedido original: *"implementar lançamento automático de eletroduto"*. O molde
 * é o da distribuição de tomadas: o sistema PROPÕE, marcado como `sugerido`;
 * mover ou aceitar confirma; Ctrl+Z desfaz o lote. Somar é registro, decidir é
 * projeto — e por isso toda hipótese aqui é nomeada.
 *
 * ─── O QUE MUDOU EM 15/09 (revisão dos critérios com o usuário) ──────────────
 *
 * 1. *"cada circuito não necessariamente utiliza eletroduto exclusivo. a norma
 *    não fala isso"* — correto: a NBR 5410 admite vários circuitos no mesmo
 *    eletroduto (6.2.5.6, 6.2.11), cobrando pela taxa de ocupação (6.2.11.1.6)
 *    e pelo fator de agrupamento (Tab. 42). Então a unidade do plano passou a
 *    ser o QUADRO: UMA rede alimenta todos os pontos com circuito dele, e cada
 *    trecho carrega o conjunto dos circuitos que passam por ele.
 * 2. *"não existe a necessidade de quadro por pavimento"* — também correto: um
 *    QDC pode alimentar a casa inteira. Os pontos podem estar em qualquer
 *    pavimento; a rede sobe e desce por uma PRUMADA NA POSIÇÃO DO QUADRO,
 *    atravessando a laje.
 *
 * ─── O MODELO DE REDE QUE SE PROPÕE ─────────────────────────────────────────
 *
 *   1. em cada pavimento a rede corre pelo TETO (`defaultHeightMm`); cada
 *      ponto sobe/desce por uma prumada na própria posição até o teto; o ponto
 *      de luz de teto já está lá;
 *   2. o quadro sobe ao teto do pavimento dele; para alimentar um pavimento
 *      ACIMA, uma prumada do piso ao teto na posição do quadro em cada
 *      pavimento atravessado; para um ABAIXO, o quadro desce ao piso e a rede
 *      do pavimento de baixo o encontra no teto dele — a laje é o encontro
 *      (cota 0 de um pavimento ≡ teto do pavimento imediatamente abaixo);
 *   3. no teto de cada pavimento, TODOS os pontos do quadro ali entram numa
 *      única árvore de menor comprimento (Prim), em linha reta, a partir do
 *      que já está alcançado (o nó do quadro ou da prumada, e as pontas da
 *      rede existente no teto);
 *   4. cada trecho recebe os CIRCUITOS de todos os pontos cujo caminho até o
 *      quadro passa por ele; os condutores são a soma; a BITOLA é a menor
 *      comercial que respeita a taxa de ocupação, nunca abaixo da mínima do
 *      drawer. O tronco que sai do quadro e a prumada entre pavimentos são,
 *      naturalmente, os mais carregados.
 *
 * O que já existe é respeitado: ponta da rede do quadro que chega ao teto é nó
 * alcançado; ponto que já tem eletroduto na sua posição está ligado; trecho
 * existente pelo qual passa um ponto novo GANHA os circuitos dele (e a nova
 * soma de condutores) em vez de ser duplicado. Rodar de novo não cria nada.
 *
 * Ponto SEM circuito não entra: eletroduto carrega circuito, e atribuir um
 * seria decidir por quem projeta (há "Circuitos automáticos" para isso).
 */
import type {
  BlueprintModel,
  Circuito,
  Command,
  Level,
  LigacaoDoCircuito,
  ObjectId,
  Quadro,
  Terminal,
  Trecho,
} from './blueprintKernel';
import {
  HIPOTESES_PADRAO,
  bitolaMinimaPorOcupacao,
  preDimensionarCircuito,
  type HipotesesEletricas,
} from './blueprintEletricaDimensionamento';

export interface HipotesesDeEletroduto {
  /** Diâmetro nominal MÍNIMO do eletroduto lançado, em mm — a ocupação pode pedir mais. */
  bitolaMm: number;
  /** Quantos condutores cada circuito põe no eletroduto, pela ligação dele. */
  condutoresPorLigacao: Record<LigacaoDoCircuito, number>;
}

export const HIPOTESES_ELETRODUTO_PADRAO: HipotesesDeEletroduto = {
  bitolaMm: 25,
  condutoresPorLigacao: { FN: 3, FF: 3, FFF: 4 },
};

/** Bitolas comerciais de eletroduto oferecidas na hipótese e escolhidas pela ocupação. */
export const BITOLAS_DE_ELETRODUTO_MM = [20, 25, 32, 40] as const;

/** Seção assumida para o cálculo de ocupação quando o circuito não tem nem declarada nem calculável. */
const SECAO_ASSUMIDA_MM2 = 2.5;

export interface PavimentoDoPlano {
  levelId: ObjectId;
  nome: string;
  /** Pontos do quadro neste pavimento. */
  pontos: number;
  /** Quantos já têm eletroduto chegando na sua posição. */
  ligados: number;
  /** Quantos o plano liga. */
  aLigar: number;
}

export interface PlanoDeEletrodutos {
  quadroId: ObjectId;
  nome: string;
  pavimentos: PavimentoDoPlano[];
  pontos: number;
  ligados: number;
  aLigar: number;
  /** Prumadas atravessando laje que o plano cria (subida/descida na posição do quadro). */
  prumadasEntrePavimentos: number;
  /** Trechos EXISTENTES que passam a carregar mais circuitos. */
  trechosAtualizados: number;
  /**
   * Trechos SUGERIDOS (ainda não confirmados) da rede deste quadro. Quando um
   * ponto ou o quadro anda, a rede acompanha e continua ligada — mas a
   * proposta ficou velha. É o que "Relançar" apaga e refaz (15/09/2026,
   * pedido: *"ao realizar qualquer movimentação em pontos ou no quadro o botão
   * de lançar eletrodutos deveria ficar disponível para lançamento novamente"*).
   */
  sugeridos: number;
  /** `AddTrecho` (sugeridos) e depois `SetTrechoProps` dos existentes — vazio quando não há o que ligar. */
  comandos: Command[];
  /** Metros de eletroduto que o plano acrescenta. */
  metrosPrevistos: number;
  /** Por que não há plano, quando não há. */
  motivo: string | null;
}

/** Os pontos elétricos do pavimento que ainda não pertencem a circuito nenhum. */
export function pontosSemCircuito(model: BlueprintModel, levelId: string): Terminal[] {
  return (model.terminais ?? []).filter(
    (t) => t.levelId === levelId && t.disciplina === 'ELETRICA' && t.circuitoId == null,
  );
}

/** Os trechos sugeridos ainda não confirmados (no pavimento, ou em todos). */
export function eletrodutosSugeridos(model: BlueprintModel, levelId: string | null): Trecho[] {
  return (model.trechos ?? []).filter((t) => t.sugerido && (!levelId || t.levelId === levelId));
}

// ─── O grafo ────────────────────────────────────────────────────────────────

type No = string;

interface Aresta {
  /** O trecho existente, ou o índice do trecho novo em `novos`. */
  ref: { existente: ObjectId } | { novo: number };
  de: No;
  para: No;
}

/**
 * Chave de um ponto físico da rede. A LAJE é o encontro: a cota 0 de um
 * pavimento é o mesmo lugar que o teto do pavimento imediatamente abaixo —
 * sem isto, a prumada que sobe pela laje terminaria num nó que ninguém
 * alcança.
 */
function fazerChave(niveis: readonly Level[]) {
  const ordenados = [...niveis].sort((a, b) => a.elevationMm - b.elevationMm);
  const abaixoDe = new Map<ObjectId, Level | null>();
  ordenados.forEach((l, i) => abaixoDe.set(l.id, i > 0 ? ordenados[i - 1] : null));
  return (levelId: ObjectId, x: number, y: number, cota: number): No => {
    if (cota === 0) {
      const abaixo = abaixoDe.get(levelId);
      if (abaixo) return `${abaixo.id}|${x},${y}|${abaixo.defaultHeightMm}`;
    }
    return `${levelId}|${x},${y}|${cota}`;
  };
}

const comprimentoMm = (t: { a: { x: number; y: number }; b: { x: number; y: number }; cotaAMm: number; cotaBMm: number }) =>
  Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm);

/**
 * O plano de UM quadro — todos os pavimentos, todos os circuitos dele. Puro:
 * não grava nada; devolve os comandos para quem chama aplicar num lote só.
 */
export function planejarEletrodutos(
  model: BlueprintModel,
  quadro: Quadro,
  hip: HipotesesDeEletroduto = HIPOTESES_ELETRODUTO_PADRAO,
  hipEletricas: HipotesesEletricas = HIPOTESES_PADRAO,
): PlanoDeEletrodutos {
  const vazio = (motivo: string | null, pavimentos: PavimentoDoPlano[] = [], sugeridos = 0): PlanoDeEletrodutos => ({
    quadroId: quadro.id,
    nome: quadro.nome,
    pavimentos,
    pontos: pavimentos.reduce((n, p) => n + p.pontos, 0),
    ligados: pavimentos.reduce((n, p) => n + p.ligados, 0),
    aLigar: 0,
    prumadasEntrePavimentos: 0,
    trechosAtualizados: 0,
    sugeridos,
    comandos: [],
    metrosPrevistos: 0,
    motivo,
  });

  const nivelDoQuadro = model.levels.find((l) => l.id === quadro.levelId);
  if (!nivelDoQuadro) return vazio('o quadro está num pavimento inexistente');
  const circuitos = (model.circuitos ?? []).filter((c) => c.quadroId === quadro.id);
  if (circuitos.length === 0) return vazio('o quadro não tem circuitos');
  const idsDosCircuitos = new Set(circuitos.map((c) => c.id));
  const circuitoPorId = new Map(circuitos.map((c) => [c.id, c]));
  const sugeridosDoQuadro = (model.trechos ?? []).filter(
    (t) => t.sugerido && (t.circuitoIds ?? []).some((cid) => idsDosCircuitos.has(cid)),
  ).length;

  const pontos = (model.terminais ?? []).filter(
    (t) => t.disciplina === 'ELETRICA' && t.circuitoId != null && idsDosCircuitos.has(t.circuitoId),
  );
  if (pontos.length === 0) return vazio('nenhum ponto com circuito deste quadro', [], sugeridosDoQuadro);

  const chave = fazerChave(model.levels);
  const niveisPorElevacao = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const indiceDoNivel = new Map(niveisPorElevacao.map((l, i) => [l.id, i]));

  // ── A rede EXISTENTE do quadro: trechos que já carregam algum circuito dele ─
  const redeExistente = (model.trechos ?? []).filter(
    (t) => t.disciplina === 'ELETRICA' && (t.circuitoIds ?? []).some((cid) => idsDosCircuitos.has(cid)),
  );
  const arestas: Aresta[] = [];
  for (const t of redeExistente) {
    arestas.push({
      ref: { existente: t.id },
      de: chave(t.levelId, t.a.x, t.a.y, t.cotaAMm),
      para: chave(t.levelId, t.b.x, t.b.y, t.cotaBMm),
    });
  }
  const temAresta = (de: No, para: No) => arestas.some((a) => (a.de === de && a.para === para) || (a.de === para && a.para === de));

  // ── Os trechos NOVOS, como comandos, e as arestas deles ─────────────────
  const novos: Extract<Command, { type: 'AddTrecho' }>[] = [];
  let mmNovos = 0;
  const addTrecho = (levelId: ObjectId, a: { x: number; y: number }, cotaA: number, b: { x: number; y: number }, cotaB: number): void => {
    const de = chave(levelId, a.x, a.y, cotaA);
    const para = chave(levelId, b.x, b.y, cotaB);
    if (temAresta(de, para)) return;
    novos.push({
      type: 'AddTrecho',
      levelId,
      disciplina: 'ELETRICA',
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      cotaAMm: cotaA,
      cotaBMm: cotaB,
      bitolaMm: hip.bitolaMm,
      sugerido: true,
    });
    arestas.push({ ref: { novo: novos.length - 1 }, de, para });
    mmNovos += comprimentoMm({ a, b, cotaAMm: cotaA, cotaBMm: cotaB });
  };

  // ── O quadro no teto do próprio pavimento ────────────────────────────────
  const tetoQ = nivelDoQuadro.defaultHeightMm;
  const noDoQuadroNoTeto = chave(quadro.levelId, quadro.at.x, quadro.at.y, tetoQ);
  const noDoQuadro = chave(quadro.levelId, quadro.at.x, quadro.at.y, quadro.cotaMm);
  if (quadro.cotaMm !== tetoQ) addTrecho(quadro.levelId, quadro.at, quadro.cotaMm, quadro.at, tetoQ);

  // ── Pavimentos com pontos, e a prumada entre pavimentos ──────────────────
  const idxQ = indiceDoNivel.get(quadro.levelId) ?? 0;
  const niveisComPontos = niveisPorElevacao.filter((l) => pontos.some((p) => p.levelId === l.id));
  const antesDasPrumadas = novos.length;
  /** A raiz da árvore do pavimento: onde a rede do quadro chega ao teto dele. */
  const raizNoTeto = new Map<ObjectId, No>();
  for (const nivel of niveisComPontos) {
    const idx = indiceDoNivel.get(nivel.id) ?? 0;
    if (idx === idxQ) {
      raizNoTeto.set(nivel.id, noDoQuadroNoTeto);
      continue;
    }
    if (idx > idxQ) {
      // Sobe: em cada pavimento acima do quadro até este, uma prumada piso→teto
      // na posição do quadro. O piso do primeiro é o teto do quadro (a laje).
      for (let k = idxQ + 1; k <= idx; k++) {
        const m = niveisPorElevacao[k];
        addTrecho(m.id, quadro.at, 0, quadro.at, m.defaultHeightMm);
      }
    } else {
      // Desce: o quadro desce ao piso do pavimento dele (que é o teto do de
      // baixo); pavimentos intermediários ganham a prumada piso→teto.
      if (quadro.cotaMm !== 0) addTrecho(quadro.levelId, quadro.at, 0, quadro.at, quadro.cotaMm);
      for (let k = idxQ - 1; k > idx; k--) {
        const m = niveisPorElevacao[k];
        addTrecho(m.id, quadro.at, 0, quadro.at, m.defaultHeightMm);
      }
    }
    raizNoTeto.set(nivel.id, chave(nivel.id, quadro.at.x, quadro.at.y, nivel.defaultHeightMm));
  }
  const prumadasEntrePavimentos = novos.length - antesDasPrumadas;

  // ── Por pavimento: prumadas dos pontos e a árvore no teto ────────────────
  const pavimentos: PavimentoDoPlano[] = [];
  /** O nó no teto de cada ponto (ligado ou a ligar), para o caminho até o quadro. */
  const noDoPonto = new Map<ObjectId, No>();
  for (const nivel of niveisComPontos) {
    const teto = nivel.defaultHeightMm;
    const doNivel = pontos.filter((p) => p.levelId === nivel.id);
    // Onde já chega eletroduto do quadro neste pavimento, em planta (qualquer cota).
    const pontasEmPlanta = new Set<string>();
    for (const t of redeExistente) {
      if (t.levelId !== nivel.id) continue;
      pontasEmPlanta.add(`${t.a.x},${t.a.y}`);
      pontasEmPlanta.add(`${t.b.x},${t.b.y}`);
    }
    const ligados = doNivel.filter((p) => pontasEmPlanta.has(`${p.at.x},${p.at.y}`));
    const pendentes = doNivel.filter((p) => !pontasEmPlanta.has(`${p.at.x},${p.at.y}`));
    // O nó do ponto é na COTA DELE: o caminho até o quadro começa na peça e
    // passa pela prumada — é assim que a prumada ganha o circuito.
    for (const p of doNivel) noDoPonto.set(p.id, chave(nivel.id, p.at.x, p.at.y, p.cotaMm));
    pavimentos.push({ levelId: nivel.id, nome: nivel.name, pontos: doNivel.length, ligados: ligados.length, aLigar: pendentes.length });
    if (pendentes.length === 0) continue;

    // Alcançados no teto: a raiz e toda ponta da rede existente do quadro no teto deste pavimento.
    const alcancados = new Map<No, { x: number; y: number }>();
    alcancados.set(raizNoTeto.get(nivel.id)!, { x: quadro.at.x, y: quadro.at.y });
    for (const t of redeExistente) {
      if (t.levelId !== nivel.id) continue;
      if (t.cotaAMm === teto) alcancados.set(chave(nivel.id, t.a.x, t.a.y, teto), { x: t.a.x, y: t.a.y });
      if (t.cotaBMm === teto) alcancados.set(chave(nivel.id, t.b.x, t.b.y, teto), { x: t.b.x, y: t.b.y });
    }
    // Cada pendente sobe (ou desce) ao teto na própria posição.
    const pendentesNoTeto = new Map<No, { x: number; y: number }>();
    for (const p of pendentes) {
      if (p.cotaMm !== teto) addTrecho(nivel.id, p.at, p.cotaMm, p.at, teto);
      const k = chave(nivel.id, p.at.x, p.at.y, teto);
      if (!alcancados.has(k)) pendentesNoTeto.set(k, { x: p.at.x, y: p.at.y });
    }
    // Prim a partir do alcançado, desempate determinístico (distância, x, y).
    const restantes = [...pendentesNoTeto.entries()].sort(([, p], [, q]) => p.x - q.x || p.y - q.y);
    while (restantes.length > 0) {
      let melhor: { i: number; de: { x: number; y: number }; d: number } | null = null;
      for (let i = 0; i < restantes.length; i++) {
        for (const de of alcancados.values()) {
          const d = Math.hypot(restantes[i][1].x - de.x, restantes[i][1].y - de.y);
          if (!melhor || d < melhor.d) melhor = { i, de, d };
        }
      }
      if (!melhor) break;
      const [[k, para]] = restantes.splice(melhor.i, 1);
      addTrecho(nivel.id, melhor.de, teto, para, teto);
      alcancados.set(k, para);
    }
  }

  const aLigar = pavimentos.reduce((n, p) => n + p.aLigar, 0);
  const ligados = pavimentos.reduce((n, p) => n + p.ligados, 0);

  // ── Os CIRCUITOS de cada trecho: quem passa por ele a caminho do quadro ──
  const vizinhos = new Map<No, { para: No; aresta: number }[]>();
  arestas.forEach((ar, i) => {
    vizinhos.set(ar.de, [...(vizinhos.get(ar.de) ?? []), { para: ar.para, aresta: i }]);
    vizinhos.set(ar.para, [...(vizinhos.get(ar.para) ?? []), { para: ar.de, aresta: i }]);
  });
  const caminhoAteOQuadro = (origem: No): number[] | null => {
    const anterior = new Map<No, { de: No; aresta: number } | null>([[origem, null]]);
    const fila = [origem];
    while (fila.length > 0) {
      const n = fila.shift()!;
      // O destino é o QUADRO na cota dele — assim a prumada do quadro entra no
      // caminho de todo ponto (e carrega todos os circuitos).
      if (n === noDoQuadro) {
        const caminho: number[] = [];
        let atual: No = n;
        for (let passo = anterior.get(atual); passo; passo = anterior.get(atual)) {
          caminho.push(passo.aresta);
          atual = passo.de;
        }
        return caminho;
      }
      for (const v of vizinhos.get(n) ?? []) {
        if (anterior.has(v.para)) continue;
        anterior.set(v.para, { de: n, aresta: v.aresta });
        fila.push(v.para);
      }
    }
    return null;
  };
  const circuitosPorAresta = new Map<number, Set<ObjectId>>();
  for (const p of pontos) {
    const origem = noDoPonto.get(p.id);
    if (!origem || !p.circuitoId) continue;
    const caminho = caminhoAteOQuadro(origem);
    if (!caminho) continue;
    for (const i of caminho) {
      const s = circuitosPorAresta.get(i) ?? new Set<ObjectId>();
      s.add(p.circuitoId);
      circuitosPorAresta.set(i, s);
    }
  }

  // ── Condutores e bitola pela ocupação ────────────────────────────────────
  const secaoDoCircuito = new Map<ObjectId, number>();
  const secaoDe = (c: Circuito): number => {
    const memo = secaoDoCircuito.get(c.id);
    if (memo != null) return memo;
    const s = c.secaoMm2 ?? preDimensionarCircuito(model, c, hipEletricas).secaoCalculada?.secaoMm2 ?? SECAO_ASSUMIDA_MM2;
    secaoDoCircuito.set(c.id, s);
    return s;
  };
  const composicao = (ids: readonly ObjectId[]) => {
    const cs = ids.map((id) => circuitoPorId.get(id)).filter((c): c is Circuito => !!c);
    const porSecao = cs.map((c) => ({ secaoMm2: secaoDe(c), quantidade: hip.condutoresPorLigacao[c.ligacao ?? 'FN'] }));
    const condutores = porSecao.reduce((n, p) => n + p.quantidade, 0);
    const bitola =
      bitolaMinimaPorOcupacao(porSecao, hip.bitolaMm, hipEletricas, BITOLAS_DE_ELETRODUTO_MM) ??
      BITOLAS_DE_ELETRODUTO_MM[BITOLAS_DE_ELETRODUTO_MM.length - 1];
    return { condutores, bitola };
  };

  arestas.forEach((ar, i) => {
    if (!('novo' in ar.ref)) return;
    const ids = [...(circuitosPorAresta.get(i) ?? [])];
    if (ids.length === 0) return;
    const cmd = novos[ar.ref.novo];
    const { condutores, bitola } = composicao(ids);
    cmd.circuitoIds = ids;
    cmd.condutores = condutores;
    cmd.bitolaMm = Math.max(bitola, hip.bitolaMm);
  });

  // Existentes que passam a carregar mais circuitos: a união, e a nova soma.
  const atualizacoes: Command[] = [];
  arestas.forEach((ar, i) => {
    if (!('existente' in ar.ref)) return;
    const id = ar.ref.existente;
    const t = redeExistente.find((x) => x.id === id);
    if (!t) return;
    const atuais = t.circuitoIds ?? [];
    const faltam = [...(circuitosPorAresta.get(i) ?? [])].filter((cid) => !atuais.includes(cid));
    if (faltam.length === 0) return;
    const ids = [...atuais, ...faltam];
    const { condutores, bitola } = composicao(ids);
    atualizacoes.push({ type: 'SetTrechoProps', trechoId: t.id, circuitoIds: ids, condutores, bitolaMm: Math.max(bitola, t.bitolaMm) });
  });

  if (novos.length === 0 && atualizacoes.length === 0) {
    return vazio('todos os pontos já têm eletroduto', pavimentos, sugeridosDoQuadro);
  }

  return {
    quadroId: quadro.id,
    nome: quadro.nome,
    pavimentos,
    pontos: pontos.length,
    ligados,
    aLigar,
    prumadasEntrePavimentos,
    trechosAtualizados: atualizacoes.length,
    sugeridos: sugeridosDoQuadro,
    comandos: [...novos, ...atualizacoes],
    metrosPrevistos: Math.round(mmNovos / 100) / 10,
    motivo: null,
  };
}

/**
 * RELANÇAR: apaga os trechos SUGERIDOS da rede do quadro e refaz o plano com
 * o que sobrou (os confirmados ficam — quem moveu ou aceitou decidiu). É o que
 * devolve o botão depois de mover um ponto ou o quadro: a rede acompanhou a
 * peça e continua ligada, mas a árvore de menor comprimento é outra. Os
 * `DeleteTrecho` vêm primeiro no lote; um Ctrl+Z desfaz tudo.
 */
export function relancarEletrodutos(
  model: BlueprintModel,
  quadro: Quadro,
  hip: HipotesesDeEletroduto = HIPOTESES_ELETRODUTO_PADRAO,
  hipEletricas: HipotesesEletricas = HIPOTESES_PADRAO,
): PlanoDeEletrodutos {
  const ids = new Set((model.circuitos ?? []).filter((c) => c.quadroId === quadro.id).map((c) => c.id));
  const sugeridos = (model.trechos ?? []).filter((t) => t.sugerido && (t.circuitoIds ?? []).some((cid) => ids.has(cid)));
  if (sugeridos.length === 0) return planejarEletrodutos(model, quadro, hip, hipEletricas);
  const apagados = new Set(sugeridos.map((t) => t.id));
  const semSugeridos: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !apagados.has(t.id)) };
  const plano = planejarEletrodutos(semSugeridos, quadro, hip, hipEletricas);
  const remocoes: Command[] = sugeridos.map((t) => ({ type: 'DeleteTrecho', trechoId: t.id }));
  return { ...plano, sugeridos: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}

/** Os planos de todos os quadros do desenho, na ordem do modelo. */
export function planejarEletrodutosDoModelo(
  model: BlueprintModel,
  hip: HipotesesDeEletroduto = HIPOTESES_ELETRODUTO_PADRAO,
  hipEletricas: HipotesesEletricas = HIPOTESES_PADRAO,
): PlanoDeEletrodutos[] {
  return (model.quadros ?? []).map((q) => planejarEletrodutos(model, q, hip, hipEletricas));
}
