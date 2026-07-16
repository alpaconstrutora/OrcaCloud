// Motor estatístico básico para o método comparativo direto de dados de mercado (NBR 14653-2).
// Escopo deliberadamente simplificado: cobre homogeneização por fatores, medidas de tendência
// central/dispersão e regressão linear simples (1 variável). NÃO reproduz a tabela completa de
// graus de fundamentação da norma (que exige testes de significância dos coeficientes, graus de
// liberdade etc.) — a classificação aqui é uma estimativa indicativa, a ser validada pelo RT.

export interface DescriptiveStats {
    n: number;
    mean: number;
    median: number;
    stdDev: number;
    /** Coeficiente de variação (%) — dispersão relativa da amostra */
    coefficientOfVariation: number;
    min: number;
    max: number;
}

export function descriptiveStats(values: number[]): DescriptiveStats {
    const n = values.length;
    if (n === 0) return { n: 0, mean: 0, median: 0, stdDev: 0, coefficientOfVariation: 0, min: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
    const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean !== 0 ? (stdDev / mean) * 100 : 0;
    return { n, mean, median, stdDev, coefficientOfVariation, min: sorted[0], max: sorted[n - 1] };
}

/** Intervalo de confiança aproximado (95%) em torno da média — aproximação normal (z=1.96), não t-Student exato. */
export function confidenceInterval95(stats: DescriptiveStats): { lower: number; upper: number } {
    if (stats.n === 0) return { lower: 0, upper: 0 };
    const marginOfError = 1.96 * (stats.stdDev / Math.sqrt(stats.n));
    return { lower: stats.mean - marginOfError, upper: stats.mean + marginOfError };
}

export interface LinearRegressionResult {
    slope: number;
    intercept: number;
    rSquared: number;
    n: number;
    predict: (x: number) => number;
}

/** Regressão linear simples y = a + b*x pelo método dos mínimos quadrados (1 variável independente). */
export function linearRegression(x: number[], y: number[]): LinearRegressionResult | null {
    const n = x.length;
    if (n < 2 || n !== y.length) return null;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let ssXY = 0, ssXX = 0, ssYY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        ssXY += dx * dy;
        ssXX += dx * dx;
        ssYY += dy * dy;
    }
    if (ssXX === 0) return null;
    const slope = ssXY / ssXX;
    const intercept = meanY - slope * meanX;
    const rSquared = ssYY !== 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0;
    return { slope, intercept, rSquared, n, predict: (val: number) => intercept + slope * val };
}

export type GrauFundamentacao = 'I' | 'II' | 'III';

/**
 * Classificação SIMPLIFICADA e indicativa do grau de fundamentação (NBR 14653-2, Anexo A).
 * A norma oficial exige, além do exposto aqui, testes de significância dos coeficientes de
 * regressão, número mínimo de graus de liberdade e outros critérios estatísticos que este
 * motor não calcula. Trate o resultado como ponto de partida — a classificação final é
 * responsabilidade do engenheiro/avaliador responsável técnico (RT).
 */
export function estimateGrauFundamentacao(stats: DescriptiveStats): GrauFundamentacao {
    if (stats.n >= 8 && stats.coefficientOfVariation <= 15) return 'III';
    if (stats.n >= 6 && stats.coefficientOfVariation <= 30) return 'II';
    return 'I';
}
