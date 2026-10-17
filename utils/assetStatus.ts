import type { AssetStatus, MaintenanceStatus, ReservationStatus } from '../types/assets';

/**
 * Rótulos dos status da Gestão de Ativos — fonte única para tabela, card da grade,
 * filtros, "Agrupar" e mensagens. Até 17/10/2026 cada lugar decidia sozinho: a
 * coluna mostrava o código cru ("disponivel", "aprovada", "concluida") e o mesmo
 * `em_uso` era "Em Obra" na tabela e "Em Uso" no filtro.
 *
 * `Record<…Status, string>`: status novo no tipo sem rótulo aqui não compila.
 * Sentence case (guia de UI §6.2/§8).
 */
export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
    disponivel: 'Disponível',
    // O bem foi entregue a uma obra (movimentação/retirada) — a coluna ao lado diz qual.
    em_uso: 'Em obra',
    manutencao: 'Em manutenção',
    ocioso: 'Ocioso',
    baixado: 'Baixado',
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
    pendente: 'Pendente',
    aprovada: 'Aprovada',
    // Equipamento entregue e em uso pela obra solicitante.
    ativa: 'Em uso',
    finalizada: 'Finalizada',
    cancelada: 'Cancelada',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
    agendada: 'Agendada',
    em_execucao: 'Em oficina',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
};

/** Rótulo do status, com o próprio código como último recurso (valor legado fora do tipo). */
export function rotuloDoStatus<S extends string>(mapa: Record<S, string>, status: S | null | undefined): string {
    if (!status) return '—';
    return mapa[status] ?? status;
}
