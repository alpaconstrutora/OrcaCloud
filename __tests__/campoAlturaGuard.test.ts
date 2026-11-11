/**
 * TRAVA — campo de formulário com altura fixa h-9 (10/11/2026).
 *
 * Pedido do usuário (print de Gerenciar Negociação ao lado do Pedido de Compra): *"existe uma
 * diferença entre as alturas dos campos"*. A Negociação usa `h-9` (36px, guia §16/§30); o Pedido
 * usava `p-2.5` sem altura (~46px). A varredura achou 1.344 campos assim em 194 arquivos — foram
 * migrados nos PRs #334, #337, #338, #340, #342, #343, #344 e #345.
 *
 * Conta (por elemento, na tag de abertura, inclusive multi-linha) `<input>`, `<select>` e
 * `<MoneyCentsInput>` cuja classe — o texto do className MAIS as constantes de string do próprio
 * arquivo que ele cita (`className={inputCls}`, `${inputCls}`, `inputCls + '…'`) — tem padding
 * vertical `py-2`…`py-4` / `p-2`…`p-4` e NENHUMA altura fixa (`h-*`). Não conta:
 *   - `checkbox`/`radio`/`hidden`/`file`/`range`/`color`;
 *   - campo dentro de célula de tabela (`<td>` aberto antes dele) — §7.1 tem régua própria;
 *   - `<textarea>` (várias linhas: usa a constante irmã `...Area`, com padding).
 * Limites conhecidos: constante importada de outro arquivo e componente que embrulha <input>
 * (além do MoneyCentsInput) não são lidos.
 *
 * É uma CATRACA: `BASELINE` é o que ficou de fora de propósito e SÓ PODE DIMINUIR. NÃO adicione
 * entrada para "fazer passar": use `h-9` (campo de formulário/toolbar) — ver guia §16/§30.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..');

const ABERTURA = /<(input|select|MoneyCentsInput)\b/g;
const TIPOS_FORA = new Set(['checkbox', 'radio', 'hidden', 'file', 'range', 'color']);
const CONSTANTE = /(?:const|let)\s+([A-Za-z_]\w*)\s*(?::\s*string\s*)?=\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)/g;
const PADDING_VERTICAL = /(?<![\w:[-])(?:p|py)-(2|2\.5|3|3\.5|4)(?![\w.])/;
const ALTURA_FIXA = /(?<![\w:-])h-(?:\d+(?:\.\d+)?|\[[^\]]+\])(?![\w-])/;
const TEXTO = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;

/** Tag de abertura a partir de `<input…`: até o `>` fora de `{}` e de aspas. */
function tagDeAbertura(texto: string, inicio: number): string {
    let chaves = 0;
    let aspas: string | null = null;
    for (let i = inicio + 1; i < texto.length; i++) {
        const c = texto[i];
        if (aspas) {
            if (c === '\\') { i++; continue; }
            if (c === aspas) aspas = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') aspas = c;
        else if (c === '{') chaves++;
        else if (c === '}') chaves--;
        else if (c === '>' && chaves === 0) return texto.slice(inicio, i + 1);
    }
    return texto.slice(inicio);
}

/** Apaga comentários mantendo as quebras de linha (o nº da linha do achado continua certo). */
function semComentarios(texto: string): string {
    const soQuebras = (s: string) => s.replace(/[^\n]/g, '');
    return texto
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, soQuebras)
        .replace(/(?<=^|[\s{;,(])\/\*[\s\S]*?\*\//g, soQuebras)
        .split('\n')
        .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, '')))
        .join('\n');
}

/** Texto do className da tag + o valor das constantes locais que ele cita. */
function classeResolvida(tag: string, constantes: Map<string, string>): string {
    const m = /className=/.exec(tag);
    if (!m) return '';
    const resto = tag.slice(m.index + m[0].length);
    let expr = '';
    if (resto.startsWith('"')) expr = resto.slice(0, resto.indexOf('"', 1) + 1);
    else if (resto.startsWith('{')) {
        let n = 0;
        for (let i = 0; i < resto.length; i++) {
            if (resto[i] === '{') n++;
            else if (resto[i] === '}' && --n === 0) { expr = resto.slice(0, i + 1); break; }
        }
    }
    const literais = [...expr.matchAll(TEXTO)].map((t) => t[1] ?? t[2] ?? t[3] ?? '');
    const codigo = expr.replace(TEXTO, ' ') + ' ' + [...expr.matchAll(/\$\{([^}]*)\}/g)].map((t) => t[1]).join(' ');
    const citadas = [...codigo.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((t) => constantes.get(t[1]) ?? '');
    return [...literais, ...citadas].join(' ');
}

/** Cada campo de formulário sem altura fixa e com padding vertical: a linha dele. */
export function camposSemAltura(texto: string): number[] {
    const limpo = semComentarios(texto);
    const constantes = new Map<string, string>();
    for (const c of limpo.matchAll(CONSTANTE)) constantes.set(c[1], c[2] ?? c[3] ?? c[4] ?? '');
    const out: number[] = [];
    for (const m of limpo.matchAll(ABERTURA)) {
        const inicio = m.index ?? 0;
        const tag = tagDeAbertura(limpo, inicio);
        const tipo = /type=["'{]+(\w+)/.exec(tag)?.[1];
        if (tipo && TIPOS_FORA.has(tipo)) continue;
        const antes = limpo.slice(Math.max(0, inicio - 3000), inicio);
        if (antes.lastIndexOf('<td') > antes.lastIndexOf('</td>')) continue;
        const classe = classeResolvida(tag, constantes);
        if (PADDING_VERTICAL.test(classe) && !ALTURA_FIXA.test(classe)) {
            out.push(limpo.slice(0, inicio).split('\n').length);
        }
    }
    return out;
}

/**
 * Ficou de fora DE PROPÓSITO em 10/11/2026 — só diminui:
 *   DESTAQUE  número grande (`text-lg`+) de painel/calculadora, não campo de formulário comum.
 *   PUBLICO   tela fora do app (login, senha, página pública) — decisão pendente do usuário.
 */
const BASELINE: Record<string, number> = {
    'components/LaborEncargos.tsx': 1,                  // DESTAQUE  salário bruto da calculadora de encargos
    'components/PricingIntelligenceModal.tsx': 1,       // DESTAQUE  preço-alvo da inteligência de preços
    'components/investor/InvestmentSimulator.tsx': 1,   // DESTAQUE  valor do aporte no simulador
    'components/Auth.tsx': 2,                           // PUBLICO   login
    'components/ResetPassword.tsx': 3,                  // PUBLICO   redefinição de senha
    'components/public/PublicOpportunityDetail.tsx': 3, // PUBLICO   página pública de oportunidade
};

function tsx(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return tsx(p);
        return n.endsWith('.tsx') ? [p] : [];
    });
}

const reais: Record<string, number> = {};
const onde: Record<string, string> = {};
for (const f of tsx(join(RAIZ, 'components'))) {
    const linhas = camposSemAltura(readFileSync(f, 'utf-8'));
    if (!linhas.length) continue;
    const rel = relative(RAIZ, f).split(sep).join('/');
    reais[rel] = linhas.length;
    onde[rel] = linhas.map((l) => `l.${l}`).join(', ');
}

describe('trava: campo de formulário com altura fixa (h-9)', () => {
    it('detecta o caso real que originou a trava (Pedido de Compra)', () => {
        expect(camposSemAltura('<select className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 outline-none bg-white">')).toEqual([1]);
    });

    it('lê a constante local do className (direto, em template e concatenada)', () => {
        const arquivo = `const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm';
<input className={inputCls} />
<input className={\`\${inputCls} pl-9\`} />
<select className={inputCls + ' pr-8'}>`;
        expect(camposSemAltura(arquivo)).toEqual([2, 3, 4]);
    });

    it('não confunde com o permitido (h-9, textarea, checkbox, célula, comentário, py-1)', () => {
        expect(camposSemAltura('<input className="w-full h-9 px-3 py-2 text-sm" />')).toEqual([]);
        expect(camposSemAltura('<textarea className="w-full px-3 py-2.5" />')).toEqual([]);
        expect(camposSemAltura('<input type="checkbox" className="p-2" />')).toEqual([]);
        expect(camposSemAltura('<td className="px-6"><input className="px-2 py-2" /></td>')).toEqual([]);
        expect(camposSemAltura('{/* <input className="py-3" /> */}')).toEqual([]);
        expect(camposSemAltura('<input className="w-full px-2 py-1 text-sm" />')).toEqual([]);
        expect(camposSemAltura('<inputGroup className="py-3" />')).toEqual([]);
    });

    it('nenhum arquivo NOVO tem campo sem altura fixa, e nenhum do baseline piorou', () => {
        const piorou = Object.entries(reais)
            .filter(([f, n]) => n > (BASELINE[f] ?? 0))
            .map(([f, n]) => `${f}: ${n} (baseline ${BASELINE[f] ?? 0}) [${onde[f]}] — campo de formulário em h-9 rounded-[6px] (guia §16/§30)`);
        expect(piorou).toEqual([]);
    });

    it('baseline sem número a mais: dívida paga sai do baseline (catraca)', () => {
        const desatualizado = Object.entries(BASELINE)
            .filter(([f, n]) => (reais[f] ?? 0) < n)
            .map(([f, n]) => `${f}: baseline ${n}, hoje ${reais[f] ?? 0} — abaixe/remova a entrada`);
        expect(desatualizado).toEqual([]);
    });
});
