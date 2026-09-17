import { describe, it, expect } from 'vitest';
import { formatarEnderecoEmpresa, enderecoDaEmpresaParaNota } from '../utils/enderecoEmpresa';

describe('formatarEnderecoEmpresa', () => {
    it('monta a linha completa no formato de nota fiscal', () => {
        expect(formatarEnderecoEmpresa({
            logradouro: 'Praça Coronel Maximiano', numero: '120', complemento: 'Sala 3',
            bairro: 'Centro', cidade: 'Cambuí', uf: 'MG', cep: '37600-000',
        })).toBe('Praça Coronel Maximiano, 120, Sala 3 - Centro, Cambuí/MG - CEP 37600-000');
    });

    it('omite campos vazios sem deixar separador sobrando', () => {
        expect(formatarEnderecoEmpresa({ logradouro: 'Rua A', numero: '', cidade: 'Cambuí', uf: 'MG' }))
            .toBe('Rua A - Cambuí/MG');
        expect(formatarEnderecoEmpresa({ cidade: 'Cambuí' })).toBe('Cambuí');
        expect(formatarEnderecoEmpresa({ cep: ' 37600-000 ' })).toBe('CEP 37600-000');
    });

    it("devolve '' para endereço ausente ou só com campos em branco (o cadastro grava assim)", () => {
        expect(formatarEnderecoEmpresa(undefined)).toBe('');
        expect(formatarEnderecoEmpresa(null)).toBe('');
        expect(formatarEnderecoEmpresa({ cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' })).toBe('');
    });
});

describe('enderecoDaEmpresaParaNota', () => {
    it('prefere o fiscal e só cai no operacional quando o fiscal está em branco', () => {
        const fiscal = { logradouro: 'Rua Fiscal', numero: '1' };
        const operacional = { logradouro: 'Rua Operacional', numero: '2' };
        expect(enderecoDaEmpresaParaNota(fiscal, operacional)).toBe('Rua Fiscal, 1');
        expect(enderecoDaEmpresaParaNota({ logradouro: '' }, operacional)).toBe('Rua Operacional, 2');
        expect(enderecoDaEmpresaParaNota(null, null)).toBe('');
    });
});
