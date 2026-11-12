import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImovibStudy, ImovibLandChecklistItem } from '../types';
import { imovibService } from '../services/imovibService';
import { resumoDaDueDiligence } from './ImovibDueDiligenceCard';
import { useImovibMath, ImovibAba, baseDaRubrica } from '../hooks/useImovibMath';
import type { ImovibMathResult } from '../hooks/useImovibMath';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import type { ImovibCapexBase } from '../types';
import ImovibAvisosBanner from './ImovibAvisosBanner';
import ImovibPontosDeEquilibrioCard from './ImovibPontosDeEquilibrioCard';
import { calcularIndicadores } from '../utils/imovibIndicadores';
import { Activity, Building2, Wallet, PieChart, Coins, Download, FileText, LineChart as LineChartIcon, Loader2, Banknote, ClipboardCheck } from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import { CABECALHO_TABELA } from './ui/cabecalhoDeTabela';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, Legend } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { coresCompativeisNaCopia } from '../utils/html2canvasCores';
import * as XLSX from 'xlsx';
import { useToast } from '../hooks/useToast';
import { terrenoMaximo, precoMinimo, custoMaximoDeObra, vendasMinimas, PontoDeEquilibrio } from '../utils/imovibEquilibrio';
import { GRUPOS_DO_FLUXO } from '../utils/imovibVisaoDoFluxo';
import { descreverFonte } from '../utils/imovibFontes';
import { memorialDePremissas } from '../utils/imovibMemorial';
import { criteriosDoParecer, ROTULO_DO_PARECER } from '../utils/imovibParecer';
import ImovibParecerCard from './ImovibParecerCard';

interface ImovibExecutiveSummaryProps {
    study: ImovibStudy;
    /** Abre a aba que corrige a premissa de um aviso do motor. */
    onIrPara?: (aba: ImovibAba) => void;
    /** Recarrega o estudo depois de gravar o parecer ou os mínimos (item 10.3). */
    onDataChanged?: () => void;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
};

const BASE_PDF: Record<ImovibCapexBase, string> = {
    terreno: 'do terreno',
    obra: 'da obra',
    vgv: 'do VGV',
};

const formatPercent =(value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(value / 100);
};

/** Campo vazio (null/NaN) usa o padrão — a MESMA regra do motor (`val` em useImovibMath). */
const premissa = (x: number | null | undefined, padrao: number): number =>
    x == null || Number.isNaN(x) ? padrao : x;

type Linha = (string | number | null)[];

export interface PlanilhaImovib {
    indicadores: Linha[];
    premissas: Linha[];
    parecer: Linha[];
    fluxo: Linha[];
    aportes: Linha[];
}

/**
 * Conteúdo das abas do Excel do Resumo Executivo — valores NUMÉRICOS (sem
 * "R$"/"%" dentro da célula), unidade em coluna própria. Pura: testada em
 * __tests__/imovibExportacaoExcel.test.ts. Item 5.6 do plano 2026-10-12.
 */
export function montarPlanilhaImovib(study: ImovibStudy, m: ImovibMathResult, opcoes: { margemAlvoPct?: number | null } = {}): PlanilhaImovib {
    const D = IMOVIB_DEFAULTS;
    const tma = premissa(study.discount_rate, D.discount_rate);
    const origemDaTma = study.discount_rate_basis?.trim() || null;
    const tirDefinida = Number.isFinite(m.annualIrr);
    const tirProjetoDefinida = Number.isFinite(m.annualIrrProjeto);
    const rubricas = m.capexRubricasAtivas;
    const ind = calcularIndicadores(m, tma);
    // A margem-alvo é a que está no cartão "Pontos de equilíbrio" (hipótese da tela, não
    // gravada); vazia lá, o padrão — e o rótulo diz que é o padrão (pendência da Fase 2).
    const margemDaTela = opcoes.margemAlvoPct != null && Number.isFinite(opcoes.margemAlvoPct) ? opcoes.margemAlvoPct : null;
    const margemAlvo = margemDaTela ?? D.margem_alvo_terreno_percent;
    const ponto = (p: PontoDeEquilibrio): [number | null, string | null] =>
        p.valor == null
            ? [null, p.motivo === 'sem_vgv' ? 'Sem VGV no estudo' : p.motivo === 'acima_do_vgv' ? 'Nem vendendo tudo: o VPL fica negativo' : 'Não existe: o alvo não é atingido']
            : [p.valor, null];
    const [terrenoVpl, obsTerrenoVpl] = ponto(terrenoMaximo(study, { tipo: 'vpl_zero' }));
    const [terrenoMargem, obsTerrenoMargem] = ponto(terrenoMaximo(study, { tipo: 'margem', pct: margemAlvo }));
    const precoCalculado = precoMinimo(study);
    const [preco, obsPreco] = ponto(precoCalculado);
    const [custo, obsCusto] = ponto(custoMaximoDeObra(study));
    const [vendas, obsVendas] = ponto(vendasMinimas(study, precoCalculado));
    const vazio = (x: number | null, motivo: string) => (x == null ? motivo : null);

    const indicadores: Linha[] = [
        ['Indicador', 'Valor', 'Unidade', 'Observação'],
        ['VGV bruto', m.vgvTotal, 'R$', null],
        ['VGV líquido', m.netVgvTotal, 'R$', 'Receita dos compradores sem índice: VGV vendido depois das permutas, menos inadimplência e devolução de distratos; inclui os juros do pós-chaves'],
        ['Estoque não vendido', m.estoqueNaoVendidoPct * 100, '% do VGV vendável', 'Fica fora da receita'],
        ['Custo de obra', m.constCostTotal, 'R$', null],
        ['Terreno', m.landCost, 'R$', null],
        ['Rubricas do CAPEX no cálculo — sobre o terreno', m.capexRubricas.terreno, 'R$', rubricas ? null : 'Sem rubricas no cálculo'],
        ['Rubricas do CAPEX no cálculo — sobre a obra', m.capexRubricas.obra, 'R$', rubricas ? null : 'Sem rubricas no cálculo'],
        ['Rubricas do CAPEX no cálculo — sobre o VGV', m.capexRubricas.vgv, 'R$', rubricas ? null : 'Sem rubricas no cálculo'],
        ['Rubricas do CAPEX no cálculo — total', m.capexRubricas.total, 'R$', rubricas ? null : 'Sem rubricas no cálculo'],
        ['VPL', m.vpl, 'R$', `Do acionista, descontado à TMA de ${tma.toLocaleString('pt-BR')}% a.a.`],
        ['TIR', tirDefinida ? m.annualIrr : null, '% a.a.', tirDefinida ? 'Do acionista' : 'Sem TIR: o fluxo não troca de sinal'],
        ['VPL do projeto', m.vplProjeto, 'R$', 'Sem o financiamento'],
        ['TIR do projeto', tirProjetoDefinida ? m.annualIrrProjeto : null, '% a.a.', tirProjetoDefinida ? 'Sem o financiamento' : 'Sem TIR: o fluxo não troca de sinal'],
        ['TIR modificada', ind.tirModificadaAnual, '% a.a.', vazio(ind.tirModificadaAnual, 'Sem entrada ou sem saída de caixa') ?? 'Saídas e entradas à TMA'],
        ['Lucro líquido', ind.lucroLiquido, 'R$', 'Soma do caixa do acionista'],
        ['Margem líquida sobre o VGV', ind.margemLiquidaSobreVgv == null ? null : ind.margemLiquidaSobreVgv * 100, '%', vazio(ind.margemLiquidaSobreVgv, 'Sem VGV')],
        ['Margem sobre o custo', ind.margemSobreCusto == null ? null : ind.margemSobreCusto * 100, '%', vazio(ind.margemSobreCusto, 'Sem custo')],
        ['Payback simples', ind.paybackSimplesMes, 'mês', vazio(ind.paybackSimplesMes, 'O caixa acumulado não volta ao positivo')],
        ['Payback descontado', ind.paybackDescontadoMes, 'mês', vazio(ind.paybackDescontadoMes, 'O caixa descontado não volta ao positivo')],
        ['Múltiplo do capital', ind.multiploDoCapital, 'x', vazio(ind.multiploDoCapital, 'Sem saída de caixa') ?? 'Entradas ÷ saídas'],
        ['Retorno sobre o capital', ind.retornoSobreCapital == null ? null : ind.retornoSobreCapital * 100, '%', vazio(ind.retornoSobreCapital, 'Sem exposição de caixa') ?? 'Lucro ÷ exposição máxima'],
        ['Exposição máxima de caixa', m.maxExposure, 'R$', null],
        ['Mês da exposição máxima', ind.mesDaExposicaoMaxima, 'mês', vazio(ind.mesDaExposicaoMaxima, 'O caixa nunca fica negativo')],
        // Fase 4 (D2): o capital próprio é calculado, não digitado.
        ['Capital próprio necessário', m.capital.proprio, 'R$', 'Módulo da exposição máxima de caixa'],
        ['Financiamento liberado', m.capital.divida, 'R$', null],
        ['Permuta', m.capital.permuta, 'R$', 'VGV entregue ao terrenista'],
        ['Outras fontes de capital', m.capital.terceiros, 'R$', null],
        ['Vendas durante a obra', m.capital.vendasNaObra, 'R$', 'Pago pelos compradores até as chaves, sem o repasse, depois das deduções e da devolução de distrato'],
        ['Valor máximo do terreno (VPL zero)', terrenoVpl, 'R$', obsTerrenoVpl],
        [`Terreno para margem de ${margemAlvo.toLocaleString('pt-BR')}%${margemDaTela == null ? ' (padrão)' : ''}`, terrenoMargem, 'R$', obsTerrenoMargem ?? 'Margem líquida sobre o VGV'],
        ['Variação de preço que zera o VPL', preco, '%', obsPreco],
        ['Variação do custo de obra que zera o VPL', custo, '%', obsCusto],
        ['Vendas mínimas', vendas, '% do VGV vendável', obsVendas ?? 'No ritmo da curva de vendas'],
        ['TMA', tma, '% a.a.', origemDaTma],
        ['Duração', m.duration, 'meses', null],
    ];

    // Item 10.1: a aba sai do memorial de premissas — toda premissa que o motor lê,
    // com a fonte e a data anotadas; as outras fontes de capital vêm no fim.
    const premissas: Linha[] = [
        ['Grupo', 'Premissa', 'Valor', 'Unidade', 'Observação', 'Fonte', 'Data'],
        ...memorialDePremissas(study, { rubricasAtivas: rubricas }).map((l): Linha => [
            l.grupo, l.premissa, l.valor, l.unidade || null, l.observacao, l.fonte, l.data,
        ]),
        ...(study.funding_sources ?? []).map((f): Linha => ['Outras fontes', f.name, Number(f.amount) || 0, 'R$', descreverFonte(f), null, null]),
    ];

    const linhasDoFluxo = GRUPOS_DO_FLUXO.flatMap(g => g.linhas);
    const fluxo: Linha[] = [
        ['Mês do projeto', 'Mês', 'Receitas (R$)', 'Custos (R$)',
            ...linhasDoFluxo.map(l => `${l.rotulo} (R$)`),
            'Caixa líquido do mês (R$)', 'Exposição acumulada (R$)', 'Caixa do projeto (R$)', 'Acumulado do projeto (R$)'],
        ...m.monthlyFlows.map(f => [
            f.month, f.name, f.rev, f.cost,
            ...linhasDoFluxo.map(l => f.linhas[l.chave]),
            f.net, f.acc, f.netProjeto, f.accProjeto,
        ]),
    ];

    const aportes: Linha[] = [
        ['Mês', 'Aporte (R$)', 'Distribuição (R$)', 'Para as fontes por participação (R$)', 'Caixa no fim do mês (R$)'],
        ...m.aportes.map(a => [a.mes, a.aporte, a.distribuicao, a.paraTerceiros, a.caixa]),
    ];

    // Item 10.3: o parecer registrado e os critérios, com o mínimo e se atende.
    const parecer: Linha[] = [
        ['Item', 'Valor', 'Mínimo / limite', 'Atende', 'Unidade'],
        ['Parecer', study.recommendation ? ROTULO_DO_PARECER[study.recommendation] : 'Não registrado', null, null, null],
        ['Justificativa', study.recommendation_notes ?? null, null, null, null],
        ['Registrado por', study.recommended_by ?? null, null, null, null],
        ['Registrado em', study.recommended_at ? new Date(study.recommended_at).toLocaleString('pt-BR') : null, null, null, null],
        ...criteriosDoParecer(study, m, ind).map((c): Linha => [c.rotulo, c.valor, c.minimo, c.atende == null ? 'Sem como avaliar' : c.atende ? 'Sim' : 'Não', c.unidade]),
    ];

    return { indicadores, premissas, parecer, fluxo, aportes };
}

/** Nome de arquivo sem espaço nem caractere proibido no Windows. */
const nomeDeArquivo = (nome: string) =>
    (nome || 'Estudo').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');

const abaDoExcel = (linhas: Linha[], larguras: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = larguras.map(wch => ({ wch }));
    return ws;
};

/**
 * "Due diligence: x de 14 ok, y com problema" (item 5.9 do plano 2026-11-11). Só
 * lê; item com problema aparece em destaque. Sem checklist, diz onde criar.
 */
function ResumoDaDueDiligence({ studyId, onIrPara }: { studyId: string; onIrPara?: (aba: ImovibAba) => void }) {
    const [itens, setItens] = useState<ImovibLandChecklistItem[] | null>(null);
    useEffect(() => {
        let vivo = true;
        imovibService.listarDueDiligence(studyId).then(l => { if (vivo) setItens(l); }).catch(() => { if (vivo) setItens(null); });
        return () => { vivo = false; };
    }, [studyId]);
    if (!itens) return null;
    const r = resumoDaDueDiligence(itens);
    const comProblema = itens.filter(i => i.status === 'problema');
    return (
        <button
            type="button"
            onClick={() => onIrPara?.('premises')}
            className={`w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 rounded-[10px] border text-sm ${comProblema.length ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-white border-gray-100 text-slate-700'} hover:border-slate-300`}
            title="Abrir Premissas › Terreno"
        >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            {r.total === 0
                ? <span>Due diligence do terreno ainda não começou (Premissas › Terreno).</span>
                : <span>Due diligence: {r.ok} de {r.total} ok{r.problema ? `, ${r.problema} com problema` : ''}.</span>}
            {comProblema.length > 0 && <span className="font-medium">{comProblema.map(i => i.label).join(' · ')}</span>}
        </button>
    );
}

const ImovibExecutiveSummary: React.FC<ImovibExecutiveSummaryProps> = ({ study, onIrPara, onDataChanged }) => {
    const cashFlowData = useImovibMath(study);
    const printRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    // Margem-alvo do cartão "Pontos de equilíbrio": aqui em cima para o Excel usar a mesma.
    const [margemAlvo, setMargemAlvo] = useState<string>(String(IMOVIB_DEFAULTS.margem_alvo_terreno_percent));
    const { showToast } = useToast();

    // Indicadores de decisão (item 2.3 do plano 2026-11-11): VPL e lucro em
    // cartões separados — antes o cartão "Lucro Líquido (VPL)" misturava os dois.
    const tma = premissa(study.discount_rate, IMOVIB_DEFAULTS.discount_rate);
    const ind = useMemo(() => calcularIndicadores(cashFlowData, tma), [cashFlowData, tma]);
    const mesDoEstudo = (m: number | null) => (m == null ? '—' : `Mês ${m}`);

    const exportToExcel = () => {
        try {
            const planilha = montarPlanilhaImovib(study, cashFlowData, { margemAlvoPct: parseFloat(margemAlvo) });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, abaDoExcel(planilha.indicadores, [46, 18, 10, 48]), 'Indicadores');
            XLSX.utils.book_append_sheet(wb, abaDoExcel(planilha.parecer, [34, 40, 18, 16, 10]), 'Parecer');
            XLSX.utils.book_append_sheet(wb, abaDoExcel(planilha.premissas, [22, 36, 12, 10, 60, 30, 12]), 'Premissas');
            XLSX.utils.book_append_sheet(wb, abaDoExcel(planilha.fluxo, [16, 12, 18, 18, ...planilha.fluxo[0].slice(4, -4).map(() => 20), 24, 24, 24, 24]), 'Fluxo de caixa');
            XLSX.utils.book_append_sheet(wb, abaDoExcel(planilha.aportes, [10, 18, 20, 34, 26]), 'Aportes');
            XLSX.writeFile(wb, `Imovib_${nomeDeArquivo(study.name)}_Viabilidade.xlsx`);
        } catch (err) {
            console.error('Error exporting Excel:', err);
            showToast(`Erro ao exportar o fluxo de caixa para Excel: ${(err as Error).message}`, 'error');
        }
    };

    // Item 10.5: relatório completo (12 seções, texto e tabelas de verdade). As listas
    // que o estudo não traz carregado são lidas na hora; o PDF é montado à parte.
    const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
    const exportarRelatorio = async () => {
        setGerandoRelatorio(true);
        try {
            const [comparaveis, riscos, cenarios, dueDiligence, socios, { secoesDoRelatorio }, { pdfDoRelatorio }] = await Promise.all([
                imovibService.listarComparaveis(study.id),
                imovibService.listarRiscos(study.id),
                imovibService.listarCenarios(study.id),
                imovibService.listarDueDiligence(study.id),
                imovibService.listarSocios(study.id),
                import('../utils/imovibRelatorio'),
                import('../utils/imovibRelatorioPdf'),
            ]);
            const pdf = pdfDoRelatorio(secoesDoRelatorio({ study, comparaveis, riscos, cenarios, dueDiligence, socios }), study.name);
            pdf.save(`Relatorio_${nomeDeArquivo(study.name)}.pdf`);
        } catch (err) {
            showToast(`Erro ao gerar o relatório completo: ${(err as Error).message}`, 'error');
        } finally {
            setGerandoRelatorio(false);
        }
    };

    const exportToPDF = async () => {
        if (!printRef.current) return;
        try {
            setIsExporting(true);
            // small delay to allow react to render if we conditionally hid something
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(printRef.current, {
                scale: 1.5, // Slightly lower scale to prevent memory issues on very long pages
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                // Tailwind v4 usa oklch em toda a paleta e o html2canvas aborta com
                // 'unsupported color function "oklch"' — o PDF não saía. Na CÓPIA,
                // as cores viram rgba e as sombras saem (ver utils/html2canvasCores.ts).
                onclone: (_doc, raiz) => { coresCompativeisNaCopia(raiz, { semSombra: true }); },
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95); // Use JPEG for smaller size
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            // margin
            const margin = 10;
            const printableWidth = pdfWidth - (margin * 2);
            const canvasImgHeight = (canvas.height * printableWidth) / canvas.width;

            // Handle multi-page splitting
            let heightLeft = canvasImgHeight;
            let position = margin;

            pdf.addImage(imgData, 'JPEG', margin, position, printableWidth, canvasImgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft >= 0) {
                position = heightLeft - canvasImgHeight + margin; // Shift image up
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', margin, position, printableWidth, canvasImgHeight);
                heightLeft -= pdfHeight;
            }
            pdf.save(`Imovib_${nomeDeArquivo(study.name)}_Viabilidade.pdf`);
        } catch (err) {
            console.error('Error exporting PDF:', err);
            showToast(`Erro ao gerar o PDF do resumo executivo: ${(err as Error).message}`, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white px-6 py-4 rounded-[10px] border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Painel de Viabilidade</h2>
                    <p className="text-gray-500 mt-1 text-sm">Os principais indicadores financeiros consolidados.</p>
                </div>
                {/* Botões compactos (guia §17): h-9, rounded-[6px], font-medium 13px, sentence case. */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
                    >
                        <FileText className="w-[15px] h-[15px]" />
                        Baixar Excel
                    </button>
                    <button
                        onClick={exportToPDF}
                        disabled={isExporting}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-slate-900 text-white hover:bg-slate-800 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-70"
                    >
                        {isExporting ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Download className="w-[15px] h-[15px]" />}
                        {isExporting ? 'Gerando...' : 'Resumo em PDF'}
                    </button>
                    <button
                        onClick={() => void exportarRelatorio()}
                        disabled={gerandoRelatorio}
                        title="Capa e parecer, indicadores, premissas com as fontes, mercado, produto, cronograma, fluxo anual, cenários, riscos, due diligence, tributos, capital e sócios"
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-slate-700 hover:bg-gray-50 border border-gray-200 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-70"
                    >
                        {gerandoRelatorio ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <FileText className="w-[15px] h-[15px]" />}
                        {gerandoRelatorio ? 'Gerando...' : 'Relatório completo'}
                    </button>
                </div>
            </div>

            <ImovibAvisosBanner avisos={cashFlowData.avisos} onIrPara={onIrPara} />

            {/* Item 10.3: parecer e critérios no topo do Resumo (entra no PDF, que é a captura desta tela). */}
            <ImovibParecerCard study={study} resultado={cashFlowData} indicadores={ind} onDataChanged={() => onDataChanged?.()} />
            <ResumoDaDueDiligence studyId={study.id} onIrPara={onIrPara} />

            {/* Printable Container — capturado pelo html2canvas no PDF: nada de backdrop-filter aqui.
                Na tela é só uma coluna (sem fundo nem padding): ocupa a largura toda e os KPIs alinham com
                o card do topo e o banner, como nas outras abas. Fundo, padding e o teto max-w-5xl valem
                só durante a exportação — o PDF encaixa a captura em 190 mm, então sem o teto o texto dele
                dependeria da largura da janela de quem exporta. */}
            <div ref={printRef} className={isExporting ? 'bg-slate-50 p-6 rounded-[10px] space-y-6 max-w-5xl mx-auto' : 'space-y-6'}>
                {/* Visual Header for PDF */}
                {isExporting && (
                    <div className="pb-6 border-b border-gray-200">
                        <div className="flex justify-between items-start">
                            <div>
                                {/* Título do relatório = h1 do guia §20. */}
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{study.name}</h1>
                                <p className="text-gray-500 text-sm mt-1.5">Relatório Executivo de Viabilidade Financeira</p>
                                {/* Item 10.3: o cartão do parecer fica fora da captura (tem campos); aqui sai o registrado. */}
                                <p className="text-gray-700 text-sm mt-2">
                                    Parecer: {study.recommendation ? ROTULO_DO_PARECER[study.recommendation] : 'não registrado'}
                                    {study.recommended_by ? `, por ${study.recommended_by}` : ''}
                                    {study.recommended_at ? ` em ${new Date(study.recommended_at).toLocaleDateString('pt-BR')}` : ''}
                                    {study.recommendation_notes ? ` — ${study.recommendation_notes}` : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* KPIs principais — componente canônico (guia §4) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard
                        label="VPL"
                        value={formatCurrency(cashFlowData.vpl)}
                        sub={`Descontado à TMA de ${tma.toLocaleString('pt-BR')}% a.a.`}
                        icon={<Coins className="w-4 h-4" />}
                        color="emerald"
                    />
                    <KpiCard
                        label="Lucro líquido"
                        value={formatCurrency(ind.lucroLiquido)}
                        sub={ind.margemLiquidaSobreVgv == null ? 'Sem VGV para calcular a margem' : `Margem de ${formatPercent(ind.margemLiquidaSobreVgv * 100)} sobre o VGV`}
                        icon={<Coins className="w-4 h-4" />}
                        color="teal"
                    />
                    <KpiCard
                        label="TIR (Taxa Int. Retorno)"
                        value={`${isNaN(cashFlowData.annualIrr) || !isFinite(cashFlowData.annualIrr)
                            ? 'N/A'
                            : cashFlowData.annualIrr > 999
                                ? '> 999'
                                : cashFlowData.annualIrr.toFixed(2)}% a.a.`}
                        sub="Do acionista, ao ano"
                        icon={<Activity className="w-4 h-4" />}
                        color="blue"
                    />
                    <KpiCard
                        label="Exposição Máxima de Caixa"
                        value={formatCurrency(cashFlowData.maxExposure)}
                        sub="Fundo de caixa ou cheque máximo necessário"
                        icon={<Wallet className="w-4 h-4" />}
                        color="red"
                    />
                </div>

                {/* Indicadores de prazo e de capital (item 2.3) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard
                        label="Payback"
                        value={mesDoEstudo(ind.paybackSimplesMes)}
                        sub={ind.paybackSimplesMes == null ? 'O caixa acumulado não volta ao positivo' : `Descontado: ${mesDoEstudo(ind.paybackDescontadoMes)}`}
                        icon={<Activity className="w-4 h-4" />}
                        color="blue"
                    />
                    <KpiCard
                        label="Múltiplo do capital"
                        value={ind.multiploDoCapital == null ? '—' : `${ind.multiploDoCapital.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×`}
                        sub="Entradas ÷ saídas de caixa"
                        icon={<Coins className="w-4 h-4" />}
                        color="indigo"
                    />
                    <KpiCard
                        label="Retorno sobre o capital"
                        value={ind.retornoSobreCapital == null ? '—' : formatPercent(ind.retornoSobreCapital * 100)}
                        sub="Lucro ÷ exposição máxima"
                        icon={<Wallet className="w-4 h-4" />}
                        color="violet"
                    />
                    <KpiCard
                        label="Mês da exposição máxima"
                        value={mesDoEstudo(ind.mesDaExposicaoMaxima)}
                        sub="Quando o caixa chega ao fundo"
                        icon={<Wallet className="w-4 h-4" />}
                        color="red"
                    />
                </div>

                <ImovibPontosDeEquilibrioCard study={study} margemAlvo={margemAlvo} onMargemAlvo={setMargemAlvo} />

                {/* KPIs secundários */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard
                        label="VGV Total"
                        value={formatCurrency(cashFlowData.vgvTotal)}
                        icon={<Building2 className="w-4 h-4" />}
                        color="indigo"
                    />
                    <KpiCard
                        label="Custo de Construção"
                        value={formatCurrency(cashFlowData.constCostTotal)}
                        icon={<PieChart className="w-4 h-4" />}
                        color="amber"
                    />
                    <KpiCard
                        label="Prazo Total (Meses)"
                        value={`${cashFlowData.duration} meses`}
                        icon={<Activity className="w-4 h-4" />}
                        color="emerald"
                    />
                    <KpiCard
                        label="Custo do Terreno"
                        value={formatCurrency(cashFlowData.landCost)}
                        icon={<Wallet className="w-4 h-4" />}
                        color="orange"
                    />
                </div>

                {/* Recharts Visualization (S-Curve inside summary) */}
                <div className="bg-white rounded-[10px] p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <LineChartIcon className="w-5 h-5 text-indigo-600" />
                            Curva S e Linha de Exposição
                        </h3>
                    </div>
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={cashFlowData.monthlyFlows}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={30}
                                />
                                <YAxis
                                    tickFormatter={(value) => `R$ ${(value / 1000000).toFixed(1)} M`}
                                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    formatter={(value: any) => formatCurrency(Number(value))}
                                    labelStyle={{ fontWeight: 800, color: '#0f172a' }}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 600, fontSize: '13px' }} />
                                <Bar yAxisId={0} dataKey="net" name="Caixa Líquido no Mês" fill="#cbd5e1" radius={[4, 4, 0, 0]} opacity={0.5} />
                                <Line
                                    type="monotone"
                                    dataKey="acc"
                                    name="Exposição de Caixa (Acumulado)"
                                    stroke="#0f172a"
                                    strokeWidth={4}
                                    dot={false}
                                    activeDot={{ r: 8, fill: '#0f172a', stroke: '#fff', strokeWidth: 2 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Extended Sections for PDF Export */}
                {isExporting && (
                    <div className="mt-6 space-y-8 pb-10">
                        {/* Section: CAPEX Master — tabela no padrão do guia §6/§6.11/§7 (só aparece no PDF:
                            sem SortableHeader, porque não há interação na captura). */}
                        <div className="page-break-inside-avoid">
                            <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-4">Master Budget (CAPEX)</h2>
                            <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className={`${CABECALHO_TABELA.fundo} ${CABECALHO_TABELA.texto} font-semibold text-table-header border-b ${CABECALHO_TABELA.linhaDeBaixo}`}>
                                            <th className={`px-6 py-2 border-r ${CABECALHO_TABELA.divisoria}`}>Categoria</th>
                                            <th className={`px-6 py-2 border-r ${CABECALHO_TABELA.divisoria}`}>Descrição</th>
                                            <th className={`px-6 py-2 border-r ${CABECALHO_TABELA.divisoria}`}>Premissa</th>
                                            <th className="px-6 py-2 text-right">No cálculo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {cashFlowData.capexRubricasAtivas ? (
                                            <>
                                                {(study.capex_items || []).map(item => (
                                                    <tr key={item.id}>
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.category}</td>
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">{item.name}</td>
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                                            {item.value_type === 'percent'
                                                                ? `${Number(item.value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% ${BASE_PDF[baseDaRubrica(item)]}`
                                                                : formatCurrency(item.value || 0)}
                                                        </td>
                                                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-medium text-gray-800 text-right">
                                                            {formatCurrency(cashFlowData.capexValorPorRubrica[item.id] || 0)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-gray-50">
                                                    <td colSpan={3} className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">Total das rubricas no cálculo</td>
                                                    <td className="px-6 py-2.5 text-sm font-medium text-gray-800 text-right">{formatCurrency(cashFlowData.capexRubricas.total)}</td>
                                                </tr>
                                            </>
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-2.5 text-center text-sm font-normal text-gray-500">
                                                    {study.capex_mode === 'simplified'
                                                        ? 'CAPEX no modo simplificado: custo total por área × custo/m², sem rubricas.'
                                                        : 'Nenhuma rubrica de CAPEX detalhado. Referenciando custo paramétrico dos blocos.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                )}
            </div> {/* End of printRef */}
        </div>
    );
};

export default ImovibExecutiveSummary;
