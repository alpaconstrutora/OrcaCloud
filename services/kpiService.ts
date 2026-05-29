export interface SupplyKPIs {
    leadTimeDays: number | null;
    divergenceRate: number | null;
    financialApprovalRate: number | null;
    receivedCount: number;
    divergenceCount: number;
    approvedCount: number;
    completedCount: number;
}

const CLOSED_STATUSES = ['Recebido', 'Divergência'];
// Ativos = em trânsito no pipeline; fechados ficam só em CLOSED_STATUSES
const ACTIVE_STATUSES = ['Enviado', 'Confirmado', 'Separação', 'Em Trânsito', 'Entregue'];

export const kpiService = {
    compute(orders: any[]): SupplyKPIs {
        const completed = orders.filter(o => CLOSED_STATUSES.includes(o.status));
        const active = orders.filter(o => ACTIVE_STATUSES.includes(o.status));

        // Lead Time: avg days from created_at to receivedAt for completed orders
        const withLeadTime = completed.filter(o => o.created_at && o.receivedAt);
        let leadTimeDays: number | null = null;
        if (withLeadTime.length > 0) {
            const totalDays = withLeadTime.reduce((sum, o) => {
                const created = new Date(o.created_at).getTime();
                const received = new Date(o.receivedAt).getTime();
                return sum + Math.max(0, (received - created) / 86_400_000);
            }, 0);
            leadTimeDays = Math.round(totalDays / withLeadTime.length);
        }

        // Taxa Divergência: % dos pedidos fechados que chegaram como Divergência
        const divergenceCount = orders.filter(o => o.status === 'Divergência').length;
        const divergenceRate = completed.length > 0
            ? Math.round((divergenceCount / completed.length) * 100)
            : null;

        // Aprovação Financeira: % of completed orders that are financially approved
        const approvedCount = completed.filter(o => o.isFinancialApproved).length;
        const financialApprovalRate = completed.length > 0
            ? Math.round((approvedCount / completed.length) * 100)
            : null;

        return {
            leadTimeDays,
            divergenceRate,
            financialApprovalRate,
            receivedCount: completed.filter(o => o.status === 'Recebido').length,
            divergenceCount,
            approvedCount,
            completedCount: completed.length,
        };
    },
};
