// utils/empreendimentoComercial.ts
// Fonte única da tradução de status EN (Comercial) ↔ PT (Empreendimento) e
// dos rótulos/estilos usados no Espelho de Vendas e no Centro de Sincronização.
import { UnitStatus, UnitPositionType, UnitSunOrientation, UnitViewType } from '../types';

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

// ── Atributos de precificação: tradução PT (Empreendimento) → EN (Comercial) ──

export const mapPositionToCommercial = (p?: UnitPositionType | null): string | undefined => {
  switch (p) {
    case 'FRENTE': return 'FRONT';
    case 'LATERAL': return 'LATERAL';
    case 'FUNDOS': return 'BACK';
    default: return undefined;
  }
};

export const mapViewToCommercial = (v?: UnitViewType | null): string | undefined => {
  switch (v) {
    case 'SEM_VISTA': return 'NONE';
    case 'PARCIAL': return 'PARTIAL';
    case 'PLENA': return 'FULL';
    default: return undefined;
  }
};

export const mapSunToCommercial = (s?: UnitSunOrientation | null): string | undefined => {
  switch (s) {
    case 'NORTE': return 'NORTH';
    case 'SUL': return 'SOUTH';
    case 'LESTE': return 'EAST';
    case 'OESTE': return 'WEST';
    default: return undefined;
  }
};

// Rótulos PT curtos para a UI do UnitEditor
export const POSITION_LABEL: Record<UnitPositionType, string> = {
  FRENTE: 'Frente', LATERAL: 'Lateral', FUNDOS: 'Fundos',
};
export const VIEW_LABEL: Record<UnitViewType, string> = {
  SEM_VISTA: 'Sem vista', PARCIAL: 'Parcial', PLENA: 'Plena',
};
export const SUN_LABEL: Record<UnitSunOrientation, string> = {
  NORTE: 'Norte', SUL: 'Sul', LESTE: 'Leste', OESTE: 'Oeste',
};
export const POSITION_STYLE: Record<UnitPositionType, string> = {
  FRENTE: 'bg-blue-500/10 text-blue-600',
  LATERAL: 'bg-gray-500/10 text-gray-600',
  FUNDOS: 'bg-orange-500/10 text-orange-600',
};
export const VIEW_STYLE: Record<UnitViewType, string> = {
  SEM_VISTA: 'bg-gray-500/10 text-gray-600',
  PARCIAL: 'bg-amber-500/10 text-amber-600',
  PLENA: 'bg-emerald-500/10 text-emerald-600',
};
export const SUN_STYLE: Record<UnitSunOrientation, string> = {
  NORTE: 'bg-emerald-500/10 text-emerald-600',
  SUL: 'bg-gray-500/10 text-gray-600',
  LESTE: 'bg-amber-500/10 text-amber-600',
  OESTE: 'bg-orange-500/10 text-orange-600',
};
