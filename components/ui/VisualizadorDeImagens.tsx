import React from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { Modal } from './modal';

/**
 * Imagem ampliada, uma de cada vez, num diálogo central grande (24/11/2026, pedido: "dar zoom (expandir) as Imagens
 * do empreendimento quando clicado nelas" — Oportunidade do gestor e Portal do Investidor). Mesmo molde do
 * `espelho3d/DecoradoDaUnidade`: setas na tela e no teclado (← →), Esc fecha, "2 de 5" e miniaturas. A imagem cabe
 * inteira (object-contain) — planta é desenho técnico, cortar a borda esconde cota. "Abrir em tamanho real" leva ao
 * arquivo original numa aba nova, para quem precisa ler o detalhe da planta.
 */
export interface ImagemDoVisualizador {
    url: string;
    legenda?: string | null;
}

export const VisualizadorDeImagens: React.FC<{
    imagens: ImagemDoVisualizador[];
    /** Índice da imagem clicada. */
    inicial: number;
    onFechar: () => void;
}> = ({ imagens, inicial, onFechar }) => {
    const total = imagens.length;
    const [atual, setAtual] = React.useState(() => Math.min(Math.max(inicial, 0), Math.max(total - 1, 0)));
    const ir = React.useCallback((passo: number) => setAtual((i) => (i + passo + total) % total), [total]);

    React.useEffect(() => {
        if (total < 2) return;
        const tecla = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') ir(-1);
            if (e.key === 'ArrowRight') ir(1);
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [ir, total]);

    const imagem = imagens[atual];
    if (!imagem) return null;
    const titulo = imagem.legenda || `Imagem ${atual + 1}`;
    const seta = 'absolute top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/90 border border-gray-200 text-gray-700 shadow-sm hover:text-gray-900 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40';

    return (
        <Modal open onClose={onFechar} size="2xl" className="!max-w-[min(1200px,95vw)] !rounded-[10px]">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
                <p className="min-w-0 text-sm font-semibold text-gray-900 truncate">
                    {titulo}
                    {total > 1 && <span className="font-normal text-gray-500 tabular-nums" data-testid="visualizador-posicao"> · {atual + 1} de {total}</span>}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                    <a
                        href={imagem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir em tamanho real (aba nova)"
                        className="h-8 px-2 inline-flex items-center gap-1.5 rounded-[6px] text-[13px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                        <ExternalLink className="w-4 h-4" /> Tamanho real
                    </a>
                    <button
                        type="button"
                        onClick={onFechar}
                        aria-label="Fechar a imagem"
                        title="Fechar (Esc)"
                        className="w-8 h-8 inline-flex items-center justify-center rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="p-4 overflow-auto bg-white">
                <figure className="relative">
                    <div className="relative w-full h-[72vh] min-h-[260px] rounded-[6px] bg-gray-50 overflow-hidden">
                        <img src={imagem.url} alt={titulo} className="absolute inset-0 w-full h-full object-contain" data-testid="visualizador-imagem" />
                    </div>
                    {total > 1 && (
                        <>
                            <button type="button" onClick={() => ir(-1)} aria-label="Imagem anterior" title="Imagem anterior (←)" className={`${seta} left-2`}>
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button type="button" onClick={() => ir(1)} aria-label="Próxima imagem" title="Próxima imagem (→)" className={`${seta} right-2`}>
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </>
                    )}
                </figure>
                {total > 1 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 justify-center" role="tablist" aria-label="Imagens">
                        {imagens.map((im, i) => (
                            <button
                                key={`${im.url}-${i}`}
                                type="button"
                                role="tab"
                                aria-selected={i === atual}
                                aria-label={im.legenda || `Imagem ${i + 1}`}
                                title={im.legenda || `Imagem ${i + 1}`}
                                onClick={() => setAtual(i)}
                                className={`shrink-0 w-16 h-11 rounded-[6px] overflow-hidden border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${i === atual ? 'border-blue-600 ring-1 ring-blue-600' : 'border-gray-200 opacity-80 hover:opacity-100'}`}
                            >
                                <img src={im.url} alt="" className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default VisualizadorDeImagens;
