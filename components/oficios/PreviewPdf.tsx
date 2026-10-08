import React from 'react';
import { Loader2, AlertCircle, FileText } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';

/**
 * Prévia do PDF num painel lateral (REGRA #4: painel, nunca tela cheia). O
 * Blob vira `blob:` URL só enquanto o painel está aberto e é revogada ao fechar
 * — PDF de 1 MB em memória por prévia não pode ficar vazando.
 *
 * O iframe mostra o visualizador nativo do navegador: texto selecionável,
 * zoom, páginas — é exatamente o arquivo que seria arquivado no GED.
 */
interface Props {
    open: boolean;
    onClose: () => void;
    titulo: string;
    blob: Blob | null;
    carregando: boolean;
    erro: string | null;
}

export default function PreviewPdf({ open, onClose, titulo, blob, carregando, erro }: Props) {
    const [url, setUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open || !blob) { setUrl(null); return; }
        const u = URL.createObjectURL(blob);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [open, blob]);

    return (
        <Sheet open={open} onClose={onClose} size="2xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Prévia do documento</SheetTitle>
                <SheetDescription>{titulo}</SheetDescription>
            </SheetHeader>
            {/* SheetPanel não tem padding próprio (memória project_sheetpanel_sem_padding_proprio) —
                aqui é de propósito: o PDF ocupa o painel inteiro. */}
            <SheetPanel className="flex flex-col min-h-0">
                {carregando && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-gray-500">
                        <Loader2 className="w-6 h-6 animate-spin mb-2" />
                        <p className="text-sm">Gerando o PDF…</p>
                    </div>
                )}
                {!carregando && erro && (
                    <div className="m-6 flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                {!carregando && !erro && url && (
                    <iframe title={`Prévia — ${titulo}`} src={url} className="flex-1 w-full min-h-[75vh] border-0 bg-gray-100" />
                )}
                {!carregando && !erro && !url && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mb-4" />
                        <p className="text-sm text-gray-500">Nenhuma prévia gerada.</p>
                    </div>
                )}
            </SheetPanel>
        </Sheet>
    );
}
