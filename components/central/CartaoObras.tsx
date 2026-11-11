import React from 'react';
import { CartaoCentral, type EstadoDoCartao } from './CartaoCentral';
import { NumeroQueSobe } from './NumeroQueSobe';
import { Realce } from './Realce';
import type { ProjectScorecard } from '../../services/financialIntelligenceService';

/**
 * Obras — quantas há e como estão pelo risco do scorecard financeiro
 * (`fn_project_scorecard.risco`): OK, Atenção (MEDIUM), Em risco (HIGH).
 * Uma barra por situação, com a quantidade em texto ao lado.
 */
interface Props {
    estado: EstadoDoCartao;
    onTentarDeNovo: () => void;
    scorecards: ProjectScorecard[];
    animar: boolean;
    /** Rodada de "Atualizar" (Realce marca o número que mudou). */
    rodada: number;
    onNavigate: (view: string) => void;
}

const SITUACOES = [
    { risco: 'OK', rotulo: 'OK', barra: 'bg-emerald-500' },
    { risco: 'MEDIUM', rotulo: 'Atenção', barra: 'bg-amber-500' },
    { risco: 'HIGH', rotulo: 'Em risco', barra: 'bg-red-500' },
] as const;

export function CartaoObras({ estado, onTentarDeNovo, scorecards, animar, rodada, onNavigate }: Props) {
    const total = scorecards.length;
    const porRisco = (r: ProjectScorecard['risco']) => scorecards.filter(s => s.risco === r).length;
    const maior = Math.max(1, ...SITUACOES.map(s => porRisco(s.risco)));

    return (
        <CartaoCentral
            titulo="Obras"
            subtitulo="Pelo resultado financeiro: receita, custo e contas vencidas de cada obra."
            estado={estado}
            onTentarDeNovo={onTentarDeNovo}
            acao={{ rotulo: 'BI Executivo', onClick: () => onNavigate('bi-executivo') }}
        >
            {total === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma obra com movimento financeiro.</p>
            ) : (
                <>
                    <p className="flex items-baseline gap-2">
                        <Realce valor={total} rodada={rodada}>
                            <NumeroQueSobe valor={total} animar={animar} className="text-[28px] leading-none font-semibold text-gray-900" />
                        </Realce>
                        <span className="text-sm text-gray-500">{total === 1 ? 'obra' : 'obras'}</span>
                    </p>
                    <ul className="mt-4 space-y-3">
                        {SITUACOES.map(s => {
                            const n = porRisco(s.risco);
                            return (
                                <li key={s.risco} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 text-sm">
                                    <span className="text-gray-700">{s.rotulo}</span>
                                    <span className="h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                                        <span className={`block h-full rounded-full ${s.barra} ${animar ? 'central-cresce' : ''}`} style={{ width: `${(n / maior) * 100}%` }} />
                                    </span>
                                    <span className="tabular-nums font-medium text-gray-900 w-8 text-right">
                                        <Realce valor={n} rodada={rodada}>{n.toLocaleString('pt-BR')}</Realce>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </CartaoCentral>
    );
}

export default CartaoObras;
