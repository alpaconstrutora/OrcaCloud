import { useMemo } from 'react';
import { ImovibStudy } from '../types';
import { computeImovibMath, ImovibMathOptions, ImovibMathResult } from '../utils/imovibMotor';

// O motor mora em utils/imovibMotor.ts desde a Fase 0 do plano
// docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md. Os reexports
// mantêm os imports de quem já lia daqui.
export {
    computeImovibMath, calcularTirMensal, baseDaRubrica,
} from '../utils/imovibMotor';
export type {
    MonthlyFlow, LinhasDoMes, ImovibMathOptions, ImovibAba, ImovibAviso, ImovibMathResult,
} from '../utils/imovibMotor';

export const useImovibMath = (study: ImovibStudy | null | undefined, options?: ImovibMathOptions): ImovibMathResult => {
    return useMemo(() => computeImovibMath(study, options), [study, options?.vgvDelta, options?.costDelta]);
};
