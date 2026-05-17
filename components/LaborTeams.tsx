import React, { useState } from 'react';
import { Plus, Users, Trash2, UserPlus, X, Loader2, Shield, ChevronDown, Edit3 } from 'lucide-react';
import { laborService, LaborTeam, Employee } from '../services/laborService';

interface LaborTeamsProps {
    teams: LaborTeam[];
    employees: Employee[];
    projects: any[];
    orgId: string;
    onRefresh: () => void;
}

const LaborTeams: React.FC<LaborTeamsProps> = ({ teams, employees, projects, orgId, onRefresh }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingTeam, setEditingTeam] = useState<LaborTeam | null>(null);
    const [saving, setSaving] = useState(false);
    const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
    const [addingMemberTo, setAddingMemberTo] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: '',
        project_id: '',
        project_name: '',
        foreman_employee_id: '',
        description: '',
    });

    const openForm = (team?: LaborTeam) => {
        if (team) {
            setEditingTeam(team);
            setForm({ name: team.name, project_id: team.project_id || '', project_name: team.project_name || '', foreman_employee_id: team.foreman_employee_id || '', description: team.description || '' });
        } else {
            setEditingTeam(null);
            setForm({ name: '', project_id: '', project_name: '', foreman_employee_id: '', description: '' });
        }
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) { alert('Nome da equipe é obrigatório.'); return; }
        setSaving(true);
        try {
            const proj = projects.find(p => p.id === form.project_id);
            const payload = { ...form, org_id: orgId, status: 'ATIVA' as const, project_name: proj?.name || proj?.settings?.name || form.project_name };
            if (editingTeam) {
                await laborService.updateTeam(editingTeam.id, payload);
            } else {
                await laborService.createTeam(payload);
            }
            setShowForm(false);
            onRefresh();
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir esta equipe?')) return;
        await laborService.deleteTeam(id);
        onRefresh();
    };

    const handleAddMember = async (teamId: string, employeeId: string) => {
        if (!employeeId) return;
        await laborService.addTeamMember(teamId, employeeId);
        setAddingMemberTo(null);
        onRefresh();
    };

    const handleRemoveMember = async (teamId: string, employeeId: string) => {
        await laborService.removeTeamMember(teamId, employeeId);
        onRefresh();
    };

    const activeEmployees = employees.filter(e => e.status === 'ATIVO');
    const inputCls = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all";

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-end">
                <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20">
                    <Plus className="w-4 h-4" /> Nova Equipe
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest">
                            {editingTeam ? 'Editar Equipe' : 'Nova Equipe'}
                        </h3>
                        <button onClick={() => setShowForm(false)} className="p-1.5 bg-white/60 hover:bg-white rounded-lg transition-colors">
                            <X className="w-4 h-4 text-indigo-600" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Nome da Equipe *</label>
                            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="Ex: Equipe A - Alvenaria" />
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Encarregado</label>
                            <div className="relative">
                                <select value={form.foreman_employee_id} onChange={e => setForm(p => ({ ...p, foreman_employee_id: e.target.value }))} className={inputCls + ' appearance-none pr-6'}>
                                    <option value="">Nenhum</option>
                                    {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Obra de Alocação</label>
                            <div className="relative">
                                <select value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))} className={inputCls + ' appearance-none pr-6'}>
                                    <option value="">Sem obra</option>
                                    {projects.filter(p => p.settings?.classification === 'OBRA').map(p => (
                                        <option key={p.id} value={p.id}>{p.name || p.settings?.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block mb-1">Descrição</label>
                            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={inputCls} placeholder="Descrição ou especialidade..." />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white rounded-xl transition-all">Cancelar</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                            {editingTeam ? 'Salvar' : 'Criar Equipe'}
                        </button>
                    </div>
                </div>
            )}

            {/* Teams Grid */}
            {teams.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center text-slate-400">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">Nenhuma equipe criada</p>
                    <p className="text-sm mt-1">Crie equipes para organizar os colaboradores por especialidade ou obra.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {teams.map(team => {
                        const memberIds = new Set((team.members || []).map(m => m.id));
                        const availableToAdd = activeEmployees.filter(e => !memberIds.has(e.id));
                        const isExpanded = expandedTeam === team.id;
                        const foreman = employees.find(e => e.id === team.foreman_employee_id);

                        return (
                            <div key={team.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-all">
                                {/* Team Header */}
                                <div className="p-5 border-b border-slate-50">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="p-2.5 bg-indigo-100 rounded-xl shrink-0">
                                                <Shield className="w-4 h-4 text-indigo-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-black text-slate-900 truncate">{team.name}</h3>
                                                {team.project_name && (
                                                    <p className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md inline-block font-bold mt-1">{team.project_name}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => openForm(team)} className="p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors">
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => handleDelete(team.id)} className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    {foreman && (
                                        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
                                            <Users className="w-3 h-3" />
                                            <span className="font-bold">Encarregado:</span> {foreman.name}
                                        </div>
                                    )}
                                    {team.description && <p className="text-xs text-slate-500 mt-2">{team.description}</p>}
                                </div>

                                {/* Members */}
                                <div className="p-4">
                                    <button onClick={() => setExpandedTeam(isExpanded ? null : team.id)} className="w-full flex items-center justify-between text-xs font-black text-slate-500 uppercase tracking-widest hover:text-slate-700 transition-colors mb-3">
                                        <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{(team.members || []).length} membros</span>
                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isExpanded && (
                                        <div className="space-y-2">
                                            {(team.members || []).map(m => (
                                                <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-[10px] font-black">
                                                            {m.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-800">{m.name}</p>
                                                            <p className="text-[9px] text-slate-500">{m.role}</p>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleRemoveMember(team.id, m.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}

                                            {/* Add Member */}
                                            {addingMemberTo === team.id ? (
                                                <div className="flex gap-2 mt-2">
                                                    <select
                                                        className="flex-1 px-2 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg outline-none"
                                                        id={`add-member-${team.id}`}
                                                        defaultValue=""
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {availableToAdd.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}
                                                    </select>
                                                    <button
                                                        onClick={() => {
                                                            const sel = document.getElementById(`add-member-${team.id}`) as HTMLSelectElement;
                                                            handleAddMember(team.id, sel.value);
                                                        }}
                                                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
                                                    >Adicionar</button>
                                                    <button onClick={() => setAddingMemberTo(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                                                </div>
                                            ) : (
                                                availableToAdd.length > 0 && (
                                                    <button onClick={() => setAddingMemberTo(team.id)} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all mt-2">
                                                        <UserPlus className="w-3.5 h-3.5" /> Adicionar Membro
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default LaborTeams;
