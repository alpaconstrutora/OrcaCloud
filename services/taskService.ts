import { supabase } from '../lib/supabase';

export interface Task {
    id: string;
    org_id: string;
    user_id: string;
    title: string;
    description?: string | null;
    due_date?: string | null;
    priority: 1 | 2 | 3 | 4;   // 1=urgente 2=alta 3=normal 4=baixa
    status: 'open' | 'done' | 'snoozed';
    status_id?: string | null;
    snoozed_until?: string | null;
    source_module: string;
    source_ref?: { type: string; id: string; route?: string } | null;
    created_at: string;
    completed_at?: string | null;
    parent_task_id?: string | null;
}

export interface TaskStatus {
    id: string;
    org_id: string;
    name: string;
    color: string;
    position: number;
    is_default: boolean;
    is_done: boolean;
}

export const taskStatusService = {
    async list(orgId: string): Promise<TaskStatus[]> {
        const { data, error } = await supabase
            .from('task_statuses')
            .select('id, org_id, name, color, position, is_default, is_done')
            .eq('org_id', orgId)
            .order('position');
        if (error) throw error;
        return (data ?? []) as TaskStatus[];
    },

    async listAll(): Promise<TaskStatus[]> {
        const { data, error } = await supabase
            .from('task_statuses')
            .select('id, org_id, name, color, position, is_default, is_done')
            .order('org_id')
            .order('position');
        if (error) throw error;
        return (data ?? []) as TaskStatus[];
    },

    async create(status: Omit<TaskStatus, 'id'>): Promise<TaskStatus> {
        const { data, error } = await supabase
            .from('task_statuses')
            .insert(status)
            .select()
            .single();
        if (error) throw error;
        return data as TaskStatus;
    },

    async update(id: string, patch: Partial<Omit<TaskStatus, 'id'>>): Promise<void> {
        const { error } = await supabase.from('task_statuses').update(patch).eq('id', id);
        if (error) throw error;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('task_statuses').delete().eq('id', id);
        if (error) throw error;
    },
};

export type NewTask = Omit<Task, 'id' | 'created_at' | 'completed_at'>;

// ── "Minhas tarefas": criei OU sou o responsável ─────────────────────────────
// A RLS (aplicar_20271112998000) mostra ao proprietário/admin as tarefas da org com
// responsável ou em espaço — VER não é o mesmo que SER DELE. Badge e alerta são pessoais:
// só contam/disparam para o que eu criei ou de que sou o responsável (colaborador meu).
// "Colaborador meu" espelha public.is_employee_do_usuario_de: employees.user_id = eu, ou,
// sem vínculo, o e-mail igual ao da conta.

/** Escapa curinga de ILIKE (`%`, `_`, `\`): e-mail com `_` não pode casar outro e-mail. */
export function escaparIlike(v: string): string {
    return v.replace(/[\\%_]/g, c => `\\${c}`);
}

/** Corpo do `.or(...)` de "minhas tarefas". Sem colaborador vinculado, só as que criei. */
export function filtroMinhasTarefas(userId: string, employeeIds: string[]): string {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    return ids.length > 0
        ? `user_id.eq.${userId},assignee_employee_id.in.(${ids.join(',')})`
        : `user_id.eq.${userId}`;
}

export interface MinhaIdentidadeDeTarefas { userId: string; employeeIds: string[] }

let identidadeCache: { userId: string; em: number; valor: Promise<MinhaIdentidadeDeTarefas> } | null = null;
const IDENTIDADE_TTL_MS = 5 * 60_000;

/** Eu + os colaboradores que são eu. Null sem sessão. Cache de 5 min por conta. */
export async function minhaIdentidadeDeTarefas(): Promise<MinhaIdentidadeDeTarefas | null> {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user?.id) return null;
    if (identidadeCache && identidadeCache.userId === user.id && Date.now() - identidadeCache.em < IDENTIDADE_TTL_MS) {
        return identidadeCache.valor;
    }
    const valor = (async () => {
        const ids: string[] = [];
        const porVinculo = await supabase.from('employees').select('id').eq('user_id', user.id);
        for (const r of (porVinculo.data ?? []) as { id: string }[]) ids.push(r.id);
        const email = user.email?.trim();
        if (email) {
            const porEmail = await supabase.from('employees').select('id').is('user_id', null).ilike('email', escaparIlike(email));
            for (const r of (porEmail.data ?? []) as { id: string }[]) ids.push(r.id);
        }
        return { userId: user.id, employeeIds: [...new Set(ids)] };
    })();
    identidadeCache = { userId: user.id, em: Date.now(), valor };
    return valor;
}

/** Só para teste: esquece a identidade em cache. */
export function _esquecerIdentidadeDeTarefas(): void { identidadeCache = null; }

export const taskService = {
    // ── CRUD ─────────────────────────────────────────────────

    async list(opts?: { status?: Task['status']; org_id?: string }): Promise<Task[]> {
        let q = supabase
            .from('tasks')
            .select('*')
            .order('status',   { ascending: true })
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('priority', { ascending: true });

        if (opts?.status)  q = q.eq('status', opts.status);
        if (opts?.org_id)  q = q.eq('org_id', opts.org_id);

        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as Task[];
    },

    async create(task: NewTask): Promise<Task> {
        const { data, error } = await supabase
            .from('tasks')
            .insert(task)
            .select()
            .single();
        if (error) throw error;
        return data as Task;
    },

    async update(id: string, patch: Partial<Omit<Task, 'id' | 'created_at'>>): Promise<void> {
        const { error } = await supabase.from('tasks').update(patch).eq('id', id);
        if (error) throw error;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Contagem para badge ───────────────────────────────────
    /**
     * Total de tarefas abertas de raiz (Hoje + Atrasadas) do usuário logado — as MINHAS
     * (criei ou sou o responsável), não todas as que a RLS deixa ver (owner/admin vê as da org).
     */
    async openCount(): Promise<number> {
        // "do usuário logado" — então sem sessão não há o que contar. A guarda
        // existe porque o badge é montado no boot, antes do login: a consulta
        // saía com a chave anônima e, desde que o GRANT de `anon` deixou a
        // tabela (aplicar_20270916000003), responde 401. O `if (error) return 0`
        // abaixo já devolvia zero, então o badge nunca mentiu — mas fazia uma
        // ida ao servidor por render e sujava o console.
        const eu = await minhaIdentidadeDeTarefas();
        if (!eu) return 0;

        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const { count, error } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open')
            .is('parent_task_id', null) // só tarefas raiz — antes `.not(…, 'is', null)` contava só as subtarefas
            .or(`due_date.is.null,due_date.lte.${today.toISOString()}`)
            .or(filtroMinhasTarefas(eu.userId, eu.employeeIds));
        if (error) return 0;
        return count ?? 0;
    },

    // ── Gerador 1: OE atribuída → tarefa ─────────────────────
    /**
     * Cria tarefa automática quando uma OE é atribuída/atualizada.
     * Recebe o `responsible_id` (employee) e faz join com employees.user_id.
     * Idempotente: uq_tasks_source_open evita duplicatas enquanto aberta.
     */
    async ensureTaskForWorkOrder(opts: {
        workOrderId: string;
        workOrderCode: string;
        workOrderTitle: string;
        projectName: string;
        responsibleEmployeeId: string;
        dueDate?: string | null;
        orgId: string;
    }): Promise<void> {
        // Resolve auth user_id do employee responsável
        const { data: emp } = await supabase
            .from('employees')
            .select('user_id')
            .eq('id', opts.responsibleEmployeeId)
            .maybeSingle();

        const userId: string | null = (emp as { user_id?: string } | null)?.user_id ?? null;
        if (!userId) return; // employee não tem usuário vinculado — não cria tarefa

        const { error } = await supabase.rpc('create_task', {
            p_user_id:       userId,
            p_org_id:        opts.orgId,
            p_title:         `OE ${opts.workOrderCode}: ${opts.workOrderTitle}`,
            p_due:           opts.dueDate ?? null,
            p_source_module: 'operacional',
            p_source_ref:    { type: 'work_order', id: opts.workOrderId, route: 'operacional' },
            p_priority:      2,
            p_description:   `Obra: ${opts.projectName}`,
        });
        if (error) console.warn('[taskService] ensureTaskForWorkOrder:', error.message);
    },
};
