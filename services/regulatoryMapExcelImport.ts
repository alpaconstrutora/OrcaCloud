// services/regulatoryMapExcelImport.ts
//
// Parsing de planilhas de mapa regulatório (Excel) para popular regulatory_map_zones. Cada
// prefeitura publica sua tabela de zoneamento num layout diferente — sem cabeçalho fixo, sem
// ordem de coluna fixa. Este parser não assume layout: (1) expande merges do Excel, (2) expande
// células "compactadas" com quebra de linha (várias zonas sob a mesma macroárea numa única
// linha visual — comum nesses documentos), (3) deixa o usuário escolher a linha de cabeçalho e
// mapear cada coluna da planilha para um campo do Mapa Regulatório (ou ignorar).
import * as XLSX from 'xlsx';
import { ZoneField, ZONE_COLUMNS } from '../components/RegulatoryZoneTable';

export type ColumnMapping = ZoneField | 'ignore';

/** Lê a primeira aba do arquivo e devolve a grade já com os merges do Excel expandidos
 *  (célula mesclada = valor do topo-esquerda repetido em todas as células do intervalo). */
export async function readSheetGrid(file: File): Promise<string[][]> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const grid = raw.map(row => row.map(formatCellValue));

    const merges: XLSX.Range[] = (ws['!merges'] || []) as XLSX.Range[];
    for (const m of merges) {
        const anchor = grid[m.s.r]?.[m.s.c] ?? '';
        for (let r = m.s.r; r <= m.e.r; r++) {
            if (!grid[r]) continue;
            for (let c = m.s.c; c <= m.e.c; c++) {
                grid[r][c] = anchor;
            }
        }
    }
    return grid;
}

function formatCellValue(v: any): string {
    if (v == null) return '';
    // Números viram texto no padrão BR (vírgula) — mesma convenção do resto do módulo
    // (as opções de C.A./taxa já são strings tipo "0,25").
    if (typeof v === 'number') return String(v).replace('.', ',');
    return String(v).trim();
}

/** Expande linhas cujas células têm quebra de linha em N linhas lógicas — layout comum quando
 *  a prefeitura agrupa várias zonas sob a mesma macroárea numa única linha da planilha
 *  (ex.: célula "Zona" = "ZEPEC 1a\nZEPEC 1b\nZEPEC 2" com as colunas ao lado seguindo o
 *  mesmo número de linhas). Colunas sem quebra (ex.: já expandidas por merge) repetem o
 *  mesmo valor para todas as linhas expandidas. */
export function expandMultilineRows(grid: string[][]): string[][] {
    const expanded: string[][] = [];
    for (const row of grid) {
        const partsByCol = row.map(cell => cell.split('\n').map(p => p.trim()));
        const maxParts = Math.max(1, ...partsByCol.map(p => p.length));
        if (maxParts <= 1) {
            expanded.push(row);
            continue;
        }
        for (let i = 0; i < maxParts; i++) {
            expanded.push(partsByCol.map(parts => (parts.length === maxParts ? parts[i] : parts[0]) ?? ''));
        }
    }
    return expanded;
}

export interface ParsedZoneRow {
    key: string;
    values: Partial<Record<ZoneField, string>>;
    selected: boolean;
}

/** Monta as linhas de zona a partir da grade, da linha de cabeçalho escolhida e do mapeamento
 *  coluna→campo. Linhas totalmente vazias (nenhuma coluna mapeada com valor) são descartadas —
 *  o resto (ex.: linhas de legenda/notas de rodapé) fica para o usuário desmarcar na prévia. */
export function buildZoneRows(grid: string[][], headerRowIndex: number, mapping: ColumnMapping[]): ParsedZoneRow[] {
    const dataRows = expandMultilineRows(grid.slice(headerRowIndex + 1));
    const rows: ParsedZoneRow[] = [];
    dataRows.forEach((row, i) => {
        const values: Partial<Record<ZoneField, string>> = {};
        mapping.forEach((field, colIdx) => {
            if (field === 'ignore') return;
            const v = (row[colIdx] || '').trim();
            if (v) values[field as ZoneField] = v;
        });
        if (Object.keys(values).length === 0) return;
        rows.push({ key: `row-${i}`, values, selected: true });
    });
    return rows;
}

const FIELD_KEYWORDS: [ZoneField, string[]][] = [
    ['macroarea', ['macroarea']],
    ['zona', ['zona']],
    ['gabarito_altura_maxima', ['gabarito', 'altura']],
    ['gabarito_pavimentos', ['gabarito', 'pavimento']],
    ['ca_minimo', ['minimo']],
    ['ca_basico', ['basico']],
    ['ca_maximo', ['maximo']],
    ['taxa_ocupacao_maxima', ['ocupacao']],
    ['taxa_permeabilidade_minima', ['permeabilidade']],
    ['uso_permitido', ['uso']],
    ['recuo_frente', ['recuo', 'frente']],
    ['recuo_fundos', ['recuo', 'fundos']],
    ['recuo_lateral_direita', ['recuo', 'direit']],
    ['recuo_lateral_esquerda', ['recuo', 'esquerd']],
    ['regra_vagas', ['regra', 'vaga']],
    ['vagas_por_unidade', ['vaga']],
    ['area_minima_unidade', ['area', 'minima']],
    ['lei_referencia', ['lei']],
    ['documento_fonte', ['documento']],
    ['nivel_confianca', ['confianca']],
    ['observacoes', ['observa']],
];

function normalize(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Sugestão automática de mapeamento por palavra-chave no texto do cabeçalho (o usuário
 *  sempre pode corrigir manualmente — isso é só um ponto de partida). */
export function suggestMapping(headerRow: string[]): ColumnMapping[] {
    const used = new Set<ZoneField>();
    return headerRow.map(header => {
        const norm = normalize(header);
        for (const [field, keywords] of FIELD_KEYWORDS) {
            if (used.has(field)) continue;
            if (keywords.every(k => norm.includes(k))) {
                used.add(field);
                return field;
            }
        }
        return 'ignore' as ColumnMapping;
    });
}

// Duas linhas de exemplo (baseadas num caso real de mapa regulatório municipal) só para
// ilustrar o formato esperado de cada coluna — o usuário apaga/sobrescreve ao preencher.
const TEMPLATE_EXAMPLES: Partial<Record<ZoneField, string>>[] = [
    {
        macroarea: 'Urbanização Consolidada', zona: 'ZC', uso_permitido: 'Residencial, misto',
        ca_minimo: '0,25', ca_basico: '3', ca_maximo: '4',
        taxa_ocupacao_maxima: '0,9', taxa_permeabilidade_minima: '0,05', gabarito_altura_maxima: 'N.A.',
        gabarito_pavimentos: '', recuo_frente: '5', recuo_fundos: '3',
        recuo_lateral_direita: '1,5', recuo_lateral_esquerda: '1,5',
        regra_vagas: 'por unidade', vagas_por_unidade: '1', area_minima_unidade: '45',
        lei_referencia: 'Lei nº 1.234/2020', documento_fonte: 'Plano Diretor', nivel_confianca: 'Validado na prefeitura',
        observacoes: '',
    },
    {
        macroarea: 'Qualificação Urbana', zona: 'ZM 1', uso_permitido: 'Residencial',
        ca_minimo: '0,25', ca_basico: '2,5', ca_maximo: '4',
        taxa_ocupacao_maxima: '0,8', taxa_permeabilidade_minima: '0,05', gabarito_altura_maxima: 'N.A.',
        gabarito_pavimentos: '', recuo_frente: '5', recuo_fundos: '3',
        recuo_lateral_direita: '1,5', recuo_lateral_esquerda: '1,5',
        regra_vagas: 'por unidade', vagas_por_unidade: '1', area_minima_unidade: '42',
        lei_referencia: 'Lei nº 1.234/2020', documento_fonte: 'Plano Diretor', nivel_confianca: 'Médio',
        observacoes: '',
    },
];

/** Gera e baixa um .xlsx modelo com o cabeçalho esperado (labels iguais aos da tabela de
 *  zonas) e 2 linhas de exemplo — ponto de partida para o usuário preencher com a lei da
 *  cidade dele. O importador não exige esse layout exato (o mapeamento de colunas é livre),
 *  mas usá-lo dispensa o passo de mapeamento (o cabeçalho já bate com os campos). */
export function downloadTemplateWorkbook(): void {
    const headers = ZONE_COLUMNS.map(c => c.label);
    const rows = TEMPLATE_EXAMPLES.map(example => ZONE_COLUMNS.map(c => example[c.key] ?? ''));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(16, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mapa Regulatório');
    XLSX.writeFile(wb, 'modelo-mapa-regulatorio.xlsx');
}
