import React from 'react';
import { MoveHorizontal } from 'lucide-react';
import type { RegimeContabil } from '../../types/financial';
import type { EscopoControladoria } from './escopo';

// Barra de escopo (guia §5.3) das seis abas da Controladoria. É a MESMA barra em
// todas: muda o que vale, não o lugar. O que não se aplica à aba fica desligado e
// diz "Não se aplica", com borda tracejada (o fundo cinza-50 sozinho quase não se
// distingue do branco) e o motivo no `title` (mouse) E no `aria-describedby`
// (leitor de tela: o `title` de um campo desligado não chega a ele) — sumir e
// aparecer faria a barra pular a cada troca de aba (2ª crítica, 15/11/2026).
//
// Vem ANTES dos KPIs (exceção de ordem do §5.3): o período define os números.
// Sem "Atualizar": a aba recarrega sozinha a cada mudança (passo 2 do plano
// docs/planos/2026-11-14-controladoria-critica.md).

export interface AplicaNaAba {
    /** false = a aba é uma POSIÇÃO numa data (WIP): "De" desligado e "Até" vira "Posição em". */
    periodo: boolean;
    /** null = vale; string = o motivo de não valer nesta aba. */
    regime: string | null;
    obra: string | null;
}

const ROTULO = 'block text-xs font-semibold text-slate-500';
const NAO_SE_APLICA = '__nao_se_aplica';
// h-9 + rounded-[6px] (§16); anel azul sólido no foco (o de 20% de opacidade não
// chega a 3:1); valor sempre escuro, também desligado (§32).
const CAMPO = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
    'disabled:bg-gray-50 disabled:border-dashed disabled:border-gray-300 disabled:text-gray-900 disabled:cursor-not-allowed';
/** Motivo do campo desligado, para o leitor de tela (o `title` cobre o mouse). */
const Motivo: React.FC<{ id: string; texto: string | null | undefined }> = ({ id, texto }) =>
    texto ? <span id={id} className="sr-only">{texto}</span> : null;

export const BarraDeEscopo: React.FC<{
    escopo: EscopoControladoria;
    aplica: AplicaNaAba;
    /** À direita: o que é da aba (CSV, granularidade). */
    children?: React.ReactNode;
}> = ({ escopo, aplica, children }) => {
    const id = React.useId();
    const motivoDe = aplica.periodo ? undefined : 'Esta aba é uma posição numa data: vale só a data final.';
    return (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between bg-white p-3 rounded-[10px] border border-gray-100 shadow-sm mb-3">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="space-y-1.5" title={motivoDe}>
                    {/* 1º filho: o space-y (v4) dá margem a todo filho menos o último — se o motivo fosse o último, o campo ganhava 6 px e a barra desalinhava. */}
                    <Motivo id={`${id}-motivo-de`} texto={motivoDe} />
                    <label htmlFor={`${id}-de`} className={ROTULO}>De</label>
                    {aplica.periodo ? (
                        <input id={`${id}-de`} type="date" value={escopo.de}
                            onChange={e => escopo.setDe(e.target.value)} className={CAMPO} />
                    ) : (
                        // Posição numa data (WIP): a data inicial das outras abas aqui leria
                        // como se valesse. Mesma largura do campo de data: a barra não pula.
                        <input id={`${id}-de`} type="text" value="Não se aplica" disabled readOnly
                            aria-describedby={`${id}-motivo-de`} className={`${CAMPO} w-[9.75rem]`} />
                    )}
                </div>
                <div className="space-y-1.5">
                    <label htmlFor={`${id}-ate`} className={ROTULO}>{aplica.periodo ? 'Até' : 'Posição em'}</label>
                    <input id={`${id}-ate`} type="date" value={escopo.ate}
                        onChange={e => escopo.setAte(e.target.value)} className={CAMPO} />
                </div>
                <div className="space-y-1.5" title={aplica.regime ?? undefined}>
                    <Motivo id={`${id}-motivo-regime`} texto={aplica.regime} />
                    <label htmlFor={`${id}-regime`} className={ROTULO}>Regime</label>
                    <select id={`${id}-regime`} value={aplica.regime === null ? escopo.regime : NAO_SE_APLICA}
                        disabled={aplica.regime !== null}
                        aria-describedby={aplica.regime !== null ? `${id}-motivo-regime` : undefined}
                        onChange={e => escopo.setRegime(e.target.value as RegimeContabil)}
                        className={`${CAMPO} pr-8`}>
                        <option value="CAIXA">Caixa</option>
                        <option value="COMPETENCIA">Competência</option>
                        {/* Desligado mostra isto, não o regime das outras abas ("Competência" no
                            Fluxo de caixa leria como se o fluxo estivesse em competência). */}
                        {aplica.regime !== null && <option value={NAO_SE_APLICA}>Não se aplica</option>}
                    </select>
                </div>
                <div className="space-y-1.5 min-w-0" title={aplica.obra ?? undefined}>
                    <Motivo id={`${id}-motivo-obra`} texto={aplica.obra} />
                    <label htmlFor={`${id}-obra`} className={ROTULO}>Obra</label>
                    <select id={`${id}-obra`} value={aplica.obra === null ? escopo.obraId : NAO_SE_APLICA} disabled={aplica.obra !== null}
                        aria-describedby={aplica.obra !== null ? `${id}-motivo-obra` : undefined}
                        onChange={e => escopo.setObra(e.target.value)}
                        className={`${CAMPO} pr-8 w-full sm:w-auto sm:max-w-[260px] truncate`}>
                        <option value="">Todas as obras</option>
                        {aplica.obra !== null && <option value={NAO_SE_APLICA}>Não se aplica</option>}
                        {escopo.obras.map(o => (
                            <option key={o.project_id} value={o.project_id}>
                                {o.code ? `${o.code} · ${o.project_name}` : o.project_name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            {children && <div className="flex flex-wrap items-end gap-2 shrink-0">{children}</div>}
        </div>
    );
};

/** Botão secundário da barra (CSV, por exemplo) — compacto §17, neutro. */
export const BOTAO_DA_BARRA =
    'flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] ' +
    'hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

/** Ajustar largura das colunas ao conteúdo (§6.1.2), com nome acessível e foco
 *  visível. Ícone em gray-500 (~4,6:1): o gray-400 do snippet do guia dá ~2,5:1,
 *  abaixo dos 3:1 de componente de interface que o AA pede (PRODUCT.md). */
export const BotaoAutoAjuste: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        type="button"
        onClick={onClick}
        title="Ajustar largura das colunas ao conteúdo"
        aria-label="Ajustar largura das colunas ao conteúdo"
        className="p-1.5 rounded-[6px] text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
        <MoveHorizontal className="w-4 h-4" aria-hidden="true" />
    </button>
);
