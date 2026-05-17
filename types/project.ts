import { WBSGroup, BudgetEntry } from "./budget";
import { DiaryEntry } from "./diary";
import { FinancialInfo } from "./financial";
import { SchedulePeriod, ItemDistribution, ItemScheduleDetails, Baseline, ScheduleHistoryEntry, ReplanMode } from "./schedule";
import { ResourceRole, ResourceWorker, ResourceTeam } from "./resources";

export interface ProjectSettings {
    id?: string;
    name: string;
    client?: string;
    clientId?: string;
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
    code?: string;
    classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO';
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
    budgetStatus?: 'Em Andamento' | 'Fechado';
    status?: 'Em Andamento' | 'Finalizado' | 'Aprovado' | 'Proposta';
    obraStatus?: 'Não Iniciado' | 'Em andamento' | 'Concluída';
    budgetType?: 'ANALYTIC' | 'PARAMETRIC';
    linkedProjectId?: string;
    linkedProjectName?: string;
    investorId?: string;
    investorName?: string;
    startDate?: string;
    endDate?: string;
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
        holdings?: {
          name: string;
          cota: string;
          equity: string;
          status: string;
          yield: string;
          progress: number;
        }[];
        opportunities?: {
          title: string;
          subtitle: string;
          yield: string;
          link: string;
          openDate?: string;
        }[];
        performance?: { month: string; yield: number; percent: number }[];
        summary?: {
          equity?: string;
          monthlyYield?: string;
          activeWorks?: number;
          totalCotas?: number;
        };
        reports?: { name: string; date: string; type: string }[];
        };
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
    baselines?: Baseline[];
    activeBaselineId?: string;
    history?: ScheduleHistoryEntry[];
    replanMode?: ReplanMode;
    useWorkingDays?: boolean;
    resources?: {
        roles: ResourceRole[];
        workers: ResourceWorker[];
        teams: ResourceTeam[];
        };
}

export interface BudgetVersion {
    id: string;
    item: number;
    date: string;
    description: string;
    budget: BudgetEntry[];
    settings: Partial<ProjectSettings>;
}
