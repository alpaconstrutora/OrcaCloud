/**
 * Datas em português para documentos: "7 de outubro de 2026" e
 * "Cambuí, 7 de outubro de 2026". Puro.
 *
 * Datas em `YYYY-MM-DD` são lidas pelo texto, nunca por `new Date('YYYY-MM-DD')`
 * (que é UTC e vira o dia anterior à noite no Brasil — memória
 * project_cronograma_timezone_bug).
 */
const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export interface DataPartes { dia: number; mes: number; ano: number }

/** Lê `YYYY-MM-DD` (ou um `Date`, em horário local). `null` quando não dá para ler. */
export function partesDaData(data: string | Date | null | undefined): DataPartes | null {
    if (!data) return null;
    if (data instanceof Date) {
        if (isNaN(data.getTime())) return null;
        return { dia: data.getDate(), mes: data.getMonth() + 1, ano: data.getFullYear() };
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data.trim());
    if (!m) return null;
    const ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return { dia, mes, ano };
}

/** "07/10/2026" */
export function dataCurta(data: string | Date | null | undefined): string {
    const p = partesDaData(data);
    if (!p) return '';
    return `${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}/${p.ano}`;
}

/** "7 de outubro de 2026" */
export function dataPorExtenso(data: string | Date | null | undefined): string {
    const p = partesDaData(data);
    if (!p) return '';
    return `${p.dia} de ${MESES[p.mes - 1]} de ${p.ano}`;
}

/** "Cambuí, 7 de outubro de 2026" — sem cidade, só a data por extenso. */
export function localEData(cidade: string | null | undefined, data: string | Date | null | undefined): string {
    const extenso = dataPorExtenso(data);
    if (!extenso) return '';
    const c = (cidade ?? '').trim();
    return c ? `${c}, ${extenso}` : extenso;
}

/** Hoje em `YYYY-MM-DD`, no horário local. */
export function hojeIso(agora: Date = new Date()): string {
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}
