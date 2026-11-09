import React from 'react';

/**
 * Cartão com cara de recibo de papel — guia §34.
 *
 * Primitiva sem domínio: quem usa decide título, linhas e ações. Nasceu em
 * Pedido de compra › Recebimento › Documentos (09/11/2026, pedido do usuário:
 * "lista de recibo em formato de cards imitando um recibo real"), como
 * ALTERNATIVA à tabela — nunca no lugar dela.
 *
 * Anatomia: papel creme com sombra que acompanha o recorte (drop-shadow no
 * invólucro, não box-shadow), picote tracejado com meia-lua nas laterais,
 * linhas "rótulo ··· valor" como em cupom, código de barras decorativo e borda
 * inferior serrilhada. As cores do recorte vêm por `style` (o JIT do Tailwind
 * não enxerga classe montada em runtime).
 */

const PAPEL = '#FFFDF7';

export interface LinhaRecibo {
    rotulo: string;
    valor: React.ReactNode;
    /** Texto inteiro no hover quando o valor é cortado. */
    titulo?: string;
    /** Número, valor, data: alinha os dígitos. */
    numerico?: boolean;
}

interface CartaoReciboProps {
    titulo: string;
    icone?: React.ReactNode;
    numero?: string;
    numeroTitulo?: string;
    subtitulo?: string;
    linhas: LinhaRecibo[];
    observacao?: string | null;
    /** Larguras (1–3) das barras decorativas; sem ele, sem código. */
    barras?: number[];
    rodape?: React.ReactNode;
    /** Cor do que está ATRÁS do cartão — pinta a meia-lua do picote. */
    fundo?: string;
    className?: string;
}

const Picote: React.FC<{ fundo: string }> = ({ fundo }) => (
    <div aria-hidden className="relative -mx-5 my-4 h-0">
        <span className="absolute -left-2 -top-2 w-4 h-4 rounded-full" style={{ background: fundo }} />
        <span className="absolute left-4 right-4 top-0 border-t border-dashed border-gray-300" />
        <span className="absolute -right-2 -top-2 w-4 h-4 rounded-full" style={{ background: fundo }} />
    </div>
);

export const CartaoRecibo: React.FC<CartaoReciboProps> = ({
    titulo, icone, numero, numeroTitulo, subtitulo, linhas, observacao, barras, rodape, fundo = '#F9FAFB', className = '',
}) => (
    <article
        aria-label={`${titulo}${numero ? ` nº ${numero}` : ''}`}
        className={`relative ${className}`}
        style={{ filter: 'drop-shadow(0 1px 1px rgba(15,23,42,0.08)) drop-shadow(0 6px 10px rgba(15,23,42,0.06))' }}
    >
        <div className="rounded-t-[6px] px-5 pt-5 pb-3" style={{ background: PAPEL }}>
            <header className="text-center space-y-1">
                {icone && <div className="flex justify-center text-gray-500">{icone}</div>}
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-[0.25em]">{titulo}</h4>
                {numero && (
                    <p className="text-xs text-gray-500 font-mono tabular-nums" title={numeroTitulo}>Nº {numero}</p>
                )}
                {subtitulo && <p className="text-xs text-gray-500 font-mono tabular-nums">{subtitulo}</p>}
            </header>

            <Picote fundo={fundo} />

            <dl className="space-y-2">
                {linhas.map(l => (
                    <div key={l.rotulo} className="flex items-baseline gap-2 min-w-0">
                        <dt className="text-xs text-gray-500 shrink-0">{l.rotulo}</dt>
                        <span aria-hidden className="flex-1 min-w-4 border-b border-dotted border-gray-300 translate-y-[-3px]" />
                        <dd
                            className={`text-sm text-gray-900 text-right truncate max-w-[65%] ${l.numerico ? 'font-mono tabular-nums' : ''}`}
                            title={l.titulo}
                        >
                            {l.valor}
                        </dd>
                    </div>
                ))}
            </dl>

            {observacao && (
                <p className="mt-3 text-sm text-gray-700 italic break-words">“{observacao}”</p>
            )}

            {(barras?.length || rodape) && <Picote fundo={fundo} />}

            {!!barras?.length && (
                <div aria-hidden className="flex justify-center items-stretch h-8 gap-[2px] mb-3">
                    {barras.map((b, i) => (
                        <span key={i} className={i % 2 === 0 ? 'bg-gray-800' : 'bg-transparent'} style={{ width: b }} />
                    ))}
                </div>
            )}

            {rodape && <div className="flex items-center justify-between gap-2">{rodape}</div>}
        </div>

        {/* Serrilha: dois triângulos por ladrilho de 12px, dentes para baixo. */}
        <div
            aria-hidden
            className="h-1.5"
            style={{
                background: `linear-gradient(135deg, ${PAPEL} 25%, transparent 25%), linear-gradient(225deg, ${PAPEL} 25%, transparent 25%)`,
                backgroundSize: '12px 12px',
                backgroundRepeat: 'repeat-x',
            }}
        />
    </article>
);

export default CartaoRecibo;
