// components/empreendimento/WriteBackPreviewSheet.tsx
//
// Preview com seleção por linha da realimentação Empreendimento → Viabilidade. Substitui o
// antigo useConfirm sim/não: o usuário vê exatamente o que será atualizado e o que será
// CRIADO no estudo, e escolhe o que enviar. Modelo de UX herdado do SinapiRebaseModal (diff
// antes de aplicar), com o checkbox por linha que faltava lá.
import React from 'react';
import { Loader2, ArrowRight, Plus, Pencil, Building } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { WriteBackItem } from '../../services/sync/writeBackImovib';

interface Props {
    open: boolean;
    onClose: () => void;
    items: WriteBackItem[];
    onApply: (selectedUnitIds: string[]) => Promise<void>;
}

const fmtVal = (v: unknown): string => {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return String(v);
};

export const WriteBackPreviewSheet: React.FC<Props> = ({ open, onClose, items, onApply }) => {
    // Começa tudo selecionado — o caso comum é "enviar tudo"; desmarcar é a exceção.
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [applying, setApplying] = React.useState(false);

    React.useEffect(() => {
        if (open) setSelected(new Set(items.map(i => i.unitId)));
    }, [open, items]);

    const byTower = React.useMemo(() => {
        const m = new Map<string, { towerName: string; items: WriteBackItem[] }>();
        for (const it of items) {
            const g = m.get(it.towerId) ?? { towerName: it.towerName, items: [] };
            g.items.push(it);
            m.set(it.towerId, g);
        }
        return [...m.entries()];
    }, [items]);

    const toggle = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const toggleTower = (towerItems: WriteBackItem[]) => setSelected(prev => {
        const next = new Set(prev);
        const allOn = towerItems.every(i => next.has(i.unitId));
        for (const i of towerItems) allOn ? next.delete(i.unitId) : next.add(i.unitId);
        return next;
    });

    const selectedCreates = items.filter(i => i.kind === 'create' && selected.has(i.unitId)).length;
    const selectedUpdates = items.filter(i => i.kind === 'update' && selected.has(i.unitId)).length;

    const handleApply = async () => {
        if (selected.size === 0) return;
        setApplying(true);
        try {
            await onApply([...selected]);
            onClose();
        } finally {
            setApplying(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Enviar ao estudo de viabilidade</SheetTitle>
                <SheetDescription>
                    Só estrutura é enviada — nome, pavimento, área, posição e orientação. Preço e status
                    de venda nunca vão ao estudo.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel>
                {items.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <p className="text-sm font-medium">Nada a enviar — o estudo já reflete as unidades do empreendimento.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {byTower.map(([towerId, group]) => {
                            const allOn = group.items.every(i => selected.has(i.unitId));
                            return (
                                <div key={towerId} className="rounded-[10px] border border-gray-100 overflow-hidden">
                                    <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50/60 border-b border-gray-100">
                                        <input type="checkbox" checked={allOn} onChange={() => toggleTower(group.items)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                        <Building className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm font-bold text-gray-800">{group.towerName}</span>
                                        <span className="text-xs text-gray-400 font-medium">{group.items.length} unidade(s)</span>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {group.items.map(it => (
                                            <label key={it.unitId} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50/50 cursor-pointer">
                                                <input type="checkbox" checked={selected.has(it.unitId)} onChange={() => toggle(it.unitId)}
                                                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-gray-800">{it.unitName}</span>
                                                        {it.kind === 'create' ? (
                                                            <span className="text-xs font-medium text-emerald-600 inline-flex items-center gap-1">
                                                                <Plus className="w-3 h-3" /> Criar no estudo
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-medium text-blue-600 inline-flex items-center gap-1">
                                                                <Pencil className="w-3 h-3" /> Atualizar
                                                            </span>
                                                        )}
                                                        {it.createsBlock && (
                                                            <span className="text-xs font-medium text-amber-600">+ cria o bloco</span>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                                                        {it.changes.map(c => (
                                                            <span key={c.field} className="text-xs text-gray-500">
                                                                <span className="text-gray-400">{c.label}:</span>{' '}
                                                                {it.kind === 'update' && (
                                                                    <><span className="text-gray-400 line-through">{fmtVal(c.from)}</span>{' '}
                                                                    <ArrowRight className="w-3 h-3 inline text-gray-300" />{' '}</>
                                                                )}
                                                                <span className="text-gray-700 font-medium">{fmtVal(c.to)}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </SheetPanel>

            <SheetFooter>
                <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-xs text-gray-500 font-medium">
                        {selected.size} selecionada(s)
                        {selectedCreates > 0 && ` · ${selectedCreates} nova(s)`}
                        {selectedUpdates > 0 && ` · ${selectedUpdates} atualização(ões)`}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={applying}
                            className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={applying || selected.size === 0}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                        >
                            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-[15px] h-[15px]" />}
                            Enviar selecionadas
                        </button>
                    </div>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default WriteBackPreviewSheet;
