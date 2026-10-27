import { describe, it, expect } from 'vitest';
import {
    statusDoPonto, statusDaAusencia, tipoDaAusencia, tipoDaFolha, diasTexto,
    jornadaTexto, periodoTexto, competenciaPorExtenso, daquiADias, situacaoDaValidade, validadeTexto, hojeLocal,
} from '../utils/portalColaboradorTextos';

describe('Portal do Colaborador — textos', () => {
    it('status do ponto e da ausência na voz do colaborador', () => {
        expect(statusDoPonto('PENDENTE')).toEqual({ rotulo: 'Em análise', tom: 'espera' });
        expect(statusDoPonto('REJEITADO').rotulo).toBe('Recusado');
        expect(statusDaAusencia('SOLICITADO').rotulo).toBe('Solicitado');
        // CANCELADO caía no amarelo de "pendente" — agora é neutro.
        expect(statusDaAusencia('CANCELADO')).toEqual({ rotulo: 'Cancelado', tom: 'neutro' });
    });

    it('tipo de ausência por extenso; o replace antigo só trocava o primeiro "_"', () => {
        expect(tipoDaAusencia('LICENCA_MATERNIDADE')).toBe('Licença-maternidade');
        expect(tipoDaAusencia('AFASTAMENTO_INSS')).toBe('Afastamento pelo INSS');
        expect(tipoDaAusencia('NOVO_TIPO_QUALQUER')).toBe('Novo tipo qualquer');
        expect(tipoDaAusencia(null)).toBe('—');
    });

    it('tipo de folha, inclusive adiantamento (aparecia cru)', () => {
        expect(tipoDaFolha('mensal')).toBe('Folha mensal');
        expect(tipoDaFolha('adiantamento')).toBe('Adiantamento');
        expect(tipoDaFolha('decimo_terceiro')).toBe('13º salário');
    });

    it('competência por extenso, sem passar por Date (sem fuso)', () => {
        expect(competenciaPorExtenso('2026-10-01')).toBe('Outubro de 2026');
        expect(competenciaPorExtenso('2026-01-31')).toBe('Janeiro de 2026');
        expect(competenciaPorExtenso(null)).toBe('—');
    });

    it('dias e jornada sem abreviação', () => {
        expect(diasTexto(30)).toBe('30 dias');
        expect(diasTexto(1)).toBe('1 dia');
        expect(diasTexto(0)).toBe('0 dias');
        expect(diasTexto(undefined)).toBe('0 dias');
        expect(jornadaTexto(8, 0)).toBe('8h');
        expect(jornadaTexto(8, 2)).toBe('8h + 2h extras');
        expect(jornadaTexto(7.5, 1.25)).toBe('7,5h + 1,25h extras');
    });

    it('período em dd/mm/aaaa, um dia só vira uma data', () => {
        expect(periodoTexto('2026-10-01', '2026-10-05')).toBe('01/10/2026 a 05/10/2026');
        expect(periodoTexto('2026-10-01', '2026-10-01')).toBe('01/10/2026');
        expect(periodoTexto('2026-10-01', null)).toBe('01/10/2026');
    });

    it('"hoje" é o dia do aparelho, não o de Greenwich', () => {
        // 26/10 às 22h em Brasília = 27/10 01h UTC: toISOString() já dizia 27.
        const noite = new Date(2026, 9, 26, 22, 0, 0);
        expect(hojeLocal(noite)).toBe('2026-10-26');
        expect(daquiADias(30, noite)).toBe('2026-11-25');
        expect(situacaoDaValidade('2026-10-26', noite)).toBe('vencendo');   // vence hoje: ainda não venceu
        expect(situacaoDaValidade('2026-10-25', noite)).toBe('vencido');
        expect(situacaoDaValidade('2026-11-25', noite)).toBe('vencendo');
        expect(situacaoDaValidade('2026-11-26', noite)).toBe('valido');
        expect(situacaoDaValidade(null, noite)).toBeNull();
    });

    it('validade em frase', () => {
        const hoje = new Date(2026, 9, 26, 10);
        expect(validadeTexto('2026-11-10', hoje)).toBe('Vence em 10/11/2026');
        expect(validadeTexto('2026-10-01', hoje)).toBe('Venceu em 01/10/2026');
    });
});
