import { describe, it, expect } from 'vitest';
import { cnpjDoCertificado, digitosCnpj, dataBrasilia } from '../supabase/functions/_shared/certificadoA1';

// OID 2.16.76.1.3.3 em DER, seguido do valor como o ICP-Brasil grava:
// [0] explícito (a0) envolvendo uma OCTET STRING (04) de 14 bytes.
const OID = '\x06\x05\x60\x4c\x01\x03\x03';
const valor = (cnpj: string) => '\xa0\x10\x04\x0e' + cnpj;

describe('cnpjDoCertificado', () => {
    it('lê o CNPJ do otherName 2.16.76.1.3.3', () => {
        const der = '\x30\x82\x05\x00lixo-antes' + OID + valor('12345678000195') + 'lixo-depois';
        expect(cnpjDoCertificado(der, 'QUALQUER NOME')).toBe('12345678000195');
    });

    it('prefere o OID ao CN quando os dois existem', () => {
        const der = OID + valor('11222333000181');
        expect(cnpjDoCertificado(der, 'EMPRESA LTDA:99888777000166')).toBe('11222333000181');
    });

    it('cai para o CN "RAZÃO SOCIAL:CNPJ" quando o OID não está no certificado', () => {
        expect(cnpjDoCertificado('\x30\x82sem-oid', 'ALPA CONSTRUTORA LTDA:12345678000195')).toBe('12345678000195');
    });

    it('não inventa CNPJ: sem OID e sem CNPJ no CN devolve null', () => {
        expect(cnpjDoCertificado('\x30\x82sem-oid', 'BadSSL Client Certificate')).toBeNull();
        expect(cnpjDoCertificado('', null)).toBeNull();
    });

    it('não pega dígitos soltos longe do OID', () => {
        const der = OID + '\xa0\x10\x04\x0e' + 'abc' + 'x'.repeat(60) + '12345678000195';
        expect(cnpjDoCertificado(der, null)).toBeNull();
    });
});

describe('digitosCnpj', () => {
    it('aceita com e sem máscara', () => {
        expect(digitosCnpj('12.345.678/0001-95')).toBe('12345678000195');
        expect(digitosCnpj('12345678000195')).toBe('12345678000195');
    });
    it('recusa o que não tem 14 dígitos', () => {
        expect(digitosCnpj('123.456.789-09')).toBeNull();
        expect(digitosCnpj('')).toBeNull();
        expect(digitosCnpj(null)).toBeNull();
    });
});

describe('dataBrasilia', () => {
    it('usa o dia de Brasília, não o de UTC', () => {
        // 01:30 UTC de 15/03 ainda é 14/03 em Brasília (UTC-3)
        expect(dataBrasilia(new Date('2027-03-15T01:30:00Z'))).toBe('2027-03-14');
        expect(dataBrasilia(new Date('2027-03-15T12:00:00Z'))).toBe('2027-03-15');
    });
});
