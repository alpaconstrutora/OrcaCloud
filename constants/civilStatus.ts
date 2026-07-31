/**
 * Vocabulário de qualificação civil — fonte única.
 *
 * Estes valores são gravados como TEXTO em duas tabelas: `clients`
 * (migration 20270842000000) e `contract_guarantors` (fiador/garantidor).
 * Nenhuma das duas tem CHECK no banco de propósito — a enumeração vive aqui,
 * para que acrescentar uma opção não exija DDL numa tabela quente.
 *
 * ⚠️ Os rótulos SÃO os valores persistidos. Renomear um item aqui não migra o
 * que já está gravado — acrescentar é seguro, renomear não é.
 */

export const MARITAL_STATUS_OPTIONS = [
    'Solteiro(a)',
    'Casado(a)',
    'União estável',
    'Divorciado(a)',
    'Separado(a) judicialmente',
    'Viúvo(a)',
] as const;

export const MARITAL_REGIME_OPTIONS = [
    'Comunhão parcial',
    'Comunhão universal',
    'Separação absoluta',
    'Separação obrigatória',
    'Participação final nos aquestos',
] as const;

/**
 * Estados civis em que regime de bens e cônjuge fazem sentido — é o que decide
 * se os campos de cônjuge aparecem no formulário e se a outorga conjugal
 * (CC 1.647-1.649) é exigível na minuta.
 */
export const MARITAL_STATUS_WITH_SPOUSE: string[] = ['Casado(a)', 'União estável'];

export const hasSpouse = (maritalStatus?: string | null): boolean =>
    !!maritalStatus && MARITAL_STATUS_WITH_SPOUSE.includes(maritalStatus);
