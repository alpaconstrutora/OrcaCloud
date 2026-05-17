import React, { useMemo } from 'react';
import { BookOpen, AlertTriangle, Calendar, CheckCircle2 } from 'lucide-react';

interface ProjectSummary {
    id: string;
    name: string;
    updated_at: string;
    created_at: string;
    settings?: {
        diaryEntries?: any[];
        [key: string]: any;
    };
}

interface DiaryDashboardProps {
    projects: ProjectSummary[];
}

interface StatCardProps {
    title: string;
    value: string | number;
    subtext?: string;
    icon: React.ElementType;
    color: 'blue' | 'emerald' | 'amber' | 'gray';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtext, icon: Icon, color }) => (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex items-start justify-between hover:shadow-md transition-all">
        <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
            <h3 className="text-2xl font-black text-gray-900">{value}</h3>
            {subtext && <p className="text-xs mt-1.5 text-gray-500 font-medium">{subtext}</p>}
        </div>
        <div className={`p-4 rounded-2xl ${color === 'blue' ? 'bg-blue-50 text-blue-600' :
            color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                color === 'amber' ? 'bg-amber-50 text-amber-600' :
                    'bg-gray-50 text-gray-600'
            }`}>
            <Icon className="w-6 h-6" />
        </div>
    </div>
);

const DiaryDashboard: React.FC<DiaryDashboardProps> = ({ projects }) => {
    // Filter projects that are specifically classified as DIARIO or are OBRA with diary entries
    const diaryProjects = useMemo(() =>
        projects.filter(p =>
            (p.settings?.classification === 'DIARIO' || (p.settings?.classification === 'OBRA' && (p.settings?.diaryEntries?.length || 0) > 0)) &&
            p.name !== 'Gestão Comercial'
        ),
        [projects]);

    const stats = useMemo<{ totalEntries: number; totalImpediments: number; lastUpdate: Date | null; worksWithEntries: number }>(() => {
        let totalEntries = 0;
        let totalImpediments = 0;
        let lastUpdate: Date | null = null;
        let worksWithEntries = 0;

        diaryProjects.forEach(p => {
            const diaryEntries = p.settings?.diaryEntries || [];
            if (diaryEntries.length > 0 || p.settings?.classification === 'DIARIO') {
                if (diaryEntries.length > 0) worksWithEntries++;
                totalEntries += diaryEntries.length;

                diaryEntries.forEach((entry: any) => {
                    if (entry.impediments && entry.impediments.trim() !== '') {
                        totalImpediments++;
                    }
                    const entryDate = new Date(entry.date + 'T12:00:00');
                    if (!lastUpdate || entryDate > lastUpdate) {
                        lastUpdate = entryDate;
                    }
                });
            }
        });

        return {
            totalEntries,
            totalImpediments,
            lastUpdate,
            worksWithEntries
        };
    }, [diaryProjects]);

    if (diaryProjects.length === 0 && projects.filter(p => p.settings?.classification === 'DIARIO').length === 0) return null;

    return (
        <div className="space-y-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total de Projetos"
                    value={diaryProjects.length}
                    subtext={`${stats.worksWithEntries} obras com diários`}
                    icon={BookOpen}
                    color="blue"
                />
                <StatCard
                    title="Registros Totais"
                    value={stats.totalEntries}
                    subtext="Soma de todos os dias operados"
                    icon={CheckCircle2}
                    color="emerald"
                />
                <StatCard
                    title="Impedimentos"
                    value={stats.totalImpediments}
                    subtext="Ocorrências registradas"
                    icon={AlertTriangle}
                    color="amber"
                />
                <StatCard
                    title="Última Atividade"
                    value={stats.lastUpdate ? stats.lastUpdate.toLocaleDateString('pt-BR') : '-'}
                    subtext="Registro mais recente"
                    icon={Calendar}
                    color="gray"
                />
            </div>
        </div>
    );
};

export default DiaryDashboard;
