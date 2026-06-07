import React from 'react';
import { Trash2, Loader2, AlertCircle, X, ZoomIn } from 'lucide-react';

export interface PhotoItem {
    id: string;
    url: string;
    description?: string | null;
}

interface Props {
    photos: PhotoItem[];
    onDelete?: (id: string) => Promise<void>;
}

const PhotoGallery: React.FC<Props> = ({ photos, onDelete }) => {
    const [lightbox, setLightbox] = React.useState<string | null>(null);
    const [deleting, setDeleting] = React.useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if (!onDelete) return;
        if (!window.confirm('Remover esta foto?')) return;
        setDeleting(id);
        try {
            await onDelete(id);
        } finally {
            setDeleting(null);
        }
    };

    if (photos.length === 0) return null;

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map(photo => (
                    <div key={photo.id} className="relative group aspect-square rounded-2xl overflow-hidden bg-gray-100">
                        <img
                            src={photo.url}
                            alt={photo.description || 'Foto'}
                            className="w-full h-full object-cover cursor-zoom-in transition-transform duration-300 group-hover:scale-105"
                            onClick={() => setLightbox(photo.url)}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors pointer-events-none flex items-center justify-center">
                            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>

                        {photo.description && (
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 translate-y-full group-hover:translate-y-0 transition-transform">
                                <p className="text-xs text-white font-medium truncate">{photo.description}</p>
                            </div>
                        )}

                        {onDelete && (
                            <button
                                onClick={e => { e.stopPropagation(); handleDelete(photo.id); }}
                                disabled={deleting === photo.id}
                                className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                                title="Remover foto"
                            >
                                {deleting === photo.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <Trash2 className="w-3 h-3" />
                                }
                            </button>
                        )}
                    </div>
                ))}
            </div>

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
        </>
    );
};

export default PhotoGallery;
