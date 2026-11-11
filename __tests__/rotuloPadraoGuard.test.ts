/**
 * TRAVA — rótulo de campo num estilo só (§21), 11/11/2026.
 *
 * Depois de tirar a caixa alta (#348, `rotuloSemCaixaAltaGuard`), a Nova cotação ficou com dois
 * estilos de rótulo no mesmo formulário: o §21 (`text-xs font-semibold text-slate-500`) e o antigo
 * `text-sm font-medium text-gray-700`. O usuário pediu para padronizar: 548 rótulos em ~100 arquivos
 * (`text-sm font-medium text-gray-700`, `text-xs font-bold text-gray-600`, `text-form-label …`).
 *
 * Conta `<label>` de CAMPO cuja classe — o texto do className MAIS as constantes de string do próprio
 * arquivo que ele cita — tem tipografia (tamanho, peso ou cor cinza) e não é o §21. Não conta:
 *   - rótulo que envolve `<input>`/checkbox/radio/`<select>`/`<textarea>` — é texto de OPÇÃO;
 *   - `cursor-pointer` (botão de upload feito com label) e `sr-only`;
 *   - rótulo sem nenhuma classe de tipografia (herda do bloco onde está);
 *   - `text-xs font-semibold` com cor de DESTAQUE (painel colorido: `text-emerald-700`…).
 * Fora da contagem (vocabulário próprio): os mesmos de `rotuloSemCaixaAltaGuard`.
 *
 * É uma CATRACA: `BASELINE` só pode diminuir. NÃO adicione entrada para "fazer passar": use
 * `text-xs font-semibold text-slate-500` (guia §21).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..');

const CONSTANTE = /(?:const|let)\s+([A-Za-z_]\w*)\s*(?::\s*string\s*)?=\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)/g;
const TEXTO = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;
const OPCAO = /<input|<Checkbox|<Switch|<Toggle|type="checkbox"|type="radio"|<select|<textarea/;
const TAMANHO = /^text-(xs|sm|base|lg|form-label|\[\d+(\.\d+)?px\])$/;
const PESO = /^font-(thin|light|normal|medium|semibold|bold|extrabold|black)$/;
const NEUTRO = /^text-(gray|slate|zinc|neutral|stone)-\d+$/;
const DESTAQUE = /^text-[a-z]+-\d{2,3}$/;

const FORA = [
    'components/public/',
    'components/investor/portal/',
    'components/supplier/portal/',
    'components/sindico/',
    'components/portal/',
    'components/p2p/',
    'components/partner/PartnerPortalFinanceiro.tsx',
    'components/broker/BrokerCommissions.tsx',
    'components/ui/CartaoRecibo.tsx',
];

/** Tag de abertura a partir de `<label…`: até o `>` fora de `{}` e de aspas. */
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

function foraDoPadrao(classe: string): boolean {
    const toks = classe.split(/\s+/).filter(Boolean);
    if (toks.includes('cursor-pointer') || toks.includes('sr-only')) return false;
    if (!toks.some((t) => TAMANHO.test(t) || PESO.test(t) || NEUTRO.test(t))) return false;
    const cor = toks.includes('text-slate-500') || toks.some((t) => DESTAQUE.test(t) && !NEUTRO.test(t));
    const outros = toks.filter((t) => (TAMANHO.test(t) || PESO.test(t)) && t !== 'text-xs' && t !== 'font-semibold');
    return !(toks.includes('text-xs') && toks.includes('font-semibold') && cor && outros.length === 0);
}

/** Cada rótulo de campo fora do §21: a linha dele. */
export function rotulosForaDoPadrao(texto: string): number[] {
    const limpo = semComentarios(texto);
    const constantes = new Map<string, string>();
    for (const c of limpo.matchAll(CONSTANTE)) constantes.set(c[1], c[2] ?? c[3] ?? c[4] ?? '');
    const out: number[] = [];
    for (const m of limpo.matchAll(/<label\b/g)) {
        const inicio = m.index ?? 0;
        const tag = tagDeAbertura(limpo, inicio);
        if (tag.trimEnd().endsWith('/>')) continue;
        const fim = limpo.indexOf('</label>', inicio);
        const corpo = limpo.slice(inicio + tag.length, fim > 0 ? fim : inicio + tag.length);
        if (OPCAO.test(corpo)) continue;
        if (foraDoPadrao(classeResolvida(tag, constantes))) out.push(limpo.slice(0, inicio).split('\n').length);
    }
    return out;
}

/** Ficou de fora DE PROPÓSITO em 11/11/2026 — só diminui. */
const BASELINE: Record<string, number> = {
    'components/InvestorDashboard.tsx': 1, // PORTAL  trecho isPublicExperience (§24)
    'components/SupplierDashboard.tsx': 3, // PORTAL  drillPanelLabel muda de cor no portal (§24)
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
    const rel = relative(RAIZ, f).split(sep).join('/');
    if (FORA.some((p) => rel.startsWith(p))) continue;
    const linhas = rotulosForaDoPadrao(readFileSync(f, 'utf-8'));
    if (!linhas.length) continue;
    reais[rel] = linhas.length;
    onde[rel] = linhas.map((l) => `l.${l}`).join(', ');
}

describe('trava: rótulo de campo num estilo só (§21)', () => {
    it('detecta o caso real que originou a trava (Nova cotação)', () => {
        expect(rotulosForaDoPadrao('<label className="block text-sm font-medium text-gray-700 mb-1">Título da Cotação</label>')).toEqual([1]);
    });

    it('lê a constante local do className', () => {
        const arquivo = `const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
<label className={LABEL}>A</label>
<label className={\`\${LABEL} flex\`}>B</label>`;
        expect(rotulosForaDoPadrao(arquivo)).toEqual([2, 3]);
    });

    it('não confunde com o permitido (§21, destaque, opção, botão, herdado, sr-only)', () => {
        expect(rotulosForaDoPadrao('<label className="block text-xs font-semibold text-slate-500 mb-1.5">Nome</label>')).toEqual([]);
        expect(rotulosForaDoPadrao('<label className="text-xs font-semibold text-emerald-700">Comissão</label>')).toEqual([]);
        expect(rotulosForaDoPadrao('<label className="flex gap-2 text-sm text-gray-700"><input type="checkbox" /> Ativo</label>')).toEqual([]);
        expect(rotulosForaDoPadrao('<label className="text-sm font-bold cursor-pointer">Enviar arquivo</label>')).toEqual([]);
        expect(rotulosForaDoPadrao('<label className="flex items-center gap-1.5">X</label>')).toEqual([]);
        expect(rotulosForaDoPadrao('<label className="sr-only text-sm">Buscar</label>')).toEqual([]);
    });

    it('nenhum arquivo NOVO tem rótulo de campo fora do §21, e nenhum do baseline piorou', () => {
        const piorou = Object.entries(reais)
            .filter(([f, n]) => n > (BASELINE[f] ?? 0))
            .map(([f, n]) => `${f}: ${n} (baseline ${BASELINE[f] ?? 0}) [${onde[f]}] — rótulo text-xs font-semibold text-slate-500 (guia §21)`);
        expect(piorou).toEqual([]);
    });

    it('baseline sem número a mais: dívida paga sai do baseline (catraca)', () => {
        const desatualizado = Object.entries(BASELINE)
            .filter(([f, n]) => (reais[f] ?? 0) < n)
            .map(([f, n]) => `${f}: baseline ${n}, hoje ${reais[f] ?? 0} — abaixe/remova a entrada`);
        expect(desatualizado).toEqual([]);
    });
});
