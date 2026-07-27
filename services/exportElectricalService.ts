import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { OpuraElectricalTakeoff, OpuraElectricalBoard, OpuraElectricalCircuit, OpuraElectricalPoint, OpuraElectricalRoom } from '../types/electrical';
import { formatCurrency } from '../utils/financialMath';

export const exportElectricalService = {
  async generatePlanPDF(dataUrl: string, projectName: string) {
    const imgData = dataUrl;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3'
    });
    
    // A3 dimensions: 420 x 297 mm
    const pdfWidth = 420;
    const pdfHeight = 297;
    
    pdf.setFontSize(16);
    pdf.text(`Prancha: ${projectName}`, 20, 20);
    
    // Calculate aspect ratio
    const imgProps = pdf.getImageProperties(imgData);
    const pdfImgWidth = pdfWidth - 40;
    const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 20, 30, pdfImgWidth, pdfImgHeight);
    pdf.save(`${projectName}_Prancha.pdf`);
  },

  async generateLoadSchedulePDF(boards: OpuraElectricalBoard[], circuits: OpuraElectricalCircuit[], projectName: string) {
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text(`Quadro de Cargas - ${projectName}`, 14, 20);
    
    let yPos = 30;
    
    boards.forEach(board => {
      pdf.setFontSize(14);
      pdf.text(`Quadro: ${board.name}`, 14, yPos);
      
      const boardCircuits = circuits.filter(c => c.boardId === board.id);
      
      const tableData = boardCircuits.map(c => [
        c.name,
        c.circuitType || '-',
        `${c.voltage || 0}V`,
        `${c.installedPowerW || 0}W`,
        `${c.breakerCapacity || 0}A`,
        `${c.wireSectionMm2 || 0}mm²`
      ]);
      
      autoTable(pdf, {
        startY: yPos + 5,
        head: [['Circuito', 'Tipo', 'Tensão', 'Potência', 'Disjuntor', 'Seção Fio']],
        body: tableData,
      });
      
      yPos = (pdf as any).lastAutoTable.finalY + 15;
    });
    
    pdf.save(`${projectName}_Quadro_Cargas.pdf`);
  },

  async generateTakeoffPDF(takeoffs: OpuraElectricalTakeoff[], projectName: string) {
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text(`Orçamento Paramétrico - ${projectName}`, 14, 20);
    
    const tableData = takeoffs.map(t => [
      t.description,
      t.unit || 'un',
      t.quantity.toString(),
      formatCurrency(t.unitCost || 0),
      formatCurrency((t.quantity || 0) * (t.unitCost || 0))
    ]);
    
    const total = takeoffs.reduce((acc, t) => acc + ((t.quantity || 0) * (t.unitCost || 0)), 0);
    
    tableData.push(['', '', '', 'TOTAL', formatCurrency(total)]);
    
    autoTable(pdf, {
      startY: 30,
      head: [['Item / Descrição', 'Und', 'Qtd', 'Custo Unit.', 'Total']],
      body: tableData,
    });
    
    pdf.save(`${projectName}_Orcamento.pdf`);
  },

  generateDXF(rooms: OpuraElectricalRoom[], points: OpuraElectricalPoint[], projectName: string) {
    let dxf = `0\nSECTION\n2\nENTITIES\n`;
    
    rooms.forEach(room => {
      if (room.polygonPoints && Array.isArray(room.polygonPoints) && room.polygonPoints.length > 0) {
        dxf += `0\nPOLYLINE\n8\nPAREDES\n66\n1\n`;
        for (let i = 0; i < room.polygonPoints.length; i += 2) {
          dxf += `0\nVERTEX\n8\nPAREDES\n10\n${room.polygonPoints[i]}\n20\n${-room.polygonPoints[i+1]}\n`;
        }
        // Close polygon
        dxf += `0\nVERTEX\n8\nPAREDES\n10\n${room.polygonPoints[0]}\n20\n${-room.polygonPoints[1]}\n`;
        dxf += `0\nSEQEND\n`;
      }
    });

    points.forEach(point => {
      if (point.canvasX != null && point.canvasY != null) {
        dxf += `0\nCIRCLE\n8\nPONTOS_ELETRICOS\n10\n${point.canvasX}\n20\n${-point.canvasY}\n40\n5.0\n`;
        dxf += `0\nTEXT\n8\nPONTOS_ELETRICOS\n10\n${point.canvasX + 10}\n20\n${-point.canvasY + 10}\n40\n8.0\n1\n${point.pointType}\n`;
      }
    });
    
    dxf += `0\nENDSEC\n0\nEOF\n`;

    const blob = new Blob([dxf], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName}_Planta.dxf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
