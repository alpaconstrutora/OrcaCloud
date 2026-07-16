import { jsPDF } from 'jspdf';
import { InvestorOpportunity, OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_TYPE_LABELS } from './investorPortalService';
import { DueDiligenceItem, DD_CATEGORY_LABELS, DD_STATUS_LABELS, DD_CRITICIDADE_LABELS } from './dueDiligenceService';
import { OpportunityRisk, RISK_CATEGORY_LABELS, riskExposure, riskLevel } from './opportunityRiskService';
import { LandDealScenario, LAND_DEAL_TYPE_LABELS } from './landDealComparatorService';
import { CommitteeDecisionRecord, CommitteeGate, COMMITTEE_GATE_LABELS, COMMITTEE_DECISION_LABELS } from './investmentCommitteeService';
import { fmtBRL, fmtPct } from '../utils/format';

export interface OpportunityDossierData {
    opportunity: InvestorOpportunity;
    ddItems: DueDiligenceItem[];
    risks: OpportunityRisk[];
    landDealScenarios: LandDealScenario[];
    decisions: CommitteeDecisionRecord[];
    currentGate: CommitteeGate;
}

const PRIMARY: [number, number, number] = [15, 23, 42];
const SECONDARY: [number, number, number] = [37, 99, 235];
const LIGHT_BG: [number, number, number] = [248, 250, 252];
const MARGIN_X = 20;

export function generateOpportunityDossierPdf(data: OpportunityDossierData): void {
    const { opportunity: op, ddItems, risks, landDealScenarios, decisions, currentGate } = data;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = 25;

    const drawFooter = () => {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('ÒPURA — Dossiê de Comitê de Investimentos — Confidencial', MARGIN_X, pageHeight - 10);
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

    drawFooter();

    // ─── Capa ───
    doc.setFillColor(...PRIMARY);
    doc.rect(MARGIN_X, currentY, 170, 2, 'F');
    currentY += 8;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...PRIMARY);
    doc.text('DOSSIÊ DE COMITÊ DE INVESTIMENTOS', MARGIN_X, currentY);
    currentY += 6;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Gate atual: ${COMMITTEE_GATE_LABELS[currentGate]} · Emitido em ${new Date().toLocaleDateString('pt-BR')}`, MARGIN_X, currentY);
    currentY += 10;

    doc.setFillColor(...LIGHT_BG);
    doc.rect(MARGIN_X, currentY, 170, 40, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PRIMARY);
    doc.text(op.title, MARGIN_X + 5, currentY + 8);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Status: ${op.status ? OPPORTUNITY_STATUS_LABELS[op.status] : '—'}  |  Tipo: ${op.opportunity_type ? OPPORTUNITY_TYPE_LABELS[op.opportunity_type] : '—'}`, MARGIN_X + 5, currentY + 15);
    doc.text(`Localização: ${[op.location_city, op.location_state].filter(Boolean).join(', ') || '—'}`, MARGIN_X + 5, currentY + 21);
    doc.text(`VGV: ${op.vgv != null ? fmtBRL(op.vgv) : '—'}   TIR: ${op.tir_pct != null ? fmtPct(op.tir_pct) : '—'}   Custo estimado: ${op.cost_estimate != null ? fmtBRL(op.cost_estimate) : '—'}`, MARGIN_X + 5, currentY + 27);
    doc.text(`Ticket mínimo: ${op.ticket_min != null ? fmtBRL(op.ticket_min) : '—'}`, MARGIN_X + 5, currentY + 33);
    currentY += 48;

    // ─── Due Diligence ───
    sectionTitle('Due Diligence — Matriz de Pendências');
    const criticalItems = ddItems.filter(i => (i.criticidade === 'critica' || i.criticidade === 'alta') && !['conforme', 'nao_aplicavel'].includes(i.status));
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(`Total de itens: ${ddItems.length}  |  Pendências críticas/altas em aberto: ${criticalItems.length}`, MARGIN_X, currentY);
    currentY += 6;
    if (criticalItems.length === 0) {
        doc.setTextColor(16, 130, 90);
        doc.text('Nenhuma pendência crítica/alta em aberto.', MARGIN_X, currentY);
        currentY += 8;
    } else {
        criticalItems.forEach(item => {
            checkPageBreak(12);
            doc.setFillColor(...LIGHT_BG);
            doc.rect(MARGIN_X, currentY, 170, 9, 'F');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...PRIMARY);
            doc.text(`[${DD_CATEGORY_LABELS[item.category]}] ${item.title}`, MARGIN_X + 3, currentY + 4);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(180, 60, 40);
            doc.text(`${DD_CRITICIDADE_LABELS[item.criticidade]} — ${DD_STATUS_LABELS[item.status]}`, MARGIN_X + 3, currentY + 7.5);
            currentY += 11;
        });
    }
    currentY += 4;

    // ─── Riscos ───
    checkPageBreak(20);
    sectionTitle('Registro de Riscos');
    const criticalRisks = risks.filter(r => riskExposure(r) >= 12 && r.status !== 'encerrado' && r.status !== 'mitigado');
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(`Total de riscos: ${risks.length}  |  Exposição alta/crítica em aberto: ${criticalRisks.length}`, MARGIN_X, currentY);
    currentY += 6;
    criticalRisks.forEach(risk => {
        checkPageBreak(12);
        const level = riskLevel(riskExposure(risk));
        doc.setFillColor(...LIGHT_BG);
        doc.rect(MARGIN_X, currentY, 170, 9, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...PRIMARY);
        doc.text(`[${RISK_CATEGORY_LABELS[risk.category]}] ${risk.title}`, MARGIN_X + 3, currentY + 4);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(180, 60, 40);
        doc.text(`Exposição ${riskExposure(risk)} — ${level.label}`, MARGIN_X + 3, currentY + 7.5);
        currentY += 11;
    });
    currentY += 4;

    // ─── Modelos de aquisição ───
    checkPageBreak(20);
    sectionTitle('Modelos de Aquisição do Terreno');
    if (landDealScenarios.length === 0) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Nenhum modelo de aquisição cadastrado.', MARGIN_X, currentY);
        currentY += 8;
    } else {
        landDealScenarios.forEach(scenario => {
            checkPageBreak(10);
            doc.setFont('Helvetica', scenario.is_selected ? 'bold' : 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...(scenario.is_selected ? SECONDARY : [50, 50, 50] as [number, number, number]));
            const sel = scenario.is_selected ? ' (selecionado)' : '';
            doc.text(`${scenario.name} — ${LAND_DEAL_TYPE_LABELS[scenario.deal_type]}${sel}`, MARGIN_X, currentY);
            currentY += 5;
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(`Custo equivalente: ${scenario.land_cost_equivalent != null ? fmtBRL(scenario.land_cost_equivalent) : '—'}   Exposição máxima: ${scenario.max_cash_exposure != null ? fmtBRL(scenario.max_cash_exposure) : '—'}   Impacto TIR: ${scenario.impact_tir_pct != null ? fmtPct(scenario.impact_tir_pct) : '—'}`, MARGIN_X, currentY);
            currentY += 7;
        });
    }
    currentY += 4;

    // ─── Histórico de gates ───
    checkPageBreak(20);
    sectionTitle('Histórico de Decisões do Comitê');
    if (decisions.length === 0) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Nenhuma decisão registrada ainda.', MARGIN_X, currentY);
        currentY += 8;
    } else {
        decisions.sort((a, b) => a.gate - b.gate).forEach(d => {
            checkPageBreak(14);
            doc.setFillColor(...LIGHT_BG);
            doc.rect(MARGIN_X, currentY, 170, 11, 'F');
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...PRIMARY);
            doc.text(`${COMMITTEE_GATE_LABELS[d.gate]} — ${COMMITTEE_DECISION_LABELS[d.decision]}`, MARGIN_X + 3, currentY + 4);
            doc.setFont('Helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            const detail = [d.decided_by_email, d.decided_at ? new Date(d.decided_at).toLocaleDateString('pt-BR') : null, d.condicionantes].filter(Boolean).join(' — ');
            doc.text(detail || '—', MARGIN_X + 3, currentY + 8);
            currentY += 13;
        });
    }

    const safeTitle = op.title.replace(/[^\w\-]+/g, '_').slice(0, 60);
    doc.save(`Dossie_Comite_${safeTitle}.pdf`);
}
