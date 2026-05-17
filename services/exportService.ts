import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
// @ts-ignore
import { saveAs } from 'file-saver';
import { ProjectSettings, BudgetEntry } from '../types';

export const exportService = {
    generateViabilityReport(settings: ProjectSettings, financialData: { totalValue: number; items: BudgetEntry[] }, simulation: { bdi: number; profit: number; costPerM2: number }) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFillColor(37, 99, 235); // Blue 600
        doc.rect(0, 0, pageWidth, 40, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('ESTUDO DE VIABILIDADE PARAMÉTRICA', 15, 25);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 15, 33);

        // Project Info
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.text('1. DADOS DO PROJETO', 15, 55);

        const projectInfo = [
            ['Projeto:', settings.name],
            ['Cliente:', settings.client || 'N/A'],
            ['Localização:', `${settings.location} - ${settings.city || ''}`],
            ['Padrão CUB:', settings.standard || 'R8-N'],
            ['Área Total:', `${settings.area} m²`],
            ['Referência:', settings.referenceMonth || 'Atual']
        ];

        autoTable(doc, {
            startY: 60,
            head: [],
            body: projectInfo,
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
        });

        // Summary Results
        const currentY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.text('2. RESUMO FINANCEIRO (SIMULADO)', 15, currentY);

        const summaryData = [
            ['Valor Total Estimado:', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financialData.totalValue)],
            ['Custo por m²:', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(simulation.costPerM2)],
            ['BDI Aplicado:', `${simulation.bdi}%`],
            ['Margem de Lucro:', `${simulation.profit}%`]
        ];

        autoTable(doc, {
            startY: currentY + 5,
            head: [['Descrição', 'Valor']],
            body: summaryData,
            theme: 'striped',
            headStyles: { fillColor: [37, 99, 235] }
        });

        // Distribution
        const distY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.text('3. DISTRIBUIÇÃO POR ETAPA', 15, distY);

        const distData = financialData.items.map(item => [
            (item.subPhase || '').split('.').slice(2).join('.').trim() || item.subPhase || 'Etapa Geral',
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.sinapiItem.price),
            `${((item.sinapiItem.price / (financialData.totalValue / (1 + simulation.profit / 100))) * 100).toFixed(1)}%`
        ]);

        autoTable(doc, {
            startY: distY + 5,
            head: [['Etapa', 'Valor Estimado', '%']],
            body: distData,
            theme: 'grid',
            headStyles: { fillColor: [75, 85, 99] }
        });

        // Footer / Disclaimer
        const footerY = doc.internal.pageSize.getHeight() - 30;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Nota: Este documento é uma estimativa preliminar baseada na NBR 12.721 e no CUB regional.', 15, footerY);
        doc.text('OrçaCloud SaaS - Inteligência em Orçamentação de Obras', 15, footerY + 5);

        doc.save(`Viabilidade_${settings.name.replace(/\s+/g, '_')}.pdf`);
    },

    generateFinancialPDF(data: any[], settings: ProjectSettings, options: { organization?: any; title: string; fileName: string }, type: 'EXTRATO' | 'FLUXO') {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        const primaryColor: [number, number, number] = [30, 41, 59]; // Slate 800
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, pageWidth, 35, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(options.title.toUpperCase(), 15, 22);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`${options.organization?.name || 'ORÇACLOUD'} | Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 15, 30);

        // Project Info Section
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('DADOS DO PROJETO/CONTRATO', 15, 45);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nome: ${settings.name}`, 15, 50);
        doc.text(`Cliente: ${settings.client || 'N/A'}`, 15, 55);

        // Table Content
        let tableHead: string[][] = [];
        let tableBody: any[][] = [];

        if (type === 'EXTRATO') {
            tableHead = [['Data/Venc.', 'Descrição', 'Valor', 'Status']];
            tableBody = data.map(item => [
                new Date(item.dueDate || item.date).toLocaleDateString('pt-BR'),
                item.description + (item.dealId ? ` (#${item.dealId.substring(0, 8).toUpperCase()})` : ''),
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value),
                item.status === 'PAID' ? 'PAGO' : 'PENDENTE'
            ]);
        } else {
            tableHead = [['Mês', 'Receita', 'Despesa', 'Saldo']];
            tableBody = data.map(item => [
                item.name,
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.receita),
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.despesa),
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.saldo)
            ]);
        }

        autoTable(doc, {
            startY: 65,
            head: tableHead,
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: primaryColor, fontSize: 9 },
            styles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        // Footer
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('Relatório gerado via OrçaCloud Financial Suite.', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        doc.save(`${options.fileName}.pdf`);
    },

    generateFinancialExcel(data: any[], settings: ProjectSettings, options: { organization?: any; fileName: string }, type: 'EXTRATO' | 'FLUXO') {
        let exportData: any[] = [];

        if (type === 'EXTRATO') {
            exportData = data.map(item => ({
                'Data/Vencimento': new Date(item.dueDate || item.date).toLocaleDateString('pt-BR'),
                'Descrição': item.description,
                'ID Contrato': item.dealId || '-',
                'Valor': item.value,
                'Status': item.status === 'PAID' ? 'Pago' : 'Pendente'
            }));
        } else {
            exportData = data.map(item => ({
                'Mês': item.name,
                'Receita (R$)': item.receita,
                'Despesa (R$)': item.despesa,
                'Saldo (R$)': item.saldo
            }));
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        saveAs(blob, `${options.fileName}.xlsx`);
    },

    generateReceiptPDF(installment: any, settings: ProjectSettings, organization: any) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const fmtPrice = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        // Header
        doc.setFillColor(16, 185, 129); // Emerald 500
        doc.rect(0, 0, pageWidth, 30, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('RECIBO DE PAGAMENTO', pageWidth / 2, 20, { align: 'center' });

        // Body
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');

        const margin = 20;
        let y = 50;

        doc.setFont('helvetica', 'bold');
        doc.text('NÚMERO DO RECIBO:', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(`#${(installment.id || '').substring(0, 8).toUpperCase()}`, margin + 50, y);

        y += 15;
        doc.setFont('helvetica', 'bold');
        doc.text('VALOR:', margin, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(fmtPrice(installment.value), margin + 50, y);

        y += 20;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        const text = `Recebemos de ${installment.clientName || 'Cliente'}, a importância de ${fmtPrice(installment.value)}, referente a ${installment.description} do imóvel ${installment.propertyName || settings.name}.`;
        const splitText = doc.splitTextToSize(text, pageWidth - (margin * 2));
        doc.text(splitText, margin, y);

        y += 30;
        doc.text(`Data do Pagamento: ${new Date(installment.paymentDate || new Date()).toLocaleDateString('pt-BR')}`, margin, y);

        y += 40;
        // Signature line
        doc.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
        doc.setFontSize(10);
        doc.text(organization?.name || 'ORÇACLOUD', pageWidth / 2, y + 5, { align: 'center' });
        doc.setFontSize(8);
        doc.text(organization?.cnpj || '', pageWidth / 2, y + 10, { align: 'center' });

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Esse recibo é gerado eletronicamente via OrçaCloud Suite.', pageWidth / 2, doc.internal.pageSize.getHeight() - 15, { align: 'center' });

        doc.save(`Recibo_${(installment.id || '').substring(0, 8)}.pdf`);
    },

    generatePropertyContractPDF(deal: any, settings: ProjectSettings, organization: any) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        let y = 40;

        const fmtPrice = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        // Professional Header
        doc.setFillColor(30, 41, 59); // Slate 800
        doc.rect(0, 0, pageWidth, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(`CONTRATO DE ${deal.type === 'SALE' ? 'COMPRA E VENDA' : 'LOCAÇÃO'} DE IMÓVEL`, pageWidth / 2, 20, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        const addSection = (title: string, content: string) => {
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin, y);
            y += 7;
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(content, pageWidth - (margin * 2));
            doc.text(lines, margin, y);
            y += (lines.length * 5) + 10;
        };

        // 1. Identification
        addSection('1. DAS PARTES',
            `VENDEDOR/LOCADOR: ${organization?.name || 'ORÇACLOUD'}, inscrito no CNPJ sob nº ${organization?.cnpj || '...'}, com sede em ${organization?.address?.city || 'Brasil'}.\n` +
            `COMPRADOR/LOCATÁRIO: ${deal.client_name || 'CLIENTE'}, inscrito no CPF/CNPJ sob nº ..., residente e domiciliado em ...`
        );

        // 2. Object
        addSection('2. DO OBJETO',
            `O presente contrato tem por objeto o imóvel ${deal.property_name || 'UNIDADE'}, localizado em ${settings.location || 'Endereço do Projeto'}, com área de ${settings.area || '...'} m².`
        );

        // 3. Price and Payment
        addSection('3. DO PREÇO E FORMA DE PAGAMENTO',
            `O valor total da negociação é de ${fmtPrice(deal.value || 0)}. O pagamento será realizado da seguinte forma: ${deal.payment_method || 'Parcelado'}, em ${deal.installments || 1} parcelas.`
        );

        // 4. General Clauses
        addSection('4. DAS CLÁUSULAS GERAIS',
            `O presente instrumento é regido pelas leis vigentes na República Federativa do Brasil. As partes elegem o foro da comarca de ${organization?.address?.city || 'sua cidade'} para dirimir quaisquer dúvidas oriundas deste contrato.`
        );

        y += 20;
        // Signature
        doc.line(margin, y, margin + 70, y);
        doc.text('REPRESENTANTE LEGAL', margin, y + 5);

        doc.line(pageWidth - margin - 70, y, pageWidth - margin, y);
        doc.text('CLIENTE / CONTRATANTE', pageWidth - margin - 70, y + 5);

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Documento gerado eletronicamente em ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        doc.save(`Contrato_${deal.type}_${(deal.id || '').substring(0, 8)}.pdf`);
    },

    async generatePDF(budget: BudgetEntry[], settings: ProjectSettings, options: { organization?: any; fileName: string; showNatureBreakdown?: boolean; auxiliaryItems?: Map<string, any> }, type: 'ANALYTIC' | 'SYNTHETIC' | 'INPUTS') {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const primaryColor: [number, number, number] = [30, 64, 175]; // Blue 800

        let currentY = 15;

        // Calculate Totals Early
        const calculateItemsTotal = (items: BudgetEntry[]) => {
            return items.reduce((acc, item) => {
                const price = item.sinapiItem?.price || 0;
                const quantity = item.quantity || 0;
                const bdi = item.bdi ?? (settings.bdi || 0);
                return acc + (quantity * price * (1 + bdi / 100));
            }, 0);
        };
        const totalGlobal = calculateItemsTotal(budget);
        const fmtMoney = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
        const cleanLabel = (label: string) => label.replace(/^\d+(\.\d+)*\.\s*/, '');

        // 1. Top Header (Logo & Identification)
        if (options.organization?.logoUrl) {
            try {
                const base64 = await this.urlToBase64(options.organization.logoUrl);
                doc.addImage(base64, 'JPEG', 15, currentY, 22, 14, undefined, 'FAST');
            } catch (e) { console.warn("Failed to add logo to PDF", e); }
        }

        doc.setTextColor(31, 41, 55);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const orgName = (options.organization?.name || settings.name).toUpperCase();
        doc.text(orgName, options.organization?.logoUrl ? 42 : 15, currentY + 4);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        if (options.organization?.cnpj) {
            doc.text(`CNPJ: ${options.organization.cnpj}`, options.organization?.logoUrl ? 42 : 15, currentY + 8);
        }
        doc.text(`Gerado via OrçaCloud em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, options.organization?.logoUrl ? 42 : 15, currentY + 12);

        // Total Global box
        doc.setFillColor(243, 244, 246);
        doc.roundedRect(pageWidth - 75, currentY, 60, 16, 1.5, 1.5, 'F');
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text('VALOR TOTAL ESTIMADO', pageWidth - 70, currentY + 5);
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(fmtMoney(totalGlobal), pageWidth - 70, currentY + 11);

        currentY += 20;
        doc.setDrawColor(229, 231, 235);
        doc.line(15, currentY, pageWidth - 15, currentY);
        currentY += 5;

        // 2. Project Context Table
        const projectInfo = [
            ['CLIENTE:', settings.client || '—', 'BASE REFERÊNCIA:', settings.database || 'SINAPI'],
            ['LOCAL:', settings.location || '—', 'DATA REFERÊNCIA:', settings.referenceMonth || '—'],
            ['CIDADE/ESTADO:', `${settings.city || '—'} / ${settings.state || '—'}`, 'ENCARGOS:', settings.socialChargesMode || '—'],
            ['ÁREA TOTAL:', `${settings.area || 0} m²`, 'BDI (GLOBAL):', `${settings.bdi || 0}%`]
        ];

        autoTable(doc, {
            startY: currentY,
            body: projectInfo,
            theme: 'plain',
            styles: { fontSize: 7, cellPadding: 1, textColor: [55, 65, 81] },
            columnStyles: {
                0: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 25 },
                1: { cellWidth: 75 },
                2: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 30 },
                3: {}
            },
            margin: { left: 15 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 8;

        // 3. Build Table Structure
        const head = [['Item', 'Base', 'Código', 'Descrição', 'Unid', 'Qtd', 'Unitário', 'Total']];
        const rawRows: any[] = [];

        if (type === 'INPUTS') {
            budget.forEach((item, i) => {
                const r: any = [
                    (i + 1).toString(),
                    item.sinapiItem?.isOverride ? 'PRÓP.' : 'SINAPI',
                    item.sinapiItem?.code || '-',
                    item.sinapiItem?.description || 'Item sem descrição',
                    item.sinapiItem?.unit || '-',
                    item.quantity.toLocaleString('pt-BR'),
                    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(item.sinapiItem?.price || 0),
                    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(item.quantity * (item.sinapiItem?.price || 0))
                ];
                r.rowType = 'ITEM';
                rawRows.push(r);
            });
        } else {
            (settings.wbs || []).forEach((group, gIndex) => {
                const gCode = String(gIndex + 1).padStart(2, '0');
                const groupItems = budget.filter(b => b.group === group.name);
                const gTotal = calculateItemsTotal(groupItems);

                const gRow: any = [gCode, '', '', cleanLabel(group.name).toUpperCase(), '', '', '', fmtMoney(gTotal)];
                gRow.rowType = 'GROUP';
                rawRows.push(gRow);

                (group.phases || []).forEach((phase, pIndex) => {
                    const pCode = `${gCode}.${String(pIndex + 1).padStart(2, '0')}`;
                    const phaseItems = budget.filter(b => b.group === group.name && b.phase === phase.name);
                    const pTotal = calculateItemsTotal(phaseItems);

                    const pRow: any = [pCode, '', '', cleanLabel(phase.name).toUpperCase(), '', '', '', fmtMoney(pTotal)];
                    pRow.rowType = 'PHASE';
                    rawRows.push(pRow);

                    (phase.subPhases || []).forEach((subPhase, spIndex) => {
                        const spCode = `${pCode}.${String(spIndex + 1).padStart(2, '0')}`;
                        const items = budget.filter(b => b.group === group.name && b.phase === phase.name && b.subPhase === subPhase);
                        const spTotal = calculateItemsTotal(items);

                        const spRow: any = [spCode, '', '', cleanLabel(subPhase).toUpperCase(), '', '', '', fmtMoney(spTotal)];
                        spRow.rowType = 'SUBPHASE';
                        rawRows.push(spRow);

                        items.forEach((item, iIdx) => {
                            const itemBdi = item.bdi ?? (settings.bdi || 0);
                            const basePrice = item.sinapiItem?.price || 0;
                            const finalTotal = item.quantity * basePrice * (1 + itemBdi / 100);

                            const iRow: any = [
                                `${spCode}.${String(iIdx + 1).padStart(2, '0')}`,
                                item.sinapiItem?.isOverride ? 'PRÓP.' : 'SINAPI',
                                item.sinapiItem?.code || '-',
                                item.sinapiItem?.description || 'Sem descrição',
                                item.sinapiItem?.unit || '-',
                                item.quantity.toLocaleString('pt-BR'),
                                new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(basePrice),
                                new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(finalTotal)
                            ];
                            iRow.rowType = 'ITEM';
                            rawRows.push(iRow);
                        });
                    });
                });
            });
        }

        autoTable(doc, {
            startY: currentY,
            head: head,
            body: rawRows,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235], fontSize: 7, fontStyle: 'bold', halign: 'center', textColor: [255, 255, 255] },
            styles: { fontSize: 6, cellPadding: 1.2, font: 'helvetica' },
            columnStyles: {
                0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                1: { cellWidth: 12, halign: 'center' },
                2: { cellWidth: 14, halign: 'center' },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 8, halign: 'center' },
                5: { cellWidth: 12, halign: 'center' },
                6: { cellWidth: 18, halign: 'right' },
                7: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
            },
            didParseCell: (data) => {
                const rowType = (data.row.raw as any).rowType;
                if (rowType === 'GROUP') {
                    data.cell.styles.fillColor = [30, 58, 138]; // Slate 800 equiv
                    data.cell.styles.textColor = [255, 255, 255];
                    data.cell.styles.fontStyle = 'bold';
                } else if (rowType === 'PHASE') {
                    data.cell.styles.fillColor = [243, 244, 246]; // Gray 100
                    data.cell.styles.textColor = [31, 41, 55];
                    data.cell.styles.fontStyle = 'bold';
                } else if (rowType === 'SUBPHASE') {
                    data.cell.styles.fillColor = [255, 255, 255];
                    data.cell.styles.textColor = [75, 85, 99];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        // Footer page numbers
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(6);
            doc.setTextColor(156, 163, 175);
            doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
        }

        doc.save(`${options.fileName}.pdf`);
    },

    generateExcel(budget: BudgetEntry[], settings: ProjectSettings, options: { organization?: any; fileName: string; showNatureBreakdown?: boolean; auxiliaryItems?: Map<string, any> }, type: 'ANALYTIC' | 'SYNTHETIC' | 'INPUTS') {
        const excelRows: any[] = [];
        
        const calculateItemsTotal = (items: BudgetEntry[]) => {
            return items.reduce((acc, item) => {
                const price = item.sinapiItem?.price || 0;
                const quantity = item.quantity || 0;
                const bdi = item.bdi ?? (settings.bdi || 0);
                return acc + (quantity * price * (1 + bdi / 100));
            }, 0);
        };
        const cleanLabel = (label: string) => label.replace(/^\d+(\.\d+)*\.\s*/, '');

        if (type === 'INPUTS') {
            budget.forEach((item, i) => {
                excelRows.push({
                    'Item': i + 1,
                    'Fonte': item.sinapiItem?.isOverride ? 'PRÓPRIA' : 'SINAPI',
                    'Código': item.sinapiItem?.code || '',
                    'Descrição': item.sinapiItem?.description || '',
                    'Unidade': item.sinapiItem?.unit || '',
                    'Quantidade': item.quantity,
                    'Preço Unitário (R$)': item.sinapiItem?.price || 0,
                    'Total (R$)': item.quantity * (item.sinapiItem?.price || 0)
                });
            });
        } else {
            (settings.wbs || []).forEach((group, gIndex) => {
                const gCode = String(gIndex + 1).padStart(2, '0');
                const gTotal = calculateItemsTotal(budget.filter(b => b.group === group.name));
                
                excelRows.push({
                    'Item': gCode,
                    'Descrição': cleanLabel(group.name).toUpperCase(),
                    'Total (R$)': gTotal
                });

                (group.phases || []).forEach((phase, pIndex) => {
                    const pCode = `${gCode}.${String(pIndex + 1).padStart(2, '0')}`;
                    const pTotal = calculateItemsTotal(budget.filter(b => b.group === group.name && b.phase === phase.name));
                    
                    excelRows.push({
                        'Item': pCode,
                        'Descrição': `  ${cleanLabel(phase.name).toUpperCase()}`,
                        'Total (R$)': pTotal
                    });

                    (phase.subPhases || []).forEach((subPhase, spIndex) => {
                        const spCode = `${pCode}.${String(spIndex + 1).padStart(2, '0')}`;
                        const items = budget.filter(b => b.group === group.name && b.phase === phase.name && b.subPhase === subPhase);
                        const spTotal = calculateItemsTotal(items);
                        
                        excelRows.push({
                            'Item': spCode,
                            'Descrição': `    ${cleanLabel(subPhase).toUpperCase()}`,
                            'Total (R$)': spTotal
                        });

                        items.forEach((item, iIdx) => {
                            const itemBdi = item.bdi ?? (settings.bdi || 0);
                            const basePrice = item.sinapiItem?.price || 0;
                            const finalTotal = item.quantity * basePrice * (1 + itemBdi / 100);
                            
                            excelRows.push({
                                'Item': `${spCode}.${String(iIdx + 1).padStart(2, '0')}`,
                                'Fonte': item.sinapiItem?.isOverride ? 'PRÓPRIA' : 'SINAPI',
                                'Código': item.sinapiItem?.code || '',
                                'Descrição': `      ${item.sinapiItem?.description || ''}`,
                                'Unidade': item.sinapiItem?.unit || '',
                                'Quantidade': item.quantity,
                                'Preço Unitário (R$)': basePrice,
                                'Total (R$)': finalTotal
                            });
                        });
                    });
                });
            });
        }

        const ws = XLSX.utils.json_to_sheet(excelRows);
        
        // Basic column width formatting
        const wscols = [
            { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 60 }, { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Orçamento");
        XLSX.writeFile(wb, `${options.fileName}.xlsx`);
    },

    downloadCostCenterTemplate() {
        const dataSheet = XLSX.utils.aoa_to_sheet([
            ['Código', 'Nome'],
            ['CC-001', 'Administração'],
            ['CC-002', 'Obras - Torre A'],
            ['CC-003', 'Infraestrutura'],
        ]);
        dataSheet['!cols'] = [{ wch: 15 }, { wch: 45 }];

        // highlight header row
        ['A1', 'B1'].forEach(cell => {
            if (!dataSheet[cell]) return;
            dataSheet[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: 'DBEAFE' } } };
        });

        const instructionsSheet = XLSX.utils.aoa_to_sheet([
            ['INSTRUÇÕES DE IMPORTAÇÃO — CENTROS DE CUSTO'],
            [''],
            ['• Não remova ou renomeie as colunas da aba "Centros de Custo".'],
            ['• A coluna "Nome" é obrigatória.'],
            ['• A coluna "Código" é opcional, mas recomendada para identificação única.'],
            ['• Remova as linhas de exemplo antes de importar.'],
            ['• Salve o arquivo no formato .xlsx ou .csv antes de importar.'],
        ]);
        instructionsSheet['!cols'] = [{ wch: 70 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, dataSheet, 'Centros de Custo');
        XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instruções');

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        saveAs(blob, 'template_centros_de_custo.xlsx');
    },

    exportCostCenters(items: { name: string; code?: string }[]) {
        const exportData = items.map(item => ({
            'Código': item.code || '',
            'Nome': item.name,
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [{ wch: 15 }, { wch: 45 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Centros de Custo');

        const date = new Date().toISOString().slice(0, 10);
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        saveAs(blob, `centros_de_custo_${date}.xlsx`);
    },

    async urlToBase64(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = (e) => reject(e);
            img.src = url;
        });
    },

    async generateContractFinancialReportPDF(
        contract: any,
        items: any[],
        measurements: any[],
        addendums: any[],
        organization: any,
        projectSettings: ProjectSettings
    ) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const primaryColor: [number, number, number] = [30, 41, 59]; // Slate 800

        // Header
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, pageWidth, 40, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('DOSSIÊ DE CONTROLE CONTRATUAL', 15, 20);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`${organization?.name || 'ORÇACLOUD'} | CNPJ: ${organization?.cnpj || '-'}`, 15, 28);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 15, 33);

        // Project & Contract Basic Info
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('1. IDENTIFICAÇÃO', 15, 55);

        const projectInfo = [
            ['Obra:', projectSettings.name],
            ['Contrato:', `${contract.number} - ${contract.title}`],
            ['Tipo/Natureza:', `${contract.contract_type} - ${contract.nature}`],
            ['Vigência:', `${new Date(contract.start_date).toLocaleDateString()} a ${new Date(contract.end_date).toLocaleDateString()}`]
        ];

        autoTable(doc, {
            startY: 60,
            body: projectInfo,
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 1 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
        });

        // Financial Summary
        const summaryY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('2. RESUMO FINANCEIRO', 15, summaryY);

        const totalMeasured = measurements.reduce((sum, m) => sum + (m.total_value || 0), 0);
        const totalAddendums = addendums.filter(a => a.status === 'Aprovado').reduce((sum, a) => sum + (a.value_impact || 0), 0);
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        const summaryData = [
            ['Valor Original:', fmt(contract.original_value)],
            ['Total em Aditivos:', fmt(totalAddendums)],
            ['Valor Atualizado:', fmt(contract.current_value)],
            ['Total Medido:', fmt(totalMeasured)],
            ['Saldo a Medir:', fmt(contract.current_value - totalMeasured)]
        ];

        autoTable(doc, {
            startY: summaryY + 5,
            body: summaryData,
            theme: 'striped',
            styles: { fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { halign: 'right' } }
        });

        // Measurements Table
        const measurementsY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('3. HISTÓRICO DE MEDIÇÕES', 15, measurementsY);

        const measurementRows = measurements.length > 0
            ? measurements.map(m => [
                m.number,
                `${new Date(m.period_start).toLocaleDateString()} - ${new Date(m.period_end).toLocaleDateString()}`,
                m.status.toUpperCase(),
                fmt(m.total_value),
                fmt(m.retention_value),
                fmt(m.net_value)
            ])
            : [['-', 'Sem medições registradas', '-', '-', '-', '-']];

        autoTable(doc, {
            startY: measurementsY + 5,
            head: [['Nº', 'Período', 'Status', 'Bruto', 'Retenção', 'Líquido']],
            body: measurementRows,
            theme: 'grid',
            headStyles: { fillColor: primaryColor, fontSize: 8 },
            styles: { fontSize: 8 }
        });

        // Addendums Table (if any)
        if (addendums.length > 0) {
            const addendumsY = (doc as any).lastAutoTable.finalY + 15;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('4. ADITIVOS CONTRATUAIS', 15, addendumsY);

            const addendumRows = addendums.map(a => [
                a.number,
                a.type,
                a.description,
                fmt(a.value_impact),
                a.status.toUpperCase()
            ]);

            autoTable(doc, {
                startY: addendumsY + 5,
                head: [['Nº', 'Tipo', 'Descrição', 'Impacto', 'Status']],
                body: addendumRows,
                theme: 'grid',
                headStyles: { fillColor: [100, 116, 139], fontSize: 8 },
                styles: { fontSize: 8 }
            });
        }

        // 5. Photo Annex
        const allPhotos: { url: string; itemName: string; measurementNumber: number; date: string; qty: number }[] = [];

        measurements.forEach(m => {
            const mItems = m.items || []; // We need to make sure items are passed
            mItems.forEach((mi: any) => {
                const urls = mi.attachment_urls || [];
                urls.forEach((url: string) => {
                    if (!url.match(/\.(mp4|webm|ogg)$/i)) {
                        allPhotos.push({
                            url,
                            itemName: mi.contract_item_description || 'Item',
                            measurementNumber: m.number,
                            date: new Date(m.measurement_date).toLocaleDateString(),
                            qty: mi.quantity_executed
                        });
                    }
                });
            });
        });

        if (allPhotos.length > 0) {
            doc.addPage();

            // Header for Annex
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(0, 0, pageWidth, 30, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('ANEXO FOTOGRÁFICO DE EVIDÊNCIAS', pageWidth / 2, 20, { align: 'center' });

            let photoY = 45;
            const photosPerRow = 2;
            const photoWidth = (pageWidth - 45) / photosPerRow;
            const photoHeight = photoWidth * 0.75;
            const marginX = 15;

            for (let i = 0; i < allPhotos.length; i++) {
                const photo = allPhotos[i];
                const col = i % photosPerRow;
                const xPos = marginX + col * (photoWidth + 15);

                if (i > 0 && col === 0) {
                    photoY += photoHeight + 35;
                }

                // Check if we need a new page
                if (photoY + photoHeight + 30 > doc.internal.pageSize.getHeight()) {
                    doc.addPage();
                    photoY = 20;
                }

                try {
                    const base64 = await this.urlToBase64(photo.url);
                    doc.addImage(base64, 'JPEG', xPos, photoY, photoWidth, photoHeight);

                    // Legend
                    doc.setTextColor(50, 50, 50);
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'bold');
                    doc.text(photo.itemName.toUpperCase(), xPos, photoY + photoHeight + 5, { maxWidth: photoWidth });

                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100, 100, 100);
                    doc.text(`Medição #${photo.measurementNumber} - ${photo.date}`, xPos, photoY + photoHeight + 10);
                    doc.text(`Qtd. Executada: ${photo.qty.toLocaleString()}`, xPos, photoY + photoHeight + 14);
                } catch (err) {
                    console.error("Error adding image to PDF:", err);
                    doc.rect(xPos, photoY, photoWidth, photoHeight);
                    doc.setFontSize(8);
                    doc.text('Erro ao carregar imagem', xPos + photoWidth / 2, photoY + photoHeight / 2, { align: 'center' });
                }
            }
        }

        // Footer
        const finalY = (doc as any).lastAutoTable.finalY + 20;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Este documento é um relatório gerencial emitido via plataforma OrçaCloud.', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        doc.save(`Relatorio_Contrato_${contract.number}_${contract.title.replace(/\s+/g, '_')}.pdf`);
    },

    async generateServiceContractPDF(
        contract: any,
        items: any[],
        organization: any,
        projectSettings: ProjectSettings
    ) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        let y = 40;

        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        // Header
        doc.setFillColor(30, 41, 59); // Slate 800
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', pageWidth / 2, 22, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        const addSection = (title: string, content: string) => {
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin, y);
            y += 6;
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(content, pageWidth - (margin * 2));
            doc.text(lines, margin, y);
            y += (lines.length * 5) + 8;

            if (y > 270) {
                doc.addPage();
                y = 20;
            }
        };

        // 1. Partes
        const contractorInfo = `${organization?.name || 'ORÇACLOUD'}, inscrito no CNPJ sob nº ${organization?.cnpj || '-'}, com sede em ${organization?.address?.city || '-'}, aqui denominada CONTRATANTE.`;
        const contractedInfo = `${contract.supplier?.name || contract.supplierName || 'CONTRATADO'}, aqui denominada CONTRATADA.`;
        addSection('1. DAS PARTES', contractorInfo + '\n' + contractedInfo);

        // 2. Objeto
        addSection('2. DO OBJETO', `O presente contrato tem por objeto a execução de ${contract.title} na obra ${projectSettings.name}, localizada em ${projectSettings.location}.`);

        // 3. Itens e Valores
        doc.setFont('helvetica', 'bold');
        doc.text('3. DOS ITENS E VALORES', margin, y);
        y += 5;

        const tableBody = items.map(item => [
            item.description,
            item.unit,
            item.quantity.toLocaleString(),
            fmt(item.unit_price),
            fmt(item.total_price)
        ]);

        autoTable(doc, {
            startY: y,
            head: [['Descrição', 'Unid', 'Qtd', 'Unitário', 'Total']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [71, 85, 105] },
            styles: { fontSize: 8 },
            margin: { left: margin, right: margin }
        });

        y = (doc as any).lastAutoTable.finalY + 12;

        // 4. Pagamento
        addSection('4. DO PAGAMENTO', `O valor total deste contrato é de ${fmt(contract.original_value)}. O pagamento será realizado via ${contract.payment_method || 'A combinar'}, em ${contract.payment_installments || 1} parcela(s)${contract.payment_days ? `, com prazo de ${contract.payment_days} dias` : ''}.`);

        // 5. Vigência
        addSection('5. DA VIGÊNCIA', `O presente contrato terá vigência de ${new Date(contract.start_date).toLocaleDateString()} a ${new Date(contract.end_date).toLocaleDateString()}.`);

        // 6. Foro
        addSection('6. DO FORO', `As partes elegem o foro da comarca de ${organization?.address?.city || 'Brasil'} para dirimir quaisquer dúvidas oriundas deste contrato.`);

        // Signatures
        y += 20;
        if (y > 250) { doc.addPage(); y = 40; }

        doc.line(margin, y, margin + 70, y);
        doc.setFontSize(8);
        doc.text('CONTRATANTE', margin, y + 5);
        doc.text(organization?.name || '', margin, y + 9);

        doc.line(pageWidth - margin - 70, y, pageWidth - margin, y);
        doc.text('CONTRATADA', pageWidth - margin - 70, y + 5);
        doc.text(contract.supplier?.name || contract.supplierName || '', pageWidth - margin - 70, y + 9);

        doc.save(`Contrato_${contract.number}_${contract.title.replace(/\s+/g, '_')}.pdf`);
    },

    generateMilestoneReport(settings: ProjectSettings, curveData: any[], totalValue: number) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const primaryColor: [number, number, number] = [79, 70, 229]; // Indigo 600

        // Header
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, pageWidth, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('CRONOGRAMA DE MILESTONES', 15, 25);
        doc.setFontSize(10);
        doc.text(`Obra: ${settings.name} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 15, 33);

        // Summary Info
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text('RESUMO DO CRONOGRAMA FINANCEIRO', 15, 55);

        const summary = [
            ['Padrão Construtivo:', settings.standard],
            ['Área Total:', `${settings.area} m²`],
            ['Valor Total de VGV Estimado:', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)],
            ['Referência de Custo:', settings.referenceMonth]
        ];

        autoTable(doc, {
            startY: 60,
            body: summary,
            theme: 'plain',
            styles: { fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } }
        });

        // Milestones Table
        const milestones = curveData.filter((_, i) => i % 3 === 0 || i === curveData.length - 1);
        const tableBody = milestones.map((m, idx) => [
            `M-0${idx + 1}`,
            `Final do Mês ${m.month}`,
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.periodic),
            `${((m.periodic / totalValue) * 100).toFixed(1)}%`,
            'Mediante Medição'
        ]);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 15,
            head: [['REF', 'MARCO DE MEDIÇÃO', 'VALOR ESTIMADO', '% DO TOTAL', 'STATUS']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: primaryColor, fontSize: 10, halign: 'center' },
            styles: { fontSize: 9, halign: 'center' },
            columnStyles: { 1: { halign: 'left' }, 2: { halign: 'right' } }
        });

        // Footer
        const finalY = (doc as any).lastAutoTable.finalY + 20;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Este documento é uma projeção financeira baseada em modelos estatísticos de Curva S.', pageWidth / 2, doc.internal.pageSize.getHeight() - 15, { align: 'center' });

        doc.save(`Milestones_${settings.name.replace(/\s+/g, '_')}.pdf`);
    },

    generateCompleteParametricPDF(
        settings: ProjectSettings,
        financialData: { totalValue: number; items: BudgetEntry[]; baseCub: number },
        simulation: { bdi: number; profit: number; costPerM2: number; kFactor: number; bdiComposition: any },
        quantitativeItems: any[],
        sCurveData: any[],
        milestones: any[],
        intelData: { historicalData: any[]; regionalData: any[]; sensitivity: any; comparison: any }
    ) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
        const primaryColor: [number, number, number] = [37, 99, 235]; // Blue 600

        // 1. Header & Cover Info
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 50, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('ESTUDO TÉCNICO DE VIABILIDADE', 15, 30);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`PROJETO: ${settings.name.toUpperCase()} | GERADO EM: ${new Date().toLocaleDateString('pt-BR')}`, 15, 40);

        // 2. Project Data Section
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('1. DADOS DO PROJETO E REFERÊNCIA', 15, 65);

        const projectData = [
            ['Padrão CUB:', settings.standard, 'Localização:', `${settings.location} - ${settings.city || ''}`],
            ['Área Total:', `${settings.area} m²`, 'Mês Referência:', settings.referenceMonth || 'Atual'],
            ['Fator K:', `x${simulation.kFactor.toFixed(2)}`, 'CUB Base:', fmt(financialData.baseCub)]
        ];

        autoTable(doc, {
            startY: 70,
            body: projectData,
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 2: { fontStyle: 'bold', cellWidth: 40 } }
        });

        // 3. Detailed BDI Section
        const bdiY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.text('2. COMPOSIÇÃO DE BDI E TAXAS', 15, bdiY);

        const bdiData = [
            ['Lucro Líquido:', `${simulation.bdiComposition.profit}%`, 'Adm. Central:', `${simulation.bdiComposition.admin}%`],
            ['Impostos:', `${simulation.bdiComposition.taxes}%`, 'Riscos:', `${simulation.bdiComposition.risk}%`],
            ['Seguros/Gar.:', `${(simulation.bdiComposition.insurance || 0) + (simulation.bdiComposition.guarantee || 0)}%`, 'BDI FINAL:', `${simulation.bdi.toFixed(2)}%`]
        ];

        autoTable(doc, {
            startY: bdiY + 5,
            body: bdiData,
            theme: 'striped',
            styles: { fontSize: 9 },
            columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } }
        });

        // 4. Financial Investment Summary
        const investY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.text('3. INVESTIMENTO ESTIMADO GLOBAL', 15, investY);

        const summaryData = [
            ['CUSTO TOTAL ESTIMADO:', fmt(financialData.totalValue)],
            ['CUSTO POR M² (VENDA):', fmt(simulation.costPerM2)],
            ['DURAÇÃO ESTIMADA:', `${sCurveData.length} Meses`]
        ];

        autoTable(doc, {
            startY: investY + 5,
            body: summaryData,
            theme: 'grid',
            styles: { fontSize: 11, fontStyle: 'bold' },
            headStyles: { fillColor: primaryColor }
        });

        // 5. Phase Distribution
        doc.addPage();
        doc.setFontSize(14);
        doc.text('4. DISTRIBUIÇÃO FÍSICO-FINANCEIRA POR ETAPA', 15, 20);

        const phaseData = financialData.items.map(item => [
            (item.subPhase || '').split('.').slice(2).join('.').trim() || item.subPhase || 'Etapa Geral',
            fmt(item.sinapiItem.price * (1 + simulation.bdi / 100) * simulation.kFactor),
            `${((item.sinapiItem.price / (financialData.totalValue / (1 + simulation.bdi / 100) / simulation.kFactor)) * 100).toFixed(1)}%`
        ]);

        autoTable(doc, {
            startY: 25,
            head: [['Etapa da Obra', 'Investimento Proporcional', '%']],
            body: phaseData,
            theme: 'grid',
            headStyles: { fillColor: [75, 85, 99] },
            styles: { fontSize: 8 }
        });

        // 6. Market Intelligence & BI
        doc.addPage();
        doc.setFontSize(14);
        doc.text('5. INTELIGÊNCIA DE MERCADO E BENCHMARKING', 15, 20);

        // 6.1 Regional Chart (Simplified)
        doc.setFontSize(10);
        doc.text('Benchmarking de Custo por Estado (R$/m²)', 15, 30);

        const chartX = 15;
        let chartY = 35;
        const chartWidth = 180;
        const barHeight = 6;
        const maxRate = Math.max(...intelData.regionalData.map(d => d.rate));

        intelData.regionalData.forEach((d, i) => {
            const width = (d.rate / maxRate) * (chartWidth - 40);
            doc.setFillColor(d.state === settings.location ? 37 : 229, d.state === settings.location ? 99 : 231, d.state === settings.location ? 235 : 235);
            doc.rect(chartX + 25, chartY + (i * 8), width, barHeight, 'F');
            doc.setFontSize(7);
            doc.setTextColor(50, 50, 50);
            doc.text(d.state, chartX, chartY + (i * 8) + 4);
            doc.text(fmt(d.rate), chartX + 28 + width, chartY + (i * 8) + 4);
        });

        // 6.2 CUB Historical Trends (Simplified Line Representation)
        chartY += (intelData.regionalData.length * 8) + 15;
        doc.setFontSize(10);
        doc.text('Evolução Histórica do CUB (Variação no Tempo)', 15, chartY);

        const lineChartX = 25;
        const lineChartY = chartY + 25;
        const lineChartWidth = 160;
        const lineChartHeight = 30;
        const maxHistoryRate = Math.max(...intelData.historicalData.map(d => d.rate));
        const minHistoryRate = Math.min(...intelData.historicalData.map(d => d.rate));
        const historyRange = maxHistoryRate - minHistoryRate;

        // Draw Axes
        doc.setDrawColor(200, 200, 200);
        doc.line(lineChartX, lineChartY, lineChartX, lineChartY - lineChartHeight); // Y
        doc.line(lineChartX, lineChartY, lineChartX + lineChartWidth, lineChartY); // X

        intelData.historicalData.forEach((d, i) => {
            if (i === 0) return;
            const prev = intelData.historicalData[i - 1];
            const x1 = lineChartX + ((i - 1) / (intelData.historicalData.length - 1)) * lineChartWidth;
            const y1 = lineChartY - ((prev.rate - minHistoryRate) / (historyRange || 1)) * lineChartHeight;
            const x2 = lineChartX + (i / (intelData.historicalData.length - 1)) * lineChartWidth;
            const y2 = lineChartY - ((d.rate - minHistoryRate) / (historyRange || 1)) * lineChartHeight;

            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(0.5);
            doc.line(x1, y1, x2, y2);

            if (i % 3 === 0 || i === intelData.historicalData.length - 1) {
                doc.setFontSize(5);
                doc.setTextColor(150, 150, 150);
                doc.text(d.date, x2 - 5, lineChartY + 5);
            }
        });

        chartY = lineChartY + 15;

        // 6.3 Sensitivity Analysis
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('Análise de Sensibilidade (Impacto Projetado)', 15, chartY);

        const sensData = [
            ['Variação Materiais:', `${intelData.sensitivity.materials}%`, 'Encargos Sociais:', '80% (Desonerado)'],
            ['Variação Mão de Obra:', `${intelData.sensitivity.labor}%`, 'Custo Venda Atual:', fmt(simulation.costPerM2)]
        ];

        autoTable(doc, {
            startY: chartY + 5,
            body: sensData,
            theme: 'striped',
            styles: { fontSize: 8 }
        });

        // 6.3 Product Mix
        if (intelData.comparison) {
            const mixY = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.text('Estudo de Mix de Produto (Comparativo)', 15, mixY);

            const mixData = [
                ['Padrão Atual:', settings.standard, fmt(simulation.costPerM2)],
                ['Padrão Alternativo:', intelData.comparison.standard, fmt(intelData.comparison.m2 * (1 + simulation.bdi / 100) * simulation.kFactor)]
            ];

            autoTable(doc, {
                startY: mixY + 5,
                head: [['Comparativo', 'Padrão', 'Custo/m²']],
                body: mixData,
                theme: 'grid',
                headStyles: { fillColor: [16, 185, 129] },
                styles: { fontSize: 8 }
            });
        }

        // 7. Quantitative List (NBR 12.721)
        doc.addPage();
        doc.setFontSize(14);
        doc.text('6. LISTA BASE DE INSUMOS (NBR 12.721)', 15, 20);

        const quantData = quantitativeItems.map(item => [
            item.sinapiItem.description.replace('NBR 12721 - ', ''),
            item.sinapiItem.unit,
            item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 }),
            (item.quantity / settings.area).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
        ]);

        autoTable(doc, {
            startY: 25,
            head: [['Insumo/Especialidade', 'Unid', 'Qtd Total', 'Consumo (m²)']],
            body: quantData,
            theme: 'striped',
            headStyles: { fillColor: [100, 116, 139] },
            styles: { fontSize: 7 }
        });

        // 8. S-Curve & Milestones
        doc.addPage();
        doc.setFontSize(14);
        doc.text('7. FLUXO DE CAIXA E MARCOS DE PAGAMENTO', 15, 20);

        const milestoneData = milestones.map(ms => [
            ms.label,
            `Mês ${ms.month}`,
            fmt(ms.value),
            `${ms.percentage}%`
        ]);

        autoTable(doc, {
            startY: 25,
            head: [['Marco de Entrega', 'Previsão', 'Valor Estimado', '%']],
            body: milestoneData,
            theme: 'grid',
            headStyles: { fillColor: [99, 102, 241] },
            styles: { fontSize: 9 }
        });

        const sCurveTable = sCurveData.filter((_, i) => i % 3 === 0 || i === sCurveData.length - 1).map(row => [
            `Mês ${row.month}`,
            fmt(row.periodic),
            fmt(row.cumulative),
            `${((row.cumulative / financialData.totalValue) * 100).toFixed(1)}%`
        ]);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 15,
            head: [['Período', 'Desembolso Mensal', 'Acumulado', '% Exec.']],
            body: sCurveTable,
            theme: 'striped',
            styles: { fontSize: 8 }
        });

        // Footer
        const finalY = (doc as any).lastAutoTable.finalY + 20;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Nota: Estimativa baseada em modelos paramétricos. OrçaCloud SaaS.', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        doc.save(`Relatorio_Completo_${settings.name.replace(/\s+/g, '_')}.pdf`);
    },

    generateParametricProposalPDF(
        settings: ProjectSettings,
        totalValue: number,
        costPerM2: number,
        milestones: any[],
        organization: any
    ) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

        // 1. Cover Page
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, pageWidth, 150, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(32);
        doc.setFont('helvetica', 'bold');
        doc.text('PROPOSTA COMERCIAL', pageWidth / 2, 80, { align: 'center' });
        doc.setFontSize(18);
        doc.text('ESTUDO DE VIABILIDADE DE OBRA', pageWidth / 2, 95, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Cliente: ${settings.client || 'À disposição'}`, pageWidth / 2, 120, { align: 'center' });
        doc.text(`Projeto: ${settings.name}`, pageWidth / 2, 127, { align: 'center' });

        doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, 200, { align: 'center' });
        doc.setFontSize(10);
        doc.text(organization?.name || 'ORÇACLOUD ENGENHARIA', pageWidth / 2, 210, { align: 'center' });

        // 2. Main Proposal Page
        doc.addPage();
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMO DO INVESTIMENTO', 15, 30);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Descrição do Objeto: Construção de edificação padrão ${settings.standard}, em ${settings.location}.`, 15, 45, { maxWidth: pageWidth - 30 });
        doc.text(`Área do Projeto: ${settings.area} m²`, 15, 55);

        doc.setFillColor(248, 250, 252);
        doc.rect(15, 65, pageWidth - 30, 40, 'F');
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        doc.text('VALOR TOTAL DO INVESTIMENTO:', 25, 80);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text(fmt(totalValue), 25, 92);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Custo Estimado por m²: ${fmt(costPerM2)}`, 25, 98);

        // 3. Milestones
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('CRONOGRAMA DE PAGAMENTOS', 15, 125);

        const msData = milestones.map(ms => [
            ms.label,
            fmt(ms.value),
            `${ms.percentage}%`
        ]);

        autoTable(doc, {
            startY: 130,
            head: [['Gatilho de Pagamento (Marco)', 'Valor Estimado', '%']],
            body: msData,
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] }
        });

        // 4. Signatures
        const footerY = doc.internal.pageSize.getHeight() - 60;
        doc.line(15, footerY, 90, footerY);
        doc.setFontSize(8);
        doc.text(organization?.name || 'EMPRESA CONTRATADA', 15, footerY + 5);

        doc.line(pageWidth - 90, footerY, pageWidth - 15, footerY);
        doc.text(settings.client || 'CLIENTE CONTRATANTE', pageWidth - 90, footerY + 5);

        doc.save(`Proposta_${settings.name.replace(/\s+/g, '_')}.pdf`);
    }
};
