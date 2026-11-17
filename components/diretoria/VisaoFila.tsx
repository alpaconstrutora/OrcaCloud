/**
 * Diretoria (ÒPURA CEO) — visão "Fila de exceções" (versão A do protótipo de 17/11/2026).
 * Uma fila só, por gravidade (Pede decisão → Atenção → Acompanhar), com o que está fora do
 * trilho em todos os módulos; ao lado, as determinações em aberto.
 *
 * Toolbar acoplada (§5.2): busca e dois filtros rápidos de escolha única em popover (§5.4),
 * Área e Tipo, todos persistidos (§3). A busca ignora caixa e acento e olha o que a linha mostra
 * (título, detalhe, tipo, responsável, organização). As opções vêm do catálogo (`AREAS`, `TIPOS`), não só do que está na
 * tela — recorte vazio diz que está vazio. Tipo silenciado não aparece como opção (ele não tem
 * linha na tela); se o recorte gravado ficou silenciado, vale "Todos".
 */
import React from 'react';
import { CheckCircle2, Gavel, Inbox, Search } from 'lucide-react';
import { FilterPopover, type FilterPopoverOption } from '../ui/FilterPopover';
import { normalizarTexto } from '../ui/FilterUtils';
import { usePersistedState } from '../ui/TableUtils';
import {
    AREAS, SEVERIDADES, TIPOS, colunaDaDeterminacao, detalheDoGrupo, nomeDe, ordenarPorGravidade, tituloDoGrupo,
    type Area, type GrupoExcecao, type Severidade, type TipoExcecao,
} from '../../utils/diretoria';
import { useDiretoria } from './DiretoriaContexto';
import { GrupoExcecaoLinha } from './GrupoExcecao';
import { DeterminacaoCartao } from './DeterminacaoCartao';
import { COR_SEVERIDADE, LINK_ACAO, plural } from './diretoriaUi';

/** "Tarefa vencida" não tem área (o responsável é sempre o do dado): ganha uma opção própria. */
type FiltroArea = '' | Area | 'equipe';
const AREA_DO_TIPO = (t: TipoExcecao): Exclude<FiltroArea, ''> => TIPOS[t].area ?? 'equipe';

const OPCOES_AREA: FilterPopoverOption<FiltroArea>[] = [
    { value: '', label: 'Todas' },
    ...(Object.entries(AREAS) as [Area, string][]).map(([value, label]) => ({ value, label })),
    { value: 'equipe', label: 'Tarefas de equipe' },
];

const ORDEM_SEVERIDADE = (Object.keys(SEVERIDADES) as Severidade[])
    .sort((a, b) => SEVERIDADES[a].ordem - SEVERIDADES[b].ordem);

export const VisaoFila: React.FC = () => {
    const d = useDiretoria();
    const [areaSalva, setArea] = usePersistedState<FiltroArea>('diretoria:fila:area', '');
    const [tipoSalvo, setTipo] = usePersistedState<TipoExcecao | ''>('diretoria:fila:tipo', '');
    const [busca, setBusca] = usePersistedState<string>('diretoria:fila:busca', '');
    const area: FiltroArea = OPCOES_AREA.some(o => o.value === areaSalva) ? areaSalva : '';
    const tipo: TipoExcecao | '' = tipoSalvo && tipoSalvo in TIPOS && !d.silenciados.includes(tipoSalvo) ? tipoSalvo : '';

    const opcoesTipo = React.useMemo<FilterPopoverOption<TipoExcecao | ''>[]>(() => [
        { value: '', label: 'Todos' },
        ...(Object.keys(TIPOS) as TipoExcecao[])
            .filter(t => !d.silenciados.includes(t))
            .map(t => ({ value: t, label: TIPOS[t].nome })),
    ], [d.silenciados]);

    const { painel, mostrarOrg, nomeDaOrg } = d;
    const lista = React.useMemo(() => {
        const termo = normalizarTexto(busca);
        const texto = (g: GrupoExcecao) => normalizarTexto([
            tituloDoGrupo(g), detalheDoGrupo(g), TIPOS[g.tipo].nome,
            ...g.responsaveis.map(r => nomeDe(r, painel.pessoas)),
            mostrarOrg ? nomeDaOrg(g.org_id) : '',
        ].join(' '));
        return ordenarPorGravidade(d.excecoes).filter(g =>
            (!area || AREA_DO_TIPO(g.tipo) === area) && (!tipo || g.tipo === tipo) && (!termo || texto(g).includes(termo)));
    }, [d.excecoes, area, tipo, busca, painel.pessoas, mostrarOrg, nomeDaOrg]);
    const porSeveridade = React.useMemo(() => {
        const m = new Map<Severidade, GrupoExcecao[]>();
        for (const g of lista) m.set(g.severidade, [...(m.get(g.severidade) ?? []), g]);
        return m;
    }, [lista]);
    const itens = lista.reduce((s, g) => s + g.quantidade, 0);
    const recortado = !!area || !!tipo || !!busca.trim();

    const abertas = React.useMemo(() => d.painel.determinacoes
        .filter(x => x.status !== 'concluida')
        .sort((a, b) => a.prazo.localeCompare(b.prazo)), [d.painel.determinacoes]);
    const vencidas = abertas.filter(x => colunaDaDeterminacao(x, d.painel.hoje) === 'vencidas').length;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            {/* §5.2 — toolbar e lista no mesmo card; a linha entre os dois é o border-b da toolbar */}
            <section aria-label="Fila de exceções" className="xl:col-span-2 min-w-0 bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-gray-100 flex flex-wrap items-center gap-2.5">
                    <div className="relative flex-1 min-w-[12rem]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                        <input type="search" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar na fila"
                            placeholder="Buscar por tipo, conta, responsável…"
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                    </div>
                    <FilterPopover<FiltroArea> label="Área" value={area} onChange={setArea} options={OPCOES_AREA} />
                    <FilterPopover<TipoExcecao | ''> label="Tipo" value={tipo} onChange={setTipo} options={opcoesTipo} />
                    <span className="ml-auto px-2 text-sm text-gray-600 tabular-nums">
                        {plural(lista.length, 'grupo', 'grupos')} · {plural(itens, 'item', 'itens')}
                    </span>
                </div>

                {lista.length === 0 ? (
                    // §12 — dentro do card acoplado, sem moldura própria
                    <div className="text-center py-12 px-4">
                        {recortado
                            ? <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" aria-hidden="true" />
                            : <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-4" aria-hidden="true" />}
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{recortado ? 'Nada neste recorte' : 'Nada fora do trilho'}</h3>
                        <p className="text-sm text-gray-500">
                            {recortado
                                ? 'Nenhum grupo com esta busca, área ou tipo.'
                                : d.silenciados.length
                                    ? 'O que não está silenciado está em dia nas telas de origem.'
                                    : 'Contas, parcelas, extrato, aprovações, contratos, entregas, documentos, férias e tarefas estão em dia.'}
                        </p>
                        {recortado && (
                            <button type="button" onClick={() => { setArea(''); setTipo(''); setBusca(''); }} className={`${LINK_ACAO} mt-3`}>
                                Limpar filtros
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-200">
                    {ORDEM_SEVERIDADE.map(sev => {
                        const grupos = porSeveridade.get(sev) ?? [];
                        if (!grupos.length) return null;
                        const idTitulo = `diretoria-fila-${sev}`;
                        return (
                            <section key={sev} aria-labelledby={idTitulo}>
                                {/* separador de grupo no vocabulário do §6.12 (não é cabeçalho de tabela) */}
                                <h2 id={idTitulo} className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-800">
                                    <span aria-hidden="true" className={`w-2 h-2 rounded-full ${COR_SEVERIDADE[sev]}`} />
                                    {SEVERIDADES[sev].nome}
                                    <span className="text-xs font-medium bg-slate-200 text-slate-700 rounded-[6px] px-1.5 tabular-nums">{grupos.length}</span>
                                </h2>
                                <ul className="divide-y divide-gray-100">
                                    {grupos.map(g => <GrupoExcecaoLinha key={g.chave} g={g} />)}
                                </ul>
                            </section>
                        );
                    })}
                    </div>
                )}
            </section>

            <aside aria-labelledby="diretoria-fila-determinacoes" className="min-w-0 bg-white rounded-[10px] border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                    <h2 id="diretoria-fila-determinacoes" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Gavel className="w-4 h-4 text-blue-600" aria-hidden="true" /> Determinações em aberto
                    </h2>
                    <span className="text-xs text-gray-500">
                        {abertas.length}{vencidas > 0 && <span className="text-red-700"> · {plural(vencidas, 'vencida', 'vencidas')}</span>}
                    </span>
                </div>
                {abertas.length ? (
                    <div className="p-3 space-y-2">
                        {abertas.map(x => <DeterminacaoCartao key={x.id} d={x} />)}
                    </div>
                ) : (
                    <p className="px-4 py-6 text-sm text-gray-500 text-center">
                        Nenhuma determinação em aberto. Use "Virar determinação" num grupo, ou "Nova determinação".
                    </p>
                )}
            </aside>
        </div>
    );
};

export default VisaoFila;
