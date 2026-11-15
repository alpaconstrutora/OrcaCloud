/**
 * 'AAAA-MM-DD' de um instante no fuso de Brasília. Cortar o ISO (`created_at.slice(0, 10)`) dá o
 * dia em UTC: uma versão congelada depois das 21h aparecia com o dia seguinte. Independe do fuso
 * da máquina (o CI roda em UTC).
 */
const DIA_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

export const diaDeBrasilia = (iso: string): string => DIA_SP.format(new Date(iso));

/** 'DD/MM/AAAA' no fuso de Brasília. */
export const dataBRDeBrasilia = (iso: string): string => diaDeBrasilia(iso).split('-').reverse().join('/');
