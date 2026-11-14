import React from 'react';
import { Banknote, CalendarX2, ClipboardList, Clock, Flame, ShieldAlert } from 'lucide-react';
import type { ProjectRisk, RiskAction, RiskFase, RiskMatrixConfig } from '../../types/risk';
import { RISK_ROTULO } from '../../types/risk';
import { pontuacaoVigente } from '../../utils/riskScoring';
import {
    acoesEmAtraso, distribuicao, exposicao, nivelNaOrg, principaisRiscos, recortarRiscos,
    type ContextoRecorte, type RecorteRisco,
} from '../../utils/riskPainel';
import { KpiCard } from '../ui/KpiCard';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { formatDateBR, formatMoney } from '../ui/Format';
import { NivelTexto } from './riscosUi';

/**
 * Aba Painel (F1.9). Cada número é o tamanho da MESMA lista que o clique abre
 * (CA11): `recortarRiscos(...).length` → aba Registro com o recorte;
 * `acoesEmAtraso(...).length` → aba Ações com "Em atraso". Não há uma segunda conta.
 *
 * KPIs = `KpiCard` §4 (painel de leitura, cor semântica por indicador). A
 * distribuição por fase e por categoria é TABELA (§28.1: "comparar magnitude entre
 * itens nomeados" com poucos itens e o número exato importando — a tabela já é a
 * vista que um gráfico precisaria ter ao lado).
 */
interface Props {
    riscos: ProjectRisk[];
    acoes: RiskAction[];
    ctx: ContextoRecorte;
    faixasPorOrg: Record<string, RiskMatrixConfig>;
    carregando: boolean;
    rotuloEscopo: (r: ProjectRisk) => string;
    nomeCategoria: (id: string | null) => string;
    onRecorte: (recorte: RecorteRisco) => void;
    onAcoesEmAtraso: () => void;
    onAbrir: (r: ProjectRisk) => void;
}

const COLS_TOP: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 100 },
    { key: 'titulo', label: 'Título', sortable: true, width: 300 },
    { key: 'escopo', label: 'Escopo / obra', sortable: true, width: 220 },
    { key: 'nivel', label: 'Nível', sortable: true, width: 150 },
    { key: 'pontuacao', label: 'Pontuação vigente', sortable: true, width: 150, align: 'right' },
    { key: 'revisao', label: 'Próxima revisão', sortable: true, width: 140 },
];
const COLS_DIST: StandardTableColumn[] = [
    { key: 'nome', label: 'Nome', sortable: true, width: 260 },
    { key: 'total', label: 'Ativos', sortable: true, width: 100, align: 'right' },
    { key: 'criticos', label: 'Críticos', sortable: true, width: 100, align: 'right' },
];

type LinhaDist = { chave: string | null; nome: string; total: number; criticos: number };

export const RiscosPainel: React.FC<Props> = ({
    riscos, acoes, ctx, faixasPorOrg, carregando, rotuloEscopo, nomeCategoria, onRecorte, onAcoesEmAtraso, onAbrir,
}) => {
    const ativos = React.useMemo(() => recortarRiscos(riscos, 'ativos', ctx), [riscos, ctx]);
    const criticos = React.useMemo(() => recortarRiscos(riscos, 'criticos', ctx), [riscos, ctx]);
    const semPlano = React.useMemo(() => recortarRiscos(riscos, 'sem_plano', ctx), [riscos, ctx]);
    const revisoes = React.useMemo(() => recortarRiscos(riscos, 'revisao_vencida', ctx), [riscos, ctx]);
    const atrasadas = React.useMemo(() => acoesEmAtraso(acoes, ctx.hoje), [acoes, ctx.hoje]);
    const exp = React.useMemo(() => exposicao(riscos), [riscos]);
    const top = React.useMemo(() => principaisRiscos(riscos, 10), [riscos]);

    const porFase = React.useMemo<LinhaDist[]>(() => distribuicao(riscos, r => r.fase, faixasPorOrg)
        .map(d => ({ ...d, nome: d.chave ? RISK_ROTULO.fase[d.chave as RiskFase] : 'Sem fase' })), [riscos, faixasPorOrg]);
    const porCategoria = React.useMemo<LinhaDist[]>(() => distribuicao(riscos, r => r.category_id, faixasPorOrg)
        .map(d => ({ ...d, nome: d.chave ? nomeCategoria(d.chave) : 'Sem categoria' })), [riscos, faixasPorOrg, nomeCategoria]);

    const v = (n: number) => (carregando ? '…' : n);

    const tabelaDist = (chave: string, titulo: string, linhas: LinhaDist[]) => (
        <section className="space-y-3" aria-labelledby={`dist-${chave}`}>
            <h2 id={`dist-${chave}`} className="text-base font-semibold text-gray-900">{titulo}</h2>
            <StandardTable<LinhaDist>
                storageKey={`riscos:painel:${chave}`}
                columns={COLS_DIST}
                rows={linhas}
                rowKey={l => l.chave ?? '∅'}
                loading={carregando}
                // Sem busca de propósito: no máximo 25 linhas (as categorias), lidas de uma vez.
                defaultSort={{ column: 'total', direction: 'desc' }}
                sortValue={(k, l) => (k === 'total' ? l.total : k === 'criticos' ? l.criticos : l.nome)}
                renderCell={(k, l) => k === 'nome'
                    ? <span className="block truncate text-sm font-normal text-gray-700" title={l.nome}>{l.nome}</span>
                    : k === 'total'
                        ? <span className="text-sm font-normal text-gray-700">{l.total}</span>
                        : <span className={`text-sm font-normal ${l.criticos ? 'text-red-700' : 'text-gray-600'}`}>{l.criticos}</span>}
                empty={{ title: 'Nenhum risco ativo', subtitle: 'A distribuição aparece quando houver riscos ativos.' }}
            />
        </section>
    );

    return (
        <div className="space-y-6">
            {/* §20.1: TabsBar já dá os 12px até aqui; depois dos KPIs a pergunta muda (lista), então 24px do space-y-6. */}
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <KpiCard label="Riscos ativos" value={v(ativos.length)} icon={<ShieldAlert className="w-4 h-4" />} color="blue"
                    sub="não encerrados nem materializados" onClick={() => onRecorte('ativos')} title="Ver os riscos ativos na aba Registro" />
                <KpiCard label="Críticos" value={v(criticos.length)} icon={<Flame className="w-4 h-4" />} color="red"
                    sub="ativos, gatilho incluso" onClick={() => onRecorte('criticos')} title="Ver os riscos críticos na aba Registro" />
                <KpiCard label="Sem plano de ação" value={v(semPlano.length)} icon={<ClipboardList className="w-4 h-4" />} color="amber"
                    sub="ativos sem ação não cancelada" onClick={() => onRecorte('sem_plano')} title="Ver os riscos sem plano na aba Registro" />
                <KpiCard label="Tratamentos em atraso" value={v(atrasadas.length)} icon={<Clock className="w-4 h-4" />} color="orange"
                    sub="planejada ou em andamento, prazo vencido" onClick={onAcoesEmAtraso} title="Ver as ações em atraso na aba Ações" />
                <KpiCard label="Exposição" value={carregando ? '…' : formatMoney(exp.total)} icon={<Banknote className="w-4 h-4" />} color="purple"
                    sub={`valor esperado de ${exp.comValor} de ${ativos.length} ativos`} onClick={() => onRecorte('ativos')} title="Soma do valor esperado (probabilidade % × perda) dos riscos ativos" />
                <KpiCard label="Revisões vencidas" value={v(revisoes.length)} icon={<CalendarX2 className="w-4 h-4" />} color="rose"
                    sub="ativos com a revisão atrasada" onClick={() => onRecorte('revisao_vencida')} title="Ver os riscos com revisão vencida na aba Registro" />
            </div>

            <section className="space-y-3" aria-labelledby="painel-top">
                <h2 id="painel-top" className="text-base font-semibold text-gray-900">
                    Os 10 principais riscos<span className="font-normal text-gray-500"> · gatilho crítico primeiro, depois a maior pontuação vigente</span>
                </h2>
                <StandardTable<ProjectRisk>
                    storageKey="riscos:painel:top10"
                    columns={COLS_TOP}
                    rows={top}
                    rowKey={r => r.id}
                    loading={carregando}
                    // Sem busca de propósito: são no máximo 10 linhas.
                    onRowClick={onAbrir}
                    rowLabel={r => `${r.codigo}: ${r.titulo}. Abrir a ficha`}
                    sortValue={(k, r) => k === 'codigo' ? r.numero : k === 'titulo' ? r.titulo : k === 'escopo' ? rotuloEscopo(r)
                        : k === 'nivel' ? (r.gatilho_critico ? 100 : 0) + (pontuacaoVigente(r) ?? -1)
                        : k === 'pontuacao' ? pontuacaoVigente(r) ?? -1 : r.proxima_revisao}
                    renderCell={(k, r) => {
                        switch (k) {
                            case 'codigo': return <span className="whitespace-nowrap text-sm font-normal text-gray-600">{r.codigo}</span>;
                            case 'titulo': return <span className="block truncate text-sm font-normal text-gray-700" title={r.titulo}>{r.titulo}</span>;
                            case 'escopo': { const t = rotuloEscopo(r); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                            case 'nivel': return <NivelTexto nivel={nivelNaOrg(r, faixasPorOrg)} gatilho={r.gatilho_critico} />;
                            case 'pontuacao': return <span className="text-sm font-normal text-gray-600">{pontuacaoVigente(r) ?? '—'}</span>;
                            case 'revisao': {
                                const vencida = r.proxima_revisao < ctx.hoje;
                                return <span className={`text-sm font-normal ${vencida ? 'text-red-700' : 'text-gray-600'}`}>{formatDateBR(r.proxima_revisao)}{vencida ? ' · vencida' : ''}</span>;
                            }
                            default: return null;
                        }
                    }}
                    empty={{ icon: <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum risco ativo', subtitle: 'Os principais riscos aparecem aqui assim que houver risco registrado.' }}
                />
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {tabelaDist('fase', 'Riscos ativos por fase', porFase)}
                {tabelaDist('categoria', 'Riscos ativos por categoria', porCategoria)}
            </div>
        </div>
    );
};

export default RiscosPainel;
