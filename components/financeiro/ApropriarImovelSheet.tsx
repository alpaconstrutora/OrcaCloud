import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, X, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { propertyExpenseService } from '../../services/propertyExpenseService';
import type { Allocation } from '../../lib/rentalAllocation';

/**
 * Apropria despesas já lançadas a um imóvel (Fase 2 — OPEX por imóvel).
 *
 * É AÇÃO EM LOTE, e não campo num formulário de criação, porque não existe
 * formulário de criação de conta a pagar: as contas nascem em sete caminhos
 * diferentes (conciliação, boleto, NF-e, P2P, folha, societária, tributos).
 * Instrumentar todos seria sete vezes o trabalho e um lugar novo para esquecer
 * a cada caminho novo. Aqui, um ponto só cobre todas as origens — e permite
 * apropriar o IPTU de 12 meses de uma vez.
 *
 * Painel lateral pelo UI_PATTERNS (Sheet é o padrão; modal central só para
 * interrupção crítica).
 */

interface PropertyOption {
    id: string;
    name: string;
    type: string;
    parent_id: string | null;
}

interface Props {
    organizationId: string;
    /** Lançamentos selecionados: id e valor (o rateio é por lançamento). */
    payables: { id: string; amount: number; description?: string | null }[];
    onClose: () => void;
    onDone: (message: string) => void;
}

const money = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const ApropriarImovelSheet: React.FC<Props> = ({ organizationId, payables, onClose, onDone }) => {
    const [properties, setProperties] = useState<PropertyOption[]>([]);
    const [propertyId, setPropertyId] = useState('');
    const [mode, setMode] = useState<'DIRECT' | 'PRORATED'>('DIRECT');
    const [preview, setPreview] = useState<Allocation[]>([]);
    const [fellBackToEqual, setFellBackToEqual] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const total = useMemo(
        () => payables.reduce((sum, p) => sum + (p.amount || 0), 0),
        [payables],
    );

    useEffect(() => {
        supabase
            .from('commercial_properties')
            .select('id, name, type, parent_id')
            .eq('organization_id', organizationId)
            .order('name')
            .then(({ data, error: err }) => {
                if (err) { setError('Não foi possível carregar os imóveis.'); return; }
                setProperties((data || []) as PropertyOption[]);
            });
    }, [organizationId]);

    // Só imóveis "raiz" (edifício ou avulso): apropriar direto numa unidade é
    // possível, mas o caso dominante é a despesa do prédio. Unidade aparece
    // indentada logo abaixo do pai.
    const options = useMemo(() => {
        const byParent = new Map<string, PropertyOption[]>();
        const roots: PropertyOption[] = [];
        for (const p of properties) {
            if (p.parent_id) {
                const list = byParent.get(p.parent_id);
                if (list) list.push(p); else byParent.set(p.parent_id, [p]);
            } else roots.push(p);
        }
        const flat: { property: PropertyOption; depth: number; hasChildren: boolean }[] = [];
        for (const root of roots) {
            const children = byParent.get(root.id) ?? [];
            flat.push({ property: root, depth: 0, hasChildren: children.length > 0 });
            for (const child of children) flat.push({ property: child, depth: 1, hasChildren: false });
        }
        return flat;
    }, [properties]);

    const selected = options.find(o => o.property.id === propertyId);
    const canProrate = !!selected?.hasChildren;

    // Prévia sobre o TOTAL selecionado. O rateio real é por lançamento (cada um
    // fecha com o próprio valor), mas a proporção é a mesma — o que o usuário
    // precisa ver antes de confirmar é para onde o dinheiro vai.
    useEffect(() => {
        if (!propertyId) { setPreview([]); return; }
        setLoading(true);
        propertyExpenseService
            .previewAllocation(propertyId, total, canProrate ? mode : 'DIRECT')
            .then(result => { setPreview(result.allocations); setFellBackToEqual(result.fellBackToEqual); })
            .catch(() => setError('Não foi possível calcular a prévia.'))
            .finally(() => setLoading(false));
    }, [propertyId, mode, total, canProrate]);

    const nameOf = (id: string) => properties.find(p => p.id === id)?.name ?? id;

    const handleSave = async () => {
        if (!propertyId) return;
        setSaving(true);
        setError(null);
        let ok = 0;
        const failed: string[] = [];

        // Um rateio por lançamento: cada um precisa fechar com o PRÓPRIO valor,
        // senão a RPC recusa. Ratear o total e dividir depois arredondaria duas
        // vezes e quebraria o invariante.
        for (const payable of payables) {
            try {
                const effectiveMode = canProrate ? mode : 'DIRECT';
                const result = await propertyExpenseService.previewAllocation(
                    propertyId, payable.amount, effectiveMode,
                );
                await propertyExpenseService.saveAllocation(
                    payable.id, payable.amount, effectiveMode, result.allocations,
                );
                ok++;
            } catch {
                failed.push(payable.description || payable.id);
            }
        }

        setSaving(false);
        if (failed.length > 0) {
            setError(`${ok} apropriada(s), ${failed.length} falhou(aram). Nenhuma alteração parcial foi deixada nos que falharam.`);
            return;
        }
        onDone(`${ok} despesa(s) apropriada(s) a ${nameOf(propertyId)}.`);
    };

    return (
        <div className="fixed inset-0 z-[200] flex justify-end">
            <div className="absolute inset-0 bg-gray-900/20" onClick={onClose} />
            <div className="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 tracking-tight">Apropriar a imóvel</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {payables.length} lançamento{payables.length !== 1 ? 's' : ''} · {money(total)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Imóvel</label>
                        <select
                            value={propertyId}
                            onChange={e => { setPropertyId(e.target.value); setMode('DIRECT'); }}
                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        >
                            <option value="">Selecione…</option>
                            {options.map(({ property, depth, hasChildren }) => (
                                <option key={property.id} value={property.id}>
                                    {depth > 0 ? '    ' : ''}{property.name}
                                    {hasChildren ? ' (edifício)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {canProrate && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Como apropriar</label>
                            <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1">
                                <button
                                    onClick={() => setMode('DIRECT')}
                                    className={`flex-1 h-7 px-3 rounded-[6px] text-sm font-medium transition-all ${mode === 'DIRECT' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                                >
                                    Manter no edifício
                                </button>
                                <button
                                    onClick={() => setMode('PRORATED')}
                                    className={`flex-1 h-7 px-3 rounded-[6px] text-sm font-medium transition-all ${mode === 'PRORATED' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                                >
                                    Ratear entre unidades
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1.5">
                                {mode === 'DIRECT'
                                    ? 'A despesa fica no edifício. O NOI das unidades não a inclui.'
                                    : 'Rateio proporcional à área privativa de cada unidade.'}
                            </p>
                        </div>
                    )}

                    {fellBackToEqual && mode === 'PRORATED' && (
                        <div className="flex gap-2 p-3 rounded-[6px] bg-amber-50 border border-amber-100 text-amber-800 text-xs">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Nenhuma unidade tem área privativa cadastrada, então a divisão será
                                <strong> igual entre todas</strong> — o que trata uma quitinete como uma cobertura.
                                Cadastre as áreas se quiser o rateio proporcional.
                            </span>
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" /> Calculando prévia…
                        </div>
                    )}

                    {!loading && preview.length > 0 && (
                        <div>
                            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                                <Building2 className="w-4 h-4 text-gray-400" />
                                Prévia da apropriação
                            </div>
                            <div className="border border-gray-100 rounded-[6px] overflow-hidden">
                                {preview.map(allocation => (
                                    <div key={allocation.property_id} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-b-0 text-sm">
                                        <span className="text-gray-700 truncate">{nameOf(allocation.property_id)}</span>
                                        <span className="font-medium text-gray-900 shrink-0 ml-3">{money(allocation.amount)}</span>
                                    </div>
                                ))}
                                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-medium">
                                    <span className="text-gray-500">Total</span>
                                    <span className="text-gray-900">
                                        {money(preview.reduce((s, a) => s + a.amount, 0))}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex gap-2 p-3 rounded-[6px] bg-red-50 border border-red-100 text-red-700 text-xs">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 flex items-center gap-2">
                    <button
                        onClick={handleSave}
                        disabled={!propertyId || saving || loading}
                        className="flex-1 flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] text-[13px] font-medium hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95"
                    >
                        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Apropriar
                    </button>
                    <button
                        onClick={onClose}
                        className="h-9 px-3.5 bg-gray-50 text-gray-600 rounded-[6px] text-[13px] font-medium hover:bg-gray-100 transition-all"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApropriarImovelSheet;
