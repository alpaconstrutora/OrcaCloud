import React from 'react';

/**
 * Cartão de documento com cara de papel — guia §34.
 *
 * Primitiva sem domínio: quem usa decide título, linhas e ações. Nasceu em
 * Pedido de compra › Recebimento › Documentos (09/11/2026, pedido do usuário:
 * "lista de recibo em formato de cards imitando um recibo real"), como
 * ALTERNATIVA à tabela — nunca no lugar dela.
 *
 * Desenho (14/11/2026, pedido do usuário: substituir o desenho de recibo pela
 * ilustração de nota fiscal que ele enviou): folhas empilhadas atrás, folha
 * principal com título laranja sublinhado em salmão, os dados numa tabela de
 * células cinza e, no canto, um cupom preso por clipe com Nº, data e código de
 * barras. As cores vêm por `style` (o JIT do Tailwind não enxerga classe
 * montada em runtime) e estão todas em `COR`.
 */

const COR = {
    folhaFundo1: '#D4D4D4',
    folhaFundo2: '#E4E4E4',
    folha: '#FAFAFA',
    titulo: '#D2690A',
    sublinhado: '#F6C3AA',
    marca: '#DADADA',
    celulaRotulo: '#EFEFEF',
    celulaValor: '#DEDEDE',
    grade: '#A3A3A3',
    tinta: '#2D3A4E',
    clipe1: '#C8401B',
    clipe2: '#2D3A4E',
} as const;

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
    numero?: string;
    numeroTitulo?: string;
    subtitulo?: string;
    linhas: LinhaRecibo[];
    observacao?: string | null;
    /** Larguras (1–3) das barras decorativas do cupom; sem ele, sem código. */
    barras?: number[];
    rodape?: React.ReactNode;
    className?: string;
}

/** Clipe de papel (decorativo): dois laços, vermelho na frente e azul atrás. */
const Clipe: React.FC = () => (
    <svg aria-hidden viewBox="0 0 24 56" className="absolute -top-6 left-1/2 -translate-x-1/2 w-4 h-10">
        <path d="M14 50V10a5 5 0 0 1 10 0v34" fill="none" stroke={COR.clipe2} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M8 40V8a6 6 0 0 1 12 0v40a8 8 0 0 1-16 0V16" fill="none" stroke={COR.clipe1} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
);

/** Cupom térmico preso no canto: Nº, data e código de barras. */
const Cupom: React.FC<Pick<CartaoReciboProps, 'numero' | 'numeroTitulo' | 'subtitulo' | 'barras'>> = ({
    numero, numeroTitulo, subtitulo, barras,
}) => (
    <div className="absolute -top-2 right-4 w-[44%] max-w-[190px] rotate-[3deg] z-10">
        <div
            className="relative bg-white pl-3 pr-4 pt-4 pb-3 space-y-1.5"
            style={{ boxShadow: `inset -6px 0 0 ${COR.tinta}, 0 2px 6px rgba(15,23,42,0.12)` }}
        >
            <Clipe />
            <span aria-hidden className="block h-px" style={{ background: COR.tinta }} />
            {numero && (
                <p className="text-xs font-mono font-semibold tabular-nums truncate" style={{ color: COR.tinta }} title={numeroTitulo}>
                    Nº {numero}
                </p>
            )}
            {subtitulo && (
                <p className="text-xs font-mono tabular-nums truncate" style={{ color: COR.tinta }}>{subtitulo}</p>
            )}
            <span aria-hidden className="block h-px" style={{ background: COR.tinta }} />
            {!!barras?.length && (
                <div aria-hidden className="flex items-stretch h-6 gap-px overflow-hidden">
                    {barras.map((b, i) => (
                        <span key={i} className="shrink-0" style={{ width: b, background: i % 2 === 0 ? COR.tinta : 'transparent' }} />
                    ))}
                </div>
            )}
        </div>
        {/* Serrilha do cupom: dentes escuros, como na ilustração. */}
        <div
            aria-hidden
            className="h-2"
            style={{
                background: `linear-gradient(135deg, ${COR.tinta} 25%, transparent 25%), linear-gradient(225deg, ${COR.tinta} 25%, transparent 25%)`,
                backgroundSize: '10px 10px',
                backgroundRepeat: 'repeat-x',
            }}
        />
    </div>
);

export const CartaoRecibo: React.FC<CartaoReciboProps> = ({
    titulo, numero, numeroTitulo, subtitulo, linhas, observacao, barras, rodape, className = '',
}) => (
    <article aria-label={`${titulo}${numero ? ` nº ${numero}` : ''}`} className={`relative pt-4 h-full flex flex-col ${className}`}>
        {/* Folhas de baixo do maço. */}
        <div aria-hidden className="absolute inset-x-0 top-4 bottom-0 rounded-[2px] -rotate-[3deg] -translate-x-1.5" style={{ background: COR.folhaFundo1 }} />
        <div aria-hidden className="absolute inset-x-0 top-4 bottom-0 rounded-[2px] rotate-[2deg] translate-x-1" style={{ background: COR.folhaFundo2 }} />

        <div
            className="relative flex-1 flex flex-col rounded-[2px] px-5 pt-6 pb-4"
            style={{ background: COR.folha, boxShadow: '0 1px 2px rgba(15,23,42,0.10), 0 6px 12px rgba(15,23,42,0.06)' }}
        >
            <Cupom numero={numero} numeroTitulo={numeroTitulo} subtitulo={subtitulo} barras={barras} />

            {/* Cabeçalho: título laranja com sublinhado salmão e as "linhas" cinza do papel. */}
            <header className="pr-[50%] min-h-[96px]">
                <h4 className="text-xl font-extrabold uppercase leading-tight break-words" style={{ color: COR.titulo }}>{titulo}</h4>
                <span aria-hidden className="block h-1.5 w-4/5 mt-1 rounded-full" style={{ background: COR.sublinhado }} />
                <span aria-hidden className="block h-2 w-full mt-4" style={{ background: COR.marca }} />
                <span aria-hidden className="block h-2 w-3/4 mt-1.5" style={{ background: COR.marca }} />
            </header>

            <dl className="mt-4 border text-sm" style={{ borderColor: COR.grade }}>
                {linhas.map((l, i) => (
                    <div key={l.rotulo} className="grid grid-cols-[38%_1fr] min-w-0" style={i > 0 ? { borderTop: `1px solid ${COR.grade}` } : undefined}>
                        <dt className="px-2.5 py-1.5 text-xs text-gray-600 truncate" style={{ background: COR.celulaRotulo, borderRight: `1px solid ${COR.grade}` }}>
                            {l.rotulo}
                        </dt>
                        <dd
                            className={`px-2.5 py-1.5 font-medium text-right truncate ${l.numerico ? 'font-mono tabular-nums' : ''}`}
                            style={{ background: COR.celulaValor, color: COR.tinta }}
                            title={l.titulo}
                        >
                            {l.valor}
                        </dd>
                    </div>
                ))}
            </dl>

            {observacao && (
                <p className="mt-3 pl-2.5 text-sm text-gray-700 italic break-words" style={{ borderLeft: `4px solid ${COR.sublinhado}` }}>
                    “{observacao}”
                </p>
            )}

            {/* Rodapé do papel: as linhas salmão da ilustração. */}
            <div aria-hidden className="mt-4 space-y-1.5">
                <span className="block h-1.5 w-3/4 rounded-full" style={{ background: COR.sublinhado }} />
                <span className="block h-1.5 w-1/2 rounded-full" style={{ background: COR.sublinhado }} />
            </div>

            {rodape && <div className="mt-auto pt-4 flex items-center justify-between gap-2">{rodape}</div>}
        </div>
    </article>
);

export default CartaoRecibo;
