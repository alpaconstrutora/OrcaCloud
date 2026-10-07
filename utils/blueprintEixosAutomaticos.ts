import {
  eixoEhVertical,
  proximoNomeDeEixo,
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
 *  - Cada eixo atravessa o desenho inteiro (edificação ∪ lote) e passa `alemDoDesenhoMm` de cada lado, para a bolha
 *    cair por fora das cotas.
 *  - Linha que já tem eixo (mesma direção, a menos de `juntarAMenosDeMm`) é pulada; os nomes novos CONTINUAM depois
 *    dos já usados.
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
}

export const HIPOTESES_EIXOS_PADRAO: HipotesesDeEixos = {
  alemDoDesenhoMm: 3000,
  comprimentoMinimoDaParedeMm: 1500,
  juntarAMenosDeMm: 100,
  usarLadosDoLote: true,
};

/** As hipóteses que são distância (mm). */
export type DistanciaDosEixos = Exclude<keyof HipotesesDeEixos, 'usarLadosDoLote'>;

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
  origem: 'PAREDE' | 'BLOCO' | 'PAREDE_E_BLOCO' | OrigemDoLote;
}

export interface PropostaDeEixos {
  /** Verticais (A, B… da esquerda para a direita) e depois horizontais (1, 2… de cima para baixo). */
  eixos: EixoProposto[];
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

  const vazio = (motivo: string): PropostaDeEixos => ({ eixos: [], comandos: [], paredesObliquas, paredesCurtas, jaTinhamEixo: 0, motivoVazio: motivo });
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

  const existentes = model.eixos ?? [];
  const jaTem = (vertical: boolean, c: number) =>
    existentes.some((e) => {
      const dx = Math.abs(e.b.x - e.a.x);
      const dy = Math.abs(e.b.y - e.a.y);
      if (vertical) return dx <= TOLERANCIA_ORTOGONAL_MM && dy > 0 && Math.abs((e.a.x + e.b.x) / 2 - c) < Math.max(hip.juntarAMenosDeMm, TOLERANCIA_ORTOGONAL_MM);
      return dy <= TOLERANCIA_ORTOGONAL_MM && dx > 0 && Math.abs((e.a.y + e.b.y) / 2 - c) < Math.max(hip.juntarAMenosDeMm, TOLERANCIA_ORTOGONAL_MM);
    });

  let jaTinhamEixo = 0;
  const usados = new Set(existentes.map((e) => e.nome));
  const eixos: EixoProposto[] = [];
  // Verticais da esquerda para a direita (A, B…); horizontais de CIMA para baixo (o Y do modelo cresce para cima).
  const ordem: [boolean, { c: number; origem: EixoProposto['origem'] }[]][] = [
    [true, juntar(true)],
    [false, juntar(false).reverse()],
  ];
  for (const [vertical, grupos] of ordem) {
    for (const g of grupos) {
      if (jaTem(vertical, g.c)) {
        jaTinhamEixo++;
        continue;
      }
      const a = vertical ? { x: g.c, y: Math.round(minY) } : { x: Math.round(minX), y: g.c };
      const b = vertical ? { x: g.c, y: Math.round(maxY) } : { x: Math.round(maxX), y: g.c };
      const nome = proximoNomeDeEixo(usados, eixoEhVertical(a, b));
      usados.add(nome);
      eixos.push({ nome, vertical, coordenadaMm: g.c, a, b, origem: g.origem });
    }
  }

  return {
    eixos,
    comandos: eixos.map((e) => ({ type: 'AddEixo', a: e.a, b: e.b, nome: e.nome }) as Command),
    paredesObliquas,
    paredesCurtas,
    jaTinhamEixo,
    motivoVazio: eixos.length === 0 ? 'Todas as linhas da edificação já têm eixo.' : null,
  };
}
