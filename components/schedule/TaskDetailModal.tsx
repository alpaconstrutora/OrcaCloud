import React from 'react';
import { X, AlertTriangle, CheckCircle2, Clock, TrendingUp, TrendingDown, Users, Link2, Calendar, Hash, Layers, Package } from 'lucide-react';
import { HierarchyNode, ItemScheduleDetails } from '../../types/schedule';
import { BudgetEntry } from '../../types/budget';

interface TaskDetailModalProps {
    node: HierarchyNode;
    item: BudgetEntry;
    itemSchedule: ItemScheduleDetails | undefined;
    idToUid: Record<string, string>;
    allItems: { id: string; name: string }[];
    onClose: () => void;
    handleUpdateItemSchedule: (itemId: string, field: 'duration' | 'startDate' | 'endDate', value: string | number) => void;
    handleUpdateRealPct: (itemId: string, value: string) => void;
    handleUpdateCrewField: (id: string, field: string, value: string | number | boolean) => void;
}

const fmt = (date?: string) =>
    date ? new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const toInputDate = (date?: string) => (date ? date.split('T')[0] : '');

const fmtCurrency = (v?: number) =>
    v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }) : '—';

const ConstraintLabels: Record<string, string> = {
    MSO: 'Deve Iniciar Em',
    MFO: 'Deve Terminar Em',
    SNET: 'Não Iniciar Antes De',
    SNLT: 'Não Iniciar Depois De',
    FNET: 'Não Terminar Antes De',
    FNLT: 'Não Terminar Depois De',
    ASAP: 'O Mais Cedo Possível',
    ALAP: 'O Mais Tarde Possível',
};

const DependencyLabels: Record<string, string> = {
    FS: 'Fim → Início (FS)',
    SS: 'Início → Início (SS)',
    FF: 'Fim → Fim (FF)',
    SF: 'Início → Fim (SF)',
};

interface FieldProps { label: string; value: React.ReactNode; className?: string }
const Field: React.FC<FieldProps> = ({ label, value, className }) => (
    <div className={`flex flex-col gap-0.5 ${className || ''}`}>
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
        <span className="text-sm font-semibold text-gray-800">{value ?? '—'}</span>
    </div>
);

interface EditFieldProps {
    label: string;
    type?: 'date' | 'number';
    value: string | number;
    suffix?: string;
    step?: string;
    min?: number;
    max?: number;
    onCommit: (value: string) => void;
    className?: string;
}
const EditField: React.FC<EditFieldProps> = ({ label, type = 'number', value, suffix, step, min, max, onCommit, className }) => {
    const [draft, setDraft] = React.useState(String(value ?? ''));
    React.useEffect(() => { setDraft(String(value ?? '')); }, [value]);

    const commit = () => {
        if (draft !== String(value ?? '')) onCommit(draft);
    };

    return (
        <div className={`flex flex-col gap-0.5 ${className || ''}`}>
            {label && <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>}
            <div className="flex items-center gap-1">
                <input
                    type={type}
                    value={draft}
                    step={step}
                    min={min}
                    max={max}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
                        if (e.key === 'Escape') { setDraft(String(value ?? '')); (e.target as HTMLInputElement).blur(); }
                    }}
                    className="w-full text-sm font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
                {suffix && <span className="text-xs font-medium text-gray-400 shrink-0">{suffix}</span>}
            </div>
        </div>
    );
};

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
    node, item, itemSchedule, idToUid, allItems, onClose,
    handleUpdateItemSchedule, handleUpdateRealPct, handleUpdateCrewField,
}) => {
    const isCritical = itemSchedule?.isCritical ?? node.isCritical;
    const totalFloat = itemSchedule?.totalFloat ?? node.totalFloat ?? 0;
    const unitCost = item.sinapiItem.price;
    const totalCost = unitCost * item.quantity * (1 + (item.bdi ?? 0) / 100);
    const progress = itemSchedule?.manualRealPct ?? 0;
    const realizedValue = node.realizedTotal ?? 0;

    return (
        <div className="fixed inset-0 z-[200] flex justify-end" onClick={onClose}>
            <div
                className="h-full w-full max-w-md bg-white shadow-2xl border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-250"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`p-5 border-b flex items-start gap-3 ${isCritical ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                    <div className={`mt-0.5 shrink-0 p-2 rounded-lg ${isCritical ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                        {isCritical ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            {node.wbsCode && (
                                <span className="text-[10px] font-black font-mono text-blue-600 bg-white px-1.5 py-0.5 rounded border border-blue-200">
                                    {node.wbsCode}
                                </span>
                            )}
                            <span className="text-[10px] font-bold text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                                ID {node.uid}
                            </span>
                            {isCritical && (
                                <span className="text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded border border-red-200 uppercase tracking-wider">
                                    Crítico
                                </span>
                            )}
                        </div>
                        <h2 className="text-sm font-bold text-gray-900 leading-snug line-clamp-3">
                            {item.sinapiItem.description}
                        </h2>
                    </div>
                    <button onClick={onClose} className="shrink-0 p-1.5 hover:bg-white rounded-lg transition-colors text-gray-400 hover:text-gray-700">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">

                    {/* Localização na WBS */}
                    <section>
                        <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            <Layers className="w-3.5 h-3.5" /> Localização
                        </h3>
                        <div className="grid grid-cols-1 gap-2">
                            <Field label="Grupo" value={item.group} />
                            <Field label="Etapa" value={item.phase} />
                            {item.subPhase && <Field label="Subetapa" value={item.subPhase} />}
                        </div>
                    </section>

                    {/* Cronograma — editável */}
                    <section>
                        <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            <Calendar className="w-3.5 h-3.5" /> Cronograma
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <EditField
                                label="Início"
                                type="date"
                                value={toInputDate(itemSchedule?.startDate || node.earlyStart)}
                                onCommit={(v) => handleUpdateItemSchedule(item.id, 'startDate', v)}
                            />
                            <EditField
                                label="Fim"
                                type="date"
                                value={toInputDate(itemSchedule?.endDate || node.earlyFinish)}
                                onCommit={(v) => handleUpdateItemSchedule(item.id, 'endDate', v)}
                            />
                            <EditField
                                label="Duração"
                                type="number"
                                min={0}
                                suffix="dias"
                                value={itemSchedule?.duration ?? 0}
                                onCommit={(v) => handleUpdateItemSchedule(item.id, 'duration', parseInt(v, 10) || 0)}
                            />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Folga Total</span>
                                <span className={`text-sm font-semibold py-1.5 ${totalFloat === 0 ? 'text-red-600' : totalFloat <= 3 ? 'text-orange-500' : 'text-green-600'}`}>
                                    {totalFloat} {totalFloat === 1 ? 'dia' : 'dias'}
                                </span>
                            </div>
                            <div className="col-span-2 grid grid-cols-2 gap-1 bg-green-50 border border-green-100 rounded-xl p-3">
                                <Field label="Início Cedo" value={fmt(itemSchedule?.earlyStart || node.earlyStart)} />
                                <Field label="Fim Cedo" value={fmt(itemSchedule?.earlyFinish || node.earlyFinish)} />
                            </div>
                            <div className="col-span-2 grid grid-cols-2 gap-1 bg-orange-50 border border-orange-100 rounded-xl p-3">
                                <Field label="Início Tarde" value={fmt(itemSchedule?.lateStart || node.lateStart)} />
                                <Field label="Fim Tarde" value={fmt(itemSchedule?.lateFinish || node.lateFinish)} />
                            </div>
                            {itemSchedule?.isMilestone && (
                                <div className="col-span-2">
                                    <span className="text-[10px] font-black text-purple-600 bg-purple-50 border border-purple-200 px-2 py-1 rounded-lg uppercase tracking-widest">
                                        Marco (Milestone)
                                    </span>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Progresso — editável */}
                    <section>
                        <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            <TrendingUp className="w-3.5 h-3.5" /> Progresso
                        </h3>
                        <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-gray-600 shrink-0">Realizado (%)</span>
                                <div className="flex items-center gap-1 w-28">
                                    <EditField
                                        label=""
                                        type="number"
                                        min={0}
                                        max={100}
                                        step="0.1"
                                        value={progress}
                                        onCommit={(v) => handleUpdateRealPct(item.id, v)}
                                        className="flex-1"
                                    />
                                    <span className="text-sm font-black text-blue-600 shrink-0">%</span>
                                </div>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(100, progress)}%` }}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Custos */}
                    <section>
                        <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            <TrendingDown className="w-3.5 h-3.5" /> Custos
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Custo Unitário" value={fmtCurrency(unitCost)} />
                            <Field label="Custo Total c/ BDI" value={fmtCurrency(totalCost)} />
                            {itemSchedule?.budgetedValue != null && (
                                <Field label="Valor Orçado" value={fmtCurrency(itemSchedule.budgetedValue)} />
                            )}
                            {itemSchedule?.plannedValue != null && (
                                <Field label="Valor Planejado" value={fmtCurrency(itemSchedule.plannedValue)} />
                            )}
                            {itemSchedule?.actualValue != null && (
                                <Field label="Valor Realizado" value={fmtCurrency(itemSchedule.actualValue)} />
                            )}
                            {realizedValue > 0 && (
                                <Field label="Realizado (acum.)" value={fmtCurrency(realizedValue)} />
                            )}
                            {item.bdi != null && item.bdi > 0 && (
                                <Field label="BDI" value={`${item.bdi}%`} />
                            )}
                        </div>
                    </section>

                    {/* Item SINAPI */}
                    <section>
                        <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            <Package className="w-3.5 h-3.5" /> Item
                        </h3>
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-black font-mono text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded shrink-0">
                                    {item.sinapiItem.code}
                                </span>
                                <span className="text-[10px] text-gray-400 font-medium text-right leading-tight">{item.sinapiItem.category}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Field label="Quantidade" value={item.quantity.toLocaleString('pt-BR')} />
                                <Field label="Unidade" value={item.sinapiItem.unit} />
                                <Field label="Tipo" value={item.sinapiItem.type} />
                            </div>
                            {item.sinapiItem.source && (
                                <Field label="Banco" value={item.sinapiItem.source} />
                            )}
                        </div>
                    </section>

                    {/* Restrição */}
                    {itemSchedule?.constraintType && itemSchedule.constraintType !== 'ASAP' && (
                        <section>
                            <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                                <Clock className="w-3.5 h-3.5" /> Restrição
                            </h3>
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
                                <Field label="Tipo" value={ConstraintLabels[itemSchedule.constraintType] || itemSchedule.constraintType} />
                                {itemSchedule.constraintDate && (
                                    <Field label="Data" value={fmt(itemSchedule.constraintDate)} />
                                )}
                            </div>
                        </section>
                    )}

                    {/* Predecessores */}
                    {itemSchedule?.predecessors && itemSchedule.predecessors.length > 0 && (
                        <section>
                            <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                                <Link2 className="w-3.5 h-3.5" /> Predecessores ({itemSchedule.predecessors.length})
                            </h3>
                            <div className="space-y-2">
                                {itemSchedule.predecessors.map((pred) => {
                                    const predItem = allItems.find(t => t.id === pred.id);
                                    const uid = idToUid[pred.id] || '—';
                                    return (
                                        <div key={pred.id} className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                                            <span className="shrink-0 text-[10px] font-black font-mono text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                                {uid}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-semibold text-gray-700 truncate" title={predItem?.name}>
                                                    {predItem?.name || pred.id}
                                                </p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    {DependencyLabels[pred.type] || pred.type}
                                                    {pred.lag !== 0 && ` · Lag: ${pred.lag > 0 ? '+' : ''}${pred.lag}d`}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Equipe — editável */}
                    <section>
                        <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            <Users className="w-3.5 h-3.5" /> Equipe
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            <EditField
                                label="Principais"
                                type="number"
                                min={0}
                                value={itemSchedule?.crewMainWorkers ?? 0}
                                onCommit={(v) => handleUpdateCrewField(item.id, 'crewMainWorkers', parseInt(v, 10) || 0)}
                            />
                            <EditField
                                label="Ajudantes"
                                type="number"
                                min={0}
                                value={itemSchedule?.crewHelpers ?? 0}
                                onCommit={(v) => handleUpdateCrewField(item.id, 'crewHelpers', parseInt(v, 10) || 0)}
                            />
                            <EditField
                                label="Horas/dia"
                                type="number"
                                min={0}
                                step="0.5"
                                value={itemSchedule?.hoursPerDay ?? 8}
                                onCommit={(v) => handleUpdateCrewField(item.id, 'hoursPerDay', parseFloat(v) || 0)}
                            />
                            <EditField
                                label="Eficiência"
                                type="number"
                                min={0}
                                suffix="%"
                                value={itemSchedule?.efficiencyFactor != null ? Math.round(itemSchedule.efficiencyFactor * 100) : 100}
                                onCommit={(v) => handleUpdateCrewField(item.id, 'efficiencyFactor', (parseFloat(v) || 100) / 100)}
                            />
                            {itemSchedule?.totalLaborCost != null && (
                                <Field label="Custo M.O." value={fmtCurrency(itemSchedule.totalLaborCost)} />
                            )}
                            {itemSchedule?.totalManHours != null && (
                                <Field label="H·H Total" value={`${itemSchedule.totalManHours.toFixed(1)} h`} />
                            )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 leading-tight">
                            Alterar a equipe ativa o cálculo automático de duração com base na produtividade.
                        </p>
                    </section>

                    {/* IDs internos */}
                    <section>
                        <h3 className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            <Hash className="w-3.5 h-3.5" /> Referência
                        </h3>
                        <div className="grid grid-cols-1 gap-1.5 text-[10px] font-mono text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-3">
                            <div className="flex justify-between"><span>ID interno:</span><span className="text-gray-600">{item.id}</span></div>
                            <div className="flex justify-between"><span>UID seq.:</span><span className="text-gray-600">{node.uid}</span></div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
