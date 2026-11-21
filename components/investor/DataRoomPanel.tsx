import React from 'react';
import { FolderOpen, Loader2, AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import {
    opportunityDocumentsService, CATEGORIA_DO_GED, fmtFileSize, type DocumentoDoDataRoom,
} from '../../services/opportunityDocumentsService';
import type { OpuraDocument } from '../../types/documents';

interface Props {
    opportunityId: string;
    organizationId: string;
    isAdmin: boolean;
    uploadedBy?: string;
    /** Empreendimento do estudo da oportunidade: de onde vêm os documentos que se compartilham. */
    empreendimentoId?: string | null;
    /** Portal do Investidor por link (sessão anônima): lista e baixa pelo token. */
    portalToken?: string;
}

const MIME_LABELS: Record<string, string> = {
    'application/pdf': 'PDF',
    'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/gif': 'GIF', 'image/webp': 'WEBP',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/msword': 'DOC',
    'application/zip': 'ZIP',
    'application/x-zip-compressed': 'ZIP',
    'application/dwg': 'DWG',
};
const rotuloDoTipo = (mime?: string | null) => (!mime ? 'ARQ' : MIME_LABELS[mime] ?? mime.split('/').pop()?.toUpperCase() ?? 'ARQ');

/**
 * Data Room da oportunidade = documentos do GED COMPARTILHADOS com ela (plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 3). O arquivo mora só no GED, do
 * empreendimento; o investidor vê a versão ativa. Upload: aba Documentos do empreendimento (ou o GED).
 */
const DataRoomPanel: React.FC<Props> = ({ opportunityId, isAdmin, uploadedBy, empreendimentoId, portalToken }) => {
    const [docs, setDocs] = React.useState<DocumentoDoDataRoom[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [aviso, setAviso] = React.useState<string | null>(null);
    const [downloading, setDownloading] = React.useState<string | null>(null);
    const [tirando, setTirando] = React.useState<string | null>(null);
    const [candidatos, setCandidatos] = React.useState<OpuraDocument[] | null>(null);
    const [escolhidos, setEscolhidos] = React.useState<string[]>([]);
    const [adicionando, setAdicionando] = React.useState(false);
    const gestor = isAdmin && !portalToken;

    const load = React.useCallback(() => {
        setLoading(true);
        setError(null);
        (portalToken ? opportunityDocumentsService.listByToken(portalToken, opportunityId) : opportunityDocumentsService.listar(opportunityId))
            .then(setDocs)
            .catch(e => setError((e as Error).message || 'Erro ao carregar.'))
            .finally(() => setLoading(false));
    }, [opportunityId, portalToken]);
    React.useEffect(() => { load(); }, [load]);

    const abrirCandidatos = async () => {
        if (!empreendimentoId) return;
        setAviso(null);
        try {
            setCandidatos(await opportunityDocumentsService.candidatos(empreendimentoId, docs.map(d => d.id)));
            setEscolhidos([]);
        } catch (e) {
            setAviso((e as Error).message);
        }
    };

    const adicionar = async () => {
        if (escolhidos.length === 0) return;
        setAdicionando(true);
        setAviso(null);
        try {
            await opportunityDocumentsService.compartilhar(escolhidos, opportunityId, uploadedBy || 'sistema');
            setCandidatos(null);
            load();
        } catch (e) {
            setAviso(`Não foi possível adicionar: ${(e as Error).message}`);
        } finally {
            setAdicionando(false);
        }
    };

    const tirar = async (d: DocumentoDoDataRoom) => {
        setTirando(d.id);
        setAviso(null);
        try {
            await opportunityDocumentsService.descompartilhar([d.id], opportunityId);
            setDocs(prev => prev.filter(x => x.id !== d.id));
        } catch (e) {
            setAviso(`Não foi possível tirar "${d.name}": ${(e as Error).message}`);
        } finally {
            setTirando(null);
        }
    };

    const baixar = async (d: DocumentoDoDataRoom) => {
        if (!d.file_path) return;
        setDownloading(d.id);
        setAviso(null);
        try {
            const url = portalToken
                ? await opportunityDocumentsService.getSignedUrlByToken(portalToken, opportunityId, d.file_path)
                : await opportunityDocumentsService.getSignedUrl(d.file_path);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) {
            setAviso(`Não foi possível baixar "${d.name}": ${(e as Error).message}`);
        } finally {
            setDownloading(null);
        }
    };

    const categorias = [...new Set(docs.map(d => d.category))];
    const motivoAdicionar = !empreendimentoId ? 'O estudo da oportunidade não tem empreendimento: os documentos moram no empreendimento.' : undefined;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Carregando documentos...</span>
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error} <button onClick={load} className="underline font-medium">Tentar novamente</button></span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {gestor && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-slate-50 border border-slate-200 px-4 py-3">
                    <p className="text-sm text-slate-600">
                        Os arquivos moram no GED do empreendimento (aba Documentos). Aqui se escolhe o que o investidor vê.
                    </p>
                    <span title={motivoAdicionar}>
                        <button type="button" onClick={() => void abrirCandidatos()} disabled={!!motivoAdicionar}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                            <Plus className="w-[15px] h-[15px]" /> Adicionar do empreendimento
                        </button>
                    </span>
                </div>
            )}

            {gestor && candidatos && (
                <div className="border border-blue-200 bg-blue-50/40 rounded-[10px] p-4 space-y-3">
                    {candidatos.length === 0 ? (
                        <p className="text-sm text-slate-600">Todos os documentos do empreendimento já estão no Data Room (ou ainda não há documento com arquivo).</p>
                    ) : (
                        <ul className="space-y-1.5">
                            {candidatos.map(c => (
                                <li key={c.id}>
                                    <label className="flex items-center gap-3 text-sm text-slate-800 cursor-pointer">
                                        <input type="checkbox" checked={escolhidos.includes(c.id)}
                                            onChange={e => setEscolhidos(prev => (e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id)))} />
                                        <span>{c.nome}</span>
                                        <span className="text-xs text-slate-500">{CATEGORIA_DO_GED[c.categoria] ?? c.categoria}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setCandidatos(null)} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                        <button type="button" onClick={() => void adicionar()} disabled={adicionando || escolhidos.length === 0}
                            title={escolhidos.length === 0 ? 'Marque ao menos um documento.' : undefined}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                            {adicionando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                            Adicionar ao Data Room
                        </button>
                    </div>
                </div>
            )}

            {aviso && (
                <div role="alert" className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-[10px] text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{aviso}</span>
                </div>
            )}

            {docs.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-[10px] border border-gray-100">
                    <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">Nenhum documento no data room</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {categorias.map(cat => (
                        <section key={cat} aria-label={CATEGORIA_DO_GED[cat] ?? cat}>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">
                                {CATEGORIA_DO_GED[cat] ?? cat} <span className="text-gray-500 font-normal">({docs.filter(d => d.category === cat).length})</span>
                            </h4>
                            <div className="space-y-2">
                                {docs.filter(d => d.category === cat).map(doc => (
                                    <div key={doc.id} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-[10px]">
                                        <span className="text-xs font-medium text-slate-600 w-10 flex-shrink-0">{rotuloDoTipo(doc.mime_type)}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                                                {doc.description && <span className="truncate">{doc.description}</span>}
                                                {doc.file_size ? <span className="flex-shrink-0">{fmtFileSize(doc.file_size)}</span> : null}
                                                {doc.created_at && <span className="flex-shrink-0">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <ActionIconButton
                                                kind="download"
                                                disabled={downloading === doc.id || !doc.file_path}
                                                title={!doc.file_path ? 'Documento sem arquivo no GED' : undefined}
                                                icon={downloading === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                                                onClick={() => void baixar(doc)}
                                            />
                                            {gestor && (
                                                <ActionIconButton
                                                    kind="delete"
                                                    title="Tirar do Data Room (o documento continua no GED)"
                                                    disabled={tirando === doc.id}
                                                    icon={tirando === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                                                    onClick={() => void tirar(doc)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {docs.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{docs.length} documento{docs.length !== 1 ? 's' : ''} · versão ativa do GED · link de download válido por 15 minutos</span>
                </div>
            )}
        </div>
    );
};

export default DataRoomPanel;
