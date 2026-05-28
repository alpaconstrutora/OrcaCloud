import React, { useState } from 'react';
import {
    UserMinus, Plus, X, ChevronDown, Loader2, Search,
    CheckSquare, Square, AlertTriangle, CheckCircle2,
    FileText, HardHat, Shield, MessageSquare, Trash2,
    ClipboardList, Lock, DollarSign, Eye
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    laborService, Employee,
    TerminationRecord, TerminationTipo, AvisoPrevioTipo
} from '../services/laborService';
import { laborKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryClient';

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

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';
const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

// ── Wizard de Desligamento ───────────────────────────────────────────────────

interface TerminationWizardProps {
    orgId: string;
    employees: Employee[];
    existing?: TerminationRecord | null;
    onClose: () => void;
    onSaved: () => void;
}

const TerminationWizard: React.FC<TerminationWizardProps> = ({ orgId, employees, existing, onClose, onSaved }) => {
    const isEditing = !!existing;
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState<Partial<TerminationRecord>>({
        org_id: orgId,
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
        if (!form.employee_id) { alert('Selecione um colaborador.'); return; }
        if (!form.termination_date) { alert('Informe a data de desligamento.'); return; }
        setSaving(true);
        try {
            let record: TerminationRecord;
            const payload = { ...form, status: finalize ? 'CONCLUIDO' : 'RASCUNHO' } as any;

            if (isEditing && existing?.id) {
                record = await laborService.updateTermination(existing.id, payload);
                if (finalize) {
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
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
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
                                            .filter(e => e.status === 'ATIVO' || e.status === 'AFASTADO')
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
                                                    className={`p-3 rounded-xl border-2 text-xs font-black uppercase tracking-widest transition-all ${form.aviso_previo_tipo === tipo ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
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
                                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs font-bold text-blue-800">
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
                                <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${completionPct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
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
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recontrataria este colaborador?</p>
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
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                            <p className="text-sm font-bold text-slate-800 mt-0.5">{value}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-2 border-t border-slate-200">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Checklist</p>
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
                                        O checklist não está 100% completo. Você pode salvar como rascunho e finalizar depois, ou finalizar agora mesmo assim.
                                    </p>
                                </div>
                            )}

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
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-slate-50/50 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex gap-2">
                        {step > 0 && (
                            <button onClick={() => setStep(s => s - 1)} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all border border-slate-200">
                                ← Voltar
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all">
                            Cancelar
                        </button>
                        <button
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-600 text-white rounded-xl hover:bg-slate-700 font-bold text-sm transition-all disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Salvar Rascunho
                        </button>
                        {step < steps.length - 1 ? (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-sm transition-all shadow-lg"
                            >
                                Próximo →
                            </button>
                        ) : (
                            <button
                                onClick={() => { if (confirm('Confirmar o desligamento? Esta ação é irreversível.')) handleSave(true); }}
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
    orgId: string;
    employees: Employee[];
    onRefresh?: () => void;
}

const LaborTermination: React.FC<LaborTerminationProps> = ({ orgId, employees, onRefresh }) => {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [showWizard, setShowWizard] = useState(false);
    const [editingRecord, setEditingRecord] = useState<TerminationRecord | null>(null);

    const terminationsKey = [...laborKeys.all, 'terminations', orgId];

    const { data: terminations = [], isLoading } = useQuery({
        queryKey: terminationsKey,
        queryFn: () => laborService.listTerminations(orgId),
        staleTime: STALE.normal,
        enabled: !!orgId,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: terminationsKey });
        qc.invalidateQueries({ queryKey: laborKeys.employees(orgId) });
        onRefresh?.();
    };

    const deleteMutation = useMutation({
        mutationFn: (id: string) => laborService.deleteTermination(id),
        onSuccess: invalidate,
    });

    const drafts    = terminations.filter(t => t.status === 'RASCUNHO');
    const concluded = terminations.filter(t => t.status === 'CONCLUIDO');

    const filtered = terminations.filter(t =>
        !search ||
        (t.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        TIPO_LABELS[t.tipo].toLowerCase().includes(search.toLowerCase())
    );

    // Colaboradores elegíveis (ativos ou afastados sem processo em andamento)
    const terminatedIds = new Set(terminations.map(t => t.employee_id));
    const eligible = employees.filter(e => (e.status === 'ATIVO' || e.status === 'AFASTADO') && !terminatedIds.has(e.id));

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Em Andamento',   value: drafts.length,    bg: 'bg-amber-50',   text: 'text-amber-700' },
                    { label: 'Concluídos',      value: concluded.length, bg: 'bg-slate-100',  text: 'text-slate-600' },
                    { label: 'Elegíveis',       value: eligible.length,  bg: 'bg-indigo-50',  text: 'text-indigo-700' },
                    { label: 'Total Processos', value: terminations.length, bg: 'bg-rose-50', text: 'text-rose-700' },
                ].map(({ label, value, bg, text }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className={`text-2xl font-black ${text} ${bg} px-2 py-0.5 rounded-lg inline-block`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                <div>
                    <p className="text-sm font-black text-slate-800">Processos de Desligamento</p>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">Checklist completo: documentos, EPIs, acesso e entrevista</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-100 w-44" />
                    </div>
                    <button
                        onClick={() => { setEditingRecord(null); setShowWizard(true); }}
                        disabled={eligible.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-all font-bold text-xs shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Iniciar Desligamento
                    </button>
                </div>
            </div>

            {/* Lista */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <UserMinus className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-black text-slate-400">Nenhum processo de desligamento</p>
                        <p className="text-xs text-slate-400 mt-1">Inicie um processo para um colaborador elegível.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {filtered.map(t => {
                            const tipoStyle = TIPO_COLORS[t.tipo];
                            const checkedCount = (t.checklist || []).length;
                            const pct = Math.round((checkedCount / CHECKLIST_ITEMS.length) * 100);
                            return (
                                <div key={t.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className={`p-2.5 rounded-xl ${t.status === 'CONCLUIDO' ? 'bg-slate-100' : 'bg-rose-100'} shrink-0`}>
                                            <UserMinus className={`w-4 h-4 ${t.status === 'CONCLUIDO' ? 'text-slate-500' : 'text-rose-600'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="text-sm font-black text-slate-900">{t.employee_name || '—'}</span>
                                                {t.employee_role && <span className="text-xs text-slate-400 font-medium">{t.employee_role}</span>}
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${tipoStyle.bg} ${tipoStyle.text}`}>
                                                    {TIPO_LABELS[t.tipo]}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${t.status === 'CONCLUIDO' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                                                    {t.status === 'CONCLUIDO' ? 'Concluído' : 'Em andamento'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                                                <span className="text-xs text-slate-500 font-medium">Data: {t.termination_date}</span>
                                                {t.aviso_previo_tipo && <span className="text-xs text-slate-400">Aviso: {t.aviso_previo_tipo.toLowerCase()}</span>}
                                                <span className="text-xs font-bold text-slate-600">Checklist: {pct}%</span>
                                            </div>
                                            {/* Mini progress bar */}
                                            <div className="h-1 bg-slate-100 rounded-full mt-2 max-w-[200px] overflow-hidden">
                                                <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                        {/* Ações */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            {t.status === 'RASCUNHO' && (
                                                <button
                                                    onClick={() => { setEditingRecord(t); setShowWizard(true); }}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-[10px] font-black transition-all"
                                                >
                                                    <Eye className="w-3 h-3" /> Continuar
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { if (confirm('Excluir este processo?')) deleteMutation.mutate(t.id); }}
                                                className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Wizard */}
            {showWizard && (
                <TerminationWizard
                    orgId={orgId}
                    employees={employees}
                    existing={editingRecord}
                    onClose={() => { setShowWizard(false); setEditingRecord(null); }}
                    onSaved={() => { setShowWizard(false); setEditingRecord(null); invalidate(); }}
                />
            )}
        </div>
    );
};

export default LaborTermination;
