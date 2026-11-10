import React from 'react';
import { Clock, MapPin, ShoppingBasket } from 'lucide-react';
import Espelho3D from '../espelho3d/Espelho3D';
import type { PrismaDoEspelho } from '../../utils/espelhoDeVendas3d';
import { PALETA_DO_CORRETOR } from '../../utils/espelhoDoEstoque';
import type { BrokerPortalState } from './useBrokerPortal';

/**
 * O ESTOQUE EM 3D do Portal do Corretor (Espelho de Vendas 3D, F3 — 09/11/2026).
 * Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md. O seletor "2D | 3D" e o
 * desenho, para as duas cascas (computador e celular). Os dados e as ações são
 * os do hook — os mesmos do espelho 2D: status, proposta, reserva e cesta.
 */

/** O que o hook dá a estas peças. As cascas passam o estado inteiro; o harness, só isto. */
export type EstoqueEm3DState = Pick<
    BrokerPortalState,
    'visaoDoEstoque' | 'setVisaoDoEstoque' | 'motivoSem3d' | 'estoqueEm3d' | 'espelhoDoEstoque' | 'visibleUnits' | 'cart' | 'handleMakeProposal' | 'handleReserve' | 'handleToggleCart'
>;

/** "2D | 3D" — o 3D fica desligado, com o motivo, quando não há um prédio só para desenhar. */
export const SeletorDaVisaoDoEstoque: React.FC<{ h: EstoqueEm3DState; className?: string }> = ({ h, className = '' }) => (
    <div role="group" aria-label="Como ver o estoque" className={`flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 w-fit shrink-0 ${className}`}>
        {(['2D', '3D'] as const).map(v => {
            const ativo = v === '3D' ? h.estoqueEm3d : !h.estoqueEm3d;
            const desligado = v === '3D' && !!h.motivoSem3d;
            return (
                <button
                    key={v}
                    type="button"
                    aria-pressed={ativo}
                    disabled={desligado}
                    title={desligado ? h.motivoSem3d! : v === '3D' ? 'Ver as torres em 3D' : 'Ver o espelho de unidades'}
                    onClick={() => h.setVisaoDoEstoque(v)}
                    className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${ativo ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                >
                    {v}
                </button>
            );
        })}
    </div>
);

const BOTAO = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95';

export const EstoqueEm3D: React.FC<{ h: EstoqueEm3DState }> = ({ h }) => {
    const espelho = h.espelhoDoEstoque;
    if (!espelho) {
        return (
            <div className="text-center py-12" role="status">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-500 mt-3">Montando o desenho das torres…</p>
            </div>
        );
    }

    const semTorre = espelho.cena.prismas.every(p => !p.unitId);
    const acoes = (prisma: PrismaDoEspelho) => {
        const unidade = h.visibleUnits.find(u => u.id === prisma.unitId);
        if (!unidade) return null;
        if (prisma.status !== 'available') {
            return <p className="text-[13px] text-gray-600">Esta unidade não está disponível para reserva nem proposta.</p>;
        }
        const naCesta = h.cart.some(u => u.id === unidade.id);
        return (
            <>
                <button type="button" onClick={() => h.handleMakeProposal(unidade)} className={`${BOTAO} bg-blue-600 text-white hover:bg-blue-700`}>
                    <MapPin className="w-[15px] h-[15px]" />
                    Fazer proposta
                </button>
                <button type="button" onClick={() => h.handleReserve(unidade)} className={`${BOTAO} bg-white border border-gray-200 text-gray-800 hover:border-gray-400`}>
                    <Clock className="w-[15px] h-[15px]" />
                    Reservar (48h)
                </button>
                <button type="button" aria-pressed={naCesta} onClick={() => h.handleToggleCart(unidade)} className={`${BOTAO} bg-white border border-gray-200 text-gray-800 hover:border-gray-400`}>
                    <ShoppingBasket className="w-[15px] h-[15px]" />
                    {naCesta ? 'Tirar da proposta' : 'Somar à proposta'}
                </button>
            </>
        );
    };

    return (
        <div className="space-y-3">
            {semTorre ? (
                <p className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 min-h-[160px] flex items-center justify-center text-sm text-gray-600 text-center">
                    As unidades deste empreendimento não têm andar cadastrado, então o 3D não tem como empilhá-las. Elas continuam no espelho 2D.
                </p>
            ) : (
                <Espelho3D cena={espelho.cena} dados={espelho.dados} paleta={PALETA_DO_CORRETOR} mostrarPreco acoesDaFicha={acoes} />
            )}
            {!semTorre && espelho.semPosicao > 0 && (
                <p className="text-[13px] text-gray-600">
                    {espelho.semPosicao === 1 ? '1 unidade do estoque não tem andar ou lugar na torre e aparece' : `${espelho.semPosicao} unidades do estoque não têm andar ou lugar na torre e aparecem`} só no espelho 2D.
                </p>
            )}
        </div>
    );
};

export default EstoqueEm3D;
