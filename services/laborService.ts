import { supabase } from '../lib/supabase';
import { validateDocumentFile } from '../lib/mimeValidation';

// ============================================================
// TIPOS LOCAIS
// ============================================================

export type ContractType = 'CLT' | 'PJ' | 'DIARISTA' | 'EMPREITEIRO' | 'ESTAGIARIO';
export type EmployeeStatus = 'ATIVO' | 'INATIVO' | 'AFASTADO' | 'DESLIGADO';
export type TimeEntryStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO';
export type TeamStatus = 'ATIVA' | 'INATIVA';
export type DocumentCategory = 'ASO' | 'NR' | 'IDENTIDADE' | 'CONTRATO' | 'TREINAMENTO' | 'OUTROS';
export type DocumentStatus = 'ATIVO' | 'VENCIDO' | 'PENDENTE';

export interface Employee {
    id: string;
    org_id: string;
    name: string;
    cpf?: string;
    phone?: string;
    email?: string;
    contract_type: ContractType;
    role: string;
    daily_cost: number;
    hourly_cost: number;
    base_salary: number;
    status: EmployeeStatus;
    hire_date?: string;
    termination_date?: string;
    termination_reason?: string;
    notes?: string;
    avatar_url?: string;
    admission_checklist?: string[];
    created_at?: string;
    updated_at?: string;

    // Novos campos Ficha de Registro
    father_name?: string;
    mother_name?: string;
    birth_date?: string;
    birth_place?: string;
    nationality?: string;
    marital_status?: string;
    rg_number?: string;
    rg_issuing_agency?: string;
    rg_issue_date?: string;
    ctps_number?: string;
    ctps_series?: string;
    ctps_issue_date?: string;
    ctps_uf?: string;
    military_doc?: string;
    military_category?: string;
    ethnicity?: string;
    gender?: string;
    education_level?: string;
    is_disabled?: boolean;
    voter_title_number?: string;
    voter_title_zone?: string;
    voter_title_section?: string;
    cbo?: string;
    residential_phone?: string;
    address_street?: string;
    address_number?: string;
    address_complement?: string;
    address_neighborhood?: string;
    address_city?: string;
    address_uf?: string;
    address_zip_code?: string;

    // joins
    allocations?: EmployeeAllocation[];
}

export interface EmployeeAllocation {
    id: string;
    employee_id: string;
    project_id?: string;
    project_name?: string;
    start_date: string;
    end_date?: string;
    is_active: boolean;
}

export interface LaborTeam {
    id: string;
    org_id: string;
    name: string;
    foreman_employee_id?: string;
    foreman_name?: string; // join
    project_id?: string;
    project_name?: string;
    description?: string;
    status: TeamStatus;
    created_at?: string;
    members?: Employee[];
}

export interface TimeEntry {
    id: string;
    employee_id: string;
    employee_name?: string; // join
    project_id?: string;
    project_name?: string;
    team_id?: string;
    date: string;
    hours_worked: number;
    overtime_hours: number;
    overtime_50: number;
    overtime_100: number;
    total_hours: number;
    night_hours: number;
    hourly_rate: number;
    total_cost?: number; // gerado pelo banco
    status: TimeEntryStatus;
    approved_by?: string;
    approved_at?: string;
    notes?: string;
    created_at?: string;
}

export interface ProductivityLog {
    id: string;
    employee_id?: string;
    employee_name?: string;
    team_id?: string;
    team_name?: string;
    project_id?: string;
    project_name?: string;
    phase?: string;
    activity_description: string;
    unit: string;
    planned_qty: number;
    actual_qty: number;
    hours_spent: number;
    man_hour_per_unit?: number;
    productivity_pct?: number;
    date: string;
    notes?: string;
    created_at?: string;
}

export interface LaborCostSummary {
    totalHours: number;
    totalOvertimeHours: number;
    totalCost: number;
    byEmployee: { employee_id: string; name: string; hours: number; cost: number }[];
    byProject: { project_name: string; hours: number; cost: number }[];
    byTeam: { team_id: string; name: string; hours: number; cost: number }[];
}

export interface EmployeeDocument {
    id: string;
    employee_id: string;
    employee_name?: string;
    org_id: string;
    category: DocumentCategory;
    title: string;
    file_url: string;
    expiry_date?: string;
    notes?: string;
    status: DocumentStatus;
    created_at?: string;
    updated_at?: string;
}

// ============================================================
// SERVICE
// ============================================================

export const laborService = {

    // ── EMPLOYEES ──────────────────────────────────────────

    async listEmployees(orgId?: string): Promise<Employee[]> {
        let query = supabase
            .from('employees')
            .select(`
                *,
                allocations:employee_allocations(*)
            `);

        if (orgId && orgId !== 'all') {
            query = query.eq('org_id', orgId);
        }

        const { data, error } = await query.order('name');
        if (error) throw error;
        return data || [];
    },

    async listOrgsWithActiveEmployees(): Promise<string[]> {
        const { data, error } = await supabase
            .from('employees')
            .select('org_id')
            .eq('status', 'ATIVO');
        if (error) throw error;
        // Saneamento: remove IDs nulos, vazios ou apenas com espaços
        return Array.from(new Set((data || []).map(e => e.org_id).filter(id => id && id.trim() !== '')));
    },

    async getEmployeeById(id: string): Promise<Employee> {
        const { data, error } = await supabase
            .from('employees')
            .select('*, allocations:employee_allocations(*)')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as Employee;
    },

    async createEmployee(employee: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<Employee> {
        const { data, error } = await supabase
            .from('employees')
            .insert(employee)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
        // Strip computed/join fields before sending to DB
        const { id: _id, created_at: _ca, updated_at: _ua, ...cleanUpdates } =
            updates as Partial<Employee> & { allocations?: unknown };
        const { data, error } = await supabase
            .from('employees')
            .update(cleanUpdates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteEmployee(id: string): Promise<void> {
        const { error } = await supabase
            .from('employees')
            .update({ status: 'DESLIGADO' })
            .eq('id', id);
        if (error) throw error;
    },

    async removeEmployee(id: string): Promise<void> {
        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ── ALLOCATIONS ────────────────────────────────────────

    async addAllocation(allocation: Omit<EmployeeAllocation, 'id'>): Promise<EmployeeAllocation> {
        const { data, error } = await supabase
            .from('employee_allocations')
            .insert(allocation)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async removeAllocation(id: string): Promise<void> {
        const { error } = await supabase
            .from('employee_allocations')
            .update({ is_active: false })
            .eq('id', id);
        if (error) throw error;
    },

    // ── TEAMS ──────────────────────────────────────────────

    async listTeams(orgId?: string): Promise<LaborTeam[]> {
        if (!orgId) return [];
        let query = supabase
            .from('labor_teams')
            .select(`
                *,
                members:team_members(
                    employee:employees(*)
                )
            `)
            .eq('org_id', orgId);
        const { data, error } = await query.order('name');
        if (error) throw error;

        type TeamJoin = Omit<LaborTeam, 'members'> & { members?: Array<{ employee: Employee }> };
        return (data as unknown as TeamJoin[] || []).map(t => ({
            ...t,
            members: (t.members || []).map(m => m.employee).filter(Boolean) as Employee[],
        }));
    },

    async createTeam(team: Omit<LaborTeam, 'id' | 'created_at' | 'members' | 'foreman_name'>): Promise<LaborTeam> {
        const cleanTeam = team;
        const { data, error } = await supabase
            .from('labor_teams')
            .insert(cleanTeam)
            .select()
            .single();
        if (error) throw error;
        return { ...data, members: [] };
    },

    async updateTeam(id: string, updates: Partial<LaborTeam>): Promise<LaborTeam> {
        const { id: _id, members: _members, foreman_name: _fn, ...clean } = updates;
        const { data, error } = await supabase
            .from('labor_teams')
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteTeam(id: string): Promise<void> {
        const { error } = await supabase
            .from('labor_teams')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async addTeamMember(teamId: string, employeeId: string): Promise<void> {
        const { error } = await supabase
            .from('team_members')
            .upsert({ team_id: teamId, employee_id: employeeId }, { onConflict: 'team_id,employee_id' });
        if (error) throw error;
    },

    async removeTeamMember(teamId: string, employeeId: string): Promise<void> {
        const { error } = await supabase
            .from('team_members')
            .delete()
            .eq('team_id', teamId)
            .eq('employee_id', employeeId);
        if (error) throw error;
    },

    // ── TIME ENTRIES ───────────────────────────────────────

    async listTimeEntries(filters: {
        orgId?: string;
        projectId?: string;
        employeeId?: string;
        status?: TimeEntryStatus;
        dateStart?: string;
        dateEnd?: string;
    }): Promise<TimeEntry[]> {
        let query = supabase
            .from('time_entries')
            .select(`
                *,
                employee:employees!employee_id(name, role, org_id)
            `)
            .order('date', { ascending: false });

        if (filters.projectId) query = query.eq('project_id', filters.projectId);
        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.dateStart) query = query.gte('date', filters.dateStart);
        if (filters.dateEnd) query = query.lte('date', filters.dateEnd);

        const { data, error } = await query;
        if (error) throw error;

        // Filtrar por org_id via join
        const orgData = (data || []).filter((e: TimeEntry & { employee?: { name: string; org_id: string } }) => !filters.orgId || e.employee?.org_id === filters.orgId);
        return orgData.map(e => ({
            ...e,
            employee_name: e.employee?.name,
        })) as TimeEntry[];
    },

    async createTimeEntry(entry: Omit<TimeEntry, 'id' | 'total_cost' | 'created_at' | 'employee_name'>): Promise<TimeEntry> {
        const clean = entry;
        const { data, error } = await supabase
            .from('time_entries')
            .insert(clean)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry> {
        const { id: _id, total_cost: _tc, employee_name: _en, ...clean } = updates;
        const { data, error } = await supabase
            .from('time_entries')
            .update(clean)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async approveTimeEntry(id: string, approvedBy: string): Promise<void> {
        const { error } = await supabase
            .from('time_entries')
            .update({ status: 'APROVADO', approved_by: approvedBy, approved_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async rejectTimeEntry(id: string, approvedBy: string): Promise<void> {
        const { error } = await supabase
            .from('time_entries')
            .update({ status: 'REJEITADO', approved_by: approvedBy, approved_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async deleteTimeEntry(id: string): Promise<void> {
        const { error } = await supabase.from('time_entries').delete().eq('id', id);
        if (error) throw error;
    },

    // ── PRODUCTIVITY ───────────────────────────────────────

    async listProductivityLogs(filters: {
        orgId?: string;
        projectId?: string;
        teamId?: string;
        dateStart?: string;
        dateEnd?: string;
    }): Promise<ProductivityLog[]> {
        let query = supabase
            .from('productivity_logs')
            .select(`
                *,
                employee:employees!employee_id(name, org_id),
                team:labor_teams!team_id(name)
            `)
            .order('date', { ascending: false });

        if (filters.projectId) query = query.eq('project_id', filters.projectId);
        if (filters.teamId) query = query.eq('team_id', filters.teamId);
        if (filters.dateStart) query = query.gte('date', filters.dateStart);
        if (filters.dateEnd) query = query.lte('date', filters.dateEnd);

        const { data, error } = await query;
        if (error) throw error;

        type ProdRow = ProductivityLog & { employee?: { name: string; org_id: string }; team?: { name: string } };
        const orgData = (data || []).filter((e: ProdRow) => !filters.orgId || e.employee?.org_id === filters.orgId);

        return orgData.map((p: ProdRow) => ({
            ...p,
            employee_name: p.employee?.name,
            team_name: p.team?.name,
        })) as ProductivityLog[];
    },

    async createProductivityLog(log: Omit<ProductivityLog, 'id' | 'man_hour_per_unit' | 'productivity_pct' | 'created_at' | 'employee_name' | 'team_name'>): Promise<ProductivityLog> {
        const clean = log;
        const { data, error } = await supabase
            .from('productivity_logs')
            .insert(clean)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteProductivityLog(id: string): Promise<void> {
        const { error } = await supabase.from('productivity_logs').delete().eq('id', id);
        if (error) throw error;
    },

    // ── COST SUMMARY ───────────────────────────────────────

    async getCostSummary(orgId?: string, filters?: {
        projectId?: string;
        dateStart?: string;
        dateEnd?: string;
    }): Promise<LaborCostSummary> {
        let query = supabase
            .from('time_entries')
            .select(`
                hours_worked, overtime_hours, total_cost, project_name,
                employee:employees!employee_id(id, name, org_id),
                team:labor_teams!team_id(id, name)
            `)
            .eq('status', 'APROVADO');

        if (filters?.projectId) query = query.eq('project_id', filters.projectId);
        if (filters?.dateStart) query = query.gte('date', filters.dateStart);
        if (filters?.dateEnd) query = query.lte('date', filters.dateEnd);

        const { data, error } = await query;
        if (error) throw error;

        type CostEntry = { hours_worked: number; overtime_hours: number; total_cost: number; project_name?: string; employee?: { id: string; name: string; org_id: string }; team?: { id: string; name: string } };
        const entries = ((data as unknown as CostEntry[]) || []).filter(e => !orgId || e.employee?.org_id === orgId);

        const totalHours = entries.reduce((s, e) => s + (e.hours_worked || 0), 0);
        const totalOvertimeHours = entries.reduce((s, e) => s + (e.overtime_hours || 0), 0);
        const totalCost = entries.reduce((s, e) => s + (e.total_cost || 0), 0);

        const byEmployeeMap = new Map<string, { name: string; hours: number; cost: number }>();
        const byProjectMap = new Map<string, { hours: number; cost: number }>();
        const byTeamMap = new Map<string, { name: string; hours: number; cost: number }>();

        entries.forEach(e => {
            const empId = e.employee?.id || 'unknown';
            const empName = e.employee?.name || 'Desconhecido';
            const proj = e.project_name || 'Sem obra';
            const teamId = e.team?.id || '';
            const teamName = e.team?.name || '';

            const prev = byEmployeeMap.get(empId) || { name: empName, hours: 0, cost: 0 };
            byEmployeeMap.set(empId, { ...prev, hours: prev.hours + e.hours_worked, cost: prev.cost + (e.total_cost || 0) });

            const prevP = byProjectMap.get(proj) || { hours: 0, cost: 0 };
            byProjectMap.set(proj, { hours: prevP.hours + e.hours_worked, cost: prevP.cost + (e.total_cost || 0) });

            if (teamId) {
                const prevT = byTeamMap.get(teamId) || { name: teamName, hours: 0, cost: 0 };
                byTeamMap.set(teamId, { ...prevT, hours: prevT.hours + e.hours_worked, cost: prevT.cost + (e.total_cost || 0) });
            }
        });

        return {
            totalHours,
            totalOvertimeHours,
            totalCost,
            byEmployee: Array.from(byEmployeeMap.entries()).map(([employee_id, v]) => ({ employee_id, ...v })),
            byProject: Array.from(byProjectMap.entries()).map(([project_name, v]) => ({ project_name, ...v })),
            byTeam: Array.from(byTeamMap.entries()).map(([team_id, v]) => ({ team_id, ...v })),
        };
    },

    // ── DOCUMENTS ──────────────────────────────────────────

    async listDocuments(filters: { employeeId?: string; orgId?: string; category?: DocumentCategory }): Promise<EmployeeDocument[]> {
        let query = supabase
            .from('employee_documents')
            .select(`
                *,
                employee:employees!employee_id(name)
            `)
            .order('created_at', { ascending: false });

        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.orgId) query = query.eq('org_id', filters.orgId);
        if (filters.category) query = query.eq('category', filters.category);

        const { data, error } = await query;
        if (error) throw error;

        type DocRow = EmployeeDocument & { employee?: { name: string } };
        return (data || [] as DocRow[]).map((d: DocRow) => ({
            ...d,
            employee_name: d.employee?.name
        }));
    },

    async uploadDocument(
        doc: Omit<EmployeeDocument, 'id' | 'created_at' | 'updated_at' | 'file_url'>,
        file: File
    ): Promise<EmployeeDocument> {
        // 0. Validação de MIME type — guarda obrigatória no service layer
        const validation = validateDocumentFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // 1. Upload file to Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${doc.employee_id}/${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `labor-documents/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('organization-assets')
            .upload(filePath, file);

        if (uploadError) {
            console.error('[LaborService] Storage Upload Error:', uploadError);
            if (uploadError.message.includes('bucket_not_found')) {
                throw new Error('O bucket "organization-assets" não foi encontrado. Por favor, crie-o no painel do Supabase Storage.');
            }
            throw uploadError;
        }

        // 2. Insert metadata in Database
        // Defesa contra UUIDs vazios
        const insertData = {
            ...doc,
            file_url: filePath,
            org_id: doc.org_id || undefined,
            employee_id: doc.employee_id || undefined
        };

        const { data, error } = await supabase
            .from('employee_documents')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            console.error('[LaborService] Database Insert Error:', error);
            // Cleanup storage if database insert fails
            await supabase.storage.from('organization-assets').remove([filePath]);
            throw error;
        }

        return data;
    },

    async updateDocument(
        id: string,
        updates: Pick<EmployeeDocument, 'category' | 'title' | 'expiry_date' | 'notes'>
    ): Promise<EmployeeDocument> {
        const { data, error } = await supabase
            .from('employee_documents')
            .update({
                category: updates.category,
                title: updates.title,
                expiry_date: updates.expiry_date || null,
                notes: updates.notes
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteDocument(id: string, filePath: string): Promise<void> {
        // 1. Delete from Database
        const { error: dbError } = await supabase
            .from('employee_documents')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Delete from Storage
        if (filePath) {
            await supabase.storage.from('organization-assets').remove([filePath]);
        }
    },

    async getDocumentsAlerts(orgId?: string): Promise<EmployeeDocument[]> {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = nextMonth.toISOString().split('T')[0];

        let query = supabase
            .from('employee_documents')
            .select(`
                *,
                employee:employees!employee_id(name)
            `)
            .lt('expiry_date', nextMonthStr)
            .order('expiry_date', { ascending: true });

        if (orgId) query = query.eq('org_id', orgId);

        const { data, error } = await query;
        if (error) throw error;

        type DocRow = EmployeeDocument & { employee?: { name: string } };
        return (data || [] as DocRow[]).map((d: DocRow) => ({
            ...d,
            employee_name: d.employee?.name
        }));
    },

    // ── MIGRATION ──────────────────────────────────────────

    async getLegacyWorkersCount(orgId?: string): Promise<number> {
        let query = supabase.from('organizations').select('resources');
        if (orgId) {
            query = query.eq('id', orgId);
        }
        
        const { data, error } = await query;
        if (error) return 0;
        
        let total = 0;
        (data as Array<{ resources?: { workers?: unknown[] } }>).forEach(org => {
            const workers = org.resources?.workers || [];
            total += workers.length;
        });
        return total;
    },

    async migrateLegacyWorkers(orgId?: string): Promise<{ imported: number, skipped: number }> {
        let query = supabase.from('organizations').select('id, resources');
        if (orgId) {
            query = query.eq('id', orgId);
        }
        
        const { data: orgs, error: orgError } = await query;
        if (orgError || !orgs) throw orgError || new Error('Organização não encontrada');
        
        let totalImported = 0;
        let totalSkipped = 0;

        for (const org of orgs) {
            const legacyWorkers = org.resources?.workers || [];
            if (legacyWorkers.length === 0) continue;

            const currentOrgId = org.id;

            // Buscar funcionários existentes para evitar duplicados por nome
            const { data: existing } = await supabase
                .from('employees')
                .select('name')
                .eq('org_id', currentOrgId);
            
            const existingNames = new Set((existing || []).map(e => e.name.toLowerCase()));
            
            let imported = 0;
            let skipped = 0;

            for (const worker of legacyWorkers) {
                if (existingNames.has(worker.name.toLowerCase())) {
                    skipped++;
                    continue;
                }

                const newEmployee = {
                    org_id: currentOrgId,
                    name: worker.name,
                    role: worker.roleName || worker.roleId || 'Colaborador',
                    contract_type: 'CLT' as const, // Default
                    status: 'ATIVO' as const,
                    daily_cost: worker.baseSalary || 0, // Using daily_cost as mapped from baseSalary
                    notes: `Migrado do sistema legatário em ${new Date().toLocaleDateString('pt-BR')}.`,
                };

                const { error: insError } = await supabase.from('employees').insert(newEmployee);
                if (!insError) imported++;
                else console.error('Error migrating worker:', worker.name, insError);
            }

            // Limpar os recursos legatários após migração bem-sucedida
            if (imported > 0 || skipped > 0) {
                const updatedResources = { ...org.resources, workers: [] };
                await supabase
                    .from('organizations')
                    .update({ resources: updatedResources })
                    .eq('id', currentOrgId);
            }

            totalImported += imported;
            totalSkipped += skipped;
        }

        return { imported: totalImported, skipped: totalSkipped };
    }
};
