import { jsPDF } from 'jspdf';

// ==========================================================================
// PDF da proposta (F3 do Plano de Vendas). Client-side, sem storage: gera o
// documento e dispara o download. NUNCA imprime custo/margem — a proposta é
// voltada ao comprador; custo é dado de gestão (ver fn_unit_cost_basis).
// ==========================================================================

const PRIMARY = [30, 64, 175] as [number, number, number];   // blue-800
const LIGHT   = [241, 245, 249] as [number, number, number]; // slate-100
const DARK    = [15, 23, 42] as [number, number, number];    // slate-900
const GRAY    = [100, 116, 139] as [number, number, number]; // slate-500

const fmtBRL = (v?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v) || 0);

export interface ProposalPdfData {
    id?: string;
    version?: number;
    property_name?: string;
    organization_name?: string;
    buyer_name?: string;
    unit_price?: number;
    discount_pct?: number;
    total_value?: number;
    down_payment?: number;
    monthly_installments?: number;
    monthly_value?: number;
    balloon_value?: number;
    financing_value?: number;
    notes?: string;
    created_at?: string;
}

function line(doc: jsPDF, label: string, value: string, y: number, W: number): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text(label, 16, y);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.text(value, W - 16, y, { align: 'right' });
    return y + 8;
}

/** Monta o PDF e devolve o Blob (para download ou preview). */
export function buildProposalPdf(p: ProposalPdfData): Blob {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();

    // Cabeçalho
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Proposta de compra', 14, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(p.organization_name || '', 14, 20);
    if (p.version) doc.text(`Versão ${p.version}`, W - 14, 20, { align: 'right' });

    let y = 40;
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(p.property_name || 'Unidade', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Comprador: ${p.buyer_name || '—'}`, 14, y);
    if (p.created_at) {
        doc.text(new Date(p.created_at).toLocaleDateString('pt-BR'), W - 14, y, { align: 'right' });
    }
    y += 12;

    // Bloco de valores
    doc.setFillColor(...LIGHT);
    doc.rect(14, y - 6, W - 28, 8, 'F');
    doc.setTextColor(...PRIMARY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('CONDIÇÕES', 16, y - 0.5);
    y += 8;

    y = line(doc, 'Preço de tabela', fmtBRL(p.unit_price), y, W);
    if (p.discount_pct) y = line(doc, `Desconto (${p.discount_pct}%)`, `- ${fmtBRL((p.unit_price || 0) * (p.discount_pct || 0) / 100)}`, y, W);
    y = line(doc, 'Valor total', fmtBRL(p.total_value), y, W);
    y += 2;
    y = line(doc, 'Entrada', fmtBRL(p.down_payment), y, W);
    if (p.financing_value) y = line(doc, 'Financiamento', fmtBRL(p.financing_value), y, W);
    if (p.monthly_installments) y = line(doc, `Parcelas mensais (${p.monthly_installments}x)`, fmtBRL(p.monthly_value), y, W);
    if (p.balloon_value) y = line(doc, 'Intermediária / balão', fmtBRL(p.balloon_value), y, W);

    if (p.notes) {
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...PRIMARY);
        doc.text('OBSERVAÇÕES', 16, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(doc.splitTextToSize(p.notes, W - 32), 16, y);
    }

    // Rodapé
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(
        'Proposta comercial — sujeita a aprovação. Não constitui contrato.',
        W / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' }
    );

    return doc.output('blob');
}

/** Gera e dispara o download do PDF da proposta. */
export function downloadProposalPdf(p: ProposalPdfData): void {
    const blob = buildProposalPdf(p);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proposta-${(p.property_name || 'unidade').replace(/\s+/g, '-').toLowerCase()}-v${p.version || 1}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
