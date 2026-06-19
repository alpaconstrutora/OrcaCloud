import { supabase } from '../lib/supabase';
import {
    ScheduleConstraint,
    ConstraintCategory,
    WeeklyCommitment,
    PpcWeek,
} from '../types';

// ─── helpers ──────────────────────────────────────────────────

function toConstraint(r: Record<string, unknown>): ScheduleConstraint {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        projectId: r.project_id as string,
        scheduleItemId: r.schedule_item_id as string,
        category: r.category as ConstraintCategory,
        description: r.description as string,
        status: r.status as 'open' | 'removed',
        responsible: r.responsible as string | undefined,
        dueDate: r.due_date as string | undefined,
        removedAt: r.removed_at as string | undefined,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
    };
}

function toCommitment(r: Record<string, unknown>): WeeklyCommitment {
    return {
        id: r.id as string,
        organizationId: r.organization_id as string,
        projectId: r.project_id as string,
        scheduleItemId: r.schedule_item_id as string,
        weekStart: r.week_start as string,
        plannedQty: r.planned_qty as number | undefined,
        doneQty: r.done_qty as number | undefined,
        isComplete: r.is_complete as boolean | undefined,
        failureReason: r.failure_reason as string | undefined,
        notes: r.notes as string | undefined,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
    };
}

// ─── Constraints ──────────────────────────────────────────────

export const scheduleConstraintsService = {

    async listByProject(
        organizationId: string,
        projectId: string,
    ): Promise<ScheduleConstraint[]> {
        const { data, error } = await supabase
            .from('schedule_constraints')
            .select('id,organization_id,project_id,schedule_item_id,category,description,status,responsible,due_date,removed_at,created_at,updated_at')
            .eq('organization_id', organizationId)
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(toConstraint);
    },

    async create(
        organizationId: string,
        projectId: string,
        payload: {
            scheduleItemId: string;
            category: ConstraintCategory;
            description: string;
            responsible?: string;
            dueDate?: string;
        },
    ): Promise<ScheduleConstraint> {
        const { data, error } = await supabase
            .from('schedule_constraints')
            .insert({
                organization_id: organizationId,
                project_id: projectId,
                schedule_item_id: payload.scheduleItemId,
                category: payload.category,
                description: payload.description,
                responsible: payload.responsible ?? null,
                due_date: payload.dueDate ?? null,
            })
            .select('id,organization_id,project_id,schedule_item_id,category,description,status,responsible,due_date,removed_at,created_at,updated_at')
            .single();
        if (error) throw error;
        return toConstraint(data);
    },

    async update(
        id: string,
        payload: Partial<{
            description: string;
            category: ConstraintCategory;
            responsible: string;
            dueDate: string;
        }>,
    ): Promise<void> {
        const patch: Record<string, unknown> = {};
        if (payload.description !== undefined) patch.description = payload.description;
        if (payload.category !== undefined) patch.category = payload.category;
        if (payload.responsible !== undefined) patch.responsible = payload.responsible;
        if (payload.dueDate !== undefined) patch.due_date = payload.dueDate;
        const { error } = await supabase
            .from('schedule_constraints')
            .update(patch)
            .eq('id', id);
        if (error) throw error;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('schedule_constraints')
            .update({ status: 'removed', removed_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async reopen(id: string): Promise<void> {
        const { error } = await supabase
            .from('schedule_constraints')
            .update({ status: 'open', removed_at: null })
            .eq('id', id);
        if (error) throw error;
    },
};

// ─── Weekly Commitments ───────────────────────────────────────

export const weeklyCommitmentsService = {

    async listByProject(
        organizationId: string,
        projectId: string,
        weekStart?: string,
    ): Promise<WeeklyCommitment[]> {
        let q = supabase
            .from('weekly_commitments')
            .select('id,organization_id,project_id,schedule_item_id,week_start,planned_qty,done_qty,is_complete,failure_reason,notes,created_at,updated_at')
            .eq('organization_id', organizationId)
            .eq('project_id', projectId);
        if (weekStart) q = q.eq('week_start', weekStart);
        const { data, error } = await q.order('week_start', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(toCommitment);
    },

    async upsert(
        organizationId: string,
        projectId: string,
        payload: {
            scheduleItemId: string;
            weekStart: string;
            plannedQty?: number;
            doneQty?: number;
            isComplete?: boolean;
            failureReason?: string;
            notes?: string;
        },
    ): Promise<WeeklyCommitment> {
        const { data, error } = await supabase
            .from('weekly_commitments')
            .upsert(
                {
                    organization_id: organizationId,
                    project_id: projectId,
                    schedule_item_id: payload.scheduleItemId,
                    week_start: payload.weekStart,
                    planned_qty: payload.plannedQty ?? null,
                    done_qty: payload.doneQty ?? null,
                    is_complete: payload.isComplete ?? null,
                    failure_reason: payload.failureReason ?? null,
                    notes: payload.notes ?? null,
                },
                { onConflict: 'project_id,schedule_item_id,week_start' },
            )
            .select('id,organization_id,project_id,schedule_item_id,week_start,planned_qty,done_qty,is_complete,failure_reason,notes,created_at,updated_at')
            .single();
        if (error) throw error;
        return toCommitment(data);
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('weekly_commitments')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async getPpc(organizationId: string, projectId: string): Promise<PpcWeek[]> {
        const { data, error } = await supabase.rpc('fn_ppc', {
            p_organization_id: organizationId,
            p_project_id: projectId,
        });
        if (error) throw error;
        return (data ?? []).map((r: Record<string, unknown>) => ({
            weekStart: r.week_start as string,
            plannedCount: Number(r.planned_count),
            completedCount: Number(r.completed_count),
            ppc: r.ppc !== null ? Number(r.ppc) : null,
        }));
    },
};
