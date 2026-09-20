/**
 * MOTOR DE FÓRMULAS (18/09/2026, roadmap E1.3: *"Fórmulas em parâmetros — P0"*).
 *
 * ─── O QUE É, E O QUE NÃO É ─────────────────────────────────────────────────
 *
 * Um avaliador de expressões PURO e DETERMINÍSTICO, escrito aqui em vez de
 * `eval`/`new Function` por três razões: a fórmula vem do banco (texto de
 * usuário — `eval` seria XSS de fórmula), o resultado tem de ser o mesmo em
 * qualquer navegador e em qualquer versão de JS, e a mensagem de erro tem de
 * ser em português e apontar a coluna.
 *
 * Gramática (precedência da menor para a maior):
 *
 *   expr   := ou
 *   ou     := e ( ("ou" | "||") e )*
 *   e      := nao ( ("e" | "&&") nao )*
 *   nao    := ("nao" | "não" | "!") nao | comp
 *   comp   := soma ( ("<" | "<=" | ">" | ">=" | "==" | "=" | "!=" | "<>") soma )?
 *   soma   := termo ( ("+" | "-") termo )*
 *   termo  := unario ( ("*" | "/" | "%") unario )*
 *   unario := "-" unario | pot
 *   pot    := atomo ( "^" unario )?
 *   atomo  := número | "texto" | identificador | identificador "(" args ")" | "(" expr ")"
 *
 * Número aceita vírgula OU ponto decimal ("0,15" e "0.15"). Identificador é
 * `[a-z_][a-z0-9_]*` com pontos ("pavimento.pe_direito"). Funções: se(c, a, b),
 * min, max, abs, arred(x, casas=0), piso, teto, raiz, pot(x, y), texto(x),
 * numero(x), vazio(x). Comparação entre textos é de igualdade; entre número e
 * texto é erro. Divisão por zero é erro, nunca Infinity.
 *
 * ─── VARIÁVEIS ──────────────────────────────────────────────────────────────
 *
 * Quem avalia entrega as variáveis (`variaveisDaPeca` monta as nativas da
 * família em METROS/m²/m³ e mais as `*_mm`, e soma os parâmetros gravados da
 * peça). Variável desconhecida é erro — nunca zero silencioso: "area * custo_m2"
 * com `custo_m2` ausente tem de acusar, não devolver 0 no orçamento.
 *
 * ─── DERIVADO, NUNCA GRAVADO ────────────────────────────────────────────────
 *
 * O resultado de uma fórmula é LEITURA (`avaliarDefinicoes`), como `spaces`:
 * mudar a geometria muda o valor na hora, e gravá-lo no payload faria o
 * snapshot discordar de si mesmo. Fórmula pode citar outra fórmula; a ordem é
 * resolvida por dependência, e ciclo é erro nas duas pontas.
 */
import type { Agua, BlueprintModel, Escada, Opening, Parametros, Quadro, Structural, Terminal, Trecho, ValorDeParametro, Wall } from './blueprintKernel';
import { polygonArea, wallLength, type FamiliaComParametros } from './blueprintKernel';

export type Valor = ValorDeParametro;
export type Variaveis = Record<string, Valor>;

export class ErroDeFormula extends Error {
  constructor(
    mensagem: string,
    /** Coluna (1-based) onde o problema começa; 0 quando é semântico. */
    public readonly coluna: number,
  ) {
    super(mensagem);
    this.name = 'ErroDeFormula';
  }
}

// ─── Léxico ──────────────────────────────────────────────────────────────────

type Token =
  | { t: 'num'; v: number; c: number }
  | { t: 'str'; v: string; c: number }
  | { t: 'id'; v: string; c: number }
  | { t: 'op'; v: string; c: number }
  | { t: 'fim'; c: number };

const OPS3 = ['<=>'];
const OPS2 = ['<=', '>=', '==', '!=', '<>', '&&', '||'];
const OPS1 = ['+', '-', '*', '/', '%', '^', '(', ')', ',', '<', '>', '=', '!'];

function lexar(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const c = i + 1;
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if ((src[j] === '.' || src[j] === ',') && /[0-9]/.test(src[j + 1] ?? '')) {
        j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      const texto = src.slice(i, j).replace(',', '.');
      tokens.push({ t: 'num', v: Number(texto), c });
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const fecha = src.indexOf(ch, i + 1);
      if (fecha < 0) throw new ErroDeFormula('Texto sem fechar as aspas', c);
      tokens.push({ t: 'str', v: src.slice(i + 1, fecha), c });
      i = fecha + 1;
      continue;
    }
    if (/[a-zA-Z_À-ſ]/.test(ch)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_.À-ſ]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j).toLowerCase(), c });
      i = j;
      continue;
    }
    const tres = src.slice(i, i + 3);
    const dois = src.slice(i, i + 2);
    if (OPS3.includes(tres)) {
      tokens.push({ t: 'op', v: tres, c });
      i += 3;
      continue;
    }
    if (OPS2.includes(dois)) {
      tokens.push({ t: 'op', v: dois, c });
      i += 2;
      continue;
    }
    if (OPS1.includes(ch)) {
      tokens.push({ t: 'op', v: ch, c });
      i++;
      continue;
    }
    throw new ErroDeFormula(`Caractere inesperado "${ch}"`, c);
  }
  tokens.push({ t: 'fim', c: n + 1 });
  return tokens;
}

// ─── Sintaxe (AST) ───────────────────────────────────────────────────────────

export type No =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'var'; nome: string; c: number }
  | { k: 'un'; op: '-' | '!'; a: No; c: number }
  | { k: 'bin'; op: string; a: No; b: No; c: number }
  | { k: 'fn'; nome: string; args: No[]; c: number };

const PALAVRA_OU = new Set(['ou']);
const PALAVRA_E = new Set(['e']);
const PALAVRA_NAO = new Set(['nao', 'não']);
const CONSTANTES: Record<string, Valor> = { verdadeiro: true, falso: false, sim: true, nao_: false, pi: Math.PI };

export function parsear(src: string): No {
  const toks = lexar(src);
  let p = 0;
  const olhar = () => toks[p];
  const comer = () => toks[p++];
  const ehOp = (v: string) => olhar().t === 'op' && (olhar() as { v: string }).v === v;
  const ehPalavra = (set: Set<string>) => olhar().t === 'id' && set.has((olhar() as { v: string }).v);

  function ou(): No {
    let a = e();
    while (ehOp('||') || ehPalavra(PALAVRA_OU)) {
      const c = comer().c;
      a = { k: 'bin', op: 'ou', a, b: e(), c };
    }
    return a;
  }
  function e(): No {
    let a = nao();
    while (ehOp('&&') || ehPalavra(PALAVRA_E)) {
      const c = comer().c;
      a = { k: 'bin', op: 'e', a, b: nao(), c };
    }
    return a;
  }
  function nao(): No {
    if (ehOp('!') || ehPalavra(PALAVRA_NAO)) {
      const c = comer().c;
      return { k: 'un', op: '!', a: nao(), c };
    }
    return comp();
  }
  function comp(): No {
    const a = soma();
    const t = olhar();
    if (t.t === 'op' && ['<', '<=', '>', '>=', '==', '=', '!=', '<>'].includes(t.v)) {
      comer();
      const op = t.v === '=' ? '==' : t.v === '<>' ? '!=' : t.v;
      return { k: 'bin', op, a, b: soma(), c: t.c };
    }
    return a;
  }
  function soma(): No {
    let a = termo();
    while (ehOp('+') || ehOp('-')) {
      const t = comer() as { v: string; c: number };
      a = { k: 'bin', op: t.v, a, b: termo(), c: t.c };
    }
    return a;
  }
  function termo(): No {
    let a = unario();
    while (ehOp('*') || ehOp('/') || ehOp('%')) {
      const t = comer() as { v: string; c: number };
      a = { k: 'bin', op: t.v, a, b: unario(), c: t.c };
    }
    return a;
  }
  function unario(): No {
    if (ehOp('-')) {
      const c = comer().c;
      return { k: 'un', op: '-', a: unario(), c };
    }
    return pot();
  }
  function pot(): No {
    const a = atomo();
    if (ehOp('^')) {
      const c = comer().c;
      return { k: 'bin', op: '^', a, b: unario(), c };
    }
    return a;
  }
  function atomo(): No {
    const t = comer();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'id') {
      if (ehOp('(')) {
        comer();
        const args: No[] = [];
        if (!ehOp(')')) {
          args.push(ou());
          while (ehOp(',')) {
            comer();
            args.push(ou());
          }
        }
        if (!ehOp(')')) throw new ErroDeFormula(`Faltou ")" fechando ${t.v}(`, olhar().c);
        comer();
        return { k: 'fn', nome: t.v, args, c: t.c };
      }
      return { k: 'var', nome: t.v, c: t.c };
    }
    if (t.t === 'op' && t.v === '(') {
      const dentro = ou();
      if (!ehOp(')')) throw new ErroDeFormula('Faltou ")"', olhar().c);
      comer();
      return dentro;
    }
    if (t.t === 'fim') throw new ErroDeFormula('A fórmula terminou antes da hora', t.c);
    throw new ErroDeFormula(`Inesperado "${(t as { v: string }).v}"`, t.c);
  }

  const raiz = ou();
  const sobra = olhar();
  if (sobra.t !== 'fim') throw new ErroDeFormula(`Sobrou "${(sobra as { v: unknown }).v}" no fim`, sobra.c);
  return raiz;
}

// ─── Avaliação ───────────────────────────────────────────────────────────────

const num = (v: Valor, c: number, onde: string): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new ErroDeFormula(`${onde} precisa de número, veio texto "${v}"`, c);
};
const bool = (v: Valor): boolean => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : v !== '');

const FUNCOES: Record<string, (args: Valor[], c: number) => Valor> = {
  se: (a, c) => {
    if (a.length !== 3) throw new ErroDeFormula('se(condição, se_sim, se_não) pede 3 argumentos', c);
    return bool(a[0]) ? a[1] : a[2];
  },
  min: (a, c) => Math.min(...a.map((v) => num(v, c, 'min'))),
  max: (a, c) => Math.max(...a.map((v) => num(v, c, 'max'))),
  abs: (a, c) => Math.abs(num(a[0], c, 'abs')),
  arred: (a, c) => {
    const casas = a.length > 1 ? Math.trunc(num(a[1], c, 'arred')) : 0;
    const f = 10 ** casas;
    return Math.round(num(a[0], c, 'arred') * f) / f;
  },
  piso: (a, c) => Math.floor(num(a[0], c, 'piso')),
  teto: (a, c) => Math.ceil(num(a[0], c, 'teto')),
  raiz: (a, c) => {
    const x = num(a[0], c, 'raiz');
    if (x < 0) throw new ErroDeFormula('raiz de número negativo', c);
    return Math.sqrt(x);
  },
  pot: (a, c) => num(a[0], c, 'pot') ** num(a[1], c, 'pot'),
  texto: (a) => (typeof a[0] === 'boolean' ? (a[0] ? 'sim' : 'não') : String(a[0])),
  numero: (a, c) => {
    const n = typeof a[0] === 'string' ? Number(a[0].replace(',', '.')) : num(a[0], c, 'numero');
    if (!Number.isFinite(n)) throw new ErroDeFormula(`"${a[0]}" não é número`, c);
    return n;
  },
  vazio: (a) => a[0] === '' || a[0] === undefined,
};

export function avaliarNo(no: No, vars: Variaveis): Valor {
  switch (no.k) {
    case 'num':
      return no.v;
    case 'str':
      return no.v;
    case 'var': {
      if (no.nome in vars) return vars[no.nome];
      if (no.nome in CONSTANTES) return CONSTANTES[no.nome];
      throw new ErroDeFormula(`Variável desconhecida "${no.nome}"`, no.c);
    }
    case 'un': {
      const a = avaliarNo(no.a, vars);
      return no.op === '-' ? -num(a, no.c, 'o sinal') : !bool(a);
    }
    case 'fn': {
      const f = FUNCOES[no.nome];
      if (!f) throw new ErroDeFormula(`Função desconhecida "${no.nome}"`, no.c);
      return f(no.args.map((x) => avaliarNo(x, vars)), no.c);
    }
    case 'bin': {
      if (no.op === 'e') return bool(avaliarNo(no.a, vars)) && bool(avaliarNo(no.b, vars));
      if (no.op === 'ou') return bool(avaliarNo(no.a, vars)) || bool(avaliarNo(no.b, vars));
      const a = avaliarNo(no.a, vars);
      const b = avaliarNo(no.b, vars);
      if (no.op === '==') return a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);
      if (no.op === '!=') return !(a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9));
      if (no.op === '+' && (typeof a === 'string' || typeof b === 'string')) return `${a}${b}`;
      const x = num(a, no.c, `o operador ${no.op}`);
      const y = num(b, no.c, `o operador ${no.op}`);
      switch (no.op) {
        case '+':
          return x + y;
        case '-':
          return x - y;
        case '*':
          return x * y;
        case '/':
          if (y === 0) throw new ErroDeFormula('Divisão por zero', no.c);
          return x / y;
        case '%':
          if (y === 0) throw new ErroDeFormula('Resto de divisão por zero', no.c);
          return x % y;
        case '^':
          return x ** y;
        case '<':
          return x < y;
        case '<=':
          return x <= y;
        case '>':
          return x > y;
        case '>=':
          return x >= y;
      }
      throw new ErroDeFormula(`Operador desconhecido "${no.op}"`, no.c);
    }
  }
}

/** Avalia a fórmula com as variáveis dadas. Lança `ErroDeFormula`. */
export function avaliar(formula: string, vars: Variaveis): Valor {
  const v = avaliarNo(parsear(formula), vars);
  if (typeof v === 'number' && !Number.isFinite(v)) throw new ErroDeFormula('Resultado não é um número finito', 0);
  return v;
}

/** Só a sintaxe — para o campo de fórmula acusar enquanto se digita. `null` = ok. */
export function erroDeSintaxe(formula: string): string | null {
  try {
    parsear(formula);
    return null;
  } catch (e) {
    return e instanceof ErroDeFormula ? `${e.message} (col. ${e.coluna})` : String(e);
  }
}

/** As variáveis que a fórmula cita (para ordenar dependências e listar o que falta). */
export function variaveisCitadas(formula: string): string[] {
  const saida = new Set<string>();
  const visitar = (no: No) => {
    if (no.k === 'var') saida.add(no.nome);
    else if (no.k === 'un') visitar(no.a);
    else if (no.k === 'bin') (visitar(no.a), visitar(no.b));
    else if (no.k === 'fn') no.args.forEach(visitar);
  };
  try {
    visitar(parsear(formula));
  } catch {
    /* sintaxe inválida: sem variáveis */
  }
  return [...saida].sort();
}

// ─── Variáveis nativas por família ───────────────────────────────────────────

const m = (mm: number) => mm / 1000;

/** Nome e unidade de cada variável nativa, por família — a ajuda do campo de fórmula lê daqui. */
export const VARIAVEIS_NATIVAS: Record<FamiliaComParametros, { nome: string; unidade: string }[]> = {
  wall: [
    { nome: 'comprimento', unidade: 'm' }, { nome: 'espessura', unidade: 'm' }, { nome: 'altura', unidade: 'm' },
    { nome: 'area', unidade: 'm² (uma face, bruta)' }, { nome: 'volume', unidade: 'm³ (bruto)' },
  ],
  opening: [
    { nome: 'largura', unidade: 'm' }, { nome: 'altura', unidade: 'm' }, { nome: 'peitoril', unidade: 'm' }, { nome: 'area', unidade: 'm²' },
    { nome: 'tipo', unidade: 'texto: porta, janela, correr, vao' },
  ],
  structural: [
    { nome: 'largura', unidade: 'm' }, { nome: 'profundidade', unidade: 'm' }, { nome: 'altura', unidade: 'm' }, { nome: 'base', unidade: 'm (cota da face inferior)' },
    { nome: 'comprimento', unidade: 'm (viga)' }, { nome: 'area', unidade: 'm² (laje)' }, { nome: 'volume', unidade: 'm³ (bruto)' }, { nome: 'tipo', unidade: 'texto: pilar, viga, laje, …' },
  ],
  roof: [{ nome: 'inclinacao_pct', unidade: '%' }, { nome: 'base', unidade: 'm' }, { nome: 'espessura', unidade: 'm' }, { nome: 'area', unidade: 'm² (em planta)' }],
  stair: [{ nome: 'largura', unidade: 'm' }, { nome: 'comprimento', unidade: 'm (percurso)' }, { nome: 'tipo', unidade: 'texto: escada, rampa' }],
  trecho: [{ nome: 'comprimento', unidade: 'm (3D)' }, { nome: 'bitola_mm', unidade: 'mm' }, { nome: 'cota_a', unidade: 'm' }, { nome: 'cota_b', unidade: 'm' }, { nome: 'disciplina', unidade: 'texto' }],
  terminal: [{ nome: 'cota', unidade: 'm' }, { nome: 'potencia_va', unidade: 'VA' }, { nome: 'largura', unidade: 'm' }, { nome: 'altura', unidade: 'm' }, { nome: 'profundidade', unidade: 'm' }, { nome: 'volume_l', unidade: 'L' }, { nome: 'disciplina', unidade: 'texto' }, { nome: 'tipo', unidade: 'texto' }],
  quadro: [{ nome: 'cota', unidade: 'm' }, { nome: 'largura', unidade: 'm' }, { nome: 'altura', unidade: 'm' }, { nome: 'profundidade', unidade: 'm' }, { nome: 'tensao_v', unidade: 'V' }],
};

/** As comuns a toda peça com pavimento. */
export const VARIAVEIS_DO_PAVIMENTO = [
  { nome: 'pavimento.pe_direito', unidade: 'm' },
  { nome: 'pavimento.cota', unidade: 'm' },
  { nome: 'pavimento.nome', unidade: 'texto' },
];

function comLengths(base: Variaveis): Variaveis {
  // Toda variável em metros ganha a irmã em milímetros: "largura_mm".
  const saida: Variaveis = { ...base };
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === 'number' && ['comprimento', 'espessura', 'altura', 'largura', 'profundidade', 'peitoril', 'base', 'cota', 'cota_a', 'cota_b'].includes(k)) {
      saida[`${k}_mm`] = Math.round(v * 1000);
    }
  }
  return saida;
}

export type Peca =
  | { familia: 'wall'; peca: Wall }
  | { familia: 'opening'; peca: Opening }
  | { familia: 'structural'; peca: Structural }
  | { familia: 'roof'; peca: Agua }
  | { familia: 'stair'; peca: Escada }
  | { familia: 'trecho'; peca: Trecho }
  | { familia: 'terminal'; peca: Terminal }
  | { familia: 'quadro'; peca: Quadro };

/** As variáveis nativas da peça + as do pavimento + os parâmetros GRAVADOS dela. */
export function variaveisDaPeca(model: BlueprintModel, alvo: Peca): Variaveis {
  let v: Variaveis = {};
  let levelId: string | null = null;
  switch (alvo.familia) {
    case 'wall': {
      const w = alvo.peca;
      const comp = m(wallLength(w));
      v = { comprimento: comp, espessura: m(w.thicknessMm), altura: m(w.heightMm), area: comp * m(w.heightMm), volume: comp * m(w.heightMm) * m(w.thicknessMm) };
      levelId = w.levelId;
      break;
    }
    case 'opening': {
      const o = alvo.peca;
      v = { largura: m(o.widthMm), altura: m(o.heightMm), peitoril: m(o.sillMm), area: m(o.widthMm) * m(o.heightMm), tipo: o.kind === 'door' ? 'porta' : o.kind === 'window' ? 'janela' : o.kind === 'sliding' ? 'correr' : 'vao' };
      levelId = model.walls.find((w) => w.id === o.wallId)?.levelId ?? null;
      break;
    }
    case 'structural': {
      const s = alvo.peca;
      const comp = s.pontos.length >= 2 ? m(Math.hypot(s.pontos[1].x - s.pontos[0].x, s.pontos[1].y - s.pontos[0].y)) : 0;
      const areaLaje = s.pontos.length >= 3 ? Math.abs(polygonArea(s.pontos)) / 1e6 : 0;
      const volume = s.pontos.length >= 3 ? areaLaje * m(s.alturaMm) : s.pontos.length === 2 ? m(s.larguraMm) * m(s.alturaMm) * comp : m(s.larguraMm) * m(s.circular ? s.larguraMm : s.profundidadeMm) * m(s.alturaMm);
      v = { largura: m(s.larguraMm), profundidade: m(s.profundidadeMm), altura: m(s.alturaMm), base: m(s.baseMm), comprimento: comp, area: areaLaje, volume, tipo: s.kind.toLowerCase() };
      levelId = s.levelId;
      break;
    }
    case 'roof': {
      const r = alvo.peca;
      v = { inclinacao_pct: r.inclinacaoPct, base: m(r.baseMm), espessura: m(r.espessuraMm), area: Math.abs(polygonArea(r.pontos)) / 1e6 };
      levelId = r.levelId;
      break;
    }
    case 'stair': {
      const e = alvo.peca;
      let comp = 0;
      for (let i = 1; i < e.pontos.length; i++) comp += Math.hypot(e.pontos[i].x - e.pontos[i - 1].x, e.pontos[i].y - e.pontos[i - 1].y);
      v = { largura: m(e.larguraMm), comprimento: m(comp), tipo: e.tipo.toLowerCase() };
      levelId = e.levelId;
      break;
    }
    case 'trecho': {
      const t = alvo.peca;
      const comp = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, t.cotaBMm - t.cotaAMm);
      v = { comprimento: m(comp), bitola_mm: t.bitolaMm, cota_a: m(t.cotaAMm), cota_b: m(t.cotaBMm), disciplina: t.disciplina.toLowerCase() };
      levelId = t.levelId;
      break;
    }
    case 'terminal': {
      const t = alvo.peca;
      v = { cota: m(t.cotaMm), potencia_va: t.potenciaW ?? 0, largura: m(t.larguraMm ?? 0), altura: m(t.alturaMm ?? 0), profundidade: m(t.profundidadeMm ?? 0), volume_l: t.volumeL ?? 0, disciplina: t.disciplina.toLowerCase(), tipo: (t.tipoHidraulico ?? t.tipoEletrico ?? t.tipo).toLowerCase() };
      levelId = t.levelId;
      break;
    }
    case 'quadro': {
      const q = alvo.peca;
      v = { cota: m(q.cotaMm), largura: m(q.larguraMm ?? 0), altura: m(q.alturaMm ?? 0), profundidade: m(q.profundidadeMm ?? 0), tensao_v: q.tensaoV ?? 0 };
      levelId = q.levelId;
      break;
    }
  }
  const nivel = levelId ? model.levels.find((l) => l.id === levelId) : undefined;
  if (nivel) {
    v['pavimento.pe_direito'] = m(nivel.defaultHeightMm);
    v['pavimento.cota'] = m(nivel.elevationMm);
    v['pavimento.nome'] = nivel.name;
  }
  const comMm = comLengths(v);
  // Os parâmetros gravados entram por cima das nativas? NÃO: nativa vence, para
  // "area" continuar sendo a área da peça mesmo que alguém grave um parâmetro
  // "area". O gravado com nome livre entra normalmente.
  const gravados = (alvo.peca as { parametros?: Parametros }).parametros ?? {};
  return { ...gravados, ...comMm };
}

// ─── Definições com fórmula, em ordem de dependência ─────────────────────────

export interface DefinicaoAvaliavel {
  chave: string;
  formula: string;
}
export type ResultadoDeFormula = { chave: string; valor: Valor; erro: null } | { chave: string; valor: null; erro: string };

/**
 * Avalia as definições com fórmula para UMA peça: cada resultado vira variável
 * para as seguintes (ordem por dependência; ciclo é erro em todas as chaves do
 * ciclo). Definição sem fórmula é ignorada — é valor digitado.
 */
export function avaliarDefinicoes(definicoes: DefinicaoAvaliavel[], vars: Variaveis): ResultadoDeFormula[] {
  const comFormula = definicoes.filter((d) => d.formula.trim() !== '');
  const porChave = new Map(comFormula.map((d) => [d.chave, d]));
  const deps = new Map(comFormula.map((d) => [d.chave, variaveisCitadas(d.formula).filter((x) => porChave.has(x) && x !== d.chave)]));
  const estado = new Map<string, 'visitando' | 'pronto'>();
  const ordem: string[] = [];
  const emCiclo = new Set<string>();
  const visitar = (chave: string, trilha: string[]) => {
    const st = estado.get(chave);
    if (st === 'pronto') return;
    if (st === 'visitando') {
      for (const k of trilha.slice(trilha.indexOf(chave))) emCiclo.add(k);
      return;
    }
    estado.set(chave, 'visitando');
    for (const d of deps.get(chave) ?? []) visitar(d, [...trilha, chave]);
    estado.set(chave, 'pronto');
    ordem.push(chave);
  };
  for (const d of comFormula) visitar(d.chave, []);

  const ambiente: Variaveis = { ...vars };
  const saida = new Map<string, ResultadoDeFormula>();
  for (const chave of ordem) {
    const d = porChave.get(chave)!;
    if (emCiclo.has(chave)) {
      saida.set(chave, { chave, valor: null, erro: 'Fórmulas em ciclo (uma depende da outra)' });
      continue;
    }
    try {
      const valor = avaliar(d.formula, ambiente);
      ambiente[chave] = valor;
      saida.set(chave, { chave, valor, erro: null });
    } catch (e) {
      saida.set(chave, { chave, valor: null, erro: e instanceof ErroDeFormula ? (e.coluna ? `${e.message} (col. ${e.coluna})` : e.message) : String(e) });
    }
  }
  // Na ordem das definições, como a tela lista.
  return comFormula.map((d) => saida.get(d.chave)!);
}

/** Formata um valor para a tela: número com vírgula e até 4 casas, sim/não, texto cru. */
export function formatarValor(v: Valor): string {
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number') {
    const arred = Math.round(v * 10000) / 10000;
    return String(arred).replace('.', ',');
  }
  return v;
}

// ─── Calculados do modelo inteiro (E1.5): o que sai no IFC, na planilha e na ficha ──

export interface DefinicaoComFamilia extends DefinicaoAvaliavel {
  /** `null` = todas as famílias. */
  familia: FamiliaComParametros | null;
}

/** Todas as peças com parâmetros, com a chave da família — um lugar só para as oito listas. */
export function pecasComParametros(model: BlueprintModel): Peca[] {
  return [
    ...model.walls.map((peca): Peca => ({ familia: 'wall', peca })),
    ...model.openings.map((peca): Peca => ({ familia: 'opening', peca })),
    ...(model.structures ?? []).map((peca): Peca => ({ familia: 'structural', peca })),
    ...(model.roofs ?? []).map((peca): Peca => ({ familia: 'roof', peca })),
    ...(model.stairs ?? []).map((peca): Peca => ({ familia: 'stair', peca })),
    ...(model.trechos ?? []).map((peca): Peca => ({ familia: 'trecho', peca })),
    ...(model.terminais ?? []).map((peca): Peca => ({ familia: 'terminal', peca })),
    ...(model.quadros ?? []).map((peca): Peca => ({ familia: 'quadro', peca })),
  ];
}

/**
 * Os valores CALCULADOS por fórmula, por uid de peça — só os que avaliaram
 * sem erro. É o que as saídas (IFC, planilha) e a ficha consomem; o painel
 * mostra também os erros, por isso usa `avaliarDefinicoes` direto.
 */
/**
 * FILTRO `compartilhado` NAS SAÍDAS (20/09/2026, backlog P2 — P2.5). A
 * definição marcada como NÃO compartilhada é uso interno da organização: o
 * valor fica na peça e na tela, mas NÃO sai no IFC nem na planilha. Chave sem
 * definição (o desenho publicado é o que vale, não o catálogo) continua saindo.
 */
export function chavesPrivadas(definicoes: readonly { chave: string; compartilhado?: boolean }[]): Set<string> {
  return new Set(definicoes.filter((d) => d.compartilhado === false).map((d) => d.chave));
}

/** Os parâmetros sem as chaves privadas; `undefined` quando não sobra nenhum. */
export function semChavesPrivadas<T extends Record<string, unknown>>(p: T | undefined, privadas: ReadonlySet<string>): T | undefined {
  if (!p || privadas.size === 0) return p;
  const saida: Record<string, unknown> = {};
  for (const k of Object.keys(p)) if (!privadas.has(k)) saida[k] = p[k];
  return Object.keys(saida).length > 0 ? (saida as T) : undefined;
}

export function parametrosCalculadosDoModelo(model: BlueprintModel, definicoes: readonly DefinicaoComFamilia[]): Map<string, Record<string, Valor>> {
  const saida = new Map<string, Record<string, Valor>>();
  const comFormula = definicoes.filter((d) => d.formula.trim() !== '');
  if (comFormula.length === 0) return saida;
  for (const alvo of pecasComParametros(model)) {
    const defs = comFormula.filter((d) => d.familia === null || d.familia === alvo.familia);
    if (defs.length === 0) continue;
    const r = avaliarDefinicoes(defs, variaveisDaPeca(model, alvo));
    const ok = r.filter((x) => x.erro === null && x.valor !== null);
    if (ok.length === 0) continue;
    saida.set(alvo.peca.uid, Object.fromEntries(ok.map((x) => [x.chave, x.valor as Valor])));
  }
  return saida;
}
