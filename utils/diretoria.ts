/**
 * Regras puras do painel da Diretoria (ÒPURA CEO, 17/11/2026) — sem React, sem rede.
 * Plano: docs/planos/2026-11-17-opura-ceo.md. O catálogo dos tipos e os textos de cada grupo
 * moram em supabase/functions/_shared/diretoriaCatalogo.ts (o mesmo do e-mail semanal).
 */
import {
    TIPOS, AREAS, SEVERIDADES, tituloDoGrupo, detalheDoGrupo, brl, dataBr, diasAte, semanaDe, compararSemanas,
    type TipoExcecao, type Area, type Severidade, type FotoDaSemana, type LinhaComparacao,
} from '../supabase/functions/_shared/diretoriaCatalogo';

export { TIPOS, AREAS, SEVERIDADES, tituloDoGrupo, detalheDoGrupo, brl, dataBr, diasAte, semanaDe, compararSemanas };
export type { TipoExcecao, Area, Severidade, FotoDaSemana, LinhaComparacao };

// ── Tipos do que `fn_diretoria_painel` devolve ──────────────────────────────────
export interface ItemExcecao { id: string; titulo: string; valor: number | null; dias: number | null; data: string | null }

export interface GrupoExcecao {
    chave: string;
    tipo: TipoExcecao;
    org_id: string;
    grupo: string | null;
    severidade: Severidade;
    origem_responsavel: 'dado' | 'area' | 'nenhum';
    responsaveis: string[];
    quantidade: number;
    valor: number | null;
    dias: number | null;
    data_ref: string | null;
    itens: ItemExcecao[];
}

export interface Atualizacao { texto: string; autor: string | null; criada_em: string }

export interface Determinacao {
    id: string;
    organization_id: string;
    titulo: string;
    responsavel_user_id: string;
    prazo: string;
    status: 'aberta' | 'andamento' | 'concluida';
    origem: string | null;
    excecao_chave: string | null;
    criada_por: string | null;
    criada_em: string;
    concluida_em: string | null;
    atualizacoes: Atualizacao[];
}

export interface Pessoa { user_id: string; nome: string; email: string | null; cargo: string | null; orgs: string[] }
export interface LinhaHierarquia { organization_id: string; user_id: string; chefe_user_id: string; atualizado_em: string }
export interface LinhaArea { organization_id: string; area: Area; user_id: string; atualizado_em: string }
export interface Cobranca {
    organization_id: string; excecao_chave: string; tipo: string; titulo: string;
    responsavel_user_id: string; cobrado_por: string | null; cobrado_em: string;
}
export interface OrgDoPainel { id: string; nome: string; pode_editar: boolean }

export interface PainelDiretoria {
    hoje: string;
    orgs: OrgDoPainel[];
    excecoes: GrupoExcecao[];
    erros: Record<string, string>;
    pessoas: Pessoa[];
    hierarquia: LinhaHierarquia[];
    areas: LinhaArea[];
    determinacoes: Determinacao[];
    cobrancas: Cobranca[];
    /** Foto da segunda-feira passada (diretoria_semana_numeros, somada nas orgs); null sem foto. */
    semana_anterior: FotoDaSemana | null;
}

// ── Hierarquia ──────────────────────────────────────────────────────────────────
/** Chefe de cada pessoa. A mesma pessoa com chefes diferentes em orgs diferentes ("Todas"): vale o mais recente. */
export function chefesEfetivos(linhas: LinhaHierarquia[]): Map<string, string> {
    const escolhido = new Map<string, LinhaHierarquia>();
    for (const l of linhas) {
        const atual = escolhido.get(l.user_id);
        if (!atual || l.atualizado_em > atual.atualizado_em) escolhido.set(l.user_id, l);
    }
    return new Map([...escolhido].map(([u, l]) => [u, l.chefe_user_id]));
}

/** A pessoa e todos abaixo dela, em qualquer nível. Laço (possível ao juntar orgs) não trava. */
export function equipe(userId: string, chefes: Map<string, string>): string[] {
    const filhosDe = new Map<string, string[]>();
    for (const [u, c] of chefes) filhosDe.set(c, [...(filhosDe.get(c) ?? []), u]);
    const vistos = new Set<string>([userId]);
    const fila = [userId];
    while (fila.length) {
        for (const f of filhosDe.get(fila.shift()!) ?? []) {
            if (!vistos.has(f)) { vistos.add(f); fila.push(f); }
        }
    }
    return [...vistos];
}

export interface NoDaArvore { userId: string; filhos: NoDaArvore[] }

/** Árvore de quem responde a quem. Raiz = sem chefe, ou chefe fora da lista. */
export function arvore(pessoas: string[], chefes: Map<string, string>): NoDaArvore[] {
    const naLista = new Set(pessoas);
    const vistos = new Set<string>();
    const no = (u: string): NoDaArvore => {
        vistos.add(u);
        const filhos = pessoas.filter(p => chefes.get(p) === u && !vistos.has(p)).map(no);
        return { userId: u, filhos };
    };
    const raizes = pessoas.filter(p => { const c = chefes.get(p); return !c || !naLista.has(c); }).map(no);
    // Quem sobrou está num laço sem raiz: entra como raiz para não sumir da tela.
    for (const p of pessoas) if (!vistos.has(p)) raizes.push(no(p));
    return raizes;
}

export interface ResumoDaPessoa { criticos: number; total: number; determinacoes: number; determinacoesVencidas: number }

/** O que está fora do trilho na pessoa (e, por padrão, na equipe abaixo dela). */
export function resumoPorPessoa(
    userId: string, excecoes: GrupoExcecao[], determinacoes: Determinacao[],
    chefes: Map<string, string>, hoje: string, comEquipe = true,
): ResumoDaPessoa {
    const ids = new Set(comEquipe ? equipe(userId, chefes) : [userId]);
    const xs = excecoes.filter(g => g.responsaveis.some(r => ids.has(r)));
    const ds = determinacoes.filter(d => d.status !== 'concluida' && ids.has(d.responsavel_user_id));
    return {
        criticos: xs.filter(g => g.severidade === 'critico').length,
        total: xs.length,
        determinacoes: ds.length,
        determinacoesVencidas: ds.filter(d => diasAte(d.prazo, hoje) < 0).length,
    };
}

// ── Filtros, determinações, KPIs ────────────────────────────────────────────────
export function filtrarSilenciados(excecoes: GrupoExcecao[], silenciados: readonly string[]): GrupoExcecao[] {
    if (!silenciados.length) return excecoes;
    const s = new Set(silenciados);
    return excecoes.filter(g => !s.has(g.tipo));
}

/** Preferência `diretoria.silenciados` é texto ("a,b"); tipo desconhecido é descartado. */
export function lerSilenciados(valor: unknown): TipoExcecao[] {
    if (typeof valor !== 'string') return [];
    return valor.split(',').map(s => s.trim()).filter((s): s is TipoExcecao => s in TIPOS);
}

export function juntarSilenciados(tipos: readonly string[]): string | null {
    const unicos = [...new Set(tipos)].filter(t => t in TIPOS).sort();
    return unicos.length ? unicos.join(',') : null;
}

export type ColunaDeterminacao = 'vencidas' | 'abertas' | 'andamento' | 'concluidas';

export function colunaDaDeterminacao(d: Determinacao, hoje: string): ColunaDeterminacao {
    if (d.status === 'concluida') return 'concluidas';
    if (diasAte(d.prazo, hoje) < 0) return 'vencidas';
    return d.status === 'andamento' ? 'andamento' : 'abertas';
}

export function kpisDoPainel(excecoes: GrupoExcecao[], determinacoes: Determinacao[], hoje: string) {
    return {
        pedemDecisao: excecoes.filter(g => g.severidade === 'critico').length,
        foraDoTrilho: excecoes.length,
        itens: excecoes.reduce((s, g) => s + g.quantidade, 0),
        determinacoesVencidas: determinacoes.filter(d => colunaDaDeterminacao(d, hoje) === 'vencidas').length,
        semResponsavel: excecoes.filter(g => g.origem_responsavel === 'nenhum').length,
    };
}

export function ultimaCobranca(chave: string, cobrancas: Cobranca[]): Cobranca | null {
    let ultima: Cobranca | null = null;
    for (const c of cobrancas) if (c.excecao_chave === chave && (!ultima || c.cobrado_em > ultima.cobrado_em)) ultima = c;
    return ultima;
}

export function ordenarPorGravidade(excecoes: GrupoExcecao[]): GrupoExcecao[] {
    return [...excecoes].sort((a, b) =>
        SEVERIDADES[a.severidade].ordem - SEVERIDADES[b.severidade].ordem
        || (b.valor ?? 0) - (a.valor ?? 0)
        || b.quantidade - a.quantidade);
}

/** Nome da pessoa, ou um texto honesto quando o id não está na lista. */
export function nomeDe(userId: string | null | undefined, pessoas: Pessoa[]): string {
    if (!userId) return 'Ninguém';
    return pessoas.find(p => p.user_id === userId)?.nome ?? 'Pessoa fora das organizações';
}
