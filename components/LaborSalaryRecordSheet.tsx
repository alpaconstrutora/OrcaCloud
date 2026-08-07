import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Paperclip, TrendingDown, TrendingUp, Minus, AlertTriangle, X } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import { formatMoney } from './ui/Format';
import { EmployeeSalaryRecord, SalaryChangeType } from '../services/laborService';
import { OrgRole } from '../types';

/** Rótulos dos motivos — fonte única, compartilhada com a tabela do histórico. */
export const SALARY_CHANGE_LABELS: Record<SalaryChangeType, string> = {
    ADMISSAO: 'Admissão',
    MERITO: 'Mérito',
    PROMOCAO: 'Promoção',
    DISSIDIO: 'Dissídio',
    ENQUADRAMENTO: 'Enquadramento',
    REDUCAO: 'Redução',
    AJUSTE: 'Ajuste',
    OUTRO: 'Outro',
};

/** Motivos oferecidos no formulário. ADMISSAO e AJUSTE ficam de fora: são
 *  gerados pelo trigger do banco, não se lançam à mão. */
const SELECTABLE_TYPES: SalaryChangeType[] = [
    'MERITO', 'PROMOCAO', 'DISSIDIO', 'ENQUADRAMENTO', 'REDUCAO', 'OUTRO',
];

const CONTRACT_TYPES = ['CLT', 'PJ', 'DIARISTA', 'TEMPORARIO', 'ESTAGIARIO', 'AUTONOMO'];

export interface SalaryRecordSubmit {
    effective_date: string;
    new_salary: number;
    change_type: SalaryChangeType;
    org_role_id: string | null;
    role_label: string | null;
    jornada_horas_semana: number | null;
    contract_type: string | null;
    notes: string | null;
    file: File | null;
}

interface LaborSalaryRecordSheetProps {
    open: boolean;
    onClose: () => void;
    /** Registro em edição; null = novo lançamento. */
    record: EmployeeSalaryRecord | null;
    /** Salário vigente hoje — base do cálculo de variação ao vivo. */
    currentSalary: number;
    orgRoles: OrgRole[];
    defaults: {
        org_role_id: string | null;
        role_label: string | null;
        jornada_horas_semana: number | null;
        contract_type: string | null;
    };
    onSubmit: (data: SalaryRecordSubmit) => Promise<void>;
}

const inputCls = "w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all";
const labelCls = "text-xs font-semibold text-slate-500";

const todayISO = () => new Date().toISOString().slice(0, 10);

const LaborSalaryRecordSheet: React.FC<LaborSalaryRecordSheetProps> = ({
    open, onClose, record, currentSalary, orgRoles, defaults, onSubmit,
}) => {
    const isEditing = !!record;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [effectiveDate, setEffectiveDate] = useState(todayISO());
    const [newSalary, setNewSalary] = useState<string>('');
    const [changeType, setChangeType] = useState<SalaryChangeType>('MERITO');
    const [orgRoleId, setOrgRoleId] = useState<string>('');
    const [jornada, setJornada] = useState<string>('');
    const [contractType, setContractType] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [file, setFile] = useState<File | null>(null);

    // Recarrega o formulário sempre que o painel abre (novo ou edição)
    useEffect(() => {
        if (!open) return;
        setError(null);
        setFile(null);
        if (record) {
            setEffectiveDate(record.effective_date?.slice(0, 10) || todayISO());
            setNewSalary(String(record.new_salary ?? ''));
            setChangeType(record.change_type);
            setOrgRoleId(record.org_role_id || '');
            setJornada(record.jornada_horas_semana != null ? String(record.jornada_horas_semana) : '');
            setContractType(record.contract_type || '');
            setNotes(record.notes || '');
        } else {
            setEffectiveDate(todayISO());
            setNewSalary('');
            setChangeType('MERITO');
            setOrgRoleId(defaults.org_role_id || '');
            setJornada(defaults.jornada_horas_semana != null ? String(defaults.jornada_horas_semana) : '');
            setContractType(defaults.contract_type || '');
            setNotes('');
        }
    }, [open, record, defaults]);

    // Na edição, o "anterior" é o que já ficou gravado no registro.
    const previous = isEditing ? (record?.previous_salary ?? 0) : currentSalary;
    const parsedSalary = parseFloat(newSalary) || 0;

    const delta = useMemo(() => {
        const diff = parsedSalary - previous;
        const pct = previous > 0 ? (diff / previous) * 100 : null;
        return { diff, pct };
    }, [parsedSalary, previous]);

    const isFuture = effectiveDate > todayISO();

    const handleSubmit = async () => {
        setError(null);
        if (!effectiveDate) { setError('Informe a data de vigência.'); return; }
        if (!(parsedSalary > 0)) { setError('Informe o novo salário.'); return; }

        setSaving(true);
        try {
            await onSubmit({
                effective_date: effectiveDate,
                new_salary: parsedSalary,
                change_type: changeType,
                org_role_id: orgRoleId || null,
                role_label: orgRoles.find(r => r.id === orgRoleId)?.nome || defaults.role_label || null,
                jornada_horas_semana: jornada ? parseFloat(jornada) : null,
                contract_type: contractType || null,
                notes: notes.trim() || null,
                file,
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar o registro.');
        } finally {
            setSaving(false);
        }
    };

    const DeltaIcon = delta.diff > 0 ? TrendingUp : delta.diff < 0 ? TrendingDown : Minus;
    const deltaTone = delta.diff > 0 ? 'text-emerald-600' : delta.diff < 0 ? 'text-red-600' : 'text-gray-400';

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{isEditing ? 'Editar registro salarial' : 'Registrar reajuste'}</SheetTitle>
                <SheetDescription>
                    {isEditing
                        ? 'Alterar a data ou o valor pode mudar qual registro está vigente.'
                        : 'O salário do colaborador passa a valer a partir da data de vigência informada.'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-5">
                {error && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-[10px] p-3">
                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className={labelCls}>Data de vigência *</label>
                        <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelCls}>Motivo *</label>
                        <select value={changeType} onChange={e => setChangeType(e.target.value as SalaryChangeType)} className={inputCls}>
                            {SELECTABLE_TYPES.map(t => (
                                <option key={t} value={t}>{SALARY_CHANGE_LABELS[t]}</option>
                            ))}
                            {/* Registro automático em edição mantém o motivo original disponível */}
                            {isEditing && !SELECTABLE_TYPES.includes(changeType) && (
                                <option value={changeType}>{SALARY_CHANGE_LABELS[changeType]}</option>
                            )}
                        </select>
                    </div>
                </div>

                {isFuture && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-[10px] p-3">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-700">
                            Data futura: o registro entra como <strong>programado</strong> e o salário do
                            colaborador só muda quando a data chegar.
                        </p>
                    </div>
                )}

                {/* Valores — anterior é read-only; a variação se atualiza enquanto digita */}
                <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className={labelCls}>Salário anterior</label>
                            <div className="px-3 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm text-slate-500">
                                {formatMoney(previous)}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Novo salário *</label>
                            <input
                                type="number" min="0" step="0.01"
                                value={newSalary}
                                onChange={e => setNewSalary(e.target.value)}
                                onFocus={e => e.target.select()}
                                className={inputCls + ' border-indigo-200 bg-white'}
                                placeholder="0,00"
                            />
                        </div>
                    </div>

                    <div className={`flex items-center gap-2 text-sm ${deltaTone}`}>
                        <DeltaIcon className="w-4 h-4" />
                        <span>
                            {delta.diff >= 0 ? '+' : '−'}{formatMoney(Math.abs(delta.diff))}
                            {delta.pct !== null && ` (${delta.diff >= 0 ? '+' : '−'}${Math.abs(delta.pct).toFixed(2)}%)`}
                        </span>
                        <span className="text-gray-400">
                            · custo/hora {formatMoney(parsedSalary / 220)} · custo/dia {formatMoney((parsedSalary / 220) * 8)}
                        </span>
                    </div>
                </div>

                {/* Contexto na época */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                        <label className={labelCls}>Cargo na época</label>
                        <select value={orgRoleId} onChange={e => setOrgRoleId(e.target.value)} className={inputCls}>
                            <option value="">{defaults.role_label || 'Sem cargo do catálogo'}</option>
                            {orgRoles.map(r => (
                                <option key={r.id} value={r.id}>{r.nome}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelCls}>Jornada (h/semana)</label>
                        <input type="number" min="0" step="1" value={jornada} onChange={e => setJornada(e.target.value)} className={inputCls} placeholder="44" />
                    </div>
                    <div className="space-y-1.5">
                        <label className={labelCls}>Tipo de contrato</label>
                        <select value={contractType} onChange={e => setContractType(e.target.value)} className={inputCls}>
                            <option value="">Não informado</option>
                            {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className={labelCls}>Observações</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputCls} placeholder="Ex: acordo coletivo 2026, promoção a encarregado…" />
                </div>

                {/* Anexo — só no lançamento novo; trocar arquivo de registro existente
                    exigiria rollback de storage, que não faz parte deste escopo. */}
                {!isEditing && (
                    <div className="space-y-1.5">
                        <label className={labelCls}>Termo de reajuste (opcional)</label>
                        {file ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[6px]">
                                <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="text-sm text-slate-600 truncate flex-1">{file.name}</span>
                                <button type="button" onClick={() => setFile(null)} className="p-1 text-slate-400 hover:text-red-600 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <input
                                type="file"
                                onChange={e => setFile(e.target.files?.[0] || null)}
                                className="w-full text-sm text-slate-500 file:mr-3 file:h-9 file:px-3.5 file:rounded-[6px] file:border-0 file:bg-slate-100 file:text-sm file:font-medium file:text-slate-600 hover:file:bg-slate-200 file:cursor-pointer"
                            />
                        )}
                    </div>
                )}
                {isEditing && record?.file_name && (
                    <p className="text-sm text-gray-400 flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5" /> Anexo atual: {record.file_name}
                    </p>
                )}
            </SheetPanel>

            <SheetFooter>
                <button onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all">
                    Cancelar
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all active:scale-95 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Registrar'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default LaborSalaryRecordSheet;
