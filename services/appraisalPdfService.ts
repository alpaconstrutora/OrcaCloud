import { jsPDF } from 'jspdf';
import {
    AppraisalReport, AppraisalComparable, calculateAppraisal, homogenizedUnitPrice,
    APPRAISAL_FINALIDADE_LABELS, APPRAISAL_OBJETIVO_LABELS, APPRAISAL_METODOLOGIA_LABELS, APPRAISAL_PROPERTY_TYPE_LABELS,
} from './appraisalService';

const PRIMARY: [number, number, number] = [15, 23, 42];
const SECONDARY: [number, number, number] = [37, 99, 235];
const LIGHT_BG: [number, number, number] = [248, 250, 252];
const MARGIN_X = 20;

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');

export function generateAppraisalReportPdf(report: AppraisalReport, comparables: AppraisalComparable[]): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = 25;

    const drawFooter = () => {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('ÒPURA — Laudo de Avaliação de Imóvel — NBR 14653-2', MARGIN_X, pageHeight - 10);
        doc.text(`Página ${doc.internal.pages.length - 1}`, doc.internal.pageSize.getWidth() - MARGIN_X - 10, pageHeight - 10);
    };

    const checkPageBreak = (needed: number) => {
        if (currentY + needed > pageHeight - 20) {
            doc.addPage();
            currentY = 25;
            drawFooter();
        }
    };

    const sectionTitle = (title: string) => {
        checkPageBreak(14);
        doc.setFillColor(...PRIMARY);
        doc.rect(MARGIN_X, currentY, 170, 0.6, 'F');
        currentY += 6;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...SECONDARY);
        doc.text(title, MARGIN_X, currentY);
        currentY += 7;
    };

    const field = (label: string, value?: string | number | null) => {
        checkPageBreak(6);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        doc.text(`${label}:`, MARGIN_X, currentY);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(50, 50, 50);
        doc.text(value != null && value !== '' ? String(value) : '—', MARGIN_X + 55, currentY, { maxWidth: 115 });
        currentY += 6;
    };

    const paragraph = (text: string) => {
        checkPageBreak(12);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(70, 70, 70);
        const lines = doc.splitTextToSize(text, 170);
        doc.text(lines, MARGIN_X, currentY);
        currentY += lines.length * 4.5 + 3;
    };

    drawFooter();

    // ─── Capa ───
    doc.setFillColor(...PRIMARY);
    doc.rect(MARGIN_X, currentY, 170, 2, 'F');
    currentY += 8;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...PRIMARY);
    doc.text('LAUDO DE AVALIAÇÃO DE IMÓVEL', MARGIN_X, currentY);
    currentY += 6;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('ABNT NBR 14653-2 — Avaliação de Bens: Imóveis Urbanos', MARGIN_X, currentY);
    currentY += 10;

    // ─── 1. Identificação ───
    sectionTitle('1. Identificação e Objeto');
    field('Título', report.title);
    field('Solicitante', report.client_name);
    field('Finalidade', APPRAISAL_FINALIDADE_LABELS[report.finalidade]);
    field('Objetivo', APPRAISAL_OBJETIVO_LABELS[report.objetivo]);
    field('Metodologia', APPRAISAL_METODOLOGIA_LABELS[report.metodologia]);
    field('Data-base', fmtDate(report.data_base));
    currentY += 2;

    // ─── 2. Imóvel avaliando ───
    checkPageBreak(20);
    sectionTitle('2. Caracterização do Imóvel Avaliando');
    field('Endereço', report.property_address);
    field('Cidade/UF', [report.property_city, report.property_state].filter(Boolean).join(' / '));
    field('Tipo', report.property_type ? APPRAISAL_PROPERTY_TYPE_LABELS[report.property_type] : undefined);
    field('Tipologia', report.property_typology);
    field('Área privativa (m²)', report.property_area_privativa);
    field('Área total (m²)', report.property_area_total);
    if (report.property_description) {
        currentY += 1;
        paragraph(report.property_description);
    }
    currentY += 2;

    // ─── 3. Diagnóstico de mercado ───
    checkPageBreak(20);
    sectionTitle('3. Diagnóstico do Mercado');
    paragraph(report.diagnostico_mercado || '[Não preenchido]');

    // ─── 4. Amostra de dados de mercado (comparáveis) ───
    checkPageBreak(20);
    sectionTitle('4. Amostra de Dados de Mercado (Comparáveis)');
    if (comparables.length === 0) {
        paragraph('Nenhum comparável cadastrado.');
    } else {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...PRIMARY);
        checkPageBreak(6);
        doc.text('Endereço', MARGIN_X, currentY);
        doc.text('Fonte', MARGIN_X + 70, currentY);
        doc.text('Área (m²)', MARGIN_X + 90, currentY);
        doc.text('Preço total', MARGIN_X + 115, currentY);
        doc.text('R$/m² homog.', MARGIN_X + 145, currentY);
        currentY += 4;
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(50, 50, 50);
        comparables.forEach(c => {
            checkPageBreak(5);
            const unitPrice = homogenizedUnitPrice(c);
            doc.text(c.address.slice(0, 38), MARGIN_X, currentY);
            doc.text(c.source === 'oferta' ? 'Oferta' : 'Venda', MARGIN_X + 70, currentY);
            doc.text(String(c.area), MARGIN_X + 90, currentY);
            doc.text(fmtBRL(c.price_total), MARGIN_X + 115, currentY);
            doc.text(fmtBRL(unitPrice), MARGIN_X + 145, currentY);
            currentY += 4.5;
        });
    }
    currentY += 4;

    // ─── 5. Tratamento estatístico e resultado ───
    checkPageBreak(30);
    sectionTitle('5. Tratamento dos Dados e Resultado');
    const targetArea = report.property_area_privativa ?? report.property_area_total ?? 0;
    const calc = calculateAppraisal(comparables, targetArea);
    field('Nº de comparáveis (n)', calc.stats.n);
    field('Preço unitário médio homogeneizado (R$/m²)', calc.stats.n > 0 ? fmtBRL(calc.stats.mean) : '—');
    field('Desvio-padrão (R$/m²)', calc.stats.n > 0 ? fmtBRL(calc.stats.stdDev) : '—');
    field('Coeficiente de variação', calc.stats.n > 0 ? `${calc.stats.coefficientOfVariation.toFixed(1)}%` : '—');
    if (calc.regression) {
        field('Regressão linear (preço x área)', `R² = ${calc.regression.rSquared.toFixed(3)}`);
    }
    currentY += 2;

    doc.setFillColor(...LIGHT_BG);
    doc.rect(MARGIN_X, currentY, 170, 26, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PRIMARY);
    doc.text('Valor de mercado estimado', MARGIN_X + 5, currentY + 8);
    doc.setFontSize(14);
    doc.setTextColor(...SECONDARY);
    doc.text(fmtBRL(report.valor_estimado ?? calc.valorEstimado), MARGIN_X + 5, currentY + 17);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Intervalo (95%): ${fmtBRL(report.valor_minimo ?? calc.valorMinimo)} a ${fmtBRL(report.valor_maximo ?? calc.valorMaximo)}`, MARGIN_X + 5, currentY + 23);
    currentY += 30;

    field('Grau de fundamentação (indicativo)', report.grau_fundamentacao ?? calc.grauFundamentacao);
    currentY += 1;
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 100, 60);
    const disclaimer = doc.splitTextToSize(
        'O grau de fundamentação acima é uma estimativa indicativa baseada em número de amostras e ' +
        'coeficiente de variação. A classificação oficial conforme o Anexo A da NBR 14653-2 exige testes ' +
        'adicionais de significância dos coeficientes de regressão e graus de liberdade, e deve ser validada ' +
        'e assumida pelo engenheiro/avaliador responsável técnico (RT).',
        170,
    );
    doc.text(disclaimer, MARGIN_X, currentY);
    currentY += disclaimer.length * 3.6 + 6;

    // ─── 6. Premissas e ressalvas ───
    checkPageBreak(20);
    sectionTitle('6. Pressupostos, Ressalvas e Fatores Limitantes');
    paragraph(report.premissas_ressalvas || '[Não preenchido]');

    // ─── 7. Responsável técnico ───
    checkPageBreak(30);
    sectionTitle('7. Responsabilidade Técnica');
    field('Responsável técnico', report.responsavel_tecnico);
    field('CREA/CAU', report.crea_cau);
    field('ART/RRT nº', report.art_numero);
    currentY += 15;
    checkPageBreak(20);
    doc.line(MARGIN_X + 45, currentY, MARGIN_X + 125, currentY);
    currentY += 5;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PRIMARY);
    doc.text((report.responsavel_tecnico ?? '').toUpperCase() || '[RESPONSÁVEL TÉCNICO]', MARGIN_X + 85, currentY, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Engenheiro/Arquiteto Avaliador — Responsável Técnico', MARGIN_X + 85, currentY + 5, { align: 'center' });

    const safeTitle = report.title.replace(/[^\w\-]+/g, '_').slice(0, 60);
    doc.save(`Laudo_Avaliacao_${safeTitle}.pdf`);
}
