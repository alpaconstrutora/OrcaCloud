/**
 * Diretoria (ÒPURA CEO) — visão "Reunião da semana" (versão C do protótipo de 17/11/2026).
 * A tela é o ritual: à esquerda a PRÉVIA do resumo da semana (a pauta), à direita o quadro de
 * determinações (Vencidas · Abertas · Em andamento · Concluídas) com o formulário de nova
 * determinação em cima.
 *
 * O resumo tem quatro blocos: 1. pede decisão (grupos críticos), 2. determinações vencidas e as
 * que vencem nesta semana, 3. melhorou × piorou desde a semana passada (liga quando o resumo
 * semanal gravar a primeira foto — procure `RESUMO-SEMANAL: comparação`), 4. o resto em números.
 */
import React from 'react';
import { CalendarDays, Gavel, Mail, Send } from 'lucide-react';
import {
    TIPOS, brl, colunaDaDeterminacao, compararSemanas, dataBr, diasAte, nomeDe, ordenarPorGravidade, semanaDe, tituloDoGrupo,
    type ColunaDeterminacao, type TipoExcecao,
} from '../../utils/diretoria';
import { useDiretoria } from './DiretoriaContexto';
import { DeterminacaoCartao } from './DeterminacaoCartao';
import { DeterminacaoForm } from './DeterminacaoForm';
import { BOTAO_SECUNDARIO, plural, quandoEmDias } from './diretoriaUi';

const COLUNAS: { id: ColunaDeterminacao; titulo: string; cor: string; vazio: string }[] = [
    { id: 'vencidas', titulo: 'Vencidas', cor: 'bg-red-500', vazio: 'Nenhuma vencida.' },
    { id: 'abertas', titulo: 'Abertas', cor: 'bg-gray-400', vazio: 'Nenhuma aberta sem andamento.' },
    { id: 'andamento', titulo: 'Em andamento', cor: 'bg-blue-500', vazio: 'Nenhuma em andamento.' },
    { id: 'concluidas', titulo: 'Concluídas', cor: 'bg-emerald-500', vazio: 'Nenhuma concluída.' },
];

const ddmm = (iso: string) => dataBr(iso).slice(0, 5);

// RESUMO-SEMANAL: comparação
/**
 * Bloco 3 do resumo — "melhorou × piorou desde a semana passada": a quantidade de agora × a foto
 * da segunda passada (`painel.semana_anterior`), com a MESMA conta do e-mail (`compararSemanas`, no
 * catálogo compartilhado). Silenciado fica fora dos dois lados. Menos é melhor em todos.
 */
const ComparacaoSemanal: React.FC<{ vencidasAgora: number }> = ({ vencidasAgora }) => {
    const { painel, excecoes, silenciados } = useDiretoria();
    if (!painel.semana_anterior) {
        return <p className="text-gray-500">A comparação começa depois da primeira foto da semana, tirada toda segunda às 07:00.</p>;
    }
    const linhas = compararSemanas(excecoes, painel.semana_anterior, new Set(silenciados), vencidasAgora);
    return (
        <ul className="space-y-1">
            {linhas.map(l => (
                <li key={l.rotulo} className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]">
                    <span className="tabular-nums">{`${l.rotulo}: ${l.antes} → ${l.agora}`}</span>
                    <span className={l.veredito === 'melhorou' ? 'text-emerald-700' : l.veredito === 'piorou' ? 'text-red-700' : 'text-gray-500'}>{l.veredito}</span>
                </li>
            ))}
        </ul>
    );
};

/** Receber o resumo toda segunda e mandar uma prévia agora — preferência da pessoa, não da organização. */
const ResumoPorEmail: React.FC = () => {
    const d = useDiretoria();
    const [enviando, setEnviando] = React.useState(false);
    return (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={d.resumoSemanal}
                    onChange={e => d.alternarResumoSemanal(e.target.checked)} />
                <Mail className="w-4 h-4 text-gray-500" aria-hidden="true" />
                Receber este resumo por e-mail toda segunda às 07:00
            </label>
            <button type="button" className={BOTAO_SECUNDARIO} disabled={enviando}
                title={enviando ? 'Enviando a prévia…' : 'Manda agora o resumo desta semana só para o seu e-mail'}
                onClick={async () => { setEnviando(true); try { await d.enviarPrevia(); } finally { setEnviando(false); } }}>
                <Send className="w-[15px] h-[15px]" aria-hidden="true" /> Enviar uma prévia para mim agora
            </button>
        </div>
    );
};

export const VisaoReuniao: React.FC = () => {
    const d = useDiretoria();
    const { painel, excecoes } = d;
    const hoje = painel.hoje;
    const semana = semanaDe(hoje);

    const criticos = React.useMemo(() => ordenarPorGravidade(excecoes.filter(g => g.severidade === 'critico')), [excecoes]);
    const abertas = painel.determinacoes.filter(x => x.status !== 'concluida');
    const vencidas = abertas.filter(x => diasAte(x.prazo, hoje) < 0).sort((a, b) => a.prazo.localeCompare(b.prazo));
    const nestaSemana = abertas.filter(x => x.prazo >= hoje && x.prazo <= semana.fim).sort((a, b) => a.prazo.localeCompare(b.prazo));

    const porTipo = React.useMemo(() => {
        const m = new Map<TipoExcecao, { grupos: number; itens: number; valor: number }>();
        for (const g of excecoes) {
            if (g.severidade === 'critico') continue; // já estão no bloco 1 — igual ao e-mail
            const t = m.get(g.tipo) ?? { grupos: 0, itens: 0, valor: 0 };
            m.set(g.tipo, { grupos: t.grupos + 1, itens: t.itens + g.quantidade, valor: t.valor + (g.valor ?? 0) });
        }
        return [...m].sort((a, b) => b[1].itens - a[1].itens);
    }, [excecoes]);

    const colunas = React.useMemo(() => {
        const m = new Map<ColunaDeterminacao, typeof painel.determinacoes>();
        for (const x of painel.determinacoes) {
            const c = colunaDaDeterminacao(x, hoje);
            m.set(c, [...(m.get(c) ?? []), x]);
        }
        for (const [c, xs] of m) {
            xs.sort((a, b) => c === 'concluidas'
                ? (b.concluida_em ?? '').localeCompare(a.concluida_em ?? '')
                : a.prazo.localeCompare(b.prazo));
        }
        return m;
    }, [painel.determinacoes, hoje]);

    const nomes = (ids: string[]) => ids.map(r => nomeDe(r, painel.pessoas)).join(', ') || 'sem responsável';

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)] gap-6 items-start">
            <article aria-labelledby="diretoria-resumo-titulo" className="min-w-0 bg-white rounded-[10px] border border-gray-100 shadow-sm">
                <header className="px-5 py-4 border-b border-gray-100">
                    <p className="flex items-center gap-2 text-xs text-gray-500">
                        <CalendarDays className="w-4 h-4" aria-hidden="true" /> Prévia do resumo da semana — a pauta da reunião
                    </p>
                    <h2 id="diretoria-resumo-titulo" className="mt-1 text-base font-semibold text-gray-900 [text-wrap:balance]">
                        Semana {semana.numero} ({ddmm(semana.inicio)}–{ddmm(semana.fim)}): {plural(criticos.length, 'pede decisão', 'pedem decisão')},{' '}
                        {plural(vencidas.length, 'determinação vencida', 'determinações vencidas')}
                    </h2>
                    <ResumoPorEmail />
                </header>

                <div className="px-5 py-4 space-y-6 text-sm text-gray-800">
                    <section aria-labelledby="diretoria-resumo-1" className="space-y-2">
                        <h3 id="diretoria-resumo-1" className="font-semibold text-gray-900">1. Pede decisão</h3>
                        {criticos.length ? (
                            <ul className="space-y-2">
                                {criticos.map(g => (
                                    <li key={g.chave} className="[overflow-wrap:anywhere]">
                                        <button type="button" onClick={() => d.navegar(TIPOS[g.tipo].tela)} title={`Abrir em ${TIPOS[g.tipo].telaNome}`}
                                            className="text-left text-blue-700 hover:text-blue-900 hover:underline rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                            {tituloDoGrupo(g)}
                                        </button>
                                        {g.valor != null && g.valor > 0 && <span className="font-medium text-gray-800 tabular-nums"> — {brl(g.valor)}</span>}
                                        <span className="text-gray-500">
                                            {' '}({nomes(g.responsaveis)}{g.dias != null ? `, ${quandoEmDias(g.dias)}` : ''}{d.mostrarOrg ? ` · ${d.nomeDaOrg(g.org_id)}` : ''})
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-gray-500">Nada pede decisão nesta semana.</p>}
                    </section>

                    <section aria-labelledby="diretoria-resumo-2" className="space-y-2">
                        <h3 id="diretoria-resumo-2" className="font-semibold text-gray-900">2. Determinações</h3>
                        {vencidas.length || nestaSemana.length ? (
                            <ul className="space-y-2">
                                {vencidas.map(x => (
                                    <li key={x.id} className="[overflow-wrap:anywhere]">
                                        <span className="font-medium text-red-700">Vencida:</span> {x.titulo}
                                        <span className="text-gray-500"> — {nomeDe(x.responsavel_user_id, painel.pessoas)}, prazo {dataBr(x.prazo)}</span>
                                    </li>
                                ))}
                                {nestaSemana.map(x => (
                                    <li key={x.id} className="[overflow-wrap:anywhere]">
                                        <span className="font-medium text-amber-700">Vence {ddmm(x.prazo)}:</span> {x.titulo}
                                        <span className="text-gray-500"> — {nomeDe(x.responsavel_user_id, painel.pessoas)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-gray-500">Nenhuma vencida nem vencendo nesta semana.</p>}
                    </section>

                    <section aria-labelledby="diretoria-resumo-3" className="space-y-2">
                        <h3 id="diretoria-resumo-3" className="font-semibold text-gray-900">3. Melhorou × piorou desde a semana passada</h3>
                        <ComparacaoSemanal vencidasAgora={vencidas.length} />
                    </section>

                    <section aria-labelledby="diretoria-resumo-4" className="space-y-2">
                        <h3 id="diretoria-resumo-4" className="font-semibold text-gray-900">4. O resto, em números</h3>
                        {porTipo.length ? (
                            <ul className="divide-y divide-gray-100 border-y border-gray-100">
                                {porTipo.map(([t, n]) => (
                                    <li key={t} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
                                        <span className="text-gray-700" title={`Regra: ${TIPOS[t].regra}`}>{TIPOS[t].nome}</span>
                                        <span className="text-gray-600 tabular-nums whitespace-nowrap">
                                            {plural(n.itens, 'item', 'itens')}
                                            {n.valor > 0 && <span className="font-medium text-gray-800"> · {brl(n.valor)}</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-gray-500">Nada fora do trilho.</p>}
                    </section>

                    <p className="text-xs text-gray-500">
                        Para tirar um tipo deste resumo, marque-o como barulho num grupo (ele volta em "Silenciados").
                    </p>
                </div>
            </article>

            <section aria-label="Determinações" className="min-w-0 space-y-3">
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                        <Gavel className="w-4 h-4 text-blue-600" aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-gray-900">Nova determinação</h2>
                    </div>
                    <DeterminacaoForm orgId={d.orgDoTopo} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {COLUNAS.map(c => {
                        const itens = colunas.get(c.id) ?? [];
                        const id = `diretoria-quadro-${c.id}`;
                        return (
                            <section key={c.id} aria-labelledby={id} className="min-w-0 bg-gray-50 rounded-[10px] border border-gray-100 p-2 space-y-2 min-h-[120px]">
                                <h3 id={id} className="flex items-center gap-2 px-1 pt-0.5 text-sm font-semibold text-gray-800">
                                    <span aria-hidden="true" className={`w-2 h-2 rounded-full ${c.cor}`} />
                                    {c.titulo}
                                    <span className="font-normal text-gray-500 tabular-nums">{itens.length}</span>
                                </h3>
                                {itens.length
                                    ? itens.map(x => <DeterminacaoCartao key={x.id} d={x} />)
                                    : <p className="px-1 pb-1 text-xs text-gray-500">{c.vazio}</p>}
                            </section>
                        );
                    })}
                </div>
            </section>
        </div>
    );
};

export default VisaoReuniao;
