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

    epiCatalog:      (orgId: string)   => ['labor', 'epiCatalog',      orgId]          as const,
    epiDeliveries:   (orgId: string, employeeId?: string, includeReturned?: boolean) =>
        ['labor', 'epiDeliveries', orgId, employeeId ?? 'all', includeReturned ? '1' : '0'] as const,
    epiAlerts:       (orgId: string)   => ['labor', 'epiAlerts',       orgId]          as const,

    absences:        (orgId: string, tipo?: string, status?: string, employeeId?: string) =>
        ['labor', 'absences', orgId, tipo ?? 'all', status ?? 'all', employeeId ?? 'all'] as const,
    vacationBalances:(orgId: string, employeeId?: string) =>
        ['labor', 'vacationBalances', orgId, employeeId ?? 'all'] as const,
    vacationAlerts:  (orgId: string)   => ['labor', 'vacationAlerts',  orgId]          as const,

    trainingCourses:  (orgId: string)  => ['labor', 'trainingCourses', orgId]          as const,
    employeeTrainings:(orgId: string, employeeId?: string, status?: string) =>
        ['labor', 'employeeTrainings', orgId, employeeId ?? 'all', status ?? 'all'] as const,
    trainingAlerts:   (orgId: string)  => ['labor', 'trainingAlerts',  orgId]          as const,

    rhKpis:           (orgId: string, refDate?: string) =>
        ['labor', 'rhKpis', orgId, refDate ?? 'today'] as const,

    terminations:     (orgId: string) => ['labor', 'terminations', orgId] as const,

    // Sprint 7
    qrCodes:          (orgId: string) => ['labor', 'qrCodes',       orgId] as const,
    timeBankBalances: (orgId: string) => ['labor', 'timeBankBal',   orgId] as const,
    timeBankEntries:  (orgId: string, employeeId?: string) =>
        ['labor', 'timeBankEnt', orgId, employeeId ?? 'all'] as const,

    // Sprint 8
    accidents:        (orgId: string) => ['labor', 'accidents',     orgId] as const,
    sstChecklists:    (orgId: string) => ['labor', 'sstChecklists', orgId] as const,
    sstIndicators:    (orgId: string) => ['labor', 'sstIndicators', orgId] as const,

    // Sprint 9
    contractors:        (orgId: string) => ['labor', 'contractors',    orgId] as const,
    contractorMeasurements: (orgId: string) => ['labor', 'cMeasurements', orgId] as const,
    contractorDocs:     (orgId: string) => ['labor', 'cDocs',         orgId] as const,

    // Sprint 10
    laborDiary:       (orgId: string) => ['labor', 'laborDiary',    orgId] as const,

    // Sprint 11 (ATS — em atsService.ts, usa chaves ['ats', ...])
    // Sprint 12 (Portal — em atsService.ts, usa chaves ['portal', ...])
} as const;

// ── Structural / Ferragem Armada module ──────────────────────────────────────

export const structuralKeys = {
    /** Raiz: invalida todos os dados do módulo estrutural */
    all: ['structural'] as const,

    catalog:    (orgId: string)      => ['structural', 'catalog',    orgId]      as const,
    assemblies: (projectId: string)  => ['structural', 'assemblies', projectId]  as const,
    elements:   (assemblyId: string) => ['structural', 'elements',   assemblyId] as const,
    rebars:     (elementId: string)  => ['structural', 'rebars',     elementId]  as const,
    structure:  (projectId: string)  => ['structural', 'structure',  projectId]  as const,
} as const

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
