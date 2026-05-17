
import React from 'react';
import { Camera, Maximize2, Play, ChevronLeft, ChevronRight, Plus, Trash2, Loader2, X } from 'lucide-react';

interface ProjectGalleryProps {
    images?: string[];
    liveCamUrl?: string;
    isAdmin?: boolean;
    onPhotosUpdate?: (newPhotos: string[]) => Promise<boolean | void> | void;
}

const ProjectGallery: React.FC<ProjectGalleryProps> = ({
    images = [],
    liveCamUrl,
    isAdmin = false,
    onPhotosUpdate
}) => {
    const [activeTab, setActiveTab] = React.useState<'photos' | 'live'>('photos');
    const [selectedImage, setSelectedImage] = React.useState(0);
    const [isUploading, setIsUploading] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Fallback images if none provided and not admin (to keep the look for the detail modal)
    const displayImages = images.length > 0 ? images : [
        'https://images.unsplash.com/photo-1541913080-214307cc0bc9?auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1503387762-592dee58c460?auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&q=80'
    ];

    const actualImages = images.length > 0 ? images : (isAdmin ? [] : displayImages);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onPhotosUpdate) return;

        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Resize image before saving to avoid payload too large (CORS error) in Supabase JSONB
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1200;
                    const MAX_HEIGHT = 1200;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        const resizedBase64 = canvas.toDataURL('image/jpeg', 0.7); // compress to 70% quality JPEG

                        // Handle async photo update to correctly show uploading state
                        const doUpdate = async () => {
                            try {
                                const result = onPhotosUpdate([...images, resizedBase64]);
                                if (result instanceof Promise) {
                                    const success = await result;
                                    if (success === false) {
                                        alert("Erro ao salvar a imagem no servidor. Tente novamente.");
                                    }
                                }
                            } catch (e: any) {
                                alert("Erro interno ao enviar a imagem: " + (e.message || ''));
                            } finally {
                                setIsUploading(false);
                            }
                        };
                        doUpdate();
                    } else {
                        // Fallback if canvas context fails
                        const doUpdateFallback = async () => {
                            try {
                                const result = onPhotosUpdate([...images, reader.result as string]);
                                if (result instanceof Promise) {
                                    const success = await result;
                                    if (success === false) {
                                        alert("Erro ao salvar a imagem no servidor. Tente novamente.");
                                    }
                                }
                            } catch (e: any) {
                                alert("Erro interno ao enviar a imagem: " + (e.message || ''));
                            } finally {
                                setIsUploading(false);
                            }
                        };
                        doUpdateFallback();
                    }
                };
                img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Error uploading image:', error);
            setIsUploading(false);
        }
    };

    const handleDelete = async (index: number) => {
        if (!onPhotosUpdate) return;
        const newPhotos = images.filter((_, i) => i !== index);

        try {
            const result = onPhotosUpdate(newPhotos);
            if (result instanceof Promise) {
                const success = await result;
                if (success === false) {
                    alert("Erro ao excluir a imagem no servidor. Tente novamente.");
                    return; // Stop local UI update if server failed
                }
            }
            if (selectedImage >= newPhotos.length) {
                setSelectedImage(Math.max(0, newPhotos.length - 1));
            }
        } catch (e: any) {
            alert("Erro interno ao excluir a imagem: " + (e.message || ''));
        }
    };

    return (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="flex border-b border-gray-50 items-center justify-between pr-4">
                <div className="flex">
                    <button
                        onClick={() => setActiveTab('photos')}
                        className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'photos' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Galeria de Fotos
                    </button>
                    <button
                        onClick={() => setActiveTab('live')}
                        className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'live' ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <div className={`w-2 h-2 rounded-full bg-red-600 ${activeTab === 'live' ? 'animate-pulse' : ''}`} />
                        Câmera ao Vivo
                    </button>
                </div>

                {isAdmin && activeTab === 'photos' && (
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept="image/*"
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-50"
                        >
                            {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                            Adicionar Foto
                        </button>
                    </div>
                )}
            </div>

            <div className="p-1">
                {activeTab === 'photos' ? (
                    <div className="relative group">
                        {actualImages.length > 0 ? (
                            <>
                                <div className="aspect-video bg-gray-100 rounded-2xl overflow-hidden relative group/main">
                                    <img
                                        src={actualImages[selectedImage]}
                                        alt="Work Progress"
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover/main:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover/main:opacity-100 transition-opacity" />

                                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center opacity-0 group-hover/main:opacity-100 transition-opacity">
                                        <button className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40">
                                            <Maximize2 className="w-4 h-4" />
                                        </button>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setSelectedImage((prev) => (prev > 0 ? prev - 1 : actualImages.length - 1))}
                                                className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setSelectedImage((prev) => (prev < actualImages.length - 1 ? prev + 1 : 0))}
                                                className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {isAdmin && (
                                        <button
                                            onClick={() => handleDelete(selectedImage)}
                                            className="absolute top-4 right-4 p-2.5 bg-red-600/90 text-white rounded-xl shadow-lg transition-all hover:bg-red-700 hover:scale-105"
                                            title="Excluir foto"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex gap-2 p-4 overflow-x-auto no-scrollbar">
                                    {actualImages.map((img, i) => (
                                        <div key={i} className="relative group/thumb">
                                            <button
                                                onClick={() => setSelectedImage(i)}
                                                className={`w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${selectedImage === i ? 'border-indigo-600 scale-105 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                                                    }`}
                                            >
                                                <img src={img} className="w-full h-full object-cover" />
                                            </button>
                                            {isAdmin && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(i);
                                                    }}
                                                    className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-700 transition-transform hover:scale-110 z-10"
                                                    title="Excluir"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="aspect-video bg-gray-50 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-100">
                                <Camera className="w-12 h-12 text-gray-200 mb-4" />
                                <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Nenhuma foto na galeria</p>
                                {isAdmin && (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="mt-4 px-6 py-3 bg-white border border-gray-200 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-600 transition-all"
                                    >
                                        Começar Galeria
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="aspect-video bg-slate-900 rounded-2xl flex flex-col items-center justify-center text-white relative group overflow-hidden">
                        {/* Simulated Live Feed */}
                        <div className="absolute inset-0 bg-black opacity-40 group-hover:opacity-60 transition-opacity" />
                        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 bg-red-600 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
                            Live
                        </div>

                        <div className="relative z-10 flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center mb-4 border border-white/20 group-hover:scale-110 transition-transform cursor-pointer">
                                <Play className="w-8 h-8 fill-white" />
                            </div>
                            <p className="text-xs font-bold tracking-widest uppercase opacity-80">Conectando ao stream da obra...</p>
                        </div>

                        {/* Simulated UI Overlay */}
                        <div className="absolute bottom-4 left-4 text-[10px] font-mono opacity-50">
                            CAM_01 // LAT: -27.595 // LON: -48.548 // {new Date().toLocaleTimeString()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectGallery;
