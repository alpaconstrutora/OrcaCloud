import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Property, PropertyDeal, Client, Organization, PaymentInstallment } from '../types';

// Rótulos de Forma/Tipo de Pagamento — mesma lista usada no Plano de Pagamento
// do DealModal (INSTALLMENT_TYPE_LABELS), duplicada aqui em vez de importada
// porque aquele mapa vive dentro de um componente, e este service não deve
// depender de componentes.
const PAYMENT_TYPE_LABELS: Record<string, string> = {
    PIX: 'PIX', TED: 'TED', DOC: 'DOC', DINHEIRO: 'Dinheiro', CHEQUE: 'Cheque', PERMUTA: 'Permuta',
};
const INSTALLMENT_TYPE_LABELS: Record<string, string> = {
    SINAL: 'Sinal', MENSAL: 'Mensal', TRIMESTRAL: 'Trimestral', SEMESTRAL: 'Semestral', ANUAL: 'Anual', AVULSA: 'Avulsa',
};

const fmtCurrency = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
const fmtDate = (d?: string) => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR') : '-';

export const propertyExportService = {
    generateProposalPDF: (deal: PropertyDeal, property: Property, client: Client | undefined, organization: Organization | null) => {
        const doc = new jsPDF();
        const date = new Date().toLocaleDateString('pt-BR');

        // Header Opura Design
        if (organization?.logoUrl) {
            try {
                doc.addImage(organization.logoUrl, 'JPEG', 14, 10, 30, 30);
            } catch (e) {
                console.error("Logo error:", e);
            }
        }

        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59); // Slate 800
        doc.text('PROPOSTA COMERCIAL', 50, 25);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Data de Emissão: ${date}`, 50, 32);
        doc.text(`Referência: #${deal.id.substring(0, 8).toUpperCase()}`, 50, 37);

        let currentY = 50;

        // Section: Imóvel
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY, 182, 40, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('DETALHES DO IMÓVEL', 20, currentY + 10);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nome: ${property.name}`, 20, currentY + 20);
        doc.text(`Endereço: ${property.address}`, 20, currentY + 25);
        doc.text(`Tipo: ${property.type} | Área Total: ${property.total_area || property.area} m²`, 20, currentY + 30);

        currentY += 50;

        // Section: Cliente
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('DADOS DO CLIENTE', 14, currentY);
        currentY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nome/Razão Social: ${client?.name || 'Não Identificado'}`, 14, currentY);
        doc.text(`CPF/CNPJ: ${client?.document || '-'}`, 14, currentY + 5);
        doc.text(`Email: ${client?.email || '-'} | Telefone: ${client?.phone || '-'}`, 14, currentY + 10);

        currentY += 25;

        // Section: Condições Negociadas
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('CONDIÇÕES DA NEGOCIAÇÃO', 14, currentY);
        currentY += 5;

        autoTable(doc, {
            startY: currentY,
            head: [['Descrição', 'Valor Negociado']],
            body: [
                ['Tipo de Negociação', deal.type === 'SALE' ? 'Venda' : 'Aluguel'],
                ['Valor Total', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)],
                ['Data Prevista', new Date(deal.date).toLocaleDateString('pt-BR')],
                ['Status Atual', deal.status]
            ],
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] },
            styles: { fontSize: 10 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;

        // Section: Plano de Pagamento — Entrada + cada parcela (data, forma e tipo
        // de pagamento, valor), na mesma ordem cronológica em que o cliente vai
        // efetivamente pagar (independe da ordem de edição interna do Plano de
        // Pagamento no app, que reflete posição de inserção, não data).
        const hasPaymentPlan = (deal.down_payment || 0) > 0 || (deal.custom_installments?.length ?? 0) > 0;
        if (hasPaymentPlan) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('PLANO DE PAGAMENTO', 14, currentY);
            currentY += 5;

            const rows: string[][] = [];
            let runningTotal = 0;

            if ((deal.down_payment || 0) > 0) {
                rows.push([
                    'Entrada',
                    fmtDate(deal.date),
                    PAYMENT_TYPE_LABELS[deal.down_payment_payment_type || ''] || '-',
                    INSTALLMENT_TYPE_LABELS[deal.down_payment_installment_type || ''] || 'Sinal',
                    fmtCurrency(deal.down_payment || 0),
                ]);
                runningTotal += deal.down_payment || 0;
            }

            const installments: PaymentInstallment[] = [...(deal.custom_installments || [])]
                .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
            installments.forEach((inst, idx) => {
                // Nunca usa inst.description aqui: é um campo interno (às vezes carrega
                // texto legado tipo "Receita: Venda - Parcela 1/1 - Deal #..." herdado
                // de uma sincronização antiga com o financeiro) — não é seguro mostrar
                // pro cliente. Avulsa tem nome fixo; as demais usam posição sequencial.
                const label = inst.installmentType === 'AVULSA' ? 'Parcela Avulsa' : `Parcela ${idx + 1}`;
                rows.push([
                    label,
                    fmtDate(inst.dueDate),
                    PAYMENT_TYPE_LABELS[inst.paymentType || ''] || '-',
                    INSTALLMENT_TYPE_LABELS[inst.installmentType || ''] || '-',
                    fmtCurrency(inst.value),
                ]);
                runningTotal += inst.value;
            });

            autoTable(doc, {
                startY: currentY,
                head: [['Parcela', 'Vencimento', 'Forma de Pagto.', 'Tipo', 'Valor']],
                body: rows,
                foot: [['', '', '', 'Total', fmtCurrency(runningTotal)]],
                theme: 'grid',
                headStyles: { fillColor: [30, 41, 59] },
                footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
                styles: { fontSize: 9 },
            });

            currentY = (doc as any).lastAutoTable.finalY + 15;
        }

        // Notes
        if (deal.notes) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('OBSERVAÇÕES:', 14, currentY);
            doc.setFont('helvetica', 'normal');
            doc.text(deal.notes, 14, currentY + 5, { maxWidth: 180 });
            currentY += 20;
        }

        // Signatures
        currentY = 250;
        doc.setDrawColor(200);
        doc.line(14, currentY, 80, currentY);
        doc.line(116, currentY, 182, currentY);

        doc.setFontSize(8);
        doc.text('Assinatura do Responsável', 14, currentY + 5);
        doc.text('Assinatura do Cliente', 116, currentY + 5);

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Documento gerado automaticamente pela plataforma Opura.`, 105, 285, { align: 'center' });

        doc.save(`Proposta_${property.name.replace(/\s+/g, '_')}_${deal.id.substring(0, 5)}.pdf`);
    }
};
