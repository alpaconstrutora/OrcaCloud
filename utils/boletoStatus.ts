import type { BoletoStatus } from '../types';

// Fonte única do vocabulário/cor de status de boleto — consumida por
// BoletoManager.tsx (tabela) e BoletoFormModal.tsx (cabeçalho do modal).
// Extraído de BoletoManager.tsx para não criar import circular entre os dois.
export const STATUS_LABELS: Record<BoletoStatus, string> = {
    rascunho: 'Rascunho',
    revisao: 'Em revisão',
    aprovado: 'Aprovado',
    programado: 'Programado',
    pago: 'Pago',
    cancelado: 'Cancelado',
};

// Padrão guia seção 8 — texto simples, sem pílula
export const STATUS_TEXT_COLORS: Record<BoletoStatus, string> = {
    rascunho: 'text-gray-700',
    revisao: 'text-amber-700',
    aprovado: 'text-blue-700',
    programado: 'text-indigo-700',
    pago: 'text-emerald-700',
    cancelado: 'text-red-700',
};
