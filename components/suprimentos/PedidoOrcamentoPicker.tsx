import React from 'react';
import { Calculator, AlertCircle, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { formatMoney } from '../ui/Format';
import { linhasDoOrcamentoParaPedido, type LinhaDoOrcamentoNoPedido } from '../../lib/orcamentoLinhas';
import type { BudgetEntry } from '../../types/budget';

/**
 * Pedido de Compra › "+ Item do orçamento" (pedido do usuário em 10/11/2026):
 * a antiga "Seleção de materiais da obra" ficava sempre aberta na aba Itens —
 * com orçamento de centenas de linhas, a tela virava o orçamento. Agora é um
 * painel aberto pelo botão, no molde de `SCOrcamentoPicker` (Solicitação de
 * Compra › "Do orçamento"): busca, marcação e composição desdobrada nos insumos
 * logo abaixo (escolha do usuário — sem a janela de insumos por cima).
 *
 * Só exibe: o formulário do pedido já carregou orçamento, preços e o quanto foi
 * comprado na obra, e é ele quem grava (`onAdd`).
 * Plano: docs/planos/2026-11-10-pedido-item-do-orcamento-painel.md
 */

/** Item escolhido, pronto para entrar no pedido. */
export interface ItemDoOrcamentoEscolhido {
    code: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    budgetItemId: string;
    compositionCode?: string;
}

const COLUMNS: StandardTableColumn[] = [
    // Soma 806px: cabe no Sheet 4xl (896 − p-6 − checkbox) sem rolagem lateral.
    { key: 'code', label: 'Código', sortable: true, width: 80 },
    { key: 'description', label: 'Descrição', sortable: true, width: 196 },
    { key: 'origem', label: 'Origem', sortable: true, width: 130 },
    { key: 'unit', label: 'Un', sortable: true, width: 50 },
    { key: 'quantity', label: 'Qtd orçada', sortable: true, width: 85, align: 'right' },
    { key: 'comprada', label: 'Qtd comprada', sortable: true, width: 85, align: 'right' },
    { key: 'aComprar', label: 'A comprar', sortable: true, width: 85, align: 'right' },
    { key: 'price', label: 'Preço ref.', sortable: true, width: 95, align: 'right' },
];

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

interface Props {
    open: boolean;
    onClose: () => void;
    /** Orçamento da obra (já resolvido pelo formulário). */
    budget: BudgetEntry[];
    /** Preço de referência por código (SINAPI atual da UF da obra). */
    precos: Map<string, number>;
    /** Quanto já foi pedido na obra, por código (pedidos não cancelados). */
    compradas: Map<string, number>;
    /** Códigos que já estão neste pedido. */
    noPedido: Set<string>;
    /** Grava/aplica. Devolve a mensagem de erro — o painel continua aberto e a mostra. */
    onAdd: (itens: ItemDoOrcamentoEscolhido[]) => void | Promise<string | null | void>;
    /** Leva ao "+ Item avulso" quando o orçamento não tem o que comprar. */
    onItemAvulso?: () => void;
    /** O formulário do Novo pedido é uma camada z-[110]: o painel vem acima dela. */
    zIndex?: number;
}

const PedidoOrcamentoPicker: React.FC<Props> = ({ open, onClose, budget, precos, compradas, noPedido, onAdd, onItemAvulso, zIndex }) => {
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    // §3.1: busca de seletor é transitória — reabrir não pode esconder linhas.
    const [busca, setBusca] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setSelected(new Set()); setBusca(''); setErro(null); setSalvando(false);
    }, [open]);

    const linhas = React.useMemo(
        () => linhasDoOrcamentoParaPedido(budget, precos, compradas, noPedido),
        [budget, precos, compradas, noPedido],
    );
    const orcamentoVazio = budget.length === 0;

    const adicionar = async () => {
        const escolhidas = linhas.filter(l => selected.has(l.key));
        setSalvando(true); setErro(null);
        try {
            const falha = await onAdd(escolhidas.map(l => ({
                code: l.code,
                description: l.description,
                unit: l.unit,
                // Sugestão: o que falta comprar; tudo comprado → a quantidade orçada.
                quantity: l.aComprar > 0 ? l.aComprar : (l.quantity > 0 ? l.quantity : 1),
                unitPrice: l.price,
                budgetItemId: l.budgetItemId,
                ...(l.compositionCode ? { compositionCode: l.compositionCode } : {}),
            })));
            if (falha) setErro(falha);
        } finally {
            setSalvando(false);
        }
    };

    const motivoDesligado = salvando ? 'Gravando os itens…' : selected.size === 0 ? 'Marque ao menos um item.' : null;

    return (
        <Sheet open={open} onClose={onClose} size="4xl" zIndex={zIndex}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Itens do orçamento da obra</SheetTitle>
                <SheetDescription>
                    Marque o que comprar. A quantidade sugerida é o que falta comprar; ajuste depois em "Itens do pedido".
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="p-6">
                <StandardTable<LinhaDoOrcamentoNoPedido>
                    storageKey="suprimentos:pedido:picker-orcamento"
                    columns={COLUMNS}
                    rows={linhas}
                    rowKey={l => l.key}
                    dense
                    search={busca}
                    onSearchChange={setBusca}
                    searchText={l => `${l.code} ${l.description} ${l.origem}`}
                    searchPlaceholder="Buscar por código, descrição ou composição..."
                    selection={{ selected, onChange: setSelected, canSelect: l => !l.titulo && !l.jaNoPedido }}
                    sortValue={(k, l) => (l as unknown as Record<string, string | number>)[k]}
                    renderCell={(k, l) => {
                        if (k === 'quantity' || k === 'comprada') {
                            return <span className="text-sm font-normal text-gray-600">{l.titulo && k === 'comprada' ? '—' : qtd(l[k])}</span>;
                        }
                        if (k === 'aComprar') {
                            if (l.titulo) return <span className="text-sm font-normal text-gray-400">—</span>;
                            return <span className={`text-sm font-medium ${l.aComprar > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>{qtd(l.aComprar)}</span>;
                        }
                        if (k === 'price') return <span className="text-sm font-medium text-gray-800">{formatMoney(l.price)}</span>;
                        if (k === 'origem') {
                            const texto = l.jaNoPedido ? 'Já está no pedido' : l.titulo ? 'Composição — marque os insumos abaixo' : l.origem;
                            return <span className={`block truncate text-sm font-normal ${l.jaNoPedido ? 'text-amber-700' : l.compositionCode ? 'text-gray-500' : 'text-gray-700'}`} title={texto}>{texto}</span>;
                        }
                        if (k === 'description') {
                            return <span className={`block truncate text-sm ${l.titulo ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'} ${l.compositionCode ? 'pl-4' : ''}`} title={l.description}>{l.description}</span>;
                        }
                        return <span className="text-sm font-normal text-gray-600">{(l as unknown as Record<string, string>)[k]}</span>;
                    }}
                    empty={{
                        icon: <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        // §12 — as duas causas pedem ações diferentes.
                        title: orcamentoVazio ? 'O orçamento desta obra está vazio' : 'Nenhum material comprável no orçamento desta obra',
                        subtitle: orcamentoVazio
                            ? 'Esta lista vem do orçamento da obra, e ele ainda não tem nenhum item lançado. Use "+ Item avulso" para comprar o que não está previsto.'
                            : 'O orçamento tem itens, mas nenhum insumo ou composição — só serviços, que não entram em pedido de compra. Use "+ Item avulso".',
                    }}
                />
            </SheetPanel>
            <SheetFooter>
                {erro ? (
                    <span className="mr-auto flex items-center gap-1.5 text-xs text-red-600">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />{erro}
                    </span>
                ) : linhas.length === 0 && onItemAvulso ? (
                    <button type="button" onClick={() => { onClose(); onItemAvulso(); }} className="mr-auto text-xs font-medium text-orange-700 hover:text-orange-800">
                        + Item avulso
                    </button>
                ) : motivoDesligado ? (
                    <span className="text-xs text-gray-500 mr-auto">{motivoDesligado}</span>
                ) : null}
                <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
                <button
                    onClick={adicionar}
                    disabled={!!motivoDesligado}
                    title={motivoDesligado ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                >
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {salvando ? 'Salvando…' : selected.size ? `Adicionar ${selected.size} ${selected.size === 1 ? 'item' : 'itens'}` : 'Adicionar itens'}
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default PedidoOrcamentoPicker;
