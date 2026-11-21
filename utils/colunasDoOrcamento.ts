// Colunas próprias da lista de Orçamentos (Engenharia › Orçamentos).
//
// Dados que o orçamento já tem no cadastro (`projects.settings`) e o Valor total (conta dos
// itens). Uma função só dá o texto da célula E a chave de ordenação, para a tabela nunca
// ordenar por uma coisa e mostrar outra (§6.3). Plano: docs/planos/2026-11-21-orcamentos-colunas.md.
import { formatCurrency } from './financialMath';

export const COLUNAS_DO_ORCAMENTO = [
    'valor-total',
    'base-preco',
    'bdi',
    'area',
    'padrao',
    'local',
    'previsto-inicio',
    'previsto-termino',
] as const;
export type ColunaDoOrcamento = typeof COLUNAS_DO_ORCAMENTO[number];

export const ehColunaDoOrcamento = (key: string): key is ColunaDoOrcamento =>
    (COLUNAS_DO_ORCAMENTO as readonly string[]).includes(key);

/** Colunas de número: célula e cabeçalho alinhados à direita. */
export const COLUNAS_NUMERICAS_DO_ORCAMENTO: ReadonlySet<string> = new Set(['valor-total', 'bdi', 'area']);

/** Os campos do cadastro (`projects.settings`) que estas colunas leem. */
export interface CamposDoCadastro {
    database?: string | null;
    referenceMonth?: string | null;
    bdi?: number | string | null;
    area?: number | string | null;
    standard?: string | null;
    city?: string | null;
    state?: string | null;
    startDate?: string | null;
    endDate?: string | null;
}

export interface ValorDaColuna {
    /** O que a célula mostra; `null` = sem dado ("—"). */
    texto: string | null;
    /** Chave de ordenação; `null` vai para o fim nos dois sentidos. */
    ordem: number | string | null;
}

const SEM_DADO: ValorDaColuna = { texto: null, ordem: null };

const numero = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

const decimal = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** 'AAAA-MM-DD' (ou ISO com hora) → 'DD/MM/AAAA', sem passar por Date (fuso não desloca o dia). */
const dataDoCadastro = (v: unknown): ValorDaColuna => {
    if (typeof v !== 'string') return SEM_DADO;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (!m) return SEM_DADO;
    return { texto: `${m[3]}/${m[2]}/${m[1]}`, ordem: `${m[1]}-${m[2]}-${m[3]}` };
};

/**
 * Valor da coluna para uma linha. `valorTotal` só vale para 'valor-total': o número já calculado
 * pelos itens, ou `null` enquanto carrega/sem itens (quem chama decide o que mostrar).
 */
export function valorDaColunaDoOrcamento(
    key: ColunaDoOrcamento,
    settings: CamposDoCadastro | null | undefined,
    valorTotal?: number | null,
): ValorDaColuna {
    const s: CamposDoCadastro = settings ?? {};
    switch (key) {
        case 'valor-total':
            return valorTotal === null || valorTotal === undefined
                ? SEM_DADO
                : { texto: formatCurrency(valorTotal), ordem: valorTotal };
        case 'base-preco': {
            const base = (s.database ?? '').trim();
            const mes = (s.referenceMonth ?? '').trim();
            if (!base && !mes) return SEM_DADO;
            const texto = [base, mes].filter(Boolean).join(' · ');
            // Ordena pela base e, dentro dela, pelo mês (MM/AAAA → AAAA-MM).
            const mesOrdenavel = /^(\d{2})\/(\d{4})$/.exec(mes);
            return { texto, ordem: `${base}|${mesOrdenavel ? `${mesOrdenavel[2]}-${mesOrdenavel[1]}` : mes}` };
        }
        case 'bdi': {
            const n = numero(s.bdi);
            return n === null ? SEM_DADO : { texto: `${decimal(n)}%`, ordem: n };
        }
        case 'area': {
            const n = numero(s.area);
            return n === null || n <= 0 ? SEM_DADO : { texto: `${decimal(n)} m²`, ordem: n };
        }
        case 'padrao': {
            const p = (s.standard ?? '').trim();
            return p ? { texto: p, ordem: p } : SEM_DADO;
        }
        case 'local': {
            const texto = [(s.city ?? '').trim(), (s.state ?? '').trim()].filter(Boolean).join('/');
            return texto ? { texto, ordem: texto } : SEM_DADO;
        }
        case 'previsto-inicio':
            return dataDoCadastro(s.startDate);
        case 'previsto-termino':
            return dataDoCadastro(s.endDate);
    }
}

/** Compara duas chaves de ordenação; sem dado vai sempre para o fim. */
export function compararValores(a: ValorDaColuna['ordem'], b: ValorDaColuna['ordem'], direcao: 'asc' | 'desc'): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR');
    return direcao === 'asc' ? cmp : -cmp;
}
