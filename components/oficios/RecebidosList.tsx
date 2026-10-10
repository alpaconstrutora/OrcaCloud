import React from 'react';
import { Inbox, Reply, FileDown, FolderOpen } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import type { DocGenDocumento, DocGenVinculo } from '../../types/docGen';
import { respostaDoRecebido, type OficioRecebido } from '../../services/docGen/tramitacao';
import { dataCurta, hojeIso } from '../../services/docGen/dataExtenso';

/**
 * Documentos › Ofícios › aba Recebidos (F4): ofícios que chegaram de terceiros,
 * arquivados no GED. "Responder" abre um ofício novo já vinculado (em resposta a).
 */
interface Props {
    recebidos: OficioRecebido[];
    vinculos: DocGenVinculo[];
    documentos: DocGenDocumento[];
    loading: boolean;
    onAbrirPdf: (r: OficioRecebido) => void;
    onAbrirGed: (r: OficioRecebido) => void;
    onResponder: (r: OficioRecebido) => void;
    onAbrirOficio: (d: DocGenDocumento) => void;
}

// Soma ≈ 1.150 px (memória: soma das larguras ≤ ~1270 px com a sidebar aberta).
const COLUMNS: StandardTableColumn[] = [
    { key: 'numero', label: 'Número', sortable: true, width: 120 },
    { key: 'assunto', label: 'Assunto', sortable: true, width: 280 },
    { key: 'remetente', label: 'Remetente', sortable: true, width: 220 },
    { key: 'recebido', label: 'Recebido em', sortable: true, width: 110 },
    { key: 'prazo', label: 'Responder até', sortable: true, width: 120 },
    { key: 'situacao', label: 'Situação', sortable: true, width: 180 },
];

export default function RecebidosList({ recebidos, vinculos, documentos, loading, onAbrirPdf, onAbrirGed, onResponder, onAbrirOficio }: Props) {
    const hoje = hojeIso();
    const situacao = React.useCallback((r: OficioRecebido) => {
        // Ele mesmo é a resposta a um ofício nosso.
        const ao = vinculos.find(v => v.tipo === 'RESPONDE' && v.de_ged_id === r.documento.id && v.para_documento_id);
        const nosso = ao ? documentos.find(d => d.id === ao.para_documento_id) ?? null : null;
        const resp = respostaDoRecebido(r.documento.id, vinculos, documentos);
        if (nosso && !resp.emitida && !resp.rascunho && !r.meta.responder_ate) {
            return { texto: `Resposta ao ${nosso.numero ?? 'nosso ofício'}`, className: 'text-gray-600', doc: nosso, podeResponder: true };
        }
        if (resp.emitida) return { texto: `Respondido — ${resp.emitida.numero ?? 'ofício'}`, className: 'text-green-700', doc: resp.emitida, podeResponder: false };
        if (resp.rascunho) return { texto: 'Resposta em elaboração', className: 'text-blue-700', doc: resp.rascunho, podeResponder: false };
        if (!r.meta.responder_ate) return { texto: 'Sem prazo de resposta', className: 'text-gray-500', doc: null, podeResponder: true };
        if (r.meta.responder_ate < hoje) return { texto: 'Prazo vencido', className: 'text-red-600', doc: null, podeResponder: true };
        return { texto: 'Aguardando resposta', className: 'text-amber-700', doc: null, podeResponder: true };
    }, [vinculos, documentos, hoje]);

    return (
        <StandardTable<OficioRecebido>
            storageKey="oficios:recebidos"
            columns={COLUMNS}
            rows={recebidos}
            rowKey={r => r.documento.id}
            loading={loading}
            searchText={r => `${r.meta.numero ?? ''} ${r.meta.assunto} ${r.meta.remetente}`}
            searchPlaceholder="Buscar por número, assunto ou remetente..."
            sortValue={(key, r) => {
                switch (key) {
                    case 'numero': return r.meta.numero ?? '';
                    case 'assunto': return r.meta.assunto;
                    case 'remetente': return r.meta.remetente;
                    case 'recebido': return r.meta.recebido_em;
                    case 'prazo': return r.meta.responder_ate ?? '';
                    case 'situacao': return situacao(r).texto;
                    default: return null;
                }
            }}
            onRowClick={onAbrirPdf}
            renderCell={(key, r) => {
                switch (key) {
                    case 'numero': return <span className="text-sm font-normal text-gray-700">{r.meta.numero || '—'}</span>;
                    case 'assunto': return <span className="block truncate text-sm font-normal text-gray-700" title={r.meta.assunto}>{r.meta.assunto}</span>;
                    case 'remetente': return <span className="block truncate text-sm font-normal text-gray-700" title={r.meta.remetente}>{r.meta.remetente}</span>;
                    case 'recebido': return <span className="text-sm font-normal text-gray-600">{dataCurta(r.meta.recebido_em)}</span>;
                    case 'prazo': return <span className="text-sm font-normal text-gray-600">{r.meta.responder_ate ? dataCurta(r.meta.responder_ate) : '—'}</span>;
                    case 'situacao': {
                        const s = situacao(r);
                        return s.doc ? (
                            <button type="button" onClick={e => { e.stopPropagation(); onAbrirOficio(s.doc!); }}
                                className={`block truncate text-sm font-normal hover:underline ${s.className}`} title="Abrir o ofício">{s.texto}</button>
                        ) : <span className={`block truncate text-sm font-normal ${s.className}`}>{s.texto}</span>;
                    }
                    default: return null;
                }
            }}
            actions={{
                width: 130,
                render: r => (
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <ActionIconButton kind="download" title="Abrir o PDF" icon={<FileDown className="w-4 h-4" />} onClick={() => onAbrirPdf(r)} />
                        <ActionIconButton kind="view" title="Abrir no GED" icon={<FolderOpen className="w-4 h-4" />} onClick={() => onAbrirGed(r)} />
                        {situacao(r).podeResponder && <ActionIconButton kind="edit" title="Responder — novo ofício em resposta a este" icon={<Reply className="w-4 h-4" />} onClick={() => onResponder(r)} />}
                    </div>
                ),
            }}
            empty={{
                icon: <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                title: 'Nenhum ofício recebido registrado',
                subtitle: 'Use "Registrar recebido" para arquivar no GED o ofício que chegou e acompanhar o prazo de resposta.',
            }}
        />
    );
}
