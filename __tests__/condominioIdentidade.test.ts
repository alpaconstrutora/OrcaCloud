// A identidade do condomínio no cabeçalho do detalhe: nome + código, sem
// repetir o código que o nome já carrega.
//
// 01/09/2026: o cabeçalho mostrava "010 - Galeria Altavista · 010 · quem é
// dono…". Código repetido faz o leitor procurar uma diferença que não existe.
import { describe, it, expect } from 'vitest';
import { identidadeDoCondominio, nomeDoCondominioNosDocumentos } from '../utils/condominioIdentidade';

describe('identidadeDoCondominio', () => {
    it('não repete o código que o nome já traz (o bug real)', () => {
        expect(identidadeDoCondominio('010 - Galeria Altavista', '010'))
            .toBe('010 - Galeria Altavista');
        expect(identidadeDoCondominio('007 - Bella Vista', '007'))
            .toBe('007 - Bella Vista');
    });

    it('mostra o código quando o nome NÃO o traz', () => {
        expect(identidadeDoCondominio('Galeria Altavista', '010'))
            .toBe('Galeria Altavista · 010');
    });

    it('não confunde código com pedaço de outro número', () => {
        // O caso que um `includes` erraria: "10" está dentro de "100", mas o
        // nome não identifica o condomínio 10 — o código tem de aparecer.
        expect(identidadeDoCondominio('Bloco 100', '10')).toBe('Bloco 100 · 10');
        expect(identidadeDoCondominio('Residencial 1010', '10')).toBe('Residencial 1010 · 10');
    });

    it('reconhece o código em outras posições e separadores', () => {
        expect(identidadeDoCondominio('Galeria Altavista (010)', '010'))
            .toBe('Galeria Altavista (010)');
        expect(identidadeDoCondominio('010', '010')).toBe('010');
        expect(identidadeDoCondominio('Ed. Aurora · A-12', 'A-12'))
            .toBe('Ed. Aurora · A-12');
    });

    it('aguenta código ausente, vazio e só com espaços', () => {
        expect(identidadeDoCondominio('Galeria Altavista', null)).toBe('Galeria Altavista');
        expect(identidadeDoCondominio('Galeria Altavista', '')).toBe('Galeria Altavista');
        expect(identidadeDoCondominio('Galeria Altavista', '   ')).toBe('Galeria Altavista');
    });

    it('não quebra com código que tem caractere de regex', () => {
        // Sem escapar, "C+1" viraria quantificador e lançaria SyntaxError —
        // derrubando o cabeçalho inteiro por causa de um código digitado.
        expect(() => identidadeDoCondominio('Ed. Solar', 'C+1')).not.toThrow();
        expect(identidadeDoCondominio('Ed. Solar', 'C+1')).toBe('Ed. Solar · C+1');
        expect(identidadeDoCondominio('Ed. Solar C+1', 'C+1')).toBe('Ed. Solar C+1');
    });
});

// Edital e ata da assembleia: o MESMO nome nos dois (o banco congela este mesmo
// critério no retrato do encerramento — _assembleia_encerrar, migration 860100).
describe('nomeDoCondominioNosDocumentos', () => {
    it('razão social quando há; senão o nome', () => {
        expect(nomeDoCondominioNosDocumentos('Condomínio Residencial Bella Vista', '007 - Bella Vista'))
            .toBe('Condomínio Residencial Bella Vista');
        expect(nomeDoCondominioNosDocumentos(null, '007 - Bella Vista')).toBe('007 - Bella Vista');
    });
    it('razão social em branco cai no nome (como o nullif(btrim(...)) do banco)', () => {
        expect(nomeDoCondominioNosDocumentos('   ', '007 - Bella Vista')).toBe('007 - Bella Vista');
        expect(nomeDoCondominioNosDocumentos('', '007 - Bella Vista')).toBe('007 - Bella Vista');
    });
});
