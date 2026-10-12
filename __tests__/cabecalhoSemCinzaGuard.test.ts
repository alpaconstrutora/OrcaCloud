/**
 * TRAVA — nenhum cabeçalho de tabela/grade em cinza (12/10/2026).
 *
 * Pedido do usuário (com print do cabeçalho do Gantt): *"Nenhum header deve estar na cor
 * cinza!"*. Plano: docs/planos/2026-10-12-cabecalhos-sem-cinza.md. O cabeçalho tem fundo BRANCO e
 * texto na cor do texto das células (`components/ui/cabecalhoDeTabela.ts`) — o usuário decidiu:
 * *"mesma cor do texto ja usada nas tabelas"*.
 *
 * É uma CATRACA, nos moldes de `orgContextGuard`: `BASELINE` é a dívida herdada de
 * 12/10/2026 (cabeçalho escrito à mão, fora do `StandardTable`) e SÓ PODE DIMINUIR.
 *   - arquivo fora do baseline com cabeçalho cinza = código novo = build quebrado;
 *   - arquivo do baseline com MAIS ocorrências que o registrado = build quebrado;
 *   - arquivo do baseline com MENOS ocorrências = o baseline está desatualizado: abaixe-o
 *     (assim a dívida paga não volta escondida atrás do número antigo).
 * NÃO adicione entrada ao BASELINE para "fazer passar": use `CABECALHO_TABELA`.
 *
 * O que conta como cabeçalho cinza (por linha de código, fora de comentário):
 *   - `<thead className=…bg-{gray|slate|zinc|neutral|stone}-N>`;
 *   - `<th className=…bg-{…}-N>`;
 *   - `<tr className=…>` com fundo `{…}-50|100|200` E sinal de cabeçalho
 *     (`uppercase`, `sticky`, `font-semibold|medium|bold`, `tracking-wide`).
 * Barras do Gantt, trilho de abas e barras de ferramentas NÃO são cabeçalho de tabela.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..');

const THEAD = /<thead\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-\d+/;
const TH = /<th\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-\d+/;
const TR = /<tr\b[^>]*className=(?:"[^"]*|\{`[^`]*)\bbg-(?:gray|slate|zinc|neutral|stone)-(?:50|100|200)\b[^"`]*\b(?:uppercase|sticky|font-semibold|font-medium|font-bold|tracking-wide)/;
const COMENTARIO = /^\s*(\/\/|\*|\{\/\*)/;

/** Dívida herdada de 12/10/2026 — só diminui. */
const BASELINE: Record<string, number> = {

};

function tsx(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return tsx(p);
        return n.endsWith('.tsx') ? [p] : [];
    });
}

export function contarCabecalhosCinza(texto: string): number {
    return texto.split('\n').filter((l) => !COMENTARIO.test(l) && (THEAD.test(l) || TH.test(l) || TR.test(l))).length;
}

const reais: Record<string, number> = {};
for (const f of tsx(join(RAIZ, 'components'))) {
    const n = contarCabecalhosCinza(readFileSync(f, 'utf-8'));
    if (n) reais[relative(RAIZ, f).split(sep).join('/')] = n;
}

describe('trava: nenhum cabeçalho de tabela em cinza', () => {
    it('detecta o padrão (a trava não está cega)', () => {
        expect(contarCabecalhosCinza('<thead className="bg-gray-50 text-gray-500">')).toBe(1);
        expect(contarCabecalhosCinza('<tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold">')).toBe(1);
        expect(contarCabecalhosCinza('<th className="px-4 bg-slate-100">')).toBe(1);
        expect(contarCabecalhosCinza('<thead className={`bg-zinc-50 ${x}`}>')).toBe(1);
    });

    it('não confunde com o que é permitido (cabeçalho azul, linha de dado zebrada, comentário)', () => {
        expect(contarCabecalhosCinza('<thead className="bg-white text-gray-700">')).toBe(0);
        expect(contarCabecalhosCinza('<tr className="hover:bg-gray-50 transition-colors">')).toBe(0);
        expect(contarCabecalhosCinza('// <thead className="bg-gray-50">')).toBe(0);
        expect(contarCabecalhosCinza('<tr className="bg-gray-50/50">')).toBe(0);
    });

    it('nenhum arquivo NOVO tem cabeçalho cinza, e nenhum do baseline piorou', () => {
        const piorou = Object.entries(reais)
            .filter(([f, n]) => n > (BASELINE[f] ?? 0))
            .map(([f, n]) => `${f}: ${n} (baseline ${BASELINE[f] ?? 0}) — use CABECALHO_TABELA de components/ui/cabecalhoDeTabela.ts`);
        expect(piorou).toEqual([]);
    });

    it('baseline sem número a mais: dívida paga sai do baseline (catraca)', () => {
        const desatualizado = Object.entries(BASELINE)
            .filter(([f, n]) => (reais[f] ?? 0) < n)
            .map(([f, n]) => `${f}: baseline ${n}, hoje ${reais[f] ?? 0} — abaixe/remova a entrada`);
        expect(desatualizado).toEqual([]);
    });
});
