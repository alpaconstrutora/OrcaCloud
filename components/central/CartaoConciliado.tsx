import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { CartaoCentral, type EstadoDoCartao } from './CartaoCentral';
import { NumeroQueSobe } from './NumeroQueSobe';
import type { MeuDia } from '../../services/centralControleService';
import { percentualConciliado } from '../../utils/meuDia';

/**
 * % conciliado — o único cartão em cor cheia da tela "Bom dia". Base: linhas do
 * extrato dos últimos 30 dias (contas ativas), conciliadas pela regra única
 * `fn_bank_tx_conciliado`; variação em pontos sobre os 30 dias anteriores.
 * Sem extrato no período: diz isso, não mostra 0%.
 */
interface Props {
    estado: EstadoDoCartao;
    onTentarDeNovo: () => void;
    dados: MeuDia['conciliado'] | null;
    animar: boolean;
    onNavigate: (view: string) => void;
}

export function CartaoConciliado({ estado, onTentarDeNovo, dados, animar, onNavigate }: Props) {
    const r = dados ? percentualConciliado(dados) : null;
    return (
        <CartaoCentral
            titulo="Extrato conciliado"
            subtitulo="Linhas do extrato dos últimos 30 dias."
            estado={estado}
            onTentarDeNovo={onTentarDeNovo}
            tom="azul"
            acao={{ rotulo: 'Conciliação', onClick: () => onNavigate('bank-reconciliation') }}
        >
            {r && dados && (r.pct == null ? (
                <p className="text-sm text-blue-50">Nenhum extrato importado nos últimos 30 dias.</p>
            ) : (
                <div className="flex flex-col gap-2">
                    <NumeroQueSobe
                        valor={r.pct}
                        animar={animar}
                        formatar={n => `${Math.round(n).toLocaleString('pt-BR')}%`}
                        className="text-[44px] leading-none font-semibold text-white tracking-[-0.02em]"
                    />
                    <p className="text-sm text-blue-50">
                        {dados.conciliadas.toLocaleString('pt-BR')} de {r.base.toLocaleString('pt-BR')} {r.base === 1 ? 'linha conciliada' : 'linhas conciliadas'}
                    </p>
                    {r.variacao != null && Math.round(r.variacao) !== 0 && (
                        <p className="inline-flex items-center gap-1 text-xs text-blue-100">
                            {r.variacao > 0
                                ? <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                                : <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />}
                            {Math.abs(Math.round(r.variacao)).toLocaleString('pt-BR')} pontos {r.variacao > 0 ? 'acima' : 'abaixo'} dos 30 dias anteriores
                        </p>
                    )}
                </div>
            ))}
        </CartaoCentral>
    );
}

export default CartaoConciliado;
