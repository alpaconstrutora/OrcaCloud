import React from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';

/**
 * Casca dos cartões da tela "Bom dia" (Central de Controle, 11/11/2026).
 * Container do guia (§16/§28.2): branco, `rounded-[10px]`, borda `gray-100`,
 * `shadow-sm`; título §21 + subtítulo que diz a BASE do número.
 *
 * Cada cartão cuida do próprio estado: esqueleto enquanto a fonte carrega e,
 * se ela falhar, "Não carregou" com "Tentar de novo" SÓ nele — os outros
 * cartões seguem (o banner único de erro da Central antiga sumiu).
 *
 * `tom="azul"`: o único cartão em cor cheia da tela (% conciliado). Texto
 * secundário em azul-claro, nunca cinza sobre o azul.
 */
export type EstadoDoCartao = 'carregando' | 'erro' | 'ok';

interface Props {
    titulo: string;
    subtitulo?: string;
    estado: EstadoDoCartao;
    onTentarDeNovo?: () => void;
    /** Link no canto do cabeçalho ("Abrir Contas a Pagar"). */
    acao?: { rotulo: string; onClick: () => void };
    tom?: 'padrao' | 'azul';
    className?: string;
    children: React.ReactNode;
}

export function CartaoCentral({ titulo, subtitulo, estado, onTentarDeNovo, acao, tom = 'padrao', className = '', children }: Props) {
    const azul = tom === 'azul';
    return (
        <section
            aria-busy={estado === 'carregando'}
            className={`rounded-[10px] shadow-sm p-5 flex flex-col min-w-0 ${azul ? 'bg-blue-600 border border-blue-600 text-white' : 'bg-white border border-gray-100'} ${className}`}
        >
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className={`text-sm font-semibold ${azul ? 'text-white' : 'text-gray-700'}`}>{titulo}</h2>
                    {subtitulo && <p className={`text-xs mt-0.5 ${azul ? 'text-blue-100' : 'text-gray-500'}`}>{subtitulo}</p>}
                </div>
                {acao && estado === 'ok' && (
                    <button
                        type="button"
                        onClick={acao.onClick}
                        className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium rounded-[6px] px-1.5 py-1 -mr-1.5 -mt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 ${azul ? 'text-blue-50 hover:text-white hover:bg-blue-500 focus-visible:ring-white/70' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 focus-visible:ring-blue-500/40'}`}
                    >
                        {acao.rotulo} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                )}
            </header>

            <div className="mt-4 flex-1 flex flex-col min-h-0">
                {estado === 'carregando' && <Esqueleto azul={azul} />}
                {estado === 'erro' && (
                    <div className={`flex-1 flex flex-col items-start justify-center gap-2 text-sm ${azul ? 'text-blue-50' : 'text-gray-600'}`}>
                        <p>Não carregou.</p>
                        {onTentarDeNovo && (
                            <button
                                type="button"
                                onClick={onTentarDeNovo}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-[6px] h-8 px-3 border transition-colors focus-visible:outline-none focus-visible:ring-2 ${azul ? 'border-blue-300 text-white hover:bg-blue-500 focus-visible:ring-white/70' : 'border-gray-200 text-gray-700 hover:bg-gray-50 focus-visible:ring-blue-500/40'}`}
                            >
                                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Tentar de novo
                            </button>
                        )}
                    </div>
                )}
                {/* O dado chega esmaecendo sobre o lugar do esqueleto; atualizar não
                    repete (o estado não volta a "carregando"). */}
                {estado === 'ok' && <div className="flex-1 flex flex-col min-h-0 central-aparece">{children}</div>}
            </div>
        </section>
    );
}

function Esqueleto({ azul }: { azul: boolean }) {
    const barra = azul ? 'bg-blue-500' : 'bg-gray-100';
    return (
        <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
            <div className={`h-8 w-24 rounded-[6px] ${barra}`} />
            <div className={`h-3 w-full rounded-[4px] ${barra}`} />
            <div className={`h-3 w-2/3 rounded-[4px] ${barra}`} />
        </div>
    );
}

export default CartaoCentral;
