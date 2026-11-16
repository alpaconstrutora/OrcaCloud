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

// ── Comparativo com o ano anterior (2ª crítica, 3ª publicação — decisão do usuário:
//    "Mesmo período do ano anterior": tira a sazonalidade da obra e da venda) ──────

/** A mesma data um ano antes; 29/02 vira 28/02. */
export function menosUmAno(iso: string): string {
    const [a, m, d] = iso.split('-');
    const dia = m === '02' && d === '29' ? '28' : d;
    return `${Number(a) - 1}-${m}-${dia}`;
}

/** O mesmo período, um ano antes. */
export function periodoDoAnoAnterior(de: string, ate: string): { de: string; ate: string } {
    return { de: menosUmAno(de), ate: menosUmAno(ate) };
}

/** Como chamar o período de comparação: "2025" para o ano cheio, "mesmo período de
 *  2025" para um recorte dentro do ano, "um ano antes" quando o recorte cruza anos. */
export function nomeDoAnoAnterior(de: string, ate: string): string {
    const anoDe = de.slice(0, 4), anoAte = ate.slice(0, 4);
    const anterior = Number(anoDe) - 1;
    if (anoDe !== anoAte) return 'um ano antes';
    if (de.slice(5) === '01-01' && ate.slice(5) === '12-31') return String(anterior);
    return `mesmo período de ${anterior}`;
}

// ── Atalhos de período (decisão do usuário: "Mês, mês anterior, trimestre, ano").
//    Rótulo curto (a barra cabe numa linha a 1280 px); o `title` diz o período por
//    extenso. As datas continuam editáveis ao lado. ────────────────────────────────

export interface AtalhoDePeriodo { id: 'mes' | 'mes_anterior' | 'trimestre' | 'ano'; rotulo: string; extenso: string; de: string; ate: string }

const dois = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (a: number, m1: number) => new Date(a, m1, 0).getDate(); // m1 = mês 1–12

export function atalhosDePeriodo(agora: Date = new Date()): AtalhoDePeriodo[] {
    const a = agora.getFullYear();
    const m = agora.getMonth() + 1;
    const mesAnt = m === 1 ? 12 : m - 1;
    const anoMesAnt = m === 1 ? a - 1 : a;
    const tri = Math.floor((m - 1) / 3) * 3 + 1; // 1º mês do trimestre
    return [
        { id: 'mes', rotulo: 'Mês', extenso: 'Este mês', de: `${a}-${dois(m)}-01`, ate: `${a}-${dois(m)}-${dois(ultimoDia(a, m))}` },
        { id: 'mes_anterior', rotulo: 'Mês anterior', extenso: 'Mês anterior', de: `${anoMesAnt}-${dois(mesAnt)}-01`, ate: `${anoMesAnt}-${dois(mesAnt)}-${dois(ultimoDia(anoMesAnt, mesAnt))}` },
        { id: 'trimestre', rotulo: 'Trimestre', extenso: 'Este trimestre', de: `${a}-${dois(tri)}-01`, ate: `${a}-${dois(tri + 2)}-${dois(ultimoDia(a, tri + 2))}` },
        { id: 'ano', rotulo: 'Ano', extenso: 'Este ano', ...anoCorrente(agora) },
    ];
}
