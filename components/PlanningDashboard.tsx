import React, { useMemo } from 'react';
import { AlertTriangle, Clock, ListTodo, Target } from 'lucide-react';
import { KpiCard } from './ui/KpiCard';

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
        <div className="animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Total Planejamentos"
                    value={totalCount}
                    sub="Cronogramas ativos"
                    icon={<ListTodo className="w-5 h-5" />}
                    color="blue"
                />
                <KpiCard
                    label="Progresso Médio"
                    value={`${avgProgress}%`}
                    sub="Avanço físico médio"
                    icon={<Target className="w-5 h-5" />}
                    color="emerald"
                />
                <KpiCard
                    label="Atividades Críticas"
                    value={criticalCount}
                    sub="Tarefas com folga zero"
                    icon={<AlertTriangle className="w-5 h-5" />}
                    color={criticalCount > 0 ? 'red' : 'amber'}
                />
                <KpiCard
                    label="Próximo Vencimento"
                    value={deadlineValue}
                    sub={nextDeadline.name ? `${nextDeadline.name}` : 'Sem cronograma definido'}
                    icon={<Clock className="w-5 h-5" />}
                    color={deadlineColor}
                />
            </div>
        </div>
    );
};

export default PlanningDashboard;
