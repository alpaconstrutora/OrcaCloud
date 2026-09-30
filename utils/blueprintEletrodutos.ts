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
 *      única árvore, em linha reta, a partir do que já está alcançado (o nó
 *      do quadro ou da prumada, e as pontas da rede existente no teto). A
 *      árvore é a de MENOR ELETRODUTO (Prim) COM ROTA LIMITADA (15/09/2026,
 *      pedido com print: *"o encaminhamento do eletroduto faz um percurso
 *      muito maior do que poderia, resultando em gastos desnecessários"*): a
 *      árvore de menor comprimento total encadeava pontos distantes e o cabo
 *      de um circuito dava a volta na casa. Agora um ponto só se pendura num
 *      nó cujo caminho até o quadro fique dentro de `rotaMaximaVezes` × a
 *      linha reta; entre os que cabem, o de menor eletroduto novo. É o meio
 *      termo entre a árvore mínima (pouco eletroduto, muito cabo) e o leque
 *      (pouco cabo, muito eletroduto);
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
 *
 * ─── E6.3 (29/09/2026, roadmap elétrico): ESTRUTURA, PAREDE E CAIXAS ─────────
 *
 *  - PILAR: o trecho do teto que atravessaria a pegada de um pilar contorna
 *    por um canto dele (`desvioDoPilar`); sem contorno possível, segue reto e
 *    o plano AVISA.
 *  - VIGA: com viga de teto no pavimento, a rede corre 10 cm abaixo do fundo
 *    da mais baixa — como o barrilete da água (E5.5) — desde que fique acima
 *    de 2,10 m; senão fica no teto e o plano avisa do cruzamento.
 *  - PELA PAREDE (hipótese `rotaPelaParede`): os pontos de parede ligam-se
 *    pelo eixo das paredes (a mesma árvore da água, `arvorePelasParedes`, que
 *    já desvia de pilar); a luz de teto continua reta, na laje.
 *  - CAIXAS DE PASSAGEM (hipótese `caixas`, NBR 5410 6.2.11.1.7): trecho
 *    contínuo acima de 15 m (−3 m por curva de 90°) ou com mais de 270° de
 *    curvas ganha caixa; derivação sem ponto embaixo também. Nascem
 *    `sugerida`, como os trechos — ver `blueprintCaixasDePassagem.ts`.
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
import { TIPOS_DE_INFRAESTRUTURA_ELETRICA } from './blueprintKernel';
import { ABAIXO_DA_VIGA_MM, desvioDoPilar, fundoDaVigaMaisBaixaMm, pegadasDePilares } from './blueprintObstaculosEstruturais';
import { arvorePelasParedes, chaveP } from './blueprintRotaPelasParedes';
import { REGRA_DE_CAIXAS_PADRAO, caixasDaRede, type RegraDeCaixas, type SegmentoDaRede } from './blueprintCaixasDePassagem';
import {
  HIPOTESES_PADRAO,
  bitolaMinimaPorOcupacao,
  preDimensionarCircuito,
  type HipotesesEletricas,
} from './blueprintEletricaDimensionamento';
import {
  arvoreComRotaLimitada,
  caminhoEntre,
  comprimentoMm,
  distanciasDesde,
  fazerChave,
  type Aresta,
  type No,
} from './blueprintGrafoDeRede';

export interface HipotesesDeEletroduto {
  /** Diâmetro nominal MÍNIMO do eletroduto lançado, em mm — a ocupação pode pedir mais. */
  bitolaMm: number;
  /** Quantos condutores cada circuito põe no eletroduto, pela ligação dele. */
  condutoresPorLigacao: Record<LigacaoDoCircuito, number>;
  /**
   * ROTA MÁXIMA (15/09/2026): o caminho de um ponto até o quadro pela rede não
   * pode passar de `rotaMaximaVezes` × a linha reta entre os dois. `null` =
   * sem limite (a árvore de menor eletroduto, que faz voltas). `1` = todo
   * ponto em linha reta ao quadro (o leque). Ver o cabeçalho.
   */
  rotaMaximaVezes: number | null;
  /** E6.3: os pontos de PAREDE ligam-se pelo eixo das paredes (a luz de teto segue reta, na laje). */
  rotaPelaParede: boolean;
  /** E6.3: caixas de passagem automáticas pela regra (NBR 5410 6.2.11.1.7); `null` = não lança. */
  caixas: RegraDeCaixas | null;
}

export const HIPOTESES_ELETRODUTO_PADRAO: HipotesesDeEletroduto = {
  bitolaMm: 25,
  condutoresPorLigacao: { FN: 3, FF: 3, FFF: 4 },
  rotaMaximaVezes: 1.5,
  rotaPelaParede: false,
  caixas: REGRA_DE_CAIXAS_PADRAO,
};

/** E6.3: a rede sob a viga só desce até aqui (cota do piso, mm); abaixo disso fica no teto e o plano avisa. */
export const COTA_MINIMA_DA_REDE_MM = 2100;
/** E6.3: até onde um ponto de parede procura a parede para a rota pela parede, mm. */
export const RAIO_DE_ENCAIXE_ELETRICO_MM = 600;

/** As rotas máximas oferecidas na hipótese. */
export const ROTAS_MAXIMAS = [
  { valor: 1.25 as number | null, rotulo: '1,25× a linha reta (rota curta)' },
  { valor: 1.5, rotulo: '1,5× a linha reta (sugerido)' },
  { valor: 2, rotulo: '2× a linha reta' },
  { valor: null, rotulo: 'Sem limite (menos eletroduto)' },
] as const;

/**
 * Bitolas comerciais de eletroduto (PVC rígido) oferecidas na hipótese e
 * escolhidas pela ocupação. E6.3: até 85 — antes parava em 40, e um tronco de
 * quadro grande saía "40" mesmo com a ocupação estourada.
 */
export const BITOLAS_DE_ELETRODUTO_MM = [20, 25, 32, 40, 50, 60, 75, 85] as const;

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
  /** Todos os trechos da rede deste quadro (sugeridos + confirmados) — o que "Refazer" apaga. */
  trechosDoQuadro: number;
  /** `AddTrecho` (sugeridos) e depois `SetTrechoProps` dos existentes — vazio quando não há o que ligar. */
  comandos: Command[];
  /** Metros de eletroduto que o plano acrescenta. */
  metrosPrevistos: number;
  /** Por que não há plano, quando não há. */
  motivo: string | null;
  /** E6.3: caixas de passagem que o plano cria (sugeridas). */
  caixas: number;
  /** E6.3: o que o plano não resolveu sozinho (pilar sem contorno, viga baixa, trecho sem lugar para caixa). */
  avisos: string[];
}

/** Os pontos elétricos do pavimento que ainda não pertencem a circuito nenhum (caixa de passagem, terra etc. não contam — são infraestrutura). */
export function pontosSemCircuito(model: BlueprintModel, levelId: string): Terminal[] {
  return (model.terminais ?? []).filter(
    (t) => t.levelId === levelId && t.disciplina === 'ELETRICA' && t.circuitoId == null && !(t.tipoEletrico && TIPOS_DE_INFRAESTRUTURA_ELETRICA.has(t.tipoEletrico)),
  );
}

/**
 * E6.3 — a COTA DA REDE no pavimento: o teto, ou 10 cm abaixo do fundo da viga
 * de teto mais baixa (como o barrilete da água), desde que acima de 2,10 m.
 */
export function cotaDaRede(model: BlueprintModel, nivel: Pick<Level, 'id' | 'name' | 'defaultHeightMm'>): { cotaMm: number; aviso: string | null } {
  const teto = nivel.defaultHeightMm;
  const fundo = fundoDaVigaMaisBaixaMm(model, nivel.id, teto);
  if (fundo == null) return { cotaMm: teto, aviso: null };
  const abaixo = fundo - ABAIXO_DA_VIGA_MM;
  if (abaixo >= COTA_MINIMA_DA_REDE_MM) {
    return { cotaMm: abaixo, aviso: `${nivel.name}: rede a ${(abaixo / 1000).toFixed(2).replace('.', ',')} m do piso — 10 cm abaixo da viga mais baixa do teto` };
  }
  return { cotaMm: teto, aviso: `${nivel.name}: a viga do teto desce abaixo de ${(COTA_MINIMA_DA_REDE_MM / 1000).toFixed(2).replace('.', ',')} m — a rede ficou no teto, cruzando a viga (confira o furo com o projeto estrutural)` };
}

/** Os trechos sugeridos ainda não confirmados (no pavimento, ou em todos). */
export function eletrodutosSugeridos(model: BlueprintModel, levelId: string | null): Trecho[] {
  return (model.trechos ?? []).filter((t) => t.sugerido && (!levelId || t.levelId === levelId));
}

// ─── O grafo ────────────────────────────────────────────────────────────────
//
// A chave do nó, o Dijkstra, o BFS até a raiz e o Prim com rota limitada
// moram em `blueprintGrafoDeRede.ts` desde 18/09/2026: a água e o esgoto
// automáticos usam exatamente as mesmas peças.

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
  const vazio = (motivo: string | null, pavimentos: PavimentoDoPlano[] = [], sugeridos = 0, trechosDoQuadro = 0): PlanoDeEletrodutos => ({
    quadroId: quadro.id,
    nome: quadro.nome,
    pavimentos,
    pontos: pavimentos.reduce((n, p) => n + p.pontos, 0),
    ligados: pavimentos.reduce((n, p) => n + p.ligados, 0),
    aLigar: 0,
    prumadasEntrePavimentos: 0,
    trechosAtualizados: 0,
    sugeridos,
    trechosDoQuadro,
    comandos: [],
    metrosPrevistos: 0,
    motivo,
    caixas: 0,
    avisos: [],
  });

  const nivelDoQuadro = model.levels.find((l) => l.id === quadro.levelId);
  if (!nivelDoQuadro) return vazio('o quadro está num pavimento inexistente');
  const circuitos = (model.circuitos ?? []).filter((c) => c.quadroId === quadro.id);
  if (circuitos.length === 0) return vazio('o quadro não tem circuitos');
  const idsDosCircuitos = new Set(circuitos.map((c) => c.id));
  const circuitoPorId = new Map(circuitos.map((c) => [c.id, c]));
  const trechosDoQuadro = (model.trechos ?? []).filter((t) => (t.circuitoIds ?? []).some((cid) => idsDosCircuitos.has(cid)));
  const sugeridosDoQuadro = trechosDoQuadro.filter((t) => t.sugerido).length;

  const pontos = (model.terminais ?? []).filter(
    (t) => t.disciplina === 'ELETRICA' && t.circuitoId != null && idsDosCircuitos.has(t.circuitoId),
  );
  if (pontos.length === 0) return vazio('nenhum ponto com circuito deste quadro', [], sugeridosDoQuadro, trechosDoQuadro.length);

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
      mm: comprimentoMm(t),
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
    const mm = comprimentoMm({ a, b, cotaAMm: cotaA, cotaBMm: cotaB });
    arestas.push({ ref: { novo: novos.length - 1 }, de, para, mm });
    mmNovos += mm;
  };

  // ── E6.3: a cota da rede em cada pavimento (teto, ou sob a viga) ─────────
  const avisos: string[] = [];
  const redeDe = new Map<ObjectId, number>();
  for (const l of model.levels) {
    const r = cotaDaRede(model, l);
    redeDe.set(l.id, r.cotaMm);
    if (r.aviso && (pontos.some((p) => p.levelId === l.id) || l.id === quadro.levelId)) avisos.push(r.aviso);
  }
  const rede = (levelId: ObjectId) => redeDe.get(levelId) as number;
  /** Prumada que atravessa o pavimento inteiro na posição do quadro: piso → rede → teto (a rede é nó). */
  const prumadaInteira = (m: Level) => {
    const r = rede(m.id);
    addTrecho(m.id, quadro.at, 0, quadro.at, r);
    if (r !== m.defaultHeightMm) addTrecho(m.id, quadro.at, r, quadro.at, m.defaultHeightMm);
  };

  // ── E6.3: o trecho no teto que atravessaria pilar CONTORNA por um canto ──
  const pegadasDoNivel = new Map<ObjectId, ReturnType<typeof pegadasDePilares>>();
  const pegadas = (levelId: ObjectId) => {
    if (!pegadasDoNivel.has(levelId)) pegadasDoNivel.set(levelId, pegadasDePilares(model, levelId));
    return pegadasDoNivel.get(levelId)!;
  };
  let semContorno = 0;
  /** E6.3: nós da rede sobre a caixa de um ponto de parede (pela parede: o encaixe no eixo) → a descida até ele. */
  const sobrePonto = new Map<string, number>();
  const ligarNaRede = (levelId: ObjectId, a: { x: number; y: number }, b: { x: number; y: number }, cota: number): void => {
    const desvio = desvioDoPilar(a, b, pegadas(levelId));
    if (desvio == null) {
      semContorno++;
      addTrecho(levelId, a, cota, b, cota);
      return;
    }
    const caminho = [a, ...desvio, b];
    for (let i = 1; i < caminho.length; i++) addTrecho(levelId, caminho[i - 1], cota, caminho[i], cota);
  };

  // ── O quadro na rede do próprio pavimento ────────────────────────────────
  const tetoQ = rede(quadro.levelId);
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
      // E6.3: com a rede sob a viga, a prumada passa PELA cota da rede (nó) e segue ao teto.
      if (tetoQ !== nivelDoQuadro.defaultHeightMm) addTrecho(quadro.levelId, quadro.at, tetoQ, quadro.at, nivelDoQuadro.defaultHeightMm);
      for (let k = idxQ + 1; k < idx; k++) prumadaInteira(niveisPorElevacao[k]);
      addTrecho(nivel.id, quadro.at, 0, quadro.at, rede(nivel.id));
    } else {
      // Desce: o quadro desce ao piso do pavimento dele (que é o teto do de
      // baixo); pavimentos intermediários ganham a prumada piso→teto.
      if (quadro.cotaMm !== 0) addTrecho(quadro.levelId, quadro.at, 0, quadro.at, quadro.cotaMm);
      for (let k = idxQ - 1; k > idx; k--) prumadaInteira(niveisPorElevacao[k]);
      // E6.3: do teto (a laje) desce à rede, quando ela corre sob a viga.
      if (rede(nivel.id) !== nivel.defaultHeightMm) addTrecho(nivel.id, quadro.at, rede(nivel.id), quadro.at, nivel.defaultHeightMm);
    }
    raizNoTeto.set(nivel.id, chave(nivel.id, quadro.at.x, quadro.at.y, rede(nivel.id)));
  }
  const prumadasEntrePavimentos = novos.length - antesDasPrumadas;

  // ── Por pavimento: prumadas dos pontos e a árvore no teto ────────────────
  const pavimentos: PavimentoDoPlano[] = [];
  /** O nó no teto de cada ponto (ligado ou a ligar), para o caminho até o quadro. */
  const noDoPonto = new Map<ObjectId, No>();
  for (const nivel of niveisComPontos) {
    // E6.3: a cota DA REDE (teto, ou sob a viga) — o nome ficou `teto` porque é onde a rede corre.
    const teto = rede(nivel.id);
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
    // A ROTA de cada nó alcançado até o quadro, pela rede que existe até aqui
    // (existente + prumadas + o que os pavimentos anteriores acrescentaram).
    // Nó que a rede não alcança fica com rota infinita: só entra se for o
    // único jeito.
    // Medida a partir da RAIZ do pavimento (o nó do quadro, ou da prumada, no
    // teto): é a parte planar do caminho, comparável à linha reta em planta —
    // a prumada do quadro e as entre pavimentos são iguais para todo ponto.
    const raizDoNivel = raizNoTeto.get(nivel.id)!;
    const rotaAteOQuadro = distanciasDesde(raizDoNivel, arestas);
    const rota = new Map<No, number>();
    for (const k of alcancados.keys()) rota.set(k, rotaAteOQuadro.get(k) ?? Infinity);
    rota.set(raizDoNivel, 0);
    const retaAteOQuadro = (p: { x: number; y: number }) => Math.hypot(p.x - quadro.at.x, p.y - quadro.at.y);
    // E6.3 — PELA PAREDE: os pontos de parede (abaixo da rede) ligam-se pelo eixo
    // das paredes; a árvore desvia de pilar. A luz de teto e quem não tem parede
    // perto seguem retos, pendurados na árvore como antes.
    const paredesDoNivel = model.walls.filter((w) => w.levelId === nivel.id);
    const deParede = pendentes.filter((p) => p.cotaMm < teto);
    const pelas = hip.rotaPelaParede && paredesDoNivel.length > 0 && deParede.length > 0
      ? arvorePelasParedes({ paredes: paredesDoNivel, raiz: quadro.at, pendentes: deParede.map((p) => p.at), raioDeEncaixeMm: RAIO_DE_ENCAIXE_ELETRICO_MM, obstaculos: pegadas(nivel.id) })
      : null;
    const naParede = new Set<ObjectId>();
    if (pelas?.raiz) {
      if (chaveP(pelas.raiz) !== chaveP(quadro.at)) ligarNaRede(nivel.id, quadro.at, pelas.raiz, teto);
      for (const a of pelas.arestas) addTrecho(nivel.id, a.de, teto, a.para, teto);
      for (const p of deParede) {
        const q = pelas.encaixe.get(chaveP(p.at));
        if (!q) continue;
        naParede.add(p.id);
        sobrePonto.set(`${nivel.id}|${q.x},${q.y},${teto}`, teto - p.cotaMm + Math.hypot(p.at.x - q.x, p.at.y - q.y));
        // Desce DENTRO da parede, no eixo, até a cota do ponto; e sai para a caixa na face.
        addTrecho(nivel.id, q, teto, q, p.cotaMm);
        if (chaveP(q) !== chaveP(p.at)) addTrecho(nivel.id, q, p.cotaMm, p.at, p.cotaMm);
      }
      // Os nós da árvore das paredes passam a ser alcançados — a rota deles é a medida pela rede.
      const distParede = distanciasDesde(raizDoNivel, arestas);
      for (const a of pelas.arestas) {
        for (const v of [a.de, a.para]) {
          const k = chave(nivel.id, v.x, v.y, teto);
          alcancados.set(k, v);
          rota.set(k, distParede.get(k) ?? Infinity);
        }
      }
    }
    // Cada pendente sobe (ou desce) ao teto na própria posição.
    const pendentesNoTeto = new Map<No, { x: number; y: number }>();
    for (const p of pendentes) {
      if (naParede.has(p.id)) continue;
      if (p.cotaMm !== teto) addTrecho(nivel.id, p.at, p.cotaMm, p.at, teto);
      const k = chave(nivel.id, p.at.x, p.at.y, teto);
      if (!alcancados.has(k)) pendentesNoTeto.set(k, { x: p.at.x, y: p.at.y });
    }
    // Prim COM ROTA LIMITADA: a cada passo entra o pendente que exige o menor
    // eletroduto novo — mas só se pendurando num nó cujo caminho até o quadro
    // (rota do nó + trecho novo) fique dentro de `rotaMaximaVezes` × a linha
    // reta do pendente ao quadro. Se nenhum nó cabe (não acontece: a raiz
    // sempre cabe quando a rota dela é conhecida), vale o mais próximo.
    // Desempate determinístico (distância, x, y).
    arvoreComRotaLimitada({
      alcancados,
      rota,
      pendentes: pendentesNoTeto,
      retaAteRaiz: retaAteOQuadro,
      limite: hip.rotaMaximaVezes,
      // E6.3: reto pelo teto, mas contornando pilar.
      ligar: (de, para) => ligarNaRede(nivel.id, de.pos, para.pos, teto),
    });
  }

  const aLigar = pavimentos.reduce((n, p) => n + p.aLigar, 0);
  const ligados = pavimentos.reduce((n, p) => n + p.ligados, 0);

  // ── Os CIRCUITOS de cada trecho: quem passa por ele a caminho do quadro ──
  // O destino é o QUADRO na cota dele — assim a prumada do quadro entra no
  // caminho de todo ponto (e carrega todos os circuitos).
  const caminhoAteOQuadro = (origem: No): number[] | null => caminhoEntre(origem, noDoQuadro, arestas);
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
    // E2.2 (29/09/2026): a CONTAGEM não é mais declarada pelo lançamento — a
    // fiação é DERIVADA dos esquemas (`blueprintFiacao.ts`), com retorno. A
    // base por ligação continua servindo à BITOLA (ocupação), como hipótese.
    const { bitola } = composicao(ids);
    cmd.circuitoIds = ids;
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
    const { bitola } = composicao(ids);
    atualizacoes.push({ type: 'SetTrechoProps', trechoId: t.id, circuitoIds: ids, bitolaMm: Math.max(bitola, t.bitolaMm) });
  });

  if (novos.length === 0 && atualizacoes.length === 0) {
    return vazio('todos os pontos já têm eletroduto', pavimentos, sugeridosDoQuadro, trechosDoQuadro.length);
  }
  if (semContorno > 0) avisos.push(`${semContorno} trecho(s) atravessam pilar sem contorno possível (pilares encostados) — confira com o projeto estrutural`);

  // ── E6.3: CAIXAS DE PASSAGEM, por pavimento, nos trechos novos ───────────
  const caixasCmds: Command[] = [];
  const partes = new Map<number, { x: number; y: number }[]>(); // índice do novo → pontos de corte
  if (hip.caixas) {
    const regra = hip.caixas;
    const distDoQuadro = distanciasDesde(noDoQuadro, arestas);
    const niveisDosNovos = [...new Set(novos.map((n) => n.levelId))];
    for (const levelId of niveisDosNovos) {
      const segs: SegmentoDaRede[] = [];
      novos.forEach((n, i) => {
        if (n.levelId === levelId) segs.push({ id: i, a: { x: n.a.x, y: n.a.y, z: n.cotaAMm }, b: { x: n.b.x, y: n.b.y, z: n.cotaBMm } });
      });
      redeExistente.forEach((tr, i) => {
        if (tr.levelId === levelId) segs.push({ id: novos.length + i, a: { x: tr.a.x, y: tr.a.y, z: tr.cotaAMm }, b: { x: tr.b.x, y: tr.b.y, z: tr.cotaBMm }, fixo: true });
      });
      // Onde há caixa: os pontos (qualquer um do pavimento), o quadro, e as caixas que já existem.
      const pecas = (model.terminais ?? []).filter((x) => x.levelId === levelId && x.disciplina === 'ELETRICA');
      const quadrosDoNivel = (model.quadros ?? []).filter((q) => q.levelId === levelId);
      const caixaEm = (p: { x: number; y: number; z: number }) => {
        if (pecas.some((x) => x.at.x === p.x && x.at.y === p.y && x.cotaMm === p.z)) return { descidaMm: 0 };
        if (quadrosDoNivel.some((q) => q.at.x === p.x && q.at.y === p.y && q.cotaMm === p.z)) return { descidaMm: 0 };
        // Pela parede: o nó no eixo, no alto, sobre a caixa de um ponto.
        const descidaNaParede = sobrePonto.get(`${levelId}|${p.x},${p.y},${p.z}`);
        if (descidaNaParede != null) return { descidaMm: descidaNaParede };
        // Nó sobre um ponto (a prumada dele): a caixa do ponto serve à derivação.
        const embaixo = pecas.filter((x) => x.at.x === p.x && x.at.y === p.y && x.cotaMm < p.z).sort((u, v) => v.cotaMm - u.cotaMm)[0];
        if (embaixo) return { descidaMm: p.z - embaixo.cotaMm };
        // A prumada do quadro também é caixa (o próprio quadro).
        const q = quadrosDoNivel.find((x) => x.at.x === p.x && x.at.y === p.y && x.cotaMm < p.z);
        if (q) return { descidaMm: p.z - q.cotaMm };
        return null;
      };
      // Mede do quadro para as pontas: a distância pela rede até ele ordena as fronteiras.
      const r = caixasDaRede(segs, caixaEm, regra, (p) => distDoQuadro.get(chave(levelId, p.x, p.y, p.z)) ?? Infinity);
      const nomeDoNivel = model.levels.find((l) => l.id === levelId)?.name ?? '';
      for (const a of r.avisos) avisos.push(`${nomeDoNivel}: ${a}`);
      for (const c of r.caixas) {
        caixasCmds.push({
          type: 'AddTerminal',
          levelId,
          disciplina: 'ELETRICA',
          tipo: 'Caixa de passagem',
          tipoEletrico: 'CAIXA_PASSAGEM',
          at: { x: c.at.x, y: c.at.y },
          cotaMm: c.at.z,
          sugerida: true,
          rotulo: c.motivo === 'DERIVACAO' ? 'derivação' : c.motivo === 'CURVAS' ? 'mais de 270° de curvas' : 'trecho acima de 15 m (−3 m por curva)',
        });
        if (c.segmento != null && c.segmento < novos.length) partes.set(c.segmento, [...(partes.get(c.segmento) ?? []), { x: c.at.x, y: c.at.y }]);
      }
    }
  }
  // O trecho com caixa no meio vira dois (ou mais) — mesmos circuitos e bitola.
  const novosFinais: Command[] = [];
  novos.forEach((n, i) => {
    const cortes = partes.get(i);
    if (!cortes) {
      novosFinais.push(n);
      return;
    }
    const ordenados = [...cortes].sort((p, q) => Math.hypot(p.x - n.a.x, p.y - n.a.y) - Math.hypot(q.x - n.a.x, q.y - n.a.y));
    const nos = [n.a, ...ordenados, n.b];
    for (let j = 1; j < nos.length; j++) novosFinais.push({ ...n, a: { x: nos[j - 1].x, y: nos[j - 1].y }, b: { x: nos[j].x, y: nos[j].y } });
  });

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
    trechosDoQuadro: trechosDoQuadro.length,
    comandos: [...novosFinais, ...atualizacoes, ...caixasCmds],
    metrosPrevistos: Math.round(mmNovos / 100) / 10,
    motivo: null,
    caixas: caixasCmds.length,
    avisos,
  };
}

/**
 * E6.3: as caixas de passagem SUGERIDAS que ficam num nó dos trechos dados —
 * as que o lançamento criou para aquela rede. Relançar e refazer apagam junto.
 */
function caixasSugeridasDaRede(model: BlueprintModel, trechos: readonly Trecho[]): Terminal[] {
  const nos = new Set<string>();
  for (const t of trechos) {
    nos.add(`${t.levelId}|${t.a.x},${t.a.y},${t.cotaAMm}`);
    nos.add(`${t.levelId}|${t.b.x},${t.b.y},${t.cotaBMm}`);
  }
  return (model.terminais ?? []).filter(
    (x) => x.sugerida && x.tipoEletrico === 'CAIXA_PASSAGEM' && nos.has(`${x.levelId}|${x.at.x},${x.at.y},${x.cotaMm}`),
  );
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
  const caixas = caixasSugeridasDaRede(model, sugeridos);
  const caixasApagadas = new Set(caixas.map((c) => c.id));
  const semSugeridos: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !apagados.has(t.id)), terminais: (model.terminais ?? []).filter((x) => !caixasApagadas.has(x.id)) };
  const plano = planejarEletrodutos(semSugeridos, quadro, hip, hipEletricas);
  const remocoes: Command[] = [...sugeridos.map((t) => ({ type: 'DeleteTrecho' as const, trechoId: t.id })), ...caixas.map((c) => ({ type: 'DeleteTerminal' as const, terminalId: c.id }))];
  return { ...plano, sugeridos: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}

/**
 * REFAZER: apaga TODOS os eletrodutos da rede do quadro — sugeridos e
 * confirmados — e lança de novo com o critério atual. É o que aplica um
 * critério novo (a rota máxima, por exemplo) a uma rede que já foi aceita;
 * por isso quem chama pede confirmação antes. Um Ctrl+Z desfaz.
 */
export function refazerEletrodutos(
  model: BlueprintModel,
  quadro: Quadro,
  hip: HipotesesDeEletroduto = HIPOTESES_ELETRODUTO_PADRAO,
  hipEletricas: HipotesesEletricas = HIPOTESES_PADRAO,
): PlanoDeEletrodutos {
  const ids = new Set((model.circuitos ?? []).filter((c) => c.quadroId === quadro.id).map((c) => c.id));
  const daRede = (model.trechos ?? []).filter((t) => (t.circuitoIds ?? []).some((cid) => ids.has(cid)));
  if (daRede.length === 0) return planejarEletrodutos(model, quadro, hip, hipEletricas);
  const apagados = new Set(daRede.map((t) => t.id));
  const caixas = caixasSugeridasDaRede(model, daRede);
  const caixasApagadas = new Set(caixas.map((c) => c.id));
  const semRede: BlueprintModel = { ...model, trechos: (model.trechos ?? []).filter((t) => !apagados.has(t.id)), terminais: (model.terminais ?? []).filter((x) => !caixasApagadas.has(x.id)) };
  const plano = planejarEletrodutos(semRede, quadro, hip, hipEletricas);
  const remocoes: Command[] = [...daRede.map((t) => ({ type: 'DeleteTrecho' as const, trechoId: t.id })), ...caixas.map((c) => ({ type: 'DeleteTerminal' as const, terminalId: c.id }))];
  return { ...plano, sugeridos: 0, trechosDoQuadro: 0, comandos: [...remocoes, ...plano.comandos], motivo: null };
}

/** Os planos de todos os quadros do desenho, na ordem do modelo. */
export function planejarEletrodutosDoModelo(
  model: BlueprintModel,
  hip: HipotesesDeEletroduto = HIPOTESES_ELETRODUTO_PADRAO,
  hipEletricas: HipotesesEletricas = HIPOTESES_PADRAO,
): PlanoDeEletrodutos[] {
  return (model.quadros ?? []).map((q) => planejarEletrodutos(model, q, hip, hipEletricas));
}
