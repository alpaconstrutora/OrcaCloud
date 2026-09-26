import { describe, it, expect } from 'vitest';
import { mesclarOrdemDeColunas } from '../components/ui/TableUtils';

describe('mesclarOrdemDeColunas — coluna nova entra ao lado da vizinha, não no fim', () => {
    const DEFAULT = ['cliente', 'valor', 'status', 'recibo', 'cc', 'plano', 'actions'];

    it('Recibo entra logo depois de Status', () => {
        const salva = ['cliente', 'valor', 'status', 'cc', 'plano', 'actions'];
        expect(mesclarOrdemDeColunas(salva, DEFAULT))
            .toEqual(['cliente', 'valor', 'status', 'recibo', 'cc', 'plano', 'actions']);
    });

    it('respeita a ordem que o usuário arrastou', () => {
        const salva = ['status', 'cliente', 'plano', 'valor', 'cc', 'actions'];
        expect(mesclarOrdemDeColunas(salva, DEFAULT))
            .toEqual(['status', 'recibo', 'cliente', 'plano', 'valor', 'cc', 'actions']);
    });

    it('sem antecessora conhecida, entra no começo; várias novas mantêm a ordem default', () => {
        expect(mesclarOrdemDeColunas(['status'], ['a', 'b', 'status', 'c']))
            .toEqual(['a', 'b', 'status', 'c']);
    });

    it('nada novo = mesma ordem', () => {
        expect(mesclarOrdemDeColunas(DEFAULT, DEFAULT)).toEqual(DEFAULT);
    });
});
