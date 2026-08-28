import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Users, Plus, Save, Loader2, AlertCircle, CheckCircle2, ChevronRight,
    Calendar, Copy, DollarSign, RefreshCw, MoveHorizontal, Search, FileText,
    Target, Banknote, Percent, Wand2,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { payrollService, Worksite, EmployeeAllocation, EmployeeCostSplit } from '../services/payrollService';
import { derivarAlocacaoPorCentroDeCusto, AlocacaoDerivada } from '../lib/payrollUIHelpers';
import { Employee } from '../services/laborService';
import PaystubModal from './PaystubModal';
import { KpiCard } from './ui/KpiCard';
import { formatMoney } from './ui/Format';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import {
    ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton,
    SortableHeader, usePersistedState,
} from './ui/TableUtils';

// ── Local types ────────────────────────────────────────────────────────────────
interface ClassificationItem {
    id: string;
    name: string;
    code?: string;
    /** Obra vinculada ao centro de custo (`cost_centers_v2.project_id`). Só o
     *  Centro de Custo tem; no Plano de Contas vem sempre indefinido. */
    project_id?: string | null;
}

/** Linha do rateio contábil em edição (ids vazios = "não definido"). */
interface CostSplitRow {
    cost_center_id: string;
    plano_de_contas_id: string;
    percent: number;
}

interface ClosedPayrollResult {
    run_id: string;
    run_period: string;
    run_type: string;
    gross: number;
    discounts: number;
    net: number;
    employer_cost: number;
}

/** Uma linha da tabela: o colaborador e o que ele tem no mês. */
interface AllocationRow {
    employee: Employee;
    cargo: string;
    obras: number;
    percentAlocado: number;
    rateio: string;            // "60/40", o nome da dimensão única, ou '' quando não há rateio
    rateioDetalhe: string;     // "60,00% CC A · 40,00% CC B" — vai no title da célula
    centroCusto: { texto: string; detalhe: string; herdado: boolean };
    planoContas: { texto: string; detalhe: string; herdado: boolean };
    custoFolha: number | null; // null = sem folha fechada no mês
    /** Alocação que sai do centro de custo vinculado a uma obra (vazia se não há). */
    derivada: AlocacaoDerivada[];
}

interface LaborAllocationsProps {
    orgId: string | null;
    employees: Employee[];
    onRefresh: () => void;
}

// §2: colunas fora do componente. Uma linha por COLABORADOR — o rateio contábil
// é por pessoa, não por obra, então repetir o colaborador por obra deixaria a
// coluna de rateio sem lugar.
const COLUMNS: ColumnConfig[] = [
    { key: 'employee', label: 'Colaborador', sortable: true },
    // O cargo era a segunda linha da célula do colaborador. Virou coluna
    // própria a pedido do usuário (2026-08-28): empilhado, não dava para
    // ordenar nem esconder, e engordava a altura de TODA linha da tabela.
    { key: 'cargo', label: 'Cargo', sortable: true },
    { key: 'obras', label: 'Obras', sortable: true },
    { key: 'percent', label: '% alocado', sortable: true },
    // Duas dimensões DISTINTAS: Centro de Custo sai de `cost_centers_v2`, Plano
    // de Contas de `plano_de_contas`. A coluna Rateio ao lado mostra COMO o
    // custo se divide; estas mostram PARA ONDE ele vai.
    { key: 'centro_custo', label: 'Centro de Custo', sortable: true },
    { key: 'plano_contas', label: 'Plano de Contas', sortable: true },
    { key: 'rateio', label: 'Rateio contábil', sortable: true },
    { key: 'custo', label: 'Custo da folha', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const DEFAULT_COL_WIDTHS: Record<string, number> = {
    employee: 220, cargo: 170, obras: 100, percent: 130, centro_custo: 190, plano_contas: 190,
    rateio: 140, custo: 160, actions: 90,
};

const COLUMN_HEADERS: Record<string, { label: string; className: string }> = {
    employee:     { label: 'Colaborador',     className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    cargo:        { label: 'Cargo',           className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    obras:        { label: 'Obras',           className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
    percent:      { label: '% alocado',       className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
    centro_custo: { label: 'Centro de Custo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    plano_contas: { label: 'Plano de Contas', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    rateio:       { label: 'Rateio contábil', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
    custo:        { label: 'Custo da folha',  className: 'px-6 py-2 border-r border-gray-100 text-right overflow-hidden' },
};

/**
 * Classificação EFETIVA do colaborador no mês, para as colunas Centro de Custo
 * e Plano de Contas. Segue a mesma escada do `resolvePayrollShares` no service:
 *
 *   rateio do mês → cadastro do colaborador → (vazio: herda o ciclo de folha)
 *
 * Com o rateio apontando para dimensões diferentes, não existe um valor único:
 * a célula mostra "Vários (N)" e o `title` lista quais. O texto é o mesmo que a
 * folha vai usar — a coluna não pode dizer uma coisa e o lançamento outra.
 */
function dimensaoEfetiva(
    linhas: EmployeeCostSplit[],
    campo: 'cost_center_id' | 'plano_de_contas_id',
    doCadastro: string | null | undefined,
    nome: (id?: string | null) => string,
): { texto: string; detalhe: string; herdado: boolean } {
    const ids = [...new Set(linhas.map(l => l[campo]).filter(Boolean) as string[])];

    if (ids.length === 1) {
        return { texto: nome(ids[0]) || '—', detalhe: nome(ids[0]), herdado: false };
    }
    if (ids.length > 1) {
        const nomes = ids.map(id => nome(id) || '(sem nome)');
        return { texto: `Vários (${ids.length})`, detalhe: nomes.join(' · '), herdado: false };
    }
    if (doCadastro) {
        const n = nome(doCadastro);
        return { texto: n || '—', detalhe: `${n} — do cadastro do colaborador`, herdado: true };
    }
    return { texto: '', detalhe: '', herdado: false };
}

/**
 * Mensagem de erro legível a partir do que o Supabase devolve.
 *
 * `PostgrestError` é um OBJETO simples, não uma instância de `Error`: um
 * `err instanceof Error ? err.message : 'Falha ao salvar'` cai sempre no texto
 * genérico e joga fora `message`, `code` e `hint`. Foi o que escondeu por
 * completo o `22023 cannot get array length of a scalar` do salvamento de
 * alocação (2026-08-24) — a tela dizia só "Falha ao salvar a alocação".
 */
function mensagemDeErro(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    if (err && typeof err === 'object') {
        const e = err as { message?: string; details?: string; hint?: string; code?: string };
        const partes = [e.message, e.details, e.hint].filter(Boolean);
        if (partes.length > 0) return `${partes.join(' — ')}${e.code ? ` (${e.code})` : ''}`;
    }
    return fallback;
}

/**
 * Marca os colaboradores já alocados automaticamente numa competência.
 *
 * É uma trava contra REAPLICAR, não um histórico: quem apaga a alocação de
 * propósito não pode vê-la ressuscitar no próximo carregamento da tela. Guarda
 * as 12 competências mais recentes — o suficiente para um ano de folha.
 */
function registrarAutoAplicado(
    atual: Record<string, string[]>,
    periodo: string,
    ids: string[],
): Record<string, string[]> {
    const proximo = { ...atual, [periodo]: [...new Set([...(atual[periodo] || []), ...ids])] };
    const competencias = Object.keys(proximo).sort();
    while (competencias.length > 12) delete proximo[competencias.shift() as string];
    return proximo;
}

/** 'YYYY-MM' → '06/2026'. Sem `new Date`: 'YYYY-MM' cru volta um mês em fusos negativos. */
function formatarCompetencia(periodo: string): string {
    const [ano, mes] = periodo.split('-');
    return `${mes}/${ano}`;
}

/**
 * Resumo do rateio para a coluna da tabela.
 *
 * ⚠️ Até 2026-08-24 esta função devolvia vazio para quem tinha UMA linha, sob o
 * argumento de que "uma linha não é rateio, é classificação". Na tela isso
 * virou um travessão para quem tinha acabado de cadastrar 100% num centro de
 * custo — o usuário reportou a coluna como se não mostrasse nada. Toda linha
 * gravada aparece: com uma, o nome da dimensão; com várias, os percentuais.
 */
function resumoDoRateio(
    linhas: EmployeeCostSplit[],
    nomeCc: (id?: string | null) => string,
    nomePc: (id?: string | null) => string,
): { texto: string; detalhe: string } {
    if (linhas.length === 0) return { texto: '', detalhe: '' };

    const ordenadas = [...linhas].sort((a, b) => b.percent - a.percent);
    const rotuloDa = (l: EmployeeCostSplit) =>
        nomeCc(l.cost_center_id) || nomePc(l.plano_de_contas_id) || 'Sem dimensão';
    const detalhe = ordenadas
        .map(l => `${Number(l.percent).toFixed(2).replace('.', ',')}% ${rotuloDa(l)}`)
        .join(' · ');

    // Só a DIVISÃO: "100%" ou "60/40". O nome das dimensões tem colunas
    // próprias (Centro de Custo / Plano de Contas) desde 2026-08-24 — repetir
    // aqui deixaria três colunas dizendo a mesma coisa.
    return {
        texto: ordenadas.length === 1
            ? `${Math.round(ordenadas[0].percent)}%`
            : ordenadas.map(l => `${Math.round(l.percent)}`).join('/'),
        detalhe,
    };
}

const LaborAllocations: React.FC<LaborAllocationsProps> = ({ orgId, employees, onRefresh }) => {
    // ── Escopo e filtros (§3: persistidos) ────────────────────────────────────
    const [selectedPeriod, setSelectedPeriod] = usePersistedState<string>('laborAllocations:period', new Date().toISOString().slice(0, 7));
    const [search, setSearch] = usePersistedState<string>('laborAllocations:search', '');

    // ── Dados do mês, carregados em LOTE (uma query por dimensão) ─────────────
    const [worksites, setWorksites] = useState<Worksite[]>([]);
    const [costCenters, setCostCenters] = useState<ClassificationItem[]>([]);
    // ⚠️ Plano de Contas (`plano_de_contas`) é dimensão DIFERENTE de Categoria
    // Financeira (`financial_categories`). Não misturar.
    const [planoContas, setPlanoContas] = useState<ClassificationItem[]>([]);
    const [allocByEmployee, setAllocByEmployee] = useState<Record<string, EmployeeAllocation[]>>({});
    const [splitsByEmployee, setSplitsByEmployee] = useState<Record<string, EmployeeCostSplit[]>>({});
    const [custoByEmployee, setCustoByEmployee] = useState<Record<string, { gross: number; net: number; employer_cost: number; run_id: string }>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    /** Competência mais recente COM rateio — para não esconder dado de outro mês. */
    const [ultimaComRateio, setUltimaComRateio] = useState<string | null>(null);

    // ── Painel lateral ────────────────────────────────────────────────────────
    const [sheetEmployee, setSheetEmployee] = useState<Employee | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // Sufixo `.v2` porque a coluna Cargo entrou depois: a preferência antiga
    // guarda a ordem das 8 colunas de então, e uma chave nova entra no FIM dela
    // — o Cargo apareceria depois de "Custo da folha", longe do nome. Trocar a
    // chave faz a tela renascer com a ordem/largura corretas; o custo é perder
    // a ordenação e as larguras que o usuário tenha ajustado nesta aba.
    const tableColumns = useTableColumns(COLUMNS, 'laborAllocationsColumns.v2');
    const cols = useResizableColumns(DEFAULT_COL_WIDTHS, 'laborAllocationsColWidths.v2');

    // ── Loaders ───────────────────────────────────────────────────────────────
    const loadCatalogs = useCallback(async () => {
        // Sem guard por organização: em "Todas" os services não filtram e a RLS
        // recorta (REGRA #5). allSettled para a falha de um cadastro não zerar
        // os outros.
        const [w, cc, pc] = await Promise.allSettled([
            payrollService.listWorksites(orgId),
            payrollService.listCostCenters(orgId),
            payrollService.listPlanoContas(orgId),
        ]);
        if (w.status === 'fulfilled') setWorksites(w.value);
        else console.error('[LaborAllocations] Falha ao carregar obras:', w.reason);
        if (cc.status === 'fulfilled') setCostCenters(cc.value);
        else console.error('[LaborAllocations] Falha ao carregar Centro de Custo:', cc.reason);
        if (pc.status === 'fulfilled') setPlanoContas(pc.value);
        else console.error('[LaborAllocations] Falha ao carregar Plano de Contas:', pc.reason);
    }, [orgId]);

    const loadMonth = useCallback(async () => {
        const ids = employees.map(e => e.id).filter(Boolean);
        if (ids.length === 0) {
            setAllocByEmployee({}); setSplitsByEmployee({}); setCustoByEmployee({});
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            setLoadError(null);
            const [alloc, splits, custos, ultima] = await Promise.all([
                payrollService.listAllocationsForEmployees(ids, selectedPeriod),
                payrollService.listCostSplitsForEmployees(ids, selectedPeriod),
                payrollService.listClosedResultsForEmployees(orgId, ids, selectedPeriod),
                payrollService.ultimaCompetenciaComRateio(ids).catch(() => null),
            ]);
            setAllocByEmployee(alloc);
            setSplitsByEmployee(splits);
            setCustoByEmployee(custos);
            setUltimaComRateio(ultima);
        } catch (err) {
            console.error(err);
            setLoadError('Não foi possível carregar as alocações do mês.');
        } finally {
            setLoading(false);
        }
    }, [employees, selectedPeriod, orgId]);

    useEffect(() => { loadCatalogs(); }, [loadCatalogs]);
    useEffect(() => { loadMonth(); }, [loadMonth]);

    // ── Linhas ────────────────────────────────────────────────────────────────
    const nomeCc = useCallback((id?: string | null) => (id ? costCenters.find(c => c.id === id)?.name ?? '' : ''), [costCenters]);
    const nomePc = useCallback((id?: string | null) => (id ? planoContas.find(p => p.id === id)?.name ?? '' : ''), [planoContas]);
    const nomeObra = useCallback((id?: string | null) => (id ? worksites.find(w => w.id === id)?.name ?? '' : ''), [worksites]);

    /**
     * Obra do centro de custo — o gatilho da alocação automática.
     *
     * Só devolve id que está em `worksites`: essa lista sai de
     * `payrollService.listWorksites`, que já aplica as REGRAS #2 e #3 (nada de
     * projeto de sistema, nada de orçamento/planejamento). Um centro de custo
     * apontando para um projeto desses não vira alocação.
     */
    const obraDoCentroDeCusto = useCallback((ccId: string): string | null => {
        const projectId = costCenters.find(c => c.id === ccId)?.project_id;
        if (!projectId) return null;
        return worksites.some(w => w.id === projectId) ? projectId : null;
    }, [costCenters, worksites]);

    const rows: AllocationRow[] = useMemo(() => employees.map(emp => {
        const alocacoes = allocByEmployee[emp.id] || [];
        const splits = splitsByEmployee[emp.id] || [];
        const rateio = resumoDoRateio(splits, nomeCc, nomePc);
        return {
            employee: emp,
            cargo: emp.role || '',
            obras: alocacoes.length,
            percentAlocado: alocacoes.reduce((s, a) => s + (a.allocation_percent || 0), 0),
            rateio: rateio.texto,
            rateioDetalhe: rateio.detalhe,
            centroCusto: dimensaoEfetiva(splits, 'cost_center_id', emp.cost_center_id, nomeCc),
            planoContas: dimensaoEfetiva(splits, 'plano_de_contas_id', emp.plano_de_contas_id, nomePc),
            custoFolha: custoByEmployee[emp.id]?.employer_cost ?? null,
            derivada: derivarAlocacaoPorCentroDeCusto(splits, emp.cost_center_id, obraDoCentroDeCusto),
        };
    }), [employees, allocByEmployee, splitsByEmployee, custoByEmployee, nomeCc, nomePc, obraDoCentroDeCusto]);

    // ── Alocação automática pela obra do centro de custo ──────────────────────
    /**
     * Pedido do usuário (2026-08-28): "quando o centro de custo estiver
     * vinculado a uma obra, faça alocação automática e caso o usuário queira
     * alterar ele poderá". Três travas para que "automático" não vire
     * "atropela":
     *
     *  1. só entra quem está SEM nenhuma alocação no mês — nada definido à mão
     *     é sobrescrito, e alterar depois no painel prevalece para sempre;
     *  2. o que foi aplicado fica registrado por competência
     *     (`registrarAutoAplicado`), então apagar de propósito não ressuscita;
     *  3. um INSERT em lote — a lista traz a folha inteira, e uma chamada por
     *     colaborador seria um N+1 no carregamento da tela.
     */
    const [autoAplicado, setAutoAplicado] = usePersistedState<Record<string, string[]>>('laborAllocations:autoAplicado', {});
    const aplicandoAuto = useRef(false);
    /** Falhas ficam SÓ nesta sessão (`competência|colaborador`): um erro de rede
     *  não pode desligar a alocação automática para sempre neste navegador —
     *  mas também não pode virar uma tentativa por render. */
    const falhouNaSessao = useRef<Set<string>>(new Set());

    useEffect(() => {
        // Catálogos ainda em voo: sem eles `derivada` é sempre vazia e a
        // varredura não significa nada.
        if (loading || aplicandoAuto.current) return;
        if (worksites.length === 0 || costCenters.length === 0) return;

        const jaTocados = autoAplicado[selectedPeriod] || [];
        const pendentes = rows.filter(r =>
            r.obras === 0 &&
            r.derivada.length > 0 &&
            !jaTocados.includes(r.employee.id) &&
            !falhouNaSessao.current.has(`${selectedPeriod}|${r.employee.id}`),
        );
        if (pendentes.length === 0) return;

        aplicandoAuto.current = true;
        const ids = pendentes.map(r => r.employee.id);
        (async () => {
            try {
                await payrollService.insertAutoAllocations(
                    selectedPeriod,
                    pendentes.flatMap(r => r.derivada.map(d => ({ employee_id: r.employee.id, ...d }))),
                );
                // §22: recarrega só quem foi tocado, não a tabela inteira.
                const alloc = await payrollService.listAllocationsForEmployees(ids, selectedPeriod);
                setAllocByEmployee(prev => {
                    const next = { ...prev };
                    ids.forEach(id => { next[id] = alloc[id] || []; });
                    return next;
                });
                setAutoAplicado(prev => registrarAutoAplicado(prev, selectedPeriod, ids));
                notify(pendentes.length === 1
                    ? `${pendentes[0].employee.name} foi alocado automaticamente na obra do centro de custo.`
                    : `${pendentes.length} colaboradores alocados automaticamente na obra do centro de custo.`);
            } catch (err) {
                console.error('[LaborAllocations] Falha na alocação automática:', err);
                ids.forEach(id => falhouNaSessao.current.add(`${selectedPeriod}|${id}`));
                notify(mensagemDeErro(err, 'Falha ao alocar automaticamente pela obra do centro de custo.'), 'error');
            } finally {
                aplicandoAuto.current = false;
            }
        })();
    }, [rows, loading, worksites, costCenters, selectedPeriod, autoAplicado, setAutoAplicado]);

    const filteredRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? rows : rows.filter(r =>
            r.employee.name?.toLowerCase().includes(term) ||
            r.cargo.toLowerCase().includes(term) ||
            r.centroCusto.texto.toLowerCase().includes(term) ||
            r.planoContas.texto.toLowerCase().includes(term)
        );
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'employee': return dir * (a.employee.name || '').localeCompare(b.employee.name || '');
                case 'cargo':    return dir * a.cargo.localeCompare(b.cargo);
                case 'obras':    return dir * (a.obras - b.obras);
                case 'percent':  return dir * (a.percentAlocado - b.percentAlocado);
                case 'centro_custo': return dir * a.centroCusto.texto.localeCompare(b.centroCusto.texto);
                case 'plano_contas': return dir * a.planoContas.texto.localeCompare(b.planoContas.texto);
                case 'rateio':   return dir * a.rateio.localeCompare(b.rateio);
                case 'custo':    return dir * ((a.custoFolha ?? 0) - (b.custoFolha ?? 0));
                default: return 0;
            }
        });
    }, [rows, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    // §6.1: largura da tabela é a soma exata das colunas visíveis, nunca w-full.
    const tableTotalWidth = tableColumns.orderedVisibleColumns.reduce((sum, key) => sum + cols.getWidth(key), 0);

    // ── KPIs (§4) — resumo do mês inteiro, não do recorte da busca ────────────
    const semAlocacao = rows.filter(r => r.percentAlocado <= 0).length;
    const comRateio   = rows.filter(r => r.rateio).length;
    const custoDoMes  = rows.reduce((s, r) => s + (r.custoFolha ?? 0), 0);

    /** §22: depois de salvar no painel, recarrega SÓ o colaborador tocado. */
    const refreshEmployee = async (empId: string) => {
        const [alloc, splits] = await Promise.all([
            payrollService.listAllocationsForEmployees([empId], selectedPeriod),
            payrollService.listCostSplitsForEmployees([empId], selectedPeriod),
        ]);
        setAllocByEmployee(prev => ({ ...prev, [empId]: alloc[empId] || [] }));
        setSplitsByEmployee(prev => ({ ...prev, [empId]: splits[empId] || [] }));
    };

    const renderCell = (key: string, row: AllocationRow): React.ReactNode => {
        switch (key) {
            case 'employee':
                // Só o nome: o cargo saiu daqui para a coluna própria 'cargo'.
                return (
                    <span className="block truncate text-sm font-normal text-gray-700" title={row.employee.name}>
                        {row.employee.name}
                    </span>
                );
            case 'cargo':
                return row.cargo
                    ? <span className="block truncate text-sm font-normal text-gray-600" title={row.cargo}>{row.cargo}</span>
                    : <span className="text-sm font-normal text-gray-400">Sem cargo</span>;
            case 'obras':
                return (
                    <div className="text-right">
                        {row.obras > 0
                            ? <span className="text-sm font-normal text-gray-600">{row.obras}</span>
                            : <span className="text-sm font-normal text-gray-300">—</span>}
                    </div>
                );
            case 'percent': {
                // Cor é informação: quem está sem alocação ou passou de 100%
                // precisa saltar numa varredura da lista.
                //
                // ⚠️ "Sem alocação" NÃO usa text-gray-300: sobre o branco da
                // linha ele some, e a coluna inteira foi reportada como vazia em
                // 2026-08-24 (o mês não tinha alocação nenhuma, então TODA linha
                // caía nesse caso). Mesmo motivo do §6.8 do guia. Âmbar porque é
                // pendência real: sem obra, o custo vira Administrativo.
                const cor = row.percentAlocado <= 0 ? 'text-amber-700'
                    : row.percentAlocado > 100 ? 'text-rose-700'
                    : row.percentAlocado < 100 ? 'text-amber-700'
                    : 'text-emerald-700';
                return (
                    <div className="text-right">
                        <span className={`text-sm font-normal ${cor}`}>
                            {row.percentAlocado <= 0 ? 'Sem alocação' : `${row.percentAlocado.toFixed(0)}%`}
                        </span>
                    </div>
                );
            }
            // Herdado do cadastro do colaborador fica atenuado: a coluna diz o
            // valor efetivo, mas o olho precisa distinguir o que foi definido
            // NESTE mês do que veio de trás.
            case 'centro_custo':
                return row.centroCusto.texto
                    ? <span className={`block truncate text-sm font-normal ${row.centroCusto.herdado ? 'text-gray-500' : 'text-gray-700'}`} title={row.centroCusto.detalhe}>{row.centroCusto.texto}</span>
                    : <span className="text-sm font-normal text-gray-400" title="Sem classificação própria: vale a do ciclo de folha">Da folha</span>;
            case 'plano_contas':
                return row.planoContas.texto
                    ? <span className={`block truncate text-sm font-normal ${row.planoContas.herdado ? 'text-gray-500' : 'text-gray-700'}`} title={row.planoContas.detalhe}>{row.planoContas.texto}</span>
                    : <span className="text-sm font-normal text-gray-400" title="Sem classificação própria: vale a do ciclo de folha">Da folha</span>;
            case 'rateio':
                return row.rateio
                    ? <span className="block truncate text-sm font-normal text-indigo-600" title={row.rateioDetalhe}>{row.rateio}</span>
                    : <span className="text-sm font-normal text-gray-400">—</span>;
            case 'custo':
                return (
                    <div className="text-right">
                        {row.custoFolha != null
                            ? <span className="text-sm font-medium text-gray-800">{formatMoney(row.custoFolha)}</span>
                            : <span className="text-sm font-normal text-gray-300">—</span>}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Título e abas vivem em LaborPayroll — esta tela é a aba Alocações. */}
            {loadError && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-[10px] flex items-start gap-3 text-amber-800 text-sm font-medium">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    {loadError}
                </div>
            )}

            {/* 3. KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <KpiCard label="Colaboradores" value={`${rows.length}`} icon={<Users className="w-5 h-5" />} color="indigo" />
                <KpiCard label="Sem alocação" value={`${semAlocacao}`} sub="Custo cai em Administrativo" icon={<Target className="w-5 h-5" />} color="amber" />
                <KpiCard label="Com rateio contábil" value={`${comRateio}`} icon={<Percent className="w-5 h-5" />} color="violet" />
                <KpiCard label="Custo do mês" value={formatMoney(custoDoMes)} sub="Folhas fechadas do período" icon={<DollarSign className="w-5 h-5" />} color="emerald" />
            </div>

            {/* 4. Toolbar de botões — ESCOPO (§5.3). A competência decide QUAL
                conjunto a tela mostra; a busca, logo abaixo, decide qual linha.
                As duas não podem dividir a mesma barra. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="alloc-competencia" className="text-sm font-medium text-gray-500">Competência</label>
                    <input
                        id="alloc-competencia"
                        type="month"
                        value={selectedPeriod}
                        onChange={e => setSelectedPeriod(e.target.value)}
                        className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                    />
                </div>

                {/* A tela abre no mês corrente. Sem este atalho, um rateio
                    cadastrado em outro mês fica invisível e parece que não
                    salvou — foi o relato de 2026-08-24. */}
                {!loading && comRateio === 0 && ultimaComRateio && ultimaComRateio !== selectedPeriod && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">
                            Nenhum rateio contábil em {formatarCompetencia(selectedPeriod)}.
                        </span>
                        <button
                            onClick={() => setSelectedPeriod(ultimaComRateio)}
                            className="h-9 px-3.5 bg-indigo-50 text-indigo-600 rounded-[6px] hover:bg-indigo-600 hover:text-white font-medium text-[13px] transition-all active:scale-95"
                        >
                            Ver {formatarCompetencia(ultimaComRateio)}
                        </button>
                    </div>
                )}
            </div>

            {/* 5. Tabela com toolbar acoplada (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por colaborador ou função..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                        </div>

                        <button
                            onClick={() => { loadMonth(); onRefresh(); }}
                            title="Atualizar"
                            className="h-9 w-9 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-[6px] hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shrink-0"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>

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
                            {/* Autofit sob comando explícito — nunca automático (§6.1.2) */}
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

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="text-center py-12">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum colaborador encontrado</h3>
                        <p className="text-sm text-gray-500">Ajuste a busca ou a competência selecionada.</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table ref={cols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: '100%' }}>
                            <colgroup>
                                {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                    <col key={key} data-col-key={key} style={{ width: `${cols.getWidth(key)}px` }} />
                                ))}
                                {/* espaçador — absorve a folga ANTES de "Ações" (§6.1.1) */}
                                <col />
                                <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
                            </colgroup>
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => {
                                        const def = COLUMN_HEADERS[key];
                                        if (!def) return null;
                                        return (
                                            <SortableHeader
                                                key={key}
                                                colKey={key}
                                                label={def.label}
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
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500 relative overflow-hidden">
                                            Ações
                                            <cols.ResizeHandle colKey="actions" />
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRows.map(row => (
                                    <tr
                                        key={row.employee.id}
                                        onClick={() => setSheetEmployee(row.employee)}
                                        className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                                    >
                                        {tableColumns.orderedVisibleColumns.filter(key => key !== 'actions').map(key => (
                                            <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 overflow-hidden">
                                                {renderCell(key, row)}
                                            </td>
                                        ))}
                                        <td aria-hidden="true" className="border-r border-gray-100"></td>
                                        {tableColumns.visibleColumns.includes('actions') && (
                                            <td className="px-6 py-2.5 text-right">
                                                {/* §9.1: o clique na linha já é a ação dominante
                                                    (abrir o painel); aqui fica só a seta. */}
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-0.5 transition-transform" />
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {sheetEmployee && (
                <AllocationSheet
                    employee={sheetEmployee}
                    orgId={orgId}
                    period={selectedPeriod}
                    worksites={worksites}
                    costCenters={costCenters}
                    planoContas={planoContas}
                    obraDoCentroDeCusto={obraDoCentroDeCusto}
                    nomeObra={nomeObra}
                    onClose={() => setSheetEmployee(null)}
                    onSaved={async (empId) => { await refreshEmployee(empId); }}
                    onNotify={notify}
                />
            )}

            {/* 13. Toast */}
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

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL LATERAL — alocação por obra, rateio contábil e lançamento financeiro
// ═══════════════════════════════════════════════════════════════════════════
// Era a metade direita da tela em master-detail. Virou `Sheet` quando a lista
// virou tabela (UI_PATTERNS: painel lateral é o padrão para editar item de
// lista sem perder o contexto).

interface AllocationSheetProps {
    employee: Employee;
    orgId: string | null;
    period: string;
    worksites: Worksite[];
    costCenters: ClassificationItem[];
    planoContas: ClassificationItem[];
    /** Obra vinculada ao centro de custo, já filtrada pelas REGRAS #2/#3. */
    obraDoCentroDeCusto: (costCenterId: string) => string | null;
    nomeObra: (id?: string | null) => string;
    onClose: () => void;
    onSaved: (employeeId: string) => Promise<void> | void;
    onNotify: (message: string, type?: 'success' | 'error') => void;
}

type AllocationDraft = Omit<EmployeeAllocation, 'id' | 'created_at' | 'reference_period'>;

const AllocationSheet: React.FC<AllocationSheetProps> = ({
    employee, orgId, period, worksites, costCenters, planoContas,
    obraDoCentroDeCusto, nomeObra, onClose, onSaved, onNotify,
}) => {
    const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
    const [splits, setSplits] = useState<CostSplitRow[]>([]);
    const [closedResults, setClosedResults] = useState<ClosedPayrollResult[]>([]);
    const [individualizadoItems, setIndividualizadoItems] = useState<{ code: string; name: string; amount: number; dia_lancamento: number | null }[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<'alloc' | 'splits' | 'finance' | null>(null);
    const [copying, setCopying] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [paystubRunId, setPaystubRunId] = useState<string | null>(null);

    const closedResult = closedResults.find(r => r.run_type === 'mensal') ?? closedResults[0] ?? null;
    const totalAlocado = allocations.reduce((s, a) => s + (a.allocation_percent || 0), 0);
    const totalRateado = splits.reduce((s, l) => s + (l.percent || 0), 0);

    // A mesma derivação da lista, mas sobre o rateio EM EDIÇÃO: mexer no rateio
    // aqui já muda a obra que o botão vai aplicar.
    const derivada = useMemo(
        () => derivarAlocacaoPorCentroDeCusto(splits, employee.cost_center_id, obraDoCentroDeCusto),
        [splits, employee.cost_center_id, obraDoCentroDeCusto],
    );
    const derivadaTexto = derivada
        .map(d => `${d.allocation_percent.toFixed(0)}% ${nomeObra(d.project_id) || 'obra sem nome'}`)
        .join(' · ');

    /** Substitui a alocação em edição pela que sai do centro de custo. Não grava
     *  — o usuário confere e clica em Salvar, como no "Mês anterior". */
    const aplicarDerivada = () => {
        setAllocations(derivada.map(d => ({
            employee_id: employee.id,
            project_id: d.project_id,
            allocation_percent: d.allocation_percent,
        })));
        onNotify('Alocação preenchida pela obra do centro de custo. Salve para confirmar.');
    };

    useEffect(() => {
        let cancelado = false;
        (async () => {
            try {
                setLoading(true);
                setErro(null);
                const [alloc, splitRows, results] = await Promise.all([
                    payrollService.listAllocations(employee.id, period),
                    payrollService.listCostSplits(employee.id, period),
                    payrollService.getClosedResultsForEmployee(orgId, employee.id, period),
                ]);
                if (cancelado) return;
                setAllocations(alloc.map(a => ({
                    employee_id: a.employee_id,
                    project_id: a.project_id,
                    allocation_percent: a.allocation_percent,
                })));
                setSplits(splitRows.map(s => ({
                    cost_center_id: s.cost_center_id ?? '',
                    plano_de_contas_id: s.plano_de_contas_id ?? '',
                    percent: s.percent,
                })));
                setClosedResults(results);

                const mensal = results.find(r => r.run_type === 'mensal') ?? results[0];
                if (mensal?.run_id) {
                    const itens = await payrollService.listIndividualizadoItemsForEmployee(mensal.run_id, employee.id);
                    if (!cancelado) setIndividualizadoItems(itens || []);
                } else if (!cancelado) {
                    setIndividualizadoItems([]);
                }
            } catch (err) {
                console.error(err);
                if (!cancelado) setErro('Não foi possível carregar os dados deste colaborador.');
            } finally {
                if (!cancelado) setLoading(false);
            }
        })();
        return () => { cancelado = true; };
    }, [employee.id, period, orgId]);

    // ── Alocação por obra ─────────────────────────────────────────────────────
    const addAllocation = () => {
        if (worksites.length === 0) return;
        const livre = worksites.find(w => !allocations.some(a => a.project_id === w.id)) ?? worksites[0];
        setAllocations([...allocations, { employee_id: employee.id, project_id: livre.id, allocation_percent: 0 }]);
    };

    const updateAllocation = (index: number, patch: Partial<AllocationDraft>) => {
        const next = [...allocations];
        next[index] = { ...next[index], ...patch };
        setAllocations(next);
    };

    const saveAllocations = async () => {
        if (totalAlocado > 100) { setErro(`A alocação soma ${totalAlocado.toFixed(0)}% — não pode passar de 100%.`); return; }
        try {
            setSaving('alloc');
            setErro(null);
            await payrollService.saveAllocations(employee.id, period, allocations);
            await onSaved(employee.id);
            onNotify('Alocação salva.');
        } catch (err) {
            console.error(err);
            setErro(mensagemDeErro(err, 'Falha ao salvar a alocação.'));
        } finally {
            setSaving(null);
        }
    };

    const copyPreviousMonth = async () => {
        try {
            setCopying(true);
            const [ano, mes] = period.split('-').map(Number);
            const anterior = new Date(ano, mes - 2, 1).toISOString().slice(0, 7);
            const dados = await payrollService.listAllocations(employee.id, anterior);
            if (dados.length === 0) { onNotify(`Nenhuma alocação em ${anterior}.`, 'error'); return; }
            setAllocations(dados.map(d => ({
                employee_id: d.employee_id,
                project_id: d.project_id,
                allocation_percent: d.allocation_percent,
            })));
            onNotify(`Alocações copiadas de ${anterior}. Salve para confirmar.`);
        } catch (err) {
            console.error(err);
            setErro('Falha ao copiar as alocações do mês anterior.');
        } finally {
            setCopying(false);
        }
    };

    // ── Rateio contábil ───────────────────────────────────────────────────────
    const saveSplits = async () => {
        const preenchidas = splits.filter(l => l.cost_center_id || l.plano_de_contas_id);
        const total = preenchidas.reduce((s, l) => s + (l.percent || 0), 0);
        if (preenchidas.length > 0 && total > 100) { setErro(`O rateio soma ${total.toFixed(1)}% — não pode passar de 100%.`); return; }
        if (preenchidas.some(l => !l.percent || l.percent <= 0)) { setErro('Toda linha do rateio precisa de um percentual maior que zero.'); return; }

        // A organização vem do COLABORADOR: em "Todas as organizações" o
        // contexto é null e a coluna org_id é NOT NULL.
        const empOrgId = employee.org_id || orgId;
        if (!empOrgId) { setErro('Não foi possível identificar a organização do colaborador.'); return; }

        try {
            setSaving('splits');
            setErro(null);
            await payrollService.saveCostSplits(employee.id, empOrgId, period, preenchidas.map(l => ({
                cost_center_id: l.cost_center_id || null,
                plano_de_contas_id: l.plano_de_contas_id || null,
                percent: l.percent,
            })));
            await onSaved(employee.id);
            onNotify('Rateio contábil salvo.');
        } catch (err) {
            console.error(err);
            setErro(mensagemDeErro(err, 'Falha ao salvar o rateio contábil.'));
        } finally {
            setSaving(null);
        }
    };

    // ── Lançamento financeiro ─────────────────────────────────────────────────
    const launchFinance = async () => {
        if (!closedResult) return;
        if (totalAlocado === 0) { setErro('Defina ao menos um percentual de alocação antes de lançar.'); return; }
        try {
            setSaving('finance');
            setErro(null);
            const [pAno, pMes] = period.split('-');
            const ultimoDia = new Date(Number(pAno), Number(pMes), 0).toISOString().slice(0, 10);
            const indiv = individualizadoItems.filter(i => i.amount > 0).map(i => ({
                rubricCode: i.code,
                rubricName: i.name,
                amount: i.amount,
                txDate: i.dia_lancamento ? `${pAno}-${pMes}-${String(i.dia_lancamento).padStart(2, '0')}` : ultimoDia,
            }));

            // A classificação NÃO vem mais da tela: sai do rateio contábil →
            // colaborador → ciclo, resolvida no service.
            await payrollService.syncEmployeeToFinance(
                closedResult.run_id,
                employee.id,
                employee.name,
                closedResult.employer_cost,
                allocations,
                indiv.length > 0 ? indiv : undefined,
                closedResult.net,
                closedResult.gross,
            );
            onNotify(`Custos de ${period} lançados no financeiro.`);
        } catch (err) {
            console.error(err);
            setErro(mensagemDeErro(err, 'Houve um erro ao registrar os lançamentos.'));
        } finally {
            setSaving(null);
        }
    };

    const semClassificacao = splits.length === 0 && !employee.cost_center_id && !employee.plano_de_contas_id;

    return (
        <>
        <Sheet open onClose={onClose} size="2xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{employee.name}</SheetTitle>
                <SheetDescription>
                    {employee.role || 'Sem função'} · competência {period}
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-6">
                {erro && (
                    <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-600 rounded-[10px] border border-rose-100 text-sm font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {erro}
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : (
                    <>
                        {/* 1. Alocação por obra */}
                        <section className="space-y-3">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h3 className="text-sm font-bold text-gray-900">Alocação por obra</h3>
                                <div className="flex items-center gap-2">
                                    {derivada.length > 0 && (
                                        <button
                                            onClick={aplicarDerivada}
                                            title={`Centro de custo vinculado a obra: ${derivadaTexto}`}
                                            className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-100 text-gray-600 rounded-[6px] hover:bg-gray-200 font-medium text-[13px] transition-all active:scale-95"
                                        >
                                            <Wand2 className="w-[15px] h-[15px]" />
                                            Do centro de custo
                                        </button>
                                    )}
                                    <button
                                        onClick={copyPreviousMonth}
                                        disabled={copying}
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-gray-100 text-gray-600 rounded-[6px] hover:bg-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {copying ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Copy className="w-[15px] h-[15px]" />}
                                        Mês anterior
                                    </button>
                                    <button
                                        onClick={saveAllocations}
                                        disabled={saving === 'alloc'}
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {saving === 'alloc' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                                        Salvar
                                    </button>
                                </div>
                            </div>

                            {allocations.length === 0 ? (
                                <div className="py-6 bg-gray-50 rounded-[10px] border border-dashed border-gray-200 text-center">
                                    <p className="text-sm font-medium text-gray-500">Sem obra vinculada neste mês</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {derivada.length > 0
                                            ? `O centro de custo aponta para ${derivadaTexto} — use "Do centro de custo" para alocar.`
                                            : 'O custo inteiro entra como "Custo Administrativo (Não Alocado)".'}
                                    </p>
                                </div>
                            ) : (
                                allocations.map((alloc, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-[10px] border border-transparent hover:border-gray-200 transition-all">
                                        <div className="flex-1 min-w-0">
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Obra</label>
                                            <select
                                                value={alloc.project_id}
                                                onChange={e => updateAllocation(idx, { project_id: e.target.value })}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            >
                                                {worksites.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-28">
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">%</label>
                                            <input
                                                type="number" min="0" max="100"
                                                value={alloc.allocation_percent}
                                                onChange={e => updateAllocation(idx, { allocation_percent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            />
                                        </div>
                                        <ActionIconButton kind="delete" className="mt-5" onClick={() => setAllocations(allocations.filter((_, i) => i !== idx))} />
                                    </div>
                                ))
                            )}

                            <button
                                onClick={addAllocation}
                                className="w-full py-2.5 border border-dashed border-gray-200 rounded-[10px] text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                            >
                                <Plus className="w-4 h-4" /> Adicionar obra
                            </button>

                            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-[10px] border border-gray-100">
                                <span className="text-sm font-medium text-gray-500">Total alocado</span>
                                <span className={`text-sm font-medium ${totalAlocado > 100 ? 'text-rose-600' : totalAlocado === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    {totalAlocado.toFixed(0)}%
                                    {totalAlocado < 100 && <span className="text-gray-400 font-normal"> · o restante fica como Administrativo</span>}
                                </span>
                            </div>
                        </section>

                        {/* 2. Rateio contábil */}
                        <section className="space-y-3">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h3 className="text-sm font-bold text-gray-900">Rateio contábil</h3>
                                <button
                                    onClick={saveSplits}
                                    disabled={saving === 'splits'}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {saving === 'splits' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                                    Salvar
                                </button>
                            </div>

                            {splits.length === 0 ? (
                                <div className="py-6 bg-gray-50 rounded-[10px] border border-dashed border-gray-200 text-center">
                                    <p className="text-sm font-medium text-gray-500">Sem rateio neste mês</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        O custo usa o Centro de Custo e o Plano de Contas do colaborador — ou, na falta deles, os da folha.
                                    </p>
                                </div>
                            ) : (
                                splits.map((linha, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-[10px] border border-transparent hover:border-gray-200 transition-all">
                                        <div className="flex-1 min-w-0">
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Centro de Custo</label>
                                            <select
                                                value={linha.cost_center_id}
                                                onChange={e => setSplits(splits.map((l, i) => i === idx ? { ...l, cost_center_id: e.target.value } : l))}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            >
                                                <option value="">—</option>
                                                {costCenters.map(cc => (
                                                    <option key={cc.id} value={cc.id}>{cc.code ? `${cc.code} — ${cc.name}` : cc.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">Plano de Contas</label>
                                            <select
                                                value={linha.plano_de_contas_id}
                                                onChange={e => setSplits(splits.map((l, i) => i === idx ? { ...l, plano_de_contas_id: e.target.value } : l))}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            >
                                                <option value="">—</option>
                                                {planoContas.map(pc => (
                                                    <option key={pc.id} value={pc.id}>{pc.code ? `${pc.code} — ${pc.name}` : pc.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="w-24">
                                            <label className="text-xs font-semibold text-slate-500 mb-1 block">%</label>
                                            <input
                                                type="number" min="0" max="100" step="0.01"
                                                value={linha.percent}
                                                onChange={e => setSplits(splits.map((l, i) => i === idx ? { ...l, percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) } : l))}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            />
                                        </div>
                                        <ActionIconButton kind="delete" className="mt-5" onClick={() => setSplits(splits.filter((_, i) => i !== idx))} />
                                    </div>
                                ))
                            )}

                            <button
                                onClick={() => setSplits([...splits, { cost_center_id: '', plano_de_contas_id: '', percent: 0 }])}
                                className="w-full py-2.5 border border-dashed border-gray-200 rounded-[10px] text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                            >
                                <Plus className="w-4 h-4" /> Adicionar linha de rateio
                            </button>

                            {splits.length > 0 && (
                                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-[10px] border border-gray-100">
                                    <span className="text-sm font-medium text-gray-500">Total rateado</span>
                                    <span className={`text-sm font-medium ${totalRateado > 100 ? 'text-rose-600' : totalRateado === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {totalRateado.toFixed(2).replace('.', ',')}%
                                        {totalRateado < 100 && (
                                            <span className="text-gray-400 font-normal">
                                                {' '}· os {(100 - totalRateado).toFixed(2).replace('.', ',')}% restantes seguem a classificação do colaborador
                                            </span>
                                        )}
                                    </span>
                                </div>
                            )}
                        </section>

                        {/* 3. Lançamento financeiro */}
                        <section className="space-y-3">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h3 className="text-sm font-bold text-gray-900">Lançar custos no financeiro</h3>
                            </div>

                            {!closedResult ? (
                                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-[10px] border border-amber-200 text-amber-800">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium">Nenhuma folha fechada em {period}.</p>
                                        <p className="text-xs mt-0.5">O lançamento real só é permitido depois do fechamento, na aba Ciclos de folha.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="px-4 py-3 bg-emerald-50 rounded-[10px] border border-emerald-100">
                                            <p className="text-xs font-semibold text-emerald-700">Custo patronal</p>
                                            <p className="text-sm font-medium text-emerald-900 mt-0.5">{formatMoney(closedResult.employer_cost || 0)}</p>
                                        </div>
                                        <div className="px-4 py-3 bg-gray-50 rounded-[10px] border border-gray-100">
                                            <p className="text-xs font-semibold text-gray-500">Bruto</p>
                                            <p className="text-sm font-medium text-gray-800 mt-0.5">{formatMoney(closedResult.gross || 0)}</p>
                                        </div>
                                        <div className="px-4 py-3 bg-gray-50 rounded-[10px] border border-gray-100">
                                            <p className="text-xs font-semibold text-gray-500">Líquido</p>
                                            <p className="text-sm font-medium text-gray-800 mt-0.5">{formatMoney(closedResult.net || 0)}</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {closedResults.map(r => (
                                            <button
                                                key={r.run_id}
                                                onClick={() => setPaystubRunId(r.run_id)}
                                                className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-600 rounded-[6px] hover:border-indigo-200 hover:text-indigo-600 font-medium text-[13px] transition-all active:scale-95"
                                            >
                                                <FileText className="w-[15px] h-[15px]" />
                                                Holerite — {r.run_type === 'adiantamento' ? 'Adiantamento' : 'Folha completa'}
                                            </button>
                                        ))}
                                    </div>

                                    {individualizadoItems.length > 0 && (
                                        <div className="space-y-2 p-4 bg-violet-50 rounded-[10px] border border-violet-100">
                                            <div className="flex items-center gap-2">
                                                <Banknote className="w-4 h-4 text-violet-600" />
                                                <h4 className="text-sm font-bold text-violet-900">Parcelas individualizadas</h4>
                                            </div>
                                            <p className="text-xs text-violet-600">Entram como parcelas separadas no financeiro, na data da rubrica.</p>
                                            {individualizadoItems.map(item => (
                                                <div key={item.code} className="flex items-center gap-3 px-3 py-2 bg-white rounded-[6px] border border-violet-100">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                                                        <p className="text-xs text-gray-400">{item.code}</p>
                                                    </div>
                                                    <p className="text-sm font-medium text-violet-700 whitespace-nowrap">{formatMoney(item.amount)}</p>
                                                    <div className="flex items-center gap-1 text-xs text-violet-600 whitespace-nowrap">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        {item.dia_lancamento ? `Dia ${item.dia_lancamento}` : 'Último dia'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {semClassificacao && (
                                        <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-[10px] border border-gray-200 text-gray-600">
                                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
                                            <p className="text-xs">
                                                Este colaborador não tem rateio nem classificação própria: os lançamentos vão usar o
                                                Centro de Custo e o Plano de Contas definidos no ciclo de folha.
                                            </p>
                                        </div>
                                    )}

                                    <p className="text-xs text-gray-500">
                                        Serão gerados lançamentos de <strong>Salários</strong> ({formatMoney(closedResult.net || 0)}),
                                        {' '}<strong>Encargos Patronais</strong> ({formatMoney(Math.max(0, (closedResult.employer_cost || 0) - (closedResult.net || 0)))})
                                        {' '}e <strong>Contribuições de Terceiros</strong>, distribuídos pelas obras e pelo rateio contábil acima.
                                    </p>
                                </>
                            )}
                        </section>
                    </>
                )}
            </SheetPanel>

            <SheetFooter>
                <button
                    onClick={onClose}
                    className="h-9 px-3.5 text-gray-500 hover:text-gray-700 font-medium text-[13px] transition-all"
                >
                    Fechar
                </button>
                <button
                    onClick={launchFinance}
                    disabled={!closedResult || saving === 'finance'}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                >
                    {saving === 'finance' ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <CheckCircle2 className="w-[15px] h-[15px]" />}
                    Lançar no financeiro
                </button>
            </SheetFooter>
        </Sheet>

        {paystubRunId && (
            <PaystubModal
                orgId={orgId ?? ''}
                runId={paystubRunId}
                employeeId={employee.id}
                onClose={() => setPaystubRunId(null)}
            />
        )}
        </>
    );
};

export default LaborAllocations;
