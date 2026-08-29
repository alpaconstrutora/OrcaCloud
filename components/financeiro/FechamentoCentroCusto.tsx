import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle, Building2, CalendarDays, ChevronDown, ChevronRight, Layers, Loader2,
    Lock, LockOpen, MoveHorizontal, RefreshCw, Search, Tag, X,
} from 'lucide-react';
import type { Payable, CostCenter } from '../../types/financial';
import { payableParty } from '../../services/payableService';
import { financialRegistryService } from '../../services/financialRegistryService';
import { condominioRateioService } from '../../services/condominioRateioService';
import {
    costCenterClosingService,
    type CostCenterClosing,
    type CostCenterClosingItem,
} from '../../services/costCenterClosingService';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from '../ui/TableUtils';
import { Money, formatMoney, formatDateBR } from '../ui/Format';
import { useConfirm } from '../ui/confirm';
import { STATUS_PT, origemLabel } from '../ContasPagarParcelas';
import LancarNoCondominioSheet from './LancarNoCondominioSheet';

/**
 * Fechamento por Centro de Custo — a terceira visão de Contas a Pagar.
 *
 * Consolida os títulos a pagar de UMA competência (mês) por Centro de Custo e
 * permite FECHAR o mês: o consolidado vira retrato congelado no banco
 * (`cost_center_closings` + `_items`) e a trigger do banco passa a recusar
 * qualquer INSERT/UPDATE/DELETE de título a pagar com vencimento nele.
 *
 * Migration: `aplicar_20270905000025_fechamento_centro_custo.sql`.
 *
 * ⚠️ Competência sai de `due_date` com FALLBACK para `transaction_date` — a
 * mesma regra que a trigger usa. Centenas de lançamentos DEBIT não têm
 * vencimento; se a tela e o banco divergissem nesse ponto, a linha somaria num
 * mês e ficaria travada em outro.
 */

/** 'YYYY-MM' da competência de um título — due_date, senão transaction_date. */
export function competenciaDoTitulo(p: Payable): string {
    const base = p.due_date || p.transaction_date;
    return base ? base.slice(0, 7) : '';
}

/** Rótulo da fatia não classificada. Não é lacuna a esconder: é o número que
 *  diz quanto do mês ninguém apropriou a centro de custo nenhum. */
const SEM_CENTRO_CUSTO = 'Sem centro de custo';

/** Valor do <select> para a fatia sem centro de custo — `costCenterId` é `null`
 *  ali, e `<option value="">` já está tomado por "Todos". */
const CC_FILTRO_SEM = '__sem__';

/** Prefixo do valor do <select> quando a opção escolhida é um GRUPO
 *  (`cost_centers_v2.parent_id`), não um centro de custo folha. */
const GRUPO_PREFIX = 'grupo:';

/** Linha do consolidado — uma por Centro de Custo. */
export interface LinhaFechamento {
    costCenterId: string | null;
    nome: string;
    previsto: number;
    pago: number;
    aberto: number;
    titulos: number;
}

const FECHAMENTO_COLUMNS: ColumnConfig[] = [
    { key: 'centro_custo', label: 'Centro de Custo', sortable: true },
    { key: 'titulos', label: 'Títulos', sortable: true },
    { key: 'previsto', label: 'Previsto', sortable: true },
    { key: 'pago', label: 'Pago', sortable: true },
    { key: 'aberto', label: 'Em aberto', sortable: true },
];

const FECHAMENTO_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
    centro_custo: { label: 'Centro de Custo', className: 'text-left px-6 py-2 border-r border-gray-100 overflow-hidden' },
    titulos: { label: 'Títulos', className: 'text-right px-6 py-2 border-r border-gray-100 overflow-hidden' },
    previsto: { label: 'Previsto', className: 'text-right px-6 py-2 border-r border-gray-100 overflow-hidden' },
    pago: { label: 'Pago', className: 'text-right px-6 py-2 border-r border-gray-100 overflow-hidden' },
    aberto: { label: 'Em aberto', className: 'text-right px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    centro_custo: 320, titulos: 110, previsto: 160, pago: 160, aberto: 160,
};

/* Conteúdo de cada célula por coluna — função pura para o corpo da tabela
   mapear `orderedVisibleColumns` (ordem arrastável) em vez de repetir JSX fixo.
   O texto acima evita escrever a tag de célula literal: dentro de comentário ela
   deixa o parser do check-ui-standard.sh aberto e ele cospe falso positivo de §7
   em todo `font-bold` abaixo (ver §6.1.1 do guia). */
function renderFechamentoCell(key: string, linha: LinhaFechamento, expandida: boolean): React.ReactNode {
    switch (key) {
        case 'centro_custo':
            return (
                <div className="flex items-center gap-2 min-w-0">
                    {expandida
                        ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className={`text-sm font-normal truncate ${linha.costCenterId ? 'text-gray-700' : 'text-gray-400'}`}>
                        {linha.nome}
                    </span>
                </div>
            );
        case 'titulos':
            return <div className="text-right text-sm font-normal text-gray-600">{linha.titulos}</div>;
        case 'previsto':
            return (
                <div className="text-right text-sm font-medium text-gray-800">
                    <Money value={linha.previsto} />
                </div>
            );
        case 'pago':
            return (
                <div className="text-right text-sm font-medium text-green-700">
                    <Money value={linha.pago} />
                </div>
            );
        case 'aberto':
            return (
                <div className={`text-right text-sm font-medium ${linha.aberto > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                    <Money value={linha.aberto} />
                </div>
            );
        default:
            return null;
    }
}

interface Props {
    /** Todos os títulos a pagar carregados pelo pai (mesma lista da aba Parcelas). */
    rows: Payable[];
    /** Org efetiva do pai. `undefined` = "Todas as organizações". */
    organizationId?: string;
    /** Competência 'YYYY-MM' escolhida na barra de escopo do pai. */
    competencia: string;
    /** Para o empty state poder oferecer "usar o mês atual" em um clique. */
    onCompetenciaChange: (competencia: string) => void;
    loading: boolean;
    error: string | null;
    onReload: () => void;
    notify: (message: string, type?: 'success' | 'error') => void;
    /** Reporta o consolidado exibido, para o export do pai sair igual à tela. */
    onConsolidadoChange?: (linhas: LinhaFechamento[]) => void;
    /** Reporta o fechamento vigente, para o pai rotular o export e os KPIs. */
    onFechamentoChange?: (fechamento: CostCenterClosing | null) => void;
}

export default function FechamentoCentroCusto({
    rows, organizationId, competencia, onCompetenciaChange,
    loading, error, onReload, notify, onConsolidadoChange, onFechamentoChange,
}: Props) {
    const confirm = useConfirm();
    const [search, setSearch] = usePersistedState('fechamentoCentroCusto:search', '');
    // Seletor de Centro de Custo — filtro de FONTE (§5.3 não se aplica: não muda
    // "qual mês?", só recorta a tabela ao CC escolhido), então mora na régua da
    // busca (§5.1), não na barra de escopo do pai. '' = todos.
    const [ccFiltro, setCcFiltro] = usePersistedState('fechamentoCentroCusto:cc', '');
    const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [fechamento, setFechamento] = useState<CostCenterClosing | null>(null);
    const [carregandoFechamento, setCarregandoFechamento] = useState(false);
    const [salvando, setSalvando] = useState(false);

    // Seleção de títulos para o botão "Lançamento" (Comercial › Condomínios ›
    // Financeiro). Só títulos de centro de custo com condomínio ancorado
    // (`cost_centers_v2.empreendimento_id`) são selecionáveis — ver
    // `isCondominioTitulo` abaixo.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastChecked, setLastChecked] = useState<{ chave: string; index: number } | null>(null);
    /** Títulos já lançados num rateio vivo — desabilita o checkbox pra não
     *  cobrar o condômino duas vezes pela mesma despesa. */
    const [rateadas, setRateadas] = useState<Set<string>>(new Set());
    const [sheetLancamento, setSheetLancamento] = useState(false);

    const tableColumns = useTableColumns(FECHAMENTO_COLUMNS, 'fechamentoCentroCustoColumns');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'fechamentoCentroCustoColWidths');

    // Nome do Centro de Custo (`cost_centers_v2`) — vw_payables só traz o UUID.
    // NÃO confundir com Plano de Contas (`plano_de_contas`), que é outra
    // dimensão (ver migration 20270822000013).
    useEffect(() => {
        let ativo = true;
        financialRegistryService.listCostCenters(organizationId)
            .then(cc => { if (ativo) setCostCenters(cc); })
            .catch(err => console.error('[FechamentoCentroCusto] Erro ao carregar Centro de Custo:', err));
        return () => { ativo = false; };
    }, [organizationId]);

    const costCenterNameById = useMemo(() => new Map(costCenters.map(c => [c.id, c.name])), [costCenters]);
    // Objeto completo (não só o nome) — precisa de `parent_id`/`parent_name`
    // (filtro por grupo) e `empreendimento_id` (quais títulos são de condomínio).
    const ccById = useMemo(() => new Map(costCenters.map(c => [c.id, c])), [costCenters]);

    const isCondominioTitulo = React.useCallback(
        (p: Payable) => !!p.cost_center_id && !!ccById.get(p.cost_center_id)?.empreendimento_id,
        [ccById],
    );

    // Fechamento é por organização específica: em "Todas as organizações" não há
    // o que buscar (nem o que fechar — ver `podeFechar` abaixo).
    useEffect(() => {
        let ativo = true;
        if (!organizationId || !competencia) { setFechamento(null); return; }
        setCarregandoFechamento(true);
        costCenterClosingService.getByCompetencia(organizationId, competencia)
            .then(f => { if (ativo) setFechamento(f); })
            .catch(err => {
                console.error('[FechamentoCentroCusto] Erro ao carregar o fechamento:', err);
                if (ativo) setFechamento(null);
            })
            .finally(() => { if (ativo) setCarregandoFechamento(false); });
        return () => { ativo = false; };
    }, [organizationId, competencia]);

    useEffect(() => { onFechamentoChange?.(fechamento); }, [fechamento, onFechamentoChange]);

    const estaFechada = fechamento?.status === 'FECHADO';

    /** Títulos da competência escolhida. CANCELADO fica de fora: não é despesa
     *  do mês, e somá-lo inflaria tanto o previsto quanto o fechamento. */
    const titulosDaCompetencia = useMemo(() => {
        if (!competencia) return [];
        return rows.filter(p =>
            competenciaDoTitulo(p) === competencia && p.effective_status !== 'CANCELADO',
        );
    }, [rows, competencia]);

    // Quais dos títulos de condomínio já foram lançados em algum rateio vivo —
    // recarrega quando a lista de títulos ou o cadastro de CC muda.
    useEffect(() => {
        const idsCondominio = titulosDaCompetencia.filter(isCondominioTitulo).map(p => p.id);
        if (idsCondominio.length === 0) { setRateadas(new Set()); return; }
        let ativo = true;
        condominioRateioService.listarJaRateadas(idsCondominio)
            .then(s => { if (ativo) setRateadas(s); })
            .catch(err => console.error('[FechamentoCentroCusto] Erro ao verificar despesas já lançadas:', err));
        return () => { ativo = false; };
    }, [titulosDaCompetencia, isCondominioTitulo]);

    /** Consolidado VIVO — recalculado dos títulos. */
    const consolidadoVivo = useMemo<LinhaFechamento[]>(() => {
        const porCC = new Map<string, LinhaFechamento>();
        for (const p of titulosDaCompetencia) {
            const id = p.cost_center_id ?? null;
            const chave = id ?? '__sem__';
            let linha = porCC.get(chave);
            if (!linha) {
                linha = {
                    costCenterId: id,
                    nome: id ? (costCenterNameById.get(id) ?? 'Centro de custo removido') : SEM_CENTRO_CUSTO,
                    previsto: 0, pago: 0, aberto: 0, titulos: 0,
                };
                porCC.set(chave, linha);
            }
            const valor = p.amount ?? 0;
            linha.previsto += valor;
            if (p.effective_status === 'PAGO') linha.pago += valor;
            linha.titulos += 1;
        }
        for (const linha of porCC.values()) linha.aberto = linha.previsto - linha.pago;
        return [...porCC.values()];
    }, [titulosDaCompetencia, costCenterNameById]);

    /**
     * O que a tabela mostra. Mês fechado exibe o RETRATO gravado, não o
     * recálculo — é o ponto do fechamento: o número que foi comunicado é o que
     * continua aparecendo, mesmo que um cadastro mude de nome depois.
     */
    const consolidado = useMemo<LinhaFechamento[]>(() => {
        if (estaFechada && fechamento?.items) {
            return fechamento.items.map(i => ({
                costCenterId: i.cost_center_id,
                nome: i.cost_center_name,
                previsto: Number(i.total_previsto),
                pago: Number(i.total_pago),
                aberto: Number(i.total_aberto),
                titulos: i.qtd_titulos,
            }));
        }
        return consolidadoVivo;
    }, [estaFechada, fechamento, consolidadoVivo]);

    /**
     * Opções do seletor — só os centros de custo que TÊM título nesta
     * competência, não o cadastro inteiro (`costCenters`). Listar o cadastro
     * completo ofereceria dezenas de CCs que dariam tabela vazia ao escolher,
     * sem nenhuma pista de por quê. Derivado de `consolidado` (antes do próprio
     * filtro/busca) para a lista de opções não encolher enquanto o usuário digita.
     *
     * Duas seções: GRUPOS (`cost_centers_v2.parent_id` dos CCs presentes —
     * ex: "Condomínios") e os próprios centros de custo. Escolher um grupo
     * filtra a todos os CCs filhos dele.
     */
    const opcoesFiltro = useMemo(() => {
        const centros = [...consolidado]
            .map(l => ({ value: l.costCenterId ?? CC_FILTRO_SEM, label: l.nome }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

        const gruposPorId = new Map<string, string>();
        for (const l of consolidado) {
            if (!l.costCenterId) continue;
            const cc = ccById.get(l.costCenterId);
            if (cc?.parent_id) gruposPorId.set(cc.parent_id, cc.parent_name || '—');
        }
        const grupos = [...gruposPorId.entries()]
            .map(([id, nome]) => ({ value: `${GRUPO_PREFIX}${id}`, label: nome }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

        return { centros, grupos };
    }, [consolidado, ccById]);

    const filtered = useMemo(() => {
        let result = consolidado;
        if (ccFiltro) {
            if (ccFiltro.startsWith(GRUPO_PREFIX)) {
                const grupoId = ccFiltro.slice(GRUPO_PREFIX.length);
                result = result.filter(l => l.costCenterId != null && ccById.get(l.costCenterId)?.parent_id === grupoId);
            } else {
                result = result.filter(l => (l.costCenterId ?? CC_FILTRO_SEM) === ccFiltro);
            }
        }
        if (search) {
            const termo = search.toLowerCase();
            result = result.filter(l => l.nome.toLowerCase().includes(termo));
        }
        if (tableColumns.sortColumn) {
            const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
            const valor = (l: LinhaFechamento): string | number => {
                switch (tableColumns.sortColumn) {
                    case 'centro_custo': return l.nome.toLowerCase();
                    case 'titulos':      return l.titulos;
                    case 'previsto':     return l.previsto;
                    case 'pago':         return l.pago;
                    case 'aberto':       return l.aberto;
                    default:             return '';
                }
            };
            result = [...result].sort((a, b) => {
                const va = valor(a), vb = valor(b);
                if (va < vb) return -dir;
                if (va > vb) return dir;
                return 0;
            });
        } else {
            // Sem coluna escolhida: maior previsto primeiro — é a pergunta que a
            // tela responde ("onde o mês pesou?"), não a ordem alfabética.
            result = [...result].sort((a, b) => b.previsto - a.previsto);
        }
        return result;
    }, [consolidado, ccFiltro, search, tableColumns.sortColumn, tableColumns.sortDirection, ccById]);

    useEffect(() => { onConsolidadoChange?.(filtered); }, [filtered, onConsolidadoChange]);

    // Largura = soma exata das colunas visíveis + 1ª coluna do chevron já embutida
    // em `centro_custo`. NUNCA w-full junto com table-layout:fixed (§6.1).
    const tableTotalWidth = FECHAMENTO_COLUMNS
        .reduce((sum, c) => sum + (tableColumns.visibleColumns.includes(c.key) ? cols.getWidth(c.key) : 0), 0);

    const totais = useMemo(() => filtered.reduce(
        (acc, l) => ({
            previsto: acc.previsto + l.previsto,
            pago: acc.pago + l.pago,
            aberto: acc.aberto + l.aberto,
            titulos: acc.titulos + l.titulos,
        }),
        { previsto: 0, pago: 0, aberto: 0, titulos: 0 },
    ), [filtered]);

    /** Títulos de um centro de custo, para a linha expandida. Sempre da lista
     *  viva — o retrato guarda totais, não a relação de títulos. */
    const titulosPorCC = useMemo(() => {
        const mapa = new Map<string, Payable[]>();
        for (const p of titulosDaCompetencia) {
            const chave = p.cost_center_id ?? '__sem__';
            const lista = mapa.get(chave);
            if (lista) lista.push(p); else mapa.set(chave, [p]);
        }
        return mapa;
    }, [titulosDaCompetencia]);

    function toggleExpandida(chave: string) {
        setExpandidas(prev => {
            const next = new Set(prev);
            if (next.has(chave)) next.delete(chave); else next.add(chave);
            return next;
        });
    }

    // ── Seleção de títulos para o botão "Lançamento" ────────────────────────
    const tituloById = useMemo(() => new Map(titulosDaCompetencia.map(t => [t.id, t])), [titulosDaCompetencia]);
    const selectedTitulos = useMemo(
        () => [...selectedIds].map(id => tituloById.get(id)).filter((t): t is Payable => !!t),
        [selectedIds, tituloById],
    );
    const selectedTotal = selectedTitulos.reduce((s, t) => s + (t.amount ?? 0), 0);

    function toggleTitulo(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }
    /** Shift+clique (§10.1) — escopo é o bloco expandido do próprio centro de
     *  custo: os títulos só ficam visíveis dentro dele, então "intervalo" só
     *  faz sentido entre duas linhas do mesmo bloco. */
    function handleTituloCheck(chave: string, id: string, index: number, shiftKey: boolean, lista: Payable[]) {
        if (shiftKey && lastChecked && lastChecked.chave === chave) {
            const [start, end] = lastChecked.index < index ? [lastChecked.index, index] : [index, lastChecked.index];
            const rangeIds = lista.slice(start, end + 1)
                .filter(t => isCondominioTitulo(t) && !rateadas.has(t.id))
                .map(t => t.id);
            setSelectedIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            toggleTitulo(id);
        }
        setLastChecked({ chave, index });
    }
    function toggleTodosDoCentro(chave: string, lista: Payable[]) {
        const selecionaveis = lista.filter(t => isCondominioTitulo(t) && !rateadas.has(t.id));
        const todosMarcados = selecionaveis.length > 0 && selecionaveis.every(t => selectedIds.has(t.id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            selecionaveis.forEach(t => (todosMarcados ? next.delete(t.id) : next.add(t.id)));
            return next;
        });
    }
    const clearSelection = () => { setSelectedIds(new Set()); setLastChecked(null); };

    /** Depois de lançar: tira da seleção e marca "já lançado" sem depender de
     *  recarregar a tela (§22) — o parent do Sheet não sabe de nada disso. */
    function handleLancado(idsLancados: string[]) {
        setRateadas(prev => new Set([...prev, ...idsLancados]));
        setSelectedIds(prev => {
            const next = new Set(prev);
            idsLancados.forEach(id => next.delete(id));
            return next;
        });
    }

    /** Fechar exige organização específica: é a exceção nomeada da REGRA #5
     *  (fechamento contábil). Ler nunca bloqueia — a tabela acima aparece de
     *  qualquer jeito; só a AÇÃO fica indisponível em "Todas". */
    const podeFechar = !!organizationId && !!competencia;
    const motivoBloqueio = !competencia
        ? 'Escolha uma competência na barra acima para fechar o mês.'
        : !organizationId
            ? 'Selecione uma organização específica no seletor do topo — cada organização fecha o próprio caixa.'
            : undefined;

    const competenciaLabel = competencia
        ? new Date(`${competencia}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : '';

    async function handleFechar() {
        if (!organizationId || !competencia) return;
        const ok = await confirm({
            title: `Fechar a competência ${competenciaLabel}?`,
            message:
                `Os ${consolidadoVivo.reduce((s, l) => s + l.titulos, 0)} títulos deste mês ficam bloqueados para ` +
                'lançamento, alteração e exclusão — inclusive pelas sincronizações automáticas de Pedidos de Compra ' +
                'e Contratos. O consolidado por centro de custo é gravado como está agora. Dá para reabrir depois.',
            variant: 'warning',
            confirmLabel: 'Fechar competência',
        });
        if (!ok) return;

        setSalvando(true);
        try {
            const items: CostCenterClosingItem[] = consolidadoVivo.map(l => ({
                cost_center_id: l.costCenterId,
                cost_center_name: l.nome,
                total_previsto: l.previsto,
                total_pago: l.pago,
                total_aberto: l.aberto,
                qtd_titulos: l.titulos,
            }));
            const salvo = await costCenterClosingService.close(organizationId, competencia, items);
            // Estado local em vez de recarga total (§22).
            setFechamento(salvo);
            notify(`Competência ${competenciaLabel} fechada.`);
        } catch (e: unknown) {
            notify('Erro: ' + ((e as Error).message ?? 'Falha ao fechar a competência'), 'error');
        } finally {
            setSalvando(false);
        }
    }

    async function handleReabrir() {
        if (!fechamento) return;
        const ok = await confirm({
            title: `Reabrir a competência ${competenciaLabel}?`,
            message:
                'Os títulos do mês voltam a aceitar lançamento, alteração e exclusão. A reabertura fica registrada ' +
                'com data e autor, e o retrato gravado no fechamento é preservado até um novo fechamento.',
            variant: 'warning',
            confirmLabel: 'Reabrir',
        });
        if (!ok) return;

        setSalvando(true);
        try {
            await costCenterClosingService.reopen(fechamento.id);
            setFechamento({ ...fechamento, status: 'REABERTO', reaberto_em: new Date().toISOString() });
            notify(`Competência ${competenciaLabel} reaberta.`);
        } catch (e: unknown) {
            notify('Erro: ' + ((e as Error).message ?? 'Falha ao reabrir a competência'), 'error');
        } finally {
            setSalvando(false);
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
                            placeholder="Buscar centro de custo..."
                            className="w-full h-9 pl-9 pr-8 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Seletor de Centro de Custo — filtro de FONTE (mesmo vocabulário
                        do filtro "Origem" em ContasPagarParcelas.tsx): não muda o mês
                        que a tela olha, só recorta a tabela a um CC ou a um GRUPO de
                        CCs (ex: "Condomínios"). Dropdown, não segmentado — a lista
                        pode ter dezenas de centros de custo. Opções só com o que TEM
                        título nesta competência (ver `opcoesFiltro`), então escolher
                        qualquer item sempre devolve pelo menos uma linha. */}
                    <div className="relative flex items-center shrink-0">
                        <Tag className="absolute left-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <select
                            value={ccFiltro}
                            onChange={e => setCcFiltro(e.target.value)}
                            disabled={opcoesFiltro.centros.length === 0}
                            className="h-9 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Filtrar por centro de custo ou grupo"
                        >
                            <option value="">Todos os centros de custo</option>
                            {opcoesFiltro.grupos.length > 0 && (
                                <optgroup label="Grupos">
                                    {opcoesFiltro.grupos.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </optgroup>
                            )}
                            <optgroup label="Centros de custo">
                                {opcoesFiltro.centros.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </optgroup>
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

                    {/* Sem toggle grade/lista nesta visão: consolidado contábil só
                        faz sentido em tabela — cards perderiam o alinhamento das
                        colunas de valor, que é o que se lê aqui. */}
                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                            columns={FECHAMENTO_COLUMNS}
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

                {/* Situação do fechamento + ação. Fica na segunda linha da toolbar
                    acoplada (e não na barra de escopo do pai, §5.3) porque não é
                    escopo: é o ESTADO do que a tabela abaixo mostra, e a ação é a
                    que transforma esse estado. */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                        {carregandoFechamento ? (
                            <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />
                        ) : estaFechada ? (
                            <Lock className="w-4 h-4 text-red-600 shrink-0" />
                        ) : (
                            <LockOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                            {/* Situação em texto colorido simples, sem pílula (§8). */}
                            <p className="text-sm font-normal">
                                <span className={estaFechada ? 'text-red-600' : 'text-emerald-700'}>
                                    {carregandoFechamento ? 'Verificando…' : estaFechada ? 'Competência fechada' : 'Competência aberta'}
                                </span>
                                {competenciaLabel && <span className="text-gray-400"> · {competenciaLabel}</span>}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                                {estaFechada
                                    ? `Fechada por ${fechamento?.fechado_por ?? '—'} em ${formatDateBR(fechamento?.fechado_em?.slice(0, 10))}. Os títulos deste mês estão bloqueados.`
                                    : fechamento?.status === 'REABERTO'
                                        ? `Reaberta por ${fechamento.reaberto_por ?? '—'} em ${formatDateBR(fechamento.reaberto_em?.slice(0, 10))}.`
                                        : 'Os títulos deste mês ainda aceitam lançamento e alteração.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {/* Lançamento no condomínio — secundário: não compete com o azul
                            sólido de "Fechar competência" (§17, "único elemento azul
                            sólido da tela"). Sempre visível, desabilitado sem seleção. */}
                        <button
                            onClick={() => setSheetLancamento(true)}
                            disabled={selectedTitulos.length === 0}
                            title={selectedTitulos.length === 0 ? 'Marque títulos de centro de custo de condomínio para lançar.' : undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-700 rounded-[6px] font-medium text-[13px] border border-gray-200 hover:bg-gray-50 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                        >
                            <Building2 className="w-[15px] h-[15px]" />
                            Lançamento{selectedTitulos.length > 0 ? ` (${selectedTitulos.length})` : ''}
                        </button>

                        {/* Ação primária da visão — variante compacta (§17). */}
                        {estaFechada ? (
                            <button
                                onClick={handleReabrir}
                                disabled={salvando}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-700 rounded-[6px] font-medium text-[13px] border border-gray-200 hover:bg-gray-50 transition-all active:scale-95 disabled:opacity-60 shrink-0"
                            >
                                {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <LockOpen className="w-[15px] h-[15px]" />}
                                Reabrir competência
                            </button>
                        ) : (
                            <button
                                onClick={handleFechar}
                                disabled={salvando || !podeFechar || consolidadoVivo.length === 0}
                                title={motivoBloqueio ?? (consolidadoVivo.length === 0 ? 'Não há títulos nesta competência para fechar.' : undefined)}
                                className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                            >
                                {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Lock className="w-[15px] h-[15px]" />}
                                Fechar competência
                            </button>
                        )}
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
                ) : !competencia ? (
                    /* Empty state próprio: sem competência não há mês a consolidar —
                       e "nenhum resultado" mentiria sobre a causa (§12). */
                    <div className="text-center py-12 text-gray-400">
                        <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Escolha uma competência</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            O fechamento é de um mês. Selecione a competência na barra acima.
                        </p>
                        <button
                            onClick={() => onCompetenciaChange(new Date().toISOString().slice(0, 7))}
                            className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
                        >
                            <CalendarDays className="w-[15px] h-[15px]" />
                            Usar o mês atual
                        </button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <Layers className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum título nesta competência</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            {search || ccFiltro
                                ? 'Nenhum centro de custo bate com o filtro.'
                                : 'Não há títulos a pagar com vencimento neste mês.'}
                        </p>
                        {(search || ccFiltro) && (
                            <button
                                onClick={() => { setSearch(''); setCcFiltro(''); }}
                                className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-700 rounded-[6px] font-medium text-[13px] border border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
                            >
                                <X className="w-[15px] h-[15px]" />
                                Limpar filtros
                            </button>
                        )}
                    </div>
                ) : (
                    /* §6.5 — o consolidado pode ter dezenas de centros de custo:
                       container rola em altura própria e o thead fica fixo. */
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-sm text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* Espaçador no fim (§6.1.1 adaptado): esta tabela NÃO tem
                                    coluna de "Ações" — a única ação de linha é expandir, e
                                    o clique na própria linha já faz isso (§9.1). Sem coluna
                                    ancorada à direita, a folga pode ir para o fim. */}
                                <col />
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.map(key => {
                                        const def = FECHAMENTO_COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader
                                                key={key}
                                                colKey={key}
                                                label={def.label}
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
                                    <th aria-hidden="true" className="border-r border-gray-100" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(linha => {
                                    const chave = linha.costCenterId ?? '__sem__';
                                    const expandida = expandidas.has(chave);
                                    const titulos = titulosPorCC.get(chave) ?? [];
                                    return (
                                        <React.Fragment key={chave}>
                                            <tr
                                                onClick={() => toggleExpandida(chave)}
                                                className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${expandida ? 'bg-blue-50/40' : ''}`}
                                            >
                                                {tableColumns.orderedVisibleColumns.map(key => (
                                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                                        {renderFechamentoCell(key, linha, expandida)}
                                                    </td>
                                                ))}
                                                <td aria-hidden="true" className="border-r border-gray-100"></td>
                                            </tr>

                                            {/* Detalhe: os títulos que compõem a linha. Vem da lista
                                                viva — o retrato gravado guarda totais, não títulos. */}
                                            {expandida && (
                                                <tr className="bg-gray-50/60">
                                                    <td colSpan={tableColumns.orderedVisibleColumns.length + 1} className="px-6 py-3">
                                                        {titulos.length === 0 ? (
                                                            <p className="text-sm font-normal text-gray-400">
                                                                Sem títulos vivos para este centro de custo — o retrato foi gravado no fechamento.
                                                            </p>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                {/* Checkbox só quando há título de condomínio no bloco (§10:
                                                                    "checkboxes SÓ nas linhas que permitem ações em lote") */}
                                                                {titulos.some(isCondominioTitulo) && (
                                                                    <div className="flex items-center justify-between text-xs text-gray-400 pb-1 mb-1 border-b border-gray-200">
                                                                        <span>Títulos deste centro de custo pertencem a um condomínio — marque os que serão lançados.</span>
                                                                        <button
                                                                            onClick={() => toggleTodosDoCentro(chave, titulos)}
                                                                            className="text-blue-600 hover:text-blue-800 font-medium shrink-0 ml-3"
                                                                        >
                                                                            Selecionar todos
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {titulos.map((t, i) => {
                                                                    const selecionavel = isCondominioTitulo(t);
                                                                    const jaLancado = rateadas.has(t.id);
                                                                    return (
                                                                        <div key={t.id} className="flex items-center gap-3 text-sm font-normal">
                                                                            {selecionavel ? (
                                                                                <input
                                                                                    type="checkbox"
                                                                                    title={jaLancado ? 'Já lançado num rateio deste condomínio.' : 'Dica: segure Shift e clique para selecionar um intervalo'}
                                                                                    checked={selectedIds.has(t.id)}
                                                                                    disabled={jaLancado}
                                                                                    onChange={e => handleTituloCheck(chave, t.id, i, (e.nativeEvent as MouseEvent).shiftKey, titulos)}
                                                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 shrink-0"
                                                                                />
                                                                            ) : (
                                                                                <span className="w-4 shrink-0" aria-hidden="true" />
                                                                            )}
                                                                            <span className="text-gray-700 truncate flex-1 min-w-0">
                                                                                {t.credor_display || payableParty(t)}
                                                                                <span className="text-gray-400"> · {t.description || 'Sem descrição'}</span>
                                                                            </span>
                                                                            <span className="text-gray-400 shrink-0">{origemLabel(t.source_system)}</span>
                                                                            <span className="text-gray-600 shrink-0 w-24 text-center">{formatDateBR(t.due_date)}</span>
                                                                            <span className={`shrink-0 w-24 text-center ${t.effective_status === 'PAGO' ? 'text-green-700' : t.effective_status === 'VENCIDO' ? 'text-red-600' : 'text-gray-500'}`}>
                                                                                {STATUS_PT[t.effective_status] ?? t.effective_status}
                                                                            </span>
                                                                            <span className="text-sm font-medium text-gray-800 shrink-0 w-32 text-right">
                                                                                {formatMoney(t.amount ?? 0)}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                {/* Célula única: alinhar cada total à sua coluna com colSpan
                                    quebra assim que o usuário esconde uma coluna (§6). */}
                                <tr className="bg-gray-50 border-t border-gray-200">
                                    <td colSpan={tableColumns.orderedVisibleColumns.length + 1} className="px-6 py-2">
                                        <div className="flex flex-wrap items-center justify-between gap-4">
                                            <span className="text-sm text-gray-500">
                                                {filtered.length} centro{filtered.length !== 1 ? 's' : ''} de custo · {totais.titulos} título{totais.titulos !== 1 ? 's' : ''}
                                            </span>
                                            <span className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                                <span>previsto <span className="text-sm font-medium text-gray-900">{formatMoney(totais.previsto)}</span></span>
                                                <span>pago <span className="text-sm font-medium text-green-700">{formatMoney(totais.pago)}</span></span>
                                                <span>em aberto <span className="text-sm font-medium text-amber-700">{formatMoney(totais.aberto)}</span></span>
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>

        {/* Barra de ações em lote — fixa no rodapé, paleta azul (§10). A ação
            de lançar mora só no botão da toolbar (acima) — repeti-la aqui
            abriria dois caminhos para o mesmo gesto. */}
        {selectedTitulos.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-[10px] shadow-lg shadow-blue-900/20">
                <span className="flex-1 text-sm font-bold whitespace-nowrap">
                    {selectedTitulos.length} selecionado{selectedTitulos.length !== 1 ? 's' : ''}
                    <span className="ml-2 font-normal opacity-75">· {formatMoney(selectedTotal)}</span>
                </span>
                <button
                    onClick={clearSelection}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-500 rounded-[6px] text-[13px] font-medium hover:bg-blue-400 transition-all active:scale-95"
                >
                    <X className="w-3.5 h-3.5" />
                    Desmarcar
                </button>
            </div>
        )}

        <LancarNoCondominioSheet
            open={sheetLancamento}
            onClose={() => setSheetLancamento(false)}
            payables={selectedTitulos}
            competencia={competencia}
            onLancado={handleLancado}
            notify={notify}
        />
      </>
    );
}
