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

    employees:       (orgId?: string | null)  => ['labor', 'employees',       orgId ?? 'all'] as const,
    teams:           (orgId?: string | null)  => ['labor', 'teams',           orgId ?? 'all'] as const,
    timeEntries:     (orgId?: string | null)  => ['labor', 'timeEntries',     orgId ?? 'all'] as const,
    productivityLogs:(orgId?: string | null)  => ['labor', 'productivityLogs',orgId ?? 'all'] as const,
    costSummary:     (orgId?: string | null)  => ['labor', 'costSummary',     orgId ?? 'all'] as const,
    docAlerts:       (orgId?: string | null)  => ['labor', 'docAlerts',       orgId ?? 'all'] as const,
    documents:       (orgId?: string | null)  => ['labor', 'documents',       orgId ?? 'all'] as const,
    rubrics:         ()                => ['labor', 'rubrics']          as const,
    fiscalSettings:  (year: number)    => ['labor', 'fiscal',          year]           as const,

    payrollRuns:    (orgId: string | null, typeFilter?: string, start?: string, end?: string) =>
        ['labor', 'payrollRuns', orgId, typeFilter ?? 'all', start ?? '', end ?? ''] as const,
    payrollResults:  (runId: string)   => ['labor', 'payrollResults',  runId]          as const,
    payrollEvents:   (orgId: string | null, runId: string) =>
        ['labor', 'payrollEvents', orgId, runId] as const,
    payrollRubrics:  ()                => ['labor', 'payrollRubrics']  as const,

    epiCatalog:      (orgId: string | null)   => ['labor', 'epiCatalog',      orgId]          as const,
    epiDeliveries:   (orgId: string | null, employeeId?: string, includeReturned?: boolean) =>
        ['labor', 'epiDeliveries', orgId, employeeId ?? 'all', includeReturned ? '1' : '0'] as const,
    epiAlerts:       (orgId: string | null)   => ['labor', 'epiAlerts',       orgId]          as const,

    absences:        (orgId: string | null, tipo?: string, status?: string, employeeId?: string) =>
        ['labor', 'absences', orgId, tipo ?? 'all', status ?? 'all', employeeId ?? 'all'] as const,
    vacationBalances:(orgId: string | null, employeeId?: string) =>
        ['labor', 'vacationBalances', orgId, employeeId ?? 'all'] as const,
    vacationAlerts:  (orgId: string | null)   => ['labor', 'vacationAlerts',  orgId]          as const,

    trainingCourses:  (orgId: string | null)  => ['labor', 'trainingCourses', orgId]          as const,
    employeeTrainings:(orgId: string | null, employeeId?: string, status?: string) =>
        ['labor', 'employeeTrainings', orgId, employeeId ?? 'all', status ?? 'all'] as const,
    trainingAlerts:   (orgId: string | null)  => ['labor', 'trainingAlerts',  orgId]          as const,

    rhKpis:           (orgId: string | null, refDate?: string) =>
        ['labor', 'rhKpis', orgId, refDate ?? 'today'] as const,

    terminations:     (orgId: string | null) => ['labor', 'terminations', orgId] as const,

    // Sprint 7
    qrCodes:          (orgId: string | null) => ['labor', 'qrCodes',       orgId] as const,
    timeBankBalances: (orgId: string | null) => ['labor', 'timeBankBal',   orgId] as const,
    timeBankEntries:  (orgId: string | null, employeeId?: string) =>
        ['labor', 'timeBankEnt', orgId, employeeId ?? 'all'] as const,

    // Sprint 8
    accidents:        (orgId: string | null) => ['labor', 'accidents',     orgId] as const,
    sstChecklists:    (orgId: string | null) => ['labor', 'sstChecklists', orgId] as const,
    sstIndicators:    (orgId: string | null) => ['labor', 'sstIndicators', orgId] as const,

    // Sprint 9
    contractors:        (orgId: string | null) => ['labor', 'contractors',    orgId] as const,
    contractorMeasurements: (orgId: string | null) => ['labor', 'cMeasurements', orgId] as const,
    contractorDocs:     (orgId: string | null) => ['labor', 'cDocs',         orgId] as const,

    // Sprint 10
    laborDiary:       (orgId: string | null) => ['labor', 'laborDiary',    orgId] as const,

    // Sprint 11 (ATS — em atsService.ts, usa chaves ['ats', ...])
    // Sprint 12 (Portal — em atsService.ts, usa chaves ['portal', ...])
} as const;

// ── Structural / Ferragem Armada module ──────────────────────────────────────

export const structuralKeys = {
    /** Raiz: invalida todos os dados do módulo estrutural */
    all: ['structural'] as const,

    catalog:    (orgId: string | null)      => ['structural', 'catalog',    orgId]      as const,
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

// ── Academia ÒPURA (Treinamento e Desenvolvimento) ───────────────────────────
// O catálogo de cursos continua sob `laborKeys.trainingCourses` — é a mesma
// entidade. Aqui ficam só as chaves do conteúdo versionado e do consumo.
export const academyKeys = {
    all: ['academy'] as const,
    versions:     (courseId: string)     => ['academy', 'versions', courseId] as const,
    version:      (versionId: string)    => ['academy', 'version', versionId] as const,
    publishedVersion: (courseId: string) => ['academy', 'publishedVersion', courseId] as const,
    outline:      (versionId: string)    => ['academy', 'outline', versionId] as const,
    questions:    (versionId: string)    => ['academy', 'questions', versionId] as const,
    assessments:  (versionId: string)    => ['academy', 'assessments', versionId] as const,
    assignments:  (orgId?: string | null) => ['academy', 'assignments', orgId ?? 'all'] as const,
    enrollments:  (orgId?: string | null, employeeId?: string, status?: string) =>
                      ['academy', 'enrollments', orgId ?? 'all', employeeId ?? 'all', status ?? 'all'] as const,
    myEnrollments:(employeeId: string)   => ['academy', 'myEnrollments', employeeId] as const,
    playerContent:(enrollmentId: string) => ['academy', 'playerContent', enrollmentId] as const,
    accessLogs:   (enrollmentId: string) => ['academy', 'accessLogs', enrollmentId] as const,
    certificates: (orgId?: string | null, employeeId?: string) =>
                      ['academy', 'certificates', orgId ?? 'all', employeeId ?? 'all'] as const,
    managerPanel: (orgId?: string | null) => ['academy', 'managerPanel', orgId ?? 'all'] as const,
    hrPanel:      (orgId?: string | null) => ['academy', 'hrPanel', orgId ?? 'all'] as const,
    // Portal externo mantém o namespace do portal (LaborPortal.tsx).
    portalEnrollments: (token: string)   => ['portal', 'academy', 'enrollments', token] as const,
    portalContent: (token: string, enrollmentId: string) =>
                      ['portal', 'academy', 'content', token, enrollmentId] as const,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retorna o prefixo de chave para invalidar todas as queries de labor de um orgId específico.
 * Útil quando um evento afeta múltiplos tipos de dados da mesma organização.
 */
export function laborOrgPrefix(orgId: string | null) {
    return ['labor', orgId] as const;
}
