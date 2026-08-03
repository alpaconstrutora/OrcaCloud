import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
    label: string;
    /**
     * Ausente = nó não navegável. O último item (nível atual) NUNCA tem onClick —
     * o componente já o renderiza como texto, mesmo que um seja passado por engano.
     */
    onClick?: () => void;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
    className?: string;
}

/**
 * Trilha de navegação (migalha de pão) — §23 do `docs/ui_ux_guia_unificado.md`.
 *
 * Só para drill-down DENTRO de uma tela (lista → item → sub-item). A trilha
 * começa no nível da própria tela; o caminho do módulo já está na sidebar (§18)
 * e não se repete aqui.
 *
 * Com menos de 3 níveis o componente não renderiza nada de propósito: 1 salto de
 * profundidade se resolve com botão "Voltar", que é o padrão dominante do app.
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
    if (items.length < 2) return null;

    return (
        <nav
            aria-label="Trilha de navegação"
            className={`flex items-center gap-1.5 text-xs font-medium text-gray-400 min-w-0 ${className}`}
        >
            {items.map((item, i) => {
                const isLast = i === items.length - 1;
                return (
                    <React.Fragment key={`${item.label}-${i}`}>
                        {i > 0 && (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" aria-hidden="true" />
                        )}
                        {isLast ? (
                            <span className="text-gray-600 font-semibold truncate" aria-current="page">
                                {item.label}
                            </span>
                        ) : item.onClick ? (
                            <button
                                type="button"
                                onClick={item.onClick}
                                className="hover:text-blue-600 transition-colors truncate max-w-[16rem]"
                            >
                                {item.label}
                            </button>
                        ) : (
                            <span className="truncate max-w-[16rem]">{item.label}</span>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
};

export default Breadcrumb;
