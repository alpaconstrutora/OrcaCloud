import { describe, it, expect } from 'vitest';
import { combinaComBusca } from '../utils/buscaPendentes';

describe('combinaComBusca (Pendentes › Lançamentos)', () => {
    // O que a coluna Descrição mostra: título resolvido + Nº de origem + rótulo do módulo.
    const linha = ['Contrato: Contrato de Venda — 406 - Parcela 36/36', 'Locação', 'Waldir', 'Contrato: Contrato de Venda — 406 - Parcela 36/36', 'Waldir', '0188', 'Gestão Comercial'];

    it('acha o texto cru do lançamento', () => {
        expect(combinaComBusca('parcela 36/36', linha)).toBe(true);
    });

    it('acha o rótulo do módulo de origem que a coluna mostra ao lado da descrição', () => {
        expect(combinaComBusca('gestão comercial', linha)).toBe(true);
    });

    it('acha o "Nº" de origem', () => {
        expect(combinaComBusca('0188', linha)).toBe(true);
    });

    it('acha o título resolvido (boleto: nome do fornecedor no lugar do texto do OCR)', () => {
        expect(combinaComBusca('cimentos beta', ['BOLETO 12345 LINHA DIGITAVEL', null, null, 'Cimentos Beta', 'Cimentos Beta', null, 'Boleto'])).toBe(true);
    });

    it('ignora caixa e espaços nas pontas; não acha o que não está na linha', () => {
        expect(combinaComBusca('  GESTÃO  ', linha)).toBe(true);
        expect(combinaComBusca('zzzxxx', linha)).toBe(false);
    });

    it('busca vazia combina com tudo; campos nulos não quebram', () => {
        expect(combinaComBusca('', linha)).toBe(true);
        expect(combinaComBusca('   ', [null, undefined])).toBe(true);
        expect(combinaComBusca('x', [null, undefined])).toBe(false);
    });

    describe('várias palavras', () => {
        // Boleto da Energisa: o fornecedor vem do título resolvido, o código do "Nº" de origem.
        const energisa = ['BOLETO 83640000001 LINHA DIGITAVEL', 'Energia', 'Energisa', 'Energisa', 'Energisa', '153', 'Boleto'];

        it('fornecedor + código: cada palavra pode estar em um campo diferente', () => {
            expect(combinaComBusca('energisa 153', energisa)).toBe(true);
        });

        it('a ordem das palavras não importa', () => {
            expect(combinaComBusca('153 energisa', energisa)).toBe(true);
        });

        it('todas as palavras precisam aparecer: uma ausente reprova a linha', () => {
            expect(combinaComBusca('energisa 999', energisa)).toBe(false);
            expect(combinaComBusca('cemig 153', energisa)).toBe(false);
        });

        it('separador qualquer (vários espaços, tabulação) e frase contínua continuam valendo', () => {
            expect(combinaComBusca('energisa    153', energisa)).toBe(true);
            expect(combinaComBusca('linha digitavel', energisa)).toBe(true);
        });
    });
});
