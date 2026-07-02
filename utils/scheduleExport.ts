import * as XLSX from 'xlsx';
// @ts-ignore
import { saveAs } from 'file-saver';
import { HierarchyNode, DependencyType } from '../types';

interface ScheduleExportRow {
    'WBS': string;
    'Tarefa': string;
    'Tipo': string;
    'Início': string;
    'Término': string;
    'Duração (dias)': number | string;
    '% Real': string;
    'Predecessoras': string;
    'Folga (dias)': number | string;
    'Crítica': string;
    'Valor Planejado (R$)': number;
    'Valor Realizado (R$)': number;
    'Recursos': string;
}

const TYPE_LABEL: Record<HierarchyNode['type'], string> = {
    group: 'Grupo',
    phase: 'Etapa',
    subphase: 'Subetapa',
    item: 'Tarefa',
};

const fmtDate = (iso?: string) => iso ? iso.split('T')[0].split('-').reverse().join('/') : '';

const fmtPredecessors = (node: HierarchyNode, idToLabel: Record<string, string>) => {
    const preds = node.schedule?.predecessors;
    if (!preds || preds.length === 0) return '';
    return preds.map(p => `${idToLabel[p.id] || p.id}${p.type !== DependencyType.FS ? ` (${p.type})` : ''}${p.lag ? ` ${p.lag > 0 ? '+' : ''}${p.lag}d` : ''}`).join('; ');
};

const fmtResources = (node: HierarchyNode) => {
    const allocations = node.schedule?.allocations;
    if (!allocations || allocations.length === 0) return '';
    return allocations.map(a => `${a.resourceType} x${a.quantity}`).join('; ');
};

/**
 * Achata a hierarquia (WBS) em linhas ordenadas para exportação, preservando a
 * indentação via prefixo de espaços no nome e o código WBS de cada nó.
 */
function flattenForExport(nodes: HierarchyNode[], idToLabel: Record<string, string>, rows: ScheduleExportRow[] = []): ScheduleExportRow[] {
    nodes.forEach(node => {
        const indent = '  '.repeat(node.level);
        rows.push({
            'WBS': node.wbsCode || '',
            'Tarefa': `${indent}${node.name}${node.isMilestone ? ' ◆' : ''}`,
            'Tipo': TYPE_LABEL[node.type] || node.type,
            'Início': fmtDate(node.type === 'item' ? node.schedule?.startDate : node.earlyStart),
            'Término': fmtDate(node.type === 'item' ? node.schedule?.endDate : node.earlyFinish),
            'Duração (dias)': node.type === 'item' ? (node.schedule?.duration ?? '') : '',
            '% Real': node.type === 'item'
                ? `${(node.schedule?.manualRealPct ?? 0).toFixed(0)}%`
                : node.total > 0 ? `${((node.realizedTotal / node.total) * 100).toFixed(0)}%` : '0%',
            'Predecessoras': node.type === 'item' ? fmtPredecessors(node, idToLabel) : '',
            'Folga (dias)': node.type === 'item' ? (node.schedule?.totalFloat ?? '') : '',
            'Crítica': node.isCritical ? 'Sim' : 'Não',
            'Valor Planejado (R$)': Math.round((node.plannedTotal || 0) * 100) / 100,
            'Valor Realizado (R$)': Math.round((node.realizedTotal || 0) * 100) / 100,
            'Recursos': node.type === 'item' ? fmtResources(node) : '',
        });
        if (node.children && node.children.length > 0) {
            flattenForExport(node.children, idToLabel, rows);
        }
    });
    return rows;
}

function buildIdToLabel(nodes: HierarchyNode[], map: Record<string, string> = {}): Record<string, string> {
    nodes.forEach(node => {
        if (node.type === 'item') map[node.id] = node.wbsCode ? `${node.wbsCode} ${node.name}` : node.name;
        if (node.children) buildIdToLabel(node.children, map);
    });
    return map;
}

function buildSheet(hierarchy: HierarchyNode[]): XLSX.WorkSheet {
    const idToLabel = buildIdToLabel(hierarchy);
    const rows = flattenForExport(hierarchy, idToLabel);
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
        { wch: 12 }, { wch: 50 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 8 }, { wch: 30 }, { wch: 12 }, { wch: 8 },
        { wch: 18 }, { wch: 18 }, { wch: 30 },
    ];
    return ws;
}

export function exportScheduleToXlsx(hierarchy: HierarchyNode[], projectName: string) {
    const ws = buildSheet(hierarchy);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
    saveAs(blob, `Cronograma_${projectName.replace(/\s+/g, '_')}.xlsx`);
}

export function exportScheduleToCsv(hierarchy: HierarchyNode[], projectName: string) {
    const ws = buildSheet(hierarchy);
    // ';' como delimitador para abrir corretamente no Excel em configuração PT-BR
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `Cronograma_${projectName.replace(/\s+/g, '_')}.csv`);
}
