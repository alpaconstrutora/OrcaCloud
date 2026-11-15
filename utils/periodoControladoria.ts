// Regras de número e de período das seis abas da Controladoria (DRE, DRE por SPE,
// WIP, Balancete, Fluxo de Caixa, Diário Contábil). Um lugar só, para as abas não
// voltarem a divergir. Plano: docs/planos/2026-11-14-controladoria-critica.md.

/** Data de HOJE no fuso do navegador, em `AAAA-MM-DD`.
 *  `new Date().toISOString()` dá a data em UTC: à noite no Brasil (UTC−3) ela já é
 *  amanhã — o WIP e o Diário abriam com 15/11 em 14/11 (crítica de 14/11/2026). */
export function hojeLocalISO(agora: Date = new Date()): string {
    const a = agora.getFullYear();
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    const d = String(agora.getDate()).padStart(2, '0');
    return `${a}-${m}-${d}`;
}

/** 1º de janeiro e 31 de dezembro do ano corrente (local). */
export function anoCorrente(agora: Date = new Date()): { de: string; ate: string } {
    const a = agora.getFullYear();
    return { de: `${a}-01-01`, ate: `${a}-12-31` };
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** O campo `<input type="date">` devolve '' enquanto a data está incompleta e
 *  aceita anos como 0002 ou 0201 no meio da digitação. Nada disso vira consulta. */
function dataCompleta(v: string): boolean {
    const m = DATA_ISO.exec(v);
    return !!m && Number(m[1]) >= 1900;
}

/** Motivo pelo qual o período não pode ser consultado, ou `null` se pode.
 *  Com motivo, a aba NÃO consulta: mostrar números de um período que o usuário
 *  não pediu é pior que não mostrar nada. */
export function motivoPeriodoInvalido(de: string, ate: string): string | null {
    if (!dataCompleta(de)) return 'Informe a data inicial completa.';
    if (!dataCompleta(ate)) return 'Informe a data final completa.';
    if (de > ate) return 'A data inicial é depois da final.';
    return null;
}

/** Mesmo critério, para a aba de UMA data (WIP: "Posição em"). */
export function motivoDataInvalida(data: string): string | null {
    return dataCompleta(data) ? null : 'Informe a data completa.';
}

/** Margem % sobre a RECEITA LÍQUIDA — a base de toda margem da Controladoria
 *  (Lucro Bruto, EBITDA e Resultado, na DRE, na DRE por SPE e no Por Obra).
 *  Até 14/11/2026 a DRE dividia pela receita bruta e a SPE pela líquida: a mesma
 *  "Margem Líquida" dava dois números. Sem receita líquida positiva não há margem
 *  (`null`, a tela mostra "—"): % sobre zero ou sobre base negativa não diz nada. */
export function margemSobreReceitaLiquida(valor: number, receitaLiquida: number): number | null {
    if (!(receitaLiquida > 0)) return null;
    return (valor / receitaLiquida) * 100;
}
