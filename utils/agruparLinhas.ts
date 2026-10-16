/**
 * "Agrupar" das tabelas — função pura e genérica. Nasceu em Boletos a Pagar
 * (boletoGrupos.ts) e Contas a Receber (recebivelGrupos.ts); virou peça única
 * quando o recurso foi propagado para o resto do Financeiro (15/10/2026,
 * docs/planos/2026-10-15-financeiro-agrupar-propagacao.md). Guia de UI §6.12.
 *
 * A tela diz COMO tirar a chave de uma linha (o MESMO texto que a célula mostra)
 * e recebe os grupos prontos, na ordem da lista que entrou (já filtrada e ordenada).
 */

export interface Grupo<T> {
    key: string;
    label: string;
    itens: T[];
    /** Soma do valor principal das linhas do grupo. */
    total: number;
}

/** Chave e rótulo de uma linha; `null` = sem valor (cai no grupo "Sem …"). */
export type ChaveDeGrupo = { key: string; label: string } | null;

export interface OpcoesAgrupar<T> {
    chave: (linha: T) => ChaveDeGrupo;
    /** Rótulo do grupo das linhas sem valor ("Sem cliente"). Vai sempre por último. */
    semRotulo: string;
    /** Valor somado no total do grupo. */
    valor?: (linha: T) => number | null | undefined;
    /**
     * Ordem dos grupos: 'aparicao' (padrão — respeita a coluna ordenada), 'chave'
     * (crescente pela chave: mês 'AAAA-MM' sai cronológico) ou a lista de chaves
     * na ordem desejada (status na ordem do fluxo; chave fora da lista vai ao fim).
     */
    ordem?: 'aparicao' | 'chave' | string[];
}

export const CHAVE_VAZIA = '__vazio__';

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "2026-07" → "Julho/2026". */
export function rotuloMes(anoMes: string): string {
    const [a, m] = anoMes.split('-');
    const i = Number(m) - 1;
    return MESES[i] ? `${MESES[i]}/${a}` : anoMes;
}

/** Texto livre → chave sem caixa (nomes que só diferem em maiúsculas caem juntos). */
export function chavePorNome(nome: string | null | undefined): ChaveDeGrupo {
    const t = (nome ?? '').trim();
    return t ? { key: t.toLowerCase(), label: t } : null;
}

/** Data 'AAAA-MM-DD…' → grupo do mês ("Julho/2026"). Use com `ordem: 'chave'`. */
export function chavePorMes(data: string | null | undefined): ChaveDeGrupo {
    const am = (data ?? '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(am) ? { key: am, label: rotuloMes(am) } : null;
}

/** Código de um mapa de rótulos (status, tipo) → grupo com o rótulo da tela. */
export function chavePorRotulo(codigo: string | null | undefined, rotulos: Record<string, string>): ChaveDeGrupo {
    return codigo ? { key: codigo, label: rotulos[codigo] ?? codigo } : null;
}

export function agruparLinhas<T>(linhas: T[], o: OpcoesAgrupar<T>): Grupo<T>[] {
    const mapa = new Map<string, Grupo<T>>();
    for (const linha of linhas) {
        const c = o.chave(linha);
        const key = c ? c.key : CHAVE_VAZIA;
        let g = mapa.get(key);
        if (!g) { g = { key, label: c ? c.label : o.semRotulo, itens: [], total: 0 }; mapa.set(key, g); }
        g.itens.push(linha);
        g.total += Number(o.valor?.(linha)) || 0;
    }
    const grupos = [...mapa.values()];
    const ordem = o.ordem ?? 'aparicao';
    if (ordem === 'chave') {
        grupos.sort((a, b) => a.key.localeCompare(b.key));
    } else if (Array.isArray(ordem)) {
        const pos = (k: string) => { const i = ordem.indexOf(k); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
        grupos.sort((a, b) => pos(a.key) - pos(b.key));
    }
    return [...grupos.filter(g => g.key !== CHAVE_VAZIA), ...grupos.filter(g => g.key === CHAVE_VAZIA)];
}

/** As linhas NA ORDEM DA TELA, sem as dos grupos recolhidos — base do "selecionar
 *  todos" e do Shift+clique (com a lista plana, o intervalo marcaria linhas fora do
 *  trecho clicado ou escondidas). */
export function linhasDaTela<T>(grupos: Grupo<T>[], recolhidos: Set<string>): T[] {
    return grupos.flatMap(g => (recolhidos.has(g.key) ? [] : g.itens));
}

export type EntradaDaTela<T> =
    | { tipo: 'grupo'; grupo: Grupo<T>; recolhido: boolean; /** começou na página anterior */ continua: boolean }
    | { tipo: 'linha'; item: T; /** posição em `linhasDaTela` (Shift+clique) */ indice: number };

/**
 * O que desenhar no `<tbody>` — cabeçalhos de grupo intercalados com as linhas.
 * `inicio`/`fim` recortam uma PÁGINA em linhas de dado (paginação §6.7); sem eles,
 * tudo. Regras:
 *  - o cabeçalho vem antes da 1ª linha do grupo que cai na página; se o grupo
 *    começou antes dela, repete com `continua`;
 *  - grupo recolhido não tem linha: aparece na página em que cairia (a posição é o
 *    número de linhas antes dele) e, no fim da lista, na última página.
 */
export function entradasDaPagina<T>(
    grupos: Grupo<T>[], recolhidos: Set<string>, inicio = 0, fim = Number.POSITIVE_INFINITY,
): EntradaDaTela<T>[] {
    const total = grupos.reduce((s, g) => s + (recolhidos.has(g.key) ? 0 : g.itens.length), 0);
    const ate = Math.min(fim, total);
    const out: EntradaDaTela<T>[] = [];
    let pos = 0;
    for (const grupo of grupos) {
        if (recolhidos.has(grupo.key)) {
            if ((pos >= inicio && pos < ate) || (pos === ate && ate === total)) {
                out.push({ tipo: 'grupo', grupo, recolhido: true, continua: false });
            }
            continue;
        }
        const de = Math.max(pos, inicio);
        const a = Math.min(pos + grupo.itens.length, ate);
        if (de < a) {
            out.push({ tipo: 'grupo', grupo, recolhido: false, continua: de > pos });
            for (let i = de; i < a; i++) out.push({ tipo: 'linha', item: grupo.itens[i - pos], indice: i });
        }
        pos += grupo.itens.length;
    }
    return out;
}

/** Quantas linhas de dado a tela mostra (para a paginação contar as páginas). */
export function contarLinhasDaTela<T>(grupos: Grupo<T>[], recolhidos: Set<string>): number {
    return grupos.reduce((s, g) => s + (recolhidos.has(g.key) ? 0 : g.itens.length), 0);
}
