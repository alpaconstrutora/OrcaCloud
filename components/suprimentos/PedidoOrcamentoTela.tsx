import React from 'react';
import { ArrowLeft, Calculator, AlertCircle, Loader2, Plus } from 'lucide-react';
import StandardTable, { StandardTableColumn } from '../ui/StandardTable';
import { formatMoney } from '../ui/Format';
import { linhasDoOrcamentoParaPedido, type LinhaDoOrcamentoNoPedido } from '../../lib/orcamentoLinhas';
import type { BudgetEntry } from '../../types/budget';

/**
 * Pedido de Compra › "+ Item do orçamento" — TELA no fluxo, com "Voltar".
 *
 * Histórico (10/11/2026): a "Seleção de materiais da obra" ficava sempre
 * aberta na aba Itens; virou um painel lateral (#314). No painel de 896px a
 * descrição SINAPI saía cortada em ~200px, e o auto-ajuste de colunas a
 * levava a 500px empurrando o resto para fora ("somente mostra duas colunas").
 * O usuário escolheu tela própria — é a regra do `Sheet`: largura que não
 * basta vira tela in-flow, nunca painel mais largo nem tela cheia.
 *
 * Quem chama troca o próprio conteúdo por esta tela (a aba Itens do detalhe;
 * a lista "Itens do pedido" do Novo pedido) e a desmonta ao voltar.
 *
 * Só exibe: o formulário do pedido já carregou orçamento, preços e o quanto foi
 * comprado na obra, e é ele quem grava (`onAdd`). Composição aparece como
 * título, com os insumos logo abaixo (escolha do usuário).
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

// Largura da página: a descrição é a coluna que precisa ser lida.
const COLUMNS: StandardTableColumn[] = [
    { key: 'code', label: 'Código', sortable: true, width: 100 },
    { key: 'description', label: 'Descrição', sortable: true, width: 520 },
    { key: 'origem', label: 'Origem', sortable: true, width: 200 },
    { key: 'unit', label: 'Un', sortable: true, width: 70 },
    { key: 'quantity', label: 'Qtd orçada', sortable: true, width: 110, align: 'right' },
    { key: 'comprada', label: 'Qtd comprada', sortable: true, width: 120, align: 'right' },
    { key: 'aComprar', label: 'A comprar', sortable: true, width: 110, align: 'right' },
    { key: 'price', label: 'Preço ref.', sortable: true, width: 120, align: 'right' },
];

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

interface Props {
    /** Volta para "Itens do pedido" sem incluir nada. */
    onVoltar: () => void;
    /** Orçamento da obra (já resolvido pelo formulário). */
    budget: BudgetEntry[];
    /** Preço de referência por código (SINAPI atual da UF da obra). */
    precos: Map<string, number>;
    /** Quanto já foi pedido na obra, por código (pedidos não cancelados). */
    compradas: Map<string, number>;
    /** Códigos que já estão neste pedido. */
    noPedido: Set<string>;
    /** Grava/aplica. Devolve a mensagem de erro — a tela continua e a mostra. */
    onAdd: (itens: ItemDoOrcamentoEscolhido[]) => void | Promise<string | null | void>;
    /** Leva ao "+ Item avulso" quando o orçamento não tem o que comprar. */
    onItemAvulso?: () => void;
}

const PedidoOrcamentoTela: React.FC<Props> = ({ onVoltar, budget, precos, compradas, noPedido, onAdd, onItemAvulso }) => {
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    // §3.1: busca de seletor é transitória — voltar e abrir de novo não pode esconder linhas.
    const [busca, setBusca] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const topoRef = React.useRef<HTMLDivElement>(null);

    // Aberta a partir de um botão no meio da página: a tela começa no topo.
    React.useEffect(() => { topoRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }, []);

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
        <div ref={topoRef} className="space-y-3 scroll-mt-4">
            {/* Cabeçalho da tela: voltar, título e a ação — fica à vista sem rolar a lista. */}
            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                        type="button"
                        onClick={onVoltar}
                        className="mt-0.5 p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 shrink-0"
                        title="Voltar para Itens do pedido"
                        aria-label="Voltar para Itens do pedido"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-gray-900">Itens do orçamento da obra</h2>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Marque o que comprar. A quantidade sugerida é o que falta comprar; ajuste depois em "Itens do pedido".
                        </p>
                        {/* Pedido é só material (10/11/2026): diz onde está o resto. */}
                        <p className="text-xs text-gray-500 mt-1">
                            Só materiais. Mão de obra e equipamento por hora são contratados em Suprimentos › Contratos.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {erro ? (
                        <span className="flex items-center gap-1.5 text-xs text-red-600">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{erro}
                        </span>
                    ) : motivoDesligado && !salvando ? (
                        <span className="text-xs text-gray-500">{motivoDesligado}</span>
                    ) : null}
                    <button
                        type="button"
                        onClick={onVoltar}
                        className="h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 transition-all font-medium text-[13px] active:scale-95"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={adicionar}
                        disabled={!!motivoDesligado}
                        title={motivoDesligado ?? undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
                    >
                        {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Plus className="w-[15px] h-[15px]" />}
                        {salvando ? 'Salvando…' : selected.size ? `Adicionar ${selected.size} ${selected.size === 1 ? 'item' : 'itens'}` : 'Adicionar itens'}
                    </button>
                </div>
            </div>

            <StandardTable<LinhaDoOrcamentoNoPedido>
                // Chave nova: as larguras do painel lateral (#314) não valem aqui.
                storageKey="suprimentos:pedido:orcamento-tela"
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
                        : 'O orçamento tem itens, mas nenhum material — só serviços, mão de obra ou equipamento por hora, que são contratados em Suprimentos › Contratos. Use "+ Item avulso" para material fora do orçamento.',
                }}
            />
            {linhas.length === 0 && onItemAvulso && (
                <div className="flex justify-center">
                    <button type="button" onClick={() => { onVoltar(); onItemAvulso(); }} className="text-sm font-medium text-orange-700 hover:text-orange-800">
                        + Item avulso
                    </button>
                </div>
            )}
        </div>
    );
};

export default PedidoOrcamentoTela;
