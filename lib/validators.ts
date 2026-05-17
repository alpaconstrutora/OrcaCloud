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
