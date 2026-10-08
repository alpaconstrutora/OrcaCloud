import {
  eixoEhVertical,
  letraDoEixo,
  wallLength,
  type BlueprintModel,
  type Command,
  type ObjectId,
  type Point,
} from './blueprintKernel';
import { anelDoLoteFechado } from './blueprintCotas';
import { faixasRestritas, medirTerreno } from './blueprintTerreno';

/**
 * EIXOS AUTOMÁTICOS (07/10/2026).
 *
 * Pedido, com a planta de referência (eixos A–D e 1–7 nas bordas): *"veja que também tem eixos identificados com
 * números e letras. opção de exibir ou não eixos"*. Respostas: um botão "Gerar eixos" que cria eixos DE VERDADE
 * (editáveis, e que valem para os Pilares automáticos); letras nos VERTICAIS (A, B… da esquerda para a direita) e
 * números nos HORIZONTAIS (1, 2… de cima para baixo).
 *
 * O mesmo molde dos Pilares automáticos: o sistema PROPÕE (prévia tracejada na gaveta e no desenho), quem projeta
 * confirma, e gravar é UM lote de `AddEixo` — um Ctrl+Z desfaz tudo.
 *
 * ─── DE ONDE SAEM AS LINHAS ─────────────────────────────────────────────────
 *
 *  - Do EIXO de cada parede ortogonal do pavimento com pelo menos `comprimentoMinimoDaParedeMm` (a mureta e o
 *    trecho curto não definem malha).
 *  - Dos lados ortogonais dos BLOCOS de massa do pavimento (o estudo de massa ainda não tem parede).
 *  - Linhas a menos de `juntarAMenosDeMm` viram UMA (fica a posição da mais comprida — a que mais representa).
 *  - Cada eixo atravessa o desenho inteiro (edificação ∪ lote) e passa `alemDoDesenhoMm` de cada lado. A BOLHA fica
 *    por fora das cotas em qualquer zoom: quem desenha a empurra para além da faixa das cotas (`bolhasDoEixo`).
 *  - Linha que já tem eixo (mesma direção, a menos de `juntarAMenosDeMm`) não ganha outro. Com `renumerar` (09/10/2026,
 *    *"recuos ficou sem eixos"* — gerar de novo dava "3" e "4" ENTRE o 1 e o 2), a sequência inteira é renomeada
 *    na ordem: os eixos existentes de nome automático (A, B1, 7…) ganham o nome da sua posição (`SetEixoProps`, no
 *    mesmo lote). Nome dado à mão ("P-1", "Eixo X") e linha de referência sem nome ficam como estão, e o nome à mão
 *    não é reusado. Sem `renumerar`, os nomes novos continuam depois dos usados.
 *  - Parede oblíqua fica de fora — e a proposta diz quantas.
 *  - SEM parede nem bloco no pavimento (o estudo que só tem o lote), os lados ortogonais do LOTE fechado (08/10/2026,
 *    *"quero"* à pergunta "gerar eixos também a partir dos lados do lote quando ainda não há paredes nem bloco?").
 *    Hipótese ligável na gaveta; com edificação desenhada, o lote não entra — a malha é da estrutura, não da divisa.
 *    E não só os lados (08/10/2026, *"todos os detalhes devem ser considerados, seja recuo ou outra informação
 *    semelhante"*): as linhas do ENVELOPE recuado (cada peça), das FAIXAS DE RESTRIÇÃO e das DIVISAS internas.
 *
 * As três distâncias são HIPÓTESES na gaveta (memória: folga de projeto nunca fica escondida no código).
 */

export interface HipotesesDeEixos {
  /** Quanto o eixo passa além do desenho (edificação ∪ lote), de cada lado, mm. */
  alemDoDesenhoMm: number;
  /** Parede mais curta que isto não gera eixo, mm. */
  comprimentoMinimoDaParedeMm: number;
  /** Linhas paralelas mais próximas que isto viram um eixo só, mm. */
  juntarAMenosDeMm: number;
  /** Sem parede nem bloco no pavimento, os eixos saem dos lados do lote fechado. */
  usarLadosDoLote: boolean;
  /** Renomeia os eixos existentes (de nome automático) para a sequência ficar em ordem com os novos. */
  renumerar: boolean;
}

export const HIPOTESES_EIXOS_PADRAO: HipotesesDeEixos = {
  alemDoDesenhoMm: 3000,
  comprimentoMinimoDaParedeMm: 1500,
  juntarAMenosDeMm: 100,
  usarLadosDoLote: true,
  renumerar: true,
};

/** As hipóteses que são distância (mm). */
export type DistanciaDosEixos = Exclude<keyof HipotesesDeEixos, 'usarLadosDoLote' | 'renumerar'>;

/** Faixas aceitas de cada hipótese (o que vem do navegador é validado aqui). */
export const FAIXAS_DAS_HIPOTESES_DE_EIXOS: Record<DistanciaDosEixos, { min: number; max: number }> = {
  alemDoDesenhoMm: { min: 0, max: 20000 },
  comprimentoMinimoDaParedeMm: { min: 0, max: 20000 },
  juntarAMenosDeMm: { min: 0, max: 2000 },
};

export function normalizarHipotesesDeEixos(h: Partial<Record<keyof HipotesesDeEixos, unknown>> | null | undefined): HipotesesDeEixos {
  const saida = { ...HIPOTESES_EIXOS_PADRAO };
  const lote = h?.usarLadosDoLote;
  if (typeof lote === 'boolean') saida.usarLadosDoLote = lote;
  const renumerar = h?.renumerar;
  if (typeof renumerar === 'boolean') saida.renumerar = renumerar;
  for (const k of Object.keys(FAIXAS_DAS_HIPOTESES_DE_EIXOS) as DistanciaDosEixos[]) {
    const n = Number(h?.[k]);
    const { min, max } = FAIXAS_DAS_HIPOTESES_DE_EIXOS[k];
    if (h?.[k] !== undefined && h?.[k] !== null && h?.[k] !== '' && Number.isFinite(n)) saida[k] = Math.round(Math.min(max, Math.max(min, n)));
  }
  return saida;
}

export interface EixoProposto {
  nome: string;
  vertical: boolean;
  /** X do eixo vertical / Y do horizontal, mm. */
  coordenadaMm: number;
  a: Point;
  b: Point;
  /** De onde a linha veio. */
  origem: 'PAREDE' | 'BLOCO' | 'PAREDE_E_BLOCO' | OrigemDoLote | 'EXISTENTE';
  /** Eixo que JÁ existe (entra na sequência para a ordem dos nomes); ausente = eixo novo. */
  existenteId?: ObjectId;
  /** O nome que o eixo existente tinha, quando a renumeração o muda. */
  nomeAnterior?: string;
}

export interface PropostaDeEixos {
  /**
   * A SEQUÊNCIA inteira, em ordem: verticais (A, B… da esquerda para a direita) e depois horizontais (1, 2… de cima
   * para baixo) — os novos e, com `renumerar`, os existentes de nome automático.
   */
  eixos: EixoProposto[];
  /** Quantos eixos novos; quantos existentes mudam de nome. */
  novos: number;
  renomeados: number;
  comandos: Command[];
  /** Paredes oblíquas do pavimento, fora da malha. */
  paredesObliquas: number;
  /** Paredes ortogonais ignoradas por serem mais curtas que o mínimo. */
  paredesCurtas: number;
  /** Linhas puladas por já terem eixo. */
  jaTinhamEixo: number;
  /** Por que não há nada a criar (null quando há). Vai no `title` do botão desligado. */
  motivoVazio: string | null;
}

/** Abaixo disto (mm) a parede/lado é tido como ortogonal. */
const TOLERANCIA_ORTOGONAL_MM = 1;

interface Linha {
  vertical: boolean;
  c: number;
  comprimento: number;
  origem: 'PAREDE' | 'BLOCO' | OrigemDoLote;
}

/** De que detalhe do lote a linha veio (sem edificação). */
export type OrigemDoLote = 'LOTE' | 'RECUO' | 'RESTRICAO' | 'DIVISA';
/** Linhas juntadas de origens diferentes ficam com a primeira desta lista. */
const PRIORIDADE_DA_ORIGEM: readonly Linha['origem'][] = ['PAREDE', 'BLOCO', 'LOTE', 'RECUO', 'RESTRICAO', 'DIVISA'];

export function propostaDeEixos(
  model: BlueprintModel,
  levelId: ObjectId,
  hipEntrada: Partial<HipotesesDeEixos> = {},
  /** O ENVELOPE recuado do pavimento (as peças) — vem de fora porque os recuos são da zona, não do modelo. */
  extras: { envelope?: readonly Point[][] } = {},
): PropostaDeEixos {
  const hip = normalizarHipotesesDeEixos(hipEntrada);
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const blocos = (model.blocos ?? []).filter((b) => b.levelId === levelId && b.pontos.length >= 3);
  const linhas: Linha[] = [];
  let paredesObliquas = 0;
  let paredesCurtas = 0;

  const comoLinha = (a: Point, b: Point, origem: Linha['origem']): Linha | null => {
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx <= TOLERANCIA_ORTOGONAL_MM && dy > TOLERANCIA_ORTOGONAL_MM) return { vertical: true, c: (a.x + b.x) / 2, comprimento: dy, origem };
    if (dy <= TOLERANCIA_ORTOGONAL_MM && dx > TOLERANCIA_ORTOGONAL_MM) return { vertical: false, c: (a.y + b.y) / 2, comprimento: dx, origem };
    return null;
  };

  for (const w of paredes) {
    const l = comoLinha(w.a, w.b, 'PAREDE');
    if (!l) {
      paredesObliquas++;
      continue;
    }
    if (wallLength(w) < hip.comprimentoMinimoDaParedeMm) {
      paredesCurtas++;
      continue;
    }
    linhas.push(l);
  }
  for (const b of blocos) {
    for (let i = 0; i < b.pontos.length; i++) {
      const p = b.pontos[i];
      const q = b.pontos[(i + 1) % b.pontos.length];
      const l = comoLinha(p, q, 'BLOCO');
      if (l && l.comprimento >= hip.comprimentoMinimoDaParedeMm) linhas.push(l);
    }
  }

  const vazio = (motivo: string): PropostaDeEixos => ({ eixos: [], novos: 0, renomeados: 0, comandos: [], paredesObliquas, paredesCurtas, jaTinhamEixo: 0, motivoVazio: motivo });
  // SÓ O LOTE (08/10/2026): sem edificação, os lados ortogonais do lote fechado — se a hipótese deixar.
  const semEdificacao = paredes.length === 0 && blocos.length === 0;
  const limitesDoNivel = model.boundaries.filter((b) => b.levelId === levelId);
  const anelDoLote = semEdificacao && hip.usarLadosDoLote ? anelDoLoteFechado(limitesDoNivel) : null;
  if (anelDoLote) {
    const segmento = (a: Point, b: Point, origem: OrigemDoLote) => {
      const l = comoLinha(a, b, origem);
      if (l && l.comprimento >= hip.comprimentoMinimoDaParedeMm) linhas.push(l);
    };
    const anel = (pts: readonly Point[], origem: OrigemDoLote) => {
      if (pts.length < 3) return;
      for (let i = 0; i < pts.length; i++) segmento(pts[i], pts[(i + 1) % pts.length], origem);
    };
    anel(anelDoLote, 'LOTE');
    for (const peca of extras.envelope ?? []) anel(peca, 'RECUO');
    for (const f of faixasRestritas(medirTerreno(limitesDoNivel.filter((b) => b.kind === 'TERRENO')), limitesDoNivel)) anel(f.anel, 'RESTRICAO');
    for (const b of limitesDoNivel.filter((x) => x.kind === 'DIVISA')) segmento(b.a, b.b, 'DIVISA');
  }
  if (semEdificacao && !anelDoLote) {
    return vazio(
      hip.usarLadosDoLote
        ? 'Desenhe paredes, blocos ou um lote fechado neste pavimento: os eixos saem da edificação (ou, sem ela, do lote — lados, recuos e restrições).'
        : 'Desenhe paredes ou blocos neste pavimento — ou ligue "Usar o lote" para os eixos saírem dos lados, recuos e restrições.',
    );
  }
  if (anelDoLote && linhas.length === 0) return vazio('O lote não tem lado horizontal ou vertical acima da "parede mínima": desenhe paredes ou blocos, ou diminua o valor.');
  if (linhas.length === 0) {
    return vazio(
      paredesObliquas > 0 && paredesCurtas === 0
        ? 'Todas as paredes deste pavimento são oblíquas: os eixos automáticos saem só de paredes horizontais e verticais.'
        : 'Nenhuma parede ortogonal chega à "parede mínima" das hipóteses — diminua o valor para gerar os eixos.',
    );
  }

  // O DESENHO: edificação ∪ lote do pavimento. O eixo atravessa tudo e passa além.
  const pontos: Point[] = [
    ...paredes.flatMap((w) => [w.a, w.b]),
    ...blocos.flatMap((b) => b.pontos),
    ...model.boundaries.filter((b) => b.levelId === levelId).flatMap((b) => [b.a, b.b]),
  ];
  const minX = Math.min(...pontos.map((p) => p.x)) - hip.alemDoDesenhoMm;
  const maxX = Math.max(...pontos.map((p) => p.x)) + hip.alemDoDesenhoMm;
  const minY = Math.min(...pontos.map((p) => p.y)) - hip.alemDoDesenhoMm;
  const maxY = Math.max(...pontos.map((p) => p.y)) + hip.alemDoDesenhoMm;

  // JUNTAR: em cada direção, linhas a menos de `juntarAMenosDeMm` da anterior viram uma; fica a mais comprida.
  const juntar = (vertical: boolean) => {
    const daDirecao = linhas.filter((l) => l.vertical === vertical).sort((x, y) => x.c - y.c);
    const grupos: Linha[][] = [];
    for (const l of daDirecao) {
      const g = grupos[grupos.length - 1];
      if (g && l.c - g[g.length - 1].c < hip.juntarAMenosDeMm) g.push(l);
      else grupos.push([l]);
    }
    return grupos.map((g) => {
      const maior = g.reduce((m, l) => (l.comprimento > m.comprimento ? l : m), g[0]);
      const origens = new Set(g.map((l) => l.origem));
      const origem: EixoProposto['origem'] =
        origens.has('PAREDE') && origens.has('BLOCO') ? 'PAREDE_E_BLOCO' : (PRIORIDADE_DA_ORIGEM.find((o) => origens.has(o)) ?? maior.origem);
      return { c: Math.round(maior.c), origem };
    });
  };

  // Os eixos que já existem, ortogonais, com a sua coordenada. Os de nome AUTOMÁTICO entram na sequência (com
  // `renumerar`); os de nome à mão e as linhas de referência sem nome ficam fora dela — e o nome à mão fica reservado.
  const existentes = (model.eixos ?? []).flatMap((e) => {
    const dx = Math.abs(e.b.x - e.a.x);
    const dy = Math.abs(e.b.y - e.a.y);
    if (dx <= TOLERANCIA_ORTOGONAL_MM && dy > 0) return [{ e, vertical: true, c: (e.a.x + e.b.x) / 2 }];
    if (dy <= TOLERANCIA_ORTOGONAL_MM && dx > 0) return [{ e, vertical: false, c: (e.a.y + e.b.y) / 2 }];
    return [];
  });
  const tolerancia = Math.max(hip.juntarAMenosDeMm, TOLERANCIA_ORTOGONAL_MM);
  const naSequencia = (nome: string) => hip.renumerar && nomeAutomaticoDeEixo(nome);
  const reservados = new Set((model.eixos ?? []).map((e) => e.nome).filter((n) => !naSequencia(n)));

  let jaTinhamEixo = 0;
  const eixos: EixoProposto[] = [];
  for (const vertical of [true, false]) {
    type Item = { c: number; novo?: { origem: EixoProposto['origem'] }; existente?: (typeof existentes)[number] };
    const itens: Item[] = [];
    for (const g of juntar(vertical)) {
      if (existentes.some((x) => x.vertical === vertical && Math.abs(x.c - g.c) < tolerancia)) {
        jaTinhamEixo++;
        continue;
      }
      itens.push({ c: g.c, novo: { origem: g.origem } });
    }
    for (const x of existentes) if (x.vertical === vertical && naSequencia(x.e.nome)) itens.push({ c: x.c, existente: x });
    // Verticais da esquerda para a direita (A, B…); horizontais de CIMA para baixo (o Y do modelo cresce para cima).
    itens.sort((p, q) => (vertical ? p.c - q.c : q.c - p.c));

    // Sem renumerar: os nomes novos continuam depois de TODOS os usados (o comportamento de antes).
    const usados = new Set(hip.renumerar ? reservados : (model.eixos ?? []).map((e) => e.nome));
    let i = vertical ? 0 : 1;
    const proximo = () => {
      for (;;) {
        const nome = vertical ? letraDoEixo(i) : String(i);
        i++;
        if (!usados.has(nome)) {
          usados.add(nome);
          return nome;
        }
      }
    };
    for (const it of itens) {
      if (it.existente) {
        const e = it.existente.e;
        const nome = proximo();
        eixos.push({
          nome,
          vertical,
          coordenadaMm: Math.round(it.c),
          a: e.a,
          b: e.b,
          origem: 'EXISTENTE',
          existenteId: e.id,
          ...(nome !== e.nome ? { nomeAnterior: e.nome } : {}),
        });
        continue;
      }
      const a = vertical ? { x: it.c, y: Math.round(minY) } : { x: Math.round(minX), y: it.c };
      const b = vertical ? { x: it.c, y: Math.round(maxY) } : { x: Math.round(maxX), y: it.c };
      eixos.push({ nome: proximo(), vertical: eixoEhVertical(a, b), coordenadaMm: it.c, a, b, origem: it.novo!.origem });
    }
  }

  const novos = eixos.filter((e) => !e.existenteId);
  const renomeados = eixos.filter((e) => e.nomeAnterior !== undefined);
  return {
    eixos,
    novos: novos.length,
    renomeados: renomeados.length,
    comandos: [
      ...novos.map((e) => ({ type: 'AddEixo', a: e.a, b: e.b, nome: e.nome }) as Command),
      ...renomeados.map((e) => ({ type: 'SetEixoProps', eixoId: e.existenteId!, nome: e.nome }) as Command),
    ],
    paredesObliquas,
    paredesCurtas,
    jaTinhamEixo,
    motivoVazio: novos.length === 0 && renomeados.length === 0 ? 'Todas as linhas já têm eixo, e os nomes já estão em ordem.' : null,
  };
}

/** Nome que o próprio sistema dá a eixo (A, B… Z, A1…; 1, 2…) — o que a renumeração pode trocar. */
export function nomeAutomaticoDeEixo(nome: string): boolean {
  return /^[A-Z]\d*$/.test(nome) || /^\d+$/.test(nome);
}

/** Retângulo alinhado aos eixos, na unidade de quem desenha (px de tela, mm de papel, mm reais). */
export interface FaixaDasCotas {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Um retângulo vazio, que `crescerFaixa` vai abrindo. */
export function faixaVazia(): FaixaDasCotas {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function crescerFaixa(f: FaixaDasCotas, ...pontos: { x: number; y: number }[]): void {
  for (const p of pontos) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    f.minX = Math.min(f.minX, p.x);
    f.minY = Math.min(f.minY, p.y);
    f.maxX = Math.max(f.maxX, p.x);
    f.maxY = Math.max(f.maxY, p.y);
  }
}

/**
 * ONDE FICAM AS BOLHAS DE UM EIXO (09/10/2026) — *"cotas e eixo se sobrepondo. eixos devem ficar mais externos"*.
 *
 * O eixo passa uma distância fixa EM MM além do desenho, mas as cotas ficam a uma distância fixa EM PIXEL (ou em mm de
 * papel): com zoom afastado os 3 m viravam poucos pixels e a bolha caía em cima das cadeias. Aqui a bolha é empurrada,
 * NA HORA DE DESENHAR, para além da faixa das cotas (`faixa`, já com folga): o centro de cada bolha fica no ponto da
 * reta do eixo em que ela inteira já saiu do retângulo. Sem cota (ou eixo que não cruza a faixa), a bolha fica onde
 * sempre ficou: `folga` além da ponta. Devolve os dois centros e onde a linha do eixo termina (na borda da bolha).
 */
export function bolhasDoEixo(
  a: { x: number; y: number },
  b: { x: number; y: number },
  raio: number,
  faixa: FaixaDasCotas | null,
  folga = 0,
): { centroA: { x: number; y: number }; centroB: { x: number; y: number }; linhaA: { x: number; y: number }; linhaB: { x: number; y: number } } {
  const comp = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / comp;
  const uy = (b.y - a.y) / comp;
  let lA = -(raio + folga);
  let lB = comp + raio + folga;
  if (faixa && Number.isFinite(faixa.minX) && Number.isFinite(faixa.maxX)) {
    // A faixa crescida do raio + folga: o CENTRO fora dela = a bolha inteira fora da faixa.
    const g = raio + folga;
    const x0 = faixa.minX - g;
    const x1 = faixa.maxX + g;
    const y0 = faixa.minY - g;
    const y1 = faixa.maxY + g;
    // Reta × retângulo pelo método das faixas (slab).
    let tIn = -Infinity;
    let tOut = Infinity;
    for (const [o, d, lo, hi] of [
      [a.x, ux, x0, x1],
      [a.y, uy, y0, y1],
    ] as const) {
      if (Math.abs(d) < 1e-12) {
        if (o < lo || o > hi) {
          tIn = Infinity;
          tOut = -Infinity;
        }
        continue;
      }
      const t1 = (lo - o) / d;
      const t2 = (hi - o) / d;
      tIn = Math.max(tIn, Math.min(t1, t2));
      tOut = Math.min(tOut, Math.max(t1, t2));
    }
    if (tIn <= tOut) {
      lA = Math.min(lA, tIn);
      lB = Math.max(lB, tOut);
    }
  }
  const ponto = (l: number) => ({ x: a.x + ux * l, y: a.y + uy * l });
  return { centroA: ponto(lA), centroB: ponto(lB), linhaA: ponto(lA + raio), linhaB: ponto(lB - raio) };
}

export type BolhasDoEixo = ReturnType<typeof bolhasDoEixo>;

/**
 * AS BOLHAS DE TODOS OS EIXOS, ESCALONADAS (09/10/2026) — pedido: *"escalonar bolhas"*. Com zoom afastado, dois eixos
 * a ~1,5 m um do outro (o lado do lote e a linha do recuo) punham as bolhas uma sobre a outra.
 *
 * Primeiro cada bolha vai para fora das cotas (`bolhasDoEixo`). Depois, em cada LADO (as pontas que saem para cima,
 * para baixo, para a esquerda ou para a direita — só eixos horizontais/verticais), em ordem ao longo do lado: a bolha
 * que encostaria numa já posta vai para a fileira seguinte, `2 × raio + respiro` mais para fora, e a linha do eixo vai
 * até ela. A primeira que cabe na fileira de dentro fica nela — o resultado é o zigue-zague da prancha (1 dentro, 2
 * fora, 3 dentro…). Sem nome, o eixo não tem bolha: devolve `null` na posição dele.
 */
export function bolhasDosEixos(
  eixos: readonly { a: { x: number; y: number }; b: { x: number; y: number }; nome: string }[],
  raio: number,
  faixa: FaixaDasCotas | null,
  folga = 0,
  respiro = raio * 0.4,
): (BolhasDoEixo | null)[] {
  const saida: (BolhasDoEixo | null)[] = eixos.map((e) => (e.nome ? bolhasDoEixo(e.a, e.b, raio, faixa, folga) : null));
  type Ponta = { i: number; ponta: 'A' | 'B'; centro: { x: number; y: number }; dx: number; dy: number };
  const lados = new Map<string, Ponta[]>();
  eixos.forEach((e, i) => {
    const b = saida[i];
    if (!b) return;
    const comp = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
    if (comp < 1e-9) return;
    const ux = (e.b.x - e.a.x) / comp;
    const uy = (e.b.y - e.a.y) / comp;
    // Só os ortogonais escalonam: oblíquo não tem "lado" comum com os outros.
    const ortogonal = Math.abs(ux) < 1e-6 || Math.abs(uy) < 1e-6;
    if (!ortogonal) return;
    for (const [ponta, dx, dy, centro] of [
      ['A', -ux, -uy, b.centroA],
      ['B', ux, uy, b.centroB],
    ] as const) {
      const chave = `${Math.round(dx)},${Math.round(dy)}`;
      const lista = lados.get(chave) ?? [];
      lista.push({ i, ponta, centro, dx, dy });
      lados.set(chave, lista);
    }
  });
  const passo = 2 * raio + respiro;
  for (const lista of lados.values()) {
    // Ao longo do lado: pela coordenada perpendicular à saída.
    lista.sort((p, q) => (Math.abs(p.dx) > 0.5 ? p.centro.y - q.centro.y : p.centro.x - q.centro.x));
    const postas: { x: number; y: number }[] = [];
    for (const p of lista) {
      let fileira = 0;
      let c = p.centro;
      while (postas.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < passo - 1e-9) && fileira < 8) {
        fileira++;
        c = { x: p.centro.x + p.dx * passo * fileira, y: p.centro.y + p.dy * passo * fileira };
      }
      postas.push(c);
      if (fileira === 0) continue;
      const atual = saida[p.i]!;
      const linha = { x: c.x - p.dx * raio, y: c.y - p.dy * raio };
      saida[p.i] = p.ponta === 'A' ? { ...atual, centroA: c, linhaA: linha } : { ...atual, centroB: c, linhaB: linha };
    }
  }
  return saida;
}

