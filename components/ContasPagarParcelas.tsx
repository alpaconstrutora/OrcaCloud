import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, Building2, Check, ChevronDown, ChevronRight, Download, ExternalLink, FileText, Filter, Landmark, Loader2, MoveHorizontal, Paperclip, Plus, Receipt, RefreshCw, Search, Tag, Undo2, X,
} from 'lucide-react';
import type { Payable, PayableBusinessStatus, CostCenter } from '../types/financial';
import { payableService, payableParty, STATUS_ASAAS_TRAVA_TITULO } from '../services/payableService';
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
import { agruparLinhas, chavePorMes, chavePorNome, chavePorRotulo, contarLinhasDaTela, entradasDaPagina, linhasDaTela, type ChaveDeGrupo } from '../utils/agruparLinhas';
import { useAgrupamento } from '../hooks/useAgrupamento';
import PagarPixSheet from './financeiro/PagarPixSheet';
import HistoricoPagamentoAsaasSheet from './financeiro/HistoricoPagamentoAsaasSheet';
import PagarBoletoAsaasModal from './PagarBoletoAsaasModal';
import { asaasContaService } from '../services/asaasContaService';
import { supplierPaymentService, type SupplierPayment } from '../services/supplierPaymentService';
import { AgruparControles, LinhaDeGrupo } from './ui/Agrupamento';
import { idsComAlcadaPendente, MOTIVO_ALCADA_PENDENTE } from '../services/alcadaDaBaixa';
import { darfService } from '../services/darfService';
import { competenciaBR, linhaContemId } from '../utils/darf';
import { hojeLocal } from '../utils/baixaRecebivel';
import { useStore } from '../store/useStore';

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
    // Título gerado à mão — "Novo pagamento avulso" (plano 2026-10-17); a
    // conciliação também cria MANUAL ao lançar uma saída sem título.
    MANUAL: 'Avulso',
    // Guia que agrupa tributos (Tributos a Pagar › DARFs, 21/10/2026): os
    // tributos do DARF saem da lista e entram como UMA linha (`colapsarDarfs`).
    DARF: 'DARF',
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
    /* Tributo que o cliente recolhe na fonte (Tributos a Pagar › negociação):
       o dinheiro não sai da nossa conta, então não há o que pagar aqui. */
    RETIDO: 'Retido pelo cliente',
    CANCELADO: 'Cancelado',
};

/** Situações em que não há pagamento a fazer: já pago, cancelado ou retido pelo cliente. */
const SEM_PAGAMENTO_A_FAZER = ['PAGO', 'CANCELADO', 'RETIDO'];

const STATUS_COLORS: Record<string, string> = {
    PAGO: 'text-green-700',
    APROVADO: 'text-blue-700',
    AGUARDANDO_APROVACAO: 'text-orange-700',
    BLOQUEADO: 'text-red-700',
    PREVISTO: 'text-yellow-700',
    VENCIDO: 'text-red-600',
    PARCIAL: 'text-amber-700',
    RENEGOCIADO: 'text-indigo-700',
    RETIDO: 'text-gray-600',
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
    centro_custo: 180, plano_contas: 180, imovel: 190, actions: 250,
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

/** Folha reúne vários colaboradores num título: não há um credor para assinar.
 *  DARF é pago à Receita: o comprovante é a própria guia paga (anexo do DARF). */
const semReciboPorOrigem = (row: Pick<Payable, 'source_system'>) => row.source_system === 'LABOR' || row.source_system === 'DARF';

const MOTIVO_SEM_RECIBO_DARF = 'DARF não tem recibo de credor: o comprovante é a guia paga (anexe o PDF no DARF).';
const MOTIVO_ESTORNO_DARF_CONCILIADO = 'Conciliado com o extrato — desfaça a conciliação em Conciliação Bancária.';

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
            // DARF: o valor comum aos tributos; "Vários" quando divergem.
            if (row.darf && !row.cost_center_id && row.darf.componentes.some(c => c.cost_center_id)) {
                return <span className="text-sm font-normal text-gray-700" title="Os tributos do DARF têm centros de custo diferentes — veja a composição">Vários</span>;
            }
            return <span className="block truncate text-sm font-normal text-gray-700" title={row.cost_center_name || undefined}>{row.cost_center_name || '—'}</span>;
        case 'plano_contas':
            if (row.darf && !row.plano_de_contas_id && row.darf.componentes.some(c => c.plano_de_contas_id)) {
                return <span className="text-sm font-normal text-gray-700" title="Os tributos do DARF têm planos de contas diferentes — veja a composição">Vários</span>;
            }
            return <span className="block truncate text-sm font-normal text-gray-700" title={row.plano_de_contas_name || undefined}>{row.plano_de_contas_name || '—'}</span>;
        case 'imovel':
            // DARF não se apropria a imóvel (é guia de tributos, não despesa do imóvel).
            if (row.darf) return <span className="text-sm font-normal text-gray-400">—</span>;
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
    /** Ano ('YYYY') e mês ('MM') do vencimento — independentes entre si; '' = sem filtro.
     *  Diferente do período, parcela SEM vencimento não passa quando um deles está ativo. */
    vencAno: string;
    vencMes: string;
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
    /** Abre o painel de edição do pagamento avulso (linha MANUAL em aberto). */
    onEditarAvulso?: (row: Payable) => void;
    /** "Novo pagamento avulso" no estado vazio — o mesmo botão da barra do pai. */
    onNovoAvulso?: () => void;
    /** Baixa/estorno do DARF mudam os MEMBROS (a linha DARF é derivada deles): §22. */
    onComponentesChanged?: (ids: string[], patch: Partial<Payable>) => void;
}

/** Por que a linha avulsa não pode ser editada — `null` quando pode. */
/** Pagamento pela Asaas em andamento ou concluído trava editar e excluir o título:
 *  o PIX/boleto saiu com o valor e o favorecido de antes. O banco também recusa a
 *  exclusão (aplicar_20271018420000). */
function motivoTravaAsaas(sp: SupplierPayment | undefined, acao: 'editar' | 'excluir'): string | null {
    if (!sp || !STATUS_ASAAS_TRAVA_TITULO.includes(sp.status)) return null;
    return sp.status === 'DONE'
        ? `Pago pela Asaas: não dá para ${acao}.`
        : `Pagamento pela Asaas em andamento: cancele o pagamento antes de ${acao}.`;
}

function motivoNaoEditar(row: Payable, sp?: SupplierPayment): string | null {
    if (row.effective_status === 'PAGO') return 'Título pago: estorne a baixa para editar.';
    if (row.effective_status === 'CANCELADO') return 'Título cancelado não se edita.';
    return motivoTravaAsaas(sp, 'editar');
}

// "Agrupar" — guia de UI §6.12. Chave = o MESMO texto que a coluna mostra.
type CampoAgrupar = 'credor' | 'origem' | 'obra' | 'centro_custo' | 'plano_contas' | 'imovel' | 'vencimento' | 'status';
const OPCOES_AGRUPAR: { value: CampoAgrupar; label: string }[] = [
    { value: 'credor', label: 'Credor' },
    { value: 'origem', label: 'Origem' },
    { value: 'obra', label: 'Obra' },
    { value: 'centro_custo', label: 'Centro de Custo' },
    { value: 'plano_contas', label: 'Plano de Contas' },
    { value: 'imovel', label: 'Imóvel' },
    { value: 'vencimento', label: 'Vencimento (mês)' },
    { value: 'status', label: 'Status' },
];
const SEM_GRUPO: Record<CampoAgrupar, string> = {
    credor: 'Sem credor', origem: 'Sem origem', obra: 'Sem obra', centro_custo: 'Sem centro de custo',
    plano_contas: 'Sem plano de contas', imovel: 'Sem imóvel', vencimento: 'Sem vencimento', status: 'Sem status',
};
function chaveDoGrupo(campo: CampoAgrupar, r: ParcelaRow): ChaveDeGrupo {
    switch (campo) {
        case 'credor': {
            // `payableParty` devolve "—" quando não há credor: isso é ausência, não um nome.
            const credor = r.credor_display || payableParty(r);
            return chavePorNome(credor === '—' ? null : credor);
        }
        case 'origem': return chavePorNome(origemLabel(r.source_system));
        case 'obra': return chavePorNome(r.obra_name);
        case 'centro_custo': return chavePorNome(r.cost_center_name);
        case 'plano_contas': return chavePorNome(r.plano_de_contas_name);
        case 'imovel': return chavePorNome(r.imovel_label);
        case 'vencimento': return chavePorMes(r.due_date);
        case 'status': return chavePorRotulo(r.effective_status, STATUS_PT);
    }
}

export default function ContasPagarParcelas({ rows, organizationId, vencDe, vencAte, vencAno, vencMes, loading, error, onReload, onRowChanged, onRowRemoved, notify, onVisibleRowsChange, focusId, onFocusConsumed, onClearPeriod, logoDaOrg, onEditarAvulso, onNovoAvulso, onComponentesChanged }: Props) {
    const confirm = useConfirm();
    const navigateToFocus = useStore(s => s.navigateToFocus);
    // Linhas DARF com a composição aberta (chevron "Ver composição").
    const [darfsAbertos, setDarfsAbertos] = useState<Set<string>>(new Set());
    const alternarDarf = (id: string) => setDarfsAbertos(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });
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
    const zerarAncora = useCallback(() => setLastCheckedIndex(null), []);
    const agrupamento = useAgrupamento<CampoAgrupar>('contasPagarParcelas:groupBy', zerarAncora);
    const { campo: groupBy, agrupando, recolhidos } = agrupamento;
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
    // A linha DARF é sintética (id do DARF, não de internal_transactions): fica fora.
    const idsCarregados = useMemo(() => rows.filter(r => !r.darf).map(r => r.id).join(','), [rows]);

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

    // Títulos pendentes na alçada (17/10/2026, item H.1): a baixa manual deles é
    // recusada no serviço; aqui o botão desliga e diz por quê. Mesma régua dos
    // recibos — depois da lista, com guarda de resposta fora de ordem.
    const [alcadaPendente, setAlcadaPendente] = useState<Set<string>>(new Set());
    const alcadaSeq = useRef(0);
    useEffect(() => {
        if (loading) return;
        const seq = ++alcadaSeq.current;
        idsComAlcadaPendente(organizationId ?? null)
            .then(ids => { if (seq === alcadaSeq.current) setAlcadaPendente(ids); })
            .catch(err => console.error('[ContasPagarParcelas] Erro ao conferir a alçada:', err));
    }, [organizationId, loading]);

    // ─── Pagar pela Asaas (Fase 3 — docs/planos/2026-10-16-asaas-pendencias-e-pix.md)
    // A ação só aparece nas linhas cuja organização tem conta Asaas ativa
    // (`fn_conta_asaas_da_org`); o portão de verdade (papel, alçada, tetos,
    // piloto, competência) é do servidor e aparece no drawer com o motivo.
    const [pagandoAsaas, setPagandoAsaas] = useState<Payable | null>(null);
    const [orgsComAsaas, setOrgsComAsaas] = useState<Set<string>>(new Set());
    const [pagamentosAsaas, setPagamentosAsaas] = useState<Record<string, SupplierPayment>>({});
    const orgsDasLinhas = useMemo(() => [...new Set(rows.map(r => r.organization_id))].sort().join(','), [rows]);
    useEffect(() => {
        let vivo = true;
        const orgs = orgsDasLinhas ? orgsDasLinhas.split(',') : [];
        Promise.all(orgs.map(o => asaasContaService.contaDaOrg(o).then(id => (id ? o : null)).catch(() => null)))
            .then(l => { if (vivo) setOrgsComAsaas(new Set(l.filter((o): o is string => !!o))); });
        return () => { vivo = false; };
    }, [orgsDasLinhas]);
    const pagamentosSeq = useRef(0);
    const recarregarPagamentosAsaas = React.useCallback(() => {
        if (orgsComAsaas.size === 0) { setPagamentosAsaas({}); return; }
        const ids = rows.filter(r => !r.darf && orgsComAsaas.has(r.organization_id)).map(r => r.id);
        const seq = ++pagamentosSeq.current;
        supplierPaymentService.byTransactions(ids)
            .then(m => { if (seq === pagamentosSeq.current) setPagamentosAsaas(m); })
            .catch(err => console.error('[ContasPagarParcelas] Erro ao carregar pagamentos Asaas:', err));
    }, [rows, orgsComAsaas]);
    useEffect(() => { recarregarPagamentosAsaas(); }, [recarregarPagamentosAsaas]);

    const [cancelandoAsaas, setCancelandoAsaas] = useState<string | null>(null);
    const [historicoAsaas, setHistoricoAsaas] = useState<Payable | null>(null);
    const cancelarPagamentoAsaas = async (row: Payable, sp: SupplierPayment) => {
        const agendado = sp.status === 'SCHEDULED';
        const ok = await confirm({
            title: agendado ? 'Cancelar o pagamento agendado?' : 'Cancelar o pagamento enviado?',
            message: `${sp.payment_type === 'BILL' ? 'Boleto' : 'PIX'} de ${formatMoney(sp.value)}`
                + `${sp.beneficiary_name ? ` para ${sp.beneficiary_name}` : ''}`
                + `${agendado && sp.scheduled_date ? `, agendado para ${formatDateBR(sp.scheduled_date)}` : ''}. `
                + 'A Asaas só cancela o que ainda não foi concluído; o título continua em aberto para pagar de novo.',
            variant: 'danger',
            confirmLabel: 'Cancelar pagamento',
        });
        if (!ok) return;
        setCancelandoAsaas(sp.id);
        try {
            await supplierPaymentService.cancel(row.organization_id, sp.id);
            notify('Pagamento cancelado na Asaas. O título continua em aberto.');
        } catch (e) {
            notify('Não foi possível cancelar: ' + ((e as Error).message ?? 'erro desconhecido'), 'error');
        } finally {
            setCancelandoAsaas(null);
            recarregarPagamentosAsaas();
        }
    };

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
            if (vencAno && (r.due_date ?? '').slice(0, 4) !== vencAno) return false;
            if (vencMes && (r.due_date ?? '').slice(5, 7) !== vencMes) return false;
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
                    || (r.imovel_label ?? '').toLowerCase().includes(termo)
                    // DARF: "PIS" ou o nº do documento acham a linha da guia.
                    || (r.darf?.busca ?? '').toLowerCase().includes(termo);
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
    }, [rowsWithNames, search, statusFiltro, origemFiltro, vencDe, vencAte, vencAno, vencMes, tableColumns.sortColumn, tableColumns.sortDirection]);

    useEffect(() => { onVisibleRowsChange?.(filtered); }, [filtered, onVisibleRowsChange]);

    const grupos = useMemo(() => (groupBy === 'none' ? [] : agruparLinhas(filtered, {
        chave: r => chaveDoGrupo(groupBy, r),
        semRotulo: SEM_GRUPO[groupBy],
        valor: r => r.amount,
        ordem: groupBy === 'status' ? Object.keys(STATUS_PT) : groupBy === 'vencimento' ? 'chave' : 'aparicao',
    })), [filtered, groupBy]);
    /** Linhas na ordem da tela, sem os grupos recolhidos — base da página, do Shift+clique e do deep-link. */
    const linhasNaTela = useMemo(() => (agrupando ? linhasDaTela(grupos, recolhidos) : filtered), [agrupando, grupos, recolhidos, filtered]);
    const totalLinhas = agrupando ? contarLinhasDaTela(grupos, recolhidos) : filtered.length;

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
    // Trocar o agrupamento reordena tudo: também volta para a 1. Recolher um grupo
    // não — só encurta a lista, e `currentPage` prende a página no novo total.
    useEffect(() => { setPage(1); }, [search, statusFiltro, origemFiltro, vencDe, vencAte, vencAno, vencMes, tableColumns.sortColumn, tableColumns.sortDirection, pageSize, organizationId, groupBy]);
    // Agrupado, a página continua contando LINHAS DE DADO; os cabeçalhos de grupo
    // entram por cima (e repetem com "continua" quando o grupo vem da página anterior).
    const totalPages = Math.max(1, Math.ceil(totalLinhas / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * pageSize;
    const pageRows = useMemo(() => linhasNaTela.slice(pageStart, pageStart + pageSize), [linhasNaTela, pageStart, pageSize]);
    const entradasDaPaginaAtual = useMemo(
        () => (agrupando
            ? entradasDaPagina(grupos, recolhidos, pageStart, pageStart + pageSize)
            : pageRows.map((item, i) => ({ tipo: 'linha' as const, item, indice: pageStart + i }))),
        [agrupando, grupos, recolhidos, pageStart, pageSize, pageRows],
    );
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
        // Tributo agrupado em DARF (link "Ver em Contas a Pagar" de Tributos):
        // o id é de um COMPONENTE, que mora dentro da linha do DARF.
        if (!rows.some(r => linhaContemId(r, focusId))) { onFocusConsumed?.(false, false); return; }
        const indice = linhasNaTela.findIndex(r => linhaContemId(r, focusId));
        if (indice < 0) {
            // Está num grupo recolhido: abre o grupo e espera a lista recalcular.
            const grupoDoFoco = agrupando ? grupos.find(g => recolhidos.has(g.key) && g.itens.some(r => linhaContemId(r, focusId))) : undefined;
            if (grupoDoFoco) { agrupamento.expandir(grupoDoFoco.key); return; }
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
        const linhaDoFoco = linhasNaTela[indice];
        // Chegou por um componente: abre a composição do DARF para mostrar o tributo.
        if (linhaDoFoco.darf && linhaDoFoco.id !== focusId) setDarfsAbertos(prev => new Set(prev).add(linhaDoFoco.id));
        setHighlightId(linhaDoFoco.id);
        rowRefs.current.get(linhaDoFoco.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        onFocusConsumed?.(true, limpouFiltrosRef.current);
        limpouFiltrosRef.current = false;
        const t = setTimeout(() => setHighlightId(null), 4000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusId, loading, rows, filtered, linhasNaTela, currentPage, pageSize]);

    /** Cancelado não tem despesa a apropriar — o NOI já o ignora. Parcela PAGA
     *  entra: despesa paga é exatamente a que precisa cair no OPEX. */
    const isSelectable = (row: Payable) => row.effective_status !== 'CANCELADO';
    const selectableVisible = useMemo(() => filtered.filter(isSelectable), [filtered]);  // recorte inteiro — base do lote
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
        const orgs = new Set(selectedVisible.filter(r => !r.darf).map(r => r.organization_id));
        return orgs.size === 1 ? [...orgs][0] : null;
    }, [selectedVisible]);
    /** DARF não se apropria a imóvel: fica fora do lote de apropriação. */
    const apropriaveisDoLote = selectedVisible.filter(r => !r.darf);
    const darfsForaDaApropriacao = selectedVisible.length - apropriaveisDoLote.length;

    function toggleRow(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }
    // Seleção de intervalo com Shift+clique (ui_ux_guia_unificado.md §10.1).
    // `index` é GLOBAL nas linhas da tela (pageStart + i), não o da página (§6.7);
    // agrupado, a lista é a dos grupos abertos, na ordem em que aparecem.
    function handleRowCheck(id: string, index: number, shiftKey: boolean) {
        if (shiftKey && lastCheckedIndex !== null) {
            const [start, end] = lastCheckedIndex < index ? [lastCheckedIndex, index] : [index, lastCheckedIndex];
            const rangeIds = linhasNaTela.slice(start, end + 1).filter(isSelectable).map(r => r.id);
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
        .filter(r => !SEM_PAGAMENTO_A_FAZER.includes(r.effective_status))
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
        if (row.darf) { await estornarDarf(row); return; }
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

    /** Estorno do DARF inteiro: todos os componentes voltam a Previsto, juntos. */
    async function estornarDarf(row: Payable) {
        const darf = row.darf!;
        const n = darf.componentes.length;
        const ok = await confirm({
            title: 'Estornar a baixa deste DARF?',
            message: `Os ${n} lançamentos do DARF (tributos${darf.componentes.some(c => c.source_system === 'DARF') ? ' e multa/juros' : ''}) voltam para Previsto e a data de pagamento é apagada.`,
            variant: 'warning',
            confirmLabel: 'Estornar DARF',
        });
        if (!ok) return;
        setSalvando(row.id);
        try {
            await darfService.estornar(darf.id);
            const vencido = !!row.due_date && row.due_date < hojeLocal();
            onComponentesChanged?.(darf.componentes.map(c => c.id), {
                business_status: 'PREVISTO', status: 'PENDING', payment_date: null,
                effective_status: vencido ? 'VENCIDO' : 'PREVISTO',
            });
            notify('Baixa do DARF estornada.');
        } catch (e: unknown) {
            notify('Erro: ' + ((e as Error).message ?? 'Falha ao estornar o DARF'), 'error');
        } finally {
            setSalvando(null);
        }
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
            if (row.darf) {
                // DARF: uma baixa só para todos os componentes (tributos + multa/juros),
                // numa transação — `fn_darf_dar_baixa`. Sem recibo de credor.
                try {
                    const ids = await darfService.darBaixa(row.darf.id, { paymentDate: dados.paymentDate, paymentType: dados.paymentType });
                    baixados++;
                    onComponentesChanged?.(ids, {
                        business_status: 'PAGO', effective_status: 'PAGO', status: 'CONCILIATED',
                        payment_date: dados.paymentDate, payment_type: dados.paymentType,
                    });
                } catch {
                    falhasBaixa.push(row.description || 'DARF');
                }
                continue;
            }
            try {
                await payableService.darBaixa(row.id, {
                    paymentDate: dados.paymentDate, paymentType: dados.paymentType,
                    // Só existe com 1 título de valor variável (o painel não mostra o campo em lote).
                    valorPago: alvos.length === 1 ? dados.valorPago : null,
                });
                baixados++;
                onRowChanged({
                    ...row,
                    business_status: 'PAGO',
                    effective_status: 'PAGO',
                    status: 'CONCILIATED',
                    // §22: parcela variável passou a valer o que foi pago.
                    ...(alvos.length === 1 && dados.valorPago ? { amount: dados.valorPago } : {}),
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
    /** Pagamento pela Asaas já disparado e ainda não concluído (nem pago, nem
     *  cancelado) — enquanto existir, a linha não oferece um PIX novo. */
    function pagamentoAsaasEmCurso(row: ParcelaRow): SupplierPayment | null {
        if (SEM_PAGAMENTO_A_FAZER.includes(row.effective_status) || !orgsComAsaas.has(row.organization_id)) return null;
        const sp = pagamentosAsaas[row.id];
        return sp && ['APPROVED', 'PENDING', 'SCHEDULED'].includes(sp.status) ? sp : null;
    }

    /* Status mora numa coluna só (20/10/2026). Antes a coluna Ações repetia
       "Quitado" ao lado do "Pago" daqui e escrevia o andamento da Asaas lá — o
       usuário via dois status por linha. O andamento da Asaas é status do
       título, então entra aqui como segunda linha; Ações fica só com ações. */
    function renderStatusCell(row: ParcelaRow): React.ReactNode {
        const sp = pagamentoAsaasEmCurso(row);
        const asaas = sp && (sp.asaas_authorized === false ? 'Aguardando token'
            : sp.status === 'SCHEDULED' ? `Agendado ${formatDateBR(sp.scheduled_date)}`
            : 'Pagamento enviado');
        if (row.darf && row.effective_status === 'PARCIAL') {
            return (
                <div className="text-center">
                    <span className="text-sm font-normal text-red-600" title="Lançamentos do DARF em estados diferentes (parte paga, parte em aberto)">Inconsistente</span>
                </div>
            );
        }
        return (
            <div className="text-center">
                <StatusBadge status={row.effective_status} />
                {asaas && (
                    <div className="flex items-center justify-center gap-1 text-xs font-normal text-blue-700"
                        title={sp?.asaas_authorized === false
                            ? 'A Asaas está esperando a autorização por token no app/SMS da conta.'
                            : 'A baixa acontece sozinha quando a Asaas confirmar.'}>
                        <Landmark className="w-3 h-3" /> {asaas}
                    </div>
                )}
            </div>
        );
    }

    function renderReciboCell(row: ParcelaRow): React.ReactNode {
        if (row.effective_status !== 'PAGO' || semReciboPorOrigem(row)) {
            return <span className="text-sm font-normal text-gray-400" title={row.darf ? MOTIVO_SEM_RECIBO_DARF : undefined}>—</span>;
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

    /** Pendente na alçada? No DARF, basta um componente pendente (o banco recusa a baixa do DARF inteiro). */
    const naAlcada = (row: Payable) => row.darf
        ? row.darf.alcada_pendente || row.darf.componentes.some(c => alcadaPendente.has(c.id))
        : alcadaPendente.has(row.id);

    // Títulos em aberto da seleção — os que a baixa em lote alcança.
    const selecionadasNaoQuitadas = selectedVisible.filter(r => !SEM_PAGAMENTO_A_FAZER.includes(r.effective_status));
    // Pendente na alçada não entra no lote (item H.1) — o título do botão diz quantas ficaram de fora.
    const selecionadasEmAberto = selecionadasNaoQuitadas.filter(r => !naAlcada(r));
    const presasNaAlcada = selecionadasNaoQuitadas.length - selecionadasEmAberto.length;

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
    const baixaSoDarf = !!baixando?.length && baixando.every(r => !!r.darf);
    const baixaSoBoleto = !!baixando?.length && baixando.every(r => r.source_system === 'BOLETO');

    /** Anexo do avulso: URL assinada no CLIQUE (15 min), nunca ao carregar a lista. */
    async function verDocumento(row: Payable) {
        if (!row.documento_path) return;
        try {
            window.open(await payableService.urlDoAnexo(row.documento_path), '_blank', 'noopener');
        } catch (e: unknown) {
            notify('Erro: ' + ((e as Error).message ?? 'Não foi possível abrir o documento'), 'error');
        }
    }

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

                    {/* Status — dropdown, mesmo desenho do de Origem logo abaixo. Eram
                        cinco pílulas segmentadas; com o rótulo completo ("Aguardando
                        aprovação", STATUS_PT) elas estouravam o trilho. */}
                    <div className="relative flex items-center shrink-0">
                        <Filter className="absolute left-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <select
                            value={statusFiltro}
                            onChange={e => setStatusFiltro(e.target.value as StatusFiltro)}
                            title="Filtrar por status"
                            className="h-9 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none"
                        >
                            {STATUS_FILTROS.map(s => (
                                <option key={s} value={s}>{s === 'all' ? 'Todos os status' : STATUS_PT[s]}</option>
                            ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none absolute right-2.5" />
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

                    {/* Agrupar — guia de UI §6.12 */}
                    <AgruparControles
                        opcoes={OPCOES_AGRUPAR}
                        campo={groupBy}
                        onCampo={agrupamento.setCampo}
                        chavesDosGrupos={grupos.map(g => g.key)}
                        algumRecolhido={recolhidos.size > 0}
                        onAlternarTodos={agrupamento.alternarTodos}
                        title="Agrupar as parcelas"
                    />

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
                            Parcelas aparecem aqui quando um pedido é recebido ou um contrato de suprimentos é parcelado
                            {onNovoAvulso ? ' — ou crie um pagamento avulso.' : '.'}
                        </p>
                        {onNovoAvulso && rows.length === 0 && (
                            <button
                                onClick={onNovoAvulso}
                                className="mt-4 inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                            >
                                <Plus className="w-[15px] h-[15px]" />
                                Novo pagamento avulso
                            </button>
                        )}
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
                                <tr className="sticky top-0 z-10 bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
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
                                {entradasDaPaginaAtual.map(e => {
                                    if (e.tipo === 'grupo') return (
                                        <LinhaDeGrupo key={`grupo:${e.grupo.key}`} grupo={e.grupo} recolhido={e.recolhido} continua={e.continua}
                                            colSpan={totalColunas} onAlternar={agrupamento.alternar} tituloTotal="Soma do valor das parcelas do grupo" />
                                    );
                                    const row = e.item;
                                    const idx = e.indice;
                                    const vencido = row.effective_status === 'VENCIDO';
                                    const quitado = SEM_PAGAMENTO_A_FAZER.includes(row.effective_status);
                                    const selecionada = selectedIds.has(row.id);
                                    const linha = (
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
                                                    {key === 'recibo' ? renderReciboCell(row)
                                                        : key === 'status' ? renderStatusCell(row)
                                                        : renderParcelaCell(key, row, alocacoes)}
                                                </td>
                                            ))}
                                            {/* espaçador — casa com o <col /> sem largura, antes de "Ações" */}
                                            <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            <td className="px-6 py-2.5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {!quitado && (
                                                        <button
                                                            onClick={() => setBaixando([row])}
                                                            disabled={salvando === row.id || naAlcada(row)}
                                                            className="text-green-700 hover:text-green-800 text-sm font-medium p-1.5 hover:bg-green-50 rounded-[6px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                                            title={naAlcada(row) ? MOTIVO_ALCADA_PENDENTE
                                                                : row.darf ? 'Dar baixa no DARF inteiro: todos os tributos e encargos, com a mesma data e forma'
                                                                : 'Dar baixa: data, forma de pagamento e recibo'}
                                                        >
                                                            {salvando === row.id
                                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                : <Check className="w-3.5 h-3.5" />}
                                                            {/* "Dar baixa", não "Pago": com o rótulo de status, o
                                                                botão parecia um segundo Status da linha. */}
                                                            Dar baixa
                                                        </button>
                                                    )}
                                                    {/* DARF pela Asaas (guia de arrecadação) ainda não: fica para depois. */}
                                                    {!quitado && !row.darf && orgsComAsaas.has(row.organization_id) && (() => {
                                                        const sp = pagamentosAsaas[row.id];
                                                        const emCurso = pagamentoAsaasEmCurso(row);
                                                        if (emCurso) {
                                                            /* O andamento ("Aguardando token", "Agendado…") está na
                                                               coluna Status; aqui só a ação. Antes só dava para cancelar
                                                               pelo painel da Asaas (visto no teste do sandbox, 17/10). A
                                                               Asaas só aceita cancelar antes de concluir — PIX imediato
                                                               costuma concluir em segundos; agendado, até o dia. */
                                                            return (
                                                                <ActionIconButton
                                                                    kind="delete"
                                                                    title={cancelandoAsaas === emCurso.id ? 'Cancelando…' : 'Cancelar este pagamento na Asaas'}
                                                                    icon={cancelandoAsaas === emCurso.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                                                    disabled={cancelandoAsaas === emCurso.id}
                                                                    onClick={() => cancelarPagamentoAsaas(row, emCurso)}
                                                                />
                                                            );
                                                        }
                                                        return (
                                                            <button
                                                                onClick={() => setPagandoAsaas(row)}
                                                                className="text-blue-700 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all flex items-center gap-1"
                                                                title={sp?.status === 'FAILED'
                                                                    ? `A última tentativa falhou: ${sp.failure_reason ?? 'sem motivo informado'}. Clique para tentar de novo.`
                                                                    : row.source_system === 'BOLETO' ? 'Pagar o boleto pela conta Asaas' : 'Pagar por PIX pela conta Asaas'}
                                                            >
                                                                <Landmark className="w-3.5 h-3.5" />
                                                                {row.source_system === 'BOLETO' ? 'Asaas' : 'PIX'}
                                                                {sp?.status === 'FAILED' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                                                            </button>
                                                        );
                                                    })()}
                                                    {row.effective_status === 'PAGO' && (
                                                        <>
                                                            {/* Sem "Quitado" aqui: a coluna Status já diz "Pago". */}
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
                                                            {/* DARF conciliado: o estorno é desfazer a conciliação (o span carrega o motivo). */}
                                                            <span className="inline-flex" title={row.darf?.conciliado_no_extrato ? MOTIVO_ESTORNO_DARF_CONCILIADO : undefined}>
                                                                <ActionIconButton
                                                                    kind="settings"
                                                                    title={row.darf ? 'Estornar a baixa do DARF' : 'Estornar baixa'}
                                                                    icon={<Undo2 className="w-4 h-4" />}
                                                                    disabled={salvando === row.id || !!row.darf?.conciliado_no_extrato}
                                                                    onClick={() => estornar(row)}
                                                                />
                                                            </span>
                                                        </>
                                                    )}
                                                    {/* Histórico dos pagamentos pela Asaas (quem disparou, quem
                                                        cancelou, o que a Asaas respondeu) — só quando houve algum. */}
                                                    {pagamentosAsaas[row.id] && (
                                                        <ActionIconButton
                                                            kind="history"
                                                            title="Histórico de pagamentos pela Asaas"
                                                            onClick={() => setHistoricoAsaas(row)}
                                                        />
                                                    )}
                                                    {/* Apropriar a imóvel — a mesma Sheet do lote, com um
                                                        lançamento só. Cancelada não tem o que apropriar. */}
                                                    {isSelectable(row) && !row.darf && (
                                                        <ActionIconButton
                                                            kind="settings"
                                                            title="Apropriar a imóvel"
                                                            icon={<Building2 className="w-4 h-4" />}
                                                            onClick={() => setApropriando({ organizationId: row.organization_id, payables: [row] })}
                                                        />
                                                    )}
                                                    {row.darf && (
                                                        <>
                                                            <ActionIconButton
                                                                kind="view"
                                                                title={darfsAbertos.has(row.id) ? 'Esconder a composição do DARF' : 'Ver a composição do DARF'}
                                                                icon={darfsAbertos.has(row.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                                aria-expanded={darfsAbertos.has(row.id)}
                                                                onClick={() => alternarDarf(row.id)}
                                                            />
                                                            <ActionIconButton
                                                                kind="view"
                                                                title="Abrir em Tributos a Pagar › DARFs (editar, desagrupar)"
                                                                icon={<ExternalLink className="w-4 h-4" />}
                                                                onClick={() => navigateToFocus('tributos-a-pagar', row.darf!.id, 'DARF')}
                                                            />
                                                        </>
                                                    )}
                                                    {/* Só título manual é excluível aqui: parcela de Pedido ou
                                                        Contrato é espelho da origem (payableService.remove). */}
                                                    {row.documento_path && (
                                                        <ActionIconButton
                                                            kind="view"
                                                            title={`${row.darf ? 'Ver o PDF do DARF' : 'Ver documento'}${row.documento_nome ? ` — ${row.documento_nome}` : ''}`}
                                                            icon={<Paperclip className="w-4 h-4" />}
                                                            onClick={() => verDocumento(row)}
                                                        />
                                                    )}
                                                    {row.source_system === 'MANUAL' && onEditarAvulso && (
                                                        // O span carrega o motivo: botão desligado tem
                                                        // pointer-events-none e não mostraria o próprio title.
                                                        <span className="inline-flex" title={motivoNaoEditar(row, pagamentosAsaas[row.id]) ?? undefined}>
                                                            <ActionIconButton
                                                                kind="edit"
                                                                title={motivoNaoEditar(row, pagamentosAsaas[row.id]) ?? 'Editar pagamento avulso'}
                                                                disabled={!!motivoNaoEditar(row, pagamentosAsaas[row.id])}
                                                                onClick={() => onEditarAvulso(row)}
                                                            />
                                                        </span>
                                                    )}
                                                    {row.source_system === 'MANUAL' && (
                                                        <span className="inline-flex" title={motivoTravaAsaas(pagamentosAsaas[row.id], 'excluir') ?? undefined}>
                                                            <ActionIconButton
                                                                kind="delete"
                                                                title={motivoTravaAsaas(pagamentosAsaas[row.id], 'excluir') ?? 'Excluir'}
                                                                disabled={!!motivoTravaAsaas(pagamentosAsaas[row.id], 'excluir')}
                                                                onClick={() => excluir(row)}
                                                            />
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                    if (!row.darf || !darfsAbertos.has(row.id)) return linha;
                                    return (
                                        <React.Fragment key={row.id}>
                                            {linha}
                                            <tr className="bg-gray-50/50">
                                                <td colSpan={totalColunas} className="px-6 py-3">
                                                    <div className="overflow-x-auto rounded-[10px] border border-gray-100 bg-white max-w-3xl">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead>
                                                                <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                                                    <th className="px-3 py-2 border-r border-gray-100">Lançamento</th>
                                                                    <th className="px-4 py-2 border-r border-gray-100">Descrição</th>
                                                                    <th className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">Competência</th>
                                                                    <th className="px-3 py-2 text-right">Valor</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-200">
                                                                {row.darf.componentes.map(c => (
                                                                    <tr key={c.id} className={c.id === focusId ? 'bg-amber-50' : ''}>
                                                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 whitespace-nowrap">
                                                                            {c.source_system === 'DARF' ? 'Encargo' : (c.party_name || 'Tributo')}
                                                                        </td>
                                                                        <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                                                                            <span className="block truncate" title={c.description ?? ''}>{c.description || '—'}</span>
                                                                        </td>
                                                                        <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                                            {c.source_system === 'DARF' ? '—' : competenciaBR(c.transaction_date)}
                                                                        </td>
                                                                        <td className="px-3 py-2.5 text-right text-sm font-medium text-gray-800 whitespace-nowrap">{formatMoney(c.amount)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        </React.Fragment>
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
                            <span>{totalLinhas === 0 ? '0 de 0' : `${pageStart + 1}–${Math.min(pageStart + pageSize, totalLinhas)} de ${totalLinhas.toLocaleString('pt-BR')}`}</span>
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
                        ? `Dar baixa nas parcelas em aberto da seleção (data, forma e recibo)${presasNaAlcada ? ` — ${presasNaAlcada} aguardando aprovação na alçada fica${presasNaAlcada === 1 ? '' : 'm'} de fora` : ''}`
                        : presasNaAlcada
                            ? MOTIVO_ALCADA_PENDENTE
                            : 'Todas as parcelas selecionadas já estão pagas ou canceladas.'}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-700 rounded-[6px] text-[13px] font-medium hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                    <Check className="w-3.5 h-3.5" />
                    Dar baixa{selecionadasEmAberto.length && selecionadasEmAberto.length !== selectedVisible.length ? ` (${selecionadasEmAberto.length})` : ''}
                </button>
                <button
                    onClick={() => orgDoLote && setApropriando({ organizationId: orgDoLote, payables: apropriaveisDoLote })}
                    disabled={!orgDoLote}
                    title={apropriaveisDoLote.length === 0
                        ? 'DARF não se apropria a imóvel.'
                        : orgDoLote
                            ? `Apropriar as parcelas selecionadas a um imóvel${darfsForaDaApropriacao ? ` — ${darfsForaDaApropriacao} DARF fica${darfsForaDaApropriacao === 1 ? '' : 'm'} de fora` : ''}`
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
            reciboIndisponivel={baixaSoDarf
                ? MOTIVO_SEM_RECIBO_DARF
                : baixaSoFolha
                    ? (baixando!.every(r => r.source_system === 'LABOR')
                        ? 'Título de folha reúne vários colaboradores: não há um credor único para assinar o recibo.'
                        : 'Os títulos sem credor único (folha, DARF) não têm recibo para assinar.')
                    : null}
            avisoRecibo={baixaComFolha && !baixaSoFolha ? 'Os títulos de folha e DARF do lote não recebem recibo.' : null}
            onClose={() => setBaixando(null)}
            onConfirm={confirmarBaixa}
            progresso={baixaProgresso}
        />

        {pagandoAsaas && pagandoAsaas.source_system !== 'BOLETO' && (
            <PagarPixSheet
                organizationId={pagandoAsaas.organization_id}
                transactionId={pagandoAsaas.id}
                onClose={() => setPagandoAsaas(null)}
                onDone={r => {
                    setPagandoAsaas(null);
                    // Só o selo da linha muda agora; a baixa vem do webhook (§22).
                    recarregarPagamentosAsaas();
                    notify(r.aguardando_autorizacao
                        ? 'PIX criado na Asaas, aguardando autorização por token no app da Asaas.'
                        : r.status === 'DONE'
                            ? `PIX enviado e título baixado (${r.beneficiary_name ?? 'favorecido'}).`
                            : `PIX enviado para ${r.beneficiary_name?.trim() || 'o favorecido'}. A baixa acontece quando a Asaas confirmar.`);
                    if (r.status === 'DONE') onReload();
                }}
            />
        )}
        {pagandoAsaas && pagandoAsaas.source_system === 'BOLETO' && pagandoAsaas.reference_id && (
            <PagarBoletoAsaasModal
                organizationId={pagandoAsaas.organization_id}
                boletoId={pagandoAsaas.reference_id}
                supplierName={pagandoAsaas.credor_display ?? pagandoAsaas.party_name}
                amount={pagandoAsaas.amount}
                dueDate={pagandoAsaas.due_date}
                onClose={() => setPagandoAsaas(null)}
                onPaid={() => {
                    setPagandoAsaas(null);
                    recarregarPagamentosAsaas();
                    notify('Pagamento enviado à Asaas. A baixa acontece quando o banco confirmar.');
                }}
            />
        )}

        {historicoAsaas && (
            <HistoricoPagamentoAsaasSheet
                transactionId={historicoAsaas.id}
                descricao={historicoAsaas.description}
                onClose={() => setHistoricoAsaas(null)}
            />
        )}

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
