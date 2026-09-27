import React from 'react';
import { Calculator } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { formatMoney } from '../ui/Format';
import { projectService } from '../../services/projectService';
import { resolveProjectBudget } from '../../services/budgetResolver';
import { sinapiService } from '../../services/sinapiService';
import { SinapiType, type BudgetEntry } from '../../types/budget';
import type { PurchaseRequestItem } from '../../types/purchaseRequest';

/**
 * Solicitação de Compra › "Do orçamento": itens do orçamento da OBRA.
 *
 * Composição aparece ela mesma (comprar o serviço) E desdobrada nos seus
 * insumos logo abaixo (comprar o material) — qtd sugerida = coeficiente ×
 * quantidade orçada. Desdobra aqui, na própria lista, em vez de abrir o
 * `MaterialSelectionModal` da Cotação: modal por cima de drawer empilha dois
 * níveis de sobreposição (UI_PATTERNS §4).
 *
 * Preço de referência: SINAPI atual da UF da obra quando houver, senão o
 * preço gravado no orçamento — mesma regra de `SupplyChainQuotationForm`.
 */

interface Linha {
    key: string;
    code: string;
    description: string;
    unit: string;
    quantity: number;
    price: number;
    origem: string;
    budgetItemId: string;
    budgetItemCode: string;
    budgetItemDescription: string;
    compositionCode?: string;
}

const COLUMNS: StandardTableColumn[] = [
    // Soma 790px: cabe no Sheet 4xl (896 − p-6 − checkbox) sem rolagem lateral.
    { key: 'code', label: 'Código', sortable: true, width: 90 },
    { key: 'description', label: 'Descrição', sortable: true, width: 260 },
    { key: 'origem', label: 'Origem', sortable: true, width: 170 },
    { key: 'unit', label: 'Un', sortable: true, width: 60 },
    { key: 'quantity', label: 'Qtd orçada', sortable: true, width: 100, align: 'right' },
    { key: 'price', label: 'Preço ref.', sortable: true, width: 110, align: 'right' },
];

const TIPO: Record<string, string> = {
    [SinapiType.COMPOSITION]: 'Composição',
    [SinapiType.INPUT]: 'Insumo',
    [SinapiType.SERVICE]: 'Serviço',
};

function montarLinhas(budget: BudgetEntry[], preco: Map<string, number>): Linha[] {
    const linhas: Linha[] = [];
    for (const e of budget) {
        const s = e.sinapiItem;
        if (!s) continue;
        const base = { budgetItemId: e.id, budgetItemCode: s.code, budgetItemDescription: s.description };
        linhas.push({
            key: e.id, code: s.code, description: s.description, unit: s.unit,
            quantity: Number(e.quantity) || 0,
            price: preco.get(s.code) ?? (Number(s.price) || 0),
            origem: `${TIPO[s.type] ?? 'Item'} do orçamento`,
            ...base,
        });
        if (s.type === SinapiType.COMPOSITION) {
            for (const c of s.composition ?? []) {
                linhas.push({
                    key: `${e.id}:${c.code}`, code: c.code, description: c.description, unit: c.unit,
                    quantity: Math.round((Number(c.quantity) || 0) * (Number(e.quantity) || 0) * 10000) / 10000,
                    price: preco.get(c.code) ?? (Number(c.price) || 0),
                    origem: `Insumo de ${s.code}`,
                    compositionCode: s.code,
                    ...base,
                });
            }
        }
    }
    return linhas;
}

interface Props {
    open: boolean;
    projectId: string;
    onClose: () => void;
    onAdd: (items: PurchaseRequestItem[]) => void;
}

const SCOrcamentoPicker: React.FC<Props> = ({ open, projectId, onClose, onAdd }) => {
    const [linhas, setLinhas] = React.useState<Linha[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    // §3.1: busca de seletor é transitória — reabrir não pode esconder linhas.
    const [busca, setBusca] = React.useState('');

    React.useEffect(() => {
        if (!open || !projectId) return;
        let cancelled = false;
        setLoading(true); setErro(null); setSelected(new Set()); setBusca('');
        (async () => {
            try {
                const obra = await projectService.loadProject(projectId);
                // Numa OBRA o orçamento costuma viver no projeto filho — o
                // resolvedor procura (mesma chamada da Cotação).
                const { budget } = await resolveProjectBudget(obra, { searchChildren: true });
                const codes = new Set<string>();
                budget.forEach(e => {
                    if (!e.sinapiItem) return;
                    codes.add(e.sinapiItem.code);
                    e.sinapiItem.composition?.forEach(c => codes.add(c.code));
                });
                const preco = new Map<string, number>();
                if (codes.size) {
                    try {
                        const s = obra?.settings as { state?: string; socialChargesMode?: string } | undefined;
                        const itens = await sinapiService.getItemsByCodes([...codes], s?.state || 'SP', s?.socialChargesMode || 'Sem Desoneração');
                        itens.forEach(i => { if (Number(i.price) > 0) preco.set(i.code, Number(i.price)); });
                    } catch (err) {
                        // Sem SINAPI atual fica o preço do orçamento — não impede escolher.
                        console.warn('[SCOrcamentoPicker] preço SINAPI indisponível:', err);
                    }
                }
                if (!cancelled) setLinhas(montarLinhas(budget, preco));
            } catch (err) {
                if (!cancelled) setErro(err instanceof Error ? err.message : 'Falha ao carregar o orçamento da obra.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, projectId]);

    const adicionar = () => {
        const escolhidas = linhas.filter(l => selected.has(l.key));
        onAdd(escolhidas.map((l, i) => ({
            position: i,
            source: 'orcamento',
            inputCode: l.code,
            description: l.description,
            unit: l.unit,
            quantity: l.quantity > 0 ? l.quantity : 1,
            estimatedUnitPrice: l.price,
            budgetRef: {
                budgetItemId: l.budgetItemId,
                budgetItemCode: l.budgetItemCode,
                budgetItemDescription: l.budgetItemDescription,
                ...(l.compositionCode ? { compositionCode: l.compositionCode } : {}),
            },
        })));
        onClose();
    };

    return (
        <Sheet open={open} onClose={onClose} size="4xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Itens do orçamento da obra</SheetTitle>
                <SheetDescription>Marque o que comprar. A quantidade vem do orçamento e pode ser ajustada depois.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                {erro ? (
                    <p className="text-sm text-red-600">{erro}</p>
                ) : (
                    <StandardTable<Linha>
                        storageKey="suprimentos:sc:picker-orcamento"
                        columns={COLUMNS}
                        rows={linhas}
                        rowKey={l => l.key}
                        dense
                        loading={loading}
                        search={busca}
                        onSearchChange={setBusca}
                        searchText={l => `${l.code} ${l.description} ${l.origem}`}
                        searchPlaceholder="Buscar por código, descrição ou composição..."
                        selection={{ selected, onChange: setSelected }}
                        sortValue={(k, l) => (l as unknown as Record<string, string | number>)[k]}
                        renderCell={(k, l) => {
                            if (k === 'quantity') return <span className="text-sm font-normal text-gray-600">{l.quantity.toLocaleString('pt-BR')}</span>;
                            if (k === 'price') return <span className="text-sm font-medium text-gray-800">{formatMoney(l.price)}</span>;
                            if (k === 'origem') return <span className={`block truncate text-sm font-normal ${l.compositionCode ? 'text-gray-500' : 'text-gray-700'}`} title={l.origem}>{l.origem}</span>;
                            if (k === 'description') return <span className={`block truncate text-sm font-normal text-gray-700 ${l.compositionCode ? 'pl-4' : ''}`} title={l.description}>{l.description}</span>;
                            return <span className="text-sm font-normal text-gray-600">{(l as unknown as Record<string, string>)[k]}</span>;
                        }}
                        empty={{
                            icon: <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                            title: 'Orçamento vazio',
                            subtitle: 'A obra não tem orçamento vinculado com itens. Use "Item avulso" ou o almoxarifado.',
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

export default SCOrcamentoPicker;
