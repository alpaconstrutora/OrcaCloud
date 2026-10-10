/**
 * Condições dos blocos condicionais do modelo (F6 — "regras condicionais nos
 * modelos" da Fase 3). PURO e sem `eval`: um analisador pequeno para uma
 * linguagem pequena, escrita por quem monta o modelo.
 *
 *   destinatario.tipo = "Órgão público"
 *   contrato.saldo_a_pagar > 0 e obra.cno preenchido
 *   não (documento.em_resposta_a vazio)
 *   contrato.status = "Ativo" ou contrato.status = "Em andamento"
 *
 * Gramática:
 *   expr    := ou
 *   ou      := e ("ou" e)*
 *   e       := nao ("e" nao)*
 *   nao     := "não" nao | atomo
 *   atomo   := "(" expr ")" | termo (op termo | "preenchido" | "vazio")?
 *   op      := "=" | "!=" | "<>" | ">" | "<" | ">=" | "<=" | "contém"
 *   termo   := variável (a.b) | "texto" | número
 *
 * Variável vale o texto já resolvido do documento. Comparação com `>`/`<` é
 * numérica e entende "R$ 1.250.000,00", "35%" e "-3"; `=` compara texto sem
 * diferenciar maiúsculas nem espaços nas pontas. Um termo sozinho é verdadeiro
 * quando preenchido.
 */

export type Valores = Record<string, string | undefined>;

type No =
    | { t: 'ou' | 'e'; a: No; b: No }
    | { t: 'nao'; a: No }
    | { t: 'cmp'; op: string; a: Termo; b: Termo }
    | { t: 'teste'; teste: 'preenchido' | 'vazio'; a: Termo };

type Termo = { t: 'var'; chave: string } | { t: 'lit'; valor: string };

export class ErroDeCondicao extends Error {}

interface Token { tipo: 'pal' | 'str' | 'num' | 'op' | 'abre' | 'fecha'; v: string; pos: number }

const PALAVRAS = new Set(['e', 'ou', 'não', 'nao', 'preenchido', 'vazio', 'contém', 'contem']);

function tokenizar(src: string): Token[] {
    const out: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '(') { out.push({ tipo: 'abre', v: c, pos: i++ }); continue; }
        if (c === ')') { out.push({ tipo: 'fecha', v: c, pos: i++ }); continue; }
        if (c === '"' || c === '\'') {
            const fim = src.indexOf(c, i + 1);
            if (fim < 0) throw new ErroDeCondicao(`Aspas sem fechar na posição ${i + 1}.`);
            out.push({ tipo: 'str', v: src.slice(i + 1, fim), pos: i });
            i = fim + 1;
            continue;
        }
        const op = /^(>=|<=|!=|<>|=|>|<)/.exec(src.slice(i));
        if (op) { out.push({ tipo: 'op', v: op[1] === '<>' ? '!=' : op[1], pos: i }); i += op[1].length; continue; }
        const num = /^-?\d+(?:[.,]\d+)*/.exec(src.slice(i));
        if (num && !/[\p{L}_]/u.test(src[i + num[0].length] ?? '')) { out.push({ tipo: 'num', v: num[0], pos: i }); i += num[0].length; continue; }
        const pal = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(src.slice(i));
        if (pal) { out.push({ tipo: 'pal', v: pal[0], pos: i }); i += pal[0].length; continue; }
        throw new ErroDeCondicao(`Caractere inesperado "${c}" na posição ${i + 1}.`);
    }
    return out;
}

/** Analisa a expressão. Lança `ErroDeCondicao` com a explicação. */
export function analisar(expressao: string): No {
    const toks = tokenizar(expressao);
    if (!toks.length) throw new ErroDeCondicao('Condição vazia.');
    let k = 0;
    const olha = () => toks[k];
    const eh = (v: string) => { const t = toks[k]; return !!t && t.tipo === 'pal' && t.v.toLowerCase() === v; };

    const termo = (): Termo => {
        const t = toks[k++];
        if (!t) throw new ErroDeCondicao('A condição terminou no meio — falta um valor.');
        if (t.tipo === 'str' || t.tipo === 'num') return { t: 'lit', valor: t.v };
        if (t.tipo === 'pal' && !PALAVRAS.has(t.v.toLowerCase())) return { t: 'var', chave: t.v };
        throw new ErroDeCondicao(`Esperava uma variável, um texto entre aspas ou um número na posição ${t.pos + 1}.`);
    };

    const atomo = (): No => {
        const t = olha();
        if (t?.tipo === 'abre') {
            k++;
            const dentro = ou();
            if (olha()?.tipo !== 'fecha') throw new ErroDeCondicao('Parêntese sem fechar.');
            k++;
            return dentro;
        }
        const a = termo();
        if (eh('preenchido') || eh('vazio')) {
            const teste = toks[k++].v.toLowerCase() as 'preenchido' | 'vazio';
            return { t: 'teste', teste, a };
        }
        const o = olha();
        if (o?.tipo === 'op') { k++; return { t: 'cmp', op: o.v, a, b: termo() }; }
        if (eh('contém') || eh('contem')) { k++; return { t: 'cmp', op: 'contém', a, b: termo() }; }
        return { t: 'teste', teste: 'preenchido', a };
    };

    const nao = (): No => {
        if (eh('não') || eh('nao')) { k++; return { t: 'nao', a: nao() }; }
        return atomo();
    };
    const e = (): No => {
        let a = nao();
        while (eh('e')) { k++; a = { t: 'e', a, b: nao() }; }
        return a;
    };
    const ou = (): No => {
        let a = e();
        while (eh('ou')) { k++; a = { t: 'ou', a, b: e() }; }
        return a;
    };

    const raiz = ou();
    if (k < toks.length) throw new ErroDeCondicao(`Sobrou "${toks[k].v}" na posição ${toks[k].pos + 1} — use "e"/"ou" entre as partes.`);
    return raiz;
}

/** "R$ 1.250.000,00" → 1250000; "35%" → 35; "3.5" → 3.5. NaN quando não é número. */
export function numeroBr(texto: string | undefined): number {
    const s = (texto ?? '').replace(/[R$\s%]/g, '').trim();
    if (!s) return NaN;
    // Com vírgula: padrão brasileiro (ponto de milhar). Sem vírgula e com mais de um ponto: milhar.
    const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : (s.split('.').length > 2 ? s.replace(/\./g, '') : s);
    return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

const normal = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

function valorDo(t: Termo, v: Valores): string {
    return t.t === 'lit' ? t.valor : (v[t.chave] ?? '').trim();
}

function avaliarNo(n: No, v: Valores): boolean {
    switch (n.t) {
        case 'ou': return avaliarNo(n.a, v) || avaliarNo(n.b, v);
        case 'e': return avaliarNo(n.a, v) && avaliarNo(n.b, v);
        case 'nao': return !avaliarNo(n.a, v);
        case 'teste': {
            const cheio = valorDo(n.a, v) !== '';
            return n.teste === 'preenchido' ? cheio : !cheio;
        }
        case 'cmp': {
            const a = valorDo(n.a, v), b = valorDo(n.b, v);
            if (n.op === 'contém') return normal(a).includes(normal(b));
            if (n.op === '=' || n.op === '!=') {
                const na = numeroBr(a), nb = numeroBr(b);
                const igual = !isNaN(na) && !isNaN(nb) ? na === nb : normal(a) === normal(b);
                return n.op === '=' ? igual : !igual;
            }
            const na = numeroBr(a), nb = numeroBr(b);
            if (isNaN(na) || isNaN(nb)) return false;     // sem número, a comparação não vale
            if (n.op === '>') return na > nb;
            if (n.op === '<') return na < nb;
            if (n.op === '>=') return na >= nb;
            return na <= nb;
        }
    }
}

export interface ResultadoCondicao { valor: boolean; erro: string | null }

/** Avalia; expressão inválida → `{ valor: false, erro }` (o bloco não entra e a tela explica). */
export function avaliarCondicao(expressao: string, valores: Valores): ResultadoCondicao {
    try {
        return { valor: avaliarNo(analisar(expressao), valores), erro: null };
    } catch (e) {
        return { valor: false, erro: e instanceof Error ? e.message : 'Condição inválida.' };
    }
}

/** Variáveis citadas na condição (para serem resolvidas antes de avaliar). Inválida → []. */
export function chavesDaCondicao(expressao: string): string[] {
    try {
        const out = new Set<string>();
        const visita = (n: No) => {
            if (n.t === 'ou' || n.t === 'e') { visita(n.a); visita(n.b); return; }
            if (n.t === 'nao') { visita(n.a); return; }
            if (n.a.t === 'var') out.add(n.a.chave);
            if (n.t === 'cmp' && n.b.t === 'var') out.add(n.b.chave);
        };
        visita(analisar(expressao));
        return [...out];
    } catch {
        return [];
    }
}

/** Erro de sintaxe da condição, ou null. */
export function erroDaCondicao(expressao: string): string | null {
    try { analisar(expressao); return null; } catch (e) { return e instanceof Error ? e.message : 'Condição inválida.'; }
}
