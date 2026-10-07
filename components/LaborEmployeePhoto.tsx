import React from 'react';
import { Camera, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { IMAGE_ACCEPT_ATTR } from '../lib/mimeValidation';

interface LaborEmployeePhotoProps {
    /** URL já resolvida da foto atual (null = sem foto). */
    src: string | null;
    /** Recebe o arquivo escolhido — por arraste ou pelo seletor. */
    onSelect: (file: File) => void | Promise<void>;
    onRemove: () => void;
    uploading?: boolean;
    /** Nome do colaborador — vai no `alt` da foto. */
    name?: string;
}

/**
 * Foto 3x4 do colaborador (aba Geral, canto superior esquerdo).
 *
 * Quadro com a proporção do documento (`aspect-[3/4]`) e `object-cover`: a foto
 * enviada em qualquer proporção é recortada ao centro, nunca esticada. Por isso
 * não é o `ui/ImageDropzone` — aquele é uma faixa de altura fixa com
 * `object-contain`, para foto de ativo.
 *
 * "Trocar" e "Remover" ficam SEMPRE visíveis abaixo do quadro (não num overlay
 * de hover): no toque não existe hover, e ação escondida não se descobre (§9).
 */
const LaborEmployeePhoto: React.FC<LaborEmployeePhotoProps> = ({ src, onSelect, onRemove, uploading = false, name }) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = React.useState(false);

    const escolher = (file?: File | null) => {
        if (!file || uploading) return;
        void onSelect(file);
    };
    const abrirSeletor = () => { if (!uploading) inputRef.current?.click(); };

    return (
        <div className="w-32 shrink-0 space-y-1.5">
            <div
                role="button"
                tabIndex={uploading ? -1 : 0}
                aria-label={src ? 'Trocar foto 3x4' : 'Enviar foto 3x4'}
                title={src ? 'Clique ou arraste para trocar a foto' : 'Clique ou arraste uma foto 3x4'}
                onClick={abrirSeletor}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirSeletor(); } }}
                onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); escolher(e.dataTransfer.files?.[0]); }}
                className={`relative aspect-[3/4] w-full rounded-[10px] overflow-hidden flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40
                    ${src && !dragging ? 'border border-gray-200 bg-gray-50' : 'border-2 border-dashed'}
                    ${dragging ? 'border-blue-500 bg-blue-50' : src ? '' : 'border-gray-200 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40'}
                    ${uploading ? 'cursor-default' : 'cursor-pointer'}`}
            >
                {uploading ? (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-xs font-medium">Enviando...</span>
                    </div>
                ) : src ? (
                    <img src={src} alt={name ? `Foto de ${name}` : 'Foto do colaborador'} className="w-full h-full object-cover" />
                ) : (
                    <div className="flex flex-col items-center gap-1.5 text-gray-400 px-3 text-center">
                        <Camera className="w-7 h-7 text-gray-300" />
                        <span className="text-xs font-medium text-gray-500">Foto 3x4</span>
                        <span className="text-[11px] leading-tight">JPG, PNG ou WEBP · até 5 MB</span>
                    </div>
                )}
            </div>

            {src && !uploading && (
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={abrirSeletor}
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                        <UploadCloud className="w-3.5 h-3.5" /> Trocar
                    </button>
                    <button
                        type="button"
                        onClick={onRemove}
                        className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Remover
                    </button>
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                accept={IMAGE_ACCEPT_ATTR}
                className="hidden"
                onChange={e => { escolher(e.target.files?.[0]); e.target.value = ''; }}
            />
        </div>
    );
};

export default LaborEmployeePhoto;
