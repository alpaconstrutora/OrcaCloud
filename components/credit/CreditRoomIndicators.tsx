import React from 'react';
import { AlertTriangle, Building2, Calculator, CalendarClock, Home, Landmark, Percent, Scale, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { formatMoney, formatDateBR } from '../ui/Format';
import { KpiStrip, PortalCard } from '../portal/PortalKit';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { explicarIndicador, type IndicadorKey, type TermoProveniencia } from '../../utils/creditRoomProvenance';
import type { CreditRoomVersion } from '../../types/creditRoom';
import { ELIGIBLE_FLOW_PT, type CreditRoomEligibleFlows } from '../../utils/creditRoomSnapshot';

/**
 * Os números de uma VERSÃO congelada do Credit Room — a Home do PRD (§104).
 *
 * Compartilhado entre o módulo interno e o portal do credor (§24: um
 * componente, prop `accent`; nunca duplicar). Lê SÓ o snapshot/indicators da
 * versão — nunca o dado vivo — e é isso que faz o banco e a empresa olharem
 * para o mesmo número.
 *
 * "—" é dado ausente (`null`), nunca zero. Ver utils/creditRoomSnapshot.ts.
 */

interface Props {
    version: CreditRoomVersion;
    accent?: 'indigo' | 'portal';
}

const pct = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const vezes = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
const money = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v));

const porFormato = (t: { valor: number | null; formato: TermoProveniencia['formato'] }) => {
    if (t.valor == null) return '—';
    if (t.formato === 'money') return formatMoney(t.valor);
    if (t.formato === 'pct') return pct(t.valor);
    if (t.formato === 'vezes') return vezes(t.valor);
    return t.valor.toLocaleString('pt-BR');
};

/**
 * O painel do §96: de onde saiu o número. Fica num Sheet e não num tooltip
 * porque a lista de termos com fonte e as ressalvas não cabem num balão — e
 * ressalva que não cabe é ressalva que não é lida.
 */
const PainelProveniencia: React.FC<{
    aberto: boolean; onClose: () => void;
    version: CreditRoomVersion; chave: IndicadorKey | null;
}> = ({ aberto, onClose, version, chave }) => {
    const p = chave ? explicarIndicador(chave, version.snapshot, version.indicators) : null;
    return (
        <Sheet open={aberto} onClose={onClose} size="xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{p ? p.titulo : 'Indicador'}</SheetTitle>
                <SheetDescription>{p ? p.significado : ''}</SheetDescription>
            </SheetHeader>
            <SheetPanel>
                {p && (
                    <div className="space-y-5">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1.5">Como é calculado</p>
                            <p className="text-sm font-normal text-gray-700 bg-gray-50 border border-gray-100 rounded-[8px] px-4 py-3">
                                {p.formula}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1.5">De onde vem cada termo</p>
                            <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                                <table className="w-full">
                                    <tbody className="divide-y divide-gray-50">
                                        {p.termos.map(t => (
                                            <tr key={t.rotulo}>
                                                <td className="px-4 py-2.5 align-top">
                                                    <p className="text-sm font-medium text-gray-800">{t.rotulo}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">{t.fonte}</p>
                                                    {t.obs && <p className="text-xs text-gray-400 mt-0.5">{t.obs}</p>}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-800 whitespace-nowrap align-top">
                                                    {porFormato(t)}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-50/70">
                                            <td className="px-4 py-2.5 text-sm font-semibold text-gray-800">Resultado</td>
                                            <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-800 whitespace-nowrap">
                                                {porFormato(p.resultado)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {p.ressalvas.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-slate-500 mb-1.5">O que muda a leitura</p>
                                <ul className="space-y-1.5">
                                    {p.ressalvas.map((r, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                                            <span>{r}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <p className="text-xs text-gray-400">
                            Tudo aqui sai da versão V{version.versionNo}, congelada em{' '}
                            {formatDateBR(version.dataBase)} — não do dado de hoje. É por isso que a
                            conta fecha com o número mostrado ao lado.
                        </p>
                    </div>
                )}
            </SheetPanel>
        </Sheet>
    );
};

const CreditRoomIndicators: React.FC<Props> = ({ version, accent = 'indigo' }) => {
    const s = version.snapshot;
    const i = version.indicators;
    const op = s.operacao;

    // §96: cada KPI carrega a chave da própria explicação. Sem isso, o clique
    // teria de adivinhar o indicador pelo rótulo — e rótulo é texto de tela,
    // que muda.
    const [explicando, setExplicando] = React.useState<IndicadorKey | null>(null);

    const linha1: { label: string; value: string; hint?: string; chave: IndicadorKey }[] = [
        { label: 'Valor solicitado', value: money(op.requested_amount), hint: op.modality ?? undefined, chave: 'divida_pos' },
        { label: 'LTV (pós-operação)', value: pct(i.ltv_pos), hint: i.ltv_atual == null ? 'sem garantia avaliada' : `atual ${pct(i.ltv_atual)}`, chave: 'ltv_pos' },
        { label: 'LTC (pós-operação)', value: pct(i.ltc_pos), hint: i.custo_total == null ? 'sem orçamento da obra' : `atual ${pct(i.ltc_atual)}`, chave: 'ltc_pos' },
        { label: 'DSCR (pós-operação)', value: vezes(i.dscr_pos), hint: i.dscr_atual == null ? 'sem fluxo elegível' : `atual ${vezes(i.dscr_atual)}`, chave: 'dscr_pos' },
        { label: 'Equity aportado', value: pct(i.equity_pct), hint: `${money(op.equity_contributed)} de ${money(op.equity_committed)}`, chave: 'equity_pct' },
    ];

    const ausentes = i.fontes_ausentes ?? [];

    const blocos = [
        {
            key: 'obra', titulo: 'Obra', icon: <Building2 className="w-4 h-4" />,
            linhas: s.obra ? [
                ['Orçado', money(s.obra.orcado)],
                ['Contratado', money(s.obra.contratado_custo)],
                ['Pago', money(s.obra.pago)],
                ['A pagar', money(s.obra.a_pagar)],
                ['Avanço físico', pct(s.obra.avanco_fisico_pct)],
            ] : null,
            rodape: s.obra?.project_name,
        },
        {
            // O card que o PRD (§124) usa para vender o produto: o banco não vê
            // "um orçamento.pdf", vê o desvio já contratado projetado no que
            // falta. Fica ao lado de Obra de propósito — "Contratado" ali é o
            // cabeçalho dos contratos, aqui é a soma dos itens; a cobertura no
            // rodapé é o que impede que a diferença pareça erro.
            key: 'eac', titulo: 'Custo a terminar (EAC)', icon: <Calculator className="w-4 h-4" />,
            linhas: s.eac ? [
                ['Orçado', money(s.eac.orcado)],
                ['Contratado (itens)', money(s.eac.contratado)],
                ['A contratar', money(s.eac.a_contratar)],
                ['Fator observado', s.eac.fator == null ? '—' : `${s.eac.fator.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`],
                ['EAC', money(s.eac.eac)],
                ['Desvio vs. orçado', pct(s.eac.desvio_pct)],
            ] : null,
            rodape: s.eac
                ? [
                    s.eac.origens.length ? `orçamento: ${s.eac.origens.map(o => o.name).join(', ')}` : null,
                    s.eac.cobertura_pct != null && s.eac.cobertura_pct < 99.5
                        ? `itens cobrem ${pct(s.eac.cobertura_pct)} do contratado (${money(s.eac.contratado_cabecalho)})`
                        : null,
                    s.eac.contratado_sem_orcamento > 0
                        ? `${money(s.eac.contratado_sem_orcamento)} contratado sem item no orçamento — fora do fator`
                        : null,
                    s.eac.fator == null ? 'sem item contratado: o EAC é o próprio orçamento' : null,
                  ].filter(Boolean).join(' · ')
                : undefined,
        },
        {
            key: 'vendas', titulo: 'Vendas', icon: <TrendingUp className="w-4 h-4" />,
            linhas: s.vendas ? [
                ['VGV total', money(s.vendas.vgv_total)],
                ['VGV vendido', money(s.vendas.vgv_vendido)],
                ['VGV disponível', money(s.vendas.vgv_disponivel)],
                ['% vendido', pct(s.vendas.pct_vendido)],
                ['Unidades', `${s.vendas.vendidas + s.vendas.permutadas} / ${s.vendas.unidades_total}`],
            ] : null,
            rodape: s.empreendimento?.name,
        },
        {
            key: 'portfolio', titulo: 'Portfólio de renda', icon: <Home className="w-4 h-4" />,
            linhas: s.portfolio ? [
                ['NOI mensal', money(s.portfolio.noi_mensal)],
                ['NOI no período', money(s.portfolio.noi_periodo)],
                ['Receita (contratada)', money(s.portfolio.receita_periodo)],
                ['Margem NOI', pct(s.portfolio.margem_pct)],
                ['Cap rate', pct(s.portfolio.cap_rate_pct)],
            ] : null,
            rodape: s.portfolio ? `${s.portfolio.janela_meses} meses · receita contratada, não recebida` : undefined,
        },
        {
            key: 'recebiveis', titulo: 'Recebíveis de vendas', icon: <CalendarClock className="w-4 h-4" />,
            linhas: s.recebiveis ? [
                ['A vencer', money(s.recebiveis.a_vencer)],
                ['Vencido 1–30', money(s.recebiveis.vencido_1_30)],
                ['Vencido 31–60', money(s.recebiveis.vencido_31_60)],
                ['Vencido 61–90', money(s.recebiveis.vencido_61_90)],
                ['Vencido +90', money(s.recebiveis.vencido_90_mais)],
                ['Total em aberto', money(s.recebiveis.total_em_aberto)],
                ['Inadimplência', pct(s.recebiveis.inadimplencia_pct)],
            ] : null,
            // O escopo vai no rodapé porque a diferença entre "deste
            // empreendimento" e "da empresa toda" muda a leitura do número.
            rodape: s.recebiveis
                ? `${s.recebiveis.escopo === 'OBRA' ? 'desta obra' : 'carteira da organização'}`
                  + ` · ${s.recebiveis.n_parcelas_abertas} parcela(s) em aberto`
                  + ` · recebido ${money(s.recebiveis.recebido)}`
                : undefined,
        },
        {
            // Resumo — o detalhe linha a linha está na aba própria. Aqui só o
            // que decide: se o quadro fecha. Um quadro que não fecha é uma
            // operação sem resposta para "de onde sai o resto".
            key: 'fontesusos', titulo: 'Fontes e Usos', icon: <Scale className="w-4 h-4" />,
            linhas: s.fontes_usos ? [
                ['Total de fontes', money(s.fontes_usos.total_fontes)],
                ['Total de usos', money(s.fontes_usos.total_usos)],
                ['Diferença', money(s.fontes_usos.diferenca)],
                // Zero contra zero não fecha: está vazio. Ver CreditRoomFunding.
                ['Fecha?', s.fontes_usos.total_fontes === 0 && s.fontes_usos.total_usos === 0
                    ? 'sem valores'
                    : s.fontes_usos.fecha ? 'sim' : 'não'],
                ['Linhas', `${s.fontes_usos.fontes.length} fonte(s) · ${s.fontes_usos.usos.length} uso(s)`],
            ] : null,
            rodape: s.fontes_usos
                ? (s.fontes_usos.total_fontes === 0 && s.fontes_usos.total_usos === 0
                    ? 'linhas cadastradas sem valor — o quadro ainda não diz nada'
                    : s.fontes_usos.fecha
                        ? 'as duas somas fecham'
                        : `${s.fontes_usos.diferenca > 0 ? 'sobram' : 'faltam'} ${money(Math.abs(s.fontes_usos.diferenca))} — o quadro não fecha`)
                : undefined,
        },
        {
            key: 'divida', titulo: 'Dívida atual', icon: <Landmark className="w-4 h-4" />,
            linhas: s.divida ? [
                ['Saldo devedor', money(s.divida.divida_total)],
                ['Curto prazo', money(s.divida.curto_prazo)],
                ['Serviço 12 meses', money(s.divida.servico_365)],
                ['Vencido', money(s.divida.vencido)],
                ['Contratos', `${s.divida.n_contratos} em ${s.divida.n_instituicoes} instituição(ões)`],
            ] : null,
            rodape: s.divida ? `posição de ${formatDateBR(s.divida.data_base)}` : undefined,
        },
        {
            key: 'garantias', titulo: 'Garantias', icon: <ShieldCheck className="w-4 h-4" />,
            linhas: op.guarantees.length ? [
                ['Valor bruto', money(i.garantias_brutas)],
                ['Elegível (após haircut)', money(i.garantias_elegiveis)],
                ['Cobertura atual', vezes(i.cobertura_atual)],
                ['Cobertura pós-operação', vezes(i.cobertura_pos)],
                ['Itens', String(op.guarantees.length)],
            ] : null,
        },
    ];

    if (accent === 'portal') {
        return (
            <div className="space-y-4">
                <KpiStrip items={linha1.map(k => ({
                    label: k.label, value: k.value,
                    hint: k.hint ? `${k.hint} · ver origem` : 'ver origem',
                    onClick: () => setExplicando(k.chave),
                }))} />
                <PainelProveniencia
                    aberto={explicando != null} onClose={() => setExplicando(null)}
                    version={version} chave={explicando}
                />
                {ausentes.length > 0 && <AvisoFontes ausentes={ausentes} accent="portal" />}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {blocos.map(b => (
                        <PortalCard key={b.key} className="p-5">
                            <div className="flex items-center gap-2 text-[#8A8F9A] mb-3">
                                {b.icon}
                                <span className="text-[13px] font-semibold text-[#1F2430]">{b.titulo}</span>
                            </div>
                            {b.linhas ? (
                                <dl className="space-y-1.5">
                                    {b.linhas.map(([k, v]) => (
                                        <div key={k} className="flex items-baseline justify-between gap-3">
                                            <dt className="text-[13px] text-[#8A8F9A]">{k}</dt>
                                            <dd className="text-[13px] font-medium text-[#1F2430] text-right">{v}</dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : (
                                <p className="text-[13px] text-gray-400">Sem dado nesta versão.</p>
                            )}
                            {b.rodape && <p className="text-[11px] text-gray-400 mt-3 truncate" title={b.rodape}>{b.rodape}</p>}
                        </PortalCard>
                    ))}
                </div>
            </div>
        );
    }

    const cores: ('blue' | 'indigo' | 'violet' | 'amber' | 'emerald')[] = ['blue', 'indigo', 'violet', 'amber', 'emerald'];
    const icones = [<Wallet className="w-5 h-5" />, <Percent className="w-5 h-5" />, <Percent className="w-5 h-5" />, <ShieldCheck className="w-5 h-5" />, <TrendingUp className="w-5 h-5" />];

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {linha1.map((k, idx) => (
                    <div
                        key={k.label}
                        onClick={() => setExplicando(k.chave)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExplicando(k.chave); } }}
                        title="Ver de onde vem este número"
                        className="cursor-pointer rounded-[10px] transition-transform active:scale-[0.99]"
                    >
                        <KpiCard label={k.label} value={k.value} sub={k.hint ? `${k.hint} · ver origem` : 'ver origem'} icon={icones[idx]} color={cores[idx]} />
                    </div>
                ))}
            </div>
            <PainelProveniencia
                aberto={explicando != null} onClose={() => setExplicando(null)}
                version={version} chave={explicando}
            />
            {ausentes.length > 0 && <AvisoFontes ausentes={ausentes} accent="indigo" />}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {blocos.map(b => (
                    <div key={b.key} className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5">
                        <div className="flex items-center gap-2 text-gray-500 mb-3">
                            {b.icon}
                            <span className="text-sm font-semibold text-gray-800">{b.titulo}</span>
                        </div>
                        {b.linhas ? (
                            <dl className="space-y-1.5">
                                {b.linhas.map(([k, v]) => (
                                    <div key={k} className="flex items-baseline justify-between gap-3">
                                        <dt className="text-sm text-gray-500">{k}</dt>
                                        <dd className="text-sm font-medium text-gray-800 text-right">{v}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : (
                            <p className="text-sm text-gray-400">Sem dado nesta versão.</p>
                        )}
                        {b.rodape && <p className="text-xs text-gray-400 mt-3 truncate" title={b.rodape}>{b.rodape}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
};

const AvisoFontes: React.FC<{ ausentes: string[]; accent: 'indigo' | 'portal' }> = ({ ausentes, accent }) => (
    <div className={`flex items-start gap-2 text-sm rounded-[10px] px-4 py-3 border ${
        accent === 'portal' ? 'bg-[#FDF3DC] border-[#F1E2B8] text-[#8A6A16]' : 'bg-amber-50 border-amber-200 text-amber-800'
    }`}>
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
            Fluxo marcado como elegível sem fonte nesta versão:{' '}
            {ausentes.map(a => ELIGIBLE_FLOW_PT[a as keyof CreditRoomEligibleFlows] ?? a).join(', ')}.
            O DSCR não o considera — não é zero, é ausente.
        </span>
    </div>
);

export default CreditRoomIndicators;
