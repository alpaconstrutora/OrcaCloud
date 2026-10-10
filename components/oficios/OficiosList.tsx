import React from 'react';
import { FileText, FilePen, FileCheck2, CalendarClock } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import { FilterPopover } from '../ui/FilterPopover';
import { usePersistedState } from '../ui/TableUtils';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import type { DocGenDocumento, DocGenDocumentoStatus, DocGenModelo } from '../../types/docGen';
import { ROTULO_TIPO } from '../../services/docGen/destinatario';
import { dataCurta, hojeIso } from '../../services/docGen/dataExtenso';
import { formatarDataHora } from './rotulos';
import { SITUACOES_EM_CURSO } from '../../services/docGenDocumentoService';
import { ROTULO_SITUACAO } from '../../services/docGen/tramitacao';

/**
 * Documentos › Ofícios › aba Ofícios (F2). KPIs da situação, filtro de
 * situação em popover (§5.4), tabela padrão (§6.10). Clicar na linha abre
 * o ofício (§9.1); a coluna de ações só tem a exclusão do rascunho.
 */
export type FiltroSituacao = '' | 'RASCUNHO' | 'EM_APROVACAO' | 'EMITIDO' | 'AGUARDANDO' | 'CONCLUIDOS';

const OPCOES_SITUACAO: { value: FiltroSituacao; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'RASCUNHO', label: 'Em elaboração' },
    { value: 'EM_APROVACAO', label: 'Em aprovação' },
    { value: 'EMITIDO', label: 'Emitidos (em curso)' },
    { value: 'AGUARDANDO', label: 'Aguardando resposta' },
    { value: 'CONCLUIDOS', label: 'Respondidos / encerrados / cancelados' },
];

const COR_STATUS: Record<DocGenDocumentoStatus, string> = {
    RASCUNHO: 'text-gray-600',
    EMITIDO: 'text-green-700',
    ENVIADO: 'text-green-700',
    RECEBIDO: 'text-green-700',
    RESPONDIDO: 'text-emerald-700',
    ENCERRADO: 'text-slate-600',
    CANCELADO: 'text-red-600',
};

/** Rótulo da situação — o rascunho mostra também a aprovação. */
function situacaoDe(d: DocGenDocumento): { label: string; className: string } {
    if (d.status === 'RASCUNHO' && d.approval_status === 'PENDENTE') return { label: 'Em aprovação', className: 'text-amber-700' };
    if (d.status === 'RASCUNHO' && d.approval_status === 'APROVADO') return { label: 'Aprovado (a emitir)', className: 'text-blue-700' };
    if (d.status === 'RASCUNHO' && d.approval_status === 'REJEITADO') return { label: 'Rejeitado', className: 'text-red-600' };
    return { label: ROTULO_SITUACAO[d.status], className: COR_STATUS[d.status] };
}

// Soma alvo ≈ 1.180 px (memória: soma das larguras ≤ ~1270 px com a sidebar aberta).
const COLUMNS: StandardTableColumn[] = [
    { key: 'numero', label: 'Número', sortable: true, width: 140 },
    { key: 'assunto', label: 'Assunto', sortable: true, width: 270 },
    { key: 'destinatario', label: 'Destinatário', sortable: true, width: 220 },
    { key: 'modelo', label: 'Modelo', sortable: true, width: 170 },
    { key: 'status', label: 'Situação', sortable: true, width: 150 },
    { key: 'resposta', label: 'Resposta até', sortable: true, width: 110 },
    { key: 'updated_at', label: 'Atualizado em', sortable: true, width: 140 },
];

/** "Aguardando resposta": emitido, ainda em curso (não respondido/encerrado/cancelado) e com prazo. */
const aguardando = (d: DocGenDocumento) => !!d.resposta_esperada_ate && SITUACOES_EM_CURSO.includes(d.status);

interface Props {
    documentos: DocGenDocumento[];
    modelos: DocGenModelo[];
    loading: boolean;
    onAbrir: (d: DocGenDocumento) => void;
    onExcluir: (d: DocGenDocumento) => void;
}

export default function OficiosList({ documentos, modelos, loading, onAbrir, onExcluir }: Props) {
    const [situacao, setSituacao] = usePersistedState<FiltroSituacao>('oficios:situacao', '');
    const nomeModelo = React.useMemo(() => {
        const m: Record<string, string> = {};
        for (const x of modelos) m[x.id] = x.nome;
        return m;
    }, [modelos]);

    const hoje = hojeIso();
    const mes = hoje.slice(0, 7);
    const kpis = React.useMemo(() => ({
        rascunhos: documentos.filter(d => d.status === 'RASCUNHO').length,
        emitidosMes: documentos.filter(d => d.status !== 'CANCELADO' && (d.emitido_em ?? '').slice(0, 7) === mes).length,
        aguardando: documentos.filter(aguardando).length,
        vencidos: documentos.filter(d => aguardando(d) && (d.resposta_esperada_ate ?? '') < hoje).length,
    }), [documentos, mes, hoje]);

    // Array estável (§6.7): o recorte de escopo vem de fora da tabela.
    const linhas = React.useMemo(() => {
        if (situacao === 'AGUARDANDO') return documentos.filter(aguardando);
        if (situacao === 'EM_APROVACAO') return documentos.filter(d => d.status === 'RASCUNHO' && d.approval_status === 'PENDENTE');
        if (situacao === 'EMITIDO') return documentos.filter(d => SITUACOES_EM_CURSO.includes(d.status));
        if (situacao === 'CONCLUIDOS') return documentos.filter(d => ['RESPONDIDO', 'ENCERRADO', 'CANCELADO'].includes(d.status));
        if (situacao) return documentos.filter(d => d.status === situacao);
        return documentos;
    }, [documentos, situacao]);

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Em elaboração" value={kpis.rascunhos} icon={<FilePen className="w-4 h-4" />} color="gray" />
                <KpiCard label="Emitidos no mês" value={kpis.emitidosMes} icon={<FileCheck2 className="w-4 h-4" />} color="emerald" />
                <KpiCard label="Aguardando resposta" value={kpis.aguardando} icon={<CalendarClock className="w-4 h-4" />} color="blue" />
                <KpiCard label="Prazo de resposta vencido" value={kpis.vencidos} icon={<CalendarClock className="w-4 h-4" />} color={kpis.vencidos ? 'red' : 'gray'} />
            </div>

            <StandardTable<DocGenDocumento>
                storageKey="oficios:documentos"
                columns={COLUMNS}
                rows={linhas}
                rowKey={d => d.id}
                loading={loading}
                searchText={d => `${d.numero ?? ''} ${d.assunto} ${d.destinatario_snapshot?.razao_social ?? ''} ${nomeModelo[d.modelo_id] ?? ''}`}
                searchPlaceholder="Buscar por número, assunto, destinatário ou modelo..."
                filters={<FilterPopover<FiltroSituacao> label="Situação" value={situacao} onChange={setSituacao} options={OPCOES_SITUACAO} />}
                sortValue={(key, d) => {
                    switch (key) {
                        case 'numero': return d.numero ?? '';
                        case 'assunto': return d.assunto;
                        case 'destinatario': return d.destinatario_snapshot?.razao_social ?? '';
                        case 'modelo': return nomeModelo[d.modelo_id] ?? '';
                        case 'status': return situacaoDe(d).label;
                        case 'resposta': return d.resposta_esperada_ate ?? '';
                        case 'updated_at': return d.updated_at;
                        default: return null;
                    }
                }}
                onRowClick={onAbrir}
                renderCell={(key, d) => {
                    switch (key) {
                        case 'numero':
                            return d.numero
                                ? <span className="text-sm font-normal text-gray-700">{d.numero}</span>
                                : <span className="text-sm font-normal text-gray-400" title="O número é atribuído na emissão">—</span>;
                        case 'assunto':
                            return d.assunto
                                ? <span className="block truncate text-sm font-normal text-gray-700" title={d.assunto}>{d.assunto}</span>
                                : <span className="text-sm font-normal text-gray-400">Sem assunto</span>;
                        case 'destinatario': {
                            const s = d.destinatario_snapshot;
                            return s ? (
                                <span className="block min-w-0">
                                    <span className="block truncate text-sm font-normal text-gray-700" title={s.razao_social}>{s.razao_social}</span>
                                    <span className="block truncate text-xs text-gray-400">{ROTULO_TIPO[s.tipo]}</span>
                                </span>
                            ) : <span className="text-sm font-normal text-gray-400">—</span>;
                        }
                        case 'modelo':
                            return <span className="block truncate text-sm font-normal text-gray-700" title={nomeModelo[d.modelo_id]}>{nomeModelo[d.modelo_id] ?? '—'}</span>;
                        case 'status': {
                            const s = situacaoDe(d);
                            return <span className={`block truncate text-sm font-normal ${s.className}`} title={s.label}>{s.label}</span>;
                        }
                        case 'resposta': {
                            if (!d.resposta_esperada_ate) return <span className="text-sm font-normal text-gray-400">—</span>;
                            const vencido = d.resposta_esperada_ate < hoje && SITUACOES_EM_CURSO.includes(d.status);
                            return <span className={`text-sm font-normal ${vencido ? 'text-red-600' : 'text-gray-600'}`} title={vencido ? 'Prazo vencido' : undefined}>{dataCurta(d.resposta_esperada_ate)}</span>;
                        }
                        case 'updated_at':
                            return <span className="text-sm font-normal text-gray-600">{formatarDataHora(d.updated_at)}</span>;
                        default:
                            return null;
                    }
                }}
                actions={{
                    width: 80,
                    render: d => (
                        <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                            <InlineDisclosureMenu
                                showDelete
                                onDelete={() => onExcluir(d)}
                                deleteDisabled={d.status !== 'RASCUNHO'}
                                deleteDisabledTitle={d.status !== 'RASCUNHO' ? 'Documento emitido não se exclui' : undefined}
                            />
                        </div>
                    ),
                }}
                empty={{
                    icon: <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: documentos.length ? 'Nenhum ofício nesta situação' : 'Nenhum ofício ainda',
                    subtitle: documentos.length ? 'Troque o filtro de situação ou a busca.' : 'Comece por "Novo ofício": escolha o modelo, o destinatário e redija.',
                }}
            />
        </div>
    );
}
