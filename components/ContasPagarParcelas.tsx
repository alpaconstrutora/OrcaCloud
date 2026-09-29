import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, Building2, Check, ChevronDown, Download, FileText, Loader2, MoveHorizontal, Receipt, RefreshCw, Search, Tag, Undo2, X,
} from 'lucide-react';
import type { Payable, PayableBusinessStatus, CostCenter } from '../types/financial';
import { payableService, payableParty } from '../services/payableService';
import { financialRegistryService } from '../services/financialRegistryService';
import { propertyExpenseService } from '../services/propertyExpenseService';
import { supplierService, getSupplierDisplayName } from '../services/supplierService';
import { appSettingsService } from '../services/appSettingsService';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { Money, formatMoney, formatDateBR } from './ui/Format';
import { useConfirm } from './ui/confirm';
import ActionIconButton from './ui/ActionIconButton';
import ApropriarImovelSheet from './financeiro/ApropriarImovelSheet';
import BaixaRecebivelSheet, { type DadosDaBaixa, type TituloDaBaixa } from './financeiro/BaixaRecebivelSheet';
import { financialReceiptService, type ReciboAtivo } from '../services/financialReceiptService';
import { mensagemResultadoBaixa } from '../utils/baixaRecebivel';
import { numeroRecibo } from '../utils/reciboRecebimento';

/**
 * Rótulo de origem por `source_system`. É a coluna que responde "de onde essa
 * parcela veio", e por isso mostra Pedido/Contrato/Medição separadamente em vez
 * de agrupar tudo como "Suprimentos".
 */
export const ORIGEM_PT: Record<string, string> = {
    PURCHASE_ORDER: 'Pedido de compra',
    CONTRACT_PARCELADO: 'Contrato',
    CONTRACT_AVISTA: 'Contrato à vista',
    CONTRACT_RECURRING: 'Contrato recorrente',
    CONTRACT_MEASUREMENT: 'Medição',
    BOLETO: 'Boleto',
    NFE: 'NF-e',
    LABOR: 'Folha',
    PROLABORE: 'Pró-labore',
    DIVIDENDOS: 'Dividendos',
    PROJECT: 'Obra',
    // Parcela de contrato de dívida/financiamento. O módulo de Dívidas é dono do
    // cronograma; aqui chega UMA LINHA POR COMPONENTE (amortização, juros,
    // correção, IOF, seguro, tarifa) — ver docs/planos/2026-08-29-gestao-dividas-financiamentos.md
    DEBT_INSTALLMENT: 'Financiamento',
    MANUAL: 'Manual',
};

/**
 * Rótulo com degradação legível: origem que ainda não está no mapa vira
 * "Contract Avista" em vez de `CONTRACT_AVISTA`. Até 15/08/2026 o fallback era
 * o código cru, e o mapa tinha 5 das 12 origens que o sistema grava — Boleto,
 * NF-e, Folha, Pró-labore e Dividendos apareciam em caixa alta.
 */
export const origemLabel = (sourceSystem: string) => {
    if (ORIGEM_PT[sourceSystem]) return ORIGEM_PT[sourceSystem];
    if (!sourceSystem) return '—';
    return sourceSystem
        .toLowerCase()
        .split('_')
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
};

export const STATUS_PT: Record<string, string> = {
    PREVISTO: 'Previsto',
    /* AGUARDANDO_APROVACAO e BLOQUEADO vêm da alçada
       (financialApprovalService). Passaram a aparecer de verdade em Contas a
       Pagar quando o boleto deixou de se autoaprovar (15/08/2026) — antes o
       vocabulário existia no banco mas nenhuma parcela chegava aqui com ele. */
    AGUARDANDO_APROVACAO: 'Aguardando aprovação',
    APROVADO: 'Aprovado',
    BLOQUEADO: 'Bloqueado',
    VENCIDO: 'Vencido',
    PAGO: 'Pago',
    PARCIAL: 'Parcial',
    RENEGOCIADO: 'Renegociado',
    CANCELADO: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
    PAGO: 'text-green-700',
    APROVADO: 'text-blue-700',
    AGUARDANDO_APROVACAO: 'text-orange-700',
    BLOQUEADO: 'text-red-700',
    PREVISTO: 'text-yellow-700',
    VENCIDO: 'text-red-600',
    PARCIAL: 'text-amber-700',
    RENEGOCIADO: 'text-indigo-700',
    CANCELADO: 'text-gray-500',
};

// Padrão §8 — texto simples colorido, sem pílula/fundo/uppercase.
function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`text-sm font-normal ${STATUS_COLORS[status] ?? 'text-gray-600'}`}>
            {STATUS_PT[status] ?? status}
        </span>
    );
}

const PARCELAS_COLUMNS: ColumnConfig[] = [
    { key: 'credor', label: 'Credor', sortable: true },
    { key: 'descricao', label: 'Descrição', sortable: true },
    { key: 'origem', label: 'Origem', sortable: true },
    { key: 'obra', label: 'Obra', sortable: true },
    { key: 'valor', label: 'Valor', sortable: true },
    { key: 'vencimento', label: 'Vencimento', sortable: true },
    // Recibo de pagamento (o credor assina) — antes de Status, como em Contas a
    // Receber: a tabela é larga e a coluna Ações costuma ficar fora da tela.
    { key: 'recibo', label: 'Recibo', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    // Duas dimensões DIFERENTES (ver migration 20270822000013): Centro de
    // Custo é cost_centers_v2, Plano de Contas é plano_de_contas. Resolvidas
    // no client — vw_payables só expõe os UUIDs.
    { key: 'centro_custo', label: 'Centro de Custo', sortable: true },
    { key: 'plano_contas', label: 'Plano de Contas', sortable: true },
    // Imóvel apropriado (Fase 2 — OPEX). Vazio é informação, não lacuna: é a
    // despesa que ainda não entrou em NOI nenhum.
    { key: 'imovel', label: 'Imóvel', sortable: true },
];

// Metadados de header por coluna — usados para renderizar o <thead> a partir de
// `tableColumns.orderedVisibleColumns` (ordem que o usuário arrasta), em vez de
// uma sequência fixa de JSX (mesmo padrão de ClientList.tsx). O alinhamento por
// coluna reproduz exatamente o `align` que já existia no JSX condicional antigo.
const PARCELAS_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    credor: { label: 'Credor', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
    descricao: { label: 'Descrição', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
    origem: { label: 'Origem', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
    obra: { label: 'Obra', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
    valor: { label: 'Valor', className: 'text-right px-6 py-2 border-r border-gray-100 overflow-hidden' },
    vencimento: { label: 'Vencimento', className: 'text-center px-6 py-2 border-r border-gray-100 overflow-hidden' },
    recibo: { label: 'Recibo', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
    status: { label: 'Status', className: 'text-center px-6 py-2 border-r border-gray-100 overflow-hidden' },
    centro_custo: { label: 'Centro de Custo', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
    plano_contas: { label: 'Plano de Contas', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
    imovel: { label: 'Imóvel', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    credor: 200, descricao: 260, origem: 150, obra: 160, valor: 140, vencimento: 150, recibo: 130, status: 120,
    centro_custo: 180, plano_contas: 180, imovel: 190, actions: 200,
};

const STATUS_FILTROS = ['all', 'AGUARDANDO_APROVACAO', 'PREVISTO', 'VENCIDO', 'PAGO'] as const;
type StatusFiltro = typeof STATUS_FILTROS[number];

/* O filtro de Origem é DERIVADO das linhas carregadas (ver `origensPresentes`
   no componente), não de uma lista fixa. Até 15/08/2026 era
   `Object.keys(ORIGEM_PT)`, e como o mapa tinha 5 das 12 origens que o sistema
   grava, Boleto/NF-e/Folha/Pró-labore/Dividendos não eram filtráveis — e
   ninguém percebia, porque a lista parecia completa. Derivar dos dados faz
   origem nova aparecer sozinha. */
type OrigemFiltro = string;

const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Dias de atraso — a data vem 'YYYY-MM-DD', então parseia com hora fixa (bug de fuso). */
function diasAtraso(dueDate: string): number {
    return Math.floor((hoje().getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86400000);
}

/** Linha com os nomes já resolvidos (Centro de Custo/Plano de Contas/Imóvel) —
 *  ver `rowsWithNames` no componente, que injeta esses três campos a partir
 *  dos UUIDs que `vw_payables` expõe. */
type ParcelaRow = Payable & { cost_center_name: string; plano_de_contas_name: string; imovel_label: string; recibo_numero: number | null };

/** Folha reúne vários colaboradores num título: não há um credor para assinar. */
const semReciboPorOrigem = (row: Pick<Payable, 'source_system'>) => row.source_system === 'LABOR';

// Conteúdo de cada célula por coluna — extraído para função pura para que o corpo
// da tabela possa mapear `tableColumns.orderedVisibleColumns` (ordem arrastável)
// em vez de repetir um bloco condicional fixo por coluna (padrão de ClientList.tsx).
// (Sem a tag literal de célula neste comentário: o awk do check-ui-standard.sh
//  lê comentário como código e abriria a §7 daqui até o primeiro fechamento real.)
// `alocacoes === null` distingue "apropriação indisponível nesta sessão" de
// "nenhuma linha apropriada" — por isso entra como parâmetro à parte da linha.
function renderParcelaCell(
    key: string,
    row: ParcelaRow,
    alocacoes: Map<string, { propertyIds: string[]; names: string[] }> | null,
): React.ReactNode {
    switch (key) {
        /* ⚠️ `truncate` PRECISA de `block` (§6.1.2). Num <span> inline o
           `overflow:hidden` não recorta nada e o texto atravessa a coluna
           vizinha — a Descrição saía por cima da Origem. `title` devolve o
           texto inteiro no hover, já que agora ele é cortado de verdade. */
        case 'credor': {
            const credor = row.credor_display || payableParty(row);
            return <span className="block truncate text-sm font-normal text-gray-700" title={credor}>{credor}</span>;
        }
        case 'descricao':
            return <span className="block truncate text-sm font-normal text-gray-600" title={row.description || undefined}>{row.description || '—'}</span>;
        case 'origem':
            return <span className="text-sm font-normal text-gray-600">{origemLabel(row.source_system)}</span>;
        case 'obra': {
            // A coluna diz "Obra", então mostra OBRA — `obra_name` vem resolvido
            // por vw_project_obra (o próprio projeto, ou o ancestral por
            // linkedProjectId). `project_name` cru imprimia o nome do ORÇAMENTO
            // em que o lançamento foi feito, como se fosse a obra.
            if (row.obra_name) {
                return <span className="block truncate text-sm font-normal text-gray-700" title={row.obra_name}>{row.obra_name}</span>;
            }
            // Sem obra na cadeia: "—" honesto, mas o hover entrega o projeto cru
            // para o lançamento não virar agulha em palheiro — é assim que se
            // acha um orçamento órfão em vez de ele dormir atrás de um nome
            // plausível.
            const cru = row.project_name
                ? `Lançado em: ${row.project_name} — projeto sem obra vinculada`
                : undefined;
            return <span className="block truncate text-sm font-normal text-gray-400 italic" title={cru}>—</span>;
        }
        case 'valor':
            return (
                <div className="text-right text-sm font-medium text-gray-800">
                    <Money value={row.amount} />
                </div>
            );
        case 'vencimento': {
            const vencido = row.effective_status === 'VENCIDO';
            return (
                <div className={`text-center text-sm font-normal ${vencido ? 'text-red-600' : 'text-gray-600'}`}>
                    {formatDateBR(row.due_date)}
                    {vencido && row.due_date && (
                        <div className="text-xs text-red-500">{diasAtraso(row.due_date)}d atraso</div>
                    )}
                </div>
            );
        }
        case 'status':
            return (
                <div className="text-center">
                    <StatusBadge status={row.effective_status} />
                </div>
            );
        case 'centro_custo':
            return <span className="block truncate text-sm font-normal text-gray-700" title={row.cost_center_name || undefined}>{row.cost_center_name || '—'}</span>;
        case 'plano_contas':
            return <span className="block truncate text-sm font-normal text-gray-700" title={row.plano_de_contas_name || undefined}>{row.plano_de_contas_name || '—'}</span>;
        case 'imovel':
            return (
                <span className="block truncate text-sm font-normal text-gray-700">
                    {alocacoes === null ? (
                        <span className="text-gray-400" title="Apropriação por imóvel indisponível nesta sessão — não é o mesmo que 'não apropriado'.">n/d</span>
                    ) : row.imovel_label ? (
                        row.imovel_label
                    ) : (
                        <span className="text-gray-400" title="Ainda não apropriada — esta despesa não entra em NOI nenhum.">—</span>
                    )}
                </span>
            );
        default:
            return null;
    }
}

interface Props {
    rows: Payable[];
    /** Org efetiva do pai (undefined = "Todas as Organizações"), usada só para
     *  carregar os cadastros de Centro de Custo/Plano de Contas — a RLS já
     *  recorta o que aparece em `rows`. */
    organizationId?: string;
    /**
     * Período de vencimento (escopo, vem do pai). Recorte de CLIENTE de propósito:
     * como filtro de servidor, `due_date >= x` descartaria silenciosamente toda
     * parcela sem vencimento — e há centenas delas.
     */
    vencDe: string;
    vencAte: string;
    loading: boolean;
    error: string | null;
    onReload: () => void;
    /** Atualização de estado local em vez de recarga total (§22). */
    onRowChanged: (row: Payable) => void;
    onRowRemoved: (id: string) => void;
    notify: (message: string, type?: 'success' | 'error') => void;
    /**
     * Reporta ao pai o recorte atualmente visível (após busca/status/período),
     * para a exportação (PDF/Excel na toolbar de botões do pai) exportar
     * exatamente o que a tela mostra — não a lista inteira nem outro recorte.
     */
    onVisibleRowsChange?: (rows: Payable[]) => void;
    /**
     * Deep-link (`viewFocus` do store): id de `internal_transactions` que a tela
     * deve localizar, destacar e trazer para a viewport. `vw_payables.id` É o id
     * de `internal_transactions`, então o mesmo id que o produtor do título
     * conhece (ex: a aba Financeiro do Portal do Parceiro) serve aqui direto.
     */
    focusId?: string;
    /**
     * Resultado da busca do `focusId`, para o pai avisar o usuário:
     * `achou=false` = o título não está no recorte carregado (outra organização).
     * `limpouFiltros=true` = filtros salvos escondiam a linha e foram zerados.
     */
    onFocusConsumed?: (achou: boolean, limpouFiltros: boolean) => void;
    /** Zera o período (vencDe/vencAte/competência), que é estado do PAI, quando
     *  ele é o que esconde a linha do deep-link. */
    onClearPeriod?: () => void;
    /** Logo da organização dona do título, para o PDF do recibo. `undefined` =
     *  o serviço busca a da organização DONA do recibo (não a do topo). */
    logoDaOrg?: (organizationId: string) => string | null | undefined;
}

export default function ContasPagarParcelas({ rows, organizationId, vencDe, vencAte, loading, error, onReload, onRowChanged, onRowRemoved, notify, onVisibleRowsChange, focusId, onFocusConsumed, onClearPeriod, logoDaOrg }: Props) {
    const confirm = useConfirm();
    const [search, setSearch] = usePersistedState('contasPagarParcelas:search', '');
    const [statusFiltro, setStatusFiltro] = usePersistedState<StatusFiltro>('contasPagarParcelas:status', 'all');
    const [origemFiltro, setOrigemFiltro] = usePersistedState<OrigemFiltro>('contasPagarParcelas:origem', 'all');
    const [salvando, setSalvando] = useState<string | null>(null);
    // Baixa com painel (data + forma + recibo) — 1 título ou lote. Plano
    // docs/planos/2026-09-28-contas-a-pagar-recibo-na-baixa.md
    const [baixando, setBaixando] = useState<Payable[] | null>(null);
    const [baixaProgresso, setBaixaProgresso] = useState<string | null>(null);
    const [recibos, setRecibos] = useState<Map<string, ReciboAtivo>>(new Map());
    const [gerandoRecibo, setGerandoRecibo] = useState<string | null>(null);
    // Seleção múltipla: existe para apropriar despesa a imóvel em lote (IPTU de
    // 12 meses num clique só). Esta é a ÚNICA visão de Contas a Pagar com id de
    // `internal_transactions` — a de Notas Fiscais lê `invoices`, e passar id de
    // nota para a RPC de rateio falharia só no uso real.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);
    // Deep-link (§ efeito abaixo): linha destacada por alguns segundos + as refs
    // das <tr> para rolar até ela.
    const [highlightId, setHighlightId] = useState<string | null>(null);
    const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
    const limpouFiltrosRef = useRef(false);
    const [apropriando, setApropriando] = useState<{ organizationId: string; payables: Payable[] } | null>(null);
    // Duas dimensões DIFERENTES (ver migration 20270822000013) — carregadas uma
    // vez para resolver os UUIDs de vw_payables em nome.
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [planoContas, setPlanoContas] = useState<CostCenter[]>([]);
    // Fornecedores cadastrados — resolve o Credor pelo cadastro vivo (razão
    // social/apelido conforme Meus Fornecedores), não pelo texto congelado
    // que o produtor gravou em party_name/entity_name na hora da criação.
    const [suppliers, setSuppliers] = useState<{ id: string; name: string; nickname?: string | null }[]>([]);

    useEffect(() => {
        let ativo = true;
        Promise.all([
            financialRegistryService.listCostCenters(organizationId),
            financialRegistryService.listPlanoContas(organizationId),
            supplierService.listSuppliers(organizationId),
        ])
            .then(([cc, pc, sups]) => {
                if (!ativo) return;
                setCostCenters(cc);
                setPlanoContas(pc);
                setSuppliers(sups);
            })
            .catch(err => console.error('[ContasPagarParcelas] Erro ao carregar Centro de Custo / Plano de Contas / Fornecedores:', err));
        return () => { ativo = false; };
    }, [organizationId]);

    const costCenterNameById = useMemo(() => new Map(costCenters.map(c => [c.id, c.name])), [costCenters]);
    const planoContasNameById = useMemo(() => new Map(planoContas.map(c => [c.id, c.name])), [planoContas]);
    const supplierById = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers]);

    /** Credor pronto para exibição: cadastro vivo quando há `supplier_id`
     *  reconhecido; senão o texto congelado de sempre (`payableParty`). */
    const credorDisplay = React.useCallback((row: Payable): string => {
        const supplier = row.supplier_id ? supplierById.get(row.supplier_id) : undefined;
        if (supplier) return getSupplierDisplayName(supplier, appSettingsService.get().supplierNameDisplay);
        return payableParty(row);
    }, [supplierById]);

    /**
     * Apropriação por imóvel das linhas carregadas. `null` = migration ainda não
     * aplicada (ou RLS barrando): a coluna some inteira, em vez de mentir "—"
     * para tudo e sugerir que nada está apropriado.
     */
    const [alocacoes, setAlocacoes] = useState<Map<string, { propertyIds: string[]; names: string[] }> | null>(null);
    const idsCarregados = useMemo(() => rows.map(r => r.id).join(','), [rows]);

    // Guarda de resposta fora de ordem: trocar de organização no topo com a
    // consulta anterior em voo não pode deixar a apropriação da org velha na tela.
    const alocacoesSeq = useRef(0);
    const recarregarAlocacoes = React.useCallback(() => {
        const ids = idsCarregados ? idsCarregados.split(',') : [];
        const seq = ++alocacoesSeq.current;
        propertyExpenseService.allocationSummary(ids, organizationId)
            .then(res => { if (seq === alocacoesSeq.current) setAlocacoes(res); })
            .catch(err => {
                console.error('[ContasPagarParcelas] Erro ao carregar apropriação por imóvel:', err);
                if (seq === alocacoesSeq.current) setAlocacoes(null);
            });
    }, [idsCarregados, organizationId]);

    useEffect(() => { recarregarAlocacoes(); }, [recarregarAlocacoes]);

    /** Rótulo do imóvel: 1 alocação = o nome; N = rateio entre unidades. */
    const imovelLabel = React.useCallback((id: string): string => {
        const entry = alocacoes?.get(id);
        if (!entry || entry.propertyIds.length === 0) return '';
        if (entry.propertyIds.length === 1) return entry.names[0];
        return `Rateado · ${entry.propertyIds.length} imóveis`;
    }, [alocacoes]);

    /** Injeta os nomes resolvidos — a view só traz os UUIDs. */
    const rowsWithNames = useMemo(() => rows.map(r => ({
        ...r,
        cost_center_name: r.cost_center_id ? (costCenterNameById.get(r.cost_center_id) ?? '') : '',
        plano_de_contas_name: r.plano_de_contas_id ? (planoContasNameById.get(r.plano_de_contas_id) ?? '') : '',
        imovel_label: imovelLabel(r.id),
        credor_display: credorDisplay(r),
        recibo_numero: recibos.get(r.id)?.receipt_number ?? null,
    })), [rows, costCenterNameById, planoContasNameById, imovelLabel, credorDisplay, recibos]);

    // Recibos ativos de pagamento da organização — depois da lista, sem segurar
    // a tabela. Uma consulta só (sem ids na URL), com guarda de resposta fora de
    // ordem ao trocar de organização no topo.
    const recibosSeq = useRef(0);
    useEffect(() => {
        if (loading) return;
        const seq = ++recibosSeq.current;
        financialReceiptService.listarAtivosDaOrg(organizationId, 'PAGAMENTO')
            .then(m => { if (seq === recibosSeq.current) setRecibos(m); })
            .catch(err => console.error('[ContasPagarParcelas] Erro ao carregar recibos:', err));
    }, [organizationId, loading]);

    /* Origens realmente presentes nos dados, ordenadas pelo rótulo. Se o filtro
       persistido apontar para uma origem que sumiu do recorte atual, ele é
       mantido na lista para o <select> não cair calado numa opção inexistente
       (o usuário veria "all" no controle e a tabela filtrada). */
    const origensPresentes = useMemo(() => {
        const presentes = new Set(rows.map(r => r.source_system).filter(Boolean) as string[]);
        if (origemFiltro !== 'all') presentes.add(origemFiltro);
        return [...presentes].sort((a, b) => origemLabel(a).localeCompare(origemLabel(b), 'pt-BR'));
    }, [rows, origemFiltro]);

    const tableColumns = useTableColumns(PARCELAS_COLUMNS, 'contasPagarParcelasColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'contasPagarParcelasColWidths');
    // Largura = soma exata das colunas visíveis + checkbox fixo de 40px. NUNCA
    // w-full com table-layout:fixed (§6.1).
    const tableTotalWidth = PARCELAS_COLUMNS
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0)
        + cols.getWidth('actions') + 40;

    const filtered = useMemo(() => {
        let result = rowsWithNames.filter(r => {
            if (statusFiltro !== 'all' && r.effective_status !== statusFiltro) return false;
            if (origemFiltro !== 'all' && r.source_system !== origemFiltro) return false;
            // Parcela sem vencimento passa pelo período (mesma semântica da visão de
            // notas): esconder o que não tem data é pior do que mostrar fora do filtro.
            if (vencDe && r.due_date && r.due_date < vencDe) return false;
            if (vencAte && r.due_date && r.due_date > vencAte) return false;
            if (search) {
                const termo = search.toLowerCase();
                const hit = (r.credor_display || payableParty(r)).toLowerCase().includes(termo)
                    || (r.description ?? '').toLowerCase().includes(termo)
                    // Obra e projeto cru: quem digita o nome da obra e quem
                    // digita o do orçamento (visível no hover) acham a mesma linha.
                    || (r.obra_name ?? '').toLowerCase().includes(termo)
                    || (r.project_name ?? '').toLowerCase().includes(termo)
                    || (r.cost_center_name ?? '').toLowerCase().includes(termo)
                    || (r.plano_de_contas_name ?? '').toLowerCase().includes(termo)
                    || (r.imovel_label ?? '').toLowerCase().includes(termo);
                if (!hit) return false;
            }
            return true;
        });

        if (tableColumns.sortColumn) {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            const valor = (r: ParcelaRow): string | number => {
                switch (tableColumns.sortColumn) {
                    case 'credor':       return (r.credor_display || payableParty(r)).toLowerCase();
                    case 'descricao':    return (r.description ?? '').toLowerCase();
                    case 'origem':       return origemLabel(r.source_system).toLowerCase();
                    // Ordena pelo que a célula MOSTRA (a obra), não pelo projeto cru.
                    case 'obra':         return (r.obra_name ?? '').toLowerCase();
                    case 'valor':        return r.amount ?? 0;
                    case 'vencimento':   return r.due_date ?? '';
                    case 'status':       return r.effective_status;
                    case 'centro_custo': return (r.cost_center_name ?? '').toLowerCase();
                    case 'plano_contas': return (r.plano_de_contas_name ?? '').toLowerCase();
                    case 'imovel':       return (r.imovel_label ?? '').toLowerCase();
                    case 'recibo':       return r.recibo_numero ?? -1;
                    default:             return '';
                }
            };
            result = [...result].sort((a, b) => {
                const va = valor(a), vb = valor(b);
                if (va < vb) return -dir;
                if (va > vb) return dir;
                return 0;
            });
        }
        return result;
        // Depende de `rowsWithNames`, NÃO de `rows`: os nomes resolvidos (centro de
        // custo, plano de contas, imóvel apropriado) chegam por consulta assíncrona
        // depois das linhas. Com `rows` na lista, o memo não recalculava quando eles
        // chegavam e as colunas ficavam em branco para sempre.
    }, [rowsWithNames, search, statusFiltro, origemFiltro, vencDe, vencAte, tableColumns.sortColumn, tableColumns.sortDirection]);

    useEffect(() => { onVisibleRowsChange?.(filtered); }, [filtered, onVisibleRowsChange]);

    /*
     * Paginação da EXIBIÇÃO (§6.7). Desenhar as ~2.000 parcelas de uma vez eram
     * 83 mil nós no <tbody> e ~600 ms de tela congelada na abertura, mais ~100 ms
     * por tecla na busca (medido em produção, 28/09/2026 — ver
     * docs/planos/2026-09-28-contas-a-pagar-lento.md). A lista continua inteira
     * em memória: busca, filtros, ordenação, o total do rodapé e o export (via
     * `onVisibleRowsChange`) enxergam o recorte todo; só o <tbody> é fatiado.
     */
    const [pageSize, setPageSize] = usePersistedState<number>('contasPagarParcelas:pageSize', 100);
    const [page, setPage] = useState(1);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    // Volta para a 1 quando o RECORTE muda — não quando uma linha muda de
    // status: marcar como pago na página 3 não pode jogar o usuário na 1 (§22).
    // Linha que sai do recorte só encurta a lista; `currentPage` abaixo prende
    // a página no novo total.
    useEffect(() => { setPage(1); }, [search, statusFiltro, origemFiltro, vencDe, vencAte, tableColumns.sortColumn, tableColumns.sortDirection, pageSize, organizationId]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * pageSize;
    const pageRows = useMemo(() => filtered.slice(pageStart, pageStart + pageSize), [filtered, pageStart, pageSize]);
    function irParaPagina(p: number) {
        setPage(Math.max(1, Math.min(p, totalPages)));
        if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
    }

    /**
     * Deep-link: localizar, destacar e rolar até o título apontado por `focusId`.
     *
     * O passo que parece supérfluo e não é: `search`/`statusFiltro`/`origemFiltro`
     * (e o período, no pai) são `usePersistedState` — sobrevivem a reload e a
     * navegação. Sem zerá-los, "Ver em Contas a Pagar" cai numa tabela VAZIA por
     * causa de um filtro salvo dias antes, e nada na tela explica o porquê.
     * Só zera quando é o filtro que esconde a linha; se ela já está visível, os
     * filtros do usuário ficam de pé.
     *
     * Com a paginação, "visível" é também "na página certa": só a página atual
     * tem <tr> (e ref) para rolar até ela.
     */
    useEffect(() => {
        if (!focusId || loading) return;
        if (!rows.some(r => r.id === focusId)) { onFocusConsumed?.(false, false); return; }
        const indice = filtered.findIndex(r => r.id === focusId);
        if (indice < 0) {
            setSearch('');
            setStatusFiltro('all');
            setOrigemFiltro('all');
            onClearPeriod?.();
            limpouFiltrosRef.current = true;
            return;   // reexecuta quando `filtered` recalcular sem os filtros
        }
        // Roda DEPOIS do efeito que volta para a página 1 (declarado antes), então
        // na mesma rodada esta escolha vence — e o efeito reexecuta com a página
        // do título já renderizada.
        const paginaDoTitulo = Math.floor(indice / pageSize) + 1;
        if (paginaDoTitulo !== currentPage) { setPage(paginaDoTitulo); return; }
        setHighlightId(focusId);
        rowRefs.current.get(focusId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        onFocusConsumed?.(true, limpouFiltrosRef.current);
        limpouFiltrosRef.current = false;
        const t = setTimeout(() => setHighlightId(null), 4000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusId, loading, rows, filtered, currentPage, pageSize]);

    /** Cancelado não tem despesa a apropriar — o NOI já o ignora. Parcela PAGA
     *  entra: despesa paga é exatamente a que precisa cair no OPEX. */
    const isSelectable = (row: Payable) => row.effective_status !== 'CANCELADO';
    const selectableVisible = useMemo(() => filtered.filter(isSelectable), [filtered]);
    // Interseção da seleção com o recorte: se o filtro mudou, o que sumiu da
    // tela não pode continuar entrando na ação em lote. Linha marcada à mão
    // noutra página do MESMO recorte continua valendo — o usuário a viu.
    const selectedVisible = useMemo(
        () => selectableVisible.filter(r => selectedIds.has(r.id)),
        [selectableVisible, selectedIds],
    );
    // "Selecionar todos" do <thead> é só da página (§6.7): marcar linha que o
    // usuário não está vendo é armadilha em ação de lote.
    const selectablePage = useMemo(() => pageRows.filter(isSelectable), [pageRows]);
    const allVisibleSelected = selectablePage.length > 0 && selectablePage.every(r => selectedIds.has(r.id));
    const selectedTotal = selectedVisible.reduce((s, r) => s + (r.amount ?? 0), 0);

    /**
     * Org do lote, derivada dos PRÓPRIOS lançamentos — não da prop, que vem
     * `undefined` em "Todas as organizações" (REGRA #5: derivar da entidade
     * aberta, nunca bloquear a tela). Seleção que mistura organizações não pode
     * apropriar: o seletor de imóveis da Sheet é de uma org só.
     */
    const orgDoLote = useMemo(() => {
        const orgs = new Set(selectedVisible.map(r => r.organization_id));
        return orgs.size === 1 ? [...orgs][0] : null;
    }, [selectedVisible]);

    function toggleRow(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }
    // Seleção de intervalo com Shift+clique (ui_ux_guia_unificado.md §10.1).
    // `index` é GLOBAL em `filtered` (pageStart + i), não o da página (§6.7).
    function handleRowCheck(id: string, index: number, shiftKey: boolean) {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = filtered.slice(start, end + 1).filter(isSelectable).map(r => r.id);
            setSelectedIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            toggleRow(id);
            setLastCheckedIndex(index);
        }
    }
    function toggleAllVisible() {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) selectablePage.forEach(r => next.delete(r.id));
            else selectablePage.forEach(r => next.add(r.id));
            return next;
        });
    }
    const clearSelection = () => { setSelectedIds(new Set()); setLastCheckedIndex(null); };

    // checkbox + colunas visíveis + espaçador + ações
    const totalColunas = PARCELAS_COLUMNS.filter(c => tableColumns.visibleColumns.includes(c.key)).length + 3;

    const totalAberto = filtered
        .filter(r => !['PAGO', 'CANCELADO'].includes(r.effective_status))
        .reduce((s, r) => s + (r.amount ?? 0), 0);

    async function marcarStatus(row: Payable, novo: PayableBusinessStatus) {
        setSalvando(row.id);
        try {
            await payableService.updateStatus(row.id, novo);
            /* §22 — o estado local tem que refletir o que o service GRAVOU, não
               o que a ação se chama. `updateStatus` também zera `status` e
               `payment_date` ao voltar para um estado aberto; sem espelhar isso
               aqui a linha continuaria com `status='CONCILIATED'` em memória e a
               tela mostraria "Quitado" até o próximo reload. */
            const aberto = novo !== 'PAGO' && novo !== 'CANCELADO'
                && novo !== 'PARCIAL' && novo !== 'RENEGOCIADO';
            onRowChanged({
                ...row,
                business_status: novo,
                effective_status: novo,
                status: novo === 'PAGO' ? 'CONCILIATED'
                    : novo === 'CANCELADO' ? 'CANCELLED'
                    : aberto ? 'PENDING' : row.status,
                ...(aberto ? { payment_date: null } : {}),
            });
            // O banco cancela o recibo pela trigger; aqui só some da coluna.
            if (aberto) setRecibos(prev => { const m = new Map(prev); m.delete(row.id); return m; });
            notify(novo === 'PAGO' ? 'Parcela marcada como paga.'
                : aberto ? 'Baixa estornada.'
                : 'Status atualizado.');
        } catch (e: unknown) {
            notify('Erro: ' + ((e as Error).message ?? 'Falha ao atualizar status'), 'error');
        } finally {
            setSalvando(null);
        }
    }

    /**
     * Estorna a baixa: título volta a Previsto. Confirma antes (§14) porque é
     * reversão financeira e tem efeito colateral fora desta tela — para título
     * vindo de boleto, a trigger `trg_sync_boleto_baixa` devolve o boleto a
     * "Aprovado" e a nota fiscal a "Aprovada".
     *
     * Até 15/08/2026 não existia caminho para isso: a linha paga mostrava só o
     * rótulo "Quitado". Dava para marcar como pago e não para desmarcar.
     */
    async function estornar(row: Payable) {
        const deBoleto = row.source_system === 'BOLETO';
        const ok = await confirm({
            title: 'Estornar a baixa deste título?',
            message: 'O título volta para Previsto e a data de pagamento é apagada.'
                + (deBoleto ? ' Como veio de um boleto, o boleto volta para "Aprovado" e a nota fiscal para "Aprovada".' : ''),
            variant: 'warning',
            confirmLabel: 'Estornar',
        });
        if (!ok) return;
        await marcarStatus(row, 'PREVISTO');
    }

    /** Credor como o painel e o toast mostram (cadastro vivo, senão o texto). */
    const nomeDoCredor = (row: Payable) => credorDisplay(row) || row.description || row.id;

    /**
     * Baixa (1 título ou lote) com os dados do painel e, se pedido, um recibo
     * por título para o credor assinar. Sequencial, como em Contas a Receber:
     * cada recibo é um download e a numeração sai na ordem da lista. Falha de
     * recibo não desfaz a baixa — o botão Recibo da linha emite depois.
     */
    async function confirmarBaixa(dados: DadosDaBaixa) {
        const alvos = baixando ?? [];
        let baixados = 0;
        const falhasBaixa: string[] = [];
        const falhasRecibo: string[] = [];
        let emitidos = 0;
        let naoGuardados = 0;

        for (const [i, row] of alvos.entries()) {
            setBaixaProgresso(alvos.length > 1 ? `Baixando ${i + 1} de ${alvos.length}…` : null);
            try {
                await payableService.darBaixa(row.id, { paymentDate: dados.paymentDate, paymentType: dados.paymentType });
                baixados++;
                onRowChanged({
                    ...row,
                    business_status: 'PAGO',
                    effective_status: 'PAGO',
                    status: 'CONCILIATED',
                });
            } catch {
                falhasBaixa.push(nomeDoCredor(row));
                continue;
            }
            if (!dados.emitirRecibo || semReciboPorOrigem(row)) continue;
            try {
                const { recibo, guardado } = await financialReceiptService.baixarPdf(row.id, {
                    kind: 'PAGAMENTO',
                    logoUrl: logoDaOrg?.(row.organization_id),
                });
                setRecibos(prev => new Map(prev).set(row.id, recibo));
                emitidos++;
                if (!guardado) naoGuardados++;
            } catch (e) {
                console.error('[ContasPagarParcelas] Recibo não gerado:', e);
                falhasRecibo.push(nomeDoCredor(row));
            }
        }

        setBaixaProgresso(null);
        setBaixando(null);
        if (alvos.length > 1) clearSelection();
        const { texto, erro } = mensagemResultadoBaixa({
            baixados, falhasBaixa, emitirRecibo: dados.emitirRecibo,
            recibos: emitidos, falhasRecibo, naoGuardados,
        });
        notify(texto, erro ? 'error' : 'success');
    }

    /** Emite (título pago antes do recibo existir) ou reimprime o mesmo PDF. */
    async function handleRecibo(row: Payable) {
        setGerandoRecibo(row.id);
        try {
            const { recibo, guardado } = await financialReceiptService.baixarPdf(row.id, {
                kind: 'PAGAMENTO',
                logoUrl: logoDaOrg?.(row.organization_id),
            });
            setRecibos(prev => new Map(prev).set(row.id, recibo));
            if (!guardado) notify('O PDF foi baixado, mas não ficou guardado. Reimprima para guardar.', 'error');
        } catch (e: unknown) {
            notify('Erro ao gerar o recibo: ' + ((e as Error).message ?? 'falha desconhecida'), 'error');
        } finally {
            setGerandoRecibo(null);
        }
    }

    /** Célula da coluna Recibo: "Nº 000001" baixa o PDF guardado; "Emitir" no
     *  pago sem recibo; "—" em aberto e em Folha (sem credor único). */
    function renderReciboCell(row: ParcelaRow): React.ReactNode {
        if (row.effective_status !== 'PAGO' || semReciboPorOrigem(row)) {
            return <span className="text-sm font-normal text-gray-400">—</span>;
        }
        const ocupado = gerandoRecibo === row.id;
        const rotulo = row.recibo_numero != null ? `Nº ${numeroRecibo(row.recibo_numero)}` : 'Emitir';
        return (
            <button
                onClick={() => handleRecibo(row)}
                disabled={ocupado}
                title={row.recibo_numero != null ? 'Baixar o recibo guardado' : 'Emitir o recibo para o credor assinar'}
                className="flex items-center gap-1.5 text-sm font-normal text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
                {ocupado
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : row.recibo_numero != null ? <Download className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
                {rotulo}
            </button>
        );
    }

    // Títulos em aberto da seleção — os que a baixa em lote alcança.
    const selecionadasEmAberto = selectedVisible.filter(r => !['PAGO', 'CANCELADO'].includes(r.effective_status));

    /** Props do painel para os títulos em baixa: rótulos de Pagar, credor como
     *  contraparte, recibo desmarcado em lote só de boleto e ausente em Folha. */
    const titulosDaBaixa: TituloDaBaixa[] | null = baixando?.map(r => ({
        id: r.id,
        contraparte: credorDisplay(r) || null,
        descricao: r.description ?? null,
        vencimento: r.due_date ?? null,
        valor: Number(r.amount) || 0,
    })) ?? null;
    const baixaSoFolha = !!baixando?.length && baixando.every(semReciboPorOrigem);
    const baixaComFolha = !!baixando?.some(semReciboPorOrigem);
    const baixaSoBoleto = !!baixando?.length && baixando.every(r => r.source_system === 'BOLETO');

    async function excluir(row: Payable) {
        const ok = await confirm({
            title: 'Excluir título?',
            message: 'Essa ação não pode ser desfeita.',
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await payableService.remove(row.id);
            onRowRemoved(row.id);
            notify('Título excluído.');
        } catch (e: unknown) {
            notify('Erro: ' + ((e as Error).message ?? 'Falha ao excluir'), 'error');
        }
    }

    return (
        <>
        {/* Toolbar acoplada à tabela (§5.2) — toolbar e conteúdo dividem um único
            card; border/rounded/shadow só no container pai. */}
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-2 border-b border-gray-100 bg-white space-y-3">
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar credor, descrição ou obra..."
                            className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filtro rápido de status em controle segmentado (§5.2) */}
                    <div className="flex items-center h-9 bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        {STATUS_FILTROS.map(s => {
                            const activeColor = s === 'VENCIDO' ? 'text-red-600'
                                : s === 'PAGO' ? 'text-emerald-600'
                                : s === 'PREVISTO' ? 'text-amber-600'
                                : s === 'AGUARDANDO_APROVACAO' ? 'text-orange-600'
                                : 'text-gray-900';
                            return (
                                <button
                                    key={s}
                                    onClick={() => setStatusFiltro(s)}
                                    className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${statusFiltro === s ? `bg-white shadow-sm ${activeColor}` : 'text-gray-700 hover:text-gray-900'}`}
                                >
                                    {/* "Aguardando aprovação" por extenso estoura o trilho
                                        segmentado; a coluna Status da tabela mostra o rótulo
                                        completo (STATUS_PT). */}
                                    {s === 'all' ? 'Todos' : s === 'AGUARDANDO_APROVACAO' ? 'Aguardando' : STATUS_PT[s]}
                                </button>
                            );
                        })}
                    </div>

                    {/* Origem — filtro de FONTE do título (Pedido de compra, Contrato,
                        Boleto, Folha, NF-e…), não escopo (§5.3): não muda "quais títulos
                        devo?", só recorta de onde vieram. Dropdown, não segmentado — as
                        opções não cabem como pílulas sem quebrar linha, e a lista é
                        derivada dos dados, então o tamanho varia por organização. */}
                    <div className="relative flex items-center shrink-0">
                        <Tag className="absolute left-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <select
                            value={origemFiltro}
                            onChange={e => setOrigemFiltro(e.target.value as OrigemFiltro)}
                            className="h-9 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none"
                        >
                            <option value="all">Todas as origens</option>
                            {origensPresentes.map(o => (
                                <option key={o} value={o}>{origemLabel(o)}</option>
                            ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none absolute right-2.5" />
                    </div>

                    <button
                        onClick={onReload}
                        className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 shrink-0"
                        title="Recarregar"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    {/* Separador entre grupo "filtrar" e grupo "visualizar" (§5.1) */}
                    <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                            columns={PARCELAS_COLUMNS}
                            visibleColumns={tableColumns.visibleColumns}
                            showColumnConfig={tableColumns.showColumnConfig}
                            onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                            onToggleColumn={tableColumns.toggleColumn}
                            onReset={tableColumns.resetColumns}
                        />
                        {/* Autofit sob comando explícito, nunca automático (§6.1.2) */}
                        <button
                            onClick={() => cols.autoFit()}
                            className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                            title="Ajustar largura das colunas ao conteúdo"
                        >
                            <MoveHorizontal className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div>
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-red-500">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm">{error}</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma parcela encontrada</h3>
                        <p className="text-sm text-gray-500">
                            Parcelas aparecem aqui quando um pedido é recebido ou um contrato de suprimentos é parcelado.
                        </p>
                    </div>
                ) : (
                    <>
                    {/* §6.5 — lista longa: container rola em altura própria, thead fixo */}
                    <div ref={tableScrollRef} className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {/* checkbox — largura fixa, fora do redimensionamento. O comentário
                                    fica ACIMA do <col>: na mesma linha ele vira nó de texto dentro
                                    do <colgroup> e o React reclama. */}
                                <col style={{ width: '40px' }} />
                                {tableColumns.orderedVisibleColumns.map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador ANTES de "Ações" (§6.1.1): absorve a folga no meio,
                                    para a borda de "Ações" não andar a cada redimensionamento. */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            {/* thead sentence case (§6.2) — uppercase={false} porque SortableHeader
                                força uppercase internamente por padrão. */}
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                                            checked={allVisibleSelected}
                                            disabled={selectablePage.length === 0}
                                            onChange={toggleAllVisible}
                                            title="Selecionar todas as parcelas desta página"
                                        />
                                    </th>
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = PARCELAS_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader
                                                key={key}
                                                label={def.label}
                                                colKey={key}
                                                sortable={def.sortable !== false}
                                                uppercase={false}
                                                sortColumn={tableColumns.sortColumn}
                                                sortDirection={tableColumns.sortDirection}
                                                onSort={tableColumns.handleColumnSort}
                                                onMoveColumn={tableColumns.moveColumn}
                                                className={def.className}
                                            >
                                                <cols.ResizeHandle colKey={key} />
                                            </SortableHeader>
                                        );
                                    })}
                                    {/* espaçador — casa com o <col /> sem largura, na mesma ordem */}
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                    <th className="text-right px-6 py-2 relative overflow-hidden text-sm font-semibold text-gray-500">
                                        Ações
                                        <cols.ResizeHandle colKey="actions" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {pageRows.map((row, idxNaPagina) => {
                                    const idx = pageStart + idxNaPagina;
                                    const vencido = row.effective_status === 'VENCIDO';
                                    const quitado = ['PAGO', 'CANCELADO'].includes(row.effective_status);
                                    const selecionada = selectedIds.has(row.id);
                                    return (
                                        <tr
                                            key={row.id}
                                            ref={el => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); }}
                                            className={`hover:bg-blue-50/50 transition-colors ${
                                                row.id === highlightId
                                                    ? 'bg-amber-50 ring-2 ring-inset ring-amber-300'
                                                    : selecionada ? 'bg-blue-50/60' : vencido ? 'bg-red-50/30' : ''
                                            }`}
                                        >
                                            <td className="w-10 px-4 py-2.5 border-r border-gray-100 text-center">
                                                {isSelectable(row) && (
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        checked={selecionada}
                                                        title="Dica: segure Shift e clique para selecionar um intervalo"
                                                        onChange={e => handleRowCheck(row.id, idx, (e.nativeEvent as MouseEvent).shiftKey)}
                                                    />
                                                )}
                                            </td>
                                            {tableColumns.orderedVisibleColumns.map(key => (
                                                <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                    {key === 'recibo' ? renderReciboCell(row) : renderParcelaCell(key, row, alocacoes)}
                                                </td>
                                            ))}
                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            <td className="px-6 py-2.5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {!quitado && (
                                                        <button
                                                            onClick={() => setBaixando([row])}
                                                            disabled={salvando === row.id}
                                                            className="text-green-700 hover:text-green-800 text-sm font-medium p-1.5 hover:bg-green-50 rounded-[6px] transition-all disabled:opacity-50 flex items-center gap-1"
                                                            title="Dar baixa: data, forma de pagamento e recibo"
                                                        >
                                                            {salvando === row.id
                                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                : <Check className="w-3.5 h-3.5" />}
                                                            Pago
                                                        </button>
                                                    )}
                                                    {row.effective_status === 'PAGO' && (
                                                        <>
                                                            <span className="flex items-center gap-1 text-sm font-normal text-green-700">
                                                                <Check className="w-4 h-4" /> Quitado
                                                            </span>
                                                            {/* O caminho de volta. Sem ele, "Pago" era mão única. */}
                                                            {!semReciboPorOrigem(row) && (
                                                                <ActionIconButton
                                                                    kind="settings"
                                                                    title={row.recibo_numero != null
                                                                        ? `Reimprimir recibo Nº ${numeroRecibo(row.recibo_numero)}`
                                                                        : 'Emitir recibo'}
                                                                    icon={<Receipt className="w-4 h-4" />}
                                                                    disabled={gerandoRecibo === row.id}
                                                                    onClick={() => handleRecibo(row)}
                                                                />
                                                            )}
                                                            <ActionIconButton
                                                                kind="settings"
                                                                title="Estornar baixa"
                                                                icon={<Undo2 className="w-4 h-4" />}
                                                                disabled={salvando === row.id}
                                                                onClick={() => estornar(row)}
                                                            />
                                                        </>
                                                    )}
                                                    {/* Apropriar a imóvel — a mesma Sheet do lote, com um
                                                        lançamento só. Cancelada não tem o que apropriar. */}
                                                    {isSelectable(row) && (
                                                        <ActionIconButton
                                                            kind="settings"
                                                            title="Apropriar a imóvel"
                                                            icon={<Building2 className="w-4 h-4" />}
                                                            onClick={() => setApropriando({ organizationId: row.organization_id, payables: [row] })}
                                                        />
                                                    )}
                                                    {/* Só título manual é excluível aqui: parcela de Pedido ou
                                                        Contrato é espelho da origem (payableService.remove). */}
                                                    {row.source_system === 'MANUAL' && (
                                                        <ActionIconButton kind="delete" onClick={() => excluir(row)} />
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                {/* Célula única: alinhar o total à coluna "Valor" com colSpan
                                    quebra assim que o usuário esconde uma coluna (§6 config). */}
                                <tr className="bg-gray-50 border-t border-gray-200">
                                    <td colSpan={totalColunas} className="px-6 py-2">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-sm text-gray-500">
                                                {filtered.length} parcela{filtered.length !== 1 ? 's' : ''}
                                            </span>
                                            <span className="text-sm text-gray-400">
                                                total em aberto (filtrado){' '}
                                                <span className="text-sm font-medium text-gray-900">{formatMoney(totalAberto)}</span>
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {/* Rodapé de paginação §6.7 — mesmo desenho do Extrato e do
                        StandardTable. Fora do container que rola: fica sempre à vista. */}
                    <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-gray-100 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                            <span>{`${pageStart + 1}–${Math.min(pageStart + pageSize, filtered.length)} de ${filtered.length.toLocaleString('pt-BR')}`}</span>
                            <select
                                value={pageSize}
                                onChange={e => setPageSize(Number(e.target.value))}
                                className="h-8 px-2 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600"
                                title="Linhas por página"
                            >
                                {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n} por página</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => irParaPagina(currentPage - 1)}
                                disabled={currentPage <= 1}
                                title={currentPage <= 1 ? 'Já está na primeira página' : undefined}
                                className="h-8 px-3 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                Anterior
                            </button>
                            <span>Página {currentPage} de {totalPages}</span>
                            <button
                                onClick={() => irParaPagina(currentPage + 1)}
                                disabled={currentPage >= totalPages}
                                title={currentPage >= totalPages ? 'Já está na última página' : undefined}
                                className="h-8 px-3 rounded-[6px] border border-gray-200 bg-white text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                Próxima
                            </button>
                        </div>
                    </div>
                    </>
                )}
            </div>
        </div>

        {/* Barra de ações em lote — fixa no rodapé, paleta azul (§10) */}
        {selectedVisible.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-[10px] shadow-lg shadow-blue-900/20">
                <span className="flex-1 text-sm font-bold whitespace-nowrap">
                    {selectedVisible.length} selecionada{selectedVisible.length !== 1 ? 's' : ''}
                    <span className="ml-2 font-normal opacity-75">· {formatMoney(selectedTotal)}</span>
                </span>
                <button
                    onClick={() => setBaixando(selecionadasEmAberto)}
                    disabled={selecionadasEmAberto.length === 0}
                    title={selecionadasEmAberto.length
                        ? 'Dar baixa nas parcelas em aberto da seleção (data, forma e recibo)'
                        : 'Todas as parcelas selecionadas já estão pagas ou canceladas.'}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-700 rounded-[6px] text-[13px] font-medium hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                    <Check className="w-3.5 h-3.5" />
                    Dar baixa{selecionadasEmAberto.length && selecionadasEmAberto.length !== selectedVisible.length ? ` (${selecionadasEmAberto.length})` : ''}
                </button>
                <button
                    onClick={() => orgDoLote && setApropriando({ organizationId: orgDoLote, payables: selectedVisible })}
                    disabled={!orgDoLote}
                    title={orgDoLote
                        ? 'Apropriar as parcelas selecionadas a um imóvel'
                        : 'A seleção mistura organizações. Filtre por uma organização para apropriar.'}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-700 rounded-[6px] text-[13px] font-medium hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                    <Building2 className="w-3.5 h-3.5" />
                    Apropriar a imóvel
                </button>
                <button
                    onClick={clearSelection}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-500 rounded-[6px] text-[13px] font-medium hover:bg-blue-400 transition-all active:scale-95"
                >
                    <X className="w-3.5 h-3.5" />
                    Desmarcar
                </button>
            </div>
        )}

        <BaixaRecebivelSheet
            tipo="pagar"
            titulos={titulosDaBaixa}
            emitirReciboPadrao={!baixaSoBoleto}
            reciboIndisponivel={baixaSoFolha
                ? 'Título de folha reúne vários colaboradores: não há um credor único para assinar o recibo.'
                : null}
            avisoRecibo={baixaComFolha && !baixaSoFolha ? 'Os títulos de folha do lote não recebem recibo.' : null}
            onClose={() => setBaixando(null)}
            onConfirm={confirmarBaixa}
            progresso={baixaProgresso}
        />

        {apropriando && (
            <ApropriarImovelSheet
                organizationId={apropriando.organizationId}
                payables={apropriando.payables.map(p => ({ id: p.id, amount: p.amount, description: p.description }))}
                onClose={() => setApropriando(null)}
                onDone={message => {
                    setApropriando(null);
                    clearSelection();
                    // Recarrega só o resumo da apropriação, não a lista inteira (§22).
                    recarregarAlocacoes();
                    notify(message);
                }}
            />
        )}
        </>
    );
}
