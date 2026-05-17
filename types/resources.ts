export interface ResourceAllocation {
    id: string;
    resourceId: string;
    resourceType: 'ROLE' | 'WORKER' | 'TEAM';
    quantity: number;
    hoursPerDay: number;
}

export interface ResourceRole {
    id: string;
    name: string;
    description?: string;
    costPerHour: number;
    costPerDay: number;
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
