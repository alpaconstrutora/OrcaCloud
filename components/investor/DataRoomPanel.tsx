import React from 'react';
import {
    Upload, Trash2, Download, FolderOpen, Loader2,
    AlertCircle, FileText, X, CheckCircle2,
} from 'lucide-react';
import {
    opportunityDocumentsService,
    OpportunityDocument, DocumentCategory,
    DOCUMENT_CATEGORY_LABELS, DOCUMENT_CATEGORY_ICONS,
    fmtFileSize,
} from '../../services/opportunityDocumentsService';

interface Props {
    opportunityId: string;
    organizationId: string;
    isAdmin: boolean;
    uploadedBy?: string;
}

const CATEGORIES: DocumentCategory[] = [
    'evte', 'sondagem', 'planta', 'matricula', 'financeiro', 'licenca', 'memorial', 'outro',
];

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

function getMimeLabel(mime?: string): string {
    if (!mime) return 'ARQ';
    return MIME_LABELS[mime] ?? mime.split('/').pop()?.toUpperCase() ?? 'ARQ';
}

function getMimeColor(mime?: string): string {
    if (!mime) return 'bg-gray-100 text-gray-600';
    if (mime === 'application/pdf') return 'bg-red-100 text-red-700';
    if (mime.startsWith('image/')) return 'bg-blue-100 text-blue-700';
    if (mime.includes('sheet') || mime.includes('excel')) return 'bg-emerald-100 text-emerald-700';
    if (mime.includes('word')) return 'bg-indigo-100 text-indigo-700';
    if (mime.includes('zip')) return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
}

const DataRoomPanel: React.FC<Props> = ({ opportunityId, organizationId, isAdmin, uploadedBy }) => {
    const [docs, setDocs] = React.useState<OpportunityDocument[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);

    // Upload state
    const [dragOver, setDragOver] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [uploadPct, setUploadPct] = React.useState(0);
    const [uploadError, setUploadError] = React.useState<string | null>(null);
    const [showUploadForm, setShowUploadForm] = React.useState(false);
    const [pendingFile, setPendingFile] = React.useState<File | null>(null);
    const [uploadCategory, setUploadCategory] = React.useState<DocumentCategory>('outro');
    const [uploadDescription, setUploadDescription] = React.useState('');

    // Download state
    const [downloading, setDownloading] = React.useState<string | null>(null);
    const [deleting, setDeleting] = React.useState<string | null>(null);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const load = React.useCallback(() => {
        setLoading(true);
        setError(false);
        opportunityDocumentsService.list(opportunityId)
            .then(setDocs)
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [opportunityId]);

    React.useEffect(() => { load(); }, [load]);

    const openFile = (file: File) => {
        setPendingFile(file);
        setUploadCategory('outro');
        setUploadDescription('');
        setUploadError(null);
        setShowUploadForm(true);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) openFile(file);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) openFile(file);
        e.target.value = '';
    };

    const handleUpload = async () => {
        if (!pendingFile) return;
        setUploading(true);
        setUploadPct(0);
        setUploadError(null);
        try {
            const saved = await opportunityDocumentsService.upload(
                organizationId,
                opportunityId,
                pendingFile,
                { category: uploadCategory, description: uploadDescription, uploadedBy },
                setUploadPct,
            );
            setDocs(prev => [saved, ...prev]);
            setShowUploadForm(false);
            setPendingFile(null);
        } catch (err: any) {
            setUploadError(err?.message ?? 'Erro ao fazer upload.');
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (doc: OpportunityDocument) => {
        setDownloading(doc.id!);
        try {
            const url = await opportunityDocumentsService.getSignedUrl(doc.file_path);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
            alert('Erro ao gerar link de download.');
        } finally {
            setDownloading(null);
        }
    };

    const handleDelete = async (doc: OpportunityDocument) => {
        if (!window.confirm(`Remover "${doc.name}"?`)) return;
        setDeleting(doc.id!);
        try {
            await opportunityDocumentsService.remove(doc.id!, doc.file_path);
            setDocs(prev => prev.filter(d => d.id !== doc.id));
        } catch {
            alert('Erro ao remover documento.');
        } finally {
            setDeleting(null);
        }
    };

    // Agrupar por categoria
    const byCategory = CATEGORIES.reduce<Record<DocumentCategory, OpportunityDocument[]>>(
        (acc, cat) => ({ ...acc, [cat]: docs.filter(d => d.category === cat) }),
        {} as Record<DocumentCategory, OpportunityDocument[]>,
    );
    const usedCategories = CATEGORIES.filter(c => byCategory[c].length > 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Carregando documentos...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Erro ao carregar. <button onClick={load} className="underline font-bold">Tentar novamente</button></span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ── Zona de upload (admin) ────────────────────────────── */}
            {isAdmin && !showUploadForm && (
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragOver
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                >
                    <Upload className={`w-8 h-8 mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-gray-300'}`} />
                    <p className="text-sm font-bold text-gray-500">
                        {dragOver ? 'Solte o arquivo aqui' : 'Arraste um arquivo ou clique para selecionar'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">PDF, DWG, XLSX, DOCX, ZIP, imagens — até 50 MB</p>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
                </div>
            )}

            {/* ── Formulário de upload ──────────────────────────────── */}
            {isAdmin && showUploadForm && pendingFile && (
                <div className="border border-blue-200 bg-blue-50 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${getMimeColor(pendingFile.type)}`}>
                                {getMimeLabel(pendingFile.type)}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900 truncate max-w-xs">{pendingFile.name}</p>
                                <p className="text-xs text-gray-500">{fmtFileSize(pendingFile.size)}</p>
                            </div>
                        </div>
                        <button onClick={() => { setShowUploadForm(false); setPendingFile(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Categoria</label>
                            <select
                                value={uploadCategory}
                                onChange={e => setUploadCategory(e.target.value as DocumentCategory)}
                                className="w-full px-3 py-2 border border-blue-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c} value={c}>
                                        {DOCUMENT_CATEGORY_ICONS[c]} {DOCUMENT_CATEGORY_LABELS[c]}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Descrição (opcional)</label>
                            <input
                                type="text"
                                value={uploadDescription}
                                onChange={e => setUploadDescription(e.target.value)}
                                placeholder="Ex: Sondagem SPT — mai/2026"
                                className="w-full px-3 py-2 border border-blue-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                            />
                        </div>
                    </div>

                    {uploadError && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            {uploadError}
                        </div>
                    )}

                    {uploading && (
                        <div className="space-y-1">
                            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${uploadPct}%` }} />
                            </div>
                            <p className="text-[10px] text-blue-500 text-right">Enviando...</p>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={handleUpload}
                            disabled={uploading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
                        >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {uploading ? 'Enviando...' : 'Fazer upload'}
                        </button>
                        <button
                            onClick={() => { setShowUploadForm(false); setPendingFile(null); }}
                            disabled={uploading}
                            className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm font-bold rounded-xl hover:bg-white transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Lista de documentos ───────────────────────────────── */}
            {docs.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
                    <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Nenhum documento no data room</p>
                    {isAdmin && <p className="text-xs text-gray-300 mt-1">Use a área acima para adicionar documentos</p>}
                </div>
            ) : (
                <div className="space-y-6">
                    {usedCategories.map(cat => (
                        <div key={cat}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-base">{DOCUMENT_CATEGORY_ICONS[cat]}</span>
                                <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
                                    {DOCUMENT_CATEGORY_LABELS[cat]}
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold">({byCategory[cat].length})</span>
                            </div>
                            <div className="space-y-2">
                                {byCategory[cat].map(doc => (
                                    <div
                                        key={doc.id}
                                        className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                                    >
                                        {/* Tipo */}
                                        <div className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black flex-shrink-0 ${getMimeColor(doc.mime_type)}`}>
                                            {getMimeLabel(doc.mime_type)}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{doc.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {doc.description && (
                                                    <span className="text-xs text-gray-500 truncate">{doc.description}</span>
                                                )}
                                                {doc.file_size && (
                                                    <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtFileSize(doc.file_size)}</span>
                                                )}
                                                {doc.created_at && (
                                                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                                                        {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Ações */}
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => handleDownload(doc)}
                                                disabled={downloading === doc.id}
                                                title="Download"
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-xl transition-colors disabled:opacity-50"
                                            >
                                                {downloading === doc.id
                                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                                    : <Download className="w-4 h-4" />
                                                }
                                            </button>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => handleDelete(doc)}
                                                    disabled={deleting === doc.id}
                                                    title="Remover"
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                                                >
                                                    {deleting === doc.id
                                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                                        : <Trash2 className="w-4 h-4" />
                                                    }
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Resumo */}
            {docs.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-400 pt-2 border-t border-gray-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{docs.length} documento{docs.length !== 1 ? 's' : ''} · acesso via link temporário (1h)</span>
                </div>
            )}
        </div>
    );
};

export default DataRoomPanel;
