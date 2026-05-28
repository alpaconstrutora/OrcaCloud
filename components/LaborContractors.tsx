import React, { useState } from 'react';
import {
    Building2, Plus, X, ChevronDown, Loader2, Search,
    AlertTriangle, FileText, DollarSign, Eye, Trash2,
    CheckCircle2, Clock, CreditCard
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Contractor, ContractorTipo,
    ContractorDocument, ContractorMeasurement
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

const TIPO_LABELS: Record<ContractorTipo, string> = {
    EMPREITEIRO:       'Empreiteiro',
    SUBEMPREITEIRO:    'Subempreiteiro',
    FORNECEDOR_SERVICO:'Fornecedor de Serviço',
    COOPERATIVA:       'Cooperativa',
    MEI:               'MEI',
    AUTONOMO:          'Autônomo',
};

const STATUS_MEAS: Record<string, { bg: string; text: string }> = {
    PENDENTE:   { bg: 'bg-amber-100',   text: 'text-amber-700' },
    APROVADO:   { bg: 'bg-blue-100',    text: 'text-blue-700' },
    PAGO:       { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    CONTESTADO: { bg: 'bg-rose-100',    text: 'text-rose-700' },
};

// ── Formulário de Empreiteiro ─────────────────────────────────────────────────

interface ContractorFormProps {
    orgId: string;
    contractor?: Contractor | null;
    onClose: () => void;
    onSaved: () => void;
}

const ContractorForm: React.FC<ContractorFormProps> = ({ orgId, contractor, onClose, onSaved }) => {
    const isEditing = !!contractor;
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<Contractor>>({
        org_id: orgId,
        razao_social: contractor?.razao_social || '',
        nome_fantasia: contractor?.nome_fantasia || '',
        cnpj: contractor?.cnpj || '',
        tipo: contractor?.tipo || 'EMPREITEIRO',
        especialidade: contractor?.especialidade || '',
        contato_nome: contractor?.contato_nome || '',
        contato_telefone: contractor?.contato_telefone || '',
        contato_email: contractor?.contato_email || '',
        endereco: contractor?.endereco || '',
        banco_nome: contractor?.banco_nome || '',
        banco_agencia: contractor?.banco_agencia || '',
        banco_conta: contractor?.banco_conta || '',
        banco_pix: contractor?.banco_pix || '',
        retencao_inss_pct: contractor?.retencao_inss_pct ?? 11,
        retencao_iss_pct: contractor?.retencao_iss_pct ?? 0,
        retencao_irrf_pct: contractor?.retencao_irrf_pct ?? 0,
        contrato_inicio: contractor?.contrato_inicio || '',
        contrato_fim: contractor?.contrato_fim || '',
        valor_contrato: contractor?.valor_contrato ?? undefined,
        status: contractor?.status || 'ATIVO',
        notas: contractor?.notas || '',
    });

    const set = <K extends keyof Contractor>(k: K, v: Contractor[K]) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!form.razao_social?.trim()) { alert('Razão social é obrigatória.'); return; }
        setSaving(true);
        try {
            if (isEditing && contractor?.id) {
                await laborService.updateContractor(contractor.id, form);
            } else {
                await laborService.createContractor(form as Omit<Contractor, 'id' | 'created_at' | 'updated_at'>);
            }
            onSaved();
        } catch (err: any) { alert('Erro: ' + err.message); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-800">
                    <div>
                        <h2 className="text-lg font-black text-white">{isEditing ? 'Editar' : 'Novo'} Empreiteiro / Terceiro</h2>
                        <p className="text-blue-200 text-xs mt-0.5">Dados cadastrais e financeiros</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <InputGroup label="Razão Social *">
                                <input value={form.razao_social} onChange={e => set('razao_social', e.target.value)} className={inputCls} />
                            </InputGroup>
                        </div>
                        <InputGroup label="Nome Fantasia">
                            <input value={form.nome_fantasia || ''} onChange={e => set('nome_fantasia', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="CNPJ / CPF">
                            <input value={form.cnpj || ''} onChange={e => set('cnpj', e.target.value)} className={inputCls} placeholder="00.000.000/0000-00" />
                        </InputGroup>
                        <InputGroup label="Tipo *">
                            <div className="relative">
                                <select value={form.tipo} onChange={e => set('tipo', e.target.value as ContractorTipo)} className={inputCls + ' appearance-none pr-8'}>
                                    {(Object.entries(TIPO_LABELS) as [ContractorTipo, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Especialidade">
                            <input value={form.especialidade || ''} onChange={e => set('especialidade', e.target.value)} className={inputCls} placeholder="Ex: Elétrica, Hidráulica..." />
                        </InputGroup>
                        <InputGroup label="Contato">
                            <input value={form.contato_nome || ''} onChange={e => set('contato_nome', e.target.value)} className={inputCls} placeholder="Nome do responsável" />
                        </InputGroup>
                        <InputGroup label="Telefone">
                            <input value={form.contato_telefone || ''} onChange={e => set('contato_telefone', e.target.value)} className={inputCls} placeholder="(11) 99999-9999" />
                        </InputGroup>
                        <InputGroup label="E-mail">
                            <input type="email" value={form.contato_email || ''} onChange={e => set('contato_email', e.target.value)} className={inputCls} />
                        </InputGroup>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Retenções Padrão (%)</p>
                        <div className="grid grid-cols-3 gap-4">
                            <InputGroup label="INSS (%)">
                                <input type="number" min="0" max="100" step="0.1" value={form.retencao_inss_pct} onChange={e => set('retencao_inss_pct', parseFloat(e.target.value) || 0)} className={inputCls} />
                            </InputGroup>
                            <InputGroup label="ISS (%)">
                                <input type="number" min="0" max="100" step="0.1" value={form.retencao_iss_pct} onChange={e => set('retencao_iss_pct', parseFloat(e.target.value) || 0)} className={inputCls} />
                            </InputGroup>
                            <InputGroup label="IRRF (%)">
                                <input type="number" min="0" max="100" step="0.1" value={form.retencao_irrf_pct} onChange={e => set('retencao_irrf_pct', parseFloat(e.target.value) || 0)} className={inputCls} />
                            </InputGroup>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputGroup label="Início do Contrato">
                            <input type="date" value={form.contrato_inicio || ''} onChange={e => set('contrato_inicio', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Fim do Contrato">
                            <input type="date" value={form.contrato_fim || ''} onChange={e => set('contrato_fim', e.target.value)} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Valor do Contrato (R$)">
                            <input type="number" min="0" step="0.01" value={form.valor_contrato ?? ''} onChange={e => set('valor_contrato', parseFloat(e.target.value) || undefined)} className={inputCls} />
                        </InputGroup>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Dados Bancários</p>
                        <div className="grid grid-cols-2 gap-4">
                            <InputGroup label="Banco">
                                <input value={form.banco_nome || ''} onChange={e => set('banco_nome', e.target.value)} className={inputCls} />
                            </InputGroup>
                            <InputGroup label="Agência">
                                <input value={form.banco_agencia || ''} onChange={e => set('banco_agencia', e.target.value)} className={inputCls} />
                            </InputGroup>
                            <InputGroup label="Conta">
                                <input value={form.banco_conta || ''} onChange={e => set('banco_conta', e.target.value)} className={inputCls} />
                            </InputGroup>
                            <InputGroup label="PIX">
                                <input value={form.banco_pix || ''} onChange={e => set('banco_pix', e.target.value)} className={inputCls} />
                            </InputGroup>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 text-white rounded-xl font-bold text-sm hover:bg-blue-800 shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar' : 'Cadastrar')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Formulário de Medição ─────────────────────────────────────────────────────

interface MeasurementFormProps {
    orgId: string;
    contractors: Contractor[];
    projects: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const MeasurementForm: React.FC<MeasurementFormProps> = ({ orgId, contractors, projects, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        org_id: orgId,
        contractor_id: '',
        project_id: '',
        project_name: '',
        numero_medicao: 1,
        periodo_inicio: new Date().toISOString().split('T')[0],
        periodo_fim: new Date().toISOString().split('T')[0],
        descricao: '',
        valor_bruto: 0,
        retencao_inss: 0,
        retencao_iss: 0,
        retencao_irrf: 0,
        outras_retencoes: 0,
        status: 'PENDENTE' as ContractorMeasurement['status'],
        nota_fiscal: '',
        notas: '',
    });

    const selectedContractor = contractors.find(c => c.id === form.contractor_id);

    const applyRetentions = () => {
        if (!selectedContractor) return;
        setForm(p => ({
            ...p,
            retencao_inss: parseFloat((p.valor_bruto * selectedContractor.retencao_inss_pct / 100).toFixed(2)),
            retencao_iss:  parseFloat((p.valor_bruto * selectedContractor.retencao_iss_pct  / 100).toFixed(2)),
            retencao_irrf: parseFloat((p.valor_bruto * selectedContractor.retencao_irrf_pct / 100).toFixed(2)),
        }));
    };

    const valorLiquido = form.valor_bruto - form.retencao_inss - form.retencao_iss - form.retencao_irrf - form.outras_retencoes;

    const handleSave = async () => {
        if (!form.contractor_id || form.valor_bruto <= 0) { alert('Empreiteiro e valor bruto são obrigatórios.'); return; }
        setSaving(true);
        try {
            const project = projects.find(p => p.id === form.project_id);
            await laborService.createContractorMeasurement({ ...form, project_name: project?.name || form.project_name });
            onSaved();
        } catch (err: any) { alert('Erro: ' + err.message); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <h2 className="text-lg font-black text-white">Nova Medição</h2>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <InputGroup label="Empreiteiro *">
                        <div className="relative">
                            <select value={form.contractor_id} onChange={e => setForm(p => ({ ...p, contractor_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                <option value="">Selecione...</option>
                                {contractors.filter(c => c.status === 'ATIVO').map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </InputGroup>
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Obra">
                            <div className="relative">
                                <select value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))} className={inputCls + ' appearance-none pr-8'}>
                                    <option value="">Sem obra</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        </InputGroup>
                        <InputGroup label="Nº Medição">
                            <input type="number" min="1" value={form.numero_medicao} onChange={e => setForm(p => ({ ...p, numero_medicao: parseInt(e.target.value) || 1 }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Período Início">
                            <input type="date" value={form.periodo_inicio} onChange={e => setForm(p => ({ ...p, periodo_inicio: e.target.value }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Período Fim">
                            <input type="date" value={form.periodo_fim} onChange={e => setForm(p => ({ ...p, periodo_fim: e.target.value }))} className={inputCls} />
                        </InputGroup>
                    </div>
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <InputGroup label="Valor Bruto (R$) *">
                                <input type="number" min="0" step="0.01" value={form.valor_bruto || ''} onChange={e => setForm(p => ({ ...p, valor_bruto: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                            </InputGroup>
                        </div>
                        {selectedContractor && (
                            <button onClick={applyRetentions} className="px-3 py-2.5 bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black hover:bg-indigo-200 transition-all whitespace-nowrap mb-0.5">
                                Aplicar retenções padrão
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Retenção INSS (R$)">
                            <input type="number" min="0" step="0.01" value={form.retencao_inss} onChange={e => setForm(p => ({ ...p, retencao_inss: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Retenção ISS (R$)">
                            <input type="number" min="0" step="0.01" value={form.retencao_iss} onChange={e => setForm(p => ({ ...p, retencao_iss: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Retenção IRRF (R$)">
                            <input type="number" min="0" step="0.01" value={form.retencao_irrf} onChange={e => setForm(p => ({ ...p, retencao_irrf: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </InputGroup>
                        <InputGroup label="Outras Retenções (R$)">
                            <input type="number" min="0" step="0.01" value={form.outras_retencoes} onChange={e => setForm(p => ({ ...p, outras_retencoes: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                        </InputGroup>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
                        <span className="text-xs font-black text-indigo-800">Valor Líquido a Pagar</span>
                        <span className="text-lg font-black text-indigo-900">R$ {valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <InputGroup label="Nº Nota Fiscal">
                        <input value={form.nota_fiscal} onChange={e => setForm(p => ({ ...p, nota_fiscal: e.target.value }))} className={inputCls} />
                    </InputGroup>
                    <InputGroup label="Observações">
                        <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} className={inputCls + ' resize-none h-16'} />
                    </InputGroup>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : 'Registrar Medição'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborContractorsProps {
    orgId: string;
    projects?: { id: string; name: string }[];
}

type CView = 'contractors' | 'measurements' | 'documents';

const LaborContractors: React.FC<LaborContractorsProps> = ({ orgId, projects = [] }) => {
    const qc = useQueryClient();
    const [view, setView] = useState<CView>('contractors');
    const [search, setSearch] = useState('');
    const [showContractorForm, setShowContractorForm] = useState(false);
    const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
    const [showMeasForm, setShowMeasForm] = useState(false);

    const contractorsKey = [...laborKeys.all, 'contractors', orgId];
    const measKey        = [...laborKeys.all, 'contractorMeasurements', orgId];
    const docsKey        = [...laborKeys.all, 'contractorDocs', orgId];

    const { data: contractors = [], isLoading: loadingC } = useQuery({
        queryKey: contractorsKey,
        queryFn: () => laborService.listContractors(orgId),
        staleTime: STALE.normal, enabled: !!orgId,
    });

    const { data: measurements = [], isLoading: loadingM } = useQuery({
        queryKey: measKey,
        queryFn: () => laborService.listContractorMeasurements(orgId),
        staleTime: STALE.fast, enabled: !!orgId && view === 'measurements',
    });

    const { data: docAlerts = [] } = useQuery({
        queryKey: docsKey,
        queryFn: () => laborService.getContractorDocumentAlerts(orgId),
        staleTime: STALE.normal, enabled: !!orgId,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: contractorsKey });
        qc.invalidateQueries({ queryKey: measKey });
        qc.invalidateQueries({ queryKey: docsKey });
    };

    const deleteContractor = useMutation({ mutationFn: (id: string) => laborService.deleteContractor(id), onSuccess: invalidate });
    const updateMeas = useMutation({
        mutationFn: ({ id, status }: { id: string; status: ContractorMeasurement['status'] }) =>
            laborService.updateContractorMeasurement(id, { status }),
        onSuccess: invalidate,
    });

    const active = contractors.filter(c => c.status === 'ATIVO').length;
    const pendingMeas = measurements.filter(m => m.status === 'PENDENTE').length;
    const totalPending = measurements.filter(m => m.status === 'PENDENTE').reduce((s, m) => s + (m.valor_liquido || 0), 0);

    const filteredC = contractors.filter(c => !search || c.razao_social.toLowerCase().includes(search.toLowerCase()) || (c.especialidade || '').toLowerCase().includes(search.toLowerCase()));
    const filteredM = measurements.filter(m => !search || (m.contractor_name || '').toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-6">
            {docAlerts.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-black text-amber-900 uppercase tracking-tight">{docAlerts.length} documento{docAlerts.length > 1 ? 's' : ''} vencendo em 30 dias</p>
                        <p className="text-[11px] text-amber-700 mt-1">{docAlerts.slice(0, 3).map(d => `${d.contractor_name} — ${d.titulo}`).join(' · ')}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Empreiteiros Ativos',   value: active,                 bg: 'bg-blue-50',    text: 'text-blue-700' },
                    { label: 'Medições Pendentes',     value: pendingMeas,            bg: 'bg-amber-50',   text: 'text-amber-700' },
                    { label: 'A Pagar (líquido)',      value: `R$ ${(totalPending/1000).toFixed(0)}k`, bg: 'bg-indigo-50', text: 'text-indigo-700' },
                    { label: 'Docs Vencendo',          value: docAlerts.length,       bg: 'bg-rose-50',    text: 'text-rose-700' },
                ].map(({ label, value, bg, text }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${text} ${bg} px-2 py-0.5 rounded-lg inline-block`}>{value}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1">
                    {([['contractors', 'Cadastro', Building2], ['measurements', 'Medições', DollarSign], ['documents', 'Documentos', FileText]] as const).map(([id, label, Icon]) => (
                        <button key={id} onClick={() => setView(id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                            <Icon className="w-3.5 h-3.5" />{label}
                            {id === 'documents' && docAlerts.length > 0 && (
                                <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full">{docAlerts.length}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-40" />
                    </div>
                    <button
                        onClick={() => view === 'measurements' ? setShowMeasForm(true) : (setEditingContractor(null), setShowContractorForm(true))}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-xl hover:bg-blue-800 font-bold text-xs shadow-md">
                        <Plus className="w-3.5 h-3.5" />
                        {view === 'measurements' ? 'Nova Medição' : 'Novo Empreiteiro'}
                    </button>
                </div>
            </div>

            {/* Cadastro */}
            {view === 'contractors' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingC ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    : filteredC.length === 0 ? (
                        <div className="text-center py-16">
                            <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhum empreiteiro cadastrado</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {filteredC.map(c => (
                                <div key={c.id} className="flex items-center gap-4 px-4 py-4 hover:bg-slate-50/50">
                                    <div className={`p-2.5 rounded-xl ${c.status === 'ATIVO' ? 'bg-blue-100' : 'bg-slate-100'} shrink-0`}>
                                        <Building2 className={`w-4 h-4 ${c.status === 'ATIVO' ? 'text-blue-600' : 'text-slate-400'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900">{c.razao_social}</p>
                                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                            <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">{TIPO_LABELS[c.tipo]}</span>
                                            {c.especialidade && <span className="text-xs text-slate-400">{c.especialidade}</span>}
                                            {c.cnpj && <span className="text-xs text-slate-400 font-mono">{c.cnpj}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => { setEditingContractor(c); setShowContractorForm(true); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
                                            <Eye className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => { if (confirm('Inativar?')) deleteContractor.mutate(c.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Medições */}
            {view === 'measurements' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {loadingM ? <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                    : filteredM.length === 0 ? (
                        <div className="text-center py-16">
                            <DollarSign className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Nenhuma medição registrada</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    {['Empreiteiro', 'Obra', 'Medição', 'Período', 'Bruto', 'Líquido', 'NF', 'Status', ''].map(h => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredM.map(m => {
                                    const st = STATUS_MEAS[m.status];
                                    return (
                                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-4 py-3 text-sm font-bold text-slate-900">{m.contractor_name}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{m.project_name || '—'}</td>
                                            <td className="px-4 py-3 text-xs font-black text-slate-700">#{m.numero_medicao}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{m.periodo_inicio} → {m.periodo_fim}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-700">R$ {m.valor_bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-4 py-3 text-sm font-black text-emerald-700">R$ {(m.valor_liquido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{m.nota_fiscal || '—'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${st.bg} ${st.text}`}>{m.status}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {m.status === 'PENDENTE' && (
                                                    <button onClick={() => updateMeas.mutate({ id: m.id, status: 'APROVADO' })}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-[10px] font-black transition-all">
                                                        <CheckCircle2 className="w-3 h-3" /> Aprovar
                                                    </button>
                                                )}
                                                {m.status === 'APROVADO' && (
                                                    <button onClick={() => updateMeas.mutate({ id: m.id, status: 'PAGO' })}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-[10px] font-black transition-all">
                                                        <DollarSign className="w-3 h-3" /> Pago
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Documentos (alertas) */}
            {view === 'documents' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {docAlerts.length === 0 ? (
                        <div className="text-center py-16">
                            <CheckCircle2 className="w-10 h-10 text-emerald-200 mx-auto mb-3" />
                            <p className="text-sm font-black text-slate-400">Todos os documentos estão em dia</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {docAlerts.map(d => {
                                const today = new Date().toISOString().split('T')[0];
                                const vencido = d.data_validade && d.data_validade < today;
                                return (
                                    <div key={d.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50">
                                        <div className={`p-2 rounded-xl ${vencido ? 'bg-rose-100' : 'bg-amber-100'} shrink-0`}>
                                            <FileText className={`w-4 h-4 ${vencido ? 'text-rose-600' : 'text-amber-600'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-900">{d.contractor_name}</p>
                                            <p className="text-xs text-slate-500">{d.titulo} · Vence {d.data_validade}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${vencido ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {vencido ? 'Vencido' : 'Vencendo'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {showContractorForm && (
                <ContractorForm orgId={orgId} contractor={editingContractor}
                    onClose={() => { setShowContractorForm(false); setEditingContractor(null); }}
                    onSaved={() => { setShowContractorForm(false); setEditingContractor(null); invalidate(); }} />
            )}
            {showMeasForm && (
                <MeasurementForm orgId={orgId} contractors={contractors} projects={projects}
                    onClose={() => setShowMeasForm(false)}
                    onSaved={() => { setShowMeasForm(false); invalidate(); }} />
            )}
        </div>
    );
};

export default LaborContractors;
