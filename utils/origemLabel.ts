// utils/origemLabel.ts
//
// O rótulo de origem de um título (`internal_transactions.source_system`).
// Morava em `components/ContasPagarParcelas.tsx` (que reexporta daqui); saiu
// para cá em 24/10/2026 porque o Portal do Síndico também o mostra, e importar
// a tela de Contas a Pagar inteira para ler um mapa de rótulos levaria o
// módulo todo para o pacote do portal. Um vocabulário só, três telas.

/**
 * Rótulo de origem por `source_system`. É a coluna que responde "de onde essa
 * parcela veio", e por isso mostra Pedido/Contrato/Medição separadamente em vez
 * de agrupar tudo como "Suprimentos".
 */
export const ORIGEM_PT: Record<string, string> = {
    PURCHASE_ORDER: 'Pedido de compra',
    CONTRACT_PARCELADO: 'Contrato',
    CONTRACT_AVISTA: 'Contrato à vista',
    CONTRACT_RECURRING: 'Contrato recorrente',
    CONTRACT_MEASUREMENT: 'Medição',
    BOLETO: 'Boleto',
    NFE: 'NF-e',
    LABOR: 'Folha',
    PROLABORE: 'Pró-labore',
    DIVIDENDOS: 'Dividendos',
    PROJECT: 'Obra',
    // Parcela de contrato de dívida/financiamento. O módulo de Dívidas é dono do
    // cronograma; aqui chega UMA LINHA POR COMPONENTE (amortização, juros,
    // correção, IOF, seguro, tarifa) — ver docs/planos/2026-08-29-gestao-dividas-financiamentos.md
    DEBT_INSTALLMENT: 'Financiamento',
    // Título gerado à mão — "Novo pagamento avulso" (plano 2026-10-17); a
    // conciliação também cria MANUAL ao lançar uma saída sem título.
    MANUAL: 'Avulso',
    // Guia que agrupa tributos (Tributos a Pagar › DARFs, 21/10/2026): os
    // tributos do DARF saem da lista e entram como UMA linha (`colapsarDarfs`).
    DARF: 'DARF',
};

/**
 * Rótulo com degradação legível: origem que ainda não está no mapa vira
 * "Contract Avista" em vez de `CONTRACT_AVISTA`. Até 15/08/2026 o fallback era
 * o código cru, e o mapa tinha 5 das 12 origens que o sistema grava — Boleto,
 * NF-e, Folha, Pró-labore e Dividendos apareciam em caixa alta.
 */
export const origemLabel = (sourceSystem: string) => {
    if (ORIGEM_PT[sourceSystem]) return ORIGEM_PT[sourceSystem];
    if (!sourceSystem) return '—';
    return sourceSystem
        .toLowerCase()
        .split('_')
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
};
