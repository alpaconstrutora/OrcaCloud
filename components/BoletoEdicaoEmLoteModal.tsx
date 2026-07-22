import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Loader2, Users } from 'lucide-react';
import { boletoService } from '../services/boletoService';
import type { Boleto } from '../types';
import { formatBRL } from './BoletoFormModal';

interface ItemOption {
    id: string;
    name: string;
}

interface BoletoEdicaoEmLoteModalProps {
    boletos: Boleto[];
    organizationId: string;
    suppliers: ItemOption[];
    projects: ItemOption[];
    costCenters: ItemOption[];
    userEmail?: string;
    onClose: () => void;
    onSaved: () => void;
}

type ActionResult = { ok: string[]; errors: Array<{ id: string; error: string }> } | null;

const BoletoEdicaoEmLoteModal: React.FC<BoletoEdicaoEmLoteModalProps> = ({
    boletos, organizationId, suppliers, projects, costCenters, userEmail, onClose, onSaved,
}) => {
    const [supplierId, setSupplierId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [costCenterId, setCostCenterId] = useState('');
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<ActionResult>(null);

    const totalValor = boletos.reduce((s, b) => s + (b.valor ?? 0), 0);

    const beneficiarios = [...new Set(boletos.map(b => b.supplier_id ?? b.beneficiario_nome ?? ''))];
    const mixedBeneficiario = beneficiarios.length > 1;

    function buildFields() {
        const fields: Partial<Pick<Boleto, 'supplier_id' | 'cost_center_id' | 'project_id'>> = {};
        if (supplierId)   fields.supplier_id    = supplierId;
        if (projectId)    fields.project_id     = projectId;
        if (costCenterId) fields.cost_center_id = costCenterId;
        return fields;
    }

    // Agrupa boletos por organization_id para suportar seleção multi-org
    function groupByOrg(): Record<string, string[]> {
        const g: Record<string, string[]> = {};
        for (const b of boletos) {
            const oid = b.organization_id || organizationId;
            (g[oid] ??= []).push(b.id);
        }
        return g;
    }

    async function handleSalvarRascunho() {
        setSaving(true);
        try {
            const fields = buildFields();
            for (const [oid, ids] of Object.entries(groupByOrg())) {
                await boletoService.associarEmLote(ids, oid, fields, userEmail);
            }
            onSaved();
            onClose();
        } catch (err: unknown) {
            setResult({ ok: [], errors: [{ id: '', error: err instanceof Error ? err.message : String(err) }] });
        } finally {
            setSaving(false);
        }
    }

    async function handleAprovarELancar() {
        setSaving(true);
        const allOk: string[] = [];
        const allErrors: Array<{ id: string; error: string }> = [];
        try {
            const fields = buildFields();
            for (const [oid, ids] of Object.entries(groupByOrg())) {
                const res = await boletoService.aprovarEmLote(ids, oid, fields, userEmail);
                allOk.push(...res.ok);
                allErrors.push(...res.errors);
            }
        } catch (err: unknown) {
            allErrors.push({ id: '', error: err instanceof Error ? err.message : String(err) });
        } finally {
            setSaving(false);
        }
        // Mostrar resultado ANTES de chamar onSaved (que recarrega os dados no pai)
        setResult({ ok: allOk, errors: allErrors });
        if (allOk.length > 0) onSaved();
    }

    const allDone = result !== null && result.errors.length === 0;
    const noneChanged = !supplierId && !projectId && !costCenterId;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Edição em Lote</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {boletos.length} boleto{boletos.length !== 1 ? 's' : ''} selecionado{boletos.length !== 1 ? 's' : ''} · {formatBRL(totalValor)}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

                    {/* Aviso beneficiários misturados */}
                    {mixedBeneficiario && !result && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>
                                Os boletos selecionados têm <strong>{beneficiarios.length} beneficiários distintos</strong>.
                                A edição se aplica a todos igualmente.
                            </span>
                        </div>
                    )}

                    {/* Lista resumida */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 divide-y divide-gray-100 max-h-36 overflow-y-auto">
                        {boletos.map(b => (
                            <div key={b.id} className="flex items-center justify-between px-4 py-2 text-xs">
                                <span className="text-gray-700 font-medium truncate max-w-[60%]">
                                    {b.beneficiario_nome ?? b.documento_nome ?? '—'}
                                </span>
                                <span className="text-gray-500 font-bold flex-shrink-0 ml-2">{formatBRL(b.valor)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Resultado da operação (aparece após Aprovar e Lançar) */}
                    {result && (
                        <div className="space-y-2">
                            {result.ok.length > 0 && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                    <span>{result.ok.length} boleto{result.ok.length !== 1 ? 's' : ''} aprovado{result.ok.length !== 1 ? 's' : ''} com sucesso.</span>
                                </div>
                            )}
                            {result.errors.map((e, i) => (
                                <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{e.id ? `Boleto ${e.id.slice(0, 8)}…: ` : ''}{e.error}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Campos de edição — ocultados após resultado final */}
                    {!allDone && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 pb-1 border-b border-gray-100">
                                <Users className="w-3.5 h-3.5" />
                                Alterar campos — deixe vazio para não alterar
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Fornecedor</label>
                                <select
                                    value={supplierId}
                                    onChange={e => setSupplierId(e.target.value)}
                                    disabled={saving}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                                >
                                    <option value="">— Não alterar —</option>
                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Obra / Projeto</label>
                                <select
                                    value={projectId}
                                    onChange={e => setProjectId(e.target.value)}
                                    disabled={saving}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                                >
                                    <option value="">— Não alterar —</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Plano de Contas</label>
                                <select
                                    value={costCenterId}
                                    onChange={e => setCostCenterId(e.target.value)}
                                    disabled={saving}
                                    className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                                >
                                    <option value="">— Não alterar —</option>
                                    {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            {noneChanged && (
                                <p className="text-xs text-gray-400 text-center">Selecione ao menos um campo para habilitar as ações.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-button uppercase tracking-widest hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                        {allDone ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!allDone && (
                        <>
                            <button
                                onClick={handleSalvarRascunho}
                                disabled={saving || noneChanged}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gray-900 text-white font-bold text-button uppercase tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-40"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Salvar Rascunho
                            </button>
                            <button
                                onClick={handleAprovarELancar}
                                disabled={saving || noneChanged}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-600 text-white font-bold text-button uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-lg shadow-blue-900/20"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Aprovar e Lançar
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BoletoEdicaoEmLoteModal;
