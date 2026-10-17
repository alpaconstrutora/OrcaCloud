/**
 * TRAVA — valor de campo nunca em cinza-claro (17/10/2026).
 *
 * Pedido do usuário (print do Número do Contrato em Suprimentos › Contratos): *"mais uma
 * vez voltamos ao tema do texto cinza"*. O número automático é `readOnly` e o VALOR saía em
 * `text-gray-400` — o olho lê como placeholder vazio. Plano:
 * docs/planos/2026-10-17-recibo-contrato-objeto-itens.md · guia §32.
 *
 * Escopo: `<input>` e `<textarea>`. Neles a cor do texto pinta o VALOR; o vazio tem o
 * `placeholder:` próprio. Exceção que o texto não separa: cinza no ramo VAZIO de um ternário
 * (pinta só o placeholder) — esses casos estão no BASELINE marcados `VAZIO`.
 * `<select>` fica FORA: o §7.1 do guia documenta o cinza do estado VAZIO (opção "Selecione…"),
 * e por texto não dá para separar o ramo vazio do preenchido.
 *
 * Conta (por elemento, na tag de abertura, inclusive multi-linha):
 *   - `text-{gray|slate|zinc|neutral|stone}-{300|400}` sem variante, ou com `disabled:` /
 *     `read-only:` (campo travado continua mostrando um valor);
 *   - NÃO conta `placeholder:`, `hover:`, `focus:` etc. nem comentário.
 * Também `<MoneyCentsInput>` (repassa o className ao <input>). Limites conhecidos: className vindo
 * de constante (`className={CAMPO}`) e outros componentes que embrulham <input> não são lidos.
 *
 * É uma CATRACA, como `cabecalhoSemCinzaGuard`: `BASELINE` é a dívida herdada de 17/10/2026
 * e SÓ PODE DIMINUIR. NÃO adicione entrada para "fazer passar": use `text-gray-900` no valor.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = join(__dirname, '..');

// `MoneyCentsInput` repassa o className ao <input> (186 usos): o preço travado do BudgetRow escapava.
const ABERTURA = /<(input|textarea|MoneyCentsInput)\b/g;
const CINZA = /(^|[\s"'`{(])((?:[a-z-]+:)*)text-(?:gray|slate|zinc|neutral|stone)-(?:300|400)(?![\w-])/g;
const VARIANTES_DE_VALOR = new Set(['disabled', 'read-only']);

/** Tag de abertura a partir de `<input…`/`<textarea…`: até o `>` fora de `{}` e de aspas. */
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
    // `/*` só abre comentário depois de espaço/`{`/`;`/`,`/`(` — `accept="image/*"` não é comentário.
    // `//` de fim de linha só depois de espaço e seguido de espaço — `https://` não é comentário.
    return texto
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, soQuebras)
        .replace(/(?<=^|[\s{;,(])\/\*[\s\S]*?\*\//g, soQuebras)
        .split('\n')
        .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, '')))
        .join('\n');
}

/** Cada `<input>`/`<textarea>` que pinta o valor de cinza-claro: linha + classes culpadas. */
export function achadosDeValorCinza(texto: string): { linha: number; classes: string[] }[] {
    const limpo = semComentarios(texto);
    const out: { linha: number; classes: string[] }[] = [];
    for (const m of limpo.matchAll(ABERTURA)) {
        const inicio = m.index ?? 0;
        const tag = tagDeAbertura(limpo, inicio);
        const classes = [...tag.matchAll(CINZA)]
            .filter((c) => c[2].split(':').filter(Boolean).every((v) => VARIANTES_DE_VALOR.has(v)))
            .map((c) => c[0].replace(/^[\s"'`{(]/, ''));
        if (classes.length) out.push({ linha: limpo.slice(0, inicio).split('\n').length, classes });
    }
    return out;
}

export function contarValoresCinza(texto: string): number {
    return achadosDeValorCinza(texto).length;
}

/**
 * Herança — só diminui. Em 17/10/2026 eram 13 ocorrências; as de valor real em cinza
 * (campo travado/desabilitado, ou sempre cinza) foram corrigidas a pedido do usuário
 * ("sim"). Ficam só as legítimas, que o texto não distingue:
 *   VAZIO      o cinza está no ramo "sem valor" de um ternário: pinta só o placeholder (o
 *              Tailwind v4 deriva a cor do placeholder do `currentColor`).
 *   CARREGANDO cinza pulsante (`animate-pulse`) enquanto o valor ainda está sendo buscado.
 */
const BASELINE: Record<string, number> = {
    'components/condominio/FracoesTab.tsx': 1,             // VAZIO      fração sem valor
    'components/blueprint/QuadroDeDivisas.tsx': 1,         // VAZIO      vértice provisório (defaultValue '')
    'components/DatabaseExplorer.tsx': 1,                  // CARREGANDO preço do insumo enquanto o auxiliar carrega
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
    const achados = achadosDeValorCinza(readFileSync(f, 'utf-8'));
    if (!achados.length) continue;
    const rel = relative(RAIZ, f).split(sep).join('/');
    reais[rel] = achados.length;
    onde[rel] = achados.map((a) => `l.${a.linha} ${a.classes.join(' ')}`).join('; ');
}

describe('trava: valor de campo nunca em cinza-claro', () => {
    it('detecta o caso real que originou a trava (Número do Contrato automático)', () => {
        const original = `<input
            type="text"
            readOnly={useNewNumbering}
            onChange={(e) => { if (x > 1) return; }}
            className={\`w-full px-3 h-9 bg-gray-50 border rounded-[6px] text-sm font-semibold font-mono focus:outline-none focus:ring-2 transition-all \${useNewNumbering ? 'text-gray-400' : ''} \${numberError ? 'border-red-400' : 'border-gray-100'}\`}
        />`;
        expect(contarValoresCinza(original)).toBe(1);
    });

    it('detecta as outras formas (sem variante, disabled:, textarea, slate-300)', () => {
        expect(contarValoresCinza('<input className="text-sm text-gray-400" />')).toBe(1);
        expect(contarValoresCinza('<input className="h-9 disabled:text-gray-400" />')).toBe(1);
        expect(contarValoresCinza('<textarea className="read-only:text-slate-300">x</textarea>')).toBe(1);
        expect(contarValoresCinza('<input className={`${a ? "text-zinc-400" : ""}`} />')).toBe(1);
    });

    it('não confunde com o permitido (placeholder, hover, ícone ao lado, select, comentário)', () => {
        expect(contarValoresCinza('<input className="text-gray-900 placeholder:text-gray-400" />')).toBe(0);
        expect(contarValoresCinza('<input className="text-gray-900 hover:text-gray-400 focus:placeholder:text-slate-300" />')).toBe(0);
        expect(contarValoresCinza('<input className="text-gray-900" /><Search className="text-gray-400" />')).toBe(0);
        expect(contarValoresCinza(`<select className={v ? 'text-gray-900' : 'text-gray-400'}>`)).toBe(0);
        expect(contarValoresCinza('// <input className="text-gray-400" />')).toBe(0);
        expect(contarValoresCinza('{/* <input className="text-gray-400" /> */}')).toBe(0);
        expect(contarValoresCinza('<inputGroup className="text-gray-400" />')).toBe(0);
    });

    it('`image/*` e comentário de fim de linha não fazem o recorte escapar do elemento', () => {
        const arquivo = `<input type="file" accept="image/*,video/*" className="hidden"
            onChange={e => { f(e); e.target.value = ''; // permite reescolher o mesmo arquivo
            }} />
        <p className="text-gray-400">texto solto</p> {/* nota */}`;
        expect(contarValoresCinza(arquivo)).toBe(0);
    });

    it('nenhum arquivo NOVO pinta valor de campo de cinza, e nenhum do baseline piorou', () => {
        const piorou = Object.entries(reais)
            .filter(([f, n]) => n > (BASELINE[f] ?? 0))
            .map(([f, n]) => `${f}: ${n} (baseline ${BASELINE[f] ?? 0}) [${onde[f]}] — valor de campo em text-gray-900; cinza só no placeholder: (guia §32)`);
        expect(piorou).toEqual([]);
    });

    it('baseline sem número a mais: dívida paga sai do baseline (catraca)', () => {
        const desatualizado = Object.entries(BASELINE)
            .filter(([f, n]) => (reais[f] ?? 0) < n)
            .map(([f, n]) => `${f}: baseline ${n}, hoje ${reais[f] ?? 0} — abaixe/remova a entrada`);
        expect(desatualizado).toEqual([]);
    });
});
