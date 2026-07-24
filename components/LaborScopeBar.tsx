import React from 'react';
import { RefreshCw } from 'lucide-react';

interface LaborScopeBarProps {
    organizations: Array<{ id: string; name: string }>;
    selectedOrgId?: string;
    onSelectedOrgIdChange: (orgId: string | undefined) => void;
    onRefresh: () => void;
    loading?: boolean;
    /** Ação primária específica da tela (ex: "Novo Colaborador"), alinhada à direita. */
    children?: React.ReactNode;
}

/**
 * Barra de escopo compartilhada pelas telas do módulo Gestão de Mão de Obra
 * (§4 de UI UX tabela.md): seletor de organização (contexto do módulo inteiro)
 * + Atualizar à esquerda, ação primária da tela (se houver) à direita.
 */
const LaborScopeBar: React.FC<LaborScopeBarProps> = ({
    organizations, selectedOrgId, onSelectedOrgIdChange, onRefresh, loading, children,
}) => (
    <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div className="flex flex-wrap items-center gap-2">
            <select
                value={selectedOrgId || ''}
                onChange={e => onSelectedOrgIdChange(e.target.value || undefined)}
                className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer min-w-[180px]"
            >
                <option value="">Todas as organizações</option>
                {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                ))}
            </select>
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
