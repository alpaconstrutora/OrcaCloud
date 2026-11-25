import { servicoDeAliquotaPorExercicio, AliquotaPorExercicio } from './aliquotaPorExercicioService';

export type PisRate = AliquotaPorExercicio;

/** Alíquotas oficiais de PIS por exercício/regime — globais, iguais para todas as organizações. */
export const pisRatesService = servicoDeAliquotaPorExercicio('tax_pis_rates');
