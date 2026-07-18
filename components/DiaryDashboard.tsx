import React, { useMemo } from 'react';
import { BookOpen, AlertTriangle, Calendar, CheckCircle2 } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SettingsLike = any;
interface ProjectSummary {
    id: string;
    name: string;
    updated_at?: string;
    created_at?: string;
    settings?: SettingsLike;
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

const COLOR_MAP: Record<string, { border: string, bg: string, text: string, dot: string }> = {
    blue: { border: 'hover:border-blue-100', bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
    emerald: { border: 'hover:border-emerald-100', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
    amber: { border: 'hover:border-amber-100', bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' },
    red: { border: 'hover:border-red-100', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
    gray: { border: 'hover:border-gray-100', bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-500' },
};

const StatCard: React.FC<StatCardProps> = ({ title, value, subtext, icon: Icon, color }) => {
    const theme = COLOR_MAP[color] || COLOR_MAP.gray;
    return (
        <div className={`bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex items-center gap-5 group hover:shadow-lg transition-all ${theme.border}`}>
            <div className={`p-3.5 ${theme.bg} ${theme.text} rounded-[1.25rem] shrink-0 group-hover:scale-110 transition-transform`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{title}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 ${theme.dot} rounded-full shrink-0`}></span>
                    <p className="text-xs text-gray-400 font-medium truncate">{subtext}</p>
                </div>
            </div>
        </div>
    );
};

const DiaryDashboard: React.FC<DiaryDashboardProps> = ({ projects }) => {
    // Filter projects that are specifically classified as DIARIO or are OBRA with diary entries
    const diaryProjects = useMemo(() =>
        projects.filter(p =>
            (p.settings?.classification === 'DIARIO' || (p.settings?.classification === 'OBRA' && (p.settings?.diaryEntries?.length || 0) > 0))
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
