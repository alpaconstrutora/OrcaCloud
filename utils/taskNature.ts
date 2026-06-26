import { TaskNature } from '../types/schedule';

/**
 * Apresentação da Natureza da Tarefa (rótulo PT-BR + cor). Mantido separado do enum
 * (em types) para não acoplar tipos a estilos. Cores são hex (usadas em badge/dot no
 * Gantt e no grid). Ver PLANO_MODULO_TIPOS_NATUREZA_TAREFAS.md.
 */
export interface TaskNatureMeta {
    label: string;
    color: string;   // hex — usado em dot/badge
    badge: string;   // classes tailwind para o chip (bg + text)
}

export const TASK_NATURE_META: Record<TaskNature, TaskNatureMeta> = {
    [TaskNature.PRODUCAO]:     { label: 'Produção',      color: '#3b82f6', badge: 'bg-blue-100 text-blue-700' },
    [TaskNature.COMPRA]:       { label: 'Compra',        color: '#f59e0b', badge: 'bg-amber-100 text-amber-700' },
    [TaskNature.CONTRATACAO]:  { label: 'Contratação',   color: '#8b5cf6', badge: 'bg-violet-100 text-violet-700' },
    [TaskNature.APROVACAO]:    { label: 'Aprovação',     color: '#6366f1', badge: 'bg-indigo-100 text-indigo-700' },
    [TaskNature.INSPECAO]:     { label: 'Inspeção',      color: '#14b8a6', badge: 'bg-teal-100 text-teal-700' },
    [TaskNature.SEGURANCA]:    { label: 'Segurança',     color: '#ef4444', badge: 'bg-red-100 text-red-700' },
    [TaskNature.QUALIDADE]:    { label: 'Qualidade',     color: '#22c55e', badge: 'bg-green-100 text-green-700' },
    [TaskNature.FINANCEIRO]:   { label: 'Financeiro',    color: '#10b981', badge: 'bg-emerald-100 text-emerald-700' },
    [TaskNature.BIM]:          { label: 'BIM',           color: '#0ea5e9', badge: 'bg-sky-100 text-sky-700' },
    [TaskNature.DOCUMENTACAO]: { label: 'Documentação',  color: '#64748b', badge: 'bg-slate-100 text-slate-700' },
    [TaskNature.RH]:           { label: 'RH',            color: '#ec4899', badge: 'bg-pink-100 text-pink-700' },
    [TaskNature.MANUTENCAO]:   { label: 'Manutenção',    color: '#a16207', badge: 'bg-yellow-100 text-yellow-800' },
};

export const TASK_NATURE_LIST: TaskNature[] = Object.values(TaskNature);

export const natureLabel = (n?: TaskNature): string => (n ? TASK_NATURE_META[n].label : '');
