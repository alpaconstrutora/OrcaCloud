import { servicoDeAliquotaPorExercicio, AliquotaPorExercicio } from './aliquotaPorExercicioService';

export type CofinsRate = AliquotaPorExercicio;

/** Alíquotas oficiais de COFINS por exercício/regime — globais, iguais para todas as organizações. */
export const cofinsRatesService = servicoDeAliquotaPorExercicio('tax_cofins_rates');
