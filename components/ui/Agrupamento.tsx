import React from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Layers } from 'lucide-react';
import type { DirecaoGrupos, Grupo } from '../../utils/agruparLinhas';
import { formatMoney } from './Format';

/**
 * Peças visuais do "Agrupar" (guia de UI §6.12) — o mesmo desenho de Boletos a
 * Pagar, que veio de Minhas Tarefas. O estado vem de `hooks/useAgrupamento`; os
 * grupos, de `utils/agruparLinhas`.
 */

/** Por que "recolher/expandir todos" está desligado — e o caminho para ligar. */
export const MOTIVO_SEM_AGRUPAMENTO = 'Escolha um campo em "Agrupar" para recolher ou expandir os grupos';
export const MOTIVO_SEM_ORDEM_DOS_GRUPOS = 'Escolha um campo em "Agrupar" para ordenar os grupos';

interface ControlesProps<C extends string> {
    opcoes: { value: C; label: string }[];
    campo: C | 'none';
    onCampo: (c: C | 'none') => void;
    /** Opt-in: com `onDirecao`, aparece o seletor Crescente/Decrescente da ordem DOS GRUPOS
     *  (molde ClickUp). As linhas dentro do grupo seguem a coluna ordenada — não é o
     *  "Ordenar por" que o §6.4 proíbe. */
    direcao?: DirecaoGrupos;
    onDirecao?: (d: DirecaoGrupos) => void;
    /** Chaves dos grupos atuais — para "recolher todos". */
    chavesDosGrupos: string[];
    algumRecolhido: boolean;
    onAlternarTodos: (keys: string[]) => void;
    /** `title` do seletor — diz O QUE se agrupa ("Agrupar os títulos"). */
    title: string;
}

/** Seletor "Agrupar" + recolher/expandir todos (sempre visível; desligado sem agrupamento).
 *  Vai na toolbar acoplada, depois do Filtro avançado. */
export function AgruparControles<C extends string>({ opcoes, campo, onCampo, direcao = 'asc', onDirecao, chavesDosGrupos, algumRecolhido, onAlternarTodos, title }: ControlesProps<C>) {
    const ativo = campo !== 'none';
    const IconeDirecao = direcao === 'desc' ? ArrowDownWideNarrow : ArrowUpNarrowWide;
    return (
        <>
            <div className="relative shrink-0">
                <Layers className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${ativo ? 'text-white' : 'text-gray-500'}`} />
                <select
                    value={campo}
                    onChange={e => onCampo(e.target.value as C | 'none')}
                    title={title}
                    className={`h-9 pl-8 pr-3 rounded-[6px] text-[13px] font-medium border appearance-none cursor-pointer transition-all ${
                        ativo
                            ? 'bg-blue-600 text-white border-blue-600 [&>option]:bg-white [&>option]:text-gray-900'
                            : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
                    }`}
                >
                    <option value="none">Agrupar</option>
                    {opcoes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
            {/* Ordem dos grupos — sempre visível, como o "recolher todos": sem agrupamento
                fica desligado e diz o porquê (o `title` no invólucro, pelo mesmo motivo). */}
            {onDirecao && (
                <span className="relative shrink-0" title={ativo ? undefined : MOTIVO_SEM_ORDEM_DOS_GRUPOS}>
                    {/* O ícone fica fora do <select>: esmaece à mão junto com o `disabled:opacity-40`. */}
                    <IconeDirecao className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-500 ${ativo ? '' : 'opacity-40'}`} />
                    <select
                        value={direcao}
                        onChange={e => onDirecao(e.target.value === 'desc' ? 'desc' : 'asc')}
                        disabled={!ativo}
                        title={ativo ? 'Ordem dos grupos' : MOTIVO_SEM_ORDEM_DOS_GRUPOS}
                        aria-label="Ordem dos grupos"
                        className="h-9 pl-8 pr-3 rounded-[6px] text-[13px] font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 appearance-none cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                    >
                        <option value="asc">Crescente</option>
                        <option value="desc">Decrescente</option>
                    </select>
                </span>
            )}
            {/* Sempre visível (pedido de 15/10/2026): sem agrupamento fica desligado e
                DIZ O PORQUÊ — ícone cinza mudo é lido como defeito. O `title` vai também
                no invólucro porque nem todo navegador mostra dica em botão desabilitado. */}
            <span className="shrink-0" title={ativo ? undefined : MOTIVO_SEM_AGRUPAMENTO}>
                <button
                    type="button"
                    onClick={() => onAlternarTodos(chavesDosGrupos)}
                    disabled={!ativo}
                    title={!ativo ? MOTIVO_SEM_AGRUPAMENTO : algumRecolhido ? 'Expandir todos os grupos' : 'Recolher todos os grupos'}
                    aria-label={!ativo ? 'Recolher todos os grupos' : algumRecolhido ? 'Expandir todos os grupos' : 'Recolher todos os grupos'}
                    className="h-9 w-9 flex items-center justify-center bg-white border border-gray-200 text-gray-600 rounded-[6px] hover:bg-gray-50 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:active:scale-100"
                >
                    {ativo && algumRecolhido ? <ChevronsUpDown className="w-4 h-4" /> : <ChevronsDownUp className="w-4 h-4" />}
                </button>
            </span>
        </>
    );
}

interface LinhaProps<T> {
    grupo: Grupo<T>;
    recolhido: boolean;
    /** O grupo começou na página anterior (paginação). */
    continua?: boolean;
    /** Todas as células de uma linha: checkbox + dados + espaçador + Ações. */
    colSpan: number;
    onAlternar: (key: string) => void;
    /** `title` do total — diz o que foi somado. */
    tituloTotal?: string;
    /** Tela sem valor em dinheiro (fornecedores, documentos): só a contagem, sem "R$ 0,00". */
    semTotal?: boolean;
}

/** Cabeçalho de grupo dentro do `<tbody>`: chevron, rótulo, contagem e total do grupo INTEIRO. */
export function LinhaDeGrupo<T>({ grupo, recolhido, continua, colSpan, onAlternar, tituloTotal = 'Soma do valor das linhas do grupo', semTotal }: LinhaProps<T>) {
    return (
        <tr>
            <td colSpan={colSpan} className="p-0">
                <div
                    onClick={() => onAlternar(grupo.key)}
                    className="flex items-center gap-2.5 px-6 py-2 bg-slate-50 hover:bg-slate-100 cursor-pointer select-none border-b border-slate-200 transition-colors"
                >
                    <span className="text-slate-400 flex-shrink-0">
                        {recolhido ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                    {/* Nome muito longo (contraparte do extrato) empurrava contagem e total para fora da tela. */}
                    <span className="font-semibold text-sm text-slate-800 truncate max-w-[22rem]" title={grupo.label}>{grupo.label}</span>
                    {continua && <span className="text-xs font-normal text-slate-500">(continua)</span>}
                    <span className="text-xs font-normal text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-[6px] flex-shrink-0">{grupo.itens.length}</span>
                    {/* Total logo após a contagem: no fim da linha ele caía fora da tela (tabela larga). */}
                    {!semTotal && <span className="text-sm font-medium text-gray-800 whitespace-nowrap" title={tituloTotal}>{formatMoney(grupo.total)}</span>}
                    <div className="flex-1 h-px bg-slate-200" />
                </div>
            </td>
        </tr>
    );
}
