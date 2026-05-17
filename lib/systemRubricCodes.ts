/**
 * Conjunto canônico de todos os códigos de rubricas usados pelo payrollEngine.
 * Deve estar sincronizado com os seeds nas migrations do Supabase.
 * Qualquer código gerado pelo engine que não esteja aqui indica rubrica faltando no banco.
 */
export const SYSTEM_RUBRIC_CODES = [
    // Base salarial
    'SALARIO',
    'SALDO_SALARIO',

    // Horas extras e adicionais
    'HE50',
    'HE100',
    'AD_NOTURNO',

    // Férias
    'FERIAS',
    'FERIAS_TERCO',

    // 13º salário
    'DECIMO',
    'DESC_ADIANT_13',   // Dedução da 1ª parcela na 2ª parcela do 13º

    // Eventos manuais (fallback quando evento não tem rubric_code)
    'BONUS',
    'OUTROS',

    // Tributação (calculados pelo engine, não por fórmula de rubrica)
    'INSS',
    'IRRF',
    'FGTS',
    'FGTS_MULTA',

    // Rubricas configuráveis (exemplo — adiantamento quinzenal)
    'ADIANTAMENTO',
] as const;

export type SystemRubricCode = typeof SYSTEM_RUBRIC_CODES[number];

export const SYSTEM_RUBRIC_CODE_SET = new Set<string>(SYSTEM_RUBRIC_CODES);
