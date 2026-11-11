import React from 'react';
import { Check, ChevronRight, X, CircleCheck } from 'lucide-react';
import { CartaoCentral, type EstadoDoCartao } from './CartaoCentral';
import { ENTITY_TAG } from '../FinancialApprovalModule';
import type { ActionQueueItem } from '../../services/approvalService';
import { diasDeAtraso, type FilaDoDia, type ItemDaFila } from '../../utils/meuDia';

/**
 * Minha fila — o cartão principal da tela "Bom dia". O que precisa de MIM hoje:
 * aprovações da minha alçada, minhas tarefas com prazo até hoje, contas que
 * vencem hoje e alertas (os de alta prioridade contam na frase do topo).
 *
 * No alto, o item mais urgente em destaque (vencido > vence hoje > alerta alto),
 * com a ação na mão. Abaixo, um grupo recolhível por origem.
 *
 * Movimento (index.css, `.central-*`): o item resolvido recolhe antes de sair
 * (`saindo`), o novo destaque entra no lugar do anterior, o grupo abre e fecha
 * deslizando e a troca de filtro esmaece. Nada disso desloca com
 * `prefers-reduced-motion`.
 */
export type FiltroDaFila = 'tudo' | 'aprovacoes' | 'tarefas' | 'contas' | 'alertas';

const GRUPOS: { chave: Exclude<FiltroDaFila, 'tudo'>; titulo: string; destino: string; verTodas: (n: number) => string }[] = [
    { chave: 'aprovacoes', titulo: 'Aprovações', destino: 'financial-approval', verTodas: n => `Ver as ${n} da organização` },
    { chave: 'tarefas', titulo: 'Tarefas', destino: 'tarefas', verTodas: () => 'Abrir Tarefas' },
    { chave: 'contas', titulo: 'Contas de hoje', destino: 'contas-a-pagar', verTodas: () => 'Abrir Contas a Pagar' },
    { chave: 'alertas', titulo: 'Alertas', destino: 'financial-dashboard', verTodas: () => 'Abrir Dashboard Financeiro' },
];

const POR_GRUPO = 5;

function fBRL(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function prazoTexto(prazo: string | null, hoje: string): { texto: string; tom: 'vencido' | 'hoje' | 'futuro' } | null {
    if (!prazo) return null;
    const atraso = diasDeAtraso(prazo, hoje);
    const [a, m, d] = prazo.split('-');
    // Atraso longo em dias ("há 3.482 dias") ninguém lê: vira a data.
    if (atraso > 30) return { texto: `Vencido desde ${d}/${m}/${a}`, tom: 'vencido' };
    if (atraso > 0) return { texto: atraso === 1 ? 'Venceu ontem' : `Vencido há ${atraso} dias`, tom: 'vencido' };
    if (atraso === 0) return { texto: 'Vence hoje', tom: 'hoje' };
    return { texto: `Vence ${d}/${m}`, tom: 'futuro' };
}

const TOM_PRAZO = { vencido: 'text-red-600', hoje: 'text-amber-700', futuro: 'text-gray-500' } as const;

function rotuloDoTipo(item: ItemDaFila): string {
    switch (item.tipo) {
        case 'aprovacao': return `Aprovação · ${ENTITY_TAG[item.aprovacao.entity] ?? item.aprovacao.entity}`;
        case 'tarefa': return 'Tarefa';
        case 'conta': return 'Conta a pagar';
        case 'alerta': return item.alerta.severity === 'HIGH' ? 'Alerta · alta prioridade' : 'Alerta';
    }
}

function tituloDo(item: ItemDaFila): string {
    switch (item.tipo) {
        case 'aprovacao': return item.aprovacao.title;
        case 'tarefa': return item.tarefa.title;
        case 'conta': return item.conta.description?.trim() || item.conta.party_name || 'Título sem descrição';
        case 'alerta': return item.alerta.title;
    }
}

function detalheDo(item: ItemDaFila): string | null {
    switch (item.tipo) {
        case 'aprovacao': return item.aprovacao.party_name ?? item.aprovacao.project_name ?? null;
        case 'tarefa': return null;
        case 'conta': return item.conta.description?.trim() ? item.conta.party_name : null;
        case 'alerta': return item.alerta.description || null;
    }
}

interface Props {
    estado: EstadoDoCartao;
    onTentarDeNovo: () => void;
    fila: FilaDoDia;
    destaque: ItemDaFila | null;
    /** Chaves dos itens resolvidos que estão saindo da fila (a linha recolhe). */
    saindo: ReadonlySet<string>;
    hoje: string;
    filtro: FiltroDaFila;
    /** Aprovações PENDENTES da organização inteira (minhas e de outras alçadas). */
    totalAprovacoesDaOrg: number;
    /** Tarefas/contas: o banco conta tudo, a lista vem cortada em 20. */
    qtdTarefas: number;
    qtdContas: number;
    onAprovar: (item: ActionQueueItem) => void;
    onRejeitar: (item: ActionQueueItem) => void;
    onConcluirTarefa: (id: string) => void;
    onNavigate: (view: string) => void;
    className?: string;
}

export function MinhaFila(props: Props) {
    const { estado, onTentarDeNovo, fila, destaque, saindo, filtro, className } = props;
    const [abertos, setAbertos] = React.useState<Record<string, boolean>>({ aprovacoes: true, tarefas: true, contas: true, alertas: false });

    const grupos = GRUPOS.filter(g => filtro === 'tudo' || g.chave === filtro);
    const vazio = fila.aprovacoes.length + fila.tarefas.length + fila.contas.length + fila.alertas.length === 0;
    const qtdDoGrupo = (g: typeof GRUPOS[number]) =>
        g.chave === 'tarefas' ? props.qtdTarefas : g.chave === 'contas' ? props.qtdContas : fila[g.chave].length;

    return (
        <CartaoCentral
            titulo="Minha fila"
            subtitulo="Aprovações da sua alçada, suas tarefas até hoje, contas que vencem hoje e alertas."
            estado={estado}
            onTentarDeNovo={onTentarDeNovo}
            className={className}
        >
            {vazio ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-10 gap-2">
                    <CircleCheck className="w-8 h-8 text-emerald-500" aria-hidden="true" />
                    <p className="text-sm font-medium text-gray-800">Nada esperando por você hoje.</p>
                    <p className="text-xs text-gray-500">Quando algo chegar à sua alçada ou vencer, aparece aqui.</p>
                </div>
            ) : (
                <div key={filtro} className="flex flex-col gap-4 central-aparece">
                    {destaque && filtro === 'tudo' && (
                        <div key={destaque.chave} className="central-recolhe" data-saindo={saindo.has(destaque.chave)}>
                            <div className="central-troca"><Destaque item={destaque} {...props} /></div>
                        </div>
                    )}

                    {grupos.map(g => {
                        const itens = fila[g.chave].filter(i => !(filtro === 'tudo' && destaque && i.chave === destaque.chave));
                        const qtd = qtdDoGrupo(g);
                        if (qtd === 0 && filtro === 'tudo') return null;
                        const aberto = filtro !== 'tudo' || abertos[g.chave];
                        const idLista = `minha-fila-${g.chave}`;
                        return (
                            <div key={g.chave} className="border-t border-gray-100 pt-3">
                                <button
                                    type="button"
                                    aria-expanded={aberto}
                                    aria-controls={idLista}
                                    onClick={() => setAbertos(a => ({ ...a, [g.chave]: !aberto }))}
                                    disabled={filtro !== 'tudo'}
                                    className="w-full flex items-center gap-2 text-left rounded-[6px] -mx-1 px-1 py-1 hover:bg-gray-50 disabled:hover:bg-transparent disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                >
                                    {filtro === 'tudo' && (
                                        <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-200 motion-reduce:transition-none ${aberto ? 'rotate-90' : ''}`} aria-hidden="true" />
                                    )}
                                    <span className="text-sm font-medium text-gray-800">{g.titulo}</span>
                                    <span className="text-xs text-gray-500 tabular-nums">{qtd.toLocaleString('pt-BR')}</span>
                                </button>
                                {/* Sempre no DOM para abrir e fechar deslizando; fechado = `inert`
                                    (fora do Tab e do leitor de tela). */}
                                <div id={idLista} className="central-recolhe" data-fechado={!aberto} inert={!aberto}>
                                    <div>
                                        {itens.length === 0 ? (
                                            <p className="text-sm text-gray-500 py-2">Nada aqui hoje.</p>
                                        ) : (
                                            <ul className="divide-y divide-gray-100">
                                                {itens.slice(0, POR_GRUPO).map(i => <Linha key={i.chave} item={i} {...props} />)}
                                            </ul>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => props.onNavigate(g.destino)}
                                            className="mt-1 mb-0.5 text-xs font-medium text-blue-600 hover:text-blue-800 rounded-[6px] px-1 -mx-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                        >
                                            {g.verTodas(g.chave === 'aprovacoes' ? props.totalAprovacoesDaOrg : qtd)}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </CartaoCentral>
    );
}

function destinoDo(item: ItemDaFila): string {
    switch (item.tipo) {
        case 'aprovacao': return 'financial-approval';
        case 'tarefa': return 'tarefas';
        case 'conta': return 'contas-a-pagar';
        case 'alerta': return item.alerta.view;
    }
}

function Destaque({ item, hoje, saindo, onAprovar, onRejeitar, onConcluirTarefa, onNavigate }: { item: ItemDaFila } & Props) {
    const prazo = prazoTexto(item.prazo, hoje);
    const resolvido = saindo.has(item.chave);
    const detalhe = detalheDo(item);
    const botaoPrimario = 'h-9 px-4 inline-flex items-center gap-1.5 rounded-[6px] bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2';
    const botaoSecundario = 'h-9 px-4 inline-flex items-center gap-1.5 rounded-[6px] border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40';
    return (
        <div className="rounded-[10px] bg-gray-50 border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Mais urgente · {rotuloDoTipo(item)}</p>
            <p className="mt-1 text-base font-semibold text-gray-900 [overflow-wrap:anywhere]">{tituloDo(item)}</p>
            {detalhe && <p className="text-sm text-gray-600 mt-0.5 truncate">{detalhe}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {item.valor != null && item.valor !== 0 && <span className="font-medium text-gray-900 tabular-nums">{fBRL(item.valor)}</span>}
                {prazo && <span className={`font-medium ${TOM_PRAZO[prazo.tom]}`}>{prazo.texto}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {item.tipo === 'aprovacao' && (
                    <>
                        <button type="button" className={botaoPrimario} disabled={resolvido} onClick={() => onAprovar(item.aprovacao)}>
                            <Check className="w-4 h-4" aria-hidden="true" /> Aprovar
                        </button>
                        <button type="button" className={botaoSecundario} disabled={resolvido} onClick={() => onRejeitar(item.aprovacao)}>
                            <X className="w-4 h-4" aria-hidden="true" /> Rejeitar
                        </button>
                    </>
                )}
                {item.tipo === 'tarefa' && (
                    <button type="button" className={botaoPrimario} disabled={resolvido} onClick={() => onConcluirTarefa(item.tarefa.id)}>
                        <Check className="w-4 h-4" aria-hidden="true" /> {resolvido ? 'Concluída' : 'Concluir tarefa'}
                    </button>
                )}
                <button type="button" className={item.tipo === 'aprovacao' || item.tipo === 'tarefa' ? 'h-9 px-2 text-sm font-medium text-blue-600 hover:text-blue-800 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40' : botaoPrimario} onClick={() => onNavigate(destinoDo(item))}>
                    Abrir
                </button>
            </div>
        </div>
    );
}

function Linha({ item, hoje, saindo, onAprovar, onRejeitar, onConcluirTarefa, onNavigate }: { item: ItemDaFila } & Props) {
    const prazo = prazoTexto(item.prazo, hoje);
    const resolvido = saindo.has(item.chave);
    const partes = [item.tipo === 'aprovacao' ? ENTITY_TAG[item.aprovacao.entity] : null, detalheDo(item)].filter(Boolean);
    const icone ='h-8 w-8 inline-flex items-center justify-center rounded-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40';
    return (
        <li className="central-recolhe" data-saindo={resolvido}>
            {/* O padding mora DENTRO do recorte: no próprio filho da grade ele
                impediria a linha de recolher até zero. */}
            <div><div className="flex items-center gap-3 py-2.5">
                {item.tipo === 'alerta' && (
                    <span
                        className={`w-2 h-2 rounded-full shrink-0 ${item.alerta.severity === 'HIGH' ? 'bg-red-500' : item.alerta.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-gray-400'}`}
                        aria-label={item.alerta.severity === 'HIGH' ? 'Alta prioridade' : item.alerta.severity === 'MEDIUM' ? 'Média prioridade' : 'Baixa prioridade'}
                        role="img"
                    />
                )}
                {item.tipo === 'tarefa' && (
                    <button type="button" onClick={() => onConcluirTarefa(item.tarefa.id)} disabled={resolvido} aria-label={`Concluir tarefa ${item.tarefa.title}`} title="Concluir tarefa"
                        className={`${icone} -ml-1.5 ${resolvido ? 'text-white' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                        {/* Resolvida: o círculo enche de verde na hora, antes de a linha recolher. */}
                        <CircleCheck className={`w-4 h-4 transition-colors duration-150 ${resolvido ? 'fill-emerald-500' : 'fill-transparent'}`} aria-hidden="true" />
                    </button>
                )}
                <button type="button" onClick={() => onNavigate(destinoDo(item))}
                    className="flex-1 min-w-0 text-left rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
                    <span className="block text-sm text-gray-900 truncate">{tituloDo(item)}</span>
                    {/* O detalhe encolhe; o prazo nunca é cortado (é o que diz a urgência). */}
                    <span className="flex text-xs text-gray-500 min-w-0">
                        {partes.length > 0 && <span className="truncate">{partes.join(' · ')}</span>}
                        {prazo && <span className={`shrink-0 whitespace-nowrap ${TOM_PRAZO[prazo.tom]}`}>{partes.length > 0 ? ' · ' : ''}{prazo.texto}</span>}
                    </span>
                </button>
                {item.valor != null && item.valor !== 0 && (
                    <span className="text-sm font-medium text-gray-800 tabular-nums shrink-0">{fBRL(item.valor)}</span>
                )}
                {item.tipo === 'aprovacao' && (
                    <span className="flex items-center gap-0.5 shrink-0">
                        <button type="button" onClick={() => onAprovar(item.aprovacao)} disabled={resolvido} aria-label={`Aprovar ${tituloDo(item)}`} title="Aprovar"
                            className={`${icone} text-emerald-600 hover:bg-emerald-50`}>
                            <Check className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => onRejeitar(item.aprovacao)} disabled={resolvido} aria-label={`Rejeitar ${tituloDo(item)}`} title="Rejeitar"
                            className={`${icone} text-red-500 hover:bg-red-50`}>
                            <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                    </span>
                )}
            </div></div>
        </li>
    );
}

export default MinhaFila;
