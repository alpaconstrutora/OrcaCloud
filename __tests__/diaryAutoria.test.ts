import { describe, it, expect } from 'vitest';
import { textoAutoria, linhasAutoria, formatarMomentoAutoria } from '../utils/diaryAutoria';

// ISO montado a partir da hora LOCAL: o teste vale em qualquer fuso da máquina.
const isoLocal = (dia: number, mes: number, h: number, min: number) => new Date(2026, mes - 1, dia, h, min).toISOString();

const ana = { id: 'u-ana', nome: 'Ana Souza', em: isoLocal(12, 11, 8, 3) };
const iago = { id: 'u-iago', nome: 'Iago Marcos', em: isoLocal(13, 11, 17, 45) };

describe('diário · autoria do registro', () => {
    it('só registrado: "Registrado por <nome>", sem editado', () => {
        expect(textoAutoria({ registradoPor: ana })).toEqual({ registrado: 'Registrado por Ana Souza' });
        expect(linhasAutoria({ registradoPor: ana })).toEqual(['Registrado por Ana Souza']);
    });

    it('registrado e editado: "editado por <nome> em DD/MM HH:MM" na hora local', () => {
        expect(textoAutoria({ registradoPor: ana, editadoPor: iago })).toEqual({
            registrado: 'Registrado por Ana Souza',
            editado: 'editado por Iago Marcos em 13/11 17:45',
        });
        expect(linhasAutoria({ registradoPor: ana, editadoPor: iago }))
            .toEqual(['Registrado por Ana Souza', 'editado por Iago Marcos em 13/11 17:45']);
    });

    it('registro antigo sem carimbo: nada (não inventa autor)', () => {
        expect(textoAutoria({})).toEqual({});
        expect(textoAutoria(null)).toEqual({});
        expect(linhasAutoria({})).toEqual([]);
    });

    it('antigo editado depois do carimbo: só o editado, com maiúscula na linha', () => {
        expect(textoAutoria({ editadoPor: iago })).toEqual({ editado: 'editado por Iago Marcos em 13/11 17:45' });
        expect(linhasAutoria({ editadoPor: iago })).toEqual(['Editado por Iago Marcos em 13/11 17:45']);
    });

    it('nome vazio/nulo não vira "Registrado por "', () => {
        expect(textoAutoria({ registradoPor: { id: 'x', nome: '  ', em: ana.em } })).toEqual({});
        expect(textoAutoria({ registradoPor: { id: 'x', nome: null, em: ana.em } })).toEqual({});
    });

    it('data inválida no editado: mostra quem, sem o "em"', () => {
        expect(textoAutoria({ editadoPor: { id: 'x', nome: 'Iago', em: 'lixo' } })).toEqual({ editado: 'editado por Iago' });
    });

    it('formata com dois dígitos', () => {
        expect(formatarMomentoAutoria(isoLocal(1, 2, 3, 4))).toBe('01/02 03:04');
        expect(formatarMomentoAutoria('')).toBe('');
    });
});
