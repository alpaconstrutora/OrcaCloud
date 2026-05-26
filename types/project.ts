import { WBSGroup, BudgetEntry } from "./budget";
import { DiaryEntry } from "./diary";
import { FinancialInfo } from "./financial";
import { SchedulePeriod, ItemDistribution, ItemScheduleDetails, Baseline, ScheduleHistoryEntry, ReplanMode } from "./schedule";
import { ResourceRole, ResourceWorker, ResourceTeam } from "./resources";

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
