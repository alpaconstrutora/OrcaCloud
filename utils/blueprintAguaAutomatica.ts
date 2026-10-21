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
 *      corre até a cabeça de cada COLUNA — por cima das paredes (27/09/2026,
 *      o mesmo grafo dos ramais; visto no harness: em reta ele cruzava a sala
 *      para chegar à coluna do outro lado); sem parede perto, em reta;
 *   4. COLUNAS: os pontos são agrupados por proximidade em planta
 *      (`raioDaColunaMm`, união entre pavimentos); cada grupo ganha uma prumada
 *      na posição do ponto de menor (x, y), do teto do pavimento da origem até
 *      a cota do ramal de cada pavimento que tem pontos do grupo — pela laje,
 *      quando desce de pavimento (cota 0 ≡ teto do de baixo);
 *   5. RAMAIS: em cada pavimento, na `cotaRamalMm` (2,20 m — logo abaixo do forro,
 *      acima das portas), PELAS PAREDES (27/09/2026, "tubulacao de agua fria e
 *      quente deve passar pelas paredes"): a coluna fica no eixo da parede mais
 *      próxima, o ramal corre pelo eixo das paredes (`blueprintRotaPelasParedes`)
 *      até a projeção de cada ponto, desce DENTRO da parede até a cota do ponto e
 *      sai para a face num toco. O ponto SOLTO no cômodo a até `raioDeEncaixeMm`
 *      da parede (o que a louça punha no centro dela) é ENCOSTADO na face antes —
 *      `TranslateEntities` no plano, Ctrl+Z desfaz; senão o toco atravessava o
 *      ar. Ponto sem parede a `raioDeEncaixeMm` (a ilha)
 *      liga-se como antes — árvore de menor tubo com rota limitada, em reta —,
 *      com aviso. `pelasParedes: false` volta ao traçado reto em tudo.
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
 * disponível. Serve ao quantitativo e ao traçado de partida; o projeto
 * executivo é do projetista.
 *
 * E5.5 (29/09/2026): a ESTRUTURA entra no traçado — o barrilete corre 10 cm
 * abaixo da viga mais baixa do teto, a rota pelas paredes contorna pilar
 * (entrar num custa 10 m de tubo) e a coluna que cairia num pilar escorrega pela parede. Ver
 * `blueprintObstaculosEstruturais.ts`.
 */
import type { BlueprintModel, Command, DisciplinaDeRede, MaterialDeTubo, ObjectId, Point, Terminal, Trecho } from './blueprintKernel';
import { applyBatch, cantosDaParede, pointInPolygon } from './blueprintKernel';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
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
import { FAIXA_NO_SHAFT, shaftPreferido } from './blueprintNucleoVertical';
import { arvorePelasParedes, chaveP, encaixarNaParede, faceDaParede, paredesEmComum } from './blueprintRotaPelasParedes';
import { PENALIDADE_DO_CONTORNO_NO_FORRO_MM, cotaDaFaixa, descidaDoForro, encaixaNoAnel, paredesDoForro, prumadasQueCruzam, saidaDoRebaixoPelaParede, type FaixaDoForro } from './blueprintRotaPeloForro';
import { ABAIXO_DA_VIGA_MM, CONTORNO_DO_PILAR_MM, SOBRE_A_LAJE_MM, VAO_MINIMO_ABAIXO_DA_VIGA_MM, anelDoPilar, desvioDoPilar, fracaoDentro, foraDaViga, foraDoPilar, fundoDaVigaMaisBaixaMm, pegadasDePilares, topoDaLajeDoTetoMm } from './blueprintObstaculosEstruturais';

/**
 * A tabela de DN do lançamento é a do MATERIAL (E1.1): uma fonte só para o
 * dimensionamento por velocidade e para a perda de carga
 * (`blueprintHidraulicaPressao.FICHA_DO_MATERIAL`).
 */
export type TabelaDeTubo = MaterialDeTubo;

/** DN nominal → diâmetro interno (mm), por material. Derivado de `FICHA_DO_MATERIAL`. */
export const DIAMETROS: Record<TabelaDeTubo, { dn: number; internoMm: number }[]> = Object.fromEntries(
  Object.entries(FICHA_DO_MATERIAL).map(([k, f]) => [k, f.diametros]),
) as Record<TabelaDeTubo, { dn: number; internoMm: number }[]>;

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
  /** Ramais PELAS PAREDES (27/09/2026). Ausente = sim. */
  pelasParedes?: boolean;
  /** Distância máxima do ponto (ou da coluna) ao eixo da parede para correr por ela. Ausente = 700. */
  raioDeEncaixeMm?: number;
  /**
   * F8b (15/10/2026): o ramal e o barrilete CONTORNAM o pilar a esta distância da face, em vez de
   * atravessá-lo no encontro das paredes. Ausente = `CONTORNO_DO_PILAR_MM` (40); 0 = só a penalidade.
   */
  contornoDoPilarMm?: number;
  /**
   * F8b: com a caixa ACIMA do teto e laje cobrindo o pavimento, o barrilete corre SOBRE a laje, com o eixo
   * a isto do topo dela — e não no teto, dentro das vigas. Ausente = `SOBRE_A_LAJE_MM` (150).
   */
  barrileteSobreALajeMm?: number;
  /**
   * F14a da casa automática (15/10/2026, "forro com faixas"): a FAIXA da água quente — um deslocamento (no mundo, mm)
   * das paredes por onde ela é traçada, para não correr no mesmo eixo da fria. A rota anda pelas paredes deslocadas,
   * desviando dos pilares e das vigas REAIS; a coluna no shaft fica no centro dele mais a faixa. Ausente = no eixo.
   */
  faixaDaAguaQuente?: { x: number; y: number } | null;
  /**
   * F14b da casa automática (16/10/2026, "forro com faixas" + "manter 2,80 m, furar vigas"): os ramais — e o barrilete
   * que não corre sobre a laje — NO FORRO: na cota da faixa de cada água e afastados da face da parede, pelos anéis
   * dos cômodos (`paredesDoForro`); de lá a descida até a peça junto da viga (`descidaDoForro`). Ausente = como antes
   * (ramal na `cotaRamalMm`, pelo eixo das paredes).
   */
  noForro?: { aguaFria: FaixaDoForro; aguaQuente: FaixaDoForro; folgaSobAVigaMm: number } | null;
  /**
   * F16 da casa automática (16/10/2026): a folga, além dos raios, entre a coluna desta água e a prumada da OUTRA água
   * já traçada. Ausente = `AFASTAMENTO_ENTRE_COLUNAS_MM` (50).
   */
  afastamentoEntreColunasMm?: number;
}

/** F14b: o raio do tubo na conta da descida (folga sob a viga) — DN 40 de PVC; o ramal da casa não passa disso. */
const RAIO_NA_DESCIDA_MM = 20;
/** F16: o padrão de `HipotesesDeAgua.afastamentoEntreColunasMm`. */
const AFASTAMENTO_ENTRE_COLUNAS_MM = 50;
/** F18: até onde a origem no forro (o aquecedor) procura o anel quando não há um ao alcance de encaixe, mm. */
const ALCANCE_DA_RAIZ_NO_FORRO_MM = 3000;

export const HIPOTESES_AGUA_PADRAO: HipotesesDeAgua = {
  velocidadeMaxMs: 2,
  dnMinimoAguaFriaMm: 20,
  dnMinimoAguaQuenteMm: 22,
  cotaRamalMm: 2200,
  raioDaColunaMm: 1500,
  rotaMaximaVezes: 1.5,
  raioDoShaftMm: 3000,
  pelasParedes: true,
  raioDeEncaixeMm: 700,
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

/** Os rótulos dos trechos de água que não são rede de distribuição (E4.2/E4.3/E4.4). */
export const FORA_DA_DISTRIBUICAO = new Set(['Alimentador', 'Extravasor', 'Limpeza', 'Sucção', 'Recalque']);

/** As origens do desenho: caixas d'água (água fria) e aquecedores (água quente). */
export function origensDeAgua(model: BlueprintModel): { origem: Terminal; disciplina: DisciplinaDeRede }[] {
  return (model.terminais ?? [])
    // E4.2: o reservatório INFERIOR não distribui — recebe o alimentador e é recalcado ao superior.
    .filter((t) => (t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA' && t.papelReservatorio !== 'INFERIOR') || (t.tipoHidraulico === 'AQUECEDOR' && t.disciplina === 'AGUA_QUENTE'))
    .map((t) => ({ origem: t, disciplina: HIDRAULICA_DA_ORIGEM[t.tipoHidraulico as 'RESERVATORIO' | 'AQUECEDOR'] }));
}

/** O peso NBR 5626 de um ponto da disciplina; o aquecedor na água fria vale a soma dos quentes. */
export function pesoDoPonto(model: BlueprintModel, t: Terminal, disciplina: DisciplinaDeRede): number {
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
  // E4.2/E4.3: alimentador, extravasor e limpeza NUNCA são distribuição — mesmo que
  // encostem num nó dela (a subida do alimentador pode cruzar a posição de uma coluna).
  const todos = (model.trechos ?? []).filter((t) => t.disciplina === disciplina && !FORA_DA_DISTRIBUICAO.has(t.rotulo ?? ''));
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
/** Até onde a coluna que atravessa pavimentos procura a parede que existe em todos eles, mm. */
const ALCANCE_DA_PAREDE_EM_COMUM_MM = 3000;
/** Pendência antiga (21/10/2026): até onde se procura outro nó da árvore quando a descida do mais perto atravessa pilar, mm. */
const OUTRO_NO_DA_DESCIDA_ATE_MM = 2500;

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
  // S1 da casa automática (20/10/2026): o trecho HORIZONTAL que atravessaria uma laje REBAIXADA do pavimento (a base dela
  // abaixo do tubo — o rebaixo do banheiro de cima desce até o forro) contorna o rebaixo (e os pilares) — num ponto só,
  // porque vinha de quatro caminhos (as arestas e as retas do barrilete, a ligação da coluna ao anel, as retas dos ramais):
  // a quente e a fria corriam na faixa do forro DENTRO da laje (1–2 trechos por lote). Sem contorno, fica a reta.
  const rebaixosPorNivel = new Map<ObjectId, { anel: Point[]; base: number }[]>();
  const rebaixosDe = (levelId: ObjectId) => {
    let r = rebaixosPorNivel.get(levelId);
    if (!r) {
      const nv = model.levels.find((l) => l.id === levelId);
      r = nv ? (model.structures ?? []).filter((x) => x.kind === 'LAJE' && x.levelId === levelId && x.baseMm < nv.defaultHeightMm - 1).map((x) => ({ anel: anelDoPilar(x.pontos as Point[], RAIO_NA_DESCIDA_MM) as Point[], base: x.baseMm })) : [];
      rebaixosPorNivel.set(levelId, r);
    }
    return r;
  };
  // Os pilares e as prumadas das outras redes, por nível e cota — o `model` não muda durante o traçado (os trechos novos
  // vão para `novos`), e montá-los a cada reta custava +45 % no sobrado.
  const obstaculosPorChave = new Map<string, Point[][]>();
  const pilaresEPrumadas = (levelId: ObjectId, cota: number) => {
    const k = `${levelId}|${cota}`;
    let r = obstaculosPorChave.get(k);
    if (!r) {
      r = [...pegadasDePilares(model, levelId).map((g) => anelDoPilar(g, RAIO_NA_DESCIDA_MM) as Point[]), ...(prumadasQueCruzam(model, levelId, cota, disciplina, RAIO_NA_DESCIDA_MM, 2, false) as Point[][])];
      obstaculosPorChave.set(k, r);
    }
    return r;
  };
  const addTrecho = (levelId: ObjectId, a: Ponto2, cotaA: number, b: Ponto2, cotaB: number) => {
    if (cotaA === cotaB && (a.x !== b.x || a.y !== b.y)) {
      const rebaixos = rebaixosDe(levelId).filter((r) => r.base < cotaA + RAIO_NA_DESCIDA_MM).map((r) => r.anel);
      if (rebaixos.length && fracaoDentro(a, b, rebaixos) > 0) {
        // E das prumadas das outras redes que atravessam a faixa (a descida do eletroduto da tomada, traçada antes).
        const desvio = desvioDoPilar(a, b, [...rebaixos, ...pilaresEPrumadas(levelId, cotaA)]);
        if (desvio && desvio.length) {
          const pts = [a, ...desvio.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), b];
          for (let i = 1; i < pts.length; i++) addTrechoReto(levelId, pts[i - 1], cotaA, pts[i], cotaB);
          return;
        }
      }
    }
    addTrechoReto(levelId, a, cotaA, b, cotaB);
  };
  const addTrechoReto = (levelId: ObjectId, a: Ponto2, cotaA: number, b: Ponto2, cotaB: number) => {
    const de = chave(levelId, a.x, a.y, cotaA);
    const para = chave(levelId, b.x, b.y, cotaB);
    if (de === para || temAresta(de, para)) return;
    novos.push({ type: 'AddTrecho', levelId, disciplina, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: cotaA, cotaBMm: cotaB, bitolaMm: dnMinimo, sugerido: true });
    const mm = comprimentoMm({ a, b, cotaAMm: cotaA, cotaBMm: cotaB });
    arestas.push({ ref: { novo: novos.length - 1 }, de, para, mm });
    mmNovos += mm;
  };

  // ── A origem sobe/desce ao teto do pavimento dela: o barrilete ───────────
  // E5.5: com viga no teto, o barrilete corre 10 cm abaixo do fundo da mais baixa
  // (desde que ainda acima do ramal) — `tetoO` é a cota DO BARRILETE, não a do teto.
  // F8b (15/10/2026), antes de tudo: a caixa ACIMA do teto, com laje cobrindo o pavimento (a caixa d'água
  // sobre a laje da casa) → o barrilete corre SOBRE a laje, como se faz na obra; as colunas descem pela laje.
  // E, sem espaço de 10 cm entre o ramal e a viga, o barrilete corre no MEIO desse vão — abaixo da viga —
  // em vez de subir ao teto e correr dentro dela.
  // Pelas paredes, o barrilete só passa sob as vigas que correm sobre parede (não sob a de transição do sobrado).
  // F14b: no forro, a faixa desta água (cota e afastamento) — os ramais correm nos anéis dos cômodos, na cota dela.
  const noForro = hip.pelasParedes !== false && hip.noForro ? (disciplina === 'AGUA_QUENTE' ? hip.noForro.aguaQuente : hip.noForro.aguaFria) : null;
  const cotaDoRamal = (nivel: { defaultHeightMm: number }) => (noForro ? cotaDaFaixa(nivel.defaultHeightMm, noForro) : Math.min(hip.cotaRamalMm, nivel.defaultHeightMm));
  const cotaRamalDaOrigem = noForro ? cotaDoRamal(nivelDaOrigem) : hip.cotaRamalMm;
  const fundoDaViga = fundoDaVigaMaisBaixaMm(model, origem.levelId, nivelDaOrigem.defaultHeightMm, { soSobreParede: hip.pelasParedes !== false });
  const abaixoDaViga = fundoDaViga == null ? null : fundoDaViga - ABAIXO_DA_VIGA_MM;
  const topoDaLaje = topoDaLajeDoTetoMm(model, origem.levelId, nivelDaOrigem.defaultHeightMm);
  const sobreALaje = topoDaLaje == null ? null : topoDaLaje + (hip.barrileteSobreALajeMm ?? SOBRE_A_LAJE_MM);
  const noVaoAbaixoDaViga = fundoDaViga != null && fundoDaViga - hip.cotaRamalMm >= VAO_MINIMO_ABAIXO_DA_VIGA_MM ? Math.round((fundoDaViga + hip.cotaRamalMm) / 2) : null;
  const m2 = (mm: number) => (mm / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  let tetoO = nivelDaOrigem.defaultHeightMm;
  /** F14b: a origem abaixo do teto (o aquecedor na parede) chega ao barrilete NO FORRO pela descida, não por uma vertical no cômodo. */
  let origemNoForro = false;
  if (sobreALaje != null && origem.cotaMm >= sobreALaje) {
    tetoO = sobreALaje;
    avisos.push(`barrilete sobre a laje, a ${m2(tetoO)} m do piso — as colunas descem pela laje`);
  } else if (noForro) {
    tetoO = cotaRamalDaOrigem;
    origemNoForro = true;
    avisos.push(`barrilete no forro, a ${m2(tetoO)} m do piso — atravessa as vigas entre os cômodos`);
  } else if (abaixoDaViga != null && abaixoDaViga > hip.cotaRamalMm) {
    tetoO = abaixoDaViga;
    avisos.push(`barrilete a ${m2(tetoO)} m do piso — 10 cm abaixo da viga mais baixa do teto`);
  } else if (noVaoAbaixoDaViga != null) {
    tetoO = noVaoAbaixoDaViga;
    avisos.push(`barrilete a ${m2(tetoO)} m do piso — entre o ramal e a viga mais baixa do teto, que desce até perto dele`);
  } else if (abaixoDaViga != null) {
    avisos.push('a viga do teto desce até o ramal — o barrilete ficou no teto, cruzando a viga (confira o furo com o projeto estrutural)');
  }
  const noDaOrigem = chave(origem.levelId, origem.at.x, origem.at.y, origem.cotaMm);
  const noDaOrigemNoTeto = chave(origem.levelId, origem.at.x, origem.at.y, tetoO);
  if (origem.cotaMm !== tetoO && !origemNoForro) addTrecho(origem.levelId, origem.at, origem.cotaMm, origem.at, tetoO);
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
  const pelasParedes = hip.pelasParedes !== false;
  const raioDeEncaixe = hip.raioDeEncaixeMm ?? 700;
  const contorno = hip.contornoDoPilarMm ?? CONTORNO_DO_PILAR_MM;
  // F14a: a água QUENTE anda pelas paredes deslocadas da faixa dela (os pilares e as vigas ficam onde estão).
  const faixa = disciplina === 'AGUA_QUENTE' && hip.faixaDaAguaQuente && (hip.faixaDaAguaQuente.x || hip.faixaDaAguaQuente.y) ? hip.faixaDaAguaQuente : null;
  const paredesNaFaixa = faixa ? model.walls.map((w) => ({ ...w, a: { x: w.a.x + faixa.x, y: w.a.y + faixa.y }, b: { x: w.b.x + faixa.x, y: w.b.y + faixa.y } })) : model.walls;
  const paredesDe = (levelId: ObjectId) => paredesNaFaixa.filter((w) => w.levelId === levelId);
  // F14b: as "paredes" por onde o ramal anda — as do forro (anéis dos cômodos + travessias), ou as de verdade.
  const doForro = new Map<ObjectId, ReturnType<typeof paredesDoForro>>();
  const paredesDoRamal = (levelId: ObjectId) => {
    if (!noForro) return paredesDe(levelId);
    if (!doForro.has(levelId)) doForro.set(levelId, paredesDoForro(model, levelId, noForro.afastamentoDaFaceMm));
    return doForro.get(levelId)!;
  };
  /** F14b: do nó no forro à peça (ou à origem) embutida na parede — os pedaços da descida. */
  const pedacosDaDescida = (levelId: ObjectId, q: Ponto2, cota: number, alvo: Ponto2, cotaDoAlvo: number) => {
    const w = encaixarNaParede(alvo, paredesDe(levelId), raioDeEncaixe)?.q ?? null;
    return descidaDoForro(model, levelId, { q, cotaDaFaixaMm: cota, alvo, cotaDoAlvoMm: cotaDoAlvo, naParede: w, raioMm: RAIO_NA_DESCIDA_MM, folgaSobAVigaMm: hip.noForro!.folgaSobAVigaMm + (noForro?.degrauNaParedeMm ?? 0), disciplina });
  };
  const descer = (levelId: ObjectId, q: Ponto2, cota: number, alvo: Ponto2, cotaDoAlvo: number) => {
    for (const s of pedacosDaDescida(levelId, q, cota, alvo, cotaDoAlvo)) addTrecho(levelId, s.a, s.cotaAMm, s.b, s.cotaBMm);
  };
  /** A descida atravessa pilar (na planta: o trecho horizontal pela pegada, ou o vertical dentro dela)? */
  const descidaPeloPilar = (levelId: ObjectId, ps: readonly { a: Ponto2; b: Ponto2 }[]) => {
    const aneis = pegadasDePilares(model, levelId).map((g) => anelDoPilar(g, RAIO_NA_DESCIDA_MM) as Point[]);
    return ps.some((x) => (x.a.x === x.b.x && x.a.y === x.b.y ? aneis.some((g) => pointInPolygon(g, x.a as Point)) : fracaoDentro(x.a, x.b, aneis) > 0));
  };
  // O ponto SOLTO no cômodo vai para a FACE da parede antes de traçar.
  const encostos: Command[] = [];
  const efetivo = new Map<ObjectId, Terminal>();
  for (const p of pontos) {
    if (!pelasParedes || estaLigado(p)) continue;
    const f = faceDaParede(p.at, paredesDe(p.levelId), raioDeEncaixe);
    if (!f) continue;
    let alvo = f.face;
    // E o ponto SUGERIDO que cai DENTRO do pilar do encontro (a louça no canto: o chuveiro na quina — F12d, sobrado a
    // 30°, o toco raspava 1 cm do pilar) escorrega pela parede até fora dele, na mesma face. O ponto que a pessoa pôs
    // não se move: a verificação acusa o pilar (E5.5).
    // Com o anel do contorno (o mesmo da rota pelas paredes): o ponto colado na QUINA do pilar girado conta como dentro.
    const pegadas = pegadasDePilares(model, p.levelId).map((g) => anelDoPilar(g, contorno) as Point[]);
    const e = p.sugerida && pegadas.some((g) => pointInPolygon(g, alvo as Point)) ? encaixarNaParede(p.at, paredesDe(p.levelId), raioDeEncaixe) : null;
    if (e) {
      const q2 = foraDoPilar(e.q, e.parede, pegadas);
      const d = Math.hypot(alvo.x - e.q.x, alvo.y - e.q.y);
      if (d > 0) alvo = { x: Math.round(q2.x + ((alvo.x - e.q.x) / d) * d), y: Math.round(q2.y + ((alvo.y - e.q.y) / d) * d) };
    }
    if (alvo.x === p.at.x && alvo.y === p.at.y) continue;
    encostos.push({ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [p.id], delta: { x: alvo.x - p.at.x, y: alvo.y - p.at.y }, manterJuncoes: false });
    efetivo.set(p.id, { ...p, at: alvo });
  }
  if (encostos.length > 0) avisos.push(`${encostos.length} ponto(s) solto(s) no cômodo encostado(s) na face da parede — a água chega por dentro dela`);
  const naPosicao = (p: Terminal) => efetivo.get(p.id) ?? p;
  const pendentes = pontos.filter((p) => !estaLigado(p)).map(naPosicao);
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
  const pilaresDaPrumada = niveis.flatMap((l) => pegadasDePilares(model, l.id));
  // F8b: as vigas que a prumada cruza em ALTURA — no pavimento da origem, as que entram na faixa entre o
  // barrilete e o ramal; nos outros, todas (a coluna atravessa o pavimento inteiro ou chega ao ramal dele).
  const [zLo, zHi] = [Math.min(tetoO, cotaRamalDaOrigem), Math.max(tetoO, cotaRamalDaOrigem)];
  const vigasDaPrumada = (model.structures ?? []).filter((s) => s.kind === 'VIGA' && (s.levelId !== origem.levelId || (s.baseMm < zHi && s.baseMm + s.alturaMm > zLo)));
  // F14c: no forro, a coluna não fica sob a laje REBAIXADA (sob o banheiro de cima): ali o forro de baixo não tem
  // plenum e o ramal não chega à coluna — no sobrado, a da quente para o banheiro social nasceu dentro da área
  // rebaixada e o caminho até ela deu 35,7 m de volta; a 30°, o shaft cercado por ela deixava a água ir em reta.
  const alturaDe = new Map(model.levels.map((l) => [l.id, l.defaultHeightMm]));
  const rebaixos = noForro ? (model.structures ?? []).filter((s) => s.kind === 'LAJE' && s.baseMm < (alturaDe.get(s.levelId) ?? Infinity) - 1).map((s) => s.pontos as Point[]) : [];
  const sobRebaixo = (p: Ponto2) => rebaixos.some((g) => pointInPolygon(g, p as Point));
  // F14d: os vãos de todos os pavimentos, como retângulos em planta (a coluna atravessa os pavimentos inteiros).
  const paredePorId = new Map(model.walls.map((w) => [w.id, w]));
  const vaosDaPrumada: Point[][] = noForro
    ? model.openings.flatMap((o) => {
        const w = paredePorId.get(o.wallId);
        if (!w) return [];
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
        const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
        const p0 = { x: w.a.x + u.x * (o.offsetMm - RAIO_NA_DESCIDA_MM), y: w.a.y + u.y * (o.offsetMm - RAIO_NA_DESCIDA_MM) } as Point;
        const p1 = { x: w.a.x + u.x * (o.offsetMm + o.widthMm + RAIO_NA_DESCIDA_MM), y: w.a.y + u.y * (o.offsetMm + o.widthMm + RAIO_NA_DESCIDA_MM) } as Point;
        return [cantosDaParede(p0, p1, w.thicknessMm + 2 * RAIO_NA_DESCIDA_MM) as Point[]];
      })
    : [];
  // F16: as prumadas da OUTRA água já traçada (a fria vem antes da quente) — no sobrado, a quente que sobe do térreo
  // nascia no nó em que a fria desce do barrilete, e as duas colunas se cruzavam no mesmo ponto.
  const outraAgua = disciplina === 'AGUA_QUENTE' ? 'AGUA_FRIA' : disciplina === 'AGUA_FRIA' ? 'AGUA_QUENTE' : null;
  // E os HORIZONTAIS dela nos pavimentos que a coluna cruza: a coluna sobe atravessando a faixa da outra água no forro
  // (a quente que sobe do térreo cortava a fria que saía da coluna dela, na faixa de baixo).
  const niveisDaPrumada = new Set(niveis.map((l) => l.id));
  const prumadasDaOutraAgua: Point[][] = (model.trechos ?? [])
    .filter((t) => t.disciplina === outraAgua && niveisDaPrumada.has(t.levelId))
    .map((t) => {
      const h = Math.ceil(t.bitolaMm / 2 + RAIO_NA_DESCIDA_MM + (hip.afastamentoEntreColunasMm ?? AFASTAMENTO_ENTRE_COLUNAS_MM));
      if (t.a.x === t.b.x && t.a.y === t.b.y) return [{ x: t.a.x - h, y: t.a.y - h }, { x: t.a.x + h, y: t.a.y - h }, { x: t.a.x + h, y: t.a.y + h }, { x: t.a.x - h, y: t.a.y + h }] as Point[];
      const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
      const u = { x: (t.b.x - t.a.x) / L, y: (t.b.y - t.a.y) / L };
      const n = { x: -u.y * h, y: u.x * h };
      const a = { x: t.a.x - u.x * h, y: t.a.y - u.y * h };
      const b = { x: t.b.x + u.x * h, y: t.b.y + u.y * h };
      return [{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: a.x - n.x, y: a.y - n.y }] as Point[];
    });
  // NÚCLEO VERTICAL (E2.4): o grupo perto de um shaft sobe por ele.
  const posicaoDaColuna = (grupo: Terminal[]): Ponto2 => {
    const base = { x: grupo[0].at.x, y: grupo[0].at.y };
    // F20 da casa automática (17/10/2026): o shaft é para a coluna que ATRAVESSA pavimentos — o grupo no pavimento da
    // origem com o barrilete no forro não sobe por ele (a pia da cozinha ia para o shaft da área de serviço, a 1,7 m e
    // do outro lado da parede: o barrilete chegava lá e a descida saía da cozinha — ponta aberta, sobrado).
    const mesmoPavimentoNoForro = origemNoForro && grupo.every((p) => p.levelId === origem.levelId);
    const shaftAchado = mesmoPavimentoNoForro ? null : shaftPreferido(model, base, grupo[0].levelId, hip.raioDoShaftMm ?? 3000);
    // F21: nem o shaft do outro lado de um PILAR — a descida voltava do shaft ao ponto por dentro da parede, atravessando
    // o pilar (R1-A, 15 × 30 4 dorm., 10 × 30 4 dorm.).
    const shaft = shaftAchado && fracaoDentro(shaftAchado, base, pilaresDaPrumada) > 0 ? null : shaftAchado;
    // F27 item 5 da casa automática (19/10/2026): no shaft, a coluna com faixa vai à rotação dela MAIS LONGE das peças do
    // grupo — o canto virado para o banheiro é do tubo de queda (o ramal de esgoto entra por ali; com a quente nele, o
    // ramal a cortava). Das 4 rotações da faixa, como no `lugarNoShaft`.
    if (shaft && !sobRebaixo(shaft)) {
      if (!faixa) return shaft;
      const gx = grupo.reduce((s, p) => s + p.at.x, 0) / grupo.length;
      const gy = grupo.reduce((s, p) => s + p.at.y, 0) / grupo.length;
      const [fx, fy] = [faixa.x * FAIXA_NO_SHAFT, faixa.y * FAIXA_NO_SHAFT];
      const rotacoes = [{ x: fx, y: fy }, { x: -fy, y: fx }, { x: -fx, y: -fy }, { x: fy, y: -fx }].map((d) => ({ x: Math.round(shaft.x + d.x), y: Math.round(shaft.y + d.y) }));
      return rotacoes.map((p, k) => ({ p, k, d: Math.hypot(p.x - gx, p.y - gy) })).sort((a, b) => b.d - a.d || a.k - b.k)[0].p;
    }
    // PELAS PAREDES: a coluna desce no EIXO da parede mais próxima, não na face. A que ATRAVESSA pavimentos
    // (a caixa num, o ponto noutro) procura antes a parede que existe em todos eles — senão sobe pelo meio do
    // cômodo do outro pavimento (F12c, sobrado); sem uma a até 2× o raio, fica a de sempre.
    const idxs = [idxO, ...grupo.map((p) => indice.get(p.levelId) ?? idxO)];
    const atravessados = niveis.slice(Math.min(...idxs), Math.max(...idxs) + 1).map((l) => l.id).filter((id) => id !== grupo[0].levelId);
    const emComum = pelasParedes && atravessados.length ? paredesEmComum(paredesDe(grupo[0].levelId), atravessados.map(paredesDe)) : [];
    // F14a: até 3 m — com a fria e a quente lado a lado, a base anda e a parede comum ficava fora dos 1,4 m de antes
    // (sobrado a 30°: a coluna caía na parede só do térreo e atravessava a suíte de cima).
    const naParede = pelasParedes ? (encaixarNaParede(base, emComum, Math.max(raioDeEncaixe * 2, ALCANCE_DA_PAREDE_EM_COMUM_MM)) ?? encaixarNaParede(base, paredesDe(grupo[0].levelId), raioDeEncaixe)) : null;
    // E5.5: a coluna que cairia dentro de um pilar (de qualquer pavimento que ela cruza) escorrega pela parede — e,
    // no forro, para fora da laje rebaixada (F14c) e do VÃO de porta ou janela de qualquer pavimento (F14d: a coluna da
    // fria atravessava a janela alta do banheiro de cima).
    // O escorregão pela parede INTEIRA (o pedaço em comum com os outros pavimentos pode ser curto demais para sair do vão).
    const paredeInteira = naParede ? (paredesDe(grupo[0].levelId).find((w) => w.id === naParede.parede.id) ?? naParede.parede) : null;
    const obstaculos = [...pilaresDaPrumada, ...rebaixos, ...vaosDaPrumada, ...prumadasDaOutraAgua];
    let noEixo = naParede && paredeInteira ? foraDoPilar(naParede.q, paredeInteira, obstaculos, pilaresDaPrumada) : base;
    // F8b: e a que desceria DENTRO da viga que corre sobre a parede desce rente a ela, do lado do grupo.
    const cx = grupo.reduce((s, p) => s + p.at.x, 0) / grupo.length;
    const cy = grupo.reduce((s, p) => s + p.at.y, 0) / grupo.length;
    let pos = foraDaViga(noEixo, vigasDaPrumada, { x: cx, y: cy }, pilaresDaPrumada);
    // F16: rente à viga, a coluna pode cair na prumada da outra água (as duas passam pela mesma viga, do mesmo lado — a
    // quente que sobe do térreo nascia no nó da fria): o ponto do eixo que leva até lá vira obstáculo, e ela escorrega.
    const naOutraAgua = (q: Ponto2) => prumadasDaOutraAgua.some((g) => pointInPolygon(g, q as Point));
    for (let i = 0; i < 3 && naParede && paredeInteira && naOutraAgua(pos); i++) {
      const h = Math.ceil(RAIO_NA_DESCIDA_MM * 2 + (hip.afastamentoEntreColunasMm ?? AFASTAMENTO_ENTRE_COLUNAS_MM));
      obstaculos.push([{ x: noEixo.x - h, y: noEixo.y - h }, { x: noEixo.x + h, y: noEixo.y - h }, { x: noEixo.x + h, y: noEixo.y + h }, { x: noEixo.x - h, y: noEixo.y + h }] as Point[]);
      noEixo = foraDoPilar(noEixo, paredeInteira, obstaculos, pilaresDaPrumada);
      pos = foraDaViga(noEixo, vigasDaPrumada, { x: cx, y: cy }, pilaresDaPrumada);
    }
    // Sem lugar livre na parede (as duas escorregavam até a mesma ponta dela), a quente fica na FAIXA dela, ao lado da
    // fria — como no shaft (F14a).
    if (naOutraAgua(pos) && faixa) pos = { x: Math.round(pos.x + faixa.x * FAIXA_NO_SHAFT), y: Math.round(pos.y + faixa.y * FAIXA_NO_SHAFT) };
    return pos;
  };
  // F14b: com o barrilete NO FORRO (a origem no mesmo pavimento, abaixo do teto), a "coluna" do grupo do mesmo
  // pavimento não tem altura — a cabeça já está na cota do ramal. Ela fica no anel do forro: na posição de coluna
  // (rente à viga) virava um nó solto, ligado só por um toco (ponta aberta na verificação).
  /** As cabeças sem altura (pela posição) e onde o barrilete as alcançou no anel. */
  const cabecaSemAltura = new Set<string>();
  const cabecaNoAnel = new Map<string, Ponto2>();
  const posicaoFinal = (grupo: Terminal[]): Ponto2 => {
    const pos = posicaoDaColuna(grupo);
    if (!origemNoForro || !grupo.every((p) => p.levelId === origem.levelId)) return pos;
    // F20 da casa automática (17/10/2026): o anel do LADO do grupo — a coluna no eixo da parede fica a meia distância dos
    // anéis dos dois cômodos, e o empate (pela ordem das paredes) levava a cabeça da pia da cozinha para o anel da área de
    // serviço: o barrilete ia até lá e a descida saía do lado da cozinha (ponta aberta, sobrado).
    const cx = grupo.reduce((s, p) => s + p.at.x, 0) / grupo.length;
    const cy = grupo.reduce((s, p) => s + p.at.y, 0) / grupo.length;
    const doAnel = paredesDoRamal(origem.levelId).filter(encaixaNoAnel);
    const perto = encaixarNaParede(pos, doAnel, raioDeEncaixe);
    const empatados = perto ? doAnel.map((w) => encaixarNaParede(pos, [w], raioDeEncaixe)).filter((e): e is NonNullable<typeof e> => !!e && e.d <= perto.d + 1) : [];
    const doLado = empatados.sort((a, b) => Math.hypot(a.q.x - cx, a.q.y - cy) - Math.hypot(b.q.x - cx, b.q.y - cy))[0] ?? perto;
    const q = doLado?.q ?? pos;
    cabecaSemAltura.add(chaveP(q));
    return cabecaNoAnel.get(chaveP(q)) ?? q;
  };
  const cabecas = new Map<No, Ponto2>();
  for (const grupo of colunas) {
    const pos = posicaoFinal(grupo);
    const k = chave(origem.levelId, pos.x, pos.y, tetoO);
    if (!alcancadosNoBarrilete.has(k)) cabecas.set(k, pos);
  }
  // PELAS PAREDES: o barrilete corre no teto por cima das paredes até as cabeças.
  const paredesDaOrigem = origemNoForro ? paredesDoRamal(origem.levelId) : paredesDe(origem.levelId);
  // F14b: o barrilete no forro (o da quente, que nasce no aquecedor) também desvia das prumadas das outras redes.
  const obstaculosDoBarrilete = origemNoForro ? [...pegadasDePilares(model, origem.levelId), ...prumadasQueCruzam(model, origem.levelId, tetoO, disciplina, RAIO_NA_DESCIDA_MM)] : pegadasDePilares(model, origem.levelId);
  const arvoreDoBarrilete = (raio: number) =>
    arvorePelasParedes({ paredes: paredesDaOrigem, raiz: origem.at, pendentes: [...cabecas.values()], raioDeEncaixeMm: raio, obstaculos: obstaculosDoBarrilete, contornoDoPilarMm: contorno, encaixarEm: encaixaNoAnel, ...(origemNoForro ? { penalidadeDoAnelMm: PENALIDADE_DO_CONTORNO_NO_FORRO_MM } : {}) });
  let barrilete = pelasParedes && paredesDaOrigem.length > 0 && cabecas.size > 0 ? arvoreDoBarrilete(raioDeEncaixe) : null;
  // F18 da casa automática: no forro, a origem (o aquecedor) sem anel ao alcance — sem raiz, o barrilete inteiro da
  // quente ia em RETA pelo forro e atravessava pilar (R1-A). De novo, com alcance de `ALCANCE_DA_RAIZ_NO_FORRO_MM`: a
  // descida da origem até a raiz é a de sempre.
  if (origemNoForro && barrilete && !barrilete.raiz) barrilete = arvoreDoBarrilete(Math.max(raioDeEncaixe, ALCANCE_DA_RAIZ_NO_FORRO_MM));
  if (origemNoForro && barrilete?.raiz) {
    // F14b: a origem sobe pela descida até o anel; o nó dela "no teto" (que não existe) sai dos alcançados.
    descer(origem.levelId, barrilete.raiz, tetoO, origem.at, origem.cotaMm);
    alcancadosNoBarrilete.delete(noDaOrigemNoTeto);
    const k = chave(origem.levelId, barrilete.raiz.x, barrilete.raiz.y, tetoO);
    alcancadosNoBarrilete.set(k, barrilete.raiz);
    rota.set(k, 0);
  } else if (origemNoForro && origem.cotaMm !== tetoO) {
    addTrecho(origem.levelId, origem.at, origem.cotaMm, origem.at, tetoO);
  }
  if (barrilete?.raiz) {
    if (!origemNoForro && chaveP(barrilete.raiz) !== chaveP(origem.at)) addTrecho(origem.levelId, origem.at, tetoO, barrilete.raiz, tetoO);
    for (const a of barrilete.arestas) addTrecho(origem.levelId, a.de, tetoO, a.para, tetoO);
    for (const [k, pos] of [...cabecas.entries()]) {
      const q = barrilete.encaixe.get(chaveP(pos));
      if (!q) continue;
      // F14b: a cabeça SEM altura (barrilete no forro, grupo do mesmo pavimento) é o próprio ponto onde o barrilete
      // chega — sem toco até a posição de coluna (o nó escorregado para fora de um obstáculo deixava o toco solto).
      if (cabecaSemAltura.has(chaveP(pos))) {
        cabecaNoAnel.set(chaveP(pos), q);
        const kq = chave(origem.levelId, q.x, q.y, tetoO);
        alcancadosNoBarrilete.set(kq, q);
        rota.set(kq, 0);
        cabecas.delete(k);
        continue;
      }
      // A cabeça já está no eixo (a coluna foi posta nele); se não, um toco no teto. Item 8 da casa automática
      // (19/10/2026): no forro, o toco desvia das prumadas das outras redes e dos pilares — o da quente passava a 7 cm da
      // coluna da fria que desce do 1º (sobrado 12 × 30, com o aquecedor na outra parede).
      if (chaveP(q) !== chaveP(pos)) {
        const desvio = origemNoForro ? (desvioDoPilar(q, pos, [...pegadasDePilares(model, origem.levelId).map((g) => anelDoPilar(g, RAIO_NA_DESCIDA_MM) as Point[]), ...prumadasQueCruzam(model, origem.levelId, tetoO, disciplina, RAIO_NA_DESCIDA_MM, 2, false)]) ?? []) : [];
        const pts = [q, ...desvio.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), pos];
        for (let i = 1; i < pts.length; i++) addTrecho(origem.levelId, pts[i - 1], tetoO, pts[i], tetoO);
      }
      alcancadosNoBarrilete.set(k, pos);
      rota.set(k, 0);
      cabecas.delete(k);
    }
  }
  arvoreComRotaLimitada({
    alcancados: alcancadosNoBarrilete,
    rota,
    pendentes: cabecas,
    retaAteRaiz: (p) => Math.hypot(p.x - origem.at.x, p.y - origem.at.y),
    limite: hip.rotaMaximaVezes,
    // S2 da casa automática (20/10/2026): no forro, a reta da cabeça de coluna à árvore do barrilete desvia dos pilares e
    // das prumadas das outras redes (sem os shafts: a cabeça nasce dentro dele) — a quente ia em diagonal de 5 m pelo
    // pilar junto do shaft (sobrado 10 × 30). Os pontos elétricos, postos depois, fogem do tubo (S1).
    ligar: (de, para) => {
      const desvio = origemNoForro ? (desvioDoPilar(de.pos, para.pos, pilaresEPrumadas(origem.levelId, tetoO)) ?? []) : [];
      const pts = [de.pos, ...desvio.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), para.pos];
      for (let i = 1; i < pts.length; i++) addTrecho(origem.levelId, pts[i - 1], tetoO, pts[i], tetoO);
    },
  });

  // ── Cada coluna desce (ou sobe) até o ramal de cada pavimento com pontos ─
  for (const grupo of colunas) {
    const pos = posicaoFinal(grupo);
    const niveisDoGrupo = niveis.filter((l) => grupo.some((p) => p.levelId === l.id));
    for (const nivel of niveisDoGrupo) {
      const idx = indice.get(nivel.id) ?? 0;
      if (idx === idxO) {
        // Mesmo pavimento da origem: da cabeça (teto) ao ramal.
        addTrecho(nivel.id, pos, tetoO, pos, cotaDoRamal(nivel));
      } else if (idx < idxO) {
        // Abaixo: atravessa os pavimentos intermediários do teto ao piso (a laje é o encontro)...
        for (let k = idxO; k > idx; k--) {
          const m = niveis[k];
          addTrecho(m.id, pos, k === idxO ? tetoO : m.defaultHeightMm, pos, 0);
        }
        // ...e neste, do teto ao ramal.
        addTrecho(nivel.id, pos, nivel.defaultHeightMm, pos, cotaDoRamal(nivel));
      } else {
        // Acima da origem (caixa no térreo, ponto no andar): sobe piso→teto nos
        // pavimentos intermediários e piso→ramal neste. No da origem, do barrilete ao teto — o barrilete abaixo
        // da viga não está no teto (F12c, 15/10/2026: o aquecedor do térreo do sobrado deixava a coluna da água
        // quente com um buraco de 2,25 a 2,80 m, e as duas pontas abertas).
        if (tetoO !== nivelDaOrigem.defaultHeightMm) addTrecho(origem.levelId, pos, tetoO, pos, nivelDaOrigem.defaultHeightMm);
        for (let k = idxO + 1; k < idx; k++) {
          const m = niveis[k];
          addTrecho(m.id, pos, 0, pos, m.defaultHeightMm);
        }
        addTrecho(nivel.id, pos, 0, pos, cotaDoRamal(nivel));
      }

      // ── Ramais no pavimento: árvore com rota limitada a partir da coluna ──
      const teto = nivel.defaultHeightMm;
      const cotaRamal = noForro ? cotaDoRamal(nivel) : Math.min(hip.cotaRamalMm, teto);
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
      const doNivel = grupo.filter((p) => p.levelId === nivel.id);
      const paredesDoNivel = paredesDoRamal(nivel.id);
      // F14b: no forro, as prumadas das outras redes que cruzam a faixa (a coluna da fria, para a quente) são obstáculo.
      const obstaculosDoRamal = noForro ? [...pegadasDePilares(model, nivel.id), ...prumadasQueCruzam(model, nivel.id, cotaRamal, disciplina, RAIO_NA_DESCIDA_MM)] : pegadasDePilares(model, nivel.id);
      const pelas = pelasParedes && paredesDoNivel.length > 0
        ? arvorePelasParedes({ paredes: paredesDoNivel, raiz: pos, pendentes: doNivel.map((p) => p.at), raioDeEncaixeMm: raioDeEncaixe, obstaculos: obstaculosDoRamal, contornoDoPilarMm: contorno, encaixarEm: encaixaNoAnel, ...(noForro ? { penalidadeDoAnelMm: PENALIDADE_DO_CONTORNO_NO_FORRO_MM } : {}) })
        : null;
      // F14c: a raiz no anel só vale se alguma peça encaixou nele — sem nenhuma (todas sob a laje rebaixada, ligadas
      // em reta), a ligação da coluna ao anel ficava pendurada: ponta aberta (sobrado a 30°, o aquecedor da cozinha).
      if (pelas?.raiz && pelas.encaixe.size > 0) {
        // Da coluna ao eixo (se ela não está nele), e o ramal pelo eixo das paredes.
        if (chaveP(pelas.raiz) !== chaveP(pos)) {
          // F14b: no forro, a ligação da coluna ao anel desvia da prumada das outras redes (a coluna da fria corre ao
          // lado da da quente, a 4,5 cm — o quadrado é o justo: os dois raios e 2 mm).
          const desvio = noForro ? (desvioDoPilar(pos, pelas.raiz, prumadasQueCruzam(model, nivel.id, cotaRamal, disciplina, RAIO_NA_DESCIDA_MM, 2, false)) ?? []) : [];
          const pts = [pos, ...desvio, pelas.raiz];
          for (let i = 1; i < pts.length; i++) addTrecho(nivel.id, pts[i - 1], cotaRamal, pts[i], cotaRamal);
        }
        alcancados.set(chave(nivel.id, pelas.raiz.x, pelas.raiz.y, cotaRamal), pelas.raiz);
        rotaRamal.set(chave(nivel.id, pelas.raiz.x, pelas.raiz.y, cotaRamal), 0);
        for (const a of pelas.arestas) {
          addTrecho(nivel.id, a.de, cotaRamal, a.para, cotaRamal);
          for (const v of [a.de, a.para]) {
            const k = chave(nivel.id, v.x, v.y, cotaRamal);
            alcancados.set(k, v);
            if (!rotaRamal.has(k)) rotaRamal.set(k, Math.hypot(v.x - pos.x, v.y - pos.y));
          }
        }
      }
      let foraDaParede = 0;
      for (const p of doNivel) {
        const q = pelas?.raiz ? pelas.encaixe.get(chaveP(p.at)) : undefined;
        if (q && noForro) {
          // F14b: do anel no forro, junto da viga, entra na parede abaixo dela e desce na alvenaria até a peça.
          // Pendência antiga da casa automática (21/10/2026): a descida do nó mais perto que atravessaria PILAR (a máquina
          // de lavar entre o pilar da viga de transição e a laje rebaixada, sobrado 10 × 30: o anel não passa nem por uma
          // nem pela outra) desce de outro nó da árvore, o mais perto cuja descida não atravessa — a fria vem pelo lado de lá.
          let pedacos = pedacosDaDescida(nivel.id, q, cotaRamal, p.at, p.cotaMm);
          if (descidaPeloPilar(nivel.id, pedacos) && pelas) {
            const nos = [...new Map(pelas.arestas.flatMap((x) => [x.de, x.para]).map((v) => [chaveP(v), v])).values()]
              .filter((v) => chaveP(v) !== chaveP(q) && Math.hypot(v.x - p.at.x, v.y - p.at.y) <= OUTRO_NO_DA_DESCIDA_ATE_MM)
              .sort((u, v) => Math.hypot(u.x - p.at.x, u.y - p.at.y) - Math.hypot(v.x - p.at.x, v.y - p.at.y));
            for (const v of nos) {
              const outros = pedacosDaDescida(nivel.id, v, cotaRamal, p.at, p.cotaMm);
              if (!descidaPeloPilar(nivel.id, outros)) {
                pedacos = outros;
                break;
              }
            }
          }
          for (const x of pedacos) addTrecho(nivel.id, x.a, x.cotaAMm, x.b, x.cotaBMm);
          continue;
        }
        if (q) {
          // Desce DENTRO da parede, no eixo, até a cota do ponto; e sai para a face.
          if (p.cotaMm !== cotaRamal) addTrecho(nivel.id, q, cotaRamal, q, p.cotaMm);
          if (chaveP(q) !== chaveP(p.at)) {
            // O toco do eixo à face pode raspar o pilar do encontro (lote girado: 1 cm no sobrado a 30°, F12d) —
            // contorna pelos cantos dele, como o esgoto e o eletroduto; sem caminho livre, fica a reta.
            const desvio = desvioDoPilar(q, p.at, pegadasDePilares(model, nivel.id)) ?? [];
            const pts = [q, ...desvio, p.at];
            for (let i = 1; i < pts.length; i++) addTrecho(nivel.id, pts[i - 1], p.cotaMm, pts[i], p.cotaMm);
          }
          continue;
        }
        if (pelas) foraDaParede++;
        // S1 da casa automática (20/10/2026): o ponto SOB a laje rebaixada (a peça do térreo sob o banheiro de cima) chega
        // pela parede, de fora do rebaixo — como o eletroduto no item 6; reto pela faixa, a fria corria dentro da laje.
        // (Só o ponto dentro de algum rebaixo — o anel com o raio contém a pegada — vale a busca pela parede.)
        const saida = noForro && rebaixosDe(nivel.id).some((r) => pointInPolygon(r.anel, p.at as Point)) ? saidaDoRebaixoPelaParede(model, nivel.id, p.at, p.cotaMm, RAIO_NA_DESCIDA_MM, hip.noForro!.folgaSobAVigaMm) : null;
        if (saida) {
          addTrecho(nivel.id, saida.s, cotaRamal, saida.s, saida.cotaMm);
          addTrecho(nivel.id, saida.s, saida.cotaMm, p.at, saida.cotaMm);
          addTrecho(nivel.id, p.at, saida.cotaMm, p.at, p.cotaMm);
          const ks = chave(nivel.id, saida.s.x, saida.s.y, cotaRamal);
          if (!alcancados.has(ks)) pendentesDoNivel.set(ks, { x: saida.s.x, y: saida.s.y });
          continue;
        }
        // Do ramal à cota do ponto, na posição dele.
        if (p.cotaMm !== cotaRamal) addTrecho(nivel.id, p.at, cotaRamal, p.at, p.cotaMm);
        const k = chave(nivel.id, p.at.x, p.at.y, cotaRamal);
        if (!alcancados.has(k)) pendentesDoNivel.set(k, { x: p.at.x, y: p.at.y });
      }
      if (foraDaParede > 0) avisos.push(`${nivel.name}: ${foraDaParede} ponto(s) a mais de ${raioDeEncaixe} mm de qualquer parede — ligado(s) em linha reta`);
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
  for (const p of pontos.map(naPosicao)) {
    const peso = pesoDoPonto(model, p, disciplina);
    somaDePesos += peso;
    const caminho = caminhoEntre(chave(p.levelId, p.at.x, p.at.y, p.cotaMm), noDaOrigem, arestas);
    if (!caminho) continue;
    for (const i of caminho) {
      pesoPorAresta.set(i, (pesoPorAresta.get(i) ?? 0) + peso);
      pontosPorAresta.set(i, [...(pontosPorAresta.get(i) ?? []), p]);
    }
  }
  // S4 da casa automática (20/10/2026): os TOCOS — trecho novo que não leva água a ponto nenhum (fora de todo caminho
  // da origem às peças) com uma ponta solta (nem peça nem origem) — saem, um atrás do outro. A cabeça de coluna no
  // mesmo pavimento do barrilete, com a raiz do ramal já no barrilete, deixava uma ida e volta pelo mesmo segmento com a
  // ponta solta (ponta aberta, R1-A de 3 pavimentos).
  const naPonta = new Set<No>([noDaOrigem, ...pontos.map(naPosicao).map((p) => chave(p.levelId, p.at.x, p.at.y, p.cotaMm))]);
  const tocos = new Set<number>();
  for (let mudou = true; mudou; ) {
    mudou = false;
    const g = new Map<No, number>();
    arestas.forEach((ar, i) => {
      if (tocos.has(i)) return;
      g.set(ar.de, (g.get(ar.de) ?? 0) + 1);
      g.set(ar.para, (g.get(ar.para) ?? 0) + 1);
    });
    const solta = (k: No) => (g.get(k) ?? 0) === 1 && !naPonta.has(k);
    arestas.forEach((ar, i) => {
      if (tocos.has(i) || !('novo' in ar.ref) || pesoPorAresta.has(i) || !(solta(ar.de) || solta(ar.para))) return;
      tocos.add(i);
      mmNovos -= ar.mm;
      mudou = true;
    });
  }
  const novosTocos = new Set([...tocos].map((i) => arestas[i].ref).filter((r): r is { novo: number } => 'novo' in r).map((r) => r.novo));
  let dnMaximoMm = 0;
  const atualizacoes: Command[] = [];
  arestas.forEach((ar, i) => {
    if (tocos.has(i)) return;
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
  for (const [i, ar] of arestas.entries()) {
    if (tocos.has(i)) continue;
    grau.set(ar.de, (grau.get(ar.de) ?? 0) + 1);
    grau.set(ar.para, (grau.get(ar.para) ?? 0) + 1);
  }
  const emendados: Extract<Command, { type: 'AddTrecho' }>[] = [];
  const consumidos = new Set<number>();
  novos.forEach((c, i) => {
    if (consumidos.has(i) || novosTocos.has(i)) return;
    let atual = c;
    const vertical = (x: typeof c) => x.a.x === x.b.x && x.a.y === x.b.y;
    if (vertical(atual)) {
      let mudou = true;
      while (mudou) {
        mudou = false;
        for (let j = 0; j < novos.length; j++) {
          if (j === i || consumidos.has(j) || novosTocos.has(j)) continue;
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
  if (emendados.length === 0 && atualizacoes.length === 0 && encostos.length === 0) {
    return vazio('todos os pontos já estão ligados', pavimentos, avisos);
  }
  return {
    disciplina, origemId: origem.id, origemNome, pavimentos,
    pontos: pontos.length, ligados: pontos.length - pendentes.length, aLigar,
    colunas: colunas.length, sugeridos: rede.filter((t) => t.sugerido).length, trechosDaRede: rede.length,
    comandos: [...encostos, ...emendados, ...atualizacoes], metrosPrevistos: Math.round(mmNovos / 100) / 10,
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
  if (!hip.noForro) return origensDeAgua(model).map(({ origem }) => planejarAgua(model, origem, hip));
  // F14b: no forro, uma origem depois da outra (a fria antes da quente) — a de depois vê as colunas da de antes e
  // desvia delas. Os comandos são os mesmos que aplicados juntos: cada plano só acrescenta.
  // F14c: a fria SEMPRE antes — na ordem do modelo, o aquecedor do sobrado vinha antes da caixa, a quente traçava
  // primeiro e passava rente ao ponto onde a fria desce (fixo: a fria não tinha para onde escorregar).
  const planos: PlanoDeAgua[] = [];
  let m = model;
  const ordem = [...origensDeAgua(model)].sort((a, b) => Number(a.disciplina === 'AGUA_QUENTE') - Number(b.disciplina === 'AGUA_QUENTE'));
  for (const { origem } of ordem) {
    const p = planejarAgua(m, origem, hip);
    planos.push(p);
    if (p.comandos.length) m = applyBatch(m, p.comandos).model;
  }
  return planos;
}
