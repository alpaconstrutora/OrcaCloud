/**
 * ESTUDO DE MASSA — o GERADOR de implantações e o OTIMIZADOR (fase M5 do plano
 * `2026-10-01-estudo-de-massa.md`, §7, §8, §10 e §18 do pedido).
 *
 * Do lote, da zona e do produto do estudo, monta implantações de uma
 * BIBLIOTECA paramétrica (torre única, duas torres, lâmina, blocos paralelos,
 * L, U, H, embasamento + torre), varre profundidade da lâmina × comprimento da
 * torre × pavimentos × estacionamento, mede cada combinação com a MESMA régua
 * do comparador (`medirCenarioDeMassa`, M4) e devolve, por tipo de
 * implantação, a melhor que atende às restrições — pelo OBJETIVO que o usuário
 * escolheu. O comparador não tem vencedor; o otimizador tem, porque aqui o
 * critério é dito.
 *
 * ─── ESTE MÓDULO É PURO ─────────────────────────────────────────────────────
 *
 * Nada de rede, nada de estado: mesma entrada + mesma semente = mesmo
 * resultado, sempre. A grade é exaustiva (não depende da semente); a SEMENTE
 * só guia o refinamento — recozimento simulado sobre os parâmetros contínuos
 * (profundidade, comprimento, posição, pavimentos), com o PRNG do gerador de
 * plantas (E6.2).
 *
 * ─── GEOMETRIA: O RETÂNGULO DO ENVELOPE, ORIENTADO PELA FRENTE ──────────────
 *
 * O quadro de trabalho gira com a divisa FRENTE (o eixo u corre ao longo da
 * rua, v entra no lote) e, nele, o maior retângulo inscrito no envelope legal
 * NA ALTURA DO TOPO do cenário — com afastamento progressivo o envelope
 * encolhe com a altura, e usar o do topo garante que todos os pavimentos
 * cabem. É conservador em lote irregular (o retângulo perde as pontas) — dito
 * nas decisões. Uma margem de 10 cm afasta os vértices da borda do envelope.
 *
 * ─── O QUE FICA DE FORA (DITO) ──────────────────────────────────────────────
 *
 * Pátio fechado (anel com furo: o `Bloco` é um polígono simples), casas
 * geminadas (a unidade de dois pavimentos não é o modelo de distribuição por
 * pavimento) e estacionamento descoberto no térreo. A insolação como objetivo
 * entra na etapa seguinte da M5.
 */
import type { BlueprintModel, Bloco, Command, ObjectId, Point, UsoDoBloco } from './blueprintKernel';
import { applyBatch } from './blueprintKernel';
import { divisasDoLote, envelopeConstrutivo, medirTerreno, type Terreno } from './blueprintTerreno';
import { recuosEfetivos } from './blueprintZonaUrbanistica';
import { maiorRetanguloInscrito, prng, type Retangulo } from './blueprintGerador';
import { centroDoAnel } from './blueprintMassa';
import { medirCenarioDeMassa, type CenarioDeMassa, type CenarioMedido, type ReguaDoComparador } from './blueprintComparadorDeMassa';

// ─── Vocabulário ─────────────────────────────────────────────────────────────

export const TIPOS_DE_IMPLANTACAO = ['TORRE', 'DUAS_TORRES', 'LAMINA', 'BLOCOS_PARALELOS', 'EM_L', 'EM_U', 'EM_H', 'EMBASAMENTO_E_TORRE'] as const;
export type TipoDeImplantacao = (typeof TIPOS_DE_IMPLANTACAO)[number];

export const ROTULO_DA_IMPLANTACAO: Record<TipoDeImplantacao, string> = {
  TORRE: 'Torre única',
  DUAS_TORRES: 'Duas torres',
  LAMINA: 'Bloco longitudinal',
  BLOCOS_PARALELOS: 'Blocos paralelos',
  EM_L: 'Bloco em L',
  EM_U: 'Bloco em U',
  EM_H: 'Bloco em H',
  EMBASAMENTO_E_TORRE: 'Embasamento + torre',
};

/** Tipos cujo "comprimento da torre" é um parâmetro (os outros correm o lote inteiro). */
const USA_COMPRIMENTO: ReadonlySet<TipoDeImplantacao> = new Set(['TORRE', 'DUAS_TORRES', 'EMBASAMENTO_E_TORRE']);

export const MODOS_DE_ESTACIONAMENTO = ['AUTOMATICO', 'SEM_GARAGEM', 'PILOTIS', 'SUBSOLO_1', 'SUBSOLO_2'] as const;
export type ModoDeEstacionamento = (typeof MODOS_DE_ESTACIONAMENTO)[number];
export type Garagem = Exclude<ModoDeEstacionamento, 'AUTOMATICO'>;

export const ROTULO_DO_ESTACIONAMENTO: Record<ModoDeEstacionamento, string> = {
  AUTOMATICO: 'Automático (testa todos)',
  SEM_GARAGEM: 'Sem garagem',
  PILOTIS: 'Pilotis (garagem sob o bloco)',
  SUBSOLO_1: '1 subsolo',
  SUBSOLO_2: '2 subsolos',
};

export const OBJETIVOS_DA_MASSA = ['VGV', 'RESULTADO', 'VENDAVEL', 'UNIDADES', 'EFICIENCIA', 'INSOLACAO', 'MENOR_CUSTO', 'MENOR_COMUM', 'MENOR_GARAGEM', 'PONDERADO'] as const;
export type ObjetivoDaMassa = (typeof OBJETIVOS_DA_MASSA)[number];

export const ROTULO_DO_OBJETIVO: Record<ObjetivoDaMassa, string> = {
  VGV: 'Maximizar o VGV',
  RESULTADO: 'Maximizar o resultado (lucro)',
  VENDAVEL: 'Maximizar a área vendável',
  UNIDADES: 'Maximizar o número de unidades',
  EFICIENCIA: 'Maximizar a eficiência',
  INSOLACAO: 'Maximizar o sol nas fachadas (21/06)',
  MENOR_CUSTO: 'Minimizar o custo',
  MENOR_COMUM: 'Minimizar a área comum por unidade',
  MENOR_GARAGEM: 'Minimizar a área de estacionamento',
  PONDERADO: 'Combinação ponderada',
};

/** Pesos da combinação ponderada (0 = fora). Cada indicador é normalizado entre o pior e o melhor da grade. */
export interface PesosDoObjetivo {
  vgv: number;
  resultado: number;
  unidades: number;
  eficiencia: number;
  /** Menor custo total é melhor. */
  custo: number;
  /** Menor complexidade construtiva é melhor. */
  complexidade: number;
  /** M5b: sol nas fachadas em 21/06 (mais é melhor). Só pesa com a régua do sol. */
  insolacao: number;
}

export const PESOS_PADRAO: PesosDoObjetivo = { vgv: 1, resultado: 2, unidades: 1, eficiencia: 1, custo: 1, complexidade: 1, insolacao: 1 };

export interface RestricoesDaMassa {
  /** CA, TO, gabarito e envelope por pavimento. Desligado, o gerador ainda fica dentro do envelope do térreo. */
  respeitarLei: boolean;
  /** Vagas que cabem ≥ vagas exigidas (produto × zona). */
  atenderVagas: boolean;
  /** Mínimo de unidades; `null` = a meta do produto, se houver. */
  unidadesMin: number | null;
  /** Teto de pavimentos acima do solo do usuário, além do da lei. */
  pavimentosMax: number | null;
}

export const RESTRICOES_PADRAO: RestricoesDaMassa = { respeitarLei: true, atenderVagas: true, unidadesMin: null, pavimentosMax: null };

export interface HipotesesDoGeradorDeMassa {
  tipos: TipoDeImplantacao[];
  /** Profundidade da lâmina (o bloco visto de lado), m. */
  profundidadesM: number[];
  /** Comprimento da torre, m (só torre, duas torres e embasamento). */
  comprimentosDaTorreM: number[];
  /** Entre dois blocos (e largura mínima do pátio do U/H), m. Hipótese — a lei local pode pedir h/x. */
  afastamentoEntreBlocosM: number;
  pavimentosDoEmbasamento: number;
  peDireitoMm: number;
  peDireitoDoSubsoloMm: number;
  /** Teto da varredura quando a zona não diz gabarito, pavimentos. */
  pavimentosMax: number;
  estacionamento: ModoDeEstacionamento;
  /** Passos do recozimento por tipo de implantação. */
  iteracoes: number;
}

export const HIPOTESES_DO_GERADOR_DE_MASSA_PADRAO: HipotesesDoGeradorDeMassa = {
  tipos: [...TIPOS_DE_IMPLANTACAO],
  profundidadesM: [12, 15, 18],
  comprimentosDaTorreM: [18, 24, 30],
  afastamentoEntreBlocosM: 6,
  pavimentosDoEmbasamento: 2,
  peDireitoMm: 3000,
  peDireitoDoSubsoloMm: 3000,
  pavimentosMax: 40,
  estacionamento: 'AUTOMATICO',
  iteracoes: 40,
};

/** Tudo o que a tela do gerador escolhe — e o que a conversa (M5c) pode mudar. */
export interface ConfiguracaoDoGeradorDeMassa {
  objetivo: ObjetivoDaMassa;
  pesos: PesosDoObjetivo;
  restricoes: RestricoesDaMassa;
  hipoteses: HipotesesDoGeradorDeMassa;
  semente: number;
}

export const CONFIGURACAO_DO_GERADOR_DE_MASSA_PADRAO: ConfiguracaoDoGeradorDeMassa = {
  objetivo: 'RESULTADO',
  pesos: PESOS_PADRAO,
  restricoes: RESTRICOES_PADRAO,
  hipoteses: HIPOTESES_DO_GERADOR_DE_MASSA_PADRAO,
  semente: 1,
};

export interface EntradaDoGeradorDeMassa {
  /** O modelo do estudo: o lote (divisas com papéis) e os pavimentos. Os blocos que houver são substituídos. */
  model: BlueprintModel;
  /** A régua do estudo (zona, recuos, produto, CUB) — a mesma do comparador. */
  regua: Omit<ReguaDoComparador, 'cacheDeVagas'>;
  objetivo: ObjetivoDaMassa;
  pesos?: PesosDoObjetivo;
  restricoes: RestricoesDaMassa;
}

export interface BlocoProposto {
  nome: string;
  /** mm inteiros — iguais aos que o `AddBloco` grava. */
  pontos: Point[];
  cotaBaseMm: number;
  pavimentos: number;
  peDireitoMm: number;
  uso: UsoDoBloco;
}

export interface ParametrosDoCandidato {
  tipo: TipoDeImplantacao;
  profundidadeMm: number;
  /** 0 nos tipos que correm o lote inteiro. */
  comprimentoMm: number;
  /** Pavimentos do bloco de unidades (a torre, no embasamento). */
  pavimentos: number;
  garagem: Garagem;
  /** Posição da torre única na folga do retângulo, −1 a 1 (0 = centro). */
  du: number;
  dv: number;
  /**
   * M5b: o espelho da forma (L: em que canto fica a dobra; U: para que lado
   * abre). Com a régua do sol a orientação muda o resultado; sem ela as
   * variantes dariam números iguais e não são testadas.
   */
  variante: number;
}

export interface CandidatoDeMassa {
  chave: string;
  parametros: ParametrosDoCandidato;
  /** "Duas torres · 12 pav · lâmina 15 m · 1 subsolo". */
  rotulo: string;
  blocos: BlocoProposto[];
  cenario: CenarioDeMassa;
  /** O valor do objetivo (maior é melhor; os "minimizar" vêm com sinal trocado); null = não se mede. */
  valor: number | null;
  viavel: boolean;
  /** Por que não é viável (vazio quando é). */
  motivos: string[];
}

export interface ResultadoDoGeradorDeMassa {
  semente: number;
  objetivo: ObjetivoDaMassa;
  /** O melhor viável de cada tipo de implantação, do melhor para o pior. */
  melhores: CandidatoDeMassa[];
  /** Chaves dos `melhores` não dominados em VGV (↑), custo (↓) e complexidade (↓). */
  pareto: string[];
  avaliados: number;
  viaveis: number;
  descartes: { motivo: string; quantos: number }[];
  decisoes: string[];
  avisos: string[];
  /** O retângulo do térreo, m — o "tamanho" do problema. */
  quadro: { larguraM: number; profundidadeM: number } | null;
  levelId: ObjectId | null;
}

// ─── Quadro orientado pela frente ────────────────────────────────────────────

interface Quadro {
  /** Ao longo da rua. */
  ux: Point;
  /** Da rua para dentro do lote. */
  uy: Point;
  frenteDeclarada: boolean;
}

const paraLocal = (q: Quadro, p: Point): Point => ({ x: p.x * q.ux.x + p.y * q.ux.y, y: p.x * q.uy.x + p.y * q.uy.y });
const paraMundo = (q: Quadro, p: Point): Point => ({ x: p.x * q.ux.x + p.y * q.uy.x, y: p.x * q.ux.y + p.y * q.uy.y });
const areaDoAnel = (a: readonly Point[]) => a.reduce((s, p, i) => s + p.x * a[(i + 1) % a.length].y - a[(i + 1) % a.length].x * p.y, 0) / 2;

function quadroDoLote(terreno: Terreno, limites: readonly BlueprintModel['boundaries'][number][]): Quadro {
  const doLote = new Set(terreno.ladosIds);
  const frentes = limites.filter((b) => doLote.has(b.id) && b.papel === 'FRENTE');
  const maior = frentes.sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y))[0];
  if (!maior) return { ux: { x: 1, y: 0 }, uy: { x: 0, y: 1 }, frenteDeclarada: false };
  const len = Math.hypot(maior.b.x - maior.a.x, maior.b.y - maior.a.y) || 1;
  const e = { x: (maior.b.x - maior.a.x) / len, y: (maior.b.y - maior.a.y) / len };
  const c = centroDoAnel(terreno.anel);
  const meio = { x: (maior.a.x + maior.b.x) / 2, y: (maior.a.y + maior.b.y) / 2 };
  let n = { x: -e.y, y: e.x };
  if ((c.x - meio.x) * n.x + (c.y - meio.y) * n.y < 0) n = { x: e.y, y: -e.x };
  // ux à direita de uy (base com determinante +1): a rotação não espelha o desenho.
  return { ux: { x: n.y, y: -n.x }, uy: n, frenteDeclarada: true };
}

/** Margem entre os vértices e a borda do envelope, mm. */
const MARGEM_MM = 100;
const PASSO_MIN_MM = 250;
/** Menor lado de bloco que a biblioteca aceita, mm. */
const LADO_MIN_MM = 8000;

function encolher(r: Retangulo, mm: number): Retangulo | null {
  const s = { x0: r.x0 + mm, y0: r.y0 + mm, x1: r.x1 - mm, y1: r.y1 - mm };
  return s.x1 - s.x0 >= LADO_MIN_MM && s.y1 - s.y0 >= LADO_MIN_MM ? s : null;
}

function retanguloDoAnel(q: Quadro, anel: readonly Point[]): Retangulo | null {
  if (anel.length < 3) return null;
  // Inteiros: o retângulo inscrito trabalha em milímetro inteiro (o quadro girado dá frações; a margem cobre o arredondamento).
  const local = anel.map((p) => {
    const l = paraLocal(q, p);
    return { x: Math.round(l.x), y: Math.round(l.y) };
  });
  const xs = local.map((p) => p.x);
  const ys = local.map((p) => p.y);
  const caixa = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  // Anel que JÁ é o retângulo do quadro (o lote retangular girado chega com ±1 mm
  // de arredondamento): a caixa serve — a busca em grade perderia até um passo.
  const perimetro = local.reduce((s, p, i) => s + Math.hypot(local[(i + 1) % local.length].x - p.x, local[(i + 1) % local.length].y - p.y), 0);
  const areaDaCaixa = (caixa.x1 - caixa.x0) * (caixa.y1 - caixa.y0);
  if (local.length === 4 && areaDaCaixa - Math.abs(areaDoAnel(local)) <= perimetro * 2) return encolher(caixa, MARGEM_MM);
  const passo = Math.max(PASSO_MIN_MM, Math.round(Math.max(caixa.x1 - caixa.x0, caixa.y1 - caixa.y0) / 150));
  const r = maiorRetanguloInscrito(local, passo);
  return r ? encolher(r, MARGEM_MM) : null;
}

// ─── Montagem das implantações ───────────────────────────────────────────────

interface Contexto {
  q: Quadro;
  terreno: Terreno;
  limites: BlueprintModel['boundaries'];
  regua: EntradaDoGeradorDeMassa['regua'];
  hip: HipotesesDoGeradorDeMassa;
  levelId: ObjectId;
  usoDasUnidades: UsoDoBloco;
  usoDoEmbasamento: UsoDoBloco;
  /** TO máxima × lote, mm²; null sem limite (ou com a lei desligada). */
  implantacaoMaxMm2: number | null;
  retanguloDoLote: Retangulo | null;
  cacheDeRetangulos: Map<string, Retangulo | null>;
}

/** O retângulo do envelope no topo de um bloco de `ordinal` pavimentos com topo em `topoMm`. */
function retanguloNaAltura(ctx: Contexto, topoMm: number, ordinal: number): Retangulo | null {
  const z = ctx.regua.zona;
  const ef = recuosEfetivos(ctx.regua.recuosBase, { afastamentoProgressivo: z.afastamentoProgressivo, recuoFrenteEscalonado: z.recuoFrenteEscalonado ?? null }, topoMm / 1000, ordinal);
  const chave = JSON.stringify(ef.recuos);
  if (ctx.cacheDeRetangulos.has(chave)) return ctx.cacheDeRetangulos.get(chave)!;
  const env = envelopeConstrutivo(ctx.terreno, ctx.limites, ef.recuos);
  const r = env.valido ? retanguloDoAnel(ctx.q, env.anel) : null;
  ctx.cacheDeRetangulos.set(chave, r);
  return r;
}

/**
 * Coordenadas do retângulo pelo EIXO MAIOR: `a` corre ao longo do lado maior,
 * `b` atravessa. As formas são escritas uma vez, nesse eixo, e valem para o
 * lote largo e para o lote fundo.
 */
function eixoDo(r: Retangulo) {
  const W = r.x1 - r.x0;
  const D = r.y1 - r.y0;
  const largo = W >= D;
  return {
    comprimento: largo ? W : D,
    largura: largo ? D : W,
    /** (a, b) do eixo → ponto local do quadro. */
    pt: (a: number, b: number): Point => (largo ? { x: r.x0 + a, y: r.y0 + b } : { x: r.x0 + b, y: r.y0 + a }),
  };
}

const retEmAB = (pt: (a: number, b: number) => Point, a0: number, b0: number, a1: number, b1: number): Point[] => [pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)];

function paraBloco(ctx: Contexto, nome: string, local: Point[], cotaBaseMm: number, pavimentos: number, peDireitoMm: number, uso: UsoDoBloco): BlocoProposto {
  return {
    nome,
    pontos: local.map((p) => {
      const w = paraMundo(ctx.q, p);
      return { x: Math.round(w.x), y: Math.round(w.y) };
    }),
    cotaBaseMm: Math.round(cotaBaseMm),
    pavimentos,
    peDireitoMm,
    uso,
  };
}

/** Os contornos (no quadro local) dos blocos de unidades de um tipo; null = a forma não cabe no retângulo. */
function contornos(tipo: TipoDeImplantacao, r: Retangulo, p: ParametrosDoCandidato, g: number): { nome: string; anel: Point[] }[] | null {
  const eixo = eixoDo(r);
  const { comprimento: len, largura: larg } = eixo;
  // Variante: bit 0 espelha ao longo do comprimento, bit 1 através — o L troca de canto, o U abre do outro lado.
  const pt = (a: number, b: number) => eixo.pt(p.variante & 1 ? len - a : a, p.variante & 2 ? larg - b : b);
  const prof = Math.min(p.profundidadeMm, larg);
  if (prof < LADO_MIN_MM) return null;
  switch (tipo) {
    case 'TORRE': {
      const a = Math.min(p.comprimentoMm, len);
      if (a < LADO_MIN_MM) return null;
      const a0 = ((len - a) * (p.du + 1)) / 2;
      const b0 = ((larg - prof) * (p.dv + 1)) / 2;
      return [{ nome: 'Torre', anel: retEmAB(pt, a0, b0, a0 + a, b0 + prof) }];
    }
    case 'DUAS_TORRES': {
      const a = Math.min(p.comprimentoMm, (len - g) / 2);
      if (a < LADO_MIN_MM) return null;
      const ini = (len - (2 * a + g)) / 2;
      const b0 = (larg - prof) / 2;
      return [
        { nome: 'Torre A', anel: retEmAB(pt, ini, b0, ini + a, b0 + prof) },
        { nome: 'Torre B', anel: retEmAB(pt, ini + a + g, b0, ini + 2 * a + g, b0 + prof) },
      ];
    }
    case 'LAMINA': {
      const b0 = ((larg - prof) * (p.dv + 1)) / 2;
      return [{ nome: 'Lâmina', anel: retEmAB(pt, 0, b0, len, b0 + prof) }];
    }
    case 'BLOCOS_PARALELOS': {
      const k = Math.floor((larg + g) / (prof + g) + 1e-9);
      if (k < 2) return null;
      const ini = (larg - (k * prof + (k - 1) * g)) / 2;
      return Array.from({ length: k }, (_, i) => ({ nome: `Bloco ${String.fromCharCode(65 + i)}`, anel: retEmAB(pt, 0, ini + i * (prof + g), len, ini + i * (prof + g) + prof) }));
    }
    case 'EM_L': {
      if (len < 2 * prof || larg < 2 * prof) return null;
      return [{ nome: 'Bloco em L', anel: [pt(0, 0), pt(len, 0), pt(len, prof), pt(prof, prof), pt(prof, larg), pt(0, larg)] }];
    }
    case 'EM_U': {
      if (len - 2 * prof < g || larg - prof < g) return null;
      return [{ nome: 'Bloco em U', anel: [pt(0, 0), pt(len, 0), pt(len, larg), pt(len - prof, larg), pt(len - prof, prof), pt(prof, prof), pt(prof, larg), pt(0, larg)] }];
    }
    case 'EM_H': {
      const m0 = (larg - prof) / 2;
      const m1 = (larg + prof) / 2;
      if (len - 2 * prof < g || m0 < g) return null;
      return [
        {
          nome: 'Bloco em H',
          anel: [pt(0, 0), pt(prof, 0), pt(prof, m0), pt(len - prof, m0), pt(len - prof, 0), pt(len, 0), pt(len, larg), pt(len - prof, larg), pt(len - prof, m1), pt(prof, m1), pt(prof, larg), pt(0, larg)],
        },
      ];
    }
    case 'EMBASAMENTO_E_TORRE':
      return null; // montado à parte: dois retângulos em alturas diferentes
  }
}

/** Os blocos do cenário (unidades + garagem), ou null quando a forma não cabe. */
function montar(ctx: Contexto, p: ParametrosDoCandidato): BlocoProposto[] | null {
  const { hip } = ctx;
  const pd = hip.peDireitoMm;
  const g = hip.afastamentoEntreBlocosM * 1000;
  const blocos: BlocoProposto[] = [];

  if (p.tipo === 'EMBASAMENTO_E_TORRE') {
    if (p.garagem === 'PILOTIS') return null;
    const nE = hip.pavimentosDoEmbasamento;
    const rE = retanguloNaAltura(ctx, nE * pd, nE);
    const rT = retanguloNaAltura(ctx, (nE + p.pavimentos) * pd, nE + p.pavimentos);
    if (!rE || !rT) return null;
    // O embasamento ocupa o envelope até a TO máxima, centrado.
    let W = rE.x1 - rE.x0;
    let D = rE.y1 - rE.y0;
    if (ctx.implantacaoMaxMm2 != null && W * D > ctx.implantacaoMaxMm2) {
      const s = Math.sqrt(ctx.implantacaoMaxMm2 / (W * D)) * 0.995;
      W *= s;
      D *= s;
    }
    if (W < LADO_MIN_MM || D < LADO_MIN_MM) return null;
    const cx = (rE.x0 + rE.x1) / 2;
    const cy = (rE.y0 + rE.y1) / 2;
    const emb = { x0: cx - W / 2, y0: cy - D / 2, x1: cx + W / 2, y1: cy + D / 2 };
    // A torre fica sobre o centro do embasamento, dentro do retângulo do topo dela.
    const { comprimento: len, largura: larg } = eixoDo(rT);
    const a = Math.min(p.comprimentoMm, len, Math.max(W, D));
    const b = Math.min(p.profundidadeMm, larg, Math.min(W, D));
    if (a < LADO_MIN_MM || b < LADO_MIN_MM) return null;
    const largoT = rT.x1 - rT.x0 >= rT.y1 - rT.y0;
    const [tw, td] = largoT ? [a, b] : [b, a];
    const tx0 = Math.min(Math.max(cx - tw / 2, rT.x0), rT.x1 - tw);
    const ty0 = Math.min(Math.max(cy - td / 2, rT.y0), rT.y1 - td);
    const anelE = [{ x: emb.x0, y: emb.y0 }, { x: emb.x1, y: emb.y0 }, { x: emb.x1, y: emb.y1 }, { x: emb.x0, y: emb.y1 }];
    const anelT = [{ x: tx0, y: ty0 }, { x: tx0 + tw, y: ty0 }, { x: tx0 + tw, y: ty0 + td }, { x: tx0, y: ty0 + td }];
    blocos.push(paraBloco(ctx, 'Embasamento', anelE, 0, nE, pd, ctx.usoDoEmbasamento));
    blocos.push(paraBloco(ctx, 'Torre', anelT, nE * pd, p.pavimentos, pd, ctx.usoDasUnidades));
  } else {
    const extra = p.garagem === 'PILOTIS' ? 1 : 0;
    const r = retanguloNaAltura(ctx, (p.pavimentos + extra) * pd, p.pavimentos + extra);
    if (!r) return null;
    const formas = contornos(p.tipo, r, p, g);
    if (!formas) return null;
    for (const f of formas) {
      if (extra) blocos.push(paraBloco(ctx, `${f.nome} · pilotis`, f.anel, 0, 1, pd, 'GARAGEM'));
      blocos.push(paraBloco(ctx, f.nome, f.anel, extra * pd, p.pavimentos, pd, ctx.usoDasUnidades));
    }
  }

  if (p.garagem === 'SUBSOLO_1' || p.garagem === 'SUBSOLO_2') {
    if (!ctx.retanguloDoLote) return null;
    const k = p.garagem === 'SUBSOLO_1' ? 1 : 2;
    const r = ctx.retanguloDoLote;
    const anel = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
    blocos.push(paraBloco(ctx, 'Subsolo', anel, -k * hip.peDireitoDoSubsoloMm, k, hip.peDireitoDoSubsoloMm, 'GARAGEM'));
  }
  return blocos;
}

/** O modelo do cenário sem passar pelo kernel (o mesmo que o `AddBloco` gravaria). */
function modeloCom(base: BlueprintModel, levelId: ObjectId, blocos: readonly BlocoProposto[]): BlueprintModel {
  return {
    ...base,
    blocos: blocos.map(
      (b, i): Bloco => ({ id: `blc_ger_${i}`, uid: `ger_${i}`, levelId, nome: b.nome, pontos: b.pontos, cotaBaseMm: b.cotaBaseMm, pavimentos: b.pavimentos, peDireitoMm: b.peDireitoMm, uso: b.uso }),
    ),
  };
}

// ─── Objetivo ────────────────────────────────────────────────────────────────

interface Faixas {
  [k: string]: { min: number; max: number };
}

const CHAVES_DO_PESO: { peso: keyof PesosDoObjetivo; valor: (c: CenarioDeMassa) => number | null; sinal: 1 | -1 }[] = [
  { peso: 'vgv', valor: (c) => c.vgv, sinal: 1 },
  { peso: 'resultado', valor: (c) => c.resultado, sinal: 1 },
  { peso: 'unidades', valor: (c) => c.unidades, sinal: 1 },
  { peso: 'eficiencia', valor: (c) => c.eficienciaGlobalPct, sinal: 1 },
  { peso: 'custo', valor: (c) => c.custoTotal, sinal: -1 },
  { peso: 'complexidade', valor: (c) => c.complexidade, sinal: -1 },
  { peso: 'insolacao', valor: (c) => c.solNasFachadasH, sinal: 1 },
];

/** Maior é melhor. `metaDeUnidades` muda o "minimizar custo": com meta, custo total; sem, custo por m² vendável. */
export function valorDoObjetivo(c: CenarioDeMassa, objetivo: ObjetivoDaMassa, opcoes: { metaDeUnidades: number | null; pesos?: PesosDoObjetivo; faixas?: Faixas }): number | null {
  switch (objetivo) {
    case 'VGV':
      return c.vgv;
    case 'RESULTADO':
      return c.resultado;
    case 'VENDAVEL':
      return c.areaVendavelM2;
    case 'UNIDADES':
      return c.unidades;
    case 'EFICIENCIA':
      return c.eficienciaGlobalPct;
    case 'INSOLACAO':
      return c.solNasFachadasH;
    case 'MENOR_CUSTO':
      if (c.custoTotal == null) return null;
      if (opcoes.metaDeUnidades != null) return -c.custoTotal;
      return c.areaVendavelM2 > 0 ? -c.custoTotal / c.areaVendavelM2 : null;
    case 'MENOR_COMUM':
      return c.areaComumPorUnidadeM2 != null ? -c.areaComumPorUnidadeM2 : null;
    case 'MENOR_GARAGEM':
      return -c.garagemM2;
    case 'PONDERADO': {
      const pesos = opcoes.pesos ?? PESOS_PADRAO;
      const faixas = opcoes.faixas ?? {};
      let soma = 0;
      let total = 0;
      for (const k of CHAVES_DO_PESO) {
        const w = Math.max(0, pesos[k.peso]);
        if (w === 0) continue;
        const v = k.valor(c);
        const f = faixas[k.peso];
        if (v == null || !f) continue;
        const n = f.max > f.min ? (v - f.min) / (f.max - f.min) : 1;
        soma += w * (k.sinal === 1 ? n : 1 - n);
        total += w;
      }
      return total > 0 ? Math.round((soma / total) * 10000) / 100 : null;
    }
  }
}

function faixasDe(cenarios: readonly CenarioDeMassa[]): Faixas {
  const f: Faixas = {};
  for (const k of CHAVES_DO_PESO) {
    const vs = cenarios.map(k.valor).filter((v): v is number => v != null);
    if (vs.length) f[k.peso] = { min: Math.min(...vs), max: Math.max(...vs) };
  }
  return f;
}

/** Diferença que conta: acima de 1 ppm (o quadro girado muda centavos no arredondamento do milímetro). */
const difere = (a: number, b: number) => Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

/** Ordem do ranking: objetivo; empate → menor complexidade → maior VGV → chave. */
export function compararCandidatos(a: CandidatoDeMassa, b: CandidatoDeMassa): number {
  const va = a.valor ?? -Infinity;
  const vb = b.valor ?? -Infinity;
  if (va !== vb && (!Number.isFinite(va) || !Number.isFinite(vb) || difere(va, vb))) return vb > va ? 1 : -1;
  if (a.cenario.complexidade !== b.cenario.complexidade) return a.cenario.complexidade - b.cenario.complexidade;
  const ga = a.cenario.vgv ?? -Infinity;
  const gb = b.cenario.vgv ?? -Infinity;
  if (ga !== gb && (!Number.isFinite(ga) || !Number.isFinite(gb) || difere(ga, gb))) return gb > ga ? 1 : -1;
  return a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0;
}

/** Não dominados em VGV (↑; sem preço, a área vendável), custo (↓; sem custo, a construída) e complexidade (↓). */
export function frenteDeParetoDaMassa(cands: readonly CandidatoDeMassa[]): string[] {
  const ganho = (c: CandidatoDeMassa) => c.cenario.vgv ?? c.cenario.areaVendavelM2;
  const gasto = (c: CandidatoDeMassa) => c.cenario.custoTotal ?? c.cenario.areaConstruidaM2;
  return cands
    .filter(
      (a) =>
        !cands.some(
          (b) =>
            b !== a &&
            ganho(b) >= ganho(a) &&
            gasto(b) <= gasto(a) &&
            b.cenario.complexidade <= a.cenario.complexidade &&
            (ganho(b) > ganho(a) || gasto(b) < gasto(a) || b.cenario.complexidade < a.cenario.complexidade),
        ),
    )
    .map((c) => c.chave);
}

// ─── O gerador ───────────────────────────────────────────────────────────────

const chaveDe = (p: ParametrosDoCandidato) => `${p.tipo}|p${p.profundidadeMm}|c${p.comprimentoMm}|n${p.pavimentos}|${p.garagem}|${p.du.toFixed(2)},${p.dv.toFixed(2)}|v${p.variante}`;
/** Que variantes cada forma tem (as que mudam a orientação de alguma fachada). */
const VARIANTES: Partial<Record<TipoDeImplantacao, number[]>> = { EM_L: [0, 1, 2, 3], EM_U: [0, 2] };
const ROTULO_DA_VARIANTE: Record<number, string> = { 1: 'espelhado', 2: 'invertido', 3: 'espelhado e invertido' };
const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

function rotuloDe(p: ParametrosDoCandidato, hip: HipotesesDoGeradorDeMassa): string {
  const partes = [ROTULO_DA_IMPLANTACAO[p.tipo]];
  if (p.tipo === 'TORRE') partes[0] += Math.abs(p.du) < 0.34 && Math.abs(p.dv) < 0.34 ? ' central' : ' deslocada';
  if (p.variante && ROTULO_DA_VARIANTE[p.variante]) partes[0] += ` (${ROTULO_DA_VARIANTE[p.variante]})`;
  partes.push(p.tipo === 'EMBASAMENTO_E_TORRE' ? `${hip.pavimentosDoEmbasamento} + ${p.pavimentos} pav` : `${p.pavimentos} pav`);
  partes.push(USA_COMPRIMENTO.has(p.tipo) ? `${f1(p.comprimentoMm / 1000)} × ${f1(p.profundidadeMm / 1000)} m` : `lâmina ${f1(p.profundidadeMm / 1000)} m`);
  if (p.garagem !== 'SEM_GARAGEM') partes.push(ROTULO_DO_ESTACIONAMENTO[p.garagem].replace(/ \(.*\)$/, ''));
  return partes.join(' · ');
}

/** Pavimentos da varredura: todos até 12; acima, uma grade que sempre inclui o teto. */
export function gradeDePavimentos(teto: number): number[] {
  if (teto <= 0) return [];
  if (teto <= 12) return Array.from({ length: teto }, (_, i) => i + 1);
  const s = new Set([1, 2, 3, 4, 5, 6, 8, 10, 12]);
  const passo = Math.max(3, Math.round(teto / 8));
  for (let n = 15; n < teto; n += passo) s.add(n);
  s.add(teto);
  return [...s].filter((n) => n <= teto).sort((a, b) => a - b);
}

function contar(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

export function gerarMassa(entrada: EntradaDoGeradorDeMassa, semente = 1, hipParcial: Partial<HipotesesDoGeradorDeMassa> = {}): ResultadoDoGeradorDeMassa {
  const hip: HipotesesDoGeradorDeMassa = { ...HIPOTESES_DO_GERADOR_DE_MASSA_PADRAO, ...hipParcial };
  const { model, regua, objetivo, restricoes } = entrada;
  const decisoes: string[] = [];
  const avisos: string[] = [];
  const vazio = (motivo: string): ResultadoDoGeradorDeMassa => ({ semente, objetivo, melhores: [], pareto: [], avaliados: 0, viaveis: 0, descartes: [], decisoes, avisos: [...avisos, motivo], quadro: null, levelId: null });

  const terreno = medirTerreno(divisasDoLote(model.boundaries));
  if (!terreno || terreno.anel.length < 3) return vazio('Sem lote: feche as divisas na aba Terreno — o gerador implanta dentro do envelope legal do lote.');
  const ladoDoLote = model.boundaries.find((b) => b.id === terreno.ladosIds[0]);
  const levelId = ladoDoLote?.levelId ?? model.levels[0]?.id ?? null;
  if (!levelId) return vazio('O estudo não tem pavimento.');

  const q = quadroDoLote(terreno, model.boundaries);
  const produto = regua.produto;
  const temUso = (u: string) => produto.tipologias.some((t) => t.uso === u && t.proporcaoPct > 0 && t.areaPrivativaM2 > 0);
  const z = regua.zona;
  const loteMm2 = terreno.areaMm2;
  const ctx: Contexto = {
    q,
    terreno,
    limites: model.boundaries,
    regua,
    hip,
    levelId,
    usoDasUnidades: temUso('RESIDENCIAL') || !temUso('COMERCIAL') ? 'RESIDENCIAL' : 'COMERCIAL',
    usoDoEmbasamento: temUso('COMERCIAL') ? 'COMERCIAL' : 'GARAGEM',
    implantacaoMaxMm2: restricoes.respeitarLei && z.taxaOcupacaoMaxPct != null ? (loteMm2 * z.taxaOcupacaoMaxPct) / 100 : null,
    retanguloDoLote: retanguloDoAnel(q, terreno.anel),
    cacheDeRetangulos: new Map(),
  };
  const rTerreo = retanguloNaAltura(ctx, hip.peDireitoMm, 1);
  if (!rTerreo) return vazio('O envelope legal do lote não comporta um bloco de 8 × 8 m: confira os recuos e as faixas restritas.');

  // Teto de pavimentos acima do solo.
  const tetos: { n: number; por: string }[] = [{ n: hip.pavimentosMax, por: 'pelo teto da varredura' }];
  if (restricoes.respeitarLei && z.gabaritoPavimentos != null) tetos.push({ n: z.gabaritoPavimentos, por: 'pelo gabarito em pavimentos' });
  if (restricoes.respeitarLei && z.gabaritoAlturaMaxM != null) tetos.push({ n: Math.floor((z.gabaritoAlturaMaxM * 1000 + 1) / hip.peDireitoMm), por: 'pelo gabarito em altura' });
  if (restricoes.pavimentosMax != null) tetos.push({ n: restricoes.pavimentosMax, por: 'pelo máximo pedido' });
  const teto = tetos.reduce((a, b) => (b.n < a.n ? b : a));
  const metaDeUnidades = restricoes.unidadesMin ?? produto.metaUnidades ?? null;

  const cacheDeVagas = new Map<string, number>();
  // O sol custa: só entra em CADA combinação quando o objetivo depende dele; os
  // melhores ganham os indicadores de sol no fim de qualquer jeito.
  const pesos = entrada.pesos ?? PESOS_PADRAO;
  const precisaSol = !!regua.insolacao && (objetivo === 'INSOLACAO' || (objetivo === 'PONDERADO' && pesos.insolacao > 0));
  const reguaComCache: ReguaDoComparador = { ...regua, cacheDeVagas, insolacao: precisaSol ? regua.insolacao : null };
  const base: BlueprintModel = { ...model, blocos: [] };
  const memo = new Map<string, { c: CandidatoDeMassa; medido: CenarioMedido } | null>();
  const descartes = new Map<string, number>();
  let avaliados = 0;

  const avaliar = (p: ParametrosDoCandidato): { c: CandidatoDeMassa; medido: CenarioMedido } | null => {
    const chave = chaveDe(p);
    if (memo.has(chave)) return memo.get(chave)!;
    const blocos = montar(ctx, p);
    if (!blocos) {
      memo.set(chave, null);
      return null;
    }
    const medido = medirCenarioDeMassa(modeloCom(base, levelId, blocos), reguaComCache);
    if (!medido) {
      memo.set(chave, null);
      return null;
    }
    avaliados++;
    const { cenario: c, massa, distribuicao } = medido;
    const motivos: string[] = [];
    if (restricoes.respeitarLei) {
      if (massa.ca.estado === 'EXCEDE') motivos.push('CA acima do máximo');
      if (massa.to.estado === 'EXCEDE') motivos.push('TO acima da máxima');
      if (massa.pisosAcimaDoGabarito > 0) motivos.push('acima do gabarito');
      if (massa.pisosForaDoEnvelope > 0) motivos.push('fora do envelope');
    }
    if (restricoes.pavimentosMax != null && c.pavimentosMax > restricoes.pavimentosMax) motivos.push('acima do máximo de pavimentos');
    if (produto.tipologias.length > 0 && c.unidades === 0) motivos.push('nenhuma unidade cabe');
    if (restricoes.atenderVagas && distribuicao && distribuicao.vagasFaltando > 0) motivos.push('faltam vagas');
    if (metaDeUnidades != null && c.unidades < metaDeUnidades) motivos.push('abaixo da meta de unidades');
    for (const m of motivos) contar(descartes, m);
    const cand: CandidatoDeMassa = { chave, parametros: p, rotulo: rotuloDe(p, hip), blocos, cenario: c, valor: null, viavel: motivos.length === 0, motivos };
    const r = { c: cand, medido };
    memo.set(chave, r);
    return r;
  };

  const garagensDe = (tipo: TipoDeImplantacao): Garagem[] => {
    if (hip.estacionamento !== 'AUTOMATICO') return [hip.estacionamento];
    return tipo === 'EMBASAMENTO_E_TORRE' ? ['SEM_GARAGEM', 'SUBSOLO_1', 'SUBSOLO_2'] : ['SEM_GARAGEM', 'PILOTIS', 'SUBSOLO_1', 'SUBSOLO_2'];
  };

  // ── 1. Grade exaustiva ──
  const tipos = hip.tipos.filter((t) => (TIPOS_DE_IMPLANTACAO as readonly string[]).includes(t));
  const profundidades = [...new Set(hip.profundidadesM.map((m) => Math.round(m * 2) / 2))].filter((m) => m >= LADO_MIN_MM / 1000).map((m) => m * 1000);
  const comprimentos = [...new Set(hip.comprimentosDaTorreM.map((m) => Math.round(m * 2) / 2))].filter((m) => m >= LADO_MIN_MM / 1000).map((m) => m * 1000);
  for (const tipo of tipos) {
    const tetoDoTipo = tipo === 'EMBASAMENTO_E_TORRE' ? teto.n - hip.pavimentosDoEmbasamento : teto.n;
    for (const prof of profundidades) {
      for (const comp of USA_COMPRIMENTO.has(tipo) ? comprimentos : [0]) {
        for (const n of gradeDePavimentos(tetoDoTipo)) {
          let estourouALei = false;
          for (const variante of precisaSol ? (VARIANTES[tipo] ?? [0]) : [0]) {
            for (const garagem of garagensDe(tipo)) {
              // Pilotis come um pavimento do gabarito: a torre desce um para caber.
              const nEf = garagem === 'PILOTIS' ? Math.min(n, tetoDoTipo - 1) : n;
              if (nEf < 1) continue;
              const r = avaliar({ tipo, profundidadeMm: prof, comprimentoMm: comp, pavimentos: nEf, garagem, du: 0, dv: 0, variante });
              if (!r) continue;
              if (r.c.motivos.some((m) => m === 'CA acima do máximo' || m === 'TO acima da máxima')) estourouALei = true;
              // Sem garagem e já viável: garagem só custaria — não precisa testar.
              if (garagem === 'SEM_GARAGEM' && r.c.viavel) break;
            }
          }
          // CA/TO só crescem com os pavimentos: os de cima também estouram.
          if (estourouALei) break;
        }
      }
    }
  }

  // ── 2. Valor do objetivo ──
  const todos = () => [...memo.values()].filter((x): x is { c: CandidatoDeMassa; medido: CenarioMedido } => !!x).map((x) => x.c);
  const viaveisDaGrade = todos().filter((c) => c.viavel);
  const faixas = objetivo === 'PONDERADO' ? faixasDe(viaveisDaGrade.map((c) => c.cenario)) : undefined;
  const opcoes = { metaDeUnidades, pesos, faixas };
  // Sol sem meta de unidades levaria ao prédio de 1 pavimento (o baixo é o que
  // mais vê sol): o objetivo vira "o máximo de sol mantendo 80 % das unidades
  // que o lote comporta na varredura" — e a decisão diz isso.
  const pisoDeUnidades = objetivo === 'INSOLACAO' && metaDeUnidades == null && viaveisDaGrade.length ? Math.ceil(0.8 * Math.max(...viaveisDaGrade.map((c) => c.cenario.unidades)) - 1e-9) : null;
  const MOTIVO_DO_PISO = 'abaixo de 80 % das unidades possíveis';
  const pontuar = (c: CandidatoDeMassa) => {
    c.valor = valorDoObjetivo(c.cenario, objetivo, opcoes);
    if (pisoDeUnidades != null && c.viavel && c.cenario.unidades < pisoDeUnidades) {
      c.viavel = false;
      c.motivos.push(MOTIVO_DO_PISO);
      contar(descartes, MOTIVO_DO_PISO);
    }
  };
  for (const c of todos()) pontuar(c);

  // ── 3. Refinamento semeado (recozimento) do melhor de cada tipo ──
  const rnd = prng(semente);
  const melhorPorTipo = (lista: CandidatoDeMassa[]) => {
    const m = new Map<TipoDeImplantacao, CandidatoDeMassa>();
    for (const c of [...lista].sort(compararCandidatos)) if (c.viavel && c.valor != null && !m.has(c.parametros.tipo)) m.set(c.parametros.tipo, c);
    return m;
  };
  const iniciais = melhorPorTipo(viaveisDaGrade.filter((c) => c.viavel));
  let melhoraram = 0;
  const passo500 = (v: number) => Math.round(v / 500) * 500;
  const vizinho = (p: ParametrosDoCandidato): ParametrosDoCandidato => {
    const v = { ...p };
    const opcoesDeMudanca = ['prof', 'pav'];
    if (USA_COMPRIMENTO.has(p.tipo)) opcoesDeMudanca.push('comp');
    if (p.tipo === 'TORRE') opcoesDeMudanca.push('du', 'dv');
    if (p.tipo === 'LAMINA') opcoesDeMudanca.push('dv');
    if (hip.estacionamento === 'AUTOMATICO') opcoesDeMudanca.push('gar');
    if (precisaSol && (VARIANTES[p.tipo]?.length ?? 0) > 1) opcoesDeMudanca.push('var');
    const o = opcoesDeMudanca[Math.floor(rnd() * opcoesDeMudanca.length)];
    const sinal = rnd() < 0.5 ? -1 : 1;
    const tetoDoTipo = p.tipo === 'EMBASAMENTO_E_TORRE' ? teto.n - hip.pavimentosDoEmbasamento : teto.n;
    if (o === 'prof') v.profundidadeMm = Math.min(30000, Math.max(LADO_MIN_MM, passo500(p.profundidadeMm + sinal * (500 + Math.floor(rnd() * 3) * 500))));
    else if (o === 'comp') v.comprimentoMm = Math.min(80000, Math.max(LADO_MIN_MM, passo500(p.comprimentoMm + sinal * (1000 + Math.floor(rnd() * 3) * 1000))));
    else if (o === 'pav') v.pavimentos = Math.min(Math.max(1, tetoDoTipo - (p.garagem === 'PILOTIS' ? 1 : 0)), Math.max(1, p.pavimentos + sinal));
    else if (o === 'du') v.du = Math.min(1, Math.max(-1, Math.round((p.du + sinal * 0.25) * 100) / 100));
    else if (o === 'dv') v.dv = Math.min(1, Math.max(-1, Math.round((p.dv + sinal * 0.25) * 100) / 100));
    else if (o === 'var') {
      const vs = VARIANTES[p.tipo]!;
      v.variante = vs[(vs.indexOf(p.variante) + (sinal > 0 ? 1 : vs.length - 1)) % vs.length];
    } else {
      const gs = garagensDe(p.tipo);
      v.garagem = gs[(gs.indexOf(p.garagem) + (sinal > 0 ? 1 : gs.length - 1)) % gs.length];
    }
    return v;
  };
  for (const inicial of iniciais.values()) {
    let atual = inicial;
    let melhor = inicial;
    const escala = Math.max(1e-6, Math.abs(inicial.valor ?? 1) * 0.02);
    for (let it = 0; it < hip.iteracoes; it++) {
      const r = avaliar(vizinho(atual.parametros));
      if (!r) continue;
      if (r.c.valor == null) pontuar(r.c);
      if (!r.c.viavel || r.c.valor == null) continue;
      const t = escala * (1 - it / Math.max(1, hip.iteracoes)) + 1e-9;
      const delta = r.c.valor - (atual.valor ?? -Infinity);
      if (delta >= 0 || rnd() < Math.exp(delta / t)) atual = r.c;
      if (compararCandidatos(r.c, melhor) < 0) melhor = r.c;
    }
    if (melhor !== inicial) melhoraram++;
  }

  // ── 4. Os melhores, um por tipo ──
  const finais = todos();
  for (const c of finais) if (c.valor == null && c.viavel) pontuar(c);
  const viaveis = finais.filter((c) => c.viavel);
  const melhores = [...melhorPorTipo(viaveis).values()].sort(compararCandidatos);
  // Os indicadores de sol dos melhores, mesmo quando o objetivo não dependia deles.
  if (regua.insolacao && !precisaSol) {
    for (const c of melhores) {
      const comSol = medirCenarioDeMassa(modeloCom(base, levelId, c.blocos), { ...regua, cacheDeVagas });
      if (comSol) c.cenario = { ...c.cenario, solNasFachadasH: comSol.cenario.solNasFachadasH, fachadaCriticaPct: comSol.cenario.fachadaCriticaPct, perdaDoVizinhoH: comSol.cenario.perdaDoVizinhoH };
    }
  }
  const pareto = frenteDeParetoDaMassa(melhores);

  // ── Decisões e avisos ──
  const W = rTerreo.x1 - rTerreo.x0;
  const D = rTerreo.y1 - rTerreo.y0;
  decisoes.push(
    `Lote de ${f1(loteMm2 / 1e6)} m²; ${q.frenteDeclarada ? 'quadro orientado pela divisa FRENTE (a rua)' : 'sem divisa FRENTE marcada: quadro alinhado ao desenho (marque a frente em Terreno › Dados do lote)'}.`,
    `Envelope no térreo: retângulo inscrito de ${f1(W / 1000)} × ${f1(D / 1000)} m, a ${MARGEM_MM / 10} cm da borda. Em lote irregular o retângulo perde as pontas — a implantação é conservadora.`,
    `Objetivo: ${ROTULO_DO_OBJETIVO[objetivo].toLowerCase()}${objetivo === 'MENOR_CUSTO' ? (metaDeUnidades != null ? ` com pelo menos ${metaDeUnidades} unidades` : ' por m² vendável (sem meta de unidades, o custo total levaria ao menor prédio)') : ''}${pisoDeUnidades != null ? ` mantendo pelo menos ${pisoDeUnidades} unidades (80 % do máximo da varredura — sem meta, o sol sozinho levaria ao prédio de 1 pavimento)` : ''}.`,
    `Restrições: ${[restricoes.respeitarLei ? 'CA, TO, gabarito e envelope por pavimento' : 'lei DESLIGADA (só o envelope do térreo)', restricoes.atenderVagas ? 'vagas exigidas atendidas' : 'vagas não exigidas', metaDeUnidades != null ? `mínimo de ${metaDeUnidades} unidades` : null].filter(Boolean).join('; ')}.`,
    `Pavimentos testados até ${teto.n} (limitados ${teto.por}); estacionamento: ${ROTULO_DO_ESTACIONAMENTO[hip.estacionamento].toLowerCase()}.`,
    `${avaliados} combinações medidas com a régua do estudo (${tipos.length} implantações × ${profundidades.length} profundidades × comprimentos × pavimentos × garagem); ${viaveis.length} viáveis.`,
    ...(regua.insolacao
      ? [
          `Sol de 21/06 a ${f1(regua.insolacao.latitudeGraus)}°, ${regua.insolacao.entorno.length} prisma(s) de vizinho declarado(s), mínimo de ${f1(regua.insolacao.minimaH)} h na fachada — ${precisaSol ? 'medido em cada combinação (o objetivo depende dele; L e U testados nas variantes espelhadas)' : 'medido só nas melhores, como indicador'}.`,
        ]
      : []),
    `Refinamento com a semente ${semente}: ${hip.iteracoes} passos de recozimento por implantação; ${melhoraram} de ${iniciais.size} melhoraram em relação à grade.`,
  );
  if (produto.tipologias.length === 0) avisos.push('O estudo não tem produto (Terreno › Massa › Produto): sem tipologias não há unidades nem dinheiro — só a massa se mede.');
  if (restricoes.respeitarLei && z.coeficienteMax == null) avisos.push('A zona não informa o coeficiente de aproveitamento: o potencial construtivo não limita a varredura.');
  if (restricoes.respeitarLei && z.taxaOcupacaoMaxPct == null) avisos.push('A zona não informa a taxa de ocupação: só o envelope limita a projeção.');
  if (restricoes.respeitarLei && z.gabaritoPavimentos == null && z.gabaritoAlturaMaxM == null) avisos.push(`A zona não informa gabarito: a varredura vai até ${hip.pavimentosMax} pavimentos.`);
  if (!restricoes.respeitarLei) avisos.push('A lei está DESLIGADA nas restrições: os cenários podem exceder CA, TO e gabarito.');
  if (viaveis.length > 0 && viaveis.every((c) => c.valor == null)) {
    avisos.push(
      objetivo === 'VGV' || objetivo === 'RESULTADO'
        ? 'Nenhum cenário tem VGV: as tipologias do produto estão sem preço/m². Preencha os preços ou escolha outro objetivo.'
        : objetivo === 'INSOLACAO' && !regua.insolacao
          ? 'O sol não foi informado ao gerador (latitude e norte do estudo): a insolação não se mede.'
        : 'O objetivo escolhido não se mede nestes cenários (falta custo ou unidades). Confira o produto ou escolha outro objetivo.',
    );
  }
  if (viaveis.length === 0 && avaliados > 0) {
    const top = [...descartes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    avisos.push(`Nenhuma combinação atende às restrições. Os motivos mais comuns: ${top.map(([m, n]) => `${m} (${n})`).join(', ')}.`);
  }
  if (objetivo === 'MENOR_GARAGEM' && !restricoes.atenderVagas) avisos.push('Minimizar o estacionamento sem exigir as vagas leva a cenários sem garagem.');

  return {
    semente,
    objetivo,
    melhores,
    pareto,
    avaliados,
    viaveis: viaveis.length,
    descartes: [...descartes.entries()].map(([motivo, quantos]) => ({ motivo, quantos })).sort((a, b) => b.quantos - a.quantos),
    decisoes,
    avisos,
    quadro: { larguraM: Math.round(W / 100) / 10, profundidadeM: Math.round(D / 100) / 10 },
    levelId,
  };
}

// ─── Aplicar ─────────────────────────────────────────────────────────────────

/** Os comandos que trocam os blocos do modelo pelos do candidato (um lote: Ctrl+Z desfaz). */
export function comandosDoCandidato(c: Pick<CandidatoDeMassa, 'blocos'>, model: BlueprintModel, levelId: ObjectId): Command[] {
  return [
    ...(model.blocos ?? []).map((b): Command => ({ type: 'DeleteBloco', blocoId: b.id })),
    ...c.blocos.map((b): Command => ({ type: 'AddBloco', levelId, nome: b.nome, pontos: b.pontos, cotaBaseMm: b.cotaBaseMm, pavimentos: b.pavimentos, peDireitoMm: b.peDireitoMm, uso: b.uso })),
  ];
}

/** O modelo com os blocos do candidato — o que vira a alternativa nova. */
export function modeloDoCandidato(c: Pick<CandidatoDeMassa, 'blocos'>, model: BlueprintModel, levelId: ObjectId): BlueprintModel {
  return applyBatch(model, comandosDoCandidato(c, model, levelId)).model;
}
