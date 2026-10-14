import type { LaborEntry } from '../types/diary';

/**
 * Efetivo do diário — de onde vêm os nomes sugeridos. A MESMA regra na tela
 * desktop (`ProjectDiaryManager`) e no app mobile (`DiaryMobileApp`): antes o
 * mobile era texto livre, e nome digitado de qualquer jeito ("pedreiro",
 * "Pedreiros", "pedreiro joão") vira três equipes na "Análise de equipes".
 */

export type TipoSugestaoEfetivo = 'worker' | 'team' | 'role' | 'rh';

export interface SugestaoEfetivo {
    id: string;
    name: string;
    type: TipoSugestaoEfetivo;
    /** Função do trabalhador, nº de integrantes da equipe, cargo no RH. */
    subLabel?: string;
}

interface RecursosDaOrg {
    resources?: {
        roles?: { id: string; name: string }[];
        workers?: { id: string; name: string; roleId?: string }[];
        teams?: { id: string; name: string; memberIds?: string[] }[];
    } | null;
}

/**
 * Sugestões a partir dos recursos das organizações (Configurações › Recursos):
 * trabalhadores primeiro, depois equipes, depois só as funções que têm alguém
 * vinculado. Sem repetir.
 */
export function sugestoesDosRecursos(organizations: RecursosDaOrg[]): SugestaoEfetivo[] {
    const out: SugestaoEfetivo[] = [];
    organizations.forEach(org => {
        const res = org.resources || {};
        (res.workers || []).forEach(w => {
            if (!out.find(s => s.type === 'worker' && s.id === w.id)) {
                const role = res.roles?.find(r => r.id === w.roleId);
                out.push({ id: w.id, name: w.name, type: 'worker', subLabel: role?.name });
            }
        });
        (res.teams || []).forEach(t => {
            if (!out.find(s => s.type === 'team' && s.id === t.id)) {
                out.push({ id: t.id, name: t.name, type: 'team', subLabel: `${t.memberIds?.length || 0} integrantes` });
            }
        });
        const funcoesComGente = new Set((res.workers || []).map(w => w.roleId).filter(Boolean));
        (res.roles || []).forEach(r => {
            if (funcoesComGente.has(r.id) && !out.find(s => s.type === 'role' && s.name === r.name)) {
                out.push({ id: r.id, name: r.name, type: 'role' });
            }
        });
    });
    return out;
}

/** Colaboradores ATIVOS do RH viram sugestão (cargo como subtítulo). Nome já sugerido não repete. */
export function comColaboradoresDoRh(
    base: SugestaoEfetivo[],
    colaboradores: { id: string; name: string; role?: string | null; status?: string | null }[],
): SugestaoEfetivo[] {
    const nomes = new Set(base.map(s => normalizarNome(s.name)));
    const extra = colaboradores
        .filter(c => c.status === 'ATIVO' && c.name?.trim())
        .filter(c => !nomes.has(normalizarNome(c.name)))
        .map(c => ({ id: c.id, name: c.name, type: 'rh' as const, subLabel: c.role || undefined }));
    return [...base, ...extra];
}

export function normalizarNome(nome: string): string {
    return (nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** O nome digitado bate com alguma sugestão (sem diferenciar maiúscula/espaços)? */
export function nomeEstaNaLista(nome: string, sugestoes: SugestaoEfetivo[]): boolean {
    const n = normalizarNome(nome);
    return !!n && sugestoes.some(s => normalizarNome(s.name) === n);
}

/**
 * Trocou o nome da linha: grava exatamente a grafia da sugestão (padroniza
 * maiúsculas/espaços) e, se for trabalhador ou colaborador do RH e a linha não
 * tem observação, a função/cargo vai para observações — como o desktop fazia.
 */
export function aplicarNomeNoEfetivo(linha: LaborEntry, nome: string, sugestoes: SugestaoEfetivo[]): LaborEntry {
    const n = normalizarNome(nome);
    const sug = n ? sugestoes.find(s => normalizarNome(s.name) === n) : undefined;
    const category = sug ? sug.name : nome;
    const comFuncao = sug && (sug.type === 'worker' || sug.type === 'rh') && sug.subLabel && !linha.observations;
    return { ...linha, category, ...(comFuncao ? { observations: sug!.subLabel } : {}) };
}
