/**
 * Relatório completo do Imovib com capa e gráficos (Fase 3 do plano
 * docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md).
 *
 * `imagensDosGraficos` monta os gráficos de components/ImovibGraficos.tsx fora da tela, em tamanho
 * fixo e sem animação, e captura cada um com html2canvas (cores oklch convertidas na cópia — ver
 * utils/html2canvasCores.ts). Gráfico que falhar fica de fora: o relatório sai sem ele, não deixa de sair.
 *
 * `gerarRelatorioCompleto` junta seções + capa + gráficos — o mesmo documento no Resumo Executivo,
 * na aba Versões e no Portal do Investidor. Importar com `import()`: traz jsPDF e html2canvas.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { jsPDF } from 'jspdf';
import { computeImovibMath } from '../utils/imovibMotor';
import { tornado, CHOQUES_PADRAO } from '../utils/imovibSensibilidade';
import { marcosDoEstudo } from '../utils/imovibCronograma';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { fluxoAnual, dadosDosCenarios, dadosDasVendas, fatiasDoCapital, type GraficoId } from '../utils/imovibGraficos';
import { secoesDoRelatorio, capaDoRelatorio, type DadosDoRelatorio, type OpcoesDoRelatorio } from '../utils/imovibRelatorio';
import { pdfDoRelatorio, type ImagemDoGrafico } from '../utils/imovibRelatorioPdf';
import { coresCompativeisNaCopia } from '../utils/html2canvasCores';
import { logoComoDataUrl } from '../utils/logoComoDataUrl';
import {
    GraficoCurvaS, GraficoTornado, GraficoCenarios, GraficoVendasPorMes, GraficoComposicaoDoCapital, LinhaDoTempoDosMarcos,
    type DimensaoDoGrafico,
} from './ImovibGraficos';

/** Tamanho de cada gráfico na captura (px). A largura vira a da página; a altura segue a proporção. */
const DIMENSAO: Record<GraficoId, DimensaoDoGrafico> = {
    curva_s: { largura: 900, altura: 380 },
    fluxo_anual: { largura: 900, altura: 320 },
    tornado: { largura: 900, altura: 400 },
    cenarios: { largura: 900, altura: 240 },
    marcos: { largura: 900, altura: 150 },
    vendas: { largura: 900, altura: 260 },
    capital: { largura: 900, altura: 300 },
};

const TITULO: Record<GraficoId, string> = {
    curva_s: 'Curva S e exposição de caixa (mensal)',
    fluxo_anual: 'Caixa por ano e acumulado',
    tornado: 'Sensibilidade do VPL (tornado)',
    cenarios: 'VPL por cenário',
    marcos: 'Linha do tempo: obra, vendas e marcos',
    vendas: 'Vendas por mês e estoque',
    capital: 'De onde vem o dinheiro',
};

/** O gráfico de cada id, ou null quando não há o que desenhar. */
function graficoDe(id: GraficoId, d: DadosDoRelatorio): React.ReactElement | null {
    const { study } = d;
    const r = computeImovibMath(study);
    const dim = DIMENSAO[id];
    switch (id) {
        case 'curva_s':
            return r.monthlyFlows.length ? <GraficoCurvaS dados={r.monthlyFlows} larguraDoEixo={84} dimensao={dim} animado={false} /> : null;
        case 'fluxo_anual':
            return r.monthlyFlows.length ? <GraficoCurvaS dados={fluxoAnual(r.monthlyFlows)} rotuloBarra="Caixa do ano" rotuloLinha="Acumulado no fim do ano" larguraDoEixo={84} dimensao={dim} animado={false} /> : null;
        case 'tornado': {
            const barras = tornado(study, 'vpl', CHOQUES_PADRAO);
            return barras.length && Number.isFinite(barras[0].base) ? <GraficoTornado barras={barras} metrica="vpl" choques={CHOQUES_PADRAO} comLegenda dimensao={dim} animado={false} /> : null;
        }
        case 'cenarios':
            return d.cenarios.length ? <GraficoCenarios linhas={dadosDosCenarios(study, d.cenarios, r)} dimensao={dim} animado={false} /> : null;
        case 'marcos':
            return <LinhaDoTempoDosMarcos marcos={marcosDoEstudo(study, r)} dimensao={dim} />;
        case 'vendas': {
            const dados = dadosDasVendas(r, Number(study.sales_start_month ?? IMOVIB_DEFAULTS.sales_start_month));
            return dados.some(x => x.vendas > 0) ? <GraficoVendasPorMes dados={dados} dimensao={dim} animado={false} /> : null;
        }
        case 'capital': {
            const fatias = fatiasDoCapital(r.capital);
            return fatias.length ? <GraficoComposicaoDoCapital fatias={fatias} dimensao={dim} animado={false} /> : null;
        }
    }
}

const proximoQuadro = () => new Promise<void>(ok => requestAnimationFrame(() => ok()));

/** Logo reduzida para a capa (16 mm de altura não pedem 3600 px). Falha → a original. */
async function logoReduzida(dataUrl: string | null, larguraMaxima = 480): Promise<string | null> {
    if (!dataUrl) return null;
    try {
        const img = new Image();
        await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error('logo')); img.src = dataUrl; });
        if (img.naturalWidth <= larguraMaxima) return dataUrl;
        const c = document.createElement('canvas');
        c.width = larguraMaxima;
        c.height = Math.max(1, Math.round((img.naturalHeight * larguraMaxima) / img.naturalWidth));
        const ctx = c.getContext('2d');
        if (!ctx) return dataUrl;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
    } catch {
        return dataUrl;
    }
}

export async function imagensDosGraficos(d: DadosDoRelatorio, ids: GraficoId[]): Promise<Partial<Record<GraficoId, ImagemDoGrafico>>> {
    const graficos = [...new Set(ids)].map(id => ({ id, el: graficoDe(id, d) })).filter((g): g is { id: GraficoId; el: React.ReactElement } => !!g.el);
    if (!graficos.length) return {};
    const html2canvas = (await import('html2canvas')).default;
    const caixa = document.createElement('div');
    caixa.setAttribute('aria-hidden', 'true');
    Object.assign(caixa.style, { position: 'fixed', left: '-10000px', top: '0', width: '960px', background: '#ffffff' });
    document.body.appendChild(caixa);
    const raiz = createRoot(caixa);
    const imagens: Partial<Record<GraficoId, ImagemDoGrafico>> = {};
    try {
        flushSync(() => raiz.render(
            <div>
                {graficos.map(g => (
                    <div key={g.id} data-grafico={g.id} style={{ width: DIMENSAO[g.id].largura + 32, padding: 16, background: '#ffffff' }}>
                        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{TITULO[g.id]}</p>
                        {g.el}
                    </div>
                ))}
            </div>,
        ));
        await proximoQuadro();
        await proximoQuadro();
        // UMA captura para todos (o html2canvas copia a página inteira a cada chamada: uma por
        // gráfico levava ~47 s no Garden) e cada gráfico é recortado dela. JPEG: o jsPDF guarda
        // PNG sem compressão (7 gráficos davam 40 MB).
        const escala = 2;
        const tudo = await html2canvas(caixa, {
            scale: escala, backgroundColor: '#ffffff', logging: false, useCORS: true,
            onclone: (_doc, copia) => { coresCompativeisNaCopia(copia, { semSombra: true }); },
        });
        const topo = caixa.getBoundingClientRect();
        for (const g of graficos) {
            const el = caixa.querySelector<HTMLElement>(`[data-grafico="${g.id}"]`);
            if (!el) continue;
            try {
                const ret = el.getBoundingClientRect();
                const recorte = document.createElement('canvas');
                recorte.width = Math.round(ret.width * escala);
                recorte.height = Math.round(ret.height * escala);
                recorte.getContext('2d')!.drawImage(tudo, Math.round((ret.left - topo.left) * escala), Math.round((ret.top - topo.top) * escala),
                    recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);
                imagens[g.id] = { dataUrl: recorte.toDataURL('image/jpeg', 0.9), largura: recorte.width, altura: recorte.height };
            } catch (e) {
                console.error(`Gráfico "${TITULO[g.id]}" ficou fora do relatório`, e);
            }
        }
    } finally {
        raiz.unmount();
        caixa.remove();
    }
    return imagens;
}

export interface OpcoesDoRelatorioCompleto extends OpcoesDoRelatorio {
    organizacao?: { name: string | null; logo_url: string | null } | null;
}

export async function gerarRelatorioCompleto(d: DadosDoRelatorio, opcoes: OpcoesDoRelatorioCompleto = {}): Promise<jsPDF> {
    const secoes = secoesDoRelatorio(d, opcoes);
    const [imagens, logo] = await Promise.all([
        imagensDosGraficos(d, secoes.flatMap(s => s.graficos)),
        logoComoDataUrl(opcoes.organizacao?.logo_url ?? null).then(l => logoReduzida(l)),
    ]);
    const titulo = opcoes.versao ? `${d.study.name} — ${opcoes.versao.label}` : d.study.name;
    return pdfDoRelatorio(secoes, titulo, {
        capa: { ...capaDoRelatorio(d, opcoes), organizacao: opcoes.organizacao?.name ?? null, logo },
        imagens,
    });
}
