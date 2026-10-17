import { describe, it, expect } from 'vitest';
import { validarChavePix, deduzirTipoChave, mascararChave, tipoParaAsaas } from '../utils/pixKey';

describe('validarChavePix', () => {
    it('CPF: só dígitos e DV conferido', () => {
        expect(validarChavePix('cpf', '529.982.247-25')).toEqual({ ok: true, chave: '52998224725', motivo: null });
        expect(validarChavePix('cpf', '529.982.247-24').ok).toBe(false);
        expect(validarChavePix('cpf', '1234567890').ok).toBe(false);
    });

    it('a chave fictícia do Bacen usada no sandbox da Asaas é aceita', () => {
        expect(validarChavePix('cpf', '99991111140')).toEqual({ ok: true, chave: '99991111140', motivo: null });
    });

    it('CNPJ: só dígitos e DV conferido', () => {
        expect(validarChavePix('cnpj', '11.222.333/0001-81')).toEqual({ ok: true, chave: '11222333000181', motivo: null });
        expect(validarChavePix('cnpj', '11.222.333/0001-82').ok).toBe(false);
    });

    it('e-mail minúsculo', () => {
        expect(validarChavePix('email', ' Financeiro@Alpa.com.BR ')).toEqual({ ok: true, chave: 'financeiro@alpa.com.br', motivo: null });
        expect(validarChavePix('email', 'sem-dominio@').ok).toBe(false);
    });

    it('telefone vira +55 com DDD; aceita já com 55', () => {
        expect(validarChavePix('telefone', '(11) 91234-5678').chave).toBe('+5511912345678');
        expect(validarChavePix('telefone', '+55 11 91234-5678').chave).toBe('+5511912345678');
        expect(validarChavePix('telefone', '1132345678').chave).toBe('+551132345678');
        expect(validarChavePix('telefone', '91234-5678').ok).toBe(false);
        // DDD que não existe no Brasil.
        expect(validarChavePix('telefone', '52998224725').ok).toBe(false);
    });

    it('chave aleatória no formato EVP', () => {
        const evp = '123E4567-E89B-12D3-A456-426614174000';
        expect(validarChavePix('aleatoria', evp)).toEqual({ ok: true, chave: evp.toLowerCase(), motivo: null });
        expect(validarChavePix('aleatoria', '123e4567e89b12d3a456426614174000').ok).toBe(false);
    });

    it('sem tipo ou vazia diz o motivo', () => {
        expect(validarChavePix(null, 'x').motivo).toMatch(/tipo/);
        expect(validarChavePix('cpf', '  ').motivo).toMatch(/Informe/);
    });
});

describe('tipoParaAsaas', () => {
    it('mapeia o vocabulário do cadastro para o da Asaas', () => {
        expect(tipoParaAsaas('cpf')).toBe('CPF');
        expect(tipoParaAsaas('telefone')).toBe('PHONE');
        expect(tipoParaAsaas('aleatoria')).toBe('EVP');
    });
});

describe('deduzirTipoChave', () => {
    it('deduz quando não há ambiguidade', () => {
        expect(deduzirTipoChave('529.982.247-25')).toBe('cpf');
        expect(deduzirTipoChave('52998224725')).toBe('cpf'); // "DDD 52" não existe
        expect(deduzirTipoChave('11.222.333/0001-81')).toBe('cnpj');
        expect(deduzirTipoChave('a@b.com')).toBe('email');
        expect(deduzirTipoChave('+55 11 91234-5678')).toBe('telefone');
        expect(deduzirTipoChave('11912345678')).toBe('telefone');
        expect(deduzirTipoChave('123e4567-e89b-12d3-a456-426614174000')).toBe('aleatoria');
    });
    it('inválido ou vazio → null (o usuário escolhe)', () => {
        expect(deduzirTipoChave('12345')).toBeNull();
        expect(deduzirTipoChave('')).toBeNull();
        expect(deduzirTipoChave('11.222.333/0001-82')).toBeNull();
    });
});

describe('mascararChave', () => {
    it('esconde o miolo e mantém o reconhecível', () => {
        expect(mascararChave('cpf', '52998224725')).toBe('***.982.247-**');
        expect(mascararChave('cnpj', '11222333000181')).toBe('11.222.***/****-81');
        expect(mascararChave('email', 'financeiro@alpa.com.br')).toBe('fi***@alpa.com.br');
        expect(mascararChave('telefone', '+5511912345678')).toBe('(**) *****-5678');
        expect(mascararChave('aleatoria', '123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567-****-****-****-4000');
        expect(mascararChave('cpf', '')).toBe('—');
    });
});
