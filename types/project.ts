import { WBSGroup, BudgetEntry } from "./budget";
import { DiaryEntry } from "./diary";
import { FinancialInfo } from "./financial";
import { SchedulePeriod, ItemDistribution, ItemScheduleDetails, OutlineNode, Baseline, ScheduleHistoryEntry, ReplanMode } from "./schedule";
import { ResourceRole, ResourceWorker, ResourceTeam, ResourceMaterial } from "./resources";

export type TipoObra =
  | 'residencial_multifamiliar'
  | 'casa'
  | 'loja'
  | 'sala'
  | 'galpao'
  | 'reforma'
  | 'outro';

export type RegimeObra =
  | 'empreitada_global'
  | 'administracao'
  | 'preco_unitario'
  | 'turn_key';

export interface TechnicalConfigResidencialMultifamiliar {
  tipo: 'residencial_multifamiliar';
  numeroPavimentos?: number;
  numeroTorres?: number;
  numeroUnidades?: number;
  areaConstruidaTotal?: number;
  areaPrivativa?: number;
  numeroVagas?: number;
  tipoEstrutural?: 'concreto_armado' | 'metalica' | 'alvenaria_estrutural';
}

export interface TechnicalConfigCasa {
  tipo: 'casa';
  areaTerreno?: number;
  areaConstruida?: number;
  numeroPavimentos?: number;
  tipoCobertura?: string;
  condominioFechado?: boolean;
  piscina?: boolean;
  energiaSolar?: boolean;
}

export interface TechnicalConfigLoja {
  tipo: 'loja';
  localidade?: 'shopping' | 'rua';
  dataInauguracao?: string;
  trabalhoNoturno?: boolean;
  marcenariaCorporativa?: boolean;
  arCondicionadoComercial?: boolean;
}

export interface TechnicalConfigSala {
  tipo: 'sala';
  tipoOcupacao?: 'escritorio' | 'clinica' | 'coworking' | 'outro';
  pisoElevado?: boolean;
  forroModular?: boolean;
  cabeamentoEstruturado?: boolean;
  cpd?: boolean;
}

export interface TechnicalConfigGalpao {
  tipo: 'galpao';
  areaTotal?: number;
  peDireito?: number;
  tipoEstrutura?: 'pre_moldado' | 'metalica' | 'concreto';
  numeroDOcas?: number;
  ponteRolante?: boolean;
  subestacao?: boolean;
  sprinklers?: boolean;
}

export interface TechnicalConfigGenerico {
  tipo: 'reforma' | 'outro';
  descricao?: string;
}

export type TechnicalConfig =
  | TechnicalConfigResidencialMultifamiliar
  | TechnicalConfigCasa
  | TechnicalConfigLoja
  | TechnicalConfigSala
  | TechnicalConfigGalpao
  | TechnicalConfigGenerico;

export interface ProjectSettings {
    id?: string;
    name: string;
    client?: string;
    clientId?: string;
    /** Obra própria (sem cliente): construída pela própria empresa. Não aparece em portal de cliente. */
    obraPropria?: boolean;
    location: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    notes?: string;
    standard: string;
    cubRate: number;
    area: number;
    bdi: number;
    ls: number;
    cpuViewMode?: 'inline' | 'modal';
    autoSave?: boolean;
    database: string;
    referenceMonth: string;
    socialChargesMode: string;
    organizationId?: string;
    empresaId?: string;
    code?: string;
    classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO';
    isSystemProject?: boolean;
    lastCubUpdate?: Date;
    customCubRates?: Record<string, Record<string, number>>;
    kFactor?: number;
    bdiComposition?: {
        taxes: number;
        profit: number;
        risk: number;
        insurance: number;
        admin: number;
        guarantee: number;
        finance: number;
        };
    wbs: WBSGroup[];
    versions?: BudgetVersion[];
    activeVersionId?: string;
    // Versionamento orçamento × planejamento (Opção 2)
    basedOnBudgetVersionId?: string;   // versão do orçamento à qual ESTE planejamento está fixado
    basedOnBudgetVersionItem?: number; // rótulo da versão fixada
    basedOnBudgetSnapshot?: BudgetEntry[]; // cópia imutável do orçamento no momento da fixação
    planningVersions?: PlanningVersion[];
    budgetStatus?: 'Em Andamento' | 'Fechado';
    status?: 'Em Andamento' | 'Finalizado' | 'Aprovado' | 'Proposta';
    obraStatus?: 'Não Iniciado' | 'Em andamento' | 'Paralisada' | 'Concluída';
    budgetType?: 'ANALYTIC' | 'PARAMETRIC';
    tipoObra?: TipoObra;
    regimeObra?: RegimeObra;
    technicalConfig?: TechnicalConfig;
    // Gestão financeira da obra
    valorEstimado?: number;
    valorContratado?: number;
    margemAlvo?: number;
    modalidade?: 'publica' | 'privada';
    // Equipe de campo
    mestreObras?: string;
    encarregado?: string;
    tecnicoSeguranca?: string;
    almoxarife?: string;
    // Registro / documentação
    artRrt?: string;
    alvara?: string;
    matriculaCNO?: string;
    linkedProjectId?: string;
    linkedProjectName?: string;
    investorId?: string;
    investorName?: string;
    startDate?: string;
    endDate?: string;
    startDateReal?: string;
    endDateReal?: string;
    responsibleTeam?: string;
    schedule?: ProjectSchedule;
    diaryEntries?: DiaryEntry[];
    documents?: ProjectDocument[];
    financialInfo?: FinancialInfo;
    obraProgress?: number;
    obraPhase?: string;
    clientDocuments?: {
        name: string;
        category: string;
        url?: string;
        disabled?: boolean;
        date?: string;
        }[];
    investorData?: {
        summary?: {
          equity?: string;
          monthlyYield?: string;
          activeWorks?: number;
          totalCotas?: number;
        };
        performance?: Array<{ month: string; yield: number; percent: number }>;
        holdings?: Array<{ name: string; cota: string; equity: string; status: string; yield: string; progress: number }>;
        opportunities?: Array<{ title: string; subtitle: string; yield: string; link: string }>;
        reports?: Array<{ name: string; date: string; type: string }>;
    };
    clientPortalTabs?: string[];
}

export interface ProjectDocument {
    id: string;
    name: string;
    type: string;
    url: string;
    uploadedAt: string;
    size?: string;
    category?: 'PROJETO' | 'CONTRATO' | 'RECIBO' | 'OUTRO';
}

export interface ProjectSchedule {
    startDate: string;
    endDate?: string;
    duration: number;
    periods: SchedulePeriod[];
    distributions: ItemDistribution[];
    itemSchedules?: ItemScheduleDetails[];
    outline?: OutlineNode[]; // estrutura/ordem explícita (WBS); quando presente, é a fonte de verdade da hierarquia
    baselines?: Baseline[];
    activeBaselineId?: string;
    history?: ScheduleHistoryEntry[];
    replanMode?: ReplanMode;
    useWorkingDays?: boolean;
    autoRollupParentDates?: boolean; // datas de grupo/etapa/subetapa seguem mín/máx das tarefas
    holidays?: string[]; // feriados/exceções de calendário, ISO 'YYYY-MM-DD'; motor trata como dia não útil
    workSchedule?: {
        hoursPerDay: number;              // padrão de horas para todos os dias
        workDays: number[];               // 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sáb
        dayHours?: Record<number, number>; // override por dia (ex: {5: 7} = sexta com 7h)
    };
    resources?: {
        roles: ResourceRole[];
        workers: ResourceWorker[];
        teams: ResourceTeam[];
        materials?: ResourceMaterial[];
        };
    scenarios?: ScheduleScenario[];
}

// ─── Fase 2 Planejamento: Cenários ────────────────────────────

export interface ScheduleScenario {
    id: string;
    name: string;
    createdAt: string;
    // snapshot das datas resultantes (calculadas no momento do salvamento)
    itemSchedules: ItemScheduleDetails[];
    // resumo calculado no momento do salvamento
    result: {
        endDate: string;              // ISO YYYY-MM-DD da maior data de término
        totalCost: number;            // soma dos valores planejados
        criticalPathIds: string[];    // IDs dos itens no caminho crítico
        durationDays: number;         // diferença entre startDate e endDate em dias corridos
    };
    // data de início do planejamento base (para calcular Δ)
    baseStartDate: string;
}

// ─── Fase 1 Planejamento: Restrições + Last Planner ───────────

export type ConstraintCategory =
    | 'projeto'
    | 'material'
    | 'contrato'
    | 'equipe'
    | 'equipamento'
    | 'aprovacao';

export interface ScheduleConstraint {
    id: string;
    organizationId: string;
    projectId: string;
    scheduleItemId: string;
    category: ConstraintCategory;
    description: string;
    status: 'open' | 'removed';
    responsible?: string;
    dueDate?: string;      // YYYY-MM-DD
    removedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface WeeklyCommitment {
    id: string;
    organizationId: string;
    projectId: string;
    scheduleItemId: string;
    weekStart: string;     // YYYY-MM-DD (segunda-feira)
    plannedQty?: number;
    doneQty?: number;
    isComplete?: boolean;
    failureReason?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PpcWeek {
    weekStart: string;
    plannedCount: number;
    completedCount: number;
    ppc: number | null;
}

// ──────────────────────────────────────────────────────────────

export interface BudgetVersion {
    id: string;
    item: number;
    date: string;
    description: string;
    budget: BudgetEntry[];
    settings: Partial<ProjectSettings>;
}

// Snapshot de uma versão do PLANEJAMENTO, vinculada a uma versão do orçamento.
// Espelha BudgetVersion, mas congela o cronograma em vez do orçamento.
export interface PlanningVersion {
    id: string;
    item: number;                      // sequencial (v1, v2…)
    date: string;                      // ISO
    description: string;
    budgetVersionId: string | null;    // FK -> BudgetVersion.id do orçamento vinculado (null = orçamento ao vivo)
    budgetVersionItem: number | null;  // rótulo para exibição (ex.: 2)
    schedule: ProjectSchedule;         // snapshot COMPLETO (itemSchedules, datas, baselines, resources)
}

export interface EapPhase {
    code: string;
    name: string;
}

export interface RequiredDoc {
    name: string;
    required: boolean;
    category?: 'legal' | 'tecnico' | 'ambiental' | 'seguranca';
}

export interface TemplateIndicator {
    key: string;
    label: string;
    unit: string;
}

export interface ChecklistTemplateItem {
    phase: 'pre_start' | 'in_progress' | 'pre_completion';
    items: string[];
}

export interface ProjectTypeTemplate {
    id?: string;
    tipo_obra: TipoObra;
    org_id?: string | null;
    eap_phases: EapPhase[];
    required_docs: RequiredDoc[];
    indicators: TemplateIndicator[];
    checklist_template: ChecklistTemplateItem[];
}
