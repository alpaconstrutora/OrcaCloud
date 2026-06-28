import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface MobilePreviewFrameProps {
    /** Conteúdo a ser renderizado dentro do "celular". Recebe o viewport estreito do iframe. */
    children: React.ReactNode;
    onClose: () => void;
    title?: string;
}

/**
 * Renderiza children dentro de um <iframe> estreito que simula um celular.
 * Como o iframe possui seu próprio viewport, as media queries do Tailwind
 * (`md:` etc.) resolvem para o layout mobile real — diferente de apenas
 * encolher um container, que mantém o viewport do desktop.
 *
 * Os estilos do documento pai (Tailwind injetado pelo Vite, fontes, etc.)
 * são clonados para o <head> do iframe no carregamento.
 */
const MobilePreviewFrame: React.FC<MobilePreviewFrameProps> = ({ children, onClose, title = 'Prévia Mobile' }) => {
    const [mountNode, setMountNode] = React.useState<HTMLElement | null>(null);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);

    const setupIframe = React.useCallback(() => {
        const iframe = iframeRef.current;
        const doc = iframe?.contentDocument;
        if (!doc) return;

        // Estrutura básica
        doc.documentElement.lang = 'pt-BR';
        const body = doc.body;
        body.style.margin = '0';
        body.style.background = '#f8fafc';

        // Clona <style> e <link rel="stylesheet"> do documento pai
        const headNodes = document.querySelectorAll('style, link[rel="stylesheet"]');
        headNodes.forEach(node => {
            doc.head.appendChild(node.cloneNode(true));
        });

        // Meta viewport para escala correta dentro do iframe
        const meta = doc.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1';
        doc.head.appendChild(meta);

        setMountNode(body);
    }, []);

    React.useEffect(() => {
        // Se o iframe já carregou antes do onLoad disparar
        if (iframeRef.current?.contentDocument?.readyState === 'complete') {
            setupIframe();
        }
    }, [setupIframe]);

    return createPortal(
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex flex-col items-center gap-4">
                {/* Moldura do celular */}
                <div className="relative bg-gray-900 rounded-[3rem] p-3 shadow-2xl" style={{ width: 390, maxWidth: '92vw' }}>
                    {/* Notch */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-b-2xl z-10" />
                    <div className="bg-white rounded-[2.4rem] overflow-hidden" style={{ height: 'min(780px, 80vh)' }}>
                        <iframe
                            ref={iframeRef}
                            onLoad={setupIframe}
                            title={title}
                            className="w-full h-full border-0"
                        />
                        {mountNode && createPortal(children, mountNode)}
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-2xl text-button font-black uppercase tracking-widest shadow-lg hover:bg-gray-50 transition-all active:scale-95"
                >
                    <X className="w-4 h-4" />
                    Fechar Prévia
                </button>
            </div>
        </div>,
        document.body
    );
};

export default MobilePreviewFrame;
