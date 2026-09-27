import React from 'react';
import { Package } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { formatMoney } from '../ui/Format';
import { inventoryService } from '../../services/inventoryService';
import type { PurchaseRequestItem } from '../../types/purchaseRequest';

/**
 * Solicitação de Compra › "Do almoxarifado": catálogo de itens de estoque da
 * organização DONA DA OBRA (não a do topo — a SC é da obra).
 *
 * O saldo em estoque aparece como informação, não como trava: pedir compra de
 * algo que ainda tem saldo é decisão de quem pede (o saldo pode estar noutra
 * obra/depósito). Custo sugerido = custo médio do saldo, senão a dica do cadastro.
 */

interface Linha {
    id: string;
    code: string;
    description: string;
    category: string;
    unit: string;
    saldo: number;
    custo: number;
}

const COLUMNS: StandardTableColumn[] = [
    // Soma 790px: cabe no Sheet 4xl sem rolagem lateral.
    { key: 'code', label: 'Código', sortable: true, width: 100 },
    { key: 'description', label: 'Descrição', sortable: true, width: 260 },
    { key: 'category', label: 'Categoria', sortable: true, width: 130 },
    { key: 'unit', label: 'Un', sortable: true, width: 60 },
    { key: 'saldo', label: 'Saldo em estoque', sortable: true, width: 130, align: 'right' },
    { key: 'custo', label: 'Custo médio', sortable: true, width: 110, align: 'right' },
];

interface Props {
    open: boolean;
    organizationId: string;
    onClose: () => void;
    onAdd: (items: PurchaseRequestItem[]) => void;
}

const SCAlmoxarifadoPicker: React.FC<Props> = ({ open, organizationId, onClose, onAdd }) => {
    const [linhas, setLinhas] = React.useState<Linha[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    // §3.1: busca de seletor é transitória.
    const [busca, setBusca] = React.useState('');

    React.useEffect(() => {
        if (!open || !organizationId) return;
        let cancelled = false;
        setLoading(true); setErro(null); setSelected(new Set()); setBusca('');
        (async () => {
            try {
                const [itens, saldos] = await Promise.all([
                    inventoryService.listStockItems(organizationId, { onlyActive: true }),
                    inventoryService.listBalances(organizationId),
                ]);
                // Saldo somado entre depósitos; custo médio ponderado pelo saldo.
                const porCodigo = new Map<string, { qtd: number; valor: number }>();
                saldos.forEach(s => {
                    const a = porCodigo.get(s.inputCode) ?? { qtd: 0, valor: 0 };
                    a.qtd += Number(s.quantity) || 0;
                    a.valor += (Number(s.quantity) || 0) * (Number(s.avgUnitCost) || 0);
                    porCodigo.set(s.inputCode, a);
                });
                if (cancelled) return;
                setLinhas(itens.map(i => {
                    const s = porCodigo.get(i.inputCode);
                    const medio = s && s.qtd > 0 ? s.valor / s.qtd : 0;
                    return {
                        id: i.id, code: i.inputCode, description: i.inputDescription,
                        category: i.category ?? '', unit: i.inputUnit,
                        saldo: s?.qtd ?? 0,
                        custo: medio || Number(i.unitCostHint) || 0,
                    };
                }));
            } catch (err) {
                if (!cancelled) setErro(err instanceof Error ? err.message : 'Falha ao carregar o almoxarifado.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, organizationId]);

    const adicionar = () => {
        onAdd(linhas.filter(l => selected.has(l.id)).map((l, i) => ({
            position: i,
            source: 'almoxarifado',
            stockItemId: l.id,
            inputCode: l.code,
            description: l.description,
            unit: l.unit,
            quantity: 1,
            estimatedUnitPrice: Math.round(l.custo * 10000) / 10000,
        })));
        onClose();
    };

    return (
        <Sheet open={open} onClose={onClose} size="4xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Itens do almoxarifado</SheetTitle>
                <SheetDescription>Cadastro de itens da organização da obra. Informe a quantidade depois de adicionar.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                {erro ? (
                    <p className="text-sm text-red-600">{erro}</p>
                ) : (
                    <StandardTable<Linha>
                        storageKey="suprimentos:sc:picker-almoxarifado"
                        columns={COLUMNS}
                        rows={linhas}
                        rowKey={l => l.id}
                        dense
                        loading={loading}
                        search={busca}
                        onSearchChange={setBusca}
                        searchText={l => `${l.code} ${l.description} ${l.category}`}
                        searchPlaceholder="Buscar por código, descrição ou categoria..."
                        selection={{ selected, onChange: setSelected }}
                        sortValue={(k, l) => (l as unknown as Record<string, string | number>)[k]}
                        renderCell={(k, l) => {
                            if (k === 'saldo') return <span className={`text-sm font-normal ${l.saldo > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{l.saldo.toLocaleString('pt-BR')}</span>;
                            if (k === 'custo') return <span className="text-sm font-medium text-gray-800">{l.custo ? formatMoney(l.custo) : '—'}</span>;
                            if (k === 'description') return <span className="block truncate text-sm font-normal text-gray-700" title={l.description}>{l.description}</span>;
                            return <span className="block truncate text-sm font-normal text-gray-600">{(l as unknown as Record<string, string>)[k] || '—'}</span>;
                        }}
                        empty={{
                            icon: <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                            title: 'Nenhum item cadastrado',
                            subtitle: 'O almoxarifado desta organização não tem itens ativos.',
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

export default SCAlmoxarifadoPicker;
