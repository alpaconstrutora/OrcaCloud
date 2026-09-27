import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { formatMoney, formatDateBR } from '../ui/Format';
import { procurementService } from '../../services/procurementService';
import { purchaseRequestService } from '../../services/purchaseRequestService';
import type { ProcurementPlanItem } from '../../types/procurement';
import type { PurchaseRequestItem } from '../../types/purchaseRequest';

/**
 * Solicitação de Compra › "Do Plano de Aquisições": linhas PENDENTES do plano
 * da obra que ainda não estão numa SC aberta (a mesma necessidade não entra
 * duas vezes). Quantidade = necessidade líquida (já descontado o estoque).
 */

const COLUMNS: StandardTableColumn[] = [
    // Soma 790px: cabe no Sheet 4xl sem rolagem lateral.
    { key: 'code', label: 'Código', sortable: true, width: 100 },
    { key: 'description', label: 'Descrição', sortable: true, width: 270 },
    { key: 'unit', label: 'Un', sortable: true, width: 60 },
    { key: 'qty', label: 'Qtd líquida', sortable: true, width: 110, align: 'right' },
    { key: 'needDate', label: 'Necessidade', sortable: true, width: 120 },
    { key: 'cost', label: 'Custo unit. est.', sortable: true, width: 130, align: 'right' },
];

const qtdDaLinha = (p: ProcurementPlanItem) => (Number(p.netRequiredQty) > 0 ? Number(p.netRequiredQty) : Number(p.requiredQty) || 0);

interface Props {
    open: boolean;
    organizationId: string;
    projectId: string;
    /** Linhas do plano já presentes NESTA SC (ainda não salvas) — também saem da lista. */
    jaNaSolicitacao: Set<string>;
    onClose: () => void;
    onAdd: (items: PurchaseRequestItem[]) => void;
}

const SCPlanoPicker: React.FC<Props> = ({ open, organizationId, projectId, jaNaSolicitacao, onClose, onAdd }) => {
    const [linhas, setLinhas] = React.useState<ProcurementPlanItem[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    // §3.1: busca de seletor é transitória.
    const [busca, setBusca] = React.useState('');

    React.useEffect(() => {
        if (!open || !projectId) return;
        let cancelled = false;
        setLoading(true); setErro(null); setSelected(new Set()); setBusca('');
        (async () => {
            try {
                const [pendentes, emUso] = await Promise.all([
                    procurementService.listPlanItems(organizationId || null, projectId, 'pending'),
                    purchaseRequestService.planItemIdsEmUso(projectId),
                ]);
                if (!cancelled) setLinhas(pendentes.filter(p => !emUso.has(p.id) && qtdDaLinha(p) > 0));
            } catch (err) {
                if (!cancelled) setErro(err instanceof Error ? err.message : 'Falha ao carregar o Plano de Aquisições.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, organizationId, projectId]);

    const visiveis = React.useMemo(() => linhas.filter(p => !jaNaSolicitacao.has(p.id)), [linhas, jaNaSolicitacao]);

    const adicionar = () => {
        onAdd(visiveis.filter(p => selected.has(p.id)).map((p, i) => ({
            position: i,
            source: 'plano',
            procurementPlanItemId: p.id,
            inputCode: p.inputCode ?? null,
            description: p.inputDescription,
            unit: p.inputUnit,
            quantity: qtdDaLinha(p),
            estimatedUnitPrice: Number(p.estimatedUnitCost) || 0,
            needDate: p.needDate ?? null,
        })));
        onClose();
    };

    return (
        <Sheet open={open} onClose={onClose} size="4xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Itens do Plano de Aquisições</SheetTitle>
                <SheetDescription>Necessidades pendentes da obra que ainda não estão em outra solicitação.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                {erro ? (
                    <p className="text-sm text-red-600">{erro}</p>
                ) : (
                    <StandardTable<ProcurementPlanItem>
                        storageKey="suprimentos:sc:picker-plano"
                        columns={COLUMNS}
                        rows={visiveis}
                        rowKey={p => p.id}
                        dense
                        loading={loading}
                        search={busca}
                        onSearchChange={setBusca}
                        searchText={p => `${p.inputCode ?? ''} ${p.inputDescription}`}
                        searchPlaceholder="Buscar por código ou descrição..."
                        selection={{ selected, onChange: setSelected }}
                        sortValue={(k, p) => {
                            if (k === 'code') return p.inputCode ?? '';
                            if (k === 'description') return p.inputDescription;
                            if (k === 'unit') return p.inputUnit;
                            if (k === 'qty') return qtdDaLinha(p);
                            if (k === 'needDate') return p.needDate ?? '';
                            return Number(p.estimatedUnitCost) || 0;
                        }}
                        renderCell={(k, p) => {
                            if (k === 'code') return <span className="text-sm font-normal text-gray-600">{p.inputCode || '—'}</span>;
                            if (k === 'description') return <span className="block truncate text-sm font-normal text-gray-700" title={p.inputDescription}>{p.inputDescription}</span>;
                            if (k === 'unit') return <span className="text-sm font-normal text-gray-600">{p.inputUnit}</span>;
                            if (k === 'qty') return <span className="text-sm font-normal text-gray-600">{qtdDaLinha(p).toLocaleString('pt-BR')}</span>;
                            if (k === 'needDate') return <span className="text-sm font-normal text-gray-600">{p.needDate ? formatDateBR(p.needDate) : '—'}</span>;
                            return <span className="text-sm font-medium text-gray-800">{formatMoney(Number(p.estimatedUnitCost) || 0)}</span>;
                        }}
                        empty={{
                            icon: <CalendarClock className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                            title: 'Nada pendente no plano',
                            subtitle: 'A obra não tem necessidades pendentes no Plano de Aquisições, ou todas já estão em solicitações.',
                        }}
                    />
                )}
            </SheetPanel>
            <SheetFooter>
                {selected.size === 0 && <span className="text-xs text-gray-500 mr-auto">Marque ao menos um item.</span>}
                <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
                <button
                    onClick={adicionar}
                    disabled={selected.size === 0}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    {selected.size ? `Adicionar ${selected.size} ${selected.size === 1 ? 'item' : 'itens'}` : 'Adicionar itens'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default SCPlanoPicker;
