// utils/empreendimentoComercial.ts
// Fonte única da tradução de status EN (Comercial) ↔ PT (Empreendimento) e
// dos rótulos/estilos usados no Espelho de Vendas e no Centro de Sincronização.
import { UnitStatus } from '../types';

// Status do Comercial que não têm equivalente em UnitStatus — não mapeáveis.
export const UNMAPPABLE_COMMERCIAL_STATUSES = new Set(['RENTED', 'MAINTENANCE']);

// Comercial (EN) → Empreendimento (PT). Retorna null para status sem equivalente
// (RENTED / MAINTENANCE / desconhecido) — nunca sincronizar silenciosamente.
export const mapCommercialToEmpr = (s: string): UnitStatus | null => {
  switch (s) {
    case 'AVAILABLE': return 'DISPONIVEL';
    case 'RESERVED':  return 'RESERVADO';
    case 'SOLD':      return 'VENDIDO';
    case 'EXCHANGED': return 'PERMUTADO';
    default:          return null;
  }
};

// Empreendimento (PT) → Comercial (EN).
export const mapEmprToCommercial = (s: UnitStatus): string => {
  switch (s) {
    case 'DISPONIVEL': return 'AVAILABLE';
    case 'RESERVADO':  return 'RESERVED';
    case 'VENDIDO':    return 'SOLD';
    case 'PERMUTADO':  return 'EXCHANGED';
  }
};

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  DISPONIVEL: 'Disponível', RESERVADO: 'Reservado', VENDIDO: 'Vendido', PERMUTADO: 'Permutado',
};
export const UNIT_STATUS_STYLE: Record<UnitStatus, string> = {
  DISPONIVEL: 'bg-emerald-500/10 text-emerald-600',
  RESERVADO:  'bg-amber-500/10 text-amber-600',
  VENDIDO:    'bg-blue-500/10 text-blue-600',
  PERMUTADO:  'bg-violet-500/10 text-violet-600',
};

export const COMM_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponível', RESERVED: 'Reservado', SOLD: 'Vendido',
  RENTED: 'Locado', EXCHANGED: 'Permutado', MAINTENANCE: 'Manutenção',
};
export const COMM_STATUS_STYLE: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500/10 text-emerald-600',
  RESERVED:  'bg-amber-500/10 text-amber-600',
  SOLD:      'bg-blue-500/10 text-blue-600',
  EXCHANGED: 'bg-violet-500/10 text-violet-600',
  RENTED:    'bg-teal-500/10 text-teal-600',
  MAINTENANCE: 'bg-gray-500/10 text-gray-600',
};
