export interface ResourceAllocation {
    id: string;
    resourceId: string;
    resourceType: 'ROLE' | 'WORKER' | 'TEAM' | 'MATERIAL' | 'COST';
    quantity: number;
    hoursPerDay: number;
    overtimeHours?: number; // horas extras/dia (só ROLE/WORKER/TEAM); usa costPerUse do ResourceRole
    fixedCost?: number;     // custo fixo por alocação (só resourceType 'COST' — não multiplica por duração)
}

export interface ResourceRole {
    id: string;
    name: string;
    description?: string;
    costPerHour: number;
    costPerDay: number;
    overtimeCostPerHour?: number; // custo/hora de hora extra; default = costPerHour * 1.5 se ausente
    costPerUse?: number;          // custo fixo por uso (ex: taxa de deslocamento), somado uma vez por alocação
    workDays?: number[];          // calendário próprio (0=Dom..6=Sáb); ausente = herda o calendário do projeto
    holidays?: string[];          // feriados/exceções próprias (ISO 'YYYY-MM-DD'), somadas às do projeto
    source?: string;
    organizationId?: string;
}

/** Recurso de material: custo por unidade, consumido uma vez pela tarefa (não multiplica por duração). */
export interface ResourceMaterial {
    id: string;
    name: string;
    unit: string;
    costPerUnit: number;
    source?: string;
    organizationId?: string;
}

export interface LaborCompany {
    id: string;
    name: string;
    cnpj?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    created_at?: string;
}

export interface ResourceWorker {
    id: string;
    name: string;
    roleId: string;
    teamId?: string;
    email?: string;
    phone?: string;
    workDays?: number[]; // calendário próprio; ausente = herda o do cargo (ResourceRole), depois o do projeto
    holidays?: string[];
    source?: string;
    companyId?: string;
    organizationId?: string;
}

export interface ResourceTeam {
    id: string;
    name: string;
    memberIds: string[];
    source?: string;
    companyId?: string;
    organizationId?: string;
}
