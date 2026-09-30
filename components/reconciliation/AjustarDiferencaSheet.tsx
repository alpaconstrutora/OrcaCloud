import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Receipt, Scissors, PencilLine, PlusCircle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { formatMoney, formatDateBR } from '../ui/Format';
import CostCenterSelect, { type CostCenterOption } from '../CostCenterSelect';
import ClientSelect, { type ClientOption } from '../ClientSelect';
import SupplierSelect, { type SupplierOption } from '../SupplierSelect';
import type { InternalTransaction } from '../../types/financial';
import type { ModoAjuste, ResumoSelecao } from '../../utils/reconciliationSelection';
import type { ReconcileGroupParams } from '../../services/bankReconciliationService';

/**
 * "Ajustar diferença" da aba Pendentes: extrato e lançamentos selecionados não
 * somam o mesmo, e o usuário escolhe COMO a diferença se resolve antes de
 * conciliar. Cada opção desligada diz por quê (o motivo vem de
 * `resumoDaSelecao`, que espelha a RPC `fn_reconcile_group`).
 *
 * Plano: docs/planos/2026-09-29-conciliacao-pendentes-conciliar-e-ajustes.md
 */

interface Props {
    open: boolean;
    resumo: ResumoSelecao;
    lancamentos: InternalTransaction[];
    categories: string[];
    clienteRegistros: ClientOption[];
    credorRegistros: SupplierOption[];
    /** Ids de `credorRegistros` que são fornecedores (os outros são colaboradores,
     *  sem FK em `supplier_id`). */
    fornecedorIds: ReadonlySet<string>;
    projects: Array<{ id: string; name: string }>;
    costCenters: CostCenterOption[];
    onClose: () => void;
    onApply: (mode: ModoAjuste, params: ReconcileGroupParams) => Promise<void>;
}

const OPCOES: Array<{ mode: ModoAjuste; titulo: string; texto: string; icon: React.ElementType }> = [
    { mode: 'ADJUSTMENT', titulo: 'Diferença como ajuste', icon: Receipt,
      texto: 'Cria um lançamento de ajuste (tarifa, juros, multa, desconto) no valor da diferença, já conciliado.' },
    { mode: 'EXCESS', titulo: 'Excedente vira lançamento', icon: PlusCircle,
      texto: 'O que o extrato tem a mais vira um lançamento novo, com categoria e credor/cliente, já conciliado.' },
    { mode: 'PARTIAL', titulo: 'Baixa parcial — saldo em aberto', icon: Scissors,
      texto: 'Um lançamento é desmembrado: a parte paga concilia e o saldo vira um lançamento pendente, com o mesmo vencimento.' },
    { mode: 'ADJUST_VALUE', titulo: 'Ajustar valor do lançamento', icon: PencilLine,
      texto: 'O valor do lançamento passa a ser o do extrato. O valor anterior fica registrado na auditoria.' },
];

const label = 'text-xs font-semibold text-slate-500';
const field = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50';

const AjustarDiferencaSheet: React.FC<Props> = ({
    open, resumo, lancamentos, categories, clienteRegistros, credorRegistros, fornecedorIds,
    projects, costCenters, onClose, onApply,
}) => {
    const confirm = useConfirm();
    const primeiroHabilitado = OPCOES.find(o => resumo.ajustes[o.mode].habilitado)?.mode ?? 'ADJUSTMENT';
    const [mode, setMode] = useState<ModoAjuste>(primeiroHabilitado);
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [entityId, setEntityId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [costCenterId, setCostCenterId] = useState('');
    const [splitId, setSplitId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reabriu com outra seleção: volta ao primeiro ajuste possível e zera o formulário.
    useEffect(() => {
        if (!open) return;
        setMode(primeiroHabilitado);
        setCategory(''); setDescription(''); setEntityId(''); setProjectId(''); setCostCenterId('');
        setSplitId(resumo.titulosDesmembraveis[0]?.id ?? '');
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const dif = Math.abs(resumo.diferenca);
    const credito = resumo.direcao === 'CREDIT';
    const split = lancamentos.find(l => l.id === splitId);
    const unico = lancamentos.length === 1 ? lancamentos[0] : null;

    const falta = useMemo(() => {
        if (!resumo.ajustes[mode].habilitado) return resumo.ajustes[mode].motivo;
        if (mode === 'ADJUSTMENT' && !category) return 'Escolha a categoria do ajuste';
        if (mode === 'EXCESS' && !category) return 'Escolha a categoria do lançamento novo';
        if (mode === 'PARTIAL' && !split) return 'Escolha qual lançamento fica com o saldo em aberto';
        return null;
    }, [mode, category, split, resumo]);

    async function aplicar() {
        if (falta) return;
        if (mode === 'PARTIAL' && split) {
            const ok = await confirm({
                title: 'Desmembrar o lançamento?',
                message: `"${split.description ?? 'Lançamento'}" passa de ${formatMoney(split.amount)} para ${formatMoney(Math.abs(split.amount) - dif)} e é conciliado. Um lançamento novo de ${formatMoney(dif)} fica pendente${split.due_date ? `, vencendo em ${formatDateBR(split.due_date)}` : ''}.`,
                variant: 'warning',
                confirmLabel: 'Desmembrar e conciliar',
            });
            if (!ok) return;
        }
        if (mode === 'ADJUST_VALUE' && unico) {
            const ok = await confirm({
                title: 'Alterar o valor do lançamento?',
                message: `"${unico.description ?? 'Lançamento'}" passa de ${formatMoney(unico.amount)} para ${formatMoney(resumo.totalExtrato)} e é conciliado. O valor anterior fica na auditoria.`,
                variant: 'warning',
                confirmLabel: 'Alterar e conciliar',
            });
            if (!ok) return;
        }

        const params: ReconcileGroupParams = {};
        if (mode === 'ADJUSTMENT') params.category = category;
        if (mode === 'EXCESS') {
            const cadastro = credito
                ? clienteRegistros.find(c => c.id === entityId)
                : credorRegistros.find(s => s.id === entityId);
            Object.assign(params, {
                category,
                description: description.trim() || null,
                entity_name: cadastro?.name ?? null,
                party_id: credito && cadastro ? cadastro.id : null,
                supplier_id: !credito && cadastro && fornecedorIds.has(cadastro.id) ? cadastro.id : null,
                project_id: projectId || null,
                cost_center_id: costCenterId || null,
            });
        }
        if (mode === 'PARTIAL') params.split_internal_id = splitId;

        setSaving(true);
        setError(null);
        try {
            await onApply(mode, params);
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
        } finally {
            setSaving(false);
        }
    }

    // Sinal do ajuste na mesma convenção da RPC: saída a mais = despesa, a menos = receita.
    const ajusteEhReceita = (credito ? 1 : -1) * resumo.diferenca > 0;

    return (
        <Sheet open={open} onClose={onClose} size="md" dirty={!saving && (!!category || !!description || !!entityId)}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Ajustar diferença</SheetTitle>
                <SheetDescription>
                    {resumo.qtdExtrato} do extrato × {resumo.qtdLancamentos} lançamento{resumo.qtdLancamentos !== 1 ? 's' : ''} · {credito ? 'entradas' : 'saídas'}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="p-6 space-y-8">
                {/* Resumo — o número que a escolha abaixo precisa zerar */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-[10px] border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className={label}>Extrato</p>
                        <p className="text-sm font-bold text-gray-900">{formatMoney(resumo.totalExtrato)}</p>
                    </div>
                    <div className="rounded-[10px] border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className={label}>Lançamentos</p>
                        <p className="text-sm font-bold text-gray-900">{formatMoney(resumo.totalLancamentos)}</p>
                    </div>
                    <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className={label}>Diferença</p>
                        <p className="text-sm font-bold text-amber-700">
                            {resumo.diferenca > 0 ? '+' : '−'}{formatMoney(dif)}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="flex items-start gap-2 p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {/* As 4 saídas — desligada continua visível e diz por quê */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Como resolver a diferença</h3>
                    </div>
                    <div className="space-y-2" role="radiogroup" aria-label="Como resolver a diferença">
                        {OPCOES.map(o => {
                            const d = resumo.ajustes[o.mode];
                            const ativo = mode === o.mode;
                            const Icon = o.icon;
                            return (
                                <button
                                    key={o.mode}
                                    type="button"
                                    role="radio"
                                    aria-checked={ativo}
                                    disabled={!d.habilitado || saving}
                                    onClick={() => { setMode(o.mode); setError(null); }}
                                    title={d.motivo ?? undefined}
                                    className={`w-full text-left flex items-start gap-3 p-3 rounded-[10px] border transition-all ${
                                        ativo && d.habilitado
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                    } disabled:cursor-not-allowed disabled:bg-gray-50 disabled:hover:border-gray-200`}
                                >
                                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${d.habilitado ? 'text-blue-600' : 'text-gray-300'}`} />
                                    <span className="min-w-0">
                                        <span className={`block text-sm font-medium ${d.habilitado ? 'text-gray-900' : 'text-gray-400'}`}>{o.titulo}</span>
                                        <span className="block text-xs text-gray-500 mt-0.5">{o.texto}</span>
                                        {d.motivo && <span className="block text-xs text-amber-700 mt-1">{d.motivo}</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Campos da opção escolhida — malha §30 */}
                {resumo.ajustes[mode].habilitado && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                            <h3 className="text-sm font-semibold text-gray-900">
                                {OPCOES.find(o => o.mode === mode)?.titulo}
                            </h3>
                        </div>

                        {mode === 'ADJUSTMENT' && (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="ajuste-categoria" className={label}>Categoria</label>
                                    <select id="ajuste-categoria" value={category} onChange={e => setCategory(e.target.value)} disabled={saving} className={field}>
                                        <option value="">Selecione</option>
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <p className={label}>Lançamento criado</p>
                                    <p className="h-9 flex items-center text-sm text-gray-700">
                                        {ajusteEhReceita ? 'Entrada' : 'Saída'} de {formatMoney(dif)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {mode === 'EXCESS' && (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5 col-span-2">
                                    <label htmlFor="excedente-descricao" className={label}>Descrição</label>
                                    <input id="excedente-descricao" value={description} onChange={e => setDescription(e.target.value)}
                                        placeholder="Excedente de conciliação" disabled={saving} className={field} />
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="excedente-categoria" className={label}>Categoria</label>
                                    <select id="excedente-categoria" value={category} onChange={e => setCategory(e.target.value)} disabled={saving} className={field}>
                                        <option value="">Selecione</option>
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <p className={label}>{credito ? 'Cliente' : 'Credor'}</p>
                                    {credito ? (
                                        <ClientSelect clients={clienteRegistros} value={entityId} onChange={setEntityId}
                                            placeholder="Nenhum" icon={null} disabled={saving} />
                                    ) : (
                                        <SupplierSelect suppliers={credorRegistros} value={entityId} onChange={setEntityId}
                                            placeholder="Nenhum" title="Selecionar Credor" size="sm" disabled={saving} />
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="excedente-obra" className={label}>Obra</label>
                                    <select id="excedente-obra" value={projectId} onChange={e => setProjectId(e.target.value)} disabled={saving} className={field}>
                                        <option value="">Nenhuma</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <p className={label}>Centro de custo</p>
                                    <CostCenterSelect costCenters={costCenters} value={costCenterId} onChange={setCostCenterId}
                                        placeholder="Nenhum" size="sm" disabled={saving} hoverCls="hover:bg-blue-50" />
                                </div>
                                <p className="col-span-2 text-xs text-gray-500">
                                    Lançamento novo de {formatMoney(dif)} ({credito ? 'entrada' : 'saída'}), conciliado com o extrato selecionado.
                                </p>
                            </div>
                        )}

                        {mode === 'PARTIAL' && (
                            <div className="space-y-2" role="radiogroup" aria-label="Lançamento que fica com o saldo">
                                <p className={label}>Qual lançamento fica com o saldo em aberto</p>
                                {resumo.titulosDesmembraveis.map(t => (
                                    <label key={t.id} className={`flex items-center gap-3 p-3 rounded-[10px] border cursor-pointer ${splitId === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                        <input type="radio" name="split" checked={splitId === t.id} onChange={() => setSplitId(t.id)} disabled={saving}
                                            className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm text-gray-900 truncate" title={t.description}>{t.description || 'Sem descrição'}</span>
                                            <span className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                                                {formatMoney(t.amount)} <ArrowRight className="w-3 h-3" />
                                                pago {formatMoney(Math.abs(t.amount) - dif)} · saldo {formatMoney(dif)}
                                                {t.due_date ? ` · venc. ${formatDateBR(t.due_date)}` : ''}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {mode === 'ADJUST_VALUE' && unico && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                                <span className="truncate" title={unico.description}>{unico.description || 'Lançamento'}</span>
                                <span className="shrink-0 text-gray-500">{formatMoney(unico.amount)}</span>
                                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                                <span className="shrink-0 font-semibold text-gray-900">{formatMoney(resumo.totalExtrato)}</span>
                            </div>
                        )}
                    </div>
                )}
            </SheetPanel>

            <SheetFooter>
                {falta && <span className="text-xs text-gray-500 mr-auto">{falta}</span>}
                <button onClick={onClose} disabled={saving} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all disabled:opacity-50">
                    Cancelar
                </button>
                <button
                    onClick={aplicar}
                    disabled={saving || !!falta}
                    title={falta ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {saving && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    Ajustar e conciliar
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default AjustarDiferencaSheet;
