import React from 'react';
import { FileText, FilePen, FileCheck2, CalendarClock, SlidersHorizontal, X } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { KpiCard } from '../ui/KpiCard';
import { FilterPopover } from '../ui/FilterPopover';
import { usePersistedState } from '../ui/TableUtils';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import type { DocGenDocumento, DocGenDocumentoStatus, DocGenModelo } from '../../types/docGen';
import { ROTULO_TIPO } from '../../services/docGen/destinatario';
import { dataCurta, hojeIso } from '../../services/docGen/dataExtenso';
import { formatarDataHora } from './rotulos';
import { SITUACOES_EM_CURSO } from '../../services/docGenDocumentoService';
import { ROTULO_SITUACAO } from '../../services/docGen/tramitacao';
import { useStore } from '../../store/useStore';
import { nomesPorIds } from '../../services/docGen/resolverContexto';
import {
    aplicarFiltros, contarFiltrosAtivos, opcoesDosFiltros, FILTROS_VAZIOS,
    type FiltrosOficio, type OpcaoDeFiltro,
} from '../../services/docGen/filtrosOficios';

/**
 * Documentos › Ofícios › aba Ofícios (F2). KPIs da situação, filtro de
 * situação em popover (§5.4), tabela padrão (§6.10). Clicar na linha abre
 * o ofício (§9.1); a coluna de ações só tem a exclusão do rascunho.
 *
 * Pesquisa avançada (item 30, 10/10/2026): botão "Filtros" abre o painel do §5.2 abaixo da
 * toolbar com período, emitente, obra, empreendimento, departamento, autor e assinante —
 * cada um uma lista com os valores que existem nos ofícios (§5.5), nunca digitação.
 */
export type FiltroSituacao = '' | 'RASCUNHO' | 'EM_APROVACAO' | 'EMITIDO' | 'AGUARDANDO' | 'CONCLUIDOS';

const OPCOES_SITUACAO: { value: FiltroSituacao; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'RASCUNHO', label: 'Em elaboração' },
    { value: 'EM_APROVACAO', label: 'Em aprovação' },
    { value: 'EMITIDO', label: 'Emitidos (em curso)' },
    { value: 'AGUARDANDO', label: 'Aguardando resposta' },
    { value: 'CONCLUIDOS', label: 'Respondidos / encerrados / cancelados' },
];

const COR_STATUS: Record<DocGenDocumentoStatus, string> = {
    RASCUNHO: 'text-gray-600',
    EMITIDO: 'text-green-700',
    ENVIADO: 'text-green-700',
    RECEBIDO: 'text-green-700',
    RESPONDIDO: 'text-emerald-700',
    ENCERRADO: 'text-slate-600',
    CANCELADO: 'text-red-600',
};

/** Rótulo da situação — o rascunho mostra também a aprovação. */
function situacaoDe(d: DocGenDocumento): { label: string; className: string } {
    if (d.status === 'RASCUNHO' && d.approval_status === 'PENDENTE') return { label: 'Em aprovação', className: 'text-amber-700' };
    if (d.status === 'RASCUNHO' && d.approval_status === 'APROVADO') return { label: 'Aprovado (a emitir)', className: 'text-blue-700' };
    if (d.status === 'RASCUNHO' && d.approval_status === 'REJEITADO') return { label: 'Rejeitado', className: 'text-red-600' };
    return { label: ROTULO_SITUACAO[d.status], className: COR_STATUS[d.status] };
}

// Soma alvo ≈ 1.180 px (memória: soma das larguras ≤ ~1270 px com a sidebar aberta).
const COLUMNS: StandardTableColumn[] = [
    { key: 'numero', label: 'Número', sortable: true, width: 140 },
    { key: 'assunto', label: 'Assunto', sortable: true, width: 270 },
    { key: 'destinatario', label: 'Destinatário', sortable: true, width: 220 },
    { key: 'modelo', label: 'Modelo', sortable: true, width: 170 },
    { key: 'status', label: 'Situação', sortable: true, width: 150 },
    { key: 'resposta', label: 'Resposta até', sortable: true, width: 110 },
    { key: 'updated_at', label: 'Atualizado em', sortable: true, width: 140 },
];

/** "Aguardando resposta": emitido, ainda em curso (não respondido/encerrado/cancelado) e com prazo. */
const aguardando = (d: DocGenDocumento) => !!d.resposta_esperada_ate && SITUACOES_EM_CURSO.includes(d.status);

const SEL = 'h-9 pl-3 pr-8 max-w-[240px] bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60';
const SEL_ATIVO = 'h-9 pl-3 pr-8 max-w-[240px] bg-blue-50 border border-blue-300 rounded-[6px] text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer';
const DATA = 'h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

/** Lista de escolha de um filtro; sem nenhum valor nos ofícios, fica desligada e diz por quê. */
function SelectDeFiltro({ id, todos, vazio, opcoes, value, onChange }: {
    id: string; todos: string; vazio: string; opcoes: OpcaoDeFiltro[]; value: string; onChange: (v: string) => void;
}) {
    const semOpcao = opcoes.length === 0 && !value;
    return (
        <select id={id} aria-label={todos} value={value} onChange={e => onChange(e.target.value)} disabled={semOpcao}
            title={semOpcao ? vazio : undefined} className={value ? SEL_ATIVO : SEL}>
            <option value="">{todos}</option>
            {opcoes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

interface Props {
    documentos: DocGenDocumento[];
    modelos: DocGenModelo[];
    /** Nome do departamento por id (`useDepartamentosDaOrg`, já carregado pelo módulo). */
    nomeDepartamento: Record<string, string>;
    loading: boolean;
    onAbrir: (d: DocGenDocumento) => void;
    onExcluir: (d: DocGenDocumento) => void;
}

export default function OficiosList({ documentos, modelos, nomeDepartamento, loading, onAbrir, onExcluir }: Props) {
    const [situacao, setSituacao] = usePersistedState<FiltroSituacao>('oficios:situacao', '');
    const [filtros, setFiltros] = usePersistedState<FiltrosOficio>('oficios:filtros', FILTROS_VAZIOS);
    const ativos = contarFiltrosAtivos(filtros);
    const [painelAberto, setPainelAberto] = React.useState(ativos > 0);
    const setFiltro = (k: keyof FiltrosOficio, v: string) => setFiltros(prev => ({ ...prev, [k]: v }));

    // Nomes para as opções: o store primeiro; o que faltar (empreendimento sempre, empresa e
    // obra fora do store quando o topo está em "Todas") é lido pelos ids dos ofícios.
    const organizations = useStore(s => s.organizations);
    const companies = useStore(s => s.companies);
    const projects = useStore(s => s.projects);
    const [nomesLidos, setNomesLidos] = React.useState<{ empreendimento: Record<string, string>; empresa: Record<string, string>; obra: Record<string, string> }>({ empreendimento: {}, empresa: {}, obra: {} });
    const doStore = React.useMemo(() => {
        const organizacao: Record<string, string> = {}, empresa: Record<string, string> = {}, obra: Record<string, string> = {}, usuario: Record<string, string> = {};
        for (const o of organizations) {
            organizacao[o.id] = o.name;
            for (const m of o.members ?? []) if (m.email && m.name) usuario[m.email.toLowerCase()] = m.name;
        }
        for (const c of companies) empresa[c.id] = c.nome_fantasia || c.razao_social;
        for (const p of projects) if (p.id) obra[p.id] = p.name;
        return { organizacao, empresa, obra, usuario };
    }, [organizations, companies, projects]);
    const faltando = React.useMemo(() => ({
        empreendimentos: [...new Set(documentos.map(d => d.empreendimento_id).filter((x): x is string => !!x))].sort(),
        empresas: [...new Set(documentos.map(d => d.company_id).filter((x): x is string => !!x && !doStore.empresa[x]))].sort(),
        obras: [...new Set(documentos.map(d => d.project_id).filter((x): x is string => !!x && !doStore.obra[x]))].sort(),
    }), [documentos, doStore]);
    const chaveFaltando = JSON.stringify(faltando);
    React.useEffect(() => {
        let vivo = true;
        if (!faltando.empreendimentos.length && !faltando.empresas.length && !faltando.obras.length) return;
        nomesPorIds(faltando).then(n => { if (vivo) setNomesLidos(n); }).catch(() => {});
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chaveFaltando]);
    const opcoes = React.useMemo(() => opcoesDosFiltros(documentos, {
        organizacao: doStore.organizacao,
        empresa: { ...nomesLidos.empresa, ...doStore.empresa },
        obra: { ...nomesLidos.obra, ...doStore.obra },
        empreendimento: nomesLidos.empreendimento,
        departamento: nomeDepartamento,
        usuario: doStore.usuario,
    }), [documentos, doStore, nomesLidos, nomeDepartamento]);
    const nomeModelo = React.useMemo(() => {
        const m: Record<string, string> = {};
        for (const x of modelos) m[x.id] = x.nome;
        return m;
    }, [modelos]);

    const hoje = hojeIso();
    const mes = hoje.slice(0, 7);
    const kpis = React.useMemo(() => ({
        rascunhos: documentos.filter(d => d.status === 'RASCUNHO').length,
        emitidosMes: documentos.filter(d => d.status !== 'CANCELADO' && (d.emitido_em ?? '').slice(0, 7) === mes).length,
        aguardando: documentos.filter(aguardando).length,
        vencidos: documentos.filter(d => aguardando(d) && (d.resposta_esperada_ate ?? '') < hoje).length,
    }), [documentos, mes, hoje]);

    // Array estável (§6.7): o recorte de escopo vem de fora da tabela.
    const linhas = React.useMemo(() => {
        const porSituacao = (() => {
            if (situacao === 'AGUARDANDO') return documentos.filter(aguardando);
            if (situacao === 'EM_APROVACAO') return documentos.filter(d => d.status === 'RASCUNHO' && d.approval_status === 'PENDENTE');
            if (situacao === 'EMITIDO') return documentos.filter(d => SITUACOES_EM_CURSO.includes(d.status));
            if (situacao === 'CONCLUIDOS') return documentos.filter(d => ['RESPONDIDO', 'ENCERRADO', 'CANCELADO'].includes(d.status));
            if (situacao) return documentos.filter(d => d.status === situacao);
            return documentos;
        })();
        return aplicarFiltros(porSituacao, filtros);
    }, [documentos, situacao, filtros]);

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Em elaboração" value={kpis.rascunhos} icon={<FilePen className="w-4 h-4" />} color="gray" />
                <KpiCard label="Emitidos no mês" value={kpis.emitidosMes} icon={<FileCheck2 className="w-4 h-4" />} color="emerald" />
                <KpiCard label="Aguardando resposta" value={kpis.aguardando} icon={<CalendarClock className="w-4 h-4" />} color="blue" />
                <KpiCard label="Prazo de resposta vencido" value={kpis.vencidos} icon={<CalendarClock className="w-4 h-4" />} color={kpis.vencidos ? 'red' : 'gray'} />
            </div>

            <StandardTable<DocGenDocumento>
                storageKey="oficios:documentos"
                columns={COLUMNS}
                rows={linhas}
                rowKey={d => d.id}
                loading={loading}
                searchText={d => `${d.numero ?? ''} ${d.assunto} ${d.destinatario_snapshot?.razao_social ?? ''} ${nomeModelo[d.modelo_id] ?? ''}`}
                searchPlaceholder="Buscar por número, assunto, destinatário ou modelo..."
                filters={<>
                    <FilterPopover<FiltroSituacao> label="Situação" value={situacao} onChange={setSituacao} options={OPCOES_SITUACAO} />
                    <button
                        type="button"
                        onClick={() => setPainelAberto(v => !v)}
                        aria-expanded={painelAberto}
                        title="Período, emitente, obra, empreendimento, departamento, autor e assinante"
                        className={`h-9 flex items-center gap-1.5 px-3 rounded-[6px] text-sm font-medium border transition-all whitespace-nowrap shrink-0 ${
                            painelAberto || ativos ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Filtros
                        {ativos > 0 && <span className="ml-0.5 bg-blue-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">{ativos}</span>}
                    </button>
                </>}
                filtersPanel={painelAberto && (
                    <div className="flex items-center gap-2 flex-wrap bg-gray-50 border border-gray-200 rounded-[10px] p-4">
                        <div className="flex items-center gap-1.5">
                            <label htmlFor="oficios-filtro-de" className="text-sm font-medium text-gray-500">Data do ofício de</label>
                            <input id="oficios-filtro-de" type="date" value={filtros.de} onChange={e => setFiltro('de', e.target.value)} className={DATA} />
                            <label htmlFor="oficios-filtro-ate" className="text-sm font-medium text-gray-500">até</label>
                            <input id="oficios-filtro-ate" type="date" value={filtros.ate} onChange={e => setFiltro('ate', e.target.value)} className={DATA} />
                        </div>
                        <SelectDeFiltro id="oficios-filtro-emitente" todos="Todos os emitentes" vazio="Nenhum ofício na lista" opcoes={opcoes.emitente} value={filtros.emitente} onChange={v => setFiltro('emitente', v)} />
                        <SelectDeFiltro id="oficios-filtro-obra" todos="Todas as obras" vazio="Nenhum ofício tem obra vinculada" opcoes={opcoes.obra} value={filtros.obra} onChange={v => setFiltro('obra', v)} />
                        <SelectDeFiltro id="oficios-filtro-empreendimento" todos="Todos os empreendimentos" vazio="Nenhum ofício tem empreendimento vinculado" opcoes={opcoes.empreendimento} value={filtros.empreendimento} onChange={v => setFiltro('empreendimento', v)} />
                        <SelectDeFiltro id="oficios-filtro-departamento" todos="Todos os departamentos" vazio="Nenhum ofício tem departamento" opcoes={opcoes.departamento} value={filtros.departamento} onChange={v => setFiltro('departamento', v)} />
                        <SelectDeFiltro id="oficios-filtro-autor" todos="Todos os autores" vazio="Nenhum ofício na lista" opcoes={opcoes.autor} value={filtros.autor} onChange={v => setFiltro('autor', v)} />
                        <SelectDeFiltro id="oficios-filtro-assinante" todos="Todos os assinantes" vazio="Nenhum ofício tem signatário" opcoes={opcoes.assinante} value={filtros.assinante} onChange={v => setFiltro('assinante', v)} />
                        {ativos > 0 && (
                            <button type="button" onClick={() => setFiltros(FILTROS_VAZIOS)} className="h-9 flex items-center gap-1 px-2 text-sm font-medium text-gray-500 hover:text-red-600 whitespace-nowrap shrink-0">
                                <X className="w-3.5 h-3.5" /> Limpar filtros
                            </button>
                        )}
                    </div>
                )}
                sortValue={(key, d) => {
                    switch (key) {
                        case 'numero': return d.numero ?? '';
                        case 'assunto': return d.assunto;
                        case 'destinatario': return d.destinatario_snapshot?.razao_social ?? '';
                        case 'modelo': return nomeModelo[d.modelo_id] ?? '';
                        case 'status': return situacaoDe(d).label;
                        case 'resposta': return d.resposta_esperada_ate ?? '';
                        case 'updated_at': return d.updated_at;
                        default: return null;
                    }
                }}
                onRowClick={onAbrir}
                renderCell={(key, d) => {
                    switch (key) {
                        case 'numero':
                            return d.numero
                                ? <span className="text-sm font-normal text-gray-700">{d.numero}</span>
                                : <span className="text-sm font-normal text-gray-400" title="O número é atribuído na emissão">—</span>;
                        case 'assunto':
                            return d.assunto
                                ? <span className="block truncate text-sm font-normal text-gray-700" title={d.assunto}>{d.assunto}</span>
                                : <span className="text-sm font-normal text-gray-400">Sem assunto</span>;
                        case 'destinatario': {
                            const s = d.destinatario_snapshot;
                            return s ? (
                                <span className="block min-w-0">
                                    <span className="block truncate text-sm font-normal text-gray-700" title={s.razao_social}>{s.razao_social}</span>
                                    <span className="block truncate text-xs text-gray-400">{ROTULO_TIPO[s.tipo]}</span>
                                </span>
                            ) : <span className="text-sm font-normal text-gray-400">—</span>;
                        }
                        case 'modelo':
                            return <span className="block truncate text-sm font-normal text-gray-700" title={nomeModelo[d.modelo_id]}>{nomeModelo[d.modelo_id] ?? '—'}</span>;
                        case 'status': {
                            const s = situacaoDe(d);
                            return <span className={`block truncate text-sm font-normal ${s.className}`} title={s.label}>{s.label}</span>;
                        }
                        case 'resposta': {
                            if (!d.resposta_esperada_ate) return <span className="text-sm font-normal text-gray-400">—</span>;
                            const vencido = d.resposta_esperada_ate < hoje && SITUACOES_EM_CURSO.includes(d.status);
                            return <span className={`text-sm font-normal ${vencido ? 'text-red-600' : 'text-gray-600'}`} title={vencido ? 'Prazo vencido' : undefined}>{dataCurta(d.resposta_esperada_ate)}</span>;
                        }
                        case 'updated_at':
                            return <span className="text-sm font-normal text-gray-600">{formatarDataHora(d.updated_at)}</span>;
                        default:
                            return null;
                    }
                }}
                actions={{
                    width: 80,
                    render: d => (
                        <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                            <InlineDisclosureMenu
                                showDelete
                                onDelete={() => onExcluir(d)}
                                deleteDisabled={d.status !== 'RASCUNHO'}
                                deleteDisabledTitle={d.status !== 'RASCUNHO' ? 'Documento emitido não se exclui' : undefined}
                            />
                        </div>
                    ),
                }}
                empty={{
                    icon: <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: documentos.length ? (ativos ? 'Nenhum ofício com estes filtros' : 'Nenhum ofício nesta situação') : 'Nenhum ofício ainda',
                    subtitle: documentos.length ? 'Troque a situação, os filtros ou a busca.' : 'Comece por "Novo ofício": escolha o modelo, o destinatário e redija.',
                }}
            />
        </div>
    );
}
