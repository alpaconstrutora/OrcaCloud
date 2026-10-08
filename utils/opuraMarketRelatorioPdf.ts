import { DESCRICAO_HIPOTESES, HIPOTESES_PADRAO, type HipotesesVocacao } from './opuraMarketVocacao';
import type { ResultadoNaTela } from '../hooks/useMarketVocacao';

/**
 * Relatório de vocação do ÒPURA Market em PDF. Saiu de OpuraMarketModule.tsx na
 * Fase 6 do plano docs/planos/2026-10-07-opura-market-intelligence.md.
 *
 * O cabeçalho mostra o NOME da organização (antes saía o UUID).
 */
export interface DadosRelatorioVocacao {
  nomeEstudo: string;
  nomeOrganizacao: string;
  nomeBairro: string | null;
  ponto: { lat: number; lng: number };
  areaTerreno: number;
  raioMetros: string;
  resultado: ResultadoNaTela;
  hipoteses: HipotesesVocacao;
  /** Contêiner do mapa. Só entra no relatório se estiver visível na tela. */
  mapaEl: HTMLElement | null;
}

/** O html2canvas não entende cores oklch/oklab do Tailwind v4: desliga essas folhas durante a captura. */
async function capturarMapa(el: HTMLElement): Promise<string> {
  const html2canvas = (await import('html2canvas')).default;
  const desligadas: CSSStyleSheet[] = [];
  Array.from(document.styleSheets).forEach(sheet => {
    try {
      if (sheet.href && sheet.href.includes('leaflet')) return;
      const regras = sheet.cssRules;
      let desligar = !regras;
      if (regras) {
        for (let i = 0; i < regras.length; i++) {
          const texto = regras[i].cssText;
          if (texto.includes('oklch') || texto.includes('oklab')) { desligar = true; break; }
        }
      }
      if (desligar) { sheet.disabled = true; desligadas.push(sheet); }
    } catch {
      try { sheet.disabled = true; desligadas.push(sheet); } catch { /* folha de outra origem */ }
    }
  });
  try {
    const canvas = await html2canvas(el, { useCORS: true, allowTaint: false, logging: false });
    return canvas.toDataURL('image/png');
  } finally {
    desligadas.forEach(sheet => { try { sheet.disabled = false; } catch { /* ignora */ } });
  }
}

export async function gerarRelatorioVocacaoPdf(d: DadosRelatorioVocacao): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const r = d.resultado;

  // Cabeçalho
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ÓPURA MARKET INTELLIGENCE', 15, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Relatório Executivo de Vocação e Inteligência Territorial', 15, 25);
  doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 70, 18);
  doc.text(doc.splitTextToSize(`Organização: ${d.nomeOrganizacao}`, 60), pageWidth - 70, 25);

  // 1. Identificação
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('1. Identificação do Terreno e Área de Influência', 15, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Estudo: ${d.nomeEstudo}`, 15, 60);
  doc.text(`Bairro Predominante: ${d.nomeBairro || 'Não identificado'}`, 15, 65);
  doc.text(`Coordenadas do Ponto: Lat ${d.ponto.lat.toFixed(6)} | Lng ${d.ponto.lng.toFixed(6)}`, 15, 70);
  doc.text(`Área do Terreno Informada: ${d.areaTerreno.toLocaleString('pt-BR')} m²`, 15, 75);
  doc.text(`Raio de Análise de Concorrência: ${d.raioMetros} metros`, 15, 80);

  // 2. Estatísticas do raio
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('2. Estatísticas Espaciais do Entorno (PostGIS)', 15, 92);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (r.stats) {
    doc.text(`Total de Concorrentes Ofertados no Entorno: ${r.stats.totalListings} unidades`, 15, 100);
    doc.text(`Preço Médio de Oferta no Entorno: R$ ${r.stats.pricePerM2Avg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/m²`, 15, 105);
    doc.text(`Ticket Médio Geral de Vendas: R$ ${r.stats.ticketAvg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 15, 110);
    doc.text(`Metragem Média Privativa: ${r.stats.areaAvg.toFixed(1)} m²`, 15, 115);
    doc.text(`Média de Dormitórios: ${r.stats.bedroomsAvg.toFixed(1)} quartos`, 15, 120);
  } else {
    doc.text('Estatísticas do entorno não guardadas: estudo salvo antes de 07/10/2026.', 15, 100);
    doc.text('Recalcule a vocação territorial para obter os números medidos.', 15, 105);
  }

  // 3. Vocação
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('3. Vocação do Terreno e Recomendação do Produto IA', 15, 132);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Padrão do Empreendimento Recomendado: ${r.recStandard}`, 15, 140);
  doc.text(`VGV Potencial Estimado (Coeficiente Aproveitamento): R$ ${r.estimatedVgv.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`, 15, 145);
  doc.text(`Grau de Risco do Empreendimento: ${r.riskScore}% (Score de Viabilidade)`, 15, 150);
  doc.text(`Velocidade de Venda Estimada (Absorção): ${r.estimatedAbsorptionVelocity}% ao mês`, 15, 155);
  doc.setFont('helvetica', 'bold');
  doc.text('Sugestão de Mix de Tipologias Recomendadas:', 15, 165);
  doc.setFont('helvetica', 'normal');
  let mixY = 172;
  r.productMix.tipologias.forEach(t => {
    doc.text(`- ${t.tipo} (Área Privativa: ${t.area}m²): ${t.mix}% do VGV`, 20, mixY);
    mixY += 6;
  });

  // 4. Mapa — só se o contêiner estiver visível (o mapa fica escondido nas outras abas).
  if (d.mapaEl && d.mapaEl.offsetWidth > 0 && d.mapaEl.offsetHeight > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('4. Visualização de Localização Georreferenciada', 15, 202);
    try {
      doc.addImage(await capturarMapa(d.mapaEl), 'PNG', 15, 207, pageWidth - 30, 75);
    } catch (err) {
      console.error('Erro ao renderizar imagem do mapa no PDF:', err);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('(Visualização do mapa indisponível neste relatório devido a limitações gráficas do CSS)', 15, 212);
    }
  }

  // 5. Hipóteses (Fase 5): o leitor do relatório vê de onde vem o número.
  doc.addPage();
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('5. Hipóteses do cálculo', 15, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let yHip = 30;
  DESCRICAO_HIPOTESES.forEach(h => {
    const alterada = d.hipoteses[h.chave] !== HIPOTESES_PADRAO[h.chave];
    doc.text(`${h.rotulo}: ${d.hipoteses[h.chave].toLocaleString('pt-BR')} ${h.unidade}${alterada ? `  (padrão: ${HIPOTESES_PADRAO[h.chave].toLocaleString('pt-BR')})` : ''}`, 15, yHip);
    yHip += 6;
  });

  // Rodapé
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('ÓPURA Market Intelligence | OrçaCloud SaaS', 15, 290);
  doc.text('Confidencial - Para uso exclusivo do analista', pageWidth - 85, 290);

  doc.save(`Relatorio_Vocacao_${d.nomeEstudo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}
