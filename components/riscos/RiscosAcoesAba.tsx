import React from 'react';
import { ClipboardList, X } from 'lucide-react';
import type { ProjectRisk, RiskAcaoStatus, RiskAction } from '../../types/risk';
import { RISK_ROTULO } from '../../types/risk';
import { acaoEmAtraso } from '../../utils/riskPainel';
import { FilterPopover } from '../ui/FilterPopover';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { formatDateBR, formatMoney } from '../ui/Format';
import { COR_EFICACIA, COR_STATUS_ACAO } from './RiscoAcoes';

/**
 * Aba Ações: todas as ações de tratamento da organização do topo (ou de todas).
 * "Em atraso" usa `acaoEmAtraso` — a mesma função do cartão "Tratamentos em atraso"
 * do Painel (CA11). Clicar na linha abre a ficha do risco na aba Ações.
 */
export interface FiltrosAcoes { busca: string; status: '' | RiskAcaoStatus; prazo: '' | 'atraso' }

const COLUNAS: StandardTableColumn[] = [
    { key: 'risco', label: 'Risco', sortable: true, width: 260 },
    { key: 'descricao', label: 'Ação', sortable: true, width: 320 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 120 },
    { key: 'responsavel', label: 'Responsável', sortable: true, width: 170 },
    { key: 'prazo', label: 'Prazo', sortable: true, width: 150 },
    { key: 'status', label: 'Status', sortable: true, width: 140 },
    { key: 'eficacia', label: 'Eficácia', sortable: true, width: 130 },
    { key: 'custo', label: 'Custo previsto', sortable: true, width: 140, align: 'right' },
    { key: 'tarefa', label: 'Em Tarefas', sortable: true, width: 110 },
];

export function filtrarAcoes(acoes: RiskAction[], f: FiltrosAcoes, hoje: string, rotuloRisco: (a: RiskAction) => string): RiskAction[] {
    const termo = f.busca.trim().toLowerCase();
    return acoes.filter(a =>
        (!f.status || a.status === f.status) &&
        (!f.prazo || acaoEmAtraso(a, hoje)) &&
        (!termo || `${a.descricao} ${a.responsavel_nome ?? ''} ${rotuloRisco(a)}`.toLowerCase().includes(termo)));
}

interface Props {
    acoes: RiskAction[];
    riscosPorId: Map<string, ProjectRisk>;
    carregando: boolean;
    hoje: string;
    filtros: FiltrosAcoes;
    setFiltro: <K extends keyof FiltrosAcoes>(k: K, v: FiltrosAcoes[K]) => void;
    onAbrir: (r: ProjectRisk) => void;
}

export const RiscosAcoesAba: React.FC<Props> = ({ acoes, riscosPorId, carregando, hoje, filtros, setFiltro, onAbrir }) => {
    const rotuloRisco = React.useCallback((a: RiskAction) => {
        const r = riscosPorId.get(a.project_risk_id);
        return r ? `${r.codigo} · ${r.titulo}` : 'Risco não encontrado';
    }, [riscosPorId]);
    const linhas = React.useMemo(() => filtrarAcoes(acoes, filtros, hoje, rotuloRisco), [acoes, filtros, hoje, rotuloRisco]);

    return (
        <div className="space-y-3">
            {filtros.prazo === 'atraso' && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                    <span>Recorte do painel: <span className="font-medium text-gray-900">Tratamentos em atraso</span> · {linhas.length} aç{linhas.length === 1 ? 'ão' : 'ões'}</span>
                    <button type="button" onClick={() => setFiltro('prazo', '')} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
                        <X className="w-3.5 h-3.5" /> Tirar o recorte
                    </button>
                </div>
            )}
            <StandardTable<RiskAction>
                storageKey="riscos:acoes:tabela"
                columns={COLUNAS}
                rows={linhas}
                rowKey={a => a.id}
                loading={carregando}
                pagination={{ defaultPageSize: 100 }}
                search={filtros.busca}
                onSearchChange={v => setFiltro('busca', v)}
                searchPlaceholder="Buscar por ação, responsável ou risco..."
                defaultSort={{ column: 'prazo', direction: 'asc' }}
                filters={<>
                    <FilterPopover<'' | RiskAcaoStatus> label="Status" value={filtros.status} onChange={v => setFiltro('status', v)}
                        options={[{ value: '', label: 'Todos' }, ...(Object.keys(RISK_ROTULO.acaoStatus) as RiskAcaoStatus[]).map(s => ({ value: s, label: RISK_ROTULO.acaoStatus[s] }))]} />
                    <FilterPopover<'' | 'atraso'> label="Prazo" value={filtros.prazo} onChange={v => setFiltro('prazo', v)}
                        options={[{ value: '', label: 'Todos' }, { value: 'atraso', label: 'Em atraso' }]} />
                </>}
                sortValue={(k, a) => {
                    switch (k) {
                        case 'risco': return rotuloRisco(a);
                        case 'responsavel': return a.responsavel_nome ?? '';
                        case 'status': return RISK_ROTULO.acaoStatus[a.status];
                        case 'eficacia': return RISK_ROTULO.eficacia[a.eficacia];
                        case 'custo': return Number(a.custo_previsto);
                        case 'tarefa': return a.task_id ? 1 : 0;
                        default: return (a as unknown as Record<string, string>)[k];
                    }
                }}
                onRowClick={a => { const r = riscosPorId.get(a.project_risk_id); if (r) onAbrir(r); }}
                rowLabel={a => `${a.descricao}. Abrir a ficha do risco ${rotuloRisco(a)}`}
                renderCell={(k, a) => {
                    switch (k) {
                        case 'risco': { const t = rotuloRisco(a); return <span className="block truncate text-sm font-normal text-blue-600" title={t}>{t}</span>; }
                        case 'descricao': return <span className="block truncate text-sm font-normal text-gray-700" title={a.descricao}>{a.descricao}</span>;
                        case 'tipo': return <span className="text-sm font-normal text-gray-700">{a.tipo === 'preventiva' ? 'Preventiva' : 'Resposta'}</span>;
                        case 'responsavel': return <span className="block truncate text-sm font-normal text-gray-700" title={a.responsavel_nome ?? undefined}>{a.responsavel_nome || '—'}</span>;
                        case 'prazo': {
                            const atraso = acaoEmAtraso(a, hoje);
                            return <span className={`text-sm font-normal ${atraso ? 'text-red-700' : 'text-gray-600'}`}>{formatDateBR(a.prazo)}{atraso ? ' · em atraso' : ''}</span>;
                        }
                        case 'status': return <span className={`text-sm font-normal ${COR_STATUS_ACAO[a.status]}`}>{RISK_ROTULO.acaoStatus[a.status]}</span>;
                        case 'eficacia': return <span className={`text-sm font-normal ${COR_EFICACIA[a.eficacia]}`}>{RISK_ROTULO.eficacia[a.eficacia]}</span>;
                        case 'custo': return <span className="text-sm font-medium text-gray-800">{formatMoney(Number(a.custo_previsto))}</span>;
                        case 'tarefa': return <span className="text-sm font-normal text-gray-600">{a.task_id ? 'Sim' : 'Não'}</span>;
                        default: return null;
                    }
                }}
                // Sem coluna "Ações" de propósito (§9.1): a única ação da linha é abrir a ficha
                // do risco, e o clique na linha já faz isso — um "Ver ficha" repetiria o clique.
                empty={{ icon: <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: acoes.length ? 'Nenhuma ação com estes filtros' : 'Nenhuma ação de tratamento', subtitle: acoes.length ? 'Tire um filtro ou mude a busca.' : 'As ações são criadas na ficha de cada risco, aba Ações.' }}
            />
        </div>
    );
};

export default RiscosAcoesAba;
