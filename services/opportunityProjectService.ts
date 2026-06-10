import { supabase } from '../lib/supabase';
import { projectMilestonesService, ProjectMilestone } from './projectMilestonesService';
import { financialReportService } from './financialReportService';

export interface ProjectPitchBasic {
    id: string;
    name: string;
    status?: string;
    start_date?: string | null;
    location?: string;
    diaryImages: string[];
}

export interface ProjectPitchFinancials {
    receita_realizada: number;
    custo_realizado: number;
    margem_realizada: number;
    resultado_liquido: number;
    ebitda: number;
}

export interface ProjectPitchData {
    project: ProjectPitchBasic;
    financials: ProjectPitchFinancials | null;
    milestones: ProjectMilestone[];
    physicalProgress: number; // 0–100, média ponderada das milestones
}

function calcPhysicalProgress(milestones: ProjectMilestone[]): number {
    if (milestones.length === 0) return 0;
    const completed = milestones.filter(m => m.status === 'completed');
    if (completed.length === 0) {
        const inProgress = milestones.find(m => m.status === 'in_progress');
        return inProgress ? Math.round(inProgress.physical_pct / 2) : 0;
    }
    // Média dos physical_pct concluídos em relação ao total de milestones
    const totalPct = milestones.reduce((sum, m) => sum + (m.physical_pct || 0), 0);
    const donePct  = completed.reduce((sum, m) => sum + (m.physical_pct || 0), 0);
    if (totalPct === 0) return Math.round((completed.length / milestones.length) * 100);
    return Math.round((donePct / totalPct) * 100);
}

export const opportunityProjectService = {

    async listForOrg(organizationId: string): Promise<{ id: string; name: string }[]> {
        const { data, error } = await supabase
            .from('projects')
            .select('id, name, settings')
            .filter('settings->>organizationId', 'eq', organizationId)
            .neq('name', 'Gestão Comercial')
            .order('name', { ascending: true });
        if (error) throw error;
        // Exclude non-obra projects (orçamentos, diários, planejamentos)
        const rows = (data ?? []) as { id: string; name: string; settings?: { classification?: string } }[];
        return rows.filter(p =>
            !p.settings?.classification || p.settings.classification === 'OBRA'
        ).map(({ id, name }) => ({ id, name }));
    },

    async getPitchData(projectId: string, organizationId: string): Promise<ProjectPitchData> {
        // Busca dados básicos + diaryEntries em paralelo com milestones
        const [projectRes, milestonesRes] = await Promise.all([
            supabase
                .from('projects')
                .select('id, name, settings, updated_at')
                .eq('id', projectId)
                .single(),
            projectMilestonesService.list(projectId),
        ]);

        if (projectRes.error) throw projectRes.error;

        const raw = projectRes.data as any;
        const settings = raw?.settings ?? {};

        const diaryImages: string[] = (settings.diaryEntries ?? [])
            .flatMap((e: any) => e.images ?? [])
            .filter(Boolean);

        const project: ProjectPitchBasic = {
            id: raw.id,
            name: raw.name,
            status: settings.status,
            start_date: settings.startDate ?? settings.start_date ?? null,
            location: settings.location ?? settings.address ?? null,
            diaryImages,
        };

        // DRE: de startDate até hoje; se não tiver, usa últimos 3 anos
        const today = new Date().toISOString().slice(0, 10);
        const dateFrom = project.start_date
            ? project.start_date.slice(0, 10)
            : new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        let financials: ProjectPitchFinancials | null = null;
        try {
            const summary = await financialReportService.getDRESummary(
                organizationId, dateFrom, today, projectId,
            );
            financials = {
                receita_realizada: summary.receita_bruta,
                custo_realizado:   summary.receita_bruta - (summary.lucro_bruto ?? 0),
                margem_realizada:  summary.lucro_bruto ?? 0,
                resultado_liquido: summary.resultado_liquido,
                ebitda:            summary.ebitda,
            };
        } catch {
            // DRE pode não ter dados para esse projeto — não é erro fatal
        }

        return {
            project,
            financials,
            milestones: milestonesRes,
            physicalProgress: calcPhysicalProgress(milestonesRes),
        };
    },
};
