// utils/catalogoPlanilhaExcel.ts — Marcas e Modelos ⇄ arquivo .xlsx
//
// Só o arquivo: gerar (exportar / planilha modelo) e ler. As regras moram em
// catalogoPlanilha.ts. O ExcelJS é carregado SÓ quando a pessoa clica
// (import dinâmico, como StructuralCutTable) — abrir Configurações não paga ~1 MB.
import {
    COLUNAS_PLANILHA, lerLinha, mapearCabecalho, ROTULOS_CATEGORIA, ROTULOS_SITUACAO, ROTULOS_TIPO,
    type CampoPlanilha, type LinhaLida,
} from './catalogoPlanilha';

export const ABA_DADOS = 'Marcas e Modelos';
const ABA_INSTRUCOES = 'Instruções';
const ULTIMA_LINHA_VALIDADA = 5000;

type ExcelJSNs = typeof import('exceljs');
const carregarExcelJS = async (): Promise<ExcelJSNs> => {
    const mod = await import('exceljs');
    return ((mod as unknown as { default?: ExcelJSNs }).default ?? mod) as ExcelJSNs;
};

/** Texto de uma célula, qualquer que seja o tipo (fórmula, rich text, link, data, número). */
function textoDaCelula(valor: unknown): string {
    if (valor === null || valor === undefined) return '';
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    if (typeof valor === 'object') {
        const o = valor as Record<string, unknown>;
        if ('hyperlink' in o && typeof o.hyperlink === 'string') return o.hyperlink.replace(/^mailto:/, '');
        if ('result' in o) return o.result === null || o.result === undefined ? '' : String(o.result);
        if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(r => r.text).join('');
        if ('text' in o) return String(o.text ?? '');
        return '';
    }
    return String(valor);
}

const letra = (n: number) => {
    let s = '';
    for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
    return s;
};

/**
 * Planilha de Marcas e Modelos. Sem linhas = planilha modelo para preencher.
 * `comOrganizacao` acrescenta a coluna informativa (exportação em "Todas").
 */
export async function gerarPlanilhaCatalogo(
    linhas: Record<CampoPlanilha, string | number>[],
    opts: { comOrganizacao: boolean },
): Promise<Blob> {
    const ExcelJS = await carregarExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ÒPURA';
    const ws = wb.addWorksheet(ABA_DADOS, { views: [{ state: 'frozen', ySplit: 1 }] });
    const colunas = COLUNAS_PLANILHA.filter(c => c.campo !== 'organizacao' || opts.comOrganizacao);
    ws.columns = colunas.map(c => ({ header: c.titulo, key: c.campo, width: c.largura }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    linhas.forEach(l => ws.addRow(colunas.map(c => l[c.campo] ?? '')));

    // Listas de escolha nas colunas de valor conhecido (o app aceita também sem acento/caixa).
    const lista = (campo: CampoPlanilha, valores: string[], titulo: string) => {
        const i = colunas.findIndex(c => c.campo === campo);
        if (i < 0) return;
        const col = letra(i + 1);
        (ws as unknown as { dataValidations: { add: (r: string, v: unknown) => void } }).dataValidations.add(`${col}2:${col}${ULTIMA_LINHA_VALIDADA}`, {
            type: 'list', allowBlank: true, formulae: [`"${valores.join(',')}"`],
            showErrorMessage: true, errorStyle: 'warning', errorTitle: titulo, error: `Use um destes: ${valores.join(', ')}.`,
        });
    };
    lista('tipo', ROTULOS_TIPO, 'Tipo de item');
    lista('categoria', ROTULOS_CATEGORIA, 'Categoria padrão do ativo');
    lista('situacao', ROTULOS_SITUACAO, 'Situação');

    const ins = wb.addWorksheet(ABA_INSTRUCOES);
    ins.getColumn(1).width = 110;
    [
        'Como preencher — Configurações › Marcas e Modelos',
        '',
        '• Uma linha por MODELO. Para cadastrar uma marca sem modelo, deixe a coluna Modelo em branco.',
        '• Marca é a única coluna obrigatória. Todo modelo pertence a uma marca.',
        '• Marca e modelo que já existem são reconhecidos pelo nome, ignorando maiúsculas e acentos — a linha ATUALIZA em vez de duplicar.',
        '• Célula em branco não apaga nada: só o que estiver preenchido é gravado.',
        '• Situação (Ativo/Inativo) vale para o modelo; numa linha sem modelo, vale para a marca.',
        `• Tipo de item: ${ROTULOS_TIPO.join(', ')}.`,
        `• Categoria padrão do ativo: ${ROTULOS_CATEGORIA.join(', ')} — com a vida útil, é o que o cadastro de ativo preenche sozinho ao escolher o modelo.`,
        '• Vida útil padrão: meses inteiros entre 1 e 1200. Ficha técnica: link começando com http:// ou https://.',
        '• A coluna Organização (quando existe) é só informativa: a importação grava na organização escolhida no sistema.',
        '• Antes de gravar, o sistema mostra o que cada linha vai fazer (nova marca, novo modelo, atualiza, sem mudança ou erro).',
        '',
        'Exemplo:',
        'Marca: WEG · Modelo: W22 5cv · Tipo de item: Equipamento · Código do fabricante: 11801453 · Categoria padrão do ativo: Equipamento · Vida útil: 120',
    ].forEach((t, i) => {
        const c = ins.getCell(`A${i + 1}`);
        c.value = t;
        if (i === 0) c.font = { bold: true, size: 13 };
        c.alignment = { wrapText: true, vertical: 'top' };
    });

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Lê a planilha: aba "Marcas e Modelos" (ou a primeira), cabeçalho na linha 1. */
export async function lerPlanilhaCatalogo(dados: ArrayBuffer): Promise<{ linhas: LinhaLida[]; erro?: string }> {
    const ExcelJS = await carregarExcelJS();
    const wb = new ExcelJS.Workbook();
    try {
        await wb.xlsx.load(dados);
    } catch {
        return { linhas: [], erro: 'Não foi possível ler o arquivo. Confira se é uma planilha Excel (.xlsx).' };
    }
    const ws = wb.getWorksheet(ABA_DADOS) ?? wb.worksheets.find(w => w.name !== ABA_INSTRUCOES) ?? wb.worksheets[0];
    if (!ws) return { linhas: [], erro: 'A planilha está vazia.' };

    const celulas = (n: number): string[] => {
        const row = ws.getRow(n);
        const out: string[] = [];
        for (let c = 1; c <= Math.max(row.cellCount, ws.columnCount); c++) out.push(textoDaCelula(row.getCell(c).value));
        return out;
    };
    const { indices, erro } = mapearCabecalho(celulas(1));
    if (erro) return { linhas: [], erro };

    const linhas: LinhaLida[] = [];
    for (let n = 2; n <= ws.rowCount; n++) {
        const l = lerLinha(celulas(n), indices, n);
        if (l) linhas.push(l);
    }
    if (linhas.length === 0) return { linhas, erro: 'Nenhuma linha preenchida abaixo do cabeçalho.' };
    return { linhas };
}
