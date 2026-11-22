import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import {
    caminhoDoRelatorioMensal, dadosDoRelatorioMensal, desenharRelatorioMensal,
} from '../utils/relatorioMensalDoInvestidor';

export { resumoFinanceiroDoInvestidor, type LinhaFinanceiraDoRelatorio } from '../utils/relatorioMensalDoInvestidor';

/**
 * Relatório mensal de UM investidor, gerado no app ("Gerar Agora"). Os dados e o desenho moram em
 * utils/relatorioMensalDoInvestidor.ts — os mesmos da rotina do dia 1º (Edge Function investor-monthly-reports).
 * Devolve o caminho no bucket privado `documents` (vai para investor_reports.url; quem abre assina), ou `null`
 * quando o investidor não tem obra nem lançamento na organização.
 */
export async function generateMonthlyReportPdf(organizationId: string, investidor: { id: string; name: string }): Promise<string | null> {
    const dados = await dadosDoRelatorioMensal(supabase, organizationId, investidor);
    if (!dados) return null;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    desenharRelatorioMensal(doc, autoTable as never, dados);
    const path = caminhoDoRelatorioMensal(organizationId, investidor.id, dados.monthLabel);
    const pdfFile = new File([doc.output('blob')], path.split('/').pop()!, { type: 'application/pdf' });
    await storageService.uploadFile('documents', path, pdfFile);
    return path;
}
