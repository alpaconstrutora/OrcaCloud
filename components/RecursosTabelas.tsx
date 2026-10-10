import React from 'react';
import { AlertTriangle, Users, UserCog, Search } from 'lucide-react';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import ActionIconButton from './ui/ActionIconButton';
import { FilterPopover } from './ui/FilterPopover';
import { formatMoney } from './ui/Format';
import type { ItemScheduleDetails, ResourceRole, ResourceTeam, ResourceWorker } from '../types';

/**
 * Engenharia › Planejamento › Recursos — as abas Funções, Trabalhadores e Alocação
 * em `StandardTable` (§6.10 do guia), com o auto-ajuste de largura (§6.1.2) que o
 * componente já embute. Pedido de 10/10/2026 — ver
 * `docs/planos/2026-10-10-planejamento-recursos-tabelas-padrao.md`.
 *
 * Eram grades de cards. O que cada card fazia continua aqui, coluna a coluna; os
 * dados e as ações (editar, excluir, confirmar sugestão) continuam sendo do
 * `ResourceManagement.tsx` — estas tabelas só mostram e chamam de volta.
 */

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Seg a Sex", "Seg, Qua, Sex" — ou `undefined` quando não há calendário próprio. */
export function rotuloDoCalendario(workDays?: number[]): string | undefined {
    if (!workDays) return undefined;
    if (workDays.length === 0) return 'Nenhum dia';
    const dias = [...workDays].sort((a, b) => a - b);
    const corrido = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
    if (corrido && dias.length >= 3) return `${DIAS[dias[0]]} a ${DIAS[dias[dias.length - 1]]}`;
    return dias.map((d) => DIAS[d]).join(', ');
}

/** 'YYYY-MM-DD' → 'dd/mm/aa' (ou 'dd/mm' sem o ano), sem passar por `new Date`
 *  (o fuso desloca o dia). */
function dataCurta(iso?: string, comAno = true): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (!(y && m && d)) return iso;
    return comAno ? `${d}/${m}/${y.slice(-2)}` : `${d}/${m}`;
}

const TEXTO = 'block truncate text-sm font-normal text-gray-700';
const ATENUADO = 'text-sm font-normal text-gray-600';
const VAZIO = <span className="text-sm font-normal text-gray-400">—</span>;

// ─── Funções ───────────────────────────────────────────────────────────────

/** Código SINAPI que a importação grava em `description` ("… Código: 88309"). */
export function codigoDaFuncao(r: ResourceRole): string | undefined {
    if (!r.description?.includes('Código')) return undefined;
    return r.description.split(':').pop()?.trim() || undefined;
}

// Soma 1140 + Ações 80 = 1220 px: cabe nos ~1240 úteis da vista Recursos (card do
// Planejamento − p-6) sem esconder Ações. Cada largura comporta o RÓTULO numa linha
// (texto + ícone de ordenar + px-6) — "Custo por uso" quebrava; virou "Custo/uso".
const COLUNAS_FUNCOES: StandardTableColumn[] = [
    { key: 'nome', label: 'Nome', sortable: true, width: 210 },
    { key: 'codigo', label: 'Código', sortable: true, width: 100 },
    { key: 'origem', label: 'Origem', sortable: true, width: 140 },
    { key: 'custoHora', label: 'Custo/h', sortable: true, width: 110, align: 'right' },
    { key: 'custoHE', label: 'Custo HE/h', sortable: true, width: 150, align: 'right' },
    { key: 'custoUso', label: 'Custo/uso', sortable: true, width: 140, align: 'right' },
    { key: 'calendario', label: 'Calendário', sortable: true, width: 130 },
    { key: 'trabalhadores', label: 'Trabalhadores', sortable: true, width: 160, align: 'right' },
];

export function TabelaFuncoes({ roles, workers, localLabel, onEdit, onDelete }: {
    roles: ResourceRole[];
    workers: ResourceWorker[];
    localLabel: string;
    onEdit: (r: ResourceRole) => void;
    onDelete: (r: ResourceRole) => void;
}) {
    const porFuncao = React.useMemo(() => {
        const m = new Map<string, number>();
        workers.forEach((w) => m.set(w.roleId, (m.get(w.roleId) ?? 0) + 1));
        return m;
    }, [workers]);
    // HE sem valor próprio = 1,5× o custo/h (mesma regra do motor — ResourceRole).
    const he = (r: ResourceRole) => r.overtimeCostPerHour ?? (r.costPerHour || 0) * 1.5;

    return (
        <StandardTable<ResourceRole>
            storageKey="planejamento:recursos:funcoes"
            columns={COLUNAS_FUNCOES}
            rows={roles}
            rowKey={(r) => r.id}
            searchText={(r) => `${r.name} ${codigoDaFuncao(r) ?? ''} ${r.source ?? ''}`}
            searchPlaceholder="Buscar por nome, código ou origem..."
            onRowClick={onEdit}
            sortValue={(k, r) => {
                switch (k) {
                    case 'codigo': return codigoDaFuncao(r) ?? '';
                    case 'origem': return r.source || localLabel;
                    case 'custoHora': return r.costPerHour || 0;
                    case 'custoHE': return he(r);
                    case 'custoUso': return r.costPerUse ?? 0;
                    case 'calendario': return rotuloDoCalendario(r.workDays) ?? '';
                    case 'trabalhadores': return porFuncao.get(r.id) ?? 0;
                    default: return r.name;
                }
            }}
            renderCell={(k, r) => {
                switch (k) {
                    case 'nome': return <span className={TEXTO} title={r.name}>{r.name}</span>;
                    case 'codigo': return codigoDaFuncao(r) ? <span className={ATENUADO}>{codigoDaFuncao(r)}</span> : VAZIO;
                    case 'origem': return <span className={TEXTO}>{r.source || localLabel}</span>;
                    case 'custoHora': return <span className="text-sm font-medium text-gray-800">{formatMoney(r.costPerHour || 0)}</span>;
                    case 'custoHE':
                        return (
                            <span className="text-sm font-medium text-gray-800" title={r.overtimeCostPerHour == null ? 'Sem valor próprio: 1,5 × o custo/h' : undefined}>
                                {formatMoney(he(r))}
                                {r.overtimeCostPerHour == null && <span className="ml-1 font-normal text-gray-400">(1,5×)</span>}
                            </span>
                        );
                    case 'custoUso': return r.costPerUse ? <span className="text-sm font-medium text-gray-800">{formatMoney(r.costPerUse)}</span> : VAZIO;
                    case 'calendario': {
                        const c = rotuloDoCalendario(r.workDays);
                        return c ? <span className={TEXTO}>{c}</span> : <span className="text-sm font-normal text-gray-400">Do projeto</span>;
                    }
                    case 'trabalhadores': return <span className={ATENUADO}>{porFuncao.get(r.id) ?? 0}</span>;
                    default: return null;
                }
            }}
            actions={{ width: 80, render: (r) => <ActionIconButton kind="delete" onClick={(e) => { e.stopPropagation(); onDelete(r); }} /> }}
            empty={{
                icon: <UserCog className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                title: 'Nenhuma função cadastrada',
                subtitle: 'Use "Novo Cargo" ou "Importar da Empresa".',
            }}
        />
    );
}

// ─── Trabalhadores ─────────────────────────────────────────────────────────

// Visíveis somam 1050 + Ações 80 = 1130 px. Contato começa OCULTO (o card não o
// mostrava; e-mail e telefone vêm da importação da empresa) — liga em Colunas.
const COLUNAS_TRABALHADORES: StandardTableColumn[] = [
    { key: 'nome', label: 'Nome', sortable: true, width: 230 },
    { key: 'funcao', label: 'Função', sortable: true, width: 220 },
    { key: 'equipe', label: 'Equipe', sortable: true, width: 180 },
    { key: 'calendario', label: 'Calendário', sortable: true, width: 150 },
    { key: 'alocacoes', label: 'Alocações', sortable: true, width: 130, align: 'right' },
    { key: 'contato', label: 'Contato', sortable: true, width: 200, defaultHidden: true },
    { key: 'origem', label: 'Origem', sortable: true, width: 140 },
];

export function TabelaTrabalhadores({ workers, roles, teams, itemSchedules, localLabel, onEdit, onDelete }: {
    workers: ResourceWorker[];
    roles: ResourceRole[];
    teams: ResourceTeam[];
    itemSchedules: ItemScheduleDetails[];
    localLabel: string;
    onEdit: (w: ResourceWorker) => void;
    onDelete: (w: ResourceWorker) => void;
}) {
    const nomeDaFuncao = React.useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);
    // Equipe: `teamId` do trabalhador, ou a equipe que o lista em `memberIds`.
    const nomeDaEquipe = React.useCallback((w: ResourceWorker) =>
        (w.teamId ? teams.find((t) => t.id === w.teamId)?.name : undefined)
        ?? teams.find((t) => t.memberIds?.includes(w.id))?.name,
    [teams]);
    // Tarefas em que o trabalhador está alocado (alocação de pessoa, não de função).
    const alocacoes = React.useMemo(() => {
        const m = new Map<string, number>();
        itemSchedules.forEach((t) => {
            const ids = new Set((t.allocations || []).filter((a) => a.resourceType === 'WORKER').map((a) => a.resourceId));
            ids.forEach((id) => m.set(id, (m.get(id) ?? 0) + 1));
        });
        return m;
    }, [itemSchedules]);
    const contato = (w: ResourceWorker) => [w.email, w.phone].filter(Boolean).join(' · ');
    // Sem calendário próprio, herda o da função; sem o da função, o do projeto.
    const calendario = (w: ResourceWorker) => {
        const proprio = rotuloDoCalendario(w.workDays);
        if (proprio) return { texto: proprio, herdado: false, origem: 'Calendário próprio' };
        const daFuncao = rotuloDoCalendario(roles.find((r) => r.id === w.roleId)?.workDays);
        // Herdado fica em cinza; DE ONDE veio vai no title ("(da função)" estourava a coluna).
        return daFuncao
            ? { texto: daFuncao, herdado: true, origem: 'Herdado da função' }
            : { texto: 'Do projeto', herdado: true, origem: 'Herdado do projeto' };
    };

    return (
        <StandardTable<ResourceWorker>
            storageKey="planejamento:recursos:trabalhadores"
            columns={COLUNAS_TRABALHADORES}
            rows={workers}
            rowKey={(w) => w.id}
            searchText={(w) => `${w.name} ${nomeDaFuncao.get(w.roleId) ?? ''} ${nomeDaEquipe(w) ?? ''} ${contato(w)} ${w.source ?? ''}`}
            searchPlaceholder="Buscar por nome, função, equipe ou contato..."
            onRowClick={onEdit}
            sortValue={(k, w) => {
                switch (k) {
                    case 'funcao': return nomeDaFuncao.get(w.roleId) ?? '';
                    case 'equipe': return nomeDaEquipe(w) ?? '';
                    case 'calendario': return calendario(w).texto;
                    case 'alocacoes': return alocacoes.get(w.id) ?? 0;
                    case 'contato': return contato(w);
                    case 'origem': return w.source || localLabel;
                    default: return w.name;
                }
            }}
            renderCell={(k, w) => {
                switch (k) {
                    case 'nome': return <span className={TEXTO} title={w.name}>{w.name}</span>;
                    case 'funcao': {
                        const f = nomeDaFuncao.get(w.roleId);
                        return f ? <span className={TEXTO} title={f}>{f}</span> : <span className="text-sm font-normal text-red-600">Função removida</span>;
                    }
                    case 'equipe': { const e = nomeDaEquipe(w); return e ? <span className={TEXTO} title={e}>{e}</span> : VAZIO; }
                    case 'calendario': {
                        const c = calendario(w);
                        return <span className={`block truncate text-sm font-normal ${c.herdado ? 'text-gray-400' : 'text-gray-700'}`} title={`${c.origem}: ${c.texto}`}>{c.texto}</span>;
                    }
                    case 'alocacoes': return <span className={ATENUADO}>{alocacoes.get(w.id) ?? 0}</span>;
                    case 'contato': { const c = contato(w); return c ? <span className={TEXTO} title={c}>{c}</span> : VAZIO; }
                    case 'origem': return <span className={TEXTO}>{w.source || localLabel}</span>;
                    default: return null;
                }
            }}
            actions={{ width: 80, render: (w) => <ActionIconButton kind="delete" onClick={(e) => { e.stopPropagation(); onDelete(w); }} /> }}
            empty={{
                icon: <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                title: 'Nenhum trabalhador cadastrado',
                subtitle: 'Use "Novo Trabalhador" ou "Importar da Empresa".',
            }}
        />
    );
}

// ─── Alocação ──────────────────────────────────────────────────────────────

export type AllocationStatus = 'CONFIRMED' | 'SUGGESTION' | 'GAP';
export type AllocationSource = 'COMPOSITION' | 'MANUAL';

export interface SmartAssignment {
    taskId: string;
    taskName: string;
    roleId: string | null | undefined;
    roleName: string;
    allocationId?: string;
    worker?: ResourceWorker;
    suggestion?: ResourceWorker;
    status: AllocationStatus;
    source: AllocationSource;
    compIdx?: number;
    budgetedCost?: number;
}

export type PeriodoDaAlocacao = 'all' | 'thisWeek' | 'next15Days' | 'thisMonth';

const OPCOES_PERIODO: { value: PeriodoDaAlocacao; label: string }[] = [
    { value: 'all', label: 'Todo o cronograma' },
    { value: 'thisWeek', label: 'Esta semana' },
    { value: 'next15Days', label: 'Próximos 15 dias' },
    { value: 'thisMonth', label: 'Este mês' },
];

// Rótulos curtos (cabem em 130px sem quebrar); o card dizia "Equipe incompleta —
// cargo não preenchido", que segue no title da célula.
const SITUACAO: Record<AllocationStatus, { rotulo: string; cor: string; ordem: number }> = {
    GAP: { rotulo: 'Incompleta', cor: 'text-red-600', ordem: 0 },
    SUGGESTION: { rotulo: 'Sugestão', cor: 'text-blue-700', ordem: 1 },
    CONFIRMED: { rotulo: 'Alocado', cor: 'text-emerald-700', ordem: 2 },
};

// Soma 1120 + Ações 110 = 1230 px. Início e fim numa coluna só ("Período",
// ordenada pelo início, dd/mm – dd/mm numa linha; o ano vai no title) para caber
// sem esconder Ações.
const COLUNAS_ALOCACAO: StandardTableColumn[] = [
    { key: 'funcao', label: 'Função', sortable: true, width: 160 },
    { key: 'tarefa', label: 'Tarefa', sortable: true, width: 230 },
    { key: 'periodo', label: 'Período', sortable: true, width: 150 },
    { key: 'origem', label: 'Origem', sortable: true, width: 110 },
    { key: 'situacao', label: 'Situação', sortable: true, width: 130 },
    { key: 'trabalhador', label: 'Trabalhador', sortable: true, width: 170 },
    { key: 'custo', label: 'Custo × orçado', sortable: true, width: 170 },
];

interface LinhaAlocacao extends SmartAssignment {
    chave: string;
    inicio?: string;
    fim?: string;
    /** Diferença custo real − orçado por hora (só alocado com orçamento). */
    acimaPorHora?: number;
    custoTexto?: { texto: string; cor: string };
}

export function TabelaAlocacao({ assignments, itemSchedules, roles, workerConflicts, periodo, onPeriodo, onConfirmar }: {
    assignments: SmartAssignment[];
    itemSchedules: ItemScheduleDetails[];
    roles: ResourceRole[];
    workerConflicts: Record<string, string[]>;
    periodo: PeriodoDaAlocacao;
    onPeriodo: (p: PeriodoDaAlocacao) => void;
    onConfirmar: (a: SmartAssignment) => void;
}) {
    const linhas = React.useMemo<LinhaAlocacao[]>(() => {
        const tarefas = new Map(itemSchedules.map((t) => [t.id, t]));
        return assignments.map((a, i) => {
            const t = tarefas.get(a.taskId);
            // Indicador financeiro — a mesma regra que o card mostrava sob o nome do alocado.
            let custoTexto: LinhaAlocacao['custoTexto'];
            let acimaPorHora: number | undefined;
            if (a.status === 'CONFIRMED') {
                const real = roles.find((r) => r.id === a.worker?.roleId)?.costPerHour || 0;
                const orcado = a.budgetedCost || 0;
                if (a.source === 'MANUAL' && !a.budgetedCost) custoTexto = { texto: 'Custo adicional', cor: 'text-gray-600' };
                else if (real > orcado && orcado > 0) {
                    acimaPorHora = real - orcado;
                    custoTexto = { texto: `+ ${formatMoney(acimaPorHora)}/h`, cor: 'text-red-600' };
                } else custoTexto = { texto: 'Dentro do orçado', cor: 'text-emerald-700' };
            }
            return {
                ...a,
                chave: `${a.taskId}:${a.allocationId ?? a.roleId ?? 'sem-funcao'}:${i}`,
                inicio: t?.startDate,
                fim: t?.endDate,
                acimaPorHora,
                custoTexto,
            };
        });
    }, [assignments, itemSchedules, roles]);

    const nomeDoTrabalhador = (l: LinhaAlocacao) => l.worker?.name ?? l.suggestion?.name ?? '';

    return (
        <StandardTable<LinhaAlocacao>
            storageKey="planejamento:recursos:alocacao"
            columns={COLUNAS_ALOCACAO}
            rows={linhas}
            rowKey={(l) => l.chave}
            searchText={(l) => `${l.roleName} ${l.taskName} ${nomeDoTrabalhador(l)} ${SITUACAO[l.status].rotulo} ${l.status === 'GAP' ? 'equipe incompleta' : ''}`}
            searchPlaceholder="Buscar por função, tarefa ou trabalhador..."
            filters={
                <FilterPopover<PeriodoDaAlocacao>
                    label="Período"
                    value={periodo}
                    onChange={onPeriodo}
                    allValue="all"
                    options={OPCOES_PERIODO}
                />
            }
            sortValue={(k, l) => {
                switch (k) {
                    case 'tarefa': return l.taskName;
                    case 'periodo': return l.inicio ?? '';
                    case 'origem': return l.source;
                    case 'situacao': return SITUACAO[l.status].ordem;
                    case 'trabalhador': return nomeDoTrabalhador(l);
                    case 'custo': return l.acimaPorHora ?? (l.custoTexto ? 0 : -1);
                    default: return l.roleName;
                }
            }}
            renderCell={(k, l) => {
                switch (k) {
                    case 'funcao': return l.roleName ? <span className={TEXTO} title={l.roleName}>{l.roleName}</span> : VAZIO;
                    case 'tarefa': return <span className={TEXTO} title={l.taskName}>{l.taskName}</span>;
                    case 'periodo':
                        return l.inicio
                            ? <span className={`block truncate ${ATENUADO}`} title={`${dataCurta(l.inicio)} a ${dataCurta(l.fim)}`}>{dataCurta(l.inicio, false)} – {dataCurta(l.fim, false)}</span>
                            : <span className="text-sm font-normal text-gray-400">Sem data</span>;
                    case 'origem':
                        return l.source === 'COMPOSITION'
                            ? <span className={TEXTO} title="Técnico / orçado: mão de obra da composição SINAPI do item">Orçado</span>
                            : <span className={TEXTO} title="Adição manual: alocação feita no cronograma">Manual</span>;
                    case 'situacao': {
                        const s = SITUACAO[l.status];
                        // Sobrecarga mora AQUI, e não depois do nome do trabalhador: lá o
                        // nome longo é truncado e o aviso sumia junto (visto no harness).
                        const conflito = l.status === 'CONFIRMED' ? workerConflicts[l.taskId] : undefined;
                        return (
                            <span className={`inline-flex items-center gap-1.5 text-sm font-normal ${s.cor}`} title={l.status === 'GAP' ? 'Equipe incompleta: função sem trabalhador cadastrado' : undefined}>
                                {s.rotulo}
                                {conflito && (
                                    <AlertTriangle
                                        className="h-3.5 w-3.5 shrink-0 text-red-600"
                                        role="img"
                                        aria-label="Sobrecarga"
                                    >
                                        <title>{`Sobrecarga — ${l.worker?.name ?? 'o trabalhador'} também está alocado em: ${conflito.join(', ')}`}</title>
                                    </AlertTriangle>
                                )}
                            </span>
                        );
                    }
                    case 'trabalhador': {
                        if (l.status === 'CONFIRMED') {
                            return <span className="block truncate text-sm font-normal text-gray-700" title={l.worker?.name}>{l.worker?.name ?? '—'}</span>;
                        }
                        if (l.status === 'SUGGESTION') {
                            return <span className="block truncate text-sm font-normal text-gray-500" title={`Sugestão do sistema: ${l.suggestion?.name}`}>{l.suggestion?.name ?? '—'}</span>;
                        }
                        return VAZIO;
                    }
                    case 'custo': return l.custoTexto ? <span className={`text-sm font-normal ${l.custoTexto.cor}`}>{l.custoTexto.texto}</span> : VAZIO;
                    default: return null;
                }
            }}
            actions={{
                width: 110,
                render: (l) => l.status === 'SUGGESTION' && l.suggestion ? (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onConfirmar(l); }}
                        title={`Alocar ${l.suggestion.name} nesta tarefa`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                    >
                        Confirmar
                    </button>
                ) : null,
            }}
            empty={{
                icon: <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                title: 'Nenhum requisito de mão de obra',
                subtitle: periodo === 'all'
                    ? 'Adicione cargos às suas tarefas no cronograma para iniciar.'
                    : 'Nenhuma tarefa no período escolhido.',
            }}
        />
    );
}
