import * as XLSX from 'xlsx';
import type {
    AreaQuadroIIRow,
    AreaQuadroIRow,
    AreaQuadroIVBRow,
    AreaVersion,
    AreaVersionApproval,
    AreaVersionAuditLog,
    AreaVersionStructure,
} from '../types/areaEngine';

export interface AreaEngineExportPackage {
    projectName: string;
    version: AreaVersion | null;
    structure: AreaVersionStructure;
    quadroI: AreaQuadroIRow[];
    quadroII: AreaQuadroIIRow[];
    quadroIVB: AreaQuadroIVBRow[];
    approvals: AreaVersionApproval[];
    auditLogs: AreaVersionAuditLog[];
}

function safeFileName(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 90) || 'areas_nbr12721';
}

function formatDate(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR');
}

function baseName(pkg: AreaEngineExportPackage): string {
    const versionLabel = pkg.version ? `v${pkg.version.version_number}_${pkg.version.version_label}` : 'sem_versao';
    return safeFileName(`areas_nbr12721_${pkg.projectName}_${versionLabel}`);
}

function aoaSheet(rows: unknown[][]) {
    return XLSX.utils.aoa_to_sheet(rows);
}

export const areaEngineExportService = {
    exportXlsx(pkg: AreaEngineExportPackage): void {
        const wb = XLSX.utils.book_new();
        const version = pkg.version;

        XLSX.utils.book_append_sheet(wb, aoaSheet([
            ['Projeto', pkg.projectName],
            ['Versao', version ? `v${version.version_number} - ${version.version_label}` : ''],
            ['Status', version?.status || ''],
            ['Norma', version?.normative_reference || ''],
            ['Payload hash', version?.version_payload_hash || ''],
            ['Identity hash', version?.version_identity_hash || ''],
            ['Locked at', formatDate(version?.locked_at)],
            ['Gerado em', formatDate(new Date().toISOString())],
        ]), 'Resumo');

        XLSX.utils.book_append_sheet(wb, aoaSheet([
            ['Tipo', 'Codigo', 'Nome', 'Uso/Classe', 'Area real', 'Coeficiente'],
            ...pkg.structure.blocks.map(row => ['Bloco', row.code || '', row.name, '', '', '']),
            ...pkg.structure.floors.map(row => ['Pavimento', row.code || '', row.name, row.floor_type, '', '']),
            ...pkg.structure.units.map(row => ['Unidade', row.code, row.name || '', row.unit_type, '', '']),
            ...pkg.structure.spaces.map(row => ['Espaco', row.code || '', row.name, row.use_class, row.real_area_m2_raw, row.coefficient_value ?? '']),
        ]), 'Estrutura');

        XLSX.utils.book_append_sheet(wb, aoaSheet([
            ['Pavimento', 'Area real total', 'Area equivalente total'],
            ...pkg.quadroI.map(row => [row.floor_label, row.qi_17_floor_real_total_raw, row.qi_18_floor_equivalent_total_raw]),
        ]), 'Quadro I');

        XLSX.utils.book_append_sheet(wb, aoaSheet([
            ['Unidade', 'Coeficiente', 'Area real total', 'Area equivalente total'],
            ...pkg.quadroII.map(row => [row.unit_label, row.qii_31_proportionality_coefficient_raw, row.qii_37_unit_real_total_raw, row.qii_38_unit_equivalent_total_raw]),
        ]), 'Quadro II');

        XLSX.utils.book_append_sheet(wb, aoaSheet([
            ['Unidade', 'Area real total', 'Coeficiente', 'Fracao decimal'],
            ...pkg.quadroIVB.map(row => [row.unit_label, row.qivb_f_real_total_area_raw, row.qivb_g_proportionality_coefficient_raw, row.fraction_decimal_raw]),
        ]), 'Quadro IV-B');

        XLSX.utils.book_append_sheet(wb, aoaSheet([
            ['Tipo', 'Status', 'Reviewed at', 'Hash', 'Comentarios'],
            ...pkg.approvals.map(row => [row.approval_type, row.status, formatDate(row.reviewed_at), row.approval_hash || '', row.comments || '']),
        ]), 'Aprovacoes');

        XLSX.utils.book_append_sheet(wb, aoaSheet([
            ['Acao', 'Entidade', 'Campo', 'Motivo', 'Data'],
            ...pkg.auditLogs.map(row => [row.action, row.entity_type, row.field_name || '', row.reason || '', formatDate(row.performed_at)]),
        ]), 'Auditoria');

        XLSX.writeFile(wb, `${baseName(pkg)}.xlsx`);
    },

    async exportPdf(pkg: AreaEngineExportPackage): Promise<void> {
        const { jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const version = pkg.version;
        const title = 'Areas NBR 12721 - Quadros I, II e IV-B';

        doc.setFontSize(14);
        doc.text(title, 14, 14);
        doc.setFontSize(9);
        doc.text(`Projeto: ${pkg.projectName}`, 14, 21);
        doc.text(`Versao: ${version ? `v${version.version_number} - ${version.version_label}` : '-'}`, 14, 26);
        doc.text(`Status: ${version?.status || '-'}`, 14, 31);
        doc.text(`Payload: ${version?.version_payload_hash || '-'}`, 14, 36);
        doc.text(`Identidade: ${version?.version_identity_hash || '-'}`, 14, 41);

        autoTable(doc, {
            startY: 48,
            head: [['Quadro I - Pavimento', 'Area real total', 'Area equivalente total']],
            body: pkg.quadroI.map(row => [row.floor_label, String(row.qi_17_floor_real_total_raw), String(row.qi_18_floor_equivalent_total_raw)]),
            styles: { fontSize: 8 },
        });

        autoTable(doc, {
            head: [['Quadro II - Unidade', 'Coeficiente', 'Area real total', 'Area equivalente total']],
            body: pkg.quadroII.map(row => [row.unit_label, String(row.qii_31_proportionality_coefficient_raw), String(row.qii_37_unit_real_total_raw), String(row.qii_38_unit_equivalent_total_raw)]),
            styles: { fontSize: 8 },
        });

        autoTable(doc, {
            head: [['Quadro IV-B - Unidade', 'Area real total', 'Coeficiente', 'Fracao decimal']],
            body: pkg.quadroIVB.map(row => [row.unit_label, String(row.qivb_f_real_total_area_raw), String(row.qivb_g_proportionality_coefficient_raw), String(row.fraction_decimal_raw)]),
            styles: { fontSize: 8 },
        });

        autoTable(doc, {
            head: [['Aprovacao', 'Status', 'Data', 'Hash']],
            body: pkg.approvals.map(row => [row.approval_type, row.status, formatDate(row.reviewed_at), row.approval_hash || '']),
            styles: { fontSize: 8 },
        });

        doc.save(`${baseName(pkg)}.pdf`);
    },
};