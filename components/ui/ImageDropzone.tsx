import React from 'react';
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { IMAGE_ACCEPT_ATTR } from '../../lib/mimeValidation';

interface ImageDropzoneProps {
    /** URL já resolvida da imagem atual (null = vazio). */
    value: string | null;
    /** Recebe o arquivo escolhido — por arraste ou pelo seletor. */
    onSelect: (file: File) => void | Promise<void>;
    onRemove?: () => void | Promise<void>;
    /** Mostra o giro e bloqueia novas escolhas enquanto o upload acontece. */
    uploading?: boolean;
    /** Em modo leitura a área vira só a prévia — sem arraste, sem remover. */
    disabled?: boolean;
    /** Texto abaixo do ícone quando não há imagem. */
    hint?: string;
    className?: string;
}

/**
 * Área de arrastar-e-soltar para UMA imagem, com prévia.
 *
 * O `<input type="file">` fica escondido e é acionado pelo clique na área: um
 * input visível ao lado da área de arraste duplica o mesmo comando em dois
 * lugares da tela.
 *
 * `disabled` vem também do `<fieldset disabled>` do formulário — mas o arraste
 * NÃO é bloqueado por fieldset (não é evento de controle de formulário), então
 * a checagem de `disabled` precisa estar nos handlers, não só no input.
 */
const ImageDropzone: React.FC<ImageDropzoneProps> = ({
    value, onSelect, onRemove, uploading = false, disabled = false,
    hint = 'Arraste uma imagem aqui ou clique para selecionar', className = '',
}) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = React.useState(false);
    const bloqueado = disabled || uploading;

    const escolher = (file?: File | null) => {
        if (!file || bloqueado) return;
        void onSelect(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (bloqueado) return;
        escolher(e.dataTransfer.files?.[0]);
    };

    return (
        <div className={className}>
            <div
                onDragOver={(e) => { e.preventDefault(); if (!bloqueado) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !bloqueado && inputRef.current?.click()}
                role="button"
                tabIndex={bloqueado ? -1 : 0}
                onKeyDown={(e) => { if (!bloqueado && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
                className={`relative group h-36 rounded-[10px] border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors outline-none
                    ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'}
                    ${bloqueado ? 'cursor-default' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 focus-visible:border-blue-500'}`}
            >
                {uploading ? (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-xs font-medium">Enviando imagem...</span>
                    </div>
                ) : value ? (
                    <>
                        <img src={value} alt="Prévia da imagem" className="max-h-full max-w-full object-contain" />
                        {!disabled && (
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                                    className="h-9 px-3 bg-white text-gray-700 rounded-[6px] text-sm font-medium flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
                                >
                                    <UploadCloud className="w-4 h-4" />
                                    Trocar
                                </button>
                                {onRemove && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); void onRemove(); }}
                                        className="h-9 w-9 bg-white text-rose-600 rounded-[6px] flex items-center justify-center hover:bg-rose-50 transition-colors"
                                        title="Remover imagem"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400 px-4 text-center">
                        <ImagePlus className="w-7 h-7 text-gray-300" />
                        <span className="text-xs font-medium">{disabled ? 'Nenhuma imagem' : hint}</span>
                        {!disabled && <span className="text-[11px] text-gray-400">JPG, PNG ou WEBP · até 5 MB</span>}
                    </div>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={IMAGE_ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ''; }}
            />
        </div>
    );
};

export default ImageDropzone;
