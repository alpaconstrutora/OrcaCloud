/**
 * Diretoria (ÒPURA CEO) — visão "Por responsável" (versão B do protótipo de 17/11/2026).
 * A hierarquia é a tela: à esquerda "Quem responde a quem", cada pessoa com o que está fora do
 * trilho nela E na equipe abaixo (`resumoPorPessoa`); à direita, a pessoa escolhida — os grupos
 * dela, "Cobrar tudo", as determinações e o formulário de nova determinação para ela.
 *
 * A árvore é um `role="tree"` plano (cada nó com `aria-level`), com foco itinerante: Tab entra
 * uma vez, ↑/↓/Home/End andam e a escolha acompanha o foco. Grupos sem ninguém para cobrar
 * ganham o nó "Sem responsável", que leva ao cadastro.
 */
import React from 'react';
import { AlertTriangle, Gavel, ListChecks, Megaphone, Network, Users } from 'lucide-react';
import {
    arvore, equipe, nomeDe, ordenarPorGravidade, resumoPorPessoa, ultimaCobranca,
    type NoDaArvore,
} from '../../utils/diretoria';
import { MOTIVO_SEM_EDICAO_DIRETORIA } from '../../utils/permissaoDiretoria';
import { useConfirm } from '../ui/confirm';
import { useDiretoria } from './DiretoriaContexto';
import { GrupoExcecaoLinha } from './GrupoExcecao';
import { DeterminacaoCartao } from './DeterminacaoCartao';
import { DeterminacaoForm } from './DeterminacaoForm';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, plural } from './diretoriaUi';

/** Nó especial: os grupos que não têm ninguém para cobrar. */
const SEM_RESPONSAVEL = '__sem_responsavel__';

interface NoPlano { id: string; nivel: number }

function aplanar(nos: NoDaArvore[], nivel = 0, saida: NoPlano[] = []): NoPlano[] {
    for (const n of nos) {
        saida.push({ id: n.userId, nivel });
        aplanar(n.filhos, nivel + 1, saida);
    }
    return saida;
}

/** Contador da árvore: chip `rounded-[6px]` (contagem, não status — §19.5), com o que conta no `title` e para leitor de tela. */
const Contador: React.FC<{ n: number; rotulo: string; tom: 'neutro' | 'alerta' }> = ({ n, rotulo, tom }) => (
    <span title={rotulo}
        className={`text-xs font-medium tabular-nums rounded-[6px] px-1.5 py-0.5 ${tom === 'alerta' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
        <span className="sr-only">{rotulo}: </span>{n}
    </span>
);

export const VisaoPorResponsavel: React.FC = () => {
    const d = useDiretoria();
    const confirm = useConfirm();
    const { painel, excecoes, chefes } = d;
    const hoje = painel.hoje;
    const [escolhida, setEscolhida] = React.useState<string | null>(null);
    const [comEquipe, setComEquipe] = React.useState(true);
    const [cobrando, setCobrando] = React.useState(false);
    const refs = React.useRef(new Map<string, HTMLDivElement>());

    const semResponsavel = React.useMemo(() => excecoes.filter(g => g.origem_responsavel === 'nenhum'), [excecoes]);
    const nos = React.useMemo(() => {
        const ids = [...painel.pessoas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(p => p.user_id);
        const plano = aplanar(arvore(ids, chefes));
        return semResponsavel.length ? [...plano, { id: SEM_RESPONSAVEL, nivel: 0 }] : plano;
    }, [painel.pessoas, chefes, semResponsavel.length]);

    const sel = escolhida && nos.some(n => n.id === escolhida) ? escolhida : (nos[0]?.id ?? null);
    const ehSem = sel === SEM_RESPONSAVEL;
    const pessoa = !ehSem && sel ? painel.pessoas.find(p => p.user_id === sel) ?? null : null;

    const ids = React.useMemo(() => new Set(sel && !ehSem ? (comEquipe ? equipe(sel, chefes) : [sel]) : []), [sel, ehSem, comEquipe, chefes]);
    const grupos = React.useMemo(() => ordenarPorGravidade(ehSem
        ? semResponsavel
        : excecoes.filter(g => g.responsaveis.some(r => ids.has(r)))), [ehSem, semResponsavel, excecoes, ids]);
    const determinacoes = React.useMemo(() => painel.determinacoes
        .filter(x => ids.has(x.responsavel_user_id))
        .sort((a, b) => Number(a.status === 'concluida') - Number(b.status === 'concluida') || a.prazo.localeCompare(b.prazo)),
    [painel.determinacoes, ids]);
    const tamanhoEquipe = sel && !ehSem ? equipe(sel, chefes).length - 1 : 0;

    const aCobrar = grupos.filter(g => !ultimaCobranca(g.chave, painel.cobrancas) && g.responsaveis.length > 0 && d.podeEditarOrg(g.org_id));
    const motivoCobrarTudo = aCobrar.length
        ? null
        : grupos.some(g => !d.podeEditarOrg(g.org_id))
            ? MOTIVO_SEM_EDICAO_DIRETORIA
            : 'Nada a cobrar: os grupos desta pessoa já foram cobrados nos últimos 14 dias.';

    const cobrarTudo = async () => {
        const ok = await confirm({
            title: `Cobrar ${plural(aCobrar.length, 'grupo', 'grupos')}?`,
            message: 'Cria uma tarefa na agenda de cada responsável, com prazo de 2 dias. Quem já tem cobrança aberta do mesmo grupo não recebe outra.',
            variant: 'default',
            confirmLabel: 'Cobrar',
        });
        if (!ok) return;
        setCobrando(true);
        try { await d.cobrarTodos(aCobrar); } finally { setCobrando(false); }
    };

    const mover = (e: React.KeyboardEvent, indice: number) => {
        let alvo = -1;
        if (e.key === 'ArrowDown') alvo = Math.min(nos.length - 1, indice + 1);
        else if (e.key === 'ArrowUp') alvo = Math.max(0, indice - 1);
        else if (e.key === 'Home') alvo = 0;
        else if (e.key === 'End') alvo = nos.length - 1;
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEscolhida(nos[indice].id); return; }
        if (alvo < 0) return;
        e.preventDefault();
        const id = nos[alvo].id;
        setEscolhida(id);
        refs.current.get(id)?.focus();
    };

    const semHierarquia = painel.hierarquia.length === 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 items-start">
            <section aria-labelledby="diretoria-arvore-titulo" className="min-w-0 bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                    <Network className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    <h2 id="diretoria-arvore-titulo" className="text-sm font-semibold text-gray-900">Quem responde a quem</h2>
                </div>
                {semHierarquia && (
                    <div className="px-4 py-3 border-b border-gray-100 bg-amber-50/60 space-y-2">
                        <p className="text-sm text-amber-800">
                            Ninguém cadastrou quem responde a quem ainda: cada pessoa aparece sozinha, sem a equipe dela.
                        </p>
                        <span className="inline-flex" title={d.podeEditarAlguma ? undefined : MOTIVO_SEM_EDICAO_DIRETORIA}>
                            <button type="button" onClick={d.abrirCadastro} disabled={!d.podeEditarAlguma} className={BOTAO_SECUNDARIO}>
                                <Users className="w-[15px] h-[15px]" aria-hidden="true" /> Cadastrar a hierarquia
                            </button>
                        </span>
                    </div>
                )}
                {nos.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-500 text-center">Nenhuma pessoa com conta nas organizações do painel.</p>
                ) : (
                    <div role="tree" aria-labelledby="diretoria-arvore-titulo" className="py-1">
                        {nos.map((n, i) => {
                            const ativo = n.id === sel;
                            const props = {
                                ref: (el: HTMLDivElement | null) => { if (el) refs.current.set(n.id, el); else refs.current.delete(n.id); },
                                role: 'treeitem' as const,
                                'aria-level': n.nivel + 1,
                                'aria-selected': ativo,
                                tabIndex: ativo ? 0 : -1,
                                onClick: () => setEscolhida(n.id),
                                onKeyDown: (e: React.KeyboardEvent) => mover(e, i),
                                style: { paddingLeft: 12 + n.nivel * 20 },
                                className: `flex items-center gap-3 pr-3 py-2 cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${ativo ? 'bg-blue-50' : 'hover:bg-gray-50'}`,
                            };
                            if (n.id === SEM_RESPONSAVEL) {
                                const criticos = semResponsavel.filter(g => g.severidade === 'critico').length;
                                return (
                                    <div key={n.id} {...props} className={`${props.className} border-t border-gray-100 mt-1`}>
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden="true">
                                            <AlertTriangle className="w-4 h-4" />
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className={`block text-sm truncate ${ativo ? 'text-blue-700 font-medium' : 'text-gray-900'}`}>Sem responsável</span>
                                            <span className="block text-xs text-gray-500 truncate">grupos sem ninguém para cobrar</span>
                                        </span>
                                        {criticos > 0 && <Contador n={criticos} rotulo="Pedem decisão" tom="alerta" />}
                                        <Contador n={semResponsavel.length} rotulo="Fora do trilho" tom="neutro" />
                                    </div>
                                );
                            }
                            const p = painel.pessoas.find(x => x.user_id === n.id);
                            const r = resumoPorPessoa(n.id, excecoes, painel.determinacoes, chefes, hoje, true);
                            const nome = p?.nome ?? nomeDe(n.id, painel.pessoas);
                            return (
                                <div key={n.id} {...props}>
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${ativo ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white'}`} aria-hidden="true">
                                        {nome.trim().charAt(0).toUpperCase()}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className={`block text-sm truncate ${ativo ? 'text-blue-700 font-medium' : 'text-gray-900'}`} title={nome}>{nome}</span>
                                        {p?.cargo && <span className="block text-xs text-gray-500 truncate" title={p.cargo}>{p.cargo}</span>}
                                    </span>
                                    {r.criticos > 0 && <Contador n={r.criticos} rotulo="Pedem decisão (com a equipe)" tom="alerta" />}
                                    <Contador n={r.total} rotulo="Fora do trilho (com a equipe)" tom="neutro" />
                                    {r.determinacoesVencidas > 0 && (
                                        <span className="text-xs font-medium text-red-700 whitespace-nowrap" title="Determinações vencidas (com a equipe)">
                                            {r.determinacoesVencidas} venc.<span className="sr-only"> determinações vencidas</span>
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                <p className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
                    O número de cada pessoa soma o dela e o da equipe abaixo. Vermelho = pede decisão.
                </p>
            </section>

            <section aria-label="Detalhe da pessoa" className="min-w-0 space-y-4">
                {sel && (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                        <div className="flex-1 min-w-[12rem]">
                            <h2 className="text-base font-semibold text-gray-900">{ehSem ? 'Sem responsável' : pessoa?.nome ?? nomeDe(sel, painel.pessoas)}</h2>
                            <p className="text-sm text-gray-500">
                                {ehSem
                                    ? 'O dado não aponta pessoa e a área não tem responsável cadastrado.'
                                    : [pessoa?.cargo, chefes.get(sel) ? `responde a ${nomeDe(chefes.get(sel), painel.pessoas)}` : null].filter(Boolean).join(' · ') || 'Sem cargo cadastrado'}
                            </p>
                        </div>
                        {ehSem ? (
                            <span className="inline-flex" title={d.podeEditarAlguma ? undefined : MOTIVO_SEM_EDICAO_DIRETORIA}>
                                <button type="button" onClick={d.abrirCadastro} disabled={!d.podeEditarAlguma} className={BOTAO_PRIMARIO}>
                                    <Users className="w-[15px] h-[15px]" aria-hidden="true" /> Cadastrar responsáveis
                                </button>
                            </span>
                        ) : (
                            <>
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                                    <input type="checkbox" checked={comEquipe} onChange={e => setComEquipe(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                    incluir a equipe abaixo ({tamanhoEquipe})
                                </label>
                                <span className="inline-flex" title={motivoCobrarTudo ?? 'Cobrar cada grupo ainda não cobrado'}>
                                    <button type="button" onClick={() => void cobrarTudo()} disabled={!!motivoCobrarTudo || cobrando} className={BOTAO_PRIMARIO}>
                                        <Megaphone className="w-[15px] h-[15px]" aria-hidden="true" /> {cobrando ? 'Cobrando…' : `Cobrar tudo (${aCobrar.length})`}
                                    </button>
                                </span>
                            </>
                        )}
                    </div>
                )}

                {sel && (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                            <ListChecks className="w-4 h-4 text-blue-600" aria-hidden="true" />
                            <h3 className="text-sm font-semibold text-gray-900">Fora do trilho</h3>
                            <span className="text-xs text-gray-500 tabular-nums">{grupos.length}</span>
                        </div>
                        {grupos.length ? (
                            <ul className="divide-y divide-gray-100">
                                {grupos.map(g => <GrupoExcecaoLinha key={g.chave} g={g} />)}
                            </ul>
                        ) : (
                            <p className="px-4 py-6 text-sm text-gray-500 text-center">Nada fora do trilho{comEquipe && !ehSem ? ' nesta pessoa nem na equipe' : ''}.</p>
                        )}
                    </div>
                )}

                {sel && !ehSem && (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                            <Gavel className="w-4 h-4 text-blue-600" aria-hidden="true" />
                            <h3 className="text-sm font-semibold text-gray-900">Determinações</h3>
                            <span className="text-xs text-gray-500 tabular-nums">{determinacoes.length}</span>
                        </div>
                        {determinacoes.length > 0 && (
                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                {determinacoes.map(x => <DeterminacaoCartao key={x.id} d={x} semResponsavel={!comEquipe} />)}
                            </div>
                        )}
                        <div className={`p-4 space-y-3 ${determinacoes.length ? 'border-t border-gray-100' : ''}`}>
                            <h4 className="text-sm font-semibold text-gray-700">Nova determinação para {pessoa?.nome ?? nomeDe(sel, painel.pessoas)}</h4>
                            <DeterminacaoForm key={sel} orgId={d.orgDoTopo} responsavelFixo={sel} />
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

export default VisaoPorResponsavel;
