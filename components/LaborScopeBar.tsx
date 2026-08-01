import React from 'react';
import { RefreshCw } from 'lucide-react';

interface LaborScopeBarProps {
    onRefresh: () => void;
    loading?: boolean;
    /** Ação primária específica da tela (ex: "Novo Colaborador"), alinhada à direita. */
    children?: React.ReactNode;
}

/**
 * Barra de escopo compartilhada pelas telas do módulo Gestão de Mão de Obra
 * (§5.3 de ui_ux_guia_unificado.md): Atualizar à esquerda, ação primária da
 * tela (se houver) à direita. Sem seletor de organização — vem do seletor
 * global do topo.
 */
const LaborScopeBar: React.FC<LaborScopeBarProps> = ({ onRefresh, loading, children }) => (
    <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div className="flex flex-wrap items-center gap-2">
            <button
                onClick={onRefresh}
                title="Atualizar"
                className="h-9 w-9 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-[6px] hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shrink-0"
            >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
        </div>
        {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
);

export default LaborScopeBar;
