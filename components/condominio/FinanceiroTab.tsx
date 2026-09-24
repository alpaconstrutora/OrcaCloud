// components/condominio/FinanceiroTab.tsx
// Rateio condominial — primeira fatia do financeiro (🚪 portão).
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// A ÂNCORA É O CENTRO DE CUSTO: a despesa do condomínio é a que cai no centro
// de custo dele. Isso separa o caixa com ou sem organização própria, e é a
// decisão do usuário (14/08/2026) que dispensou escolher entre org própria e
// marcador no lançamento.
//
// PRÉVIA ANTES DE FECHAR: rateio fechado vira base de cobrança, e boleto
// emitido não se desfaz. Por isso o fluxo é calcular → conferir → salvar
// rascunho → fechar, e o banco recusa alterar item de rateio já fechado.
import React from 'react';
import {
    Calculator, Wallet, Search, RefreshCw, Plus, Lock, AlertTriangle, Building2, AlertCircle, FileText, Loader2, Send, CheckCircle2, MoveHorizontal } from 'lucide-react';
import { regenerateCondoRateioNumber } from '../../services/condoRateioNumberRegenService';
import {
    ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState,
    useResizableColumns,
} from '../ui/TableUtils';
import { KpiCard } from '../ui/KpiCard';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import ActionIconButton from '../ui/ActionIconButton';
import CostCenterSelect from '../CostCenterSelect';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
// Mesmo rótulo de origem que Contas a Pagar usa. Importar do componente é a
// convenção já estabelecida aqui — `ContasPagarManager` e
// `financeiro/FechamentoCentroCusto` fazem igual. Extrair para um util
// tocaria esses dois sem ninguém ter pedido.
import { origemLabel } from '../ContasPagarParcelas';
import {
    condominioRateioService, CRITERIO_LABEL, CRITERIO_EXIGE,
    type CriterioRateio, type TipoRateio, type PreviaRateio, type Rateio, type DespesaRateio,
    type CotaDoRateio, type CentroDeCustoDisponivel, type LancamentoDoCondominio,
} from '../../services/condominioRateioService';
import {
    condominioCobrancaService,
    type PreviaCobranca, type PagadorDaCota, type ResultadoEmissao,
} from '../../services/condominioCobrancaService';
import { empreendimentoService } from '../../services/empreendimentoService';
import type { Empreendimento } from '../../types/empreendimento';

const STATUS_COR: Record<string, string> = {
    RASCUNHO: 'text-amber-600', FECHADO: 'text-emerald-600', CANCELADO: 'text-gray-500',
};
const STATUS_LABEL: Record<string, string> = {
    RASCUNHO: 'Rascunho', FECHADO: 'Fechado', CANCELADO: 'Cancelado',
};

// `number` é a primeira coluna porque é a identidade do documento — e até
// 26/08/2026 ela não aparecia em lugar nenhum: o número era gerado no
// fechamento (CONDO_RATEIO, Configurações do Sistema › Nomenclatura) e ficava
// invisível, então o síndico fechava o rateio e não tinha como citá-lo.
// `diferenca` é coluna própria, não nota de rodapé dentro de "Rateado": ela é o
// sinal de que a soma das cotas não fechou com a despesa, e enterrada na outra
// célula só era vista por quem já estava olhando aquela linha.
const COLUMNS: ColumnConfig[] = [
    { key: 'number', label: 'Número', sortable: true },
    { key: 'competencia', label: 'Competência', sortable: true },
    { key: 'tipo', label: 'Tipo', sortable: true },
    { key: 'criterio', label: 'Critério', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'despesas', label: 'Despesas', sortable: true },
    { key: 'rateado', label: 'Rateado', sortable: true },
    { key: 'diferenca', label: 'Diferença', sortable: true },
    // Cobrança é EIXO PRÓPRIO, não um quarto status: um rateio cancelado pode ter
    // sido cobrado antes, e enfiar isso em `status` tornaria esse caso
    // irrepresentável. Ver migration 20270914000012.
    { key: 'cobranca', label: 'Cobrança', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const dinheiro = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function competenciaAtual(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function rotuloCompetencia(iso: string): string {
    const [a, m] = iso.slice(0, 10).split('-');
    return `${m}/${a}`;
}
// String → string, sem passar por Date: `new Date('YYYY-MM-DD')` interpreta
// UTC e pode voltar um dia no fuso local (mesma armadilha do Gantt).
function dataBR(iso?: string): string {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
}

/** Tabela de despesas — conferência (rascunho) e prestação de contas (fechado).
 *  Vive DENTRO de um `Sheet`, então usa a régua do §6.9 (`px-3`, e `px-4` na
 *  coluna de texto livre) em vez do `px-6` de tabela de página inteira: num
 *  painel de ~672px, seis lados de 24px comem mais largura do que sobra. */
const TabelaDespesas: React.FC<{
    despesas: DespesaRateio[];
    comData: boolean;
    /** Presente só em rateio RASCUNHO: fechado é prestação de contas, e
     *  reescrever a linha depois mudaria o documento que o condômino recebeu. */
    onEditarDescricao?: (despesa: DespesaRateio, nova: string) => Promise<void>;
}> = ({ despesas, comData, onEditarDescricao }) => {
    const [editando, setEditando] = React.useState<string | null>(null);
    const [texto, setTexto] = React.useState('');
    const [salvando, setSalvando] = React.useState(false);

    const abrir = (d: DespesaRateio) => {
        if (!onEditarDescricao || !d.id) return;
        setEditando(d.id);
        // Abre com o rótulo ATUAL, não vazio: corrigir costuma ser ajustar uma
        // palavra, e obrigar a redigitar tudo faria ninguém corrigir.
        setTexto(d.descricao);
    };

    const salvar = async (d: DespesaRateio) => {
        if (!onEditarDescricao) return;
        setSalvando(true);
        try {
            await onEditarDescricao(d, texto);
            setEditando(null);
        } finally {
            setSalvando(false);
        }
    };

    return (
    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                    {comData && <th className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">Data</th>}
                    <th className="px-4 py-2 border-r border-gray-100">Descrição</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Valor</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {despesas.map(d => (
                    <tr key={d.id || d.transaction_id}>
                        {comData && (
                            <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">
                                {dataBR(d.data)}
                            </td>
                        )}
                        <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                            {editando === d.id ? (
                                <div className="flex items-center gap-1.5">
                                    <input
                                        autoFocus
                                        value={texto}
                                        onChange={e => setTexto(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') salvar(d);
                                            if (e.key === 'Escape') setEditando(null);
                                        }}
                                        className="flex-1 h-8 px-2 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    />
                                    <button
                                        onClick={() => salvar(d)}
                                        disabled={salvando || !texto.trim()}
                                        className="h-8 px-2.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 text-[13px] font-medium disabled:opacity-50"
                                    >
                                        Salvar
                                    </button>
                                </div>
                            ) : onEditarDescricao && d.id ? (
                                /* Clique na célula edita — a ação é óbvia e única
                                   nesta linha (§9.1), então não ganha botão próprio. */
                                <button
                                    type="button"
                                    onClick={() => abrir(d)}
                                    className="w-full text-left hover:text-blue-600 transition-colors"
                                    title="Clique para corrigir a descrição desta despesa"
                                >
                                    {d.descricao}
                                </button>
                            ) : d.descricao}
                        </td>
                        <td className="px-3 py-2.5 last:border-r-0 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                            {dinheiro(d.valor)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
    );
};

/** Cotas de um rateio salvo — quem paga quanto. Prestação de contas.
 *  Mesma régua da §6.9 que `TabelaDespesas` usa: dentro de `Sheet` a largura é
 *  o recurso escasso, então `px-3` de régua e `px-4` na coluna de texto livre. */
const TabelaCotas: React.FC<{ cotas: CotaDoRateio[] }> = ({ cotas }) => (
    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                    <th className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">Unidade</th>
                    <th className="px-4 py-2 border-r border-gray-100">Quem paga</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap">Cota</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {cotas.map(c => (
                    <tr key={c.id}>
                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 whitespace-nowrap">
                            {c.unitLabel}
                        </td>
                        <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                            {c.clientNome ? (
                                <span className="block truncate" title={c.clientNome}>{c.clientNome}</span>
                            ) : (
                                /* §8: texto colorido, sem pílula. A cota existe e foi
                                   calculada — o que falta é de QUEM cobrar. */
                                <span className="text-amber-600">Sem pagador definido</span>
                            )}
                        </td>
                        <td className="px-3 py-2.5 last:border-r-0 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                            {dinheiro(c.valor)}
                            {c.temRecebivel && (
                                <span className="block text-xs font-normal text-emerald-600">cobrada</span>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// Larguras da aba Despesas. Soma = 1.200px; a folga vai para o `<col />`
// espaçador (§6.1.1), não se espalha pelas colunas de dado.
const LARGURAS_DESPESAS: Record<string, number> = {
    codigo: 100, data: 110, descricao: 300, fornecedor: 220, origem: 120, centro: 190, situacao: 150, valor: 130,
};

/** Lançamentos do caixa do condomínio — a aba Despesas.
 *  Tabela de PÁGINA (não vive em `Sheet`), então `px-6` e `py-2.5` do §6.6/§7.2. */
const TabelaLancamentos: React.FC<{
    lancamentos: LancamentoDoCondominio[];
    carregando: boolean;
    erro: string | null;
    mes: string;
    temBusca: boolean;
    /** Vem do pai porque o botão de auto-ajuste (§6.1.2) mora na toolbar, e a
     *  toolbar não é filha desta tabela. */
    cols: ReturnType<typeof useResizableColumns>;
}> = ({ lancamentos, carregando, erro, mes, temBusca, cols }) => {
    if (carregando) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Carregando...</p>
            </div>
        );
    }
    if (erro) {
        return <div className="m-4 bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>;
    }
    if (lancamentos.length === 0) {
        return (
            <div className="text-center py-12">
                <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {temBusca ? 'Nenhum resultado' : `Nenhuma despesa em ${mes}`}
                </h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                    {temBusca
                        ? 'Tente ajustar a busca.'
                        : 'Lance a despesa no Financeiro apontando para um centro de custo deste condomínio — é daqui que o rateio a tira.'}
                </p>
            </div>
        );
    }

    const total = lancamentos.reduce((s, l) => s + l.valor, 0);
    // §6.1 — largura = SOMA das colunas, nunca `w-full`: com `table-layout:
    // fixed` em 100%, o navegador redistribui a sobra e arrastar uma borda
    // redimensiona a vizinha errada. `minWidth: '100%'` é o que dá folga ao
    // espaçador (§6.1.1); sem ele o espaçador é código morto.
    const larguraTotal = Object.keys(LARGURAS_DESPESAS).reduce((acc, k) => acc + cols.getWidth(k), 0);

    return (
        <div className="overflow-auto max-h-[70vh]">
            <table
                ref={cols.tableRef}
                className="text-left border-collapse"
                style={{ tableLayout: 'fixed', width: larguraTotal, minWidth: '100%' }}
            >
                <colgroup>
                    <col data-col-key="codigo" style={{ width: `${cols.getWidth('codigo')}px` }} />
                    <col data-col-key="data" style={{ width: `${cols.getWidth('data')}px` }} />
                    <col data-col-key="descricao" style={{ width: `${cols.getWidth('descricao')}px` }} />
                    <col data-col-key="fornecedor" style={{ width: `${cols.getWidth('fornecedor')}px` }} />
                    <col data-col-key="origem" style={{ width: `${cols.getWidth('origem')}px` }} />
                    <col data-col-key="centro" style={{ width: `${cols.getWidth('centro')}px` }} />
                    <col data-col-key="situacao" style={{ width: `${cols.getWidth('situacao')}px` }} />
                    {/* §6.1.1 — o espaçador vem ANTES da última coluna. Depois
                        dela, a sobra empurra "Valor" a cada arraste e a borda
                        dança em relação à toolbar acima. */}
                    <col />
                    <col data-col-key="valor" style={{ width: `${cols.getWidth('valor')}px` }} />
                </colgroup>
                <thead>
                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                        <th className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden relative">Código<cols.ResizeHandle colKey="codigo" /></th>
                        <th className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden relative">Data<cols.ResizeHandle colKey="data" /></th>
                        <th className="px-6 py-2 border-r border-gray-100 overflow-hidden relative">Descrição<cols.ResizeHandle colKey="descricao" /></th>
                        <th className="px-6 py-2 border-r border-gray-100 overflow-hidden relative">Fornecedor<cols.ResizeHandle colKey="fornecedor" /></th>
                        <th className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden relative">Origem<cols.ResizeHandle colKey="origem" /></th>
                        <th className="px-6 py-2 border-r border-gray-100 overflow-hidden relative">Centro de custo<cols.ResizeHandle colKey="centro" /></th>
                        <th className="px-6 py-2 border-r border-gray-100 whitespace-nowrap overflow-hidden relative">Situação<cols.ResizeHandle colKey="situacao" /></th>
                        <th aria-hidden="true" className="border-r border-gray-100"></th>
                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500 whitespace-nowrap">Valor</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {lancamentos.map(l => (
                        <tr key={l.id} className="hover:bg-blue-50/50 transition-colors">
                            {/* Código do documento (hoje, nº do boleto). Origem sem
                                código próprio mostra "—" — ver o comentário do
                                campo em `condominioRateioService`. */}
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 whitespace-nowrap">
                                {l.codigo ?? <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">
                                {dataBR(l.data)}
                            </td>
                            {/* §6.1.2 — `truncate` só recorta em elemento de bloco,
                                e o texto inteiro volta pelo `title`. */}
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                                <span className="block truncate" title={l.descricao}>{l.descricao}</span>
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                                {l.fornecedor
                                    ? <span className="block truncate" title={l.fornecedor}>{l.fornecedor}</span>
                                    : <span className="text-gray-400">—</span>}
                            </td>
                            {/* Origem: o MESMO rótulo de Contas a Pagar
                                (`origemLabel`), para as duas telas não darem
                                nomes diferentes à mesma origem. Ele degrada
                                sozinho — origem fora do mapa vira "Asset
                                Maintenance" em vez de ASSET_MAINTENANCE. */}
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">
                                <span className="block truncate" title={origemLabel(l.origem)}>{origemLabel(l.origem)}</span>
                            </td>
                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">
                                <span className="block truncate" title={l.costCenterLabel}>{l.costCenterLabel}</span>
                            </td>
                            {/* §8 — texto colorido, sem pílula. Quando o rateio é de
                                OUTRO mês, dizer QUAL é o que explica a diferença
                                entre esta aba e a de Rateios. */}
                            <td className={`px-6 py-2.5 border-r border-gray-100 text-sm font-normal ${l.rateada ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {!l.rateada ? 'Fora de rateio' : (
                                    <span
                                        className="block truncate"
                                        title={l.rateioCompetencia
                                            ? `Entrou no rateio de ${rotuloCompetencia(`${l.rateioCompetencia}-01`)}`
                                            : undefined}
                                    >
                                        {l.rateioCompetencia && l.rateioCompetencia !== l.data.slice(0, 7)
                                            ? `Rateada em ${rotuloCompetencia(`${l.rateioCompetencia}-01`)}`
                                            : 'Já rateada'}
                                    </span>
                                )}
                            </td>
                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                            <td className="px-6 py-2.5 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                                {dinheiro(l.valor)}
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                        <td className="px-6 py-2.5 text-sm font-normal text-gray-500" colSpan={8}>
                            {lancamentos.length} lançamento(s) em {mes}
                        </td>
                        <td className="px-6 py-2.5 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                            {dinheiro(total)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

interface Props { empreendimento: Empreendimento }

const FinanceiroTab: React.FC<Props> = ({ empreendimento }) => {
    const confirm = useConfirm();
    const orgId = empreendimento.organization_id;

    // A chave leva o id do condomínio: com uma chave única para todos, abrir o
    // condomínio B logo depois de buscar no A trazia a lista já filtrada por um
    // termo que não é dele — e "sumiu rateio" vira chamado de suporte. Trocar
    // de condomínio desmonta a aba, então o `useState` inicial do
    // `usePersistedState` roda de novo e lê a chave certa.
    // ── Sub-abas (§19.1) ──────────────────────────────────────────────────
    // "Rateios" é o documento; "Despesas" é a matéria-prima dele. A segunda
    // nasceu porque o único lugar que mostrava lançamento era o painel de um
    // rateio JÁ criado — despesa que ainda não entrou em rateio nenhum não
    // aparecia em lugar algum, e é justamente a que o síndico precisa achar.
    const [subAba, setSubAba] = usePersistedState<'rateios' | 'despesas'>(
        `condominio:${empreendimento.id}:financeiro:subaba`, 'rateios');

    // ── Filtro de competência ─────────────────────────────────────────────
    // `''` = todas. Vale para as DUAS sub-abas: nos rateios recorta a coluna
    // Competência; nas despesas é o mês dos lançamentos. Um filtro só, porque
    // é a mesma pergunta ("de qual mês estamos falando?") — dois controles
    // separados dariam ao usuário duas respostas diferentes na mesma tela.
    const [competenciaFiltro, setCompetenciaFiltro] = usePersistedState<string>(
        `condominio:${empreendimento.id}:financeiro:competencia`, '');

    const [searchTerm, setSearchTerm] = usePersistedState<string>(
        `condominio:${empreendimento.id}:financeiro:search`, '');
    const tableColumns = useTableColumns(COLUMNS, 'condominioFinanceiroColumns');
    const v = tableColumns.visibleColumns;
    // Todos os centros de custo do condomínio (N desde 2026-09-19): a despesa
    // do rateio é a soma deles. `centro` = o primeiro por código, usado como
    // rótulo (`condominio_rateios.cost_center_id`) e nos textos.
    const [centros, setCentros] = React.useState<{ id: string; code: string; name: string }[]>([]);
    const centro = centros[0] ?? null;
    const [rateios, setRateios] = React.useState<Rateio[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const [sheetDetalhe, setSheetDetalhe] = React.useState<Rateio | null>(null);
    const [carregandoDetalhe, setCarregandoDetalhe] = React.useState(false);
    const [despesasDetalhe, setDespesasDetalhe] = React.useState<DespesaRateio[]>([]);
    const [cotasDetalhe, setCotasDetalhe] = React.useState<CotaDoRateio[]>([]);

    /**
     * Corrige a descrição de uma despesa do rateio em rascunho. §22: costura no
     * array local — recarregar o Sheet inteiro por causa de um texto perderia a
     * rolagem e piscaria a lista.
     */
    const editarDescricaoDespesa = async (d: DespesaRateio, nova: string) => {
        if (!d.id) return;
        try {
            await condominioRateioService.atualizarDescricaoDespesa(d.id, nova);
            setDespesasDetalhe(prev => prev.map(x => (x.id === d.id ? { ...x, descricao: nova.trim() } : x)));
            notify('Descrição corrigida. O condômino passa a ver este texto no portal.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao salvar a descrição.', 'error');
        }
    };

    const abrirDetalhe = async (r: Rateio) => {
        setSheetDetalhe(r);
        setCarregandoDetalhe(true);
        try {
            // As duas metades do documento, em paralelo: o que se gastou
            // (despesas) e quem paga o quê (cotas). Uma sem a outra não é
            // prestação de contas.
            const [ds, cs] = await Promise.all([
                condominioRateioService.listarDespesas(r.id),
                condominioRateioService.listarCotas(r.id),
            ]);
            setDespesasDetalhe(ds);
            setCotasDetalhe(cs);
        } catch (e: any) {
            notify(e?.message || 'Erro ao carregar o detalhe do rateio.', 'error');
        } finally {
            setCarregandoDetalhe(false);
        }
    };

    // ── Emissão no Asaas (fatia 2, segundo passo) ─────────────────────────
    // Gerar recebível e EMITIR são gestos separados de propósito: o primeiro é
    // interno e reversível, o segundo manda boleto para condômino e não se
    // desfaz. Juntá-los faria o síndico emitir sem nunca ter conferido.
    const [emissoes, setEmissoes] = React.useState<Record<string, { emitidas: number; total: number }>>({});
    const [emitindo, setEmitindo] = React.useState<string | null>(null);
    const [resultado, setResultado] = React.useState<{ rateio: Rateio; r: ResultadoEmissao } | null>(null);

    const emitirBoletos = async (r: Rateio) => {
        const e = emissoes[r.id];
        // Quantas vão SAIR. A contagem de `emissoes` só é carregada por
        // `carregar()`, para rateios que já tinham cobrança gerada — então logo
        // depois de gerar na MESMA sessão ela é `undefined`, e a conta antiga
        // (`e?.total ?? 0`) anunciava "0 cobrança(s) vão para o Asaas" na
        // véspera de mandar N boletos a condômino. Sem contagem, a frase passa
        // a dizer o que se sabe — "as cobranças" — em vez de um número falso.
        const faltam = e ? e.total - e.emitidas : null;
        const quantas = faltam === null
            ? 'As cobranças ainda não emitidas'
            : `${faltam} cobrança(s)`;
        const ok = await confirm({
            title: 'Emitir os boletos?',
            message: `${quantas} da competência ${rotuloCompetencia(r.competencia)} vão para o Asaas, com multa e juros da Ficha. Boleto emitido chega ao condômino e NÃO se desfaz — para cancelar depois é preciso fazer isso no próprio Asaas.`,
            variant: 'danger',
            confirmLabel: 'Emitir boletos',
        });
        if (!ok) return;
        setEmitindo(r.id);
        try {
            const res = await condominioCobrancaService.emitir(r.id);
            // Mostra o resultado SEMPRE, mesmo com tudo certo: quem manda
            // dinheiro para fora precisa ver o que saiu, não um toast que some.
            setResultado({ rateio: r, r: res });
            // §22 — costura local em vez de recarregar a aba.
            //
            // ⚠️ O total NÃO pode sair de `res.emitidas`: numa emissão parcial
            // isso daria "6 de 6" em verde quando 6 falharam — o número
            // plausível escondendo o problema. `emitidas + falhas` é o que foi
            // de fato TENTADO, e portanto o total de cotas com recebível.
            // (Bug pego no próprio teste de lote misto, em 31/08/2026.)
            const tentadas = res.emitidas + res.falhas.length;
            setEmissoes(prev => ({
                ...prev,
                [r.id]: {
                    total: prev[r.id]?.total || tentadas,
                    emitidas: (prev[r.id]?.emitidas ?? 0) + res.emitidas,
                },
            }));
        } catch (err: any) {
            notify(err?.message || 'Erro ao emitir os boletos.', 'error');
        } finally {
            setEmitindo(null);
        }
    };

    // ── Cobrança (fatia 2) ────────────────────────────────────────────────
    const [sheetCobranca, setSheetCobranca] = React.useState<Rateio | null>(null);
    const [previaCob, setPreviaCob] = React.useState<PreviaCobranca | null>(null);
    const [carregandoCob, setCarregandoCob] = React.useState(false);
    const [gerandoCob, setGerandoCob] = React.useState(false);
    /** Default segue o TIPO: extraordinário é obra, e obra é do proprietário.
     *  Mas continua trocável — a decisão do usuário foi "opção para escolher". */
    const [pagador, setPagador] = React.useState<PagadorDaCota>('RESPONSAVEL');
    const [vencimento, setVencimento] = React.useState('');

    const abrirCobranca = async (r: Rateio) => {
        const inicial: PagadorDaCota = r.tipo === 'EXTRAORDINARIO' ? 'PROPRIETARIO' : 'RESPONSAVEL';
        setPagador(inicial);
        setVencimento('');
        setSheetCobranca(r);
        setPreviaCob(null);
        setCarregandoCob(true);
        try {
            setPreviaCob(await condominioCobrancaService.previa(r.id, { pagador: inicial }));
        } catch (e: any) {
            notify(e?.message || 'Erro ao montar a prévia da cobrança.', 'error');
        } finally {
            setCarregandoCob(false);
        }
    };

    /** Trocar o papel REFAZ a prévia: quem paga muda, e com ele os bloqueios. */
    const trocarPagador = async (novo: PagadorDaCota) => {
        setPagador(novo);
        if (!sheetCobranca) return;
        setCarregandoCob(true);
        try {
            setPreviaCob(await condominioCobrancaService.previa(sheetCobranca.id, { pagador: novo }));
        } catch (e: any) {
            notify(e?.message || 'Erro ao recalcular a prévia.', 'error');
        } finally {
            setCarregandoCob(false);
        }
    };

    const gerarCobranca = async () => {
        if (!sheetCobranca || !previaCob || !vencimento) return;
        const ok = await confirm({
            title: 'Gerar as cobranças?',
            message: `${previaCob.qtdCobravel} cota(s), ${dinheiro(previaCob.totalCobravel)}, com vencimento em ${dataBR(vencimento)}. Isso cria os recebíveis em Contas a Receber — ainda NÃO emite boleto no Asaas.`,
            variant: 'warning',
            confirmLabel: 'Gerar recebíveis',
        });
        if (!ok) return;
        setGerandoCob(true);
        try {
            const r = await condominioCobrancaService.gerarRecebiveis(sheetCobranca.id, { vencimento, pagador });
            // §22 — costura local, sem recarregar a aba.
            const carimbo = new Date().toISOString();
            // Só carimba se alguma cota virou recebível — o service usa o mesmo
            // critério do lado do banco. Com zero criados, o rateio segue
            // "fechado, não cobrado" e a ação continua na tela.
            if (r.criados > 0) {
                setRateios(prev => prev.map(x => (x.id === sheetCobranca.id ? { ...x, cobranca_gerada_em: carimbo } : x)));
                setSheetCobranca(null);
            }
            const partes = [`${r.criados} recebível(is) gerado(s).`];
            if (r.pulados > 0) partes.push(`${r.pulados} cota(s) ficaram de fora.`);
            // Falha de cota NÃO pode virar silêncio: até 23/09 o lote abortava
            // no primeiro erro e o usuário via só a exceção da primeira cota,
            // sem saber quantas tinham passado.
            if (r.falhas.length > 0) {
                partes.push(`${r.falhas.length} falharam: ${r.falhas.map(f => f.unitLabel).join(', ')}.`);
            }
            notify(partes.join(' '), r.falhas.length > 0 ? 'error' : 'success');
        } catch (e: any) {
            notify(e?.message || 'Erro ao gerar as cobranças.', 'error');
        } finally {
            setGerandoCob(false);
        }
    };

    // ── Critério GRUPO — as unidades que participam ───────────────────────
    // Até 23/09/2026 o critério existia no `<select>`, no CHECK do banco e no
    // service (`unidadesDoGrupo`), e NENHUMA tela passava a lista. Resultado:
    // escolher "Grupo de unidades" dava peso 0 em todas, total rateado
    // R$ 0,00 — e esse rateio vazio ainda podia ser salvo e FECHADO, queimando
    // um número da sequência CONDO_RATEIO. Opção que não dá para exercer é
    // armadilha; aqui ela ganha o seletor que faltava.
    const [unidades, setUnidades] = React.useState<{ id: string; label: string }[]>([]);
    const [carregandoUnidades, setCarregandoUnidades] = React.useState(false);
    const [doGrupo, setDoGrupo] = React.useState<Set<string>>(new Set());

    const [sheetNovo, setSheetNovo] = React.useState(false);
    const [calculando, setCalculando] = React.useState(false);
    const [salvando, setSalvando] = React.useState(false);
    const [previa, setPrevia] = React.useState<PreviaRateio | null>(null);
    const [form, setForm] = React.useState<{
        competencia: string; tipo: TipoRateio; criterio: CriterioRateio; valorFixo: string;
    }>({ competencia: competenciaAtual(), tipo: 'ORDINARIO', criterio: 'IGUAL', valorFixo: '' });

    const carregar = React.useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            setCentros(await condominioRateioService.getCentrosDeCusto(empreendimento.id));
            const lista = await condominioRateioService.listar(empreendimento.id);
            setRateios(lista);
            // Contagem em LOTE (2 consultas), não uma por linha: a coluna
            // Cobrança mostra "N de M emitidas" e N cresce todo mês.
            // Falhar aqui não pode derrubar a aba — é uma coluna, não o assunto.
            try {
                setEmissoes(await condominioCobrancaService.contarEmitidas(
                    lista.filter(r => r.cobranca_gerada_em).map(r => r.id)));
            } catch { setEmissoes({}); }
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar o financeiro.');
        } finally {
            setLoading(false);
        }
    }, [empreendimento.id]);

    React.useEffect(() => { carregar(); }, [carregar]);

    // As unidades só importam para o critério GRUPO — e só com a sheet aberta.
    // Carregar sempre custaria uma varredura de torres+unidades por abertura da
    // aba, para um critério que é o menos usado dos cinco.
    React.useEffect(() => {
        if (!sheetNovo || form.criterio !== 'GRUPO' || unidades.length > 0) return;
        let ativo = true;
        setCarregandoUnidades(true);
        empreendimentoService.listAllUnitsForEmpreendimento(empreendimento.id)
            .then(us => {
                if (!ativo) return;
                setUnidades(us.map(u => ({ id: u.id, label: `${u._tower_name} · ${u.name}` })));
            })
            .catch(() => { if (ativo) setUnidades([]); })
            .finally(() => { if (ativo) setCarregandoUnidades(false); });
        return () => { ativo = false; };
    }, [sheetNovo, form.criterio, unidades.length, empreendimento.id]);

    const [disponiveis, setDisponiveis] = React.useState<CentroDeCustoDisponivel[]>([]);
    const [escolhido, setEscolhido] = React.useState('');

    // Só carrega quando falta centro de custo — é o único momento em que a
    // lista importa.
    React.useEffect(() => {
        if (loading || centro) return;
        condominioRateioService.listarDisponiveis(orgId)
            .then(setDisponiveis)
            .catch(() => setDisponiveis([]));
    }, [loading, centro, orgId]);

    const criarCentro = async () => {
        try {
            // O nome não repete "Condomínio": ele já vai DENTRO do grupo
            // Condomínios, e "Condomínios › Condomínio 007 - Bella Vista" lê mal.
            const c = await condominioRateioService.criarCentroDeCusto(
                empreendimento.id, orgId, empreendimento.name);
            setCentros([c]);
            notify(`Centro de custo ${c.code} criado no grupo Condomínios. Toda despesa do condomínio deve cair nele.`);
        } catch (e: any) {
            notify(e?.message || 'Erro ao criar o centro de custo.', 'error');
        }
    };

    const vincularCentro = async () => {
        if (!escolhido) return;
        try {
            const c = await condominioRateioService.vincular(escolhido, empreendimento.id);
            setCentros([c]);
            notify(`Centro de custo ${c.code} vinculado a este condomínio.`);
        } catch (e: any) {
            notify(e?.message || 'Erro ao vincular.', 'error');
        }
    };

    const desvincularCentro = async (alvo: { id: string; code: string; name: string }) => {
        const ultimo = centros.length === 1;
        const ok = await confirm({
            title: 'Desvincular o centro de custo?',
            message: `${alvo.code} — ${alvo.name} deixa de fazer parte do caixa deste condomínio. Nada é apagado: os lançamentos e os rateios já feitos continuam onde estão${ultimo ? ', mas novos rateios ficam sem de onde tirar despesa' : '; as despesas dele deixam de entrar nos próximos rateios'}.`,
            variant: 'warning',
            confirmLabel: 'Desvincular',
        });
        if (!ok) return;
        try {
            await condominioRateioService.desvincular(alvo.id);
            setCentros(prev => prev.filter(c => c.id !== alvo.id));
            notify('Centro de custo desvinculado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao desvincular.', 'error');
        }
    };

    const calcular = async () => {
        if (!centro) return;
        setCalculando(true);
        try {
            setPrevia(await condominioRateioService.previa({
                empreendimentoId: empreendimento.id,
                costCenterIds: centros.map(c => c.id),
                competencia: form.competencia,
                criterio: form.criterio,
                valorFixo: Number(form.valorFixo.replace(',', '.')) || 0,
                unidadesDoGrupo: form.criterio === 'GRUPO' ? [...doGrupo] : undefined,
            }));
        } catch (e: any) {
            notify(e?.message || 'Erro ao calcular.', 'error');
        } finally {
            setCalculando(false);
        }
    };

    const salvar = async () => {
        if (!centro || !previa) return;
        setSalvando(true);
        try {
            const r = await condominioRateioService.salvar({
                empreendimentoId: empreendimento.id,
                organizationId: orgId,
                costCenterId: centro.id,
                competencia: form.competencia,
                tipo: form.tipo,
                criterio: form.criterio,
                previa,
            });
            // §22 — costura no array local em vez de recarregar a aba.
            setRateios(prev => [r, ...prev]);
            setSheetNovo(false);
            setPrevia(null);
            notify('Rateio salvo como rascunho. Confira antes de fechar.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao salvar.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    const fechar = async (r: Rateio) => {
        const ok = await confirm({
            title: 'Fechar o rateio?',
            message: `${dinheiro(r.total_rateado)} da competência ${rotuloCompetencia(r.competencia)} passam a ser base de cobrança. Depois de fechado, os valores não podem ser alterados — só cancelando e refazendo.`,
            variant: 'warning',
            confirmLabel: 'Fechar rateio',
        });
        if (!ok) return;
        try {
            const atualizado = await condominioRateioService.fechar(r.id);
            setRateios(prev => prev.map(x => (x.id === r.id ? atualizado : x)));
            notify('Rateio fechado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao fechar.', 'error');
        }
    };

    const cancelar = async (r: Rateio) => {
        const ok = await confirm({
            title: 'Cancelar o rateio?',
            message: r.status === 'FECHADO'
                ? `Este rateio já foi fechado e pode ter sido comunicado aos condôminos. Cancelar libera a competência ${rotuloCompetencia(r.competencia)} para um rateio novo, mas o que já foi cobrado não se desfaz sozinho.`
                : `O rascunho da competência ${rotuloCompetencia(r.competencia)} será cancelado.`,
            variant: 'danger',
            confirmLabel: 'Cancelar rateio',
        });
        if (!ok) return;
        try {
            const atualizado = await condominioRateioService.cancelar(r.id);
            setRateios(prev => prev.map(x => (x.id === r.id ? atualizado : x)));
            notify('Rateio cancelado.');
        } catch (e: any) {
            notify(e?.message || 'Erro ao cancelar.', 'error');
        }
    };

    // "Regerar número" — trava calculada aqui (a mesma regra da RPC
    // fn_condo_rateio_number_lock_reason): evita 1 ida ao banco por linha só
    // para saber se pode habilitar o botão, já que o dado já está carregado.
    // O servidor revalida de qualquer forma antes de gravar.
    const numeroLockReason = (r: Rateio): string | null => {
        if (!r.number) return 'Este rateio ainda não tem número — feche o rateio primeiro.';
        if (r.cobranca_gerada_em) return 'A cobrança deste rateio já foi gerada — o número não pode mais mudar.';
        return null;
    };

    const [regenerandoId, setRegenerandoId] = React.useState<string | null>(null);

    const regerarNumero = async (r: Rateio) => {
        const ok = await confirm({
            title: 'Regerar o número deste rateio?',
            message: `O número atual (${r.number ?? '—'}) será substituído por um novo, gerado pela máscara vigente em Configurações do Sistema › Nomenclatura. O anterior fica registrado no histórico.`,
            variant: 'warning',
            confirmLabel: 'Regerar',
        });
        if (!ok) return;
        setRegenerandoId(r.id);
        try {
            const novo = await regenerateCondoRateioNumber(r.id, r.organization_id, {
                empreendimentoId: r.empreendimento_id,
                costCenterId: r.cost_center_id ?? undefined,
            });
            setRateios(prev => prev.map(x => (x.id === r.id ? { ...x, number: novo } : x)));
            notify(`Número regerado: ${novo}`);
        } catch (e: any) {
            notify(e?.message || 'Erro ao regerar o número.', 'error');
        } finally {
            setRegenerandoId(null);
        }
    };

    // ── Aba Despesas ──────────────────────────────────────────────────────
    // §6.1 — a aba Despesas tem TRÊS colunas de texto livre (descrição,
    // fornecedor, centro de custo): é exatamente o caso em que redimensionar
    // paga o próprio custo. A tabela de Rateios segue sem, pela decisão já
    // registrada lá (oito colunas curtas, nenhuma de texto livre).
    const colsDespesas = useResizableColumns(LARGURAS_DESPESAS, `condominio:${empreendimento.id}:despesas:larguras`);

    const [lancamentos, setLancamentos] = React.useState<LancamentoDoCondominio[]>([]);
    const [carregandoLanc, setCarregandoLanc] = React.useState(false);
    const [erroLanc, setErroLanc] = React.useState<string | null>(null);

    // Sem competência escolhida a aba usa o mês corrente: `internal_transactions`
    // é a maior tabela do financeiro, e "todas as despesas de todos os tempos"
    // seria uma varredura que ninguém pediu. O filtro do topo manda.
    const mesDasDespesas = competenciaFiltro || competenciaAtual().slice(0, 7);

    // Em Despesas o `<select>` não tem a opção "Todas". Com o filtro em `''`
    // (herdado da aba Rateios), o navegador exibia a PRIMEIRA opção da lista
    // enquanto o estado seguia vazio e os dados vinham do mês corrente — o
    // rótulo dizia um mês e a tabela mostrava outro. Entrar na aba fixa a
    // competência, e aí rótulo e dado passam a falar do mesmo mês.
    React.useEffect(() => {
        if (subAba === 'despesas' && !competenciaFiltro) {
            setCompetenciaFiltro(competenciaAtual().slice(0, 7));
        }
    }, [subAba, competenciaFiltro, setCompetenciaFiltro]);

    React.useEffect(() => {
        if (subAba !== 'despesas' || centros.length === 0) return;
        let ativo = true;
        setCarregandoLanc(true);
        setErroLanc(null);
        condominioRateioService.listarLancamentos({
            costCenterIds: centros.map(c => c.id),
            competencia: `${mesDasDespesas}-01`,
        })
            .then(l => { if (ativo) setLancamentos(l); })
            .catch(e => { if (ativo) { setErroLanc(e?.message || 'Erro ao carregar os lançamentos.'); setLancamentos([]); } })
            .finally(() => { if (ativo) setCarregandoLanc(false); });
        return () => { ativo = false; };
    }, [subAba, centros, mesDasDespesas]);

    const lancamentosFiltrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        if (!t) return lancamentos;
        // A busca alcança as colunas VISÍVEIS: coluna que a busca não enxerga
        // faz o usuário digitar "boleto" e a linha sumir.
        return lancamentos.filter(l =>
            (l.codigo ?? '').toLowerCase().includes(t)
            || l.descricao.toLowerCase().includes(t)
            || l.fornecedor.toLowerCase().includes(t)
            || origemLabel(l.origem).toLowerCase().includes(t)
            || l.costCenterLabel.toLowerCase().includes(t));
    }, [lancamentos, searchTerm]);

    const vivos = React.useMemo(() => rateios.filter(r => r.status !== 'CANCELADO'), [rateios]);
    const kpis = React.useMemo(() => ({
        fechados: vivos.filter(r => r.status === 'FECHADO').length,
        rascunhos: vivos.filter(r => r.status === 'RASCUNHO').length,
        ultimoTotal: vivos.find(r => r.status === 'FECHADO')?.total_rateado ?? 0,
    }), [vivos]);

    const filtrados = React.useMemo(() => {
        const t = searchTerm.trim().toLowerCase();
        // O recorte por competência vem ANTES da busca: é filtro de escopo
        // ("qual mês"), não de texto.
        const porMes = competenciaFiltro
            ? rateios.filter(r => r.competencia.slice(0, 7) === competenciaFiltro)
            : rateios;
        if (!t) return porMes;
        return porMes.filter(r =>
            rotuloCompetencia(r.competencia).includes(t)
            || (r.number || '').toLowerCase().includes(t)
            || CRITERIO_LABEL[r.criterio].toLowerCase().includes(t));
    }, [rateios, searchTerm, competenciaFiltro]);

    // Sem coluna escolhida mantém a ordem do service (competência desc) — é a
    // leitura natural de um livro de competências, e §6.4 pede que o default
    // viva aqui, não num dropdown de "ordenar por".
    const ordenados = React.useMemo(() => {
        const col = tableColumns.sortColumn;
        if (!col) return filtrados;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        const chave = (r: Rateio): string | number => {
            switch (col) {
                // Rascunho ainda não tem número (ele nasce no fechamento): string
                // vazia agrupa todos no mesmo extremo em vez de espalhá-los.
                case 'number': return r.number || '';
                case 'competencia': return r.competencia;   // ISO ordena cronologicamente
                case 'tipo': return r.tipo;
                case 'criterio': return CRITERIO_LABEL[r.criterio];
                case 'status': return STATUS_LABEL[r.status];
                case 'despesas': return r.total_despesas;
                case 'rateado': return r.total_rateado;
                case 'diferenca': return r.total_despesas - r.total_rateado;
                case 'cobranca': return r.cobranca_gerada_em ? 1 : 0;
                default: return '';
            }
        };
        return [...filtrados].sort((a, b) => {
            const va = chave(a), vb = chave(b);
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
            return String(va).localeCompare(String(vb), 'pt-BR') * dir;
        });
    }, [filtrados, tableColumns.sortColumn, tableColumns.sortDirection]);

    // Sem centro de custo não há de onde tirar despesa — e é o primeiro passo.
    if (!loading && !centro) {
        return (
            <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100 shadow-sm">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Este condomínio não tem centro de custo</h3>
                <p className="text-sm text-gray-500 max-w-lg mx-auto mb-6">
                    O centro de custo é a âncora da separação do caixa: a despesa do condomínio é a
                    que cai nele, com ou sem organização própria. Sem ele não há de onde tirar as
                    despesas do rateio.
                </p>

                <div className="max-w-lg mx-auto text-left space-y-4">
                    {/* Vincular vem primeiro: quem já cadastrou o centro de custo à
                        mão — o caso comum — não deve ser empurrado a criar um
                        segundo e ficar com dois para o mesmo caixa. */}
                    {disponiveis.length > 0 && (
                        <div className="bg-white p-4 rounded-[10px] border border-gray-200">
                            <label className="text-xs font-semibold text-slate-500">Já existe um centro de custo para este condomínio?</label>
                            <div className="flex gap-2 mt-1">
                                {/* Drawer padrão de Centro de Custo (§7.1.1) — só os livres. */}
                                <div className="flex-1 min-w-0">
                                    <CostCenterSelect
                                        // Crua, não achatada — ver o comentário gêmeo na Ficha.
                                        costCenters={disponiveis}
                                        value={escolhido}
                                        onChange={setEscolhido}
                                        placeholder="Selecione para vincular"
                                        size="sm"
                                        hoverCls="hover:bg-blue-50"
                                    />
                                </div>
                                <button
                                    onClick={vincularCentro}
                                    disabled={!escolhido}
                                    className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 shrink-0"
                                >
                                    Vincular
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1.5">
                                Vincular aproveita os lançamentos que já caíram nele. Criar um novo
                                deixaria dois centros de custo para o mesmo caixa.
                            </p>
                        </div>
                    )}

                    <div className="text-center">
                        <button
                            onClick={criarCentro}
                            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95"
                        >
                            <Plus className="w-[15px] h-[15px]" /> Criar um novo, no grupo Condomínios
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm">{erro}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <KpiCard label="RATEIOS FECHADOS" value={kpis.fechados} icon={<Lock className="w-5 h-5" />} color="emerald" />
                <KpiCard
                    label="RASCUNHOS" value={kpis.rascunhos}
                    sub={kpis.rascunhos > 0 ? 'Ainda não viraram cobrança' : undefined}
                    icon={<Calculator className="w-5 h-5" />}
                    color={kpis.rascunhos > 0 ? 'amber' : 'gray'}
                />
                <KpiCard
                    label="ÚLTIMO RATEIO FECHADO" value={dinheiro(kpis.ultimoTotal)}
                    sub={centro ? (centros.length > 1 ? `Centros de custo ${centros.map(c => c.code).join(', ')}` : `Centro de custo ${centro.code}`) : undefined}
                    icon={<Wallet className="w-5 h-5" />} color="blue"
                />
            </div>

            {/* Qual centro de custo alimenta o rateio — sem isso, "de onde vêm as
                despesas?" só se responde abrindo o código. */}
            {centros.length > 0 && (
                <div className="bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3 space-y-1">
                    {/* Um por linha: com mais de um centro de custo, a despesa do
                        rateio é a SOMA — e cada um pode ser desvinculado sozinho.
                        Vincular mais um: Empreendimento › Vinculações, ou o
                        campo Empreendimento no cadastro do centro de custo. */}
                    {centros.map((c, i) => (
                        <div key={c.id} className="flex items-center justify-between gap-3">
                            <p className="text-sm text-gray-600 min-w-0">
                                <span className="text-gray-400">{i === 0 ? (centros.length > 1 ? 'Despesas vêm da soma de' : 'Despesas vêm de') : 'e de'}</span>{' '}
                                <span className="font-medium text-gray-800">{c.code} — {c.name}</span>
                            </p>
                            <button
                                onClick={() => desvincularCentro(c)}
                                className="h-8 px-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all shrink-0 whitespace-nowrap"
                            >
                                Desvincular
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Sub-abas §19.1 — trilho cinza, aba ativa em branco com o texto
                azul. Não é o azul sólido do botão primário: aba ativa é estado
                de navegação, não ação. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {([
                        { id: 'rateios' as const, label: 'Rateios', icon: Calculator },
                        { id: 'despesas' as const, label: 'Despesas', icon: Wallet },
                    ]).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setSubAba(t.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                subAba === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                    ))}
                </div>

                {/* Filtro de competência — escopo, não busca (§5.3): decide de
                    QUAL MÊS a tela fala, nas duas sub-abas. */}
                <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Competência</label>
                    {/* Campo de MÊS, não `<select>` de meses conhecidos.
                        A lista de opções saía dos rateios existentes — e com
                        isso um mês que tem DESPESA e ainda não tem rateio ficava
                        inalcançável, que é justamente o mês que se quer olhar
                        antes de criar o rateio. (Pego na prova de tela de
                        24/09: o Bella Vista oferecia 09/2026, 07/2026 e 05/2024,
                        e escondia 08/2026, onde há lançamento.)
                        Campo vazio = "Todas" na aba Rateios; em Despesas o
                        efeito acima preenche com o mês corrente. */}
                    <input
                        type="month"
                        value={competenciaFiltro}
                        onChange={e => setCompetenciaFiltro(e.target.value)}
                        className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    {subAba === 'rateios' && competenciaFiltro && (
                        <button
                            type="button"
                            onClick={() => setCompetenciaFiltro('')}
                            className="h-9 px-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all whitespace-nowrap"
                            title="Mostrar todas as competências"
                        >
                            Todas
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-white">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={subAba === 'rateios'
                                    ? 'Buscar por competência ou critério...'
                                    : 'Buscar por código, descrição, fornecedor, origem ou centro de custo...'}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={carregar}
                            className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            title="Recarregar"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        {/* §6.1.2 — ajustar a largura ao conteúdo, sob comando
                            explícito. Só na aba Despesas, que é a que
                            redimensiona; recalcular sozinho faria as colunas
                            dançarem enquanto o usuário digita na busca. */}
                        {subAba === 'despesas' && (
                            <>
                                <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => colsDespesas.autoFit()}
                                        className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                                        title="Ajustar largura das colunas ao conteúdo"
                                    >
                                        <MoveHorizontal className="w-4 h-4" />
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Configurar coluna e "Novo rateio" pertencem à tabela de
                            rateios — em Despesas não há o que configurar nem o que
                            criar: o lançamento nasce no Financeiro, não aqui. */}
                        {subAba === 'rateios' && (
                            <>
                                <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>
                                <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                                    <ColumnConfigButton
                                        columns={COLUMNS.filter(c => c.key !== 'actions')}
                                        visibleColumns={tableColumns.visibleColumns}
                                        showColumnConfig={tableColumns.showColumnConfig}
                                        onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                        onToggleColumn={tableColumns.toggleColumn}
                                        onReset={tableColumns.resetColumns}
                                    />
                                </div>
                                <button
                                    onClick={() => { setPrevia(null); setSheetNovo(true); }}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
                                >
                                    <Plus className="w-[15px] h-[15px]" /> Novo rateio
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {subAba === 'despesas' ? (
                    <TabelaLancamentos
                        lancamentos={lancamentosFiltrados}
                        carregando={carregandoLanc}
                        erro={erroLanc}
                        mes={rotuloCompetencia(`${mesDasDespesas}-01`)}
                        temBusca={!!searchTerm.trim()}
                        cols={colsDespesas}
                    />
                ) : (
                <>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {rateios.length === 0 ? 'Nenhum rateio' : 'Nenhum resultado'}
                        </h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            {rateios.length === 0
                                ? 'O rateio pega as despesas lançadas no centro de custo do condomínio e divide entre as unidades pelo critério escolhido.'
                                : 'Tente ajustar a busca.'}
                        </p>
                    </div>
                ) : (
                    /* Sem `useResizableColumns` (§6.1): as oito colunas são
                       número, mês, dois rótulos curtos e três valores — nenhuma
                       de texto livre que estoure a largura, que é o caso em que
                       redimensionar paga o próprio custo. */
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {v.includes('number') && <SortableHeader colKey="number" label="Número" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('competencia') && <SortableHeader colKey="competencia" label="Competência" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('tipo') && <SortableHeader colKey="tipo" label="Tipo" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('criterio') && <SortableHeader colKey="criterio" label="Critério" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('status') && <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('despesas') && <SortableHeader colKey="despesas" label="Despesas" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('rateado') && <SortableHeader colKey="rateado" label="Rateado" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('diferenca') && <SortableHeader colKey="diferenca" label="Diferença" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('cobranca') && <SortableHeader colKey="cobranca" label="Cobrança" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />}
                                    {v.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {ordenados.map(r => {
                                    const diferenca = r.total_despesas - r.total_rateado;
                                    const temDiferenca = Math.abs(diferenca) > 0.005;
                                    const cancelado = r.status === 'CANCELADO';
                                    return (
                                        <tr
                                            key={r.id}
                                            className={`transition-colors group ${cancelado ? 'opacity-60' : 'hover:bg-blue-50/50 cursor-pointer'}`}
                                            onClick={cancelado ? undefined : () => abrirDetalhe(r)}
                                        >
                                            {v.includes('number') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                    {r.number || (
                                                        <span className="text-gray-400" title="O número é atribuído no fechamento do rateio.">—</span>
                                                    )}
                                                </td>
                                            )}
                                            {v.includes('competencia') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal whitespace-nowrap">
                                                    {/* A competência é um LINK para a aba Despesas
                                                        daquele mês (§7: item relacionado = azul).
                                                        `stopPropagation` porque a linha inteira já
                                                        abre o detalhe do rateio — sem isso os dois
                                                        gestos disparam juntos e o painel cobre a aba
                                                        que acabou de ser aberta. */}
                                                    <button
                                                        type="button"
                                                        onClick={ev => {
                                                            ev.stopPropagation();
                                                            setCompetenciaFiltro(r.competencia.slice(0, 7));
                                                            setSubAba('despesas');
                                                        }}
                                                        className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                                        title={`Ver os lançamentos de ${rotuloCompetencia(r.competencia)}`}
                                                    >
                                                        {rotuloCompetencia(r.competencia)}
                                                    </button>
                                                </td>
                                            )}
                                            {v.includes('tipo') && (
                                                <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal ${r.tipo === 'EXTRAORDINARIO' ? 'text-indigo-600' : 'text-gray-700'}`}>
                                                    {r.tipo === 'EXTRAORDINARIO' ? 'Extraordinário' : 'Ordinário'}
                                                </td>
                                            )}
                                            {v.includes('criterio') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                                    {CRITERIO_LABEL[r.criterio]}
                                                </td>
                                            )}
                                            {v.includes('status') && (
                                                <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal ${STATUS_COR[r.status]}`}>
                                                    {STATUS_LABEL[r.status]}
                                                </td>
                                            )}
                                            {v.includes('despesas') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                                                    {dinheiro(r.total_despesas)}
                                                </td>
                                            )}
                                            {v.includes('rateado') && (
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm font-medium text-gray-800 whitespace-nowrap">
                                                    {dinheiro(r.total_rateado)}
                                                </td>
                                            )}
                                            {v.includes('diferenca') && (
                                                <td className={`px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-right text-sm whitespace-nowrap ${temDiferenca ? 'font-medium text-amber-600' : 'font-normal text-gray-400'}`}>
                                                    {temDiferenca ? dinheiro(diferenca) : '—'}
                                                </td>
                                            )}
                                            {v.includes('cobranca') && (
                                                /* §8: texto colorido, sem pílula. "—" cinza claro quando a
                                                   pergunta nem se aplica (rascunho não vira boleto). */
                                                <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal whitespace-nowrap">
                                                    {(() => {
                                                        if (!r.cobranca_gerada_em) {
                                                            return r.status === 'FECHADO'
                                                                ? <span className="text-amber-600">Pendente</span>
                                                                : <span className="text-gray-400">—</span>;
                                                        }
                                                        const e = emissoes[r.id];
                                                        // Sem contagem ainda (carregando ou falhou): "Gerada" é
                                                        // verdade e não finge saber o que não sabe.
                                                        if (!e || e.total === 0) return <span className="text-emerald-600">Gerada</span>;
                                                        if (e.emitidas === 0) return <span className="text-amber-600">Gerada · 0 de {e.total} emitidas</span>;
                                                        if (e.emitidas < e.total) return <span className="text-amber-600">{e.emitidas} de {e.total} emitidas</span>;
                                                        return <span className="text-emerald-600">{e.total} de {e.total} emitidas</span>;
                                                    })()}
                                                </td>
                                            )}
                                            {v.includes('actions') && (
                                                <td className="px-6 py-2.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                                        {!cancelado && (
                                                            <button
                                                                onClick={() => abrirDetalhe(r)}
                                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all whitespace-nowrap"
                                                            >
                                                                Ver detalhe
                                                            </button>
                                                        )}
                                                        {r.status === 'RASCUNHO' && (
                                                            <ActionIconButton
                                                                kind="edit"
                                                                title="Fechar rateio"
                                                                icon={<Lock className="w-4 h-4" />}
                                                                onClick={() => fechar(r)}
                                                            />
                                                        )}
                                                        {/* Emitir só aparece depois de GERAR, e só enquanto houver
                                                            cota sem boleto. É a ação que sai do sistema: fica com o
                                                            tom `attention`, não o neutro das outras. */}
                                                        {!!r.cobranca_gerada_em
                                                            && (emissoes[r.id]?.emitidas ?? 0) < (emissoes[r.id]?.total ?? 1)
                                                            && (
                                                            <ActionIconButton
                                                                kind="share"
                                                                title={emitindo === r.id
                                                                    ? 'Emitindo no Asaas...'
                                                                    : 'Emitir boletos no Asaas (não se desfaz)'}
                                                                icon={emitindo === r.id
                                                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                    : <Send className="w-4 h-4" />}
                                                                onClick={() => { if (emitindo !== r.id) emitirBoletos(r); }}
                                                            />
                                                        )}
                                                        {/* Continua alcançável DEPOIS de gerada, de
                                                            propósito. Desde que o lote deixou de abortar
                                                            no primeiro erro (23/09/2026), uma geração
                                                            pode sair pela metade: o rateio ganha
                                                            `cobranca_gerada_em` e sobram cotas sem
                                                            recebível. Escondendo a ação aí, essas cotas
                                                            ficavam inalcançáveis para sempre — e o
                                                            caminho de resolver um CPF que faltava e
                                                            gerar o que sobrou não existia. A prévia é a
                                                            autoridade: cota já gerada aparece bloqueada
                                                            com "o recebível existe", e o botão do rodapé
                                                            trava em zero cobrável. */}
                                                        {r.status === 'FECHADO' && (
                                                            <ActionIconButton
                                                                kind="edit"
                                                                title={r.cobranca_gerada_em
                                                                    ? 'Gerar cobrança das cotas que ficaram sem recebível'
                                                                    : 'Gerar cobrança das cotas'}
                                                                icon={<FileText className="w-4 h-4" />}
                                                                onClick={() => abrirCobranca(r)}
                                                            />
                                                        )}
                                                        {r.number && (
                                                            <ActionIconButton
                                                                kind="settings"
                                                                icon={regenerandoId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                                title={numeroLockReason(r) ?? 'Regerar número pela máscara atual'}
                                                                disabled={!!numeroLockReason(r) || regenerandoId === r.id}
                                                                onClick={() => regerarNumero(r)}
                                                            />
                                                        )}
                                                        {!cancelado && (
                                                            <InlineDisclosureMenu showDelete onDelete={() => cancelar(r)} />
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                </>
                )}
            </div>

            {/* Novo rateio — calcular, conferir, salvar */}
            <Sheet open={sheetNovo} onClose={() => setSheetNovo(false)} size="2xl">
                <SheetHeader onClose={() => setSheetNovo(false)}>
                    <SheetTitle>Novo rateio</SheetTitle>
                    <SheetDescription>{empreendimento.name}</SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    {/* §30 — malha do formulário. Antes: `mt-1` (4px) entre
                        rótulo e campo, `gap-3` (12px) entre campos, tudo num
                        `space-y-4` sem seção, e o Critério — um `<select>` —
                        ocupando a linha inteira, que a §30 proíbe justamente
                        para campo curto. Agora: par 6px, grade 24/16px, seção
                        com título e linha, 32px entre seções. */}
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                <Calculator className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-semibold text-gray-900">O que ratear</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500">Competência</label>
                                    <input
                                        type="month"
                                        value={form.competencia.slice(0, 7)}
                                        // Trocar a competência INVALIDA a prévia: ela
                                        // é o que `salvar()` grava como cotas e
                                        // despesas, mas a competência gravada sai do
                                        // FORM. Sem isto dava para calcular agosto,
                                        // mudar o campo para setembro e salvar um
                                        // rateio de setembro com as despesas de
                                        // agosto — sem nada na tela indicando a
                                        // troca. Mesmo motivo do critério, abaixo.
                                        onChange={e => { setForm(f => ({ ...f, competencia: `${e.target.value}-01` })); setPrevia(null); }}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500">Tipo</label>
                                    <select
                                        value={form.tipo}
                                        // O tipo também é gravado a partir do form, e
                                        // decide o pagador padrão da cobrança —
                                        // prévia calculada como ordinária não pode
                                        // ser salva como extraordinária.
                                        onChange={e => { setForm(f => ({ ...f, tipo: e.target.value as TipoRateio })); setPrevia(null); }}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    >
                                        <option value="ORDINARIO">Ordinário</option>
                                        <option value="EXTRAORDINARIO">Extraordinário</option>
                                    </select>
                                    <p className="text-xs text-gray-400">
                                        {form.tipo === 'EXTRAORDINARIO'
                                            ? 'Obra e benfeitoria são do PROPRIETÁRIO, não do inquilino — por isso rateio separado.'
                                            : 'Despesa corrente do mês.'}
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500">Critério</label>
                                    <select
                                        value={form.criterio}
                                        onChange={e => { setForm(f => ({ ...f, criterio: e.target.value as CriterioRateio })); setPrevia(null); }}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    >
                                        {(Object.keys(CRITERIO_LABEL) as CriterioRateio[]).map(c => (
                                            <option key={c} value={c}>{CRITERIO_LABEL[c]}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400">Exige: {CRITERIO_EXIGE[form.criterio]}.</p>
                                </div>

                                {form.criterio === 'FIXO' && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-500">Valor por unidade</label>
                                        <input
                                            type="text" inputMode="decimal"
                                            value={form.valorFixo}
                                            onChange={e => setForm(f => ({ ...f, valorFixo: e.target.value }))}
                                            placeholder="0,00"
                                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                        />
                                        <p className="text-xs text-gray-400">
                                            No valor fixo o total arrecadado é consequência, e pode não bater com a despesa.
                                        </p>
                                    </div>
                                )}

                                {/* A lista de unidades é conteúdo LARGO, não campo
                                    curto: ela atravessa as duas colunas (§30). */}
                                {form.criterio === 'GRUPO' && (
                                    <div className="col-span-2 space-y-1.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <label className="text-xs font-semibold text-slate-500">Unidades do grupo</label>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => { setDoGrupo(new Set(unidades.map(u => u.id))); setPrevia(null); }}
                                                    className="h-7 px-2 rounded-[6px] text-xs font-medium text-gray-500 hover:bg-gray-100 transition-all"
                                                >
                                                    Todas
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDoGrupo(new Set()); setPrevia(null); }}
                                                    className="h-7 px-2 rounded-[6px] text-xs font-medium text-gray-500 hover:bg-gray-100 transition-all"
                                                >
                                                    Nenhuma
                                                </button>
                                            </div>
                                        </div>
                                        {carregandoUnidades ? (
                                            <p className="text-xs text-gray-400">Carregando as unidades...</p>
                                        ) : unidades.length === 0 ? (
                                            <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                Este condomínio não tem unidades cadastradas — não há grupo a formar.
                                            </p>
                                        ) : (
                                            <div className="max-h-56 overflow-y-auto rounded-[10px] border border-gray-200 divide-y divide-gray-100">
                                                {unidades.map(u => (
                                                    <label
                                                        key={u.id}
                                                        className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={doGrupo.has(u.id)}
                                                            onChange={() => {
                                                                setDoGrupo(prev => {
                                                                    const proximo = new Set(prev);
                                                                    if (proximo.has(u.id)) proximo.delete(u.id);
                                                                    else proximo.add(u.id);
                                                                    return proximo;
                                                                });
                                                                // Trocar quem está no grupo muda TODAS as cotas —
                                                                // a prévia na tela deixaria de corresponder.
                                                                setPrevia(null);
                                                            }}
                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        />
                                                        <span className="text-sm font-normal text-gray-700">{u.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-gray-400">
                                            {doGrupo.size} de {unidades.length} no grupo — a despesa é dividida só entre elas.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Ação da seção, à direita — §30: rodapé de
                                formulário é linha solta, sem card próprio. */}
                            <div className="flex justify-end">
                                <button
                                    onClick={calcular}
                                    // Grupo vazio calcularia peso 0 em todas as unidades e
                                    // devolveria um rateio de R$ 0,00 — que antes dava para
                                    // salvar e fechar, queimando um número de documento.
                                    disabled={calculando || (form.criterio === 'GRUPO' && doGrupo.size === 0)}
                                    title={form.criterio === 'GRUPO' && doGrupo.size === 0
                                        ? 'Escolha ao menos uma unidade para formar o grupo.'
                                        : undefined}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-100 text-gray-700 rounded-[6px] hover:bg-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <Calculator className="w-[15px] h-[15px]" />
                                    {calculando ? 'Calculando...' : 'Calcular'}
                                </button>
                            </div>
                        </div>

                        {/* Sem prévia o painel ficava com um vão enorme entre o
                            botão e o rodapé — e nada dizendo o que falta fazer.
                            §12: o vazio é um estado, e tem texto próprio. */}
                        {!previa && !calculando && (
                            <div className="text-center py-10 border-t border-gray-100">
                                <Calculator className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                                    Calcule para ver quais despesas entram e quanto cada unidade paga.
                                    Nada é gravado até você salvar o rascunho.
                                </p>
                            </div>
                        )}

                        {previa && (
                            <div className="space-y-3">

                                <div className="bg-gray-50 rounded-[10px] p-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Despesas da competência</span>
                                        <span className="text-gray-800 font-medium">{dinheiro(previa.totalDespesas)}</span>
                                    </div>
                                    <div className="flex justify-between mt-1">
                                        <span className="text-gray-500">Total rateado</span>
                                        <span className="text-gray-800 font-medium">{dinheiro(previa.totalRateado)}</span>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        {previa.despesas.length} lançamento(s) {centros.length > 1 ? `nos centros de custo ${centros.map(c => c.code).join(', ')}` : `no centro de custo ${centro?.code}`}
                                    </div>
                                </div>

                                {previa.despesas.length > 0 && (
                                    <TabelaDespesas despesas={previa.despesas} comData />
                                )}

                                {/* Só quando NÃO houve exclusão: com despesas
                                    excluídas por já estarem em outro rateio, a
                                    frase "nenhuma despesa lançada… lance no
                                    Financeiro" é falsa e manda o síndico lançar
                                    de novo o que já existe. As duas apareciam
                                    juntas, contradizendo-se (visto na prova de
                                    tela de 23/09). O aviso de `jaRateadas`
                                    abaixo é que explica o zero nesse caso. */}
                                {previa.despesas.length === 0 && previa.jaRateadas === 0 && (
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        Nenhuma despesa lançada nesta competência {centros.length > 1 ? 'nos centros de custo' : 'no centro de custo'} do
                                        condomínio. Lance as despesas no Financeiro apontando para {centros.length > 1 ? 'um deles' : 'ele'}.
                                    </p>
                                )}
                                {previa.jaRateadas > 0 && (
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        {previa.jaRateadas} despesa(s) desta competência ficaram de fora porque já
                                        entraram em outro rateio (o ordinário e o extraordinário do mesmo mês leem
                                        o mesmo centro de custo). Cobrar de novo seria cobrar duas vezes.
                                    </p>
                                )}
                                {previa.semDado > 0 && (
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        {previa.semDado} unidade(s) sem {CRITERIO_EXIGE[form.criterio]} — ficam de fora do rateio.
                                    </p>
                                )}
                                {previa.semResponsavel > 0 && (
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        {previa.semResponsavel} unidade(s) sem responsável financeiro — a cota é
                                        calculada, mas não há de quem cobrar.
                                    </p>
                                )}

                                <div className="space-y-1.5">
                                    {previa.itens.map(i => (
                                        <div key={i.unitId} className={`flex items-start justify-between gap-3 p-2.5 rounded-[6px] border ${i.valor > 0 ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                                            <div className="min-w-0">
                                                <div className="text-sm text-gray-800">{i.unitLabel}</div>
                                                <div className="text-xs text-gray-500">
                                                    {i.clientNome}
                                                    {i.aviso ? <span className="text-amber-600"> · {i.aviso}</span> : ''}
                                                </div>
                                            </div>
                                            <span className="text-sm font-medium text-gray-800 shrink-0">{dinheiro(i.valor)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetNovo(false)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button
                        onClick={salvar}
                        // Rateio de R$ 0,00 não é rascunho: é um documento vazio
                        // que consome número ao fechar. FIXO é a exceção — lá o
                        // total é consequência do valor digitado, e zero pode ser
                        // intencional só se o usuário digitou zero.
                        disabled={salvando || !previa || (previa.totalRateado <= 0 && form.criterio !== 'FIXO')}
                        title={previa && previa.totalRateado <= 0 && form.criterio !== 'FIXO'
                            ? 'Nada a ratear: sem despesa na competência, ou nenhuma unidade com peso.'
                            : undefined}
                        className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {salvando ? 'Salvando...' : 'Salvar rascunho'}
                    </button>
                </SheetFooter>
            </Sheet>

            {/* Ver detalhe — cotas + despesas, reabertas a partir
                do rastro salvo em `condominio_rateio_despesas`. Serve tanto para
                revisar um rascunho quanto como prestação de contas de um fechado. */}
            <Sheet open={!!sheetDetalhe} onClose={() => setSheetDetalhe(null)} size="2xl">
                <SheetHeader onClose={() => setSheetDetalhe(null)}>
                    <SheetTitle>Detalhe do rateio</SheetTitle>
                    <SheetDescription>
                        {sheetDetalhe && `${rotuloCompetencia(sheetDetalhe.competencia)} · ${CRITERIO_LABEL[sheetDetalhe.criterio]} · ${STATUS_LABEL[sheetDetalhe.status]}`}
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    {carregandoDetalhe ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        </div>
                    ) : despesasDetalhe.length === 0 && cotasDetalhe.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-8">Nada gravado neste rateio.</p>
                    ) : (
                        <div className="space-y-6">
                            {/* COTAS primeiro: a pergunta que se faz a um rateio é
                                "quanto minha unidade deve", e a resposta estava
                                inalcançável na tela depois que a cobrança era
                                gerada (a sheet de cobrança some com o botão). */}
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm bg-gray-50 rounded-[10px] p-3">
                                    <span className="text-gray-500">
                                        Cotas — {cotasDetalhe.length} unidade(s)
                                    </span>
                                    <span className="font-medium text-gray-800">
                                        {dinheiro(cotasDetalhe.reduce((s, c) => s + c.valor, 0))}
                                    </span>
                                </div>
                                {cotasDetalhe.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-6">
                                        Nenhuma cota gravada — nenhuma unidade recebeu valor neste rateio.
                                    </p>
                                ) : (
                                    <TabelaCotas cotas={cotasDetalhe} />
                                )}
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-sm bg-gray-50 rounded-[10px] p-3">
                                    <span className="text-gray-500">Total das despesas</span>
                                    <span className="font-medium text-gray-800">
                                        {dinheiro(despesasDetalhe.reduce((s, d) => s + d.valor, 0))}
                                    </span>
                                </div>
                                {despesasDetalhe.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-6">
                                        Nenhuma despesa gravada neste rateio.
                                    </p>
                                ) : (
                                    /* A edição só aparece em RASCUNHO. Fechado é
                                       prestação de contas: o condômino já recebeu
                                       aquele documento. */
                                    <TabelaDespesas
                                        despesas={despesasDetalhe}
                                        comData={false}
                                        onEditarDescricao={sheetDetalhe?.status === 'RASCUNHO' ? editarDescricaoDespesa : undefined}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetDetalhe(null)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Fechar</button>
                </SheetFooter>
            </Sheet>

            {/* Gerar cobrança — vencimento + de quem cobrar + prévia cota a cota.
                A prévia existe para dizer ANTES quem não pode ser cobrado: no
                piloto real, 8 das 10 cotas travam por falta de CPF/CNPJ, e
                descobrir isso um 422 por vez seria a pior versão disso. */}
            <Sheet open={!!sheetCobranca} onClose={() => setSheetCobranca(null)} size="2xl">
                <SheetHeader onClose={() => setSheetCobranca(null)}>
                    <SheetTitle>Gerar cobrança</SheetTitle>
                    <SheetDescription>
                        {sheetCobranca && `${rotuloCompetencia(sheetCobranca.competencia)} · ${sheetCobranca.tipo === 'EXTRAORDINARIO' ? 'Extraordinário' : 'Ordinário'} · ${dinheiro(sheetCobranca.total_rateado)}`}
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    {/* §30, mesma malha do "Novo rateio": par rótulo/campo em
                        6px, grade 24/16px, seção com título e linha, 32px entre
                        seções. As duas sheets vivem na mesma aba — deixar só uma
                        no padrão seria trocar um desalinho por outro. */}
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                <FileText className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-semibold text-gray-900">Como cobrar</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500">Vencimento</label>
                                    <input
                                        type="date"
                                        value={vencimento}
                                        onChange={e => setVencimento(e.target.value)}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    />
                                    <p className="text-xs text-gray-400">Mesma data para todas as cotas desta competência.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500">Cobrar de</label>
                                    <select
                                        value={pagador}
                                        onChange={e => trocarPagador(e.target.value as PagadorDaCota)}
                                        className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                    >
                                        <option value="RESPONSAVEL">Responsável financeiro</option>
                                        <option value="PROPRIETARIO">Proprietário</option>
                                    </select>
                                    <p className="text-xs text-gray-400">
                                        {sheetCobranca?.tipo === 'EXTRAORDINARIO'
                                            ? 'Obra e benfeitoria são obrigação do proprietário — por isso o padrão aqui.'
                                            : 'Despesa corrente costuma ser do responsável financeiro.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {carregandoCob ? (
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                <p className="mt-2 text-gray-500">Montando a prévia...</p>
                            </div>
                        ) : previaCob && (
                            <div className="space-y-3">
                                <div className="bg-gray-50 rounded-[10px] p-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Cotas cobráveis</span>
                                        <span className="text-gray-800 font-medium">{previaCob.qtdCobravel} de {previaCob.cotas.length}</span>
                                    </div>
                                    <div className="flex justify-between mt-1">
                                        <span className="text-gray-500">Total a cobrar</span>
                                        <span className="text-gray-800 font-medium">{dinheiro(previaCob.totalCobravel)}</span>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        Multa {previaCob.multaPercent}% e juros {previaCob.jurosMesPercent}%/mês, da Ficha do condomínio.
                                    </div>
                                </div>

                                {previaCob.qtdBloqueada > 0 && (
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        {previaCob.qtdBloqueada} cota(s) não podem ser cobradas agora — o motivo está em cada linha.
                                    </p>
                                )}

                                <div className="space-y-1.5">
                                    {previaCob.cotas.map(c => (
                                        <div key={c.itemId} className={`flex items-start justify-between gap-3 p-2.5 rounded-[6px] border ${c.bloqueio ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200'}`}>
                                            <div className="min-w-0">
                                                <div className="text-sm text-gray-800">{c.unitLabel}</div>
                                                <div className="text-xs text-gray-500">
                                                    {c.clientNome}
                                                    {c.bloqueio && <span className="text-amber-700"> · {c.bloqueio}</span>}
                                                </div>
                                            </div>
                                            <span className={`text-sm font-medium shrink-0 ${c.bloqueio ? 'text-gray-400' : 'text-gray-800'}`}>
                                                {dinheiro(c.valor)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setSheetCobranca(null)} className="h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all">Cancelar</button>
                    <button
                        onClick={gerarCobranca}
                        disabled={gerandoCob || !vencimento || !previaCob || previaCob.qtdCobravel === 0}
                        className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                    >
                        {gerandoCob ? 'Gerando...' : `Gerar ${previaCob?.qtdCobravel ?? 0} recebível(is)`}
                    </button>
                </SheetFooter>
            </Sheet>

            {/* Resultado da emissão. Existe por causa do SUCESSO PARCIAL: o
                service não aborta o lote no primeiro erro — cada cota é um
                condômino, e falhar a terceira não é motivo para deixar as outras
                sete sem boleto. Um toast diria "8 emitidas" e engoliria quais
                duas ficaram de fora, que é exatamente o que o síndico precisa
                saber para agir. */}
            <Sheet open={!!resultado} onClose={() => setResultado(null)} size="2xl">
                <SheetHeader onClose={() => setResultado(null)}>
                    <SheetTitle>Resultado da emissão</SheetTitle>
                    <SheetDescription>
                        {resultado && `${rotuloCompetencia(resultado.rateio.competencia)} · ${resultado.rateio.number || 'sem número'}`}
                    </SheetDescription>
                </SheetHeader>
                <SheetPanel className="p-6">
                    {resultado && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 p-3 rounded-[10px] border border-gray-200">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-gray-800">
                                        {resultado.r.emitidas} boleto(s) emitido(s)
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Já estão no Asaas e podem ser acompanhados em Financeiro › Boletos ao Cliente.
                                    </p>
                                </div>
                            </div>

                            {resultado.r.falhas.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-amber-600 flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        {resultado.r.falhas.length} cota(s) não foram emitidas. O recebível continua
                                        em Contas a Receber — resolva o motivo e emita de novo, sem refazer o rateio.
                                    </p>
                                    {resultado.r.falhas.map((f, i) => (
                                        <div key={i} className="p-2.5 rounded-[6px] border border-amber-200 bg-amber-50/40">
                                            <div className="text-sm text-gray-800">{f.unitLabel}</div>
                                            <div className="text-xs text-amber-700 mt-0.5">{f.motivo}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500">
                                    Nenhuma falha — todas as cotas com recebível viraram boleto.
                                </p>
                            )}
                        </div>
                    )}
                </SheetPanel>
                <SheetFooter>
                    <button onClick={() => setResultado(null)} className="h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">Fechar</button>
                </SheetFooter>
            </Sheet>

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default FinanceiroTab;
