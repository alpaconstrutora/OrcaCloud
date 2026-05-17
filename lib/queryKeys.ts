/**
 * Fábricas de chave para o React Query — toda a hierarquia de cache do módulo Labour.
 *
 * Usando o padrão de chave hierárquica, `invalidateQueries({ queryKey: laborKeys.all })`
 * invalida TUDO de labor; `invalidateQueries({ queryKey: laborKeys.employees() })`
 * invalida todas as variações de employees independente do orgId.
 *
 * Regra: nunca usar strings ad-hoc nos componentes — sempre importar daqui.
 */

// ── Labor module ─────────────────────────────────────────────────────────────

export const laborKeys = {
    /** Raiz: invalida todos os dados do módulo labour */
    all: ['labor'] as const,

    employees:       (orgId?: string)  => ['labor', 'employees',       orgId ?? 'all'] as const,
    teams:           (orgId?: string)  => ['labor', 'teams',           orgId ?? 'all'] as const,
    timeEntries:     (orgId?: string)  => ['labor', 'timeEntries',     orgId ?? 'all'] as const,
    productivityLogs:(orgId?: string)  => ['labor', 'productivityLogs',orgId ?? 'all'] as const,
    costSummary:     (orgId?: string)  => ['labor', 'costSummary',     orgId ?? 'all'] as const,
    docAlerts:       (orgId?: string)  => ['labor', 'docAlerts',       orgId ?? 'all'] as const,
    documents:       (orgId?: string)  => ['labor', 'documents',       orgId ?? 'all'] as const,
    rubrics:         ()                => ['labor', 'rubrics']          as const,
    fiscalSettings:  (year: number)    => ['labor', 'fiscal',          year]           as const,

    payrollRuns:    (orgId: string, typeFilter?: string, start?: string, end?: string) =>
        ['labor', 'payrollRuns', orgId, typeFilter ?? 'all', start ?? '', end ?? ''] as const,
    payrollResults:  (runId: string)   => ['labor', 'payrollResults',  runId]          as const,
    payrollEvents:   (orgId: string, runId: string) =>
        ['labor', 'payrollEvents', orgId, runId] as const,
    payrollRubrics:  ()                => ['labor', 'payrollRubrics']  as const,
} as const;

// ── Shared / cross-module ────────────────────────────────────────────────────

export const orgKeys = {
    all:  ['organizations'] as const,
    list: ()               => ['organizations', 'list'] as const,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retorna o prefixo de chave para invalidar todas as queries de labor de um orgId específico.
 * Útil quando um evento afeta múltiplos tipos de dados da mesma organização.
 */
export function laborOrgPrefix(orgId: string) {
    return ['labor', orgId] as const;
}
