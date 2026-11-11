import React from 'react';
import { CartaoCentral, type EstadoDoCartao } from './CartaoCentral';
import { NumeroQueSobe } from './NumeroQueSobe';
import { Realce } from './Realce';
import type { MeuDia } from '../../services/centralControleService';

/**
 * Contas a pagar · 7 dias — medidor semicircular (guia §28.7). Três faixas na
 * ordem da urgência: atrasadas (vermelho), vencem em até 2 dias (âmbar), vencem
 * de 3 a 7 dias (verde). O total de títulos fica no centro; quantidade e valor
 * de cada faixa vão na legenda em texto (nunca só a cor, §28.3).
 */
interface Props {
    estado: EstadoDoCartao;
    onTentarDeNovo: () => void;
    dados: MeuDia['contas_7_dias'] | null;
    animar: boolean;
    /** Rodada de "Atualizar" (Realce marca o número que mudou). */
    rodada: number;
    onNavigate: (view: string) => void;
}

const FAIXAS = [
    { chave: 'atrasadas', rotulo: 'Atrasadas', cor: '#ef4444', ponto: 'bg-red-500' },
    { chave: 'vencem_em_2_dias', rotulo: 'Vencem em até 2 dias', cor: '#f59e0b', ponto: 'bg-amber-500' },
    { chave: 'vencem_em_7_dias', rotulo: 'Vencem de 3 a 7 dias', cor: '#10b981', ponto: 'bg-emerald-500' },
] as const;

const R = 80;
const CX = 100;
const CY = 96;
const ESPESSURA = 16;

/** Arco do semicírculo entre as frações f0 e f1 (0 = esquerda, 1 = direita). */
function arco(f0: number, f1: number): string {
    const ponto = (f: number) => {
        const a = Math.PI * (1 - f);
        return `${(CX + R * Math.cos(a)).toFixed(2)} ${(CY - R * Math.sin(a)).toFixed(2)}`;
    };
    return `M ${ponto(f0)} A ${R} ${R} 0 0 1 ${ponto(f1)}`;
}

function fBRL(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function CartaoContasSemana({ estado, onTentarDeNovo, dados, animar, rodada, onNavigate }: Props) {
    const total = dados ? FAIXAS.reduce((s, f) => s + dados[f.chave].qtd, 0) : 0;
    const atrasadas = dados?.atrasadas.qtd ?? 0;
    const idMascara = `central-varre-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

    // Fatias com um respiro de 1,5% entre si; faixa vazia não ocupa espaço.
    const fatias: { cor: string; d: string }[] = [];
    if (dados && total > 0) {
        const presentes = FAIXAS.filter(f => dados[f.chave].qtd > 0);
        const respiro = presentes.length > 1 ? 0.015 : 0;
        let inicio = 0;
        presentes.forEach((f, i) => {
            const fim = inicio + dados[f.chave].qtd / total;
            fatias.push({ cor: f.cor, d: arco(inicio + (i > 0 ? respiro / 2 : 0), fim - (i < presentes.length - 1 ? respiro / 2 : 0)) });
            inicio = fim;
        });
    }

    return (
        <CartaoCentral
            titulo="Contas a pagar"
            subtitulo="Títulos em aberto: atrasados e os que vencem nos próximos 7 dias."
            estado={estado}
            onTentarDeNovo={onTentarDeNovo}
            acao={{ rotulo: atrasadas > 0 ? `Revisar ${atrasadas.toLocaleString('pt-BR')} atrasadas` : 'Abrir', onClick: () => onNavigate('contas-a-pagar') }}
        >
            {dados && (
                <>
                    <div className="relative mx-auto w-full max-w-[220px]">
                        <svg viewBox="0 0 200 104" className="w-full" role="img"
                            aria-label={`${total} títulos: ${FAIXAS.map(f => `${dados[f.chave].qtd} ${f.rotulo.toLowerCase()}`).join(', ')}`}>
                            <path d={arco(0, 1)} fill="none" stroke="#f1f5f9" strokeWidth={ESPESSURA} className="central-trilho" />
                            {/* Na primeira carga as faixas são reveladas por UMA máscara que
                                varre o arco da esquerda para a direita, junto com o número
                                do centro: atrasadas → 2 dias → 7 dias, a ordem da urgência. */}
                            {animar && (
                                <mask id={idMascara} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="104">
                                    <path d={arco(0, 1)} fill="none" stroke="white" strokeWidth={ESPESSURA + 2} pathLength={1} className="central-varre" />
                                </mask>
                            )}
                            <g mask={animar ? `url(#${idMascara})` : undefined}>
                                {fatias.map((f, i) => <path key={i} d={f.d} fill="none" stroke={f.cor} strokeWidth={ESPESSURA} />)}
                            </g>
                        </svg>
                        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                            <Realce valor={total} rodada={rodada}>
                                <NumeroQueSobe valor={total} animar={animar} className="text-[28px] leading-none font-semibold text-gray-900" />
                            </Realce>
                            <span className="text-xs text-gray-500 mt-1">{total === 1 ? 'título' : 'títulos'}</span>
                        </div>
                    </div>
                    <ul className="mt-4 space-y-2">
                        {FAIXAS.map(f => (
                            <li key={f.chave} className="flex items-center gap-2 text-sm">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${f.ponto}`} aria-hidden="true" />
                                <span className="flex-1 min-w-0 text-gray-700 truncate">{f.rotulo}</span>
                                <Realce valor={dados[f.chave].qtd} rodada={rodada}>
                                    <span className="tabular-nums text-gray-900 font-medium">{dados[f.chave].qtd.toLocaleString('pt-BR')}</span>
                                </Realce>
                                <span className="tabular-nums text-gray-500 w-[92px] text-right">{fBRL(dados[f.chave].valor)}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </CartaoCentral>
    );
}

export default CartaoContasSemana;
