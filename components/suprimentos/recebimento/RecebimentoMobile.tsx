import React from 'react';
import { List } from 'lucide-react';
import { useOrgContext } from '../../../hooks/useOrgContext';
import { criarFonteRecebimento } from '../../../services/recebimentoFonte';
import RecebimentoFluxo from './RecebimentoFluxo';

/**
 * Suprimentos › Recebimento no CELULAR do app logado (tela < 768 px). Plano:
 * docs/planos/2026-11-27-recebimento-mobile.md (Fase 4). A lista completa (a do
 * computador) continua a um toque.
 *
 * Organização: a do seletor do topo (REGRA #5; "Todas" = todas as orgs do usuário
 * com acesso a Compras — o banco recorta).
 */

interface Props {
    onAbrirListaCompleta: () => void;
    onVerPedido: (pedidoId: string) => void;
}

const RecebimentoMobile: React.FC<Props> = ({ onAbrirListaCompleta, onVerPedido }) => {
    const { orgId } = useOrgContext();
    // Estável por org: a fonte está nas dependências da carga da lista.
    const fonte = React.useMemo(() => criarFonteRecebimento({ orgId }), [orgId]);

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Recebimento</h1>
                <p className="text-gray-500 text-sm mt-1.5 font-medium">Confira o que chegou, registre a retirada e mande a nota.</p>
            </div>

            <RecebimentoFluxo fonte={fonte} onVerPedidoCompleto={onVerPedido} />

            <button type="button" onClick={onAbrirListaCompleta}
                className="w-full flex items-center justify-center gap-1.5 h-11 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px]">
                <List className="w-[15px] h-[15px]" /> Abrir lista completa de recebimentos
            </button>
        </div>
    );
};

export default RecebimentoMobile;
