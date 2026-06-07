import React from 'react';
import { Upload, Trash2, Loader2, AlertCircle, X, ZoomIn, Image } from 'lucide-react';
import {
    opportunityDocumentsService,
    OpportunityDocument,
} from '../../services/opportunityDocumentsService';

interface Props {
    opportunityId: string;
    organizationId: string;
    isAdmin: boolean;
    uploadedBy?: string;
}

interface PhotoEntry {
    doc: OpportunityDocument;
    url: string | null;
}

const OpportunityPhotosPanel: React.FC<Props> = ({ opportunityId, organizationId, isAdmin, uploadedBy }) => {
    const [photos, setPhotos] = React.useState<PhotoEntry[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);
    const [dragOver, setDragOver] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [uploadError, setUploadError] = React.useState<string | null>(null);
    const [deleting, setDeleting] = React.useState<string | null>(null);
    const [lightbox, setLightbox] = React.useState<string | null>(null);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const loadPhotos = React.useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const all = await opportunityDocumentsService.list(opportunityId);
            const fotoDocs = all.filter(d => d.category === 'foto');
            const withUrls = await Promise.all(
                fotoDocs.map(async doc => {
                    try {
                        const url = await opportunityDocumentsService.getSignedUrl(doc.file_path);
                        return { doc, url };
                    } catch {
                        return { doc, url: null };
                    }
                }),
            );
            setPhotos(withUrls);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    React.useEffect(() => { loadPhotos(); }, [loadPhotos]);

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        setUploadError(null);
        try {
            const added: PhotoEntry[] = [];
            for (const file of Array.from(files)) {
                if (!file.type.startsWith('image/')) continue;
                const doc = await opportunityDocumentsService.upload(
                    organizationId,
                    opportunityId,
                    file,
                    { category: 'foto', uploadedBy },
                );
                let url: string | null = null;
                try { url = await opportunityDocumentsService.getSignedUrl(doc.file_path); } catch { /* no-op */ }
                added.push({ doc, url });
            }
            if (added.length > 0) setPhotos(prev => [...added, ...prev]);
        } catch (err: any) {
            setUploadError(err?.message ?? 'Erro ao fazer upload.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (entry: PhotoEntry) => {
        if (!window.confirm('Remover esta foto?')) return;
        setDeleting(entry.doc.id!);
        try {
            await opportunityDocumentsService.remove(entry.doc.id!, entry.doc.file_path);
            setPhotos(prev => prev.filter(p => p.doc.id !== entry.doc.id));
            if (lightbox === entry.url) setLightbox(null);
        } catch {
            alert('Erro ao remover foto.');
        } finally {
            setDeleting(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Carregando fotos...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Erro ao carregar. <button onClick={loadPhotos} className="underline font-bold">Tentar novamente</button></span>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Upload zone (admin) */}
            {isAdmin && (
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${uploading ? 'cursor-wait' : 'cursor-pointer'} ${dragOver
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                >
                    {uploading ? (
                        <div className="flex items-center justify-center gap-2 text-blue-500">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm font-bold">Enviando...</span>
                        </div>
                    ) : (
                        <>
                            <Upload className={`w-7 h-7 mx-auto mb-2 ${dragOver ? 'text-blue-500' : 'text-gray-300'}`} />
                            <p className="text-sm font-bold text-gray-500">
                                {dragOver ? 'Solte as fotos aqui' : 'Arraste fotos ou clique para selecionar'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — múltiplos arquivos — até 50 MB cada</p>
                        </>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
                    />
                </div>
            )}

            {uploadError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {uploadError}
                    <button onClick={() => setUploadError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
                </div>
            )}

            {/* Gallery grid */}
            {photos.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
                    <Image className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Nenhuma foto adicionada</p>
                    {isAdmin && <p className="text-xs text-gray-300 mt-1">Use a área acima para adicionar fotos</p>}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {photos.map(entry => (
                            <div key={entry.doc.id} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
                                {entry.url ? (
                                    <>
                                        <img
                                            src={entry.url}
                                            alt={entry.doc.description || entry.doc.name}
                                            className="w-full h-full object-cover cursor-zoom-in transition-transform duration-300 group-hover:scale-105"
                                            onClick={() => setLightbox(entry.url!)}
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors pointer-events-none flex items-center justify-center">
                                            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        {entry.doc.description && (
                                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 translate-y-full group-hover:translate-y-0 transition-transform">
                                                <p className="text-xs text-white font-medium truncate">{entry.doc.description}</p>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <AlertCircle className="w-6 h-6 text-gray-300" />
                                    </div>
                                )}

                                {isAdmin && (
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDelete(entry); }}
                                        disabled={deleting === entry.doc.id}
                                        className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                                        title="Remover foto"
                                    >
                                        {deleting === entry.doc.id
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : <Trash2 className="w-3 h-3" />
                                        }
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-400 text-center">
                        {photos.length} foto{photos.length !== 1 ? 's' : ''}
                    </p>
                </>
            )}

            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setLightbox(null)}
                >
                    <button
                        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                        onClick={() => setLightbox(null)}
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <img
                        src={lightbox}
                        alt="Foto ampliada"
                        className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
};

export default OpportunityPhotosPanel;
