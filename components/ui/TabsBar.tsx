import React from 'react';

/**
 * Toolbar de abas — §19.1 de `docs/ui_ux_guia_unificado.md`, em componente.
 *
 * O trilho (`bg-gray-50 p-1 rounded-[10px]`) já existia em `ui/tabs.tsx`
 * (`TabsList`/`TabsTrigger`); o que cada tela vinha copiando à mão — e
 * divergindo (`bg-slate-100 rounded-2xl`, aba ativa indigo em caixa alta) — era o
 * card branco em volta. Aqui o card e o trilho vêm juntos, com o `mb-3` do ritmo
 * §20.1, e a tela declara só as abas.
 *
 * `children` é o slot à direita (`justify-between`): ação primária §17, contador,
 * toggle grade/lista §5.1 — o que a tela precisar ao lado das abas.
 */
export interface TabsBarItem<T extends string = string> {
    id: T;
    label: string;
    icon?: React.ReactNode;
    /** Contador discreto ao lado do rótulo (ex.: quantidade de itens da aba). */
    badge?: number | string;
}

interface TabsBarProps<T extends string> {
    tabs: TabsBarItem<T>[];
    value: T;
    onChange: (id: T) => void;
    children?: React.ReactNode;
    className?: string;
}

export function TabsBar<T extends string>({ tabs, value, onChange, children, className = '' }: TabsBarProps<T>) {
    return (
        <div className={`flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3 ${className}`}>
            {/* flex-wrap, nunca overflow-x-auto — rolagem horizontal esconde aba sem avisar (§19.1) */}
            <div role="tablist" className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                {tabs.map(t => {
                    const active = t.id === value;
                    return (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={active}
                            onClick={() => onChange(t.id)}
                            className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                active ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {t.icon}
                            {t.label}
                            {t.badge !== undefined && t.badge !== 0 && (
                                <span className={`text-xs ${active ? 'text-blue-400' : 'text-gray-400'}`}>{t.badge}</span>
                            )}
                        </button>
                    );
                })}
            </div>
            {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
        </div>
    );
}

export default TabsBar;
