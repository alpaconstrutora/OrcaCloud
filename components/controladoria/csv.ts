// CSV das abas da Controladoria — um formato só, o que o Excel em português abre
// direto em colunas: ";" entre colunas, vírgula decimal, texto entre aspas e BOM
// UTF-8 (sem ele o Excel lê "Competência" como "CompetÃªncia"). Antes era vírgula
// e ponto: o Excel pt-BR jogava a linha inteira numa coluna só (2ª crítica,
// 15/11/2026).

type Celula = string | number | null | undefined;

function celula(v: Celula): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '';
    return `"${v.replace(/"/g, '""')}"`;
}

export function montarCSV(cabecalho: string[], linhas: Celula[][]): string {
    return [cabecalho.map(celula), ...linhas.map(l => l.map(celula))].map(l => l.join(';')).join('\n');
}

/** O conteúdo do arquivo: BOM + CSV. */
export function arquivoCSV(cabecalho: string[], linhas: Celula[][]): string {
    return '\uFEFF' + montarCSV(cabecalho, linhas);
}

export function baixarCSV(nomeArquivo: string, cabecalho: string[], linhas: Celula[][]): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([arquivoCSV(cabecalho, linhas)], { type: 'text/csv;charset=utf-8' }));
    a.download = nomeArquivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
