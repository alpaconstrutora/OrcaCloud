import React, { useMemo } from 'react';
import { AlertTriangle, Clock, ListTodo, Target } from 'lucide-react';

interface ScheduleItem {
    slack?: number;
    duration: number;
    [key: string]: unknown;
}

interface ScheduleResource {
    [key: string]: unknown;
}

interface SchedulePeriod {
    [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SettingsLike = any;
interface ProjectSummary {
    id: string;
    name: string;
    updated_at?: string;
    created_at?: string;
    settings?: SettingsLike;
}

interface PlanningDashboardProps {
    projects: ProjectSummary[];
}

interface StatCardProps {
    title: string;
    value: string | number;
    subtext?: string;
    icon: React.ElementType;
    color: string;
}

const StatCard = ({ title, value, subtext, icon: Icon, color }: StatCardProps) => (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex items-start justify-between hover:shadow-md transition-all">
        <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
            <h3 className="text-2xl font-black text-gray-900">{value}</h3>
            {subtext && <p className="text-xs mt-1.5 text-gray-500 font-medium">{subtext}</p>}
        </div>
        <div className={`p-4 rounded-2xl ${color === 'blue' ? 'bg-blue-50 text-blue-600' :
            color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                color === 'amber' ? 'bg-amber-50 text-amber-600' :
                    color === 'red' ? 'bg-red-50 text-red-600' :
                        'bg-gray-50 text-gray-600'
            }`}>
            <Icon className="w-6 h-6" />
        </div>
    </div>
);

const PlanningDashboard: React.FC<PlanningDashboardProps> = ({ projects }) => {
    const planningProjects = useMemo(() =>
        projects.filter(p => p.settings?.classification === 'PLANEJAMENTO'),
        [projects]);

    const totalCount = planningProjects.length;

    // KPI 1: Progresso Médio
    const avgProgress = useMemo(() => {
        const withProgress = planningProjects.filter(p => typeof p.settings?.obraProgress === 'number');
        if (withProgress.length === 0) return 0;
        const sum = withProgress.reduce((acc, p) => acc + (p.settings?.obraProgress || 0), 0);
        return Math.round(sum / withProgress.length * 10) / 10;
    }, [planningProjects]);

    // KPI 2: Atividades Críticas (folga zero nos itemSchedules)
    const criticalCount = useMemo(() => {
        let count = 0;
        for (const p of planningProjects) {
            const items = p.settings?.schedule?.itemSchedules || [];
            for (const item of items) {
                // Slack/float zero or negative = critical path
                if (item.slack !== undefined && item.slack <= 0 && item.duration > 0) {
                    count++;
                }
            }
        }
        return count;
    }, [planningProjects]);

    // KPI 3: Próximo Vencimento (dias até o fim do cronograma mais próximo)
    const nextDeadline = useMemo(() => {
        const now = new Date();
        let minDays = Infinity;
        let closestName = '';

        for (const p of planningProjects) {
            const endStr = p.settings?.schedule?.endDate;
            if (!endStr) continue;
            const end = new Date(endStr);
            const diffMs = end.getTime() - now.getTime();
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays < minDays) {
                minDays = diffDays;
                closestName = p.name;
            }
        }

        if (minDays === Infinity) return { days: null, name: '' };
        return { days: minDays, name: closestName };
    }, [planningProjects]);

    if (planningProjects.length === 0) return null;

    const deadlineValue = nextDeadline.days !== null
        ? (nextDeadline.days < 0
            ? `${Math.abs(nextDeadline.days)}d atraso`
            : `${nextDeadline.days} dias`)
        : '-';

    const deadlineColor = nextDeadline.days !== null
        ? (nextDeadline.days < 0 ? 'red' : nextDeadline.days <= 30 ? 'amber' : 'emerald')
        : 'gray';

    return (
        <div className="space-y-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Planejamentos"
                    value={totalCount}
                    subtext="Cronogramas ativos"
                    icon={ListTodo}
                    color="blue"
                />
                <StatCard
                    title="Progresso Médio"
                    value={`${avgProgress}%`}
                    subtext="Avanço físico médio"
                    icon={Target}
                    color="emerald"
                />
                <StatCard
                    title="Atividades Críticas"
                    value={criticalCount}
                    subtext="Tarefas com folga zero"
                    icon={AlertTriangle}
                    color={criticalCount > 0 ? 'red' : 'amber'}
                />
                <StatCard
                    title="Próximo Vencimento"
                    value={deadlineValue}
                    subtext={nextDeadline.name ? `${nextDeadline.name}` : 'Sem cronograma definido'}
                    icon={Clock}
                    color={deadlineColor}
                />
            </div>
        </div>
    );
};

export default PlanningDashboard;
