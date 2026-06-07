import React from 'react';
import { Upload, Loader2, AlertCircle, X, Image } from 'lucide-react';
import {
    opportunityDocumentsService,
    OpportunityDocument,
} from '../../services/opportunityDocumentsService';
import PhotoGallery, { PhotoItem } from './PhotoGallery';

interface Props {
    opportunityId: string;
    organizationId: string;
    isAdmin: boolean;
    uploadedBy?: string;
}

const OpportunityPhotosPanel: React.FC<Props> = ({ opportunityId, organizationId, isAdmin, uploadedBy }) => {
    const [photos, setPhotos] = React.useState<PhotoItem[]>([]);
    const [docs, setDocs] = React.useState<OpportunityDocument[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(false);
    const [dragOver, setDragOver] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [uploadError, setUploadError] = React.useState<string | null>(null);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const loadPhotos = React.useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const all = await opportunityDocumentsService.list(opportunityId);
            const fotoDocs = all.filter(d => d.category === 'foto');
            setDocs(fotoDocs);
            setPhotos(fotoDocs.map(d => ({
                id: d.id!,
                url: opportunityDocumentsService.getPublicPhotoUrl(d.file_path),
                description: d.description,
            })));
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
            for (const file of Array.from(files)) {
                if (!file.type.startsWith('image/')) continue;
                const doc = await opportunityDocumentsService.upload(
                    organizationId, opportunityId, file,
                    { category: 'foto', uploadedBy },
                );
                const item: PhotoItem = {
                    id: doc.id!,
                    url: opportunityDocumentsService.getPublicPhotoUrl(doc.file_path),
                    description: doc.description,
                };
                setDocs(prev => [doc, ...prev]);
                setPhotos(prev => [item, ...prev]);
            }
        } catch (err: any) {
            setUploadError(err?.message ?? 'Erro ao fazer upload.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const doc = docs.find(d => d.id === id);
        if (!doc) return;
        await opportunityDocumentsService.remove(doc.id!, doc.file_path, 'foto');
        setDocs(prev => prev.filter(d => d.id !== id));
        setPhotos(prev => prev.filter(p => p.id !== id));
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
            {isAdmin && (
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${uploading ? 'cursor-wait' : 'cursor-pointer'} ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
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
                        type="file" multiple accept="image/*" className="hidden"
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

            {photos.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100">
                    <Image className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Nenhuma foto adicionada</p>
                    {isAdmin && <p className="text-xs text-gray-300 mt-1">Use a área acima para adicionar fotos</p>}
                </div>
            ) : (
                <>
                    <PhotoGallery photos={photos} onDelete={isAdmin ? handleDelete : undefined} />
                    <p className="text-xs text-gray-400 text-center">
                        {photos.length} foto{photos.length !== 1 ? 's' : ''}
                    </p>
                </>
            )}
        </div>
    );
};

export default OpportunityPhotosPanel;
