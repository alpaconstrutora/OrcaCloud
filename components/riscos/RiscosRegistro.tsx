import React from 'react';
import { ShieldAlert, X } from 'lucide-react';
import type { ProjectRisk, RiskMatrixConfig, RiskNivel, RiskStatus } from '../../types/risk';
import { RISK_ROTULO } from '../../types/risk';
import { pontuacaoVigente, riscoAtivo } from '../../utils/riskScoring';
import { nivelNaOrg, recortarRiscos, ROTULO_RECORTE, type ContextoRecorte, type RecorteRisco } from '../../utils/riskPainel';
import { FilterPopover } from '../ui/FilterPopover';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { formatDateBR } from '../ui/Format';
import { NivelTexto } from './riscosUi';
import type { SecaoFicha } from './RiscoFicha';

/**
 * Aba Registro (F1.9): todos os riscos da organização do topo (ou de todas, em
 * "Todas" — a RLS recorta). A busca e os filtros vivem no módulo (o Painel abre
 * esta aba já recortada: CA11) e o recorte é feito AQUI, com as mesmas funções de
 * `utils/riskPainel.ts` — por isso o StandardTable recebe a busca controlada e
 * SEM `searchText`: o que ele mostra é exatamente o que contamos.
 */
export const COR_STATUS_RISCO: Record<RiskStatus, string> = {
    identificado: 'text-gray-700', em_avaliacao: 'text-blue-700', em_tratamento: 'text-indigo-700',
    monitorado: 'text-emerald-700', materializado: 'text-red-700', encerrado: 'text-gray-500',
};

export type FiltroNivel = '' | RiskNivel | 'sem_avaliacao';

export interface FiltrosRegistro {
    busca: string;
    status: '' | RiskStatus;
    nivel: FiltroNivel;
    obra: string;
    recorte: RecorteRisco;
}

const NIVEL_ORDEM: Record<RiskNivel, number> = { baixo: 1, medio: 2, alto: 3, critico: 4 };

/** Texto em que a busca procura — exportado para o Painel não ter uma segunda definição. */
export function textoDeBusca(r: ProjectRisk, rotuloEscopo: (r: ProjectRisk) => string, nomeCategoria: (id: string | null) => string): string {
    return `${r.codigo} ${r.titulo} ${r.evento} ${r.causa} ${r.consequencia} ${r.owner_nome ?? ''} ${rotuloEscopo(r)} ${nomeCategoria(r.category_id)} ${r.tags.join(' ')} ${r.catalog_codigo ?? ''}`;
}

/** Aplica os filtros da aba — a MESMA função alimenta a tabela e a contagem "N riscos". */
export function filtrarRegistro(
    riscos: ProjectRisk[], f: FiltrosRegistro, ctx: ContextoRecorte,
    rotuloEscopo: (r: ProjectRisk) => string, nomeCategoria: (id: string | null) => string,
): ProjectRisk[] {
    const termo = f.busca.trim().toLowerCase();
    return recortarRiscos(riscos, f.recorte, ctx).filter(r => {
        if (f.status && r.status !== f.status) return false;
        if (f.obra && r.project_id !== f.obra) return false;
        if (f.nivel) {
            const n = nivelNaOrg(r, ctx.faixasPorOrg);
            if (f.nivel === 'sem_avaliacao' ? n !== null : n !== f.nivel) return false;
        }
        if (termo && !textoDeBusca(r, rotuloEscopo, nomeCategoria).toLowerCase().includes(termo)) return false;
        return true;
    });
}

interface Props {
    riscos: ProjectRisk[];
    carregando: boolean;
    filtros: FiltrosRegistro;
    setFiltro: <K extends keyof FiltrosRegistro>(k: K, v: FiltrosRegistro[K]) => void;
    limparFiltros: () => void;
    ctx: ContextoRecorte;
    faixasPorOrg: Record<string, RiskMatrixConfig>;
    rotuloEscopo: (r: ProjectRisk) => string;
    nomeCategoria: (id: string | null) => string;
    nomeOrg: (id: string) => string;
    mostrarOrg: boolean;
    obrasDosRiscos: { id: string; name: string }[];
    podeEditar: boolean;
    onAbrir: (r: ProjectRisk, secao?: SecaoFicha) => void;
}

export const RiscosRegistro: React.FC<Props> = ({
    riscos, carregando, filtros, setFiltro, limparFiltros, ctx, faixasPorOrg, rotuloEscopo, nomeCategoria, nomeOrg,
    mostrarOrg, obrasDosRiscos, podeEditar, onAbrir,
}) => {
    const colunas = React.useMemo<StandardTableColumn[]>(() => [
        { key: 'codigo', label: 'Código', sortable: true, width: 100 },
        { key: 'titulo', label: 'Título', sortable: true, width: 280 },
        { key: 'categoria', label: 'Categoria', sortable: true, width: 200 },
        { key: 'escopo', label: 'Escopo / obra', sortable: true, width: 220 },
        ...(mostrarOrg ? [{ key: 'org', label: 'Organização', sortable: true, width: 180 }] : []),
        { key: 'fase', label: 'Fase', sortable: true, width: 150 },
        { key: 'dono', label: 'Dono', sortable: true, width: 170 },
        { key: 'nivel', label: 'Nível', sortable: true, width: 150 },
        { key: 'pontuacao', label: 'Inerente → residual', sortable: true, width: 160, align: 'right' },
        { key: 'status', label: 'Status', sortable: true, width: 140 },
        { key: 'revisao', label: 'Próxima revisão', sortable: true, width: 150 },
    ], [mostrarOrg]);

    const linhas = React.useMemo(
        () => filtrarRegistro(riscos, filtros, ctx, rotuloEscopo, nomeCategoria),
        [riscos, filtros, ctx, rotuloEscopo, nomeCategoria],
    );

    const temFiltro = !!(filtros.busca || filtros.status || filtros.nivel || filtros.obra || filtros.recorte);

    return (
        <div className="space-y-3">
            {filtros.recorte && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                    <span>Recorte do painel: <span className="font-medium text-gray-900">{ROTULO_RECORTE[filtros.recorte]}</span> · {linhas.length} risco{linhas.length === 1 ? '' : 's'}</span>
                    <button type="button" onClick={() => setFiltro('recorte', '')} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
                        <X className="w-3.5 h-3.5" /> Tirar o recorte
                    </button>
                </div>
            )}
            <StandardTable<ProjectRisk>
                storageKey="riscos:registro:tabela"
                columns={colunas}
                rows={linhas}
                rowKey={r => r.id}
                loading={carregando}
                pagination={{ defaultPageSize: 100 }}
                search={filtros.busca}
                onSearchChange={v => setFiltro('busca', v)}
                searchPlaceholder="Buscar por código, título, causa, dono, obra ou tag..."
                defaultSort={{ column: 'codigo', direction: 'desc' }}
                filters={<>
                    <FilterPopover<RecorteRisco> label="Recorte" value={filtros.recorte} onChange={v => setFiltro('recorte', v)}
                        options={[{ value: '', label: 'Todos os riscos' }, ...(Object.keys(ROTULO_RECORTE) as Exclude<RecorteRisco, ''>[]).map(k => ({ value: k, label: ROTULO_RECORTE[k] }))]} />
                    <FilterPopover<'' | RiskStatus> label="Status" value={filtros.status} onChange={v => setFiltro('status', v)}
                        options={[{ value: '', label: 'Todos' }, ...(Object.keys(RISK_ROTULO.status) as RiskStatus[]).map(s => ({ value: s, label: RISK_ROTULO.status[s] }))]} />
                    <FilterPopover<FiltroNivel> label="Nível" value={filtros.nivel} onChange={v => setFiltro('nivel', v)}
                        options={[{ value: '', label: 'Todos' }, ...(Object.keys(RISK_ROTULO.nivel) as RiskNivel[]).map(n => ({ value: n, label: RISK_ROTULO.nivel[n] })), { value: 'sem_avaliacao', label: 'Sem avaliação' }]} />
                    <FilterPopover<string> label="Obra" value={filtros.obra} onChange={v => setFiltro('obra', v)}
                        options={[{ value: '', label: 'Todas' }, ...obrasDosRiscos.map(o => ({ value: o.id, label: o.name }))]} />
                </>}
                sortValue={(k, r) => {
                    switch (k) {
                        case 'codigo': return r.numero;
                        case 'categoria': return nomeCategoria(r.category_id);
                        case 'escopo': return rotuloEscopo(r);
                        case 'org': return nomeOrg(r.organization_id);
                        case 'fase': return r.fase ? RISK_ROTULO.fase[r.fase] : '';
                        case 'dono': return r.owner_nome ?? '';
                        case 'nivel': { const n = nivelNaOrg(r, faixasPorOrg); return n ? NIVEL_ORDEM[n] * 100 + (pontuacaoVigente(r) ?? 0) : -1; }
                        case 'pontuacao': return pontuacaoVigente(r) ?? -1;
                        case 'status': return RISK_ROTULO.status[r.status];
                        case 'revisao': return r.proxima_revisao;
                        default: return r.titulo;
                    }
                }}
                onRowClick={r => onAbrir(r)}
                rowLabel={r => `${r.codigo}: ${r.titulo}. Abrir a ficha`}
                renderCell={(k, r) => {
                    switch (k) {
                        case 'codigo': return <span className="text-sm font-normal text-gray-600">{r.codigo}</span>;
                        case 'titulo': return <span className="block truncate text-sm font-normal text-gray-700" title={r.titulo}>{r.titulo}</span>;
                        case 'categoria': { const t = nomeCategoria(r.category_id); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                        case 'escopo': { const t = rotuloEscopo(r); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                        case 'org': { const t = nomeOrg(r.organization_id); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                        case 'fase': return <span className="text-sm font-normal text-gray-700">{r.fase ? RISK_ROTULO.fase[r.fase] : '—'}</span>;
                        case 'dono': return <span className="block truncate text-sm font-normal text-gray-700" title={r.owner_nome ?? undefined}>{r.owner_nome || '—'}</span>;
                        case 'nivel': return <NivelTexto nivel={nivelNaOrg(r, faixasPorOrg)} gatilho={r.gatilho_critico} />;
                        case 'pontuacao': return (
                            <span className="text-sm font-normal text-gray-600" title="Pontuação inerente → residual (probabilidade × impacto)">
                                {r.inerente_pontuacao ?? '—'} → {r.residual_pontuacao ?? '—'}
                            </span>
                        );
                        case 'status': return <span className={`text-sm font-normal ${COR_STATUS_RISCO[r.status]}`}>{RISK_ROTULO.status[r.status]}</span>;
                        case 'revisao': {
                            const vencida = riscoAtivo(r) && r.proxima_revisao < ctx.hoje;
                            return <span className={`text-sm font-normal ${vencida ? 'text-red-700' : 'text-gray-600'}`} title={vencida ? 'Revisão vencida' : undefined}>
                                {formatDateBR(r.proxima_revisao)}{vencida ? ' · vencida' : ''}
                            </span>;
                        }
                        default: return null;
                    }
                }}
                actions={{
                    width: 130,
                    render: r => (
                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                            <button type="button" onClick={() => onAbrir(r, 'avaliacoes')}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-[6px] transition-all">
                                {podeEditar && riscoAtivo(r) ? 'Avaliar' : 'Avaliações'}
                            </button>
                            <ActionIconButton kind="history" title="Ver o histórico do risco" onClick={() => onAbrir(r, 'historico')} />
                        </div>
                    ),
                }}
                empty={riscos.length === 0
                    ? { icon: <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum risco registrado', subtitle: 'Registre do zero com "Novo risco" ou a partir de um item do catálogo.' }
                    : { icon: <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum risco com estes filtros', subtitle: temFiltro ? 'Tire um filtro ou mude a busca.' : '' }}
            />
            {temFiltro && riscos.length > 0 && (
                <button type="button" onClick={limparFiltros} className="text-sm text-blue-600 hover:text-blue-800">Limpar busca e filtros</button>
            )}
        </div>
    );
};

export default RiscosRegistro;
