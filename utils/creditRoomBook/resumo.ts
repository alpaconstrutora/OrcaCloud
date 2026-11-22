/** Seção 1: resumo da operação e indicadores (os da Visão). */
import type { CreditRoomVersion } from '../../types/creditRoom';
import { formatDateBR } from '../../components/ui/Format';
import { ELIGIBLE_FLOW_PT, GUARANTEE_KIND_PT } from '../creditRoomSnapshot';
import {
    N_D, aviso, kpis, money, pct, plural, secao, subtitulo, tabela, vezes, type Celula, type Ctx,
} from './base';

export function secaoResumo(c: Ctx, versao: CreditRoomVersion) {
    const s = versao.snapshot;
    const op = s.operacao;
    const i = versao.indicators;
    secao(c, '1. Resumo da operação e indicadores', `Posição de ${formatDateBR(versao.dataBase)} (versão V${versao.versionNo}).`);

    const fluxos = (Object.keys(ELIGIBLE_FLOW_PT) as (keyof typeof ELIGIBLE_FLOW_PT)[])
        .filter(k => op.eligible_flows[k]).map(k => ELIGIBLE_FLOW_PT[k]);
    const nEmpresas = s.escopo?.organizacoes.length ?? 0;
    tabela(c, ['Operação', ''], [
        ['Valor solicitado', money(op.requested_amount)],
        ['Modalidade', op.modality ?? N_D],
        ['Finalidade', op.purpose ?? N_D],
        ['Instituição', op.institution_name ?? N_D],
        ['Prazo', op.term_months != null ? `${op.term_months} meses` : N_D],
        ['Carência', op.grace_months != null ? `${op.grace_months} meses` : N_D],
        ['Fluxos elegíveis ao DSCR', fluxos.length ? fluxos.join('; ') : 'nenhum'],
        ['Equity comprometido / aportado', `${money(op.equity_committed)} / ${money(op.equity_contributed)}`],
        ...(s.escopo ? [[
            'Escopo',
            `${s.escopo.tipo === 'GRUPO' ? 'Grupo' : 'Empresa'} (${plural(nEmpresas, 'empresa', 'empresas')}): ${s.escopo.organizacoes.map(o => o.nome).join(', ')}`,
        ]] : []),
    ], { larguras: { 0: 55 } });

    subtitulo(c, 'Indicadores');
    kpis(c, [
        { rotulo: 'Valor solicitado', valor: money(op.requested_amount), hint: op.modality ?? undefined },
        { rotulo: 'LTV (pós-operação)', valor: pct(i.ltv_pos), hint: i.ltv_atual == null ? 'sem garantia avaliada' : `atual ${pct(i.ltv_atual)}` },
        { rotulo: 'LTC (pós-operação)', valor: pct(i.ltc_pos), hint: i.custo_total == null ? 'sem orçamento da obra' : `atual ${pct(i.ltc_atual)}` },
        { rotulo: 'DSCR (pós-operação)', valor: vezes(i.dscr_pos), hint: i.dscr_atual == null ? 'sem fluxo elegível' : `atual ${vezes(i.dscr_atual)}` },
        { rotulo: 'Equity aportado', valor: pct(i.equity_pct), hint: `${money(op.equity_contributed)} de ${money(op.equity_committed)}` },
    ], 3);
    if ((i.fontes_ausentes ?? []).length) {
        aviso(c, `Fluxo marcado como elegível sem fonte nesta versão (fora do DSCR): ${i.fontes_ausentes.join('; ')}.`);
    }

    subtitulo(c, 'Blocos da versão');
    const bloco = (titulo: string, linhas: [string, string][] | null, rodape?: string): Celula[][] =>
        linhas
            ? [[{ v: titulo + (rodape ? ` (${rodape})` : ''), forte: true, direita: false }, ''], ...linhas]
            : [[{ v: titulo, forte: true, direita: false }, 'Sem dado nesta versão.']];
    const eac = s.eac; const obra = s.obra; const rec = s.recebiveis; const fu = s.fontes_usos; const dv = s.divida;
    tabela(c, ['Indicador', 'Valor'], [
        ...bloco('Obra', obra ? [
            [obra.orcado_origem === 'VALOR_ESTIMADO' ? 'Custo estimado' : 'Orçado', money(obra.orcado)],
            ['Contratado', money(obra.contratado_custo)], ['Pago', money(obra.pago)], ['A pagar', money(obra.a_pagar)],
            ['Avanço físico', pct(obra.avanco_fisico_pct)],
        ] : null, obra ? obra.project_name : undefined),
        ...bloco('Custo a terminar (EAC)', eac ? [
            ['Orçado', money(eac.orcado)], ['Contratado (itens)', money(eac.contratado)], ['A contratar', money(eac.a_contratar)],
            ['EAC', money(eac.eac)], ['Desvio vs. orçado', pct(eac.desvio_pct)],
        ] : null),
        ...bloco('Vendas', s.vendas ? [
            ['VGV total', money(s.vendas.vgv_total)], ['VGV vendido', money(s.vendas.vgv_vendido)],
            ['VGV disponível', money(s.vendas.vgv_disponivel)], ['% vendido', pct(s.vendas.pct_vendido)],
            ['Unidades vendidas / total', `${s.vendas.vendidas + s.vendas.permutadas} / ${s.vendas.unidades_total}`],
        ] : null),
        ...bloco('Portfólio de renda', s.portfolio ? [
            ['NOI mensal', money(s.portfolio.noi_mensal)], ['Receita (contratada)', money(s.portfolio.receita_periodo)],
            ['Margem NOI', pct(s.portfolio.margem_pct)], ['Cap rate', pct(s.portfolio.cap_rate_pct)],
        ] : null, s.portfolio ? 'receita contratada, não recebida' : undefined),
        ...bloco('Recebíveis de vendas', rec ? [
            ['A vencer', money(rec.a_vencer)], ['Total em aberto', money(rec.total_em_aberto)],
            ['Vencido +90 dias', money(rec.vencido_90_mais)], ['Inadimplência', pct(rec.inadimplencia_pct)],
        ] : null, rec ? (rec.escopo === 'OBRA' ? 'desta obra' : 'carteira da organização') : undefined),
        ...bloco('Fontes e usos', fu ? [
            ['Total de fontes', money(fu.total_fontes)], ['Total de usos', money(fu.total_usos)], ['Diferença', money(fu.diferenca)],
            ['Fecha?', fu.total_fontes === 0 && fu.total_usos === 0 ? 'sem valores' : fu.fecha ? 'sim' : 'não'],
        ] : null),
        ...bloco('Dívida atual', dv ? [
            ['Saldo devedor', money(dv.divida_total)], ['Curto prazo', money(dv.curto_prazo)],
            ['Serviço 12 meses', money(dv.servico_365)], ['Vencido', money(dv.vencido)],
            ['Contratos', `${dv.n_contratos} em ${dv.n_instituicoes} instituição(ões)`],
        ] : null),
    ], { larguras: { 0: 90 } });

    subtitulo(c, 'Garantias');
    if (!op.guarantees.length) { aviso(c, 'Nenhuma garantia informada nesta versão.'); return; }
    tabela(c, ['Garantia', 'Valor bruto', 'Haircut', 'Elegível'], op.guarantees.map(g => [
        `${GUARANTEE_KIND_PT[g.kind] ?? g.kind}${g.description ? ` - ${g.description}` : ''}`,
        money(g.value), pct(g.haircut_pct), money(g.value * (1 - g.haircut_pct / 100)),
    ]));
    aviso(c, `Cobertura atual ${vezes(i.cobertura_atual)} · pós-operação ${vezes(i.cobertura_pos)}.`);
}
