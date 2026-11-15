// CSV das abas da Controladoria — um formato só (o que DRE e Fluxo já usavam:
// vírgula entre colunas, número com ponto decimal, texto entre aspas). Antes só
// duas das seis abas exportavam (crítica de 14/11/2026, passo 4 do plano).

type Celula = string | number | null | undefined;

function celula(v: Celula): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '';
    return `"${v.replace(/"/g, '""')}"`;
}

export function montarCSV(cabecalho: string[], linhas: Celula[][]): string {
    return [cabecalho.map(celula), ...linhas.map(l => l.map(celula))].map(l => l.join(',')).join('\n');
}

export function baixarCSV(nomeArquivo: string, cabecalho: string[], linhas: Celula[][]): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([montarCSV(cabecalho, linhas)], { type: 'text/csv' }));
    a.download = nomeArquivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
