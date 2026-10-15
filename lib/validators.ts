/**
 * Validação de CPF com verificação dos dígitos verificadores (algoritmo mod-11).
 * Aceita CPF com ou sem formatação (XXX.XXX.XXX-XX).
 */
export function validateCPF(cpf: string): boolean {
    const nums = cpf.replace(/\D/g, '');
    if (nums.length !== 11 || /^(\d)\1+$/.test(nums)) return false;

    const calcDigit = (n: number): number => {
        let sum = 0;
        for (let i = 0; i < n - 1; i++) sum += parseInt(nums[i]) * (n - i);
        const rem = (sum * 10) % 11;
        return rem >= 10 ? 0 : rem;
    };

    return calcDigit(10) === parseInt(nums[9]) && calcDigit(11) === parseInt(nums[10]);
}

/**
 * Validação de CNPJ com verificação dos dois dígitos verificadores (mod-11,
 * pesos 5..2,9..2 e 6..2,9..2). Aceita com ou sem máscara (XX.XXX.XXX/XXXX-XX).
 *
 * Existe para a leitura de boleto: o parser pegava "o primeiro CNPJ formatado
 * do texto", e um número com a forma de CNPJ mas DV errado (lixo de OCR, código
 * de convênio) era gravado como CNPJ do beneficiário e usado para sugerir
 * fornecedor. Só o CNPJ cujos DVs conferem pode identificar alguém.
 */
export function validateCNPJ(cnpj: string): boolean {
    const nums = cnpj.replace(/\D/g, '');
    if (nums.length !== 14 || /^(\d)\1+$/.test(nums)) return false;

    const calcDigit = (len: number): number => {
        const pesos = len === 12
            ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
            : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        for (let i = 0; i < len; i++) sum += parseInt(nums[i]) * pesos[i];
        const rem = sum % 11;
        return rem < 2 ? 0 : 11 - rem;
    };

    return calcDigit(12) === parseInt(nums[12]) && calcDigit(13) === parseInt(nums[13]);
}

/** CPF (11 dígitos) ou CNPJ (14 dígitos), com ou sem máscara. */
export function validateCpfCnpj(doc: string): boolean {
    const n = doc.replace(/\D/g, '');
    if (n.length === 11) return validateCPF(n);
    if (n.length === 14) return validateCNPJ(n);
    return false;
}

/**
 * Valida se o total de alocações não ultrapassa 100%.
 * Retorna { valid, total } para que o chamador possa exibir mensagem específica.
 */
export function validateAllocationTotal(allocations: { allocation_percent: number }[]): {
    valid: boolean;
    total: number;
} {
    const total = allocations.reduce((s, a) => s + (a.allocation_percent ?? 0), 0);
    return { valid: total <= 100, total: Number(total.toFixed(2)) };
}
