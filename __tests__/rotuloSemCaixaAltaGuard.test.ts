/**
 * TRAVA — rótulo de campo e título sem caixa alta (11/11/2026).
 *
 * Depois da padronização da altura dos campos (`campoAlturaGuard`), a mesma varredura achou 470
 * `<label>` e 293 títulos (`<h2>`/`<h3>`/`<h4>`) com `uppercase` — o estilo "gritado" que o guia
 * §21 deprecou (ex.: "CONDIÇÃO DE PAGAMENTO" na Nova cotação). Rótulo virou
 * `text-xs font-semibold text-slate-500`; título só perdeu `uppercase`/`tracking-*` (o peso fica).
 *
 * Conta (por elemento, na tag de abertura, inclusive multi-linha) `<label>`, `<h2>`, `<h3>` e
 * `<h4>` cuja classe — o texto do className MAIS as constantes de string do próprio arquivo que ele
 * cita — tem `uppercase`. Comentário não conta.
 *
 * Fora da contagem (vocabulário próprio documentado): portais externos §24, páginas públicas,
 * biblioteca das Torres (§31, `components/p2p/`) e o cartão-recibo (`ui/CartaoRecibo`).
 *
 * É uma CATRACA: `BASELINE` é o que ficou de fora de propósito e SÓ PODE DIMINUIR. NÃO adicione
 * entrada para "fazer passar": escreva o texto em capitalização normal, sem `uppercase` — guia §21.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..');

const ABERTURA = /<(label|h2|h3|h4)\b/g;
const CONSTANTE = /(?:const|let)\s+([A-Za-z_]\w*)\s*(?::\s*string\s*)?=\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)/g;
const CAIXA_ALTA = /(?<![\w:-])uppercase(?![\w-])/;
const TEXTO = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;

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

/** Cada rótulo/título com `uppercase`: a linha dele. */
export function rotulosEmCaixaAlta(texto: string): number[] {
    const limpo = semComentarios(texto);
    const constantes = new Map<string, string>();
    for (const c of limpo.matchAll(CONSTANTE)) constantes.set(c[1], c[2] ?? c[3] ?? c[4] ?? '');
    const out: number[] = [];
    for (const m of limpo.matchAll(ABERTURA)) {
        const inicio = m.index ?? 0;
        if (CAIXA_ALTA.test(classeResolvida(tagDeAbertura(limpo, inicio), constantes))) {
            out.push(limpo.slice(0, inicio).split('\n').length);
        }
    }
    return out;
}

/**
 * Ficou de fora DE PROPÓSITO em 11/11/2026 — só diminui:
 *   IMPRESSAO  relatório montado para imprimir/PDF.
 *   PLANTA     cabeçalho de seção dos painéis laterais da Planta (vocabulário de CAD, à parte).
 *   PORTAL     tela que serve o app E o portal externo (§24) pela mesma classe/variável.
 */
const BASELINE: Record<string, number> = {
    'components/DiaryReportViewer.tsx': 8,                   // IMPRESSAO  relatório do diário
    'components/InvestorDashboard.tsx': 1,                   // PORTAL     trecho isPublicExperience
    'components/ReportViewer.tsx': 4,                        // IMPRESSAO  folha do relatório de orçamento (cabeçalho do documento)
    'components/SupplierDashboard.tsx': 5,                   // PORTAL     drillPanelLabel muda de cor no portal
    'components/blueprint/PainelComposicoesDePeca.tsx': 1,   // PLANTA
    'components/blueprint/PainelConjuntoDePranchas.tsx': 1,  // PLANTA
    'components/blueprint/PainelDepartamentos.tsx': 2,       // PLANTA
    'components/blueprint/PainelEtapas.tsx': 1,              // PLANTA
    'components/blueprint/PainelGrupoDeFundacao.tsx': 1,     // PLANTA
    'components/blueprint/PainelKitsDeInsercao.tsx': 1,      // PLANTA
    'components/blueprint/PainelLod.tsx': 2,                 // PLANTA
    'components/blueprint/PainelMedicoes.tsx': 2,            // PLANTA
    'components/blueprint/PainelOrcamento.tsx': 1,           // PLANTA
    'components/blueprint/PainelParedeSelecionada.tsx': 2,   // PLANTA
    'components/blueprint/PainelPlugin.tsx': 2,              // PLANTA
    'components/blueprint/PainelQuadroSelecionado.tsx': 1,   // PLANTA
    'components/blueprint/PainelRodapes.tsx': 2,             // PLANTA
    'components/blueprint/PainelSelecaoMultipla.tsx': 1,     // PLANTA
    'components/blueprint/PainelTerreno.tsx': 2,             // PLANTA
    'components/blueprint/PainelTrechoSelecionado.tsx': 2,   // PLANTA
    'components/blueprint/PainelVersoes.tsx': 7,             // PLANTA
    'components/blueprint/SecaoNbr12721DaVersao.tsx': 1,     // PLANTA
    'components/blueprint/TelaTabelas.tsx': 1,               // PLANTA
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
    const linhas = rotulosEmCaixaAlta(readFileSync(f, 'utf-8'));
    if (!linhas.length) continue;
    reais[rel] = linhas.length;
    onde[rel] = linhas.map((l) => `l.${l}`).join(', ');
}

describe('trava: rótulo de campo e título sem caixa alta (§21)', () => {
    it('detecta o caso real que originou a trava (Nova cotação)', () => {
        expect(rotulosEmCaixaAlta('<label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Condição de Pagamento</label>')).toEqual([1]);
        expect(rotulosEmCaixaAlta('<h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Dados</h3>')).toEqual([1]);
    });

    it('lê a constante local do className (direto e em template)', () => {
        const arquivo = `const labelCls = 'block text-xs font-bold uppercase text-gray-400';
<label className={labelCls}>A</label>
<label
  className={\`\${labelCls} mb-1\`}>B</label>`;
        expect(rotulosEmCaixaAlta(arquivo)).toEqual([2, 3]);
    });

    it('não confunde com o permitido (rótulo §21, outra tag, comentário, normal-case)', () => {
        expect(rotulosEmCaixaAlta('<label className="block text-xs font-semibold text-slate-500">Nome</label>')).toEqual([]);
        expect(rotulosEmCaixaAlta('<p className="text-xs uppercase">KPI</p>')).toEqual([]);
        expect(rotulosEmCaixaAlta('<h1 className="uppercase">Marca</h1>')).toEqual([]);
        expect(rotulosEmCaixaAlta('{/* <label className="uppercase">X</label> */}')).toEqual([]);
        expect(rotulosEmCaixaAlta('<label className="normal-case">X</label>')).toEqual([]);
        expect(rotulosEmCaixaAlta('<labelGroup className="uppercase" />')).toEqual([]);
    });

    it('nenhum arquivo NOVO tem rótulo/título em caixa alta, e nenhum do baseline piorou', () => {
        const piorou = Object.entries(reais)
            .filter(([f, n]) => n > (BASELINE[f] ?? 0))
            .map(([f, n]) => `${f}: ${n} (baseline ${BASELINE[f] ?? 0}) [${onde[f]}] — rótulo text-xs font-semibold text-slate-500, título sem uppercase (guia §21)`);
        expect(piorou).toEqual([]);
    });

    it('baseline sem número a mais: dívida paga sai do baseline (catraca)', () => {
        const desatualizado = Object.entries(BASELINE)
            .filter(([f, n]) => (reais[f] ?? 0) < n)
            .map(([f, n]) => `${f}: baseline ${n}, hoje ${reais[f] ?? 0} — abaixe/remova a entrada`);
        expect(desatualizado).toEqual([]);
    });
});
