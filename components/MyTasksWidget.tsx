import React, { useEffect, useState } from 'react';
import { CheckSquare, AlertTriangle, Calendar, ChevronRight, Loader2, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Task } from '../services/taskService';

interface Props {
    orgId?: string;
    onNavigate?: (view: string) => void;
}

const PRIORITY_COLOR: Record<number, string> = {
    1: 'bg-red-100 text-red-600',
    2: 'bg-orange-100 text-orange-600',
    3: 'bg-blue-100 text-blue-600',
    4: 'bg-slate-100 text-slate-500',
};
const PRIORITY_LABEL: Record<number, string> = { 1: 'Urgente', 2: 'Alta', 3: 'Normal', 4: 'Baixa' };

const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const isOverdue = (due: string | null | undefined) => {
    if (!due) return false;
    return new Date(due) < new Date(new Date().setHours(0, 0, 0, 0));
};

const MyTasksWidget: React.FC<Props> = ({ orgId, onNavigate }) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);

            let q = supabase
                .from('tasks')
                .select('*')
                .eq('status', 'open')
                .is('parent_task_id', null)
                .lte('due_date', endOfToday.toISOString())
                .order('priority', { ascending: true })
                .order('due_date', { ascending: true })
                .limit(5);

            if (orgId) q = q.eq('org_id', orgId);

            const { data } = await q;
            if (!cancelled) {
                setTasks((data ?? []) as Task[]);
                setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [orgId]);

    const overdueCount = tasks.filter(t => isOverdue(t.due_date)).length;
    const todayCount = tasks.filter(t => t.due_date && !isOverdue(t.due_date)).length;

    const markDone = async (id: string) => {
        setTasks(prev => prev.filter(t => t.id !== id));
        await supabase.from('tasks').update({ status: 'done' }).eq('id', id);
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
                        <CheckSquare className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-gray-900">Minhas Tarefas</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mt-0.5">
                            {overdueCount > 0
                                ? <span className="text-red-500">{overdueCount} atrasada{overdueCount > 1 ? 's' : ''}</span>
                                : null}
                            {overdueCount > 0 && todayCount > 0 ? ' · ' : null}
                            {todayCount > 0 ? `${todayCount} para hoje` : null}
                            {overdueCount === 0 && todayCount === 0 ? 'Nenhuma pendência hoje' : null}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => onNavigate?.('tarefas')}
                    className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors"
                >
                    Ver todas <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Body */}
            {loading ? (
                <div className="flex justify-center items-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                </div>
            ) : tasks.length === 0 ? (
                <div className="py-8 px-5 text-center">
                    <CheckSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nenhuma tarefa para hoje</p>
                    <button
                        onClick={() => onNavigate?.('tarefas')}
                        className="mt-3 flex items-center gap-1.5 mx-auto text-[11px] font-black text-blue-600 hover:text-blue-800 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" /> Nova tarefa
                    </button>
                </div>
            ) : (
                <ul className="divide-y divide-gray-50">
                    {tasks.map(t => (
                        <li key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors group">
                            {/* checkbox */}
                            <button
                                onClick={() => markDone(t.id)}
                                className="w-4 h-4 rounded border-2 border-gray-300 group-hover:border-blue-400 flex-shrink-0 transition-colors hover:bg-blue-50"
                                title="Marcar como concluída"
                            />
                            {/* content */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate leading-tight">{t.title}</p>
                                {t.due_date && (
                                    <p className={`text-[10px] font-bold flex items-center gap-1 mt-0.5 ${isOverdue(t.due_date) ? 'text-red-500' : 'text-gray-400'}`}>
                                        {isOverdue(t.due_date)
                                            ? <AlertTriangle className="w-3 h-3" />
                                            : <Calendar className="w-3 h-3" />}
                                        {fmtDate(t.due_date)}
                                    </p>
                                )}
                            </div>
                            {/* priority badge */}
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR[3]}`}>
                                {PRIORITY_LABEL[t.priority] ?? 'Normal'}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {/* Footer — link para ver mais se houver mais de 5 */}
            {tasks.length === 5 && (
                <div className="px-5 py-2.5 border-t border-gray-50 text-center">
                    <button
                        onClick={() => onNavigate?.('tarefas')}
                        className="text-[10px] font-black text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors"
                    >
                        Ver todas as tarefas →
                    </button>
                </div>
            )}
        </div>
    );
};

export default MyTasksWidget;
