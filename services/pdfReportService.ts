import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { storageService } from './storageService';

const PRIMARY  = [30,  64,  175] as [number, number, number]; // blue-800
const LIGHT    = [241, 245, 249] as [number, number, number]; // slate-100
const DARK     = [15,  23,  42]  as [number, number, number]; // slate-900
const GRAY     = [100, 116, 139] as [number, number, number]; // slate-500
const HEAD_ALT = [248, 250, 252] as [number, number, number]; // slate-50

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

function milestoneProgress(milestones: any[], projectId: string) {
    const ms = milestones.filter(m => m.project_id === projectId);
    if (!ms.length) return { pct: 0, done: 0, total: 0 };
    const done = ms.filter(m => m.status === 'completed').length;
    return { pct: Math.round((done / ms.length) * 100), done, total: ms.length };
}

function sectionHeader(doc: jsPDF, title: string, y: number, W: number): number {
    doc.setFillColor(...LIGHT);
    doc.rect(14, y, W - 28, 8, 'F');
    doc.setTextColor(...PRIMARY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(title, 17, y + 5.5);
    return y + 12;
}

export async function generateMonthlyReportPdf(organizationId: string): Promise<string> {
    const now = new Date();
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthLabel  = ref.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
    const generatedAt = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // ── Fetch data ────────────────────────────────────────────────────────────
    const [projectsRes, contribsRes] = await Promise.all([
        supabase.from('projects').select('id, name, settings').not('investor_id', 'is', null),
        supabase.from('investor_contributions').select('project_id, type, amount, status').eq('organization_id', organizationId),
    ]);

    const orgProjects = ((projectsRes.data ?? []) as any[]).filter(
        p => p.settings?.organizationId === organizationId,
    );
    const contribs = (contribsRes.data ?? []) as any[];

    let milestones: any[] = [];
    if (orgProjects.length) {
        const ids = orgProjects.map((p: any) => p.id);
        const { data } = await supabase
            .from('project_milestones')
            .select('project_id, name, status, physical_pct, completed_date')
            .in('project_id', ids);
        milestones = data ?? [];
    }

    // ── PDF ───────────────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();

    // Header bar
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, W, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ORÇACLOUD', 14, 13);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Portal do Investidor', 14, 21);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`Relatório Mensal — ${monthLabel}`, W - 14, 13, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em ${generatedAt}`, W - 14, 21, { align: 'right' });

    let y = 44;

    // ── Empreendimentos ───────────────────────────────────────────────────────
    if (orgProjects.length) {
        y = sectionHeader(doc, 'EMPREENDIMENTOS', y, W);

        autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            head: [['Empreendimento', 'Status', 'Progresso', 'Marcos']],
            body: orgProjects.map((p: any) => {
                const prog = milestoneProgress(milestones, p.id);
                return [
                    p.name,
                    p.settings?.obraStatus ?? 'Em Andamento',
                    `${prog.pct}%`,
                    `${prog.done}/${prog.total}`,
                ];
            }),
            headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: DARK },
            alternateRowStyles: { fillColor: HEAD_ALT },
            columnStyles: {
                0: { cellWidth: 90 },
                1: { cellWidth: 40 },
                2: { cellWidth: 25, halign: 'center' },
                3: { cellWidth: 25, halign: 'center' },
            },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
    }

    // ── Resumo Financeiro ─────────────────────────────────────────────────────
    const financialRows = orgProjects
        .map((p: any) => {
            const pc = contribs.filter((c: any) => c.project_id === p.id);
            const aportes    = pc.filter((c: any) => c.type === 'aporte'       && c.status === 'liquidado').reduce((s: number, c: any) => s + c.amount, 0);
            const dividendos = pc.filter((c: any) => c.type === 'dividendo'    || c.type === 'distribuicao').reduce((s: number, c: any) => s + c.amount, 0);
            const pendentes  = pc.filter((c: any) => c.status === 'pendente'   || c.status === 'atrasado').reduce((s: number, c: any) => s + c.amount, 0);
            return { name: p.name, aportes, dividendos, pendentes };
        })
        .filter((r: any) => r.aportes > 0 || r.dividendos > 0);

    if (financialRows.length) {
        y = sectionHeader(doc, 'RESUMO FINANCEIRO', y, W);
        const totalAportes    = financialRows.reduce((s: number, r: any) => s + r.aportes, 0);
        const totalDividendos = financialRows.reduce((s: number, r: any) => s + r.dividendos, 0);
        const totalPendentes  = financialRows.reduce((s: number, r: any) => s + r.pendentes, 0);

        autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            head: [['Empreendimento', 'Aportes Liquidados', 'Dividendos / Dist.', 'Pendências']],
            body: [
                ...financialRows.map((r: any) => [r.name, fmtBRL(r.aportes), fmtBRL(r.dividendos), r.pendentes > 0 ? fmtBRL(r.pendentes) : '—']),
                ['TOTAL', fmtBRL(totalAportes), fmtBRL(totalDividendos), totalPendentes > 0 ? fmtBRL(totalPendentes) : '—'],
            ],
            headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: DARK },
            alternateRowStyles: { fillColor: HEAD_ALT },
            // Linha de total em negrito
            didParseCell: (data) => {
                if (data.row.index === financialRows.length) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = LIGHT;
                }
            },
            columnStyles: {
                0: { cellWidth: 75 },
                1: { cellWidth: 40, halign: 'right' },
                2: { cellWidth: 45, halign: 'right' },
                3: { cellWidth: 30, halign: 'right' },
            },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
    }

    // ── Marcos concluídos ─────────────────────────────────────────────────────
    const completedMs = milestones.filter((m: any) => m.status === 'completed').slice(0, 12);
    if (completedMs.length) {
        y = sectionHeader(doc, 'MARCOS CONCLUÍDOS', y, W);

        autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            head: [['Marco', 'Empreendimento', 'Conclusão', '% Físico']],
            body: completedMs.map((m: any) => {
                const proj = orgProjects.find((p: any) => p.id === m.project_id);
                return [
                    m.name,
                    proj?.name ?? '—',
                    m.completed_date ? new Date(m.completed_date).toLocaleDateString('pt-BR') : '—',
                    `${m.physical_pct ?? 0}%`,
                ];
            }),
            headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: DARK },
            alternateRowStyles: { fillColor: HEAD_ALT },
            columnStyles: {
                0: { cellWidth: 75 },
                1: { cellWidth: 65 },
                2: { cellWidth: 30, halign: 'center' },
                3: { cellWidth: 20, halign: 'center' },
            },
        });
    }

    // ── Footer em todas as páginas ────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const H = doc.internal.pageSize.getHeight();
        doc.setFillColor(...LIGHT);
        doc.rect(0, H - 12, W, 12, 'F');
        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('OrçaCloud — Portal do Investidor · Documento gerado automaticamente · Uso interno.', 14, H - 4);
        doc.text(`${i} / ${totalPages}`, W - 14, H - 4, { align: 'right' });
    }

    // ── Upload ────────────────────────────────────────────────────────────────
    const safeName = monthLabel.replace('/', '-');
    const path = `reports/${organizationId}/${Date.now()}_relatorio-mensal-${safeName}.pdf`;
    const pdfFile = new File([doc.output('blob')], `relatorio-mensal-${safeName}.pdf`, { type: 'application/pdf' });
    await storageService.uploadFile('documents', path, pdfFile);
    return storageService.getPublicUrl('documents', path);
}
