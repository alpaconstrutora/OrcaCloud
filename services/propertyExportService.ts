import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Property, PropertyDeal, Client, Organization } from '../types';

export const propertyExportService = {
    generateProposalPDF: (deal: PropertyDeal, property: Property, client: Client | undefined, organization: Organization | null) => {
        const doc = new jsPDF();
        const date = new Date().toLocaleDateString('pt-BR');

        // Header OrçaCloud Design
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

        currentY = (doc as any).lastAutoTable.finalY + 20;

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
        doc.text(`Documento gerado automaticamente pela plataforma OrçaCloud.`, 105, 285, { align: 'center' });

        doc.save(`Proposta_${property.name.replace(/\s+/g, '_')}_${deal.id.substring(0, 5)}.pdf`);
    }
};
