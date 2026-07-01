import React from 'react';
import { Clock, Plus, Trash2, Check } from 'lucide-react';
import { projectMilestonesService, ProjectMilestone, MilestoneStatus } from '../../services/projectMilestonesService';
import Button from '../ui/Button';

interface Props {
    projectId?: string;
    organizationId?: string;
    isAdmin?: boolean;
}

const STATUS_CYCLE: MilestoneStatus[] = ['pending', 'in_progress', 'completed'];

const dotClass = (status: MilestoneStatus) =>
    status === 'completed' ? 'bg-emerald-500 border-emerald-500'
        : status === 'in_progress' ? 'bg-white border-blue-500 animate-pulse'
            : 'bg-white border-gray-300';

const labelClass = (status: MilestoneStatus) =>
    status === 'completed' ? 'text-gray-900'
        : status === 'in_progress' ? 'text-blue-600'
            : 'text-gray-400';

const formatDate = (iso?: string | null) => {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
};

const ObraTimeline: React.FC<Props> = ({ projectId, organizationId, isAdmin }) => {
    const [milestones, setMilestones] = React.useState<ProjectMilestone[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [newName, setNewName] = React.useState('');

    React.useEffect(() => {
        if (!projectId) { setLoading(false); return; }
        projectMilestonesService.list(projectId)
            .then(setMilestones)
            .catch(err => console.error('Error loading milestones', err))
            .finally(() => setLoading(false));
    }, [projectId]);

    const handleAdd = async () => {
        if (!newName.trim() || !projectId || !organizationId) return;
        try {
            const saved = await projectMilestonesService.save({
                organization_id: organizationId,
                project_id: projectId,
                name: newName.trim(),
                status: 'pending',
                physical_pct: 0,
                order_index: milestones.length,
            });
            setMilestones(prev => [...prev, saved]);
            setNewName('');
        } catch (err) {
            console.error('Error adding milestone', err);
        }
    };

    const cycleStatus = async (m: ProjectMilestone) => {
        const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(m.status) + 1) % STATUS_CYCLE.length];
        try {
            const saved = await projectMilestonesService.save({
                ...m,
                status: next,
                completed_date: next === 'completed' ? new Date().toISOString().slice(0, 10) : null,
            });
            setMilestones(prev => prev.map(x => (x.id === m.id ? saved : x)));
        } catch (err) {
            console.error('Error updating milestone', err);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await projectMilestonesService.remove(id);
            setMilestones(prev => prev.filter(m => m.id !== id));
        } catch (err) {
            console.error('Error deleting milestone', err);
        }
    };

    if (loading) {
        return <p className="text-xs text-gray-400 py-4">Carregando linha do tempo...</p>;
    }

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-400" />
                Linha do Tempo da Obra
            </h3>

            {milestones.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Nenhum marco cadastrado.</p>
            ) : (
                <div className="relative border-l-2 border-gray-100 ml-4 space-y-8 py-2">
                    {milestones.map((m) => (
                        <div key={m.id} className="relative pl-8 group">
                            <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${dotClass(m.status)}`} />
                            <div className="flex items-start justify-between">
                                <div>
                                    <h4 className={`text-sm font-bold ${labelClass(m.status)}`}>{m.name}</h4>
                                    <p className="text-xs text-gray-400">
                                        {m.status === 'completed' && m.completed_date
                                            ? `Concluído • ${formatDate(m.completed_date)}`
                                            : formatDate(m.planned_date) || (m.status === 'in_progress' ? 'Em andamento' : 'Previsto')}
                                        {m.physical_pct > 0 && ` • ${m.physical_pct}%`}
                                    </p>
                                </div>
                                {isAdmin && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => cycleStatus(m)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                            title="Avançar status"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(m.id!)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Remover"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isAdmin && organizationId && (
                <div className="flex gap-2 pt-2">
                    <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                        placeholder="Novo marco (ex: Fundação)"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAdd}
                    >
                        <Plus className="w-4 h-4" /> Marco
                    </Button>
                </div>
            )}
        </div>
    );
};

export default ObraTimeline;
