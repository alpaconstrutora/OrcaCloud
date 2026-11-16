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
import type { GraficoId } from '../utils/imovibGraficos';
import { secoesDoRelatorio, capaDoRelatorio, type DadosDoRelatorio, type OpcoesDoRelatorio, type CapaDoRelatorio, type SecaoDoRelatorio } from '../utils/imovibRelatorio';
import { graficosDoEstudo, type DadosDosGraficos } from '../utils/imovibCalculoDaVersao';
import { pdfDoRelatorio, type ImagemDoGrafico } from '../utils/imovibRelatorioPdf';
import { coresCompativeisNaCopia } from '../utils/html2canvasCores';
import { logoComoDataUrl } from '../utils/logoComoDataUrl';
import { logoParaOPdf } from '../utils/logoParaOPdf';
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

/** O gráfico de cada id, ou null quando não há o que desenhar. Os dados vêm prontos: do cálculo
 *  congelado na versão (Fase 6) ou calculados agora (`graficosDoEstudo`). */
function graficoDe(id: GraficoId, g: DadosDosGraficos): React.ReactElement | null {
    const dim = DIMENSAO[id];
    switch (id) {
        case 'curva_s':
            return g.curvaS.length ? <GraficoCurvaS dados={g.curvaS} larguraDoEixo={84} dimensao={dim} animado={false} /> : null;
        case 'fluxo_anual':
            return g.fluxoAnual.length ? <GraficoCurvaS dados={g.fluxoAnual} rotuloBarra="Caixa do ano" rotuloLinha="Acumulado no fim do ano" larguraDoEixo={84} dimensao={dim} animado={false} /> : null;
        case 'tornado':
            return g.tornado.length && g.tornado[0].base != null && Number.isFinite(g.tornado[0].base)
                ? <GraficoTornado barras={g.tornado} metrica="vpl" choques={g.choques} comLegenda dimensao={dim} animado={false} /> : null;
        case 'cenarios':
            return g.cenarios.length > 1 ? <GraficoCenarios linhas={g.cenarios} dimensao={dim} animado={false} /> : null;
        case 'marcos':
            return <LinhaDoTempoDosMarcos marcos={g.marcos} dimensao={dim} />;
        case 'vendas':
            return g.vendas.some(x => x.vendas > 0) ? <GraficoVendasPorMes dados={g.vendas} larguraDoEixo={72} dimensao={dim} animado={false} /> : null;
        case 'capital':
            return g.capital.length ? <GraficoComposicaoDoCapital fatias={g.capital} dimensao={dim} animado={false} /> : null;
    }
}

// Aba em segundo plano pausa o requestAnimationFrame (a geração ficava parada até voltar): quem
// chegar primeiro, o quadro ou 50 ms, libera.
const proximoQuadro = () => new Promise<void>(ok => {
    const t = setTimeout(ok, 50);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { clearTimeout(t); ok(); });
});

export async function imagensDosGraficos(dadosDosGraficos: DadosDosGraficos, ids: GraficoId[]): Promise<Partial<Record<GraficoId, ImagemDoGrafico>>> {
    // Um gráfico que não consegue ser calculado fica de fora; os outros seguem.
    const graficos = [...new Set(ids)].flatMap(id => {
        try {
            const el = graficoDe(id, dadosDosGraficos);
            return el ? [{ id, el }] : [];
        } catch (e) {
            console.error(`Gráfico "${TITULO[id]}" ficou fora do relatório`, e);
            return [];
        }
    });
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
    /**
     * Fase 6: os números congelados na versão — seções da edição pedida, capa e dados dos gráficos.
     * Com eles o motor não roda: o PDF da versão sai igual para sempre.
     */
    congelado?: { capa: CapaDoRelatorio; secoes: SecaoDoRelatorio[]; graficos: DadosDosGraficos } | null;
}

export async function gerarRelatorioCompleto(d: DadosDoRelatorio, opcoes: OpcoesDoRelatorioCompleto = {}): Promise<jsPDF> {
    const c = opcoes.congelado;
    const secoes = c ? c.secoes : secoesDoRelatorio(d, opcoes);
    const capa = c ? c.capa : capaDoRelatorio(d, opcoes);
    const [imagens, logo] = await Promise.all([
        // Falha na captura (html2canvas) não derruba o relatório: sai só com texto e tabelas.
        Promise.resolve()
            .then(() => imagensDosGraficos(c ? c.graficos : graficosDoEstudo(d.study, d.cenarios), secoes.flatMap(s => s.graficos)))
            .catch(e => {
            console.error('Os gráficos ficaram fora do relatório', e);
            return {};
        }),
        logoComoDataUrl(opcoes.organizacao?.logo_url ?? null).then(l => logoParaOPdf(l)),
    ]);
    const titulo = opcoes.versao ? `${d.study.name} — ${opcoes.versao.label}` : d.study.name;
    return pdfDoRelatorio(secoes, titulo, {
        capa: { ...capa, organizacao: opcoes.organizacao?.name ?? null, logo },
        imagens,
    });
}
