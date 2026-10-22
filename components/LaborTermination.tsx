import React, { useMemo, useState } from 'react';
import {
    UserMinus, Plus, X, ChevronDown, Loader2,
    CheckSquare, Square, AlertTriangle, CheckCircle2,
    FileText, HardHat, Shield, MessageSquare,
    ClipboardList, Lock, DollarSign, Clock, Users
} from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import ActionIconButton from './ui/ActionIconButton';
import TabsBar from './ui/TabsBar';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import { SegmentedProgress } from './ui/SegmentedProgress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Employee,
    TerminationRecord, TerminationTipo, AvisoPrevioTipo
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';
import { formatDate } from '../lib/payrollUIHelpers';
import { chavePorMes, chavePorNome, chavePorRotulo } from '../utils/agruparLinhas';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { usePersistedState } from './ui/TableUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<TerminationTipo, string> = {
    DEMISSAO_SEM_JUSTA_CAUSA: 'Demissão sem Justa Causa',
    DEMISSAO_COM_JUSTA_CAUSA: 'Demissão com Justa Causa',
    PEDIDO_DEMISSAO:          'Pedido de Demissão',
    ACORDO_MUTUO:             'Acordo Mútuo (§6º CLT)',
    TERMINO_CONTRATO:         'Término de Contrato',
    APOSENTADORIA:            'Aposentadoria',
    FALECIMENTO:              'Falecimento',
    OUTROS:                   'Outros',
};

const TIPO_COLORS: Record<TerminationTipo, { bg: string; text: string }> = {
    DEMISSAO_SEM_JUSTA_CAUSA: { bg: 'bg-rose-100',   text: 'text-rose-700' },
    DEMISSAO_COM_JUSTA_CAUSA: { bg: 'bg-red-100',    text: 'text-red-700' },
    PEDIDO_DEMISSAO:          { bg: 'bg-amber-100',  text: 'text-amber-700' },
    ACORDO_MUTUO:             { bg: 'bg-blue-100',   text: 'text-blue-700' },
    TERMINO_CONTRATO:         { bg: 'bg-purple-100', text: 'text-purple-700' },
    APOSENTADORIA:            { bg: 'bg-emerald-100',text: 'text-emerald-700' },
    FALECIMENTO:              { bg: 'bg-slate-100',  text: 'text-slate-700' },
    OUTROS:                   { bg: 'bg-slate-100',  text: 'text-slate-600' },
};

const CHECKLIST_ITEMS = [
    { id: 'docs_trct',       icon: FileText,      label: 'TRCT assinado (Termo de Rescisão)' },
    { id: 'docs_aviso',      icon: FileText,      label: 'Aviso prévio entregue/recibado' },
    { id: 'docs_ctps',       icon: FileText,      label: 'Baixa na CTPS anotada' },
    { id: 'docs_informe',    icon: FileText,      label: 'Informe de rendimentos emitido' },
    { id: 'epis_devolvidos', icon: HardHat,       label: 'Todos EPIs devolvidos' },
    { id: 'acesso_sistema',  icon: Lock,          label: 'Acesso ao sistema bloqueado' },
    { id: 'acesso_obra',     icon: Shield,        label: 'Acesso à obra revogado (crachá/biometria)' },
    { id: 'chaves',          icon: Shield,        label: 'Chaves e ferramentas devolvidas' },
    { id: 'uniforme',        icon: Shield,        label: 'Uniforme devolvido' },
    { id: 'entrevista',      icon: MessageSquare, label: 'Entrevista de desligamento realizada' },
    { id: 'rescisao_calc',   icon: DollarSign,    label: 'Cálculo de rescisão conferido' },
    { id: 'fgts_chave',      icon: DollarSign,    label: 'Chave FGTS liberada (quando aplicável)' },
    { id: 'seguro_desemp',   icon: DollarSign,    label: 'Seguro-desemprego requerido (quando aplicável)' },
    { id: 'exame_demissional',icon: FileText,     label: 'Exame demissional (ASO) realizado' },
];

// ── Tabela (guia de UI §6.10) ────────────────────────────────────────────────

type Aba = 'andamento' | 'concluidos' | 'todos';
type TerminationStatus = TerminationRecord['status'];

const STATUS_LABELS: Record<TerminationStatus, string> = { RASCUNHO: 'Em andamento', CONCLUIDO: 'Concluído' };
// Status = texto colorido, sem pílula (§8).
const STATUS_TEXT: Record<TerminationStatus, string> = { RASCUNHO: 'text-amber-700', CONCLUIDO: 'text-gray-600' };
const AVISO_LABELS: Record<AvisoPrevioTipo, string> = { TRABALHADO: 'Trabalhado', INDENIZADO: 'Indenizado', DISPENSADO: 'Dispensado' };

// Soma das visíveis por padrão: 1070 + Ações 140 = 1210 px (cabe nos ~1290 úteis a 1600 px).
// Em "Todas as organizações" entra Organização (+170) e a tabela rola na horizontal.
const ORG_COLUMN: StandardTableColumn = { key: 'org', label: 'Organização', sortable: true, width: 170 };
const COLUMNS: StandardTableColumn[] = [
    { key: 'colaborador', label: 'Colaborador',  sortable: true, width: 210 },
    { key: 'cargo',       label: 'Cargo',        sortable: true, width: 150 },
    { key: 'tipo',        label: 'Tipo',         sortable: true, width: 190 },
    { key: 'data',        label: 'Data',         sortable: true, width: 110 },
    { key: 'aviso',       label: 'Aviso prévio', sortable: true, width: 120 },
    { key: 'checklist',   label: 'Checklist',    sortable: true, width: 170 },
    { key: 'entrevista',  label: 'Entrevista',   sortable: true, width: 120, defaultHidden: true },
    { key: 'status',      label: 'Status',       sortable: true, width: 120 },
];

const SEM_GRUPO: Record<string, string> = { org: 'Sem organização', tipo: 'Sem tipo', mes: 'Sem data', status: 'Sem status' };

const EMPTY_POR_ABA: Record<Aba, { title: string; subtitle: string }> = {
    andamento:  { title: 'Nenhum desligamento em andamento', subtitle: 'Inicie um processo para um colaborador elegível.' },
    concluidos: { title: 'Nenhum desligamento concluído',    subtitle: 'Os processos finalizados aparecem aqui.' },
    todos:      { title: 'Nenhum processo de desligamento',  subtitle: 'Inicie um processo para um colaborador elegível.' },
};

const MOTIVO_SEM_ELEGIVEL = 'Nenhum colaborador ativo ou afastado sem processo de desligamento.';

const checklistFeitos = (t: TerminationRecord) => (t.checklist || []).length;

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// ── Wizard de Desligamento ───────────────────────────────────────────────────

interface TerminationWizardProps {
    orgId: string | null;
    employees: Employee[];
    existing?: TerminationRecord | null;
    onClose: () => void;
    onSaved: () => void;
}

const TerminationWizard: React.FC<TerminationWizardProps> = ({ orgId, employees, existing, onClose, onSaved }) => {
    const confirm = useConfirm();
    const isEditing = !!existing;
    // Desligamento já concluído: o assistente edita o registro e MANTÉM o status — "Salvar rascunho"
    // o rebaixaria para RASCUNHO. O gatilho do banco atualiza o cadastro do colaborador (data/motivo).
    const isConcluded = existing?.status === 'CONCLUIDO';
    // Editar usa a organização DO REGISTRO (REGRA #5): em "Todas as organizações" o topo não tem org.
    const writeOrgId = existing?.org_id ?? orgId;
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState<Partial<TerminationRecord>>({
        org_id: writeOrgId ?? undefined,
        employee_id:            existing?.employee_id || '',
        termination_date:       existing?.termination_date || new Date().toISOString().split('T')[0],
        tipo:                   existing?.tipo || 'DEMISSAO_SEM_JUSTA_CAUSA',
        motivo:                 existing?.motivo || '',
        aviso_previo_tipo:      existing?.aviso_previo_tipo || undefined,
        aviso_previo_inicio:    existing?.aviso_previo_inicio || '',
        aviso_previo_fim:       existing?.aviso_previo_fim || '',
        checklist:              existing?.checklist || [],
        entrevista_realizada:   existing?.entrevista_realizada || false,
        entrevista_motivo_real: existing?.entrevista_motivo_real || '',
        entrevista_pontos:      existing?.entrevista_pontos || '',
        entrevista_recontrataria: existing?.entrevista_recontrataria ?? undefined,
        status: existing?.status || 'RASCUNHO',
    });

    const set = <K extends keyof TerminationRecord>(k: K, v: TerminationRecord[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const toggleChecklist = (id: string) => {
        const list = (form.checklist || []) as string[];
        set('checklist', list.includes(id) ? list.filter(i => i !== id) : [...list, id]);
    };

    const checkedItems = (form.checklist || []) as string[];
    const selectedEmployee = employees.find(e => e.id === form.employee_id);
    const completionPct = Math.round((checkedItems.length / CHECKLIST_ITEMS.length) * 100);

    const steps = [
        { label: 'Dados',       icon: FileText },
        { label: 'Aviso',       icon: ClipboardList },
        { label: 'Checklist',   icon: CheckSquare },
        { label: 'Entrevista',  icon: MessageSquare },
        { label: 'Finalizar',   icon: CheckCircle2 },
    ];

    const handleSave = async (finalize = false) => {
        // Escrita exige organização específica (REGRA #5, exceção 4):
        // em "Todas as organizações" não há org para gravar.
        if (!writeOrgId) { alert('Selecione uma organização específica no seletor do topo para cadastrar.'); return; }
        if (!form.employee_id) { alert('Selecione um colaborador.'); return; }
        if (!form.termination_date) { alert('Informe a data de desligamento.'); return; }
        setSaving(true);
        try {
            let record: TerminationRecord;
            const payload = { ...form, status: finalize || isConcluded ? 'CONCLUIDO' : 'RASCUNHO' } as any;

            if (isEditing && existing?.id) {
                record = await laborService.updateTermination(existing.id, payload);
                if (finalize && !isConcluded) {
                    record = await laborService.finalizeTermination(existing.id, 'gestor');
                }
            } else {
                record = await laborService.createTermination(payload);
                if (finalize) {
                    record = await laborService.finalizeTermination(record.id, 'gestor');
                }
            }
            onSaved();
        } catch (err: any) {
            alert('Erro: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };

    const NEEDS_AVISO = ['DEMISSAO_SEM_JUSTA_CAUSA', 'PEDIDO_DEMISSAO', 'ACORDO_MUTUO'].includes(form.tipo || '');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b flex items-center justify-between bg-gradient-to-r from-rose-600 to-rose-700 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <UserMinus className="w-5 h-5" />
                            {isEditing ? 'Editar Desligamento' : 'Processo de Desligamento'}
                        </h2>
                        {selectedEmployee && (
                            <p className="text-rose-200 text-xs mt-0.5">{selectedEmployee.name} — {selectedEmployee.role}</p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white"><X className="w-5 h-5" /></button>
                </div>

                {/* Step bar */}
                <div className="px-6 py-3 bg-slate-50 border-b shrink-0">
                    <div className="flex items-center gap-1">
                        {steps.map((s, i) => (
                            <React.Fragment key={s.label}>
                                <button
                                    onClick={() => setStep(i)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                                        step === i ? 'bg-rose-600 text-white' :
                                        i < step ? 'bg-emerald-100 text-emerald-700' :
                                        'text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    {i < step ? <CheckCircle2 className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                                    {s.label}
                                </button>
                                {i < steps.length - 1 && <div className="h-px flex-1 bg-slate-200" />}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Step 0: Dados */}
                    {step === 0 && (
                        <div className="space-y-4">
                            <InputGroup label="Colaborador *">
                                <div className="relative">
                                    <select
                                        value={form.employee_id}
                                        onChange={e => set('employee_id', e.target.value)}
                                        className={inputCls + ' appearance-none pr-8'}
                                        disabled={isEditing}
                                    >
                                        <option value="">Selecione...</option>
                                        {employees
                                            // Ao editar, o colaborador do registro entra mesmo DESLIGADO (o campo fica travado).
                                            .filter(e => e.status === 'ATIVO' || e.status === 'AFASTADO' || e.id === existing?.employee_id)
                                            .map(e => (
                                                <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                                            ))}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                </div>
                            </InputGroup>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputGroup label="Data do Desligamento *">
                                    <input type="date" value={form.termination_date} onChange={e => set('termination_date', e.target.value)} className={inputCls} />
                                </InputGroup>
                                <InputGroup label="Tipo de Desligamento *">
                                    <div className="relative">
                                        <select value={form.tipo} onChange={e => set('tipo', e.target.value as TerminationTipo)} className={inputCls + ' appearance-none pr-8'}>
                                            {(Object.entries(TIPO_LABELS) as [TerminationTipo, string][]).map(([k, v]) => (
                                                <option key={k} value={k}>{v}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                    </div>
                                </InputGroup>
                            </div>

                            <InputGroup label="Motivo detalhado">
                                <textarea value={form.motivo || ''} onChange={e => set('motivo', e.target.value)} className={inputCls + ' resize-none h-20'} placeholder="Descreva o motivo do desligamento..." />
                            </InputGroup>

                            {/* Info sobre tipo */}
                            {form.tipo && (
                                <div className={`p-3 rounded-xl border flex items-center gap-2 ${TIPO_COLORS[form.tipo].bg} border-opacity-30`}>
                                    <AlertTriangle className={`w-4 h-4 shrink-0 ${TIPO_COLORS[form.tipo].text}`} />
                                    <p className={`text-xs font-bold ${TIPO_COLORS[form.tipo].text}`}>
                                        {form.tipo === 'DEMISSAO_SEM_JUSTA_CAUSA' && 'Gera: FGTS + multa 40%, Aviso prévio (trabalhado ou indenizado), Seguro-desemprego.'}
                                        {form.tipo === 'DEMISSAO_COM_JUSTA_CAUSA' && 'Não gera: FGTS multado, Aviso prévio ou Seguro-desemprego.'}
                                        {form.tipo === 'PEDIDO_DEMISSAO' && 'Não gera: Multa FGTS nem Seguro-desemprego. Aviso prévio obrigatório.'}
                                        {form.tipo === 'ACORDO_MUTUO' && '§6º CLT: 50% da multa FGTS, 50% do aviso prévio indenizado, sem seguro-desemprego.'}
                                        {form.tipo === 'TERMINO_CONTRATO' && 'Contrato por prazo determinado. Verificar cláusula rescisória.'}
                                        {form.tipo === 'APOSENTADORIA' && 'Requerer benefício no INSS. FGTS pode ser sacado.'}
                                        {form.tipo === 'FALECIMENTO' && 'Comunicar beneficiários. Emitir documentação para herdeiros.'}
                                        {form.tipo === 'OUTROS' && 'Registre o motivo no campo acima.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 1: Aviso Prévio */}
                    {step === 1 && (
                        <div className="space-y-4">
                            {!NEEDS_AVISO ? (
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                                    <p className="text-sm font-bold text-slate-500">Tipo de desligamento selecionado não requer aviso prévio.</p>
                                </div>
                            ) : (
                                <>
                                    <InputGroup label="Tipo de Aviso Prévio">
                                        <div className="grid grid-cols-3 gap-3">
                                            {(['TRABALHADO', 'INDENIZADO', 'DISPENSADO'] as AvisoPrevioTipo[]).map(tipo => (
                                                <button
                                                    key={tipo}
                                                    type="button"
                                                    onClick={() => set('aviso_previo_tipo', tipo)}
                                                    className={`p-3 rounded-xl border-2 text-button font-black uppercase tracking-widest transition-all ${form.aviso_previo_tipo === tipo ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                                >
                                                    {tipo === 'TRABALHADO' ? 'Trabalhado' : tipo === 'INDENIZADO' ? 'Indenizado' : 'Dispensado'}
                                                </button>
                                            ))}
                                        </div>
                                    </InputGroup>
                                    <div className="grid grid-cols-2 gap-4">
                                        <InputGroup label="Início do Aviso">
                                            <input type="date" value={form.aviso_previo_inicio || ''} onChange={e => set('aviso_previo_inicio', e.target.value)} className={inputCls} />
                                        </InputGroup>
                                        <InputGroup label="Fim do Aviso">
                                            <input type="date" value={form.aviso_previo_fim || ''} onChange={e => set('aviso_previo_fim', e.target.value)} className={inputCls} />
                                        </InputGroup>
                                    </div>
                                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-form-input font-bold text-blue-800">
                                        Aviso proporcional: 30 dias + 3 dias por ano trabalhado (máx. 90 dias — Lei 12.506/2011).
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Step 2: Checklist */}
                    {step === 2 && (
                        <div className="space-y-3">
                            {/* Barra de progresso */}
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-black text-slate-600">{checkedItems.length} / {CHECKLIST_ITEMS.length} itens concluídos</p>
                                <span className={`text-form-input font-black px-2 py-0.5 rounded-lg ${completionPct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {completionPct}%
                                </span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                                <div className={`h-full rounded-full transition-all duration-500 ${completionPct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${completionPct}%` }} />
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                {CHECKLIST_ITEMS.map(item => {
                                    const checked = checkedItems.includes(item.id);
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => toggleChecklist(item.id)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                                                checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                                            }`}
                                        >
                                            <div className={`p-1.5 rounded-lg ${checked ? 'bg-emerald-500' : 'bg-slate-100'}`}>
                                                <Icon className={`w-3.5 h-3.5 ${checked ? 'text-white' : 'text-slate-400'}`} />
                                            </div>
                                            <span className={`text-sm font-bold flex-1 ${checked ? 'text-emerald-800' : 'text-slate-700'}`}>
                                                {item.label}
                                            </span>
                                            {checked
                                                ? <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                                                : <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                            }
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Entrevista */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => set('entrevista_realizada', !form.entrevista_realizada)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${form.entrevista_realizada ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                >
                                    {form.entrevista_realizada ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                    Entrevista de desligamento realizada
                                </button>
                            </div>

                            {form.entrevista_realizada && (
                                <>
                                    <InputGroup label="Motivo real informado pelo colaborador">
                                        <textarea value={form.entrevista_motivo_real || ''} onChange={e => set('entrevista_motivo_real', e.target.value)} className={inputCls + ' resize-none h-20'} placeholder="O que o colaborador relatou como motivação real para saída..." />
                                    </InputGroup>
                                    <InputGroup label="Pontos de melhoria levantados">
                                        <textarea value={form.entrevista_pontos || ''} onChange={e => set('entrevista_pontos', e.target.value)} className={inputCls + ' resize-none h-20'} placeholder="Sugestões, críticas ou elogios mencionados..." />
                                    </InputGroup>
                                    <div className="space-y-2">
                                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Recontrataria este colaborador?</p>
                                        <div className="flex gap-3">
                                            {([true, false] as const).map(val => (
                                                <button key={String(val)} type="button"
                                                    onClick={() => set('entrevista_recontrataria', val)}
                                                    className={`px-4 py-2 rounded-xl border-2 text-sm font-black transition-all ${form.entrevista_recontrataria === val ? (val ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-rose-400 bg-rose-50 text-rose-700') : 'border-slate-200 text-slate-500'}`}
                                                >
                                                    {val ? 'Sim' : 'Não'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Step 4: Finalizar */}
                    {step === 4 && (
                        <div className="space-y-5">
                            {/* Resumo */}
                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Resumo do Processo</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { label: 'Colaborador',  value: selectedEmployee?.name || '—' },
                                        { label: 'Data',         value: form.termination_date || '—' },
                                        { label: 'Tipo',         value: TIPO_LABELS[form.tipo!] || '—' },
                                        { label: 'Aviso Prévio', value: form.aviso_previo_tipo || 'N/A' },
                                    ].map(({ label, value }) => (
                                        <div key={label}>
                                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                            <p className="text-sm font-bold text-slate-800 mt-0.5">{value}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-2 border-t border-slate-200">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Checklist</p>
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${completionPct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {checkedItems.length}/{CHECKLIST_ITEMS.length} ({completionPct}%)
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                                        <div className={`h-full rounded-full ${completionPct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${completionPct}%` }} />
                                    </div>
                                </div>
                            </div>

                            {completionPct < 100 && (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-xs font-bold text-amber-800">
                                        {isConcluded
                                            ? 'O checklist não está 100% completo.'
                                            : 'O checklist não está 100% completo. Você pode salvar como rascunho e finalizar depois, ou finalizar agora mesmo assim.'}
                                    </p>
                                </div>
                            )}

                            {isConcluded ? (
                                <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-black text-blue-900">Ao salvar as alterações:</p>
                                        <ul className="mt-1 space-y-0.5 text-xs font-bold text-blue-800">
                                            <li>• O desligamento continua concluído</li>
                                            <li>• Data e motivo do desligamento são atualizados no cadastro do colaborador</li>
                                            <li>• Folhas já processadas só mudam quando forem reprocessadas</li>
                                        </ul>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-black text-rose-900">Ao Finalizar:</p>
                                        <ul className="mt-1 space-y-0.5 text-xs font-bold text-rose-700">
                                            <li>• Colaborador terá status alterado para DESLIGADO</li>
                                            <li>• Todos os EPIs ativos serão marcados como devolvidos</li>
                                            <li>• Ação irreversível</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-slate-50/50 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex gap-2">
                        {step > 0 && (
                            <Button variant="ghost" onClick={() => setStep(s => s - 1)} className="text-slate-600 border border-slate-200">
                                ← Voltar
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose} className="text-slate-500">
                            Cancelar
                        </Button>
                        {!isConcluded && (
                            <button
                                onClick={() => handleSave(false)}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-600 text-white rounded-xl hover:bg-slate-700 font-bold text-sm transition-all disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Salvar Rascunho
                            </button>
                        )}
                        {isConcluded && step < steps.length - 1 && (
                            <Button variant="ghost" onClick={() => setStep(s => s + 1)} className="text-slate-600 border border-slate-200">
                                Próximo →
                            </Button>
                        )}
                        {isConcluded ? (
                            <button
                                onClick={() => handleSave(false)}
                                disabled={saving}
                                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-sm transition-all shadow-lg disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Salvar alterações
                            </button>
                        ) : step < steps.length - 1 ? (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-sm transition-all shadow-lg"
                            >
                                Próximo →
                            </button>
                        ) : (
                            <button
                                onClick={async () => { const ok = await confirm({ title: 'Confirmar desligamento?', message: 'Esta ação é irreversível.', variant: 'danger', confirmLabel: 'Confirmar' }); if (ok) handleSave(true); }}
                                disabled={saving}
                                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-sm transition-all shadow-lg disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Finalizar Desligamento
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Componente principal ─────────────────────────────────────────────────────

interface LaborTerminationProps {
    orgId: string | null;
    employees: Employee[];
    onRefresh?: () => void;
    organizations: Array<{ id: string; name: string }>;
}

const LaborTermination: React.FC<LaborTerminationProps> = ({ orgId, employees, onRefresh, organizations }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const [aba, setAba] = usePersistedState<Aba>('laborTermination:aba', 'andamento');
    const [showWizard, setShowWizard] = useState(false);
    const [editingRecord, setEditingRecord] = useState<TerminationRecord | null>(null);

    const terminationsKey = [...laborKeys.all, 'terminations', orgId];

    // Sem `enabled: !!orgId` nas queries desta tela — com "Todas as organizações"
    // a RLS recorta sozinha e a tela não pode ficar vazia (REGRA #5).
    const { data: terminations = [], isLoading } = useQuery({
        queryKey: terminationsKey,
        queryFn: () => laborService.listTerminations(orgId),
        staleTime: STALE.normal,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: terminationsKey });
        qc.invalidateQueries({ queryKey: laborKeys.employees(orgId) });
        onRefresh?.();
    };

    const deleteMutation = useMutation({
        mutationFn: (id: string) => laborService.deleteTermination(id),
        // §22: tira só a linha do cache — excluir um processo não recarrega a lista inteira.
        onSuccess: (_, id) => qc.setQueryData<TerminationRecord[]>(terminationsKey, prev => (prev ?? []).filter(t => t.id !== id)),
    });

    const drafts    = useMemo(() => terminations.filter(t => t.status === 'RASCUNHO'), [terminations]);
    const concluded = useMemo(() => terminations.filter(t => t.status === 'CONCLUIDO'), [terminations]);
    // Array estável por aba — o StandardTable reage à identidade de `rows`.
    const rows = aba === 'andamento' ? drafts : aba === 'concluidos' ? concluded : terminations;

    // Colaboradores elegíveis (ativos ou afastados sem processo em andamento)
    const terminatedIds = new Set(terminations.map(t => t.employee_id));
    const eligible = employees.filter(e => (e.status === 'ATIVO' || e.status === 'AFASTADO') && !terminatedIds.has(e.id));

    // Organização só aparece (coluna e agrupamento) em "Todas as organizações".
    const isAllOrgs = !orgId;
    const orgName = useMemo(() => new Map(organizations.map(o => [o.id, o.name])), [organizations]);
    const columns = useMemo(() => (isAllOrgs ? [ORG_COLUMN, ...COLUMNS] : COLUMNS), [isAllOrgs]);

    // "Agrupar" (§6.12). Chave = o MESMO texto que a célula mostra; sem `valor` — não há dinheiro aqui.
    const agrupamento = useMemo(() => ({
        opcoes: [
            ...(isAllOrgs ? [{ value: 'org', label: 'Organização' }] : []),
            { value: 'tipo', label: 'Tipo' },
            { value: 'mes', label: 'Mês do desligamento' },
            { value: 'status', label: 'Status' },
        ],
        chave: (campo: string, t: TerminationRecord) => {
            switch (campo) {
                case 'org': return chavePorNome(orgName.get(t.org_id));
                case 'tipo': return chavePorRotulo(t.tipo, TIPO_LABELS);
                case 'mes': return chavePorMes(t.termination_date);
                case 'status': return chavePorRotulo(t.status, STATUS_LABELS);
                default: return null;
            }
        },
        semRotulo: (campo: string) => SEM_GRUPO[campo] ?? 'Sem valor',
        ordem: (campo: string) => (
            campo === 'tipo' ? Object.keys(TIPO_LABELS)
                : campo === 'status' ? Object.keys(STATUS_LABELS)
                    : campo === 'mes' ? 'chave' as const
                        : undefined
        ),
        title: 'Agrupar os desligamentos',
    }), [isAllOrgs, orgName]);

    const abrirWizard = (record: TerminationRecord | null) => { setEditingRecord(record); setShowWizard(true); };

    const excluir = async (t: TerminationRecord) => {
        const ok = await confirm({ title: 'Excluir processo?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' });
        if (ok) deleteMutation.mutate(t.id);
    };

    const renderCell = (key: string, t: TerminationRecord) => {
        switch (key) {
            case 'org': {
                const nome = orgName.get(t.org_id) ?? '—';
                return <span className="block truncate text-sm font-normal text-gray-700" title={nome}>{nome}</span>;
            }
            case 'colaborador': return <span className="block truncate text-sm font-normal text-gray-700" title={t.employee_name}>{t.employee_name || '—'}</span>;
            case 'cargo': return <span className="block truncate text-sm font-normal text-gray-600" title={t.employee_role}>{t.employee_role || '—'}</span>;
            case 'tipo': return <span className={`block truncate text-sm font-normal ${TIPO_COLORS[t.tipo].text}`} title={TIPO_LABELS[t.tipo]}>{TIPO_LABELS[t.tipo]}</span>;
            case 'data': return <span className="text-sm font-normal text-gray-600">{formatDate(t.termination_date) || '—'}</span>;
            case 'aviso': return <span className="text-sm font-normal text-gray-600">{t.aviso_previo_tipo ? AVISO_LABELS[t.aviso_previo_tipo] : '—'}</span>;
            case 'checklist': {
                const feitos = checklistFeitos(t);
                const pct = Math.round((feitos / CHECKLIST_ITEMS.length) * 100);
                return (
                    <SegmentedProgress
                        percent={pct}
                        tone={pct === 100 ? 'emerald' : 'amber'}
                        hint={`${feitos}/${CHECKLIST_ITEMS.length}`}
                        title={`${feitos} de ${CHECKLIST_ITEMS.length} itens do checklist concluídos`}
                    />
                );
            }
            case 'entrevista': return t.entrevista_realizada
                ? <span className="text-sm font-normal text-emerald-700">Realizada</span>
                : <span className="text-sm font-normal text-gray-600">Pendente</span>;
            case 'status': return <span className={`text-sm font-normal ${STATUS_TEXT[t.status]}`}>{STATUS_LABELS[t.status]}</span>;
            default: return null;
        }
    };

    const sortValue = (key: string, t: TerminationRecord) => {
        switch (key) {
            case 'org': return orgName.get(t.org_id) ?? '';
            case 'colaborador': return t.employee_name ?? '';
            case 'cargo': return t.employee_role ?? '';
            case 'tipo': return TIPO_LABELS[t.tipo];
            case 'data': return t.termination_date;
            case 'aviso': return t.aviso_previo_tipo ? AVISO_LABELS[t.aviso_previo_tipo] : '';
            case 'checklist': return checklistFeitos(t);
            case 'entrevista': return t.entrevista_realizada;
            case 'status': return STATUS_LABELS[t.status];
            default: return null;
        }
    };

    const semElegivel = eligible.length === 0;

    return (
        <div className="space-y-6">
            {/* 1. Título (§20) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Desligamentos</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Checklist, entrevista de desligamento e encerramento de acessos.</p>
            </div>

            {/* 2. Toolbar de abas (§19.1) — vem ANTES dos KPIs (ANATOMIA do guia); ação primária (§17) à direita */}
            <TabsBar<Aba>
                tabs={[
                    { id: 'andamento',  label: 'Em andamento', icon: <Clock className="w-4 h-4" />,         badge: drafts.length,       badgeTitulo: 'Processos em andamento' },
                    { id: 'concluidos', label: 'Concluídos',   icon: <CheckCircle2 className="w-4 h-4" />,  badge: concluded.length,    badgeTitulo: 'Processos concluídos' },
                    { id: 'todos',      label: 'Todos',        icon: <ClipboardList className="w-4 h-4" />, badge: terminations.length, badgeTitulo: 'Todos os processos' },
                ]}
                value={aba}
                onChange={setAba}
            >
                {/* Botão desligado não mostra dica em todo navegador — o motivo vai no invólucro também */}
                <span className="inline-flex" title={semElegivel ? MOTIVO_SEM_ELEGIVEL : undefined}>
                    <button
                        onClick={() => abrirWizard(null)}
                        disabled={semElegivel}
                        title={semElegivel ? MOTIVO_SEM_ELEGIVEL : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                        <Plus className="w-[15px] h-[15px]" />
                        Iniciar desligamento
                    </button>
                </span>
            </TabsBar>

            {/* 3. KPIs (§4) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Em andamento"    value={drafts.length}       icon={<Clock className="w-4 h-4" />}        color="amber" />
                <KpiCard label="Concluídos"      value={concluded.length}    icon={<CheckCircle2 className="w-4 h-4" />} color="gray" />
                <KpiCard label="Elegíveis"       value={eligible.length}     icon={<Users className="w-4 h-4" />}        color="indigo" />
                <KpiCard label="Total processos" value={terminations.length} icon={<UserMinus className="w-4 h-4" />}    color="rose" />
            </div>

            {/* 4. Tabela padrão (§6.10) — busca, colunas, autofit e Agrupar na toolbar acoplada */}
            <StandardTable<TerminationRecord>
                storageKey="labor:desligamentos:tabela"
                columns={columns}
                rows={rows}
                rowKey={t => t.id}
                loading={isLoading}
                searchText={t => `${t.employee_name ?? ''} ${t.employee_role ?? ''} ${TIPO_LABELS[t.tipo]} ${t.motivo ?? ''}`}
                searchPlaceholder="Buscar colaborador, cargo ou tipo..."
                agrupamento={agrupamento}
                sortValue={sortValue}
                renderCell={renderCell}
                actions={{
                    width: 140,
                    render: t => (
                        <>
                            {/* Editar vale para qualquer situação; em andamento, o mesmo botão retoma o assistente (§9.1: uma ação, um botão) */}
                            <ActionIconButton
                                kind="edit"
                                size="sm"
                                title={t.status === 'RASCUNHO' ? 'Continuar editando' : 'Editar desligamento'}
                                onClick={() => abrirWizard(t)}
                            />
                            <ActionIconButton kind="delete" size="sm" onClick={() => excluir(t)} />
                        </>
                    ),
                }}
                empty={{ icon: <UserMinus className="w-12 h-12 text-gray-300 mx-auto mb-4" />, ...EMPTY_POR_ABA[aba] }}
            />

            {/* Wizard */}
            {showWizard && (
                <TerminationWizard
                    orgId={orgId}
                    employees={employees}
                    existing={editingRecord}
                    onClose={() => { setShowWizard(false); setEditingRecord(null); }}
                    // O assistente não devolve o registro, e finalizar muda o status do colaborador — recarrega.
                    onSaved={() => { setShowWizard(false); setEditingRecord(null); invalidate(); }}
                />
            )}
        </div>
    );
};

export default LaborTermination;
