/**
 * Diretoria (ÒPURA CEO) — a linha de UM grupo de exceções (tipo · organização · responsáveis ·
 * gravidade), usada na fila e na visão por responsável. Plano: docs/planos/2026-11-17-opura-ceo.md.
 *
 * A unidade é o grupo, não o item: 694 contas vencidas viram uma linha com quantidade, valor e
 * o item mais antigo; o chevron abre os até 20 itens que o banco manda (os maiores ou mais antigos).
 *
 * Ações (§9: dominante em texto azul, as outras em `ActionIconButton`; desligado diz o motivo
 * num `<span title>` em volta, §9.2):
 *  - **Cobrar** — tarefa na agenda de cada responsável; depois mostra "cobrado em dd/mm".
 *  - **Virar determinação** — abre o formulário com o título e a organização DO GRUPO.
 *  - **É barulho** — tira o TIPO da tela, só para quem clicou. É preferência pessoal, não grava
 *    nada na organização: não depende de `pode_editar`.
 */
import React from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, Gavel, Megaphone, VolumeX } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import {
    AREAS, SEVERIDADES, TIPOS, brl, dataBr, detalheDoGrupo, nomeDe, tituloDoGrupo, ultimaCobranca,
    type GrupoExcecao as Grupo,
} from '../../utils/diretoria';
import { MOTIVO_SEM_EDICAO_DIRETORIA } from '../../utils/permissaoDiretoria';
import { useDiretoria } from './DiretoriaContexto';
import { COR_SEVERIDADE, LINK_ACAO, MOTIVO_SEM_RESPONSAVEL, dataCurta, plural, quandoEmDias } from './diretoriaUi';

/** Bolinha + nome da gravidade para leitor de tela (a cor nunca é o único sinal). */
export const BolinhaGravidade: React.FC<{ severidade: Grupo['severidade']; className?: string }> = ({ severidade, className = '' }) => (
    <>
        <span aria-hidden="true" title={SEVERIDADES[severidade].nome}
            className={`w-2 h-2 rounded-full shrink-0 ${COR_SEVERIDADE[severidade]} ${className}`} />
        <span className="sr-only">{SEVERIDADES[severidade].nome}</span>
    </>
);

export const GrupoExcecaoLinha: React.FC<{ g: Grupo }> = ({ g }) => {
    const d = useDiretoria();
    const [aberto, setAberto] = React.useState(false);
    const [cobrando, setCobrando] = React.useState(false);
    const idTitulo = React.useId();
    const idItens = React.useId();

    const def = TIPOS[g.tipo];
    const titulo = tituloDoGrupo(g);
    const detalhe = detalheDoGrupo(g);
    const podeEditar = d.podeEditarOrg(g.org_id);
    const cobranca = ultimaCobranca(g.chave, d.painel.cobrancas);
    const nomes = g.responsaveis.map(r => nomeDe(r, d.painel.pessoas)).join(', ');
    const motivoCobrar = !podeEditar ? MOTIVO_SEM_EDICAO_DIRETORIA : g.responsaveis.length === 0 ? MOTIVO_SEM_RESPONSAVEL : null;
    const motivoDeterminar = !podeEditar ? MOTIVO_SEM_EDICAO_DIRETORIA : null;

    const cobrar = async () => {
        setCobrando(true);
        try { await d.cobrar(g); } finally { setCobrando(false); }
    };

    return (
        <li aria-labelledby={idTitulo} className="px-4 py-3">
            <div className="flex items-start gap-2">
                {/* §6.13 — o botão de abrir fica na 1ª coluna, nome fixo; o estado é o aria-expanded */}
                <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto} aria-controls={idItens}
                    aria-label={`Detalhes de ${titulo}`} title={aberto ? 'Esconder os itens' : 'Ver os itens'}
                    className="mt-px flex items-center justify-center h-6 w-6 shrink-0 rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${aberto ? 'rotate-90' : ''}`} aria-hidden="true" />
                </button>
                <BolinhaGravidade severidade={g.severidade} className="mt-[9px]" />

                <div className="flex-1 min-w-0 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 basis-56">
                        <p id={idTitulo} className="text-sm font-medium text-gray-900">{titulo}</p>
                        {detalhe && <p className="text-sm text-gray-600 mt-0.5">{detalhe}</p>}
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                            <span title={`Regra: ${def.regra}`}>{def.nome}</span>
                            {d.mostrarOrg && <span>{d.nomeDaOrg(g.org_id)}</span>}
                            {g.origem_responsavel === 'nenhum' ? (
                                <button type="button" onClick={d.abrirCadastro}
                                    title="Abre o cadastro de responsáveis por área"
                                    className="font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                                    Sem responsável — cadastrar
                                </button>
                            ) : (
                                <span>
                                    {nomes}
                                    <span className="text-gray-500">
                                        {g.origem_responsavel === 'dado'
                                            ? ' · pelo dado'
                                            : ` · responsável da área ${def.area ? AREAS[def.area] : ''}`.trimEnd()}
                                    </span>
                                </span>
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {cobranca ? (
                            <span className="inline-flex items-center gap-1 h-8 px-2 text-sm text-emerald-700 whitespace-nowrap"
                                title={`Cobrado por ${nomeDe(cobranca.cobrado_por, d.painel.pessoas)}; a tarefa foi para a agenda de ${nomes || 'ninguém'}.`}>
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> cobrado em {dataCurta(cobranca.cobrado_em)}
                            </span>
                        ) : (
                            <span className="inline-flex" title={motivoCobrar ?? `Cria uma tarefa para ${nomes}, com prazo de 2 dias.`}>
                                <button type="button" onClick={() => void cobrar()} disabled={!!motivoCobrar || cobrando} className={LINK_ACAO}>
                                    <Megaphone className="w-4 h-4" aria-hidden="true" /> {cobrando ? 'Cobrando…' : 'Cobrar'}
                                </button>
                            </span>
                        )}
                        <span className="inline-flex" title={motivoDeterminar ?? undefined}>
                            <ActionIconButton kind="edit" title="Virar determinação" icon={<Gavel className="w-4 h-4" />}
                                disabled={!!motivoDeterminar} onClick={() => d.virarDeterminacao(g)} />
                        </span>
                        <ActionIconButton kind="edit" icon={<VolumeX className="w-4 h-4" />}
                            aria-label={`É barulho: ${def.nome}`}
                            title={`É barulho — tira "${def.nome}" da sua tela (só para você; reative em "Silenciados"). Regra: ${def.regra}`}
                            onClick={() => d.silenciar(g.tipo)} />
                    </div>
                </div>
            </div>

            <div id={idItens} hidden={!aberto} className="mt-3 ml-8 sm:ml-12 rounded-[10px] border border-gray-100 bg-white overflow-hidden">
                {g.itens.length > 0 ? (
                    <ul className="divide-y divide-gray-100">
                        {g.itens.map(i => (
                            <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
                                <span className="min-w-0 flex-1 text-gray-700 [overflow-wrap:anywhere]">{i.titulo}</span>
                                <span className="flex items-baseline gap-3 shrink-0">
                                    {i.valor != null && <span className="font-medium text-gray-800 tabular-nums">{brl(i.valor)}</span>}
                                    {i.dias != null && (
                                        <span className="text-gray-600 whitespace-nowrap" title={i.data ? dataBr(i.data) : undefined}>{quandoEmDias(i.dias)}</span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="px-3 py-2 text-sm text-gray-500">O banco não mandou os itens deste grupo.</p>
                )}
                {g.quantidade > g.itens.length && (
                    <p className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
                        Mostrando {g.itens.length} de {plural(g.quantidade, 'item', 'itens')} — os maiores ou mais antigos. A lista inteira está na tela de origem.
                    </p>
                )}
                <div className="px-3 py-2 border-t border-gray-100">
                    <button type="button" onClick={() => d.navegar(def.tela)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        Abrir em {def.telaNome} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </li>
    );
};

export default GrupoExcecaoLinha;
