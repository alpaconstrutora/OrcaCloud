import React, { useState, useEffect } from 'react';
import {
    Briefcase, Plus, Trash2, Pencil, X, Building2, Loader2, AlertCircle,
    Layers, DollarSign, Star, ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { orgGovernanceService } from '../services/orgGovernanceService';
import { laborService, Employee } from '../services/laborService';
import { useConfirm } from './ui/confirm';
import { OrgRole } from '../types';

interface LaborCargosProps {
    orgId: string;
}

interface CompanyOption {
    id: string;
    razao_social: string;
    tipo: string;
}

interface RoleForm {
    id?: string;
    nome: string;
    codigo: string;
    descricao: string;
    nivel_hierarquico: number;
    responsabilidades: string;
    salario_minimo: string;
    salario_maximo: string;
    competencias: string;
    proximo_cargo_id: string;
}

const EMPTY_FORM: RoleForm = {
    nome: '', codigo: '', descricao: '', nivel_hierarquico: 3,
    responsabilidades: '', salario_minimo: '', salario_maximo: '',
    competencias: '', proximo_cargo_id: '',
};

const BRL = (v: number | null | undefined) =>
    v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }) : null;

const LaborCargos: React.FC<LaborCargosProps> = ({ orgId }) => {
    const confirm = useConfirm();
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
    const [roles, setRoles] = useState<OrgRole[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState<RoleForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function loadCompanies() {
            if (!orgId) { setLoading(false); return; }
            try {
                const { data, error } = await supabase
                    .from('companies')
                    .select('id, razao_social, tipo')
                    .eq('org_id', orgId);
                if (error) throw error;
                if (cancelled) return;
                setCompanies(data || []);
                if (data && data.length > 0) setSelectedCompanyId(data[0].id);
                else setLoading(false);
            } catch (err) {
                if (!cancelled) { setError((err as Error).message); setLoading(false); }
            }
        }
        loadCompanies();
        return () => { cancelled = true; };
    }, [orgId]);

    useEffect(() => {
        let cancelled = false;
        async function loadData() {
            if (!selectedCompanyId) { setLoading(false); return; }
            setLoading(true);
            setError(null);
            try {
                const [rolesData, employeesData] = await Promise.all([
                    orgGovernanceService.listRoles(selectedCompanyId),
                    laborService.listEmployees(orgId || undefined, selectedCompanyId),
                ]);
                if (cancelled) return;
                setRoles(rolesData);
                setEmployees(employeesData);
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadData();
        return () => { cancelled = true; };
    }, [selectedCompanyId, orgId]);

    const reloadRoles = async () => {
        const data = await orgGovernanceService.listRoles(selectedCompanyId);
        setRoles(data);
    };

    const openCreate = () => { setForm(EMPTY_FORM); setIsModalOpen(true); };
    const openEdit = (role: OrgRole) => {
        setForm({
            id: role.id,
            nome: role.nome,
            codigo: role.codigo || '',
            descricao: role.descricao || '',
            nivel_hierarquico: role.nivel_hierarquico,
            responsabilidades: (role.responsabilidades || []).join('\n'),
            salario_minimo: role.salario_minimo != null ? String(role.salario_minimo) : '',
            salario_maximo: role.salario_maximo != null ? String(role.salario_maximo) : '',
            competencias: (role.competencias || []).join('\n'),
            proximo_cargo_id: role.proximo_cargo_id || '',
        });
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.nome || !selectedCompanyId) return;
        setSaving(true);
        try {
            await orgGovernanceService.saveRole({
                id: form.id,
                company_id: selectedCompanyId,
                nome: form.nome,
                codigo: form.codigo || null,
                descricao: form.descricao || null,
                nivel_hierarquico: form.nivel_hierarquico,
                responsabilidades: form.responsabilidades.split('\n').map(s => s.trim()).filter(Boolean),
                salario_minimo: form.salario_minimo ? Number(form.salario_minimo) : null,
                salario_maximo: form.salario_maximo ? Number(form.salario_maximo) : null,
                competencias: form.competencias.split('\n').map(s => s.trim()).filter(Boolean),
                proximo_cargo_id: form.proximo_cargo_id || null,
            });
            setIsModalOpen(false);
            setForm(EMPTY_FORM);
            await reloadRoles();
        } catch (err) {
            alert('Erro ao salvar cargo: ' + (err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (role: OrgRole) => {
        const occupants = employees.filter(emp => emp.role_id === role.id && emp.status === 'ATIVO');
        const msg = occupants.length > 0
            ? `Este cargo tem ${occupants.length} colaborador(es) ativo(s) associado(s). Eles ficarão sem cargo.`
            : 'Isso removerá o cargo definitivamente.';
        if (!await confirm({ title: `Excluir cargo ${role.nome}?`, message: msg, variant: 'danger', confirmLabel: 'Excluir' })) return;
        try {
            await orgGovernanceService.deleteRole(role.id);
            setRoles(roles.filter(r => r.id !== role.id));
        } catch (err) {
            alert('Erro ao excluir cargo: ' + (err as Error).message);
        }
    };

    if (!orgId) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-800 max-w-lg mx-auto mt-10">
                <Building2 className="w-10 h-10 mx-auto mb-3 text-amber-500" />
                <h3 className="font-black text-sm uppercase tracking-wider">Selecione uma organização</h3>
                <p className="text-xs mt-2 text-amber-700">Selecione uma organização específica no filtro acima para gerenciar os cargos.</p>
            </div>
        );
    }

    const vacantCount = roles.filter(r => !employees.some(e => e.role_id === r.id && e.status === 'ATIVO')).length;
    const niveis = Array.from(new Set(roles.map(r => r.nivel_hierarquico))).sort((a, b) => a - b);
    const roleById = Object.fromEntries(roles.map(r => [r.id, r]));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-indigo-600" /> Cargos &amp; Funções
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Estrutura de cargos da empresa. Usada na folha, avaliações e na governança (alçadas, organograma).
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {companies.length > 1 && (
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <select
                                value={selectedCompanyId}
                                onChange={(e) => setSelectedCompanyId(e.target.value)}
                                className="text-xs font-bold text-slate-600 outline-none bg-transparent min-w-[160px]"
                            >
                                {companies.map(c => (
                                    <option key={c.id} value={c.id}>{c.razao_social}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        onClick={openCreate}
                        disabled={!selectedCompanyId}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-sm shadow-lg shadow-indigo-900/20 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                    >
                        <Plus className="w-4 h-4" /> Novo Cargo
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" /><p className="font-bold">{error}</p>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                </div>
            ) : companies.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-800 max-w-lg mx-auto">
                    <Building2 className="w-10 h-10 mx-auto mb-3 text-amber-500" />
                    <h3 className="font-black text-sm uppercase tracking-wider">Nenhuma empresa cadastrada</h3>
                    <p className="text-xs mt-2 text-amber-700">Cadastre a empresa sede em Governança Corporativa para estruturar os cargos.</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Cargos', val: roles.length, icon: Briefcase, color: 'indigo' },
                            { label: 'Níveis Hierárquicos', val: niveis.length, icon: Layers, color: 'emerald' },
                            { label: 'Cargos Vagos', val: vacantCount, icon: AlertCircle, color: 'amber' },
                            { label: 'Com Faixa Salarial', val: roles.filter(r => r.salario_minimo != null).length, icon: DollarSign, color: 'violet' },
                        ].map(({ label, val, icon: Icon, color }) => (
                            <div key={label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                    <h3 className="text-3xl font-black text-slate-900 mt-1">{val}</h3>
                                </div>
                                <div className={`p-3 bg-${color}-50 rounded-xl`}><Icon className={`w-6 h-6 text-${color}-600`} /></div>
                            </div>
                        ))}
                    </div>

                    {roles.length === 0 ? (
                        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 text-sm">
                            Nenhum cargo estruturado nesta empresa. Clique em <strong>Novo Cargo</strong> para começar.
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {niveis.map(nivel => (
                                <div key={nivel}>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Nível {nivel}</span>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {roles.filter(r => r.nivel_hierarquico === nivel).map(role => {
                                            const occupants = employees.filter(e => e.role_id === role.id && e.status === 'ATIVO');
                                            const proximo = role.proximo_cargo_id ? roleById[role.proximo_cargo_id] : null;
                                            const faixa = BRL(role.salario_minimo);
                                            return (
                                                <div key={role.id} className="bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-md p-4 rounded-2xl transition-all flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">{role.codigo || 'S/C'}</span>
                                                            <h4 className="font-black text-sm text-slate-900">{role.nome}</h4>
                                                        </div>
                                                        {role.descricao && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{role.descricao}</p>}

                                                        {faixa && (
                                                            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-lg w-fit font-bold">
                                                                <DollarSign className="w-3 h-3" />
                                                                {faixa}{role.salario_maximo ? ` – ${BRL(role.salario_maximo)}` : ''}
                                                            </div>
                                                        )}

                                                        {role.competencias?.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {role.competencias.slice(0, 3).map((c, i) => (
                                                                    <span key={i} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                                                                        <Star className="w-2.5 h-2.5" />{c}
                                                                    </span>
                                                                ))}
                                                                {role.competencias.length > 3 && (
                                                                    <span className="text-[10px] text-slate-400 px-1">+{role.competencias.length - 3}</span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {proximo && (
                                                            <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                                                                <ChevronRight className="w-3 h-3" />Trilha: {proximo.nome}
                                                            </div>
                                                        )}

                                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                                            {occupants.length === 0 ? (
                                                                <span className="text-[10px] bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-md font-bold">Vago</span>
                                                            ) : (
                                                                occupants.map(occ => (
                                                                    <span key={occ.id} className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md font-bold">{occ.name}</span>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button onClick={() => openEdit(role)} className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50" title="Editar">
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDelete(role)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-50" title="Excluir">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black text-slate-900">{form.id ? 'Editar Cargo' : 'Novo Cargo'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-5 text-sm">
                            <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Identificação</p>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Nome do Cargo *</label>
                                    <input
                                        type="text" required autoFocus
                                        placeholder="Ex: Diretor de Engenharia"
                                        value={form.nome}
                                        onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Código</label>
                                        <input
                                            type="text" placeholder="Ex: DIR_ENG"
                                            value={form.codigo}
                                            onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Nível Hierárquico *</label>
                                        <input
                                            type="number" min={1} required
                                            value={form.nivel_hierarquico}
                                            onChange={(e) => setForm({ ...form, nivel_hierarquico: Number(e.target.value) })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Descrição</label>
                                    <textarea
                                        placeholder="Resumo da função..."
                                        value={form.descricao}
                                        onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none h-16"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                    <DollarSign className="w-3 h-3" /> Faixa Salarial
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Piso (R$)</label>
                                        <input
                                            type="number" min={0} step="0.01" placeholder="Ex: 5000"
                                            value={form.salario_minimo}
                                            onChange={(e) => setForm({ ...form, salario_minimo: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Teto (R$)</label>
                                        <input
                                            type="number" min={0} step="0.01" placeholder="Ex: 8000"
                                            value={form.salario_maximo}
                                            onChange={(e) => setForm({ ...form, salario_maximo: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                    <Star className="w-3 h-3" /> Perfil do Cargo
                                </p>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Responsabilidades</label>
                                    <textarea
                                        placeholder="Uma por linha..."
                                        value={form.responsabilidades}
                                        onChange={(e) => setForm({ ...form, responsabilidades: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none h-20"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Competências Requeridas</label>
                                    <textarea
                                        placeholder="Uma por linha (ex: AutoCAD, Liderança de equipes)..."
                                        value={form.competencias}
                                        onChange={(e) => setForm({ ...form, competencias: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none h-20"
                                    />
                                </div>
                            </div>

                            {roles.filter(r => r.id !== form.id).length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                        <ChevronRight className="w-3 h-3" /> Trilha de Carreira
                                    </p>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Próximo Cargo (promoção)</label>
                                        <select
                                            value={form.proximo_cargo_id}
                                            onChange={(e) => setForm({ ...form, proximo_cargo_id: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none"
                                        >
                                            <option value="">Nenhum / Topo da carreira</option>
                                            {roles.filter(r => r.id !== form.id).map(r => (
                                                <option key={r.id} value={r.id}>{r.nome} (Nível {r.nivel_hierarquico})</option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-slate-400">Cargo para o qual este cargo evolui naturalmente.</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 disabled:opacity-60"
                                >
                                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    {form.id ? 'Salvar' : 'Criar Cargo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaborCargos;
