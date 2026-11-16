import React from 'react';
import { moverEntreAbas, tabIndexDaAba } from './abasPeloTeclado';

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
    /** Grupo da aba (ex.: "Entrada" × "Quadros" nas Áreas NBR 12721). Abas do mesmo grupo
     *  vêm juntas; o trilho escreve o nome do grupo antes da 1ª e põe uma divisória entre grupos.
     *  Sem `grupo` em nenhuma aba, nada muda. */
    grupo?: string;
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
    /** 'manual': a seta só move o foco; Enter/Espaço escolhem a aba. Para painéis que
     *  consultam o servidor a cada troca (ver `moverEntreAbas`). Padrão: automática. */
    ativacao?: 'automatica' | 'manual';
}

/* Classes por extenso — o JIT do Tailwind não enxerga classe montada em runtime.
 * Contador: até 15/11/2026 era o tom 400 (`text-blue-400` na aba ativa, `text-gray-400` nas
 * outras) — 2,5–2,6:1, abaixo dos 4,5:1 do AA (medido na crítica das Áreas NBR 12721). Agora
 * é o tom do rótulo da aba ativa e `text-gray-500` nas inativas (≈ 4,7:1 sobre o trilho). */
const ACCENTS = {
    blue: { ativa: 'bg-white text-blue-600 shadow-sm', contador: 'text-blue-600', novo: 'font-semibold text-blue-600', anel: 'focus-visible:ring-blue-500' },
    orange: { ativa: 'bg-white text-orange-600 shadow-sm', contador: 'text-orange-700', novo: 'font-semibold text-orange-600', anel: 'focus-visible:ring-orange-500' },
    indigo: { ativa: 'bg-white text-indigo-600 shadow-sm', contador: 'text-indigo-600', novo: 'font-semibold text-indigo-600', anel: 'focus-visible:ring-indigo-500' },
    portal: { ativa: 'bg-white text-[#C24428] shadow-sm', contador: 'text-[#C24428]', novo: 'font-semibold text-[#C24428]', anel: 'focus-visible:ring-[#C24428]' },
};

export function TabsBar<T extends string>({ tabs, value, onChange, children, className = '', bare, accent = 'blue', ativacao = 'automatica' }: TabsBarProps<T>) {
    const cor = ACCENTS[accent];
    const algumaAtiva = tabs.some(t => t.id === value);
    /* flex-wrap, nunca overflow-x-auto — rolagem horizontal esconde aba sem avisar (§19.1) */
    const trilho = (
            <div role="tablist" onKeyDown={e => moverEntreAbas(e, ativacao === 'automatica')} className={`flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full ${bare ? className : ''}`}>
                {tabs.map((t, i) => {
                    const active = t.id === value;
                    // Começo de grupo: o nome do grupo (texto, não aba — as setas pulam ele) e, a
                    // partir do 2º grupo, uma divisória. O nome é `aria-hidden`: o rótulo de cada
                    // aba já se explica, e o leitor de tela não ouve "Quadros" como se fosse aba.
                    const inicioDeGrupo = !!t.grupo && t.grupo !== tabs[i - 1]?.grupo;
                    return (
                        <React.Fragment key={t.id}>
                        {inicioDeGrupo && (
                            <span aria-hidden="true" className={`flex items-center gap-1 h-7 pr-1 text-xs font-medium text-gray-500 select-none ${i > 0 ? 'pl-2 ml-1 border-l border-gray-200' : 'pl-2'}`}>
                                {t.grupo}
                            </span>
                        )}
                        <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            tabIndex={tabIndexDaAba(active, i, algumaAtiva)}
                            onClick={() => onChange(t.id)}
                            className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-2 ${cor.anel} ${
                                active ? cor.ativa : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {t.icon}
                            {t.label}
                            {t.badge !== undefined && t.badge !== 0 && (
                                <span title={t.badgeTitulo}
                                    className={`text-xs ${t.badgeTom === 'alerta' ? 'font-semibold text-red-600' : t.badgeTom === 'novo' ? cor.novo : active ? cor.contador : 'text-gray-500'}`}>{t.badge}</span>
                            )}
                        </button>
                        </React.Fragment>
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
