/**
 * Abas de Boletos a Pagar — puro, sem React.
 *
 * 16/10/2026: a captura por e-mail era uma aba só com quatro tabelas empilhadas
 * (caixas, buscas, remetentes, histórico) e três delas crescem. Pedido do
 * usuário: separar em abas. Ficou um trilho só (guia §19.1 — duas barras
 * empilhadas deixam os KPIs sem dono), cada aba com título e KPIs próprios.
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md.
 */
export type AbaBoletos = 'boletos' | 'captura_caixas' | 'captura_buscas' | 'captura_historico';
export type SecaoCaptura = 'caixas' | 'buscas' | 'historico';

export const ABAS_BOLETOS: Array<{ id: AbaBoletos; label: string }> = [
    { id: 'boletos', label: 'Boletos' },
    { id: 'captura_caixas', label: 'Caixas e remetentes' },
    { id: 'captura_buscas', label: 'Buscas por período' },
    { id: 'captura_historico', label: 'Histórico da captura' },
];

/** O título muda com a aba (guia §19.1 — aba que troca o conteúdo troca o h1). */
export const CABECALHO_DA_ABA: Record<AbaBoletos, { titulo: string; subtitulo: string }> = {
    boletos: {
        titulo: 'Boletos a Pagar',
        subtitulo: 'Capture boletos via PDF e gere lançamentos automaticamente em contas a pagar.',
    },
    captura_caixas: {
        titulo: 'Caixas e remetentes',
        subtitulo: 'Caixas do Gmail lidas a cada 15 minutos e os remetentes cujos PDFs viram boleto em revisão.',
    },
    captura_buscas: {
        titulo: 'Buscas por período',
        subtitulo: 'Leituras retroativas: um dia, um mês ou um intervalo, de todos os remetentes ou só dos escolhidos.',
    },
    captura_historico: {
        titulo: 'Histórico da captura',
        subtitulo: 'Cada PDF lido nas caixas e o que aconteceu com ele: boleto criado, duplicado, ignorado ou falha.',
    },
};

/** Aba salva no navegador → aba válida. "captura" é o valor de antes de 16/10/2026. */
export function normalizarAba(salva: string | null | undefined): AbaBoletos {
    if (salva === 'captura') return 'captura_caixas';
    return ABAS_BOLETOS.some(a => a.id === salva) ? (salva as AbaBoletos) : 'boletos';
}

export function secaoDaAba(aba: AbaBoletos): SecaoCaptura | null {
    switch (aba) {
        case 'captura_caixas': return 'caixas';
        case 'captura_buscas': return 'buscas';
        case 'captura_historico': return 'historico';
        default: return null;
    }
}
