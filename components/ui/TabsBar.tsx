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
    /** 'alerta' pinta o contador de vermelho — conta algo que pede ação (ex.: falhas).
     *  'novo' pinta na cor de destaque da barra — novidade que ainda não foi vista. */
    badgeTom?: 'alerta' | 'novo';
    /** O que o contador conta (vira `title` dele) — número solto não se explica. */
    badgeTitulo?: string;
}

interface TabsBarProps<T extends string> {
    tabs: TabsBarItem<T>[];
    value: T;
    onChange: (id: T) => void;
    children?: React.ReactNode;
    className?: string;
    /** Só o trilho, sem o card nem o `mb-3` — quando as abas moram DENTRO de outra
     *  barra (ex.: a de escopo §5.3), que já é o card. `children` é ignorado. */
    bare?: boolean;
    /** Cor da aba ativa. 'blue' é o app (§19.1); 'orange' é o Portal do Parceiro,
     *  cuja casca inteira é laranja — mesmo racional do `accent` da §24.
     *  'indigo' / 'portal' (coral) são os dois acentos do detalhe do pedido de
     *  compra (`SupplyChainOrderDetails`): sub-aba tem de ter a MESMA cor da barra
     *  principal logo acima — e no link do fornecedor (§24) ela é coral. */
    accent?: 'blue' | 'orange' | 'indigo' | 'portal';
}

/* Classes por extenso — o JIT do Tailwind não enxerga classe montada em runtime. */
const ACCENTS = {
    blue: { ativa: 'bg-white text-blue-600 shadow-sm', contador: 'text-blue-400', novo: 'font-semibold text-blue-600' },
    orange: { ativa: 'bg-white text-orange-600 shadow-sm', contador: 'text-orange-400', novo: 'font-semibold text-orange-600' },
    indigo: { ativa: 'bg-white text-indigo-600 shadow-sm', contador: 'text-indigo-400', novo: 'font-semibold text-indigo-600' },
    portal: { ativa: 'bg-white text-[#C24428] shadow-sm', contador: 'text-[#E1553C]', novo: 'font-semibold text-[#C24428]' },
};

export function TabsBar<T extends string>({ tabs, value, onChange, children, className = '', bare, accent = 'blue' }: TabsBarProps<T>) {
    const cor = ACCENTS[accent];
    /* flex-wrap, nunca overflow-x-auto — rolagem horizontal esconde aba sem avisar (§19.1) */
    const trilho = (
            <div role="tablist" className={`flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full ${bare ? className : ''}`}>
                {tabs.map(t => {
                    const active = t.id === value;
                    return (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={active}
                            onClick={() => onChange(t.id)}
                            className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                active ? cor.ativa : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {t.icon}
                            {t.label}
                            {t.badge !== undefined && t.badge !== 0 && (
                                <span title={t.badgeTitulo}
                                    className={`text-xs ${t.badgeTom === 'alerta' ? 'font-semibold text-red-600' : t.badgeTom === 'novo' ? cor.novo : active ? cor.contador : 'text-gray-400'}`}>{t.badge}</span>
                            )}
                        </button>
                    );
                })}
            </div>
    );
    if (bare) return trilho;
    return (
        <div className={`flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3 ${className}`}>
            {trilho}
            {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
        </div>
    );
}

export default TabsBar;
