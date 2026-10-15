import { describe, it, expect } from 'vitest';
import { validateCPF, validateCNPJ, validateCpfCnpj, validateAllocationTotal } from '../lib/validators';
import { payrollService } from '../services/payrollService';

// ─── validateCPF ─────────────────────────────────────────────────────────────

describe('validateCPF — dígitos verificadores mod-11', () => {
    // CPFs válidos gerados com algoritmo oficial
    it('aceita CPF válido sem formatação', () => {
        expect(validateCPF('52998224725')).toBe(true);
    });

    it('aceita CPF válido com formatação', () => {
        expect(validateCPF('529.982.247-25')).toBe(true);
    });

    it('aceita outro CPF válido', () => {
        expect(validateCPF('111.444.777-35')).toBe(true);
    });

    it('rejeita CPF com dígito verificador errado', () => {
        expect(validateCPF('529.982.247-26')).toBe(false);  // último dígito errado
    });

    it('rejeita CPF com todos dígitos iguais (sequências inválidas)', () => {
        ['00000000000', '11111111111', '22222222222', '99999999999'].forEach(cpf => {
            expect(validateCPF(cpf)).toBe(false);
        });
    });

    it('rejeita CPF com menos de 11 dígitos', () => {
        expect(validateCPF('123.456.789')).toBe(false);
    });

    it('rejeita CPF com mais de 11 dígitos', () => {
        expect(validateCPF('1234567890123')).toBe(false);
    });

    it('rejeita CPF zerado', () => {
        expect(validateCPF('000.000.000-00')).toBe(false);
    });

    it('rejeita string vazia', () => {
        expect(validateCPF('')).toBe(false);
    });
});

// ─── validateAllocationTotal ──────────────────────────────────────────────────

describe('validateAllocationTotal', () => {
    it('100% exato é válido', () => {
        const result = validateAllocationTotal([
            { allocation_percent: 60 },
            { allocation_percent: 40 },
        ]);
        expect(result.valid).toBe(true);
        expect(result.total).toBe(100);
    });

    it('abaixo de 100% é válido', () => {
        const result = validateAllocationTotal([{ allocation_percent: 75 }]);
        expect(result.valid).toBe(true);
        expect(result.total).toBe(75);
    });

    it('acima de 100% é inválido', () => {
        const result = validateAllocationTotal([
            { allocation_percent: 70 },
            { allocation_percent: 40 },
        ]);
        expect(result.valid).toBe(false);
        expect(result.total).toBe(110);
    });

    it('lista vazia é válida (total = 0)', () => {
        const result = validateAllocationTotal([]);
        expect(result.valid).toBe(true);
        expect(result.total).toBe(0);
    });

    it('retorna o total corretamente arredondado', () => {
        const result = validateAllocationTotal([
            { allocation_percent: 33.333 },
            { allocation_percent: 33.333 },
            { allocation_percent: 33.334 },
        ]);
        expect(result.total).toBeCloseTo(100, 1);
        expect(result.valid).toBe(true);
    });

    it('101% é inválido — borda superior', () => {
        const result = validateAllocationTotal([{ allocation_percent: 101 }]);
        expect(result.valid).toBe(false);
    });
});

// ─── payrollService.saveAllocations — guarda no service layer ─────────────────

describe('payrollService.saveAllocations — rejeita alocação > 100%', () => {
    it('lança erro antes de tocar o banco quando total ultrapassa 100%', async () => {
        // 70% + 50% = 120% — deve falhar antes de qualquer chamada ao Supabase
        const alocacoesInvalidas = [
            { employee_id: 'emp-test', project_id: 'proj-1', allocation_percent: 70 },
            { employee_id: 'emp-test', project_id: 'proj-2', allocation_percent: 50 },
        ];
        await expect(
            payrollService.saveAllocations('emp-test', '2024-01', alocacoesInvalidas as any)
        ).rejects.toThrow('ultrapassa 100%');
    });

    it('lança erro com mensagem contendo o total calculado', async () => {
        const alocacoes = [
            { employee_id: 'emp-test', project_id: 'proj-1', allocation_percent: 60 },
            { employee_id: 'emp-test', project_id: 'proj-2', allocation_percent: 60 },
        ];
        await expect(
            payrollService.saveAllocations('emp-test', '2024-01', alocacoes as any)
        ).rejects.toThrow('120.0%');
    });
});

// ─── validateCNPJ ────────────────────────────────────────────────────────────

describe('validateCNPJ — dígitos verificadores mod-11', () => {
    it('aceita CNPJ válido sem e com máscara', () => {
        expect(validateCNPJ('11222333000181')).toBe(true);
        expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
        // CNPJ público do Banco do Brasil
        expect(validateCNPJ('00.000.000/0001-91')).toBe(true);
    });

    it('rejeita primeiro DV errado e segundo DV errado', () => {
        expect(validateCNPJ('11.222.333/0001-91')).toBe(false);
        expect(validateCNPJ('11.222.333/0001-82')).toBe(false);
    });

    it('rejeita sequência repetida e tamanho errado', () => {
        expect(validateCNPJ('11111111111111')).toBe(false);
        expect(validateCNPJ('00000000000000')).toBe(false);
        expect(validateCNPJ('1122233300018')).toBe(false);
        expect(validateCNPJ('')).toBe(false);
    });
});

describe('validateCpfCnpj — escolhe pelo tamanho', () => {
    it('valida CPF e CNPJ, recusa outros tamanhos', () => {
        expect(validateCpfCnpj('529.982.247-25')).toBe(true);
        expect(validateCpfCnpj('11.222.333/0001-81')).toBe(true);
        expect(validateCpfCnpj('11.222.333/0001-82')).toBe(false);
        expect(validateCpfCnpj('123')).toBe(false);
    });
});
