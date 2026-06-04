import { supabase } from '../lib/supabase';

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed';

export interface ProjectMilestone {
    id?: string;
    organization_id: string;
    project_id: string;
    name: string;
    planned_date?: string | null;
    completed_date?: string | null;
    status: MilestoneStatus;
    physical_pct: number;
    order_index: number;
    created_at?: string;
}

const COLS = 'id, organization_id, project_id, name, planned_date, completed_date, status, physical_pct, order_index, created_at';

export const projectMilestonesService = {
    async list(projectId: string): Promise<ProjectMilestone[]> {
        const { data, error } = await supabase
            .from('project_milestones')
            .select(COLS)
            .eq('project_id', projectId)
            .order('order_index', { ascending: true });
        if (error) throw error;
        return (data ?? []) as ProjectMilestone[];
    },

    async save(m: ProjectMilestone): Promise<ProjectMilestone> {
        if (m.id) {
            const { data, error } = await supabase
                .from('project_milestones')
                .update(m)
                .eq('id', m.id)
                .select(COLS)
                .single();
            if (error) throw error;
            return data as ProjectMilestone;
        }
        const { data, error } = await supabase
            .from('project_milestones')
            .insert(m)
            .select(COLS)
            .single();
        if (error) throw error;
        return data as ProjectMilestone;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('project_milestones').delete().eq('id', id);
        if (error) throw error;
    },
};
