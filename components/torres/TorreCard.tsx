// components/torres/TorreCard.tsx
//
// Primitivo de apresentação COMPARTILHADO pelos três módulos que mostram "torres e unidades":
// Empreendimento (torre → unidades individuais), Viabilidade (bloco → tipologias) e Planta IA
// (cenário → unidades geradas). O conteúdo de cada um é diferente — o modelo de dados difere
// por propósito (registrar × estimar × gerar) — mas a CASCA é a mesma: mesmo card, mesmo
// header, mesma escala, mesma cor por origem. É a "consistência visual" pedida sem forçar os
// três a compartilharem schema.
//
// Escala compacta do guia (§16): container rounded-[10px], controles rounded-[6px]/h-9.

import React from 'react';
import { ChevronRight, LucideIcon } from 'lucide-react';

export type TorreTint = 'blue' | 'violet' | 'indigo';

const TINT: Record<TorreTint, { iconBg: string; iconText: string }> = {
    blue: { iconBg: 'bg-blue-50', iconText: 'text-blue-600' },
    violet: { iconBg: 'bg-violet-50', iconText: 'text-violet-600' },
    indigo: { iconBg: 'bg-indigo-50', iconText: 'text-indigo-600' },
};

interface TorreCardProps {
    icon: LucideIcon;
    tint?: TorreTint;
    /** Título — string simples ou nó (ex: input de edição inline do nome do bloco). */
    title: React.ReactNode;
    /** Linha de métricas sob o título (pavimentos · unidades · áreas). */
    subtitle?: React.ReactNode;
    /** Ações/badges à direita do header (vincular obra, editar, excluir…). */
    actions?: React.ReactNode;
    /** Corpo expansível. Se ausente, o card não expande (útil p/ leitura). */
    children?: React.ReactNode;
    expandable?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    /** Header alternativo (ex: modo de edição inline da torre inteira). Substitui título+subtítulo. */
    headerOverride?: React.ReactNode;
}

/** Card de torre/bloco/cenário — a casca comum. O miolo (`children`) é de cada módulo. */
export const TorreCard: React.FC<TorreCardProps> = ({
    icon: Icon, tint = 'blue', title, subtitle, actions, children,
    expandable = true, isOpen = false, onToggle, headerOverride,
}) => {
    const t = TINT[tint];
    const canExpand = expandable && !!children;

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
            <div className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                {headerOverride ?? (
                    <HeaderButton
                        icon={Icon} iconBg={t.iconBg} iconText={t.iconText}
                        title={title} subtitle={subtitle}
                        canExpand={canExpand} isOpen={isOpen} onToggle={onToggle}
                    />
                )}
                {actions && !headerOverride && (
                    <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
                )}
            </div>

            {canExpand && isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/40">{children}</div>
            )}
        </div>
    );
};

const HeaderButton: React.FC<{
    icon: LucideIcon; iconBg: string; iconText: string;
    title: React.ReactNode; subtitle?: React.ReactNode;
    canExpand: boolean; isOpen: boolean; onToggle?: () => void;
}> = ({ icon: Icon, iconBg, iconText, title, subtitle, canExpand, isOpen, onToggle }) => {
    const inner = (
        <>
            <div className={`p-2 rounded-[8px] ${iconBg} ${iconText} shrink-0`}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
                {typeof title === 'string'
                    ? <h4 className="font-bold text-gray-800 text-sm truncate">{title}</h4>
                    : title}
                {subtitle && <div className="text-xs text-gray-400 font-medium mt-0.5">{subtitle}</div>}
            </div>
            {canExpand && (
                <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            )}
        </>
    );

    if (!canExpand) {
        return <div className="flex items-center gap-3 text-left flex-1 min-w-0">{inner}</div>;
    }
    return (
        <button onClick={onToggle} className="flex items-center gap-3 text-left flex-1 min-w-0">
            {inner}
        </button>
    );
};

/** Uma métrica na linha de subtítulo ("16 unid.", "980 m² priv."). Cor opcional por tipo. */
export const TorreMetricInline: React.FC<{ value: string; color?: string }> = ({ value, color = 'text-gray-500' }) => (
    <span className={color}>{value}</span>
);

/** Barra de totais gerais no rodapé da lista (mesma linguagem nos três módulos). */
export const TorreTotais: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-3 flex flex-wrap gap-x-6 gap-y-2 items-center">
        {children}
    </div>
);

export const TorreTotalMetric: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = 'text-gray-700' }) => (
    <div>
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
);

/** Empty state consistente. */
export const TorreEmpty: React.FC<{ icon: LucideIcon; text: string }> = ({ icon: Icon, text }) => (
    <div className="text-center py-10 text-gray-400">
        <Icon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-xs font-semibold">{text}</p>
    </div>
);

export default TorreCard;
