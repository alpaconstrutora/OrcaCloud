import React, { useState, useEffect } from 'react';
import {
    Briefcase, Plus, Trash2, Pencil, X, Building2, Loader2, AlertCircle,
    Layers, DollarSign, Star, ChevronRight, Wrench, Tag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { orgGovernanceService } from '../services/orgGovernanceService';
import { laborService, Employee } from '../services/laborService';
import { useConfirm } from './ui/confirm';
import { OrgRole, OrgFuncao, OrgFuncaoCategoria } from '../types';

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
    funcao_id: string;
}

interface FuncaoForm {
    id?: string;
    nome: string;
    descricao: string;
    categoria: OrgFuncaoCategoria;
}

const EMPTY_ROLE_FORM: RoleForm = {
    nome: '', codigo: '', descricao: '', nivel_hierarquico: 3,
    responsabilidades: '', salario_minimo: '', salario_maximo: '',
    competencias: '', proximo_cargo_id: '', funcao_id: '',
};

const EMPTY_FUNCAO_FORM: FuncaoForm = {
    nome: '', descricao: '', categoria: 'operacional',
};

const CATEGORIAS: { value: OrgFuncaoCategoria; label: string; color: string }[] = [
    { value: 'operacional',    label: 'Operacional',    color: 'orange' },
    { value: 'tecnica',        label: 'Técnica',        color: 'blue' },
    { value: 'administrativa', label: 'Administrativa', color: 'slate' },
    { value: 'gerencial',      label: 'Gerencial',      color: 'indigo' },
    { value: 'comercial',      label: 'Comercial',      color: 'emerald' },
];

const BRL = (v: number | null | undefined) =>
    v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }) : null;

const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:border-indigo-500 focus:ring-0 text-slate-900 outline-none text-sm";
const labelCls = "text-[10px] text-slate-500 font-black uppercase tracking-widest";

const LaborCargos: React.FC<LaborCargosProps> = ({ orgId }) => {
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = useState<'cargos' | 'funcoes'>('cargos');
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
    const [roles, setRoles] = useState<OrgRole[]>([]);
    const [funcoes, setFuncoes] = useState<OrgFuncao[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Cargo modal
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [roleForm, setRoleForm] = useState<RoleForm>(EMPTY_ROLE_FORM);
    const [savingRole, setSavingRole] = useState(false);

    // Função modal
    const [isFuncaoModalOpen, setIsFuncaoModalOpen] = useState(false);
    const [funcaoForm, setFuncaoForm] = useState<FuncaoForm>(EMPTY_FUNCAO_FORM);
    const [savingFuncao, setSavingFuncao] = useState(false);

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
                const [rolesData, funcoesData, employeesData] = await Promise.all([
                    orgGovernanceService.listRoles(selectedCompanyId),
                    orgGovernanceService.listFuncoes(selectedCompanyId),
                    laborService.listEmployees(orgId || undefined, selectedCompanyId),
                ]);
                if (cancelled) return;
                setRoles(rolesData);
                setFuncoes(funcoesData);
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

    const reloadAll = async () => {
        const [r, f] = await Promise.all([
            orgGovernanceService.listRoles(selectedCompanyId),
            orgGovernanceService.listFuncoes(selectedCompanyId),
        ]);
        setRoles(r);
        setFuncoes(f);
    };

    // ── Cargo handlers ──────────────────────────────────────
    const openCreateRole = () => { setRoleForm(EMPTY_ROLE_FORM); setIsRoleModalOpen(true); };
    const openEditRole = (role: OrgRole) => {
        setRoleForm({
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
            funcao_id: role.funcao_id || '',
        });
        setIsRoleModalOpen(true);
    };

    const handleSaveRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roleForm.nome || !selectedCompanyId) return;
        setSavingRole(true);
        try {
            await orgGovernanceService.saveRole({
                id: roleForm.id,
                company_id: selectedCompanyId,
                nome: roleForm.nome,
                codigo: roleForm.codigo || null,
                descricao: roleForm.descricao || null,
                nivel_hierarquico: roleForm.nivel_hierarquico,
                responsabilidades: roleForm.responsabilidades.split('\n').map(s => s.trim()).filter(Boolean),
                salario_minimo: roleForm.salario_minimo ? Number(roleForm.salario_minimo) : null,
                salario_maximo: roleForm.salario_maximo ? Number(roleForm.salario_maximo) : null,
                competencias: roleForm.competencias.split('\n').map(s => s.trim()).filter(Boolean),
                proximo_cargo_id: roleForm.proximo_cargo_id || null,
                funcao_id: roleForm.funcao_id || null,
            });
            setIsRoleModalOpen(false);
            setRoleForm(EMPTY_ROLE_FORM);
            await reloadAll();
        } catch (err) {
            alert('Erro ao salvar cargo: ' + (err as Error).message);
        } finally {
            setSavingRole(false);
        }
    };

    const handleDeleteRole = async (role: OrgRole) => {
        const occupants = employees.filter(emp => emp.role_id === role.id && emp.status === 'ATIVO');
        const msg = occupants.length > 0
            ? `Este cargo tem ${occupants.length} colaborador(es) ativo(s). Eles ficarão sem cargo.`
            : 'Isso removerá o cargo definitivamente.';
        if (!await confirm({ title: `Excluir cargo ${role.nome}?`, message: msg, variant: 'danger', confirmLabel: 'Excluir' })) return;
        try {
            await orgGovernanceService.deleteRole(role.id);
            setRoles(roles.filter(r => r.id !== role.id));
        } catch (err) {
            alert('Erro ao excluir cargo: ' + (err as Error).message);
        }
    };

    // ── Função handlers ─────────────────────────────────────
    const openCreateFuncao = () => { setFuncaoForm(EMPTY_FUNCAO_FORM); setIsFuncaoModalOpen(true); };
    const openEditFuncao = (f: OrgFuncao) => {
        setFuncaoForm({ id: f.id, nome: f.nome, descricao: f.descricao || '', categoria: f.categoria });
        setIsFuncaoModalOpen(true);
    };

    const handleSaveFuncao = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!funcaoForm.nome || !selectedCompanyId) return;
        setSavingFuncao(true);
        try {
            await orgGovernanceService.saveFuncao({
                id: funcaoForm.id,
                company_id: selectedCompanyId,
                nome: funcaoForm.nome,
                descricao: funcaoForm.descricao || null,
                categoria: funcaoForm.categoria,
            });
            setIsFuncaoModalOpen(false);
            setFuncaoForm(EMPTY_FUNCAO_FORM);
            await reloadAll();
        } catch (err) {
            alert('Erro ao salvar função: ' + (err as Error).message);
        } finally {
            setSavingFuncao(false);
        }
    };

    const handleDeleteFuncao = async (f: OrgFuncao) => {
        const usedBy = roles.filter(r => r.funcao_id === f.id).length;
        const msg = usedBy > 0
            ? `Esta função é usada por ${usedBy} cargo(s). Eles ficarão sem função associada.`
            : 'Isso removerá a função definitivamente.';
        if (!await confirm({ title: `Excluir função ${f.nome}?`, message: msg, variant: 'danger', confirmLabel: 'Excluir' })) return;
        try {
            await orgGovernanceService.deleteFuncao(f.id);
            setFuncoes(funcoes.filter(fn => fn.id !== f.id));
            setRoles(roles.map(r => r.funcao_id === f.id ? { ...r, funcao_id: null } : r));
        } catch (err) {
            alert('Erro ao excluir função: ' + (err as Error).message);
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
    const funcaoById = Object.fromEntries(funcoes.map(f => [f.id, f]));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-indigo-600" /> Cargos &amp; Funções
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Estrutura de cargos e funções da empresa. Usada na folha, avaliações e na governança.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {companies.length > 1 && (
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <select
                                value={selectedCompanyId}
                                onChange={(e) => setSelectedCompanyId(e.target.value)}
                                className="text-form-input font-bold text-slate-600 outline-none bg-transparent min-w-[160px]"
                            >
                                {companies.map(c => (
                                    <option key={c.id} value={c.id}>{c.razao_social}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        onClick={activeTab === 'cargos' ? openCreateRole : openCreateFuncao}
                        disabled={!selectedCompanyId}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-sm shadow-lg shadow-indigo-900/20 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                    >
                        <Plus className="w-4 h-4" />
                        {activeTab === 'cargos' ? 'Novo Cargo' : 'Nova Função'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                {([
                    { key: 'cargos',  label: 'Cargos',  icon: Briefcase },
                    { key: 'funcoes', label: 'Funções', icon: Wrench },
                ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                            activeTab === key
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Icon className="w-4 h-4" />{label}
                        <span className={`text-xs font-black px-1.5 py-0.5 rounded-md ${
                            activeTab === key ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'
                        }`}>
                            {key === 'cargos' ? roles.length : funcoes.length}
                        </span>
                    </button>
                ))}
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
            ) : activeTab === 'cargos' ? (
                <>
                    {/* KPIs — Cargos */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Cargos', val: roles.length, icon: Briefcase, color: 'indigo' },
                            { label: 'Níveis Hierárquicos', val: niveis.length, icon: Layers, color: 'emerald' },
                            { label: 'Cargos Vagos', val: vacantCount, icon: AlertCircle, color: 'amber' },
                            { label: 'Com Faixa Salarial', val: roles.filter(r => r.salario_minimo != null).length, icon: DollarSign, color: 'violet' },
                        ].map(({ label, val, icon: Icon, color }) => (
                            <div key={label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</p>
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
                                    <span className="text-xs font-black uppercase tracking-widest text-slate-400 block mb-3">Nível {nivel}</span>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {roles.filter(r => r.nivel_hierarquico === nivel).map(role => {
                                            const occupants = employees.filter(e => e.role_id === role.id && e.status === 'ATIVO');
                                            const proximo = role.proximo_cargo_id ? roleById[role.proximo_cargo_id] : null;
                                            const funcao = role.funcao_id ? funcaoById[role.funcao_id] : null;
                                            const faixa = BRL(role.salario_minimo);
                                            const cat = funcao ? CATEGORIAS.find(c => c.value === funcao.categoria) : null;
                                            return (
                                                <div key={role.id} className="bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-md p-4 rounded-2xl transition-all flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">{role.codigo || 'S/C'}</span>
                                                            <h4 className="font-black text-sm text-slate-900">{role.nome}</h4>
                                                        </div>
                                                        {funcao && (
                                                            <div className={`mt-1.5 flex items-center gap-1 text-xs font-bold text-${cat?.color ?? 'slate'}-700 bg-${cat?.color ?? 'slate'}-50 border border-${cat?.color ?? 'slate'}-100 px-2 py-0.5 rounded-md w-fit`}>
                                                                <Wrench className="w-2.5 h-2.5" />{funcao.nome}
                                                            </div>
                                                        )}
                                                        {role.descricao && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{role.descricao}</p>}

                                                        {faixa && (
                                                            <div className="mt-2 flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-lg w-fit font-bold">
                                                                <DollarSign className="w-3 h-3" />
                                                                {faixa}{role.salario_maximo ? ` – ${BRL(role.salario_maximo)}` : ''}
                                                            </div>
                                                        )}

                                                        {role.competencias?.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {role.competencias.slice(0, 3).map((c, i) => (
                                                                    <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                                                                        <Star className="w-2.5 h-2.5" />{c}
                                                                    </span>
                                                                ))}
                                                                {role.competencias.length > 3 && (
                                                                    <span className="text-xs text-slate-400 px-1">+{role.competencias.length - 3}</span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {proximo && (
                                                            <div className="mt-2 flex items-center gap-1 text-xs text-emerald-700 font-bold">
                                                                <ChevronRight className="w-3 h-3" />Trilha: {proximo.nome}
                                                            </div>
                                                        )}

                                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                                            {occupants.length === 0 ? (
                                                                <span className="text-xs bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-md font-bold">Vago</span>
                                                            ) : (
                                                                occupants.map(occ => (
                                                                    <span key={occ.id} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md font-bold">{occ.name}</span>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button onClick={() => openEditRole(role)} className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50" title="Editar">
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDeleteRole(role)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-50" title="Excluir">
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
            ) : (
                <>
                    {/* KPIs — Funções */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {[
                            { label: 'Funções cadastradas', val: funcoes.length, icon: Wrench, color: 'indigo' },
                            { label: 'Vinculadas a Cargos', val: funcoes.filter(f => roles.some(r => r.funcao_id === f.id)).length, icon: Briefcase, color: 'emerald' },
                            { label: 'Não usadas', val: funcoes.filter(f => !roles.some(r => r.funcao_id === f.id)).length, icon: AlertCircle, color: 'amber' },
                        ].map(({ label, val, icon: Icon, color }) => (
                            <div key={label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                    <h3 className="text-3xl font-black text-slate-900 mt-1">{val}</h3>
                                </div>
                                <div className={`p-3 bg-${color}-50 rounded-xl`}><Icon className={`w-6 h-6 text-${color}-600`} /></div>
                            </div>
                        ))}
                    </div>

                    {funcoes.length === 0 ? (
                        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 text-sm">
                            Nenhuma função cadastrada. Funções são categorias reutilizáveis que podem ser atribuídas a múltiplos cargos.
                            <br /><strong className="text-slate-500">Ex: Função "Pedreiro" → Cargos "Pedreiro Jr", "Pedreiro Pleno", "Pedreiro Sênior".</strong>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {CATEGORIAS.map(cat => {
                                const catFuncoes = funcoes.filter(f => f.categoria === cat.value);
                                if (catFuncoes.length === 0) return null;
                                return (
                                    <React.Fragment key={cat.value}>
                                        <div className="md:col-span-2 lg:col-span-3">
                                            <span className={`text-xs font-black uppercase tracking-widest text-${cat.color}-600 flex items-center gap-1.5`}>
                                                <Tag className="w-3 h-3" />{cat.label}
                                            </span>
                                        </div>
                                        {catFuncoes.map(f => {
                                            const cargosCount = roles.filter(r => r.funcao_id === f.id).length;
                                            return (
                                                <div key={f.id} className="bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-md p-4 rounded-2xl transition-all flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={`text-xs bg-${cat.color}-50 text-${cat.color}-700 border border-${cat.color}-100 font-bold px-2 py-0.5 rounded-md`}>{cat.label}</span>
                                                            <h4 className="font-black text-sm text-slate-900">{f.nome}</h4>
                                                        </div>
                                                        {f.descricao && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{f.descricao}</p>}
                                                        <div className="mt-2">
                                                            {cargosCount === 0 ? (
                                                                <span className="text-xs text-slate-400 italic">Não atribuída a nenhum cargo</span>
                                                            ) : (
                                                                <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md font-bold">
                                                                    {cargosCount} cargo{cargosCount > 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button onClick={() => openEditFuncao(f)} className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50" title="Editar">
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDeleteFuncao(f)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-50" title="Excluir">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ── Modal: Cargo ─────────────────────────────────── */}
            {isRoleModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black text-slate-900">{roleForm.id ? 'Editar Cargo' : 'Novo Cargo'}</h3>
                            <button onClick={() => setIsRoleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveRole} className="space-y-5 text-sm">
                            <div className="space-y-3">
                                <p className={`${labelCls} text-slate-400`}>Identificação</p>
                                <div className="space-y-1">
                                    <label className={labelCls}>Nome do Cargo *</label>
                                    <input type="text" required autoFocus placeholder="Ex: Engenheiro Civil Pleno"
                                        value={roleForm.nome}
                                        onChange={(e) => setRoleForm({ ...roleForm, nome: e.target.value })}
                                        className={inputCls} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className={labelCls}>Código</label>
                                        <input type="text" placeholder="Ex: ENG_CIV_PL"
                                            value={roleForm.codigo}
                                            onChange={(e) => setRoleForm({ ...roleForm, codigo: e.target.value })}
                                            className={inputCls} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelCls}>Nível Hierárquico *</label>
                                        <input type="number" min={1} required
                                            value={roleForm.nivel_hierarquico}
                                            onChange={(e) => setRoleForm({ ...roleForm, nivel_hierarquico: Number(e.target.value) })}
                                            className={inputCls} />
                                    </div>
                                </div>
                                {funcoes.length > 0 && (
                                    <div className="space-y-1">
                                        <label className={labelCls}>Função (catálogo)</label>
                                        <select
                                            value={roleForm.funcao_id}
                                            onChange={(e) => setRoleForm({ ...roleForm, funcao_id: e.target.value })}
                                            className={inputCls}
                                        >
                                            <option value="">— Nenhuma função associada —</option>
                                            {CATEGORIAS.map(cat => {
                                                const cats = funcoes.filter(f => f.categoria === cat.value);
                                                if (cats.length === 0) return null;
                                                return (
                                                    <optgroup key={cat.value} label={cat.label}>
                                                        {cats.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                                                    </optgroup>
                                                );
                                            })}
                                        </select>
                                        <p className="text-xs text-slate-400">Associe à função que este cargo desempenha.</p>
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <label className={labelCls}>Descrição</label>
                                    <textarea placeholder="Resumo do cargo..."
                                        value={roleForm.descricao}
                                        onChange={(e) => setRoleForm({ ...roleForm, descricao: e.target.value })}
                                        className={inputCls + ' h-16'} />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className={`${labelCls} text-slate-400 flex items-center gap-1.5`}><DollarSign className="w-3 h-3" /> Faixa Salarial</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className={labelCls}>Piso (R$)</label>
                                        <input type="number" min={0} step="0.01" placeholder="5000"
                                            value={roleForm.salario_minimo}
                                            onChange={(e) => setRoleForm({ ...roleForm, salario_minimo: e.target.value })}
                                            className={inputCls} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className={labelCls}>Teto (R$)</label>
                                        <input type="number" min={0} step="0.01" placeholder="8000"
                                            value={roleForm.salario_maximo}
                                            onChange={(e) => setRoleForm({ ...roleForm, salario_maximo: e.target.value })}
                                            className={inputCls} />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className={`${labelCls} text-slate-400 flex items-center gap-1.5`}><Star className="w-3 h-3" /> Perfil do Cargo</p>
                                <div className="space-y-1">
                                    <label className={labelCls}>Responsabilidades</label>
                                    <textarea placeholder="Uma por linha..."
                                        value={roleForm.responsabilidades}
                                        onChange={(e) => setRoleForm({ ...roleForm, responsabilidades: e.target.value })}
                                        className={inputCls + ' h-20'} />
                                </div>
                                <div className="space-y-1">
                                    <label className={labelCls}>Competências Requeridas</label>
                                    <textarea placeholder="Uma por linha (ex: AutoCAD, Liderança)..."
                                        value={roleForm.competencias}
                                        onChange={(e) => setRoleForm({ ...roleForm, competencias: e.target.value })}
                                        className={inputCls + ' h-20'} />
                                </div>
                            </div>

                            {roles.filter(r => r.id !== roleForm.id).length > 0 && (
                                <div className="space-y-3">
                                    <p className={`${labelCls} text-slate-400 flex items-center gap-1.5`}><ChevronRight className="w-3 h-3" /> Trilha de Carreira</p>
                                    <div className="space-y-1">
                                        <label className={labelCls}>Próximo Cargo (promoção)</label>
                                        <select
                                            value={roleForm.proximo_cargo_id}
                                            onChange={(e) => setRoleForm({ ...roleForm, proximo_cargo_id: e.target.value })}
                                            className={inputCls}
                                        >
                                            <option value="">Nenhum / Topo da carreira</option>
                                            {roles.filter(r => r.id !== roleForm.id).map(r => (
                                                <option key={r.id} value={r.id}>{r.nome} (Nível {r.nivel_hierarquico})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                                <button type="button" onClick={() => setIsRoleModalOpen(false)}
                                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-button uppercase tracking-wider rounded-xl transition-all">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={savingRole}
                                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-button uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 disabled:opacity-60">
                                    {savingRole && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    {roleForm.id ? 'Salvar' : 'Criar Cargo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: Função ─────────────────────────────────── */}
            {isFuncaoModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black text-slate-900">{funcaoForm.id ? 'Editar Função' : 'Nova Função'}</h3>
                            <button onClick={() => setIsFuncaoModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">
                            Uma <strong>Função</strong> descreve o que a pessoa faz (ex: "Pedreiro") e pode ser compartilhada por vários cargos (ex: Pedreiro Jr, Pleno, Sênior).
                        </p>

                        <form onSubmit={handleSaveFuncao} className="space-y-4 text-sm">
                            <div className="space-y-1">
                                <label className={labelCls}>Nome da Função *</label>
                                <input type="text" required autoFocus placeholder="Ex: Pedreiro, Mestre de Obras, Analista de RH"
                                    value={funcaoForm.nome}
                                    onChange={(e) => setFuncaoForm({ ...funcaoForm, nome: e.target.value })}
                                    className={inputCls} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelCls}>Categoria</label>
                                <select
                                    value={funcaoForm.categoria}
                                    onChange={(e) => setFuncaoForm({ ...funcaoForm, categoria: e.target.value as OrgFuncaoCategoria })}
                                    className={inputCls}
                                >
                                    {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={labelCls}>Descrição</label>
                                <textarea placeholder="O que faz quem exerce essa função..."
                                    value={funcaoForm.descricao}
                                    onChange={(e) => setFuncaoForm({ ...funcaoForm, descricao: e.target.value })}
                                    className={inputCls + ' h-20'} />
                            </div>

                            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                                <button type="button" onClick={() => setIsFuncaoModalOpen(false)}
                                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-button uppercase tracking-wider rounded-xl transition-all">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={savingFuncao}
                                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-button uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 disabled:opacity-60">
                                    {savingFuncao && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    {funcaoForm.id ? 'Salvar' : 'Criar Função'}
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
