import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Modal } from '../ui/modal';
import { rotuloDoSelo, type DecoradoDaFicha } from '../../utils/espelhoDecoradoDaTipologia';

/**
 * "VER DECORADO" (Espelho de Vendas 3D, F8 — 10/11/2026). Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * O corte 3D mobiliado e os ambientes decorados da tipologia, um de cada vez, num diálogo central — nunca tela cheia.
 * Setas na tela e no teclado (← →), miniaturas e "2 de 5". O SELO de imagem ilustrativa vai sempre por cima da
 * imagem, sem opção de desligar: decorado é material de venda, não memorial descritivo (CDC, arts. 30 e 37).
 */
export const DecoradoDaUnidade: React.FC<{
    decorado: DecoradoDaFicha;
    /** "Unidade 304 · Torre A", embaixo do título. */
    subtitulo: string;
    onFechar: () => void;
}> = ({ decorado, subtitulo, onFechar }) => {
    const total = decorado.imagens.length;
    const [atual, setAtual] = React.useState(0);
    const imagem = decorado.imagens[Math.min(atual, total - 1)];
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

    if (!imagem) return null;
    const seta = 'absolute top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-full bg-white/90 border border-gray-200 text-gray-700 shadow-sm hover:text-gray-900 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40';

    return (
        <Modal open onClose={onFechar} size="2xl" className="!rounded-[10px]">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">Decorado · {imagem.titulo}</p>
                    <p className="text-[13px] text-gray-500 truncate">{subtitulo}</p>
                </div>
                <button
                    type="button"
                    onClick={onFechar}
                    aria-label="Fechar o decorado"
                    title="Fechar o decorado"
                    className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="p-4 overflow-auto bg-white">
                <figure className="relative">
                    {/* Caixa de altura fixa: a imagem cabe nela inteira (object-contain), seja qual for o tamanho do
                        arquivo — sem caixa, imagem sem tamanho próprio (SVG) sumia com altura zero (visto no harness). */}
                    <div className="relative w-full h-[55vh] min-h-[240px] rounded-[6px] bg-gray-50 overflow-hidden">
                        <img src={imagem.url} alt={imagem.titulo} className="absolute inset-0 w-full h-full object-contain" data-testid="decorado-imagem" />
                        {/* O selo é parte da imagem na tela: fundo escuro translúcido, legível sobre qualquer foto. */}
                        <span
                            className="absolute left-2 bottom-2 rounded-[4px] bg-gray-900/75 px-2 py-1 text-[11px] font-medium text-white"
                            data-testid="decorado-selo"
                        >
                            {rotuloDoSelo(imagem.origem)}
                        </span>
                    </div>
                    {total > 1 && (
                        <>
                            <button type="button" onClick={() => ir(-1)} aria-label="Imagem anterior" title="Imagem anterior (←)" className={`${seta} left-1`}>
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button type="button" onClick={() => ir(1)} aria-label="Próxima imagem" title="Próxima imagem (→)" className={`${seta} right-1`}>
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </>
                    )}
                    <figcaption className="mt-3 text-center text-[13px] text-gray-700">
                        {imagem.titulo}
                        {total > 1 && <span className="text-gray-500 tabular-nums" data-testid="decorado-posicao"> · {atual + 1} de {total}</span>}
                    </figcaption>
                </figure>
                {total > 1 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 justify-center" role="tablist" aria-label="Imagens do decorado">
                        {decorado.imagens.map((im, i) => (
                            <button
                                key={`${im.url}-${i}`}
                                type="button"
                                role="tab"
                                aria-selected={i === atual}
                                aria-label={im.titulo}
                                title={im.titulo}
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

export default DecoradoDaUnidade;
