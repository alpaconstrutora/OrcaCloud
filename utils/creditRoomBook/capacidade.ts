/** Seção 2: capacidade de pagamento — KPIs, gráfico mês a mês (primitivas do jsPDF) e tabelas. */
import type { CreditRoomVersion } from '../../types/creditRoom';
import { formatDateBR } from '../../components/ui/Format';
import { compactAxis, niceTicks } from '../../components/analysis/chartKit';
import {
    ALERTA_PT, fluxosDaOperacao, resumoDaCapacidade, rotuloDoMes, textosDaCapacidade,
    type FluxosElegiveis, type SerieMes,
} from '../creditCapacity';
import {
    COR, FRASE_SCHEMA_1, MARGEM, N_D, aviso, garantir, kpis, larguraUtil, limpo, money, pct, plural, secao, subtitulo,
    tabela, vezes, type Ctx,
} from './base';

function desenharGrafico(c: Ctx, serie: SerieMes[], fluxos: FluxosElegiveis) {
    const { doc } = c;
    const comServico = serie.some(m => m.servico_atual + m.servico_novo > 0);
    const alt = 62;
    garantir(c, alt + 16);

    // Legenda: quadrado para barra, traço para linha.
    let x = MARGEM;
    const item = (rotulo: string, cor: string, forma: 'barra' | 'linha') => {
        doc.setFillColor(cor); doc.setDrawColor(cor);
        if (forma === 'barra') doc.rect(x, c.y - 0.5, 2.6, 2.6, 'F');
        else { doc.setLineWidth(0.6); doc.line(x, c.y + 0.8, x + 4, c.y + 0.8); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
        doc.text(limpo(rotulo), x + (forma === 'barra' ? 4 : 5.5), c.y + 1.6);
        x += (forma === 'barra' ? 4 : 5.5) + doc.getTextWidth(limpo(rotulo)) + 6;
    };
    if (fluxos.vendas) item('Vendas', COR.vendas, 'barra');
    if (fluxos.alugueis) item('Aluguéis', COR.alugueis, 'barra');
    if (comServico) item('Serviço da dívida', COR.servico, 'linha');
    c.y += 5;

    const eixoW = 20;
    const x0 = MARGEM + eixoW; const x1 = MARGEM + larguraUtil(doc);
    const yTopo = c.y + 1; const yBase = c.y + alt - 8;
    const dados = serie.map(m => ({
        v: fluxos.vendas ? m.vendas : 0, a: fluxos.alugueis ? m.alugueis : 0, s: m.servico_atual + m.servico_novo,
    }));
    const maxY = Math.max(1, ...dados.map(d => Math.max(d.v + d.a, d.s)));
    const ticks = niceTicks(maxY);
    const topoEixo = ticks[ticks.length - 1] || maxY;
    const yDe = (v: number) => yBase - (v / topoEixo) * (yBase - yTopo);

    // Grade hairline e eixo de valor compacto ("R$ 12 mil").
    doc.setLineWidth(0.15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    for (const t of ticks) {
        doc.setDrawColor(t === 0 ? '#94a3b8' : COR.grade);
        doc.line(x0, yDe(t), x1, yDe(t));
        doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
        doc.text(limpo(`R$ ${compactAxis(t)}`), x0 - 2, yDe(t) + 0.9, { align: 'right' });
    }

    const slot = (x1 - x0) / serie.length;
    const barra = Math.min(slot * 0.7, 6);
    const cx = (k: number) => x0 + slot * (k + 0.5);
    dados.forEach((d, k) => {
        if (d.v > 0) { doc.setFillColor(COR.vendas); doc.rect(cx(k) - barra / 2, yDe(d.v), barra, yBase - yDe(d.v), 'F'); }
        if (d.a > 0) { doc.setFillColor(COR.alugueis); doc.rect(cx(k) - barra / 2, yDe(d.v + d.a), barra, yDe(d.v) - yDe(d.v + d.a), 'F'); }
    });
    if (comServico) {
        doc.setDrawColor(COR.servico); doc.setLineWidth(0.55);
        if (dados.length === 1) { doc.setFillColor(COR.servico); doc.circle(cx(0), yDe(dados[0].s), 0.8, 'F'); }
        for (let k = 1; k < dados.length; k++) doc.line(cx(k - 1), yDe(dados[k - 1].s), cx(k), yDe(dados[k].s));
    }

    // Todos os meses entram; só o RÓTULO é rareado para caber ("dez/26" tem ~7,5 mm).
    const passo = Math.max(1, Math.ceil(7.5 / slot));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
    serie.forEach((m, k) => { if (k % passo === 0) doc.text(rotuloDoMes(m.mes), cx(k), yBase + 4, { align: 'center' }); });
    c.y = yBase + 9;
}

// ── Seção 2: capacidade de pagamento ─────────────────────────────────────────

export function secaoCapacidade(c: Ctx, versao: CreditRoomVersion) {
    const s = versao.snapshot;
    const cap = s.capacidade ?? null;
    const resumo = resumoDaCapacidade(cap);
    secao(c, '2. Capacidade de pagamento');
    if (!cap || !resumo) {
        aviso(c, `Esta seção não consta neste book: ${FRASE_SCHEMA_1}. A empresa pode congelar uma nova versão.`);
        return;
    }
    const fluxos = fluxosDaOperacao(s);
    const t = textosDaCapacidade(cap, resumo, s.operacao?.requested_amount ?? 0);
    const exigido = cap.parametros.dscr_minimo;
    const escopo = s.escopo ?? null;

    kpis(c, [
        { rotulo: 'Valor máximo do empréstimo', valor: t.semSerie ? N_D : money(cap.capacidade_maxima.valor_maximo), hint: t.hintMaximo },
        { rotulo: 'Renda líquida média 12m', valor: money(resumo.renda_liquida_media_12m), hint: 'após a despesa operacional' },
        {
            rotulo: t.rotuloDscr, valor: vezes(resumo.dscr_minimo_12m), hint: t.hintDscr,
            alerta: resumo.dscr_minimo_12m != null && resumo.dscr_minimo_12m < exigido,
        },
        { rotulo: 'Folga mínima 12m', valor: money(resumo.folga_minima_12m), hint: t.hintFolga, alerta: resumo.folga_minima_12m != null && resumo.folga_minima_12m < 0 },
    ], 2);
    aviso(c, [
        'Contratado, sem reajuste',
        `data-base ${formatDateBR(s.data_base)}`,
        escopo ? `escopo ${escopo.tipo === 'GRUPO' ? 'Grupo' : 'Empresa'} (${plural(escopo.organizacoes.length, 'empresa', 'empresas')})` : null,
        t.notaMaximo,
    ].filter(Boolean).join(' · '));

    subtitulo(c, 'Mês a mês');
    const ficaramFora = [!fluxos.vendas && 'recebíveis de vendas', !fluxos.alugueis && 'aluguéis (NOI)'].filter(Boolean) as string[];
    aviso(c, `Valores contratados, sem reajuste, em reais. Barras antes da despesa operacional; o DSCR usa a renda líquida.${ficaramFora.length
        ? ` Fora do gráfico e do DSCR: ${ficaramFora.join(' e ')} - fluxo não marcado como elegível nesta operação.` : ''}`);
    if (cap.serie.length === 0) {
        aviso(c, 'Esta versão não tem meses projetados.');
    } else if (!fluxos.vendas && !fluxos.alugueis) {
        aviso(c, 'Nenhum fluxo (vendas ou aluguéis) está marcado como elegível nesta operação: não há renda a comparar com o serviço da dívida.');
    } else {
        desenharGrafico(c, cap.serie, fluxos);
        if (!cap.serie.some(m => m.servico_atual + m.servico_novo > 0)) aviso(c, 'Sem serviço da dívida nos meses projetados: não há linha de serviço.');
        tabela(c, ['Mês',
            ...(fluxos.vendas ? ['Vendas'] : []),
            ...(fluxos.alugueis ? ['Aluguéis', 'Despesa operacional'] : []),
            'Renda líquida', 'Serviço da dívida', 'Folga', 'DSCR'],
        cap.serie.map(m => [
            rotuloDoMes(m.mes),
            ...(fluxos.vendas ? [money(m.vendas)] : []),
            ...(fluxos.alugueis ? [money(m.alugueis), money(m.despesa_operacional)] : []),
            money(m.renda_liquida), money(m.servico_atual + m.servico_novo),
            { v: money(m.folga), vermelho: m.folga < 0 }, vezes(m.dscr),
        ]), { fonte: 7 });
    }

    subtitulo(c, 'Recebido nos últimos 12 meses');
    const recebido = cap.recebido_12m;
    const comValor = recebido.filter(r => r.vendas + r.alugueis > 0);
    if (recebido.length === 0) aviso(c, 'Esta versão não traz o histórico de recebimentos.');
    else if (comValor.length === 0) aviso(c, 'Nenhum recebimento registrado nos últimos 12 meses.');
    else tabela(c, ['Mês', 'Vendas', 'Aluguéis', 'Total'], comValor.map(r => [
        rotuloDoMes(r.mes), money(r.vendas), money(r.alugueis), { v: money(r.vendas + r.alugueis), forte: true },
    ]));

    subtitulo(c, 'Estoque a vender');
    if (cap.estoque) {
        aviso(c, `VGV disponível ${money(cap.estoque.vgv_disponivel)} · haircut ${pct(cap.estoque.haircut_pct)} · valor elegível ${money(cap.estoque.valor_elegivel)}. Não entra no DSCR: potencial de venda/garantia.`);
    } else aviso(c, 'Sem estoque disponível a considerar nesta versão.');

    subtitulo(c, 'Alertas da carteira');
    if (cap.alertas.length === 0) aviso(c, 'Carteira sem pendências de cadastro.');
    else tabela(c, ['Alerta', 'Itens', 'Valor'], cap.alertas.map(a => [
        ALERTA_PT[a.tipo]?.titulo ?? a.tipo, String(a.qtd), a.valor > 0 ? money(a.valor) : N_D,
    ]), { direitaA: 1 });

    if (escopo?.tipo === 'GRUPO' && cap.por_organizacao.length > 0) {
        subtitulo(c, 'Por empresa');
        tabela(c, ['Empresa', 'Renda 12m', 'Serviço 12m', 'Dívida total'], cap.por_organizacao.map(o => [
            escopo.organizacoes.find(x => x.id === o.organization_id)?.nome ?? 'Empresa fora do escopo',
            money(o.renda_12m), money(o.servico_12m), money(o.divida_total),
        ]));
    }
}
